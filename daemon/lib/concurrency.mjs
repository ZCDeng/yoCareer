// yoCareer v2 — optimistic concurrency check (`If-Match: <as_of>`).
//
// Every mutating endpoint requires the client to send `If-Match: <as_of>`
// where as_of is the value the client last read for this row. Daemon
// compares against the current value:
//   - Match → proceed with mutation, bump as_of in the same transaction.
//   - Mismatch → 409 Conflict + return current as_of so the client can refetch.
//
// This is intentional preference over last-write-wins because:
//   - Multiple browser tabs / CLI / extension can all mutate the same row.
//   - Without the check we get silent overwrite of concurrent edits (the
//     classic "lost update" problem).
//
// Origin reference: G4.

export class ConcurrencyConflictError extends Error {
  constructor(currentAsOf, submittedAsOf) {
    super(`as_of mismatch: client sent "${submittedAsOf}", current is "${currentAsOf}"`);
    this.code = 'YOCAREER_AS_OF_CONFLICT';
    this.status = 409;
    this.currentAsOf = currentAsOf;
    this.submittedAsOf = submittedAsOf;
  }
}

/**
 * Extract `If-Match` value from a request. Returns trimmed string or null.
 * Strips wrapping quotes (per RFC 7232 weak-validator notation `W/"..."`,
 * we ignore weak markers since our as_of is opaque ISO timestamp).
 */
export function readIfMatch(req) {
  const raw = req.headers['if-match'];
  if (!raw || typeof raw !== 'string') return null;
  return raw.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
}

/**
 * Throw ConcurrencyConflictError if submitted as_of doesn't match current.
 * Self-loop semantics: if submitted is null/missing, we throw 428
 * Precondition Required (caller maps to HTTP code).
 *
 * @param {string} currentAsOf      value from the db row
 * @param {string|null} submittedAsOf  value from If-Match header
 */
export function assertAsOf(currentAsOf, submittedAsOf) {
  if (!submittedAsOf) {
    const err = new Error('If-Match header is required for mutations');
    err.code = 'YOCAREER_PRECONDITION_REQUIRED';
    err.status = 428;
    throw err;
  }
  if (submittedAsOf !== currentAsOf) {
    throw new ConcurrencyConflictError(currentAsOf, submittedAsOf);
  }
}

/**
 * Generate a fresh as_of timestamp. ISO 8601 UTC with milliseconds. The
 * daemon writes this back into the row (and into the response body) on
 * every mutation.
 */
export function nextAsOf(now = Date.now()) {
  return new Date(now).toISOString();
}
