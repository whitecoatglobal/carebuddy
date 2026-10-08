import { useState } from "react";

const DEMO_URL = "/today";

const people = {
  you: {
    initial: "Y",
    name: "Your day",
    event: ["A moment for you.", "A routine that fits."],
    time: "Tonight · 9:00 pm",
    note: "Keep your chosen routine in view, one day at a time.",
  },
  mum: {
    initial: "M",
    name: "Mum’s day",
    event: ["Her appointment.", "Everything in view."],
    time: "Tomorrow · 10:00 am",
    note: "A place for the preparation notes you want to keep close.",
  },
  dad: {
    initial: "D",
    name: "Dad’s day",
    event: ["His evening routine.", "A little easier to follow."],
    time: "This evening · 6:00 pm",
    note: "See the reminders that belong to Dad, in his own care view.",
  },
} as const;

const walkthrough = [
  {
    speech: "“Remind me to wind down at 9:00 pm tonight.”",
    label: "01 / ASK",
    heading: "Start with a little ask.",
    copy: "Tell Buddy what you need, who it’s for, and when.",
    button: "See what happens",
  },
  {
    speech: "✓ A bedtime reminder, just for tonight.",
    label: "02 / SAVE",
    heading: "9:00 pm. Time for you.",
    copy: "A clear request can be saved straight away. Buddy shows you what changed; your regular schedule stays the same.",
    button: "See your day",
  },
  {
    speech: "Tonight · 9:00 pm · Wind down for bed",
    label: "03 / REVIEW",
    heading: "A little more together.",
    copy: "In the app, your reminder appears in Today, ready to review or adjust. This illustration has not saved a reminder.",
    button: "Play again",
  },
] as const;

function Brand({ stacked = false }: { stacked?: boolean }) {
  return stacked ? (
    <img
      className="logo-stacked"
      src="/branding/carebuddy-logo-v1.png"
      width="1066"
      height="741"
      alt="Care Buddy"
      loading="lazy"
    />
  ) : (
    <>
      <img
        className="logo-symbol"
        src="/branding/carebuddy-symbol-v1.png"
        width="256"
        height="249"
        alt=""
        aria-hidden="true"
      />
      <img
        className="logo-wordmark"
        src="/branding/carebuddy-wordmark-v1.png"
        width="640"
        height="140"
        alt="Care Buddy"
      />
    </>
  );
}

function DemoLink({ children }: { children: string }) {
  return (
    <a className="pill" href={DEMO_URL}>
      {children} <span aria-hidden="true">→</span>
    </a>
  );
}

