import type { State, HealthReading, WeatherData, HealthAdvice } from "./types";

export interface HealthSnapshot {
  reading: HealthReading;
  weather: WeatherData;
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
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthSnapshot;
  } catch {
    return null;
  }
}

export async function fetchWeather(
  state: State,
): Promise<WeatherData | null> {
  if (!BACKEND_URL) return null;
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/health/snapshot";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: state.selectedProfileId, state }),
    });
    if (!res.ok) return null;
    const snap = (await res.json()) as HealthSnapshot;
    return snap.weather ?? null;
  } catch {
    return null;
  }
}
