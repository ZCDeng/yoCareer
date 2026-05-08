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

function parseRegexPattern(patternStr) {
  // Expects format: /pattern/flags
  const match = patternStr.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!match) return null;
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

  const requiredFields = ['id', 'tier', 'category', 'patterns', 'weight', 'description'];
  const ids = new Set();
  let fieldsValid = true;
  let tiersValid = true;
  let categoriesValid = true;
  let weightsValid = true;
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

    // Weight validation
    if (!Number.isInteger(sig.weight) || sig.weight < 1 || sig.weight > 10) {
      report.errors.push(`Signal ${sig.id}: weight must be integer 1-10, got ${sig.weight}`);
      weightsValid = false;
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

  report.checks.required_fields = fieldsValid;
  report.checks.tier_values = tiersValid;
  report.checks.category_values = categoriesValid;
  report.checks.weight_range = weightsValid;
  report.checks.patterns_valid = patternsValid;
  report.checks.ids_unique = idsUnique;

  report.passed =
    report.errors.length === 0 &&
    signals.length >= 15 &&
    fieldsValid &&
    tiersValid &&
    categoriesValid &&
    weightsValid &&
    patternsValid &&
    idsUnique;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

main();
