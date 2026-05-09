// yoCareer v2 — Extension Service Worker (MV3)
//
// Routes messages from content scripts / popup to the local daemon.
// Manages token lifecycle: pairing → register → store → refresh on 401.

const DAEMON_BASE_URL = 'http://127.0.0.1:8650';
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

// ── Daemon communication ────────────────────────────────────────────

async function daemonFetch(path, opts = {}) {
  const token = await getToken();
  const url = `${DAEMON_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-yo-token': token || '',
      ...(opts.headers || {}),
    },
  });
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
    // Step 1: POST /api/extension/pair
    const pairRes = await fetch(`${DAEMON_BASE_URL}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: String(code).trim() }),
    });
    if (!pairRes.ok) {
      const err = await pairRes.json().catch(() => ({}));
      return { ok: false, error: err.message || 'Pairing code invalid or expired' };
    }

    // Step 2: POST /api/extension/register
    const regRes = await fetch(`${DAEMON_BASE_URL}/api/extension/register`, {
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
  try {
    const res = await fetch(`${DAEMON_BASE_URL}/healthz`, { signal: AbortSignal.timeout(2000) });
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
