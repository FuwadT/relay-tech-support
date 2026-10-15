# Relay enterprise scope — approved October 15, 2026

This replaces the original eight-week feature schedule. Existing sprint evidence remains historical; a passing build is not a release or hosted acceptance. The current owner-only Sites demo remains unchanged. The new product has a separate Cloudflare deployment/database using React/Vinext, Workers, D1 and private R2 objects; no implicit copying of existing cases.

## User decisions
- Full platform for a multi-organization helpdesk pilot; requester, technician and organization-administrator roles.
- Entra ID and Google Workspace sign-in. Explicit memberships, never email-domain role grants. Existing Sites authentication stays authoritative only for the existing Sites deployment.
- Conversational support, zero-install guidance, cross-platform bounded collection, evidence-based analysis, offline HTML reports and reviewed user-run scripts. No resident execution agent or server claim of device execution.
- Windows 11; macOS15/26 Apple Silicon and Ubuntu22.04/24.04 x64 require native evidence before being labeled supported. Untested combinations get manual guidance and no remediation.
- Only reversible, non-elevated catalog actions. No force-kill, privileged service changes, destructive cleanup, registry edits or escalation of privileges. Scripts show consequences, preconditions, rollback and follow-up. A user execution report does not independently verify repair.
- Organization-owned OpenAI/Anthropic/Gemini API credentials. Per-organization provider selection, explicit budgets, durable usage reservations, no silent provider fallback. Keep live calls disabled until configured and evaluated.
- Both integration directions: models inside Relay; authenticated Relay tools inside ChatGPT, Claude, Gemini and Copilot Studio/Teams. Vendor-specific client acceptance required.
- ServiceNow ITSM, Jira Service Management Cloud and Freshservice connectors. These are the selected vendors, not an asserted market-share ranking. Technician-approved writes, linked external state, idempotent outbox; internal notes/raw telemetry never automatically exported.
- Minimized telemetry: preview before upload; bounded process summaries and redacted event excerpts; no full logs/credentials/environment variables/process command lines. Raw readings/excerpts expire after30days, including embedded copies in reports. Backup expiry/deletion replay are launch gates.

## Milestones and acceptance
1. Baseline/contracts: review PR8; inventory Gemini04f30ea, quarantine unsafe prototype endpoints; agree contracts and ownership. Existing private demo preserved.
2. Enterprise foundation: isolated schema, verified enterprise sessions, explicit memberships/roles, tenant-scoped cases/audit. Tests deny cross-organization read/write/export and role escalation. Hosted enterprise SSO is a separate gate.
3. Conversation: saved messages, progressive device/authorization intake, zero-install guidance and evidence-linked investigation cards; honest save/retry states.
4. Collectors: reviewed versioned templates, source/checksum and download-inspect-run instructions. No pipe-to-shell default. CPU measured across an interval; partial failures remain unknown. Manual JSON upload; optional upload credential is short-lived/case-bound/revocable, hashed at rest, payload bounded and replay protected. Local-output staging may write an explicitly disclosed temporary output file; collection must not modify system configuration or claim an OS sandbox.
5. Analysis/reports: validated schema, observations vs hypotheses vs outcomes, evidence IDs, immutable versioned provenance, HTML escaping and sandboxed offline preview. No sample fallback for missing real input.
6. AI: separate provider adapters, credential encryption/rotation, durable caps, timeout and structured-output validation. Failure keeps deterministic guidance usable; no arbitrary model-generated commands.
7. Remediation: versioned low-risk catalog per OS, explicit local execution, separate reported execution and follow-up comparison; resolution never inferred from API success.
8. Integrations: organization-scoped assistant tools/OAuth and the three ticketing connectors, least privilege, revoked-token tests, outbox retry/deduplication. Remote tools cannot execute shell actions.
9. Pilot: real two-organization identities, native OS evidence, vendor sandboxes, accessibility, purge/recovery and staffed incident rehearsal; approved deployment and hosted regression.

## Implementation contracts and workflow
New enterprise APIs use /api/v2, separate from existing APIs. Separate enterprise schema/migration lineage; never rewrite drizzle0000–0004. Tenant identity comes from active membership joined to a verified server session; path organization IDs select context but never authorize it. Requesters see their own records, technicians/admins organization records. Staff-only fields stay out of requester DTOs, reports and connector payloads.

Persist organizations, verified external identities, memberships, hashed opaque sessions, cases, audit events, messages, collection sessions, immutable snapshots/findings, artifacts, remediation proposals/outcomes, provider connections/usage and external-ticket outbox as bounded milestones. Every query includes an organization predicate; role and actor constraints are server-derived. Errors do not masquerade as successful persistence.

Tests include missing/forged/expired auth, two-tenant isolation, revoked memberships, spoofed organization IDs, missing/invalid telemetry, impossible readings, unsafe model outputs, hostile log/HTML content, duplicate/lost responses, per-tenant caps, remediation prerequisites/rollback, ticket duplication, offline HTML, mobile/keyboard flows and purge/restore deletion replay. Mocks are not hosted/native/vendor acceptance.

## Ownership
Codex: architecture, shared contracts/schema/migrations/authentication, integration/security verification and publishing. Gemini: conversation interface, investigation cards, report presentation and provider adapters after shared contracts. Delegate collectors and connectors only after contract checkpoint. Separate worktrees/branches, explicit scopes and small commits; no overlapping shared-file edits. Gemini owns TO-CODEX.md; Codex owns TO-GEMINI.md. Every handoff records commits, exact checks, migrations and gaps.

No paid services, secret purchases, external invitations or customer-data migration are implied. Account setup, actual vendor credentials and native machines may gate live acceptance; continue local implementation while clearly recording missing evidence.
