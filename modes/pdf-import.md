# Mode: pdf-import — Inbound PDF → manual_signal_import

Pulls offer letters / JDs from `data/inbox/*.pdf` (or any directory you point
the bridge at) into `data/signals.ndjson`, where `manual_signal_import`
already ingests them via `npm run scan`. No OCR — text-based PDFs only.

## When to use

- **WeChat / 招聘群 / 邮件附件 PDF**: HR sent a JD as PDF, recruiter forwarded
  an offer letter PDF, group chat dumped a 内推 PDF.
- **Multiple PDFs at once**: `data/inbox/*.pdf` is the drop folder.
- **Single PDF**: `node bridges/pdf-extract.mjs path/to/file.pdf`.

## When NOT to use

- **Scanned image PDFs** (no embedded text). The bridge logs `extraction_empty`
  and skips. OCR them externally first (Adobe Acrobat / `tesseract`).
- **HTML / Markdown JD**: paste directly to `/yoCareer` — auto-pipeline is
  faster than going through the file system.

## Setup (one-time)

1. Create the inbox folder: `mkdir -p data/inbox`.
2. Add to `portals.yml` so `npm run scan` auto-extracts on every run:

   ```yaml
   sources:
     - name: pdf_inbox
       provider: manual_signal_import
       path: data/signals.ndjson
       inbox: data/inbox             # ← any directory containing .pdf files
       lang: zh-cn                   # (optional) heuristic language hint
       notes: "Auto-extracts data/inbox/*.pdf before reading signals.ndjson."
   ```

3. Both `data/inbox/` and `data/signals.ndjson` are already gitignored.

## How the agent uses this mode

Triggered by:

- User drops PDFs in `data/inbox/`.
- User says "evaluate this PDF" / "I have an offer letter PDF" / "extract this JD".

Steps:

1. Confirm the file(s) exist. If user said "the offer I just got", default to
   the newest file in `data/inbox/` (mtime descending).
2. Run extraction (one-shot, idempotent — `pdf_sha256` dedup):

   ```bash
   node bridges/pdf-extract.mjs data/inbox --lang=zh-cn
   ```

   Or for a single file:

   ```bash
   node bridges/pdf-extract.mjs data/inbox/offer.pdf --lang=zh-cn
   ```

3. The bridge writes one signal per PDF to `data/signals.ndjson` with:
   - `kind: pdf_offer` / `pdf_jd` / `pdf_unknown`
   - `pdf_classification` (same value, redundant for clarity)
   - `pdf_sha256` (dedup key)
   - For Chinese offers: `scoring_notes` includes `salary_monthly`,
     `months_per_year`, `housing_fund`, `probation`, `bonus`,
     `equity_mentioned`, `start_date`, plus title and company hints.
4. Decide what to do per PDF based on classification:
   - `pdf_offer` → run `oferta` mode against the extracted text. The
     `scoring_notes` already has the structured fields; cross-check with
     user's saved comp targets in `config/profile.yml`.
   - `pdf_jd` → run `auto-pipeline` (evaluate + report + PDF + tracker).
   - `pdf_unknown` → ask the user: "PDF is ambiguous, treat as offer or JD?"
5. After ingestion, follow the standard pipeline integrity hooks
   (`merge-tracker.mjs` → `normalize-statuses.mjs` → `dedup-tracker.mjs` →
   `verify-pipeline.mjs`).

## Limits and known issues

- **No OCR.** First version is text extraction only. Scanned PDFs (offers
  printed and re-scanned, photos of WeChat screenshots) are out of scope.
- **CJK glyph spacing.** pdfjs-dist returns CJK chars space-separated.
  `normalizeCJKSpacing` collapses them, but very dense layouts (multi-column
  CV-style PDFs) may still have residual spaces.
- **Kangxi radicals.** Some PDFs map common chars (月, 日, 工, 人, 入) to
  Kangxi-radical code points. The bridge has a translation table for the
  most common cases but is not exhaustive — if a field doesn't match,
  visually inspect the extracted text in `data/signals.ndjson`.
- **Field extraction is best-effort.** Salary, 13薪, 公积金, 试用期 etc.
  are matched with regex. Always show the user the extracted scoring_notes
  before committing them to the tracker.
- **Heuristic classification.** Offer/JD detection uses keyword counts.
  Dual-purpose docs (e.g. "offer letter that includes a JD attachment")
  default to `pdf_unknown`. Agent should ask.

## Manual control

- Skip auto-extraction: leave `inbox:` field out of the portals.yml entry.
- Single-file dry-run: `node bridges/pdf-extract.mjs file.pdf --dry-run`.
- Re-extract everything (after improving the regex set): manually delete the
  rows with the relevant `pdf_sha256` from `data/signals.ndjson`, then re-run.
