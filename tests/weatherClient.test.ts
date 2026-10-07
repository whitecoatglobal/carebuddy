import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeatherBanner } from "../src/WeatherBanner";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("requests weather without requiring a profile or sending personal state", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ weather: { temperatureC: 32 } })));
  vi.stubGlobal("fetch", fetcher);
  const { fetchWeather } = await import("../src/healthClient");
  await expect(fetchWeather()).resolves.toMatchObject({ temperatureC: 32 });
  expect(fetcher).toHaveBeenCalledWith("/api/weather", expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }));
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
});

it.each([null, { temperatureC: "unknown" }])("treats missing or invalid weather as an error: %j", async (weather) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ weather }))));
  const { fetchWeather } = await import("../src/healthClient");
  await expect(fetchWeather()).rejects.toThrow("temporarily unavailable");
});

it.each(["server", "network", "timeout"])("ends loading on a %s failure", async (failure) => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (failure === "server") return new Response("unavailable", { status: 503 });
    throw new DOMException("Unavailable", failure === "timeout" ? "TimeoutError" : "NetworkError");
  }));
  const { fetchWeather } = await import("../src/healthClient");
  await expect(fetchWeather()).rejects.toThrow("temporarily unavailable");
});

it("renders an error and retry control after loading completes", () => {
  const html = renderToStaticMarkup(createElement(WeatherBanner, {
    weather: null, loading: false, error: "Weather is temporarily unavailable.", onRetry: () => {},
  }));
  expect(html).toContain('role="alert"');
  expect(html).toContain("Retry weather");
  expect(html).not.toContain("Loading weather");
});
