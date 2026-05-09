#!/usr/bin/env node

/**
 * pdf-extract.mjs — local PDF → text → manual_signal_import bridge
 *
 * Reads PDFs from `data/inbox/` (or any path you point it at), extracts text
 * with pdfjs-dist (no native deps, no OCR), classifies each as offer letter
 * vs JD vs unknown via Chinese / English keyword heuristics, extracts the
 * obvious structured fields (salary, 13薪, 公积金, 试用期, etc.) for offer
 * letters, and appends one normalized signal per PDF to data/signals.ndjson.
 *
 * Library API:
 *   import { extractPdf, classifyPdfText, parseChineseOffer } from 'bridges/pdf-extract.mjs'
 *
 * CLI:
 *   node bridges/pdf-extract.mjs <file-or-directory> [--out=data/signals.ndjson] [--lang=zh-cn|en] [--dry-run]
 *
 * Notes:
 *   - pdfjs-dist returns CJK characters separated by spaces (per-glyph layout).
 *     We collapse runs of single CJK chars back into words. Latin words stay.
 *   - Dedup: each extracted signal carries pdf_sha256; scan.mjs's
 *     manual_signal_import already dedups by url (or you can re-run safely —
 *     existing hashes are skipped before append).
 *   - No OCR. PDFs that are scanned images produce empty text and get logged
 *     as `extraction_empty`; the user is told to OCR externally.
 */

import { readFile, readdir, stat, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, basename, extname, join } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const CJK_CHAR_CLASS = '[一-鿿㐀-䶿　-〿＀-￯]';

// Some PDF text streams emit Kangxi Radicals (U+2F00–U+2FDF) or CJK Radicals
// Supplement (U+2E80–U+2EFF) instead of the canonical Unified ideograph for
// glyphs like 月, 日, 工, 人. pdfjs-dist surfaces whatever the font cmap
// declared. Build a canonicalization map for the radicals that actually
// appear in real-world Chinese offer letters / JDs we've seen.
const RADICAL_TO_UNIFIED = {
  '⼀': '一', '⼆': '二', '⼈': '人', '⼊': '入', '⼊': '入',
  '⼯': '工', '⼟': '土', '⼠': '士', '⼤': '大', '⼥': '女',
  '⼦': '子', '⼩': '小', '⼭': '山', '⼯': '工', '⼴': '广',
  '⼸': '弓', '⼿': '手', '⽂': '文', '⽃': '斗', '⽄': '斤',
  '⽅': '方', '⽇': '日', '⽉': '月', '⽊': '木', '⽌': '止',
  '⽐': '比', '⽑': '毛', '⽒': '氏', '⽔': '水', '⽕': '火',
  '⽝': '犬', '⽟': '玉', '⽣': '生', '⽤': '用', '⽥': '田',
  '⽩': '白', '⽪': '皮', '⽰': '示', '⽳': '穴', '⽴': '立',
  '⽵': '竹', '⽶': '米', '⽸': '矛', '⽻': '羽', '⾇': '舛',
  '⾍': '虫', '⾎': '血', '⾏': '行', '⾐': '衣', '⾔': '言',
  '⾚': '赤', '⾛': '走', '⾜': '足', '⾝': '身', '⾞': '车',
  '⾟': '辛', '⾠': '辰', '⾢': '邑', '⾥': '里', '⾦': '金',
  '⾳': '音', '⾸': '首', '⾷': '食', '⾼': '高', '⾼': '高',
  '⾯': '面', '⻄': '西', '⻘': '青', '⻘': '青', '⻝': '食',
  '⻞': '飞', '⻥': '鱼', '⻦': '鸟', '⻪': '页', '⻫': '齐',
  '⻬': '齐', '⻰': '龙', '⻩': '黄', '⻰': '龙', '⻅': '见',
  '⻆': '角', '⻇': '冈', '⻌': '辶', '⻋': '车', '⻒': '马',
  '⻓': '长', '⻔': '门', '⻘': '青', '⻙': '韦', '⻜': '飞',
  '⻝': '食', '⻞': '飞', '⻟': '香', '⻠': '骨', '⻡': '鬼',
  '⻢': '马', '⻣': '骨', '⻤': '鬼', '⻥': '鱼', '⻦': '鸟',
  '⻪': '页', '⻫': '齐', '⻬': '齐', '⻭': '齿', '⻮': '齿',
  '⻯': '麦', '⻰': '龙', '⻱': '龟', '⺁': '厂', '⺄': '乙',
  '⺅': '亻', '⺆': '冂', '⺇': '几', '⺉': '刂', '⺊': '卜',
  '⺌': '小', '⺍': '小', '⺎': '兀', '⺏': '尢', '⺐': '尢',
  '⺑': '巳', '⺒': '已', '⺓': '幺', '⺔': '彐', '⺕': '彐',
  '⺗': '心', '⺘': '扌', '⺙': '攵', '⺛': '旡', '⺜': '日',
  '⺝': '月', '⺞': '歹', '⺟': '母', '⺠': '民', '⺡': '氵',
  '⺢': '水', '⺣': '灬', '⺥': '爪', '⺦': '父', '⺨': '犭',
  '⺩': '王', '⺪': '疋', '⺫': '罒', '⺭': '礻', '⺮': '竹',
  '⺯': '糹', '⺱': '罒', '⺲': '罒', '⺳': '罒', '⺴': '网',
  '⺵': '网', '⺹': '老', '⺻': '聿', '⺼': '肉', '⺽': '臼',
  '⻁': '虎', '⻂': '衤',
};
const RADICAL_RE = new RegExp('[' + Object.keys(RADICAL_TO_UNIFIED).join('') + ']', 'g');

