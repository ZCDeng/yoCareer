#!/usr/bin/env node

/**
 * risk-tiers-selftest.mjs — Validate templates/risk-tiers.yml format and rules
 *
 * Usage:
 *   node tests/risk-tiers-selftest.mjs [path-to-risk-tiers.yml]
 *
 * Outputs JSON report to stdout.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_PATH = join(ROOT, 'templates', 'risk-tiers.yml');

const VALID_TIERS = ['critical', 'high', 'medium', 'low'];
const VALID_CATEGORIES = [
  'contract_risk',
  'compensation_risk',
  'workload_risk',
  'platform_risk',
  'legitimacy_risk',
];

// Must-NOT-match fixtures — clean Chinese JD strings that should NOT trigger
// the listed signal id. Added to lock in the false-positive narrowing in PR-C.
// Adding a new signal? If it's broad enough to need negation, add must-not-match
// fixtures here. Each entry: { signal_id, jd_text, reason }.
const MUST_NOT_MATCH = [
  { id: 'contract-outsourcing', jd: '管理外包供应商', reason: 'vendor-management role, not being outsourced' },
  { id: 'contract-outsourcing', jd: '负责采购第三方雇佣的合规审查', reason: 'audit role for outsourcing compliance' },
  { id: 'workload-996', jd: '本公司明确拒绝996工作制', reason: 'anti-996 employer-of-choice' },
  { id: 'workload-996', jd: '我们抵制大小周', reason: 'anti-bigsmallweek statement' },
  { id: 'contract-no-labor-contract', jd: '审查不签劳动合同的违法案件', reason: 'legal/audit context' },
  { id: 'contract-no-labor-contract', jd: '代理无劳动合同纠纷', reason: 'legal representation' },
  { id: 'platform-upfront-fee', jd: '客户押金管理是核心职责', reason: 'normal accounting term, not job-seeker fee' },
  { id: 'platform-upfront-fee', jd: '负责培训费收取与对账', reason: 'finance/accounting role' },
  { id: 'comp-low-bonus', jd: '薪资 12薪 + 季度奖金 + 年终奖', reason: 'has additional bonuses' },
  { id: 'comp-low-bonus', jd: '提供 12薪 + 期权', reason: 'has equity in addition to base' },
];

function parseRegexPattern(patternStr) {
  // Expects format: /pattern/flags
  const match = patternStr.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!match) return null;
  // Reject empty pattern — `new RegExp('','')` matches every string,
  // turning any signal that uses `//` into a universal hit.
  if (!match[1].trim()) return null;
  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

function main() {
  const filePath = resolve(process.argv[2] || DEFAULT_PATH);

  const report = {
    file: filePath,
    passed: false,
    signal_count: 0,
    checks: {},
    errors: [],
  };

  if (!existsSync(filePath)) {
    report.errors.push(`File not found: ${filePath}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  let doc;
  try {
    const content = readFileSync(filePath, 'utf-8');
    doc = yaml.load(content);
    report.checks.yaml_valid = true;
  } catch (err) {
    report.checks.yaml_valid = false;
    report.errors.push(`YAML parse error: ${err.message}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Check top-level structure
  if (!doc.version || !Array.isArray(doc.signals)) {
    report.errors.push('Missing required top-level fields: version, signals');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const signals = doc.signals;
  report.signal_count = signals.length;

  if (signals.length < 15) {
    report.errors.push(`Expected at least 15 signals, found ${signals.length}`);
  }

  const requiredFields = ['id', 'tier', 'category', 'patterns', 'description'];
  const ids = new Set();
  let fieldsValid = true;
  let tiersValid = true;
  let categoriesValid = true;
  let patternsValid = true;
  let idsUnique = true;

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];

    // Required fields
    for (const field of requiredFields) {
      if (!(field in sig)) {
        report.errors.push(`Signal #${i + 1} missing required field: ${field}`);
        fieldsValid = false;
      }
    }

    if (!sig.id) continue;

    // ID uniqueness
    if (ids.has(sig.id)) {
      report.errors.push(`Duplicate signal id: ${sig.id}`);
      idsUnique = false;
    }
    ids.add(sig.id);

    // Tier validation
    if (!VALID_TIERS.includes(sig.tier)) {
      report.errors.push(`Signal ${sig.id}: invalid tier "${sig.tier}"`);
      tiersValid = false;
    }

    // Category validation
    if (!VALID_CATEGORIES.includes(sig.category)) {
      report.errors.push(`Signal ${sig.id}: invalid category "${sig.category}"`);
      categoriesValid = false;
    }

    // Patterns validation
    if (!Array.isArray(sig.patterns) || sig.patterns.length === 0) {
      report.errors.push(`Signal ${sig.id}: patterns must be non-empty array`);
      patternsValid = false;
    } else {
      for (let j = 0; j < sig.patterns.length; j++) {
        const pat = sig.patterns[j];
        if (typeof pat !== 'string') {
          report.errors.push(`Signal ${sig.id}: pattern #${j + 1} must be string`);
          patternsValid = false;
          continue;
        }
        const regex = parseRegexPattern(pat);
        if (!regex) {
          report.errors.push(`Signal ${sig.id}: invalid regex pattern: ${pat}`);
          patternsValid = false;
        }
      }
    }
  }

  // Must-not-match validation: check that narrowed regexes don't fire on
  // legitimate JD context (anti-996 employers, vendor-management roles, etc.)
  let mustNotMatchValid = true;
  const signalsById = new Map(signals.map(s => [s.id, s]));
  for (const fixture of MUST_NOT_MATCH) {
    const sig = signalsById.get(fixture.id);
    if (!sig) {
      report.errors.push(`MUST_NOT_MATCH references unknown signal id: ${fixture.id}`);
      mustNotMatchValid = false;
      continue;
    }
    for (const pat of sig.patterns) {
      const regex = parseRegexPattern(pat);
      if (regex && regex.test(fixture.jd)) {
        report.errors.push(
          `False positive — signal "${fixture.id}" pattern ${pat} matched clean JD: "${fixture.jd}" (${fixture.reason})`
        );
        mustNotMatchValid = false;
      }
    }
  }

  report.checks.required_fields = fieldsValid;
  report.checks.tier_values = tiersValid;
  report.checks.category_values = categoriesValid;
  report.checks.patterns_valid = patternsValid;
  report.checks.ids_unique = idsUnique;
  report.checks.must_not_match = mustNotMatchValid;

  report.passed =
    report.errors.length === 0 &&
    signals.length >= 15 &&
    fieldsValid &&
    tiersValid &&
    categoriesValid &&
    patternsValid &&
    idsUnique &&
    mustNotMatchValid;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

main();
