import { Icon } from "./Icon";
import {
  healthMetricsFor,
  HEALTH_RECOMMENDATIONS,
  HEALTH_SOURCES,
} from "./healthData";
import type { HealthVitals } from "./types";

export function HealthDetails({
  profileName,
  vitals,
  loading,
  error,
  onRetry,
  onBack,
  backLabel = "Today",
}: {
  profileName?: string;
  vitals: HealthVitals | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const date = vitals
    ? new Intl.DateTimeFormat("en-SG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Singapore",
      }).format(new Date(vitals.updatedAt))
    : "";
  return (
    <div className="health-details health-refined" aria-busy={loading}>
      <button className="text-button sleep-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to {backLabel}
      </button>
      <div className="sleep-page-heading health-page-heading">
        <div>
          <span className="eyebrow">HEALTH CHECK-IN</span>
          <h1>Health details</h1>
          <p className="helper">
            {date && `Updated ${date}`}
            {profileName ? `${date ? " · " : ""}For ${profileName}` : ""}
          </p>
        </div>
      </div>
      {!vitals ? (
        <section className="health-snapshot">
          <div>
            <p role={error ? "alert" : "status"}>
              {loading
                ? "Loading your readings…"
                : error || "No health readings available yet."}
            </p>
            {!loading && (
              <button className="text-button" onClick={onRetry}>
                Retry readings
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <section
            className="health-snapshot"
            aria-label="Health readings overview"
          >
            <span className="feature-icon health-feature-icon">
              <Icon name="pulse" />
            </span>
            <div>
              <span className="eyebrow">Your Live Health</span>
              <h2>Health at a glance</h2>
              <p>Five readings and an explanation of each.</p>
            </div>
            <p className="health-snapshot-note">
              {vitals.source === "demo"
                ? "These are illustrative readings for exploring the app."
                : "Your latest recorded health readings."}
            </p>
          </section>

          <section
            className="health-readings-panel"
            aria-labelledby="health-readings-heading"
          >
            <div className="sleep-section-heading">
              <span className="eyebrow">UNDERSTAND THE READINGS</span>
              <h2 id="health-readings-heading">Health readings</h2>
              <p>
                Tap a reading to learn more. References are for adults at rest;
                personal targets, including children's, can differ.
              </p>
            </div>
            <div className="health-reading-grid">
              {healthMetricsFor(vitals).map((metric) => (
                <details
                  className={`health-reading health-reading-${metric.id}`}
                  key={metric.id}
                >
                  <summary>
                    <span className="health-reading-label">
                      <span className="feature-icon health-feature-icon">
                        <Icon name={metric.icon} />
                      </span>
                      <strong>{metric.label}</strong>
                      <Icon name="arrow" />
                    </span>
                    <span className="health-reading-value">
                      {metric.value} <small>{metric.unit}</small>
                    </span>
                    <span className="health-reading-context">
                      {metric.context}
                    </span>
                  </summary>
                  <div className="health-reading-explanation">
                    <span className="eyebrow">ADULT REFERENCE</span>
                    <strong>{metric.reference}</strong>
                    <p>{metric.description}</p>
                    <p className="helper">{metric.note}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section
            className="health-recommendations"
            aria-labelledby="health-recommendations-heading"
          >
            <div className="sleep-section-heading">
              <span className="eyebrow">A LITTLE MORE CARE</span>
              <h2 id="health-recommendations-heading">
                Tips for your next check-in
              </h2>
              <p>
                A few small steps can help make your readings more consistent.
              </p>
            </div>
            <div className="health-recommendation-grid">
              {HEALTH_RECOMMENDATIONS.map((recommendation) => (
                <article
                  className="health-recommendation"
                  key={recommendation.title}
                >
                  <span className="feature-icon">
                    <Icon name={recommendation.icon} />
                  </span>
                  <div>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <p className="health-reading-links helper">
            Learn more:{" "}
            {HEALTH_SOURCES.map((source, index) => (
              <span key={source.url}>
                {index > 0 && " · "}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.label}
                </a>
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
