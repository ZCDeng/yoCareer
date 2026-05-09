#!/usr/bin/env node

/**
 * daemon-cli.mjs — Daemon lifecycle management
 *
 * Subcommands:
 *   start   — Fork detached daemon process, write daemon.json
 *   stop    — Kill daemon by PID from daemon.json
 *   status  — Query /healthz and print human-readable status
 *   restart — stop + start
 *
 * Usage:
 *   node daemon-cli.mjs start [db-path]
 *   node daemon-cli.mjs stop
 *   node daemon-cli.mjs status
 *   node daemon-cli.mjs restart [db-path]
 */

import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findRunningDaemon,
  clearDaemonInfo,
} from './daemon/lib/discovery.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DAEMON_SCRIPT = resolve(__dirname, 'daemon', 'server.mjs');
const DEFAULT_DIR = join(homedir(), '.yocareer');

function log(msg) { console.error(msg); }

// ── start ───────────────────────────────────────────────────────────

async function cmdStart(dbPath) {
  const existing = findRunningDaemon();
  if (existing) {
    log(`Daemon already running on port ${existing.port} (PID ${existing.pid})`);
    log(`Pairing code: ${existing.pairing_code}`);
    return 0;
  }

  log('Starting yoCareer daemon...');

  const logFile = join(DEFAULT_DIR, 'daemon.log');
  const errFile = join(DEFAULT_DIR, 'daemon.err');
  const outFd = openSync(logFile, 'a');
  const errFd = openSync(errFile, 'a');

  const child = spawn(process.execPath, [DAEMON_SCRIPT, dbPath].filter(Boolean), {
    detached: true,
    stdio: ['ignore', outFd, errFd],
  });
  child.unref();

  // Poll daemon.json until it appears
  let info = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    info = findRunningDaemon();
    if (info) break;
    await new Promise(r => setTimeout(r, 200));
  }

  if (!info) {
    log('ERROR: Daemon failed to start. Check ~/.yocareer/daemon.err');
    return 1;
  }

  log(`Daemon started on 127.0.0.1:${info.port} (PID ${info.pid})`);
  log(`Pairing code: ${existing?.pairing_code || info.pairing_code}`);
  log(`Database: ${info.db_path || dbPath || './data/yocareer.db'}`);
  return 0;
}

// ── stop ────────────────────────────────────────────────────────────

async function cmdStop() {
  const info = findRunningDaemon();
  if (!info) {
    log('Daemon is not running.');
    clearDaemonInfo();
    return 0;
  }

  try {
    process.kill(info.pid, 'SIGTERM');
  } catch (err) {
    if (err.code === 'ESRCH') {
      log('Daemon process not found (already exited).');
      clearDaemonInfo();
      return 0;
    }
    log(`ERROR: Failed to kill daemon: ${err.message}`);
    return 1;
  }

  // Wait for process to exit
  let alive = true;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      process.kill(info.pid, 0);
      await new Promise(r => setTimeout(r, 200));
    } catch {
      alive = false;
      break;
    }
  }

  if (alive) {
    log('Daemon did not exit gracefully, sending SIGKILL...');
    try { process.kill(info.pid, 'SIGKILL'); } catch {}
  }

  clearDaemonInfo();
  log('Daemon stopped.');
  return 0;
}

// ── status ──────────────────────────────────────────────────────────

async function cmdStatus() {
  const info = findRunningDaemon();
  if (!info) {
    log('Daemon: not running');
    log('Start with: npx yocareer daemon start');
    return 1;
  }

  // Hit /healthz
  let health = null;
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) health = await res.json();
  } catch (err) {
    log(`Daemon process exists (PID ${info.pid}) but /healthz unreachable: ${err.message}`);
    return 1;
  }

  log('Daemon: running');
  log(`  Port:      ${info.port}`);
  log(`  PID:       ${info.pid}`);
  log(`  Version:   ${health?.version || 'unknown'}`);
  log(`  DB path:   ${health?.db_path || info.db_path || 'unknown'}`);
  log(`  DB schema: v${health?.db_user_version || '?'}`);
  log(`  Started:   ${health?.started_at || info.started_at || '?'}`);
  log(`  SSE subs:  ${health?.sse?.subscribers ?? '?'}`);
  log(`  Pairing:   ${info.pairing_code || '(expired/used)'}`);
  return 0;
}

// ── restart ─────────────────────────────────────────────────────────

async function cmdRestart(dbPath) {
  await cmdStop();
  await new Promise(r => setTimeout(r, 500));
  return cmdStart(dbPath);
}

// ── main ────────────────────────────────────────────────────────────

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'start':
      return cmdStart(args[0]);
    case 'stop':
      return cmdStop();
    case 'status':
      return cmdStatus();
    case 'restart':
      return cmdRestart(args[0]);
    default:
      log('Usage: npx yocareer daemon <start|stop|status|restart> [db-path]');
      return cmd ? 1 : 0;
  }
}

main().then(code => process.exit(code)).catch(err => {
  console.error(err);
  process.exit(1);
});
