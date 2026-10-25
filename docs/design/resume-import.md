# Architecture & Technical Design: Format-Agnostic Resume Import Pipeline

- **Document Version:** 1.1.0
- **Date:** 2026-10-25
- **Roles:** Solution Architect, AI/Prompt Engineer, Security Reviewer
- **Target Release:** MVP Resume Import (Staged Rollout: T-020, T-021, T-023, T-024, T-025; Conditional Stage 2: T-019, T-022)
- **Status:** Approved for Implementation

---

## 1. Executive Summary & Problem Statement

The resume import endpoint (`POST /api/ai/parse-resume`) was previously adapted for a single sample document using localized regex patterns and hardcoded fallbacks. This created critical failure modes:
1. Resumes with multi-column layouts, sidebars, or non-technical backgrounds fail extraction or have their layout reading order corrupted.
2. The route injects fabricated placeholder data (e.g. `'candidate@example.com'`, `'Company'`, `'Role'`, `'University'`, `'Degree'`), violating Blueprint §6.1 Rule 2 ("Never guess; return null or an empty array").
3. The route bypassed the resilient AI provider seam (`LlmProvider`, T-015) and executed entirely in brittle local regex code. Note: `lib/ai` currently contains only `guards.ts` and `schemas.ts`; T-015 is **not yet implemented in code**, so all provider integration dependencies must build upon T-015.
4. Large uploads near the 5 MB limit risk edge rejections against serverless payload limits.

This document specifies a format-agnostic import pipeline designed to scale reliably across arbitrary resume styles. It introduces a two-stage delivery model: Stage 1 delivers text-based semantic extraction with generic prompt instructions, upload hardening via private Supabase Storage (ADR-022), a non-truncating draft schema, an n-gram containment provenance guard, and an asynchronous 202 job-polling execution model. Stage 2 conditionally introduces geometry-aware spatial stream extraction via `pdfjs-dist` (T-019, T-022) only if Stage 1 fails to achieve starting accuracy thresholds on multi-column benchmarks.

---

## 2. Audit of Existing Route (`app/api/ai/parse-resume/route.ts`)

### 2.1 Audit of Master Implementation (`master` branch)

1. **Sample-Specific Literals & Heuristics:**
   - **Line 203:** Name concatenation splitter: `rawFirst.replace(/([a-z])([A-Z])/g, '$1 $2')` with code comment: `// If PDF parse concatenated adjacent text nodes without spaces (e.g. FreemanCloud), insert space`.
   - **The camelCase Splitter Defect:** This naive replacement splits legitimate surname prefixes and capitalizations, transforming names like `McDonald` into `'Mc Donald'`, `MacIntyre` into `'Mac Intyre'`, and `DeSantis` into `'De Santis'`.
   - **Line 204:** Role prefix scanner hardcoded for tech disciplines (`Senior`, `Lead`, `Staff`, `Principal`, `Junior`, `Full-Stack`, `DevOps`, `Cloud`, `Machine Learning`, `ML`, `AI`).
   - **Line 230:** Fallback headline regex hardcoded for engineering titles (`Engineer`, `Developer`, `Architect`, `Designer`).
   - **Lines 321–322 & 353–354:** Fallback job title and employer hardcoded to `'Software Engineer'`, `'Engineer'`, and `'Company'`.
   - **Lines 425 & 441:** Skill groups hardcoded to `'Technical Skills'`.

2. **Invented Placeholder Data (Violates Blueprint §6.1 Rule 2):**
   - **Line 161:** Email hallucination: `let email = 'candidate@example.com';` when regex fails.
   - **Line 189:** Name hallucination: `let fullName = 'Candidate';`.
   - **Lines 281 & 285:** Experience item placeholders: `currentExpItem.company = 'Company';` and `currentExpItem.title = 'Role';`.
   - **Lines 388–389 & 406–407:** Education placeholders: `let degree = 'Degree';` and `let school = 'University';`.

3. **`currentExpItem` Scoping Analysis:**
   - In master, `currentExpItem` is declared with `let` at line 268 and flushed at line 368 via `pushCurrentExp()`. While the object is retained, its missing fields are populated with `'Company'` and `'Role'` placeholders.

