# CV Components — Semantic Class Spec

The HTML templates (`cv-template.html`, `cv-template.cn.html`) are
**class-first**: every visible element wears a semantic class, and all theme
colors come from the CSS variables defined in `themes.md`. **Don't add
inline `style="..."` attributes** — they bypass theming and break ATS audits.

## Global

| Class | Purpose | Required children / attrs |
|-------|---------|---------------------------|
| `.page` | Outer container — caps width, sets margins | All sections nest inside |
| `.section` | Wraps every named section | One `.section-title` + content |
| `.section-title` | Section header (PROFESSIONAL SUMMARY, etc.) | Plain text; no nested elements |
| `.avoid-break` | Apply to anything that must not split across pages | Combine with the section class |

## Header

| Class | Purpose |
|-------|---------|
| `.header` | Outer header block; first child of `.page` |
| `.header h1` | Candidate name; theme `--text` color |
| `.header-gradient` | 2px gradient line; `--gradient-from` → `--gradient-to` |
| `.contact-row` | Single-line contact info (phone / email / links / location) |
| `.contact-row .separator` | The `\|` divider between contact items; `--rule` color |

## Work experience

| Class | Purpose |
|-------|---------|
| `.job` | One position; auto `break-inside: avoid` |
| `.job-header` | Flex row: company name + period |
| `.job-company` | Theme `--accent` color |
| `.job-period` | Right-aligned date range |
| `.job-role` | Job title |
| `.job-location` | Optional |
| `.job ul` / `.job li` | Achievement bullets |
| `.job li strong` | Inline metric / keyword emphasis |

## Projects

| Class | Purpose |
|-------|---------|
| `.project` | One project entry |
| `.project-title` | Project name; `--accent` color |
| `.project-badge` | Optional tag (e.g. "Open Source", "Production"); `--primary-soft` bg |
| `.project-desc` | One-paragraph description |
| `.project-tech` | Comma-separated stack |

## Education

| Class | Purpose |
|-------|---------|
| `.edu-item` | One degree |
| `.edu-header` | Flex row: title + year |
| `.edu-title` | "BSc Computer Science" |
| `.edu-org` | School name; `--accent` color |
| `.edu-year` | Right-aligned date |
| `.edu-desc` | Optional thesis / honors |

## Certifications

| Class | Purpose |
|-------|---------|
| `.cert-item` | One cert; flex row title + year |
| `.cert-title` | Cert name |
| `.cert-org` | Issuer; `--accent` color |
| `.cert-year` | Right-aligned year |

## Skills

| Class | Purpose |
|-------|---------|
| `.skills-grid` | Wrapping flex container |
| `.skill-item` | One skill / language |
| `.skill-category` | Bold sub-header (optional grouping) |

## Competencies (6-8 keyword tags above experience)

| Class | Purpose |
|-------|---------|
| `.competencies-grid` | Wrapping flex container |
| `.competency-tag` | One pill; `--primary` text on `--primary-soft` bg, `--primary-line` border |

## Adding a new component

1. Add the class to this file with a one-line purpose.
2. Add the styles to BOTH `cv-template.html` and `cv-template.cn.html`
   (or extract into a future `cv-system.css` if multi-template patterns grow).
3. Use only theme variables for colors — never inline hex.
4. Run the canary + at least one broken fixture (`tests/cv-ats-selftest.mjs
   --expect-fail`) to confirm the new component doesn't accidentally bypass
   header/body ordering.
