# Enterprise login and review checkpoint — October 16, 2026

Implementation checkout: C:/Users/fuwad/Relay-codex-login, branch codex/enterprise-login-lifecycle. Started from main68266b6. Gemini subsequently committed7816209 and71ff3f8 and continued editing its checkout. Those newer application changes are not included in this checkpoint's evidence and must be integrated/retested separately.

## Implemented authentication

- ccbbd34: encrypted, ten-minute, browser/provider-bound login transactions, hashed state/browser tokens, atomic one-time consumption and bounded cleanup.
- 167aa23: atomic session issuance/linkage/rotation; logout cancels even consumed in-flight callbacks and revokes a just-created linked session. Terminal transactions erase encrypted nonce/PKCE material. Minimal linkage remains while its session is active.
- 8346d4f: independent route-level security fixtures.
- a142d20: Entra/Google start/callback, explicit pre-provisioned issuer/subject membership, opaque eight-hour sessions, active-membership profile and same-origin sign-out. Disabled unless configured. Fixed callback destination is the session API until authenticated UI integration.
- f93d264: native POSIX-only macOS shell checks explicitly skip on Windows; no false native acceptance claim.

Migrations: independent enterprise0002_login_transactions.sql and0003_login_finalization.sql only. No applied migration was rewritten, no legacy drizzle migration was altered, and no production database was migrated.

## Evidence

- 10 transaction tests: encryption/AAD tampering, mismatch preservation, future/exact-expiry, concurrent replay, bounded cleanup, logout invalidation. Real SQLite queries through the D1-shaped test adapter.
- 10 finalization tests: both logout/callback orderings, concurrent issuance, identity/membership gating, session rotation, failure rollback and late response/link retention.
- 14 independent route tests plus7 signed-token adapter tests: both providers, origin/cookies, wrong/duplicate callbacks, failed exchange consumption, unknown identities, revocation, profile isolation, fixed redirects and safe errors. Provider transport is a fixture; no live identity provider request was made.
- `node tests/enterprise-auth-runtime.mjs`:19 actual HTTPS workerd/D1 checks. It applies all enterprise migrations to a unique disposable database and checks forged/expired/revoked sessions, active membership payloads, sign-out CSRF, linked-session cancellation and peer isolation. The test trusts a self-signed certificate only for its owned loopback socket. No global TLS bypass exists.
- `node tests/enterprise-runtime.mjs`:55 existing actual workerd/D1 HTTP checks pass, including concurrent keyed creates and rollback.
- Full suite after login:178 passed,2 explicit POSIX skips. After catalog rewrite and the first fallback regression:177 passed,2 skips (old catalog tests were replaced with stricter cases, so totals changed).
- Strict TypeScript, production build and disposable legacy recovery rehearsal pass. Recovery still identifies deletion replay for pre-deletion backups as a production gate.

## Independent delivery review and corrections

0ebcf05 records the concrete review in DELIVERY-REVIEW-2026-10-16.md. c2bf58b removes irreversible cleanup and makes unverified DNS/Unix termination actions unavailable. Windows close-request proposals require strict PID/name/start identity, evidence references and matching reviewed disclosures; rendering guards current owner/session/identity and reports requests truthfully. The native test parses PowerShell only; no remediation was executed and native repair/reversibility acceptance is not claimed.

The execution board now distinguishes prototypes from saved/authenticated/vendor-connected behavior. Gemini has the review and current ownership/handoff in TO-GEMINI.md. New shared Worker/contracts changes in Gemini's checkout overlap reserved ownership; keep delivery isolated until deliberate integration and fresh checks.

## Remaining gates

Real SSO registration and production secrets/bindings, explicit membership provisioning, sign-in UI/expiry handling, saved conversation, tenant-authorized telemetry ingestion, local preview/consent, model credentials and durable budgets, authenticated assistant transport, durable ticket outbox and real vendor receipts, native OS acceptance, retention/deletion and hosted recovery remain unfinished. No new deployment, audience expansion, live provider spend, ticket write or device remediation occurred in this checkpoint.

The existing owner-private guided demo URL remains https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site; its prior release does not demonstrate these new enterprise features.
