#!/usr/bin/env node
/**
 * extension-manifest-selftest.mjs — Validate extension manifest schema
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = join(ROOT, '..', 'extension');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Tests ───────────────────────────────────────────────────────────

test('manifest.json exists', () => {
  if (!existsSync(join(EXT_DIR, 'manifest.json'))) throw new Error('manifest.json missing');
});

test('manifest is valid JSON', () => {
  const raw = readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(raw);
  if (manifest.manifest_version !== 3) throw new Error('must be MV3');
});

test('manifest has required fields', () => {
  const m = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
  if (!m.name) throw new Error('name missing');
  if (!m.version) throw new Error('version missing');
  if (!m.permissions?.includes('storage')) throw new Error('storage permission missing');
  if (!m.host_permissions?.some(h => h.includes('127.0.0.1'))) throw new Error('localhost host permission missing');
});

test('service_worker declared', () => {
  const m = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
  if (!m.background?.service_worker) throw new Error('service_worker missing');
});

test('popup declared', () => {
  const m = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
  if (!m.action?.default_popup) throw new Error('default_popup missing');
});

test('content_scripts match 3 platforms', () => {
  const m = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf-8'));
  const matches = m.content_scripts?.[0]?.matches || [];
  if (matches.length < 3) throw new Error(`expected >=3 platform matches, got ${matches.length}`);
});

test('sw.js exists', () => {
  if (!existsSync(join(EXT_DIR, 'sw.js'))) throw new Error('sw.js missing');
});

test('popup files exist', () => {
  for (const f of ['popup.html', 'popup.js']) {
    if (!existsSync(join(EXT_DIR, 'popup', f))) throw new Error(`${f} missing`);
  }
});

test('content extractor exists', () => {
  if (!existsSync(join(EXT_DIR, 'content', 'extractor.js'))) throw new Error('extractor.js missing');
});

// ── Runner ──────────────────────────────────────────────────────────

async function run() {
  const results = [];
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
      passed++;
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
      failed++;
    }
  }
  console.log(JSON.stringify({ passed, failed, tests: results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(JSON.stringify({ passed: 0, failed: 1, error: err.message }));
  process.exit(1);
});
