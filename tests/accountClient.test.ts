import { afterEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import * as api from "../src/syncClient";
const bootstrap = () => ({
  state: emptyState(),
  revision: 4,
  csrfToken: "csrf",
  user: { id: "u", username: "owner", displayName: "Owner", timeZone: "UTC" },
});
afterEach(() => vi.unstubAllGlobals());
it("serializes commands and interpret, reads revision at dequeue, and sends only account command fields", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        state: emptyState(),
        revision: 4 + calls.length,
        text: "Reply",
      }),
    );
  });
  const client = new api.AccountClient(bootstrap(), () => {});
  await Promise.all([
    client.command(
      { type: "setPreference", key: "genericReminders", value: true },
      "p-me",
      "a",
    ),
    client.interpret("Hello", "p-me"),
    client.command(
      { type: "setPreference", key: "spokenReminders", value: true },
      "p-me",
      "b",
    ),
  ]);
  expect(calls.map((c) => c.url)).toEqual([
    "/api/commands",
    "/api/buddy/interpret",
    "/api/commands",
  ]);
  expect(JSON.parse(calls[0].init.body as string)).toEqual({
    command: { type: "setPreference", key: "genericReminders", value: true },
    profileId: "p-me",
    actionId: "a",
    expectedRevision: 4,
  });
  expect(JSON.parse(calls[2].init.body as string).expectedRevision).toBe(6);
  expect(JSON.parse(calls[1].init.body as string)).toEqual({
    message: "Hello",
    profileId: "p-me",
  });
  expect(calls[0].init.credentials).toBe("include");
  expect(calls[0].init.headers).toMatchObject({ "X-CSRF-Token": "csrf" });
});
it("refreshes conflict state without retrying the stale command", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/commands")
      ? new Response(JSON.stringify({ error: "changed" }), { status: 409 })
      : new Response(JSON.stringify({ state: emptyState(), revision: 9 })),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new api.AccountClient(bootstrap(), () => {});
  await expect(
    client.command({ type: "reset" }, "p-me", "a"),
  ).rejects.toMatchObject({ status: 409 });
  expect(client.snapshot.revision).toBe(9);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("keeps action identity and original revision when retrying a transport failure", async () => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    if (bodies.length === 1) throw Error("offline");
    return new Response(JSON.stringify({ state: emptyState(), revision: 5 }));
  });
  const client = new api.AccountClient(bootstrap(), () => {});
  await expect(
    client.command({ type: "reset" }, "p-me", "stable"),
  ).rejects.toThrow();
  await client.command({ type: "reset" }, "p-me", "stable");
  expect(bodies[0]).toBe(bodies[1]);
});
it("rejects a response from a disposed account and prevents queued writes", async () => {
  let finish!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new api.AccountClient(bootstrap(), () => {});
  const first = client.command({ type: "reset" }, "p-me", "a");
  const second = client.command({ type: "reset" }, "p-me", "b");
  await Promise.resolve();
  client.dispose();
  finish(new Response(JSON.stringify({ state: emptyState(), revision: 5 })));
  await expect(first).rejects.toThrow("Account changed");
  await expect(second).rejects.toThrow("Account changed");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.snapshot.revision).toBe(4);
});
it("blocks already queued stale edits after a conflict instead of applying them against refreshed records", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/commands")
      ? new Response(JSON.stringify({ error: "changed" }), { status: 409 })
      : new Response(JSON.stringify({ state: emptyState(), revision: 9 })),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new api.AccountClient(bootstrap(), () => {});
  const first = client.command({ type: "reset" }, "p-me", "a");
  const second = client.command({ type: "reset" }, "p-me", "b");
  await expect(first).rejects.toMatchObject({ status: 409 });
  await expect(second).rejects.toMatchObject({ status: 409 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("confirms only a stored proposal id and profile and uses its server receipt", async () => {
  const receipt = { actionId: "stored", outcome: "Saved" };
  const fetcher = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({ state: emptyState(), revision: 5, receipt }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new api.AccountClient(bootstrap(), () => {});
  expect((await client.confirm("stored", "p-me")).receipt).toEqual(receipt);
  expect(fetcher.mock.calls[0][0]).toBe("/api/proposals/stored/confirm");
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
    profileId: "p-me",
  });
});
it("expires the account on 401 and prevents further operations", async () => {
  const expired = vi.fn();
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new api.AccountClient(bootstrap(), expired);
  await expect(
    client.command({ type: "reset" }, "p-me", "a"),
  ).rejects.toThrow();
  expect(expired).toHaveBeenCalledTimes(1);
  await expect(client.command({ type: "reset" }, "p-me", "b")).rejects.toThrow(
    "Account changed",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
