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

- Only the selected viewable profile's reminders, appointments, benefits and last twelve chat messages are sent to TokenHub. Other profiles and their chats are excluded. An explicitly supplied record context must belong to the selected profile.
- Existing action proposals still come from the validated shared domain engine. TokenHub cannot alter their commands, scope, source IDs or confirmation wording. No action runs simply because AI says it has saved something.
- The existing parked/driving privacy restriction runs before any provider request.
- The system prompt lives in `backend/src/buddyPrompt.ts`. It defines record grounding, selected-person scope, reference-clock handling, missing-data behavior, action confirmation, medical/benefit boundaries, and concise responses in the user's language.
- Missing configuration returns HTTP 503 with `AI_NOT_CONFIGURED`. Provider failures return 502; timeouts return 504. Provider response bodies and credentials are not returned to the browser.
- The frontend shows these errors and clears its loading state. It does not switch silently to a canned local response. Other existing browser persistence behavior is unchanged.
- Account authentication and the proposed server CRUD migration are separate work. This adapter does not add authentication to the existing public API; that route retains its current access model.

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
