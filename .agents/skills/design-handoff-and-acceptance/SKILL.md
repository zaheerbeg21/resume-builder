---
name: design-handoff-and-acceptance
description: Turn design decisions into implementation-ready specifications and testable acceptance criteria.
---

# Design Handoff and Acceptance Criteria

Use this skill when handing a design to engineering or validating a UI implementation.

## Specify
- Screen purpose and primary user task
- Layout structure and responsive behavior
- Design tokens and component variants
- Interaction states and transitions
- Content, validation, and error behavior
- Loading, empty, offline, and success states
- Accessibility requirements
- Analytics events only when explicitly required and defined

## Acceptance criteria
Write observable, testable statements. Include normal, edge, and failure paths. Specify behavior rather than subjective phrases such as "looks good" or "works smoothly."

## Review implementation
Compare behavior and visuals against the approved specification. Record deviations and classify them as intentional, acceptable, or defects.

## Guardrails
Do not invent missing design values. Flag ambiguity and request clarification only when it blocks implementation. Avoid prescribing implementation details when multiple solutions meet the experience requirement.
