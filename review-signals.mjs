#!/usr/bin/env node

/**
 * review-signals.mjs — Manual review workflow for recruitment signals
 *
 * Commands:
 *   node review-signals.mjs list
 *   node review-signals.mjs promote --index 1 [--dry-run]
 *   node review-signals.mjs discard --index 1 [--dry-run]
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';

const SIGNAL_REVIEW_PATH = 'data/signal-review.md';
const SIGNAL_ARCHIVE_PATH = 'data/signal-review-archive.md';
const PIPELINE_PATH = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';

mkdirSync('data', { recursive: true });

function parseArgs(argv) {
  const args = { command: argv[0] || 'list', dryRun: argv.includes('--dry-run') };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--index') args.index = Number(argv[i + 1]);
    if (argv[i] === '--company') args.company = argv[i + 1];
    if (argv[i] === '--title') args.title = argv[i + 1];
  }
  return args;
}

function parseReviewBlocks(text) {
  const headingRe = /^##\s+(.+?)\s+\|\s+(.+?)\s*$/gm;
  const headings = Array.from(text.matchAll(headingRe));
  return headings.map((match, idx) => {
    const start = match.index;
    const end = headings[idx + 1]?.index ?? text.length;
    const body = text.slice(start, end);
    const fields = {};
    for (const line of body.split('\n')) {
      const field = line.match(/^-\s+([^:]+):\s*(.*)$/);
      if (field) fields[field[1].trim().toLowerCase()] = field[2].trim();
    }
    return {
      index: idx + 1,
      company: match[1].trim(),
      title: match[2].trim(),
      body: body.trim(),
      start,
      end,
      date: fields.date || new Date().toISOString().slice(0, 10),
      source: fields.source || 'signal-review',
      url: fields.url === 'N/A' ? '' : fields.url || '',
      confidence: fields.confidence || '',
      reason: fields.reason || '',
      scoringNotes: fields['scoring notes'] || '',
      recommendedAction: fields['recommended action'] || 'save_for_manual_review',
      evidence: fields.evidence || '',
    };
  });
}

function loadReview() {
  if (!existsSync(SIGNAL_REVIEW_PATH)) {
    return { text: '', blocks: [] };
  }
  const text = readFileSync(SIGNAL_REVIEW_PATH, 'utf-8');
  return { text, blocks: parseReviewBlocks(text) };
}

function selectBlock(blocks, args) {
  if (args.index) return blocks.find(block => block.index === args.index);
  if (args.company) {
    const key = args.company.toLowerCase();
    return blocks.find(block => block.company.toLowerCase().includes(key));
  }
  if (args.title) {
    const key = args.title.toLowerCase();
    return blocks.find(block => block.title.toLowerCase().includes(key));
  }
  return null;
}

function ensurePipelineText() {
  if (existsSync(PIPELINE_PATH)) return readFileSync(PIPELINE_PATH, 'utf-8');
  return '# Pipeline\n\n## Pendientes\n\n## Procesadas\n';
}

function appendToPipeline(block) {
  const url = block.url || `signal-review:${block.company}:${block.title}`;
  const line = `- [ ] ${url} | ${block.company} | ${block.title}`;
  let text = ensurePipelineText();
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);

  if (idx === -1) {
    text += `\n${marker}\n\n${line}\n`;
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    text = `${text.slice(0, insertAt)}\n${line}\n${text.slice(insertAt)}`;
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(block, date, status) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const url = block.url || `signal-review:${block.company}:${block.title}`;
  appendFileSync(SCAN_HISTORY_PATH, `${url}\t${date}\t${block.source}\t${block.title}\t${block.company}\t${status}\n`, 'utf-8');
}

function archiveBlock(block, action, date) {
  const header = existsSync(SIGNAL_ARCHIVE_PATH) ? '' : '# Signal Review Archive\n';
  appendFileSync(
    SIGNAL_ARCHIVE_PATH,
    `${header}\n<!-- ${action} ${date} -->\n${block.body}\n`,
    'utf-8'
  );
}

function removeBlock(text, block) {
  const next = `${text.slice(0, block.start)}${text.slice(block.end)}`;
  return next.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function listSignals(blocks) {
  if (blocks.length === 0) {
    console.log('No signals pending review.');
    return;
  }

  for (const block of blocks) {
    console.log(`#${block.index} ${block.company} | ${block.title}`);
    console.log(`   Source: ${block.source} | Confidence: ${block.confidence || 'N/A'} | Reason: ${block.reason || 'N/A'}`);
    console.log(`   Action: ${block.recommendedAction}`);
    if (block.scoringNotes) console.log(`   Notes: ${block.scoringNotes}`);
    if (block.url) console.log(`   URL: ${block.url}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { text, blocks } = loadReview();

  if (args.command === 'list') {
    listSignals(blocks);
    return;
  }

  if (!['promote', 'discard'].includes(args.command)) {
    console.error(`Unknown command: ${args.command}`);
    process.exit(1);
  }

  const block = selectBlock(blocks, args);
  if (!block) {
    console.error('No matching signal found. Use `npm run signals -- list` to inspect indexes.');
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  if (args.dryRun) {
    console.log(`[dry-run] ${args.command} #${block.index}: ${block.company} | ${block.title}`);
    return;
  }

  if (args.command === 'promote') {
    appendToPipeline(block);
    appendToScanHistory(block, date, 'promoted_from_review');
  } else {
    appendToScanHistory(block, date, 'discarded_from_review');
  }

  archiveBlock(block, args.command, date);
  writeFileSync(SIGNAL_REVIEW_PATH, removeBlock(text, block), 'utf-8');
  const pastTense = args.command === 'promote' ? 'promoted' : 'discarded';
  console.log(`${pastTense} #${block.index}: ${block.company} | ${block.title}`);
}

main();
