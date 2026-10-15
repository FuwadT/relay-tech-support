# Relay agent coordination

Read `docs/coordination/STATUS.md` and your inbox before editing. Gemini and Codex work on this repository together. User instructions take precedence.

## Isolation and ownership

- Do not run two agents in the same checkout. Keep this checkout as the integration workspace. Use separate Git worktrees and branches for implementation (`codex/<task>` and `gemini/<task>`). Never share node_modules, dist, .wrangler, .sites-runtime, or development server ports across worktrees.
- Until Gemini acknowledges this protocol, Codex edits only coordination documents and isolated verification files. Do not publish the moving integration checkout.
- Codex owns integration, verification evidence, diagnostics review, Windows tooling, and release decisions. Gemini owns Sprint 4 customer/support implementation on its own branch.
- Shared contracts, database schema, migrations, authentication, package inputs, and the backlog require an agreed change proposal in STATUS.md before overlapping edits. One owner at a time. Never regenerate or alter applied migrations.
- Claim a scope with `node scripts/coordination.mjs claim <scope> <agent>`. Release with the same owner when the handoff is committed. Scope names: integration, contracts, platform, interface, diagnostics, dependencies, verification. Locks are shared through Git's common directory across worktrees. They are advisory; never remove another agent's lock or automatically expire a lock. Ask the owner to release it.

## Handoffs and review

- Keep separate inbox files: Codex writes `docs/coordination/TO-GEMINI.md`; Gemini writes `docs/coordination/TO-CODEX.md`. Read your inbox at the start and before every commit. Acknowledge messages in your outgoing file.
- Handoff includes branch, commit SHA, changed files, exact checks, results, remaining gaps, and migrations. Clearly separate source review, unit tests, local simulated identities, hosted authenticated verification, and deployment.
- Commit small coherent batches using explicit paths. No `git add .`, blanket staging, force pushes, or automatic commits of another agent's unreviewed files. Never include credentials, local databases or test customer data.
- Only the integration owner merges or publishes. Before merging: review security boundaries, run relevant tests, check migration metadata and inspect the resulting diff. Before publishing: all enabled release gates must pass. An active Site does not prove the latest code is deployed.
- Do not mark a task complete because a mockup or build passed. Evidence must satisfy its completion check. Missing test scripts and old results are not reproducible current evidence.

## Non-negotiable auth boundary

The existing Sites deployment trusts only Sites-verified identity. The user-approved enterprise scope uses a separate Cloudflare deployment and database: verified Entra/Google OIDC identities establish opaque server-side sessions; validated active organization memberships determine roles. Never infer identity or roles from unverified cookies, query parameters, `x-relay-role`, email conventions, or role-switch endpoints. Do not accept Sites identity headers on the standalone enterprise Worker. Support grants must be server-controlled. Local test personas must be confined to test infrastructure and absent from deployable application code. Customer payloads and exports must exclude internal notes.

## Local workstation

Windows: prefer native Node/npm.cmd/pnpm.cmd, Git and Python. Use the pinned pnpm and lockfile. For memory-heavy parallel tasks begin with 8 workers; suitable CPU tasks may use up to 16. Avoid nested pools and global OMP/BLAS settings. Each worktree owns its dependencies and runtime processes. GPU use requires explicit library support.
