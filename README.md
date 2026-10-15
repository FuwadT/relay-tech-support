# Relay — guided support candidate

Relay helps a signed-in owner record a personal Windows 11 slowdown or home-connectivity problem, follow four guided checks, and save observations and outcomes. This is a private development candidate, not an external customer release.

## Supported capabilities

- Personal Windows 11 intake, storage consent and unsupported-device handling.
- Four manual checks per category, deterministic recommendations and saved answers including unknown/not-tried options.
- Case history, notes, status, customer-reported resolution/escalation, JSON export and owner deletion.
- Optional self-reported baseline/follow-up measurements, comparisons and saved diagnostic provenance.
- Server validation, owner-scoped D1 persistence and platform identity. Support queue code requires an explicit server-side support grant; no test staff identities are granted by default. Customer access and staffed service operations are not enabled on the hosted prototype.

This candidate has no live model adapter, AI explanation endpoint or AI assessment screen. AI work and its safety regressions remain separately under review on codex/integration (draft PR #2). Relay does not scan devices, run repairs, collect passwords, execute commands or verify a repair. verifiedAt records the customer's report; a staff handling status alone does not establish customer resolution. Escalation records a next step and does not contact a technician.

## Local development

Use Node 24 and the packageManager-pinned pnpm 11.25.0 with the checked-in lockfile. On Windows use npm.cmd/pnpm.cmd when PowerShell blocks script shims. Each worktree owns its dependencies, generated output and local database.

```text
pnpm install --frozen-lockfile
npm test
pnpm exec tsc --noEmit
npm run build
```

Sites skill helpers remain the supported hosting workflow. The existing .openai/hosting.json binds D1 as DB. Do not edit applied migrations or publish from an unreviewed checkout.

For a fresh local D1 database, apply drizzle/*.sql in filename order using the built Worker config; for an existing database apply only migrations confirmed pending. See docs/RECOVERY.md. Start the built Worker with npm start -- --port 8789, then set RELAY_TEST_URL=http://127.0.0.1:8789 and run node tests/runtime.mjs. See docs/coordination/ACCESS-VERIFICATION.md for explicitly configured support checks and their limitations. npm run dev serves the development app separately.

## Verification and release limits

The guided-only source passes 34 tests and strict TypeScript. Current candidate build, runtime and browser evidence is recorded in docs/coordination/STATUS.md as it completes. Earlier integrated source passed both browser journeys, 66 local HTTP assertions and a disposable SQLite recovery rehearsal; those results are tied to their recorded commits.

Hosted sign-in/session behavior, trusted-header stripping, two real customer identities and deployment-specific D1 restore remain release gates. Local identity fixtures do not verify hosted authentication. Existing backups may retain older records after active-database deletion; backup expiry and deletion replay are not configured. Do not promise erasure from every backup.

Case lists show at most 200 records. Pagination, atomic multi-device edits, durable create idempotency, production request budgets, full accessibility review and production recovery remain unfinished. Uploads, payments, remote control and broader device support are outside this candidate. The currently hosted owner-private Site is an older release; no deployment is implied by a GitHub commit.
