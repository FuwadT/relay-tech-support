# Verification record and integration hold

Recorded October 15, 2026. Checks below were performed during the October 14–15 session. They apply to Codex's pre-Sprint-4 working tree, **not** the subsequently modified combined checkout.

## Reproduced results

- Native Windows pinned pnpm 11.25.0 install completed: 639 packages, frozen lockfile. The previous Bash installer failed on CRLF and Linux-only utilities. Commit 86e0167 adds a portable Node entrypoint while retaining managed Linux installation.
- `node node_modules/typescript/bin/tsc --noEmit`: passed before concurrent S4 changes.
- `npm.cmd test`: 20 tests passed after adding historical snapshot and unsupported-conclusion regressions. The later sensitive-log test still needs to be run against the final integration.
- Production build: passed via the Sites build helper using SITES_PNPM_BIN pointing to the installed pinned pnpm JavaScript entrypoint. The helper's default Windows command shim could not locate its executable; direct `npm.cmd run build` also passed.
- Applied local `0002_analysis_snapshot.sql` after inspecting table columns; 0000 and 0001 were already present. Generated Drizzle snapshot/journal metadata for 0001 and 0002. Hosted migration status was not changed.
- `node tests/runtime.mjs`: **35 HTTP assertions passed**, plus assertions on saved answers, measurements, snapshots, reported outcomes and owner isolation. Ran against the built Worker at 127.0.0.1:8787 with synthetic dispatch headers, not real hosted accounts. The script creates unique fixture owners and removes its cases.
- Local browser at 127.0.0.1:5173: created a synthetic slowdown case, saved an answer and 20-second baseline/12-second follow-up, marked user-reported resolution, reloaded, reopened, and observed the saved data and -8-second comparison.
- Phone-width inspection at 390×844 found page width 533px due to table/grid minimum widths. Added min-width:0 grid children and a wrapping mobile comparison table; page width subsequently measured 375px within the 390px viewport.
- Phone intake: macOS selection disabled saving and displayed supported-device guidance while preserving entered fields. Returning to Windows 11 enabled saving; a synthetic connectivity case and first answer were saved. The remaining browser journey was interrupted by concurrent source/dependency changes.

## Regressions fixed by Codex; preserve during integration

1. Rejected mutation bodies: a cross-origin POST followed by GET hung; a cross-owner PATCH followed by DELETE restarted the local built Worker. Reading bounded JSON before origin rejection/owner lookup resolved the sequence. The runtime suite passed afterward. Gemini's later route rewrite moved the origin check back before body reading; recheck this.
2. Provenance: case ruleVersion alone did not preserve recommendations. Added persisted analysisSnapshot, retained on status/notes changes, updated when evidence changes, used by display/export. Legacy records without snapshots are current-rule evaluations, not reconstructed history.
3. Unsupported diagnostics: normal resource/storage readings did not establish power/thermal/indexing problems; multiple affected devices plus Ethernet did not establish simultaneous upstream failure. Replaced both with uncertainty and repeatable evidence collection.
4. Measurement drafts: unrelated status/answer/note saves reset both measurement forms. Synchronize only the measurement phase actually saved.
5. Error logging: raw database errors can contain customer SQL parameters. Log an opaque request ID and safe event metadata; return the same reference to the client. Preserve this with the new S4 serializer.

## Outstanding release gates

- Resolve forged identity/role mechanisms identified in TO-GEMINI.md.
- Obtain Gemini acknowledgement and isolated branch before shared integration resumes.
- Rerun typecheck, unit/runtime tests, full browser journeys, desktop/phone and keyboard checks on the final integrated commit.
- Test real hosted identity and authorization separately. Synthetic local headers do not verify the Sites dispatch boundary.
- Verify historical snapshot behavior, export payload privacy, concurrent updates and interruption recovery.
- No deployment occurred in this session. The live Site cannot be assumed to contain these changes.

## Runtime reproduction

1. Install with pinned `pnpm.cmd run install:ci` (use process-local CI=true for unattended recreation of dependencies).
2. Build. Inspect local D1 columns before applying only pending migrations with Wrangler, using dist/server/wrangler.json and .wrangler/state.
3. Start the built Worker: `npm.cmd start -- --port 8787`.
4. Run `node tests/runtime.mjs`. It refuses non-loopback URLs, times requests out after 15 seconds and deletes only its own unique test cases.
5. Stop the owned server after verification. Keep separate worktree runtimes and ports.
