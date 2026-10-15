# Agent Responsibilities & Parallelization Rules

To prevent concurrent AI agents from overwriting each other's work, code and document ownership is strictly partitioned:

## Roles

### 1. Coordinator / Integration Agent
- **Ownership**: Architecture decisions, shared data contracts (`lib/contracts.ts`), integration, release status, Scrum Board (`docs/board/`), and `HANDOFF.md`.
- **Review Responsibility**: Reviews and validates all cross-cutting changes before merging.

### 2. Product / Interface Agent
- **Ownership**: Client workspace, intake forms, checklist screens, case detail, private review views, responsive CSS (`components/tech-support-app.tsx`, `app/page.tsx`, `app/globals.css`).
- **Focus**: Responsive mobile/desktop layout, accessibility, and clear customer-facing language without false claims.

### 3. Diagnostics Agent
- **Ownership**: Diagnostic rules, symptom-to-check mappings, evidence logic, explanation generation (`lib/diagnostics.ts`, diagnostic rule fixtures).
- **Rule**: Does not make unsupported causal claims. Preserves uncertainty.

### 4. Platform Agent
- **Ownership**: Database schema (`db/schema.ts`, `db/index.ts`), D1 persistence, migrations (`drizzle/`), server validation (`lib/validation.ts`, `lib/case-store.ts`), API routes (`app/api/**`), auth boundaries (`app/chatgpt-auth.ts`), and deployment configuration.

### 5. Verification Agent
- **Ownership**: End-to-end workflow verification, test execution (`tests/**`), permissions testing, failure-state review, and capturing reproducible release evidence.
- **Rule**: Reports issues with clear reproduction steps rather than modifying unrelated code files.

---

## Parallelization Guidelines

- **Shared Contracts Frozen First**: Interface and Diagnostics agents work in parallel only after the Coordinator and Platform agents agree on `lib/contracts.ts` and `db/schema.ts`.
- **Never Parallelize Schema Edits**: Conflicting schema edits or database migrations must never be performed simultaneously.
- **Integrate Before Verification**: Feature branches must be integrated into the main build before handing off to the Verification agent.
