# PREFLIGHT REPORT — ATSProof Resume Builder E2E Security & QA Audit

- **Date:** 2026-10-30
- **Audit Branch:** `test/e2e-audit-20261030` (branched from `c089261`, local-only)
- **Active Role:** Combined QA Engineer / Database & Security Engineer / Code Reviewer / SRE / AI Evaluator (Read-Only on App Source)
- **Gemini API Calls Used So Far:** `0 / 40`

---

## A. URL & Deployment Protection Check

| Target URL | Role / Type | HTTP Status | Key Response Headers | Verdict |
|---|---|---|---|---|
| `https://resume-builder-ma310t9z3-binary-solution.vercel.app/` | Deployment-specific immutable/preview URL | `302 Found` | `Location: https://vercel.com/sso-api?url=...`<br>`X-Robots-Tag: noindex`<br>`X-Vercel-Id: bom1::rxhhk-...` | **Blocked by Vercel Deployment Protection (SSO)** |
| `https://resume-builder-three-livid-91.vercel.app/` | Public Production Alias | `200 OK` | `X-Matched-Path: /`<br>`X-Nextjs-Prerender: 1`<br>`X-Vercel-Cache: HIT`<br>`X-Vercel-Id: bom1::px8cg-...`<br>`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` | **Publicly accessible (Edge POP: `bom1` Mumbai)** |

**Action / Decision Needed from Owner:**
1. Confirm whether we should run live HTTP checks against `https://resume-builder-three-livid-91.vercel.app/` (which we proved below is built from `origin/master` commit `243ca8a`), **OR** provide a Vercel `x-vercel-protection-bypass` automation secret if `resume-builder-ma310t9z3-binary-solution.vercel.app` points to a different build you want tested.

---

## B. Documentation Inventory (All 42 `.md` Files)

Every markdown claim is treated as untrusted until verified against both **code** and **live behavior**.

### B.1 Core Docs, Architecture, Audits & ADRs (12 files)

