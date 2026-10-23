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
2026-10-22: T-007 Resume CRUD API routes with Zod validation, 5-resume quota guard, and sabotage checks passed.
2026-10-22: Auth UI login and register pages with Suspense, client validation, Google OAuth, and sabotage checks passed.
2026-10-22: Dashboard page with quota badge, resume card grid, creation modal, and sabotage checks passed.
2026-10-22: Guided Resume Editor with zero-dep store, form sections, 1000ms debounced autosave, and sabotage checks passed.
2026-10-23: JD Target & Match Panel with SHA-256 cache, pure scoreResume, 1-click skill addition, and sabotage checks passed.
2026-10-23: T-017 RootLayout children typed with Readonly<{ children: React.ReactNode }> to guarantee clean CI tsc typechecking without ambient .next/types.
2026-10-23: T-013 Live React-PDF preview canvas with zoom controls, browser-safe font loader, and sabotage checks passed.
2026-10-23: Truth-Bound AI Bullet Improver with Google XYZ pattern, server digit guard, live placeholder interpolation, and sabotage checks passed.
2026-10-23: PDF export pipeline with pdf-parse v2 pre-flight lint, placeholder blocker, and sabotage checks passed.
2026-10-23: Resume import parser with pdf-parse v2 extraction, scan fallback, low-confidence review modal, and sabotage checks passed.
2026-10-23: Stripe billing with  pass checkout, timingSafeEqual webhook verification, idempotency via stripe_events, and sabotage checks passed.
