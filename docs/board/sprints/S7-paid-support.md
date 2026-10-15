# Sprint 7 — Paid assisted support

**Status**: Not started  
**Budget**: Approximately 10 hours (600 minutes)
**Prerequisite**: Payment provider access and test credentials.  
**Goal**: Charge for a clearly defined service without promising universal fixes.

## Tasks
☐ **[S7-01](../issues/S7-01.md)**: Define the paid offer — 60 min. Write included support, response expectations, exclusions, and refund terms.; Done when checkout and support operations agree. Depends on: S4-07.
☐ **[S7-02](../issues/S7-02.md)**: Build the upgrade flow — 90 min. Connect a case to a clear purchase option.; Done when price and service scope appear before payment. Depends on: S7-01.
☐ **[S7-03](../issues/S7-03.md)**: Integrate hosted checkout — 120 min. Use server-generated purchase references and test credentials.; Done when test payment reaches the expected return state. Depends on: S7-02.
☐ **[S7-04](../issues/S7-04.md)**: Verify payment events — 120 min. Authenticate provider events and handle retries idempotently.; Done when browser redirects alone cannot mark an order paid. Depends on: S7-03.
☐ **[S7-05](../issues/S7-05.md)**: Add support fulfillment tracking — 90 min. Link payment, assignment, handling time, and service outcome.; Done when a paid case cannot disappear from the queue. Depends on: S7-04, S4-04.
☐ **[S7-06](../issues/S7-06.md)**: Rehearse payment failures and refunds — 120 min. Exercise failed, canceled, duplicate, and refunded transactions.; Done when service status matches verified payment state. Depends on: S7-05.

## Acceptance gate
Payment and fulfillment work in test mode. Enable real charges only after production provider configuration and operational review.

---
*Back to [Scrum Board](../BOARD.md)*