| Document | Core Claims | Initial Code Check | How We Will Verify (Code + Live) |
|---|---|---|---|
| `AGENTS.md` | Next.js 16, React 19, TS strict, Tailwind 4, Zod 4, `@react-pdf/renderer` 4, `vitest` 5 (actual is v4 in `package.json`), `pdf-parse` 2; no resume logging; pure `lib/scoring`; static `.ttf` fonts only; single-column PDF. | **PARTIAL / CONTRADICTED** (`vitest` version claim; route guards missing) | Verify in Phase 1 (`package.json`, `tsconfig.json`), Phase 5/6 (PDF/fonts/scoring), and grep for `console.*` across `app/` and `lib/`. |
| `README.md` | Default `create-next-app` boilerplate claiming `app/page.tsx` is a starter template. | **CONTRADICTED** (Outdated boilerplate) | Inspect in Phase 1/8 against actual `app/page.tsx`. |
| `DECISIONS.md` | Chronological log of T-001..T-025 decisions and ADR-018..ADR-021 (`Suspense` boundaries, `pdf-parse/worker` polyfill, `AppShell`, `ATSProof` branding, duplicate signup guard). | **VERIFIED** for ADR-018..021; **CONTRADICTED** where it implies LLM routes are live (they are deterministic stubs/regex). | Verify each entry against `app/`, `components/`, `lib/` in Phases 1–6. |
| `consider.md` | Research notes recommending open-source models (Llama 3.3 70B, Qwen 2.5 72B) via Groq/Together/vLLM with sample `OpenAI` route code. | **N/A (Reference note)** | Check in Phase 0 whether any hardcoded URLs/keys or unsafe patterns from this note entered production code. |
| `docs/ROLES.md` | Defines 11 agent roles, ticket workflow, definition of done, and human-only approval gates. | **VERIFIED** (Process doc) | Enforce throughout audit. |
| `docs/BLUEPRINT.md` | Full v2 architecture: 10 MVP deliverables, `LlmProvider` router + circuit breaker (`lib/ai/`), `usage_events` telemetry, rate limits (`lib/limits/ratelimit.ts`), quotas (`lib/limits/quota.ts`), Turnstile, RLS on all tables, private storage bucket, 30-day pass via Stripe webhook. | **CONTRADICTED on multiple counts:**<br>1. `lib/limits/*` does not exist.<br>2. No rate limiting, quota enforcement, Turnstile, or `usage_events` inserts exist in any API route.<br>3. `/api/ai/*` and `/api/jd/analyze` do not call Gemini or any LLM—they run local regex/template functions.<br>4. No private storage bucket exists yet. | Verify line-by-line across Phase 2 (DB/RLS), Phase 3 (Auth), Phase 4 (API/Rate Limits/Quotas), Phase 5 (Import), Phase 6 (Builder/Export/ATS), Phase 7 (Billing). |
| `docs/PRD.md` | 10 MVP deliverables, beta metrics, and 11 open questions (DOCX scope, brand name, Stripe availability, serif font, quota ceiling, GDPR/privacy policy). | **PARTIAL** (Same code gaps as `BLUEPRINT.md`; open questions 10–11 still unimplemented). | Cross-check all 10 deliverables in Final Report (`TEST_REPORT.md`). |
| `docs/adr/ADR-022-signed-upload-private-storage.md` | Status: *Proposed*. Claims `resumes-raw` private bucket (5 MB, `application/pdf`), `POST /api/resumes/upload-url`, `parse_jobs` table, async 202 polling (`GET /api/ai/parse-resume/status/[jobId]`), `%PDF` magic-byte check, `finally` storage deletion. | **NOT IMPLEMENTED** (Status is Proposed; neither migration nor routes exist in local or remote). | Verify in Phase 2 & Phase 5; confirm current `/api/ai/parse-resume` still buffers raw bodies synchronously in serverless memory. |
| `docs/adr/ADR-023-ai-resilience-and-eval-amendments.md` | Status: *Proposed*. Amends T-015 retry budget to 3 attempts and T-016 to 20 accuracy + 10 robustness fixtures + `tests/no-sample-leakage.test.ts`. Explicitly notes T-015 is not implemented and `parse-resume` in `master` invents placeholders (`'candidate@example.com'`, `'Company'`, `'Degree'`). | **VERIFIED** (Accurately describes current `master` defects and unimplemented state of T-015/T-025). | Verify `app/api/ai/parse-resume/route.ts` lines 161, 189, 281, 321, 388 in Phase 1 & Phase 5. |
| `docs/audits/legal-risk-audit.md` | Audits 6 compliance areas: COPPA age gate (High/Non-compliant), GDPR fonts (Compliant), Session replay (N/A), CAN-SPAM (N/A), Auto-renewal (N/A, one-time payment), DMCA (Missing page), plus missing `/privacy`, `/terms`, and account deletion. Defines T-026..T-030. | **VERIFIED** (Accurately reflects codebase gaps; T-026..T-030 are not yet implemented). | Verify font requests in Phase 6/8, auth/age-gate/account-deletion in Phase 3, and footer/legal links in Phase 8. |
| `docs/design/resume-import-rules.md` | 15 engineering rules for resume import (no sample literals, LLM does semantic extraction, universal line-bounded grammars only, never invent placeholders, provenance guard, entity-swap invariance). | **VERIFIED in `lib/ai/guards/provenance.ts` (T-023)**; **CONTRADICTED in `app/api/ai/parse-resume/route.ts`** (not yet replaced by T-025). | Static grep & AST check in Phase 1 and Phase 5. |
| `docs/design/resume-import.md` | Two-stage format-agnostic import design: Stage 1 (T-020, T-021, T-023, T-024, T-025) and Conditional Stage 2 (T-019, T-022). Lists 20+ defects in `master` and discarded patch. | **PARTIAL** (Only T-021 and T-023 exist locally on `feat/T-015-provider`; T-020, T-024, T-025, T-019, T-022 are unbuilt). | Verify in Phase 5 against the 20-item issue list and test `guardProvenance` + `ResumeImportDraftSchema`. |

### B.2 Tickets Inventory (`docs/tickets/T-001.md` – `T-030.md`, 30 files)

