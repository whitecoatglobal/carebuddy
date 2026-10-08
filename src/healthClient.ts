import { clientAccessHeaders } from "./syncClient";
import type {
  HealthReading,
  HealthVitals,
  WeatherData,
  HealthAdvice,
} from "./types";

export interface HealthSnapshot {
  reading: HealthReading | null;
  weather: WeatherData | null;
  advice: HealthAdvice[];
}

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";

export async function fetchHealthVitals(
  profileId: string,
  signal?: AbortSignal,
): Promise<HealthVitals> {
  try {
    signal?.throwIfAborted();
    if (!BACKEND_URL) throw new Error("No health connection");
    const url =
      BACKEND_URL.replace(/\/$/, "") +
      "/api/health/vitals?profileId=" +
      encodeURIComponent(profileId);
    const res = await fetch(url, {
      headers: clientAccessHeaders(),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error("Health request failed");
    const { vitals } = await res.json();
    const numbers = [
      "systolic",
      "diastolic",
      "pulseBpm",
      "temperatureC",
      "oxygenPercent",
      "breathingPerMinute",
    ];
    if (
      !vitals ||
      typeof vitals !== "object" ||
      vitals.profileId !== profileId ||
      !numbers.every(
        (key) =>
          typeof vitals[key] === "number" &&
          Number.isFinite(vitals[key]) &&
          vitals[key] >= 0,
      ) ||
      vitals.oxygenPercent > 100 ||
      typeof vitals.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(vitals.updatedAt)) ||
      !["demo", "device", "manual"].includes(vitals.source)
    ) {
      throw new Error("Invalid health readings");
    }
    signal?.throwIfAborted();
    return vitals as HealthVitals;
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new Error(
      "Health readings are temporarily unavailable. Please try again.",
    );
  }
}

export async function fetchHealthSnapshot(
  profileId: string,
): Promise<HealthSnapshot | null> {
  if (!BACKEND_URL) return null;
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/health/snapshot";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...clientAccessHeaders() },
      body: JSON.stringify({ profileId }),
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
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok)
      throw new Error("Weather is temporarily unavailable. Please try again.");
    const { weather } = (await res.json()) as { weather?: WeatherData | null };
    if (
      !weather ||
      typeof weather.temperatureC !== "number" ||
      !Number.isFinite(weather.temperatureC)
    ) {
      throw new Error("Weather is temporarily unavailable. Please try again.");
    }
    return weather;
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new Error("Weather is temporarily unavailable. Please try again.");
  }
}
