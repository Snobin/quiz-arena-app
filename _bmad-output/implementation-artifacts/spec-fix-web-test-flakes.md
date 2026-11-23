---
title: 'Fix: web test flakes from synchronous effect assertions'
type: 'bugfix'
created: '2026-11-24'
status: 'done'
baseline_commit: '1fe154f'
route: 'oneshot'
review_loop_iteration: 0
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The web test suite failed about one full run in two on a many-core machine and sometimes in CI (Epic 7 retro, F8 and F9), each failure costing a rerun.

**Approach:** Find the cause and fix it at the source in the tests, without retries.

</frozen-after-approval>

## Implementation Notes

Cause (measured, not assumed): assertions on `document.title` (set in a `useEffect` in `useDocumentTitle`) and on `document.activeElement` (focus set in effects) ran synchronously right after a `findBy*` resolved, so under load they raced the passive effects. The retro's first guess, a fixed fixture date, was wrong (an experiment with `SERVER_TIME` set to today still failed). Evidence: 1 failure in about 2 full runs on 18 cores, 0 in a run with 2 workers; after the fix 10 full runs in a row passed (1,345 tests). Changes: `expect(document.title).toBe(...)` and positive `expect(...).toHaveFocus()` / `expect(document.activeElement)...` now `await waitFor(...)` across 17 test files; `asyncUtilTimeout` raised from 5 s to 15 s (a ceiling only). Left as they were on purpose: files that run under `vi.useFakeTimers` (`ResultsScreen.test.tsx` and others, where `waitFor` hangs the fake clock) and the synchronous `Button.test.tsx`. The backend `RoomMatchFlowTest` flake was fixed after this: it was not timing at all. `doesNotContain("404")` / `("422")` ran on the whole frame, whose random `roomId` UUID sometimes contains those digits (reproduced: `ce833831-4e98-4041-…`). Both checks now look at the `payload` only. Item 41 (date-relative fixtures) is closed as superseded: dates were not the cause.

## Review Triage Log

Inline review by the implementer (not independent).

| Finding | Verdict | Evidence / route |
|---|---|---|
| `waitFor` makes a focus or title assertion weaker than a synchronous one if the value is briefly right then wrong | low | the assertions are about the settled state; the screens set both once |
| Fake-timer tests still assert synchronously and could race | low | they control the clock and have not flaked in any run; revisit if they do |
