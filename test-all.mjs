#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for yoCareer
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 yoCareer test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run('node', ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: fileExists('cv.md') ? 0 : 1, allowFail: true },
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs', expectExit: 0 },
  { name: 'dedup-tracker.mjs', expectExit: 0 },
  { name: 'merge-tracker.mjs', expectExit: 0 },
  { name: 'update-system.mjs check', expectExit: 0 },
];

for (const { name, expectExit, allowFail } of scripts) {
  let result;
  let exitCode = 0;
  try {
    result = execFileSync('node', name.split(' '), {
      cwd: ROOT, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    result = null;
    exitCode = e.status ?? 1;
  }
  if (result !== null && exitCode === expectExit) {
    pass(`${name} runs OK (exit ${expectExit})`);
  } else if (result !== null) {
    fail(`${name} exited ${exitCode}, expected ${expectExit}`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(join(ROOT, 'liveness-core.mjs'));

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }

  const closedMycareersfuture = classifyLiveness({
    finalUrl: 'https://www.mycareersfuture.gov.sg/job/engineering/senior-staff-embedded-software-engineer',
    bodyText: [
      'Senior Staff Embedded Software Engineer',
      'MaxLinear Asia Singapore Private Limited',
      '9 applications    Posted 27 Oct 2025    Closed on 26 Nov 2025',
      'Applications have closed for this job',
      'Log in to Apply',
      "You'll need to log in with Singpass to verify your identity.",
      'Roles & Responsibilities: design, develop and maintain embedded firmware for broadband communications ICs.',
    ].join('\n'),
    applyControls: ['Log in to Apply'],
  });
  if (closedMycareersfuture.result === 'expired') {
    pass('Closed postings with "Applications have closed" banner are detected');
  } else {
    fail(`Closed mycareersfuture posting misclassified as ${closedMycareersfuture.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const hasGo = run('go version 2>/dev/null');
  if (!hasGo) {
    console.log('   ⏭️  Skipping dashboard build (Go not installed)');
  } else {
    const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
    if (goBuild !== null) {
      pass('Dashboard compiles');
    } else {
      fail('Dashboard build failed');
    }
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist (core smoke-test subset; mode files checked in section 8)
const systemFiles = [
  'CLAUDE.md', 'VERSION', 'DATA_CONTRACT.md', 'AGENTS.md', 'GEMINI.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.agents/skills/yoCareer/SKILL.md', '.claude/skills/yoCareer/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Verify legacy per-platform command files are fully removed
const legacyPaths = ['.gemini/commands', '.opencode/commands'];
for (const p of legacyPaths) {
  if (existsSync(join(ROOT, p))) {
    fail(`Legacy path still exists: ${p} — should have been removed in agentskills.io migration`);
  } else {
    pass(`Legacy path removed: ${p}`);
  }
}

// Check user files are NOT tracked (gitignored)
const userFiles = [
  'config/profile.yml', 'modes/_profile.md', 'portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santiago', 'LegacyCompanyName', 'PrivateClientName',
  'private@example.com', '688921377', '/Users/legacy-user/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // English README + localized translations (all legitimately credit Santiago)
  'README.md', 'README.es.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'go.mod', 'test-all.mjs',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
  'followup.md', 'interview-prep.md', 'latex.md', 'patterns.md',
  'pdf-import.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// ── 9. AGENTS.md / CLAUDE.md INTEGRITY ──────────────────────────

console.log('\n9. AGENTS.md / CLAUDE.md integrity');

const claude = readFile('CLAUDE.md');
const agents = readFile('AGENTS.md');

// CLAUDE.md must be a slim shim: @AGENTS.md on first non-empty line, file under 30 lines
const claudeLines = claude.split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--'));
if (claudeLines[0]?.trim() === '@AGENTS.md' && claudeLines.length <= 30) {
  pass('CLAUDE.md is a slim shim importing AGENTS.md');
} else {
  fail('CLAUDE.md must be a slim shim: @AGENTS.md on first non-empty line, <= 30 lines');
}

// AGENTS.md must contain canonical sections as real headings (## Section Name)
const requiredSections = [
  'Data Contract', 'Update Check', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];
const agentsHeadings = [...agents.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1].trim());
for (const section of requiredSections) {
  if (agentsHeadings.some(h => h.includes(section))) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
  }
}

// SKILL.md content validation: parse YAML frontmatter and check required fields
function validateSkillFile(path) {
  const content = readFile(path);
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return { ok: false, error: 'missing frontmatter' };
  const lines = fmMatch[1].split('\n');
  const keys = {};
  for (const line of lines) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (m) keys[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  const missing = [];
  if (!keys.name) missing.push('name');
  if (!keys.description) missing.push('description');
  if (!keys['user-invocable'] && !keys['user_invocable']) missing.push('user-invocable/user_invocable');
  if (!keys.arguments && !keys.args) missing.push('arguments/args');
  if (missing.length) return { ok: false, error: `missing keys: ${missing.join(', ')}` };
  if (keys.name !== 'yoCareer') return { ok: false, error: `name is "${keys.name}", expected "yoCareer"` };
  return { ok: true };
}

const agentsSkill = validateSkillFile('.agents/skills/yoCareer/SKILL.md');
if (agentsSkill.ok) {
  pass('.agents/skills/yoCareer/SKILL.md frontmatter valid');
} else {
  fail(`.agents/skills/yoCareer/SKILL.md frontmatter invalid: ${agentsSkill.error}`);
}

const claudeSkill = validateSkillFile('.claude/skills/yoCareer/SKILL.md');
if (claudeSkill.ok) {
  pass('.claude/skills/yoCareer/SKILL.md frontmatter valid');
} else {
  fail(`.claude/skills/yoCareer/SKILL.md frontmatter invalid: ${claudeSkill.error}`);
}

// Cross-SKILL consistency: both files must reference the same set of modes
function extractSkillModes(path) {
  const content = readFile(path);
  // Match mode names from the routing table rows: | `mode` | ... |
  // Exclude table separators (all dashes) and header words like 'Input', 'Mode'
  const modes = [...content.matchAll(/\|\s*`?([a-z-]+)`?\s*\|/g)]
    .map(m => m[1])
    .filter(m => /^[a-z][a-z-]*$/.test(m) && !['mode', 'input', 'jd'].includes(m.toLowerCase()));
  // Also extract from argument-hint
  const hintMatch = content.match(/argument-hint:\s*"\[([^\]]+)\]"/);
  if (hintMatch) {
    hintMatch[1].split(/\s*\|\s*/).forEach(m => {
      const clean = m.trim().replace(/^`|`$/g, '');
      if (clean && /^[a-z][a-z-]*$/.test(clean) && !modes.includes(clean)) modes.push(clean);
    });
  }
  return [...new Set(modes)];
}

const agentsModes = extractSkillModes('.agents/skills/yoCareer/SKILL.md');
const claudeModes = extractSkillModes('.claude/skills/yoCareer/SKILL.md');
const missingFromAgents = claudeModes.filter(m => !agentsModes.includes(m));
const missingFromClaude = agentsModes.filter(m => !claudeModes.includes(m));
if (missingFromAgents.length === 0 && missingFromClaude.length === 0) {
  pass('SKILL.md files have consistent mode routing');
} else {
  if (missingFromAgents.length) fail(`.agents/skills/yoCareer/SKILL.md missing modes: ${missingFromAgents.join(', ')}`);
  if (missingFromClaude.length) fail(`.claude/skills/yoCareer/SKILL.md missing modes: ${missingFromClaude.join(', ')}`);
}

// Every mode routed in SKILL.md must have a corresponding modes/{mode}.md file
const allRoutedModes = [...new Set([...agentsModes, ...claudeModes])].filter(m => m !== 'update');
for (const mode of allRoutedModes) {
  if (fileExists(`modes/${mode}.md`)) {
    pass(`Routed mode has file: ${mode}.md`);
  } else {
    fail(`Routed mode missing file: modes/${mode}.md`);
  }
}

// GEMINI.md must also be a slim shim
const gemini = readFile('GEMINI.md');
const geminiLines = gemini.split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--'));
if (geminiLines[0]?.trim() === '@AGENTS.md' && geminiLines.length <= 30) {
  pass('GEMINI.md is a slim shim importing AGENTS.md');
} else {
  fail('GEMINI.md must be a slim shim: @AGENTS.md on first non-empty line, <= 30 lines');
}

// ── 10. VERSION FILE ─────────────────────────────────────────────

console.log('\n10. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── 11. CV ATS SELF-TEST ─────────────────────────────────────────

console.log('\n11. CV ATS self-test');

const hasPlaywright = (() => {
  try {
    execFileSync('node', ['-e', 'require("playwright")'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
})();

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
})();

if (!hasPlaywright || !hasPdftotext) {
  // Hard-fail in CI so missing tooling can't silently skip the regression test.
  // Local runs still warn rather than block, since most contributors won't have
  // both Playwright and pdftotext installed.
  const missing = !hasPlaywright ? 'Playwright' : 'pdftotext';
  if (process.env.CI === 'true') {
    fail(`ATS self-test cannot run in CI: ${missing} not installed`);
  } else {
    warn(`Skipping ATS self-test (${missing} not installed) — install for full coverage`);
  }
} else {
  const canaryHtml = 'tests/fixtures/canary-cv.cn.html';
  const canaryPdf = 'tests/fixtures/canary-cv.cn.pdf';
  const { rmSync } = await import('fs');

  try {
    // Generate PDF from canary HTML
    let genResult;
    try {
      genResult = execFileSync('node', ['generate-pdf.mjs', canaryHtml, canaryPdf, '--format=a4'], {
        cwd: ROOT, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (e) {
      genResult = null;
    }

    if (genResult !== null && fileExists(canaryPdf)) {
      pass('Canary CV PDF generated');

      // Run ATS self-test
      let selftestResult;
      try {
        selftestResult = execFileSync('node', ['tests/cv-ats-selftest.mjs', canaryPdf, '--lang=zh-cn', '--name=张伟'], {
          cwd: ROOT, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch (e) {
        selftestResult = e.stdout?.toString()?.trim() || null;
      }

      if (selftestResult) {
        try {
          const report = JSON.parse(selftestResult);
          if (report.passed) {
            pass('ATS self-test passed');
          } else {
            fail(`ATS self-test failed: ${JSON.stringify(report.checks)}`);
          }
        } catch {
          fail('ATS self-test returned invalid JSON');
        }
      } else {
        fail('ATS self-test crashed');
      }
    } else {
      fail('Canary CV PDF generation failed');
    }
  } finally {
    // Always clean up — even on SIGINT, test-runner crash, or assertion failure.
    try { rmSync(join(ROOT, canaryPdf)); } catch {}
  }

  // Negative fixtures: each broken canary MUST be rejected by the selftest.
  // --no-ats-check on PDF generation so we don't run the auto-embedded
  // selftest twice; we run it explicitly with --expect-fail below.
  const brokenFixtures = [
    'canary-cv.cn-broken-no-name.html',
    'canary-cv.cn-broken-no-phone.html',
    'canary-cv.cn-broken-header-after-body.html',
    'canary-cv.cn-broken-fffd.html',
    'canary-cv.cn-broken-box-chars.html',
  ];

  for (const fixture of brokenFixtures) {
    const inHtml = `tests/fixtures/${fixture}`;
    const outPdf = `tests/fixtures/${fixture.replace(/\.html$/, '.pdf')}`;
    try {
      let genResult;
      try {
        genResult = execFileSync('node', ['generate-pdf.mjs', inHtml, outPdf, '--format=a4', '--no-ats-check'], {
          cwd: ROOT, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch (e) {
        genResult = null;
      }

      if (genResult === null || !fileExists(outPdf)) {
        fail(`Broken-fixture PDF generation failed: ${fixture}`);
        continue;
      }

      // --expect-fail: selftest exits 0 only when it correctly rejected the PDF.
      let exitCode = 0;
      try {
        execFileSync(
          'node',
          ['tests/cv-ats-selftest.mjs', outPdf, '--lang=zh-cn', '--name=张伟', '--expect-fail'],
          { cwd: ROOT, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch (e) {
        exitCode = e.status ?? 1;
      }

      if (exitCode === 0) {
        pass(`Broken fixture rejected: ${fixture}`);
      } else {
        fail(`Broken fixture NOT rejected (regression): ${fixture} — selftest passed it`);
      }
    } finally {
      try { rmSync(join(ROOT, outPdf)); } catch {}
    }
  }
}

// ── 12. RISK TIERS INTEGRITY ────────────────────────────────────

console.log('\n12. Risk tiers integrity');

// Capture stdout on non-zero exit too — selftest writes the error JSON to stdout
// before exiting 1. The shared run() helper discards it on error.
let riskTiersResult;
try {
  riskTiersResult = execFileSync('node', ['tests/risk-tiers-selftest.mjs'], {
    cwd: ROOT, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch (e) {
  riskTiersResult = e.stdout?.toString()?.trim() || null;
}
if (riskTiersResult) {
  try {
    const report = JSON.parse(riskTiersResult);
    if (report.passed) {
      pass(`Risk tiers valid (${report.signal_count} signals)`);
    } else {
      fail(`Risk tiers validation failed: ${report.errors.join('; ')}`);
    }
  } catch {
    fail('Risk tiers self-test returned invalid JSON');
  }
} else {
  fail('Risk tiers self-test crashed');
}

// ── 13. URL ALLOWLIST REGRESSION ────────────────────────────────

console.log('\n13. URL allowlist regression (CodeQL fix)');

let urlAllowlistResult;
try {
  urlAllowlistResult = execFileSync('node', ['tests/url-allowlist-selftest.mjs'], {
    cwd: ROOT, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch (e) {
  urlAllowlistResult = e.stdout?.toString()?.trim() || null;
}
if (urlAllowlistResult) {
  try {
    const report = JSON.parse(urlAllowlistResult);
    if (report.passed) {
      pass(`URL allowlist regression test passed (${report.total} cases)`);
    } else {
      fail(`URL allowlist regression failed: ${report.failed}/${report.total} cases`);
    }
  } catch {
    fail('URL allowlist selftest returned invalid JSON');
  }
} else {
  fail('URL allowlist selftest crashed');
}

// ── 14. PDF INBOUND BRIDGE ──────────────────────────────────────

console.log('\n14. PDF inbound bridge (bridges/pdf-extract.mjs)');

if (!fileExists('bridges/pdf-extract.mjs')) {
  fail('bridges/pdf-extract.mjs missing');
} else if (!hasPlaywright) {
  if (process.env.CI === 'true') {
    fail('PDF inbound bridge cannot test in CI: Playwright not installed (cannot build fixtures)');
  } else {
    warn('Skipping PDF inbound bridge tests (Playwright not installed) — install for full coverage');
  }
} else {
  // Build fixture PDFs from the HTML sources, run extraction, assert that
  // classification + key fields land where expected. Cleanup is unconditional.
  const { rmSync } = await import('fs');
  const offerHtml = 'tests/fixtures/pdf-inbox/offer-zh.html';
  const offerPdf = 'tests/fixtures/pdf-inbox/offer-zh.pdf';
  const jdHtml = 'tests/fixtures/pdf-inbox/jd-zh.html';
  const jdPdf = 'tests/fixtures/pdf-inbox/jd-zh.pdf';

  try {
    let buildOk = true;
    for (const [src, out] of [[offerHtml, offerPdf], [jdHtml, jdPdf]]) {
      try {
        execFileSync('node', ['generate-pdf.mjs', src, out, '--format=a4', '--no-ats-check'], {
          cwd: ROOT, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (e) {
        fail(`PDF inbound fixture build failed: ${src} → ${out}: ${e.message}`);
        buildOk = false;
      }
    }

    if (buildOk) {
      pass('PDF inbound fixtures built');

      // Import the bridge and run extraction directly so we can assert on the
      // structured signal output rather than parsing CLI text.
      const { extractPdf, pdfToSignal, classifyPdfText } = await import('./bridges/pdf-extract.mjs');

      try {
        const offerEx = await extractPdf(join(ROOT, offerPdf));
        const offerSignal = pdfToSignal(offerEx, 'zh-cn');
        if (offerSignal.pdf_classification === 'offer') {
          pass('Chinese offer PDF classified as offer');
        } else {
          fail(`Chinese offer PDF misclassified as ${offerSignal.pdf_classification}`);
        }
        if (offerSignal.salary && offerSignal.salary.includes('35,000')) {
          pass('Offer salary extracted');
        } else {
          fail(`Offer salary not extracted (got "${offerSignal.salary}")`);
        }
        const noteText = offerSignal.scoring_notes.join(' ');
        if (noteText.includes('14薪')) pass('14薪 extracted');
        else fail('14薪 not extracted');
        if (noteText.includes('housing_fund')) pass('公积金 extracted');
        else fail('公积金 not extracted');
        if (noteText.includes('probation')) pass('试用期 extracted');
        else fail('试用期 not extracted');
        if (noteText.includes('equity_mentioned')) pass('期权 detected');
        else fail('期权 not detected');
      } catch (e) {
        fail(`Offer PDF extraction crashed: ${e.message}`);
      }

      try {
        const jdEx = await extractPdf(join(ROOT, jdPdf));
        const jdSignal = pdfToSignal(jdEx, 'zh-cn');
        if (jdSignal.pdf_classification === 'jd') {
          pass('Chinese JD PDF classified as jd');
        } else {
          fail(`Chinese JD PDF misclassified as ${jdSignal.pdf_classification}`);
        }
      } catch (e) {
        fail(`JD PDF extraction crashed: ${e.message}`);
      }

      // Sanity: classifyPdfText returns 'unknown' on noise.
      const noiseLabel = classifyPdfText('lorem ipsum dolor sit amet '.repeat(20));
      if (noiseLabel === 'unknown') pass('Noise text classified as unknown');
      else fail(`Noise classification expected 'unknown', got '${noiseLabel}'`);
    }
  } finally {
    try { rmSync(join(ROOT, offerPdf)); } catch {}
    try { rmSync(join(ROOT, jdPdf)); } catch {}
  }
}

// ── 15. WEB-UI SERVER ───────────────────────────────────────────

console.log('\n15. Web-ui server (web-ui/server.mjs)');

if (!fileExists('web-ui/server.mjs') || !fileExists('web-ui/index.html') ||
    !fileExists('web-ui/main.js') || !fileExists('web-ui/styles.css')) {
  fail('web-ui/ files missing');
} else {
  pass('web-ui/ files present');

  // Spawn the server on an unused port, hit a few endpoints, verify the
  // path-traversal guard, then tear down. Bound to 127.0.0.1 only.
  const { spawn } = await import('child_process');
  const port = 5179;
  const child = spawn('node', ['web-ui/server.mjs', `--port=${port}`, '--no-open'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait briefly for the listen callback. The server prints its URL on
  // success — we read stdout once to confirm rather than polling.
  await new Promise((resolveStart, rejectStart) => {
    const timer = setTimeout(() => rejectStart(new Error('startup_timeout')), 5000);
    child.stdout.once('data', (buf) => {
      if (buf.toString().includes(`:${port}`)) {
        clearTimeout(timer);
        resolveStart();
      }
    });
    child.once('error', (err) => { clearTimeout(timer); rejectStart(err); });
  }).catch((err) => {
    fail(`web-ui server startup: ${err.message}`);
    try { child.kill(); } catch {}
  });

  if (!child.killed) {
    try {
      const fetchJson = async (path) => {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        return { status: res.status, text: await res.text() };
      };
      const fetchHead = async (path) => {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        return res.status;
      };

      const apps = await fetchJson('/api/applications');
      if (apps.status === 200 && JSON.parse(apps.text).apps !== undefined) {
        pass('web-ui /api/applications responds');
      } else {
        fail(`/api/applications returned ${apps.status}`);
      }

      const metrics = await fetchJson('/api/metrics');
      if (metrics.status === 200 && JSON.parse(metrics.text).total !== undefined) {
        pass('web-ui /api/metrics responds');
      } else {
        fail(`/api/metrics returned ${metrics.status}`);
      }

      const reports = await fetchJson('/api/reports');
      if (reports.status === 200 && Array.isArray(JSON.parse(reports.text).reports)) {
        pass('web-ui /api/reports responds');
      } else {
        fail(`/api/reports returned ${reports.status}`);
      }

      const indexPage = await fetch(`http://127.0.0.1:${port}/`);
      const indexBody = await indexPage.text();
      if (indexPage.status === 200 && indexBody.includes('yoCareer')) {
        pass('web-ui serves index.html');
      } else {
        fail(`/ returned ${indexPage.status}`);
      }

      // Path traversal: must reject. Try a URL-encoded `..` walk and a raw
      // walk in the static path. Both must yield 404 (never 200 with content
      // from outside the allowed directories).
      const traverse1 = await fetchHead('/api/reports/..%2F..%2Fpackage.json');
      const traverse2 = await fetchHead('/static/../package.json');
      const traverse3 = await fetchHead('/api/output/..%2F..%2Fpackage.json');
      if (traverse1 === 404 && traverse2 === 404 && traverse3 === 404) {
        pass('web-ui rejects path traversal');
      } else {
        fail(`Path traversal not blocked (got ${traverse1}/${traverse2}/${traverse3})`);
      }

      // Method check: POST should be rejected.
      const post = await fetch(`http://127.0.0.1:${port}/api/applications`, { method: 'POST' });
      if (post.status === 405) pass('web-ui rejects non-GET methods');
      else fail(`POST returned ${post.status} (expected 405)`);
    } finally {
      child.kill();
      // Drain so the test runner doesn't hang on an unread stream.
      child.stdout.resume();
      child.stderr.resume();
    }
  }
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
