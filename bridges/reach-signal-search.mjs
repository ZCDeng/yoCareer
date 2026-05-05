#!/usr/bin/env node

/**
 * reach-signal-search.mjs
 * Input:  <platform> <query>
 * Output: JSON { signals: [...] }
 *
 * Default local bridge:
 * - x/twitter: xreach search
 * - v2ex: public V2EX API
 * - github: gh search issues
 * - fallback: empty signals
 */

import { spawnSync } from 'child_process';

const platform = String(process.argv[2] || 'web').trim().toLowerCase();
const query = String(process.argv.slice(3).join(' ') || '').trim();

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

function includesJobHint(text) {
  const lower = String(text || '').toLowerCase();
  return JOB_HINTS.some(k => lower.includes(k));
}

function normalizeText(text, max = 220) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function maybeFromXreach() {
  const output = run('xreach', ['search', query, '-n', '20', '--json']);
  const parsed = JSON.parse(output);
  const items = parsed?.items || [];
  return items
    .filter(item => includesJobHint(item?.text || ''))
    .slice(0, 12)
    .map(item => {
      const text = String(item?.text || '');
      const firstUrl = (text.match(/https?:\/\/[^\s]+/g) || [])[0] || '';
      const canonicalUrl = safeUrl(firstUrl) || `https://x.com/i/status/${item.id}`;
      return {
        kind: 'recruiter_post',
        company: 'Unknown',
        title: normalizeText(text, 90) || '招聘信号',
        role: normalizeText(text, 90) || '招聘信号',
        url: canonicalUrl,
        confidence: 0.84,
        source_platform: 'x',
        source_author: item?.user?.restId || '',
        evidence_text: normalizeText(text),
        recommended_action: 'message_recruiter',
      };
    });
}

function tokenize(input) {
  return input
    .split(/[\s,，、|/]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function scoreByTokens(text, tokens) {
  if (!tokens.length) return 1;
  const hay = String(text || '').toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  return hits;
}

async function maybeFromV2EX() {
  const urls = [
    'https://www.v2ex.com/api/topics/show.json?node_name=jobs&page=1',
    'https://www.v2ex.com/api/topics/show.json?node_name=aigc&page=1',
    'https://www.v2ex.com/api/topics/hot.json',
  ];
  const tokens = tokenize(query);
  const merged = [];
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'yocareer/1.0' },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows)) merged.push(...rows);
  }
  const uniq = new Map();
  for (const row of merged) {
    if (!row?.id || uniq.has(row.id)) continue;
    uniq.set(row.id, row);
  }

  const candidates = Array.from(uniq.values())
    .map(row => {
      const text = `${row.title || ''} ${row.content || ''}`;
      const tokenScore = scoreByTokens(text, tokens);
      const hintScore = includesJobHint(text) ? 1 : 0;
      const nodeName = String(row.node?.name || '').toLowerCase();
      const isJobsNode = nodeName === 'jobs';
      return { row, score: tokenScore + hintScore, isJobsNode, hintScore };
    })
    .filter(x => x.score > 0 && (x.hintScore > 0 || x.isJobsNode))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return candidates.map(({ row }) => ({
    kind: 'community_post',
    company: 'Unknown',
    title: normalizeText(row.title, 90) || 'V2EX 招聘线索',
    role: normalizeText(row.title, 90) || 'V2EX 招聘线索',
    url: safeUrl(row.url) || `https://www.v2ex.com/t/${row.id}`,
    confidence: 0.69,
    source_platform: 'v2ex',
    source_author: row.member?.username || '',
    evidence_text: normalizeText(`${row.title || ''} ${row.content || ''}`),
    recommended_action: 'save_for_manual_review',
  }));
}

function maybeFromGithub() {
  const output = run('gh', [
    'search',
    'issues',
    `${query} in:title,body`,
    '--limit',
    '20',
    '--json',
    'title,url,body,author,repository',
  ]);
  const rows = JSON.parse(output);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => includesJobHint(`${row.title || ''} ${row.body || ''}`))
    .slice(0, 12)
    .map(row => ({
      kind: 'community_post',
      company: row.repository?.name || 'Unknown',
      title: normalizeText(row.title, 90) || 'GitHub 招聘线索',
      role: normalizeText(row.title, 90) || 'GitHub 招聘线索',
      url: safeUrl(row.url) || '',
      confidence: 0.66,
      source_platform: 'github',
      source_author: row.author?.login || '',
      evidence_text: normalizeText(`${row.title || ''} ${row.body || ''}`),
      recommended_action: 'save_for_manual_review',
    }));
}

async function main() {
  if (!query) {
    print([]);
    return;
  }

  try {
    if (platform === 'x' || platform === 'twitter') {
      print(maybeFromXreach());
      return;
    }
    if (platform === 'v2ex') {
      print(await maybeFromV2EX());
      return;
    }
    if (platform === 'github') {
      print(maybeFromGithub());
      return;
    }
    print([]);
  } catch (err) {
    print([
      {
        kind: 'community_post',
        company: 'Unknown',
        title: `bridge_error:${platform}`,
        role: `bridge_error:${platform}`,
        url: '',
        confidence: 0.3,
        source_platform: platform || 'web',
        evidence_text: normalizeText(err.message, 300),
        recommended_action: 'save_for_manual_review',
        scoring_notes: ['bridge_error'],
      },
    ]);
  }
}

main();
