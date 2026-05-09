# Mirofish Design Checklist

## Before Shipping UI Changes

### Color & Contrast

- [ ] All text meets WCAG AA (4.5:1 for normal, 3:1 for large)
- [ ] Interactive elements have visible focus states
- [ ] Error states don't rely on color alone (icon/text accompanies red)
- [ ] Dark theme is the default; light theme is opt-in
- [ ] `--mf-accent` has sufficient contrast on both `--mf-bg` and `--mf-surface`

### Typography

- [ ] Body text uses `--mf-font-sans` (system font stack)
- [ ] Code/monospace uses `--mf-font-mono`
- [ ] No font sizes below 12px (`--mf-text-xs`)
- [ ] Line height is at least 1.5 for body text (`--mf-leading-normal`)
- [ ] Chinese text has `word-break: keep-all` where appropriate

### Spacing

- [ ] Touch targets are ≥ 44×44px on compact screens
- [ ] Buttons have adequate padding (`--mf-space-2` horizontal minimum)
- [ ] Related elements use `--mf-space-2`–`--mf-space-3`
- [ ] Sections are separated by `--mf-space-6`–`--mf-space-8`
- [ ] No magic numbers — all spacing uses the scale

### Motion

- [ ] Transitions use `--mf-duration-fast` or `--mf-duration-base`
- [ ] Reduced motion is respected: `@media (prefers-reduced-motion: reduce)`
- [ ] No layout shifts during load (reserve space for dynamic content)
- [ ] Loading states have skeleton or spinner, not blank

### Interaction

- [ ] All interactive elements are keyboard accessible
- [ ] Focus order follows visual order (left→right, top→bottom)
- [ ] Escape key closes dialogs and palettes
- [ ] Cmd+K (or Ctrl+K) opens command palette
- [ ] Form inputs have associated labels
- [ ] Error messages are specific and actionable

### Responsive

- [ ] Compact view (<640px) is usable without horizontal scroll
- [ ] Navigation wraps or collapses on small screens
- [ ] Cmd+K dialog is full-width on mobile
- [ ] Tables have horizontal scroll containers if needed
- [ ] Font sizes don't shrink below readable on any breakpoint

### Performance

- [ ] No layout thrashing (read layout, then write)
- [ ] CSS animations use `transform` and `opacity` only
- [ ] Images have explicit width/height to prevent CLS
- [ ] SVG icons are inline (no extra HTTP requests)
- [ ] Dark theme doesn't cause flash of unstyled content

### Accessibility

- [ ] Page has `<title>` and `<html lang="zh-CN">`
- [ ] Color isn't the only means of conveying information
- [ ] ARIA labels on icon-only buttons
- [ ] Dialogs use `<dialog>` element or have `role="dialog"`
- [ ] Live regions for status updates (`aria-live="polite"`)
- [ ] Skip link for keyboard users (if page has navigation)

### Tokens Compliance

- [ ] No hardcoded colors — use `--mf-*` tokens
- [ ] No hardcoded spacing — use `--mf-space-*` tokens
- [ ] No hardcoded font sizes — use `--mf-text-*` tokens
- [ ] No hardcoded shadows — use `--mf-shadow-*` tokens
- [ ] Component variations use component tokens, not direct semantic tokens
