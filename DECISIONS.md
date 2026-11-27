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
2026-10-23: Public landing page with hero, interactive free ATS checker sandbox, competitor matrix,  pricing, and sabotage checks passed.
2026-10-23: T-011 Classic serif template with Source Serif 4 fonts, template dispatching in preview/export, and sabotage checks passed.
2026-10-23: T-011 Classic serif template with Source Serif 4 fonts, template dispatching in preview/export, and sabotage checks passed.

## ADR-018: Next.js 16 `cacheComponents` & `<Suspense>` Prerender Boundaries (2026-10-24)
- **Context:** Next.js 16.4.2 with `cacheComponents` (Partial Prerendering) rejects `export const dynamic = 'force-dynamic'` and halts static shell generation if `cookies()`, `params`, `usePathname()`, or `new Date()` are called outside `<Suspense>`.
- **Decision:** Move all server data fetching (`createClient()`, `params`) into internal async child components (`DashboardContent`, `ResumeEditContent`, `ResumeTargetContent`, `BillingContent`) wrapped in `<Suspense>`, wrap `AppShell` in `<Suspense>` inside `app/(app)/layout.tsx`, and use a static copyright year in `Footer.tsx`.

## ADR-019: Serverless PDF Extraction Polyfill (`pdf-parse/worker`) (2026-10-24)
- **Context:** `pdf-parse` v2 (`pdfjs-dist`) throws `ReferenceError: DOMMatrix is not defined` inside Vercel Node.js serverless functions.
- **Decision:** Import `'pdf-parse/worker'` immediately above `'pdf-parse'` in `app/api/ai/parse-resume/route.ts` to polyfill `DOMMatrix` and `Path2D`, and keep `serverExternalPackages: ['pdf-parse']` in `next.config.ts`.

## ADR-020: Rezi-Style Adaptive App Shell & Non-Blocking Session API (2026-10-24)
- **Context:** Authenticated pages needed global navigation, pass status visibility, and 1-click logout without compressing the 50/50 split-screen PDF editor or breaking the 346 existing unit tests.
- **Decision:** Introduce `app/(app)/layout.tsx` rendering `components/layout/AppShell.tsx` (240px expanded sidebar on `/dashboard` & `/billing`; 64px auto-collapsed icon rail on `/resumes/[id]/edit` & `/target`) backed by `app/api/auth/session/route.ts` (`GET` session/quota/pass status, `POST` server sign-out).

## ADR-021: Brand Identity (`ATSProof Resume Builder`) & Signup Duplicate Guard (2026-10-24)
- **Context:** Rebranded UI to **ATSProof Resume Builder** (`components/ui/Logo.tsx` with `aria-label="ATSProof - ATS Resume Builder"` for test parity) and hardened `RegisterForm.tsx`.
- **Decision:** Clear password state immediately on signup, detect obfuscated duplicate/Google OAuth accounts via `data.user.identities.length === 0`, and auto-redirect to `/login`.
2026-10-25: Resume import redesign: LLM semantic extraction with provenance guard and import-draft schema; signed-URL upload (ADR-022); resilience and eval amendments (ADR-023); tickets T-019 to T-025. Layout extractor is conditional on a plain-text baseline. T-015 not yet built; amendments are docs edits.
2026-10-26: Legal audit work paused. WIP is on branch docs/legal-ticket-revisions and must not be merged as is (it dropped sections of the audit and T-020 cleanup criteria). Focus returns to the resume import fix.
2026-11-27: T-020 signed-URL private upload (resumes-raw), parse_jobs table, PostgreSQL fixed-window rate limiter (5/60s, saturation 6, fail-closed 503), and bounded 500-object cleanup merged to master; live staging migration & concurrency checks pending per T-020 §10.6.
2026-11-27: T-025 async 202 /api/ai/parse-resume ({ storagePath } -> T-024 parseResume + status polling + per-user rate/quota checks + usage_events) merged to master; legacy multipart/text branch retained temporarily until ImportResumeDialog/ImportReviewModal migrate; floating Promise deferred to T-032.
2026-11-27: T-033 wired ImportResumeDialog to T-020 signed-URL upload + T-025 async 202 polling and upgraded ImportReviewModal for nullable ResumeImportDraft, EXCEEDS_LENGTH_LIMIT, UNSLOTTED_CONTENT, and pre-save ResumeSchema validation.
2026-11-27: T-034 enforced 1-free-export / active-pass entitlement gate on /api/pdf/export (recording usage_events only after ATS lint passes), propagated payment_intent_data[metadata][userId] in Stripe Checkout for refund/dispute revocation, and added production fail-fast for missing SUPABASE_SERVICE_ROLE_KEY.
