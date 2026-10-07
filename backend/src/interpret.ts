import {
  type State,
  type Action,
  buildChatAction,
  validateState,
} from "care-buddy-shared";
import {
  completeBuddyChat,
  TokenHubError,
  type TokenHubMessage,
} from "./tokenHub.js";
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
  const result = buildChatAction(
    state,
    message,
    contextId ?? undefined,
    scope ?? undefined,
  );
  if (state.carMode === "driving") return result;
  const context = {
    now: state.now,
    profile,
    reminders: state.reminders.filter(
      (r) => r.profileId === profile.id && !r.deletedAt,
    ),
    appointments: state.appointments.filter((a) => a.profileId === profile.id),
    benefits: state.benefits.filter((b) => b.profileId === profile.id),
    contextId: contextId ?? null,
    domainGuidance: result.text,
    confirmationRequired: !!result.action || !!result.needsScope,
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
  const aiText = await completeBuddyChat(messages);
  return {
    text: result.action || result.needsScope ? result.text : aiText,
    sourceId: result.sourceId,
    needsScope: result.needsScope,
    action: result.action,
  };
}
