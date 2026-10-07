import {
  type State,
  type HealthReading,
  type WeatherData,
  type HealthAdvice,
  buildHealthReading,
  buildHealthAdvice,
  validateState,
} from "care-buddy-shared";
import { getWeather } from "./weather.js";

export interface HealthSnapshot {
  reading: HealthReading | null;
  weather: WeatherData | null;
  advice: HealthAdvice[];
}

export async function buildHealthSnapshot(
  profileId: string,
  rawState?: unknown,
): Promise<HealthSnapshot> {
  const now = normalizeNow(rawState);
  const reading = buildHealthReading(profileId, now);
  const weather = await getWeather().catch(() => null);
  const advice = buildHealthAdvice(reading, weather);
  return { reading, weather, advice };
}

function normalizeNow(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && validateState(raw)) {
    const state = raw as State;
    return state.now;
  }
  return undefined;
}
