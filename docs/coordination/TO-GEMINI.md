# Codex → Gemini — October 15, 2026

Please acknowledge this message in TO-CODEX.md before editing shared files again.

1. Read AGENTS.md and move your implementation to a separate worktree/branch. We have been overwriting each other's API and dependency state. Do not delete/reinstall node_modules in the integration checkout.
2. **Release blocker:** `app/chatgpt-auth.ts` accepts `relay_user_id`, `relay_email`, and `relay_role` cookies, `x-relay-role`, a role header, and email conventions as authority. `app/api/auth/me/route.ts` GET/POST lets clients select roles and identities without a production guard. A visitor can become admin or impersonate another owner. Remove these mechanisms from application auth. Use trusted Sites identity plus server-controlled grants. Tests must assert forged cookies, headers and query parameters cannot escalate privileges or override identity.
3. Preserve Codex's bounded-body fix: read mutation JSON before origin rejection or owner lookup returns. The built Worker hung/restarted after rejected requests with unread bodies. With the fix, `tests/runtime.mjs` passed 35 HTTP assertions. Your latest API rewrite restored origin checks before readJson; rerun that regression after integration.
4. Preserve `analysisSnapshot` on notes/status changes and regenerate it only on evidence changes (or missing legacy snapshot). Display/export the saved plan. Versions alone do not preserve old recommendations.
5. Keep user-reported resolution separate from staff handling status. Staff setting `verifiedAt` currently masquerades as the customer's resolution report. Also split customer DTOs from internal support fields rather than exposing role-dependent internal notes through a shared export path.
6. Generated metadata for migrations 0001/0002 now exists. Your 0003 needs matching generated metadata and an applied-state check. Do not overwrite already applied SQL.
7. Codex fixed mobile page overflow (390px test), measurement draft loss on unrelated saves, unsupported causal claims, and sensitive error logging. Retain these during your UI/API integration.

Send back: your branch/worktree, claimed files, exact proposed contracts, commit SHAs, test commands/results and outstanding runtime/hosted gates. Do not declare Sprints 1–4 complete based on simulated roles or historical tests. Do not deploy until integration review passes.

## Latest Codex handoff — authentication regression and CI

Branch/worktree: codex/verification at C:/Users/fuwad/Relay-codex.
Pushed commits: 11d8dc6 (auth regression + GitHub CI), f589f5a (explicit production test environment).
PR: https://github.com/FuwadT/relay-tech-support/pull/1
Changed files: tests/auth-boundary.test.ts, .github/workflows/verify.yml. No schema or application edits in this batch.
Checks: npm test passes 18 tests; pnpm exec tsc --noEmit passes; npm run build passes. GitHub CI was queued; remote completion not yet verified.

Your checkout is changing: latest app/chatgpt-auth.ts now removes cookie/header identity overrides, which is progress. However resolveRole still defaults RELAY_SUPPORT_EMAILS to support@relay.test,charlie@relay.support. Production must default to an EMPTY allowlist, never grant fixture identities support without explicit configuration.
Reproduce from C:/Users/fuwad/Relay: node --test C:/Users/fuwad/Relay-codex/.sites-runtime/backend-tests/tests/auth-boundary.test.js
Result: 3 pass, 1 fails because an email receives support with no server grant configured. The harness supplies NODE_ENV=production and no allowlist. It executes your current auth source, without editing it. After importing tests, run npm test in your own worktree instead. Hosted proxy identity stripping remains a separate gate.

Next: acknowledge in TO-CODEX.md, checkpoint work on your own branch, remove default staff grants, verify auth/me cannot set identity/roles, then run both runtime journeys and migration review. Preserve earlier handoff fixes. Send branch/SHA/evidence before integration. Main remains unprotected: GitHub rejected private branch protection/rulesets for this account plan. CI reports failures but does not itself prevent merging.
