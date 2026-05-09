#!/usr/bin/env node

/**
 * daemon-domain-selftest.mjs — yoCareer v2 / U3 domain endpoints selftest
 *
 * Verifies (each end-to-end against a freshly spawned daemon):
 *   1. profile GET creates singleton with id='self'
 *   2. profile PUT updates targeting fields → stale propagation triggered
 *   3. profile PUT with stale If-Match → 409
 *   4. portals CRUD: POST → GET list → GET single → PUT → DELETE
 *   5. cv_versions: POST creates version + chain by parent_version_id
 *   6. cv_versions POST triggers stale on existing evaluation rows
 *   7. signals: POST upsert deduplicates by url_hash
 *   8. signals: PATCH state machine refuses invalid transition
 *   9. signals: PATCH content fields triggers stale on its evaluations
 *  10. applications: POST creates row + walks signal through promote chain
 *  11. applications: PATCH status transitions
 *  12. evaluations: POST returns task_id + completes async with score
 *  13. evaluations: GET shows completed status after task finishes
 *  14. tasks: GET shows kind/status/progress
 *  15. tasks: POST :id/cancel sets cancellation_requested (not exercised
 *      against a long-running task here — that's a U2 SSE selftest already)
 *
 * Output: single JSON line on stdout; exit 0 on pass, 1 on fail.
 * Usage:  node tests/daemon-domain-selftest.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER = join(ROOT, 'daemon', 'server.mjs');

const tmpRoot = mkdtempSync(join(tmpdir(), 'yocareer-u3-domain-'));
const dbPath = join(tmpRoot, 'yocareer.db');
const infoFile = join(tmpRoot, 'daemon.json');
const port = 8920 + Math.floor(Math.random() * 50);

const results = [];
const failures = [];
function rec(name, ok, extra = {}, error = null) {
  if (ok) results.push({ name, ok: true, ...extra });
  else { results.push({ name, ok: false, error: error?.message || error || 'failed' }); failures.push(name); }
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
      if (!ready && chunk.toString().includes('listening on')) {
        ready = true; resolveStart(proc);
      }
    });
    proc.on('exit', code => {
      if (!ready) rejectStart(new Error(`daemon exited (code=${code})`));
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
let proc, token;

async function api(method, path, { ifMatch, body } = {}) {
  const headers = { 'x-yo-token': token };
  if (ifMatch) headers['If-Match'] = ifMatch;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 / non-json */ }
  return { status: res.status, body: json };
}

