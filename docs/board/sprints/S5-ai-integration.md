# Sprint 5 — Live AI explanations

**Status**: In progress  
**Budget**: 10.5 hours of tasks + 30 minutes contingency (630 minutes)  
**Contingency**: 30 minutes allocated.  
**Prerequisite**: A model provider and server-side credentials. If unavailable, keep guided mode operational and move to Sprint 6.  
**Goal**: Add useful AI without surrendering diagnostic control.

## Tasks
☐ **[S5-01](../issues/S5-01.md)**: Define the model contract — 60 min. Specify allowed inputs and structured outputs.; Done when the model proposes explanations and approved check IDs rather than arbitrary executable actions. Depends on: S3-06.
☐ **[S5-02](../issues/S5-02.md)**: Connect the server-side provider — 90 min. Add secret configuration and a minimal request adapter.; Done when no credentials reach the browser. Depends on: S5-01.
☐ **[S5-03](../issues/S5-03.md)**: Ground responses in case evidence — 120 min. Supply relevant observations and approved checks.; Done when generated conclusions identify supporting evidence and uncertainty. Depends on: S5-02.
☐ **[S5-04](../issues/S5-04.md)**: Validate outputs and fallback — 90 min. Handle invalid responses, timeouts, and unavailable providers.; Done when guided mode still completes the session. Depends on: S5-03.
☐ **[S5-05](../issues/S5-05.md)**: Add usage controls — 90 min. Limit request frequency, input size, and per-case usage; record latency and estimated cost.; Done when repeated clicks cannot create unlimited requests. Depends on: S5-02.
☐ **[S5-06](../issues/S5-06.md)**: Evaluate representative cases — 120 min. Check correct, incomplete, contradictory, and instruction-injection inputs.; Done when failures are recorded and unsafe suggestions are blocked. Depends on: S5-04, S5-05.
☐ **[S5-07](../issues/S5-07.md)**: Update product language — 60 min. Distinguish AI explanations, guided checks, and user measurements.; Done when users can identify what the system actually did. Depends on: S5-06.

## Acceptance gate
AI improves explanations, respects approved actions, and fails gracefully. Verified with 36/36 test cases passing in `tests/s5-ai-integration.test.ts`.

---
*Back to [Scrum Board](../BOARD.md)*

Acceptance gate has NOT passed. See the integration review in ../../coordination/TO-GEMINI.md; unit-test counts do not establish provider safety or durable limits.
