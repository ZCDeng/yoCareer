#!/usr/bin/env node

/**
 * bridge-smoke.mjs — Validate optional Reach bridge commands quickly.
 */

import { spawn } from 'child_process';
import { parseBool, tokenizeCommand, bridgeInvocation, resolveBridgeCommand } from './lib/bridge-runner.mjs';

const ADITLY_BASE_URL = String(process.env.YOCAREER_ADITLY_BASE_URL || 'http://127.0.0.1:8643').trim().replace(/\/+$/, '');
const ADITLY_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.YOCAREER_ADITLY_TIMEOUT_MS || '10000', 10) || 10000);
const ADITLY_PREFER = parseBool(process.env.YOCAREER_ADITLY_PREFER, false);

const REACH_READ_URL_CMD = resolveBridgeCommand(
  process.env.YOCAREER_REACH_READ_URL_CMD || '',
  './bridges/reach-read-url.mjs',
);
const REACH_SIGNAL_SEARCH_CMD = resolveBridgeCommand(
  process.env.YOCAREER_REACH_SIGNAL_SEARCH_CMD || '',
  './bridges/reach-signal-search.mjs',
);

function runBridge(command, args) {
  return new Promise((resolve, reject) => {
    if (!command) {
      resolve({ skipped: true, output: '', error: 'not configured' });
      return;
    }
    const invocation = bridgeInvocation(command, args);
    const child = spawn(invocation.bin, invocation.argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: false,
      timeout: 30000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ skipped: false, output: stdout.trim(), error: '' });
      else resolve({ skipped: false, output: stdout.trim(), error: stderr.trim() || `exit ${code}` });
    });
  });
}

function parseSignals(output) {
  if (!output) return { ok: false, message: 'empty output' };
  try {
    const parsed = JSON.parse(output);
    const rows = Array.isArray(parsed) ? parsed : parsed.signals || parsed.results || [];
    if (!Array.isArray(rows)) return { ok: false, message: 'JSON parsed but no signals array found' };
    return { ok: true, message: `signals=${rows.length}` };
  } catch (err) {
    return { ok: false, message: `invalid JSON: ${err.message}` };
  }
}

async function checkAditlyHealth() {
  if (!ADITLY_PREFER) {
    return { status: 'skipped', detail: 'disabled by YOCAREER_ADITLY_PREFER=false' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADITLY_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADITLY_BASE_URL}/health`, { signal: controller.signal });
    if (!res.ok) return { status: 'failed', detail: `HTTP ${res.status}` };
    const data = await res.json();
    if (String(data?.status || '').toLowerCase() !== 'ok') {
      return { status: 'failed', detail: `status=${data?.status || 'unknown'}` };
    }
    return { status: 'ok', detail: `${data?.tools ?? 'unknown'} tools` };
  } catch (err) {
    return { status: 'failed', detail: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('\nyoCareer bridge smoke');
  console.log('=====================\n');

  const aditly = await checkAditlyHealth();
  if (aditly.status === 'ok') {
    console.log(`✓ aditly_mcp         ok          ${ADITLY_BASE_URL}/mcp/ (${aditly.detail})`);
  } else if (aditly.status === 'skipped') {
    console.log(`· aditly_mcp         skipped      ${aditly.detail}`);
  } else {
    console.log(`! aditly_mcp         failed       ${ADITLY_BASE_URL}/health ${aditly.detail}`);
  }

  const urlSample = 'https://example.com/jobs/123';
  const searchSample = ['v2ex', 'AI 大模型 招聘'];

  const readResult = await runBridge(REACH_READ_URL_CMD, [urlSample]);
  if (readResult.skipped) {
    console.log('· reach_read_url      skipped      not configured');
  } else if (readResult.error) {
    console.log(`! reach_read_url      failed       ${readResult.error}`);
  } else {
    const check = parseSignals(readResult.output);
    console.log(`${check.ok ? '✓' : '!'} reach_read_url      ${check.ok ? 'ok          ' : 'invalid     '} ${check.message}`);
  }

  const searchResult = await runBridge(REACH_SIGNAL_SEARCH_CMD, searchSample);
  if (searchResult.skipped) {
    console.log('· reach_signal_search skipped      not configured');
  } else if (searchResult.error) {
    console.log(`! reach_signal_search failed       ${searchResult.error}`);
  } else {
    const check = parseSignals(searchResult.output);
    console.log(`${check.ok ? '✓' : '!'} reach_signal_search ${check.ok ? 'ok          ' : 'invalid     '} ${check.message}`);
  }
}

main().catch(err => {
  console.error('bridge-smoke.mjs failed:', err.message);
  process.exit(1);
});
