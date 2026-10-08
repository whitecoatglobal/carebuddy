# UI refinements validation — 8 October 2026

Source: `whitecoatglobal/carebuddy`, based on main `7693ee02de41fa5e4ab67f07c939c48b8f9745b6`. This change targets the GitHub app, not the separate ChatGPT Sites copy. No production deployment or database mutation was performed.

## Requested behavior

| Area | Result and evidence |
| --- | --- |
| Onboarding | Existing self/family paths retained; optional bedtime, walking and drinking-water choices now carry into the self creation flow and editable reminder review. New family profiles retain their existing view-only permission. Browser test verifies creation, confirmation and persistence. |
| Today | Greeting/selected person and progress lead; Next up remains beside the desktop timeline; weather moves below the daily focus as a compact expandable strip. Existing minute-level time update is retained; no ticking seconds clock. Geometry and provider-client tests verify the layout and weather loading/error/retry/details. |
| Cards and actions | Existing primary/quiet Dismiss hierarchy retained; sparse appointment/sample panels tightened; Health review has one primary action with corrected contrast. |
| Sleep | Exact `sleepData.ts` values are unchanged: score 63, 400 minutes asleep, 30 awake, stages 55/20/25. Sample data remains labelled. Stage explanations expand in compact rows; one recommendation creates/reviews an existing wind-down routine. Browser test confirms a saved Daily Bedtime reminder for the correct person. |
| Family | Existing Add family member language retained, detail avatar added, next action made explicit, removal kept in overview overflow and moved into detail overflow. Permission and cross-person mutation tests pass. |
| Reminders / appointments | Existing what/day/time/repeat form and optional instructions retained, with footer review outside scrolling body. Modal focus now includes visible disclosure controls. Appointment metadata is compact and preparation action prominent. CRUD/confirmation/persistence and footer visibility checks pass. |
| Buddy | Existing compact introduction and empty-conversation prompts retained; composer focus made clearer. Backend request/confirmation handlers preserved. Browser test checks message persistence and prompt state. |
| Benefits | Documented amounts/visit limits summarized; annual allowance and upper-bound qualifiers retained; conditions/source/full policy date expandable. Unknown remaining balance is not fabricated. Unit and browser checks cover these semantics. |
| Health | Sample sleep/available information lead. Existing provider requests/refresh retained, unavailable-data copy no longer tells users to reconnect through an absent pairing flow. Loading/errors/retry exposed. Request generation prevents late results from crossing person selection; tested with delayed mocked responses. |
| Settings | Existing Advanced / Demo tools retained for reference clock, car simulation and WorkBuddy. Clock advance, car navigation and export/import control availability checked. |

## Results

- Shared package build and frontend TypeScript/Vite/service-worker build passed.
- **72 unit tests passed** across two process invocations (62 frontend/domain/provider tests plus 10 access/database tests).
- **14 focused browser tests passed**, including mocked backend fetch clients, save/confirm/persistence, profile isolation, stale-response handling, and automated WCAG A/AA plus overflow checks for welcome/Sleep/Health at 320, 390 and 1440 px.
- Root visually reviewed onboarding, desktop Today and mobile Sleep screenshots. A primary-button text-color conflict and low-contrast sample/navigation/status labels were corrected.
- `git diff --check` passed. Both `src/sleepData.ts` and `src/healthData.ts` are identical to the base commit.

## Reproduce

```sh
npm ci
npm run build -w shared
npx vitest run tests/clientAccess.test.ts --maxWorkers=1 --no-isolate --pool=forks
npx vitest run --exclude tests/clientAccess.test.ts --maxWorkers=1 --no-isolate --pool=forks
VITE_BUDDY_BACKEND_URL=/ npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npx playwright test tests/ui-refinements.spec.ts tests/ui-regressions.spec.ts
```

Omit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Playwright Chromium. The focused tests intercept access/state/Buddy/weather/health endpoints and do not contact live clinical services. They use explicit fictional test fixtures, not a change to product bootstrap data.

## Limits

- A combined Vitest process run triggers an existing native `better-sqlite3` cleanup assertion under the available Node 24.21 runtime. Separate process runs pass all 72 tests without excluding any test file.
- The unchanged legacy `acceptance.spec.ts` and `pwa.spec.ts` assume the removed Get started/seeded-household flow and predate mandatory browser access checks. They were not claimed as passing or rewritten to change current product behavior. In particular, cold offline access remains a pre-existing limitation of the current backend access gate.
- Weather and wearable fetch behavior were checked against controlled responses. Actual live provider availability, physical wearables and production deployment were not exercised.
- The current main already contained several requested refinements; this PR preserves them and adds focused current-version coverage.