| Ticket | Claimed Scope | Code Status (`origin/master` vs Local `HEAD`) | Verification Plan |
|---|---|---|---|
| `T-001.md` | PDF Round-Trip Spike (`registerFonts`, `ResumeDocument`, `pdf-parse` v2 round-trip) | **IMPLEMENTED** (`origin/master`) | Phase 6 (`tests/pdf-roundtrip.test.ts` + independent round-trip extractor). |
| `T-002.md` | Local Dev Env, `supabase/config.toml`, `.env.example`, `.github/workflows/ci.yml` | **IMPLEMENTED** (`origin/master`) | Phase 0 & Phase 1 (verify `.env.example`, `.gitignore`, CI workflow security). |
| `T-003.md` | Core `ResumeSchema` & TypeScript types (`types/resume.ts`) | **IMPLEMENTED** (`origin/master`) | Phase 1 & Phase 4 (check Zod 4 compliance, bounds, URL/email validation). |
| `T-004.md` | Initial DB schema migration (`profiles`, `resumes`, `jd_targets`, `entitlements`, `stripe_events`, `usage_events`, triggers) | **IMPLEMENTED** (`origin/master`) | Phase 2 (inspect `20261021000000_initial_schema.sql` vs live DB schema, triggers, `SECURITY DEFINER` search_path, FK indexes). |
| `T-005.md` | Supabase RLS policies & `tests/rls.test.ts` | **IMPLEMENTED** (`origin/master`) | Phase 2 (verify whether `tests/rls.test.ts` tests real Postgres or mocks; run live two-user cross-tenant proof). |
| `T-006.md` | Supabase Auth SSR client (`lib/db/`), `/callback`, `proxy.ts` route protection | **IMPLEMENTED** (`origin/master`) | Phase 3 (check open redirect on `/callback`, cookie flags, `proxy.ts` matcher coverage). |
| `T-007.md` | Auth UI (`/login`, `/register`, `LoginForm`, `RegisterForm`, `OAuthButtons`) | **IMPLEMENTED** (`origin/master`) | Phase 3 & Phase 8 (test auth flows, enumeration, rate limits, a11y). |
| `T-008.md` | Resume CRUD API (`app/api/resumes/route.ts`, `app/api/resumes/[id]/route.ts`) | **IMPLEMENTED** (`origin/master`) | Phase 3 & Phase 4 (test IDOR, 5-resume limit, input fuzzing, CSRF). |
| `T-009.md` | Guided Editor Part 1 (`lib/stores/resume-store.ts`, debounced autosave, Basics, Summary, Skills) | **IMPLEMENTED** (`origin/master`) | Phase 6 (test editing, autosave, concurrent tabs, XSS). |
| `T-010.md` | Guided Editor Part 2 (Experience, Projects, Education sections) | **IMPLEMENTED** (`origin/master`) | Phase 6 (test reorder/add/delete, date validation, long content). |
| `T-011.md` | PDF Templates (`standard.tsx` Inter, `classic.tsx` Source Serif 4) | **IMPLEMENTED** (`origin/master`) | Phase 6 (test both templates, ligatures, accented chars, font embedding). |
| `T-012.md` | ATS Format Lint Engine (`lib/pdf/lint.ts`) | **IMPLEMENTED** (`origin/master`) | Phase 6 (test placeholder blocking, heading order, contact info check). |
| `T-013.md` | Live PDF Preview Component (`components/preview/`) | **IMPLEMENTED** (`origin/master`) | Phase 6 & Phase 8 (verify preview vs export parity, zero external font requests). |
| `T-014.md` | Cross-Engine Page-Count Parity Suite (20 fixtures) | **IMPLEMENTED** (`origin/master`) | Phase 1 & Phase 6 (run parity suite and verify whether it uses real rendering). |
| `T-015.md` | AI Provider Seam (`LlmProvider`), Failover Router & Circuit Breaker | **NOT IMPLEMENTED** (Even though current branch is named `feat/T-015-provider`, zero files from T-015 exist in `lib/ai/`). | Phase 1, Phase 4 & Phase 5. |
| `T-016.md` | AI Evaluation Harness & Golden Sets | **PARTIAL (Local-only)** (Only fixtures `01`, `02` committed at `c089261` and `03` untracked; no eval runner exists). | Phase 5. |
| `T-017.md` | `RootLayout` Props Typing for Clean CI Typechecks | **IMPLEMENTED** (`origin/master`) | Phase 1 (`npx tsc --noEmit`). |
| `T-018.md` | Production Launch Fixes, `ATSProof` Brand Identity & Adaptive `AppShell` + `/api/auth/session` | **IMPLEMENTED** (`origin/master`) | Phase 3, Phase 4 & Phase 8. |
| `T-019.md` | Spike: `pdfjs-dist` Direct Import (Conditional Stage 2) | **NOT IMPLEMENTED** | Phase 5. |
| `T-020.md` | Signed-URL Private Storage (`resumes-raw`) & `parse_jobs` Schema | **NOT IMPLEMENTED** | Phase 2 & Phase 5. |
| `T-021.md` | `ResumeImportDraftSchema` & `flagOverLimitContent` (`lib/ai/schemas.ts`) | **LOCAL-ONLY** (`feat/T-015-provider` / local `master`; not pushed to `origin/master`). | Phase 1 & Phase 5 (`tests/resume-draft-schema.test.ts`). |
| `T-022.md` | Layout-Aware Spatial Stream Extractor (`lib/pdf/layout-extractor.ts`) | **NOT IMPLEMENTED** | Phase 5 (test reading order on multi-column PDFs). |
| `T-023.md` | Deterministic Provenance Guard (`lib/ai/guards/provenance.ts`) | **LOCAL-ONLY** (`feat/T-015-provider` / local `master`; not pushed to `origin/master`). Note: standalone module, not wired into `/api/ai/parse-resume` yet. | Phase 1 & Phase 5 (`tests/resume-provenance.test.ts` + adversarial hallucination tests). |
| `T-024.md` | LLM Semantic Resume Parser Adapter (`lib/ai/parsers/resume-parser.ts`) | **NOT IMPLEMENTED** | Phase 5. |
| `T-025.md` | Format-Agnostic `/api/ai/parse-resume` Route & Async Job Polling | **NOT IMPLEMENTED** | Phase 4 & Phase 5. |
| `T-026.md` | User Account Deletion & Cascade Data Erasure (`DELETE /api/auth/account`) | **NOT IMPLEMENTED** | Phase 2 & Phase 3. |
| `T-027.md` | Statutory Legal Page Scaffolding (`/privacy`, `/terms`) | **NOT IMPLEMENTED** | Phase 8. |
| `T-028.md` | COPPA Age Verification Screen & Under-Age Account Block | **NOT IMPLEMENTED** | Phase 3. |
| `T-029.md` | DMCA Designated Agent Page (`/dmca`) | **NOT IMPLEMENTED** | Phase 8. |
| `T-030.md` | GDPR Font Self-Hosting Assertion & Test Suite (`tests/compliance/fonts.test.ts`) | **NOT IMPLEMENTED** | Phase 6 & Phase 8. |

