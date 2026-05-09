# Mirofish Themes

## Design Intent

Mirofish is yoCareer's visual design system. The name evokes fluid, interconnected pathways — like a school of fish navigating together through water. The design language prioritizes:

1. **Focus endurance** — dark-first for long job-search sessions
2. **Information density** — compact UI with clear hierarchy
3. **Progressive disclosure** — surface level → detail on demand
4. **Zero friction** — every action has immediate visual feedback

## Theme Architecture

```
Primitive colors ──→ Semantic tokens ──→ Component tokens ──→ CSS classes
     ↓                    ↓                    ↓                  ↓
   #0a0a0a           --mf-bg           --mf-card-bg        .module-card
```

### Token Naming Convention

| Layer | Prefix | Example |
|-------|--------|---------|
| Primitive | `--mf-{color}-{shade}` | `--mf-gray-900` |
| Semantic | `--mf-{property}` | `--mf-bg`, `--mf-text-muted` |
| Component | `--mf-{component}-{property}` | `--mf-card-bg`, `--mf-input-border` |

## Dark Theme (Default)

The dark theme is optimized for extended use. Color choices:

- **Background** `#0a0a0a` — deep enough to reduce eye strain without crushing shadows
- **Surface** `#171717` — subtle elevation from background
- **Text** `#e8e8e8` — high contrast (≥ 15:1 against bg) without pure white glare
- **Accent** `#4a9eff` — blue that works in both dark and light contexts
- **Success** `#4caf50` — green with sufficient saturation at all sizes
- **Error** `#f44336` — red that remains distinguishable for colorblind users

### Contrast Ratios

| Pair | Ratio | WCAG |
|------|-------|------|
| text on bg | 15.3:1 | AAA |
| text-muted on bg | 5.8:1 | AA |
| text-dim on bg | 3.1:1 | Large text only |
| accent on bg | 7.2:1 | AAA |
| success on bg | 6.9:1 | AA |
| error on bg | 5.4:1 | AA |

## Light Theme

Activated via `prefers-color-scheme: light` or `[data-theme="light"]` class.

Key inversions:
- Background → `#fafafa` (off-white, not pure white)
- Surface → `#ffffff`
- Text → `#0a0a0a`
- Accent → `#2563eb` (darker blue for light backgrounds)
- Shadows become softer and more diffused

## Semantic Color Map

### Background hierarchy

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--mf-bg` | `#0a0a0a` | `#fafafa` | Page background |
| `--mf-surface` | `#171717` | `#ffffff` | Cards, dialogs |
| `--mf-surface-hover` | `#262626` | `#f0f0f0` | Hover states |
| `--mf-surface-raised` | `#404040` | `#e4e4e4` | Elevated elements |

### Feedback colors

| State | Token | Dark | Light |
|-------|-------|------|-------|
| Success | `--mf-success` | `#4caf50` | `#16a34a` |
| Error | `--mf-error` | `#f44336` | `#dc2626` |
| Warning | `--mf-warning` | `#ff9800` | `#d97706` |
| Info | `--mf-accent` | `#4a9eff` | `#2563eb` |

Each state has a `-soft` variant (e.g., `--mf-success-soft`) for subtle backgrounds and borders.
