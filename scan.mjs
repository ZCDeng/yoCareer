#!/usr/bin/env node

/**
 * scan.mjs — Recruitment signal scanner
 *
 * Provider-based scanner for official job sources. Existing Greenhouse,
 * Ashby, and Lever API behavior is preserved as the ats_api provider.
 * China-market company career pages are handled conservatively via
 * public-page Playwright extraction.
 *
 * Usage:
 *   node scan.mjs
 *   node scan.mjs --dry-run
 *   node scan.mjs --company Tencent
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { spawn } from 'child_process';
import yaml from 'js-yaml';

const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const SIGNAL_REVIEW_PATH = 'data/signal-review.md';

mkdirSync('data', { recursive: true });

const API_CONCURRENCY = 10;
const COMPANY_PAGE_CONCURRENCY = 2;
const FETCH_TIMEOUT_MS = 10_000;
const PAGE_TIMEOUT_MS = 20_000;
const POST_LOAD_WAIT_MS = 2_000;
const REACH_READ_URL_CMD = resolveBridgeCommand(
  process.env.YOCAREER_REACH_READ_URL_CMD || '',
  './bridges/reach-read-url.mjs',
);
const REACH_SIGNAL_SEARCH_CMD = resolveBridgeCommand(
  process.env.YOCAREER_REACH_SIGNAL_SEARCH_CMD || '',
  './bridges/reach-signal-search.mjs',
);

const SIGNAL_THRESHOLDS = {
  official_job: 0.7,
  recruiter_post: 0.82,
  referral_signal: 0.82,
  community_post: 1,
};

const REVIEW_ONLY_KINDS = new Set(['community_post']);

const JOB_LINK_HINTS = [
  'job',
  'jobs',
  'career',
  'careers',
  'position',
  'positions',
  'recruit',
  'recruitment',
  'opening',
  'join',
  'hire',
  'talent',
  '岗位',
  '职位',
  '招聘',
  '社招',
  '校招',
  '加入我们',
  '人才',
];

function resolveBridgeCommand(explicitCommand, defaultScriptPath) {
  const command = String(explicitCommand || '').trim();
  if (command) return command;
  return existsSync(defaultScriptPath) ? defaultScriptPath : '';
}

// ── Provider resolution ─────────────────────────────────────────────

function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  return null;
}

function resolveProvider(company) {
  if (company.provider) return company.provider;
  if (detectApi(company)) return 'ats_api';
  if (company.careers_url) return 'company_page';
  return 'manual_only';
}

// ── ATS API parsers ─────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }));
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

// ── Fetch / browser helpers ─────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function withBrowser(fn) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runBridgeCommand(command, args) {
  return new Promise((resolve, reject) => {
    const positional = args.map((_, idx) => `"$${idx + 1}"`).join(' ');
    const child = spawn('sh', ['-lc', `${command} ${positional}`, 'yocareer-bridge', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `command exited with ${code}`));
    });
  });
}

function runCommandWithUrl(command, url) {
  return runBridgeCommand(command, [url]);
}

// ── Signal model ────────────────────────────────────────────────────

function normalizeSignal(input) {
  const title = (input.title || input.role || '').trim();
  const role = (input.role || title).trim();
  const confidence = Number(input.confidence);
  return {
    kind: input.kind || 'official_job',
    company: (input.company || '').trim(),
    role,
    title,
    url: (input.url || '').trim(),
    source_platform: input.source_platform || input.provider || 'unknown',
    source_author: input.source_author || '',
    location: input.location || '',
    salary: input.salary || '',
    contact_hint: input.contact_hint || '',
    posted_at: input.posted_at || '',
    freshness: input.freshness || 'unknown',
    confidence: Number.isFinite(confidence) ? confidence : 0.7,
    evidence_text: input.evidence_text || title,
    recommended_action: input.recommended_action || 'apply_on_official_site',
    source: input.source || input.source_platform || input.provider || 'unknown',
    scoring_notes: input.scoring_notes || [],
  };
}

function jobToSignal(job, source) {
  return normalizeSignal({
    kind: 'official_job',
    company: job.company,
    role: job.title,
    title: job.title,
    url: job.url,
    source_platform: source,
    location: job.location || '',
    confidence: 0.9,
    evidence_text: job.title,
    source,
  });
}

function inferTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    return decodeURIComponent(tail).replace(/[-_]+/g, ' ').trim();
  } catch {
    return '';
  }
}

function signalsFromReachOutput(output, company) {
  const trimmed = output.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : parsed.signals || parsed.jobs || parsed.links || [];
    if (Array.isArray(rows)) {
      return rows.map(row => normalizeSignal({
        ...row,
        company: row.company || company.name,
        source_platform: row.source_platform || 'reach_read_url',
        confidence: row.confidence ?? 0.74,
        source: row.source || 'reach-read-url',
      }));
    }
  }

  const unique = new Map();
  for (const match of trimmed.matchAll(/https?:\/\/[^\s"'<>）)]+/g)) {
    const url = match[0];
    const title = inferTitleFromUrl(url);
    if (!hasJobLinkHint(title, url)) continue;
    unique.set(url, normalizeSignal({
      kind: 'official_job',
      company: company.name,
      role: title,
      title,
      url,
      source_platform: 'reach_read_url',
      confidence: 0.74,
      evidence_text: title,
      source: 'reach-read-url',
    }));
  }

  return Array.from(unique.values());
}

function signalsFromBridgeOutput(output, defaults) {
  const trimmed = output.trim();
  if (!trimmed) return { signals: [], errors: [] };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : parsed.signals || parsed.results || parsed.posts || [];
    return {
      signals: rows.map(row => normalizeSignal({
        ...row,
        kind: row.kind || defaults.kind || 'community_post',
        source_platform: row.source_platform || defaults.source_platform,
        confidence: row.confidence ?? defaults.confidence ?? 0.66,
        recommended_action: row.recommended_action || defaults.recommended_action || 'save_for_manual_review',
        source: row.source || defaults.source,
      })),
      errors: [],
    };
  }

  const signals = [];
  const errors = [];
  for (const [idx, line] of trimmed.split('\n').entries()) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    try {
      const row = JSON.parse(clean);
      signals.push(normalizeSignal({
        ...row,
        kind: row.kind || defaults.kind || 'community_post',
        source_platform: row.source_platform || defaults.source_platform,
        confidence: row.confidence ?? defaults.confidence ?? 0.66,
        recommended_action: row.recommended_action || defaults.recommended_action || 'save_for_manual_review',
        source: row.source || defaults.source,
      }));
    } catch (err) {
      errors.push({
        company: defaults.name,
        provider: defaults.provider,
        error: `bridge output line ${idx + 1}: ${err.message}`,
      });
    }
  }

  return { signals, errors };
}

// ── Title filtering ─────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = String(title || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

function hasJobLinkHint(text, url) {
  const haystack = `${text || ''} ${url || ''}`.toLowerCase();
  return JOB_LINK_HINTS.some(hint => haystack.includes(hint.toLowerCase()));
}

function signalThreshold(signal) {
  return SIGNAL_THRESHOLDS[signal.kind] ?? 0.8;
}

function classifySignalRoute(signal) {
  if (REVIEW_ONLY_KINDS.has(signal.kind)) {
    return { route: 'review', reason: `${signal.kind}_requires_manual_review` };
  }

  if (signal.recommended_action === 'save_for_manual_review') {
    return { route: 'review', reason: 'manual_review_requested' };
  }

  const threshold = signalThreshold(signal);
  if (signal.confidence < threshold) {
    return { route: 'review', reason: `confidence_below_${threshold}` };
  }

  return { route: 'pipeline', reason: 'meets_threshold' };
}

function evidenceForReview(signal) {
  const evidence = `${signal.title} ${signal.evidence_text} ${signal.source_author}`.toLowerCase();
  const notes = [];
  if (/(外包|驻场|派遣|外派|人力外包|od\b)/i.test(evidence)) notes.push('possible_outsourcing');
  if (/(急招|高薪诚聘|日结|兼职|课程顾问|保险|招商)/i.test(evidence)) notes.push('possible_spam_or_low_fit');
  if (!signal.url && signal.kind !== 'official_job') notes.push('missing_source_url');
  if (!signal.company || normalizeKey(signal.company) === 'unknown') notes.push('unknown_company');
  if (signal.kind !== 'official_job' && (!signal.evidence_text || signal.evidence_text.length < 20)) {
    notes.push('thin_evidence');
  }
  return notes;
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = normalizeKey(match[1]);
      const role = normalizeKey(match[2]);
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dedupAndFilterSignals(signals, context) {
  const accepted = [];
  const held = [];
  let filtered = 0;
  let duplicates = 0;
  let lowConfidence = 0;

  for (const signal of signals.map(normalizeSignal)) {
    if (!signal.title || !signal.company) {
      filtered++;
      continue;
    }
    if (!context.titleFilter(signal.title)) {
      filtered++;
      continue;
    }
    if (context.filterCompany && !signal.company.toLowerCase().includes(context.filterCompany)) {
      filtered++;
      continue;
    }
    const reviewNotes = evidenceForReview(signal);
    const route = classifySignalRoute(signal);
    if (route.route === 'review' || reviewNotes.length > 0) {
      lowConfidence++;
      held.push({
        ...signal,
        hold_reason: route.route === 'review' ? route.reason : 'risk_notes',
        scoring_notes: [...(signal.scoring_notes || []), ...reviewNotes],
      });
      continue;
    }
    if (signal.url && context.seenUrls.has(signal.url)) {
      duplicates++;
      continue;
    }

    const key = `${normalizeKey(signal.company)}::${normalizeKey(signal.role || signal.title)}`;
    if (context.seenCompanyRoles.has(key)) {
      duplicates++;
      continue;
    }

    if (signal.url) context.seenUrls.add(signal.url);
    context.seenCompanyRoles.add(key);
    accepted.push(signal);
  }

  return { accepted, held, filtered, duplicates, lowConfidence };
}

// ── Providers ───────────────────────────────────────────────────────

async function scanAtsApi(company) {
  const api = detectApi(company);
  if (!api) {
    return {
      provider: 'ats_api',
      signals: [],
      skipped: [{ company: company.name, reason: 'no_api_detected' }],
      errors: [],
      found: 0,
    };
  }

  const json = await fetchJson(api.url);
  const jobs = PARSERS[api.type](json, company.name);
  return {
    provider: 'ats_api',
    signals: jobs.map(job => jobToSignal(job, `${api.type}-api`)),
    skipped: [],
    errors: [],
    found: jobs.length,
  };
}

async function scanCompanyPage(company, browser) {
  if (!company.careers_url) {
    return {
      provider: 'company_page',
      signals: [],
      skipped: [{ company: company.name, reason: 'missing_careers_url' }],
      errors: [],
      found: 0,
    };
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    await page.goto(company.careers_url, {
      waitUntil: 'commit',
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
    await sleep(POST_LOAD_WAIT_MS);

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: (a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').trim(),
        href: a.href,
      }));
    });

    const unique = new Map();
    for (const link of links) {
      const text = link.text.replace(/\s+/g, ' ').trim();
      const href = link.href;
      if (!href) continue;
      let parsedHref;
      try {
        parsedHref = new URL(href);
      } catch {
        continue;
      }
      if (!['http:', 'https:'].includes(parsedHref.protocol)) continue;
      if (text.length < 2 || text.length > 120) continue;
      if (!hasJobLinkHint(text, href)) continue;
      if (!unique.has(href)) unique.set(href, { text, href });
    }

    const signals = Array.from(unique.values()).map(link => normalizeSignal({
      kind: 'official_job',
      company: company.name,
      role: link.text,
      title: link.text,
      url: link.href,
      source_platform: 'company_page',
      confidence: 0.72,
      evidence_text: link.text,
      source: 'company-page',
    }));

    if (signals.length === 0 && REACH_READ_URL_CMD && company.reach_fallback !== false) {
      return await scanReachReadUrl(company);
    }

    return {
      provider: 'company_page',
      signals,
      skipped: [],
      errors: [],
      found: signals.length,
    };
  } finally {
    await page.close();
  }
}

async function scanReachReadUrl(company) {
  if (!company.careers_url && !company.url) {
    return {
      provider: 'reach_read_url',
      signals: [],
      skipped: [{ company: company.name, reason: 'missing_url' }],
      errors: [],
      found: 0,
    };
  }

  if (!REACH_READ_URL_CMD) {
    return {
      provider: 'reach_read_url',
      signals: [],
      skipped: [{ company: company.name, reason: 'reach_bridge_unavailable' }],
      errors: [],
      found: 0,
    };
  }

  const output = await runCommandWithUrl(REACH_READ_URL_CMD, company.careers_url || company.url);
  const signals = signalsFromReachOutput(output, company);
  return {
    provider: 'reach_read_url',
    signals,
    skipped: [],
    errors: [],
    found: signals.length,
  };
}

async function scanReachSignalSearch(source) {
  if (!source.query) {
    return {
      provider: 'reach_signal_search',
      signals: [],
      skipped: [{ company: source.name, reason: 'missing_query' }],
      errors: [],
      found: 0,
    };
  }

  if (!REACH_SIGNAL_SEARCH_CMD) {
    return {
      provider: 'reach_signal_search',
      signals: [],
      skipped: [{ company: source.name, reason: 'reach_signal_search_bridge_unavailable' }],
      errors: [],
      found: 0,
    };
  }

  const platform = source.platform || source.source_platform || 'web';
  const output = await runBridgeCommand(REACH_SIGNAL_SEARCH_CMD, [platform, source.query]);
  const parsed = signalsFromBridgeOutput(output, {
    name: source.name,
    provider: 'reach_signal_search',
    kind: source.kind || 'community_post',
    source_platform: platform,
    confidence: source.default_confidence ?? 0.66,
    recommended_action: source.default_action || 'save_for_manual_review',
    source: source.name,
  });

  return {
    provider: 'reach_signal_search',
    signals: parsed.signals,
    skipped: [],
    errors: parsed.errors,
    found: parsed.signals.length,
  };
}

async function scanManualOnly(company) {
  return {
    provider: 'manual_only',
    signals: [],
    skipped: [{ company: company.name, reason: company.reason || 'manual_import_only' }],
    errors: [],
    found: 0,
  };
}

function parseManualSignalContent(text, source) {
  const trimmed = text.trim();
  if (!trimmed) return { signals: [], errors: [] };

  if (trimmed.startsWith('[')) {
    const rows = JSON.parse(trimmed);
    if (!Array.isArray(rows)) throw new Error('JSON import must be an array or NDJSON');
    return {
      signals: rows.map(row => normalizeSignal({
        ...row,
        source_platform: row.source_platform || source.source_platform || source.name,
        source: row.source || source.name,
      })),
      errors: [],
    };
  }

  const signals = [];
  const errors = [];
  const lines = text.split('\n');
  for (const [idx, line] of lines.entries()) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    try {
      const row = JSON.parse(clean);
      signals.push(normalizeSignal({
        ...row,
        source_platform: row.source_platform || source.source_platform || source.name,
        source: row.source || source.name,
      }));
    } catch (err) {
      errors.push({
        company: source.name,
        provider: 'manual_signal_import',
        error: `${source.path}:${idx + 1}: ${err.message}`,
      });
    }
  }

  return { signals, errors };
}

async function scanManualSignalImport(source) {
  const path = source.path || 'data/signals.ndjson';
  if (!existsSync(path)) {
    return {
      provider: 'manual_signal_import',
      signals: [],
      skipped: [{ company: source.name, reason: `missing_import_file:${path}` }],
      errors: [],
      found: 0,
    };
  }

  const parsed = parseManualSignalContent(readFileSync(path, 'utf-8'), { ...source, path });
  return {
    provider: 'manual_signal_import',
    signals: parsed.signals,
    skipped: [],
    errors: parsed.errors,
    found: parsed.signals.length,
  };
}

async function scanCompany(company, context) {
  const provider = resolveProvider(company);
  try {
    if (provider === 'ats_api') return await scanAtsApi(company, context);
    if (provider === 'company_page') return await scanCompanyPage(company, context.browser);
    if (provider === 'reach_read_url') return await scanReachReadUrl(company);
    if (provider === 'reach_signal_search') return await scanReachSignalSearch(company);
    if (provider === 'manual_only') return await scanManualOnly(company);
    if (provider === 'manual_signal_import') return await scanManualSignalImport(company);
    return {
      provider,
      signals: [],
      skipped: [{ company: company.name, reason: `unsupported_provider:${provider}` }],
      errors: [],
      found: 0,
    };
  } catch (err) {
    return {
      provider,
      signals: [],
      skipped: [],
      errors: [{ company: company.name, provider, error: err.message }],
      found: 0,
    };
  }
}

// ── Writers ────────────────────────────────────────────────────────

function ensurePipelineText() {
  if (existsSync(PIPELINE_PATH)) return readFileSync(PIPELINE_PATH, 'utf-8');
  return '# Pipeline\n\n## Pendientes\n\n## Procesadas\n';
}

function appendToPipeline(signals) {
  if (signals.length === 0) return;

  let text = ensurePipelineText();
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  const lines = signals.map(s => `- [ ] ${s.url} | ${s.company} | ${s.title}`);

  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n${lines.join('\n')}\n\n`;
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = `\n${lines.join('\n')}\n`;
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(signals, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = signals.map(s =>
    `${s.url}\t${date}\t${s.source_platform}\t${s.title}\t${s.company}\tadded`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

function escapeReviewText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function appendToSignalReview(signals, date) {
  if (signals.length === 0) return;

  const header = existsSync(SIGNAL_REVIEW_PATH)
    ? ''
    : '# Signal Review\n\nLow-confidence or explicitly review-only recruitment signals.\n';
  const blocks = signals.map(s => [
    '',
    `## ${escapeReviewText(s.company)} | ${escapeReviewText(s.title)}`,
    '',
    `- Date: ${date}`,
    `- Source: ${escapeReviewText(s.source_platform)}`,
    `- URL: ${s.url || 'N/A'}`,
    `- Confidence: ${s.confidence}`,
    `- Reason: ${s.hold_reason || 'manual_review'}`,
    `- Scoring notes: ${(s.scoring_notes || []).join(', ') || 'N/A'}`,
    `- Recommended action: ${s.recommended_action}`,
    `- Evidence: ${escapeReviewText(s.evidence_text) || 'N/A'}`,
  ].join('\n')).join('\n');

  appendFileSync(SIGNAL_REVIEW_PATH, `${header}${blocks}\n`, 'utf-8');
}

// ── Parallel execution ─────────────────────────────────────────────

async function parallelMap(items, limit, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      results.push(await fn(item));
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function splitByProvider(companies) {
  const groups = new Map();
  for (const company of companies) {
    const provider = resolveProvider(company);
    if (!groups.has(provider)) groups.set(provider, []);
    groups.get(provider).push(company);
  }
  return groups;
}

function normalizeSearchQueries(searchQueries) {
  return (searchQueries || [])
    .filter(query => query?.enabled !== false)
    .filter(query => String(query?.query || '').trim() !== '')
    .map((query, idx) => ({
      name: query.name || `search-query-${idx + 1}`,
      provider: 'reach_signal_search',
      platform: query.platform || 'web',
      query: String(query.query || '').trim(),
      kind: query.kind || 'official_job',
      default_confidence: Number.isFinite(Number(query.default_confidence))
        ? Number(query.default_confidence)
        : 0.74,
      default_action: query.default_action || 'apply_on_official_site',
      notes: query.notes || 'source:search_queries',
    }));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = (config.tracked_companies || [])
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany));
  const restrictedPlatforms = (config.restricted_platforms || [])
    .filter(p => p.enabled !== false)
    .filter(p => !filterCompany || p.name.toLowerCase().includes(filterCompany))
    .map(p => ({ name: p.name, provider: 'manual_only', reason: p.reason }));
  const signalImports = (config.signal_imports || [])
    .filter(s => s.enabled !== false);
  const signalSearches = (config.signal_searches || [])
    .filter(s => s.enabled !== false);
  const searchQueries = normalizeSearchQueries(config.search_queries);

  const titleFilter = buildTitleFilter(config.title_filter);
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();
  const date = new Date().toISOString().slice(0, 10);

  const groups = splitByProvider([
    ...companies,
    ...restrictedPlatforms,
    ...signalImports,
    ...signalSearches,
    ...searchQueries,
  ]);
  const groupSummary = Array.from(groups.entries()).map(([provider, items]) => `${provider}=${items.length}`).join(', ');
  console.log(
    `Scanning ${companies.length} companies + ${signalImports.length} signal imports + ${signalSearches.length} signal searches + ${searchQueries.length} search queries + ${restrictedPlatforms.length} restricted platforms (${groupSummary || 'none'})`
  );
  if (dryRun) console.log('(dry run — no files will be written)\n');

  const context = { titleFilter, seenUrls, seenCompanyRoles, filterCompany, browser: null };
  const allResults = [];

  const apiCompanies = groups.get('ats_api') || [];
  if (apiCompanies.length > 0) {
    allResults.push(...await parallelMap(apiCompanies, API_CONCURRENCY, company => scanCompany(company, context)));
  }

  const manualCompanies = groups.get('manual_only') || [];
  if (manualCompanies.length > 0) {
    allResults.push(...await parallelMap(manualCompanies, API_CONCURRENCY, company => scanCompany(company, context)));
  }

  const importSources = groups.get('manual_signal_import') || [];
  if (importSources.length > 0) {
    allResults.push(...await parallelMap(importSources, API_CONCURRENCY, source => scanCompany(source, context)));
  }

  const searchSources = groups.get('reach_signal_search') || [];
  if (searchSources.length > 0) {
    allResults.push(...await parallelMap(searchSources, API_CONCURRENCY, source => scanCompany(source, context)));
  }

  const unsupportedCompanies = Array.from(groups.entries())
    .filter(([provider]) => !['ats_api', 'company_page', 'reach_read_url', 'reach_signal_search', 'manual_only', 'manual_signal_import'].includes(provider))
    .flatMap(([, items]) => items);
  if (unsupportedCompanies.length > 0) {
    allResults.push(...await parallelMap(unsupportedCompanies, API_CONCURRENCY, company => scanCompany(company, context)));
  }

  const pageCompanies = groups.get('company_page') || [];
  if (pageCompanies.length > 0) {
    const pageResults = await withBrowser(async (browser) => {
      context.browser = browser;
      return await parallelMap(pageCompanies, COMPANY_PAGE_CONCURRENCY, company => scanCompany(company, context));
    });
    allResults.push(...pageResults);
  }

  const reachCompanies = groups.get('reach_read_url') || [];
  if (reachCompanies.length > 0) {
    allResults.push(...await parallelMap(reachCompanies, API_CONCURRENCY, company => scanCompany(company, context)));
  }

  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  let totalHeldForReview = 0;
  const newSignals = [];
  const heldSignals = [];
  const errors = [];
  const skipped = [];

  for (const result of allResults) {
    totalFound += result.found || result.signals.length;
    errors.push(...(result.errors || []));
    skipped.push(...(result.skipped || []));
    const filtered = dedupAndFilterSignals(result.signals || [], context);
    newSignals.push(...filtered.accepted);
    heldSignals.push(...filtered.held);
    totalFiltered += filtered.filtered;
    totalDupes += filtered.duplicates;
    totalHeldForReview += filtered.lowConfidence;
  }

  if (!dryRun && newSignals.length > 0) {
    appendToPipeline(newSignals);
    appendToScanHistory(newSignals, date);
  }
  if (!dryRun && heldSignals.length > 0) {
    appendToSignalReview(heldSignals, date);
  }

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Recruitment Signal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${companies.length}`);
  console.log(`Signal imports:        ${signalImports.length}`);
  console.log(`Signal searches:       ${signalSearches.length}`);
  console.log(`Restricted platforms:  ${restrictedPlatforms.length}`);
  console.log(`Signals found:         ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Held for review:       ${totalHeldForReview}`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New signals added:     ${newSignals.length}`);

  if (skipped.length > 0) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const s of skipped.slice(0, 12)) {
      console.log(`  - ${s.company}: ${s.reason}`);
    }
    if (skipped.length > 12) console.log(`  ... ${skipped.length - 12} more`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors.slice(0, 12)) {
      console.log(`  x ${e.company} [${e.provider}]: ${e.error}`);
    }
    if (errors.length > 12) console.log(`  ... ${errors.length - 12} more`);
  }

  if (newSignals.length > 0) {
    console.log('\nNew signals:');
    for (const s of newSignals) {
      console.log(`  + ${s.company} | ${s.title} | ${s.source_platform} | confidence=${s.confidence}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  if (heldSignals.length > 0) {
    console.log('\nHeld for review:');
    for (const s of heldSignals.slice(0, 12)) {
      console.log(`  ? ${s.company} | ${s.title} | ${s.source_platform} | reason=${s.hold_reason}`);
    }
    if (heldSignals.length > 12) console.log(`  ... ${heldSignals.length - 12} more`);
    if (!dryRun) console.log(`\nReview queue saved to ${SIGNAL_REVIEW_PATH}`);
  }

  console.log('\n→ Run /yoCareer pipeline to evaluate new signals promoted to the pipeline.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
