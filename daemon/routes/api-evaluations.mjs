// yoCareer v2 — /api/evaluations  (GET list / GET :id / POST trigger as task_run)
//
// Creating an evaluation triggers an async task_run that runs the actual
// LLM scoring. Returns task_id immediately so the client can subscribe to
// SSE `task.progress` and poll /api/tasks/:id/status.
//
// In U3 the worker is a stub that simulates a 3-step LLM eval (sleep +
// progress events) so we can selftest the whole path. U4 will plug the
// real LLM call from gemini-eval.mjs / batch-prompt.mjs into the worker.

import {
  appendEvent,
  getRow,
  insertRow,
  rowToJson,
} from '../lib/db-helpers.mjs';
import { runCancellable } from '../lib/task-runner.mjs';
import { applyTransition } from '../lib/state-machines.mjs';

const JSON_COLS = ['event_log', 'blocks_json'];

export function handleEvaluationList(req, ctx) {
  const url = req.parsedUrl;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const stale = url.searchParams.get('stale');
  const signalId = url.searchParams.get('signal_id');
  const where = []; const params = { limit };
  if (stale === '1') where.push('stale = 1');
  if (signalId) { where.push('signal_id = @signalId'); params.signalId = signalId; }
  const sql = `
    SELECT id, signal_id, application_id, cv_version_id, score, legitimacy_tier,
           stale, stale_reason, current_status, created_at, as_of
    FROM evaluations
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT @limit
  `;
  const rows = ctx.db.prepare(sql).all(params).map(r => rowToJson(r, JSON_COLS));
  return { status: 200, body: { evaluations: rows, count: rows.length } };
}

export function handleEvaluationGet(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  return { status: 200, body: rowToJson(getRow(ctx.db, 'evaluations', id), JSON_COLS) };
}

/**
 * POST /api/evaluations
 * Body: { signal_id, cv_version_id, application_id? }
 * Returns: { evaluation_id, task_id, status: 'pending' }
 */
export function handleEvaluationCreate(req, ctx) {
  const body = req.parsedBody || {};
  if (typeof body.signal_id !== 'string')   { const e = new Error('signal_id required'); e.status = 400; throw e; }
  if (typeof body.cv_version_id !== 'string'){ const e = new Error('cv_version_id required'); e.status = 400; throw e; }
  // Existence checks (will throw 404 if missing)
  getRow(ctx.db, 'signals', body.signal_id);
  getRow(ctx.db, 'cv_versions', body.cv_version_id);
  if (body.application_id) getRow(ctx.db, 'applications', body.application_id);

  const evaluation = insertRow(ctx.db, 'evaluations', {
    signal_id: body.signal_id,
    application_id: body.application_id || null,
    cv_version_id: body.cv_version_id,
    score: null,
    blocks_json: '{}',
    legitimacy_tier: null,
    stale: 0,
    stale_reason: null,
    current_status: 'pending',
    report_md: null,
    event_log: appendEvent('[]', 'evaluation_created', {
      signal_id: body.signal_id, cv_version_id: body.cv_version_id,
    }),
  });

  // Spawn task_run that runs the (stubbed) LLM evaluation worker.
  const taskId = runCancellable(
    ctx.db, ctx.broadcaster,
    'multi_step_eval',
    {
      entityType: 'evaluation',
      entityId: evaluation.id,
      payload: { signal_id: body.signal_id, cv_version_id: body.cv_version_id },
    },
    async (tools) => {
      // Move to 'running'. In U4 the real LLM call lives here.
      applyTransition('evaluations', 'pending', 'running');
      ctx.db.prepare(`
        UPDATE evaluations
        SET current_status = 'running',
            event_log = ?, as_of = ?
        WHERE id = ?
      `).run(
        appendEvent('[]', 'evaluation_started', { task_id: tools.taskId }),
        new Date().toISOString(),
        evaluation.id,
      );

      // Simulated 3-step pipeline.
      for (let step = 1; step <= 3; step++) {
        await tools.checkpoint();
        await new Promise(r => setTimeout(r, 50));   // simulated LLM latency
        await tools.progress(step / 3, `eval step ${step}/3`);
      }

      // Stub completion: write a placeholder score.
      applyTransition('evaluations', 'running', 'completed');
      ctx.db.prepare(`
        UPDATE evaluations
        SET current_status = 'completed', score = 4.2,
            blocks_json = '{"stub":true}', legitimacy_tier = 'B',
            event_log = ?, as_of = ?
        WHERE id = ?
      `).run(
        appendEvent('[]', 'evaluation_completed', { score: 4.2 }),
        new Date().toISOString(),
        evaluation.id,
      );
      ctx.broadcaster?.broadcast('evaluation.completed', {
        id: evaluation.id, score: 4.2, legitimacy_tier: 'B',
      });
      return { evaluation_id: evaluation.id, score: 4.2 };
    },
  );

  ctx.broadcaster?.broadcast('evaluation.created', {
    id: evaluation.id, task_id: taskId,
  });
  return {
    status: 202,
    body: { evaluation_id: evaluation.id, task_id: taskId, status: 'pending' },
  };
}
