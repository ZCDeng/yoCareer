#!/usr/bin/env node

/**
 * generate-pdf.mjs — HTML → PDF via Playwright
 *
 * Usage:
 *   node yoCareer/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]
 *
 * Requires: @playwright/test (or playwright) installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { resolve, dirname, join } from 'path';
import { readFile } from 'fs/promises';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists (fresh setup)
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

/**
 * Normalize text for ATS compatibility by converting problematic Unicode.
 *
 * ATS parsers and legacy systems often fail on em-dashes, smart quotes,
 * zero-width characters, and non-breaking spaces. These cause mojibake,
 * parsing errors, or display issues. See issue #1.
 *
 * Only touches body text — preserves CSS, JS, tag attributes, and URLs.
 * Returns { html, replacements } so the caller can log what was changed.
 */
function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => { replacements[key] = (replacements[key] || 0) + n; };

  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) { out += sanitizeText(masked.slice(i)); break; }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) { out += masked.slice(lt); break; }
    out += masked.slice(lt, gt + 1);
    i = gt + 1;
  }

  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\u2014/g, () => { bump('em-dash', 1); return '-'; });
    t = t.replace(/\u2013/g, () => { bump('en-dash', 1); return '-'; });
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, () => { bump('smart-double-quote', 1); return '"'; });
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, () => { bump('smart-single-quote', 1); return "'"; });
    t = t.replace(/\u2026/g, () => { bump('ellipsis', 1); return '...'; });
    t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => { bump('zero-width', 1); return ''; });
    t = t.replace(/\u00A0/g, () => { bump('nbsp', 1); return ' '; });
    return t;
  }
}

// Allow file:// requests scoped to local fonts/CV-source directories,
// plus data: and about: URIs (used by Playwright internals + inlined assets).
export function canLoadRequest(requestUrl, allowedLocalDirs) {
  if (requestUrl.startsWith('data:') || requestUrl.startsWith('about:')) {
    return true;
  }

  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'file:') {
    return false;
  }

  const localPath = resolve(decodeURIComponent(parsed.pathname));
  return allowedLocalDirs.some(dir =>
    localPath === dir || localPath.startsWith(`${dir}/`)
  );
}

