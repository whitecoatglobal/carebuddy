import type { WeatherData } from "care-buddy-shared";

const API_BASE = "https://api-open.data.gov.sg/v2/real-time/api/";
const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 30_000;
const WEATHER_UNAVAILABLE = "Weather is temporarily unavailable. Please try again.";

interface StationFeed {
  stations?: { id: string; name: string; location?: { latitude: number; longitude: number } }[];
  readings?: { timestamp: string; data?: { stationId: string; value: number }[] }[];
}
interface ForecastFeed {
  items?: {
    timestamp: string;
    valid_period?: { start: string; end: string; text?: string };
    forecasts?: { area: string; forecast: string }[];
  }[];
}
interface PsiFeed {
  items?: {
    timestamp: string;
    readings?: { psi_twenty_four_hourly?: { central?: number } };
  }[];
}
interface WeatherSources {
  temperature: StationFeed | null;
  humidity: StationFeed | null;
  forecast: ForecastFeed | null;
  psi: PsiFeed | null;
}

function recent<T extends { timestamp: string }>(items: T[] | undefined, now: number, maxAge: number): T | undefined {
  if (!Array.isArray(items)) return undefined;
  return items
    .filter((item) => {
      const time = Date.parse(item?.timestamp);
      return Number.isFinite(time) && time <= now + 5 * 60_000 && now - time <= maxAge;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function weatherIcon(condition: string): string {
  if (/thunder/i.test(condition)) return "⛈️";
  if (/rain|shower/i.test(condition)) return "🌧️";
  if (/haze|mist|fog/i.test(condition)) return "🌫️";
  if (/partly cloudy/i.test(condition)) return /night/i.test(condition) ? "☁️" : "⛅";
  if (/cloudy/i.test(condition)) return "☁️";
  if (/fair|sunny/i.test(condition)) return /night/i.test(condition) ? "🌙" : "☀️";
  return "🌡️";
}

/** Singapore city weather; measurements come from the nearest reporting station. */
export function parseSingaporeWeather(sources: WeatherSources, now = Date.now()): WeatherData {
  const temperature = recent(sources.temperature?.readings, now, 30 * 60_000);
  const readings = Array.isArray(temperature?.data) ? temperature.data : [];
  const stations = Array.isArray(sources.temperature?.stations) ? sources.temperature.stations : [];
  const available = stations.filter((station) =>
    readings.some((reading) => reading.stationId === station.id && numberInRange(reading.value, 0, 50) !== null),
  );
  const distance = (station: typeof stations[number]) => station.location
    ? (station.location.latitude - 1.292) ** 2 + (station.location.longitude - 103.844) ** 2
    : Infinity;
  const station = available.sort((a, b) => distance(a) - distance(b))[0];
  const temperatureC = numberInRange(readings.find((item) => item.stationId === station?.id)?.value, 0, 50);
  if (!station || !temperature || temperatureC === null) throw new Error(WEATHER_UNAVAILABLE);

  const humidity = recent(sources.humidity?.readings, now, 30 * 60_000);
  const humidityReadings = Array.isArray(humidity?.data) ? humidity.data : [];
  const forecast = recent(sources.forecast?.items, now, 3 * 60 * 60_000);
  const period = forecast?.valid_period;
  const validForecast = period && Date.parse(period.start) <= now && Date.parse(period.end) > now;
  const forecasts = Array.isArray(forecast?.forecasts) ? forecast.forecasts : [];
  const city = validForecast ? forecasts.find((item) => item.area === "City") : undefined;
  const condition = typeof city?.forecast === "string" && city.forecast.trim() ? city.forecast : "Forecast unavailable";
  const psi = recent(sources.psi?.items, now, 2 * 60 * 60_000);

  return {
    location: "Singapore · City",
    temperatureC: Math.round(temperatureC * 10) / 10,
    humidity: numberInRange(humidityReadings.find((item) => item.stationId === station.id)?.value, 0, 100),
    condition,
    conditionIcon: weatherIcon(condition),
    psi: numberInRange(psi?.readings?.psi_twenty_four_hourly?.central, 0, 500),
    updatedAt: temperature.timestamp,
    stationName: station.name,
    source: "NEA / MSS via data.gov.sg",
    forecastValidUntil: city && period ? period.end : null,
    forecastPeriod: city && period ? period.text ?? null : null,
    // These feeds do not supply these measurements; never substitute demo values.
    feelsLikeC: null,
    windKph: null,
    uvIndex: null,
    airQuality: null,
    rainProbability: null,
  };
}

/** One cached request per server, regardless of how many people open the app. */
export function createWeatherService(fetcher: typeof fetch = (input, init) => fetch(input, init), now = Date.now) {
  let cached: WeatherData | null = null;
  let expiresAt = 0;
  let retryAt = 0;
  let pending: Promise<WeatherData> | null = null;

  async function feed<T>(endpoint: string): Promise<T | null> {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (process.env.DATA_GOV_SG_API_KEY) headers["x-api-key"] = process.env.DATA_GOV_SG_API_KEY;
      const response = await fetcher(API_BASE + endpoint, { headers, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return null;
      const body = await response.json() as { code?: number; data?: T };
      return body.code === 0 && body.data ? body.data : null;
    } catch {
      return null;
    }
  }

  return function getWeather(): Promise<WeatherData> {
    if (cached && now() < expiresAt) return Promise.resolve(cached);
    if (pending) return pending;
    if (now() < retryAt) return Promise.reject(new Error(WEATHER_UNAVAILABLE));
    pending = (async () => {
      try {
        const [temperature, humidity, forecast, psi] = await Promise.all([
          feed<StationFeed>("air-temperature"),
          feed<StationFeed>("relative-humidity"),
          feed<ForecastFeed>("two-hr-forecast"),
          feed<PsiFeed>("psi"),
        ]);
        const weather = parseSingaporeWeather({ temperature, humidity, forecast, psi }, now());
        cached = weather;
        expiresAt = Math.min(now() + CACHE_MS, Date.parse(weather.updatedAt) + 30 * 60_000,
          weather.forecastValidUntil ? Date.parse(weather.forecastValidUntil) : Infinity);
        retryAt = 0;
        return weather;
      } catch {
        retryAt = now() + FAILURE_CACHE_MS;
        throw new Error(WEATHER_UNAVAILABLE);
      } finally {
        pending = null;
      }
    })();
    return pending;
  };
}

export const getWeather = createWeatherService();
