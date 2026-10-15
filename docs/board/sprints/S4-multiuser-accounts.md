# Sprint 4 — Customer accounts and support operations

**Status**: Not started  
**Budget**: Approximately 11 hours (660 minutes)  
**Goal**: Move beyond the single-owner prototype safely.

## Tasks
☐ **[S4-01](../issues/S4-01.md)**: Design customer/support roles — 60 min. Define who may read, update, export, and delete a case.; Done when the permissions matrix includes denied operations. Depends on: S2-08.
☐ **[S4-02](../issues/S4-02.md)**: Implement customer identity — 120 min. Extend the existing platform sign-in to the intended customer access model; retain owner-scoped server checks.; Done when sign-in, sign-out, and session expiry have clear behavior. Depends on: S4-01.
☐ **[S4-03](../issues/S4-03.md)**: Enforce server authorization — 120 min. Review the existing owner-scoped APIs and extend authorization for support roles using verified identity.; Done when one customer’s case ID cannot expose another customer’s data. Depends on: S4-02.
☐ **[S4-04](../issues/S4-04.md)**: Build the support queue — 90 min. Add authorized review, assignment, and case status filters.; Done when customer accounts cannot open the support queue. Depends on: S4-03.
☐ **[S4-05](../issues/S4-05.md)**: Add review notes and history — 90 min. Separate customer-visible responses from internal notes.; Done when internal notes never appear in customer payloads. Depends on: S4-04.
☐ **[S4-06](../issues/S4-06.md)**: Add deletion and retention behavior — 90 min. Extend the existing case deletion operation with documented retention and lifecycle rules.; Done when the behavior matches the customer-facing description. Depends on: S4-03.
☐ **[S4-07](../issues/S4-07.md)**: Verify access boundaries — 90 min. Test two customer identities and one support identity.; Done when read, write, list, and export paths obey permissions. Depends on: S4-05, S4-06.

## Acceptance gate
Genuine multiuser isolation is verified before external customer use.

---
*Back to [Scrum Board](../BOARD.md)*
