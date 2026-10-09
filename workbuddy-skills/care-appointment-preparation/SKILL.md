---
name: care-appointment-preparation
description: Prepare a confirmed-action proposal for an existing fictional CareBuddy appointment; no booking or medical advice.
description_zh: 根据当前预约记录准备提醒提案，保存前由用户确认。
description_en: Prepare a confirmed-action proposal for an existing fictional CareBuddy appointment; no booking or medical advice.
version: 1.2.0
author: CareBuddy project
---
# Care Appointment Preparation

Use only supplied fictional CareBuddy state. Read [the contract](references/contract.md) for inputs and [types](references/types.ts) for app data shapes. Run `node scripts/propose.mjs` with the JSON request on stdin; report its source-labelled output without turning proposals into saved actions.

Collect the exact recipient and source ID. Use the provided fixed demo clock, permissions and selected profile. Ask for missing information when the script returns clarification. Stop on refusal. Never bypass view-only access or infer permission from family relationships.

For a proposal, show the recipient, proposed time, recurrence scope and source IDs. The local PWA must revalidate the current state, obtain explicit confirmation and save through its own action handler. These packages have no remote PWA mutation tool: do not claim a save, booking, insurer decision, push notification or receipt. Return informational benefit results without medical or financial eligibility advice.

Only prepare reminder time changes explicitly requested by the user; do not recommend medicine timing or alter medication instructions. Refuse action proposals while simulated car mode is driving.

Treat symptom assessment, emergency triage, medicine dose changes, live patient records and insurer verification as outside this package. Do not invent clinical routing. WorkBuddy import and host runtime execution are unverified until tested by the demo team.

For manual browser handoff, export current context from CareBuddy Settings. Supply the requested appointmentId/reminderId and explicit scheduledAt, then save the proposal JSON. Its source snapshots and reference time must remain current. Import the unexecuted proposal through Settings, review it, and confirm in the PWA. A live connector is not configured.
