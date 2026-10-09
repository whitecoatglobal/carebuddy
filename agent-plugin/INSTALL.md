# CareBuddy for {{ASSISTANT}}

This personal export connects your assistant to the people and alert types you selected in CareBuddy. It fetches the latest saved care data through a remote MCP server. No application server, Node installation or wearable pairing is needed on your computer.

The ZIP includes a private connection credential. Keep the extracted folder private; do not upload it to GitHub, share it, or copy its MCP headers into a chat. The server stores only a hash of the credential. Access expires on **{{EXPIRES_AT}}** and can be revoked immediately from https://carebuddy.life/integrations in the same browser that made the export. It can read relevant care notifications and remember delivery, but cannot edit care records.

## Codex desktop

1. Extract the ZIP and keep the `care-buddy-export` folder on disk.
2. Open that folder as a local project in Codex, then restart the desktop app to refresh its local plugin marketplace. In Plugins, select **CareBuddy personal export** and install/enable **CareBuddy**. If your Codex CLI supports marketplace commands, you can instead register the extracted folder with `codex plugin marketplace add /absolute/path/to/care-buddy-export`, then choose its plugin in the desktop app.
3. Start a conversation with the plugin enabled and ask: **"Use CareBuddy to check my care notifications, then monitor in the background every 15 minutes."** The care-monitor skill verifies the connection and uses the native scheduler when available. Check that the assistant confirms a created schedule; installing the plugin alone does not start monitoring.
4. Keep your computer on and the app running for local scheduled checks. Enable app/OS notifications if you want alerts outside the app. Scheduled checks consume your assistant's usage allowance.

The portable `plugin.json` and `mcp.json` files follow Agent Plugins 1.0.0. A Codex compatibility manifest and HTTP MCP config are also included for local clients that use the earlier format.

## Claude Code

From the directory containing the extracted folder:

```sh
claude plugin marketplace add ./care-buddy-export
claude plugin install care-buddy@care-buddy-personal
```

In a new Claude Code session, run `/care-buddy:care-monitor` for a check, then:

```
/loop 15m /care-buddy:care-monitor
```

If you prefer to test without installing, run `claude --plugin-dir ./care-buddy-export/plugins/care-buddy`, then use the same skill. The session must stay running; `/loop` is session polling, not an always-on cloud service. Claude Desktop durable scheduling requires its own scheduled-task setup with access to the MCP connection. This ZIP does not install that task automatically.

## What prompts you

- Routines within 15 minutes, due routines, and unrecorded routines from the past 24 hours. A later unrecorded status may create one follow-up; it never claims a medication was missed.
- Saved appointments within 24 hours and a further prompt within one hour. Clinic confirmation is still needed.
- Recent unread care alerts.
- If enabled, fresh health readings outside general adult reference ranges and readings older than 24 hours. Fictional readings retain a demo label. These are general prompts, not clinical diagnoses or emergency monitoring.

Alerts are remembered as delivered only after the assistant reports them. Repeated unchanged checks stay quiet. New or changed care, including snoozed times and health measurements, can generate new notifications. Each exported connection has its own delivery history. Changing people or alert preferences requires a new export; revoke the old connection to prevent duplicates.

## Stop or reconnect

Ask the assistant to stop its CareBuddy monitor, or revoke this connection in CareBuddy Settings → Connect your AI assistant. A disconnected assistant must not report that everything is fine. If the connection expires, download and install a new personal export.

Installation references: https://developers.openai.com/plugins/build/plugins and https://code.claude.com/docs/en/plugin-marketplaces
