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
| E2-04b | Codex | 120 | Expiring encrypted browser-bound login transactions; atomic one-time consumption and replay tests | Not started |
| E2-04c | Codex | 120 | Entra callback/session issuance for active pre-provisioned issuer/subject memberships; no domain grants | Not started |
| E2-05a | Codex | 120 | Google callback/session issuance using same verified transaction boundary | Not started |
| E2-05b | Codex | 120 | Organization invitation/admin provisioning without role escalation or domain auto-enrollment | Not started |
| E2-05c | Codex | 60 | Same-origin logout, session revocation and expiry UX | Not started |
| E2-06 | Codex | 90 | Enterprise deployment template, isolated bindings and configuration validation | In progress: local template/runtime passes; production binding absent |
| E3-01 | Gemini | 120 | Chat UI using agreed v2 contracts, explicit device authorization and saved conversation | Complete:b36288d + tests |
| E4-01 | Codex agent | 120 | Bounded telemetry parser, null/error semantics and hostile-input tests | Complete:ef21129 +8focused tests |
| E4-02 | Codex agent | 120 | Correct sampled Windows collector with local preview; native Windows evidence | Complete:02eeaf9/7868952 + tests |
| E4-03 | Gemini | 120 | macOS collector with permissions/unknown states; native release gates documented | Complete:006d1c8 + tests |
| E4-04 | Gemini | 120 | Ubuntu collector with bounded output; native release gates documented | Complete:9100e10 + tests |
| E5-01 | Codex agent | 120 | Evidence-linked findings and no fabricated missing-data diagnoses | Complete:e0712d2 +6tests; not an ingestion endpoint |
| E5-02 | Gemini | 120 | Escaped offline report and sandboxed preview; XSS/offline tests | Complete:b36288d + tests |
| E6-01 | Gemini | 120 | AI provider adapters with allowlists, structured output validation, fallback | Complete:016d31a + tests |
| E7-01 | Gemini | 120 | Reviewed non-elevated reversible remediation catalog (Win/macOS/Ubuntu) | Complete:016d31a + tests |
| E8-01 | Gemini | 120 | Scoped assistant tools for ChatGPT, Claude, Gemini, Copilot Studio | Complete:c9cb6ca + tests |
| E8-02 | Gemini | 120 | Retryable outbox ticketing connectors for ServiceNow, Jira, Freshservice | Complete:c9cb6ca + tests |

Milestones 6–8 delivered and verified across 144 unit tests; remaining Milestone 9 pilot gates are hosted OIDC setup and live vendor sandbox acceptance. Native OS, live SSO, vendor access, retention and restore remain explicit external gates.
