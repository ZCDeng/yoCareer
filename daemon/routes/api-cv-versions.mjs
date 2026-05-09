// yoCareer v2 — /api/cv-versions  (GET list / GET :id / POST new)
//
// CV versions are immutable — every edit creates a new row pointed at by
// `parent_version_id`. Posting a new version triggers stale propagation
// (cv_version_new_invalidates_evaluations).

import {
  appendEvent,
  getRow,
  insertRow,
  rowToJson,
  fireStale,
} from '../lib/db-helpers.mjs';

const JSON_COLS = ['event_log'];

export function handleCvVersionList(req, ctx) {
  const limit = Math.min(parseInt(req.parsedUrl.searchParams.get('limit') || '50', 10), 200);
  const rows = ctx.db.prepare(`
    SELECT id, parent_version_id, label, created_at, as_of
    FROM cv_versions
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit).map(r => rowToJson(r, JSON_COLS));
  return { status: 200, body: { cv_versions: rows, count: rows.length } };
}

export function handleCvVersionGet(req, ctx) {
  const id = req.parsedUrl.pathname.split('/').pop();
  return { status: 200, body: rowToJson(getRow(ctx.db, 'cv_versions', id), JSON_COLS) };
}

export function handleCvVersionCreate(req, ctx) {
  const body = req.parsedBody || {};
  if (typeof body.content_md !== 'string' || !body.content_md.trim()) {
    const err = new Error('content_md required (string)'); err.status = 400; throw err;
  }
  const row = insertRow(ctx.db, 'cv_versions', {
    parent_version_id: typeof body.parent_version_id === 'string' ? body.parent_version_id : null,
    label: typeof body.label === 'string' ? body.label : null,
    content_md: body.content_md,
    cover_letter_md: typeof body.cover_letter_md === 'string' ? body.cover_letter_md : null,
    event_log: appendEvent('[]', 'cv_version_created', { label: body.label || null }),
  });
  fireStale(ctx.db, 'cv_versions', 'INSERT', { newCvVersionId: row.id });
  ctx.broadcaster?.broadcast('cv_version.created', { id: row.id, label: row.label });
  return { status: 201, body: rowToJson(row, JSON_COLS) };
}
