// yoCareer v2 — /api/signals  (GET list / GET :id / POST upsert / PATCH :id / DELETE :id)
//
// signals are dedupable by url_hash (sha256 of canonicalized URL). POST is
// upsert-by-url_hash so re-scanning the same posting doesn't create
// duplicates. PATCH supports status transitions + content edits (which
// trigger stale propagation on dependent evaluations).

import { createHash } from 'node:crypto';
import {
  appendEvent,
  getRow,
  insertRow,
  preflightMutation,
  updateRow,
  rowToJson,
  ensureValidTransition,
  fireStale,
} from '../lib/db-helpers.mjs';

const JSON_COLS = ['event_log', 'payload_json'];
const ALLOWED_FIELDS = new Set([
  'title', 'company_name', 'role', 'jd_md', 'payload_json',
  'liveness_state', 'liveness_checked_at',
]);
const CONTENT_FIELDS = new Set(['title', 'role', 'jd_md', 'payload_json']);
const LIVENESS_DEAD_STATES = new Set(['liveness_dead', 'stale_url']);

function urlHash(url) {
  return createHash('sha256').update(String(url || '')).digest('hex');
}

export function handleSignalList(req, ctx) {
  const url = req.parsedUrl;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const status = url.searchParams.get('status');
  const portal = url.searchParams.get('portal');
  const where = []; const params = { limit };
  if (status) { where.push('current_status = @status'); params.status = status; }
  if (portal) { where.push('source_portal_id = @portal'); params.portal = portal; }
  const sql = `
    SELECT id, source_portal_id, url, title, company_name, role,
           current_status, liveness_state, first_seen_at, as_of
    FROM signals
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY first_seen_at DESC
    LIMIT @limit
  `;
  const rows = ctx.db.prepare(sql).all(params).map(r => rowToJson(r, JSON_COLS));
  return { status: 200, body: { signals: rows, count: rows.length } };
}

export function handleSignalGet(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  return { status: 200, body: rowToJson(getRow(ctx.db, 'signals', id), JSON_COLS) };
}

/**
 * POST /api/signals  — upsert by url_hash. If a row already exists with the
 * same url_hash, the existing id is returned with status 200; otherwise a
 * new row is inserted with status 201.
 *
 * Body: { url, source_portal_id?, title?, company_name?, role?, jd_md?, payload? }
 */
export function handleSignalUpsert(req, ctx) {
  const body = req.parsedBody || {};
  if (typeof body.url !== 'string' || !body.url.trim()) {
    const err = new Error('url required'); err.status = 400; throw err;
  }
  const hash = urlHash(body.url);
  const existing = ctx.db.prepare(`SELECT * FROM signals WHERE url_hash = ?`).get(hash);
  if (existing) {
    return { status: 200, body: rowToJson(existing, JSON_COLS), headers: { 'X-Signal-Existed': '1' } };
  }
  const row = insertRow(ctx.db, 'signals', {
    source_portal_id: typeof body.source_portal_id === 'string' ? body.source_portal_id : null,
    url: body.url,
    url_hash: hash,
    title: typeof body.title === 'string' ? body.title : null,
    company_name: typeof body.company_name === 'string' ? body.company_name : null,
    role: typeof body.role === 'string' ? body.role : null,
    jd_md: typeof body.jd_md === 'string' ? body.jd_md : null,
    payload_json: typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload || {}),
    event_log: appendEvent('[]', 'signal_captured', { source: body.source_portal_id || 'manual' }),
    first_seen_at: new Date().toISOString(),
  });
  ctx.broadcaster?.broadcast('signal.created', { id: row.id, url: body.url });
  return { status: 201, body: rowToJson(row, JSON_COLS) };
}

/**
 * PATCH /api/signals/:id  — partial update; supports status transition.
 */
export function handleSignalPatch(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'signals', id);
  preflightMutation(req, current);
  const body = req.parsedBody || {};

  // Status transition gate
  if (body.current_status && body.current_status !== current.current_status) {
    ensureValidTransition('signals', current.current_status, body.current_status);
  }

  const updates = {};
  const changedFields = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === 'current_status') {
      updates.current_status = v;
      continue;
    }
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === 'payload_json' && typeof v !== 'string') {
      updates.payload_json = JSON.stringify(v);
    } else {
      updates[k] = v == null ? null : String(v);
    }
    if (CONTENT_FIELDS.has(k)) changedFields.push(k);
  }
  const eventLog = appendEvent(current.event_log, 'signal_patched', {
    fields: Object.keys(updates),
    new_status: body.current_status || null,
  });
  const updated = updateRow(ctx.db, 'signals', id, updates, eventLog);

  if (changedFields.length) {
    fireStale(ctx.db, 'signals', 'UPDATE', { signalId: id, changedFields });
  }
  if (body.current_status && LIVENESS_DEAD_STATES.has(body.current_status)) {
    fireStale(ctx.db, 'signals', 'UPDATE', {
      signalId: id, newStatus: body.current_status,
    });
  }
  ctx.broadcaster?.broadcast('signal.updated', {
    id, fields: Object.keys(updates), new_status: body.current_status || null,
  });
  return { status: 200, body: rowToJson(updated, JSON_COLS) };
}

export function handleSignalDelete(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'signals', id);
  preflightMutation(req, current);
  ctx.db.prepare(`DELETE FROM signals WHERE id = ?`).run(id);
  ctx.broadcaster?.broadcast('signal.deleted', { id });
  return { status: 204, body: undefined };
}
