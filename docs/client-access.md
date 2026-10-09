# Browser access

Care Buddy opens without an account login. A browser keeps a `care-buddy.client-id` reference in local storage; the backend uses it to locate care state and an administrative visibility flag.

| `state_snapshots.is_visible` | Effect |
| --- | --- |
| `1` | Allows this browser reference to use care APIs |
| `0` | Blocks care APIs and shows the access screen |

New browser references are allowed by default. Existing manually blocked rows remain blocked through ordinary registration, reads and care changes.

## Administrative access control

Read the reference from the blocked screen or the browser developer console:

```js
localStorage.getItem("care-buddy.client-id")
```

In the server's SQLite administration tool, find the exact row and update its visibility:

```sql
SELECT client_id, is_visible, updated_at
FROM state_snapshots
WHERE client_id = 'client-your-browser-id';

UPDATE state_snapshots
SET is_visible = 1
WHERE client_id = 'client-your-browser-id';
```

Set the same row to `0` to revoke access, then use **Check again** in the browser. Confirm the update affected the intended row. No service restart is required.

## Enforcement

- Protected requests send `X-CareBuddy-Client-Id`; record-path IDs must match it.
- The server checks browser visibility and profile permissions before care/provider work.
- State uploads cannot change the administrative visibility flag.
- The old whole-state overwrite API is disabled. Typed commands and validated Buddy tools own writes.
- `/api/access` exposes only the requesting browser's status; list endpoints do not enumerate other browsers.
- Care responses use `Cache-Control: no-store`; the frontend checks access before displaying cached care records.
- Notification plugin tokens are separately scoped and recheck the underlying browser/profile access.

## Identity boundary

A browser reference can be copied or manually changed. It is a prototype namespace, not authenticated human identity or production tenant isolation. Clearing local storage or switching browsers creates a new reference. Revocation stops new access and cannot erase information already downloaded.
