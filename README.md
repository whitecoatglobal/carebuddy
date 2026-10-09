# Care Buddy

<img src="public/branding/carebuddy-wordmark-v1.png" alt="Care Buddy" width="240">

**Your AI companion for everyday and family care.**

Care Buddy brings daily routines, family care, health records and an AI assistant into one mobile-friendly app. Buddy can save supported care changes from a clear chat request, with server validation and a saved receipt.

## Start here

| What you need | Link |
| --- | --- |
| Website | [carebuddy.life](https://carebuddy.life/) |
| Explore the app | [Today](https://carebuddy.life/today) |
| Watch the mobile demo | [5:58 walkthrough](https://carebuddy.life/submissions/carebuddy-2026/) |
| Launch presentation | [51-slide PowerPoint](presentations/CareBuddy-Launch.pptx) |
| Architecture diagram | [5-slide PowerPoint](submissions/carebuddy-2026/materials/Care-Buddy-Architecture-Healthcare.pptx) |
| Complete submission | [Submission folder](submissions/carebuddy-2026/README.md) · [Download ZIP](submissions/carebuddy-2026/Care-Buddy-Submission-Pack.zip) |
| Logo assets | [Branding folder](public/branding/) |

## What the app does

- **Today:** weather at the top, the next care task, daily progress and medication, hydration, movement and bedtime reminders. Unhealthy PSI adds a red “mask up” prompt; rain adds “bring umbrella”.
- **Sleep and health:** review sleep duration and stage percentages, or blood pressure, pulse, temperature, oxygen and breathing readings, with explanations and recommendations.
- **Family:** switch between Me, Mom and Dad to view their routines, appointments and care records.
- **Appointments and benefits:** keep preparation checklists, confirmation status, allowances, balances, claims and recorded terms together.
- **Buddy:** ask about selected care records, save supported changes and open WhiteCoat for a routine GP consultation when appropriate.
- **Assistant notifications:** export a personal plugin with selected profiles, optional health alerts, expiry and revocation. [Setup instructions](agent-plugin/INSTALL.md) are included in each export.

The interface uses the supplied blue-green logo, a cream and sage palette, Fraunces headings and DM Sans body text.

## Current data and integrations

This is a public prototype with fictional care records and no account login.

| Area | Current implementation |
| --- | --- |
| Weather | Singapore NEA/MSS feeds through data.gov.sg |
| Sleep | Fixed frontend values: 6h 40m asleep, 55% light, 20% deep and 25% REM |
| Health readings | Illustrative values stored in SQLite and fetched through the backend API; no wearable feed is connected |
| Family and benefits | Persisted fictional fixtures for Me, Mom and Dad |
| Appointments | Saved care records; a clinic must confirm an actual booking |
| Buddy | Tencent TokenHub with private MCP context and validated care tools |
| GP access | User-selected WhiteCoat link; no conversation or health readings are sent through the link |
| Notifications | Scoped MCP exports for Codex and Claude; the user enables scheduling in the host assistant |

Browser IDs separate prototype care spaces and can be administratively blocked. They do not establish verified human identity. [Access details](docs/client-access.md).

## Run locally

Use Node.js 24, npm and a supported SQLite native-build environment. From the repository root:

```sh
npm ci
npm run build -w shared
npm run build:public-demo
npm run build:backend
npm run start:backend
```

Open **http://127.0.0.1:3000**. This serves the frontend and backend together, with a fictional public demo and same-origin API requests. The default database is `data/care-buddy.db`; set `DB_DIR` to use another location.

For live Buddy responses, set `TOKENHUB_BASE_URL`, `TOKENHUB_MODEL` and `TOKENHUB_API_KEY` in the backend process environment. See [TokenHub setup](docs/tokenhub.md) and the [configuration example](backend/tokenhub.env.example). Provider credentials belong only in the backend environment.

## Repository guide

| Folder | Purpose |
| --- | --- |
| `src/` | React screens, navigation, styles and API clients |
| `backend/` | Express APIs, SQLite persistence, Buddy tools, weather and notifications |
| `shared/` | Shared types, care rules and demo fixtures |
| `tests/` | Unit, integration and browser coverage |
| `public/` | App logo, favicon, PWA icons and manifest |
| `docs/` | Architecture, access, provider setup and testing guides |
| `presentations/` | Current launch deck |
| `submissions/carebuddy-2026/` | Submission copy, architecture deck, video, captions, evidence and rebuild sources |
| `agent-plugin/` | Personal assistant plugin templates and scheduling instructions |
| `workbuddy-skills/` | Optional preparation skills and their source packages |
| `scripts/` | Service-worker generation, skill packaging and isolated verification |

## Development and checks

```sh
npm run build -w shared
npm test
npm run build:public-demo
npm run build:backend
```

Unit and integration coverage includes permissions, saved receipts, retries, clock handling, family fixtures, health readings, weather and notification exports. [Testing guide](docs/testing.md) explains the browser suites and their limits. Generated reports stay outside the tracked project files.

See [Architecture](docs/architecture.md) for the data flow and [Deployment](DEPLOYMENT.md) for the HTTPS server setup.

## Healthcare Track submission

The submission follows **Case Study 2: AI Healthier Every Day**. It includes the eight-word blurb, project description, editable architecture slides, original CodeBuddy development captures, cover and a mobile demo with side captions and soft instrumental music.

[Open the submission guide](submissions/carebuddy-2026/README.md) for filenames, video rebuild instructions and the complete pack. Pilot metrics in the description and deck are evaluation targets, rather than measured patient outcomes.
