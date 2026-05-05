# yoCareer Upgrade Plan

## 1. Product Direction

yoCareer is a local CLI job-search operations system for the Chinese hiring market. It is not an auto-apply bot.

The core product shift from upstream `career-ops` is that China-market hiring data is not concentrated in standardized ATS systems. Useful openings and hiring intent are fragmented across official career sites, social media, community posts, newsletters, public account articles, referrals, and private group forwards.

This means yoCareer should not only scan job postings. It should collect and normalize **recruitment signals**.

## 2. Architecture Decision

yoCareer needs two source families:

| Source family | Examples | Primary purpose |
| --- | --- | --- |
| Official providers | Company career sites, campus recruiting sites, public job pages, ATS APIs | Find structured openings with application URLs |
| Signal providers | Weibo, V2EX, GitHub, Bilibili, X/Twitter, public account articles, recruiter posts, referrals | Find fresh hiring intent before it becomes a formal posting |

Reach is a first-class external signal layer for yoCareer. It should be integrated through adapters, health checks, and fallback behavior.

yoCareer should not vendor the full Reach service into this repository for v1. The project should remain complete without Reach by supporting basic company-page scanning and manual import. When Reach is available, yoCareer should use it to improve dynamic-page reading and fragmented signal discovery.

## 3. Reach Integration Boundary

Reach should be treated as an optional but first-class runtime capability:

- `reach_read_url` is the preferred fallback for dynamic official pages because it can use static reading first and browser rendering when needed.
- Platform-specific Reach tools are the preferred path for fragmented hiring signals when they are available.
- If Reach is unavailable, yoCareer must degrade to Playwright, DOM extraction, generic web search, or manual import.
- Reach failures must be reported as source limitations, not silent scan failures.

Do not use Reach or any other tool to:

- Log in to BOSS, Zhaopin, Liepin, 51job, Lagou, Maimai, Xiaohongshu, WeChat, or similar platforms on behalf of the user.
- Bypass CAPTCHA, anti-bot controls, paywalls, login walls, or platform rate limits.
- Bulk-message recruiters or auto-submit applications.
- Collect account-private content unless the user explicitly exports or provides it.

## 4. Target Scanner Architecture

`scan.mjs` should be refactored from one API-specific scanner into a provider pipeline:

```text
scan.mjs
  official providers
    ats_api
    company_page
    reach_read_url fallback

  signal providers
    reach_weibo_search
    reach_v2ex_hot / reach_v2ex_search
    reach_github_search
    reach_bilibili_search
    reach_twitter_search
    public_article_import
    generic_web_search

  normalization
    classify signal kind
    extract company / role / city / salary / contact hints
    score freshness and confidence
    recommend next action
```

The scanner output should use a unified recruitment signal model:

```js
{
  kind: "official_job" | "recruiter_post" | "referral_signal" | "community_post",
  company,
  role,
  title,
  url,
  source_platform,
  source_author,
  location,
  salary,
  contact_hint,
  posted_at,
  freshness,
  confidence,
  evidence_text,
  recommended_action
}
```

Allowed `recommended_action` values:

```text
apply_on_official_site
message_recruiter
ask_for_referral
save_for_manual_review
skip_low_confidence
```

Low-confidence signals should not be added directly to the application pipeline. They should be saved for manual review.

## 5. Iteration Roadmap

### v0.1 — Fork Baseline

Status: partially complete.

- Keep upstream credit and local-first architecture.
- Add China-market adaptation docs.
- Add China portal template.
- Add Chinese evaluation prompts.
- Update project metadata and docs to point to yoCareer.

### v0.2 — Official Job Sources

Goal: make public company career pages useful.

- Refactor `scan.mjs` into a provider architecture.
- Keep existing Greenhouse, Ashby, and Lever API support.
- Add `company_page` provider for public company career sites.
- Use Playwright and DOM extraction for visible job links.
- Use `reach_read_url` as dynamic-page fallback when available.
- Preserve `--dry-run` as a strict no-write mode.

### v0.3 — Fragmented Signal Sources

Goal: collect fresh hiring intent from social and community channels.

- Add `signal_provider` support.
- Integrate available Reach tools for Weibo, V2EX, GitHub, Bilibili, and X/Twitter.
- Add adapter placeholders for Xiaohongshu and WeChat public articles.
- Support manual import for private group forwards, pasted posts, screenshots, and public account articles.
- Classify signals as official job, recruiter post, referral signal, or community post.

### v0.4 — Signal Normalization and Confidence

Goal: prevent noisy social data from polluting the job pipeline.

- Normalize all provider outputs into the recruitment signal model.
- Score freshness, source reliability, evidence quality, and actionability.
- Separate high-confidence official jobs from manual-review signals.
- Detect likely outsourcing, agency, spam, stale reposts, and vague hiring posts.
- Store enough evidence text for later review without collecting unnecessary personal data.

### v0.5 — Action Flow

Goal: generate the right next step for each signal type.

- Official job: recommend official application and tailored CV.
- Recruiter post: draft concise recruiter message for manual sending.
- Referral signal: draft referral request and context summary.
- Community post: save for review and suggest verification questions.
- Low-confidence signal: explain why it was skipped.

### v0.6 — Multi-Model and Chinese Evaluation Loop

Goal: make evaluation usable with different model providers.

- Add model configuration examples for OpenAI-compatible providers, Gemini, and CLI agents.
- Keep API keys in `.env` or environment variables only.
- Build a reusable model runner for text generation.
- Preserve manual review before any external action.
- Integrate Chinese evaluation prompts into the normal pipeline.

## 6. Implementation Principles

- The project must remain usable without Reach.
- Reach availability should upgrade quality, not determine whether yoCareer can run.
- All platform-specific tools must have explicit source labels and error reporting.
- No hidden login automation.
- No bulk messaging or auto-application.
- Manual import is a first-class path, not a fallback of last resort.
- Recruitment signals are not applications; only reviewed, actionable signals should enter `data/applications.md`.

## 7. Verification Strategy

Every scanner iteration should verify:

- `npm run doctor` passes.
- `npm run verify` passes on fresh and non-empty data.
- `npm run scan -- --dry-run` does not write tracked or ignored data files.
- Reach health check reports unavailable/available states clearly.
- Provider failures are visible in the scan summary.
- Low-confidence signals are not auto-promoted to applications.

## 8. Relationship to Other Docs

- `docs/CHINA_MARKET_ADAPTATION.md` defines product positioning and compliance boundaries.
- This document defines the implementation roadmap.
- `templates/portals.cn.example.yml` should evolve with this roadmap as provider support expands.
