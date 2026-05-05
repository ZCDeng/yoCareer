#!/usr/bin/env node

/**
 * reach-read-url.mjs
 * Input:  <url>
 * Output: JSON { signals: [...] }
 *
 * Default local bridge:
 * - x/twitter status URL: xreach tweet
 * - generic URL: r.jina.ai text reader + link extraction
 */

import { spawnSync } from 'child_process';

const url = String(process.argv[2] || '').trim();

const JOB_HINTS = [
  '招聘',
  '招人',
  '在招',
  'hc',
  '岗位',
  '职位',
  '简历',
  'hiring',
  'join us',
  'we are hiring',
  'job opening',
  'career',
];

function print(signals) {
  process.stdout.write(`${JSON.stringify({ signals }, null, 2)}\n`);
}

function safeUrl(raw) {
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function normalizeText(text, max = 220) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function includesJobHint(text) {
  const lower = String(text || '').toLowerCase();
  return JOB_HINTS.some(k => lower.includes(k));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} exited with ${result.status}`);
  }
  return result.stdout;
}

function extractCompanyFromHost(target) {
  try {
    const host = new URL(target).hostname;
    const base = host.replace(/^www\./, '').split('.')[0];
    return base ? base.toUpperCase() : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function parseTitleFromReader(text) {
  const line = text.split('\n').find(l => /^title:\s*/i.test(l.trim()));
  if (!line) return '';
  return line.replace(/^title:\s*/i, '').trim();
}

function toOfficialSignal(targetUrl, title, evidence, confidence = 0.74) {
  return {
    kind: 'official_job',
    company: extractCompanyFromHost(targetUrl),
    title: normalizeText(title, 100) || '招聘线索',
    role: normalizeText(title, 100) || '招聘线索',
    url: targetUrl,
    confidence,
    source_platform: 'reach_read_url',
    evidence_text: normalizeText(evidence, 260),
    recommended_action: 'apply_on_official_site',
  };
}

function parseFromXStatus(targetUrl) {
  const output = run('xreach', ['tweet', targetUrl, '--json']);
  const row = JSON.parse(output);
  const text = row?.text || '';
  if (!text) return [];
  const firstUrl = (String(text).match(/https?:\/\/[^\s]+/g) || [])[0] || targetUrl;
  return [{
    kind: 'recruiter_post',
    company: 'Unknown',
    title: normalizeText(text, 100) || 'X 招聘信号',
    role: normalizeText(text, 100) || 'X 招聘信号',
    url: safeUrl(firstUrl) || targetUrl,
    confidence: includesJobHint(text) ? 0.84 : 0.65,
    source_platform: 'x',
    source_author: row?.user?.restId || '',
    evidence_text: normalizeText(text, 260),
    recommended_action: includesJobHint(text) ? 'message_recruiter' : 'save_for_manual_review',
  }];
}

async function parseFromReader(targetUrl) {
  const readerUrl = `https://r.jina.ai/${targetUrl}`;
  const response = await fetch(readerUrl, {
    headers: { 'User-Agent': 'yocareer/1.0' },
  });
  if (!response.ok) return [];
  const text = await response.text();
  if (!text.trim()) return [];

  const title = parseTitleFromReader(text) || new URL(targetUrl).hostname;
  const signals = [];
  if (includesJobHint(text)) {
    signals.push(toOfficialSignal(targetUrl, title, text, 0.78));
  }

  const urlMatches = text.match(/https?:\/\/[^\s"'<>）)]+/g) || [];
  const unique = new Set();
  for (const raw of urlMatches) {
    const extracted = safeUrl(raw);
    if (!extracted || unique.has(extracted)) continue;
    unique.add(extracted);
    if (!includesJobHint(extracted)) continue;
    signals.push(toOfficialSignal(extracted, extracted.split('/').pop() || title, title, 0.72));
    if (signals.length >= 12) break;
  }
  return signals;
}

async function main() {
  const targetUrl = safeUrl(url);
  if (!targetUrl) {
    print([]);
    return;
  }

  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if ((host.includes('x.com') || host.includes('twitter.com')) && /\/status\/\d+/i.test(targetUrl)) {
      print(parseFromXStatus(targetUrl));
      return;
    }
    print(await parseFromReader(targetUrl));
  } catch (err) {
    print([
      {
        kind: 'community_post',
        company: 'Unknown',
        title: 'bridge_error:read_url',
        role: 'bridge_error:read_url',
        url: targetUrl,
        confidence: 0.3,
        source_platform: 'reach_read_url',
        evidence_text: normalizeText(err.message, 300),
        recommended_action: 'save_for_manual_review',
        scoring_notes: ['bridge_error'],
      },
    ]);
  }
}

main();
