# ADR-023: Amendments to AI Provider Resilience Budget & Evaluation Golden Sets

- **Status:** Proposed
- **Date:** 2026-10-25
- **Author:** Solution Architect / AI/Prompt Engineer
- **References:** docs/tickets/T-015.md, docs/tickets/T-016.md, docs/design/resume-import.md

## 1. Context & Motivation
During the architectural design of the format-agnostic resume import pipeline (`docs/design/resume-import.md`), operational constraints were identified in existing documentation tickets:
1. **T-015 Retry Budget:** T-015 §9.2 currently specifies a maximum of 2 total attempts across all providers. For structured semantic extraction, schema or provenance validation failure justifies a single retry on the primary provider with structural error feedback; if that fails or the primary encounters a transport error, failing over to the secondary provider requires a total ceiling of 3 attempts. Note: `lib/ai` currently contains only `guards.ts` and `schemas.ts`; T-015 is **not yet implemented in code**, so this amendment is purely a documentation edit to `docs/tickets/T-015.md`.
2. **T-016 Evaluation Corpus:** T-016 §7 defines 20 resume fixtures focused on text diversity, without specifying layout geometries (two-column, sidebars, tables) or separating parsing accuracy metrics from an adversarial robustness suite.

Per project operating rules, agents never edit existing tickets directly. This ADR records the exact replacement text for the amendments. The product owner will apply these edits to `docs/tickets/T-015.md` and `docs/tickets/T-016.md` in a separate documentation commit after approval.

## 2. Decision & Exact Replacement Text

### (a) Exact Replacement Text for `docs/tickets/T-015.md` (§9.2)

**Target Section:** `docs/tickets/T-015.md` under `### 9.2 Validation & Digit-Guard Retry Policy`:

*Replace the existing section text with the following:*

```markdown
### 9.2 Validation & Digit-Guard Retry Policy
- If the provider returns a response that fails Zod schema validation or fails the server-side digit/provenance guard, the router **retries once on the same provider** with structured validation feedback.
- If the retry also fails validation, or if the primary encounters an eligible transport failure (timeout, 429, 5xx), the router **fails over once** to the secondary provider.
- If the secondary provider fails validation on its first attempt, it may retry once on the secondary provider.
- **Strict Limit:** Maximum of **3 total attempts** across all providers per user request.
- **Quotas:** User quota is decremented strictly once per user request, regardless of whether internal retries or failovers occur.
```

### (b) Exact Replacement Text for `docs/tickets/T-016.md` (§7 & §8.1)

**Target Section:** `docs/tickets/T-016.md` under `### 7. Golden Sets Specification` item 1:

*Replace item 1 with the following:*

```markdown
1. **20 Resume Accuracy Fixtures (`tests/fixtures/eval/resumes/`):**
   - High layout and career diversity benchmarked against hand-labeled `expected.json` files:
     - 1. Single-column modern sans-serif
     - 2. Two-column LaTeX with left sidebar
     - 3. Two-column LaTeX with right margin metadata
     - 4. Table-grid layout with borderless cells
     - 5. Header-heavy executive format (3 pages)
     - 6. Single-role early career (1 page)
     - 7. Career switcher with functional layout
     - 8. Multiple sequential roles at one company
     - 9. Extended career gap (2+ years) with explanatory text
     - 10. Academic CV with publications
     - 11. Accented Latin characters (`Renée Noël Müller`, `Łukasz Żółć`)
     - 12. UK/European date formats (`DD/MM/YYYY`)
     - 13. Dot-separated date formats (`YYYY.MM`)
     - 14. Non-traditional education (bootcamp/self-taught)
     - 15. Skill matrix (40+ items)
     - 16. Dense bullet structure with metrics
     - 17. Asymmetrical creative designer layout
     - 18. Multi-lingual resume (English content with foreign entity names)
     - 19. Authentic Word export recreated with fictional data (human-only prerequisite)
     - 20. Authentic Google Docs/Canva export recreated with fictional data (human-only prerequisite)
   - Zero real person's PII in any fixture.

1b. **10 Adversarial Robustness Fixtures (`tests/fixtures/eval/robustness/`):**
   - Benchmarked against deterministic HTTP status and error codes:
     - 1. Image-only scanned document (HTTP 422 `isScan: true`)
     - 2. Password-encrypted PDF (HTTP 422 `isEncrypted: true`)
     - 3. Corrupted / truncated byte stream (HTTP 400)
     - 4. Multi-page document exceeding 3 pages (truncation warning on 4th page)
     - 5. Non-resume PDF (e.g. invoice/academic paper; HTTP 422 `notResume: true`)
     - 6. Prompt-injection resume ("Ignore previous instructions"; parsed as literal text)
     - 7. Hidden white text on white background (parsed safely via injection guards)
     - 8. RTL text fragments (Hebrew/Arabic company names)
     - 9. CJK character sets in skill names
     - 10. Zero-text empty PDF file (HTTP 422)

1c. **Automated No-Sample-Leakage Gate (`tests/no-sample-leakage.test.ts`):**
   - Automatically parses all `expected.json` files, extracts entity names (people, employers, schools, cities), normalizes them (whole-phrase, case-folded), and scans all production code in `app/` and `lib/` against an allowlist file (`tests/fixtures/eval/allowlist.json`). Fails build if any fixture literal appears in production code.
```

## 3. Interim Risk Note
Until Ticket T-025 is implemented and deployed, `app/api/ai/parse-resume/route.ts` remains active in production using master's local regex parser. This implementation invents placeholder data (`'candidate@example.com'`, `'Company'`, `'Degree'`) when parsing resumes that deviate from standard single-column formats. Frontend review flows must continue to treat all import data as provisional until T-025 replaces the route.

## 4. Consequences
- Authorizes a 3-attempt resilience loop for structured extraction across primary and secondary providers.
- Sets clear evaluation requirements for both layout parsing accuracy and adversarial document robustness.
- Preserves ticket immutability by establishing a formal owner review commit for documentation updates.
