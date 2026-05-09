// yoCareer v2 — Unified daemon HTTP client.
//
// All CLI scripts use this to talk to the local daemon. Responsibilities:
//   1. Read ~/.yocareer/daemon.json (port + token discovery)
//   2. Auto-start daemon if not running (fork detached, wait for healthz)
//   3. Attach x-yo-token to every request
//   4. SSE: ticket exchange → EventSource with auto-reconnect
//   5. Typed convenience methods for each entity endpoint
//
// Usage:
//   import { createDaemonClient } from './lib/daemon-client.mjs';
//   const client = await createDaemonClient({ autoStart: true });
//   const profile = await client.profile.get();
//   const signals = await client.signals.list({ limit: 50 });

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findRunningDaemon,
  DEFAULT_PORT,
} from '../daemon/lib/discovery.mjs';

const DEFAULT_DIR = join(homedir(), '.yocareer');
const DAEMON_SCRIPT = resolve(join(fileURLToPath(import.meta.url), '..', '..', 'daemon', 'server.mjs'));
const AUTOSTART_WAIT_MS = 5000;
const AUTOSTART_POLL_MS = 200;
const REQUEST_TIMEOUT_MS = 30000;

function daemonUrl(info, path) {
  return `http://127.0.0.1:${info.port}${path}`;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Low-level fetch with timeout, token header, and JSON body handling.
 */
async function apiFetch(info, method, path, body, opts = {}) {
  const url = daemonUrl(info, path);
  const headers = {
    'Accept': 'application/json',
    'x-yo-token': info.token,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Parse JSON or empty body gracefully
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else if (res.status !== 204) {
      const text = await res.text();
      if (text) data = { _raw: text };
    }

    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data?.error || `HTTP_${res.status}`;
      err.response = data;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Request timeout: ${method} ${path}`);
      timeoutErr.code = 'YOCAREER_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

/**
 * Poll /healthz until daemon is responsive or timeout expires.
 */
async function waitForDaemon(info, maxWaitMs = AUTOSTART_WAIT_MS) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(daemonUrl(info, '/healthz'), {
        method: 'GET',
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return true;
    } catch {
      // ignore, daemon not ready yet
    }
    await sleep(AUTOSTART_POLL_MS);
  }
  return false;
}

/**
 * Fork the daemon as a detached background process.
 * Returns the info read back from daemon.json after startup.
 */
async function forkDaemon(dbPath, opts = {}) {
  const { openSync, mkdirSync } = await import('node:fs');
  const logPath = join(DEFAULT_DIR, 'daemon.log');
  const errPath = join(DEFAULT_DIR, 'daemon.err');

  // Ensure log directory exists
  try { mkdirSync(DEFAULT_DIR, { recursive: true }); } catch {}

  // Redirect stdio to files so the daemon survives terminal close
  const outFd = openSync(logPath, 'a');
  const errFd = openSync(errPath, 'a');

  const child = spawn(process.execPath, [DAEMON_SCRIPT, dbPath].filter(Boolean), {
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: { ...process.env, YOCAREER_PORT: String(opts.port || DEFAULT_PORT) },
  });
  child.unref();

  // Wait for daemon.json to appear
  let info = null;
  const deadline = Date.now() + AUTOSTART_WAIT_MS;
  while (Date.now() < deadline) {
    info = findRunningDaemon();
    if (info) break;
    await sleep(AUTOSTART_POLL_MS);
  }

  if (!info) {
    const err = new Error('Daemon failed to start. Check ~/.yocareer/daemon.err for details.');
    err.code = 'YOCAREER_DAEMON_START_FAILED';
    throw err;
  }

  // Extra safety: hit /healthz to confirm it's actually serving
  const healthy = await waitForDaemon(info, 2000);
  if (!healthy) {
    const err = new Error('Daemon process exists but /healthz is not responding.');
    err.code = 'YOCAREER_DAEMON_UNHEALTHY';
    throw err;
  }

  return info;
}

// ── Entity API builders ─────────────────────────────────────────────

function makeProfileApi(info) {
  return {
    get: () => apiFetch(info, 'GET', '/api/profile'),
    put: (body, opts) => apiFetch(info, 'PUT', '/api/profile', body, opts),
  };
}

function makePortalsApi(info) {
  return {
    list: (qs = '') => apiFetch(info, 'GET', `/api/portals${qs}`),
    get: (id) => apiFetch(info, 'GET', `/api/portals/${id}`),
    create: (body) => apiFetch(info, 'POST', '/api/portals', body),
    update: (id, body, opts) => apiFetch(info, 'PUT', `/api/portals/${id}`, body, opts),
    delete: (id) => apiFetch(info, 'DELETE', `/api/portals/${id}`),
  };
}

function makeCvVersionsApi(info) {
  return {
    list: () => apiFetch(info, 'GET', '/api/cv-versions'),
    get: (id) => apiFetch(info, 'GET', `/api/cv-versions/${id}`),
    create: (body) => apiFetch(info, 'POST', '/api/cv-versions', body),
  };
}

function makeSignalsApi(info) {
  return {
    list: (qs = '') => apiFetch(info, 'GET', `/api/signals${qs}`),
    get: (id) => apiFetch(info, 'GET', `/api/signals/${id}`),
    upsert: (body) => apiFetch(info, 'POST', '/api/signals', body),
    patch: (id, body, opts) => apiFetch(info, 'PATCH', `/api/signals/${id}`, body, opts),
    delete: (id) => apiFetch(info, 'DELETE', `/api/signals/${id}`),
  };
}

function makeApplicationsApi(info) {
  return {
    list: (qs = '') => apiFetch(info, 'GET', `/api/applications${qs}`),
    get: (id) => apiFetch(info, 'GET', `/api/applications/${id}`),
    create: (body) => apiFetch(info, 'POST', '/api/applications', body),
    patch: (id, body, opts) => apiFetch(info, 'PATCH', `/api/applications/${id}`, body, opts),
    delete: (id) => apiFetch(info, 'DELETE', `/api/applications/${id}`),
  };
}

function makeEvaluationsApi(info) {
  return {
    list: (qs = '') => apiFetch(info, 'GET', `/api/evaluations${qs}`),
    get: (id) => apiFetch(info, 'GET', `/api/evaluations/${id}`),
    create: (body) => apiFetch(info, 'POST', '/api/evaluations', body),
  };
}

function makeTasksApi(info) {
  return {
    list: (qs = '') => apiFetch(info, 'GET', `/api/tasks${qs}`),
    get: (id) => apiFetch(info, 'GET', `/api/tasks/${id}`),
    status: (id) => apiFetch(info, 'GET', `/api/tasks/${id}/status`),
    cancel: (id) => apiFetch(info, 'POST', `/api/tasks/${id}/cancel`),
  };
}

// ── SSE client ──────────────────────────────────────────────────────

/**
 * Create an SSE stream reader. Handles ticket exchange, EventSource setup,
 * auto-reconnect, and Last-Event-ID resume.
 *
 * Returns { events: AsyncIterable, close: () => void }
 */
export async function createSseStream(info, opts = {}) {
  let lastEventId = opts.lastEventId || '';
  let closed = false;
  let currentEs = null;

  // Ticket exchange (EventSource can't set custom headers)
  async function getTicket() {
    const res = await apiFetch(info, 'POST', '/api/events/ticket', null, { timeout: 5000 });
    return res.ticket;
  }

  async function* generator() {
    while (!closed) {
      let ticket;
      try {
        ticket = await getTicket();
      } catch (err) {
        if (closed) return;
        yield { type: '_error', data: { code: 'TICKET_FAILED', message: err.message } };
        await sleep(3000);
        continue;
      }

      const url = `${daemonUrl(info, '/api/events')}?ticket=${encodeURIComponent(ticket)}${lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : ''}`;

      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'text/event-stream' },
          signal: AbortSignal.timeout(opts.timeout || 60_000),
        });

        if (!res.ok) {
          yield { type: '_error', data: { code: 'SSE_CONNECT_FAILED', status: res.status } };
          await sleep(3000);
          continue;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames from buffer
          const frames = buffer.split('\n\n');
          buffer = frames.pop(); // keep incomplete frame

          for (const frame of frames) {
            const event = parseSseFrame(frame);
            if (event.id) lastEventId = event.id;
            if (event.type && event.data !== undefined) {
              yield event;
            }
          }
        }
      } catch (err) {
        if (closed) return;
        yield { type: '_error', data: { code: 'SSE_ERROR', message: err.message } };
      }

      // Reconnect after a brief delay
      if (!closed) await sleep(2000);
    }
  }

  return {
    events: generator(),
    close: () => { closed = true; if (currentEs) currentEs.close(); },
  };
}

function parseSseFrame(frame) {
  const event = { type: 'message', data: undefined, id: '' };
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event.type = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      event.data = event.data === undefined ? data : event.data + '\n' + data;
    } else if (line.startsWith('id:')) event.id = line.slice(3).trim();
    else if (line.startsWith('retry:')) { /* ignore */ }
    else if (line.startsWith(':')) { /* comment / keepalive */ }
  }
  if (event.data !== undefined) {
    try { event.data = JSON.parse(event.data); } catch { /* leave as string */ }
  }
  return event;
}

// ── Client factory ──────────────────────────────────────────────────

/**
 * Create a daemon client. If `autoStart` is true and no daemon is running,
 * forks one in the background and waits for it to be ready.
 *
 * Options:
 *   autoStart {boolean} — fork daemon if not running (default: true)
 *   dbPath {string} — passed to forked daemon
 *   port {number} — override port for forked daemon
 */
export async function createDaemonClient(opts = {}) {
  let info = findRunningDaemon();

  if (!info && opts.autoStart !== false) {
    info = await forkDaemon(opts.dbPath, { port: opts.port });
  }

  if (!info) {
    const err = new Error(
      'No daemon running and autoStart disabled. ' +
      'Run: npx yocareer daemon start'
    );
    err.code = 'YOCAREER_DAEMON_NOT_FOUND';
    throw err;
  }

  return {
    info,
    _fetch: (method, path, body, fetchOpts) => apiFetch(info, method, path, body, fetchOpts),
    health: () => apiFetch(info, 'GET', '/healthz'),
    profile: makeProfileApi(info),
    portals: makePortalsApi(info),
    cvVersions: makeCvVersionsApi(info),
    signals: makeSignalsApi(info),
    applications: makeApplicationsApi(info),
    evaluations: makeEvaluationsApi(info),
    tasks: makeTasksApi(info),
    sse: (sseOpts) => createSseStream(info, sseOpts),
    // Raw request for custom paths (e.g. future /api/scan)
    get: (path, fetchOpts) => apiFetch(info, 'GET', path, null, fetchOpts),
    post: (path, body, fetchOpts) => apiFetch(info, 'POST', path, body, fetchOpts),
    patch: (path, body, fetchOpts) => apiFetch(info, 'PATCH', path, body, fetchOpts),
    put: (path, body, fetchOpts) => apiFetch(info, 'PUT', path, body, fetchOpts),
    delete: (path, fetchOpts) => apiFetch(info, 'DELETE', path, null, fetchOpts),
  };
}

/**
 * Quick health check without creating a full client. Returns daemon info
 * if running, null otherwise.
 */
export function probeDaemon() {
  return findRunningDaemon();
}
