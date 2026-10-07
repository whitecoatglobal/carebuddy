import { AccountClient, type InterpretResult } from "./syncClient";
export type BuddyInterpretResult = InterpretResult;
export function interpretBuddyMessage(
  client: AccountClient,
  message: string,
  profileId: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
): Promise<InterpretResult> {
  return client.interpret(message, profileId, contextId, scope);
}
export function isBackendEnabled(): boolean {
  return true;
}
