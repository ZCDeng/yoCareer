// yoCareer v2 — stale propagation DAG executor (daemon-side).
//
// When data on one entity changes, dependent rows on other entities may no
// longer reflect the user's current intent or the world's current state.
// Rather than recompute eagerly (expensive, opaque), we mark dependent rows
// `stale = 1 + stale_reason = '<source>'` and let the user (or a periodic job)
// re-trigger the recompute.
//
// Origin reference: F4 (CV 改动触发下游 stale), R7 (state machine), R3 (event log).
//
// ========================================================================
// EXPLICIT RULE TABLE
// ========================================================================
// The earlier plan called this "5 inputs × 3 outputs = 15 rules", but most
// pairs are no-ops. Below are the actual actionable invalidations. Anything
// not listed is intentionally NOT propagated (= the change does not affect
// downstream rows).
//
//   Source             Trigger                                   Output         Reason          Notes
//   -----------------  ----------------------------------------  -------------  --------------  ------------------------
//   cv_versions        INSERT new version                        evaluations    cv_changed      mark stale where cv_version_id != newest
//   profile            UPDATE target_roles_json                  evaluations    profile_changed mark all stale
//   profile            UPDATE comp_json                          evaluations    profile_changed mark all stale
//   profile            UPDATE location_json                      evaluations    profile_changed mark all stale
//   signals            UPDATE jd_md / role / title / payload     evaluations    signal_changed  mark stale where signal_id = X
//   signals            UPDATE current_status → liveness_dead     applications   liveness_dead   informational; UI shows banner
//   signals            UPDATE current_status → stale_url         applications   liveness_dead   same
//
// Explicitly NOT propagated:
//   - portals UPDATE                  → only affects FUTURE scans, not stored rows
//   - capabilities.yml reload         → only affects UI rendering + future scans
//   - applications UPDATE notes_md    → no downstream
//   - evaluations UPDATE              → no downstream (it IS the leaf)
//   - task_runs UPDATE                → no downstream
//
// Total: 7 actionable rules across 4 source entities, 2 output entities.

const RULES = [
  {
    name: 'cv_version_new_invalidates_evaluations',
    source: 'cv_versions',
    trigger: 'INSERT',
    output: 'evaluations',
    reason: 'cv_changed',
    apply(db, { newCvVersionId }) {
      // Mark every evaluation referencing an OLDER cv_version as stale.
      // Newest evaluation pointing at the just-created cv_version_id stays fresh.
      const stmt = db.prepare(`
        UPDATE evaluations
        SET stale = 1, stale_reason = 'cv_changed',
            as_of = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE cv_version_id != @newCvVersionId
          AND stale = 0
      `);
      const info = stmt.run({ newCvVersionId });
      return info.changes;
    },
  },
  {
    name: 'profile_targeting_changed_invalidates_evaluations',
    source: 'profile',
    trigger: 'UPDATE',
    output: 'evaluations',
    reason: 'profile_changed',
    fields: ['target_roles_json', 'comp_json', 'location_json'],
    apply(db) {
      // Profile is single-row ('self'), so any targeting change invalidates all
      // currently-fresh evaluations.
      const stmt = db.prepare(`
        UPDATE evaluations
        SET stale = 1, stale_reason = 'profile_changed',
            as_of = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE stale = 0
      `);
      return stmt.run().changes;
    },
  },
  {
    name: 'signal_content_changed_invalidates_evaluations',
    source: 'signals',
    trigger: 'UPDATE',
    output: 'evaluations',
    reason: 'signal_changed',
    fields: ['jd_md', 'role', 'title', 'payload_json'],
    apply(db, { signalId }) {
      const stmt = db.prepare(`
        UPDATE evaluations
        SET stale = 1, stale_reason = 'signal_changed',
            as_of = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE signal_id = @signalId
          AND stale = 0
      `);
      return stmt.run({ signalId }).changes;
    },
  },
  {
    name: 'signal_dead_warns_applications',
    source: 'signals',
    trigger: 'UPDATE',
    output: 'applications',
    reason: 'liveness_dead',
    statuses: ['liveness_dead', 'stale_url'],
    apply(db, { signalId }) {
      // We don't auto-cancel applications (user may already be in interview).
      // We append an event to event_log so the UI can surface a banner.
      const stmt = db.prepare(`
        UPDATE applications
        SET event_log = json_insert(
              event_log, '$[#]',
              json_object('kind', 'liveness_dead',
                          'signal_id', @signalId,
                          'at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ),
            as_of = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE signal_id = @signalId
      `);
      return stmt.run({ signalId }).changes;
    },
  },
];

/**
 * Find rules that match (source, trigger, optionally fields/statuses).
 *
 * Filter semantics:
 *   - `rule.fields` is a whitelist on changed columns; when defined, the rule
 *     fires only if the caller's ctx.changedFields intersects the whitelist.
 *     Missing ctx.changedFields = rule does NOT fire (we cannot prove
 *     applicability).
 *   - `rule.statuses` is a whitelist on the new status value; when defined,
 *     the rule fires only if ctx.newStatus is one of them. Missing
 *     ctx.newStatus = rule does NOT fire.
 *
 * @param {string} source         entity table (cv_versions / profile / signals)
 * @param {string} trigger        'INSERT' | 'UPDATE' | 'DELETE'
 * @param {object} ctx            { changedFields?: string[], newStatus?: string }
 */
export function matchingRules(source, trigger, ctx = {}) {
  return RULES.filter(rule => {
    if (rule.source !== source) return false;
    if (rule.trigger !== trigger) return false;
    if (rule.fields) {
      if (!ctx.changedFields) return false;
      if (!rule.fields.some(f => ctx.changedFields.includes(f))) return false;
    }
    if (rule.statuses) {
      if (!ctx.newStatus) return false;
      if (!rule.statuses.includes(ctx.newStatus)) return false;
    }
    return true;
  });
}

/**
 * Run a single rule by name. Returns rows affected. Throws if rule unknown.
 */
export function runRule(db, ruleName, params = {}) {
  const rule = RULES.find(r => r.name === ruleName);
  if (!rule) {
    const err = new Error(`Unknown stale propagation rule: ${ruleName}`);
    err.code = 'YOCAREER_UNKNOWN_STALE_RULE';
    throw err;
  }
  return rule.apply(db, params);
}

/**
 * Apply every rule that matches the given mutation. Caller passes the daemon's
 * transaction-wrapped db handle. Returns a map { ruleName: rowsAffected }.
 *
 * @example
 *   propagate(db, 'signals', 'UPDATE', {
 *     signalId: '...', changedFields: ['jd_md']
 *   });
 *   // → { signal_content_changed_invalidates_evaluations: 3 }
 */
export function propagate(db, source, trigger, params) {
  const ctx = {
    changedFields: params.changedFields,
    newStatus: params.newStatus,
  };
  const out = {};
  for (const rule of matchingRules(source, trigger, ctx)) {
    out[rule.name] = rule.apply(db, params);
  }
  return out;
}

/**
 * Read-only: list every rule. Useful for /api/health and self-tests.
 */
export function describeRules() {
  return RULES.map(({ apply, ...rest }) => rest);
}
