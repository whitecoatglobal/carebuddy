# Care Buddy browser whitelist

Access follows the browser's existing `care-buddy.client-id` local-storage value. There is no login screen or module permission table. The SQLite `state_snapshots` table has one added column:

| Column | Value | Effect |
| --- | --- | --- |
| `is_visible` | `1` | Allows this browser ID to use the app and care APIs |
| `is_visible` | `0` | Blocks care APIs and shows the access screen |

## Configure access

1. Open Care Buddy in the browser. New browser IDs are allowed by default. A manually blocked browser shows its ID on the blocked screen. You can also run `localStorage.getItem("care-buddy.client-id")` in that browser's developer console.
2. That first access check registers a new, empty database row with `is_visible=1`, without replacing existing records or changing an explicit block.
3. Open the server database `/home/ubuntu/care-buddy/data/care-buddy.db` in your SQLite administration tool, find the exact `client_id`, and set `is_visible` to `1`.
4. Click **Check again** in the browser.

SQL equivalent (replace the example ID with the exact browser ID):

```sql
SELECT client_id, is_visible, updated_at
FROM state_snapshots
ORDER BY updated_at DESC;

UPDATE state_snapshots
SET is_visible = 1
WHERE client_id = 'client-your-browser-id';
```

Set the same row to `0` to revoke access. No service restart is required. Confirm the update affected exactly one row. Do not add an HTTP API that lets browsers update this flag.

## Enforcement

- Each care-data, sync, Buddy and health-snapshot request sends `X-CareBuddy-Client-Id`.
- The server looks up `is_visible` on every protected request and rejects missing, invalid or blocked IDs before care database/provider work.
- IDs in record paths or an explicitly supplied body `clientId` must match the header.
- The record-list endpoint returns only the requesting client ID; it no longer exposes all clients.
- The existing full-state upload and AI context contract is preserved. Uploaded JSON cannot alter the database access column.
- Missing IDs are rejected. New browser rows default to allowed; existing manually blocked rows stay blocked. The shared `client-local` storage-error fallback is always rejected, even if flagged visible.
- `/api/access` exposes only the requesting ID and access status. Non-personal service status and weather remain public.
- Care/API responses use `Cache-Control: no-store`. The frontend checks access before rendering existing locally cached care records.
- Clearing local storage or changing browsers produces another ID that must be separately approved. Previously downloaded records cannot be remotely erased through revocation.

## Identity limitation

This is a browser-ID allowlist, not authenticated user identity. An approved ID can be copied or spoofed, including through manually edited local storage or request headers. It does not establish that the requester is the record's human owner. The whitelist must not be described as secure account isolation.

## Deployment

The initial whitelist release used a blocked default; the owner subsequently changed the policy to allow by default. Application INSERTs explicitly set `is_visible=1`, including on older databases whose underlying SQL column default remains 0. Existing rows set to 0 are never re-enabled by access checks or ordinary uploads. New databases add the column with SQL default 1. The policy update enabled all existing rows once, as requested. Retain the existing TokenHub credentials and database directory. Back up the database and application first, then approve only the supplied IDs and verify both allowed and blocked requests.

## Verification and current rollout — 8 October 2026

- 68 tests passed after integrating SQ's interface refresh (`c87317d`), including legacy schema preservation, matching route IDs, default denial, immediate API revocation, protected AI/health requests, non-enumerating client lists and access flags unaffected by state uploads.
- Shared, backend and frontend builds passed. A local production browser check verified blocked access, database approval opening the app, and revocation blocking after reload.
- The column has been added to the live database. All 129 existing snapshots and timestamps stayed unchanged; SQLite integrity was `ok`. Existing rows have `is_visible=0`.
- Database backup: `/home/ubuntu/care-buddy-backups/visibility-column-20261008-033918`.
- The owner subsequently requested approval of every existing database row. The gate is now deployed; the current rollout is documented below.

## Live activation — 8 October 2026

- Deployed the access gate from `59e49ec`, retaining SQ's refreshed interface and public-demo build configuration.
- With the service stopped, backed up the database and set all 129 existing `state_snapshots` rows to `is_visible=1`, as explicitly requested by the owner. Existing snapshot JSON and timestamps were verified unchanged. New browser IDs still default to 0.
- Backup of the database and previous application: `/home/ubuntu/care-buddy-backups/client-access-20261008-034251`.
- All 68 tests and shared/backend/frontend production builds passed before deployment. Staged Linux allow/deny checks passed.
- Live Chrome verification using isolated temporary browser IDs confirmed an approved ID opens the care interface without a login/password screen, a new ID shows the access-blocked screen, another client's record path is denied, and the ID-list endpoint exposes only the requesting ID.
- Test rows were removed; 129 approved rows remained and SQLite integrity was `ok`. Provider credentials and existing care record content were preserved.

## Default-allow policy update — 8 October 2026

The owner requested default visibility 1. Deployed application INSERTs now create both access-registration and ordinary new snapshot rows with `is_visible=1`. Existing rows explicitly set to 0 retain that value through access checks and upserts.

All 129 existing rows were set to 1 again during deployment; saved JSON and timestamps stayed unchanged. Backup: `/home/ubuntu/care-buddy-backups/client-access-default-allow-20261008-034857`.

70 tests and both builds passed. Live Chrome confirmed a new browser ID automatically opens the app without login, then an administrative change to 0 blocks that browser and remains blocked on repeated access checks. The QA row was removed; database integrity was `ok`.
