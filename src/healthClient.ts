import type { HealthReading, WeatherData, HealthAdvice } from "./types";
import type { AccountClient } from "./syncClient";
export interface HealthSnapshot {
  reading: HealthReading;
  weather: WeatherData;
  advice: HealthAdvice[];
}
export function fetchHealthSnapshot(
  client: AccountClient,
  profileId: string,
): Promise<HealthSnapshot> {
  return client.request("/api/health/snapshot", { profileId });
}
export async function fetchWeather(
  client: AccountClient,
  profileId: string,
): Promise<WeatherData | null> {
  return (await fetchHealthSnapshot(client, profileId)).weather ?? null;
}
