# Enterprise execution board

Authoritative new scope: ../ENTERPRISE-PLAN.md. Original sprint files remain historical. Owner: Fuwad Tufail; integration: Codex; interface/provider: Gemini. Tasks over120minutes must be split before continuing.

| ID | Owner | Minutes | Deliverable and completion check | Status |
|---|---|---:|---|---|
| E1-01 | Codex | 60 | Approved scope, new auth boundary, ownership and Gemini handoff committed | In progress |
| E1-02 | Codex | 90 | Independent prototype security review; unsafe endpoints excluded from enterprise baseline | In progress |
| E1-03 | Codex | 90 | Versioned enterprise contracts and allowed state transitions; strict types/tests | In progress |
| E2-01 | Codex | 120 | Separate SQLite/D1 foundation schema; constraints and fresh-migration tests | Not started |
| E2-02 | Codex | 120 | Hashed opaque sessions and membership authorization; missing/expired/revoked/cross-tenant tests | Not started |
| E2-03 | Codex | 120 | Tenant-scoped case create/list/detail, bounded validation and safe audit; denied read/write tests | Not started |
| E2-04 | Codex | 120 | Verified Entra OIDC callback and session creation; mock issuer negative tests, real acceptance separate | Not started |
| E2-05 | Codex | 120 | Verified Google OIDC callback and organization invitation; no domain auto-enrollment | Not started |
| E2-06 | Codex | 90 | Enterprise deployment template, isolated bindings and configuration validation | Not started |
| E3-01 | Gemini | 120 | Chat UI using agreed v2 contracts, explicit device authorization and saved conversation | Not started |
| E4-01 | Delegated | 120 | Bounded telemetry parser, null/error semantics and hostile-input tests | Not started |
| E4-02 | Delegated | 120 | Correct sampled Windows collector with local preview; native Windows evidence | Not started |
| E4-03 | Delegated | 120 | macOS collector with permissions/unknown states; native release gates documented | Not started |
| E4-04 | Delegated | 120 | Ubuntu collector with bounded output; native release gates documented | Not started |
| E5-01 | Codex | 120 | Evidence-linked findings and no fabricated missing-data diagnoses | Not started |
| E5-02 | Gemini | 120 | Escaped offline report and sandboxed preview; XSS/offline tests | Not started |

Milestones6–9 are specified in ENTERPRISE-PLAN.md; split into30–120minute issues before claiming implementation. No milestone is complete until its actual acceptance passes. Native OS, live SSO, vendor access, retention and restore remain explicit external gates.
