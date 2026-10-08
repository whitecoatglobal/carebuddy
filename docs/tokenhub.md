# Buddy / Tencent TokenHub

Buddy calls TokenHub from the Express backend using native Node fetch. The frontend continues calling `POST /api/buddy/interpret`. No API key is included in the frontend build or response.

## Server configuration

Set all three variables in the backend process environment:

```dotenv
TOKENHUB_BASE_URL=https://tokenhub-intl.tencentcloudmaas.com/v1
TOKENHUB_MODEL=deepseek/deepseek-flash
TOKENHUB_API_KEY=
```

This endpoint matches the user's TokenHub console example and successfully authenticated on 7 October 2026. The model-list API confirmed `deepseek/deepseek-flash` is available. The earlier `tokenhub-intl.tencentmaas.com` endpoint rejected this account's key. The model ID is explicit configuration; the application does not silently substitute another model or region. The required base URL must use HTTPS and end in `/v1`.

Official references, checked 7 October 2026:

- [TokenHub API endpoints, authentication and model IDs](https://cloud.tencent.com/document/product/1823/130078)
- [DeepSeek request format and thinking configuration](https://cloud.tencent.com/document/product/1823/132248)

The current code uses non-streaming Chat Completions with `thinking.type=disabled`, a 30-second timeout and a 1,024-token output limit. It reads `choices[0].message.content`, and does not expose reasoning content.

## Existing Ubuntu systemd deployment

Create a server-only environment file using an editor on the server:

```bash
sudo install -m 600 /dev/null /etc/care-buddy-tokenhub.env
sudoedit /etc/care-buddy-tokenhub.env
```

Fill the three configuration variables there, including the API key. Do not paste the key into chat, commit it, or prefix it with `VITE_`. The example file in `backend/tokenhub.env.example` deliberately contains no token.

Add the file to the existing service using `sudo systemctl edit care-buddy`:

```ini
[Service]
EnvironmentFile=/etc/care-buddy-tokenhub.env
```

Then activate it:

```bash
sudo systemctl daemon-reload
sudo systemctl restart care-buddy
curl --fail https://carebuddy.life/api/health
```

The health response reports `ai: "tokenhub"` and `aiConfigured: true` when all required settings are present and the URL is valid. This is a configuration check, not proof that the API key/model is accepted by Tencent. Send a Buddy message after activation to verify the provider call.

For local development, supply these variables to the backend process, build the shared package, and run `npm run dev -w backend`. Build the frontend with `VITE_BUDDY_BACKEND_URL=/` for same-origin production deployment. Node does not automatically load the example environment file.

## Behavior and data flow

- Browser access is governed by `care-buddy.client-id` and the database `is_visible` column. The existing no-login, default-allowed browser policy is retained. These client-controlled IDs are namespaces, not verified human identities.
- Buddy accepts only message, selected profile ID, optional owned record context and recurrence scope. The backend loads that browser's own stored snapshot; uploaded state and owner overrides are rejected.
- A private MCP client/server pair uses the official TypeScript SDK and in-memory transport. `read_selected_care` exposes only the selected viewable profile's records. TokenHub receives schemas from MCP tools/list and its function calls are dispatched through tools/call.
- Safe tools prepare reminder changes, selected family details, appointment edits/checklist toggles, benefit notes and reminder preferences. No arbitrary SQL, deletion, reset, permission grant or account-administration AI tool exists. View-only profiles cannot prepare writes.
- Tools validate on a cloned snapshot. A clear user request now authorizes the supported change directly: the backend applies it and stores both chats and a saved receipt in one SQLite transaction. New Buddy writes do not return a pending proposal or require a Confirm button. Earlier pending proposals remain manual and expiry/revision checked.
- Normal forms use typed `/api/commands` requests. `browser_command_receipts` deduplicates stable action IDs. State snapshots retain existing JSON records and add a business revision; there is no unrestricted whole-state overwrite API.
- The frontend queues bootstrap, commands, Buddy and Confirm. State, Today cards and save feedback update from authoritative server responses. Revision conflicts refresh records and invalidate stale work; profile intent tokens prevent delayed replies from reopening old proposals.
- Every assistant bubble has server-owned status. New automatic writes produce Saved only after a committed receipt marked `authorization=chat_request`, `confirmation=false`; no-action replies show No records changed. Older pending proposals can retain Awaiting confirmation. Provider prose is not write evidence; phrase filtering is secondary, not a guarantee about arbitrary natural-language wording.
- Existing global browser cache is not silently copied into another browser ID. Display caches are scoped to the browser ID, and saved server data wins. One-time initialization is allowed only for an empty revision-zero snapshot.
- Provider context excludes audit browser IDs and other profiles; credentials remain server-only. Driving privacy runs before provider/MCP processing. Health snapshots also use owned server records.

## Verification

```bash
npm run build -w shared
npm test
VITE_BUDDY_BACKEND_URL=/ npm run build
npm run build:backend
git diff --check
```

Tests stub the external provider boundary to verify payloads, selected-profile isolation, confirmation behavior, missing settings, provider errors, malformed output and timeouts.

## Live activation — 7 October 2026

- Activated on `https://carebuddy.life` with the account's supplied endpoint and `deepseek/deepseek-flash`.
- Credentials are in root-owned `/etc/care-buddy-tokenhub.env` with mode `600`, loaded by `/etc/systemd/system/care-buddy.service.d/30-tokenhub.conf`.
- A real provider completion returned HTTP 200. Live browser tests verified a grounded reminder summary and a reminder proposal requiring confirmation without auto-saving.
- All 31 unit tests, frontend/backend builds, and diff checks passed.
- The running application and SQLite database were backed up to `/home/ubuntu/care-buddy-backups/tokenhub-20261007-084010` before activation.
- Live testing used an isolated fictional profile; its persisted state was removed after verification.

## Browser-owned MCP release — 8 October 2026

113 unit/integration tests and shared/backend/frontend production builds passed after integrating SQ’s interface refinements (`2eebde5`). All 14 UI scenarios passed; the two async-save fixture checks were adapted and rerun after the server-first contract change. Independent review checked server transactions, legacy schema coexistence, cross-browser isolation, proposal expiry/revision, server-owned save feedback and frontend profile races. Production dependency audit found zero advisories.

An isolated browser test demonstrated 7:30 pm → 9:00 pm after Confirm, immediate Today refresh, persistence after reload, no false success on a failed save and harmless repeated confirmation. A staged real TokenHub call independently confirmed MCP tool dispatch and save-after-confirm. Live Chrome repeated the real-provider reminder update and rejected cross-browser confirmation, without a login screen.

The running app and database were backed up to `/home/ubuntu/care-buddy-backups/server-mcp-20261008-042101`. All 129 original snapshots and visibility flags were unchanged by the deployment. Live QA rows were removed and SQLite integrity was `ok`. SQ's sample health/sleep content remains outside model-owned writes.

The final merged release was backed up to `/home/ubuntu/care-buddy-backups/server-mcp-20261008-042755`. Its published JS asset is `index-CkJIBYdu.js`. The merged release passed the isolated failed-save/Confirm/Today/reload regression again, preserved all 129 existing database snapshots and visibility settings, and initialized successfully on the Linux host.

## Automatic Buddy saves — 8 October 2026

The owner explicitly requested automatic supported changes without confirmation. Clear instructions such as “change my bedtime to 9pm daily” now use MCP and save immediately after server validation. Daily recurrence already specifies regular future scope; no redundant scope/confirmation question is needed. Missing fields, view-only access, invalid dates and unsupported tools still stop a save. Forms keep their own review step.

Buddy API requires `requestId`. `browser_buddy_requests` binds it to the browser and canonical payload, returns current state plus the original result on replay, and rejects a different payload with the same ID. Concurrent duplicate requests can both infer, but the post-inference transactional replay check allows only one write. Unresolved frontend request IDs are stored per browser/payload and retained across profile navigation and reloads; user selection generation independently fences UI replies.

122 tests and all builds passed. Browser verification covered failure then retry, no Confirm dialog, immediate Today update and reload persistence, and replay without a second provider call/save. A real TokenHub preflight used the exact short bedtime request and saved 9pm daily without confirmation. The live browser repeated that automatic update, rejected cross-browser record access, and safely replayed the request. Temporary QA records were removed; all 129 original snapshots/visibility values remained intact; SQLite integrity was ok.

Backup: `/home/ubuntu/care-buddy-backups/buddy-auto-20261008-050243`. Browser identity remains client-controlled and has not become verified human identity. Profile manage permissions remain enforced.
