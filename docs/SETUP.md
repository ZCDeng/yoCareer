# Setup Guide

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and configured
- Node.js 18+ (for daemon, PDF generation, and utility scripts)
- (Optional) Chrome browser (for the browser extension)
- (Optional) Go 1.21+ (for the legacy dashboard TUI only)

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/ZCDeng/yoCareer.git
cd yoCareer
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` with your personal details: name, email, target roles, narrative, proof points.

### 3. Add your CV

Create `cv.md` in the project root with your full CV in markdown format. This is the source of truth for all evaluations and PDFs.

(Optional) Create `article-digest.md` with proof points from your portfolio projects/articles.

### 4. Configure portals (China-first default)

```bash
cp templates/portals.example.yml portals.yml
```

If you prefer the Chinese-labeled template:

```bash
cp templates/portals.cn.example.yml portals.yml
```

Edit `portals.yml`:
- `title_filter` now defaults to a China-market mixed profile (AI + engineering + product/operations/growth)
- `tracked_companies` defaults to major China tech employers and AI companies
- `signal_imports` is enabled by default for fragmented social hiring signals (`data/signals.ndjson`)
- `restricted_platforms` keeps login-gated domestic platforms in `manual_import_only` mode by default

### 5. Start the daemon and Web UI

```bash
npm run daemon   # Starts the HTTP daemon on localhost:8650
```

In another terminal:

```bash
npm run ui       # Opens the Web SPA dashboard in your browser
```

Or use the bundled command:

```bash
npx yocareer daemon start && npx yocareer ui
```

The dashboard provides:
- Module cards (Profile, Portals, Signals, Applications, Evaluations)
- Cmd+K command palette for quick navigation
- SSE real-time updates for scan progress and task status

Then paste a job offer URL or description. yoCareer will automatically evaluate it, generate a report, create a tailored PDF, and track it.

### 6. (Optional) Install the browser extension

For one-click job extraction from BOSS直聘 / 拉勾 / 智联招聘:

1. Ensure the daemon is running (`npm run daemon`)
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/` directory
5. Visit a supported job page and click the extension icon
6. Enter the 6-digit pairing code shown in the extension popup

The extension sends extracted job data directly to the daemon.

### 7. (Recommended) Link Aditly for stronger search/crawl signals

yoCareer keeps scanner dependencies external. For stronger China-market social/public signal capture, run Aditly alongside yoCareer:

```bash
git clone https://github.com/ZCDeng/Aditly.git
cd Aditly
cp .env.example .env
docker compose -f compose.prebuilt.yaml up -d
curl http://127.0.0.1:8643/health
```

Back in yoCareer, set optional env values (or keep defaults):

```bash
cp .env.example .env
# edit .env:
# YOCAREER_ADITLY_BASE_URL=http://127.0.0.1:8643
# YOCAREER_ADITLY_PREFER=true
# YOCAREER_ADITLY_TIMEOUT_MS=10000
```

Validate:

```bash
npm run providers
npm run bridge:smoke
node scan.mjs --dry-run
```

Detailed runbook: [`docs/ADITLY_INTEGRATION.md`](./ADITLY_INTEGRATION.md)

## Available Commands

| Action | How |
|--------|-----|
| Evaluate an offer | Paste a URL or JD text |
| Search for offers | `/yoCareer scan` or Web UI |
| Process pending URLs | `/yoCareer pipeline` |
| Generate a PDF | `/yoCareer pdf` |
| Batch evaluate | `/yoCareer batch` |
| Check tracker status | `/yoCareer tracker` or Web UI |
| Fill application form | `/yoCareer apply` |
| Start daemon | `npm run daemon` |
| Open Web UI | `npm run ui` |
| Check provider health | `npm run providers` |
| Check model config | `npm run models` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
npm run doctor               # Full prerequisite check
```

## v1 to v2 Upgrade

If you're coming from yoCareer v1 (Markdown tracker, no daemon), the system will detect your v1 installation and prompt you to migrate. Key changes:

- **Tracker**: `data/applications.md` → SQLite (`daemon/*.db`)
- **Scripts**: All CLI scripts now communicate with the daemon via HTTP
- **Dashboard**: Web SPA replaces Go TUI as the primary interface
- **State**: All application state lives in SQLite, with daemon as the single source of truth

Run `npm run doctor` to check your setup and detect v1 remnants.

## Build Dashboard (Legacy)

The Go TUI is still available but no longer actively maintained:

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..  # Opens TUI pipeline viewer
```

Use the Web SPA (`npm run ui`) for the v2 experience.
