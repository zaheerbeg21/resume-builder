# Legal & Regulatory Risk Audit: ATSProof Resume Builder

> **Notice:** This is an engineering audit, not legal advice; confirm penalty figures and wording with a lawyer.

- **Audit Date:** October 25, 2026
- **Auditor Role:** Security and Compliance Engineer
- **Scope:** Repository codebase (`resume-builder`), dependencies, layouts, authentication flows, billing logic, and document rendering pipelines.

---

## 1. Executive Summary & Findings Matrix

| Risk Area | Regulation / Standard | Severity | Current Status | Key File(s) |
|---|---|---|---|---|
| **1. Age Gate** | COPPA (15 U.S.C. §§ 6501–6506) | **HIGH** | **Applicable / Non-compliant** (No age verification at signup; under-13 can submit PII) | `components/auth/RegisterForm.tsx`<br>`components/auth/OAuthButtons.tsx`<br>`app/(auth)/callback/route.ts` |
| **2. Third-Party Fonts & Assets** | GDPR (Art. 5(1)(a), Art. 6) / Munich LG Ruling | **LOW** | **Applicable / Compliant** (`next/font/google` self-hosts at build time; PDF fonts embedded locally; no runtime CDN calls) | `app/layout.tsx`<br>`lib/pdf/fonts.ts`<br>`app/globals.css` |
| **3. Session Replay & Tracking** | Wiretap Laws, GDPR, Sensitive PII Capture | **NOT APPLICABLE TODAY** | **Compliant** (No session replay libraries installed or active; trigger: adding PostHog/Sentry replay) | `package.json`<br>`app/layout.tsx`<br>`.env.example` |
| **4. Marketing Email** | CAN-SPAM Act (15 U.S.C. §§ 7701–7713) | **NOT APPLICABLE TODAY** | **Compliant** (No marketing email code exists; only Supabase Auth transactional verification emails) | `components/auth/RegisterForm.tsx`<br>`package.json` |
| **5. Subscription Checkout** | Auto-Renewal Laws (California ARL, FTC Negative Option) | **NOT APPLICABLE TODAY** | **Compliant** (Checkout exists via Stripe, but is strictly a one-time 30-day pass with no auto-renewal; trigger: recurring billing) | `lib/billing/stripe.ts`<br>`app/api/billing/checkout/route.ts`<br>`components/billing/BillingView.tsx` |
| **6. DMCA Safe Harbor** | 17 U.S.C. § 512 | **LOW** | **Applicable / Low Risk** (User content and PDF uploads are strictly private to the creator; no public sharing; missing DMCA page & takedown contact) | `app/api/resumes/route.ts`<br>`components/marketing/Footer.tsx` |

---

## 2. In-Depth Risk Findings & Analysis

### 2.1 Age Gate (COPPA Compliance)
- **Finding:** **Applicable — High Severity**
- **Regulatory Framework:** Children's Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501–6506; 16 C.F.R. Part 312).
- **Exact File Paths & Line Numbers:**
  - `components/auth/RegisterForm.tsx`: Lines 26–33, 78–85 (`supabase.auth.signUp`), 204–345 (form fields: email and password only).
  - `components/auth/OAuthButtons.tsx`: Lines 23–28 (`supabase.auth.signInWithOAuth({ provider: 'google', ... })`).
  - `app/(auth)/callback/route.ts`: Lines 10–21 (OAuth code exchange directly redirects to `/dashboard` without age validation).
  - `components/auth/validation.ts`: Lines 8–56 (validates email syntax and password length only; no date of birth or age validation schema).
- **Current Behavior:**
  The registration flow collects only an email address and password, or allows one-click authentication via Google OAuth. At no point in the registration, OAuth callback, or profile onboarding flows is age or date of birth verified. A user under the age of 13 can freely create an account and submit personal identifying information (PII) including full legal name, phone number, address, work history, educational background, and resume contents.
- **Proposed Fix:**
  1. **Neutral Age Screen:** Implement a neutral age gate screen preceding account registration. In accordance with FTC COPPA guidance, the screen must NOT disclose the qualifying age (e.g., must NOT state "You must be 13 or older to join" or display an "I am over 13" checkbox, which prompts under-13 users to lie). Instead, it must neutrally request the user's date of birth (Month, Day, Year).
  2. **Under-13 Account Block:** If the entered date of birth corresponds to an age under 13:
     - Terminate the registration flow immediately with a neutral non-qualifying notice.
     - Store an HTTP-only, secure, short-lived session cookie (e.g., `coppa_blocked=true; Max-Age=86400; SameSite=Strict; Secure`) to prevent the user from bypassing the block by clicking back or refreshing.
     - Do NOT persist the child's email address, password, date of birth, or any personal data to the database or authentication server.
  3. **Server-Side Enforcement:**
     - For email signups: Enforce server-side verification before `supabase.auth.signUp` can be finalized.
     - For Google OAuth: Gate the OAuth entry point or intercept the first-time OAuth callback in `app/(auth)/callback/route.ts` to require completion of the neutral age screen prior to provisioning `profiles` or granting application access.

