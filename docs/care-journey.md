# Care journey: document plans, appointment briefs and post-visit follow-through

Status: implementation on `codex/care-document-journey`; integrated with main `59e49ec` (8 October 2026). WorkBuddy skill packaging remains with SQ. These endpoints use the existing server-side Tencent TokenHub configuration; they do not establish a live WorkBuddy connector.

## User workflow

From Today choose **Open care journey**, or open `/care/journey` directly. The active person stays visible. The page remounts and cancels pending requests when the selected profile changes.

1. **Letter to plan:** acknowledge fictional input; upload PNG/JPEG/PDF or paste text; inspect/correct extracted text; generate a source-linked draft; review instructions, uncertainties and questions; select actions and supply unresolved dates; confirm to save the selected batch. The saved appointment contains reviewed preparation notes and source history. Adding an appointment does not book a provider.
2. **Appointment brief:** select an existing appointment; enter concerns and questions; generate a source-linked snapshot of the visit and recorded routines; review sources; download a plain-text brief. User questions remain present even when AI omits them. Unrecorded routines do not prove missed medication.
3. **After your visit:** capture fictional clinician notes or a document; inspect extracted instructions and proposed actions; confirm a selected batch; mark source-derived follow-through checklist items in the saved journey. Checklist progress and briefs survive page reloads on this browser.

## Data and boundaries

The current upstream application uses a database browser-ID visibility whitelist. Care routes enforce that gate and the frontend sends the existing client-ID header. Browser client references are **not account authentication**. This feature consequently accepts fictional sample material only; it is not a real-patient document service.

Image/PDF extraction uses private temporary directories and deletes original files after extraction. No document is placed in static/public storage. Source text is sent to the configured AI provider for generation. Source documents, plan drafts, checklist progress and brief snapshots are stored in localStorage under a client/person-specific care-journey key; original upload bytes are not stored. Confirmed care records continue through the app's existing local save and SQLite sync. A failed server sync is reported separately from local save.

No diagnosis, dose recommendation, provider contact, booking, insurer verification, automatic permission grant or automatic AI write is introduced. Source citations are validated for exact quote membership (plans) and valid source IDs (briefs). These checks do not prove semantic accuracy; users must inspect generated summaries, dates and selected actions.

## Runtime dependencies and limits

The backend requires Node as documented in README and system packages `tesseract-ocr` and `poppler-utils` (pdfinfo, pdftotext, pdftoppm). English OCR is supported by the installed language model. Digital PDFs use embedded text; scanned pages use OCR. Missing tools return a paste-text fallback instruction. No remote OCR service or new API key is needed.

Limits: PNG/JPEG/PDF up to 6 MB, five PDF pages, 24 megapixels, source text up to 24,000 characters. OCR subprocesses have timeouts and output bounds; one extraction runs at a time. Routes have bounded requests per IP. TokenHub uses the existing server configuration; care generation permits larger structured responses while ordinary Buddy limits remain unchanged.

## Contracts

- `POST /api/care/extract`: `{fictionalOnly:true,name,mimeType,dataBase64}` or `{fictionalOnly:true,name,text}` → `{document}`.
- `POST /api/care/plan`: `{fictionalOnly:true,profileId,profileName,kind,document,timeZone,now}` → `{plan}`. Unknown or ambiguous dates remain null. Supported action types are appointment and reminder.
- `POST /api/care/brief`: selected appointment, selected person's reminders, concerns, questions and pending instruction tasks → `{brief}`.

Types are exported from `shared/src/careJourney.ts`. These are browser-whitelisted prototype APIs, not account-authenticated production endpoints.

The frontend executes reviewed plans against a cloned state and persists only after all selected actions validate. Context changes, view-only access, wrong person, past/missing dates, missing source evidence and duplicates block saving. Stable plan/action markers prevent repeated confirmation from duplicating records. A saved subset is final for that draft; prepare a new plan to add excluded items.

## Verification

Run shared build, unit tests, public frontend build and backend build. `tests/careJourney.test.ts` covers source and provider validation; `tests/careJourneyState.test.ts` covers atomic plan application, duplicates, stale context and profile/access guards. Browser verification should exercise real extraction, no pre-confirmation mutation, saved-state reload, source review, brief download, post-visit checklist persistence, missing-provider errors and profile switching. Provider stubs prove integration behavior, not actual model quality. A configured live provider and fictional smoke test remain necessary before claiming runtime AI verification.

### Reproducible browser check

Build the app, then run the browser check. It starts its own backend on a temporary port with an isolated temporary database and removes that database afterwards:

```sh
npm run build -w shared
npm run build:public-demo
npm run build:backend
npm run test:care-browser
```

Set `CARE_TEST_BASE_URL` only to target a separately managed isolated test backend with `CARE_TEST_CLIENT_ID` already approved. The default harness approves one fictional browser ID only in its own temporary database and tests rejection without a browser ID.

The browser script uses Playwright Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing system Chrome installation. It uses real image/PDF/text extraction and controlled plan/brief HTTP fixtures, so no TokenHub key is required for this check. It checks confirmation, persistence, provider failure, brief download and follow-up checklist completion; it does not establish model output quality. Fictional OCR fixtures are in `tests/fixtures/`.

## Delivery verification — 8 October 2026

- GOAL_UNDERSTOOD: deliver document-to-plan, appointment brief and post-visit follow-through; SQ owns later WorkBuddy skills.
- TRUTH_RETRIEVED: repository implementation and current main, not older account/MCP documentation.
- LIVE_SOURCE_FRESHNESS: integrated main `59e49ec`, including refreshed Today UI and browser visibility whitelist.
- FALSIFICATION_STATUS: all 94 unit tests passed, shared/frontend/backend builds passed, and isolated browser checks passed with real PNG/PDF/text extraction, access gating, edited-draft reload, pre-confirmation isolation, saved-plan replay, brief export and post-visit checklist persistence. The negation regression ensures generated instructions cannot drop “Do not” from a cited instruction.
- SECRET_PII_STATUS: fictional fixtures only; raw upload files are temporary and removed. No credentials or patient data added.
- KB_UPDATE_STATUS: No KB update needed; delivery documentation is maintained in this application repository.
- KB_PATH: not applicable to this separate hackathon project.
- FINAL_GATE: implementation verification passed. AI generation browser checks use controlled fixtures, not live TokenHub output. Production deployment and live-provider smoke verification are not claimed.
