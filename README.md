# Care Buddy

Care Buddy is a public self-care prototype built with React, TypeScript, Vite, Express and SQLite. It opens without an account login. Today, Family, Benefits, Health and Buddy organise fictional routines and care records.

## Today and saved records

- Existing care spaces load through their browser client reference and sync with SQLite. Populated saved records take precedence over sample content.
- If the former account screen archived a browser's records, the public app restores that browser's valid backup and client reference once. It keeps any populated current care space.
- A fresh public demo shows a fictional self profile and medication, water, walking and bedtime routines. The content is defined in the frontend and labelled as sample data.
- Sleep remains frontend sample data: 63% score, 6h 40m asleep, and 55% light / 20% deep / 25% REM. Review Sleep stays available on Today and opens the stage breakdown and recommendations.
- Weather uses NEA/MSS data through data.gov.sg. Buddy calls Tencent TokenHub from the backend, and care changes use the app's review and confirmation flow.

This version is a fictional public prototype. Browser client references separate demo care spaces; they are not account authentication. Appointment requests and benefits are illustrative, and wearable pairing requires a future device integration.

## Refreshed interface

Today keeps the original full weather card at the top, followed by a personal greeting, routine progress, the next reminder, last night's sample sleep, and the daily timeline. Completed routines can be expanded. Starter routines prefill their review forms.

Family and Benefits use clearer cards and access labels. Sleep details explain the stage percentages and recommendations, with a bedtime routine action that reuses an existing routine. New care spaces can create a fictional self profile or add a family member. Forms keep their main fields visible and place optional fields under More options.

## Run locally

The current build was verified with Node.js 24. Install dependencies and build the shared package:

```sh
npm ci
npm run build -w shared
```

Build the public demo and start the backend:

```sh
npm run build:public-demo
npm run build:backend
npm run start:backend
```

Open `http://127.0.0.1:3000`. `build:public-demo` enables the frontend sample fallback and same-origin backend requests. The ordinary frontend build remains available as `npm run build`.

Configure TokenHub in the backend process environment as described in [TokenHub setup](docs/tokenhub.md). API keys stay on the server and are excluded from frontend builds and this repository.

## Verification

```sh
npm run build -w shared
npm test
npm run build:public-demo
npm run build:backend
```

Unit tests cover the domain, weather, Buddy provider handling, sleep data, browser-record recovery and empty public-demo bootstrap. Browser checks verified public access, loaded weather, medication and sleep cards, and the sleep details page.

## Deployment and history

Live application: [carebuddy.life](https://carebuddy.life).

The public application and Today cards were restored on 8 October 2026. The prior account implementation and SQLite database are backed up at `/home/ubuntu/care-buddy-backups/20261008-remove-account-login`. The frontend before the Today restoration is backed up at `/home/ubuntu/care-buddy-backups/20261008-restore-today-cards`.

The previous account implementation remains in Git history. Its [design](docs/superpowers/specs/2026-10-07-account-owned-buddy-actions.md) and [implementation notes](docs/superpowers/plans/2026-10-07-account-owned-buddy-actions.md) are retained as historical documents.
