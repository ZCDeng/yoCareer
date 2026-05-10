// yoCareer v2 — Extension Service Worker (MV3)
//
// Routes messages from content scripts / popup to the local daemon.
// Manages token lifecycle: pairing → register → store → refresh on 401.
//
// Daemon discovery: the daemon defaults to 127.0.0.1:8650 but falls back
// up to +9 if the port is busy (PORT_MAX_TRIES = 10 in discovery.mjs).
// We can't read ~/.yocareer/daemon.json from MV3, so we probe the range
// in parallel for a /healthz response carrying the yoCareer signature
// (version + numeric pid + db_path) and cache the winning base URL.
// The cache is invalidated on connection failure / 401, prompting a
// fresh probe on the next call.

const DAEMON_HOST = '127.0.0.1';
const DAEMON_PORT_MIN = 8650;
const DAEMON_PORT_MAX = 8659;
const DAEMON_PROBE_TIMEOUT_MS = 800;
const DAEMON_BASE_URL_KEY = 'daemon_base_url';
const TOKEN_KEY = 'yocareer_token';
const PAIRING_STATE_KEY = 'pairing_state';

// Keep-alive port to prevent SW from being killed (30s idle in MV3)
let keepAlivePort = null;

chrome.runtime.onStartup.addListener(startKeepAlive);
chrome.runtime.onInstalled.addListener(startKeepAlive);

function startKeepAlive() {
  if (keepAlivePort) return;
  keepAlivePort = chrome.runtime.connect({ name: 'keepalive' });
  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    startKeepAlive();
  });
}

// ── Message router ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = async () => {
    switch (msg.type) {
      case 'save_signal':
        return handleSaveSignal(msg.payload);
      case 'get_page_info':
        return { ok: true, url: sender.tab?.url, title: sender.tab?.title };
      case 'pair':
        return handlePair(msg.code);
      case 'check_auth':
        return { ok: true, authenticated: await hasToken() };
      case 'get_daemon_status':
        return checkDaemonStatus();
      default:
        return { ok: false, error: 'unknown_message_type' };
    }
  };
  handler().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // async response
});

// ── Daemon discovery ────────────────────────────────────────────────

async function getCachedBaseUrl() {
  const data = await chrome.storage.session.get(DAEMON_BASE_URL_KEY);
  return data[DAEMON_BASE_URL_KEY] || null;
}

async function setCachedBaseUrl(url) {
  if (url) await chrome.storage.session.set({ [DAEMON_BASE_URL_KEY]: url });
}

async function clearCachedBaseUrl() {
  await chrome.storage.session.remove(DAEMON_BASE_URL_KEY);
}

/**
 * Probe DAEMON_PORT_MIN..DAEMON_PORT_MAX in parallel for /healthz with
 * the yoCareer signature. Resolve with the first matching base URL, or
 * null if every port either rejected or failed validation.
 */
function probeDaemon() {
  const candidates = [];
  for (let p = DAEMON_PORT_MIN; p <= DAEMON_PORT_MAX; p++) candidates.push(p);

  return new Promise(resolve => {
    let pending = candidates.length;
    let settled = false;

    const finish = (url) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };

    for (const port of candidates) {
      const base = `http://${DAEMON_HOST}:${port}`;
      fetch(`${base}/healthz`, { signal: AbortSignal.timeout(DAEMON_PROBE_TIMEOUT_MS) })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          // Verify this is actually a yoCareer daemon, not some other
          // service that happens to listen on the port. Match the same
          // shape the daemon's /healthz handler returns.
          if (
            data &&
            typeof data.version === 'string' &&
            typeof data.pid === 'number' &&
            typeof data.db_path === 'string'
          ) {
            finish(base);
          }
        })
        .catch(() => { /* port closed / wrong service / timeout — ignore */ })
        .finally(() => {
          pending -= 1;
          if (pending === 0) finish(null);
        });
    }
  });
}

async function getDaemonBaseUrl({ refresh = false } = {}) {
  if (!refresh) {
    const cached = await getCachedBaseUrl();
    if (cached) return cached;
  }
  const fresh = await probeDaemon();
  if (fresh) await setCachedBaseUrl(fresh);
  return fresh;
}

// ── Daemon communication ────────────────────────────────────────────

async function daemonFetch(path, opts = {}) {
  const token = await getToken();
  const baseUrl = await getDaemonBaseUrl();
  if (!baseUrl) throw new Error('Daemon not running. Start it with: npx yocareer daemon start');

  const headers = {
    'Content-Type': 'application/json',
    'x-yo-token': token || '',
    ...(opts.headers || {}),
  };

  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
  } catch (err) {
    // Connection failure → cached URL stale (daemon moved or died).
    // Re-probe once; if a new URL appears, retry the request there.
    await clearCachedBaseUrl();
    const fresh = await getDaemonBaseUrl({ refresh: true });
    if (!fresh || fresh === baseUrl) throw err;
    res = await fetch(`${fresh}${path}`, { ...opts, headers });
  }

  if (res.status === 401) {
    // Token expired or invalid — clear and trigger re-pairing
    await chrome.storage.session.remove(TOKEN_KEY);
    throw new Error('Token expired. Please re-pair with daemon.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Daemon error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

async function handleSaveSignal(payload) {
  try {
    const result = await daemonFetch('/api/signals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok: true, signal_id: result?.id, status: result?.current_status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handlePair(code) {
  try {
    const baseUrl = await getDaemonBaseUrl();
    if (!baseUrl) return { ok: false, error: 'Daemon not running' };

    // Step 1: POST /api/extension/pair
    const pairRes = await fetch(`${baseUrl}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: String(code).trim() }),
    });
    if (!pairRes.ok) {
      const err = await pairRes.json().catch(() => ({}));
      return { ok: false, error: err.message || 'Pairing code invalid or expired' };
    }

    // Step 2: POST /api/extension/register
    const regRes = await fetch(`${baseUrl}/api/extension/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!regRes.ok) {
      const err = await regRes.json().catch(() => ({}));
      return { ok: false, error: err.message || 'Registration failed' };
    }
    const { token } = await regRes.json();
    await chrome.storage.session.set({ [TOKEN_KEY]: token });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

async function checkDaemonStatus() {
  // Force a fresh probe so the popup status reflects current state, not
  // a stale cached URL from a daemon that has since moved or died.
  await clearCachedBaseUrl();
  const baseUrl = await getDaemonBaseUrl({ refresh: true });
  if (!baseUrl) return { ok: false, error: 'Daemon not running' };
  try {
    const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: 'Daemon unhealthy' };
    const data = await res.json();
    return { ok: true, version: data.version, port: data.port };
  } catch {
    return { ok: false, error: 'Daemon not running' };
  }
}

// ── Token helpers ───────────────────────────────────────────────────

async function getToken() {
  const data = await chrome.storage.session.get(TOKEN_KEY);
  return data[TOKEN_KEY] || null;
}

async function hasToken() {
  return !!(await getToken());
}
