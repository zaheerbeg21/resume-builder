# Product Requirements Document (PRD) — ATS Resume Builder MVP

**Document Version:** 1.0.0  
**Date:** October 18, 2026  
**Status:** Draft  
**Product Owner:** Zaheer  
**Blueprint Reference:** [docs/BLUEPRINT.md](docs/BLUEPRINT.md)

---

## 1. Problem Statement

Existing resume builders in the consumer market exhibit four recurring points of friction for job applicants:

1. **Broken ATS Parsing:** Many resume builders employ multi-column layouts, graphics, icons, tables, and non-standard fonts. While visually striking in browser previews, Applicant Tracking Systems (ATS) like Workday, Greenhouse, Taleo, and Lever extract text by stream order. This can scramble experience bullets across columns, drop dates, and turn special characters into unreadable unicode artifacts (such as `\uFFFD`).
2. **Arbitrary, Opaque "Scores":** Proprietary scores presented without transparent line-by-line justification risk nudging candidates toward artificial keyword-stuffing rather than substantive qualification alignment.
3. **Hallucinatory AI Assistance:** General-purpose LLM resume tools can fabricate metrics, tools, team sizes, or achievements that the candidate never supplied, introducing severe ethical and employment risks.
4. **Subscription-First Pricing Models:** Many tools rely on recurring monthly subscriptions for what is fundamentally an episodic project (a job hunt typically lasting a few weeks to months) rather than an ongoing software commitment.

---

## 2. Target Users & Personas

- **Primary Persona: Active Job Seeker (Tech & Corporate Knowledge Roles)**
  - Applying to corporate portals where automated ATS parsers filter resumes before human review.
  - Needs a clean, modern, single-column resume with machine-readable text that parses cleanly into plain text streams.
  - Wants transparent, evidence-based keyword match feedback against specific Job Descriptions (JDs) without guessing.
  - Demands AI assistance that sharpens wording and highlights achievements without inventing false credentials or metrics.
  - Values fair, predictable pricing: a single job-hunt pass without recurring subscription auto-renewals.

---

## 3. Market Context & Competitor Analysis (Unverified Industry Claims)

> [!NOTE]
> The competitor observations below are based on general industry knowledge, user feedback on public review platforms (Reddit, Trustpilot), and unverified marketing claims. Competitor feature sets, pricing models, and terms frequently change and must be independently verified prior to public comparison campaigns.

| Competitor | Commonly Reported Limitation (Unverified) | MVP Feature That Answers It | In MVP? |
|---|---|---|---|
| **Rezi** | Subscription-first billing, cancellation friction; proprietary score that is difficult to interpret; generic AI wording. | 30-day fixed pass, no auto-renew; Keyword Match Score broken into per-keyword evidence; AI strictly limited to user-supplied facts. | **Yes** |
| **Jobscan** | Expensive monthly tiers with scan quotas; strong at checking, weak at building; nudges users toward keyword stuffing. | Guided builder and JD match panel in one unified screen; keyword repetition limit (stuffing detected and penalized). | **Yes (match panel)** |
| **Resume Worded** | Scores feel arbitrary with heavy upsells; diagnostic feedback without integrated inline editing tools. | Inline feedback and rewriting on every flagged bullet, with concrete reasons displayed. | **Yes (bullet feedback)** |
| **Reactive Resume** | Open-source/free but lacks JD targeting and AI guidance; templates allow multi-column/icons that harm parsing; steep learning curve; self-hosting overhead. | Hosted guided editor; two ATS-locked single-column templates; automated JD keyword targeting. | **Yes (templates, editor)** |
| **Industry-Wide** | Discrepancy between HTML browser preview pagination and final exported PDF pagination. | Single React-PDF rendering engine powering both live browser preview and final PDF export. | **Yes** |

---

## 4. MVP Scope (Exact 10 Deliverables from Blueprint §3)

1. **Authentication:** Email/password and Google OAuth sign-in.
2. **Resume CRUD:** Full Create, Read, Update, Delete functionality; maximum 5 resumes per user (enforced in API and database).
3. **Guided Resume Editor:** Structured forms for Contact (Basics), Summary, Work Experience, Projects, Education, and Skills. Includes debounced client autosave.
4. **Resume Import:** Extraction from existing PDF or DOCX files into the standard resume JSON structure, followed by a mandatory review screen highlighting low-confidence fields.
5. **Two ATS-Locked Templates:**
   - *Standard:* Clean Helvetica-style sans-serif using embedded static Inter font.
   - *Classic:* Traditional serif style using embedded static serif font (Source Serif 4 or Noto Serif).
