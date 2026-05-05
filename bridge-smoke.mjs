#!/usr/bin/env node

/**
 * bridge-smoke.mjs — Validate optional Reach bridge commands quickly.
 */

import { spawn } from 'child_process';

const REACH_READ_URL_CMD = process.env.YOCAREER_REACH_READ_URL_CMD || '';
const REACH_SIGNAL_SEARCH_CMD = process.env.YOCAREER_REACH_SIGNAL_SEARCH_CMD || '';

function runBridge(command, args) {
  return new Promise((resolve, reject) => {
    if (!command) {
      resolve({ skipped: true, output: '', error: 'not configured' });
      return;
    }
    const positional = args.map((_, idx) => `"$${idx + 1}"`).join(' ');
    const child = spawn('sh', ['-lc', `${command} ${positional}`, 'bridge-smoke', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
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

async function main() {
  console.log('\nyoCareer bridge smoke');
  console.log('=====================\n');

  const urlSample = 'https://example.com/jobs/123';
  const searchSample = ['weibo', '大模型 招聘'];

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
