---
name: responsive-layout-engineer
description: Audit and implement robust responsive layouts across phone, tablet, desktop, and orientation changes.
---

# Responsive Layout Engineer

Use this skill for responsive web layouts and adaptive mobile/tablet interfaces.

## Inspect
- Existing breakpoints and layout primitives
- Content width, grids, columns, gutters, and spacing
- Navigation changes across viewport sizes
- Overflow, clipping, truncation, and wrapping
- Images, tables, charts, dialogs, and dense data views
- Keyboard, safe-area, and orientation behavior

## Design approach
- Use content-driven breakpoints rather than targeting device brands.
- Prefer fluid constraints and reusable layout rules.
- Reflow content before shrinking text or controls.
- Preserve task priority and reading order at every width.
- Use horizontal scrolling only when it is appropriate and clearly discoverable.
- Keep important actions visible without covering content.

## Test matrix
Test at minimum: narrow phone, typical phone, tablet, desktop, landscape phone, and large text settings where applicable. Record exact viewport sizes and observed defects.

## Output
Provide breakpoint behavior, layout changes, affected components, overflow findings, and a reproducible validation matrix.
