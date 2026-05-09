# Scripts Reference

All scripts live in the project root as `.mjs` modules and are exposed via `npm run <name>`.

## Quick Reference

| Command | Script | Purpose |
|---------|--------|---------|
| `npm run doctor` | `doctor.mjs` | Validate setup prerequisites |
| `npm run providers` | `provider-health.mjs` | Report scanner provider availability |
| `npm run bridge:smoke` | `bridge-smoke.mjs` | Smoke-test Reach bridge commands |
| `npm run signals` | `review-signals.mjs` | Review, promote, or discard held signals |
| `npm run verify` | `verify-pipeline.mjs` | Check pipeline data integrity |
| `npm run models` | `model-health.mjs` | Validate model provider configuration |
| `npm run normalize` | `normalize-statuses.mjs` | Fix non-canonical statuses |
| `npm run dedup` | `dedup-tracker.mjs` | Remove duplicate tracker entries |
| `npm run merge` | `merge-tracker.mjs` | Merge batch TSVs into applications.md |
| `npm run pdf` | `generate-pdf.mjs` | Convert HTML to ATS-optimized PDF |
| `npm run sync-check` | `cv-sync-check.mjs` | Validate CV/profile consistency |
| `npm run update:check` | `update-system.mjs check` | Check for upstream updates |
| `npm run update` | `update-system.mjs apply` | Apply upstream update |
| `npm run rollback` | `update-system.mjs rollback` | Rollback last update |
| `npm run liveness` | `check-liveness.mjs` | Test if job URLs are still active |
| `npm run scan` | `scan.mjs` | Provider-based recruitment signal scanner |
| `npm run daemon` | `daemon-cli.mjs` | Start the HTTP daemon (localhost:8650) |
| `npm run ui` | `web-ui/server.mjs` | Start the Web SPA dashboard server |
| `npm run gemini:eval` | `gemini-eval.mjs` | Evaluate a JD using Gemini API |
| `npm run pdf:import` | `bridges/pdf-extract.mjs` | Import offer/JD PDFs from data/inbox/ |
| `npm run extension:lint` | `tests/extension-manifest-selftest.mjs` | Self-test extension manifest |

---

## doctor

Validates that all prerequisites are in place: Node.js >= 18, dependencies installed, Playwright chromium, required files (`cv.md`, `config/profile.yml`, `portals.yml`), fonts directory, and auto-creates `data/`, `output/`, `reports/` if missing.

