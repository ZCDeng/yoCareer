# Architecture

> **Version**: v2.0.0 — Daemon + SQLite + Web SPA + Extension

## System Overview

```
                    ┌──────────────────────────────────────────┐
                    │         Claude Code / Gemini / Codex      │
                    │   (reads CLAUDE.md + AGENTS.md + modes/)  │
                    └──────────┬─────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                      │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼────────┐
     │ Single Eval  │   │ Signal Scan │   │   Batch Process    │
     │ (auto-pipe)  │   │  (scan.md)  │   │   (batch-runner)   │
     └──────┬──────┘   └──────┬──────┘   └───────────┬────────┘
            │                  │                       │
            │      ┌───────────▼──────────┐      ┌────▼─────┐
            │      │   Daemon HTTP API    │      │ N workers│
            │      │   localhost:8650     │      │ (claude -p)
            │      │   REST + SSE         │      └────┬─────┘
            │      └───────────┬──────────┘           │
            │                  │                       │
     ┌──────▼──────────────────▼───────────────────────▼──────┐
     │              SQLite (better-sqlite3 + WAL)              │
     │  ┌─────────────┐ ┌────────────┐ ┌───────────────────┐  │
     │  │ profiles    │ │ portals    │ │ applications      │  │
     │  │ signals     │ │ evaluations│ │ tasks             │  │
     │  └─────────────┘ └────────────┘ └───────────────────┘  │
     └──────────────────────────┬─────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
  ┌──────▼──────┐      ┌────────▼────────┐   ┌────────▼────────┐
  │   Web SPA   │      │  Browser Ext    │   │  CLI Scripts    │
  │  (vanilla)  │      │  (Manifest V3)  │   │  (daemon-client)│
  │  Cmd+K      │      │  content script │   │  ensure-daemon  │
  │  SSE updates│      │  popup + pairing│   │  lib/*.mjs      │
  └─────────────┘      └─────────────────┘   └─────────────────┘
```

## v2 Architecture Layers

### 1. Daemon Layer (`daemon/`)

Node.js HTTP server bound to `localhost:8650`:

- **REST API**: CRUD for profiles, portals, signals, evaluations, applications, tasks
- **SSE broadcast**: Real-time updates to connected Web UI clients
- **Token auth**: Simple bearer token for extension pairing
- **SQLite**: `better-sqlite3` with WAL mode, schema in `daemon/lib/`

All CLI scripts route through the daemon via `lib/daemon-client.mjs`. The daemon is the single source of truth for application state.

### 2. Web UI Layer (`web-ui/`)

Vanilla JS single-page application:

- **Mirofish Design System**: 3-tier CSS tokens (`tokens.css`) — primitives → semantic → component
- **Module cards**: Profile / Portals / Signals / Applications / Evaluations
- **Cmd+K palette**: Fuse.js-powered command search (`cmdk.js`)
- **SSE client**: Native `EventSource` for real-time task progress and signal updates (`sse-client.js`)
- **Dark-first**: Default dark theme, light via `prefers-color-scheme` or `[data-theme="light"]`

Start: `npm run ui` (or `npx yocareer daemon start && npx yocareer ui`)

### 3. Extension Layer (`extension/`)

Chrome Extension Manifest V3:

- **Content script**: Extracts job data from BOSS直聘 / 拉勾 / 智联招聘 pages
- **Popup**: Displays extracted data, 6-digit pairing code input
- **Service Worker**: Routes extracted jobs to daemon via authenticated HTTP POST
- **Pairing flow**: Extension generates code → user enters in popup → daemon validates → token stored

Load: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`

### 4. CLI Bridge Layer (`lib/`)

Shared utilities consumed by all entry-point scripts:

| Module | Purpose |
|--------|---------|
| `daemon-client.mjs` | HTTP client for daemon REST API |
| `ensure-daemon.mjs` | Synchronously starts daemon if not running |
| `db-helpers.mjs` | SQLite query builders and migrations |
| `v1-detect.mjs` | Detects legacy v1 installations and warns |

All `.mjs` scripts in the project root now call `ensureDaemon()` before doing their work, making them thin HTTP clients over the daemon.

## Evaluation Flow (Single Offer)

1. **Input**: User pastes JD text or URL
2. **Extract**: Playwright/WebFetch extracts JD from URL
3. **Classify**: Detect archetype (1 of 6 types)
4. **Evaluate**: 6 blocks (A-F):
   - A: Role summary
   - B: CV match (gaps + mitigation)
   - C: Level strategy
   - D: Comp research (public research)
   - E: CV personalization plan
   - F: Interview prep (STAR stories)
5. **Score**: Weighted average across 10 dimensions (1-5)
6. **Report**: Save as `reports/{num}-{company}-{date}.md`
7. **PDF**: Generate ATS-optimized CV (`generate-pdf.mjs`)
8. **Track**: Write to SQLite via daemon API (or TSV for batch mode)

## Batch Processing

```
batch-input.tsv    →  batch-runner.sh  →  N × claude -p workers
(id, url, source)     (orchestrator)       (self-contained prompt)
                           │
                    batch-state.tsv
                    (tracks progress)
```

Each worker is a headless Claude instance (`claude -p`) that receives the full `batch-prompt.md` as context. Workers produce:
- Report .md
- PDF
- Tracker entry (via daemon API in v2)

The orchestrator manages parallelism, state, retries, and resume.

## Scan Architecture (China-first)

`scan.mjs` is provider-based. A single run can combine:

- `company_page`: official company career pages via Playwright.
- `manual_signal_import`: user-provided NDJSON signal inbox (`data/signals.ndjson`).
- `reach_signal_search`: optional public-signal bridge searches.
- `manual_only`: restricted/login-gated platforms (explicitly non-automated).

Optional external enhancement:

- Aditly MCP (`http://127.0.0.1:8643/mcp/`) can be used by bridge scripts.
- Fallback is always local bridge logic when Aditly is unavailable.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
data/signals.ndjson      →  Manual social/community signal inbox
data/signal-review.md    →  Low-confidence/manual-review queue
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
templates/capabilities.yml → v2 feature registry
daemon/*.db              →  SQLite (profiles, apps, signals, tasks)
```

## File Naming Conventions

- Reports: `{###}-{company-slug}-{YYYY-MM-DD}.md` (3-digit zero-padded)
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`
- Tracker TSVs (legacy batch): `batch/tracker-additions/{id}.tsv`

## Pipeline Integrity

Scripts maintain data consistency:

| Script | Purpose |
|--------|---------|
| `merge-tracker.mjs` | Merges batch TSV additions into applications.md |
| `verify-pipeline.mjs` | Health check: statuses, duplicates, links |
| `dedup-tracker.mjs` | Removes duplicate entries by company+role |
| `normalize-statuses.mjs` | Maps status aliases to canonical values |
| `cv-sync-check.mjs` | Validates setup consistency |

## Dashboard TUI (Legacy)

The `dashboard/` directory contains a standalone Go TUI application (v1, no longer actively maintained):

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

For v2, use the Web SPA (`npm run ui`) instead.
