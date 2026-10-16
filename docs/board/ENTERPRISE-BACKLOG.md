# Enterprise execution board

Authoritative new scope: ../ENTERPRISE-PLAN.md. Original sprint files remain historical. Owner: Fuwad Tufail; integration: Codex; interface/provider: Gemini. Tasks over120minutes must be split before continuing.

| ID | Owner | Minutes | Deliverable and completion check | Status |
|---|---|---:|---|---|
| E1-01 | Codex | 60 | Approved scope, new auth boundary, ownership and Gemini handoff committed | Complete:6d7228b |
| E1-02 | Codex | 90 | Independent prototype security review; unsafe endpoints excluded from enterprise baseline | Complete:1524fa7 |
| E1-03 | Codex | 90 | Versioned enterprise contracts and allowed state transitions; strict types/tests | In progress |
| E2-01 | Codex | 120 | Separate SQLite/D1 foundation schema; constraints and fresh-migration tests | Complete:98ac1a5 + local D1 runtime |
| E2-02 | Codex | 120 | Hashed opaque session lookup and membership authorization; missing/expired/revoked/cross-tenant tests | Complete:1524fa7 + local D1 runtime; issuance separate |
| E2-03 | Codex | 120 | Tenant-scoped case create/list/detail, bounded validation and safe audit; denied read/write tests | Complete:1524fa7 +55 local D1 checks |
| E2-04a | Codex agent | 120 | Entra/Google provider adapter, pinned issuer/RS256/PKCE/state/nonce; signed negative fixtures | Complete:d0b3ce8 + coordinator azp correction |
| E2-04b | Codex | 120 | Expiring encrypted browser-bound login transactions; atomic one-time consumption and replay tests | Complete locally: ccbbd34; 10 SQLite security tests; hosted acceptance separate |
| E2-04c | Codex | 120 | Entra callback/session issuance for active pre-provisioned issuer/subject memberships; no domain grants | Complete locally: a142d20 + signed-provider/SQLite fixtures; real tenant acceptance pending |
| E2-05a | Codex | 120 | Google callback/session issuance using same verified transaction boundary | Complete locally: a142d20 + signed-provider/SQLite fixtures; real Workspace acceptance pending |
| E2-05b | Codex | 120 | Organization invitation/admin provisioning without role escalation or domain auto-enrollment | Not started |
| E2-05c | Codex | 60 | Same-origin logout, session revocation and expiry UX | Server complete: atomic cancellation, rotation, 19 HTTPS runtime checks; UI still pending |
| E2-06 | Codex | 90 | Enterprise deployment template, isolated bindings and configuration validation | In progress: local template/runtime passes; production binding absent |
| E3-01a | Gemini | 90 | Chat preview and explicit authorization with honest unsaved/provider labels | In progress: preview source exists; misleading persisted/executed claims need correction |
| E3-01b | Gemini | 120 | Connect chat to authenticated v2 case create/read; reload and recoverable failure | Not implemented: current case is client state only |
| E3-01c | Codex | 120 | Tenant/owner-scoped message persistence and bounded server validation | Not started |
| E3-01d | Gemini | 90 | Restore saved conversation, preserve retries and sign-in/expiry UX | Depends on E3-01b/c and authenticated UI |
| E4-01 | Codex agent | 120 | Bounded telemetry parser, null/error semantics and hostile-input tests | Complete:ef21129 +8focused tests |
| E4-02 | Codex agent | 120 | Correct sampled Windows collector with local preview; native Windows evidence | Partial: sampled process CPU/tests delivered; machine CPU/network unavailable; new transport changes unreviewed |
| E4-03 | Gemini | 120 | macOS collector with permissions/unknown states; native release gates documented | Source delivered 006d1c8; native macOS15/26 evidence pending |
| E4-04 | Gemini | 120 | Ubuntu collector with bounded output; native release gates documented | Source delivered 9100e10; version-specific native evidence needs independent verification |
| E4-05 | Codex | 120 | Authenticated v2 telemetry ingestion, immutable source/version provenance; reject cross-owner/tenant uploads | Not started; uncommitted legacy callback echo is not persistence |
| E4-06 | Gemini | 90 | Immutable collector downloads and preview-before-upload; hostile URL values cannot become executable source | Correction required in current uncommitted routes/collectors |
| E5-01 | Codex agent | 120 | Evidence-linked findings and no fabricated missing-data diagnoses | Complete:e0712d2 +6tests; not an ingestion endpoint |
| E5-02 | Gemini | 120 | Escaped offline report and sandboxed preview; XSS/offline tests | Partial: escaping tests; remove customer staff-note input and unsupported provenance/retention claims |
| E5-03 | Codex | 120 | Private artifact storage/access and immutable report provenance; owner/tenant export denials | Not started |
| E6-01a | Gemini | 120 | Bounded real OpenAI adapter with structured evidence output and guided fallback | Prototype only: no provider fetch currently occurs |
| E6-01b | Gemini | 120 | Bounded real Anthropic/Gemini adapters and vendor-specific request/response fixtures | Prototype only: no provider fetch currently occurs |
| E6-02 | Codex | 120 | Encrypted organization provider credentials, rotation and authorized configuration | Not started |
| E6-03 | Codex | 120 | Durable organization/case usage reservations and cost caps under concurrent retries | Not started |
| E6-04 | Codex | 120 | Evaluate ambiguous/injected evidence, unsafe prose and provider failure paths | Blocked on real adapters/grounded output contract |
| E7-01 | Codex/Gemini | 120 | Reviewed non-elevated reversible remediation catalog (Win/macOS/Ubuntu) | Correction in progress: invalid process targets and irreversible actions found; native acceptance pending |
| E7-02 | Codex | 120 | Persist explicit user execution report separately from follow-up evidence and resolution | Not started |
| E8-01a | Codex | 120 | Authenticated assistant scopes, requester ownership, revocation and missing-data denials | Prototype only: same-organization requester isolation missing |
| E8-01b | Gemini | 120 | External client interoperability for ChatGPT/Claude/Gemini/Copilot Studio/Teams | Schema formatters exist; real client acceptance pending |
| E8-02a | Codex | 120 | Durable ticket outbox, server-recorded technician approval and retry deduplication | Not started: current in-memory dispatch fabricates ticket IDs |
| E8-02b | Gemini | 120 | ServiceNow adapter with receipt validation and ambiguous failure reconciliation | Not implemented; sandbox acceptance pending |
| E8-02c | Gemini | 120 | Jira Service Management adapter with receipt validation and retries | Not implemented; sandbox acceptance pending |
| E8-02d | Gemini | 120 | Freshservice adapter with receipt validation and retries | Not implemented; sandbox acceptance pending |
| E9-01 | Codex | 120 | Thirty-day telemetry/report excerpt purge, deletion and backup replay verification | Not started; a retention notice is not implemented deletion |
| E9-02 | Codex | 120 | Separate production configuration and hosted two-organization SSO/access regression | Pending real enterprise configuration/identities |
| E9-03 | Gemini | 120 | Accessible mobile/keyboard investigation flow with interrupted-work recovery | Pending authenticated complete workflow |
| E9-04 | Codex | 120 | Recovery rehearsal, operating guide, release evidence and controlled pilot smoke check | Pending enabled-capability gates |

October16 reconciliation: previous Complete labels for Milestones3 and6–8 exceeded the evidence. See ../coordination/DELIVERY-REVIEW-2026-10-16.md. Unit fixtures, simulated IDs and format exporters do not establish persisted workflows, authenticated integrations or vendor acceptance. Completed local foundation work remains valid; the new implementation runs on codex/enterprise-login-lifecycle. No enterprise deployment or new hosted acceptance is claimed.

The owner-private guided demo remains available. An enterprise pilot date cannot be estimated reliably until the authenticated conversation and real telemetry round trip pass; the remaining board includes substantial implementation, not only account configuration. Continue in coherent batches and split any task that exceeds120minutes.
