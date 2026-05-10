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

import {
  existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync,
  chmodSync, openSync, closeSync,
} from 'node:fs';
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

/**
 * Atomically claim daemon.json on behalf of the current process.
 *
 * Why this exists: `findRunningDaemon` (called once at startup) and
 * `writeDaemonInfo` (called later) form a TOCTOU window. Two daemons
 * starting in close succession can both observe "no daemon running",
 * each pick a free port, then race to overwrite daemon.json — leaving
 * the on-disk record pointing at whichever wrote last (often the one
 * that subsequently dies), while the other daemon stays alive but is
 * no longer discoverable via daemon.json.
 *
 * Atomic claim closes that window: we open the file with `O_EXCL` so
 * only one process can create it. If a holder is alive, we yield. If
 * the file is stale (PID dead), we delete and retry once.
 *
 * Returns:
 *   { claimed: true }                       — file written, caller owns it
 *   { claimed: false, holder: <info> }      — another live daemon holds it
 *
 * Caller is responsible for `clearDaemonInfo` on shutdown OR if subsequent
 * setup (e.g. `server.listen`) fails after claim succeeds.
 */
export function claimDaemonInfo(info, file = DEFAULT_FILE) {
  const dir = file.substring(0, file.lastIndexOf('/')) || DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(info, null, 2);

  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(file, 'wx', 0o600);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const existing = readDaemonInfo(file);
      if (existing && isProcessAlive(existing.pid)) {
        return { claimed: false, holder: existing };
      }
      try { unlinkSync(file); } catch { /* race with another cleaner — fine */ }
      continue;
    }
    try {
      writeFileSync(fd, payload, 'utf-8');
    } finally {
      try { closeSync(fd); } catch { /* fd already closed */ }
    }
    try { chmodSync(file, 0o600); } catch { /* best-effort on FAT/SMB */ }
    return { claimed: true };
  }
  // Two consecutive EEXIST→stale cycles is extraordinary; treat as collision.
  return { claimed: false, holder: readDaemonInfo(file) };
}
