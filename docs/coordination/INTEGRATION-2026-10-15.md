# Integration evidence — October 15, 2026

Candidate: `codex/integration`, incorporating Gemini `90b6d5d` at merge `0becdd7`; recovery rehearsal commit `3480ee9`. Draft review: https://github.com/FuwadT/relay-tech-support/pull/2. These are local/simulated checks, not hosted acceptance or deployment.

## Automated checks

- `npm test`: 36 passing tests.
- `pnpm exec tsc --noEmit`: passes.
- `npm run build`: passes, including customer/auth/case/AI routes.
- `node tests/runtime.mjs` with `RELAY_TEST_URL=http://127.0.0.1:8789`: 35 HTTP assertions pass for slowdown and connectivity, including intake denial, cross-owner denial, persisted answers, before/after measurements, historical snapshot, reported resolution/reopen and deletion. All fixtures removed.
- `node tests/runtime-access.mjs` with the same URL and `RELAY_TEST_SUPPORT_EMAIL=operator@example.invalid`: 27 HTTP assertions plus payload checks pass. Worker was explicitly started with `--var RELAY_SUPPORT_EMAILS:operator@example.invalid`. Includes two customer identities and a configured support identity, queue denial, notes redaction, denial of support deletion, and preservation of customer outcome timestamp. All API fixtures removed.
- `node scripts/verify-recovery.mjs`: migrations 0000–0003, metadata chain/columns, synthetic backup content, integrity, owner index and deletion behavior pass.
- GitHub run `38735418267`: passes the earlier integration CI configuration. The next CI change adds both workflow and configured-support runtime coverage; its result must be checked separately.
- GitHub run `38736047260` on `24cb148`: passes both runtime suites (62 HTTP assertions), configured support grant, recovery rehearsal, 36 unit tests, TypeScript and build.

## Browser checks

Built Worker on port 8789; `node tests/local-browser-preview.mjs` provides a loopback-only synthetic customer preview on 8790. The proxy belongs to test infrastructure and does not change deployable authentication. Its identity is generated per process. It rejects other Host/Origin values and discards browser identity/role cookies/headers.

- Personal Windows 11 eligibility: selecting macOS disables saving, explains support boundaries, and retains entered form values.
- Slowdown journey: four answers including “not tried”; baseline app launch 20 seconds and follow-up 12 seconds; notes and user-reported resolved status. After reload and reopening, all four answers, measurements, comparison and status persist.
- Connectivity journey: four answers including “unknown”; notes and “Needs a technician” status. Reopened after reload with outcome and notes preserved. Answer/next/save controls were activated with keyboard Enter during this journey.
- At 390×844: intake and case detail document width 375px, history width 390px; no horizontal page overflow observed. Visual check showed usable answer buttons and measurement fields. Viewport override reset afterward.
- Interrupted notes save: stopped only the owned local Worker; browser showed an error, retained draft text and allowed retry. Restarted Worker; retry displayed “Notes saved.” No false success was shown while offline. This does not establish duplicate-create protection after ambiguous network failures.
- Retried notes persisted after reload/reopening. Customer JSON export was downloaded and parsed: escalated outcome and saved notes match; internalNotes and userId are absent.
- Deletion confirmation was opened and cancelled without deleting data. It falsely promises no backup will retain the record, contradicting the demonstrated backup behavior. Opening the inline confirmation removes the trigger and leaves keyboard focus on the body rather than moving it to Keep case. Gemini owns the correction; S6-02 remains in progress.

Two synthetic browser cases remain only in the isolated local D1 database. No real device data or customer records were used. Full keyboard navigation, contrast, modal focus management and desktop/mobile regression across all support screens remain unverified.

## Confirmed blockers

Live AI is not accepted. Source review found arbitrary unsafe prose accepted by the response normalizer, unsupported fallback causes, nonpersistent usage limits, misleading fallback labels and a possible concurrent snapshot overwrite. A POST with malformed JSON (`{`) to `/api/cases/missing/ai-explain` returned HTTP 500 with an empty body; validation currently runs outside the endpoint's error handler. Gemini has reproduction and corrective actions in TO-GEMINI.md.

Hosted sign-in/session expiry, trusted-header stripping, two-user isolation and D1 restore are still required. Assignment policy documentation is contradictory. Older backups retain later-deleted data; deletion replay is not implemented. Keep the review draft and preserve owner-private hosting.
