import { expect, it, vi, afterEach } from "vitest";
import { emptyState } from "care-buddy-shared";
import { AccountClient } from "../src/syncClient";
import * as app from "../src/App";
afterEach(() => vi.unstubAllGlobals());
it("keeps authoritative FIFO snapshots but does not reopen an old person proposal after selection intent changes", async () => {
  const state = emptyState();
  state.selectedProfileId = "A";
  let resolveReply!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/interpret")
        ? new Promise<Response>((resolve) => {
            resolveReply = resolve;
          })
        : Promise.resolve(
            new Response(
              JSON.stringify({
                state: { ...state, selectedProfileId: "B" },
                revision: 1,
              }),
            ),
          ),
    ),
  );
  const client = new AccountClient(
    {
      state,
      revision: 0,
      csrfToken: "csrf",
      user: {
        id: "u",
        username: "owner",
        displayName: "Owner",
        timeZone: "UTC",
      },
    },
    () => {},
  );
  let selectionGeneration = 0;
  const captured = selectionGeneration;
  const response = client.interpret("Change A reminder", "A");
  await Promise.resolve();
  selectionGeneration++; // User chooses B immediately, while its server command waits behind interpretation.
  const selected = client.command(
    { type: "selectProfile", profileId: "B" },
    "A",
    "select-B",
  );
  const proposalUi = vi.fn();
  let visible = state;
  resolveReply(
    new Response(
      JSON.stringify({
        state,
        revision: 0,
        text: "Review",
        action: { proposalId: "A-proposal" },
      }),
    ),
  );
  const reply = await response;
  app.applyBuddyReplyForSelection(
    captured,
    () => selectionGeneration,
    reply,
    (snapshot) => {
      visible = snapshot.state;
    },
    proposalUi,
  );
  expect(visible.selectedProfileId).toBe("A"); // Server snapshot alone cannot prove current user intent.
  expect(proposalUi).not.toHaveBeenCalled();
  expect((await selected).state.selectedProfileId).toBe("B");
});
it("applies a reply when selection intent still matches, but blocks a reply after switching away and back", () => {
  const reply = { state: emptyState(), revision: 0, text: "Review" };
  const snapshot = vi.fn(),
    ui = vi.fn();
  let generation = 0;
  app.applyBuddyReplyForSelection(0, () => generation, reply, snapshot, ui);
  expect(ui).toHaveBeenCalledTimes(1);
  generation = 2;
  app.applyBuddyReplyForSelection(0, () => generation, reply, snapshot, ui);
  expect(snapshot).toHaveBeenCalledTimes(2);
  expect(ui).toHaveBeenCalledTimes(1);
});