---

### 2.2 Third-Party Font and Asset Loading (GDPR)
- **Finding:** **Applicable — Low Severity (Compliant with Architecture Safeguards)**
- **Regulatory Framework:** General Data Protection Regulation (GDPR, Regulation (EU) 2016/679, Art. 5(1)(a), Art. 6); Munich Regional Court (Landgericht München I) Case 3 O 17493/20 (IP transmission to Google Fonts).
- **Exact File Paths & Line Numbers:**
  - `app/layout.tsx`: Lines 2, 5–13 (`import { Geist, Geist_Mono } from "next/font/google"`).
  - `app/globals.css`: Line 1 (`@import "tailwindcss";` — local Tailwind imports only).
  - `lib/pdf/fonts.ts`: Lines 13–46, 51–82 (resolves `Inter-Regular.ttf`, `Inter-Bold.ttf`, `SourceSerif4-Regular.ttf`, `SourceSerif4-Bold.ttf` strictly from local server filesystem `public/fonts/` or local browser origin).
  - `next.config.ts`: Lines 1–19 (no remote font CDNs configured).
- **Current Behavior:**
  - No runtime calls to `fonts.googleapis.com` or `fonts.gstatic.com` exist in the application.
  - `next/font/google` in Next.js 16 downloads Google Font assets at build time and self-hosts them as static files directly from the application's domain. When a user visits the site, no HTTP request is dispatched to Google's servers, and visitor IP addresses are never transmitted to Google.
  - React-PDF fonts in `lib/pdf/fonts.ts` use strictly self-hosted static `.ttf` files located in `public/fonts/`.
  - No third-party `<script>`, `<iframe>`, tracker, or external stylesheet link exists in any layout or page.
  - The only external endpoint communicating from the browser is the user's authenticated Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL`) for database/auth operations.
- **Proposed Fix:**
  - Add an automated compliance test (`tests/compliance/fonts.test.ts`) that verifies built assets, HTML, and CSS do not contain `fonts.googleapis.com` or `fonts.gstatic.com` hostnames.
  - Optional hardening: Migrate `Geist` to `next/font/local` using static font files in `public/fonts/` to remove any build-time dependency on external Google servers.

---

### 2.3 Session Replay and Tracking
- **Finding:** **Not Applicable Today — Low Severity Today (Medium if Implemented)**
- **Trigger that would make it applicable:** Adding PostHog session recording, Sentry Replay, Hotjar, FullStory, LogRocket, Microsoft Clarity, Mouseflow, or Smartlook (as contemplated in `docs/BLUEPRINT.md` §4 line 82: "Observability: Sentry, PostHog (events)").
- **Exact File Paths & Line Numbers:**
  - `package.json`: Lines 12–33 (zero telemetry, replay, or tracking packages installed).
  - `app/layout.tsx`: Lines 27–40 (no replay or tracking initialization scripts embedded).
  - `.env.example`: Lines 1–53 (no replay or telemetry environment variables).
  - `docs/BLUEPRINT.md`: Line 82 (`PostHog (events), Sentry`), Line 522 (Week 8 hardening).
- **Current Behavior:**
  No session replay or screen recording software is installed, loaded, or configured. No keystrokes, form inputs, or mouse movements are being captured or transmitted.
- **Proposed Requirements When Triggered:**
  If session recording or error replay tools are added in the future:
  1. **Consent Gate:** Replay recording must never be enabled by default. It must be gated behind explicit opt-in consent through a consent banner.
  2. **Strict Form Field Masking:** Because resume data (names, phone numbers, home addresses, employment history, bullets) is highly sensitive personal data, all form inputs across `components/editor/sections/*` and `components/target/*` must have masking enabled by default:
     - Global configuration: `maskAllInputs: true`, `maskTextSelector: '*'`.
     - Explicit masking attributes applied to all input containers: `data-sensitive="true"` or `data-ph-capture-attribute=false`.
  3. **Zero Capture of Credentials/Tokens:** Passwords, authentication cookies, and Stripe payment interactions must be completely excluded from capture.

---

