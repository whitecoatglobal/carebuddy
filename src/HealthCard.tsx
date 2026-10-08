import { Icon } from "./Icon";
import { HEALTH_METRICS, SAMPLE_HEALTH_CHECK } from "./healthData";

export function HealthCard({ onReview }: { onReview: () => void }) {
  return (
    <section className="health-review-card" aria-label="Daily health sample">
      <div className="health-card-heading">
        <span className="feature-icon health-feature-icon">
          <Icon name="pulse" />
        </span>
        <span className="eyebrow">DAILY HEALTH</span>
        <span className="sample-tag">Sample</span>
      </div>
      <dl className="health-card-readings">
        {HEALTH_METRICS.slice(0, 4).map((metric) => (
          <div key={metric.id}>
            <dt>
              <Icon name={metric.icon} />
              {metric.cardLabel}
            </dt>
            <dd>
              {metric.value}
              {" "}
              <small>{metric.unit}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p>Morning sample · {SAMPLE_HEALTH_CHECK.time} · At rest</p>
      <button className="text-button health-card-link" onClick={onReview}>
        Review Health <Icon name="arrow" />
      </button>
    </section>
  );
}
