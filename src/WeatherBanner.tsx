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
      className="weather-banner weather-strip"
      aria-label="Singapore weather"
      aria-busy={loading}
    >
      <details>
        <summary>
          <span className="weather-strip-icon" aria-hidden="true">
            {weather?.conditionIcon || "☁"}
          </span>
          <span className="weather-strip-copy">
            <strong>
              {weather
                ? `${weather.temperatureC}°C · ${weather.condition}`
                : loading
                  ? "Loading weather…"
                  : "Weather unavailable"}
            </strong>
            <small>{weather?.location || "Singapore"}</small>
          </span>
          <span className="weather-strip-toggle" aria-hidden="true">
            Details <span>⌄</span>
          </span>
        </summary>
        <div className="weather-strip-details">
          {weather && (
            <>
              {weather.forecastValidUntil && (
                <p>2-hour forecast · {weather.forecastPeriod}</p>
              )}
              <dl className="weather-strip-stats">
                {weather.humidity !== null && (
                  <div>
                    <dt>Humidity</dt>
                    <dd>{Math.round(weather.humidity)}%</dd>
                  </div>
                )}
                {weather.psi !== null && (
                  <div>
                    <dt>24-hour PSI · Central</dt>
                    <dd>
                      {weather.psi} · {psiLabel(weather.psi)}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="weather-source">
                {weather.location} · Updated {formatTime(weather.updatedAt)} ·{" "}
                {weather.source}
              </p>
            </>
          )}
          {!weather && !loading && !error && <p>Weather is unavailable.</p>}
          {!error && (
            <button
              className="text-button"
              onClick={onRetry}
              disabled={loading}
            >
              {weather ? "Refresh weather" : "Retry weather"}
            </button>
          )}
        </div>
      </details>
      {loading && (
        <p className="weather-strip-status" role="status">
          {weather ? "Updating weather…" : "Loading weather…"}
        </p>
      )}
      {error && (
        <div className="weather-strip-error">
          <p role="alert">{error}</p>
          <button className="text-button" onClick={onRetry} disabled={loading}>
            Retry weather
          </button>
        </div>
      )}
    </section>
  );
}
