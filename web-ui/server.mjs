#!/usr/bin/env node

/**
 * yoCareer web-ui — read-only localhost dashboard
 *
 * Bind: 127.0.0.1 only (never 0.0.0.0). No mutations. Reads from:
 *   - data/applications.md      → tracker rows + metrics
 *   - data/pipeline.md          → inbox URLs
 *   - data/signals.ndjson       → newest unevaluated signals (best-effort)
 *   - reports/{n}-{slug}-{date}.md  → evaluation reports
 *   - output/*.pdf              → generated CV PDFs (file listing only)
 *
 * Coexists with the Go TUI dashboard (`dashboard/`) — same data sources, but
 * accessible from the browser for non-CLI users. Run with:
 *
 *   npm run ui            # default :5173, opens browser
 *   npm run ui -- --port=4000 --no-open
 */

import { createServer } from 'http';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, dirname, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STATIC_DIR = __dirname;

const args = process.argv.slice(2);
const port = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] || 5173);
const skipOpen = args.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
};

// === Markdown table parser (for data/applications.md) ===
//
// Tracker schema per AGENTS.md:
// | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
function parseApplications(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
    if (cells.length < 9) continue;
    const [num, date, company, role, score, status, pdf, report, ...notesCells] = cells;
    if (num === '#' || num === '') continue;
    rows.push({
      num,
      date,
      company,
      role,
      score,
      status: status.replace(/\*+/g, ''),
      pdf,
      report,
      notes: notesCells.join('|').trim(),
    });
  }
  return rows;
}

function computeMetrics(apps) {
  const m = {
    total: apps.length,
    by_status: {},
    avg_score: 0,
    interviews: 0,
    offers: 0,
    rejected: 0,
  };
  let scoreSum = 0;
  let scoreCount = 0;
  for (const a of apps) {
    m.by_status[a.status] = (m.by_status[a.status] || 0) + 1;
    if (a.status === 'Interview') m.interviews++;
    if (a.status === 'Offer') m.offers++;
    if (a.status === 'Rejected') m.rejected++;
    const sc = Number(String(a.score).split('/')[0]);
    if (Number.isFinite(sc)) {
      scoreSum += sc;
      scoreCount++;
    }
  }
  m.avg_score = scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(2)) : 0;
  return m;
}

// === Path safety ===
//
// Resolve `relPath` under `baseAbs`. Returns null if it escapes the base via
// path traversal, symlinks, or absolute-path injection.
async function safeResolve(baseAbs, relPath) {
  if (!relPath) return null;
  const decoded = decodeURIComponent(relPath);
  if (decoded.includes('\0')) return null;
  const joined = normalize(join(baseAbs, decoded));
  // Guard: ensure resolved path stays under baseAbs.
  if (joined !== baseAbs && !joined.startsWith(baseAbs + sep)) return null;
  if (!existsSync(joined)) return null;
  try {
    const s = await stat(joined);
    if (!s.isFile()) return null;
  } catch {
    return null;
  }
  return joined;
}

function send(res, status, body, headers = {}) {
  const finalHeaders = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
  res.writeHead(status, finalHeaders);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readMaybe(path) {
  if (!existsSync(path)) return '';
  return readFile(path, 'utf-8');
}

async function handleApi(_req, res, urlPath) {
  if (urlPath === '/api/applications') {
    const md = await readMaybe(join(ROOT, 'data/applications.md'));
    const apps = parseApplications(md);
    return sendJson(res, 200, { apps, count: apps.length });
  }

  if (urlPath === '/api/metrics') {
    const md = await readMaybe(join(ROOT, 'data/applications.md'));
    return sendJson(res, 200, computeMetrics(parseApplications(md)));
  }

  if (urlPath === '/api/pipeline') {
    const md = await readMaybe(join(ROOT, 'data/pipeline.md'));
    return sendJson(res, 200, { content: md });
  }

  if (urlPath === '/api/reports') {
    const reportsDir = join(ROOT, 'reports');
    if (!existsSync(reportsDir)) return sendJson(res, 200, { reports: [] });
    const files = (await readdir(reportsDir))
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))
      .sort()
      .reverse();
    return sendJson(res, 200, { reports: files });
  }

  // GET /api/reports/{filename}
  if (urlPath.startsWith('/api/reports/')) {
    const rel = urlPath.slice('/api/reports/'.length);
    const baseAbs = join(ROOT, 'reports');
    if (!existsSync(baseAbs)) return sendJson(res, 404, { error: 'reports_dir_missing' });
    const safe = await safeResolve(baseAbs, rel);
    if (!safe || !safe.endsWith('.md')) return sendJson(res, 404, { error: 'not_found' });
    const content = await readFile(safe, 'utf-8');
    return sendJson(res, 200, { filename: rel, content });
  }

  if (urlPath === '/api/output') {
    const outDir = join(ROOT, 'output');
    if (!existsSync(outDir)) return sendJson(res, 200, { files: [] });
    const files = (await readdir(outDir))
      .filter(f => f.endsWith('.pdf'))
      .sort()
      .reverse();
    return sendJson(res, 200, { files });
  }

  // GET /api/output/{filename} — stream the PDF inline
  if (urlPath.startsWith('/api/output/')) {
    const rel = urlPath.slice('/api/output/'.length);
    const baseAbs = join(ROOT, 'output');
    const safe = await safeResolve(baseAbs, rel);
    if (!safe || !safe.endsWith('.pdf')) {
      return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    }
    const buf = await readFile(safe);
    return send(res, 200, buf, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rel}"`,
    });
  }

  return sendJson(res, 404, { error: 'unknown_endpoint' });
}

async function handleStatic(_req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const safe = await safeResolve(STATIC_DIR, rel);
  if (!safe) return send(res, 404, 'not found');
  const ext = '.' + safe.split('.').pop();
  const buf = await readFile(safe);
  return send(res, 200, buf, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = (req.url || '/').split('?')[0];
    if (req.method !== 'GET') return send(res, 405, 'method not allowed');
    if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath);
    return handleStatic(req, res, urlPath);
  } catch (err) {
    console.error('[web-ui]', err);
    return send(res, 500, 'internal error');
  }
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`yoCareer web-ui → ${url}`);
  console.log('Read-only. Bound to localhost (127.0.0.1) only.');
  console.log('Press Ctrl+C to stop.');

  if (!skipOpen && process.env.CI !== 'true') {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start ""'
      : 'xdg-open';
    exec(`${opener} ${url}`, () => {});
  }
});
