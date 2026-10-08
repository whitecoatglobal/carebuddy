# Live Today clock and refresh

Verified source: ensureClientState returns stored state.now unchanged; Today date/reminder filters use it. Screenshot shows stored7Oct while Saved change starts8Oct. Normal snapshots must project real server time in the existing Singapore/+08 scheduling contract rather than freeze the saved clock.

Add server-owned clock_mode live/reference column, default live for every existing/new browser. ensureClientState validates saved data, sets response clockMode from SQL, projects current SG time in live mode, then materializes current occurrences without overwriting past data or source JSON just to read. Deliberate manual advanceClock/scenario use reference mode; restoreClock/reset return live. Do not accept mode from bootstrap/AI. Return clockMode as optional State metadata; API reads and saved responses remain authoritative. Keep reference controls deliberately labelled.

Frontend: refresh the queued owned snapshot when entering Today, refocusing or visible-day rollover while no form/pending/save/AI interaction is active. Do not publish late refresh into another browser/profile intent or overwrite unsaved form fields. Next Up chooses actual future reminders; overdue items remain in Earlier timeline, not the Next Up hero. Date/timeline calculations use real timestamp comparisons and SG local day. No local writes/whole uploads and no reset/reseed.

Tests: stale yesterday snapshot read/current date/current schedules, live clock validates next occurrence using actual date, explicit reference-mode advance/restore retained, owned refresh FIFO and UI stale clock/day rendering, past appointments excluded; preserve all saved record JSON/visibility on migration. Back up, verify isolated browser + live endpoint, deploy/push.

Completed and independently reviewed. Verified screenshot's unique owner/request had frozen 7Oct clock and already-saved 8Oct10am occurrence. All149tests/builds, five new browser tests, three UIregressions and automatic-save browser flow pass. Deployed live; exact API now8Oct10am with readonlypreservation. Backup live-today-20261008-063321. No care records reset/reseeded or manuallyedited.
