// yoCareer v2 — Synchronous daemon startup helper for legacy CLI scripts.
//
// Scripts that cannot easily be made async (module-level execution,
// synchronous file I/O chains) use this to ensure the daemon is running
// before they proceed.
//
// Usage:
//   import { ensureDaemon } from './lib/ensure-daemon.mjs';
//   ensureDaemon(); // throws if daemon cannot start within 5s

import { spawnSync } from 'node:child_process';
import { findRunningDaemon } from '../daemon/lib/discovery.mjs';

const DAEMON_SCRIPT = new URL('../daemon/server.mjs', import.meta.url).pathname;

/**
 * Synchronously ensure the daemon is running. If not, fork it and poll
 * daemon.json until it appears (max 5s).
 *
 * @throws {Error} if daemon fails to start
 */
export function ensureDaemon() {
  let info = findRunningDaemon();
  if (info) return info;

  // Fork daemon synchronously (detached, survives parent exit)
  spawnSync(process.execPath, [DAEMON_SCRIPT], {
    detached: true,
    stdio: 'ignore',
  });

  // Poll for daemon.json up to 5 seconds
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    info = findRunningDaemon();
    if (info) return info;
    // Cooperative yield — not precise timing, good enough for CLI startup
    const t0 = Date.now();
    while (Date.now() - t0 < 100) { /* busy-wait ~100ms */ }
  }

  throw new Error(
    'Daemon failed to start. Run `npx yocareer daemon start` manually and retry.'
  );
}