4. **Architectural & Security Deficiencies:**
   - **Direct Regex Bypassing T-015 (Line 564):** Invocations execute `parseResumeLocally()`, completely bypassing the `LlmProvider` contract.
   - **Serverless Request Body Limit:** Vercel functions enforce a maximum request payload of approximately 4.5 MB (*verify in current Vercel docs*). Buffering uploads in route memory (`file.arrayBuffer()`, line 500; `request.arrayBuffer()`, line 524) causes edge rejections for 5 MB files.
   - **Information Disclosure (Line 574):** Raw exception messages are returned in `{ error: 'Parsing failed', details: [message] }`.
   - **Missing Controls:** Lacks rate limiting, quota accounting, and `usage_events` telemetry.

### 2.2 Audit of Discarded Patch (*Unverified, reported by owner*)

An uncommitted prototype patch was reviewed and discarded due to the following regressions:
- (a) Employer and city names from the sample resume hardcoded into a location regex and a skills-section skip filter.
- (b) `Freelancer`, `Co-founder`, and domain keywords (`NLP`, `Chatbot`) hardcoded in role detection.
- (c) A real person's name and headline written directly into the LLM system prompt.
- (d) Invented placeholder values for email, job title, company, school, and degree.
- (e) `var currentExpItem` declared after the parsing loop, which probably drops the final role due to variable hoisting and closure binding bugs.
- (f) Gemini API key transmitted in the URL query string (`?key=...`), leaking credentials into server access logs and proxy caches.
- (g) Retired model names configured in the fallback list.
- (h) `VITEST` test-runner environment checks and dummy-key bypass paths inside production code.
- (i) Silent fallback from the LLM to the naive regex parser on any error.
- (j) Unbounded network requests lacking timeouts or `AbortSignal`.
- (k) System prompt instructions and untrusted resume text concatenated into a single user message (vulnerable to prompt injection).
- (l) Internal exception stack details returned to the client.

### 2.3 Interim Risk Disclosure

> [!WARNING]
> Until Ticket T-025 is implemented and merged, `app/api/ai/parse-resume/route.ts` remains active in production using master's local regex parser. This implementation invents placeholder data (`'candidate@example.com'`, `'Company'`, `'Degree'`) when parsing resumes that deviate from standard single-column formats. Frontend review flows must continue to treat all import data as provisional until T-025 replaces the route.

---

## 3. Two-Stage Delivery Strategy & Scope Constraints

### 3.1 Scope Constraint: PDF Only for MVP
Resume import is strictly restricted to **PDF documents** for the MVP. Microsoft Word (`.docx`) import is explicitly deferred to post-MVP to limit parsing surface area and avoid binary converter dependencies.

### 3.2 Staged Implementation Strategy

To balance delivery velocity against complex visual layout handling, implementation is partitioned into two distinct stages:

```
STAGE 1 (Core Pipeline - Immediate):
  [T-020: Secure Upload / S3]
  [T-021: ResumeImportDraft Schema]
  [T-023: Provenance Guard (N-gram Containment)]
  [T-024: LLM Parser Adapter (pdf-parse plain text + generic prompt)]
  [T-025: Parse Route Handler (Async 202 Jobs + Polling)]
              │
              ▼
    Evaluate against Two-Column / Sidebar Fixtures
              │
              ├─► Passes Starting Thresholds (Recall >= 85%, Precision >= 90%) ──► SHIP STAGE 1 (Skip Stage 2)
              │
              └─► Fails Starting Thresholds ──► TRIGGER STAGE 2 (Layout Extractor)

STAGE 2 (Conditional Layout Extraction):
  [T-019: Spike pdfjs-dist Direct Import] ──► [T-022: Layout-Aware Spatial Extractor]
                                                             │
                                                             ▼
                                                    Integrate into T-024 / T-025
```

