import {
  type State,
  type Action,
  buildChatAction,
  validateState,
  emptyState,
} from "care-buddy-shared";

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

export function interpretBuddyMessage(
  rawState: unknown,
  message: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
): InterpretResult {
  const state = normalizeState(rawState);
  const result = buildChatAction(
    state,
    message,
    contextId ?? undefined,
    scope ?? undefined,
  );
  return {
    text: result.text,
    sourceId: result.sourceId,
    needsScope: result.needsScope,
    action: result.action,
  };
}

function normalizeState(raw: unknown): State {
  if (raw && typeof raw === "object" && validateState(raw)) {
    return raw as State;
  }
  const fresh = emptyState();
  fresh.started = true;
  return fresh;
}
