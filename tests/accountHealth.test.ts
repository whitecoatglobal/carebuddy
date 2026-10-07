import { afterEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import { AccountClient, accountRequest } from "../src/syncClient";
import { fetchHealthSnapshot } from "../src/healthClient";
import { createApp } from "../backend/src/app";
import { AccountStore } from "../backend/src/accountStore";
import { sessionCookie } from "../backend/src/auth";
import { getWeather } from "../backend/src/weather";

vi.mock("../backend/src/weather", () => ({
  getWeather: vi.fn(async () => ({ temperatureC: 32, location: "Singapore · City" })),
}));
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

it("serves public weather while awaiting authenticated, profile-owned health snapshots", async () => {
  const store = new AccountStore(":memory:");
  const user = store.createAccount("weather-owner", "Owner", "UTC", "salt", "hash");
  const session = store.createSession(user);
  const server = createApp({ store, origin: "http://localhost:5173" }).listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const weather = await fetch(base + "/api/weather");
    expect(weather.status).toBe(200);
    expect(weather.headers.get("cache-control")).toBe("no-store");
    expect(await weather.json()).toEqual({ weather: { temperatureC: 32, location: "Singapore · City" } });
    const headers = {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: sessionCookie(session.value, false).split(";")[0],
      "X-CSRF-Token": session.csrfToken,
    };
    const request = (profileId: string, authenticated = true) => fetch(base + "/api/health/snapshot", {
      method: "POST",
      headers: authenticated ? headers : { "Content-Type": "application/json", Origin: headers.Origin },
      body: JSON.stringify({ profileId }),
    });
    expect((await request("p-me", false)).status).toBe(401);
    expect((await request("another-account-profile")).status).toBe(403);
    const health = await request("p-me");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      reading: null,
      weather: { temperatureC: 32 },
      advice: expect.any(Array),
    });
    vi.mocked(getWeather).mockRejectedValueOnce(new Error("Provider unavailable"));
    const unavailable = await fetch(base + "/api/weather");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ weather: null, error: expect.stringContaining("temporarily unavailable") });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
