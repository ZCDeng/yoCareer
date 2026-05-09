# CV Layouts — Reading-Order Variants

CVs in yoCareer are **single-column only**. Multi-column / sidebar layouts
break ATS extraction (`tests/cv-ats-selftest.mjs:checkFieldOrder` will reject
them — see `tests/fixtures/canary-cv.cn-broken-header-after-body.html` for the
canonical regression case).

This file enumerates the **reading-order variants** within single-column.
Each variant lists which sections appear and in what order.

## Hard rules (every layout)

1. **`<header>` block first.** Name → contact row (phone, email, links, location).
   The ATS selftest enforces `name → phone → email` ordering inside the header.
2. **Body sections after the header.** `checkFieldOrder` checks that the last
   header field (email) precedes the first body field (education *or*
   experience).
3. **No sidebars, no `position: absolute`** to push content into specific
   spatial positions. CSS columns / grid that change the source-order DOM
   reading sequence are forbidden.
4. **No tables for layout.** Tables are fine for actual tabular data, but
   never for sectioning.

## Variant A — Senior (default for >= 5 yr experience)

```
HEADER
SUMMARY
COMPETENCIES   ← 6-8 keyword tags
EXPERIENCE     ← largest block, top of body
PROJECTS       ← top 3-4 most relevant
EDUCATION
CERTIFICATIONS (optional)
SKILLS
```

**ATS rating:** ✅ safe.
**Use when:** Candidate has >= 5 years experience and the work history is the
strongest signal. This is the existing yoCareer default.

## Variant B — New grad / early career

```
HEADER
SUMMARY
EDUCATION      ← moved up; recent degree is the strongest signal
COMPETENCIES
EXPERIENCE     ← may be short; internships, TA work
PROJECTS       ← more weight; portfolio carries the CV
SKILLS
```

**ATS rating:** ✅ safe (header still first; body order is flexible).
**Use when:** Candidate has < 3 years post-degree experience, or the degree
itself is the most relevant credential (PhD applying to research roles).

## Variant C — Career changer / senior IC re-entering

```
HEADER
SUMMARY        ← longer (4-5 lines), narrative bridge between past and target
PROJECTS       ← portfolio-first; demonstrates the new direction
EXPERIENCE
COMPETENCIES
EDUCATION
SKILLS
```

**ATS rating:** ✅ safe.
**Use when:** The role on the CV is materially different from the recent job
title; the agent should lead with proof points (projects) over chronology.

## Variant D — Academic CV (research-track)

```
HEADER
SUMMARY (research statement — 4-6 lines)
EDUCATION (with thesis / advisor)
PUBLICATIONS  ← needs custom section; treat like PROJECTS but title differently
EXPERIENCE
TEACHING (optional)
CERTIFICATIONS / AWARDS
SKILLS / LANGUAGES
```

**ATS rating:** ✅ safe within the single-column rule.
**Use when:** Applying to PhD, post-doc, research scientist, or
university-track positions. Pair with `data-theme="academia-forest"`.

## ATS-banned layouts (explicit don't-do list)

| Pattern | Why banned |
|--------|------|
| Two-column body (left summary, right content) | `pdftotext -layout` extracts in column-major order; reading sequence broken |
| Sidebar (header pulled to a vertical bar) | Same — `field_order` check rejects it (header fields end up after body) |
| Header in `<footer>` or absolute-positioned at bottom | Header must precede body in both DOM and visual order |
| Decorative SVG with embedded text | `pdftotext` extracts no text from raster/SVG glyphs; `fields_present` will fail |
| Tables for sectioning | Older parsers split the row content into adjacent cells, garbling reading order |

`tests/cv-ats-selftest.mjs --expect-fail` covers these via the broken canary
fixtures — adding a new layout means adding a positive smoke test to confirm
it still passes.

## How an agent picks a layout

1. If the user has not stated a preference, default to **Variant A (Senior)**
   for `>= 5 yr` experience or **Variant B (New grad)** for `< 3 yr`.
2. If the JD is research-heavy (academic / R&D / lab) → **Variant D**.
3. If the candidate's recent work is unrelated to the target role and a
   portfolio carries the proof → **Variant C**.
4. **Never** invent a new layout for a single CV. If none of the above
   variants fit, add one here first (with an ATS rating + canary smoke check).
