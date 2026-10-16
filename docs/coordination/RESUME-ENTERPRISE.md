# Compact handoff — enterprise implementation

Read STATUS.md, current Gemini TO-CODEX.md in C:/Users/fuwad/Relay, and ../ENTERPRISE-PLAN.md before editing. User approved the full plan and said execute; continue implementation without re-asking settled scope decisions.

## Repository and ownership
Codex isolated checkout C:/Users/fuwad/Relay-codex, branch codex/enterprise-foundation, PR9 https://github.com/FuwadT/relay-tech-support/pull/9. Private repository FuwadT/relay-tech-support. Integration/contracts/platform/verification/dependencies scopes owned by codex; interface scope released to Gemini. Native Windows, pinned pnpm11.25.0/Node24, explicit staging only; own node_modules/build/runtime per worktree. No force pushes or applied migration changes.

Gemini owns C:/Users/fuwad/Relay, branch gemini/enterprise-chat-ui, based on canonical enterprise branch. Section6 acknowledges canonical contracts and retires alternate proposals; Gemini owns new conversational UI and escaped offline report presentation. Do not edit its source or TO-CODEX.md. Codex writes TO-GEMINI.md, commits, then copies that file and coordinator-owned STATUS/backlog/evidence into root for immediate handoff. Inbox history can differ across branches; inspect actual root before each commit. No other messaging channel to Gemini is established.

## Scope and implemented evidence
Multiple organization pilot, Entra+Google SSO, separate Cloudflare deployment, organization-owned OpenAI/Anthropic/Gemini credentials, assistant integrations both directions (Copilot Studio/Teams), ServiceNow/Jira/Freshservice, Windows11/macOS15+26 AppleSilicon/Ubuntu22.04+24.04x64. Only reversible non-elevated reviewed user-run actions. Minimized telemetry30days; no credentials/full logs/process command lines. No unattended execution or invented verification.

Existing owner-private Sites version3 remains deployed and unchanged: https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site. PR8 guided reliability merged4dd57ef after exact-head CI38822188757 passed; no newer deployment implied. Enterprise is not live and does not yet issue real sign-in sessions. Two real customer identities and hosted isolation remain unverified; user has no second ChatGPT account, do not ask again or widen audience.

Canonical new contracts lib/enterprise/contracts.ts; schema enterprise/migrations/0001_foundation.sql uses ENTERPRISE_DB, never legacy DB/drizzle lineage. Organizations/users/external identities/memberships/hash-only sessions/cases/atomic retry reservations/audit implemented. Worker supports GET /health and GET/POST /api/v2/organizations/{UUID}/cases plus GET detail. Same-origin JSON writes, mandatory UUID Idempotency-Key, new201/replay200/conflict409/tombstone410. Active membership/session rechecked in queries/transaction; opaque cookies never supply identity/roles. No test persona in app. No messages/upload/report/PATCH/delete APIs yet.

Telemetry bounded parser and conservative evidence analyzer integrated. Pure Entra/Google OIDC adapter integrated atd0b3ce8, oauth4webapi3.8.8 pinned. Explicit PKCE/state/nonce, RS256/JWKS, issuer/audience/azp/expiry validation, approved HTTPS hosts, bounded responses/timeouts. Returns issuer+subject only; no role inference or session issuance. Single-audience conflicting azp correction is included in coordinator source after review. Caller MUST persist expiring browser-bound transactions and atomically consume once before exchange; not implemented yet.

Current integration97unit tests and strictTS pass; guided build and recovery pass. Actual local workerd/D1 runtime55HTTP checks plus assertions passes: two tenants/requesters/staff, forged/revoked/expired auth, rejected body recovery, six concurrent identical saves, case/audit failure rollback. Dry-run alone missed compatibility date startup bug; fixed2026-05-22 (pinned workerdmaximum), native runtime now starts. CI runs enterprise-runtime alongside legacy checks; inspect exact latest-head CI before merge.

## Next concrete tasks
1. Integrate/review Windows collector delivery from /root/retry_verification, branch codex/enterprise-windows-collector: static PowerShell, sampled total/process CPU, no upload or writes, nullable unavailable readings, decimalMB/GB. Native fixtures must not print/commit machine/process data. Network/log collection initially unavailable, not fabricated. Parent board E4-02 stays in progress until actual evidence arrives.
2. E2-04b login transaction store: additive enterprise0002 (coordinate exclusive owner), encrypted PKCE/nonce transaction, state/browser-cookie binding, ten-minute expiry, atomic one-time consume before provider exchange; no signup/domain grants. Then E2-04c/05a callback/session issuance for existing verified issuer/subject identities and active explicit membership. Tests use signed mock provider tokens; real tenant/app credentials are later live gates.
3. Review Gemini UI/report separate commits against canonical contracts and honest persistence/provider capabilities. Do not import original04f30ea /api/ai endpoints: unauthenticated access, fake execution/consent, sample fallback, script/HTML injection and wrong CPU units were documented blockers.

Before pausing: commit explicit files, push, update Gemini/status and this handoff. No production deployment, key purchases, invitations or native elevated actions are authorized by this checkpoint.

## Verification commands
```text
npm.cmd test
node node_modules/typescript/bin/tsc --noEmit
node tests/enterprise-runtime.mjs
npm.cmd run build
node scripts/verify-recovery.mjs
gh pr checks 9
```
Runtime owns port8802/fresh ignored state and cleans its child tree. Stop owned guided Worker before rebuilding dist on Windows (EPERM otherwise). Prior guided Worker16115 stopped for build; browser proxy57579 may still run pointing at8789. Do not assume localhost5173 is Codex-owned. No enterprise UI screenshot exists yet; previous phone screenshot is guided metrics only.
