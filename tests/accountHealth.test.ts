import { afterEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import { AccountClient, accountRequest } from "../src/syncClient";
import { fetchHealthSnapshot } from "../src/healthClient";
afterEach(() => vi.unstubAllGlobals());
it("requests health from the authenticated account using only the selected profile", async () => {
  const fetcher = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ weather: { location: "Here" } })),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new AccountClient(
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
  await fetchHealthSnapshot(client, "p-me");
  expect(fetcher.mock.calls[0][0]).toBe("/api/health/snapshot");
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
    profileId: "p-me",
  });
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "include",
    headers: { "X-CSRF-Token": "csrf" },
  });
});
it("uses the cookie session bootstrap and sends CSRF on sign out", async () => {
  const fetcher = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ ok: true })),
  );
  vi.stubGlobal("fetch", fetcher);
  await accountRequest("/api/auth/session");
  await accountRequest("/api/auth/logout", {}, "csrf");
  expect(fetcher.mock.calls[0][1].credentials).toBe("include");
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": "csrf" },
  });
});
