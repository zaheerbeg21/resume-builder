---
name: design-system-audit
description: Audit design tokens and reusable components for consistency, semantic meaning, and maintainability.
---

# Design System Audit

Use this skill before changing colors, typography, spacing, buttons, inputs, surfaces, or shared UI components.

## Inspect
- Token definitions and naming conventions
- Light/dark themes and semantic color roles
- Typography scale, weights, line heights, and text styles
- Spacing, sizing, radii, borders, elevations, and shadows
- Button variants, states, sizes, and icon alignment
- Form controls, validation, focus, disabled, and loading states
- Shared components versus screen-specific overrides
- Platform conventions and responsive behavior

## Method
1. Locate the existing source of truth for tokens and themes.
2. Trace representative tokens into real components and screens.
3. Find hard-coded values, duplicate definitions, one-off overrides, and inconsistent variants.
4. Identify semantic gaps (for example, missing success, warning, or disabled roles).
5. Recommend a token/component change before suggesting screen-by-screen patches.
6. Check migration impact and backward compatibility before refactoring.

## Output
- Current architecture and source-of-truth files
- Inconsistencies with file/line or component evidence
- Proposed token/component model
- Migration plan ordered by risk
- Regression checklist

## Guardrails
Do not create a second competing design system. Do not mass-replace colors or styles without tracing their semantic purpose. Preserve intentional brand and product-specific exceptions.