- **Stage 1 (Plain-Text Baseline):**
  - Utilizes `pdf-parse` v2 plain text extraction.
  - Injects a generic layout-awareness directive in the prompt: *"The source text is extracted from a PDF document that may contain multi-column sections, sidebars, or out-of-order text blocks. Use context, headings, and semantic associations to reconstruct the correct chronological experience, education, and skills."*
  - Benchmark against the two-column and sidebar fixtures in T-016.
  - **Starting Thresholds for Stage 1:**
    - Multi-column entity recall: $\ge 85\%$ *(starting value tuned on the corpus)*.
    - Multi-column entity precision: $\ge 90\%$ *(starting value tuned on the corpus)*.
- **Stage 2 (Conditional Spatial Stream Extraction):**
  - If Stage 1 achieves the starting thresholds on multi-column fixtures, Stage 2 is skipped, saving 16–20 development hours.
  - If Stage 1 fails to achieve the thresholds, Spike T-019 and Extractor T-022 are scheduled and executed.

### 3.3 Schedule & Blueprint Week 4 Reconciliation

- **Stage 1 Effort:**
  - T-020 (7–9h) + T-021 (6–7h) + T-023 (8–10h) + T-024 (10–12h) + T-025 (10–12h) = **41 – 50 hours**.
  - Calendar duration at 15–20 hours/week: **2.5 to 3.3 calendar weeks**.
- **Stage 2 Effort (Conditional):**
  - T-019 (6–8h) + T-022 (10–12h) = **16 – 20 hours**.
  - Calendar duration: **1.0 calendar week**.
- **Total Combined Effort (Stage 1 + Stage 2):** **57 – 70 hours** (**3.5 to 4.5 calendar weeks**).

> [!IMPORTANT]
> **Blueprint Schedule Flag:** The Blueprint (§12, Week 4) allocates exactly **one calendar week** (15–20 hours) for the entire import parser, review screen, and scan fallback. This architectural audit reveals that building a production-grade, format-agnostic import pipeline—with upload hardening, private bucket storage, tenant RLS, async job polling, non-truncating draft schemas, and provenance containment guards—requires **41 to 50 hours minimum for Stage 1 alone (2.5 to 3.3 weeks)**. The schedule in Blueprint §12 must be adjusted accordingly.

---

## 4. Pipeline Component Specifications

### 4.1 Upload & Storage Hardening (ADR-022)

1. Client requests a single-use signed upload URL via `POST /api/resumes/upload-url` (rate-limited to starting value: 5 requests/user/minute).
2. Client uploads PDF directly to Supabase private bucket `resumes-raw` under path `${user_id}/${upload_id}.pdf`.
3. Client triggers `POST /api/ai/parse-resume` with `{ storagePath }`.
4. Server validates `storagePath` ownership (`auth.uid()`), checks file size $\le 5\text{ MB}$, and verifies `%PDF` magic bytes.
5. Deletion of the raw uploaded document is executed in a guaranteed `finally` block via the Supabase Service Role client. A scheduled cron sweeps orphaned files older than 1 hour.

### 4.2 Non-Truncating `ResumeImportDraftSchema` (`lib/ai/schemas.ts`)

To preserve the strictness of `ResumeSchema` (which powers editor state and PDF generation) while accommodating messy imports, a separate staging schema is defined:

```ts
export const ResumeImportDraftSchema = z.object({
  basics: z.object({
    fullName: z.string().nullable(),
    headline: z.string().default(''),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  }),
  summary: z.string().default(''),
  experience: z.array(z.object({
    id: z.string(),
    company: z.string().nullable(),
    title: z.string().nullable(),
    location: z.string().nullable(),
    start: YearMonth,
    end: YearMonth,
    current: z.boolean().default(false),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  projects: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    url: z.string().url().nullable(),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    id: z.string(),
    school: z.string().nullable(),
    degree: z.string().nullable(),
    start: YearMonth,
    end: YearMonth,
  })).default([]),
  skills: z.array(z.object({
    group: z.string(),
    items: z.array(z.string()),
  })).default([]),
  warnings: z.array(z.string()).default([]),
  low_confidence_paths: z.array(z.string()).default([]),
  review_flags: z.array(z.object({
    path: z.string(),
    reason: z.string(),
    current_value: z.any(),
  })).default([]),
});
```

