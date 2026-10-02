# Independent Care Buddy polish QA
Observed 30 September 2026 via isolated Chromium pages against latest local dev port 4174. Root owns source; verifier changed no source or main tests.

## Passed runtime checks
- Generic message ‘Remind me to stretch at 6 pm’ proposes explicit6pm single-occurrence reminder. Confirmation saves correct title, person and18:00 timestamp.
- ‘mark stretch done’ proposes completion and records complete for Me; does not use medication taken outcome.
- Routine health check14:00 appointment proposes13:00 preparation; repeated request returns existing prep information with no new confirmation/duplicate.
- Current-person Maya dental query returns Maya unknown-policy conditions/source; Me chat and records are not exposed in Maya thread.
- Leo view-only generic create is denied without confirmation.
- Generic medication snooze in15minutes shows9:15am notification, saves snooze separately and preserves8am original schedule.
- Settings exports JSON via actual browser download; valid source-bound bedtime occurrence import confirms22:30 with otherdays unchanged and saves22:30. Reimport of stale snapshot and forged title snapshot are rejected.
- Pending saved-receipt issue initially found; root fixed. Rechecked actual create/report/preparation/import dialogs now say no save until confirmation and show explicit proposed details.

## Visual observations
- Actual320/390/768/1440 screenshots retained in this directory. No document horizontal overflow at320/768/1440.
- Desktop viewport uses full width with side navigation and two useful columns. Primary care andtimeline actions fit comfortably in1440x900 viewport.
- Compact selector retains clear current-person/access state.
- Fullpage screenshot fixedheader can appear mid-image because prior scroll is retained; desktop-viewport.png is normal viewport and confirms header positioning.

## Findings passed to root
1. Upcoming reminders shown unsorted after creation (bedtime22:30 before preparation13:00). Screenshot today1440 records exact order.
2. Source-import rejection renders no-op Retry (retry=null) and error persists after navigation toToday. Should conditionally show Retry or dismiss/upload-again.

## Limits
Manual WorkBuddy file contract exercised, not WorkBuddy application import/runtime. No liveAI/backend/clinical/securityaudit claims. CodeGraph status/query/callers readback completed for importSkillProposal; this is bounded QA, no exhaustive callgraph coverage claim. Final integrated browser test ownership remains root.

## Final correction readback
Both remaining findings resolved in actual latest runtime. Final scratch probe shows preparation13:00 preceding bedtime22:30 at320/768/1440. Stale and forged imports display Dismiss error, whose click removes alert (count0). Final-readback.txt and report.json retain outputs. Pending dialog saved-language fix also passed in the same repeat probe. No remaining blocker in this bounded QA scope.
