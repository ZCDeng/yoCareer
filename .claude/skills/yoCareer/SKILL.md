---
name: yoCareer
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | patterns | followup | update]"
---

# yoCareer -- Router (Claude Code mirror of `.agents/skills/yoCareer/SKILL.md`)

Read `AGENTS.md` for full project context, data contract, and onboarding rules. This SKILL routes the user's `/yoCareer ...` invocation to the right mode handler in `modes/`.

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `pdf-import` | `pdf-import` |
| `latex` | `latex` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |
| `interview-prep` | `interview-prep` |
| `update` | run `node update-system.mjs check`; if update available, `node update-system.mjs apply` |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
yoCareer -- Command Center

Available commands:
  /yoCareer {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /yoCareer pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /yoCareer oferta    → Evaluation only A-F (no auto PDF)
  /yoCareer ofertas   → Compare and rank multiple offers
  /yoCareer contacto  → LinkedIn power move: find contacts + draft message
  /yoCareer deep      → Deep research prompt about company
  /yoCareer pdf       → PDF only, ATS-optimized CV
  /yoCareer pdf-import → Extract data/inbox/*.pdf into signals.ndjson
  /yoCareer latex     → LaTeX/Overleaf .tex export
  /yoCareer training  → Evaluate course/cert against North Star
  /yoCareer project   → Evaluate portfolio project idea
  /yoCareer tracker   → Application status overview
  /yoCareer apply     → Live application assistant (reads form + generates answers)
  /yoCareer scan      → Scan portals and discover new offers
  /yoCareer batch     → Batch processing with parallel workers
  /yoCareer patterns  → Analyze rejection patterns and improve targeting
  /yoCareer followup  → Follow-up cadence tracker: flag overdue, generate drafts
  /yoCareer update    → Check for and apply yoCareer system updates

Inbox: add URLs to data/pipeline.md → /yoCareer pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `latex`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`, `interview-prep`, `pdf-import`

### Modes delegated to subagent:
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as `Agent` / `Task` with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="yoCareer {mode}"
)
```

---

## Language Modes

If the user has set `language.modes_dir` in `config/profile.yml`, replace `modes/` with that directory in the lookups above. Supported defaults:

- `modes/zh-cn/` — Chinese (China market). Includes `pdf.md` (CJK CV generation, mandatory route for CJK content; Latin `modes/pdf.md` will produce boxes). Use `templates/cv-template.cn.html` / `.cn.tex`; run `tests/cv-ats-selftest.mjs --lang=zh-cn` after generation.

---

## Onboarding Gate (CRITICAL)

Before running ANY mode (except `discovery` and `update`), check that `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml` all exist. If any is missing, follow the First Run Onboarding flow in `AGENTS.md` instead of executing the requested mode.

---

## Pipeline Integrity Hooks

After modes that mutate the tracker (`auto-pipeline`, `oferta`, `batch`, `apply`), run:

```bash
node merge-tracker.mjs
node normalize-statuses.mjs
node dedup-tracker.mjs
node verify-pipeline.mjs
```

Execute the instructions from the loaded mode file.