**Non-Truncating Bound Preservation:**
- Summaries $> 600$ characters, roles with $> 8$ bullets, projects with $> 5$ bullets, or $> 5$ links are **never silently truncated**.
- Full text is preserved in the draft payload, and corresponding entries are added to `review_flags` (`reason: 'EXCEEDS_LENGTH_LIMIT'`). The candidate resolves trims in the review modal before saving to `ResumeSchema`.

### 4.3 Deterministic Provenance Guard: N-Gram Containment (`lib/ai/guards/provenance.ts`)

1. **Short String Contiguous Verification:**
   - Entities (`company`, `title`, `school`, `degree`, `skills[].items`) must appear as exact contiguous substrings within the normalized source text (case-folded, whitespace-collapsed, punctuation-stripped). Missing strings become `null` and their path is added to `low_confidence_paths`.
2. **Long-Form Text Containment Verification (Summary & Bullets):**
   - **Flaw of Symmetric Measures:** Jaccard similarity is symmetric ($\frac{|A \cap B|}{|A \cup B|}$) and does not measure extraction fidelity. Furthermore, testing whether the source text is contained in the output is unsafe because a model could generate a real bullet and append an entirely fabricated clause (e.g. *"Increased revenue by $10M"*) while maintaining high source overlap.
   - **Containment Formula:** We compute the fraction of the **output field's word n-grams** that are contained within the matching **anchored source region**:
     $$\text{Containment}(O, S_{\text{region}}) = \frac{\left| \text{ngrams}(O) \cap \text{ngrams}(S_{\text{region}}) \right|}{\left| \text{ngrams}(O) \right|}$$
     - Uses **trigrams** for standard text blocks.
     - Uses **bigrams** for short text blocks ($\le 6$ words).
   - **Starting Containment Threshold:** $\ge 0.85$ *(starting value tuned on the corpus)*.
   - **Anchored Source Region Selection:** $S_{\text{region}}$ is **not** the entire document. It is restricted to the text span bounded by the field's section heading or between the nearest verified neighboring entities (e.g. between Role $i$'s title and Role $i+1$'s title). This prevents bullets from one employer passing containment against text from an unrelated job.
   - **Invented Clause Rejection:** If a candidate output appends an invented clause to a legitimate bullet, the denominator increases with new n-grams absent from $S_{\text{region}}$, driving containment below $0.85$ and triggering a guard failure.
3. **Date Verification & Pairing:**
   - Extracted date tokens in source text are parsed into normalized ISO format (`YYYY` or `YYYY-MM`). Parsed `start` and `end` dates must exist within the source date set.
   - Spatial proximity check asserts that role dates appear within $K$ lines of their corresponding company and title.
   - Unmapped source dates generate a structured warning in `warnings[]`.

### 4.4 Conditional Stage 2: Layout-Aware Spatial Stream Extractor (`lib/pdf/layout-extractor.ts`)

If triggered by Stage 1 benchmark failures, the extractor applies:
- Vertical clustering: $\Delta y \le 0.35 \times H_{\text{med}}$ *(starting value tuned on the corpus)*.
- Relative gutter width: $\text{gap} \ge 0.03 \times W_{\text{page}}$ *(starting value tuned on the corpus)*.
- Emits one merged line per $y$-band with delimiter-joined cells (` | `), preserving cross-column row alignment without independent column sorting.
- Prefixes lines with `# ` only if median font size $> 1.2 \times \text{bodyMedianSize}$ or font is bold.

---

## 5. Execution Model, Latency & Asynchronous Jobs

### 5.1 Host Environment & Duration Limits (*Verify in Current Vercel Docs*)
Because the active Vercel plan and maximum serverless function duration are unconfirmed (*verify in current Vercel docs*), worst-case latency across provider retry and failover chains cannot be safely executed synchronously within unknown function ceilings.

### 5.2 Architectural Decision: Asynchronous 202 Job with Polling
Resume parsing defaults to an **asynchronous job pattern with client polling**:

