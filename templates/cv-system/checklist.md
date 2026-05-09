# CV Checklist — P0 / P1 / P2 / P3 quality gates

Run this checklist after generating a PDF, **before** marking the tracker
`PDF: ✅`. P0 must pass; P1 should pass; P2 / P3 are polish.

The auto-embedded ATS selftest in `generate-pdf.mjs` covers most P0 checks
mechanically. This file is the human-readable rubric and the manual checks
the selftest can't see.

## P0 — must pass (block PDF if any fail)

| # | Check | How to verify | Failure mode |
|---|-------|---------------|--------------|
| P0.1 | `<header>` precedes body content | `cv-ats-selftest.mjs` `field_order` | Sidebar / two-column layout — see `templates/cv-system/layouts.md` "ATS-banned layouts" |
| P0.2 | name → phone → email order in header | `cv-ats-selftest.mjs` `field_order.headerOk` | Contact-row fields out of order |
| P0.3 | Name, phone, email, education, experience all present in extracted text | `cv-ats-selftest.mjs` `fields_present` (all `true`) | Field embedded in SVG / image, or template variable left unfilled |
| P0.4 | No U+FFFD replacement chars or `[■□]` box chars in body | `cv-ats-selftest.mjs` `chinese_readability` | CJK font missing — check `fonts/noto-sans-sc-subset.woff2` exists and `@font-face` resolves |
| P0.5 | PDF text is selectable (not rasterized) | Open PDF, try to select a paragraph | Template was rendered to image / printed as raster |
| P0.6 | No template placeholders left | grep `{{` in HTML before render OR visual scan of PDF | Forgot to fill `{{LANG}}` / `{{SECTION_*}}` |

## P1 — should pass (warn, but don't block)

| # | Check | How to verify | Why |
|---|-------|---------------|-----|
| P1.1 | Body font-size >= 10px | Read CSS or screenshot | Smaller is unreadable on print |
| P1.2 | Line-height >= 1.5 (Latin) or >= 1.7 (CJK) | Read CSS | CJK glyphs need more vertical space |
| P1.3 | Page margins >= 0.5in | `generate-pdf.mjs --format` margins | Tight margins crowd ATS parsers |
| P1.4 | Single column throughout | Visual scan | Multi-column breaks reading order |
| P1.5 | Section titles use one of the canonical labels | See "Canonical labels" below | Non-standard names confuse keyword matchers |
| P1.6 | Top-3 keywords from the JD appear in summary AND first job bullet | Read summary + first `<li>` | Surface area for keyword matchers |
| P1.7 | No special chars that should have been ATS-normalized (em-dash, smart quotes, NBSP) | `generate-pdf.mjs` logs `🧹 ATS normalization` count | Normalization should fire on first render |
| P1.8 | Phone number uses a single canonical format | grep — single phone string in PDF | Two formats in one CV is a parse risk |

## P2 — fix if straightforward

| # | Check | Why |
|---|-------|-----|
| P2.1 | Color contrast vs background reads on B&W print | Some recruiters print to B&W |
| P2.2 | Header gradient renders (gradient-from != gradient-to except in `minimal-mono`) | Visual signal that the CV was built with intent |
| P2.3 | Each `.job` fits on one page (no orphan title at bottom) | `break-inside: avoid` is set; add `avoid-break` if not |
| P2.4 | Education / certification dates use one consistent format | "2020.07" vs "Jul 2020" — pick one |
| P2.5 | Project titles link to live URLs where applicable | Improves recruiter signal-to-noise |

## P3 — visual polish

| # | Check |
|---|-------|
| P3.1 | Theme matches role tonality (see `templates/cv-system/themes.md` decision tree) |
| P3.2 | Competency tags wrap to 2 lines max, not 3 |
| P3.3 | One-pager unless > 8 yr experience |
| P3.4 | Whitespace between sections is even (no orphan thin section) |

## Canonical section labels

Latin templates:

- `Professional Summary`
- `Core Competencies`
- `Work Experience`
- `Projects`
- `Education`
- `Certifications`
- `Skills`

CJK templates (双语标注 — Chinese first, English fallback parenthesized OK):

- 专业摘要 / Professional Summary
- 核心能力 / Core Competencies
- 工作经历 / Work Experience
- 项目 / Projects
- 教育背景 / Education
- 证书 / Certifications
- 专业技能 / Skills

## Running the checks

```bash
# Auto P0.1 - P0.4 happen inside generate-pdf.mjs by default. Make it strict:
node generate-pdf.mjs cv.html out.pdf --ats-strict

# Run the selftest manually for the JSON report:
node tests/cv-ats-selftest.mjs out.pdf --lang=zh-cn --name="张三"

# Run the full negative-fixture battery (catches new template regressions):
node test-all.mjs   # Section 11
```
