#!/usr/bin/env node

/**
 * review-signals.mjs — Manual review workflow for recruitment signals
 *
 * Commands:
 *   node review-signals.mjs list
 *   node review-signals.mjs draft --index 1
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

function sanitizePipelineField(value, maxLen = 240) {
  return String(value || '')
    .replace(/[|\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeTsvField(value, maxLen = 800) {
  return String(value || '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

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
  const line = `- [ ] ${sanitizePipelineField(url, 1000)} | ${sanitizePipelineField(block.company)} | ${sanitizePipelineField(block.title)}`;
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
  appendFileSync(
    SCAN_HISTORY_PATH,
    `${sanitizeTsvField(url, 1000)}\t${sanitizeTsvField(date, 20)}\t${sanitizeTsvField(block.source, 120)}\t${sanitizeTsvField(block.title)}\t${sanitizeTsvField(block.company, 200)}\t${sanitizeTsvField(status, 80)}\n`,
    'utf-8'
  );
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

function parseScoringNotes(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function draftAction(block) {
  const notes = parseScoringNotes(block.scoringNotes);
  const risky = notes.includes('possible_outsourcing') || notes.includes('possible_spam_or_low_fit');
  const unknownCompany = notes.includes('unknown_company');
  const missingSource = notes.includes('missing_source_url');
  const action = block.recommendedAction || 'save_for_manual_review';

  const verificationQuestions = [
    '这是正式员工 HC 还是外包/驻场/派遣？',
    '岗位是否仍在招聘，是否有官方 JD 或投递链接？',
    '岗位所属团队、汇报线和工作地点是什么？',
  ];

  if (unknownCompany) verificationQuestions.push('公司全称和主体是什么，是否能核验主体信息？');
  if (missingSource) verificationQuestions.push('是否可以补充原始链接或可核验截图来源？');

  let command = `npm run signals -- promote --index ${block.index}`;
  let decision = 'promote';
  let message = `你好，我关注到你发布的「${block.title}」。我在相关方向有可复用经验，想先确认岗位是否仍开放，以及正式编制和团队信息，便于我判断后续投递方式。`;

  if (action === 'save_for_manual_review' || risky || unknownCompany || missingSource) {
    decision = 'keep_review';
    command = '# keep in review queue';
    message = `你好，我对「${block.title}」方向感兴趣。为避免误投，想先确认岗位的正式编制、团队归属、工作地点和官方投递入口，再决定是否推进。`;
  } else if (action === 'ask_for_referral') {
    decision = 'promote_referral';
    message = `你好，我在该岗位相关方向有实战经验，想请教你这类岗位当前最看重的能力点。如果方便，也希望了解是否支持内推流程。`;
  }

  if (action === 'skip_low_confidence') {
    decision = 'discard';
    command = `npm run signals -- discard --index ${block.index}`;
    message = '该信号证据不足，建议先丢弃，后续若出现官方链接再重新评估。';
  }

  return {
    decision,
    command,
    message,
    verificationQuestions,
    notes,
  };
}

function printDraft(block) {
  const draft = draftAction(block);
  console.log(`#${block.index} ${block.company} | ${block.title}`);
  console.log(`Decision: ${draft.decision}`);
  console.log(`Suggested command: ${draft.command}`);
  console.log('\nMessage draft:');
  console.log(draft.message);
  console.log('\nVerification questions:');
  for (const question of draft.verificationQuestions) {
    console.log(`- ${question}`);
  }
  if (draft.notes.length > 0) {
    console.log('\nRisk notes:');
    for (const note of draft.notes) {
      console.log(`- ${note}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { text, blocks } = loadReview();

  if (args.command === 'list') {
    listSignals(blocks);
    return;
  }

  if (!['draft', 'promote', 'discard'].includes(args.command)) {
    console.error(`Unknown command: ${args.command}`);
    process.exit(1);
  }

  const block = selectBlock(blocks, args);
  if (!block) {
    console.error('No matching signal found. Use `npm run signals -- list` to inspect indexes.');
    process.exit(1);
  }

  if (args.command === 'draft') {
    printDraft(block);
    return;
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
