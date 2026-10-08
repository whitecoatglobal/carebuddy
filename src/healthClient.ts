import type { State, HealthReading, WeatherData, HealthAdvice } from "./types";

export interface HealthSnapshot {
  reading: HealthReading | null;
  weather: WeatherData | null;
  advice: HealthAdvice[];
}

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";

export async function fetchHealthSnapshot(
  state: State,
  profileId: string,
): Promise<HealthSnapshot | null> {
  if (!BACKEND_URL) return null;
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/health/snapshot";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, state }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthSnapshot;
  } catch {
    return null;
  }
}

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherData> {
  if (!BACKEND_URL) throw new Error("Weather is unavailable while offline.");
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
