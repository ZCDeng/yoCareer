#!/usr/bin/env node

/**
 * url-allowlist-selftest.mjs — Regression test for generate-pdf.mjs URL allowlist
 *
 * Locks in the CodeQL js/incomplete-url-substring-sanitization fix (PR #20):
 * the Google Fonts allowlist must use hostname equality, not `startsWith`.
 *
 * Outputs JSON to stdout. Exit 0 on pass, 1 on fail.
 */

import { canLoadRequest, isFontsAllowlistUrl } from '../generate-pdf.mjs';

const cases = [
  // ── isFontsAllowlistUrl ────────────────────────────────────
  // Allow: real Google Fonts CDN over HTTPS
  { fn: 'isFontsAllowlistUrl', input: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC', expected: true },
  { fn: 'isFontsAllowlistUrl', input: 'https://fonts.gstatic.com/s/notosanssc/v36/foo.woff2', expected: true },
  // Block: subdomain spoofing — was the CodeQL bypass vector
  { fn: 'isFontsAllowlistUrl', input: 'https://fonts.googleapis.com.evil.com/css', expected: false },
  { fn: 'isFontsAllowlistUrl', input: 'https://fonts.gstatic.com.attacker.net/x.woff2', expected: false },
  // Block: userinfo spoofing
  { fn: 'isFontsAllowlistUrl', input: 'https://fonts.googleapis.com@evil.com/css', expected: false },
  // Block: query/path spoofing
  { fn: 'isFontsAllowlistUrl', input: 'https://evil.com/?@fonts.googleapis.com', expected: false },
  { fn: 'isFontsAllowlistUrl', input: 'https://evil.com/fonts.googleapis.com/css', expected: false },
  // Block: wrong protocol
  { fn: 'isFontsAllowlistUrl', input: 'http://fonts.googleapis.com/css', expected: false },
  { fn: 'isFontsAllowlistUrl', input: 'ftp://fonts.googleapis.com/foo', expected: false },
  // Block: case-variant hostname (URL parser lowercases, so this should still match — sanity)
  { fn: 'isFontsAllowlistUrl', input: 'https://FONTS.GOOGLEAPIS.COM/css', expected: true },
  // Block: malformed URL
  { fn: 'isFontsAllowlistUrl', input: 'not a url', expected: false },
  { fn: 'isFontsAllowlistUrl', input: '', expected: false },

  // ── canLoadRequest ─────────────────────────────────────────
  // Allow: data: and about:
  { fn: 'canLoadRequest', input: ['data:image/png;base64,iVBORw0KGgo=', []], expected: true },
  { fn: 'canLoadRequest', input: ['about:blank', []], expected: true },
  // Allow: file:// inside allowed dir
  { fn: 'canLoadRequest', input: ['file:///tmp/cv-fonts/noto.woff2', ['/tmp/cv-fonts']], expected: true },
  // Block: file:// outside allowed dir (path traversal-style)
  { fn: 'canLoadRequest', input: ['file:///etc/passwd', ['/tmp/cv-fonts']], expected: false },
  // Block: file:// to a sibling that *starts with* the allowed prefix but isn't a child
  { fn: 'canLoadRequest', input: ['file:///tmp/cv-fonts-evil/x', ['/tmp/cv-fonts']], expected: false },
  // Block: https — canLoadRequest only handles file:// + data: + about:
  { fn: 'canLoadRequest', input: ['https://fonts.googleapis.com/css', []], expected: false },
];

const results = [];
let failed = 0;

for (const { fn, input, expected } of cases) {
  const actual = fn === 'isFontsAllowlistUrl'
    ? isFontsAllowlistUrl(input)
    : canLoadRequest(...input);
  const passed = actual === expected;
  if (!passed) failed++;
  results.push({ fn, input: Array.isArray(input) ? input[0] : input, expected, actual, passed });
}

const report = {
  test: 'url-allowlist',
  passed: failed === 0,
  total: cases.length,
  failed,
  results: failed === 0 ? results.slice(0, 3) : results.filter(r => !r.passed),
};

console.log(JSON.stringify(report, null, 2));
process.exit(failed === 0 ? 0 : 1);
