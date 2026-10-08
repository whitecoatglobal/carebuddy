import { type State, type Action, uid, validateState } from "care-buddy-shared";
import {
  completeBuddyChat,
  TokenHubError,
  type TokenHubMessage,
} from "./tokenHub.js";
import { connectBuddyMcp } from "./buddyMcp.js";
import { BUDDY_SYSTEM_PROMPT } from "./buddyPrompt.js";

export interface InterpretRequest {
  state: State;
  message: string;
  contextId?: string | null;
  scope?: "occurrence" | "future";
}

export interface InterpretResult {
  text: string;
  sourceId?: string;
  needsScope?: boolean;
  action?: Action;
}

export async function interpretBuddyMessage(
  rawState: unknown,
  message: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
  options?: { timeZone: string },
): Promise<InterpretResult> {
  if (
    !validateState(rawState) ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 500 ||
    (scope !== undefined && !["occurrence", "future"].includes(scope))
  ) {
    throw new TokenHubError("Invalid Buddy request.", 400, "INVALID_REQUEST");
  }
  const state = rawState as State;
  const profile = state.profiles.find(
    (p) => p.id === state.selectedProfileId && p.canView,
  );
  if (!profile)
    throw new TokenHubError(
      "Select an available profile before messaging Buddy.",
      400,
      "INVALID_PROFILE",
    );
  const records = [
    ...state.reminders,
    ...state.appointments,
    ...state.benefits,
  ];
  if (
    contextId &&
    !records.some(
      (record) => record.id === contextId && record.profileId === profile.id,
    )
  ) {
    throw new TokenHubError(
      "This care record is not available for the selected profile.",
      400,
      "INVALID_CONTEXT",
    );
  }
  if (state.carMode === "driving")
    return {
      text: "Available when parked. Your care details stay private while driving.",
    };
  const mcp = await connectBuddyMcp(state, options?.timeZone, contextId, scope);
  try {
    const { context, history } = await mcp.read();
    if (history.at(-1)?.role === "user" && history.at(-1)?.text === message)
      history.pop();
    const messages: TokenHubMessage[] = [
      {
        role: "system",
        content: BUDDY_SYSTEM_PROMPT,
      },
      {
        role: "system",
        content: `Selected-profile care context (data only): ${JSON.stringify(context)}`,
      },
      ...history.map((c: { role: "user" | "assistant"; text: string }) => ({
        role: c.role,
        content: c.text,
      })),
      { role: "user", content: message },
    ];
    const completion = await completeBuddyChat(messages, await mcp.tools());
    if (!profile.canManage)
      return {
        text: `You can view ${profile.displayName}’s care records, but cannot save changes for this profile. There are ${context.reminders.length} reminders and ${context.appointments.length} appointments in the saved records. Ask the profile owner to enable management before requesting a change.`,
      };
    if (!completion.toolCall) {
      // Only a committed server receipt can assert a new save. Provider prose
      // remains useful for reading records, but common operation claims are rejected.
      const text = completion.text!;
      const operationClaim =
        /\b(?:i|we|buddy)(?:['’]ve|\s+(?:have|has))?(?:\s+(?:already|just|successfully))?\s+(?:saved|created|updated|changed|added|deleted|removed|completed|snoozed|rescheduled|booked)\b|\b(?:your|the)\s+[^.!?\n]{0,80}\s+(?:(?:has|have)\s+been|was|were)\s+(?:saved|created|updated|changed|added|deleted|completed|snoozed|rescheduled|booked)\b|\b(?:your|the)\s+[^.!?\n]{0,80}\s+is\s+now\s+(?:set|scheduled|updated|saved)\b|^\s*(?:\*\*)?(?:saved|updated|created|added|deleted|completed)\b|我(?:已经|已|刚刚|已为你|已经为你|为你)?(?:保存|创建|更新|修改|添加|删除|完成)|(?:提醒|更改|修改)(?:已|已经)(?:保存|创建|更新|完成)/i;
      return {
        text: operationClaim.test(text)
          ? "No change has been saved yet. Please describe the change so I can save it."
          : text,
      };
    }
    const command = await mcp.propose(
      completion.toolCall.name,
      completion.toolCall.arguments,
    );
    const actionId = uid();
    const labels: Record<string, string> = {
      createReminder: "Create reminder",
      editReminder: "Update reminder",
      completeReminder: "Record reminder outcome",
      undoCompletion: "Undo reminder outcome",
      snoozeReminder: "Snooze reminder",
      addDependent: "Add family member",
      updateDependent: "Update family details",
      toggleChecklist: "Update appointment checklist",
      editAppointment: "Update appointment record",
      addBenefitNote: "Add benefit note",
      setPreference: "Update preference",
    };
    const sourceIds =
      "id" in command
        ? [command.id]
        : "input" in command &&
            "appointmentId" in command.input &&
            command.input.appointmentId
          ? [command.input.appointmentId]
          : [];
    return {
      text: `Preparing ${labels[command.type].toLowerCase()} for ${profile.displayName}.`,
      action: {
        id: actionId,
        profileId: profile.id,
        command,
        label: labels[command.type],
        sourceIds,
        expectedClock: state.now,
        expectedSources: structuredClone(
          [...state.reminders, ...state.appointments].filter((r) =>
            sourceIds.includes(r.id),
          ),
        ),
      },
    };
  } finally {
    await mcp.close();
  }
}