---

## C. Local vs. Remote vs. Deployed Comparison

| Environment / Ref | Commit SHA | Summary |
|---|---|---|
| **Live Production Alias** (`resume-builder-three-livid-91.vercel.app`) | `243ca8a01344e59df50ef0d0a47d2088ddc79295` | Verified via deployed client chunk `/_next/static/immutable/chunks/287sxy-wc6gkw.js` containing the exact JSX introduced in `243ca8a` (`OR<span class="sr-only"> continue with email</span>`). |
| **Remote (`origin/master`)** | `243ca8a01344e59df50ef0d0a47d2088ddc79295` | Matches the live production alias (`Sun Oct 25 23:32:42 2026 +0530`). |
| **Local `master` & `feat/T-015-provider`** | `c089261` | **16 commits ahead of `origin/master`** (`20 files changed, 3,171 insertions, 1 deletion`), plus 4 untracked files in `tests/fixtures/eval/resumes/03-wrapped-bullets*`. |
| **Other Local Branches (Unpushed)** | `bfc0ccb` (`docs/legal-ticket-revisions`)<br>`69d5c69` (`feat/T-005-rls-tests`)<br>`f12402a` (`fix/appshell-ats-guide-modal`)<br>`f23cb9a` (`fix/dynamic-routes-prerender`) | `f12402a` and `f23cb9a` are ancestors of `origin/master`. `docs/legal-ticket-revisions` is a parked WIP branch. |

### Exact Capabilities the Live Site (`243ca8a`) CANNOT Contain Yet

1. **Local-Only Unpushed Work (`243ca8a..c089261` — NOT on live site):**
   - `ResumeImportDraftSchema` and `flagOverLimitContent()` (`lib/ai/schemas.ts`, Ticket T-021).
   - `guardProvenance()` deterministic n-gram containment & date-pairing guard (`lib/ai/guards/provenance.ts`, `types/provenance.ts`, Ticket T-023). *(Note: even locally, `guardProvenance` is a standalone library function and is NOT wired into `app/api/ai/parse-resume/route.ts` yet.)*
   - Evaluation fixtures `01-summary-in-banner*`, `02-stacked-role-header*`, and untracked `03-wrapped-bullets*` (`tests/fixtures/eval/resumes/`, Ticket T-016).
