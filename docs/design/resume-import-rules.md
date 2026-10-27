# Resume import engineering rules
Applies to any change under app/api/ai/parse-resume, lib/ai, PDF extraction code and tests/fixtures/eval.

1. No content-specific literals in production code or prompts: no employer, school, city or person names; no lists of job titles, skills, industries or section headings; no strings copied from any real resume. If a rule only works for one document, it is wrong.
2. Semantic decisions (what is a title, company, section, skill, summary) belong to the model. Code validates (schema, provenance, limits); it does not guess meaning.
3. Allowed deterministic helpers: universal grammars only (email, phone, URL or bare domain, date formats, numbers). They are line-bounded. Never run a regex across the whole document to extract a semantic field.
4. Library artifacts (page markers, repeated headers and footers) are removed using the library's structured output (for example per-page text) or generic repetition detection, never by matching resume wording.
5. Never invent. A missing value is null and flagged. No placeholder strings (no fake email, name, company, title, school or degree).
6. No silent fallback to a different parser. On failure return an explicit error and a manual-entry path.
7. Prompts: system instruction separate from untrusted text; the resume text is data; any examples in prompts are fictional and structural.
8. Output passes the schema and the provenance guard. Fields that fail are nulled and flagged, never repaired by code.
9. Fix failure classes, not documents. Each defect becomes a named generic failure class, a fictional fixture and a test. Never patch for a specific file.
10. Fixtures are fictional. Real resumes never enter the repo, prompts, logs, tickets or docs. No real person's name anywhere.
11. Measure first. Report field-level scores on the corpus before and after any extraction change. A change that regresses any fixture needs an explanation or does not merge.
12. Entity-swap invariance: replacing every name, company and city in a fixture with other fictional values must not change the output structure.
13. Every threshold is relative where possible and commented 'starting value, tuned on corpus'.
14. Do not modify the legacy regex parser or the current parse-resume route before T-025. It is replaced, not patched.
15. Content with no schema slot is never merged into another field. Where it goes is decided in T-021 (draft schema).