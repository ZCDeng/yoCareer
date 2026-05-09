// yoCareer v2 — task_runs runner with cooperative checkpoints + SSE broadcast.
//
// Long-running daemon operations (scan, batch_eval, multi-step LLM eval,
// pdf_import, liveness_sweep) get tracked in `task_runs` so:
//
//   - clients can poll GET /api/tasks/:id/status without holding a connection
//   - SSE listeners get `task.progress` events streamed without client work
//   - a separate POST /api/tasks/:id/cancel can flip cancellation_requested=1
//     and the running task picks it up at the next checkpoint and aborts
//
// Cancellation is cooperative: the daemon never preemptively kills a task,
// the worker function must call `await tools.checkpoint()` between work
// units (e.g., between each LLM call) to give cancellation a chance.

import {
  newId,
  appendEvent,
  rowToJson,
} from './db-helpers.mjs';
import { applyTransition } from './state-machines.mjs';

export class TaskCancelledError extends Error {
  constructor(taskId) {
    super(`Task ${taskId} cancelled`);
    this.code = 'YOCAREER_TASK_CANCELLED';
    this.taskId = taskId;
  }
}

function nowIso() { return new Date().toISOString(); }

/**
 * Insert a new task_run row in 'running' state.
 *
 * @returns {string} task_id
 */
export function startTask(db, kind, { entityType = null, entityId = null, payload = {} } = {}) {
  const id = newId();
  const now = nowIso();
  db.prepare(`
    INSERT INTO task_runs
      (id, kind, entity_type, entity_id, current_status, progress, message,
       started_at, payload_json, created_at, as_of, event_log)
    VALUES
      (@id, @kind, @entityType, @entityId, 'running', 0, NULL,
       @now, @payload, @now, @now, @event_log)
  `).run({
    id, kind, entityType, entityId, now,
    payload: JSON.stringify(payload),
    event_log: appendEvent('[]', 'task_started', { kind }),
  });
  return id;
}

/**
 * Update progress + message + broadcast SSE. Skips broadcast if the row is
 * already in a terminal state.
 */
export function progressTask(db, broadcaster, taskId, progress, message = null) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  const row = db.prepare(`SELECT current_status, event_log FROM task_runs WHERE id = ?`).get(taskId);
  if (!row || row.current_status !== 'running') return null;
  const newLog = appendEvent(row.event_log, 'task_progress', { progress: clamped, message });
  db.prepare(`
    UPDATE task_runs
    SET progress = ?, message = ?, event_log = ?, as_of = ?
    WHERE id = ?
  `).run(clamped, message, newLog, nowIso(), taskId);
  broadcaster?.broadcast('task.progress', { task_id: taskId, progress: clamped, message });
  return clamped;
}

/**
 * Returns true if the caller has requested cancellation via
 * POST /api/tasks/:id/cancel. Workers should call this between work units
 * and abort cleanly when it returns true.
 */
export function isCancelled(db, taskId) {
  const row = db.prepare(`SELECT cancellation_requested FROM task_runs WHERE id = ?`).get(taskId);
  return !!(row && row.cancellation_requested === 1);
}

/**
 * Mark task as completed, write result_json, broadcast SSE.
 */
export function completeTask(db, broadcaster, taskId, result = null) {
  const row = db.prepare(`SELECT current_status, event_log FROM task_runs WHERE id = ?`).get(taskId);
  if (!row || row.current_status !== 'running') return false;
  applyTransition('task_runs', 'running', 'completed');
  const newLog = appendEvent(row.event_log, 'task_completed');
  db.prepare(`
    UPDATE task_runs
    SET current_status = 'completed', progress = 1.0, finished_at = ?,
        result_json = ?, event_log = ?, as_of = ?
    WHERE id = ?
  `).run(nowIso(), result === null ? null : JSON.stringify(result), newLog, nowIso(), taskId);
  broadcaster?.broadcast('task.completed', { task_id: taskId, result });
  return true;
}

/**
 * Mark task as failed.
 */
