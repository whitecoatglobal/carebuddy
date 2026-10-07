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
    if (!completion.toolCall) return { text: completion.text! };
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
      updateChecklist: "Update appointment checklist",
      createAppointment: "Add appointment record",
      editAppointment: "Update appointment record",
      addBenefitNote: "Add benefit note",
      updateBenefitNote: "Update benefit note",
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
      text: `### Review this change\n\n${labels[command.type]} for **${profile.displayName.replace(/[\\*_\[\]<>]/g, "\\$&")}**. Check the details below, then confirm to save.`,
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
