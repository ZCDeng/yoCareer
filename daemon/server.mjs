// yoCareer v2 — daemon HTTP entry point.
//
// Boots the local daemon: opens SQLite, picks a port, writes ~/.yocareer/daemon.json,
// prints pairing code to stderr, mounts route handlers, listens on 127.0.0.1.
//
// Run:  node daemon/server.mjs [db-path]
//
// Lifecycle:
//   1. Refuse double-launch (findRunningDaemon)
//   2. openAndMigrate db
//   3. Generate token + pairing code (stored in daemon.json mode 0600)
//   4. Pick port (default 8650, +1 fallback)
//   5. Mount routes via dispatcher
//   6. Listen on 127.0.0.1
//   7. SIGTERM/SIGINT → graceful shutdown
//
// Route table is built once at startup and used by `dispatch(req, res)`.
// Public routes bypass auth check (auth.mjs::isPublicRoute).

import { createServer } from 'node:http';
import { URL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { openAndMigrate } from '../db/migrations.mjs';
import { loadAllStateMachines } from './lib/state-machines.mjs';
import {
  DEFAULT_PORT,
  choosePort,
  findRunningDaemon,
  writeDaemonInfo,
  clearDaemonInfo,
  infoPath,
} from './lib/discovery.mjs';
import { generatePairingCode, makeExpiresAt } from './lib/pairing.mjs';
import { makeAuthChecker } from './lib/auth.mjs';
import { applyCors } from './lib/cors.mjs';
import { createTicketStore } from './lib/ticket-store.mjs';
import { createBroadcaster } from './lib/broadcast.mjs';

import { handleHealth } from './routes/api-health.mjs';
import { handleEventsTicket } from './routes/api-events-ticket.mjs';
import { handleEvents } from './routes/api-events.mjs';
import { handleExtensionPair, handleExtensionRegister } from './routes/api-extension.mjs';
import { handleProfileGet, handleProfilePut } from './routes/api-profile.mjs';
import {
  handlePortalsList, handlePortalGet, handlePortalCreate,
  handlePortalUpdate, handlePortalDelete,
} from './routes/api-portals.mjs';
import {
  handleCvVersionList, handleCvVersionGet, handleCvVersionCreate,
} from './routes/api-cv-versions.mjs';
import {
  handleSignalList, handleSignalGet, handleSignalUpsert,
  handleSignalPatch, handleSignalDelete,
} from './routes/api-signals.mjs';
import {
  handleApplicationList, handleApplicationGet, handleApplicationCreate,
  handleApplicationPatch, handleApplicationDelete,
} from './routes/api-applications.mjs';
import {
  handleEvaluationList, handleEvaluationGet, handleEvaluationCreate,
} from './routes/api-evaluations.mjs';
import {
  handleTaskGet, handleTaskCancel, handleTaskList,
} from './routes/api-tasks.mjs';
import { handleScan } from './routes/api-scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VERSION_FILE = join(ROOT, 'VERSION');
const DEFAULT_DB_PATH = join(ROOT, 'data', 'yocareer.db');
const SCHEMA_DIR = join(ROOT, 'db', 'schema');

function readVersion() {
  try { return readFileSync(VERSION_FILE, 'utf-8').trim(); }
  catch { return '0.0.0-dev'; }
}

/**
 * Build the route table. Each entry is { method, pattern, handle }.
 * Pattern is a literal pathname or `:id` placeholder pattern (e.g. /api/portals/:id).
 * findRoute uses a simple segment-by-segment matcher.
 */
function buildRoutes(ctx) {
  return [
    // Health & infra
    { method: 'GET',  path: '/healthz',                handle: req => handleHealth(req, ctx) },

    // SSE
    { method: 'POST', path: '/api/events/ticket',      handle: req => handleEventsTicket(req, ctx) },
    { method: 'GET',  path: '/api/events',             handle: (req, res, url) => handleEvents(req, res, url, ctx) },

    // Extension pairing
    { method: 'POST', path: '/api/extension/pair',     handle: req => handleExtensionPair(req, ctx) },
    { method: 'POST', path: '/api/extension/register', handle: req => handleExtensionRegister(req, ctx) },

    // Profile (singleton)
    { method: 'GET',  path: '/api/profile',            handle: req => handleProfileGet(req, ctx) },
    { method: 'PUT',  path: '/api/profile',            handle: req => handleProfilePut(req, ctx) },

    // Portals
    { method: 'GET',  path: '/api/portals',            handle: req => handlePortalsList(req, ctx) },
    { method: 'POST', path: '/api/portals',            handle: req => handlePortalCreate(req, ctx) },
    { method: 'GET',  path: '/api/portals/:id',        handle: req => handlePortalGet(req, ctx) },
    { method: 'PUT',  path: '/api/portals/:id',        handle: req => handlePortalUpdate(req, ctx) },
    { method: 'DELETE', path: '/api/portals/:id',      handle: req => handlePortalDelete(req, ctx) },

    // CV versions (immutable-by-design; only POST creates new)
    { method: 'GET',  path: '/api/cv-versions',        handle: req => handleCvVersionList(req, ctx) },
    { method: 'POST', path: '/api/cv-versions',        handle: req => handleCvVersionCreate(req, ctx) },
    { method: 'GET',  path: '/api/cv-versions/:id',    handle: req => handleCvVersionGet(req, ctx) },

    // Signals
    { method: 'GET',  path: '/api/signals',            handle: req => handleSignalList(req, ctx) },
    { method: 'POST', path: '/api/signals',            handle: req => handleSignalUpsert(req, ctx) },
    { method: 'GET',  path: '/api/signals/:id',        handle: req => handleSignalGet(req, ctx) },
    { method: 'PATCH', path: '/api/signals/:id',       handle: req => handleSignalPatch(req, ctx) },
    { method: 'DELETE', path: '/api/signals/:id',      handle: req => handleSignalDelete(req, ctx) },

    // Applications
    { method: 'GET',  path: '/api/applications',       handle: req => handleApplicationList(req, ctx) },
    { method: 'POST', path: '/api/applications',       handle: req => handleApplicationCreate(req, ctx) },
    { method: 'GET',  path: '/api/applications/:id',   handle: req => handleApplicationGet(req, ctx) },
    { method: 'PATCH', path: '/api/applications/:id',  handle: req => handleApplicationPatch(req, ctx) },
    { method: 'DELETE', path: '/api/applications/:id', handle: req => handleApplicationDelete(req, ctx) },

    // Evaluations
    { method: 'GET',  path: '/api/evaluations',        handle: req => handleEvaluationList(req, ctx) },
    { method: 'POST', path: '/api/evaluations',        handle: req => handleEvaluationCreate(req, ctx) },
    { method: 'GET',  path: '/api/evaluations/:id',    handle: req => handleEvaluationGet(req, ctx) },

    // Tasks
    { method: 'GET',  path: '/api/tasks',              handle: req => handleTaskList(req, ctx) },
    { method: 'GET',  path: '/api/tasks/:id',          handle: req => handleTaskGet(req, ctx) },
    { method: 'GET',  path: '/api/tasks/:id/status',   handle: req => handleTaskGet(req, ctx) },
    { method: 'POST', path: '/api/tasks/:id/cancel',   handle: req => handleTaskCancel(req, ctx) },

    // Scan
    { method: 'POST', path: '/api/scan',               handle: req => handleScan(req, ctx) },
  ];
}

/**
 * Match a literal pathname against a route pattern that may contain `:id`
 * placeholders. Returns matched route + extracted params, or null.
 */
function matchPattern(pattern, pathname) {
  if (pattern === pathname) return { params: {} };
  const pSegs = pattern.split('/');
  const aSegs = pathname.split('/');
  if (pSegs.length !== aSegs.length) return null;
  const params = {};
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i];
    const a = aSegs[i];
    if (p.startsWith(':')) {
      if (!a) return null;
      params[p.slice(1)] = decodeURIComponent(a);
    } else if (p !== a) {
      return null;
    }
  }
  return { params };
}

