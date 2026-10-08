import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HealthCard } from "../src/HealthCard";
import { HealthDetails } from "../src/HealthDetails";
import type { HealthVitals } from "../src/types";

const vitals: HealthVitals = {
  profileId: "p-me",
  systolic: 130,
  diastolic: 82,
  pulseBpm: 88,
  temperatureC: 37.2,
  oxygenPercent: 96,
  breathingPerMinute: 18,
  updatedAt: "2026-10-08T06:30:00Z",
  source: "demo",
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "/");
  vi.stubGlobal("localStorage", {
    getItem: () => "client-vitals-ui",
    setItem: () => {},
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("fetches only the selected profile with browser access headers and no caching", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ vitals })),
  );
  vi.stubGlobal("fetch", fetcher);
  const { fetchHealthVitals } = await import("../src/healthClient");
  await expect(fetchHealthVitals("p-me")).resolves.toEqual(vitals);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/health/vitals?profileId=p-me",
    expect.objectContaining({
      cache: "no-store",
      headers: { "X-CareBuddy-Client-Id": "client-vitals-ui" },
      signal: expect.any(AbortSignal),
    }),
  );
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
});
it.each([
  null,
  { ...vitals, profileId: "p-other" },
  { ...vitals, pulseBpm: "88" },
  { ...vitals, temperatureC: null },
  { ...vitals, oxygenPercent: 101 },
  { ...vitals, breathingPerMinute: -1 },
  { ...vitals, updatedAt: "invalid" },
  { ...vitals, source: "unknown" },
])(
  "rejects absent, malformed or mismatched readings without inventing a fallback: %j",
  async (reading) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ vitals: reading }))),
    );
    const { fetchHealthVitals } = await import("../src/healthClient");
    await expect(fetchHealthVitals("p-me")).rejects.toThrow(
      "temporarily unavailable",
    );
  },
);
it.each([403, 500])("reports an API %s error", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("unavailable", { status })),
  );
  const { fetchHealthVitals } = await import("../src/healthClient");
  await expect(fetchHealthVitals("p-me")).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("handles a network failure and honors cancellation before a request", async () => {
  const fetcher = vi.fn(async () => {
    throw new TypeError("Offline");
  });
  vi.stubGlobal("fetch", fetcher);
  const { fetchHealthVitals } = await import("../src/healthClient");
  await expect(fetchHealthVitals("p-me")).rejects.toThrow(
    "temporarily unavailable",
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetchHealthVitals("p-me", controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("renders the API's readings consistently on the card and review page", () => {
  const props = { vitals, loading: false, error: "", onRetry: () => {} };
  const card = renderToStaticMarkup(
    createElement(HealthCard, { ...props, onReview: () => {} }),
  );
  const review = renderToStaticMarkup(
    createElement(HealthDetails, {
      ...props,
      profileName: "Me",
      onBack: () => {},
    }),
  );
  for (const html of [card, review]) {
    expect(html).toContain("130/82");
    expect(html).toContain("88");
    expect(html).toContain("37.2");
    expect(html).toContain("96");
    expect(html).not.toContain("118/76");
    expect(html).not.toContain("Morning readings");
  }
  expect(review).toContain("18");
  expect(review).toContain("2:30");
  expect(card).toContain("Your Live Health");
});
it("shows loading and retry states while health values are unavailable", () => {
  const loading = renderToStaticMarkup(
    createElement(HealthCard, {
      vitals: null,
      loading: true,
      error: "",
      onRetry: () => {},
      onReview: () => {},
    }),
  );
  expect(loading).toContain("Loading your readings");
  expect(loading).toContain('aria-busy="true"');
  const failed = renderToStaticMarkup(
    createElement(HealthDetails, {
      vitals: null,
      loading: false,
      error: "Readings unavailable",
      onRetry: () => {},
      onBack: () => {},
    }),
  );
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("Retry readings");
  expect(failed).not.toContain("118/76");
});