### 2.4 Marketing Email (CAN-SPAM Act)
- **Finding:** **Not Applicable Today — Low Severity Today (Medium if Implemented)**
- **Trigger that would make it applicable:** Sending automated promotional emails, product update newsletters, onboarding marketing sequences, or pass-expiry re-buy promotions (e.g., `docs/BLUEPRINT.md` §9 line 464: "add an expiry email 3 days before the pass ends with a one-click re-buy").
- **Exact File Paths & Line Numbers:**
  - `package.json`: Lines 12–20 (no transactional or marketing email library like `resend`, `@sendgrid/mail`, or `nodemailer` installed).
  - `components/auth/RegisterForm.tsx`: Lines 78–85 (calls `supabase.auth.signUp()`, which triggers Supabase Auth's built-in transactional verification email).
  - `docs/BLUEPRINT.md`: Line 464 (notes future expiry re-buy email).
- **Current Behavior:**
  The repository contains no custom email-sending code or marketing campaign pipelines. The only email communication dispatched is Supabase Auth's transactional email (account verification / password reset), which is legally exempt from CAN-SPAM commercial requirements.
- **Proposed Requirements When Triggered:**
  When commercial/promotional emails are introduced:
  1. **Working One-Click Unsubscribe:** Every marketing email must include a functional, single-click unsubscribe link in the footer and standard `List-Unsubscribe` headers. Opt-out requests must be processed within 10 business days.
  2. **Physical Postal Address:** The email footer must display a valid physical postal address: `[OWNER: postal address]`.
  3. **Sender Identification:** The "From" header and sender identity must clearly and accurately reflect the business: `[OWNER: sender email / company name]`.
  4. **Unsubscribe Suppression List:** Maintain a dedicated suppression list (e.g., `email_suppressions` table or provider suppression list) that is checked prior to every marketing dispatch.
  5. **Transactional Separation:** Strictly isolate transactional messages (receipts, password resets, verification) from marketing messages.

---

### 2.5 Subscription Checkout (Auto-Renewal Laws)
- **Finding:** **Not Applicable Today (Auto-Renewal Laws do not apply to one-time pass); Checkout is Live — Low Severity**
- **Trigger that would make it applicable:** Introducing recurring subscription products (e.g., monthly or annual auto-renewing billing plans).
- **Exact File Paths & Line Numbers:**
  - `lib/billing/stripe.ts`: Lines 53–55, 79 (`formData.append('mode', 'payment')` — strictly one-time payment mode, NOT `mode: 'subscription'`).
  - `app/api/billing/checkout/route.ts`: Lines 10–38 (creates one-time Stripe checkout session).
  - `components/billing/BillingView.tsx`: Lines 84–86 ("One $19 payment unlocks 30 days"), Line 169 ("No auto-renewal"), Lines 241–242 ("No recurring subscription, no auto-renew traps"), Line 253 ("One-time payment • 30 days access"), Lines 311–313 ("Pass expires automatically after 30 days. We do not automatically charge your card when it expires.").
  - `components/marketing/PricingSection.tsx`: Lines 10–12 ("Pay Per Job Hunt — Not Forever"), Line 17 ("No recurring subscription traps. No sneaky auto-renewals"), Lines 106–107 ("No Auto-Renew").
- **Current Behavior:**
  The billing architecture implements a Stripe Checkout integration for a 30-day access pass at $19 USD. Stripe is explicitly invoked in `payment` mode (`mode: 'payment'`), which charges the user once and terminates without creating a recurring subscription schedule. Access expires naturally after 30 days. Because the product does not auto-renew, statutory auto-renewal requirements (such as California ARL Cal. Bus. & Prof. Code § 17600 et seq., FTC Negative Option Rule) do not apply to the current product design.
- **Proposed Requirements if Recurring Subscriptions are Introduced:**
  If an auto-renewing subscription tier is ever added:
  1. **Adjacent Conspicuous Disclosures:** Clear and conspicuous disclosures presented immediately adjacent to the subscription CTA button before purchase:
     - Clear disclosure that the subscription will continue until canceled.
     - Recurring billing price: `[OWNER: subscription price]` and frequency (e.g., monthly, annually).
     - The cancellation policy and exact deadline to cancel before renewal.
  2. **Simple Online Cancellation:** A 1-to-2 click cancellation mechanism on the `/billing` page (e.g., self-service Stripe Customer Portal session or a direct "Cancel Subscription" button) without retention roadblocks.
  3. **Post-Purchase Acknowledgement:** Immediate email confirmation detailing the terms and cancellation mechanism.
  4. **Centralized Pricing Configuration:** Centralize the hardcoded price points ($19 / 1900 cents) currently duplicated across `stripe.ts`, `BillingView.tsx`, and `PricingSection.tsx` into a single configuration file (`lib/billing/config.ts`).

---

### 2.6 DMCA Safe Harbor & User-Uploaded Content
- **Finding:** **Applicable — Low Severity (Private Uploads Only; Missing DMCA Page)**
- **Regulatory Framework:** Digital Millennium Copyright Act (17 U.S.C. § 512(c)).
- **Exact File Paths & Line Numbers:**
  - `types/resume.ts`: Lines 171–201 (schema contains only structured resume text; no image, photo, or logo fields).
  - `app/api/resumes/route.ts`: Lines 18–28 (resumes retrieved strictly with `user_id = user.id` via owner RLS).
  - `app/api/resumes/[id]/route.ts`: Lines 25–30, 96–102, 131–136 (CRUD operations restricted strictly to owner).
  - `components/marketing/Footer.tsx`: Lines 73–82 (contains a short 2-sentence privacy notice; no link to a Terms of Service, DMCA page, or copyright agent contact).
  - `docs/tickets/T-020.md` & `docs/adr/ADR-022`: Resume PDF uploads target a private Supabase Storage bucket (`resumes-raw`) with short-lived signed URLs and automated purge upon parsing.
- **Current Behavior:**
  - All user content (resume data, imported PDFs, exported PDFs) is strictly private to the authenticated creator.
  - There are NO public resume URLs, NO public sharing links, NO searchable candidate directories, and NO hosted image/logo assets.
  - Because content is private and accessible only by the uploader, DMCA safe harbor liability (§ 512(c) storage at the direction of a user of material residing on a system or network controlled by or for the service provider) carries very low immediate exposure compared to public publishing platforms.
  - However, the application currently lacks a `/dmca` notice page, a designated copyright agent, and a published repeat-infringer policy.
- **Proposed Fix:**
  1. **DMCA Notice & Takedown Page:** Create a public `/dmca` route (`app/(marketing)/dmca/page.tsx`) detailing the statutory takedown procedure pursuant to 17 U.S.C. § 512(c)(3) and counter-notification procedure under § 512(g).
  2. **Designated Agent Notice:** Include placeholders for the registered agent:
     - Agent Name: `[OWNER: DMCA agent name]`
     - Company / Organization: `[OWNER: legal entity name]`
     - Postal Address: `[OWNER: DMCA agent postal address]`
     - Telephone: `[OWNER: DMCA agent telephone]`
     - Email: `[OWNER: DMCA agent email]`
  3. **Repeat Infringer Policy:** Adopt and reasonably implement a policy providing for the termination in appropriate circumstances of subscribers and account holders who are repeat infringers.
  4. **Copyright Office Registration Walkthrough:** Provide the owner with step-by-step instructions for registering the agent via the U.S. Copyright Office online directory.

---

## 3. Related Legal & Compliance Issues Noticed

1. **Missing Formal Privacy Policy (`/privacy`):**
   - Current state: Only a brief 2-sentence inline blurb in `components/marketing/Footer.tsx` (lines 73–78).
   - Deficiencies: Lacks required statutory GDPR (Art. 13/14) and CCPA/CPRA disclosures, including: sub-processor enumeration (Supabase, Stripe, Google Gemini), legal basis for data processing, data retention schedules, international data transfer safeguards, and user rights (access, rectification, erasure, data portability).
2. **Missing Terms of Service (`/terms`):**
   - Current state: No Terms of Service page exists.
   - Deficiencies: No binding agreement governing acceptable use, warranty disclaimers, limitation of liability, intellectual property ownership of user-generated resumes, arbitration/dispute resolution, or governing law.
3. **Missing Consent Management / Cookie Policy:**
   - Current state: Only essential session cookies are set by Supabase Auth; however, no cookie banner or consent policy exists. Adding analytics (PostHog) or crash telemetry (Sentry) in the future will require consent management infrastructure to avoid ePrivacy Directive / GDPR non-compliance.
4. **Data Retention & Account Erasure (Right to Erasure / GDPR Art. 17):**
   - Current state: Users can delete individual resumes via `DELETE /api/resumes/[id]`, and database cascade-deletes exist from `profiles` to `resumes`. However, there is no user-facing "Delete Account & Data" action in the dashboard to purge their `auth.users` identity and associated records.

---

## 4. Human-Only Prerequisites

The following parameters must be supplied by the repository owner before implementation and publication:

1. `[OWNER: legal entity name]` — Official registered legal entity name (e.g., LLC, Corporation, or Sole Proprietor).
2. `[OWNER: postal address]` — Valid physical postal address for CAN-SPAM email footers, DMCA agent listing, and legal notices.
3. `[OWNER: support email]` — Customer support contact email address.
4. `[OWNER: legal/privacy email]` — Designated email address for privacy inquiries and data subject requests (DSAR).
5. `[OWNER: DMCA agent name]` — Full legal name or title of the designated copyright agent.
6. `[OWNER: DMCA agent postal address]` — Physical postal address for the designated copyright agent.
7. `[OWNER: DMCA agent telephone]` — Telephone number of the designated copyright agent.
8. `[OWNER: DMCA agent email]` — Dedicated email address for receiving copyright infringement notices.
9. `[OWNER: DMCA agent registration fee & verification]` — Verification and payment of registration fee ($6 per 3-year term as of current regulations; owner must verify directly on copyright.gov).
10. `[OWNER: subscription price]` — Recurring subscription price point (applicable only if recurring billing is introduced in the future).

---

## 5. Proposed Ticket Breakdown (Using Next Free Ticket Numbers)

The repository currently contains tickets `T-001.md` through `T-025.md` in `docs/tickets/`. The proposed compliance tickets utilize the next free ticket sequence:

- **`docs/tickets/T-026.md`:** **COPPA Compliance: Neutral Age Screen & Under-13 Account Block**
  - *Owner:* Backend / Frontend Engineer | *Test Author:* QA Engineer
  - *Scope:* Neutral date-of-birth screen, under-13 registration block, session cookie guard, server-side auth gate.
- **`docs/tickets/T-027.md`:** **GDPR Compliance: Build-Time Font Self-Hosting Assertion & Test Suite**
  - *Owner:* Frontend / DevOps Engineer | *Test Author:* QA Engineer
  - *Scope:* Automated test verifying zero external runtime font calls to Google CDNs across built output.
- **`docs/tickets/T-028.md`:** **Privacy Safeguards: Session Replay Prevention & PII Input Masking Gate**
  - *Owner:* Frontend Engineer | *Test Author:* QA Engineer
  - *Scope:* Architectural gate ensuring any future telemetry/replay SDK is masked by default and gated by opt-in consent.
- **`docs/tickets/T-029.md`:** **CAN-SPAM Compliance: Commercial Email Suppression & Postal Address Infrastructure**
  - *Owner:* Backend Engineer | *Test Author:* QA Engineer
  - *Scope:* Email suppression table schema, footer template with `[OWNER: postal address]` and 1-click unsubscribe helper.
- **`docs/tickets/T-030.md`:** **Commerce Compliance: Centralized Pricing Config & Auto-Renewal Disclosure Guard**
  - *Owner:* Backend Engineer | *Test Author:* QA Engineer
  - *Scope:* Centralized pricing constants (`lib/billing/config.ts`), auto-renewal disclosure components for future subscriptions.
- **`docs/tickets/T-031.md`:** **DMCA Compliance: Designated Agent Page & Notice-and-Takedown Workflow**
  - *Owner:* Frontend Engineer | *Test Author:* QA Engineer
  - *Scope:* `/dmca` public page, notice-and-takedown form/procedure, repeat-infringer policy, agent walkthrough.
- **`docs/tickets/T-032.md`:** **Statutory Legal Pages: Dedicated Privacy Policy, Terms of Service & Account Deletion**
  - *Owner:* Fullstack Engineer | *Test Author:* QA Engineer
  - *Scope:* `/privacy` and `/terms` public routes, footer navigation links, and cascade account deletion endpoint.

---

## 6. U.S. Copyright Office Registration Walkthrough (for Owner)

*Note: You must verify the official URL, current statutory fee, and renewal interval directly on the U.S. Copyright Office website before submitting.*

1. **Access the Directory:** Navigate to the official U.S. Copyright Office DMCA Designated Agent Directory portal (search for "U.S. Copyright Office DMCA Designated Agent Directory" at `copyright.gov`).
2. **Create Service Provider Account:** Register an administrative account for your legal entity (`[OWNER: legal entity name]`).
3. **Designate the Agent:** Complete the designation form specifying:
   - Full legal name or title of the designated agent (`[OWNER: DMCA agent name]`).
   - Physical street address (`[OWNER: DMCA agent postal address]`).
   - Telephone number (`[OWNER: DMCA agent telephone]`).
   - Email address for receipt of notices (`[OWNER: DMCA agent email]`).
4. **Pay Statutory Fee:** Pay the designated registration fee online via Pay.gov (verify the current fee on `copyright.gov`; historically $6 for an online designation).
5. **Set Renewal Reminder:** DMCA agent designations must be renewed every 3 years. Set an administrative calendar reminder to renew the designation prior to expiry to maintain safe harbor eligibility.
