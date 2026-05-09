// yoCareer v2 — GET / PUT /api/profile (single row, id='self').
//
// Profile is a singleton row. GET returns the row (creating an empty one on
// first read). PUT requires If-Match and triggers stale propagation when
// targeting columns change.

import {
  appendEvent,
  insertRow,
  preflightMutation,
  updateRow,
  rowToJson,
  fireStale,
} from '../lib/db-helpers.mjs';

const TARGETING_FIELDS = new Set([
  'target_roles_json', 'comp_json', 'location_json',
]);
const ALLOWED_FIELDS = new Set([
  'narrative_md', 'target_roles_json', 'comp_json', 'location_json',
]);
const JSON_COLS = ['event_log', 'target_roles_json', 'comp_json', 'location_json'];

function ensureProfileExists(db) {
  const row = db.prepare(`SELECT * FROM profile WHERE id = 'self'`).get();
  if (row) return row;
  return insertRow(db, 'profile', {
    id: 'self',
    narrative_md: null,
    target_roles_json: '[]',
    comp_json: '{}',
    location_json: '{}',
    event_log: appendEvent('[]', 'profile_initialized'),
  });
}

export function handleProfileGet(_req, ctx) {
  const row = ensureProfileExists(ctx.db);
  return { status: 200, body: rowToJson(row, JSON_COLS) };
}

export function handleProfilePut(req, ctx) {
  const current = ensureProfileExists(ctx.db);
  preflightMutation(req, current);

  const body = req.parsedBody || {};
  const updates = {};
  let touchedTargeting = false;

  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === 'narrative_md') {
      updates.narrative_md = v == null ? null : String(v);
    } else {
      // target_roles_json / comp_json / location_json — accept object/array, store as string
      updates[k] = (typeof v === 'string') ? v : JSON.stringify(v);
      if (TARGETING_FIELDS.has(k)) touchedTargeting = true;
    }
  }

  const eventLog = appendEvent(current.event_log, 'profile_updated', {
    fields: Object.keys(updates),
  });
  const updated = updateRow(ctx.db, 'profile', 'self', updates, eventLog);

  if (touchedTargeting) {
    fireStale(ctx.db, 'profile', 'UPDATE', {
      changedFields: Object.keys(updates).filter(f => TARGETING_FIELDS.has(f)),
    });
    ctx.broadcaster?.broadcast('profile.updated', { stale_evaluations: true });
  } else {
    ctx.broadcaster?.broadcast('profile.updated', { stale_evaluations: false });
  }

  return { status: 200, body: rowToJson(updated, JSON_COLS) };
}
