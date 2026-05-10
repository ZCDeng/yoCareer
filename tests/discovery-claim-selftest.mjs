#!/usr/bin/env node
// yoCareer v2 — discovery atomic-claim regression test.
//
// Guards against the "two daemons race-overwrite daemon.json" bug
// (Bug B in the v2 round-trip review): without atomic O_EXCL claim,
// findRunningDaemon + writeDaemonInfo had a TOCTOU window where two
// daemons starting in close succession could both observe "no daemon
// running", each pick a port, then race to overwrite daemon.json.
//
// Output: a single JSON line { passed, total, failed, cases } so
// test-all.mjs can fold it into its summary.

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claimDaemonInfo, readDaemonInfo, clearDaemonInfo,
} from '../daemon/lib/discovery.mjs';

const cases = [];
function record(name, ok, detail) {
  cases.push({ name, ok, detail: ok ? null : detail });
}

const tmp = mkdtempSync(join(tmpdir(), 'yoc-discovery-'));
const file = join(tmp, 'daemon.json');

try {
  // ── 1. Empty slot → claim succeeds ────────────────────────────
  {
    const info = sample({ pid: process.pid, port: 8650 });
    const r = claimDaemonInfo(info, file);
    const onDisk = readDaemonInfo(file);
    record(
      'claim on empty slot',
      r.claimed === true && onDisk?.pid === process.pid && onDisk?.port === 8650,
      `claimed=${r.claimed}, onDisk=${JSON.stringify(onDisk)}`
    );
  }

  // ── 2. Live holder → second claim refused, file untouched ─────
  {
    // Slot is currently held by us (PID = process.pid → alive).
    const info2 = sample({ pid: process.pid, port: 8651 });
    const r = claimDaemonInfo(info2, file);
    const onDisk = readDaemonInfo(file);
    record(
      'second claim refused while live holder owns slot',
      r.claimed === false && r.holder?.pid === process.pid && onDisk?.port === 8650,
      `claimed=${r.claimed}, onDisk.port=${onDisk?.port}, expected 8650 untouched`
    );
  }

  // ── 3. Stale holder (dead PID) → claim succeeds, overwrites ───
  {
    clearDaemonInfo(file);
    // Plant a stale daemon.json with a PID that's almost certainly dead.
    // PID 1 is alive on macOS/Linux; 999999 is unlikely to be allocated.
    // We pick a large unlikely PID; if a process happens to own it, the
    // test will report "live holder" — which is still correct semantics.
    writeFileSync(file, JSON.stringify(sample({ pid: 999999, port: 8650 }), null, 2));
    const info3 = sample({ pid: process.pid, port: 8652 });
    const r = claimDaemonInfo(info3, file);
    const onDisk = readDaemonInfo(file);
    record(
      'stale holder is reaped and slot is reclaimed',
      r.claimed === true && onDisk?.pid === process.pid && onDisk?.port === 8652,
      `claimed=${r.claimed}, onDisk.pid=${onDisk?.pid}, expected ${process.pid}`
    );
  }

  // ── 4. Cleared slot → claim succeeds ──────────────────────────
  {
    clearDaemonInfo(file);
    const info4 = sample({ pid: process.pid, port: 8653 });
    const r = claimDaemonInfo(info4, file);
    record(
      'claim after clearDaemonInfo succeeds',
      r.claimed === true && existsSync(file),
      `claimed=${r.claimed}, fileExists=${existsSync(file)}`
    );
  }

  // ── 5. Returned holder shape (sanity for caller error message) ──
  {
    // File is currently claimed by us.
    const info5 = sample({ pid: process.pid, port: 8654 });
    const r = claimDaemonInfo(info5, file);
    record(
      'rejection returns holder.{pid,port} for actionable error message',
      r.claimed === false && typeof r.holder?.pid === 'number' && typeof r.holder?.port === 'number',
      `holder=${JSON.stringify(r.holder)}`
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const failed = cases.filter(c => !c.ok).length;
const report = {
  passed: failed === 0,
  total: cases.length,
  failed,
  cases,
};
console.log(JSON.stringify(report));
process.exit(failed === 0 ? 0 : 1);

function sample(overrides) {
  return {
    version: '2.0.0',
    pid: 1,
    port: 8650,
    token: 'test-token',
    pairing_code: '000000',
    pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    pairing_used_at: null,
    db_path: '/tmp/test.db',
    started_at: new Date().toISOString(),
    ...overrides,
  };
}
