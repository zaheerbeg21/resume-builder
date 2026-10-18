<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Project rules
- Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Zod 4, @react-pdf/renderer 4, vitest 5, pdf-parse 2.
- Zod 4: use z.email() and z.url(), not z.string().email()/.url().
- pdf-parse is v2 (class-based: new PDFParse({ data }), getText(), destroy()). Do NOT use the v1 function API. Check node_modules/pdf-parse type definitions before writing code.
- Use renderToBuffer from @react-pdf/renderer in tests (Node environment).
- Register fonts with absolute paths: path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'). Static .ttf only, no variable fonts.
- Shell is Windows PowerShell. Use PowerShell-compatible commands (no rm -rf, no && chaining).
- Never run `npm audit fix --force` and never change dependency versions in package.json.
- Do not add dependencies without asking first.
- Never log resume content.
- lib/scoring must stay pure and deterministic.
- PDF output: single column, no tables, no icons, embedded static fonts only.
- Show a plan first. Run `npm test` before saying done. Touch only the folders named in the task.