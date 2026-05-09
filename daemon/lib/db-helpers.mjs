// yoCareer v2 — daemon db helpers (shared across entity routes).
//
// Encapsulates the common pattern every mutating endpoint follows:
//
//   1. SELECT current row (404 if missing)
//   2. assertAsOf against If-Match header (409 on conflict)
//   3. (optional) state-machine transition validation (400 on invalid)
//   4. UPDATE row with new values + new as_of + appended event_log
//   5. propagate stale where applicable
//   6. broadcast SSE event (caller does this — broadcaster lives in ctx)
//   7. return new row to caller
//
// The shape is intentionally first-class CRUD rather than ORM — every domain
// route sees its own SELECT/UPDATE SQL and event semantics.

import { randomUUID } from 'node:crypto';
import { nextAsOf, assertAsOf } from './concurrency.mjs';
import { applyTransition } from './state-machines.mjs';
import { propagate as propagateStale } from './stale-propagation.mjs';

export class NotFoundError extends Error {
  constructor(table, id) {
    super(`${table} not found: ${id}`);
    this.code = 'YOCAREER_NOT_FOUND';
    this.status = 404;
    this.table = table;
    this.id = id;
  }
}

export function newId() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * Append an event to a JSON-encoded event_log array. Caller passes the
 * existing event_log string from the row; returns a new JSON string.
 */
export function appendEvent(eventLogJson, kind, payload = {}) {
  let arr;
  try { arr = JSON.parse(eventLogJson || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  arr.push({ kind, at: nowIso(), ...payload });
  return JSON.stringify(arr);
}

/**
 * SELECT a row by id; throw NotFoundError if missing.
 */
export function getRow(db, table, id) {
  // Tables and primary key column names are validated upstream; never let
  // user input flow into this. We use a parameterized query for the value
  // but the table name is interpolated — caller must pass a known table.
  const row = db.prepare(`SELECT * FROM ${quoteTable(table)} WHERE id = ?`).get(id);
  if (!row) throw new NotFoundError(table, id);
  return row;
}

const ALLOWED_TABLES = new Set([
  'profile', 'portals', 'cv_versions', 'signals',
  'applications', 'evaluations', 'task_runs', 'meta',
]);

function quoteTable(name) {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Unknown table: ${name}`);
  }
  return `"${name}"`;
}

/**
 * Validate If-Match against current row's as_of and return the parsed value
 * to use as the next event_log starting point. Throws 409 on mismatch.
 */
export function preflightMutation(req, currentRow) {
  const submitted = (req.headers['if-match'] || '').replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
  assertAsOf(currentRow.as_of, submitted);
  return submitted;
}

/**
 * Validate a status transition for a named state machine. Caller passes the
 * machine name string ('signals' | 'applications' | 'evaluations' | 'task_runs').
 * Throws on invalid transition; no-op when newStatus === currentStatus.
 */
export function ensureValidTransition(machineName, currentStatus, newStatus) {
  if (newStatus === undefined || newStatus === null || newStatus === currentStatus) return;
  applyTransition(machineName, currentStatus, newStatus);
}

/**
 * Build an UPDATE statement that bumps as_of and event_log + applies the
 * supplied set of column → value pairs. Caller is responsible for column
 * whitelisting against the entity's known schema.
 *
 * Returns the new row after update (as a fresh SELECT).
 */
export function updateRow(db, table, id, updates, eventLog) {
  const cols = Object.keys(updates);
  if (cols.length === 0) {
    // Nothing to set besides as_of/event_log — still bump them so the client
    // sees a fresh as_of (semantic no-op, intentional).
    db.prepare(
      `UPDATE ${quoteTable(table)} SET as_of = ?, event_log = ? WHERE id = ?`
    ).run(nextAsOf(), eventLog, id);
  } else {
    const setClause = cols.map(c => `"${c}" = @${c}`).join(', ');
    const sql = `
      UPDATE ${quoteTable(table)}
      SET ${setClause}, as_of = @__as_of, event_log = @__event_log
      WHERE id = @__id
    `;
    db.prepare(sql).run({ ...updates, __as_of: nextAsOf(), __event_log: eventLog, __id: id });
  }
  return db.prepare(`SELECT * FROM ${quoteTable(table)} WHERE id = ?`).get(id);
}

/**
 * Insert a new row. `values` must contain `id` (or one is generated) — the
 * caller is responsible for validating column names against the schema.
 * Returns the freshly-inserted row.
 */
export function insertRow(db, table, values) {
  const id = values.id || newId();
  const row = { ...values, id };
  const cols = Object.keys(row);
  const placeholders = cols.map(c => `@${c}`).join(', ');
  const colList = cols.map(c => `"${c}"`).join(', ');
  db.prepare(`INSERT INTO ${quoteTable(table)} (${colList}) VALUES (${placeholders})`).run(row);
  return db.prepare(`SELECT * FROM ${quoteTable(table)} WHERE id = ?`).get(id);
}

/**
 * Wrap stale-propagation invocation with a no-op for unknown sources.
 */
export function fireStale(db, source, trigger, params) {
  return propagateStale(db, source, trigger, params);
}

/**
 * Convert a row to API JSON — parse known JSON columns to objects/arrays.
 * Caller passes the list of JSON columns specific to the table.
 */
export function rowToJson(row, jsonColumns = ['event_log']) {
  if (!row) return null;
  const out = { ...row };
  for (const col of jsonColumns) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { out[col] = null; }
    }
  }
  return out;
}
