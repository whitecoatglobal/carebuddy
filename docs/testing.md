# Testing

## Build and automated checks

From the repository root:

```sh
npm ci
npm run build -w shared
npm test
npm run build:public-demo
npm run build:backend
```

The unit and integration suites cover care rules, selected-profile access, revision checks, retries and saved receipts, daily recurrence, clock projection, weather handling, health readings, family/benefit seeding and assistant notifications. External model requests use controlled provider responses in automated tests.

## Browser suites

The focused suites check current UI behavior with fictional fixtures and controlled API responses:

```sh
npm run build
npx playwright install chromium
npx playwright test tests/ui-refinements.spec.ts tests/ui-regressions.spec.ts tests/liveToday.spec.ts
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already installed Chromium-compatible browser. The preview server uses `http://127.0.0.1:4173`.

`acceptance.spec.ts` and `pwa.spec.ts` preserve earlier standalone-flow coverage. Some assumptions predate the backend access gate and current onboarding; passing focused tests does not establish that these older suites or cold offline access pass. Physical devices and live provider availability require separate checks.

## Generated output

- JSON results, traces and screenshots: `test-results/`
- HTML browser report: `playwright-report/`

These directories are ignored by Git. Run checks for the revision under review rather than relying on historical machine-generated reports.

## Package checks

```sh
node scripts/test-skills.mjs
```

WorkBuddy source packages and their ZIPs are under `workbuddy-skills/`. The package checks validate contracts, fixtures and guards; they do not establish a live WorkBuddy host connection.

The submission's video, fonts, images and archive have a separate [manifest](../submissions/carebuddy-2026/manifest.json). Its media build instructions are in the [submission guide](../submissions/carebuddy-2026/README.md).
