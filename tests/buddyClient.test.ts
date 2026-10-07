import { afterEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import { AccountClient } from "../src/syncClient";
import { interpretBuddyMessage } from "../src/buddyClient";
const client = () =>
  new AccountClient(
    {
      state: emptyState(),
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
afterEach(() => vi.unstubAllGlobals());
it("surfaces the server AI error without a local reply", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: "Buddy AI is not configured" }), {
        status: 503,
      }),
  );
  await expect(
    interpretBuddyMessage(client(), "Hello", "p-me"),
  ).rejects.toThrow("Buddy AI is not configured");
});
it("reports an unreachable server instead of returning a local reply", async () => {
  vi.stubGlobal("fetch", async () => {
    throw Error("network");
  });
  await expect(
    interpretBuddyMessage(client(), "Hello", "p-me"),
  ).rejects.toThrow("Could not reach Buddy");
});
it("submits account context only and returns the server owned transcript and proposal", async () => {
  const state = emptyState();
  const action = { proposalId: "proposal" };
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ text: "Review this", state, revision: 3, action }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const reply = await interpretBuddyMessage(
    client(),
    "Move it",
    "p-me",
    "r-1",
    "future",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    message: "Move it",
    profileId: "p-me",
    contextId: "r-1",
    scope: "future",
  });
  expect(reply).toMatchObject({ state, revision: 3, action });
});
