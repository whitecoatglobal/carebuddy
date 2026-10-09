# Scheduling in your assistant

## Codex in the desktop app

Use the available native automation/scheduled-task tool. For a request in an existing conversation, create a recurring follow-up on that conversation (heartbeat when that tool distinguishes heartbeat from standalone tasks). Use the care-monitor prompt in SKILL.md and the requested cadence, defaulting to 15 minutes. Keep the task quiet unless it finds new actionable notifications or a connection problem requiring action. Do not create a repository task or a new conversation per check unless the user asks for it. After successful creation, report the schedule and how to stop it. If the native scheduler is unavailable in this client, tell the user to open the plugin in the desktop app and ask there to schedule checks.

Local scheduled checks need the computer powered on and the app running. The plugin must be enabled in the scheduled conversation. OS/app notification permissions control whether alerts appear outside the app. Installation does not grant these permissions or enable a schedule by itself.

Official instructions: https://learn.chatgpt.com/docs/automations?surface=app

## Claude / Cowork scheduled tasks

For a user requesting durable background checks in Claude, use its native scheduled-task creation capability when available, with the care-monitor prompt and a cadence supported by the account's Scheduled controls. Account-installed plugins can be used by scheduled tasks. Complete the host's review/confirmation workflow and report the actual saved cadence; do not substitute an unsupported 15-minute interval or imply a task was created before the host confirms it. New cloud scheduled tasks can run without the computer awake; older local tasks can retain local running requirements. Verify that this personal MCP connection is available to the scheduled task. If the scheduler cannot access the plugin, provide the one-off check and the Claude Code option below.

Official instructions: https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork

## Claude Code

Use the session's native scheduling tools (`CronCreate`, `CronList`, `CronDelete`) if available. First list existing tasks and reuse any Care Buddy monitor. For the default cadence create a recurring `*/15 * * * *` task with the care-monitor prompt. If the user specifies another cadence, translate it to a supported schedule. Confirm the returned task ID. To stop, delete only that monitor's task. Do not run an endless shell loop, enable an unrelated hook, or modify global shell startup files.

The user can also start the monitor with:

```
/loop 15m /care-buddy:care-monitor
```

Claude Code's loop fires while the session is running and idle. Recurring tasks expire according to Claude's current session scheduling policy (currently seven days). Closing the session stops checks; a paused computer cannot poll. For persistent desktop scheduling, the user must configure a Claude Desktop scheduled task with access to this MCP connection. Do not imply that this plugin installs a cloud monitor or a device notification service. If scheduling tools are unavailable, show the `/loop` command and confirm only the one-off check.

Official instructions: https://code.claude.com/docs/en/scheduled-tasks
