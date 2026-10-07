# Care Buddy

Care Buddy is a React/TypeScript care organiser with an Express/SQLite backend, separate signed-in accounts, and Buddy powered by Tencent TokenHub DeepSeek Flash.

## Data and changes

- Each account owns its care records. Session cookies are HttpOnly, Secure in production, and protected by Origin/CSRF checks.
- App forms save validated commands on the server. Browser snapshots cannot overwrite database state.
- Buddy can propose reminders, appointment records, family details, custom checklists, benefit notes and existing preferences. Review the before/after details and press Confirm to save.
- The server checks record ownership, permissions, dates, duplicates, revisions and proposal expiry. Transactions, idempotency keys and audit history protect retries and concurrent changes.
- Adding an appointment record does not book or confirm a clinic visit. Notes do not verify insurance coverage. Wearable readings require a real device integration; the UI may show explicitly labeled sample sleep material.
- Public weather uses NEA/MSS data via data.gov.sg and sends no personal care state.

## Run locally

Use Node.js 22.12 or newer. Install dependencies and build the shared package:

```sh
npm ci
npm run build -w shared
```

For a same-origin local production preview:

```sh
VITE_BUDDY_BACKEND_URL=/ npm run build
npm run build:backend
APP_ORIGIN=http://127.0.0.1:3000 NODE_ENV=development npm run start:backend
```

Open `http://127.0.0.1:3000`, create an account, and sign in. Configure TokenHub variables in the backend process environment as described in [TokenHub setup](docs/tokenhub.md). Keys belong on the server.

## Verification

```sh
npm run build -w shared
npm test
VITE_BUDDY_BACKEND_URL=/ npm run build
npm run build:backend
```

Account API integration tests bind an isolated localhost server and use test databases. Browser verification covers sign-in, confirmation, persistence, account isolation, profile-intent races, and sign-out, including network failure and cross-tab privacy. Historical demo acceptance/PWA specs need authenticated fixtures before they can be used as current release gates.

## Existing records

Legacy anonymous snapshots remain in the database but their public APIs are closed. Existing browser records are archived as unclaimed migration evidence and never loaded into a signed-in account automatically. After creating the destination account, provide its username and the migration reference shown in the app for administrator review.

The administrator previews the mapping before importing:

```sh
node scripts/migrate-account.mjs --db /absolute/path/care-buddy.db --client-id SOURCE --username DESTINATION
```

Only after review, repeat with `--confirm PREVIEW_HASH`. The hash binds the source, destination, revision and timezones. The tool rejects a changed preview or nonempty destination and leaves the legacy source intact. Do not create new care records in the destination account before the initial migration.

## Deployment

Live application: https://carebuddy.life. The account/action release was verified on 7 October 2026 with 101 passing tests and real DeepSeek proposals/confirmed writes. Code, dependencies and SQLite backup: `/home/ubuntu/care-buddy-backups/accounts-20261007-112554`.

[Approved account/action design](docs/superpowers/specs/2026-10-07-account-owned-buddy-actions.md) · [Implementation and verification](docs/superpowers/plans/2026-10-07-account-owned-buddy-actions.md)
