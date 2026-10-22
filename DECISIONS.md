2026-10-18: AI layer uses a provider interface with Gemini primary and an OpenAI-compatible open-model fallback. Fallback adapter added behind the seam, enabled per task only after eval gate. No self-hosting for MVP. Reason: cost and availability; privacy gates apply to every provider.
2026-10-18: Blueprint weeks 0-3 rescheduled to 6-8 calendar weeks (118-144h est.) per ticket breakdown. Reason: DB triggers, proxy.ts, split editor, lint, parity tests.
2026-10-18: T-001 Phase 0: ResumeSchema is real (contract); registerFonts and ResumeDocument are throwing stubs so QA tests fail on assertions, not on missing imports.
2026-10-19: T-001 contract: section headings render literally as Summary, Experience, Education, Skills (no text transform).
2026-10-19: T-001 sabotage check 5 passed: with the hyphenation callback removed, both Criterion 4 tests go red.
2026-10-20: T-001 sabotage checks 1-4, 6 passed: layout padding, font family, heading case, missing section and date format each turn tests red.
2026-10-21: T-003 sabotage checks passed: bullet max boundary and month bounds regex each turn tests red.
2026-10-21: Scoring engine sabotage checks passed: stuffing limit and summary weight each turn tests red.
2026-10-21: T-002 sabotage checks passed: missing env key and invalid URL in .env.example each turn tests red.
2026-10-21: T-004 initial schema migration with RLS on all tables, auth profile trigger, and 5-resume limit trigger.
2026-10-22: T-006 Next.js 16 proxy route protection, SSR client factories, OAuth callback handler, and sabotage checks passed.
