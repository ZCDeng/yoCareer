// yoCareer v2 — /api/portals  (GET list / GET :id / PUT :id / POST / DELETE :id)
//
// Portals are typed sources (BOSS / 拉勾 / GitHub / V2EX / 微信 ...) used
// by the scanner. Each portal has an opaque config_json. Updates DON'T
// propagate stale (portals only affect future scans, not stored rows —
// see daemon/lib/stale-propagation.mjs notes).

import {
  appendEvent,
  getRow,
  insertRow,
  preflightMutation,
  updateRow,
  rowToJson,
} from '../lib/db-helpers.mjs';

const ALLOWED_KINDS = new Set([
  'company_page', 'manual_signal_import', 'reach_signal_search', 'manual_only',
]);
const ALLOWED_FIELDS = new Set(['kind', 'config_json', 'enabled']);
const JSON_COLS = ['event_log', 'config_json'];

export function handlePortalsList(req, ctx) {
  const url = req.parsedUrl;
  const kind = url.searchParams.get('kind');
  const enabled = url.searchParams.get('enabled');
  const where = [];
  const params = {};
  if (kind) { where.push('kind = @kind'); params.kind = kind; }
  if (enabled === '1' || enabled === '0') {
    where.push('enabled = @enabled');
    params.enabled = parseInt(enabled, 10);
  }
  const sql = `
    SELECT * FROM portals
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id
  `;
  const rows = ctx.db.prepare(sql).all(params).map(r => rowToJson(r, JSON_COLS));
  return { status: 200, body: { portals: rows, count: rows.length } };
}

export function handlePortalGet(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const row = getRow(ctx.db, 'portals', id);
  return { status: 200, body: rowToJson(row, JSON_COLS) };
}

function normalizeUpdates(body) {
  const updates = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === 'kind') {
      if (!ALLOWED_KINDS.has(v)) {
        const err = new Error(`Invalid portal kind: ${v}; allowed: ${[...ALLOWED_KINDS].join(', ')}`);
        err.status = 400;
        err.code = 'YOCAREER_BAD_PORTAL_KIND';
        throw err;
      }
      updates.kind = v;
    } else if (k === 'enabled') {
      updates.enabled = v ? 1 : 0;
    } else {
      updates.config_json = (typeof v === 'string') ? v : JSON.stringify(v);
    }
  }
  return updates;
}

export function handlePortalCreate(req, ctx) {
  const body = req.parsedBody || {};
  if (!body.id || typeof body.id !== 'string') {
    const err = new Error('Missing or invalid id (portal id is the slug, e.g. "boss-zhipin")');
    err.status = 400;
    err.code = 'YOCAREER_BAD_PORTAL_ID';
    throw err;
  }
  const updates = normalizeUpdates(body);
  if (!updates.kind) {
    const err = new Error('Missing kind');
    err.status = 400;
    err.code = 'YOCAREER_BAD_PORTAL_KIND';
    throw err;
  }
  const row = insertRow(ctx.db, 'portals', {
    id: body.id,
    kind: updates.kind,
    config_json: updates.config_json || '{}',
    enabled: updates.enabled === undefined ? 1 : updates.enabled,
    event_log: appendEvent('[]', 'portal_created', { kind: updates.kind }),
  });
  ctx.broadcaster?.broadcast('portal.created', { id: body.id, kind: updates.kind });
  return { status: 201, body: rowToJson(row, JSON_COLS) };
}

export function handlePortalUpdate(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'portals', id);
  preflightMutation(req, current);
  const updates = normalizeUpdates(req.parsedBody);
  const eventLog = appendEvent(current.event_log, 'portal_updated', {
    fields: Object.keys(updates),
  });
  const updated = updateRow(ctx.db, 'portals', id, updates, eventLog);
  ctx.broadcaster?.broadcast('portal.updated', { id, fields: Object.keys(updates) });
  return { status: 200, body: rowToJson(updated, JSON_COLS) };
}

export function handlePortalDelete(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  const current = getRow(ctx.db, 'portals', id);
  preflightMutation(req, current);
  ctx.db.prepare(`DELETE FROM portals WHERE id = ?`).run(id);
  ctx.broadcaster?.broadcast('portal.deleted', { id });
  return { status: 204, body: undefined };
}