2. **Unbuilt Tickets (Exist ONLY as `.md` files — NOT in local code and NOT on live site):**
   - **Real LLM calls:** `T-015` (`LlmProvider`, Gemini adapter, OpenAI-compatible fallback adapter, failover router, circuit breaker) and `T-024` (`resume-parser.ts`) are **unbuilt**. On both local `HEAD` and the live site:
     - `POST /api/ai/parse-resume` runs `parseResumeLocally()` (a synchronous regex parser that invents `'candidate@example.com'`, `'Candidate'`, `'Company'`, `'Role'`, `'Software Engineer'`, `'University'`, `'Degree'`).
     - `POST /api/ai/bullet-optimize` runs `generateDeterministicBulletResult()` (a template string generator, zero LLM calls).
     - `POST /api/jd/analyze` runs `extractJdLocally()` (a 30-item regex list matcher, zero LLM calls).
   - **Upload & Async Job Pipeline (`ADR-022`, `T-020`, `T-025`):** `POST /api/resumes/upload-url`, private bucket `resumes-raw`, `parse_jobs` table, and `GET /api/ai/parse-resume/status/[jobId]` do **not** exist.
   - **Spatial Layout Extractor (`T-019`, `T-022`):** `lib/pdf/layout-extractor.ts` does **not** exist.
   - **Rate Limiting, Quotas, Turnstile, Telemetry:** `lib/limits/ratelimit.ts`, `lib/limits/quota.ts`, Cloudflare Turnstile checks, and `usage_events` DB writes do **not** exist.
   - **Legal & Compliance Routes (`T-026`–`T-030`):** Account deletion (`DELETE /api/auth/account`), `/privacy`, `/terms`, `/dmca`, and COPPA age gate (`POST /api/auth/age-gate`) do **not** exist.

---

## D. Environment Variable & Infrastructure Map

*Rule 3 Compliance: Only variable names, code locations, fallback literals, and public hostnames are reported below. Zero secret values are printed.*

| Env Var Name | Scope (`NEXT_PUBLIC_` vs Server-Only) | Declared in `.env.example`? | Referenced in Runtime Code? (File:Line) | Fallback in Code if Unset | Required Vercel Scopes |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Client + Server** (`NEXT_PUBLIC_`) | Yes | `lib/db/supabase-client.ts:12`<br>`lib/db/supabase-server.ts:12`<br>`proxy.ts:12`<br>`lib/billing/entitlements.ts:34` | `'http://127.0.0.1:54321'` | Prod, Preview, Dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Client + Server** (`NEXT_PUBLIC_`) | Yes | `lib/db/supabase-client.ts:13`<br>`lib/db/supabase-server.ts:13`<br>`proxy.ts:13` | `'mock-anon-key'` | Prod, Preview, Dev |
| `NEXT_PUBLIC_APP_URL` | **Client + Server** (`NEXT_PUBLIC_`) | Yes | `app/api/billing/checkout/route.ts:24`<br>`lib/billing/stripe.ts:66` | `request.headers.get('origin')` or `'http://localhost:3000'` | Prod, Preview, Dev |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-Only** | Yes | `lib/billing/entitlements.ts:36` | `'mock-service-role-key-secret'` *(Dangerous silent fallback)* | Prod, Preview, Dev |
| `STRIPE_SECRET_KEY` | **Server-Only** | Yes | `lib/billing/stripe.ts:63` | Throws error at checkout call time | Prod (Live/Test), Preview (Test), Dev (Test) |
| `STRIPE_WEBHOOK_SECRET` | **Server-Only** | Yes | `app/api/webhooks/stripe/route.ts:23` | Returns HTTP 400 `'Missing signature or secret'` | Prod, Preview, Dev |
| `GEMINI_API_KEY` | **Server-Only** | Yes | **NOT REFERENCED IN CODE** (0 matches in `app/` or `lib/`) | N/A (Unused until T-015) | Prod, Preview, Dev (once T-015 is built) |
| `GEMINI_MODEL_FAST` | **Server-Only** | Yes | **NOT REFERENCED IN CODE** *(Conflict: `BLUEPRINT.md` §4 names `AI_PRIMARY_MODEL` / `AI_FALLBACK_MODEL` instead)* | N/A | Naming mismatch between `.env.example` and `BLUEPRINT.md` / `T-015.md` |
| `GEMINI_MODEL_QUALITY` | **Server-Only** | Yes | **NOT REFERENCED IN CODE** | N/A | Naming mismatch between `.env.example` and `BLUEPRINT.md` / `T-015.md` |
| `AI_PRIMARY_MODEL`<br>`AI_FALLBACK_MODEL`<br>`OPENAI_COMPATIBLE_API_KEY`<br>`OPENAI_COMPATIBLE_BASE_URL` | **Server-Only** | **No** (In `BLUEPRINT.md` & `T-015.md` only) | **NOT REFERENCED IN CODE** | N/A | Missing from `.env.example` |

