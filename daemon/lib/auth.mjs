// yoCareer v2 — daemon auth middleware (x-yo-token).
//
// Every mutating endpoint must carry `x-yo-token: <UUID>` matching the token
// in ~/.yocareer/daemon.json. Token check is timing-safe.
//
// Public endpoints (no auth required):
//   GET  /healthz                       — liveness probe
//   POST /api/extension/pair            — first step of pairing flow (no token issued yet)
//   POST /api/extension/register        — second step (extension has no token before this);
//                                         handler enforces pairing-window gate
//   GET  /api/events?ticket=<UUID>      — SSE consumes one-time ticket instead of token
//
// Note: /api/events itself is gated by ticket-store.mjs, not this auth layer.
// The auth layer simply allows /api/events past the token check; ticket
// validation happens in the route handler.

import { timingSafeEqual } from 'node:crypto';

const PUBLIC_ROUTES = new Set([
  'GET /healthz',
  'POST /api/extension/pair',
  'POST /api/extension/register',
  'GET /api/events',
]);

export function isPublicRoute(method, pathname) {
  return PUBLIC_ROUTES.has(`${method.toUpperCase()} ${pathname}`);
}

/**
 * Compare submitted token against daemon's canonical token. Timing-safe.
 */
export function compareTokens(submitted, canonical) {
  if (typeof submitted !== 'string' || typeof canonical !== 'string') return false;
  if (submitted.length !== canonical.length) return false;
  const a = Buffer.from(submitted, 'utf-8');
  const b = Buffer.from(canonical, 'utf-8');
  return timingSafeEqual(a, b);
}

/**
 * Build an auth checker bound to the daemon's current token.
 *
 * Returns a function `(req, parsedUrl) → {ok: true}` or
 * `{ok: false, status: 401|403, message}`. The caller (server.mjs) uses the
 * result to either call the route handler or send the error response.
 */
export function makeAuthChecker(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Auth requires a non-empty token');
  }
  return function checkAuth(req, parsedUrl) {
    const method = (req.method || 'GET').toUpperCase();
    if (isPublicRoute(method, parsedUrl.pathname)) return { ok: true };

    const submitted = req.headers['x-yo-token'];
    if (!submitted) {
      return { ok: false, status: 401, message: 'Missing x-yo-token header' };
    }
    if (!compareTokens(submitted, token)) {
      return { ok: false, status: 403, message: 'Invalid x-yo-token' };
    }
    return { ok: true };
  };
}

export const _internals = { PUBLIC_ROUTES };
