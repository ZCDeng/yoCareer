# yoCareer

yoCareer is a China-market adaptation of [`career-ops`](https://github.com/santifer/career-ops).

The upstream project is a local AI job-search command center. This fork keeps the local-first, human-in-the-loop architecture and starts adapting it for Chinese hiring channels, Chinese resumes, domestic job-market signals, and China-specific compliance boundaries.

## Current Scope

This fork currently adds:

- China-market adaptation notes: `docs/CHINA_MARKET_ADAPTATION.md`
- China portal template: `templates/portals.cn.example.yml`
- Chinese shared evaluation context: `modes/zh-cn/_shared.md`
- Chinese job evaluation mode: `modes/zh-cn/evaluate.md`

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
cp templates/portals.cn.example.yml portals.yml
```

Then add:

- `cv.md` with your resume.
- `modes/_profile.md` with your target roles and personal positioning.
- Optional `writing-samples/` files for tone calibration.

For Chinese job descriptions, start with `modes/zh-cn/evaluate.md` and `modes/zh-cn/_shared.md` as the evaluation contract.

## Upstream

The original upstream remote is kept as:

```bash
git remote -v
```

Use `upstream` to pull future improvements from `santifer/career-ops`, and keep China-specific changes isolated where possible.