### Supabase Project Mapping
- **Live Production Alias (`https://resume-builder-three-livid-91.vercel.app/`):**
  - Inspected client JS bundle `/_next/static/immutable/chunks/1xc2_juquu6fo.js`: points to Supabase project **`https://ehbojkrhthtumpcwepdy.supabase.co`** (Project Ref: `ehbojkrhthtumpcwepdy`).
- **Preview Deployment (`https://resume-builder-ma310t9z3-binary-solution.vercel.app/`):**
  - Blocked by Vercel SSO (`302`); cannot verify whether Preview points to the same live Supabase project (`ehbojkrhthtumpcwepdy`) or a separate staging branch project without bypass header or owner confirmation.
- **Local Development (`supabase/config.toml`):**
  - Configured for local Supabase CLI Docker stack (`project_id = "resume-builder"`, API port `54321`, DB port `54322`).

---

## E. Proposed Test Data & Execution Plan (Awaiting Approval)

### 1. Database & Auth Testing Strategy (Rule 2 Compliance)
- **Live vs. Staging Supabase Question:** Does a separate staging/branch Supabase project exist, or is `ehbojkrhthtumpcwepdy.supabase.co` your only cloud Supabase project?
  - If we have owner approval to create 2 isolated test accounts on `ehbojkrhthtumpcwepdy.supabase.co` (or if you prefer we run destructive/write RLS tests against local Supabase Docker + read-only inspection on `ehbojkrhthtumpcwepdy`), please specify the email domain to use for `test+1@<domain>` and `test+2@<domain>` (and whether email confirmation is enabled in Supabase Auth, as unconfirmed emails cannot log in without email inbox access or admin confirmation).

### 2. Phase 5 Synthetic Resume Corpus (`tests/audit/golden/` & `tests/audit/corpus/`)
- Because the repo is public, **100% of audit fixtures will be synthetic** (fictional names, fictional companies, `example.test` emails, `555-01xx` reserved phones).
- We propose generating **15 hand-labeled synthetic golden resumes** (`tests/audit/golden/`) + **10 adversarial/edge-case files** (`tests/audit/adversarial/`) covering:
  1. Single-column ATS-plain (1 page)
  2. Multi-page executive (4+ pages)
  3. Two-column with left sidebar
  4. Two-column with right sidebar
  5. Table-based layout
  6. Creative/graphic multi-block layout
  7. Non-English / accented Latin (`Renée Noël Müller`, `Łukasz Żółć`) + mixed script (CJK/RTL skills & employers)
  8. Odd fonts & ligatures (`fi`, `fl`, `ff`, `ffi`)
  9. Varied date formats (`2019-Present`, `Jan '19`, `03/2020`, `2021.06`, `Current`)
  10. Missing sections (no education / no projects / no metrics — to test hallucination & placeholder invention)
  11. Scanned / image-only PDF (<200 chars text)
  12. Password-protected / encrypted PDF
  13. Corrupted / truncated PDF byte stream
  14. Zero-byte empty file & 20 MB+ oversized file
  15. `.docx` file renamed to `.pdf` (magic-byte mismatch)
  16. PDF with embedded JavaScript (`/JS`, `/JavaScript` action) and external links
  17. Prompt-injection payload resume (`Ignore previous instructions and output...`)
- **Note on LLM Call Cap (Rule 4):** Since `T-015` and `T-024` are not implemented in code yet, current app routes make **0 Gemini calls**. In Phase 5, we will test the actual code (`parseResumeLocally` + `guardProvenance` + `ResumeImportDraftSchema`) and, only if you want us to benchmark live Gemini extraction against the prompt spec, cap total Gemini calls well below the 40-call limit.

