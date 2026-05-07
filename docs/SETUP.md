# Setup Guide

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and configured
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

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

### 5. Start using

Open Claude Code in this directory:

```bash
claude
```

Then paste a job offer URL or description. yoCareer will automatically evaluate it, generate a report, create a tailored PDF, and track it.

### 6. (Recommended) Link Aditly for stronger search/crawl signals

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
| Search for offers | `/yoCareer scan` |
| Process pending URLs | `/yoCareer pipeline` |
| Generate a PDF | `/yoCareer pdf` |
| Batch evaluate | `/yoCareer batch` |
| Check tracker status | `/yoCareer tracker` |
| Fill application form | `/yoCareer apply` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..  # Opens TUI pipeline viewer
```
