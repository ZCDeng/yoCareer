---
name: yoCareer
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
arguments: mode
user-invocable: true
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | patterns | followup | update]"
license: MIT
---

# yoCareer -- AI Job Search Pipeline

Read `AGENTS.md` for full project context, data contract, and onboarding rules. This SKILL routes the user's `/yoCareer ...` invocation to the right mode handler in `modes/`.

## Mode Routing

Determine the mode from `{{mode}}` (or `$ARGUMENTS` depending on host CLI):

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

**Auto-pipeline detection:** If the input is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If the input is not a sub-command AND doesn't look like a JD, show discovery.

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

### Modes that require `_shared.md` + their mode file

Read `modes/_shared.md` + `modes/{mode}.md`.

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `latex`, `contacto`, `apply`, `pipeline`, `scan`, `batch`.

### Standalone modes (only their mode file)

Read `modes/{mode}.md`.

Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`, `interview-prep`, `pdf-import`.

### Modes delegated to a sub-agent

For `scan`, `apply` (with browser automation), and `pipeline` (3+ URLs): launch via the host CLI's sub-agent primitive (`Agent` / `Task` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi, etc.) with the content of `_shared.md` + `modes/{mode}.md` injected into the sub-agent prompt.

```
sub-agent(
  type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="yoCareer {mode}"
)
```

If the host CLI does not support parallel sub-agents, run sequentially.

---

## Language Modes

If the user has set `language.modes_dir` in `config/profile.yml`, replace `modes/` with that directory in the lookups above. Supported defaults:

- `modes/zh-cn/` — Chinese (China market): `evaluate.md` (eval), `apply.md` (apply), `pipeline.md`, `pdf.md` (CJK CV generation). Use `templates/cv-template.cn.html` / `cv-template.cn.tex` for PDF generation, and run `tests/cv-ats-selftest.mjs --lang=zh-cn` after generation to verify CJK readability. CJK content (zh-cn JD or CV) → ALWAYS route through `modes/zh-cn/pdf.md`, NOT default `modes/pdf.md` (Latin font stack will render CJK as boxes).

When the user explicitly asks for a non-default language or the agent detects a JD in another language, suggest switching.

---

## Onboarding Gate (CRITICAL)

Before running ANY mode (except `discovery` and `update`), check that:

1. `cv.md` exists
2. `config/profile.yml` exists
3. `modes/_profile.md` exists
4. `portals.yml` exists

If any is missing, follow the First Run Onboarding flow in `AGENTS.md` instead of executing the requested mode. Do not silently skip onboarding — these files are user-layer personalization that everything else depends on.

---

## Pipeline Integrity Hooks

After modes that mutate the tracker (`auto-pipeline`, `oferta`, `batch`, `apply`), remind the user (or auto-run if non-interactive) the merge → normalize → dedup chain:

```bash
node merge-tracker.mjs
node normalize-statuses.mjs
node dedup-tracker.mjs
node verify-pipeline.mjs
```

This keeps `data/applications.md` canonical per `templates/states.yml`.

---

Execute the instructions from the loaded mode file.
