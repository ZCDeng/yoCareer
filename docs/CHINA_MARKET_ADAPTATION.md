# yoCareer China Market Adaptation

yoCareer is designed for the China market. The product direction is not "auto-apply everywhere". It is a local job-search operations system for evaluating roles, adapting materials, preparing interviews, and tracking outcomes across Chinese hiring channels.

## Positioning

The China version should optimize for:

- Candidate-controlled local data: CVs, salary expectations, notes, and reports stay in the local project by default.
- Human-in-the-loop actions: the system drafts, evaluates, and tracks; the candidate reviews and submits.
- Multi-channel sourcing: company career sites, campus recruiting pages, public job pages, WeChat/Feishu exports, screenshots, and pasted JDs.
- China-specific risk assessment: ghost jobs, vague salary ranges, outsourcing/body-shop signals, fake hiring, probation risk, overtime expectations, location mismatch, and platform account risk.

The China version should avoid:

- Bulk automated applications.
- Automated BOSS/Zhaopin/Liepin login, scraping, or messaging.
- CAPTCHA bypass, anti-bot evasion, or simulated mass user behavior.
- Sending resumes, phone numbers, chat logs, or interview records to model providers without explicit user control.

## Local Compliance Boundary

Use the default product boundary:

1. The user provides or imports job descriptions they are allowed to access.
2. yoCareer analyzes the provided text and public company information.
3. yoCareer generates drafts and recommendations.
4. The user manually reviews and performs final actions on third-party platforms.

Any integration that reads Chinese recruitment platforms should be implemented as an import helper or visible-page assistant, not as a hidden crawler.

## China-Specific Sources

Recommended source categories:

| Category | Examples | Default approach |
| --- | --- | --- |
| Enterprise career sites | Alibaba, Tencent, ByteDance, Huawei, Meituan, JD, Xiaomi | Public pages, user-configured URLs |
| Campus recruiting | Company campus sites, university career pages, Yingjiesheng, Niuke | Public pages or manual import |
| Public sector / SOE | Guopin, SASAC-related pages, local HR bureaus | Public pages, conservative parsing |
| Tech communities | V2EX, Niuke, GitHub issues, open-source communities | Manual import or public search |
| Mainstream platforms | BOSS, Zhaopin, Liepin, 51job, Lagou, Maimai | Manual paste, screenshot/OCR, or visible-page assistant only |
| Private channels | WeChat groups, Feishu docs, referrals | User-provided exports only |

## Evaluation Dimensions

Replace the upstream role-fit framing with China-market dimensions:

| Dimension | What to check |
| --- | --- |
| Role fit | Skills, domain, seniority, required stack, language needs |
| Hiring reality | Posting freshness, JD specificity, repeated reposting, HC clarity |
| Compensation | Salary band, bonus, stock, base/OTE split, probation discount |
| Workload | 995/996 signals, on-call, travel, client delivery pressure |
| Contract risk | Outsourcing, vendor role, dispatch, contractor vs employee |
| Growth | Team maturity, manager quality, project ownership, promotion path |
| Location | City, commute, remote/hybrid reality, relocation cost |
| Platform/account risk | Whether discovery or messaging would violate platform terms |

## First Implementation Milestones

1. Add China-market portal templates and title filters.
2. Add Chinese evaluation and outreach prompt modes.
3. Add local import flows for pasted JD, screenshots, and exported tables.
4. Add domestic model configuration examples for DeepSeek, Qwen, Kimi, Doubao, and Zhipu.
5. Add a compliance checklist before any browser-assisted workflow.
