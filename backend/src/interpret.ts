import {
  type State,
  type Action,
  execute,
  uid,
  validateState,
} from "care-buddy-shared";
import {
  completeBuddyChat,
  TokenHubError,
  type TokenHubMessage,
} from "./tokenHub.js";
import { BUDDY_SYSTEM_PROMPT } from "./buddyPrompt.js";
import {
  AI_TOOL_DEFINITIONS,
  commandFromTool,
  CommandValidationError,
} from "./commands.js";

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
  const context = {
    now: state.now,
    timeZone: options?.timeZone,
    profile,
    reminders: state.reminders.filter(
      (r) => r.profileId === profile.id && !r.deletedAt,
    ),
    appointments: state.appointments.filter((a) => a.profileId === profile.id),
    benefits: state.benefits.filter((b) => b.profileId === profile.id),
    contextId: contextId ?? null,
    scope: scope ?? null,
  };
  const history = state.chats
    .filter((c) => c.profileId === profile.id)
    .slice(-12);
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
    ...history.map((c) => ({ role: c.role, content: c.text })),
    { role: "user", content: message },
  ];
  const completion = await completeBuddyChat(
    messages,
    profile.canManage ? AI_TOOL_DEFINITIONS : [],
  );
  if (!completion.toolCall) return { text: completion.text! };
  const command = commandFromTool(
    completion.toolCall.name,
    completion.toolCall.arguments,
  );
  if (
    !profile.canManage ||
    ("input" in command && command.input.profileId !== profile.id)
  )
    throw new CommandValidationError();
  if (
    "id" in command &&
    ![profile, ...records.filter((r) => r.profileId === profile.id)].some(
      (r) => r.id === command.id,
    )
  )
    throw new CommandValidationError();
  const actionId = uid();
  try {
    execute(state, command, actionId, profile.id);
  } catch (error) {
    throw new TokenHubError(
      error instanceof Error ? error.message : "Invalid care change.",
      400,
      "INVALID_COMMAND",
    );
  }
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
}
