# Mirofish Layouts

## Breakpoints

| Name | Width | Target |
|------|-------|--------|
| `compact` | < 640px | Mobile phones |
| `medium` | 640–1024px | Tablets, small laptops |
| `wide` | > 1024px | Desktops (default) |

Breakpoints are mobile-first. Base styles target `wide`, overrides reduce for smaller screens.

## Container

```
App container: max-width 1200px, centered, 24px padding
```

On compact screens, padding reduces to 16px and max-width becomes 100%.

## Grid System

Mirofish uses a simple content-centric layout, not a strict grid:

```
┌─────────────────────────────────────────┐
│  Header (flex, space-between)           │
├─────────────────────────────────────────┤
│  Navigation (horizontal pill bar)       │
├─────────────────────────────────────────┤
│                                         │
│  Main content (single column,           │
│  max-width 800px for readability)       │
│                                         │
└─────────────────────────────────────────┘
```

### Content max-widths

| Element | Max-width | Reason |
|---------|-----------|--------|
| Markdown text | 800px | Optimal reading line length (~75ch) |
| Module cards | 100% | Fill container |
| Cmd+K dialog | 560px | Comfortable scanning width |
| Tables | 100% | Horizontal scroll if needed |

## Spacing Scale

Base unit: **4px** ( `--mf-space-1` )

| Token | Value | Common Usage |
|-------|-------|-------------|
| `--mf-space-1` | 4px | Inline padding, icon gaps |
| `--mf-space-2` | 8px | Tight groups, nav gap |
| `--mf-space-3` | 12px | Button padding, list item internal |
| `--mf-space-4` | 16px | Section internal padding |
| `--mf-space-5` | 20px | Card padding (compact) |
| `--mf-space-6` | 24px | Card padding, page gutters |
| `--mf-space-8` | 32px | Section separation |
| `--mf-space-10` | 40px | Major section breaks |
| `--mf-space-12` | 48px | Hero areas |
| `--mf-space-16` | 64px | Page-level spacing |

### Spacing rules

1. **Related elements** → `--mf-space-2` to `--mf-space-3`
2. **Siblings in a group** → `--mf-space-4`
3. **Distinct sections** → `--mf-space-6` to `--mf-space-8`
4. **Page sections** → `--mf-space-10` to `--mf-space-12`

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--mf-z-base` | 0 | Default content |
| `--mf-z-sticky` | 10 | Sticky headers |
| `--mf-z-dropdown` | 50 | Dropdowns, popovers |
| `--mf-z-modal` | 100 | Dialogs, overlays |
| `--mf-z-toast` | 200 | Notifications |

## Responsive Rules

### Compact (< 640px)

```css
@media (max-width: 640px) {
  #app { padding: 16px; }
  .app-header h1 { font-size: 20px; }
  .app-nav { flex-wrap: wrap; gap: 4px; }
  .nav-item { padding: 6px 12px; font-size: 13px; }
  .module-card { padding: 16px; }
  .cmdk-container { width: 100vw; border-radius: 0; }
}
```

### Medium (640–1024px)

```css
@media (max-width: 1024px) {
  #app { padding: 20px; }
  .cmdk-container { width: 90vw; }
}
```
