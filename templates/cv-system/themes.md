# CV Themes — Locked Palettes

This file is the **single source of truth** for theme switching. Each theme is
a fixed set of CSS variable values. Don't introduce new themes by editing the
templates — add an entry here, then a matching `[data-theme="..."]` block in
`cv-template.html` and `cv-template.cn.html`.

## How a theme is applied

1. Agent picks a theme name (see "Picking a theme" below).
2. Agent sets `<html data-theme="{{THEME}}">` in the rendered HTML.
3. The `[data-theme="..."]` selector in `<style>` activates the matching CSS
   variable block. Everything downstream (`color`, `background`, gradient)
   reads `var(--*)`.

> **Rule:** templates only switch on `data-theme`. **Never inline custom hex
> colors** in CV content — that breaks theme lock-in and rotates the palette.
> If a CV needs a color the themes don't cover, add a new theme here.

## CSS variables (the 9 the templates read)

| Var | Used by | What it controls |
|-----|---------|------------------|
| `--text` | `body`, `h1` | Body and name color |
| `--text-muted` | `.contact-row`, `.job-period`, `.edu-year`, `.cert-year`, `.project-tech` | Secondary meta text |
| `--rule` | `.section-title` underline, `.separator` | Hairline separators |
| `--primary` | `.section-title`, `.competency-tag` color | Brand primary |
| `--primary-soft` | `.competency-tag` background | Tinted surface |
| `--primary-line` | `.competency-tag` border | Tinted border |
| `--accent` | `.job-company`, `.edu-org`, `.project-title`, `.cert-org`, `.project-badge` color | Brand accent (company / org names) |
| `--gradient-from` | `.header-gradient` start | Header line gradient start |
| `--gradient-to` | `.header-gradient` end | Header line gradient end |

The grays (#333 / #444 / #777 / #888) stay hardcoded — they read on any background.

## Themes

### `default` — cyan + purple (current/legacy palette)

**Use for:** general AI / tech roles, default unless agent has reason to switch.

```css
[data-theme="default"] {
  --text: #1a1a2e;
  --text-muted: #555;
  --rule: #e2e2e2;
  --primary: hsl(187, 74%, 32%);
  --primary-soft: hsl(187, 40%, 95%);
  --primary-line: hsl(187, 40%, 88%);
  --accent: hsl(270, 70%, 45%);
  --gradient-from: hsl(187, 74%, 32%);
  --gradient-to: hsl(270, 70%, 45%);
}
```

### `corporate-navy` — conservative business

**Use for:** finance, consulting, large enterprise (国内大厂 / 央企 / 银行 / 投行 / 咨询), positions where readability matters more than personality.

```css
[data-theme="corporate-navy"] {
  --text: #0f172a;
  --text-muted: #64748b;
  --rule: #e2e8f0;
  --primary: #1e3a8a;
  --primary-soft: #eff6ff;
  --primary-line: #dbeafe;
  --accent: #475569;
  --gradient-from: #1e3a8a;
  --gradient-to: #475569;
}
```

### `minimal-mono` — black & white, no color

**Use for:** academia / research / legal / creative roles where any color reads as decoration; also good for B&W printers and accessibility-first review.

```css
[data-theme="minimal-mono"] {
  --text: #1a1a1a;
  --text-muted: #666666;
  --rule: #d4d4d4;
  --primary: #1a1a1a;
  --primary-soft: #f5f5f5;
  --primary-line: #e5e5e5;
  --accent: #404040;
  --gradient-from: #1a1a1a;
  --gradient-to: #1a1a1a;
}
```

### `tech-indigo` — modern dev / AI startup

**Use for:** AI / 大模型 / infrastructure / dev tools / SaaS startup roles. Reads modern without being flashy.

```css
[data-theme="tech-indigo"] {
  --text: #1e1b4b;
  --text-muted: #6b7280;
  --rule: #e5e7eb;
  --primary: #4338ca;
  --primary-soft: #eef2ff;
  --primary-line: #c7d2fe;
  --accent: #0891b2;
  --gradient-from: #4338ca;
  --gradient-to: #0891b2;
}
```

### `academia-forest` — academic / research

**Use for:** PhD applications, research scientist roles, university / 国家实验室 / 研究院 positions.

```css
[data-theme="academia-forest"] {
  --text: #1c1917;
  --text-muted: #78716c;
  --rule: #e7e5e4;
  --primary: #166534;
  --primary-soft: #f0fdf4;
  --primary-line: #bbf7d0;
  --accent: #92400e;
  --gradient-from: #166534;
  --gradient-to: #92400e;
}
```

## Picking a theme (decision tree)

1. **JD says "creative" or company is design-heavy** → consider future `creative-warm` (not yet implemented; fall back to `default`).
2. **Finance / banking / consulting / 央企 / 大厂 conservative track** → `corporate-navy`.
3. **AI / startup / dev tools** → `tech-indigo` (or `default` if user has existing brand identity around the cyan/purple palette).
4. **Academia / research / PhD** → `academia-forest`.
5. **Strict ATS / B&W print / accessibility** → `minimal-mono`.
6. **No strong signal** → `default`.

## Adding a new theme

1. Add entry to this file (table + `[data-theme="..."]` block).
2. Copy the block into `cv-template.html` and `cv-template.cn.html` (right after the existing theme blocks).
3. Run a smoke render against `tests/fixtures/canary-cv.cn.html` with the new theme and confirm the ATS selftest still passes.
4. Update `templates/cv-system/checklist.md` if the new theme has unusual constraints.

> **Don't** add a theme just for one CV. Themes are reusable palettes; one-off color choices belong in a fork of the template, not the system.