function unifyKangxiRadicals(text) {
  return text.replace(RADICAL_RE, ch => RADICAL_TO_UNIFIED[ch] || ch);
}

/**
 * pdfjs-dist returns CJK glyphs spaced individually. Collapse runs of single
 * CJK chars separated by whitespace into joined words — but leave whitespace
 * between Latin words alone.
 *
 * Example: "张 伟 上 海 SaaS 创 业 经 验" → "张伟上海 SaaS 创业经验"
 */
export function normalizeCJKSpacing(text) {
  if (!text) return '';
  let out = unifyKangxiRadicals(text);
  const re = new RegExp(`(${CJK_CHAR_CLASS})[\\s ]+(?=${CJK_CHAR_CLASS})`, 'g');
  let prev;
  // Iterate to fixpoint — each pass collapses one gap per match site, so
  // dense CJK runs need multiple passes.
  do {
    prev = out;
    out = out.replace(re, '$1');
  } while (out !== prev);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract text from a single PDF. Uses pdfjs-dist legacy ESM build (no worker
 * dependency, runs in plain Node).
 */
export async function extractPdf(filePath) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = await readFile(filePath);
  const data = new Uint8Array(buffer);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const loadingTask = getDocument({ data, disableFontFace: true, useSystemFonts: false });
  const pdf = await loadingTask.promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const raw = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
    pages.push(raw);
  }

  const rawText = pages.join('\n');
  const text = normalizeCJKSpacing(rawText);

  let metadata = {};
  try {
    const meta = await pdf.getMetadata();
    metadata = {
      title: meta?.info?.Title || '',
      author: meta?.info?.Author || '',
      subject: meta?.info?.Subject || '',
      creationDate: meta?.info?.CreationDate || '',
    };
  } catch {
    // Metadata is best-effort; some PDFs don't expose it.
  }

  return {
    file: filePath,
    sha256,
    pageCount: pdf.numPages,
    text,
    rawText,
    metadata,
  };
}

const OFFER_HINTS_ZH = ['录用通知', '录用函', 'offer letter', '入职通知', '薪资构成', '薪资方案', '基本工资', '月薪', '年薪', '总包', '试用期', '签到费', 'sign-on'];
const OFFER_HINTS_EN = ['offer letter', 'offer of employment', 'compensation', 'base salary', 'sign-on bonus', 'probation period', 'start date'];
const JD_HINTS_ZH = ['岗位职责', '任职要求', '岗位要求', '工作内容', '招聘', '薪资范围', 'job description', 'jd'];
const JD_HINTS_EN = ['responsibilities', 'requirements', 'qualifications', 'about the role', 'we are looking for', 'job description'];

/**
 * Heuristic classification: 'offer' / 'jd' / 'unknown'. Picks whichever bucket
 * has the higher hit count; ties default to 'unknown' so the agent decides.
 */
export function classifyPdfText(text) {
  if (!text || text.length < 50) return 'unknown';
  const lower = text.toLowerCase();

  let offerScore = 0;
  let jdScore = 0;
  for (const h of OFFER_HINTS_ZH) if (text.includes(h)) offerScore++;
  for (const h of OFFER_HINTS_EN) if (lower.includes(h)) offerScore++;
  for (const h of JD_HINTS_ZH) if (text.includes(h)) jdScore++;
  for (const h of JD_HINTS_EN) if (lower.includes(h)) jdScore++;

  if (offerScore === 0 && jdScore === 0) return 'unknown';
  if (offerScore > jdScore) return 'offer';
  if (jdScore > offerScore) return 'jd';
  return 'unknown';
}

