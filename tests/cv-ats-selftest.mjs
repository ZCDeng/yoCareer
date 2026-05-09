#!/usr/bin/env node

/**
 * cv-ats-selftest.mjs — PDF ATS 自检工具
 *
 * 验证 PDF 中文本提取顺序和可读性，确保 ATS 能正确解析。
 *
 * Usage:
 *   node tests/cv-ats-selftest.mjs <pdf-path> [--lang=zh-cn] [--name=<name>]
 *
 * 输出 JSON 格式的自检报告到 stdout。
 * 未安装 pdftotext 时输出 warn 并 exit 0（不阻塞 CI）。
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_FIELDS_ZH = {
  name: { required: true, source: 'arg' },
  phone: { required: true, pattern: /(?:\+86[\s\-]?)?1[3-9]\d{9}|(?:\+86[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}[\s\-]?\d{4}/ },
  email: { required: true, pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/ },
  education: { required: true, pattern: /大学|学院|教育|本科|硕士|博士|学士|学校|研究院/ },
  experience: { required: true, pattern: /工作|经验|经历|职位|公司|职责|项目/ },
};

const DEFAULT_FIELDS_EN = {
  name: { required: true, source: 'arg' },
  phone: { required: true, pattern: /\+?\d[\d\s\-().]{7,}/ },
  email: { required: true, pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/ },
  education: { required: true, pattern: /Education|University|College|Degree|Bachelor|Master|Ph\.?D/i },
  experience: { required: true, pattern: /Experience|Work|Employment|Position|Company/i },
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const pdfPath = args.find(a => !a.startsWith('--'));
  const lang = args.find(a => a.startsWith('--lang='))?.split('=')[1] || 'zh-cn';
  const name = args.find(a => a.startsWith('--name='))?.split('=')[1] || '';
  const expectFail = args.includes('--expect-fail');
  return { pdfPath, lang, name, expectFail };
}

function checkPdftotext() {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function extractText(pdfPath) {
  try {
    const output = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
    return output;
  } catch (err) {
    throw new Error(`pdftotext failed: ${err.message}`);
  }
}

function checkFieldPresence(text, fields, name) {
  const results = {};
  for (const [key, config] of Object.entries(fields)) {
    if (config.source === 'arg') {
      results[key] = name ? text.includes(name) : false;
    } else if (config.pattern) {
      results[key] = config.pattern.test(text);
    }
  }
  return results;
}

// Reading-order rules:
//   1. Header order is fixed: name → phone → email (top of every CV).
//   2. Body sections (education, experience) can appear in either order —
//      "experience-first" is normal for senior candidates; "education-first"
//      is normal for new grads. Both pass.
//   3. All header fields must precede all body fields. The actual ATS regression
//      we want to catch is when name/contact ends up in a sidebar that
//      pdftotext extracts AFTER the body (the canary fixture is single-column,
//      so this should never happen if the template is intact).
const HEADER_ORDER = ['name', 'phone', 'email'];
const BODY_FIELDS = new Set(['education', 'experience']);

function checkFieldOrder(text, fields, name) {
  const positions = [];
  for (const [key, config] of Object.entries(fields)) {
    let match;
    if (config.source === 'arg' && name) {
      const idx = text.indexOf(name);
      if (idx !== -1) positions.push({ key, index: idx });
    } else if (config.pattern) {
      match = text.match(config.pattern);
      if (match) positions.push({ key, index: match.index });
    }
  }
  positions.sort((a, b) => a.index - b.index);
  const order = positions.map(p => p.key);

  // Partition into header / body in observed order.
  const headerInOrder = order.filter(k => !BODY_FIELDS.has(k));
  const bodyInOrder = order.filter(k => BODY_FIELDS.has(k));

  // Header must match canonical order (over fields that were found).
  const expectedHeader = HEADER_ORDER.filter(k => headerInOrder.includes(k));
  const headerOk = headerInOrder.length === expectedHeader.length
    && headerInOrder.every((k, i) => k === expectedHeader[i]);

  // Header must precede body. Find the last header position and the first body
  // position in the observed order; lastHeaderIdx must be < firstBodyIdx.
  let headerBeforeBody = true;
  if (headerInOrder.length > 0 && bodyInOrder.length > 0) {
    const lastHeaderKey = headerInOrder[headerInOrder.length - 1];
    const firstBodyKey = bodyInOrder[0];
    headerBeforeBody = order.lastIndexOf(lastHeaderKey) < order.indexOf(firstBodyKey);
  }

  const passed = positions.length >= 3 && headerOk && headerBeforeBody;
  return { passed, order, expectedHeader, headerOk, headerBeforeBody, positions };
}

function checkChineseReadability(text) {
  const issues = [];

  // Unicode replacement character
  const replacementCount = (text.match(/�/g) || []).length;
  if (replacementCount > 0) {
    issues.push(`Found ${replacementCount} Unicode replacement character(s) (�)`);
  }

  // Box characters (font missing)
  const boxCount = (text.match(/[■□▢▣]/g) || []).length;
  if (boxCount > 0) {
    issues.push(`Found ${boxCount} box character(s) (font missing)`);
  }

  // Abnormal control characters in body text
  const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
  if (controlChars && controlChars.length > 5) {
    issues.push(`Found ${controlChars.length} abnormal control characters`);
  }

  // Check for garbled CJK (isolated high-byte sequences without valid CJK)
  // This is a heuristic: look for sequences of \u00XX where XX > 7F that don't form valid UTF-8
  const garbledPattern = /(?:[\x80-\xBF]{2,}[^\xC0-\xDF\xE0-\xEF\xF0-\xF7])/g;
  const garbled = text.match(garbledPattern);
  if (garbled && garbled.length > 3) {
    issues.push(`Found ${garbled.length} potentially garbled byte sequences`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

function main() {
  const { pdfPath, lang, name, expectFail } = parseArgs(process.argv);

  if (!pdfPath) {
    console.error('Usage: node tests/cv-ats-selftest.mjs <pdf-path> [--lang=zh-cn] [--name=<name>] [--expect-fail]');
    process.exit(1);
  }

  const absPath = resolve(pdfPath);
  if (!existsSync(absPath)) {
    console.error(`PDF not found: ${absPath}`);
    process.exit(1);
  }

  const report = {
    pdf: absPath,
    lang,
    passed: false,
    checks: {},
    extractedLength: 0,
    warnings: [],
  };

  if (!checkPdftotext()) {
    report.warnings.push('pdftotext not found — skipping ATS self-test');
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  let text;
  try {
    text = extractText(absPath);
    report.extractedLength = text.length;
  } catch (err) {
    report.warnings.push(`Text extraction failed: ${err.message}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const fields = lang === 'zh-cn' ? DEFAULT_FIELDS_ZH : DEFAULT_FIELDS_EN;

  // Field presence
  const presence = checkFieldPresence(text, fields, name);
  report.checks.fields_present = presence;

  // Field order
  const orderCheck = checkFieldOrder(text, fields, name);
  report.checks.field_order = {
    passed: orderCheck.passed,
    order: orderCheck.order,
  };

  // Chinese readability
  const readability = checkChineseReadability(text);
  report.checks.chinese_readability = readability;

  // Overall pass
  const allPresent = Object.values(presence).every(v => v);
  report.passed = allPresent && orderCheck.passed && readability.passed;

  if (!allPresent) {
    const missing = Object.entries(presence)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    report.warnings.push(`Missing fields: ${missing.join(', ')}`);
  }
  if (!orderCheck.passed) {
    report.warnings.push(`Field order check failed: ${orderCheck.order.join(' → ')}`);
  }

  console.log(JSON.stringify(report, null, 2));

  // --expect-fail inverts the exit code so negative fixtures can be asserted in CI:
  // a failing PDF (broken canary) exits 0, a passing PDF (regression) exits 1.
  if (expectFail) {
    process.exit(report.passed ? 1 : 0);
  }
  process.exit(report.passed ? 0 : 1);
}

main();
