# Browser ID whitelist implementation plan

**Goal:** Keep the latest public-interface concept while allowing access only for configured `care-buddy.client-id` values.

**Approved boundary:** Browser IDs are client-controlled identifiers, not authenticated identities. This is an acknowledged browser allowlist, not proof of a person's identity. No accounts, module permissions or invitation flow are added.

**Configuration:** `state_snapshots.is_visible` is an integer database column: 1 permits access, 0 denies it. Existing and new rows default to 0; normal state upserts cannot change this column. Shared fallback `client-local` is never admitted. No wildcard. Health status and weather remain public and contain no care records.

**Contract:** Every private request sends `X-CareBuddy-Client-Id`. The server checks membership before database/provider work. Record route IDs and optional body client IDs must match the header. The listing endpoint returns only the calling browser ID. The non-personal access check registers a missing client ID with an empty blocked snapshot and returns only that ID and its visibility flag. Responses cannot be cached. Client-supplied state remains part of the latest commit's existing sync/AI contract; this change does not claim server-verified ownership of that submitted state.

**Files:** `backend/src/clientAccess.ts` (allowlist middleware); `backend/src/app.ts` (testable routes); `backend/src/index.ts` (listen); `src/syncClient.ts`, `src/buddyClient.ts`, `src/healthClient.ts` (ID header); `src/ClientAccessRoot.tsx`, `src/main.tsx` (access gate); `docs/client-access.md` (database configuration).

- [x] Test client header transport and denied/mismatched record access.
- [x] Add middleware and app access endpoint; preserve latest persistence behavior.
- [x] Send header from all private API callers and gate app rendering on access check.
- [x] Run tests, frontend/backend builds and diff review.
- [x] Back up live database and add the visibility column without altering snapshot JSON or timestamps.
- [x] Commit and push changes.
- [x] Owner authorised all existing IDs on 8 October 2026. Backed up code and data, enabled all 129 existing rows, deployed the gate, retained provider secrets, and verified allowed/blocked browser flows without login.
