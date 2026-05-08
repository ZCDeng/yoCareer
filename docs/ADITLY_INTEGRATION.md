# Aditly Integration (External, Recommended)

yoCareer does not embed Aditly. Integration is optional and external by design.

## Why use Aditly

For China-market job search, recruitment signals are fragmented across social/community channels.  
Aditly improves public-signal coverage while keeping yoCareer core scanner independent.

## 1) Start Aditly

```bash
git clone https://github.com/ZCDeng/Aditly.git
cd Aditly
cp .env.example .env
docker compose -f compose.prebuilt.yaml up -d
curl http://127.0.0.1:8643/health
```

Expected:

```json
{"status":"ok","tools":15}
```

## 2) Configure yoCareer bridge preference

In `yoCareer/.env`:

```bash
YOCAREER_ADITLY_BASE_URL=http://127.0.0.1:8643
YOCAREER_ADITLY_PREFER=true
YOCAREER_ADITLY_TIMEOUT_MS=10000
```

Behavior:
- `YOCAREER_ADITLY_PREFER=true`: bridge scripts try Aditly MCP first, then fall back to local logic.
- `YOCAREER_ADITLY_PREFER=false`: skip Aditly and use local bridge logic only.

## 3) Validate

```bash
npm run providers
npm run bridge:smoke
node scan.mjs --dry-run
```

What to check:
- `providers` shows `aditly_mcp available`.
- `bridge:smoke` shows `aditly_mcp ok`.
- `scan --dry-run` completes even if some sources are unavailable.

## 4) Failure and fallback model

If Aditly is unreachable or partially unavailable:
- Scan does not stop.
- Bridge scripts fall back to built-in local methods.
- Scanner summary reports skipped/held reasons explicitly.

## 5) Compliance boundaries

- No forced login/CAPTCHA bypass.
- No mass messaging or auto-application.
- Restriction-gated platforms remain `manual_only` by default.
- Social/community signals should go through manual review before promotion.
