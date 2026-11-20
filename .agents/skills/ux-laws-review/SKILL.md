---
name: ux-laws-review
description: Audit interfaces using six practical UX principles and produce prioritized, evidence-based recommendations.
---

# UX Laws Design Review

Apply only the principles relevant to the screen; do not force all six onto every design.

1. **Closure:** Signal continuation when more content exists, such as a partial next carousel card.
2. **Figure-ground:** Separate a focused dialog or task from surrounding context.
3. **Banner blindness:** Make important information relevant and native to the experience; label promotions honestly.
4. **Parkinson's Law:** Reduce unnecessary work through shorter flows, safe autofill, and progressive disclosure.
5. **Connectedness:** Show relationships and sequence through grouping, alignment, and connectors.
6. **Choice overload:** Structure choices so decisions are manageable without hiding meaningful options.

## Workflow
1. Identify user goal, screen context, platform, and primary action.
2. Inspect existing components, tokens, and behavior.
3. Mark each principle Relevant, Opportunity, Pass, or Not applicable.
4. Record evidence and user impact; do not invent problems.
5. Prioritize P0 (blocker/serious risk), P1 (major friction), P2 (polish).
6. Recommend the smallest change that improves comprehension or task completion.
7. Wait for approval before editing when the request is audit-only.
8. Verify implementation with tests and responsive/accessibility checks.

## Output
Context; findings with principle/status/evidence/impact/priority/recommendation; implementation plan; acceptance criteria; validation; remaining risks.

## Guardrails
These are heuristics, not absolute laws. Never sacrifice accessibility, clarity, consent, safety, or user control for visual cleverness.
