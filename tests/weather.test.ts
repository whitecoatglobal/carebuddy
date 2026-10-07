import { describe, expect, it, vi } from "vitest";
import { createWeatherService, parseSingaporeWeather } from "../backend/src/weather";

const timestamp = "2026-10-07T17:25:00+08:00";
const now = Date.parse("2026-10-07T17:30:00+08:00");
function sources() {
  return {
    temperature: {
      stations: [
        { id: "S109", name: "Ang Mo Kio", location: { latitude: 1.3793, longitude: 103.85 } },
        { id: "S111", name: "Scotts Road", location: { latitude: 1.3106, longitude: 103.8365 } },
      ],
      readings: [{ timestamp, data: [{ stationId: "S109", value: 33.1 }, { stationId: "S111", value: 32 }] }],
    },
    humidity: { readings: [{ timestamp, data: [{ stationId: "S111", value: 64.5 }] }] },
    forecast: { items: [{ timestamp, valid_period: {
      start: "2026-10-07T17:00:00+08:00", end: "2026-10-07T19:00:00+08:00", text: "5.00 pm to 7.00 pm",
    }, forecasts: [{ area: "City", forecast: "Thundery Showers" }] }] },
    psi: { items: [{ timestamp: "2026-10-07T17:00:00+08:00", readings: { psi_twenty_four_hourly: { central: 133 } } }] },
  };
}
function provider() {
  const data = sources();
  return vi.fn<typeof fetch>(async (input) => {
    const endpoint = String(input).split("/").at(-1);
    const feed = ({ "air-temperature": data.temperature, "relative-humidity": data.humidity,
      "two-hr-forecast": data.forecast, psi: data.psi })[endpoint!];
    return new Response(JSON.stringify({ code: 0, data: feed }));
  });
}

describe("Singapore weather", () => {
  it("uses the nearest reporting station and preserves real forecast and PSI readings", () => {
    const weather = parseSingaporeWeather(sources(), now);
    expect(weather).toMatchObject({ temperatureC: 32, humidity: 64.5, stationName: "Scotts Road",
      condition: "Thundery Showers", conditionIcon: "⛈️", psi: 133, updatedAt: timestamp,
      rainProbability: null, feelsLikeC: null, windKph: null, uvIndex: null, airQuality: null });
  });

  it("still shows temperature when optional feeds are unavailable", () => {
    const weather = parseSingaporeWeather({ ...sources(), humidity: null, forecast: null, psi: null }, now);
    expect(weather.temperatureC).toBe(32);
    expect(weather.humidity).toBeNull();
    expect(weather.psi).toBeNull();
    expect(weather.condition).toBe("Forecast unavailable");
  });

  it("does not present an expired forecast as current", () => {
    const data = sources();
    data.forecast.items[0].valid_period.end = "2026-10-07T17:00:00+08:00";
    const weather = parseSingaporeWeather(data, now);
    expect(weather.condition).toBe("Forecast unavailable");
    expect(weather.forecastValidUntil).toBeNull();
  });

  it("rejects missing, stale, and invalid temperature readings", () => {
    expect(() => parseSingaporeWeather({ ...sources(), temperature: null }, now)).toThrow("temporarily unavailable");
    const stale = sources();
    stale.temperature.readings[0].timestamp = "2026-10-07T15:00:00+08:00";
    expect(() => parseSingaporeWeather(stale, now)).toThrow("temporarily unavailable");
    const invalid = sources();
    invalid.temperature.readings[0].data.forEach((reading) => { reading.value = NaN; });
    expect(() => parseSingaporeWeather(invalid, now)).toThrow("temporarily unavailable");
  });

  it("deduplicates concurrent requests and refreshes after five minutes", async () => {
    const fetcher = provider();
    let time = now;
    const getWeather = createWeatherService(fetcher, () => time);
    const first = getWeather();
    expect(getWeather()).toBe(first);
    const weather = await first;
    expect(await getWeather()).toBe(weather);
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, init] of fetcher.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
    time += 5 * 60_000;
    await getWeather();
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it("backs off on provider failures and then permits a retry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 }));
    let time = now;
    const getWeather = createWeatherService(fetcher, () => time);
    await expect(getWeather()).rejects.toThrow("temporarily unavailable");
    await expect(getWeather()).rejects.toThrow("temporarily unavailable");
    expect(fetcher).toHaveBeenCalledTimes(4);
    time += 31_000;
    await expect(getWeather()).rejects.toThrow("temporarily unavailable");
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
});
