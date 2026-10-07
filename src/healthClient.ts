import type { HealthReading, WeatherData, HealthAdvice } from "./types";
import type { AccountClient } from "./syncClient";
export interface HealthSnapshot {
  reading: HealthReading | null;
  weather: WeatherData | null;
  advice: HealthAdvice[];
}
const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "/";

export function fetchHealthSnapshot(
  client: AccountClient,
  profileId: string,
): Promise<HealthSnapshot> {
  return client.request("/api/health/snapshot", { profileId });
}

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherData> {
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/weather";
  try {
    const res = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Weather is temporarily unavailable. Please try again.");
    const { weather } = await res.json() as { weather?: WeatherData | null };
    if (!weather || typeof weather.temperatureC !== "number" || !Number.isFinite(weather.temperatureC)) {
      throw new Error("Weather is temporarily unavailable. Please try again.");
    }
    return weather;
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new Error("Weather is temporarily unavailable. Please try again.");
  }
}
