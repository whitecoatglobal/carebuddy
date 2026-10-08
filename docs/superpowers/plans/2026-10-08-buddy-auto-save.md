# Buddy automatic save

User explicitly requested supported Buddy changes without a second confirmation step. Preserve browser namespace/visibility checks, selected-profile/manage checks, strict MCP allowlist, transactions, audit, revision fencing and honest saved status. Do not grant permissions or add destructive/medical tools.

- Clear requests authorize the supported change directly. Missing required details still require clarification. “9 pm daily” already specifies the regular schedule; do not ask its scope again.
- Add required stable requestId to Buddy API. Persist browser-scoped request fingerprint/result. Same request retry returns saved result/current state without repeating inference or mutation; changed payload for same ID conflicts.
- MCP validates selected server-owned context and command. The backend applies the command, stores server Saved receipt and chat, and returns updated snapshot in the same transaction. No pending action is returned for new automatic saves.
- Receipt marks confirmation=false and authorization=chat_request; never falsely claim the user pressed Confirm. Saved-status validation and UI recognise explicit chat-request authorization. Manual forms retain their review flow.
- Old pending proposals/Confirm endpoint remain valid only for prior pending changes; never auto-run old proposals.
- Tests verify auto-save without Confirm, per-browser idempotency, revision races, rollback on failure, view-only/unsupported denial, no accidental permission grants, and Today immediate/reload reflection. Back up and deploy, retain all original care data, commit/push.

Completed: automatic transactional saves and browser-scoped request deduplication, request-authorized receipts without a false manual confirmation, persistent per-payload retry IDs, natural success text, no confirmation dialog and no redundant daily scope question. 122 tests/builds and isolated/real-provider/live browser checks passed. Existing data and permissions retained. Deployed with backup buddy-auto-20261008-050243; QA removed.
