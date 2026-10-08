import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";

const snapshot = (revision = 0) => ({ state: emptyState(), revision });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("dequeues commands in order and uses the last committed revision", async () => {
  let release!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot()))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(json(snapshot(2)));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client-test", publish);
  await client.initialize(emptyState());
  const first = client.command({ type: "start" }, "stable-first", "p-me");
  const second = client.command(
    { type: "setPreference", key: "genericReminders", value: false },
    "stable-second",
    "p-me",
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  release(json(snapshot(1)));
  await Promise.all([first, second]);
  expect(
    fetcher.mock.calls
      .slice(1)
      .map((call) => JSON.parse(call[1].body).expectedRevision),
  ).toEqual([0, 1]);
  expect(
    fetcher.mock.calls
      .slice(1)
      .map((call) => JSON.parse(call[1].body).actionId),
  ).toEqual(["stable-first", "stable-second"]);
  expect(publish).toHaveBeenCalledTimes(3);
  expect(client.revision).toBe(2);
});

it("does not publish or advance revision when a command fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot(4)))
    .mockResolvedValueOnce(json({ error: "Save failed" }, 500));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client-test", publish);
  await client.initialize(emptyState());
  await expect(
    client.command({ type: "start" }, "action", "p-me"),
  ).rejects.toThrow("Save failed");
  expect(publish).toHaveBeenCalledTimes(1);
  expect(client.revision).toBe(4);
});

it("refreshes after conflict and rejects already queued stale changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot(1)))
    .mockResolvedValueOnce(json({ error: "Conflict" }, 409))
    .mockResolvedValueOnce(json(snapshot(7)));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client-test", publish);
  await client.initialize(emptyState());
  const results = await Promise.allSettled([
    client.command({ type: "start" }, "first", "p-me"),
    client.command({ type: "start" }, "stale", "p-me"),
  ]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(client.revision).toBe(7);
  expect(publish.mock.calls.at(-1)?.[0].revision).toBe(7);
  await expect(client.confirm("proposal", "p-me", 1)).rejects.toThrow("Review");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("uses stored proposal confirmation and never publishes a failed confirmation", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot(2)))
    .mockResolvedValueOnce(json({ error: "Proposal expired" }, 410));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client-test", publish);
  await client.initialize(emptyState());
  await expect(client.confirm("proposal/id", "p-me", 2)).rejects.toThrow(
    "Proposal expired",
  );
  expect(fetcher.mock.calls[1][0]).toBe("/api/proposals/proposal%2Fid/confirm");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    profileId: "p-me",
  });
  expect(publish).toHaveBeenCalledTimes(1);
  expect(client.revision).toBe(2);
});

it("queues Buddy after saves and adopts its authoritative chat snapshot", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot()))
    .mockResolvedValueOnce(json(snapshot(1)))
    .mockResolvedValueOnce(json({ ...snapshot(1), text: "Review change" }));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const { interpretBuddyMessage } = await import("../src/buddyClient");
  const client = new ServerClient("client-test", vi.fn());
  await client.initialize(emptyState());
  const save = client.command({ type: "start" }, "save", "p-me");
  const buddy = client.run(() =>
    interpretBuddyMessage("p-me", "Change this", "reminder-one", "future"),
  );
  await Promise.all([save, buddy]);
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    "/api/state/client-test",
    "/api/commands",
    "/api/buddy/interpret",
  ]);
  const buddyBody = JSON.parse(fetcher.mock.calls[2][1].body);
  expect(buddyBody).toEqual({
    profileId: "p-me",
    message: "Change this",
    contextId: "reminder-one",
    scope: "future",
    requestId: expect.any(String),
  });
  expect(buddyBody).not.toHaveProperty("state");
  expect(fetcher.mock.calls.every((call) => call[1].method !== "PUT")).toBe(
    true,
  );
});

it("bootstrap runs only for empty revision zero and never replaces existing server records", async () => {
  const local = emptyState();
  local.selectedProfileId = "p-me";
  local.profiles = [
    {
      id: "p-me",
      displayName: "Me",
      relationship: "Self",
      canManage: true,
      canView: true,
    },
  ];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot()))
    .mockResolvedValueOnce(json({ state: local, revision: 1 }));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  await new ServerClient("client-test", vi.fn()).initialize(local);
  expect(fetcher.mock.calls[1][0]).toBe("/api/state/client-test/bootstrap");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    state: local,
    expectedRevision: 0,
  });
  fetcher.mockClear().mockResolvedValue(json({ state: local, revision: 3 }));
  await new ServerClient("client-test", vi.fn()).initialize(local);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("ignores an unbound legacy cache and tolerates a full display cache after save", async () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(() => {
      throw Error("Quota");
    }),
  });
  const { loadDisplayCache, saveDisplayCache } =
    await import("../src/syncClient");
  const fresh = emptyState();
  expect(loadDisplayCache("new-browser", fresh)).toBe(fresh);
  expect(localStorage.getItem).toHaveBeenCalledWith(
    "care-buddy.server-cache.new-browser",
  );
  expect(() => saveDisplayCache("new-browser", fresh)).not.toThrow();
});

