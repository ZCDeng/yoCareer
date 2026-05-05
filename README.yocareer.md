# yoCareer

yoCareer is a local AI job-search operations project focused on Chinese hiring channels.

It keeps a local-first, human-in-the-loop architecture for evaluating roles, adapting resumes, preparing interviews, and tracking outcomes with compliance-aware workflows.

## Current Scope

Current China-focused additions:

- China-market adaptation notes: `docs/CHINA_MARKET_ADAPTATION.md`
- China signal-first upgrade roadmap: `docs/YOCAREER_UPGRADE_PLAN.md`
- China portal template: `templates/portals.cn.example.yml`
- Chinese shared evaluation context: `modes/zh-cn/_shared.md`
- Chinese job evaluation mode: `modes/zh-cn/evaluate.md`
- Chinese signal review mode: `modes/zh-cn/signal-review.md`

## Product Boundary

yoCareer should help users:

- Evaluate whether a role is worth applying to.
- Adapt Chinese and English resumes to a specific JD.
- Draft BOSS/Maimai/WeChat/email messages for manual review.
- Prepare interview stories and company research.
- Track the application funnel locally.

yoCareer should not:

- Auto-submit applications.
- Bulk-message recruiters.
- Automate login, scraping, CAPTCHA bypass, or anti-bot evasion on Chinese recruitment platforms.
- Send sensitive personal data to a model provider without user control.

## China Setup

```bash
cp config/profile.example.yml config/profile.yml
cp config/models.example.yml config/models.yml
cp templates/portals.cn.example.yml portals.yml
```

Then add:

- `cv.md` with your resume.
- `modes/_profile.md` with your target roles and personal positioning.
- Optional `writing-samples/` files for tone calibration.

For Chinese job descriptions, start with `modes/zh-cn/evaluate.md` and `modes/zh-cn/_shared.md` as the evaluation contract.

Model providers are configured in `config/models.yml`; keep keys in environment variables such as `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`. Check local readiness with `npm run models`.

Optional Reach bridges can be wired through:

- `YOCAREER_REACH_READ_URL_CMD`
- `YOCAREER_REACH_SIGNAL_SEARCH_CMD`

Built-in local wrappers are provided in `bridges/` and auto-used when env vars are unset:

- `bridges/reach-read-url.mjs`
- `bridges/reach-signal-search.mjs`

## China Signal Workflow

```bash
npm run providers
npm run scan -- --dry-run
npm run scan
npm run signals -- list
npm run signals -- promote --index 1
npm run signals -- discard --index 2
```

Use `data/signals.ndjson` for pasted or exported social/community hiring signals. High-confidence official jobs enter `data/pipeline.md`; noisy social/community signals are held in `data/signal-review.md` until manually reviewed.

## Repository

Primary repository:

- `https://github.com/ZCDeng/yoCareer`