/**
 * China-market offer field extraction. Returns whatever it could parse with
 * confidence labeled per field. Caller decides whether to store directly or
 * surface to the user for manual review.
 *
 * The user is the source of truth — these are starting hints, not assertions.
 */
export function parseChineseOffer(text) {
  const fields = {};
  const notes = [];

  // 月薪 / 基本工资 / 年薪 / 总包 — first-match wins
  // Examples this catches: "月薪 35,000 元", "基本工资:¥30000", "年薪 60 万", "总包 80 万"
  const salaryPatterns = [
    { kind: 'monthly', re: /(?:月薪|基本工资|月度工资)[\s:：]*[¥$]?\s*([\d,]+(?:\.\d+)?)\s*(?:元|RMB|CNY|k|K|w|W|万)?/ },
    { kind: 'annual_total', re: /(?:总包|年总包|年度总包)[\s:：]*[¥$]?\s*([\d,]+(?:\.\d+)?)\s*(?:元|万|w|W|RMB|CNY)?/ },
    { kind: 'annual_base', re: /(?:年薪|年度薪资)[\s:：]*[¥$]?\s*([\d,]+(?:\.\d+)?)\s*(?:元|万|w|W|RMB|CNY)?/ },
  ];
  for (const { kind, re } of salaryPatterns) {
    const m = text.match(re);
    if (m) {
      fields[`salary_${kind}`] = m[0];
      break;
    }
  }

  // 13/14/15/16 薪 — restrict to the realistic offer range and reject when
  // preceded by another digit (otherwise "2026-06-01 薪" matches "01薪").
  const monthsMatch = text.match(/(?:^|[^\d])(1[3-6])\s*薪/);
  if (monthsMatch) {
    fields.months_per_year = `${monthsMatch[1]}薪`;
  }

  // 五险一金 housing fund percentage
  const housingFundMatch = text.match(/公积金[\s:：]*\d+(?:\.\d+)?\s*%/);
  if (housingFundMatch) {
    fields.housing_fund = housingFundMatch[0];
  }

  // 试用期 probation period
  const probationMatch = text.match(/试用期[\s:：]*\d+\s*(?:个月|月|月份)/);
  if (probationMatch) {
    fields.probation = probationMatch[0];
  }

  // 年终奖 / 奖金 year-end bonus
  const bonusMatch = text.match(/(?:年终奖|年度奖金|绩效奖金)[^。\n]{0,40}/);
  if (bonusMatch) {
    fields.bonus = bonusMatch[0].trim();
  }

  // 期权 / 股票 / RSU equity (presence only — value extraction is hard)
  if (/期权|股票|RSU|限制性股票|股权/.test(text)) {
    fields.equity_mentioned = true;
  }

  // 入职日期 start date
  const startDateMatch = text.match(/(?:入职日期|入职时间|起薪日期|生效日期)[\s:：]*\d{4}\s*[-年.\/]?\s*\d{1,2}\s*[-月.\/]?\s*\d{1,2}\s*日?/);
  if (startDateMatch) {
    fields.start_date = startDateMatch[0];
  }

  // Position title — require a colon (full or half-width) so "职位信息" is
  // skipped and only "职位：高级算法工程师" matches. Stop at the next label
  // (部门 / 汇报 / 入职 / 薪资 / 月薪 / 试用) or punctuation, whichever comes
  // first, since real offer letters chain labels without separators.
  const titleMatch = text.match(/(?:职位|岗位|职务|Position)\s*[:：]\s*([^\s。\n,，;；]{2,30}?)(?=\s*(?:部门|汇报|入职|薪资|月薪|年薪|试用|福利|起薪|工作|$))/);
  if (titleMatch) {
    fields.title = titleMatch[1];
  } else {
    // Fallback: shorter window if no label keywords follow.
    const fallback = text.match(/(?:职位|岗位|职务|Position)\s*[:：]\s*([^\s。\n,，;；]{2,15})/);
    if (fallback) fields.title = fallback[1];
  }

  // Company — look for the most common 公司/有限公司/Inc/Ltd patterns
  const companyMatch = text.match(/([一-鿿]{2,30}(?:股份)?有限公司|[一-鿿]{2,15}(?:科技|网络|信息|数据|技术|集团))/);
  if (companyMatch) {
    fields.company = companyMatch[1];
  }

  if (Object.keys(fields).length === 0) {
    notes.push('no_chinese_offer_fields_matched');
  }

  return { fields, notes };
}

/**
 * Lift the extraction result into a normalized signal object for
 * data/signals.ndjson. Schema matches scan.mjs:normalizeSignal — anything
 * extra is preserved verbatim.
 */