1. Client sends `POST /api/ai/parse-resume` with `{ storagePath: string }`.
2. Route handler performs pre-flight verification, inserts a record into `parse_jobs` (`status = 'pending'`), triggers background processing, and returns **HTTP 202 Accepted** within $< 500\text{ms}$:
   ```json
   {
     "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
     "status": "pending",
     "pollUrl": "/api/ai/parse-resume/status/f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```
3. Client polls `GET /api/ai/parse-resume/status/[jobId]` at 2-second intervals.
4. When status reaches `completed`, the response returns the `ResumeImportDraft` payload.
5. *Synchronous Simplification Note:* If production Vercel infrastructure confirms a function duration ceiling $\ge 60\text{s}$ (*verify in current Vercel docs*), the route can optionally be simplified to synchronous execution without altering the storage upload contract.

### 5.3 `parse_jobs` Database Schema
```sql
create table parse_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  storage_path text not null,
  status text not null default 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '1 hour')
);
alter table parse_jobs enable row level security;
create policy own_jobs on parse_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### 5.4 Retry & Timeout Envelope
- **Per-Attempt Timeout:** $8,000\text{ms}$ *(starting value, to be set from measured p95 latency in the eval harness T-016)*.
- **Resilience Budget:** 1 schema retry on primary $\to$ transport failover to secondary $\to$ 1 retry on secondary. Strict ceiling of **3 attempts total** across all providers (ADR-023 amendment to T-015).
- **User Quota:** Decremented strictly once per user request.

---

## 6. Modality Trade-Off Analysis

| Criteria | Stage 1: Text-First (Plain Text) | Stage 2: Spatial Text Stream | Native Multimodal PDF |
|---|---|---|---|
| **Accuracy** | High on 1-column; moderate on 2-column | High across 1- and 2-column layouts | Maximum on complex graphic layouts |
| **Cost** *(Starting Placeholders)* | $\sim \$0.001 - \$0.003$ / call | $\sim \$0.001 - \$0.003$ / call | $\sim \$0.015 - \$0.035$ / call |
| **Privacy / DPA** | Text payload only; easy sanitization | Text payload only | Full document binary transmitted |
| **Provider Lock-in** | Zero lock-in | Zero lock-in | High (requires vision endpoints) |

*Decision:* Deliver Stage 1 text-first extraction. Implement Stage 2 spatial extraction only if Stage 1 misses multi-column thresholds. Revisit multimodal only if text-based approaches fail across the evaluation corpus.

---

## 7. Test Strategy & Evaluation Benchmark

### 7.1 Accuracy Corpus (20 Synthetic Fixtures — T-016 Integration)
Evaluated against hand-labeled `expected.json` files:
1. Standard single-column tech resume.
2. Two-column LaTeX resume with left sidebar.
3. Two-column LaTeX resume with right margin metadata.
4. Table-grid resume with borderless cells.
5. Header-heavy executive CV (3 pages).
6. Single-role early career resume (1 page).
7. Career switcher with functional layout.
8. Multiple sequential roles at one company.
9. Extended career gap (2+ years) with explanatory text.
10. Academic CV with publications and grants.
11. Accented Latin characters (`Renée Noël Müller`, `Łukasz Żółć`).
12. UK/European date formats (`DD/MM/YYYY`).
13. Dot-separated date formats (`YYYY.MM`).
14. Non-traditional education (bootcamp/self-taught).
15. Extensive skill matrix (40+ items).
16. Dense bullet structure with embedded metrics.
17. Creative designer layout with asymmetrical text blocks.
18. Multi-lingual resume (English content with foreign entity names).
19. Recreated Word export (fictional content).
20. Recreated Google Docs / Canva export (fictional content).

*Human-Only Prerequisite:* Resumes 19 and 20 must be recreated using authentic Word, Google Docs, Canva, and LaTeX authoring tools using fictional identities (estimated effort: 4–6 hours).

### 7.2 Robustness Suite (10 Adversarial Edge Cases)
1. Image-only scan (HTTP 422 `isScan: true`).
2. Password-encrypted PDF (HTTP 422 `isEncrypted: true`).
3. Corrupted / truncated byte stream (HTTP 400).
4. Multi-page document exceeding 3 pages (parses first 3 pages with truncation warning).
5. Non-resume PDF (HTTP 422 `notResume: true`).
6. Prompt-injection resume ("Ignore previous instructions"; parsed as literal text).
7. Hidden white text on white background (parsed safely via injection-resistant system prompt and schema validation).
8. RTL text fragments (Hebrew/Arabic company names).
9. CJK character sets in skill names.
10. Zero-text empty PDF file (HTTP 422).

### 7.3 Field-Level Metrics *(Starting Values Tuned on the Corpus)*
- **Schema Conformance:** $100\%$.
- **Entity Precision:** $\ge 95\%$ (Stage 1 two-column target: $\ge 90\%$).
- **Entity Recall:** $\ge 90\%$ (Stage 1 two-column target: $\ge 85\%$).
- **Date Range Recall:** $\ge 92\%$.
- **Zero Hallucination Rate:** $100\%$ (strictly 0 ungrounded entities).

### 7.4 Automated No-Sample-Leakage Build Gate (`tests/no-sample-leakage.test.ts`)
- Scans `tests/fixtures/eval/resumes/` for all `expected.json` files.
- Extracts entity names (people, employers, schools, cities).
- Normalizes phrases (case-folded, whole-phrase matching).
- Scans production files in `app/` and `lib/` against an audited allowlist file (`tests/fixtures/eval/allowlist.json`).
- Fails the CI build if any fixture literal appears in production code.

---

## 8. Staged Ticket Breakdown & Dependencies

```
STAGE 1 (Immediate Core Delivery):
┌─────────────────────────────┐
│ T-020: Secure Upload / S3   │
│ & parse_jobs Migration      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐┌─────────────────────────────┐
│ T-021: ImportDraft Schema   ││ T-015: AI Provider Seam     │
└──────────────┬──────────────┘│ (Existing Dependency)       │
               │               └──────────────┬──────────────┘
               ├──────────────────────────────┤
               ▼                              ▼
