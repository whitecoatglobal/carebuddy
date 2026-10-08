import { expect, it } from "vitest";
import { emptyState, execute, validateState } from "care-buddy-shared";
function state(status: string, receipt?: unknown) {
  const s = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Test person",
    acknowledged: true,
  });
  s.chats = [
    {
      id: "message",
      profileId: "p-me",
      role: "assistant",
      text: "Reply",
      contextId: null,
      timestamp: s.now,
      operationStatus: status,
      ...(receipt ? { actionReceipt: receipt } : {}),
    },
  ] as any;
  return s;
}
it("rejects unsupported assistant operation statuses", () => {
  expect(validateState(state("invented-success"))).toBe(false);
});
it("requires a confirmed saved receipt for the saved status", () => {
  expect(validateState(state("saved"))).toBe(false);
});
it("keeps no-change and pending confirmations valid without a saved receipt", () => {
  expect(validateState(state("not_changed"))).toBe(true);
  expect(validateState(state("pending_confirmation"))).toBe(true);
});

it("accepts a server saved receipt authorized by the explicit chat request", () => {
  const receipt = {
    actionId: "saved-request",
    sourceIds: [],
    profileId: "p-me",
    actor: "client-test",
    operation: "Update reminder",
    confirmation: false,
    authorization: "chat_request",
    outcome: "Saved",
    timestamp: new Date().toISOString(),
  };
  expect(validateState(state("saved", receipt))).toBe(true);
});