// Allow Google Fonts CDN for CJK font loading (Noto Sans SC, etc.).
// Hostname-equality match — `startsWith` would let `fonts.googleapis.com.evil.com`
// through (CodeQL js/incomplete-url-substring-sanitization).
export function isFontsAllowlistUrl(requestUrl) {
  try {
    const u = new URL(requestUrl);
    return u.protocol === 'https:'
      && (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com');
  } catch {
    return false;
  }
}

// Best-effort extraction so the auto-embedded ATS selftest can pass --name=
// without the agent having to recompute it. Reads the first <h1> body text
// (strips inner tags). Returns '' if no h1 is present.
export function extractCandidateName(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return '';
  return match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Reads the lang attribute from <html ...>. Defaults to 'zh-cn' for any
// CJK / zh-* tag, 'en' otherwise. The ATS selftest only branches on these two.
export function detectLang(html) {
  const match = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  if (!match) return 'en';
  const tag = match[1].toLowerCase();
  if (tag.startsWith('zh') || tag.startsWith('ja') || tag.startsWith('ko')) return 'zh-cn';
  return 'en';
}

async function generatePDF() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath, outputPath, format = 'a4';
  let noAtsCheck = false;
  let atsStrict = false;

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (arg === '--no-ats-check') {
      noAtsCheck = true;
    } else if (arg === '--ats-strict') {
      atsStrict = true;
    } else if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  // Validate format
  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    console.error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📏 Format: ${format.toUpperCase()}`);

  // Read HTML to inject font paths as absolute file:// URLs
  let html = await readFile(inputPath, 'utf-8');

  // Resolve font paths relative to yoCareer/fonts/
  // Handles both `./fonts/` (templates at root) and `../fonts/` (templates/ subdir)
  const fontsDir = resolve(__dirname, 'fonts');
  html = html.replace(
    /url\(['"]?\.\.?\/fonts\//g,
    `url('file://${fontsDir}/`
  );
  // Close any unclosed quotes from the replacement (handles all font formats)
  html = html.replace(
    /file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
    `file://$1.$2')`
  );

  // Normalize text for ATS compatibility (issue #1)
  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const allowedLocalDirs = [
      resolve(fontsDir),
      resolve(dirname(inputPath)),
    ];

    await page.route('**/*', (route) => {
      const requestUrl = route.request().url();
      if (canLoadRequest(requestUrl, allowedLocalDirs) || isFontsAllowlistUrl(requestUrl)) {
        return route.continue();
      }
      return route.abort();
    });

    // Set content with file base URL for any relative resources
    await page.setContent(html, {
      waitUntil: 'networkidle',
      baseURL: `file://${dirname(inputPath)}/`,
    });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: format,
      printBackground: true,
      margin: {
        top: '0.6in',
        right: '0.6in',
        bottom: '0.6in',
        left: '0.6in',
      },
      preferCSSPageSize: false,
    });

    // Write PDF
    const { writeFile } = await import('fs/promises');
    await writeFile(outputPath, pdfBuffer);

    // Count pages (approximate from PDF structure)
    const pdfString = pdfBuffer.toString('latin1');
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

    console.log(`✅ PDF generated: ${outputPath}`);
    console.log(`📊 Pages: ${pageCount}`);
    console.log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // Auto-run ATS selftest unless opted out. Required-step per modes/zh-cn/pdf.md
    // and modes/pdf.md so CJK regressions can't slip through. Soft-fail by default
    // (warns, exits 0) so PDF generation is not blocked; --ats-strict makes it
    // hard-fail. Skips silently when pdftotext or the selftest is unavailable.
    if (!noAtsCheck) {
      const lang = detectLang(html);
      const candidateName = extractCandidateName(html);
      const selftestPath = join(__dirname, 'tests', 'cv-ats-selftest.mjs');

      if (!existsSync(selftestPath)) {
        console.log(`⚠️  ATS selftest skipped (not found at ${selftestPath})`);
      } else {
        const selftestArgs = [selftestPath, outputPath, `--lang=${lang}`];
        if (candidateName) selftestArgs.push(`--name=${candidateName}`);
        try {
          const out = execFileSync(process.execPath, selftestArgs, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const report = JSON.parse(out);
          if (report.warnings?.some(w => w.includes('pdftotext not found'))) {
            console.log('⚠️  ATS selftest skipped (pdftotext not installed)');
          } else if (report.passed) {
            console.log(`🛡️  ATS selftest passed (lang=${lang}, name="${candidateName}")`);
          } else {
            console.log(`⚠️  ATS selftest FAILED — ${report.warnings?.join('; ') || 'see checks'}`);
            console.log(JSON.stringify(report.checks, null, 2));
            if (atsStrict) throw new Error('ATS selftest failed (--ats-strict)');
          }
        } catch (err) {
          // execFileSync throws on non-zero exit. Selftest exits 1 on failure
          // and writes the JSON report to stdout before exiting.
          if (err.message?.startsWith('ATS selftest failed')) throw err;
          const stdout = err.stdout?.toString() || '';
          if (stdout.trim()) {
            try {
              const report = JSON.parse(stdout);
              console.log(`⚠️  ATS selftest FAILED — ${report.warnings?.join('; ') || 'see checks'}`);
              console.log(JSON.stringify(report.checks, null, 2));
              if (atsStrict) throw new Error('ATS selftest failed (--ats-strict)');
            } catch (parseErr) {
              if (parseErr.message?.startsWith('ATS selftest failed')) throw parseErr;
              console.log(`⚠️  ATS selftest crashed: ${err.message}`);
            }
          } else {
            console.log(`⚠️  ATS selftest crashed: ${err.message}`);
          }
        }
      }
    }

    return { outputPath, pageCount, size: pdfBuffer.length };
  } finally {
    if (context) {
      await context.close();
    }
    await browser.close();
  }
}

// Run as script only — skip when imported (e.g., from selftests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generatePDF().catch((err) => {
    console.error('❌ PDF generation failed:', err.message);
    process.exit(1);
  });
}
