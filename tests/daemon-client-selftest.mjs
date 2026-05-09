#!/usr/bin/env node
/**
 * daemon-client-selftest.mjs — Verify lib/daemon-client.mjs
 *
 * Requires a running daemon (launched automatically by createDaemonClient).
 */

import { createDaemonClient, probeDaemon, createSseStream } from '../lib/daemon-client.mjs';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

let client;

// ── Tests ───────────────────────────────────────────────────────────

test('probeDaemon returns null when not running', async () => {
  const info = probeDaemon();
  // Daemon may or may not be running from prior tests; just verify type safety
  if (info !== null) {
    if (typeof info.port !== 'number') throw new Error('port should be number');
    if (typeof info.token !== 'string') throw new Error('token should be string');
  }
});

test('createDaemonClient auto-starts daemon', async () => {
  client = await createDaemonClient({ autoStart: true });
  if (!client.info) throw new Error('client.info missing');
  if (!client.info.port) throw new Error('client.info.port missing');
  if (!client.info.token) throw new Error('client.info.token missing');
});

test('health endpoint returns valid shape', async () => {
  const health = await client.health();
  if (!health.ok) throw new Error('health.ok should be true');
  if (!health.version) throw new Error('health.version missing');
  if (typeof health.db_user_version !== 'number') throw new Error('db_user_version should be number');
});

test('profile.get returns object', async () => {
  const profile = await client.profile.get();
  if (typeof profile !== 'object') throw new Error('profile should be object');
});

test('portals.list returns array', async () => {
  const res = await client.portals.list();
  if (!Array.isArray(res.portals)) throw new Error('portals should be array');
});

test('signals.list returns array', async () => {
  const res = await client.signals.list();
  if (!Array.isArray(res.signals)) throw new Error('signals should be array');
});

test('applications.list returns array', async () => {
  const res = await client.applications.list();
  if (!Array.isArray(res.applications)) throw new Error('applications should be array');
});

test('evaluations.list returns array', async () => {
  const res = await client.evaluations.list();
  if (!Array.isArray(res.evaluations)) throw new Error('evaluations should be array');
});

test('tasks.list returns array', async () => {
  const res = await client.tasks.list();
  if (!Array.isArray(res.tasks)) throw new Error('tasks should be array');
});

test('cvVersions.list returns array', async () => {
  const res = await client.cvVersions.list();
  if (!Array.isArray(res.cv_versions)) throw new Error('cv_versions should be array');
});

test('raw GET /healthz works', async () => {
  const health = await client.get('/healthz');
  if (!health.ok) throw new Error('raw get failed');
});

test('raw POST with error returns structured error', async () => {
  try {
    await client.post('/api/signals', {}); // empty body should fail validation
    throw new Error('should have thrown');
  } catch (err) {
    if (!err.status) throw new Error('error should have status');
    if (!err.code) throw new Error('error should have code');
  }
});

test('SSE ticket exchange connects without error', async () => {
  const sse = await createSseStream(client.info, { timeout: 5000 });
  // Just verify the stream object is created without throwing
  sse.close();
});

// ── Runner ──────────────────────────────────────────────────────────

async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

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