function PhonePreview() {
  return (
    <div
      className="phone"
      role="img"
      aria-label="Illustrative Care Buddy phone showing a fictional day of reminders and an appointment"
    >
      <div className="status">
        <span>9:41</span>
        <span>▮▮▮ &nbsp; ▰</span>
      </div>
      <div className="phone-brand">
        <img
          className="logo-phone"
          src="/branding/carebuddy-wordmark-v1.png"
          width="640"
          height="140"
          alt=""
        />
        <span>☼</span>
      </div>
      <div className="date">THURSDAY, 8 OCTOBER</div>
      <h3>
        A little clarity.
        <br />
        For your day.
      </h3>
      <div className="person-tabs">
        <span className="selected">You</span>
        <span>Mum</span>
        <span>Dad</span>
      </div>
      <div className="next">
        <div className="next-label">NEXT UP</div>
        <div className="next-title">Your appointment.</div>
        <p>A moment to get everything ready.</p>
        <div className="time">
          <i className="clock" />
          14:30
          <span className="preview-details">View details ↗</span>
        </div>
      </div>
      <div className="timeline-title">
        Your day <span>＋</span>
      </div>
      <div className="routine">
        <span className="check">✓</span>
        <div>
          <strong>Morning routine</strong>
          <small>A good place to start.</small>
        </div>
        <time>08:00</time>
      </div>
      <div className="routine">
        <span className="check">◷</span>
        <div>
          <strong>Prepare for your visit</strong>
          <small>Keep your notes together.</small>
        </div>
        <time>13:30</time>
      </div>
      <div className="phone-nav">
        <span>
          <b>▦</b>Today
        </span>
        <span>
          <b>♧</b>Family
        </span>
        <span>
          <b>◇</b>Benefits
        </span>
        <span>
          <b>♡</b>Health
        </span>
        <span>
          <b>☏</b>Buddy
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [person, setPerson] = useState<keyof typeof people>("mum");
  const [step, setStep] = useState(0);
  const selected = people[person];
  const example = walkthrough[step];

  return (
    <div className="landing-page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <header className="nav">
          <a className="brand" href="/" aria-label="Care Buddy home">
            <Brand />
          </a>
          <nav className="links" aria-label="Main navigation">
            <a href="#family">Your people</a>
            <a href="#buddy">Meet Buddy</a>
            <DemoLink>Try Care Buddy</DemoLink>
          </nav>
        </header>
      </div>
      <main id="main">
        <section className="hero">
          <div className="shell">
            <div className="eyebrow">Everyday care. A little lighter.</div>
            <h1>
              Less to remember.
              <br />
              <span>More room to care.</span>
            </h1>
            <p className="lead">
              Your routines. Your people. Your next step.
              <br />A little more together, with Care Buddy.
            </p>
            <div className="actions">
              <DemoLink>Explore the demo</DemoLink>
              <a className="secondary" href="#buddy">
                Meet your Buddy <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="theater">
              <div className="halo" aria-hidden="true" />
              <div className="float-card family-float" aria-hidden="true">
                <div className="float-label">YOUR CIRCLE</div>
                <div className="avatar-row">
                  <div className="avatar">M</div>
                  <div>
                    <strong>Mum</strong>
                    <small>Appointment tomorrow</small>
                  </div>
                </div>
                <div className="avatar-row">
                  <div className="avatar sage">D</div>
                  <div>
                    <strong>Dad</strong>
                    <small>Evening routine</small>
                  </div>
                </div>
                <div className="float-footer">Different days. One place.</div>
              </div>
              <PhonePreview />
              <div className="float-card buddy-float" aria-hidden="true">
                <div className="buddy-head">
                  <span className="spark">✦</span>A little help from Buddy
                </div>
                <p>
                  “Shall we make some
                  <br />
                  room to wind down?”
                </p>
                <div className="pending">
                  <i />A little help. Always your choice.
                </div>
              </div>
              <p className="preview-note">
                Illustrative product preview. Fictional people and routines.
              </p>
            </div>
          </div>
        </section>
        <div className="shell">
          <section className="section family-section" id="family">
            <div className="intro-row">
              <h2 className="section-heading">
                Life has a lot of tabs open.
                <br />
                <span>Keep care in one place.</span>
              </h2>
              <p>
                From your morning routine to a parent’s appointment. See the
                little things that matter, together.
              </p>
            </div>
            <div className="family-stage">
              <div className="family-copy">
                <h3>
                  For you.
                  <br />
                  And your favourite people.
                </h3>
                <p>
                  A separate view for each person. The routines, reminders and
                  appointment notes that belong to them.
                </p>
                <div
                  className="switcher"
                  role="group"
                  aria-label="Explore fictional family examples"
                >
                  {(
                    [
                      ["you", "You"],
                      ["mum", "Mum"],
                      ["dad", "Dad"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={person === key}
                      onClick={() => setPerson(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="family-detail"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="detail-header">
                  <div
                    className={
                      "avatar " +
                      (person === "dad"
                        ? "sage"
                        : person === "you"
                          ? "lavender"
                          : "")
                    }
                  >
                    {selected.initial}
                  </div>
                  <div>
                    <strong>{selected.name}</strong>
                    <small>Fictional family preview</small>
                  </div>
                </div>
                <div className="detail-label">A LITTLE HEADS-UP</div>
                <div className="detail-event">
                  {selected.event[0]}
                  <br />
                  {selected.event[1]}
                </div>
                <div className="detail-time">{selected.time}</div>
                <div className="detail-note">{selected.note}</div>
              </div>
            </div>
          </section>
          <section className="dark" id="buddy">
            <div>
              <div className="eyebrow">Meet Buddy</div>
              <h2>
                A little help.
                <br />
                Your final say.
              </h2>
              <p className="bodycopy">
                Ask in your own words. See what changed. Keep everyday care
                moving, with you in control.
              </p>
              <div className="step-dots" aria-hidden="true">
                {walkthrough.map((_, index) => (
                  <span key={index} className={index === step ? "on" : ""} />
                ))}
              </div>
              <p className="micro">
                Try the illustrative walkthrough.
                <br />
                No records are changed here.
              </p>
            </div>
            <div className="demo">
              <div className="buddy-head">
                <span className="spark">✦</span>Buddy · For you
              </div>
              <div
                className="demo-content"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="speech">{example.speech}</div>
                <div className="demo-step">{example.label}</div>
                <h3>{example.heading}</h3>
                <p>{example.copy}</p>
              </div>
              <button
                type="button"
                className={step === 2 ? "secondary-demo" : ""}
                onClick={() =>
                  setStep((value) => (value + 1) % walkthrough.length)
                }
              >
                {example.button}{" "}
                <span aria-hidden="true">{step === 2 ? "↺" : "→"}</span>
              </button>
            </div>
          </section>
          <section className="workbuddy" id="workbuddy">
            <div>
              <div className="eyebrow">A Tencent hackathon project</div>
              <h2>
                Thoughtful by design.
                <br />
                Built to be explored.
              </h2>
            </div>
            <div>
              <p>
                Care Buddy brings everyday care into focus. The prototype also
                includes a WorkBuddy handoff: export fictional context, run an
                installed skill, then import a proposal to review.
              </p>
              <details>
                <summary>
                  About the prototype <span aria-hidden="true">＋</span>
                </summary>
                <p>
                  WorkBuddy uses a manual export/import workflow. The
                  compositions on this page are illustrative; explore the demo
                  to use the working app with fictional care data. Care Buddy
                  does not diagnose, prescribe, book care or verify cover.
                </p>
              </details>
            </div>
          </section>
          <section className="finish">
            <div className="brand">
              <Brand stacked />
            </div>
            <h2>
              A little less mental load.
              <br />A little more life.
            </h2>
            <p>Start with one calmer day.</p>
            <DemoLink>Explore Care Buddy</DemoLink>
          </section>
          <footer className="footer">
            <p>
              Care Buddy · Hackathon prototype. Fictional data only.
              <br />
              Product compositions are illustrative. Not a medical or insurance
              service.
            </p>
            <a href="#main">Back to top ↑</a>
          </footer>
        </div>
      </main>
    </div>
  );
}
