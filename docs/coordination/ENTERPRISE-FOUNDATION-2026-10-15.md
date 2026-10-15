# Enterprise foundation checkpoint — October15

Approved scope: ../ENTERPRISE-PLAN.md. Branch codex/enterprise-foundation, based on reviewed guided checkpoint3d5fbe3/PR8 (CI38822188757 passed). Existing hosted version3 unchanged. No source from Gemini04f30ea imported.

## Implemented
- Separate /api/v2 organization-scoped case create/list/detail Worker, independent ENTERPRISE_DB and migration0001 under enterprise/migrations. Existing Sites bindings and drizzle0000–0004 unchanged.
- Hash-only opaque session lookup, active membership/org and requester/staff authorization. Sites/browser role headers cannot authenticate standalone enterprise requests. No login/session issuance route or fake persona exists in deployable code; OIDC remains disabled.
- Explicit consent/device authorization, bounded JSON, same-origin mutations, mandatory UUID retry key, transactional request reservation+case+audit and current membership guards. Normalized replay200, new201, conflict409 and deleted-original410. Safe error references exclude raw exception or case content.
- Versioned telemetry contracts and bounded parser: explicit source, nullable readings, nested allowlists, unit/range relationships and hostile-object tests. Structural validation does not prove collection authenticity or redact confidential text automatically.
- Independent security review of prototype04f30ea: unauthenticated read/write, fake execution/verification, unsafe HTML/script interpolation, fabricated telemetry/consent and incorrect units. Chat/report visual scaffolding may be reused after corrections. Do not deploy that checkpoint.

## Evidence
84/84 unit tests pass, including26 new enterprise tests; strict TypeScript passes. Cloudflare Wrangler deploy --dry-run bundles enterprise/worker.ts using enterprise/wrangler.jsonc successfully. SQLite fixtures execute the production repository SQL and transactional rollback, including failed audit writes, revoked/downgraded membership, cross-tenant denial and retry tombstones. Actual local workerd/D1 now passes55HTTP checks plus payload assertions: concurrent identical creates, requester/org isolation, authentication/origin rejections followed by successful requests, and case/audit write rollback. These are seeded local opaque sessions, not hosted SSO evidence. Repeat with node tests/enterprise-runtime.mjs; it owns port8802 and a fresh ignored database each run. Runtime caught unsupported compatibility_date2026-10-01; corrected to pinned workerd-supported2026-05-22 at2e4fdfd.

## Outstanding
E2-04/05 verified Entra/Google callback, invitations and session issuance are not implemented. No enterprise UI, production D1/R2 binding, provider call, device collector, retention job, ticket connector or enterprise deployment yet. Local Wrangler config has deliberately non-production database UUID and workers_dev:false. Production credential and identity setup must precede enabling customer access. Audit FK prevents case deletion until a separately reviewed retention/purge lifecycle is implemented. Mutation/read time is sampled immediately before repository calls, not at initial request parsing.

Next: actual local Worker/D1 rejection/retry/isolation tests; secure OIDC callbacks; Gemini UI/report/provider delivery against agreed contracts. Existing private demo stays available separately.

PR8 merged4dd57ef after exact-head CI38822188757 passed; no deployment implied. Enterprise source is stacked on that reviewed baseline. Maintained OIDC client dependency oauth4webapi3.8.8 pinned at4e13fb0; adapter and signature-negative fixtures are in isolated development. Next: single-use browser-bound OIDC transactions, verified callback/session issuance, real enterprise sign-in acceptance.
