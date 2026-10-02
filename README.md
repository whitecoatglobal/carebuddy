# Care Buddy — refined v1.1 demo

A fictional mobile PWA for care organisation and routine navigation. React, TypeScript and Vite; all data stays in the current browser. The four tabs are Today, Family, Benefits and Buddy. The demo clock is fixed, with settings controls for scenarios and reset.

## Run locally

Use Node.js 22.12 or newer (Node.js 24 LTS is suitable). From this folder:

```sh
npm ci
npm run dev
```

The development server reports its local URL. To exercise installability and offline caching, use the production build:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4173`. Automated checks:

```sh
npm test
npm run test:e2e
```

Browser tests require an available Playwright Chromium browser. If it is absent, install it explicitly with `npx playwright install chromium`. See the validation report for the checks actually performed.

## Install and use offline

On a phone, serve the production build over HTTPS; `localhost` is the development exception. A desktop's `127.0.0.1` address is not reachable from a phone. Public hosting is separate from this delivery.

- iPhone: open the HTTPS app in Safari, tap Share, then Add to Home Screen. Browser and OS wording can vary.
- Android: open it in Chrome and choose Install app or Add to Home screen from the browser menu when available. A prompt is not guaranteed.
- Visit online once and wait for the app's offline-ready state before disconnecting. Only the local app shell is cached. Browser storage clearing removes local demo data and cached files.
- On a new version, the app offers a refresh when the replacement service worker has finished caching. Refresh activates it; no automatic mid-task reload is performed.

## WorkBuddy preparation

`workbuddy-skills/` contains three original SKILL.md packages and ZIPs: appointment preparation, reminder changes and sample benefit explanations. Each includes deterministic Node.js scripts, fictional fixtures and the shared TypeScript contract. Run a local dry-run from an extracted skill directory:

```sh
node scripts/propose.mjs < fixtures/request.json
```

Regenerate ZIPs from the current app seed with `node scripts/package-skills.mjs`; run their local guards with `node scripts/test-skills.mjs`. ZIP integrity and hashes are recorded in `workbuddy-skills/SHA256SUMS`.

They return proposals or source-labelled explanations, with `executed: false`. Settings now exports current context and imports an unexecuted reminder proposal with fresh source checks and explicit confirmation. This manual JSON roundtrip is tested locally. They do not establish a live WorkBuddy connection; a live host adapter remains separate. WorkBuddy import and host runtime execution have not been verified. The ZIP shape follows Tencent's documented skill-package shape; host versions can differ. No skills were installed into the user's environment.

Primary format references, checked 30 September 2026: [WorkBuddy Open Platform Skill guide](https://open.workbuddy.cn/en/docs/skill) and [Tencent WorkBuddy Skills](https://cloud.tencent.com/document/product/1831/134432). Packages include the current bilingual description/version/author fields. See [hackathon fit and requirements](HACKATHON-WORKBUDDY.md) for sources, recommended skill capabilities and runtime gaps.

## Boundaries

All people, appointments and benefits are fictional. No real patient data, LLM calls, backend, appointment booking, insurance adjudication, push notifications or device permissions. Car mode is a simulation. Benefits are sample-plan statements and require real-world confirmation. GP output is a preview. Browser-local data is unsuitable for real patient information.

The selected self-triage/navigation challenge remains a product positioning gap: this demo organises care and supports routine navigation; it does not assess symptoms or provide clinical routing. The official judging rubric and actual WorkBuddy runtime are unverified. This friends' project has not been published into WhiteCoat knowledge records.

## Verified delivery

See [validation and demo guide](VALIDATION.md) for acceptance results, screenshots, evidence and remaining boundaries.

## Refined product behavior

The main screens remove repeated demo labels while Settings retains the fictional-data and local-execution disclosure. Today counts and summaries follow current records; the layout uses a compact mobile profile bar and a two-column desktop canvas. Buddy supports state-driven day summaries, explicitly requested routine creation, reminder reports/snooze, appointment-relative preparation and category-specific benefit explanations. Actions still need confirmation. The former canned weather forecast was replaced with current care progress. The tagline no longer implies an unverified WorkBuddy runtime connection.