export function pdfToSignal(extraction, lang = 'zh-cn') {
  const cls = classifyPdfText(extraction.text);
  const fileBase = basename(extraction.file, extname(extraction.file));

  let kind, recommended_action;
  if (cls === 'offer') {
    kind = 'pdf_offer';
    recommended_action = 'review_offer_against_target';
  } else if (cls === 'jd') {
    kind = 'pdf_jd';
    recommended_action = 'evaluate_against_cv';
  } else {
    kind = 'pdf_unknown';
    recommended_action = 'manual_classify';
  }

  let companyHint = '';
  let titleHint = '';
  let salaryHint = '';
  let evidenceText = extraction.text.slice(0, 240).replace(/\s+/g, ' ').trim();
  const scoringNotes = [];

  if (cls === 'offer' && lang === 'zh-cn') {
    const offer = parseChineseOffer(extraction.text);
    if (offer.fields.company) companyHint = offer.fields.company;
    if (offer.fields.title) titleHint = offer.fields.title;
    if (offer.fields.salary_monthly) salaryHint = offer.fields.salary_monthly;
    else if (offer.fields.salary_annual_total) salaryHint = offer.fields.salary_annual_total;
    else if (offer.fields.salary_annual_base) salaryHint = offer.fields.salary_annual_base;
    for (const [k, v] of Object.entries(offer.fields)) {
      scoringNotes.push(`${k}: ${typeof v === 'string' ? v : 'true'}`);
    }
    if (offer.notes.length) scoringNotes.push(...offer.notes);
  }

  if (!companyHint) companyHint = extraction.metadata.author || fileBase;
  if (!titleHint) titleHint = extraction.metadata.title || fileBase;

  return {
    kind,
    company: companyHint,
    role: titleHint,
    title: titleHint,
    url: `local:${extraction.file}`,
    source_platform: 'pdf_inbox',
    source_author: extraction.metadata.author || '',
    location: '',
    salary: salaryHint,
    contact_hint: '',
    posted_at: extraction.metadata.creationDate || '',
    freshness: 'unknown',
    confidence: cls === 'unknown' ? 0.45 : 0.6,
    evidence_text: evidenceText,
    recommended_action,
    source: 'pdf_extract_bridge',
    scoring_notes: scoringNotes,
    pdf_sha256: extraction.sha256,
    pdf_pages: extraction.pageCount,
    pdf_classification: cls,
  };
}

/**
 * Append signals to an ndjson file, deduplicating by pdf_sha256 against
 * existing rows. Returns counts of appended / skipped.
 */
export async function appendSignals(targetPath, signals) {
  let existing = '';
  if (existsSync(targetPath)) {
    existing = await readFile(targetPath, 'utf-8');
  }
  const existingHashes = new Set();
  for (const line of existing.split(/\n+/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.pdf_sha256) existingHashes.add(row.pdf_sha256);
    } catch {
      // Skip malformed rows; manual_signal_import will surface them later.
    }
  }

  const fresh = signals.filter(s => !existingHashes.has(s.pdf_sha256));
  if (fresh.length === 0) return { appended: 0, skipped: signals.length };

  const lines = fresh.map(s => JSON.stringify(s)).join('\n') + '\n';
  await appendFile(targetPath, lines, 'utf-8');
  return { appended: fresh.length, skipped: signals.length - fresh.length };
}

/**
 * Walk a directory or single file and return all .pdf paths.
 */
async function collectPdfPaths(target) {
  const stats = await stat(target);
  if (stats.isFile()) return target.endsWith('.pdf') ? [target] : [];
  if (stats.isDirectory()) {
    const entries = await readdir(target);
    const out = [];
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const full = join(target, name);
      const s = await stat(full);
      if (s.isFile() && full.endsWith('.pdf')) out.push(full);
    }
    return out;
  }
  return [];
}

/**
 * Try to read ~/.yocareer/daemon.json and POST signals to /api/signals.
 *
 * Returns { delivered: N, skipped: M, port } on success, or null when the
 * daemon is unreachable / not running. The caller falls back to NDJSON
 * write in that case.
 *
 * Daemon presence is checked via /healthz (200 = up). If the daemon exists
 * but rejects the request (auth missing, schema mismatch), we still return
 * null so the caller can offer a clear NDJSON fallback rather than dropping
 * data on the floor.
 */
