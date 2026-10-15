# Customer and support permissions — S4-01

Design completed October 14, 2026. This is the target policy, not a claim that support access is implemented. The current hosted audience remains owner-only.

Identity comes exclusively from the Sites authenticated user ID. Email is display data, never a role grant. A server-controlled role grant will identify support users; no browser field, header supplied directly by a visitor, case status, or email domain can grant support access. Missing grants default to customer. Missing identity returns 401.

| Operation | Customer, own case | Customer, another case | Support |
|---|---|---|---|
| Create a case | Allowed with eligibility and consent | Cannot choose another owner | Create own case only |
| List/read customer case content | Allowed | Denied (404) | Queue summaries; full content only after assignment |
| Edit observations, measurements and reported resolution | Allowed | Denied (404) | Denied; add a response instead |
| Export customer-visible case | Allowed | Denied (404) | Assigned case only, excludes internal notes |
| Delete case and linked notes/history | Allowed | Denied (404) | Denied |
| Open support queue | Denied (403) | Denied (403) | Allowed |
| Claim unassigned work | Denied (403) | Denied (403) | Allowed atomically; reject competing claim |
| Change support handling status | Denied (403) | Denied (403) | Assigned support user only |
| Add customer-visible response | Denied (403) | Denied (403) | Assigned support user only |
| Read/write internal notes | Denied; never in customer payload | Denied | Assigned support user only |
| Grant/revoke roles | Denied | Denied | Denied in application; deployment operator only |

Customer-reported resolution is independent from support handling status. Assignment must not transfer ownership. A support user retains normal customer rights to their own cases but does not gain customer rights to other cases.

## Support Access Decision & Scope Alignment (S4 / S5 Implementation)

- **Triage and Queue Discovery**: Support operators require queue visibility (`GET /api/cases?scope=queue`) to monitor incoming unassigned cases, filter by status/category, and triage urgent issues. Operators can inspect unassigned cases to determine the proper tier and assign a technician (`assignedTo`).
- **Internal Notes Confidentiality**: `internalNotes` are reserved exclusively for staff records. Server-side DTO filtering (`publicCase`) completely strips `internalNotes` from customer payloads, and client export functions (`exportCase`) explicitly omit `internalNotes` from JSON downloads.
- **Permanent Purge Barrier**: Support operators are prohibited from deleting customer cases (enforced via 403 Forbidden). Case deletion is strictly reserved for the case owner (customer hard-purge) and system administrators.
- **Resolution Decoupling**: Staff changing case status to `resolved` or `closed` does NOT touch `verifiedAt`. `verifiedAt` remains strictly reserved for customer confirmation.

- Keep `/api/cases` owner-scoped. Use separate `/api/support` endpoints, server queries, and payload types. Explicit allowlists prevent internal notes from reaching customer list/detail/export responses.
- Query authorization with the row, including assignment, rather than trusting a prior UI check. Recheck every request; revoked grants and expired sessions take effect on the next request.
- All mutations require same-origin validation and bounded payload validation. Customers cannot send role, owner, assignment, internal note or verification fields.
- Verify with customer A, customer B, and support S: list/read/update/delete/export denied across customer owners; support queue denied to A/B; unassigned detail denied to S; assigned response allowed; internal notes absent from every customer response. Add anonymous, revoked-role, invalid-ID and competing-assignment cases.
- Sign-out uses platform sign-out. Session expiry preserves unsaved input in the current screen and provides a sign-in link; it must never report a successful save.

## Retention proposal for S4-06

Owner deletion removes the case plus linked response, internal-note and assignment records in one transaction. No hidden soft-delete copy should be introduced without explaining it to customers. Database backups may retain deleted content until backup expiry; actual retention duration and restore procedures must be established and published before customer access. Restores must reapply deletion records or otherwise prevent erased cases from reappearing. Until that mechanism is demonstrated, do not promise immediate erasure from backups.

## Release gate

Implementation and three-identity tests remain required. Customer invitations, real support commitments and public access stay disabled until S4-07 and the relevant operational checks pass.
