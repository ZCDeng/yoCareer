// yoCareer v2 — extension pairing code (6-digit one-time code).
//
// Why pairing: localhost-HTTP daemon allows any chrome-extension://* origin
// past CORS. Without an out-of-band proof, a malicious extension installed
// in the same browser could just POST /api/extension/register and be granted
// the per-install token. The pairing code closes that hole — daemon prints
// the code on startup, user copies it from the terminal into the extension's
// pairing screen on first install.
//
// Lifecycle:
//   1. daemon start → generate code (6 digits), write to daemon.json,
//      print to stderr ("Pairing code for browser extension: 482931")
//   2. User opens extension popup first time → pairing.html → user types code
//   3. POST /api/extension/pair {pairing_code: "482931"}
//      - daemon compares (timing-safe), checks not expired, not used
//      - on match: mark used_at, return 204
//   4. POST /api/extension/register → daemon checks pairing_used_at within 60s
//      window → returns x-yo-token

import { randomInt, timingSafeEqual } from 'node:crypto';

const CODE_LENGTH = 6;
const PAIRING_TTL_MS = 24 * 60 * 60 * 1000;   // 24h before expiry forces regeneration
const REGISTER_GRACE_MS = 60_000;              // /pair → /register must happen within 60s

/**
 * Generate a fresh 6-digit pairing code as a zero-padded string.
 * Uses crypto.randomInt for unbiased range — Math.random would skew.
 */
export function generatePairingCode() {
  const max = 10 ** CODE_LENGTH;
  const n = randomInt(0, max);
  return String(n).padStart(CODE_LENGTH, '0');
}

/**
 * ISO timestamp `expires_at` for a freshly generated code.
 */
export function makeExpiresAt(now = Date.now()) {
  return new Date(now + PAIRING_TTL_MS).toISOString();
}

/**
 * Compare a user-submitted code against the daemon's current code in a
 * timing-safe way. Returns true on match.
 *
 * @param {string} submitted   user input (already trimmed by caller)
 * @param {string} canonical   daemon-side code from daemon.json
 */
export function comparePairingCode(submitted, canonical) {
  if (typeof submitted !== 'string' || typeof canonical !== 'string') return false;
  if (submitted.length !== canonical.length) return false;
  // Buffer compare requires equal lengths (already ensured above).
  const a = Buffer.from(submitted, 'utf-8');
  const b = Buffer.from(canonical, 'utf-8');
  return timingSafeEqual(a, b);
}

/**
 * Check whether the pairing window is still valid for an incoming /pair
 * request. Returns { ok: true } or { ok: false, reason }.
 */
export function checkPairingState(info, now = Date.now()) {
  if (!info) return { ok: false, reason: 'NO_DAEMON_INFO' };
  if (!info.pairing_code) return { ok: false, reason: 'NO_PAIRING_CODE' };
  if (info.pairing_used_at) return { ok: false, reason: 'ALREADY_USED' };
  if (info.pairing_expires_at && Date.parse(info.pairing_expires_at) < now) {
    return { ok: false, reason: 'EXPIRED' };
  }
  return { ok: true };
}

/**
 * Check whether a /register call is happening within REGISTER_GRACE_MS of
 * a successful /pair. Returns { ok: true } or { ok: false, reason }.
 */
export function checkRegisterWindow(info, now = Date.now()) {
  if (!info?.pairing_used_at) return { ok: false, reason: 'NOT_PAIRED' };
  const usedAt = Date.parse(info.pairing_used_at);
  if (now - usedAt > REGISTER_GRACE_MS) return { ok: false, reason: 'GRACE_EXPIRED' };
  return { ok: true };
}

export const _internals = {
  CODE_LENGTH,
  PAIRING_TTL_MS,
  REGISTER_GRACE_MS,
};
