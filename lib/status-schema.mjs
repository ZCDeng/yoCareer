// yoCareer v2 — status schema loader (multi-machine + transitions).
//
// Two API levels:
//
//   Level 1 (v1 compat — used by merge-tracker, verify-pipeline):
//     - loadStatusSchema(file)            // states + aliases, no transitions
//     - normalizeStatusToId(schema, raw)
//     - normalizeStatusToLabel(schema, raw)
//     - canonicalStatusIds(schema)
//
//   Level 2 (v2 — used by daemon state-machines.mjs):
//     - loadStateMachine(file)            // states + aliases + transitions
//     - canTransition(machine, from, to)  // boolean
//     - assertTransition(machine, from, to) // throws INVALID_TRANSITION
//     - listStateIds(machine)
//
// File format (yaml):
//   states:
//     - id: ...
//       label: ...
//       aliases: [...]
//       description: ...
//       dashboard_group: ...
//   transitions:
//     <from_id>: [<to_id>, ...]   # optional; when absent treated as no-op machine
//
// Hardcoded FALLBACK_STATES: keeps only the 8 canonical ENGLISH ids without
// aliases, so v1 tools that lose access to states.applications.yml still
// produce a deterministic schema (no Spanish ghost aliases). aliases now
// come from yaml only; U8 will drop Spanish aliases from yaml itself.

import { existsSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const FALLBACK_STATES = [
  { id: 'evaluated', label: 'Evaluated' },
  { id: 'applied',   label: 'Applied' },
  { id: 'responded', label: 'Responded' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer',     label: 'Offer' },
  { id: 'rejected',  label: 'Rejected' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'skip',      label: 'SKIP' },
];

function normalizeToken(value) {
  return String(value || '').replace(/\*\*/g, '').trim().toLowerCase();
}

function normalizeStatusToken(value) {
  return normalizeToken(value).replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

function buildSchema(states, transitions) {
  const canonical = [];
  const byId = new Map();
  const aliasToId = new Map();

  for (const state of states) {
    const id = normalizeToken(state.id);
    const label = String(state.label || state.id || '').trim();
    if (!id || !label) continue;
    canonical.push({ id, label });
    byId.set(id, label);
    aliasToId.set(id, id);
    aliasToId.set(normalizeToken(label), id);
    for (const alias of state.aliases || []) {
      aliasToId.set(normalizeToken(alias), id);
    }
  }

  // Common defensive fallbacks. Kept minimal — Spanish aliases now come
  // from the yaml file (states.applications.yml) only.
  aliasToId.set('applied', 'applied');
  aliasToId.set('skip', 'skip');
  aliasToId.set('dup', 'discarded');
  aliasToId.set('repost', 'discarded');

  const machineTransitions = new Map();
  if (transitions && typeof transitions === 'object') {
    for (const [from, tos] of Object.entries(transitions)) {
      const fromId = normalizeToken(from);
      if (!byId.has(fromId)) continue;        // ignore unknown source
      const allowed = new Set();
      for (const to of (Array.isArray(tos) ? tos : [])) {
        const toId = normalizeToken(to);
        if (byId.has(toId)) allowed.add(toId);
      }
      machineTransitions.set(fromId, allowed);
    }
  }

  return { canonical, byId, aliasToId, transitions: machineTransitions };
}

/**
 * Level 1 — load a yaml file, fall back to canonical 8-state list when missing
 * or unreadable. Backwards compatible with v1 merge-tracker / verify-pipeline.
 */
export function loadStatusSchema(statesFile) {
  if (!statesFile || !existsSync(statesFile)) {
    return buildSchema(FALLBACK_STATES, null);
  }
  try {
    const parsed = yaml.load(readFileSync(statesFile, 'utf-8'));
    const states = Array.isArray(parsed?.states) ? parsed.states : FALLBACK_STATES;
    return buildSchema(states, parsed?.transitions || null);
  } catch {
    return buildSchema(FALLBACK_STATES, null);
  }
}

/**
 * Level 2 — same loader, but also returns transitions; throws if file missing
 * (state machines must come from yaml; refusing to fall back is intentional —
 * if states.signals.yml is missing we want a hard error, not a silent
 * degradation to the applications schema).
 */
export function loadStateMachine(statesFile) {
  if (!statesFile || !existsSync(statesFile)) {
    const err = new Error(`State machine yaml not found: ${statesFile}`);
    err.code = 'YOCAREER_STATE_MACHINE_MISSING';
    throw err;
  }
  const parsed = yaml.load(readFileSync(statesFile, 'utf-8'));
  if (!Array.isArray(parsed?.states) || parsed.states.length === 0) {
    const err = new Error(`State machine yaml has no states: ${statesFile}`);
    err.code = 'YOCAREER_STATE_MACHINE_EMPTY';
    throw err;
  }
  return buildSchema(parsed.states, parsed.transitions || null);
}

export function normalizeStatusToId(schema, rawStatus) {
  const token = normalizeStatusToken(rawStatus);
  if (!token) return null;
  return schema.aliasToId.get(token) || null;
}

export function normalizeStatusToLabel(schema, rawStatus, fallbackLabel = 'Evaluated') {
  const id = normalizeStatusToId(schema, rawStatus);
  if (!id) return fallbackLabel;
  return schema.byId.get(id) || fallbackLabel;
}

export function canonicalStatusIds(schema) {
  return schema.canonical.map(state => state.id);
}

export function listStateIds(machine) {
  return machine.canonical.map(state => state.id);
}

/**
 * Returns true iff `from` → `to` is declared in the machine's transition
 * table. Treats unknown machines (no transitions defined) as **always**
 * forbidding transitions other than self-loops — caller must pass a machine
 * loaded with loadStateMachine().
 */
export function canTransition(machine, from, to) {
  const fromId = normalizeToken(from);
  const toId = normalizeToken(to);
  if (!machine.byId.has(fromId)) return false;
  if (!machine.byId.has(toId)) return false;
  if (fromId === toId) return true;            // self-loop allowed (no-op update)
  const allowed = machine.transitions.get(fromId);
  if (!allowed) return false;
  return allowed.has(toId);
}

/**
 * Throws an Error with code = 'YOCAREER_INVALID_TRANSITION' when the move
 * is not allowed. Daemon route handlers wrap this in HTTP 400 responses.
 */
export function assertTransition(machine, from, to) {
  if (canTransition(machine, from, to)) return;
  const err = new Error(
    `Invalid state transition: ${from} → ${to} ` +
    `(allowed from ${from}: ${[...(machine.transitions.get(normalizeToken(from)) || [])].join(', ') || '(none)'})`
  );
  err.code = 'YOCAREER_INVALID_TRANSITION';
  err.from = from;
  err.to = to;
  throw err;
}
