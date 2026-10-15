# S6-02 hosted accessibility review — October 15

Reviewer: Codex. Source: main `73e5715`; hosted private version 3 (application source from reviewed PR #4). Browser: existing signed-in owner's in-app browser session. No new cases, outcomes or measurements were saved during this review. This is focused browser evidence, not a screen-reader certification or full accessibility pass.

## Passed observations

- Keyboard Enter activates New case and My cases navigation.
- Empty Save & begin submission focuses the required title field and shows native validation. Title, device, description and consent have accessible labels and required validation messages.
- Typing in title then Tab moves to device; the next Tab moves to Operating system. Home/ArrowDown selection reaches macOS, shows the eligibility message and disables Save & begin. Resetting to Windows 11 restores eligibility. Unsaved QA intake was abandoned without creating a record.
- Category filter End selects Internet & Wi-Fi and leaves only the existing synthetic connectivity case. Enter opens that case; Enter on Next advances the checklist to check 2.
- Existing observations and notes remain visible. The four measurement controls expose labels; missing values stay unrecorded. Follow-up mode can be activated using Enter and changes the save button to Save follow-up.
- Earlier version-3 checks verified the skip link focuses MAIN, Keep case receives initial deletion-confirmation focus, and Escape restores Delete case. No deletion was performed.

## Findings and bounded proposed changes

### A11Y-01: Measurement mode selection has no programmatic selected state

Reproduce: open either category's case. Inspect the accessible baseline/follow-up buttons before and after Enter on Follow-up. Both have no aria-pressed, aria-selected or equivalent selected state; the active choice is expressed through the selected CSS class. The save-button text changes elsewhere, but that does not expose the current selector state.

Proposed fix owner: interface owner after protocol acknowledgement. Add `aria-pressed={activeMeasurementKind === 'baseline'}` and the matching followUp expression to the existing two buttons. Keep button semantics; do not add incomplete tab roles. Verify exactly one pressed button on load and after keyboard activation, and that measurement drafts remain separate. No API/schema change is required.

### A11Y-02: Measurement instructions and units are not associated with inputs

Reproduce: on the connectivity case, inspect Download speed, Upload speed, Ping latency and Wi-Fi signal strength. Each input has its label, but no aria-describedby. Its instruction paragraph and adjacent unit have no linked IDs. The same markup renders performance inputs. A user focusing only a field receives no programmatic association to the collection instructions or unit.

Proposed fix owner: interface owner after protocol acknowledgement. Give each instruction and unit a stable unique ID derived from the check's measurement ID; set the input's aria-describedby to both IDs. Retain visible unit text and existing label association. Verify ID uniqueness, referenced elements exist, correct category units, and descriptions survive mode changes. No stored-data change is required.

### A11Y-03: Several small rendered labels fail contrast screening

Read-only computed-style screening sampled 109 rendered text elements on the hosted connectivity detail and flagged 15 below the applicable text contrast threshold. Examples: Answers save automatically (9px, RGB157/156/155) approximately 2.74:1; 4 / 4 answered and Self-reported · Optional (11px, RGB146/145/144) approximately 3.15:1; collection instructions (11px, RGB122/117/110) approximately 4.34:1. These are ordinary small text, for which the screening threshold is 4.5:1. Disabled controls were not relied on as examples.

Method: read element text, computed foreground/font and ancestor background colors; alpha-composite backgrounds over white and compare relative luminance. This is screening, not a full conformance audit: image/pseudo-element backgrounds, effective ancestor opacity, input placeholders and all interaction states need separate review. Earlier sampled-text screening at a prior checkpoint was narrower and does not establish that all current labels pass.

Proposed fix owner: interface owner after protocol acknowledgement. Adjust the affected text tokens/selectors in app/globals.css, preserving the visual hierarchy while meeting 4.5:1 for small text against each actual background. Include the measurement instructions, progress/save labels, provenance text and account/sidebar labels. Recheck focus indicators and non-text controls separately; do not solve this by removing informative labels or reclassifying them as disabled.

### Follow-up review: step-change announcement

Enter on Next leaves focus on Next while the heading/instructions change. The new step heading is not a live region. This is an observation to test with an actual screen reader, not a confirmed announcement failure. Consider focusing a programmatically focusable step heading on explicit step navigation, without moving focus during autosave; verify keyboard order and scrolling before choosing a fix.

## Completion boundary

S6-02 remains in progress. Still needed: the three fixes above, complete keyboard journey including recoverable save errors, systematic contrast/focus-visible review, support screens when authorized, and actual screen-reader checks where available. Browser locator targeting and DOM inspection establish the observations above; they do not prove every control is reachable in sequential tab order.

The repository AGENTS protocol says: “Until Gemini acknowledges this protocol, Codex edits only coordination documents and isolated verification files.” No new acknowledgement exists in TO-CODEX.md at this checkpoint. Codex therefore recorded the fix proposals instead of modifying the shared application component. Gemini can acknowledge the existing protocol and release or assign interface scope, or deliver the focused fixes on its own isolated branch.
