-- yoCareer v2 — initial schema (user_version = 1)
--
-- Design rules:
--   1. Every domain row has id (UUID v4 text), created_at, as_of, event_log.
--   2. as_of is updated by daemon on each mutation; clients send `If-Match: <as_of>`
--      for optimistic concurrency. Conflicts return HTTP 409.
--   3. event_log is JSON array; daemon appends events instead of overwriting state
--      (R3, time-as-first-class-citizen).
--   4. current_status TEXT is validated at app layer against state-machines.mjs
--      loaded from templates/states.{signals,applications,evaluations,task-runs}.yml.
--      We do NOT use SQL CHECK constraints — the canonical state set lives in yaml.
--   5. capabilities is NOT a SQLite table; it lives in templates/capabilities.yml
--      and is loaded into daemon memory at startup (R21). The 8th entity table here
--      is `meta` (small kv) which holds runtime flags like v1_archive_detected.
--   6. Reports are NOT a separate table; they are projections rendered from
--      evaluations + applications + signals joins (R4). On-demand PDF export
--      writes to reports/exports/ at user request, not auto-persisted as DB rows.
--
-- Connection pragmas (journal_mode = WAL, synchronous = NORMAL, foreign_keys = ON,
-- busy_timeout, temp_store, mmap_size, cache_size) are NOT set here — SQLite
-- forbids most pragma changes inside a transaction, and migrations apply each
-- file inside a transaction. db/migrations.mjs::openAndMigrate sets them on
-- the open connection before applying any schema file.

-- ============================================================
-- 1. profile — single-row table (id = 'self')
-- ============================================================
CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY CHECK (id = 'self'),
  narrative_md TEXT,
  target_roles_json TEXT NOT NULL DEFAULT '[]',
  comp_json TEXT NOT NULL DEFAULT '{}',
  location_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

-- ============================================================
-- 2. portals — one row per source/portal (BOSS / 拉勾 / GitHub / V2EX / ...)
-- ============================================================
CREATE TABLE IF NOT EXISTS portals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
    -- Allowed kinds: 'company_page' | 'manual_signal_import' |
    -- 'reach_signal_search' | 'manual_only' (validated at app layer)
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS portals_kind_enabled
  ON portals(kind, enabled);

-- ============================================================
-- 3. cv_versions — versioned rows; never UPDATE, always INSERT a new row.
--    parent_version_id forms a linear (or branched) history chain.
-- ============================================================
CREATE TABLE IF NOT EXISTS cv_versions (
  id TEXT PRIMARY KEY,
  parent_version_id TEXT REFERENCES cv_versions(id) ON DELETE SET NULL,
  label TEXT,
  content_md TEXT NOT NULL,
  cover_letter_md TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS cv_versions_created_at
  ON cv_versions(created_at DESC);

-- ============================================================
-- 4. signals — captured offer / JD / lead
-- ============================================================
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source_portal_id TEXT REFERENCES portals(id) ON DELETE SET NULL,
  url TEXT,
  url_hash TEXT UNIQUE,
    -- sha256(canonicalized url); allows safe dedupe across re-scans
  title TEXT,
  company_name TEXT,
  role TEXT,
  jd_md TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  current_status TEXT NOT NULL DEFAULT 'captured',
    -- state machine: signal lifecycle (templates/states.signals.yml)
  liveness_state TEXT,
    -- 'alive' | 'stale_url' | 'liveness_dead' | NULL = unchecked
  liveness_checked_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS signals_status        ON signals(current_status);
CREATE INDEX IF NOT EXISTS signals_company       ON signals(company_name);
CREATE INDEX IF NOT EXISTS signals_source_portal ON signals(source_portal_id);
CREATE INDEX IF NOT EXISTS signals_first_seen    ON signals(first_seen_at DESC);

-- ============================================================
-- 5. applications — one application per signal (UNIQUE constraint)
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE REFERENCES signals(id) ON DELETE CASCADE,
  current_status TEXT NOT NULL DEFAULT 'evaluated',
    -- state machine: application lifecycle (templates/states.applications.yml)
  status_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes_md TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS applications_status ON applications(current_status);

-- ============================================================
-- 6. evaluations — one row per (signal, cv_version) tuple.
--    application_id is nullable — evaluation can predate the decision to apply.
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  cv_version_id TEXT NOT NULL REFERENCES cv_versions(id) ON DELETE CASCADE,
  score REAL,
    -- 0.0 to 5.0 overall fit score; NULL while pending
  blocks_json TEXT NOT NULL DEFAULT '{}',
    -- {A: {...}, B: {...}, ..., G: {...}} per modes/_shared.md block schema
  legitimacy_tier TEXT,
    -- 'A' | 'B' | 'C' | 'D' (R23 招聘官透明度 / posting legitimacy)
  stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
  stale_reason TEXT,
    -- one of: 'cv_changed' | 'profile_changed' | 'liveness_dead' | 'manual'
  current_status TEXT NOT NULL DEFAULT 'pending',
    -- state machine: evaluation lifecycle (templates/states.evaluations.yml)
  report_md TEXT,
    -- materialized report markdown (R4: rendered projection; we cache for fast read,
    -- but it can always be regenerated from blocks_json + cv_version + signal joins)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS evaluations_signal       ON evaluations(signal_id);
CREATE INDEX IF NOT EXISTS evaluations_application  ON evaluations(application_id);
CREATE INDEX IF NOT EXISTS evaluations_cv_version   ON evaluations(cv_version_id);
CREATE INDEX IF NOT EXISTS evaluations_stale        ON evaluations(stale)
  WHERE stale = 1;

-- ============================================================
-- 7. task_runs — long-running task tracker (scan / batch / multi-step eval)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
    -- 'scan' | 'batch_eval' | 'multi_step_eval' | 'pdf_import' | 'liveness_sweep' | ...
  entity_type TEXT,
    -- 'signal' | 'application' | 'evaluation' | NULL for batch jobs
  entity_id TEXT,
  current_status TEXT NOT NULL DEFAULT 'running',
    -- state machine: task_run lifecycle (templates/states.task-runs.yml)
  progress REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
  message TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  cancellation_requested INTEGER NOT NULL DEFAULT 0
    CHECK (cancellation_requested IN (0, 1)),
  error_json TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  as_of TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_log TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS task_runs_kind_status
  ON task_runs(kind, current_status);
CREATE INDEX IF NOT EXISTS task_runs_entity
  ON task_runs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS task_runs_started
  ON task_runs(started_at DESC);

-- ============================================================
-- 8. meta — small key/value store for runtime flags
--    Holds: v1_archive_detected, v1_archive_user_dismissed,
--    last_capabilities_yaml_hash, last_seen_daemon_version, ...
-- ============================================================
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
