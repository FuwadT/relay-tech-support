# Guided client integration verification — October 15, 2026

Branch: codex/guided-client-integration. Reviewed application checkpoint: 3016798. No API, schema, migration, authentication or package input changes in this client integration. Existing migration0004 remains unchanged.

## Changes and evidence

- Owner-scoped validated session drafts preserve both UUID and immutable submitted payload. Corrupt uncertain attempts block new saves until explicit discard; storage failures explain the limitation. Identity refresh clears the previous workspace before fetching another owner's records.
- Local browser proxy deliberately concealed a successful server201 behind502. Reload and Retry same save recovered one existing case, with no duplicate. Restored network category remained network. A separate stable actorA draft survived reload, disappeared for actorB, and returned for actorA. These are simulated local identities, not hosted authorization evidence.
- Four answers including unknown/not-tried persisted; metrics correctly showed4/4 answered and1/4 usable. Self-reported app launch20sec baseline and12sec follow-up, plus keyboard-entered notes, survived reload. Other metric denominators remained separate and missing values stayed unknown.
- Case-list failure injection produced unavailable/reload states and unknown counts instead of false empty/zero results. Metrics display retained-record scope,200record cap, UTC snapshot, synthetic-data disclaimer and unavailable future capabilities.
- Keyboard traversal reached intake, checks, measurement inputs, status, notes and deletion controls. Retry receives focus after an ambiguous failure and after restoration. Measurement labels include description/unit associations. Full screen-reader and support-role UI review remains open.
- Final built case-detail screen:106 sampled rendered text nodes,0 contrast findings; metrics80 nodes,0 findings. This DOM color screening excludes disabled text, opacity/image/pseudo-element effects and is not a WCAG certification.
- Metrics at390px fit the page width; further core-screen phone checks remain. An offscreen New case navigation control appeared in geometric screening and needs visibility-aware follow-up before claiming all mobile controls fit.

## Reproducible checks

npm.cmd test:58/58 passing. node node_modules/typescript/bin/tsc --noEmit:pass. npm.cmd run build:pass. node scripts/verify-recovery.mjs:pass for migrations0000–0004, backup integrity and deletion tombstones. Initial rebuild hit Windows EPERM because the owned Worker held dist open; stopping it resolved the build.

Local built Worker: npm.cmd start -- --port8789 --var RELAY_SUPPORT_EMAILS:operator@example.invalid (use separate --port 8789 arguments). RELAY_TEST_URL=http://127.0.0.1:8789 for runtime suites. runtime.mjs39HTTP plus payload assertions; runtime-access.mjs27HTTP plus payload assertions with RELAY_TEST_SUPPORT_EMAIL=operator@example.invalid; runtime-idempotency.mjs55HTTP/response checks plus concurrency assertions. Combined121 counted checks, with additional payload assertions. Earlier historical reports used123 under different counting; current script output is authoritative. Staff grant must be passed as a Worker --var; parent shell environment alone did not enable it. All final configured checks passed and synthetic API fixtures were removed.

## Release boundaries and next steps

Hosted version3 remains unchanged and owner-only. Local browser proof does not certify hosted identity/header handling. User has no second account; keep hosted two-user isolation explicitly unverified and do not widen access. AI UI remains absent and endpoint disabled; Gemini d269437 is received for separate review, not included. No live provider or payments.

Next: finish explicit-discard/mobile checks, review and merge the guided client PR after CI, then stage private version4 and verify the real owner session. Production D1 restore/deletion replay and broad customer release remain separate gates.

## Phone navigation follow-up
Independent review confirmed the390px navigation clipping defect. Corrected sidebar wrapping, automatic height and full-width wrapping navigation. Final built browser geometry at390px reports no out-of-viewport buttons/inputs/selects/textareas on overview, intake, history or case detail; Metrics screenshot refreshed. This closes that specific finding, not all responsive acceptance. Explicit discard/newattempt source review found no concrete blocker; dedicated browser scenario remains pending. Draft PR8: https://github.com/FuwadT/relay-tech-support/pull/8. Latest build passes after the CSS correction.
