import { expect, it } from "vitest";
import type { ChatMessage } from "../src/types";
import { chatOperationLabel, displayActor } from "../src/operationPresentation";

const message: ChatMessage = {
  id: "assistant-message",
  profileId: "p-me",
  role: "assistant",
  text: "I have finished and saved your changes",
  contextId: null,
  timestamp: "2026-10-08T12:00:00Z",
};
const state = { appliedActions: ["confirmed-action"] };
it("uses authoritative operation status even when model prose claims a completed save", () => {
  expect(
    chatOperationLabel({ ...message, operationStatus: "not_changed" }, state),
  ).toBe("No records changed");
  expect(
    chatOperationLabel(
      { ...message, operationStatus: "pending_confirmation" },
      state,
    ),
  ).toBe("Awaiting confirmation");
  expect(
    chatOperationLabel(
      { ...message, text: "Okay", operationStatus: "saved" },
      state,
    ),
  ).toBe("Saved");
  expect(chatOperationLabel(message, state)).toBe("No records changed");
  expect(chatOperationLabel({ ...message, role: "user" }, state)).toBeNull();
});
it("recognizes legacy saves only with a confirmed receipt matching the person and applied action", () => {
  const receipt = {
    actionId: "confirmed-action",
    sourceIds: [],
    profileId: "p-me",
    actor: "client-mine",
    operation: "Create reminder",
    confirmation: true,
    outcome: "Saved" as const,
    timestamp: message.timestamp,
  };
  expect(
    chatOperationLabel({ ...message, actionReceipt: receipt }, state),
  ).toBe("Saved");
  expect(
    chatOperationLabel(
      { ...message, actionReceipt: { ...receipt, profileId: "p-other" } },
      state,
    ),
  ).toBe("No records changed");
  expect(
    chatOperationLabel(
      { ...message, actionReceipt: { ...receipt, actionId: "unapplied" } },
      state,
    ),
  ).toBe("No records changed");
  expect(
    chatOperationLabel(
      { ...message, actionReceipt: { ...receipt, confirmation: false } },
      state,
    ),
  ).toBe("No records changed");
  expect(
    chatOperationLabel(
      { ...message, operationStatus: "not_changed", actionReceipt: receipt },
      state,
    ),
  ).toBe("No records changed");
});
it("shows people rather than internal browser and profile identifiers in audit fields", () => {
  const profiles = [{ id: "p-mum", displayName: "Mum" }];
  expect(displayActor("client-mine", "client-mine", profiles)).toBe("You");
  expect(displayActor("p-me", "client-mine", profiles)).toBe("Me");
  expect(displayActor("p-mum", "client-mine", profiles)).toBe("Mum");
  expect(displayActor("client-other", "client-mine", profiles)).toBe(
    "Another caregiver",
  );
  expect(displayActor("p-removed", "client-mine", profiles)).toBe("Caregiver");
  expect(displayActor("Alice", "client-mine", profiles)).toBe("Alice");
});

it("recognizes explicit chat-request authorization without claiming a separate confirmation", () => {
  const receipt = {
    actionId: "confirmed-action",
    sourceIds: [],
    profileId: "p-me",
    actor: "client-mine",
    operation: "Update reminder",
    confirmation: false,
    authorization: "chat_request" as const,
    outcome: "Saved" as const,
    timestamp: message.timestamp,
  };
  expect(
    chatOperationLabel({ ...message, actionReceipt: receipt }, state),
  ).toBe("Saved");
  expect(
    chatOperationLabel(
      { ...message, actionReceipt: receipt },
      { appliedActions: [] },
    ),
  ).toBe("No records changed");
});
