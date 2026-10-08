import { Icon } from "./Icon";
import { healthMetricsFor } from "./healthData";
import type { HealthVitals } from "./types";

export function HealthCard({
  vitals,
  loading,
  error,
  onRetry,
  onReview,
}: {
  vitals: HealthVitals | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onReview: () => void;
}) {
  return (
    <section
      className="health-review-card health-refined-card"
      aria-label="Your Live Health"
      aria-busy={loading}
    >
      <div className="health-card-heading">
        <span className="feature-icon health-feature-icon">
          <Icon name="pulse" />
        </span>
        <span className="eyebrow">Your Live Health</span>
      </div>
      {vitals ? (
        <dl className="health-card-readings">
          {healthMetricsFor(vitals)
            .slice(0, 4)
            .map((metric) => (
              <div key={metric.id}>
                <dt>
                  <Icon name={metric.icon} />
                  {metric.cardLabel}
                </dt>
                <dd>
                  {metric.value} <small>{metric.unit}</small>
                </dd>
              </div>
            ))}
        </dl>
      ) : (
        <p role={error ? "alert" : "status"}>
          {loading
            ? "Loading your readings…"
            : error || "No health readings available yet."}
        </p>
      )}
      {error && (
        <button className="text-button" onClick={onRetry} disabled={loading}>
          Retry readings
        </button>
      )}
      <button
        className="primary health-card-link"
        onClick={onReview}
        disabled={!vitals}
      >
        Review readings <Icon name="arrow" />
      </button>
    </section>
  );
}
