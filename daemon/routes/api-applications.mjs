// yoCareer v2 — /api/applications  (GET list / GET :id / POST / PATCH :id / DELETE :id)
//
// Applications are 1:1 with signals (UNIQUE constraint). POST creates an
// application from a signal_id (and transitions the signal current_status
// to 'promoted'). PATCH supports status transitions in the application
// state machine.

import {
  appendEvent,
  getRow,
  insertRow,
  preflightMutation,
  updateRow,
  rowToJson,
  ensureValidTransition,
} from '../lib/db-helpers.mjs';

const JSON_COLS = ['event_log'];
const ALLOWED_FIELDS = new Set(['notes_md']);

export function handleApplicationList(req, ctx) {
  const url = req.parsedUrl;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const status = url.searchParams.get('status');
  const where = []; const params = { limit };
  if (status) { where.push('current_status = @status'); params.status = status; }
  const sql = `
    SELECT a.*, s.title AS signal_title, s.company_name, s.role
    FROM applications a
    LEFT JOIN signals s ON s.id = a.signal_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.status_changed_at DESC
    LIMIT @limit
  `;
  const rows = ctx.db.prepare(sql).all(params).map(r => rowToJson(r, JSON_COLS));
  return { status: 200, body: { applications: rows, count: rows.length } };
}

export function handleApplicationGet(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  return { status: 200, body: rowToJson(getRow(ctx.db, 'applications', id), JSON_COLS) };
}

export function handleApplicationCreate(req, ctx) {
  const body = req.parsedBody || {};
  if (typeof body.signal_id !== 'string') {
    const err = new Error('signal_id required'); err.status = 400; throw err;
  }
  const signal = getRow(ctx.db, 'signals', body.signal_id);

  // If signal is in a non-terminal lifecycle state, advance it to 'promoted'.
  // The signal state machine allows promoted as a successor of 'reviewed';
  // for quick paths from captured/enriched, we walk the chain in one tx so
  // event_log captures every step. This avoids the user having to PATCH the
  // signal through 3 intermediate states before calling /api/applications.
  const PROMOTE_PATH = ['captured', 'enriched', 'reviewed', 'promoted'];
  const fromIdx = PROMOTE_PATH.indexOf(signal.current_status);
  const toIdx = PROMOTE_PATH.indexOf('promoted');
  if (fromIdx === -1) {
    const err = new Error(
      `Cannot create application for signal in state '${signal.current_status}'; ` +
      `expected one of ${PROMOTE_PATH.join(', ')}`,
    );
    err.status = 400; err.code = 'YOCAREER_BAD_SIGNAL_STATE';
    throw err;
  }
  // Validate every intermediate transition; throws on invalid edges.
  for (let i = fromIdx; i < toIdx; i++) {
    ensureValidTransition('signals', PROMOTE_PATH[i], PROMOTE_PATH[i + 1]);
  }

  const tx = ctx.db.transaction(() => {
    const row = insertRow(ctx.db, 'applications', {
      signal_id: body.signal_id,
      current_status: 'evaluated',
      status_changed_at: new Date().toISOString(),
      notes_md: typeof body.notes_md === 'string' ? body.notes_md : null,
      event_log: appendEvent('[]', 'application_created', { signal_id: body.signal_id }),
    });
    // Walk signal through the promote chain.
    let log = signal.event_log;
    for (let i = fromIdx; i < toIdx; i++) {
      log = appendEvent(log, 'signal_advanced', {
        from: PROMOTE_PATH[i], to: PROMOTE_PATH[i + 1],
      });
    }
    log = appendEvent(log, 'signal_promoted', { application_id: row.id });
    updateRow(ctx.db, 'signals', body.signal_id, { current_status: 'promoted' }, log);
    return row;
  });
  const row = tx();
  ctx.broadcaster?.broadcast('application.created', { id: row.id, signal_id: body.signal_id });
  return { status: 201, body: rowToJson(row, JSON_COLS) };
}

export function handleApplicationPatch(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'applications', id);
  preflightMutation(req, current);
  const body = req.parsedBody || {};

  if (body.current_status && body.current_status !== current.current_status) {
    ensureValidTransition('applications', current.current_status, body.current_status);
  }
  const updates = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'current_status') {
      updates.current_status = v;
      updates.status_changed_at = new Date().toISOString();
      continue;
    }
    if (!ALLOWED_FIELDS.has(k)) continue;
    updates[k] = v == null ? null : String(v);
  }
  const eventLog = appendEvent(current.event_log, 'application_patched', {
    fields: Object.keys(updates),
    new_status: body.current_status || null,
  });
  const updated = updateRow(ctx.db, 'applications', id, updates, eventLog);
  ctx.broadcaster?.broadcast('application.updated', {
    id, new_status: body.current_status || null,
  });
  return { status: 200, body: rowToJson(updated, JSON_COLS) };
}

export function handleApplicationDelete(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'applications', id);
  preflightMutation(req, current);
  ctx.db.prepare(`DELETE FROM applications WHERE id = ?`).run(id);
  ctx.broadcaster?.broadcast('application.deleted', { id });
  return { status: 204, body: undefined };
}
