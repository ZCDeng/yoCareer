// yoCareer v2 — /api/tasks  (GET list / GET :id / POST :id/cancel)
//
// Read-only views into task_runs + cancellation request endpoint. The actual
// cancellation is cooperative — task-runner.mjs's worker checks the flag at
// each checkpoint and aborts via TaskCancelledError.

import { getTaskRow, requestCancel } from '../lib/task-runner.mjs';

export function handleTaskList(req, ctx) {
  const url = req.parsedUrl;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const status = url.searchParams.get('status');
  const kind = url.searchParams.get('kind');
  const where = []; const params = { limit };
  if (status) { where.push('current_status = @status'); params.status = status; }
  if (kind)   { where.push('kind = @kind'); params.kind = kind; }
  const sql = `
    SELECT id, kind, entity_type, entity_id, current_status, progress,
           message, started_at, finished_at, as_of
    FROM task_runs
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY started_at DESC
    LIMIT @limit
  `;
  const rows = ctx.db.prepare(sql).all(params);
  return { status: 200, body: { tasks: rows, count: rows.length } };
}

export function handleTaskGet(req, ctx) {
  // Path: /api/tasks/:id or /api/tasks/:id/status (treated identically).
  const parts = req.parsedUrl.pathname.split('/').filter(Boolean);
  // parts = ['api','tasks',':id'] or ['api','tasks',':id','status']
  const id = parts[2];
  const row = getTaskRow(ctx.db, id);
  if (!row) {
    const err = new Error(`task not found: ${id}`);
    err.status = 404; err.code = 'YOCAREER_NOT_FOUND';
    throw err;
  }
  return { status: 200, body: row };
}

export function handleTaskCancel(req, ctx) {
  // Path: /api/tasks/:id/cancel
  const parts = req.parsedUrl.pathname.split('/').filter(Boolean);
  const id = parts[2];
  const ok = requestCancel(ctx.db, id);
  if (!ok) {
    return { status: 409, body: { error: 'cannot_cancel', message: 'task not running or not found' } };
  }
  return { status: 202, body: { task_id: id, cancellation_requested: true } };
}