it("honors initial and family-add server selection after any pending choice settles", async () => {
  const { ProfileSelection } = await import("../src/syncClient");
  const selection = new ProfileSelection();
  const state = emptyState();
  state.profiles = ["me", "mum", "new-family"].map((id) => ({
    id,
    displayName: id,
    relationship: "Family",
    canManage: true,
    canView: true,
  }));
  state.selectedProfileId = "mum";
  expect(selection.accept(state).selectedProfileId).toBe("mum");
  const token = selection.begin("me");
  expect(selection.accept(state).selectedProfileId).toBe("me");
  state.selectedProfileId = "me";
  selection.accept(state);
  expect(selection.settle(token)?.selectedProfileId).toBe("me");
  expect(
    selection.accept({ ...state, selectedProfileId: "new-family" })
      .selectedProfileId,
  ).toBe("new-family");
});

it("preserves newer profile intent across delayed responses and restores server selection on failure", async () => {
  const { ProfileSelection } = await import("../src/syncClient");
  const selection = new ProfileSelection();
  const state = emptyState();
  state.profiles = ["me", "mum"].map((id) => ({
    id,
    displayName: id,
    relationship: "Family",
    canManage: true,
    canView: true,
  }));
  state.selectedProfileId = "me";
  selection.accept(state);
  const older = selection.begin("me");
  const newer = selection.begin("mum");
  expect(selection.accept(state).selectedProfileId).toBe("mum");
  expect(selection.settle(older)).toBeNull();
  expect(selection.accept(state).selectedProfileId).toBe("mum");
  expect(selection.settle(newer)?.selectedProfileId).toBe("me");
  expect(selection.accept(state).selectedProfileId).toBe("me");
});

it("invalidates a Buddy reply after switching away and back, even when selection fails", async () => {
  const { ProfileSelection } = await import("../src/syncClient");
  const selection = new ProfileSelection();
  const requestedAt = selection.version;
  const first = selection.begin("mum");
  selection.settle(first);
  const second = selection.begin("me");
  selection.settle(second);
  expect(selection.version).not.toBe(requestedAt);
  const latestRequest = selection.version;
  const failedChoice = selection.begin("mum");
  selection.settle(failedChoice);
  expect(selection.version).not.toBe(latestRequest);
});

it("queues an owned refresh after saves and uses its revision for later writes", async () => {
  let release!: (response: Response) => void;
  const fresh = {
    ...snapshot(8),
    state: {
      ...emptyState(),
      now: "2030-10-09T09:00:00+08:00",
      clockMode: "live",
    },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot(1)))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(json(fresh))
    .mockResolvedValueOnce(json(snapshot(9)));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client/owned", publish);
  await client.initialize(emptyState());
  const write = client.command({ type: "start" }, "first", "p-me");
  const refresh = client.refresh();
  const later = client.command({ type: "start" }, "later", "p-me");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(client.busy).toBe(true);
  release(json(snapshot(2)));
  await Promise.all([write, refresh, later]);
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    "/api/state/client%2Fowned",
    "/api/commands",
    "/api/state/client%2Fowned",
    "/api/commands",
  ]);
  expect(fetcher.mock.calls[2][1]).toMatchObject({
    method: "GET",
    cache: "no-store",
    headers: { "X-CareBuddy-Client-Id": "client/owned" },
  });
  expect(fetcher.mock.calls[2][1].body).toBeUndefined();
  expect(JSON.parse(fetcher.mock.calls[3][1].body).expectedRevision).toBe(8);
  expect(publish.mock.calls[2][0]).toEqual(fresh);
  expect(client.busy).toBe(false);
  await expect(
    client.confirm("review-before-refresh", "p-me", 2),
  ).rejects.toThrow("Review");
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("does not publish a delayed refresh after the captured UI intent changes", async () => {
  let release!: (response: Response) => void;
  let current = true;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot(3)))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  const publish = vi.fn();
  const client = new ServerClient("client-test", publish);
  await client.initialize(emptyState());
  const refresh = client.refresh(() => current);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  current = false;
  release(json(snapshot(4)));
  expect(await refresh).toBeNull();
  expect(publish).toHaveBeenCalledTimes(1);
  expect(client.revision).toBe(3);
  await client.refresh(() => false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("omits server clock metadata when bootstrapping a bound display cache", async () => {
  const local = {
    ...emptyState(),
    clockMode: "reference" as const,
    selectedProfileId: "p-me",
    profiles: [
      {
        id: "p-me",
        displayName: "Me",
        relationship: "Self",
        canManage: true,
        canView: true,
      },
    ],
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(snapshot()))
    .mockResolvedValueOnce(json({ state: local, revision: 1 }));
  vi.stubGlobal("fetch", fetcher);
  const { ServerClient } = await import("../src/syncClient");
  await new ServerClient("client-test", vi.fn()).initialize(local);
  const body = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(body.state).not.toHaveProperty("clockMode");
  expect(body.state.profiles).toEqual(local.profiles);
});