export async function tryDaemonUpsert(signals) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const infoFile = process.env.YOCAREER_INFO_FILE || join(home, '.yocareer', 'daemon.json');
  if (!existsSync(infoFile)) return null;

  let info;
  try {
    info = JSON.parse(await readFile(infoFile, 'utf-8'));
  } catch {
    return null;
  }
  if (!info.port || !info.token) return null;
  const base = `http://127.0.0.1:${info.port}`;

  // Confirm daemon is live before sending payloads.
  try {
    const ping = await fetch(`${base}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!ping.ok) return null;
  } catch {
    return null;
  }

  let delivered = 0;
  let skipped = 0;
  for (const s of signals) {
    const url = `pdf-local://${s.pdf_sha256}`;
    const body = {
      url,
      title: `${s.pdf_classification.toUpperCase()} — ${s.company || 'unknown'} ${s.role || ''}`.trim(),
      company_name: s.company || null,
      role: s.role || null,
      jd_md: typeof s.text === 'string' ? s.text.slice(0, 8000) : null,
      payload: { source_kind: 'pdf', ...s },
    };
    try {
      const res = await fetch(`${base}/api/signals`, {
        method: 'POST',
        headers: {
          'x-yo-token': info.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 201) delivered++;
      else if (res.status === 200) skipped++;          // upsert-by-url_hash matched existing
      else return null;                                 // unexpected status — bail to NDJSON
    } catch {
      return null;                                      // network blip — fall back
    }
  }
  return { delivered, skipped, port: info.port };
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--'));
  const outArg = args.find(a => a.startsWith('--out='))?.split('=')[1];
  const lang = args.find(a => a.startsWith('--lang='))?.split('=')[1] || 'zh-cn';
  const dryRun = args.includes('--dry-run');
  const noDaemon = args.includes('--no-daemon');

  if (!target) {
    console.error('Usage: node bridges/pdf-extract.mjs <pdf-file-or-directory> [--out=data/signals.ndjson] [--lang=zh-cn|en] [--no-daemon] [--dry-run]');
    process.exit(1);
  }

  const targetAbs = resolve(target);
  if (!existsSync(targetAbs)) {
    console.error(`❌ Not found: ${targetAbs}`);
    process.exit(1);
  }

  const out = resolve(outArg || 'data/signals.ndjson');
  const paths = await collectPdfPaths(targetAbs);
  if (paths.length === 0) {
    console.error(`⚠️  No .pdf files under ${targetAbs}`);
    process.exit(0);
  }

  const signals = [];
  const empty = [];
  for (const path of paths) {
    try {
      const extraction = await extractPdf(path);
      if (!extraction.text || extraction.text.length < 30) {
        empty.push(path);
        console.error(`⚠️  ${path}: extraction_empty (likely a scanned image — OCR externally first)`);
        continue;
      }
      const signal = pdfToSignal(extraction, lang);
      signals.push(signal);
      console.log(`📄 ${basename(path)} → ${signal.pdf_classification.toUpperCase()} | ${signal.company} | ${signal.role}`);
    } catch (err) {
      console.error(`❌ ${path}: ${err.message}`);
    }
  }

  if (dryRun) {
    console.log(`\n🧪 dry-run: would append ${signals.length} signal(s) to ${out}`);
    for (const s of signals) console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (signals.length === 0) {
    console.log('No signals extracted.');
    return;
  }

  // U3 migration path: prefer daemon HTTP upsert when available; fall back to
  // NDJSON when daemon is down or --no-daemon was passed.
  if (!noDaemon) {
    const daemonResult = await tryDaemonUpsert(signals);
    if (daemonResult) {
      console.log(
        `\n✅ Delivered ${daemonResult.delivered} new signal(s) to daemon ` +
        `(http://127.0.0.1:${daemonResult.port}/api/signals)`
      );
      if (daemonResult.skipped > 0) {
        console.log(`⏭️  Skipped ${daemonResult.skipped} (url_hash already present in daemon).`);
      }
      if (empty.length) console.log(`⚠️  ${empty.length} PDF(s) skipped — extraction_empty.`);
      console.log(`\nNext: open Web UI or run \`npx yocareer scan\` (U4 will wire CLI through daemon).`);
      return;
    }
    console.log(
      '\nℹ️  Daemon not running or unreachable; falling back to NDJSON write. ' +
      'Start daemon with `node daemon/server.mjs` for live upsert.'
    );
  }

  const result = await appendSignals(out, signals);
  console.log(`\n✅ Appended ${result.appended} new signal(s) to ${out}`);
  if (result.skipped > 0) console.log(`⏭️  Skipped ${result.skipped} (pdf_sha256 already present).`);
  if (empty.length) console.log(`⚠️  ${empty.length} PDF(s) skipped — extraction_empty.`);
  console.log(`\nNext: \`npm run scan\` will pick these up via manual_signal_import.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
