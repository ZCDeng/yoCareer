#!/usr/bin/env node

/**
 * daemon-rest-selftest.mjs — yoCareer v2 / U2 REST endpoints selftest
 *
 * Verifies (each end-to-end against a freshly spawned daemon):
 *   1. /healthz returns 200 + version + db_user_version
 *   2. mutating endpoints without x-yo-token → 401
 *   3. mutating endpoints with bad token → 403
 *   4. /api/extension/pair with bad code → 403 BAD_CODE
 *   5. /api/extension/pair with valid code → 204
 *   6. /api/extension/pair second use of same code → 403 ALREADY_USED
 *   7. /api/extension/register before pair → 403 NOT_PAIRED
 *   8. /api/extension/register after successful pair → 200 + token
 *   9. /api/events/ticket with token → 200 + ticket UUID
 *  10. CORS rejects malicious origin (preflight)
 *  11. CORS allows chrome-extension:// (preflight)
 *  12. graceful shutdown removes ~/.yocareer/daemon.json
 *
 * Output: single JSON line on stdout; exit 0 on pass, 1 on fail.
 * Usage:  node tests/daemon-rest-selftest.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER = join(ROOT, 'daemon', 'server.mjs');

const tmpRoot = mkdtempSync(join(tmpdir(), 'yocareer-u2-rest-'));
const dbPath = join(tmpRoot, 'yocareer.db');
const infoFile = join(tmpRoot, 'daemon.json');
const port = 8700 + Math.floor(Math.random() * 50);   // pick a random unused-ish port

const results = [];
const failures = [];

function rec(name, ok, extra = {}, error = null) {
  if (ok) results.push({ name, ok: true, ...extra });
  else { results.push({ name, ok: false, error: error?.message || error }); failures.push(name); }
}

async function startDaemon() {
  return new Promise((resolveStart, rejectStart) => {
    const proc = spawn(process.execPath, [SERVER, dbPath], {
      env: {
        ...process.env,
        YOCAREER_INFO_FILE: infoFile,
        YOCAREER_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    proc.stderr.on('data', chunk => {
      const s = chunk.toString();
      if (!ready && s.includes('listening on')) {
        ready = true;
        resolveStart(proc);
      }
    });
    proc.on('exit', code => {
      if (!ready) rejectStart(new Error(`daemon exited before ready (code=${code})`));
    });
    setTimeout(() => { if (!ready) rejectStart(new Error('daemon startup timeout')); }, 5000);
  });
}

async function stopDaemon(proc) {
  return new Promise(resolveStop => {
    proc.once('exit', () => resolveStop());
    proc.kill('SIGINT');
    setTimeout(() => { proc.kill('SIGKILL'); resolveStop(); }, 3000);
  });
}

const base = `http://127.0.0.1:${port}`;

let proc;
try {
  proc = await startDaemon();

  // Read daemon info to fetch token + pairing code
  const info = JSON.parse(readFileSync(infoFile, 'utf-8'));
  const token = info.token;
  const pairingCode = info.pairing_code;

  // 1. /healthz
  {
    const res = await fetch(`${base}/healthz`);
    const body = await res.json();
    rec('healthz-ok',
      res.status === 200 && body.ok === true && body.version && body.db_user_version === 1,
      { status: res.status, body });
  }

  // 2. mutating endpoint without token → 401
  {
    const res = await fetch(`${base}/api/events/ticket`, { method: 'POST' });
    rec('no-token-401', res.status === 401, { status: res.status });
  }

  // 3. mutating endpoint with bad token → 403
  {
    const res = await fetch(`${base}/api/events/ticket`, {
      method: 'POST',
      headers: { 'x-yo-token': 'wrong-token-value' },
    });
    rec('bad-token-403', res.status === 403, { status: res.status });
  }

  // 4. /api/extension/pair bad code → 403 BAD_CODE
  {
    const res = await fetch(`${base}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: '000000' }),
    });
    const body = await res.json();
    rec('pair-bad-code', res.status === 403 && body.reason === 'BAD_CODE', { status: res.status, body });
  }

  // 7. /api/extension/register before successful pair → 403 NOT_PAIRED
  {
    const res = await fetch(`${base}/api/extension/register`, { method: 'POST' });
    const body = await res.json();
    rec('register-before-pair', res.status === 403 && body.reason === 'NOT_PAIRED', { status: res.status, body });
  }

  // 5. /api/extension/pair valid code → 204
  {
    const res = await fetch(`${base}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: pairingCode }),
    });
    rec('pair-success', res.status === 204, { status: res.status });
  }

  // 6. second pair → 403 ALREADY_USED
  {
    const res = await fetch(`${base}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: pairingCode }),
    });
    const body = await res.json();
    rec('pair-replay-blocked', res.status === 403 && body.reason === 'ALREADY_USED', { status: res.status, body });
  }

  // 8. /api/extension/register after pair → 200 + token
  {
    const res = await fetch(`${base}/api/extension/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    rec('register-success', res.status === 200 && body.token === token, { status: res.status, body: { ...body, token: '***' } });
  }

  // 9. /api/events/ticket with valid token → 200 + ticket
  {
    const res = await fetch(`${base}/api/events/ticket`, {
      method: 'POST',
      headers: { 'x-yo-token': token },
    });
    const body = await res.json();
    rec('ticket-success',
      res.status === 200 && typeof body.ticket === 'string' && body.ticket.length === 36 && body.expires_in === 30,
      { status: res.status, body });
  }

  // 10. CORS preflight rejected for malicious origin
  {
    const res = await fetch(`${base}/api/events/ticket`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    rec('cors-rejects-malicious', res.status === 403, { status: res.status });
  }

  // 11. CORS preflight allowed for chrome-extension://
  {
    const extOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const res = await fetch(`${base}/api/events/ticket`, {
      method: 'OPTIONS',
      headers: {
        'Origin': extOrigin,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    rec('cors-allows-extension',
      res.status === 204 && allowOrigin === extOrigin,
      { status: res.status, allowOrigin });
  }

} catch (err) {
  rec('test-harness', false, {}, err);
}

if (proc) await stopDaemon(proc);

// 12. daemon.json removed on shutdown
rec('cleanup-info-file', !existsSync(infoFile));

rmSync(tmpRoot, { recursive: true, force: true });

const summary = {
  total: results.length,
  passed: results.filter(r => r.ok).length,
  failed: failures.length,
  failures,
  results,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
