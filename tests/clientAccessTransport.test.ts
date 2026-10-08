import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "/");
  vi.stubGlobal("localStorage", {
    getItem: () => "client-approved",
    setItem: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("carries the same browser ID on state, Buddy and health requests", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          state: emptyState(),
          text: "Hello",
          revision: 0,
          reading: null,
          weather: null,
          advice: [],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const sync = await import("../src/syncClient");
  await sync.pullState("client-approved");
  const client = new sync.ServerClient("client-approved", () => {});
  await client.initialize(emptyState());
  await client.command({ type: "start" }, "action-start", "p-me");
  await (
    await import("../src/buddyClient")
  ).interpretBuddyMessage("p-me", "Hello");
  await (await import("../src/healthClient")).fetchHealthSnapshot("p-me");
  expect(fetcher).toHaveBeenCalledTimes(5);
  const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(calls.every(([, init]) => init?.method !== "PUT")).toBe(true);
  expect(JSON.parse(String(calls[4][1].body))).toEqual({ profileId: "p-me" });
  expect(JSON.parse(String(calls[3][1].body))).toEqual({
    message: "Hello",
    profileId: "p-me",
  });
  for (const call of fetcher.mock.calls as unknown as Array<
    [string, RequestInit]
  >) {
    expect(new Headers(call[1]?.headers).get("X-CareBuddy-Client-Id")).toBe(
      "client-approved",
    );
  }
});
it("checks the current browser ID before the app loads care records", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ clientId: "client-approved", isVisible: false }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const sync = await import("../src/syncClient");
  expect(await sync.checkClientAccess()).toBe(false);
  expect(
    (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][0],
  ).toBe("/api/access");
});
