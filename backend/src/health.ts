import {
  type State,
  type HealthReading,
  type WeatherData,
  type HealthAdvice,
  buildHealthReading,
  buildWeather,
  buildHealthAdvice,
  validateState,
} from "care-buddy-shared";

export interface HealthSnapshot {
  reading: HealthReading;
  weather: WeatherData;
  advice: HealthAdvice[];
}

export function buildHealthSnapshot(
  profileId: string,
  rawState?: unknown,
): HealthSnapshot {
  const now = normalizeNow(rawState);
  const reading = buildHealthReading(profileId, now);
  const weather = buildWeather(now);
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