```bash
npm run doctor
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed (fix messages printed).

---

## providers

Reports scanner provider availability for the local runtime: ATS APIs, Playwright company pages, manual signal imports, restricted manual-only platforms, optional Reach bridge configuration, and optional Aditly MCP health.

```bash
npm run providers
YOCAREER_REACH_READ_URL_CMD="reach read-url" npm run providers
YOCAREER_REACH_SIGNAL_SEARCH_CMD="reach signal-search" npm run providers
YOCAREER_ADITLY_BASE_URL="http://127.0.0.1:8643" npm run providers
```

Reach is optional. If no env command is configured, yoCareer auto-detects built-in local bridge scripts:

- `./bridges/reach-read-url.mjs`
- `./bridges/reach-signal-search.mjs`

URL bridges receive one argument: `<url>`. Signal-search bridges receive two arguments: `<platform> <query>`.

Reference bridge templates:

- [bridges/README.md](../bridges/README.md)
- [bridges/reach-read-url.mjs](../bridges/reach-read-url.mjs)
- [bridges/reach-signal-search.mjs](../bridges/reach-signal-search.mjs)
- [bridges/reach-read-url.example.sh](../bridges/reach-read-url.example.sh)
- [bridges/reach-signal-search.example.sh](../bridges/reach-signal-search.example.sh)

**Exit codes:** `0` report generated, `1` configuration error or no `portals.yml` found.

---

## bridge:smoke

Checks Aditly MCP health (if enabled), then executes configured bridge commands with sample arguments and checks whether output is valid JSON with a `signals` array.

```bash
npm run bridge:smoke
YOCAREER_REACH_READ_URL_CMD="./bridges/reach-read-url.mjs" \
YOCAREER_REACH_SIGNAL_SEARCH_CMD="./bridges/reach-signal-search.mjs" \
YOCAREER_ADITLY_PREFER=true \
npm run bridge:smoke
```

Use this before running scans to validate bridge wiring.

**Exit codes:** `0` script completed (per-bridge results are printed as `ok` / `failed` / `invalid` / `skipped`).

---

## signals

Lists, promotes, or discards signals held in `data/signal-review.md`. Promotion appends the signal to `data/pipeline.md`, records `promoted_from_review` in `data/scan-history.tsv`, and archives the original review block. Discard records `discarded_from_review` and archives the block without adding it to the pipeline.

```bash
npm run signals -- list
npm run signals -- draft --index 1
npm run signals -- promote --index 1 --dry-run
npm run signals -- promote --index 1
npm run signals -- discard --index 1
```

`draft` prints a suggested action, outreach message draft, and verification questions based on signal type and risk notes.

Use this after `npm run scan` finds social, community, or low-confidence signals that need manual verification.

**Exit codes:** `0` operation completed, `1` no matching signal or invalid command.

---

## verify

Health check for pipeline data integrity. Validates `data/applications.md` against seven rules: canonical statuses (per `templates/states.yml`), no duplicate company+role pairs, all report links point to existing files, scores match `X.XX/5` / `N/A` / `DUP`, rows have proper pipe-delimited format, no pending TSVs in `batch/tracker-additions/`, and no markdown bold in scores.

```bash
npm run verify
```

**Exit codes:** `0` pipeline clean (zero errors), `1` errors found. Warnings (e.g. possible duplicates) do not cause a non-zero exit.

---

## models

Validates `config/models.yml` when present, otherwise `config/models.example.yml`. It checks provider shape, API-key environment variable names, and whether configured CLI commands are present. It does not call remote model APIs.

```bash
npm run models
cp config/models.example.yml config/models.yml
DEEPSEEK_API_KEY=... npm run models
```

Supported provider types:

- `openai_compatible`
- `gemini`
- `cli`

**Exit codes:** `0` config shape valid, `1` invalid provider config.

---

## normalize

Maps non-canonical statuses to their canonical equivalents and strips markdown bold and dates from the status column. Aliases like `Enviada` become `Aplicado`, `CERRADA` becomes `Descartado`, etc. DUPLICADO info is moved to the notes column.

```bash
npm run normalize             # apply changes
npm run normalize -- --dry-run  # preview without writing
```

Creates a `.bak` backup of `applications.md` before writing.

**Exit codes:** `0` always (changes or no changes).

---

## dedup

Removes duplicate entries from `applications.md` by grouping on normalized company name + fuzzy role match. Keeps the entry with the highest score. If a removed entry had a more advanced pipeline status, that status is promoted to the keeper.

```bash
npm run dedup             # apply changes
npm run dedup -- --dry-run  # preview without writing
```

Creates a `.bak` backup before writing.

**Exit codes:** `0` always.

---

## merge

Merges batch tracker additions (`batch/tracker-additions/*.tsv`) into `applications.md`. Handles 9-column TSV, 8-column TSV, and pipe-delimited markdown formats. Detects duplicates by report number, entry number, and company+role fuzzy match. Higher-scored re-evaluations update existing entries in place.

```bash
npm run merge                 # apply merge
npm run merge -- --dry-run    # preview without writing
npm run merge -- --verify     # merge then run verify-pipeline
```

Processed TSVs are moved to `batch/tracker-additions/merged/`.

**Exit codes:** `0` success, `1` verification errors (with `--verify`).

---

## pdf

Renders an HTML file to a print-quality, ATS-parseable PDF via headless Chromium. Resolves font paths from `fonts/`, normalizes Unicode for ATS compatibility (em-dashes, smart quotes, zero-width characters), and reports page count and file size.

```bash
npm run pdf -- input.html output.pdf
npm run pdf -- input.html output.pdf --format=letter   # US letter
npm run pdf -- input.html output.pdf --format=a4        # A4 (default)
```

**Exit codes:** `0` PDF generated, `1` missing arguments or generation failure.

---

## sync-check

Validates that the yoCareer setup is internally consistent: `cv.md` exists and is not too short, `config/profile.yml` exists with required fields, no hardcoded metrics in `modes/_shared.md` or `batch/batch-prompt.md`, and `article-digest.md` freshness (warns if older than 30 days).

```bash
npm run sync-check
```

**Exit codes:** `0` no errors (warnings allowed), `1` errors found.

---

## update:check

Checks whether a newer version of yoCareer is available upstream. Outputs JSON to stdout:

```bash
npm run update:check
```

Possible JSON responses:

| `status` | Meaning |
|----------|---------|
| `up-to-date` | Local version matches remote |
| `update-available` | Newer version exists (includes `local`, `remote`, `changelog`) |
| `dismissed` | User dismissed the update prompt |
| `offline` | Could not reach GitHub |

**Exit codes:** `0` always.

---

## update

Applies the upstream update. Creates a backup branch (`backup-pre-update-{version}`), fetches from the canonical repo, checks out only system-layer files, runs `npm install`, and commits. User-layer files (`cv.md`, `config/profile.yml`, `data/`, etc.) are never touched.

```bash
npm run update
```

**Exit codes:** `0` success, `1` lock conflict or safety violation.

---

## rollback

Restores system-layer files from the most recent backup branch created during an update.

```bash
npm run rollback
```

**Exit codes:** `0` success, `1` no backup branch found or git error.

---

## liveness

Tests whether job posting URLs are still live using headless Chromium. Detects expired patterns (e.g. "job no longer available"), HTTP 404/410, ATS redirect patterns, and apply-button presence. Supports multi-language expired patterns (English, German, French).

```bash
npm run liveness -- https://example.com/job/123
npm run liveness -- https://a.com/job/1 https://b.com/job/2
npm run liveness -- --file urls.txt
```

Each URL gets a verdict: `active`, `expired`, or `uncertain` with a reason.

**Exit codes:** `0` all URLs active, `1` any expired or uncertain.

---

## scan

Provider-based recruitment signal scanner. Combines ATS APIs (Greenhouse/Ashby/Lever), public career pages, local user-provided signal imports, and optional `reach_signal_search` bridge capability (Aditly-first when enabled, local fallback otherwise). Reads `portals.yml`, outputs matching signals to stdout, appends high-confidence signals to `data/pipeline.md`, and holds low-confidence/manual-review signals in `data/signal-review.md`.

```bash
npm run scan
npm run scan -- --dry-run
npm run scan -- --company Tencent
YOCAREER_REACH_SIGNAL_SEARCH_CMD="reach signal-search" npm run scan -- --dry-run
```

**Exit codes:** `0` scan completed, `1` configuration error or no portals.yml found.

---

## daemon

Starts the yoCareer HTTP daemon on `localhost:8650`. The daemon is the central hub for all v2 operations: SQLite storage, REST API, SSE broadcast, and extension pairing.

```bash
npm run daemon
```

The daemon auto-creates the SQLite database and required directories on first start. All other scripts communicate with the daemon via HTTP.

**Exit codes:** `0` clean shutdown, `1` port conflict or startup error.

---

## ui

Starts the Web SPA dashboard server. Serves the dark-first vanilla JS application with module cards, Cmd+K palette, and SSE real-time updates.

```bash
npm run ui
# Or bundled with daemon start:
npx yocareer daemon start && npx yocareer ui
```

Opens automatically in your default browser. The UI communicates with the daemon at `localhost:8650`.

**Exit codes:** `0` clean shutdown, `1` daemon unreachable or port conflict.

---

## gemini:eval

Evaluates a job description using the Gemini API. Useful when you want a quick LLM assessment without running the full Claude Code pipeline.

```bash
npm run gemini:eval -- "JD text here"
npm run gemini:eval -- --file ./jds/my-job.txt
```

Requires `GEMINI_API_KEY` in `.env`. Uses `gemini-2.0-flash` (free tier: 15 RPM, 1M tokens/day).

**Exit codes:** `0` evaluation printed, `1` missing API key or request failed.

---

## pdf:import

Processes offer/JD PDFs dropped into `data/inbox/`. Extracts text using `pdfjs-dist`, classifies as offer or JD, and outputs structured fields for manual review.

```bash
npm run pdf:import
```

Supports CN-market field extraction (五险一金, 试用期, 年终奖, etc.). Processed files are not deleted — review the output and move manually.

**Exit codes:** `0` processed, `1` pdfjs-dist not installed or no PDFs found.

---

## extension:lint

Self-test for the browser extension manifest. Validates Manifest V3 structure, required permissions, and content script matchers.

```bash
npm run extension:lint
```

Run this after modifying `extension/manifest.json` to catch syntax errors before loading into Chrome.

**Exit codes:** `0` all checks passed, `1` validation errors found.
