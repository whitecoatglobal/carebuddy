import { Icon } from "./Icon";
import {
  HEALTH_METRICS,
  HEALTH_RECOMMENDATIONS,
  HEALTH_SOURCES,
  SAMPLE_HEALTH_CHECK,
} from "./healthData";

export function HealthDetails({
  profileName,
  now,
  onBack,
  backLabel = "Today",
}: {
  profileName?: string;
  now: Date;
  onBack: () => void;
  backLabel?: string;
}) {
  const date = new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(now);
  return (
    <div className="health-details">
      <button className="text-button sleep-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to {backLabel}
      </button>
      <div className="sleep-page-heading health-page-heading">
        <div>
          <span className="eyebrow">MORNING CHECK-IN</span>
          <h1>Health details</h1>
          <p className="helper">
            {date} · {SAMPLE_HEALTH_CHECK.time}
            {profileName ? ` · For ${profileName}` : ""}
          </p>
        </div>
        <span className="sleep-sample-badge health-sample-badge">
          Sample data
        </span>
      </div>
      <section className="health-snapshot" aria-label="Morning health sample">
        <span className="feature-icon health-feature-icon">
          <Icon name="pulse" />
        </span>
        <div>
          <span className="eyebrow">YOUR EVERYDAY SIGNALS</span>
          <h2>A moment to check in</h2>
          <p>A quick look at five readings and what they measure.</p>
        </div>
        <p className="health-snapshot-note">
          These are illustrative readings for exploring the app.
        </p>
      </section>

      <section
        className="health-readings-panel"
        aria-labelledby="health-readings-heading"
      >
        <div className="sleep-section-heading">
          <span className="eyebrow">UNDERSTAND YOUR READINGS</span>
          <h2 id="health-readings-heading">Your health snapshot</h2>
          <p>
            Tap a reading to learn more. References are for adults at rest;
            personal targets, including children's, can differ.
          </p>
        </div>
        <div className="health-reading-grid">
          {HEALTH_METRICS.map((metric) => (
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
                  {metric.value}
                  {" "}
                  <small>{metric.unit}</small>
                </span>
                <span className="health-reading-context">{metric.context}</span>
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
          <p>A few small steps can help make your readings more consistent.</p>
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
    </div>
  );
}
