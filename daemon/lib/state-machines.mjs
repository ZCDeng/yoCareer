// yoCareer v2 — state machine runner (daemon-side).
//
// Loads the 4 entity state machines from templates/states.*.yml at boot.
// Daemon route handlers wrap every status mutation in `assertTransition` so
// invalid moves throw early (HTTP 400). Schema parsing lives in
// lib/status-schema.mjs; this module is the *runtime registry* used by daemon
// services.
//
// Naming convention: machine names match the entity table (signals,
// applications, evaluations, task_runs). Filenames use kebab-case for the
// task_runs machine (`task-runs.yml`) since hyphens are conventional in yaml
// filenames; the registry exposes both keys.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStateMachine,
  canTransition,
  assertTransition,
  listStateIds,
} from '../../lib/status-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

const MACHINE_FILES = {
  signals:      'states.signals.yml',
  applications: 'states.applications.yml',
  evaluations:  'states.evaluations.yml',
  task_runs:    'states.task-runs.yml',     // table name uses underscore
};

let registry = null;

/**
 * Load all 4 state machines into the registry. Idempotent — safe to call again
 * (returns the cached registry). For tests, pass `templatesDir` to point at a
 * fixture directory.
 */
export function loadAllStateMachines(templatesDir = DEFAULT_TEMPLATES_DIR, { force = false } = {}) {
  if (registry && !force) return registry;
  const machines = {};
  for (const [name, file] of Object.entries(MACHINE_FILES)) {
    machines[name] = loadStateMachine(join(templatesDir, file));
  }
  registry = machines;
  return registry;
}

/**
 * Get a single machine by name. Throws if registry is not loaded.
 */
export function getMachine(name) {
  if (!registry) {
    const err = new Error('State machines not loaded; call loadAllStateMachines() first');
    err.code = 'YOCAREER_STATE_MACHINES_UNLOADED';
    throw err;
  }
  const machine = registry[name];
  if (!machine) {
    const err = new Error(`Unknown state machine: ${name}; valid: ${Object.keys(registry).join(', ')}`);
    err.code = 'YOCAREER_UNKNOWN_STATE_MACHINE';
    throw err;
  }
  return machine;
}

/**
 * Validate a status transition for a named machine. Returns true on success,
 * false on disallowed transition. Use {@link applyTransition} when you want a
 * thrown error instead.
 */
export function checkTransition(machineName, from, to) {
  return canTransition(getMachine(machineName), from, to);
}

/**
 * Throw YOCAREER_INVALID_TRANSITION when (from, to) is not a declared edge.
 * Self-loops are allowed (they signal "no-op update", which the daemon writes
 * for as_of bumps without status change).
 */
export function applyTransition(machineName, from, to) {
  assertTransition(getMachine(machineName), from, to);
}

/**
 * Return the canonical state id list for a machine, in declaration order.
 */
export function statesFor(machineName) {
  return listStateIds(getMachine(machineName));
}

/**
 * Return the full registry (read-only). Used by tests + daemon /api/health.
 */
export function debugRegistry() {
  return registry;
}
