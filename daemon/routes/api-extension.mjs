// yoCareer v2 — Extension pairing + token issuance routes.
//
// Two-step protocol (CSRF / impersonation defense):
//
//   1. POST /api/extension/pair      (PUBLIC — no token)
//      Body: { pairing_code: "123456" }
//      → 204  on match (marks pairing_used_at on daemon.json)
//      → 403  on bad code, expired, or already used
//
//   2. POST /api/extension/register  (auth required? NO — token doesn't exist
//      for the extension yet). Auth layer treats /pair as public; /register
//      does a separate "pairing recently completed" gate.
//      Body: { extension_id?: "<32-char chrome-extension id>" }
//      → 200 { token, port, db_path, version }   when grace window valid
//      → 403 NOT_PAIRED / GRACE_EXPIRED          otherwise
//
// Both endpoints are mounted as POST in server.mjs::buildRoutes.
//
// IMPORTANT: /register is currently behind the same auth checker as other
// routes (PUBLIC_ROUTES doesn't include it) — but the extension *has* no
// token at this point, so this would 401. Workaround: server.mjs bootstraps
// /register without going through token check by treating it as public *only
// when* daemon.pairing_used_at is recent. We implement that gate here in the
// handler instead of the auth middleware to keep auth.mjs simple — and add
// /api/extension/register to PUBLIC_ROUTES, then enforce the pairing window
// inside the handler.

import { readDaemonInfo, writeDaemonInfo } from '../lib/discovery.mjs';
import {
  comparePairingCode,
  checkPairingState,
  checkRegisterWindow,
} from '../lib/pairing.mjs';
import { setPinnedExtensionOrigin } from '../lib/cors.mjs';

export function handleExtensionPair(req, ctx) {
  const submitted = (req.parsedBody?.pairing_code || '').trim();
  const fresh = readDaemonInfo(ctx.infoFile) || ctx.info;
  const state = checkPairingState(fresh);
  if (!state.ok) {
    return { status: 403, body: { error: 'pairing_failed', reason: state.reason } };
  }
  if (!comparePairingCode(submitted, fresh.pairing_code)) {
    return { status: 403, body: { error: 'pairing_failed', reason: 'BAD_CODE' } };
  }
  // Mark code as used. Refresh from disk first so concurrent /pair attempts
  // see the same state. Persist updated info atomically.
  const updated = { ...fresh, pairing_used_at: new Date().toISOString() };
  writeDaemonInfo(updated, ctx.infoFile);
  ctx.info = updated;
  return { status: 204, body: undefined };
}

export function handleExtensionRegister(req, ctx) {
  const fresh = readDaemonInfo(ctx.infoFile) || ctx.info;
  const window = checkRegisterWindow(fresh);
  if (!window.ok) {
    return { status: 403, body: { error: 'register_failed', reason: window.reason } };
  }

  // Optional: caller can pin a specific chrome-extension origin so future
  // CORS checks reject other extensions installed in the same browser.
  const extId = (req.parsedBody?.extension_id || '').trim();
  if (extId && /^[a-z]{32}$/.test(extId)) {
    setPinnedExtensionOrigin(`chrome-extension://${extId}`);
  }

  return {
    status: 200,
    body: {
      token: ctx.token,
      port: ctx.port,
      db_path: ctx.info.db_path,
      version: ctx.version,
    },
  };
}
