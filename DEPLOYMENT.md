# Care Buddy Deployment Summary

## Live URL

- **Frontend + Backend:** http://124.156.206.120/
- **Health endpoint:** http://124.156.206.120/api/health

## What was built

1. **Shared package** (`shared/`)
   - Extracted the original `src/types.ts` and `src/domain.ts` into a workspace package.
   - Provides the deterministic care-domain interpreter used by both frontend and backend.

2. **Backend server** (`backend/`)
   - Express server (`backend/src/index.ts`) that serves the production frontend and exposes:
     - `GET /api/health` — service health
     - `POST /api/buddy/interpret` — runs `buildChatAction` on a full `State` snapshot and returns Buddy’s response text/proposed action
   - `backend/src/interpret.ts` wraps the shared `buildChatAction` function.
   - `POST /api/health/snapshot` — returns deterministic wearable vitals, current weather, and generated advice for a profile
   - `backend/src/health.ts` wraps the shared `buildHealthReading`, `buildWeather` and `buildHealthAdvice` functions.
   - **SQLite persistence** (`backend/src/db.ts`, `better-sqlite3`):
     - `state_snapshots` table stores the full app `State` per device (`client_id`).
     - `chat_messages` table stores Buddy conversation history per client.
     - `GET /api/state/:clientId`, `PUT /api/state/:clientId`, `GET /api/state`, `GET /api/chats/:clientId`.
     - DB file at `data/care-buddy.db` (WAL mode), path set via `DB_DIR` env var.

3. **Frontend wiring** (`src/App.tsx`, `src/buddyClient.ts`, `src/healthClient.ts`, `src/syncClient.ts`)
   - `send()` now posts the current `State` and user message to the backend when `VITE_BUDDY_BACKEND_URL` is set.
   - Falls back to the local deterministic engine when no backend URL is configured.
   - Added a `buddyThinking` state and disabled the composer while waiting.
   - Added a fallback `uid()` generator so the app works on plain HTTP deployments where `crypto.randomUUID()` is unavailable.
   - New **Health** tab in bottom navigation (`src/App.tsx`).
   - `renderHealth()` shows simulated wearable stats (heart rate, BP, breathing rate, sleep, steps), current weather, and AI-style recommendations pulled from `/api/health/snapshot`.
   - `src/syncClient.ts` generates a stable per-device `clientId`, pulls saved state from the backend on first load, and pushes the updated state after every change (local-first with SQLite backup).

## Build / deploy notes

- Production build is done with `VITE_BUDDY_BACKEND_URL=/` so the frontend calls the backend on the same origin.
- Backend runs as a systemd service `care-buddy.service` on port 80.
- Helmet security headers were disabled because their default CSP/COOP/COEP policies blocked the React app from rendering in a plain-HTTP environment.

## Verification

- `npm test` passes (28 tests) locally.
- A Playwright end-to-end test against the live server:
  - Loaded the welcome screen
  - Clicked **Get started**
  - Navigated to **Buddy**
  - Sent “What is next today?”
  - Received a backend-generated response containing the routine summary.
  - Navigated to **Health**
  - Viewed live wearable stats (heart rate, BP, breathing, sleep, steps), current weather, and personalised recommendations.
- SQLite sync verified end-to-end:
  - Seeded a state on the server via `PUT /api/state/:clientId`.
  - The frontend pulled it on load and showed the seeded chat.
  - After a new Buddy message, the server held the updated state (3 chats, including the new user message).
