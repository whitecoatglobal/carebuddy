import { Icon } from "./Icon";

export function Onboarding({
  onSelf,
  onFamily,
  onSleep,
}: {
  onSelf: () => void;
  onFamily: () => void;
  onSleep: () => void;
}) {
  return (
    <div className="onboarding">
      <div className="onboarding-art" aria-hidden="true">
        <span className="art-orbit art-moon">
          <Icon name="moon" />
        </span>
        <span className="art-center">
          <Icon name="leaf" />
        </span>
        <span className="art-orbit art-heart">
          <Icon name="heart" />
        </span>
        <span className="art-orbit art-sun">
          <Icon name="sun" />
        </span>
      </div>
      <span className="eyebrow">A LITTLE CARE, EVERY DAY</span>
      <h1>
        Make space for
        <br />
        feeling better.
      </h1>
      <p className="onboarding-lead">
        Small routines, better rest, and care for the people who matter to you.
      </p>
      <div className="onboarding-choices">
        <button className="onboarding-choice" onClick={onSelf}>
          <span className="choice-icon">
            <Icon name="leaf" />
          </span>
          <span>
            <strong>For myself</strong>
            <small>Build a daily rhythm that feels like you.</small>
          </span>
          <Icon name="arrow" />
        </button>
        <button className="onboarding-choice" onClick={onFamily}>
          <span className="choice-icon choice-lavender">
            <Icon name="family" />
          </span>
          <span>
            <strong>For someone I care for</strong>
            <small>Keep their routines and appointments close.</small>
          </span>
          <Icon name="arrow" />
        </button>
      </div>
      <button className="text-button" onClick={onSleep}>
        <Icon name="moon" /> Explore the sample sleep review{" "}
        <Icon name="arrow" />
      </button>
      <p className="helper onboarding-note">
        Try Care Buddy with fictional names and records. Your sleep review uses
        sample data.
      </p>
    </div>
  );
}
