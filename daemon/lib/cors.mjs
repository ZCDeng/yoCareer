// yoCareer v2 — CORS allowlist for the daemon.
//
// Origin policy:
//   - chrome-extension://* (wildcard) — until the extension completes /pair,
//     we accept any chrome-extension:// origin so the pairing flow can
//     bootstrap. After /pair succeeds, the daemon pins to the registered
//     extension ID (set via `setPinnedExtensionOrigin`).
//   - http://127.0.0.1:<daemon-port> — for the SPA served by daemon itself
//     (loopback to itself).
//   - http://localhost:<daemon-port> — same, alternate hostname.
//   - File:// origins (sometimes Electron, headless tests) are forbidden.
//
// Anything else is rejected. Public web pages on http://malicious.com cannot
// fetch daemon endpoints regardless of CORS, because they have no token.
// CORS exists primarily to defend against same-browser malicious extensions
// + wayward scripts.

let pinnedExtensionOrigin = null;

export function setPinnedExtensionOrigin(origin) {
  if (origin && /^chrome-extension:\/\/[a-z]{32}$/.test(origin)) {
    pinnedExtensionOrigin = origin;
  }
}

export function getPinnedExtensionOrigin() {
  return pinnedExtensionOrigin;
}

/**
 * Decide whether to allow a given Origin header value.
 *
 * @param {string|undefined} origin   value from the Origin request header
 * @param {number} daemonPort         port the daemon is listening on
 * @returns {boolean}                 true = allow, false = reject
 */
export function isOriginAllowed(origin, daemonPort) {
  if (!origin) return false;
  if (origin === `http://127.0.0.1:${daemonPort}`) return true;
  if (origin === `http://localhost:${daemonPort}`) return true;
  if (origin.startsWith('chrome-extension://')) {
    if (pinnedExtensionOrigin) return origin === pinnedExtensionOrigin;
    return true;        // pre-pair: accept any chrome-extension:// origin
  }
  return false;
}

/**
 * Apply CORS headers + handle OPTIONS preflight.
 *
 * Returns true iff the request was a preflight that has been fully handled
 * (caller should not run route logic). Returns false to mean "headers set,
 * continue handling". The function never throws.
 */
export function applyCors(req, res, daemonPort) {
  const origin = req.headers.origin;

  if (isOriginAllowed(origin, daemonPort)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'content-type, x-yo-token, if-match, last-event-id, accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    if (!isOriginAllowed(origin, daemonPort)) {
      res.statusCode = 403;
      res.end('CORS: origin not allowed');
      return true;
    }
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}

// Test hook: reset state between tests (otherwise pinned origin leaks).
export function _resetForTesting() {
  pinnedExtensionOrigin = null;
}