┌─────────────────────────────┐┌─────────────────────────────┐
│ T-023: Provenance Guard     ││ T-024: LLM Parser Adapter   │
│ (N-gram Containment)        ││ (Stage 1: pdf-parse text)   │
└──────────────┬──────────────┘└──────────────┬──────────────┘
               │                              │
               └──────────────┬───────────────┘
                              ▼
┌────────────────────────────────────────────────────────────┐
│ T-025: Parse Route Handler (Async 202 Jobs + Polling)       │
└────────────────────────────────────────────────────────────┘

STAGE 2 (Conditional Layout Extraction):
┌─────────────────────────────┐
│ T-019: Spike pdfjs-dist     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ T-022: Layout Extractor     │ ──► Integrates into T-024 & T-025
└─────────────────────────────┘
```

1. **`docs/tickets/T-020.md`:** Secure Upload: Signed-URL Private Storage Pipeline & `parse_jobs` Schema (Owner: Backend Engineer; Test Author: QA Engineer).
2. **`docs/tickets/T-021.md`:** `ResumeImportDraft` Schema & Review-Stage Ripple Isolation (Owner: Backend Engineer; Test Author: QA Engineer).
3. **`docs/tickets/T-023.md`:** Deterministic Provenance Guard: N-Gram Containment & Pairing Verifier (Owner: AI/Prompt Engineer; Test Author: QA Engineer).
4. **`docs/tickets/T-024.md`:** LLM Semantic Resume Parser Adapter (Stage 1 Plain-Text) (Owner: AI/Prompt Engineer; Test Author: QA Engineer).
5. **`docs/tickets/T-025.md`:** Format-Agnostic `/api/ai/parse-resume` Route & Async Job Polling (Owner: Backend Engineer; Test Author: QA Engineer).
6. **`docs/tickets/T-019.md` (Conditional Stage 2):** Spike: `pdfjs-dist` Direct Import & Runtime Compatibility (Owner: Document Engineer; Test Author: QA Engineer).
7. **`docs/tickets/T-022.md` (Conditional Stage 2):** Layout-Aware Spatial Stream & Cross-Column Alignment Extractor (Owner: Document Engineer; Test Author: QA Engineer).
