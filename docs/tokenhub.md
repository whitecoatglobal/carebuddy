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

- `POST /api/buddy/interpret` requires a signed-in session, allowed Origin and CSRF token. The authenticated session chooses the account; request bodies cannot supply its owner or database state.
- The server loads that account's snapshot and creates a fresh private MCP client/server pair using the official TypeScript SDK and `InMemoryTransport`. This is an internal MCP service, not a public remote MCP endpoint.
- MCP `read_selected_care` accepts no arguments and returns only the selected viewable person's reminders, appointments, benefits and last twelve chat messages. Other people and accounts are excluded. Explicit record context must belong to the selected person.
- TokenHub receives schemas obtained through MCP `tools/list`. Its function calls are dispatched through MCP `tools/call`; they validate commands on a cloned snapshot and return proposals without writing care records.
- The action allowlist is create/edit/complete/undo/snooze reminder; add/update family details; update checklist; create/edit appointment records; add/update benefit notes; and the two supported reminder preferences. A view-only profile gets no action tools. No SQL, deletion, account administration, permission changes, migration or confirmation tool exists.
- The server independently validates and stores a pending proposal. Only the authenticated human's Confirm request can execute it, with ownership, profile, expiry, revision and duplicate-request checks. An AI message saying “saved” cannot write records.
- Driving privacy checks run before opening MCP or calling TokenHub. The system prompt is in `backend/src/buddyPrompt.ts`; credentials remain server-only.
- Missing configuration returns HTTP 503. Provider failures return 502 and timeouts 504, without exposing provider response bodies or credentials. Errors do not silently switch to another model or account.

Official MCP references checked 7 October 2026: [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

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

## MCP verification — 7 October 2026

105 tests passed, including real MCP initialization/list/call, simultaneous account snapshot isolation, selected-profile read filtering, unknown-tool rejection, denied owner/permission overrides, read-only permissions, and proposals without care-record writes. Production dependency audit reported zero advisories. Frontend/backend builds passed.

The private MCP bridge was deployed to `https://carebuddy.life`. A real TokenHub completion produced a pending proposal; two temporary signed-in accounts verified read isolation and denied cross-account confirmation. Confirm saved once, repeated Confirm created no duplicate, and no care record was written before confirmation. Both test accounts were removed, legacy snapshots remained byte-for-byte unchanged, and SQLite integrity was `ok`. Rollback backup: `/home/ubuntu/care-buddy-backups/mcp-20261007-114131`.
