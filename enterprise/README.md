# Standalone enterprise foundation

Separate from the owner-private Sites demo. No deployed enterprise URL, real SSO session issuance, live model or device execution is enabled. Never use the legacy Sites database/bindings for this directory's migrations.

## Current API
- GET /health reports foundation stage and disabled capabilities.
- GET /api/v2/organizations/{organizationUuid}/cases lists up to200 authorized retained cases.
- POST the same path creates an authorized case; requires same configured Origin, application/json and UUID Idempotency-Key. Exact body: title(3–120), description(10–4000), platform(windows|macos|ubuntu), deviceAuthorization:true, storageConsent:true. No requester, role, status or organization fields are accepted in the body.
- GET /api/v2/organizations/{organizationUuid}/cases/{caseUuid} reads an authorized case.

New keyed writes201; identical normalized retry200, changed payload409; a retained key whose original record is unavailable410. Preserve both the UUID and exact submitted payload on uncertain failures. Case/request reservation/audit commit atomically. Errors never claim a successful save. No PATCH, delete, session creation, chat-message persistence, telemetry upload or report API yet.

Only a random opaque __Host-relay_session token resolves a stored, unexpired, non-revoked server session; only active explicit organization memberships authorize it. Browser identity/role headers, Sites identity headers and organization IDs do not establish identity. Login remains disabled until browser-bound one-time OIDC transactions and verified callbacks create sessions. No public/test-persona authentication route exists. Native test infrastructure seeds disposable local session rows and never deploys them.

## Local verification
Use the pinned package manager/lockfile, Node24 and this checkout's own dependencies:

```text
npm test
pnpm exec tsc --noEmit
node tests/enterprise-runtime.mjs
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js deploy --dry-run --config enterprise/wrangler.jsonc --outdir .sites-runtime/enterprise-build
```

The runtime test owns port8802 (override RELAY_ENTERPRISE_TEST_PORT) and a fresh ignored .sites-runtime database per run. It applies only enterprise/migrations/0001_foundation.sql, seeds synthetic sessions, checks real local workerd/D1, then stops its own process tree. It refuses an occupied port. Retained local state is synthetic and never committed. It does not verify hosted identity/provider behavior.

Local template uses workers_dev:false and an all-zero database ID. A real separate Cloudflare deployment, binding and approved HTTPS origin are required before production. Existing drizzle migrations must never be mixed into this lineage. Review backup, audit, reservation and deletion retention before implementing purge; audit foreign keys currently prevent deleting referenced cases.

## Data and outcomes
Telemetry uses version1 contracts in lib/enterprise/contracts.ts and a bounded parser. MB/GB mean decimal bytes/1e6 and bytes/1e9. Null means unknown, not zero. Structural validation neither proves collector authenticity nor certifies redaction. Do not store credentials, process command lines or complete event logs. Synthetic examples must stay explicitly labeled.

Findings are observations with evidence paths and possible explanations, not confirmed defects or proof of repair. The server cannot execute local fixes. The approved scope offers reviewed reversible non-elevated user-run scripts and separately records reported execution, follow-up comparisons and resolution.