6. **Unified Live Preview:** Browser preview rendered by the identical React-PDF engine used for server-side PDF exports.
7. **ATS Export Pipeline & Lint:** PDF export with automated pre-flight ATS lint and parse-back check (`pdf-parse` v2).
8. **Job Description Keyword Matching:** Paste JD → Gemini keyword extraction → deterministic, client/server TypeScript Keyword Match Score with line-by-line evidence.
9. **Fact-Constrained Bullet Improver:** 3 rewrite variants per bullet (conservative, metric-focused, leadership/scope-focused); strict server-side digit guards prevent invented numbers; unresolved bracketed placeholders block export.
10. **Monetization & Free Tier:** Single $19 pass for 30 days of unlimited exports and higher AI quota via Stripe Checkout; free tier includes resume building, previewing, scoring, 5 AI calls per day, and 1 clean PDF export.

---

## 5. Explicit Non-Goals (Strictly Deferred Scope)

To preserve focus and ensure delivery, the following features are **explicitly excluded** from the MVP:
- Cover letter generation or management.
- LinkedIn profile optimizer or scraper.
- Job application tracking board (Kanban / CRM).
- DOCX resume export (PDF export only).
- More than two resume templates.
- Multi-user accounts, teams, coaching, or recruiter review workflows.
- Automated job board scraping or job recommendations.
- Browser extensions.
- Multi-language resume localization (English only for MVP).
- Lifetime subscription tiers (margin risk due to LLM API costs).

---

## 6. Observed Beta Hypotheses & Metrics (Sample Size: 20–30 Users)

> [!NOTE]
> Given the small qualitative cohort size (20–30 users) in private beta, these metrics represent directional hypotheses to observe rather than rigid statistical pass/fail criteria.

- **Activation Rate Hypothesis:** Observe whether >= 60% of registered beta users complete and export at least one resume within 24 hours of account creation.
- **Export Lint Pass Rate:** Target >= 99% of exported PDFs passing automated ATS format lint checks without syntax or pagination errors.
- **Pagination Parity:** Target 100% page-count parity between live browser preview and exported PDF across all 20 test fixtures.
- **Scoring Determinism:** Target 100% identical score and keyword breakdown when running repeated evaluations on unchanged resume and JD inputs.
- **Zero Invented Digits:** 0 invented digits in bullet optimization (enforced by automated server-side regex guards); verifying unauthorized qualitative facts remains a manual human review item.
- **Security & Multi-Tenant Isolation:** 0 cross-tenant data leaks; 100% pass rate on automated Supabase Row Level Security (RLS) test suite.
- **Free-to-Pass Conversion Hypothesis:** Observe whether 8% to 12% of free-tier users convert to the 30-day paid pass ($19).
- **Unit Economics / AI Cost:** Target average AI API cost per active user remaining under $3.80 (less than 20% of the $19 pass price).

---

## 7. Open Questions and Assumptions

The following items are unresolved business and infrastructure assumptions that require human stakeholder resolution. They must not be resolved autonomously by coding agents:

1. **DOCX Import Scope:** Is DOCX file import included in the MVP alongside PDF import, or should MVP import be restricted strictly to PDF files to reduce parsing surface area?
2. **Working Name & Trademark:** What is the finalized brand name for the product? Trademark clearance must be conducted to ensure no infringement on competitor marks (avoiding 'Rezi', 'Score', or confusingly similar branding).
3. **Git Remote Repository Location:** Where is the canonical upstream Git remote hosted (e.g., GitHub, GitLab), and what are the branch protection rules for `master`?
4. **Cloud & Third-Party Project Ownership:**
   - Who is responsible for creating the Google Cloud project, enabling Gemini API, and configuring OAuth 2.0 client credentials?
   - Who creates and administers the production Supabase organization and project?
5. **Payment Gateway Availability:** Is Stripe available in the founder's business entity country? If not, should the architecture pivot to an authorized Merchant of Record (Paddle or Lemon Squeezy) to handle global sales tax and VAT?
6. **Static Serif Font Selection:** Which specific open-source static TTF serif font will be standardized for the Classic template (Source Serif 4 vs. Noto Serif), and has the license been formally verified?
7. **Fair-Use AI Quota Limits:** What is the precise numerical fair-use ceiling for AI calls on the 30-day pass (e.g., 300 calls per pass) before throttling or soft caps take effect?
8. **Paid Gemini API Tier Data Terms:** Confirmation that the active paid tier of Google Gemini API guarantees user prompts and resume payloads are excluded from model training datasets.
9. **Autosave Debounce Parameter:** Confirmation of the client-side debounced autosave interval (assumed 1000ms).
10. **Privacy Policy, Data Retention, & GDPR:** Who will author the customer-facing privacy policy, terms of service, and data processing agreement (DPA) regarding user resume deletion policies and sub-processors?
