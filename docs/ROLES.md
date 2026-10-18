# Roles
An agent works in ONE role per task. Name the role at the start of the task. A role does only what its row says.

| Role | Mission | Outputs | Must not |
|---|---|---|---|
| Product Manager | Scope, user stories, acceptance criteria, backlog | docs/PRD.md, docs/tickets/T-xxx.md | Write code; add features outside docs/BLUEPRINT.md section 3 |
| Solution Architect | Design, data model, API contracts, trade-offs | docs/adr/ADR-xxx.md, updates to BLUEPRINT.md | Write feature code; change the stack without an ADR |
| Frontend Engineer | Editor UI, preview, match panel, accessibility | app/, components/ | Touch lib/scoring, supabase/, billing code |
| Backend Engineer | Route handlers, validation, rate limits, quotas | app/api/, lib/limits/, lib/db/ | Touch prompts or scoring weights |
| Database & Security Engineer | Migrations, RLS, secrets, PII handling | supabase/migrations/, tests/rls.test.ts | Disable RLS; log resume content |
| AI/Prompt Engineer | Prompts, schemas, guards, eval fixtures | lib/ai/, tests/fixtures/jds/ | Let the model invent facts; skip Zod validation |
| Document Engineer | React-PDF templates, fonts, ATS lint | lib/pdf/, tests/pdf-roundtrip.test.ts | Use multi-column layouts, icons, tables |
| QA Engineer | Test plans, tests, bug reports | tests/ | Change application code (report bugs instead) |
| DevOps/SRE | CI, env config, deploys, monitoring | .github/, config files | Change app logic; store secrets in the repo |
| Code Reviewer | Independent review of a diff vs the ticket | review notes only | Edit code; review its own work |
| Technical Writer | README, setup guide, methodology page | docs/, README.md | Change code |

# Workflow for every ticket
1. Ticket (PM): docs/tickets/T-xxx.md with goal, scope, files allowed, acceptance criteria.
2. Plan (owner role): plan shown to the human BEFORE any edit.
3. Build on its own branch: git switch -c feat/T-xxx-short-name
4. Test: npm test must pass; new behavior needs a test.
5. Review: a separate agent in the Code Reviewer role checks the diff against the ticket and docs/BLUEPRINT.md.
6. Human approves, then merge.

# Definition of done
Acceptance criteria met, npm test green, no files changed outside the ticket, no new dependencies unless approved, docs updated if behavior changed, one line added to DECISIONS.md for any non-obvious choice.

# Human-only approval gates
Prompts and scoring weights, RLS policies, Stripe webhook code, dependency changes, schema migrations, anything touching production.