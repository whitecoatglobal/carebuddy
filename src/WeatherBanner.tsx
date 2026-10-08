import type { WeatherData } from "./types";
import { formatTime } from "./domain";

export function psiLabel(psi: number): string {
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  if (psi <= 200) return "Unhealthy";
  if (psi <= 300) return "Very unhealthy";
  return "Hazardous";
}

export function WeatherBanner({
  weather,
  loading,
  error,
  onRetry,
}: {
  weather: WeatherData | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <section
      className="weather-banner"
      aria-label="Singapore weather"
      aria-busy={loading}
    >
      {weather ? (
        <>
          <span className="weather-icon-lg" aria-hidden="true">
            {weather.conditionIcon}
          </span>
          <div className="weather-banner-main">
            <span className="weather-temp-lg">{weather.temperatureC}°C</span>
            <span className="weather-cond-lg">{weather.condition}</span>
            {weather.forecastValidUntil && (
              <small>2-hour forecast · {weather.forecastPeriod}</small>
            )}
          </div>
          <div className="weather-banner-stats">
            {weather.humidity !== null && (
              <div>
                <small>Humidity</small>
                <span>{Math.round(weather.humidity)}%</span>
              </div>
            )}
            {weather.psi !== null && (
              <div>
                <small>24-hour PSI · Central</small>
                <span>
                  {weather.psi} · {psiLabel(weather.psi)}
                </span>
              </div>
            )}
          </div>
          <p className="weather-source">
            {weather.location} · Updated {formatTime(weather.updatedAt)} ·{" "}
            {weather.source}
          </p>
        </>
      ) : loading ? (
        <span className="weather-cond-lg" role="status">
          Loading weather…
        </span>
      ) : (
        <>
          <span className="weather-cond-lg" role="alert">
            {error || "Weather is unavailable."}
          </span>
          <button onClick={onRetry}>Retry weather</button>
        </>
      )}
    </section>
  );
}
