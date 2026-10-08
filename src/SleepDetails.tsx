import { Icon } from "./Icon";
import {
  SAMPLE_SLEEP_NIGHT,
  SLEEP_RECOMMENDATIONS,
  formatSleepDuration,
  getSleepNightLabels,
} from "./sleepData";

export function SleepDetails({
  profileName,
  now,
  onBack,
  backLabel = "Today",
  onCreateReminder,
  canManage = true,
  reminderLabel = "Create wind-down reminder",
}: {
  profileName?: string;
  now: Date;
  onBack: () => void;
  backLabel?: string;
  onCreateReminder: () => void;
  canManage?: boolean;
  reminderLabel?: string;
}) {
  const night = SAMPLE_SLEEP_NIGHT;
  const dates = getSleepNightLabels(now);

  return (
    <div className="sleep-details sleep-refined">
      <button className="text-button sleep-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to {backLabel}
      </button>
      <div className="sleep-page-heading">
        <div>
          <span className="eyebrow">LAST NIGHT</span>
          <h1>Sleep details</h1>
          <p className="helper">
            {dates.label}
            {profileName ? ` · For ${profileName}` : ""}
          </p>
        </div>
      </div>

      <section
        className="sleep-summary"
        aria-label="Last night's sleep summary"
      >
        <div className="sleep-score-block">
          <span className="sleep-score">
            {night.score}
            <small>%</small>
          </span>
          <div>
            <span className="eyebrow">SLEEP SCORE</span>
            <h2>Your night at a glance</h2>
            <p>Illustrative sleep data, not a measurement from your device.</p>
          </div>
        </div>
        <dl className="sleep-summary-stats">
          <div>
            <dt>Time asleep</dt>
            <dd>{formatSleepDuration(night.sleepMinutes)}</dd>
          </div>
          <div>
            <dt>Time in bed</dt>
            <dd>
              {formatSleepDuration(night.sleepMinutes + night.awakeMinutes)}
            </dd>
          </div>
          <div>
            <dt>Time awake</dt>
            <dd>{formatSleepDuration(night.awakeMinutes)}</dd>
          </div>
        </dl>
        <div className="sleep-night-times">
          <span>
            <Icon name="moon" /> Bedtime <strong>{night.bedtime}</strong>
          </span>
          <span>
            <Icon name="sun" /> Woke up <strong>{night.wakeTime}</strong>
          </span>
        </div>
      </section>

      <section
        className="sleep-stages-panel"
        aria-labelledby="sleep-stages-heading"
      >
        <div className="sleep-section-heading">
          <span className="eyebrow">UNDERSTAND YOUR NIGHT</span>
          <h2 id="sleep-stages-heading">Sleep stages</h2>
          <p>
            Percentages cover {formatSleepDuration(night.sleepMinutes)} of
            sleep. The {night.awakeMinutes} minutes awake are tracked
            separately.
          </p>
        </div>
        <div className="sleep-stages-layout">
          <div className="sleep-stage-list">
            {night.stages.map((stage) => (
              <details
                className={`sleep-stage sleep-stage-${stage.id}`}
                key={stage.id}
              >
                <summary>
                  <span className="sleep-stage-heading">
                    <span>
                      <span
                        className="sleep-stage-dot"
                        style={{ background: stage.color }}
                        aria-hidden="true"
                      />
                      <strong className="sleep-stage-name">{stage.name}</strong>
                      <small>{formatSleepDuration(stage.minutes)}</small>
                    </span>
                    <strong>{stage.percentage}%</strong>
                    <Icon name="arrow" />
                  </span>
                </summary>
                <p>
                  <span className="sleep-phase">{stage.phase}</span>
                  {stage.description}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        className="sleep-recommendations"
        aria-labelledby="sleep-recommendations-heading"
      >
        <div className="sleep-section-heading">
          <span className="eyebrow">A GENTLER NIGHT AHEAD</span>
          <h2 id="sleep-recommendations-heading">One routine for tonight</h2>
          <p>Start with one small change that fits your evening.</p>
        </div>
        <div className="sleep-recommendation-grid">
          {SLEEP_RECOMMENDATIONS.slice(0, 1).map((recommendation, index) => (
            <article
              className={
                "sleep-recommendation " +
                (index === 0 ? "sleep-recommendation-featured" : "")
              }
              key={recommendation.title}
            >
              <span className="sleep-recommendation-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{recommendation.title}</h3>
                <p>{recommendation.text}</p>
                {index === 0 && (
                  <>
                    <button
                      className="primary"
                      onClick={onCreateReminder}
                      disabled={!canManage}
                    >
                      <Icon name="moon" />
                      {reminderLabel}
                    </button>
                    {!canManage && (
                      <p className="helper">
                        Choose a profile with manage access to add a reminder.
                      </p>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="sleep-reading-links helper">
        Learn more from NIH:{" "}
        <a
          href="https://www.nhlbi.nih.gov/health/sleep/stages-of-sleep"
          target="_blank"
          rel="noopener noreferrer"
        >
          Sleep stages
        </a>
        {" · "}
        <a
          href="https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits"
          target="_blank"
          rel="noopener noreferrer"
        >
          Healthy sleep habits
        </a>
      </p>
    </div>
  );
}
