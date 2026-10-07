# Account-owned Buddy actions

Approved by the user on 7 October 2026: separate signed-in accounts, server-validated AI actions, review before every AI write, transactions, duplicate-request protection, audit history, and reviewed legacy ownership migration.

## Architecture and API

The signed-in account owns a SQLite `account_states` row. Client IDs and client-supplied State objects are not authorization. Password login uses scrypt and random server sessions in HttpOnly cookies, with production Secure cookies and CSRF/Origin checks. Existing anonymous snapshot APIs are closed. Existing legacy snapshots remain available only to the server administrator for a reviewed migration.

Frontend bootstrap: `GET /api/auth/session`; registration/login return `{user,csrfToken,state,revision}`. Ordinary app edits use `POST /api/commands` with `{command,actionId,expectedRevision,profileId}`. The server validates the command, owner, selected person, permissions, duplicates and expected revision before transactional execution. The browser displays success after the server responds.

Buddy uses `POST /api/buddy/interpret` with the message and selected profile ID. The server loads authoritative records and conversation, calls DeepSeek with typed tools, validates returned arguments and persists a read-only proposal. The response includes a before/after preview. `POST /api/proposals/:id/confirm` executes the stored proposal only, for its original account and profile, while its revision and expiry are valid. Repeated confirmation returns the existing result without another write. Chat and profile selection do not advance business revision.

AI tools can create/update reminders and appointment records, update family display details, edit custom checklist items, add/update benefit notes, and set existing preferences. AI cannot change account ownership, permissions, credentials, medical treatment, authoritative insurance coverage, or provider-confirmation status. Tool arguments cannot contain SQL. Missing details are asked for in conversation. A record in the app is not a clinic booking.

## Data and compatibility

Keep the existing shared domain executor for validated commands, adding appointment creation, stable custom checklist items and note editing. Execute with the authenticated account ID as actor. Existing three-boolean checklists retain their original semantics; custom labeled items are a separate optional field. Use server time and the account's validated timezone for new operations.

New account/session/state/proposal/idempotency/audit tables are additive. Do not auto-claim a legacy client ID from a web request. Admin migration must preview source client ID, destination username and record counts, reject a nonempty destination, require explicit confirmation and leave the legacy source intact. The user still needs to identify the destination account and source records before actual migration.

## Verification and release

Test unauthenticated access, CSRF, account isolation, invalid tools, wrong profile, missing details, proposal-before-write, concurrent/stale edits, expiry, duplicate requests, duplicate reminders, transaction rollback, actor/audit attribution, sign-out/account switching and the full browser confirmation flow. Use isolated test databases and fictional records. Back up code and SQLite before deployment. No live legacy reassignment without reviewed mapping.