export function failTask(db, broadcaster, taskId, err) {
  const row = db.prepare(`SELECT current_status, event_log FROM task_runs WHERE id = ?`).get(taskId);
  if (!row || row.current_status !== 'running') return false;
  applyTransition('task_runs', 'running', 'failed');
  const errorJson = JSON.stringify({
    code: err?.code || 'INTERNAL',
    message: err?.message || String(err),
    stack: err?.stack ? err.stack.split('\n').slice(0, 6).join('\n') : null,
  });
  const newLog = appendEvent(row.event_log, 'task_failed', { error_code: err?.code });
  db.prepare(`
    UPDATE task_runs
    SET current_status = 'failed', finished_at = ?, error_json = ?,
        event_log = ?, as_of = ?
    WHERE id = ?
  `).run(nowIso(), errorJson, newLog, nowIso(), taskId);
  broadcaster?.broadcast('task.failed', { task_id: taskId, error: err?.message || String(err) });
  return true;
}

/**
 * Mark task as cancelled (after worker observed the cancellation flag).
 */
export function markCancelled(db, broadcaster, taskId) {
  const row = db.prepare(`SELECT current_status, event_log FROM task_runs WHERE id = ?`).get(taskId);
  if (!row || row.current_status !== 'running') return false;
  applyTransition('task_runs', 'running', 'cancelled');
  const newLog = appendEvent(row.event_log, 'task_cancelled');
  db.prepare(`
    UPDATE task_runs
    SET current_status = 'cancelled', finished_at = ?, event_log = ?, as_of = ?
    WHERE id = ?
  `).run(nowIso(), newLog, nowIso(), taskId);
  broadcaster?.broadcast('task.cancelled', { task_id: taskId });
  return true;
}

/**
 * Set cancellation_requested = 1. Returns true if the row exists and was running.
 */
export function requestCancel(db, taskId) {
  const row = db.prepare(`SELECT current_status FROM task_runs WHERE id = ?`).get(taskId);
  if (!row) return false;
  if (row.current_status !== 'running') return false;
  db.prepare(`
    UPDATE task_runs
    SET cancellation_requested = 1, as_of = ?
    WHERE id = ?
  `).run(nowIso(), taskId);
  return true;
}

/**
 * High-level wrapper: start a task, run an async worker, auto-handle
 * completion / failure / cancellation. The worker receives a `tools` object
 * with `progress`, `checkpoint`, `taskId`. If the worker throws
 * TaskCancelledError, the task is marked cancelled instead of failed.
 *
 * Returns task_id immediately; the actual async work runs in the background.
 *
 * @example
 *   const taskId = runCancellable(db, broadcaster, 'batch_eval', {payload: {...}}, async (tools) => {
 *     for (const item of items) {
 *       await tools.checkpoint();
 *       const result = await llmCall(item);
 *       await tools.progress((i + 1) / items.length, `evaluated ${i+1}/${items.length}`);
 *     }
 *     return { count: items.length };
 *   });
 */
export function runCancellable(db, broadcaster, kind, opts, worker) {
  const taskId = startTask(db, kind, opts);
  // Run worker on next tick so caller gets task_id immediately
  queueMicrotask(async () => {
    const tools = {
      taskId,
      checkpoint: async () => {
        if (isCancelled(db, taskId)) {
          markCancelled(db, broadcaster, taskId);
          throw new TaskCancelledError(taskId);
        }
      },
      progress: async (frac, msg = null) => {
        progressTask(db, broadcaster, taskId, frac, msg);
      },
    };
    try {
      const result = await worker(tools);
      // If the worker silently returned despite a cancellation flag,
      // honor cancellation; otherwise mark complete.
      if (isCancelled(db, taskId)) {
        markCancelled(db, broadcaster, taskId);
      } else {
        completeTask(db, broadcaster, taskId, result);
      }
    } catch (err) {
      if (err?.code === 'YOCAREER_TASK_CANCELLED') {
        // markCancelled already fired inside checkpoint()
        return;
      }
      failTask(db, broadcaster, taskId, err);
    }
  });
  return taskId;
}

export function getTaskRow(db, taskId) {
  return rowToJson(
    db.prepare(`SELECT * FROM task_runs WHERE id = ?`).get(taskId),
    ['event_log', 'payload_json', 'result_json', 'error_json'],
  );
}