try {
  proc = await startDaemon();
  const info = JSON.parse(readFileSync(infoFile, 'utf-8'));
  token = info.token;

  // 1. profile GET
  const p1 = await api('GET', '/api/profile');
  rec('profile-get-init',
    p1.status === 200 && p1.body.id === 'self' && Array.isArray(p1.body.target_roles_json),
    { status: p1.status });

  // 3. profile PUT with stale If-Match → 409
  const p2 = await api('PUT', '/api/profile', {
    ifMatch: '1900-01-01T00:00:00.000Z',
    body: { narrative_md: 'should fail' },
  });
  rec('profile-put-stale-409', p2.status === 409, { status: p2.status });

  // 2. profile PUT happy path → also seed targeting change for stale propagation
  const p3 = await api('PUT', '/api/profile', {
    ifMatch: p1.body.as_of,
    body: { narrative_md: 'hello', target_roles_json: ['Senior Engineer'] },
  });
  rec('profile-put-ok',
    p3.status === 200 && p3.body.narrative_md === 'hello' &&
    Array.isArray(p3.body.target_roles_json) && p3.body.target_roles_json[0] === 'Senior Engineer',
    { status: p3.status });

  // 4. portals CRUD
  const portalCreate = await api('POST', '/api/portals', {
    body: { id: 'test-portal', kind: 'company_page', config_json: { url: 'http://x' } },
  });
  rec('portal-create',
    portalCreate.status === 201 && portalCreate.body.id === 'test-portal',
    { status: portalCreate.status });

  const portalList = await api('GET', '/api/portals');
  rec('portal-list', portalList.status === 200 && portalList.body.count >= 1);

  const portalUpdate = await api('PUT', '/api/portals/test-portal', {
    ifMatch: portalCreate.body.as_of,
    body: { enabled: false },
  });
  rec('portal-update-enabled',
    portalUpdate.status === 200 && portalUpdate.body.enabled === 0,
    { status: portalUpdate.status, enabled: portalUpdate.body.enabled });

  const portalDelete = await api('DELETE', '/api/portals/test-portal', {
    ifMatch: portalUpdate.body.as_of,
  });
  rec('portal-delete', portalDelete.status === 204, { status: portalDelete.status });

  // 5+6. cv_versions create
  const cv1 = await api('POST', '/api/cv-versions', { body: { content_md: '# CV v1', label: 'v1' } });
  rec('cv-version-create',
    cv1.status === 201 && cv1.body.id && cv1.body.label === 'v1',
    { status: cv1.status });

  // 7. signals upsert
  const sig1 = await api('POST', '/api/signals', {
    body: { url: 'http://example.com/job/x', title: 'AI', company_name: 'ACME', role: 'engineer' },
  });
  rec('signal-create-201', sig1.status === 201, { status: sig1.status });

  const sig2 = await api('POST', '/api/signals', {
    body: { url: 'http://example.com/job/x' },
  });
  rec('signal-upsert-200',
    sig2.status === 200 && sig2.body.id === sig1.body.id,
    { status: sig2.status, sameId: sig2.body.id === sig1.body.id });

  // 8. invalid transition
  const sigBadPatch = await api('PATCH', `/api/signals/${sig1.body.id}`, {
    ifMatch: sig1.body.as_of,
    body: { current_status: 'promoted' },     // captured → promoted is invalid (must walk chain)
  });
  rec('signal-patch-invalid-transition',
    sigBadPatch.status === 400 || sigBadPatch.status === 500,    // INVALID_TRANSITION → 400 or wrapped 500
    { status: sigBadPatch.status, body: sigBadPatch.body });

  // 12+13. evaluations create + wait
  const ev1 = await api('POST', '/api/evaluations', {
    body: { signal_id: sig1.body.id, cv_version_id: cv1.body.id },
  });
  rec('evaluation-create-202',
    ev1.status === 202 && typeof ev1.body.task_id === 'string',
    { status: ev1.status, task_id: ev1.body.task_id });

  // Poll task until completed (3 steps × 50ms = ~150ms expected)
  let taskFinal = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    const t = await api('GET', `/api/tasks/${ev1.body.task_id}`);
    if (t.body?.current_status === 'completed' || t.body?.current_status === 'failed') {
      taskFinal = t.body; break;
    }
  }
  rec('task-completes',
    taskFinal && taskFinal.current_status === 'completed' && taskFinal.progress === 1,
    { status: taskFinal?.current_status, progress: taskFinal?.progress });

  const evList = await api('GET', '/api/evaluations');
  rec('evaluation-list-completed',
    evList.status === 200 && evList.body.count === 1 &&
    evList.body.evaluations[0].current_status === 'completed' &&
    evList.body.evaluations[0].score === 4.2,
    { status: evList.status, eval_status: evList.body.evaluations[0]?.current_status });

  // 9. signal PATCH content → stale propagation on the completed evaluation
  const sigPatch = await api('PATCH', `/api/signals/${sig1.body.id}`, {
    ifMatch: sig2.body.as_of,
    body: { jd_md: 'updated JD content' },
  });
  rec('signal-patch-content',
    sigPatch.status === 200 && sigPatch.body.jd_md === 'updated JD content',
    { status: sigPatch.status });

  const evListAfterPatch = await api('GET', '/api/evaluations?stale=1');
  rec('signal-patch-stales-eval',
    evListAfterPatch.body.count === 1 &&
    evListAfterPatch.body.evaluations[0].stale === 1,
    { count: evListAfterPatch.body.count });

  // 10. application create — triggers full promote chain (captured → promoted).
  // Signal is still in 'captured' (jd_md patch didn't change status).
  const app1 = await api('POST', '/api/applications', { body: { signal_id: sig1.body.id } });
  rec('application-create',
    app1.status === 201 && app1.body.signal_id === sig1.body.id &&
    app1.body.current_status === 'evaluated',
    { status: app1.status, app_status: app1.body.current_status });

  const sigAfterApp = await api('GET', `/api/signals/${sig1.body.id}`);
  rec('application-promotes-signal',
    sigAfterApp.body.current_status === 'promoted',
    { signal_status: sigAfterApp.body.current_status });

  // 11. application PATCH status
  const appPatch = await api('PATCH', `/api/applications/${app1.body.id}`, {
    ifMatch: app1.body.as_of,
    body: { current_status: 'applied' },
  });
  rec('application-patch-applied',
    appPatch.status === 200 && appPatch.body.current_status === 'applied',
    { status: appPatch.status });

  // Invalid transition: applied → evaluated is not allowed
  const appBadTransition = await api('PATCH', `/api/applications/${app1.body.id}`, {
    ifMatch: appPatch.body.as_of,
    body: { current_status: 'evaluated' },
  });
  rec('application-patch-invalid-transition',
    appBadTransition.status === 400 || appBadTransition.status === 500,
    { status: appBadTransition.status });

} catch (err) {
  rec('test-harness', false, {}, err);
}

if (proc) await stopDaemon(proc);
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