function findRoute(routes, method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = matchPattern(r.path, pathname);
    if (m) return r;
  }
  return null;
}

/**
 * Send a JSON response with the given status code and body. Sets common headers.
 */
function sendJson(res, status, body) {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', rejectBody);
  });
}

async function dispatch(req, res, ctx) {
  let url;
  try {
    url = new URL(req.url, `http://127.0.0.1:${ctx.port}`);
  } catch {
    sendJson(res, 400, { error: 'bad_url' });
    return;
  }

  // CORS first — handles OPTIONS preflight short-circuit.
  if (applyCors(req, res, ctx.port)) return;

  // Auth (skips public routes and /api/events which uses ticket).
  const authResult = ctx.authChecker(req, url);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { error: 'unauthorized', message: authResult.message });
    return;
  }

  const route = findRoute(ctx.routes, req.method, url.pathname);
  if (!route) {
    sendJson(res, 404, { error: 'not_found', path: url.pathname });
    return;
  }

  // Read JSON body for non-SSE POST endpoints.
  const isSse = url.pathname === '/api/events';
  let body = null;
  if (!isSse && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      sendJson(res, err.status || 400, { error: 'bad_body', message: err.message });
      return;
    }
  }
  req.parsedBody = body;
  req.parsedUrl = url;

  try {
    const result = await route.handle(req, res, url);
    if (result === undefined || result === null) return;       // handler took over the response (SSE)
    sendJson(res, result.status || 200, result.body);
  } catch (err) {
    if (!res.writableEnded) {
      sendJson(res, err.status || 500, {
        error: err.code || 'internal_error',
        message: err.message,
      });
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const dbPath = argv[0] || DEFAULT_DB_PATH;
  const version = readVersion();

  // Refuse double-launch.
  const running = findRunningDaemon();
  if (running) {
    process.stderr.write(`yoCareer daemon already running (pid ${running.pid}, port ${running.port})\n`);
    process.exit(2);
  }

  // Open db + migrate.
  const { db } = openAndMigrate(dbPath, SCHEMA_DIR);

  // Boot SM registry. State machines load from templates/states.*.yml.
  loadAllStateMachines(undefined, { force: true });

  // Pick port + generate secrets.
  const port = await choosePort(DEFAULT_PORT);
  const token = randomUUID();
  const pairingCode = generatePairingCode();
  const startedAt = new Date().toISOString();
  const pairingExpiresAt = makeExpiresAt();

  const info = {
    version, pid: process.pid, port, token,
    pairing_code: pairingCode,
    pairing_expires_at: pairingExpiresAt,
    pairing_used_at: null,
    db_path: resolve(dbPath),
    started_at: startedAt,
  };
  writeDaemonInfo(info);

  // Wire libs.
  const ticketStore = createTicketStore({
    ttlMs: parseInt(process.env.YOCAREER_TICKET_TTL_MS, 10) || undefined,
  });
  ticketStore.startJanitor();
  const broadcaster = createBroadcaster({
    heartbeatMs: parseInt(process.env.YOCAREER_HEARTBEAT_MS, 10) || undefined,
  });
  const authChecker = makeAuthChecker(token);

  const ctx = {
    db, port, version, token,
    info, infoFile: infoPath(),
    ticketStore, broadcaster, authChecker,
  };
  ctx.routes = buildRoutes(ctx);

  const server = createServer((req, res) => dispatch(req, res, ctx));
  server.listen(port, '127.0.0.1', () => {
    process.stderr.write(
      `yoCareer daemon v${version} listening on http://127.0.0.1:${port}\n` +
      `  pid:        ${process.pid}\n` +
      `  db_path:    ${info.db_path}\n` +
      `  daemon.json:${ctx.infoFile}\n` +
      `\n` +
      `  Pairing code for browser extension:\n\n      ${pairingCode}\n\n` +
      `  (valid 24h, single-use. Open the extension popup and enter this code.)\n`
    );
  });

  function shutdown(reason) {
    process.stderr.write(`\nyoCareer daemon shutting down (${reason})…\n`);
    broadcaster.shutdown();
    ticketStore.stop();
    server.close(() => {
      try { db.close(); } catch { /* nothing */ }
      clearDaemonInfo(ctx.infoFile);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { server, ctx, shutdown };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => {
    process.stderr.write(`yoCareer daemon failed to start: ${err.message}\n`);
    if (err.stack) process.stderr.write(err.stack + '\n');
    process.exit(1);
  });
}

export { main, dispatch, buildRoutes };
