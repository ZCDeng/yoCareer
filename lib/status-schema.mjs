import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';

const FALLBACK_STATES = [
  { id: 'evaluated', label: 'Evaluated', aliases: ['evaluada', 'condicional', 'hold', 'evaluar', 'verificar'] },
  { id: 'applied', label: 'Applied', aliases: ['aplicado', 'enviada', 'aplicada', 'sent'] },
  { id: 'responded', label: 'Responded', aliases: ['respondido'] },
  { id: 'interview', label: 'Interview', aliases: ['entrevista'] },
  { id: 'offer', label: 'Offer', aliases: ['oferta'] },
  { id: 'rejected', label: 'Rejected', aliases: ['rechazado', 'rechazada'] },
  { id: 'discarded', label: 'Discarded', aliases: ['descartado', 'descartada', 'cerrada', 'cancelada'] },
  { id: 'skip', label: 'SKIP', aliases: ['no aplicar', 'no_aplicar', 'monitor', 'geo blocker'] },
];

function normalizeToken(value) {
  return String(value || '').replace(/\*\*/g, '').trim().toLowerCase();
}

function normalizeStatusToken(value) {
  return normalizeToken(value).replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

function buildSchema(states) {
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

  // Common fallbacks kept for backward compatibility.
  aliasToId.set('applied', 'applied');
  aliasToId.set('skip', 'skip');
  aliasToId.set('duplicado', 'discarded');
  aliasToId.set('dup', 'discarded');
  aliasToId.set('repost', 'discarded');

  return { canonical, byId, aliasToId };
}

export function loadStatusSchema(statesFile) {
  if (!statesFile || !existsSync(statesFile)) {
    return buildSchema(FALLBACK_STATES);
  }

  try {
    const parsed = yaml.load(readFileSync(statesFile, 'utf-8'));
    const states = Array.isArray(parsed?.states) ? parsed.states : FALLBACK_STATES;
    return buildSchema(states);
  } catch {
    return buildSchema(FALLBACK_STATES);
  }
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
