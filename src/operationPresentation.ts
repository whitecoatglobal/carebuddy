import type { ChatMessage, Profile, State } from "./types";

export function chatOperationLabel(
  message: ChatMessage,
  state: Pick<State, "appliedActions">,
): string | null {
  if (message.role !== "assistant") return null;
  switch (message.operationStatus) {
    case "saved":
      return "Saved";
    case "pending_confirmation":
      return "Awaiting confirmation";
    case "not_changed":
      return "No records changed";
  }
  // Earlier server snapshots can lack the explicit status. Only a confirmed
  // receipt tied to an applied action for this same person demonstrates a save.
  const receipt = message.actionReceipt;
  return (receipt?.confirmation === true ||
    receipt?.authorization === "chat_request") &&
    receipt.outcome === "Saved" &&
    receipt.profileId === message.profileId &&
    state.appliedActions.includes(receipt.actionId)
    ? "Saved"
    : "No records changed";
}

export function displayActor(
  actor: string | null | undefined,
  clientId: string,
  profiles: Pick<Profile, "id" | "displayName">[],
): string {
  if (!actor || actor === "p-me") return "Me";
  if (actor === clientId) return "You";
  const profile = profiles.find((profile) => profile.id === actor);
  if (profile) return profile.displayName;
  if (actor.startsWith("client-")) return "Another caregiver";
  if (actor.startsWith("p-")) return "Caregiver";
  return actor;
}
