#!/usr/bin/env node

/**
 * provider-health.mjs — Scanner provider capability report
 *
 * Reports which recruitment signal providers are available in the current
 * local runtime. Optional capabilities such as Reach are reported as
 * unavailable unless an explicit local bridge command is configured.
 */

import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';

function ok(label, detail = '') {
  return { status: 'available', label, detail };
}

function warn(label, detail = '') {
  return { status: 'unavailable', label, detail };
}

function info(label, detail = '') {
  return { status: 'configured', label, detail };
}

function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) return 'ats_api';
  const url = company.careers_url || '';
  if (/jobs\.ashbyhq\.com\/([^/?#]+)/.test(url)) return 'ats_api';
  if (/jobs\.lever\.co\/([^/?#]+)/.test(url)) return 'ats_api';
  if (/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/.test(url)) return 'ats_api';
  return null;
}

function resolveProvider(company) {
  if (company.provider) return company.provider;
  if (detectApi(company)) return 'ats_api';
  if (company.careers_url) return 'company_page';
  return 'manual_only';
}

function countProviders(config) {
  const counts = new Map();
  const rows = [
    ...(config.tracked_companies || []).filter(c => c.enabled !== false),
    ...(config.restricted_platforms || []).filter(p => p.enabled !== false).map(p => ({ ...p, provider: 'manual_only' })),
    ...(config.signal_imports || []).filter(s => s.enabled !== false),
    ...(config.signal_searches || []).filter(s => s.enabled !== false),
  ];

  for (const row of rows) {
    const provider = resolveProvider(row);
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }

  return counts;
}

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${JSON.stringify(command)}`], {
    encoding: 'utf-8',
  });
  return result.status === 0;
}

async function checkPlaywright() {
  try {
    const { chromium } = await import('playwright');
    return existsSync(chromium.executablePath())
      ? ok('company_page', 'Playwright chromium is installed')
      : warn('company_page', 'Run: npx playwright install chromium');
  } catch {
    return warn('company_page', 'Run: npm install && npx playwright install chromium');
  }
}

function checkManualImports(config) {
  const imports = (config.signal_imports || []).filter(s => s.enabled !== false);
  if (imports.length === 0) return info('manual_signal_import', 'No enabled signal_imports configured');

  const missing = imports
    .map(s => s.path || 'data/signals.ndjson')
    .filter(path => !existsSync(path));

  if (missing.length === 0) {
    return ok('manual_signal_import', `${imports.length} import source(s) configured`);
  }

  return info('manual_signal_import', `${imports.length} configured; missing local file(s): ${missing.join(', ')}`);
}

function checkBridge(label, envName, detail) {
  const command = process.env[envName] || '';
  if (!command) {
    return warn(label, `Set ${envName} to enable ${detail}`);
  }

  const binary = command.trim().split(/\s+/)[0];
  if (!binary || !commandExists(binary)) {
    return warn(label, `Configured command is not executable: ${command}`);
  }

  return ok(label, `Bridge command configured: ${command}`);
}

function checkReachReadUrlBridge() {
  return checkBridge('reach_read_url', 'YOCAREER_REACH_READ_URL_CMD', 'public URL extraction');
}

function checkReachSignalSearchBridge(config) {
  const searches = (config.signal_searches || []).filter(s => s.enabled !== false);
  if (searches.length === 0) {
    return info('reach_signal_search', 'No enabled signal_searches configured');
  }

  return checkBridge('reach_signal_search', 'YOCAREER_REACH_SIGNAL_SEARCH_CMD', `${searches.length} configured signal search(es)`);
}

function printCapability(capability) {
  const mark = capability.status === 'available' ? '✓' : capability.status === 'configured' ? '·' : '!';
  console.log(`${mark} ${capability.label.padEnd(22)} ${capability.status.padEnd(11)} ${capability.detail}`);
}

async function main() {
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8')) || {};
  const counts = countProviders(config);

  console.log('\nyoCareer provider health');
  console.log('========================\n');

  const capabilities = [
    ok('ats_api', 'Greenhouse, Ashby, and Lever public APIs'),
    await checkPlaywright(),
    checkManualImports(config),
    ok('manual_only', 'Restricted/login-gated platforms remain manual'),
    checkReachReadUrlBridge(),
    checkReachSignalSearchBridge(config),
  ];

  for (const capability of capabilities) printCapability(capability);

  console.log('\nConfigured source counts:');
  for (const [provider, count] of Array.from(counts.entries()).sort()) {
    console.log(`  - ${provider}: ${count}`);
  }

  console.log('\nReach note: Node scripts cannot call Codex/MCP tools directly. Configure local bridge commands only when Reach is exposed as CLI/wrappers. URL bridges receive: <url>. Signal-search bridges receive: <platform> <query>.');
}

main().catch(err => {
  console.error('provider-health.mjs failed:', err.message);
  process.exit(1);
});
