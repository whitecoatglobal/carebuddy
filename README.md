# Care Buddy

Care Buddy is a public self-care prototype built with React, TypeScript, Vite, Express and SQLite. It opens without an account login. Today, Family, Benefits, Health and Buddy organise fictional routines and care records.

## Today and saved records

- Existing care spaces load through their browser client reference and sync with SQLite. Populated saved records take precedence over sample content.
- If the former account screen archived a browser's records, the public app restores that browser's valid backup and client reference once. It keeps any populated current care space.
- A fresh public demo shows a fictional self profile and medication, water, walking and bedtime routines. The content is defined in the frontend and labelled as sample data.
- Sleep remains frontend sample data: 63% score, 6h 40m asleep, and 55% light / 20% deep / 25% REM. Review Sleep stays available on Today and opens the stage breakdown and recommendations.
- Your Live Health beside Sleep loads fixed BP, pulse, body temperature and oxygen readings from SQLite through the backend API. Its review adds breathing rate, expandable explanations, measurement tips and source links.
- Weather uses NEA/MSS data through data.gov.sg. Buddy calls Tencent TokenHub from the backend, and care changes use the app's review and confirmation flow.

This version is a fictional public prototype. Browser client references separate demo care spaces; they are not account authentication. Appointment requests and benefits are illustrative, and wearable pairing requires a future device integration.

## Refreshed interface

Today starts with the original full weather card above the personal greeting, selected person, routine progress and Next up beside the desktop timeline. Temperature, condition, forecast period, humidity, air quality and provider details stay visible, with loading and retry states. PSI above 100 is red and adds “mask up”; rainy forecasts add “bring umbrella” beside the weather condition. Completed routines can be expanded. Onboarding offers self/family choices and optional bedtime, walking or drinking-water starters for self care; new family profiles retain view access. Starter routines open editable review forms before saving.

Family cards emphasize identity and next actions, with removal in an overflow disclosure. Benefits summarize recorded allowances and limits while retaining conditions, source and full policy date in expandable details. Sleep preserves every sample value and offers compact stage disclosures plus one wind-down recommendation; its reminder action reuses an existing routine where appropriate. Forms keep what, when and repeat visible, optional instructions expandable, and review actions outside the scroll area. Buddy shortens its introduction after conversation begins. Reference-clock, car simulation and WorkBuddy controls remain under Advanced / Demo tools. See [UI validation](docs/ui-refinements-validation.md) for coverage and test limitations.

## Landing page

The homepage at `/` follows the supplied Care Buddy mockup, using cream, sand, sage and plum with Fraunces headings and DM Sans body text. Explore the demo opens `/today`; the app logo returns to the homepage. Family examples and the Buddy walkthrough are illustrative frontend previews. Installed PWAs continue to open Today.

## Health readings

Your Live Health and its review page load readings from `GET /api/health/vitals?profileId=…`. The backend checks browser access and the selected profile's view permission, then reads SQLite's `health_vitals` row for that browser and profile. Each profile is seeded once with the fixed demo readings (118/76 mmHg, 72 bpm, 36.7°C, 98% oxygen and 16 breaths/min). Subsequent requests preserve stored values and their update timestamp. This is database-backed demo data; a device feed is not connected yet.

The frontend refreshes visible health screens every minute and when returning to the app. The card and review share the fetched readings, with loading and retry states. Sleep remains frontend data. No morning timestamp is shown on the health card.

## Demo benefits

Public demo care profiles without existing benefits receive a GP allowance of S$500 (S$80 used), health screening of S$250 (unused) and dental of S$300 (S$85 used). Cards show the remaining allowance and visits; details include paid or pending claims, conditions, source and policy date. Pending claims do not reduce the used balance.

These fictional records are seeded once in SQLite's existing care state and returned by the care API. Existing benefit records take precedence, unavailable profiles are skipped, and ordinary care spaces are not populated. Seeding increments the care revision while preserving other saved fields, visibility and clock settings. New public demos include the same fixtures at bootstrap.

## Demo family

Public demos include Me, Mom and Dad. The two parent profiles have daily medication, blood-pressure recording, hydration, walking and bedtime routines, plus a GP follow-up for Mom and health screening for Dad. They each receive the existing GP, screening and dental benefit fixtures and load their own database-backed health readings when viewed. Appointments are care records awaiting clinic confirmation.

Existing public demo spaces receive missing parents once through the backend, preserving the selected person, existing profiles, saved care, browser visibility and clock settings. Existing Mom/Mum/Mother or Dad/Father parent profiles are kept without adding duplicate or invented routines to them. A persisted `demoFamilySeeded` flag prevents removed or renamed demo family members from being recreated. Ordinary care spaces and empty onboarding states are unchanged.

## Buddy GP handoff

When Buddy recommends a routine GP consultation or the user asks to see a GP, its reply includes a WhiteCoat action opening `https://link.whitecoat.com.sg/dXEf/nnq8g6r9` in a new tab. The fixed frontend link sends no chat contents or health readings. It is a user-selected handoff; no consultation is booked by Care Buddy.

The provider appends a final-line navigation marker, which the backend removes from the visible reply and stores as optional `careNavigation` metadata on the assistant message. SQLite persistence and request replay retain the action across reloads for the selected profile, including view-only profiles. Ordinary care replies have no handoff. Emergency navigation takes priority over GP navigation and opens the existing urgent-help instructions instead of WhiteCoat.

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
