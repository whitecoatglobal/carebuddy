# Buddy browser-owned MCP writes

Approved: keep browser ID and no-login interface; restricted MCP proposes changes, human Confirm saves server-side, authoritative saved state updates Today. Each browser ID owns one existing JSON snapshot containing its care records. This does not convert browser IDs into verified human identities.

Backend contract:
- Existing visibility/header middleware remains. Never accept owner/client ID override or browser state as Buddy context.
- GET /api/state/:clientId returns {clientId,state,revision,updatedAt}.
- POST /api/state/:clientId/bootstrap {state,expectedRevision} only initializes a snapshot with no profiles and revision 0; never replaces existing care data. Old unrestricted PUT state is disabled.
- POST /api/commands {command,actionId,profileId,expectedRevision} validates current shared Command, uses transactional client-owned snapshot with revision checks and idempotent receipts; returns {state,revision}. Chat metadata and selections do not increment business revision; server stamps time and actor.
- POST /api/buddy/interpret {message,profileId,contextId?,scope?} reads own server snapshot. TokenHub function calls bridge to real private MCP list/call. Only selected-profile context is exposed; permission-changing and destructive tools absent. Tools prepare typed commands and pending proposals, never execute writes from model text.
- POST /api/proposals/:id/confirm {profileId} executes stored command only, checks browser ownership, profile/manage permissions, expiry and revision. Returns {state,revision}; writes saved chat receipt after transaction. Repeat confirmation is idempotent.
- Safe proposals cover supported reminder create/edit/complete/undo/snooze, family add/update names, appointment edit/checklist toggles, benefit notes and two reminder preferences. No new provider booking or unsupported schema behavior is inferred.

Frontend contract:
- FIFO client schedules initialization, commands, Buddy and confirm using current revision at execution; no whole-state upload after commands.
- App state and success messages update only from server response. Local cache is display cache after successful response. Errors do not claim save. On conflict refresh current server state and require review of stale changes.
- Buddy returns {text,action?,state,revision}. Action supports optional proposalId, revision and expiresAt. Plain language labels: Review change, Confirm, Saved. Model infrastructure stays out of product text.
- Existing SQ UI, sample health/sleep/weather and current default-visible browser policy retained.

Tasks: backend/MCP and API tests; frontend queued persistence and tests; shared Action metadata; independent spec/security review; complete build and browser/provider tests; backup and deploy; commit/push reviewed changes. No manual changes to users' care records.
