---
name: accessibility-audit
description: Review interfaces for practical accessibility, keyboard, screen-reader, contrast, and touch usability.
---

# Accessibility Audit

Use this skill for web and mobile accessibility reviews and implementation.

## Review
- Semantic structure, headings, landmarks, and labels
- Keyboard navigation, visible focus, and logical focus order
- Screen-reader names, roles, values, and announcements
- Text and non-text contrast
- Text resizing, zoom, and dynamic type
- Touch target size and spacing
- Error identification and recovery
- Motion sensitivity and animation controls
- Color-independent status communication
- Captions, alternatives, and accessible media controls

## Implementation guidance
- Prefer native semantic controls over custom clickable containers.
- Label inputs and icon-only actions explicitly.
- Ensure dialogs manage focus and return it appropriately.
- Announce async status changes where assistive technology needs them.
- Do not rely on color, position, or shape alone.
- Respect reduced-motion settings.
- Keep focus indicators visible and unobscured.

## Output
For each issue, include location, affected user/task, severity, evidence, recommended fix, and verification method.

## Guardrails
A quick visual pass is not certification. State which checks were manual, automated, or not performed. Avoid claiming WCAG conformance unless the relevant criteria were actually evaluated.
