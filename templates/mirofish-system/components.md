# Mirofish Components

## Component Token System

Each component exposes these token categories:
- **Base** — default appearance
- **Hover** — mouse/touch hover
- **Active** — pressed/selected
- **Focus** — keyboard focus ring
- **Disabled** — non-interactive state
- **Error** — validation failure

## Button

### Variants

| Variant | Background | Border | Text | Usage |
|---------|-----------|--------|------|-------|
| Default | `--mf-surface` | `--mf-border` | `--mf-text-muted` | Secondary actions |
| Primary | `--mf-accent` | transparent | `--mf-text-inverse` | Main CTA |
| Ghost | transparent | transparent | `--mf-text-muted` | Tertiary actions |

### States

```
Default  →  Hover: bg → --mf-surface-hover, text → --mf-text
Default  →  Active: bg → --mf-surface-raised
Default  →  Focus: ring 2px --mf-accent-soft
Primary  →  Hover: bg → --mf-accent-hover
Primary  →  Active: bg → --mf-accent-active
Disabled →  opacity: 0.5, cursor: not-allowed
```

### Anatomy

```
┌─────────────────────────┐
│  [icon]  Label          │  ← padding: --mf-space-2 --mf-space-3
│                         │  ← border-radius: --mf-radius-md
└─────────────────────────┘  ← border: --mf-button-border
```

## Badge

### Variants

| Variant | Background | Border | Text |
|---------|-----------|--------|------|
| Default | `--mf-surface` | `--mf-border` | `--mf-text-muted` |
| Live | `rgba(76, 175, 80, 0.12)` | `rgba(76, 175, 80, 0.3)` | `--mf-success` |
| Error | `rgba(244, 67, 54, 0.08)` | `rgba(244, 67, 54, 0.25)` | `--mf-error` |
| Accent | `--mf-accent-soft` | `rgba(74, 158, 255, 0.2)` | `--mf-accent` |

### Anatomy

```
┌──────────┐
│  Status  │  ← padding: --mf-space-1 --mf-space-3
└──────────┘  ← border-radius: --mf-radius-full (pill)
              ← font-size: --mf-text-sm
```

## Card

### Anatomy

```
┌─────────────────────────────┐  ← background: --mf-card-bg
│                             │  ← border: --mf-card-border
│  Title                      │  ← padding: --mf-card-padding
│  ─────────────────────────  │  ← border-radius: --mf-card-radius
│  Content                    │
│                             │
└─────────────────────────────┘
```

### Card types

| Type | Shadow | Usage |
|------|--------|-------|
| Flat | none | Default cards |
| Elevated | `--mf-shadow-sm` | Cards in light theme |
| Hover-raised | `--mf-shadow-md` on hover | Interactive cards |

## Input

### Anatomy

```
┌─────────────────────────────┐  ← background: --mf-input-bg
│  Placeholder...             │  ← border: --mf-input-border
│                             │  ← border-radius: --mf-input-radius
└─────────────────────────────┘  ← padding: --mf-input-padding
```

### States

```
Default  →  border: --mf-border
Focus    →  border: --mf-accent, ring: --mf-accent-soft
Error    →  border: --mf-error, ring: --mf-error-soft
Disabled →  opacity: 0.5, bg: --mf-surface
```

## List Item

### Anatomy

```
┌─────────────────────────────────────────┐  ← bg: --mf-list-item-bg
│  Company Name          role · status    │  ← padding: --mf-list-item-padding
└─────────────────────────────────────────┘  ← border-radius: --mf-list-item-radius
                                             ← border: --mf-list-item-border
```

### States

```
Default →  bg: --mf-list-item-bg
Hover   →  bg: --mf-list-item-bg-hover
Active  →  bg: --mf-surface-hover, border-left: 3px --mf-accent
```

## Dialog (Cmd+K)

### Anatomy

```
┌──────────────────────────────────────────┐
│  [Backdrop: blur + 60% black]            │
│                                          │
│     ┌─────────────────────────────┐      │
│     │  Search...            [X]   │      │  ← input
│     ├─────────────────────────────┤      │
│     │  Command 1            ⌘1    │      │  ← list item
│     │  Command 2            ⌘2    │      │
│     │  Command 3            ⌘3    │      │
│     ├─────────────────────────────┤      │
│     │  ↑↓ navigate  ↵ select      │      │  ← footer
│     └─────────────────────────────┘      │
│                                          │
└──────────────────────────────────────────┘
```

### Dimensions

| Property | Value |
|----------|-------|
| Width | 560px (max 90vw) |
| Position | top 20%, centered |
| Border | `--mf-cmdk-border` |
| Shadow | `--mf-cmdk-shadow` |
| Backdrop | `--mf-cmdk-backdrop` + `--mf-cmdk-blur` |

### List item states

```
Default  →  transparent bg, --mf-text
Selected →  --mf-accent-soft bg
Hovered  →  --mf-accent-soft bg
```

## Status Indicators

| Status | Color | Icon suggestion |
|--------|-------|----------------|
| Connected | `--mf-success` | Filled circle |
| Reconnecting | `--mf-warning` | Pulse animation |
| Offline | `--mf-error` | Empty circle |
| Loading | `--mf-text-muted` | Spinner |
