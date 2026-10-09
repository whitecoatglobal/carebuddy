# CareBuddy for Claude

This personal plugin reads the latest notifications for the people you selected in CareBuddy. It cannot edit care records. Its only write tool remembers which alerts have been delivered, so unchanged checks stay quiet.

## Add to Claude

In Claude, open **Customize → Plugins** and use the custom plugin upload option to upload the ZIP you downloaded. In Cowork, open the Cowork tab first. Enable CareBuddy and its MCP connection, then ask Claude to **"Use CareBuddy to check my care notifications."**

For background checks, ask Claude to schedule regular CareBuddy checks using the care-monitor skill and a cadence supported by your Scheduled controls. Review the actual cadence and click Schedule when Claude proposes the task. The plugin does not create a task automatically. New Claude scheduled tasks can run remotely with account-installed plugins; availability depends on your plan and rollout. If your connection cannot be used remotely, use the local Claude Code option below instead. Do not assume monitoring is active until a task is confirmed.

## Claude Code

Extract the ZIP into a private folder named `care-buddy-claude-plugin`. To try the plugin in a session without installing it:

```sh
claude --plugin-dir ./care-buddy-claude-plugin
```

For a persistent local install, register the included marketplace:

```sh
claude plugin marketplace add ./care-buddy-claude-plugin
claude plugin install care-buddy@care-buddy-personal
```

In a new session, run `/care-buddy:care-monitor` to check the connection. To poll every 15 minutes:

```
/loop 15m /care-buddy:care-monitor
```

This loop runs only while Claude Code is running and idle. Recurring loops expire under Claude's session scheduling policy. It does not install a cloud task or OS notification service.

## Private connection

The ZIP contains a private credential in its MCP configuration. Keep it private and do not share it, commit it to GitHub, or paste it into a conversation. Access expires on **{{EXPIRES_AT}}**. Revoke it from https://carebuddy.life/integrations in the same browser that created the export; re-export to change connected people or alert preferences. Revocation stops new reads but does not remove information already displayed in Claude.

The plugin prompts about routines within 15 minutes, due or unrecorded routines, appointments within 24 hours, recent care alerts and opted-in health-reading alerts. It preserves clinic-confirmation and fictional-data labels. Health prompts use general adult reference ranges, not personalised clinical targets. Polling is not emergency monitoring and does not imply that an unrecorded medication was missed. Scheduled checks use your Claude usage allowance.

Official setup: https://support.claude.com/en/articles/13837440-use-plugins-in-claude

Scheduling: https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork and https://code.claude.com/docs/en/scheduled-tasks
