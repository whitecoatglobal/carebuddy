# Buddy and Tencent TokenHub

Buddy calls Tencent TokenHub from the Express backend. The browser sends care intent to `POST /api/buddy/interpret`; the backend loads the selected care context, dispatches supported tools and persists validated results.

## Configuration

Set these variables in the backend process environment:

```dotenv
TOKENHUB_BASE_URL=https://tokenhub-intl.tencentcloudmaas.com/v1
TOKENHUB_MODEL=deepseek/deepseek-flash
TOKENHUB_API_KEY=
```

The example endpoint and model match the configured deployment. Select the endpoint/model available in your TokenHub account; the base URL must use HTTPS and end in `/v1`. The app does not silently substitute another model or region.

[Configuration example](../backend/tokenhub.env.example). Provider keys are backend-only and must not use a `VITE_` prefix. Node does not automatically load the example file.

For an Ubuntu systemd deployment, edit the service's private environment file and load it through an `EnvironmentFile` directive. Keep existing credentials when updating the application. See [Deployment](../DEPLOYMENT.md).

`GET /api/health` reports whether the required settings are present. A successful Buddy provider request is needed to verify account/model access.

## Request and action flow

1. The frontend sends `requestId`, `message`, `profileId` and optional owned record context/recurrence scope.
2. The backend checks browser visibility and profile access, then loads its authoritative snapshot.
3. An in-memory MCP client/server exposes selected reminder, appointment and benefit context and a limited set of care tools.
4. TokenHub selects supported tools. Code checks permissions, source records, schedules and the current revision independently.
5. A clear supported change saves automatically in a SQLite transaction with both chat messages and a saved receipt. The browser updates from that response.

Request IDs bind retries to the original payload and result. Replaying the same request cannot create a second save. A changed payload with the same request ID is rejected.

## Supported behavior

Buddy can prepare or perform supported reminder changes, selected family details, appointment/checklist changes, benefit notes and reminder preferences. Missing fields and invalid requests stop a save. View-only profiles cannot write. Forms retain their own review step, and earlier pending proposals remain expiry/revision checked.

There is no arbitrary SQL, deletion, reset, permission-grant or account-administration model tool. The model does not receive audit browser IDs or other profiles. Health-vitals readings, frontend sleep content and weather are outside the selected-care model context.

Assistant save feedback comes from committed server receipts. Provider prose alone cannot establish that a change was saved. Driving privacy restrictions run before provider processing.

## GP handoff

A routine GP response can include a WhiteCoat action. The backend stores the navigation metadata separately from visible prose; the frontend opens a fixed link after the user chooses it. No chat or health readings travel through the link. Emergency navigation uses the separate urgent-help route.

## Checks

```sh
npm run build -w shared
npm test
npm run build:public-demo
npm run build:backend
```

Provider tests use controlled responses to check payloads, selected-profile isolation, saved receipts, malformed output, errors, timeouts and retries. Live provider availability is a separate deployment check.

Official provider references: [API endpoints and authentication](https://cloud.tencent.com/document/product/1823/130078), [DeepSeek request configuration](https://cloud.tencent.com/document/product/1823/132248).
