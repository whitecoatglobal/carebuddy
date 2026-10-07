# Buddy Token Hub Implementation Plan

**Goal:** Connect the existing Buddy conversation API to Tencent TokenHub using a configurable DeepSeek Flash model, ready for credentials supplied later.

**Architecture:** Keep the browser request/response contract. The backend calls `/v1/chat/completions` using server configuration and sends only the selected profile's care records and recent conversation. Existing domain code continues generating validated action proposals; model text cannot change their command, scope, source IDs, or confirmation wording. No automatic writes or alternate AI provider on failure.

**Tech stack:** Existing Express, TypeScript, native Node fetch, React, Vitest. No new runtime dependency.

## Files and contract

- `backend/src/tokenHub.ts`: required `TOKENHUB_API_KEY`, `TOKENHUB_BASE_URL` (HTTPS URL ending in `/v1`), `TOKENHUB_MODEL`; bounded request timeout, provider response checks, redacted errors.
- `backend/src/interpret.ts`: async interpretation with validated state/profile; selected-profile context and history; preserve existing action proposals.
- `backend/src/index.ts`: await interpretation; map typed failures to HTTP 400/502/503/504; expose configured status without credentials.
- `src/buddyClient.ts`: surface backend configuration/provider errors without silently using local canned replies.
- `src/App.tsx`: show failure, release loading state, prevent parallel sends, and retain existing action confirmation.
- `tests/tokenHub.test.ts`, `tests/buddyClient.test.ts`: request contract, context isolation, action preservation, missing configuration, timeout, malformed responses, provider rejection, and browser error propagation.
- `docs/tokenhub.md`: server environment setup, region selection, model selection, systemd activation, and live verification.

## Execution

- [x] Add interpreter tests against a stubbed external HTTP boundary and run `npm test -- tests/tokenHub.test.ts`; expect the current deterministic interpreter to fail the AI response and configuration cases.
- [x] Add client tests and run `npm test -- tests/buddyClient.test.ts`; expect silent-null error behavior to fail.
- [x] Implement TokenHub request contract: `POST {base}/chat/completions`, `Authorization: Bearer {key}`, explicit model, `thinking: {type: "disabled"}`, bounded non-streaming response. Never return provider error bodies or key values.
- [x] Wire backend and frontend async/error paths and rerun the focused tests.
- [x] Build shared code, run all unit tests, build frontend/backend, and run `git diff --check`.
- [x] Verify a local isolated backend returns a clear 503 before configuration and inspect UI behavior. A real provider call requires the user's TokenHub token and account-specific region/model configuration.

## Ownership and side effects

This change preserves existing state ownership and persistence. It does not implement account login or the planned server CRUD migration. The provider request is read-only; existing confirmed actions use the current domain path. Chat context is restricted to the selected viewable profile. Credentials remain in server environment variables and are never sent to the browser or committed.
