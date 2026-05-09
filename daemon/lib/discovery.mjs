// yoCareer v2 — daemon discovery (~/.yocareer/daemon.json + PID lock).
//
// Single source of truth for "is the daemon up, and where?"
// Writers: only the daemon process itself (on start / shutdown).
// Readers: CLI clients (lib/daemon-client.mjs in U4), Web SPA (read-only),
// extension service worker.
//
// File layout:
//   ~/.yocareer/daemon.json (mode 0600)
//   {
//     "version": "2.0.0",
//     "pid": 12345,
//     "port": 8650,
//     "token": "<UUID>",
//     "pairing_code": "123456",
//     "pairing_expires_at": "2026-05-11T01:00:00.000Z",
//     "pairing_used_at": null,
//     "db_path": "<absolute-path-to>/yocareer.db",
//     "started_at": "2026-05-10T01:00:00.000Z"
//   }

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const DEFAULT_DIR = join(homedir(), '.yocareer');
const DEFAULT_FILE = process.env.YOCAREER_INFO_FILE || join(DEFAULT_DIR, 'daemon.json');
export const DEFAULT_PORT = parseInt(process.env.YOCAREER_PORT, 10) || 8650;
//                          ^ test override; production reads 8650 from env not set.
//                            8643 reserved for Aditly bridge — picker fallback handles collisions.
const PORT_MAX_TRIES = 10;

export function infoPath(file = DEFAULT_FILE) {
  // Honors YOCAREER_INFO_FILE via DEFAULT_FILE override; pass an explicit path
  // to bypass.
  return file;
}

export function readDaemonInfo(file = DEFAULT_FILE) {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeDaemonInfo(info, file = DEFAULT_FILE) {
  const dir = file.substring(0, file.lastIndexOf('/')) || DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(info, null, 2), 'utf-8');
  // Restrict to owner read/write only — token is sensitive.
  try { chmodSync(file, 0o600); } catch { /* on some filesystems chmod is best-effort */ }
}

export function clearDaemonInfo(file = DEFAULT_FILE) {
  if (existsSync(file)) {
    try { unlinkSync(file); } catch { /* shutdown best-effort */ }
  }
}

/**
 * True iff `pid` is currently alive. Returns false on EPERM/ESRCH.
 * On Windows: kill(pid, 0) still returns true for alive, false otherwise.
 */
export function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;   // exists but we don't own it
    return false;
  }
}

/**
 * Choose an available port starting from `start`, trying +1 up to PORT_MAX_TRIES.
 * Returns the chosen port, or throws if all attempts collide.
 */
export async function choosePort(start = DEFAULT_PORT, host = '127.0.0.1') {
  for (let i = 0; i < PORT_MAX_TRIES; i++) {
    const candidate = start + i;
    if (await isPortFree(candidate, host)) return candidate;
  }
  const err = new Error(
    `No free port in [${start}, ${start + PORT_MAX_TRIES - 1}] on ${host}`
  );
  err.code = 'YOCAREER_NO_FREE_PORT';
  throw err;
}

function isPortFree(port, host) {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', err => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') resolve(false);
        else resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

/**
 * If a daemon.json exists with a live PID, return that info; otherwise null.
 * Used by `daemon start` to refuse double-launch and by clients to detect
 * a running daemon.
 */
export function findRunningDaemon(file = DEFAULT_FILE) {
  const info = readDaemonInfo(file);
  if (!info) return null;
  if (!isProcessAlive(info.pid)) return null;
  return info;
}
