---
name: visual-regression-testing
description: Plan and run reliable visual regression checks for UI changes across screens, themes, and states.
---

# Visual Regression Testing

Use this skill when UI changes may affect shared components, themes, layouts, or important user flows.

## Before capture
- Identify stable routes/screens and representative component states.
- Fix viewport size, device scale, theme, locale, test data, and animation state.
- Disable or stabilize timestamps, random data, network-dependent content, and other nondeterministic elements.
- Capture baseline and changed versions under equivalent conditions.

## Compare
- Look for layout shifts, clipping, spacing drift, typography changes, contrast regressions, missing assets, and unexpected theme overrides.
- Distinguish intentional design changes from defects.
- Inspect both full-screen images and focused component crops.
- Verify interactive states separately: hover, focus, pressed, disabled, loading, validation, and dialogs.

## Report
- Route/component and test conditions
- Baseline versus current result
- Intentional differences
- Unexpected differences and severity
- Reproduction steps and artifacts
- Pass/fail and untested states

## Guardrails
Do not claim a visual test passed if no comparison was performed. Avoid brittle snapshots that fail on harmless dynamic content. Pair screenshots with functional and accessibility tests.
