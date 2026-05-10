// yoCareer v2 Web UI — SPA shell
//
// Vanilla JS, no framework. Responsibilities:
//   1. Daemon discovery (read ~/.yocareer/daemon.json or fallback)
//   2. Token-based auth
//   3. SSE connection for real-time updates
//   4. Module routing (profile / portals / signals / applications / evaluations)
//   5. Cmd+K command palette integration

import { createSseClient } from './sse-client.js';

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 8650;
let token = '';
let baseUrl = '';

// ── DOM refs ────────────────────────────────────────────────────────

const mainContent = document.getElementById('main-content');
const daemonStatus = document.getElementById('daemon-status');
const navItems = document.querySelectorAll('.nav-item');

// ── API helper ──────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Accept': 'application/json',
      'x-yo-token': token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => null);
}

// ── Daemon discovery ────────────────────────────────────────────────

async function discoverDaemon() {
  try {
    const res = await fetch('/daemon.json');
    if (res.ok) {
      const info = await res.json();
      baseUrl = `http://127.0.0.1:${info.port}`;
      token = info.token;
      return true;
    }
  } catch {}

  // Fallback: try default port
  try {
    const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/healthz`);
    if (res.ok) {
      baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
      return true;
    }
  } catch {}

  return false;
}

// ── Module renderers ────────────────────────────────────────────────

function renderProfile(data) {
  return `
    <div class="module-card">
      <h2>Profile</h2>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    </div>
  `;
}

function renderPortals(data) {
  const list = (data.portals || []).map(p => `
    <div class="list-item">
      <span class="item-name">${p.name}</span>
      <span class="item-meta">${p.kind} · ${p.enabled !== false ? 'enabled' : 'disabled'}</span>
    </div>
  `).join('');
  return `
    <div class="module-card">
      <h2>Portals (${data.portals?.length || 0})</h2>
      <div class="list">${list || '<p class="empty">No portals configured.</p>'}</div>
    </div>
  `;
}

function renderSignals(data) {
  const list = (data.signals || []).map(s => `
    <div class="list-item">
      <span class="item-name">${s.company_name || '?'}</span>
      <span class="item-meta">${s.role || '?'} · ${s.current_status}</span>
    </div>
  `).join('');
  return `
    <div class="module-card">
      <h2>Signals (${data.signals?.length || 0})</h2>
      <div class="list">${list || '<p class="empty">No signals yet. Press ⌘K to scan.</p>'}</div>
    </div>
  `;
}

function renderApplications(data) {
  const list = (data.applications || []).map(a => `
    <div class="list-item">
      <span class="item-name">${a.company_name || '?'}</span>
      <span class="item-meta">${a.role || '?'} · ${a.current_status}</span>
    </div>
  `).join('');
  return `
    <div class="module-card">
      <h2>Applications (${data.applications?.length || 0})</h2>
      <div class="list">${list || '<p class="empty">No applications yet.</p>'}</div>
    </div>
  `;
}

function renderEvaluations(data) {
  const list = (data.evaluations || []).map(e => `
    <div class="list-item">
      <span class="item-name">${e.signal_id?.slice(0, 8) || '?'}</span>
      <span class="item-meta">${e.current_status} · score ${e.score || '?'}</span>
    </div>
  `).join('');
  return `
    <div class="module-card">
      <h2>Evaluations (${data.evaluations?.length || 0})</h2>
      <div class="list">${list || '<p class="empty">No evaluations yet.</p>'}</div>
    </div>
  `;
}

const MODULES = {
  profile: { label: 'Profile', path: '/api/profile', render: renderProfile },
  portals: { label: 'Portals', path: '/api/portals', render: renderPortals },
  signals: { label: 'Signals', path: '/api/signals', render: renderSignals },
  applications: { label: 'Applications', path: '/api/applications', render: renderApplications },
  evaluations: { label: 'Evaluations', path: '/api/evaluations', render: renderEvaluations },
};

let currentModule = 'profile';

async function loadModule(name) {
  const mod = MODULES[name];
  if (!mod) return;
  currentModule = name;

  const hero = document.getElementById('hero');
  if (hero) hero.style.display = 'none';

  navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === name);
  });

  mainContent.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await api('GET', mod.path);
    mainContent.innerHTML = mod.render(data);
  } catch (err) {
    mainContent.innerHTML = `
      <div class="error-card">
        <p>Failed to load ${mod.label}</p>
        <code>${err.message}</code>
      </div>
    `;
  }
}

// ── Cmd+K commands ──────────────────────────────────────────────────

function registerCmdK() {
  const cmds = [
    { label: 'Scan signals', keywords: 'scan search find jobs', action: () => alert('Scan triggered (placeholder)') },
    { label: 'View profile', keywords: 'profile cv resume', action: () => loadModule('profile') },
    { label: 'View portals', keywords: 'portals sources companies', action: () => loadModule('portals') },
    { label: 'View signals', keywords: 'signals jobs postings', action: () => loadModule('signals') },
    { label: 'View applications', keywords: 'applications tracker applied', action: () => loadModule('applications') },
    { label: 'View evaluations', keywords: 'evaluations reports scores', action: () => loadModule('evaluations') },
    { label: 'Run scan', keywords: 'scan refresh update', action: () => alert('Scan triggered (placeholder)') },
  ];

  window.CmdK.register(cmds);
}

// ── Event listeners ─────────────────────────────────────────────────

navItems.forEach(btn => {
  btn.addEventListener('click', () => loadModule(btn.dataset.module));
});

document.getElementById('btn-cmdk').addEventListener('click', () => {
  window.CmdK.open((item) => item.action?.());
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    window.CmdK.open((item) => item.action?.());
  }
});

// ── SSE ─────────────────────────────────────────────────────────────

function startSse() {
  if (!token) return;
  createSseClient(token, (event, data) => {
    if (event === '_connected') {
      daemonStatus.textContent = '● Live';
      daemonStatus.classList.add('live');
      return;
    }
    if (event === 'task.progress') {
      // Show toast or inline progress
      console.log('Task progress:', data);
      return;
    }
    if (event.startsWith('signal.') || event.startsWith('application.')) {
      // Auto-refresh current module if relevant
      loadModule(currentModule);
    }
  }, (code, msg) => {
    console.warn('SSE error:', code, msg);
    daemonStatus.textContent = '● Reconnecting...';
    daemonStatus.classList.remove('live');
  });
}

// ── Init ────────────────────────────────────────────────────────────

async function init() {
  const ok = await discoverDaemon();
  if (!ok) {
    daemonStatus.textContent = '● Daemon offline';
    daemonStatus.classList.add('error');
    mainContent.innerHTML = `
      <div class="error-card">
        <h2>Daemon not running</h2>
        <p>Start the daemon with:</p>
        <code>npx yocareer daemon start</code>
      </div>
    `;
    return;
  }

  daemonStatus.textContent = '● Connected';
  daemonStatus.classList.add('live');

  // Load Cmd+K after Fuse.js is ready
  await new Promise(r => {
    if (window.Fuse) return r();
    const s = document.createElement('script');
    s.src = 'cmdk.js';
    s.onload = r;
    document.head.appendChild(s);
  });
  registerCmdK();

  // Hero is shown by default; user clicks nav to load a module
  startSse();
}

init().catch(err => {
  console.error('UI init failed:', err);
  mainContent.innerHTML = `<div class="error-card"><p>Init error: ${err.message}</p></div>`;
});
