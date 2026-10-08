import { useEffect, useRef, useState } from "react";
import type {
  State,
  CareDocument,
  CarePlan,
  CareBrief,
  CarePlanAction,
} from "care-buddy-shared";
import { careRequest, fileBase64 } from "./careJourneyClient";
import { careContextKey } from "./careJourneyState";
import "./careJourney.css";
type SavedPlan = {
  document: CareDocument;
  plan: CarePlan;
  completed?: string[];
  selectedActionIds?: string[];
};
type Library = { plans: SavedPlan[]; briefs: CareBrief[] };
const lines = (s: string) =>
  s
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
function loadLibrary(key: string): Library {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (v && Array.isArray(v.plans) && Array.isArray(v.briefs)) return v;
  } catch {}
  return { plans: [], briefs: [] };
}
function localDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(+d)) return "";
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function CareJourney({
  state,
  clientId,
  onApply,
  onBack,
}: {
  state: State;
  clientId: string;
  onApply: (plan: CarePlan, document: CareDocument, expected: string) => void;
  onBack: () => void;
}) {
  const profile = state.profiles.find((p) => p.id === state.selectedProfileId);
  const key = `carebuddy-journey:${clientId}:${profile?.id || "none"}`;
  const [library, setLibrary] = useState<Library>(() => loadLibrary(key));
  const [mode, setMode] = useState<"appointment" | "brief" | "postVisit">(
    "appointment",
  );
  const [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [fictional, setFictional] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [document, setDocument] = useState<CareDocument | null>(null),
    [plan, setPlan] = useState<CarePlan | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false),
    [expected, setExpected] = useState("");
  const [appointmentId, setAppointmentId] = useState(""),
    [concerns, setConcerns] = useState(""),
    [questions, setQuestions] = useState("");
  const [brief, setBrief] = useState<CareBrief | null>(null);
  const controller = useRef<AbortController | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const appointments = state.appointments.filter(
    (a) => a.profileId === profile?.id,
  );
  const saved = !!plan && state.appliedActions.includes("care-plan:" + plan.id);
  const stale =
    !!plan && careContextKey(state, plan.profileId) !== expected && !saved;
  const persist = (next: Library) => {
    localStorage.setItem(key, JSON.stringify(next));
    setLibrary(next);
  };
  async function run(
    label: string,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await task(c.signal);
    } catch (e) {
      if (alive.current && !c.signal.aborted) setError((e as Error).message);
    } finally {
      if (alive.current && controller.current === c) setBusy("");
    }
  }
  function changeMode(next: typeof mode) {
    if (busy) return;
    setMode(next);
    setError("");
    setNotice("");
    setReviewed(false);
    setPlan(null);
    setDocument(null);
    setBrief(null);
    setText("");
    setFile(null);
  }
  async function extract() {
    if (!fictional) {
      setError(
        "Confirm that this example contains fictional information only.",
      );
      return;
    }
    if (!file && !text.trim()) {
      setError("Choose a document or enter notes.");
      return;
    }
    if (file && file.size > 6 * 1024 * 1024) {
      setError("Choose a file smaller than 6 MB.");
      return;
    }
    await run("Reading your source…", async (signal) => {
      const body = file
        ? {
            name: file.name,
            mimeType: file.type,
            dataBase64: await fileBase64(file),
            fictionalOnly: true,
          }
        : {
            name:
              mode === "postVisit" ? "Post-visit notes" : "Appointment notes",
            mimeType: "text/plain",
            text,
            fictionalOnly: true,
          };
      const result = await careRequest<{ document: CareDocument }>(
        "extract",
        body,
        signal,
      );
      if (signal.aborted) return;
      setDocument(result.document);
      setPlan(null);
      setNotice(
        "Check the extracted text against your original before continuing.",
      );
    });
  }
  async function propose() {
    if (!document || !profile) return;
    const source = document;
    const context = careContextKey(state, profile.id);
    await run("Preparing a source-linked plan…", async (signal) => {
      const result = await careRequest<{ plan: CarePlan }>(
        "plan",
        {
          profileId: profile.id,
          profileName: profile.displayName,
          kind: mode,
          document: source,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          now: new Date().toISOString(),
          fictionalOnly: true,
        },
        signal,
      );
      if (signal.aborted) return;
      persist({
        ...library,
        plans: [
          { document: source, plan: result.plan },
          ...library.plans.filter((p) => p.plan.id !== result.plan.id),
        ].slice(0, 30),
      });
      setPlan(result.plan);
      setSelected(result.plan.actions.map((a) => a.id));
      setExpected(context);
      setReviewed(false);
      setNotice("Draft saved on this browser. Care records have not changed.");
    });
  }
  function editAction(id: string, patch: Partial<CarePlanAction>) {
    setReviewed(false);
    setPlan((p) =>
      p
        ? {
            ...p,
            actions: p.actions.map((a) =>
              a.id === id ? { ...a, ...patch } : a,
            ),
          }
        : p,
    );
  }
  function saveDraftChanges() {
    if (!plan || !document) return;
    try {
      persist({
        ...library,
        plans: [
          {
            ...library.plans.find((x) => x.plan.id === plan.id),
            document,
            plan,
            selectedActionIds: selected,
          },
          ...library.plans.filter((x) => x.plan.id !== plan.id),
        ].slice(0, 30),
      });
      setNotice(
        "Draft changes saved on this browser. Care records have not changed.",
      );
    } catch {
      setError("Could not save draft changes on this browser.");
    }
  }
  function confirm() {
    if (!plan || !document || !reviewed || stale || busy) return;
    try {
      const chosen = {
        ...plan,
        actions: plan.actions.filter((a) => selected.includes(a.id)),
      };
      onApply(chosen, document, expected);
      setNotice("Selected records saved. No provider was contacted.");
      setReviewed(false);
      try {
        persist({
          ...library,
          plans: [
            {
              ...library.plans.find((x) => x.plan.id === plan.id),
              document,
              plan,
              selectedActionIds: selected,
            },
            ...library.plans.filter((x) => x.plan.id !== plan.id),
          ].slice(0, 30),
        });
      } catch {
        setError(
          "Care records were saved, but the updated draft could not be saved on this browser.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createBrief() {
    const a = appointments.find((a) => a.id === appointmentId);
    if (!a) {
      setError("Choose an appointment for this brief.");
      return;
    }
    if (!fictional) {
      setError("Confirm that you are using fictional information only.");
      return;
    }
    await run("Preparing your visit brief…", async (signal) => {
      const result = await careRequest<{ brief: CareBrief }>(
        "brief",
        {
          profileId: profile!.id,
          profileName: profile!.displayName,
          fictionalOnly: true,
          appointment: a,
          reminders: state.reminders
            .filter((r) => r.profileId === profile!.id && !r.deletedAt)
            .slice(-100),
          concerns: lines(concerns),
          questions: lines(questions),
          pendingTasks: library.plans
            .filter((x) => x.plan.kind === "postVisit")
            .flatMap((x) =>
              x.plan.instructions.flatMap((v, i) =>
                x.completed?.includes(String(i))
                  ? []
                  : [{ id: x.plan.id + ":instruction:" + i, text: v.text }],
              ),
            )
            .slice(0, 30),
        },
        signal,
      );
      if (signal.aborted) return;
      persist({
        ...library,
        briefs: [result.brief, ...library.briefs].slice(0, 20),
      });
      setBrief(result.brief);
      setNotice("Brief saved on this browser. Review it before sharing.");
    });
  }
  function exportBrief() {
    if (!brief || !profile) return;
    const appointmentSource = brief.sources.find(
      (s) => s.id === "appointment:" + brief.appointmentId,
    );
    const out = [
      "Care Buddy — appointment brief",
      `For: ${profile.displayName}`,
      `Prepared: ${new Date(brief.createdAt).toLocaleString()}`,
      appointmentSource?.text || `Appointment source: ${brief.appointmentId}`,
      "Fictional prototype. Recorded outcomes are not clinical verification.",
      "",
      ...brief.sections.flatMap((s) => [
        s.heading,
        ...s.items.map((i) => `- ${i.text} [${i.sourceIds.join(", ")}]`),
        "",
      ]),
      "Questions to ask",
      ...brief.questions.map((q) => "- " + q),
      "",
      "Sources",
      ...brief.sources.map((s) => `${s.id}: ${s.text}`),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([out], { type: "text/plain;charset=utf-8" }),
    );
    const aEl = globalThis.document.createElement("a");
    aEl.href = url;
    aEl.download = "carebuddy-appointment-brief.txt";
    aEl.click();
    URL.revokeObjectURL(url);
  }
  function reopen(x: SavedPlan) {
    setMode(x.plan.kind);
    setDocument(x.document);
    setPlan(x.plan);
    setSelected(
      x.plan.actions
        .filter(
          (a) =>
            (!state.appliedActions.includes("care-plan:" + x.plan.id) &&
              (!x.selectedActionIds || x.selectedActionIds.includes(a.id))) ||
            state.appliedActions.includes(
              "care-plan:" + x.plan.id + ":" + a.id,
            ),
        )
        .map((a) => a.id),
    );
    setExpected(careContextKey(state, x.plan.profileId));
    setReviewed(false);
    setNotice("Review this saved draft against the current records.");
    setError("");
  }
  const checkTask = (planId: string, index: number) => {
    try {
      persist({
        ...library,
        plans: library.plans.map((x) =>
          x.plan.id === planId
            ? {
                ...x,
                completed: x.completed?.includes(String(index))
                  ? x.completed.filter((i) => i !== String(index))
                  : [...(x.completed || []), String(index)],
              }
            : x,
        ),
      });
    } catch {
      setError("Could not save checklist progress on this browser.");
    }
  };
  if (!profile?.canView)
    return (
      <section className="care-journey">
        <h1>Care journey</h1>
        <p>Select a person in Family to begin.</p>
        <button onClick={onBack}>Back to Today</button>
      </section>
    );
  return (
    <section className="care-journey">
      <div className="cj-heading">
        <div>
          <div className="eyebrow">BEFORE AND AFTER YOUR VISIT</div>
          <h1>Care journey</h1>
          <p>Bring the details together for {profile.displayName}.</p>
        </div>
        <button onClick={onBack}>Back to Today</button>
      </div>
      <p className="cj-boundary">
        Public prototype: use fictional documents and notes only. Source text is
        processed by the server and AI provider; drafts and briefs stay in this
        browser. Confirmed care records use the app’s existing sync.
      </p>
      <nav className="cj-tabs" aria-label="Care journey tools">
        {(
          [
            ["appointment", "Letter to plan"],
            ["brief", "Appointment brief"],
            ["postVisit", "After your visit"],
          ] as const
        ).map(([id, label]) => (
          <button
            disabled={!!busy}
            aria-pressed={mode === id}
            key={id}
            onClick={() => changeMode(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {busy && (
        <div role="status" className="notice">
          {busy}{" "}
          <button
            onClick={() => {
              controller.current?.abort();
              setBusy("");
            }}
          >
            Cancel request
          </button>
        </div>
      )}
      {!profile.canManage && (
        <p className="notice">
          This profile is view-only. You can prepare a brief, but cannot save
          new care records.
        </p>
      )}
      {mode === "brief" ? (
        <>
          <div className="cj-card">
            <h2>Walk in with the details ready.</h2>
            <p>
              A source-linked summary of the selected appointment, recorded
              routines, concerns and questions.
            </p>
            <label>
              Appointment
              <select
                aria-label="Appointment"
                value={appointmentId}
                onChange={(e) => {
                  setAppointmentId(e.target.value);
                  setBrief(null);
                }}
              >
                <option value="">Choose an appointment</option>
                {appointments.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.title} · {new Date(a.startsAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {!appointments.length && (
              <p>Add an appointment through Letter to plan first.</p>
            )}
            <label>
              Your concerns — one per line
              <textarea
                maxLength={2000}
                value={concerns}
                onChange={(e) => setConcerns(e.target.value)}
                placeholder="What would you like to discuss?"
              />
            </label>
            <label>
              Your questions — one per line
              <textarea
                maxLength={2000}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="What would you like to ask?"
              />
            </label>
            <label className="cj-check">
              <input
                type="checkbox"
                checked={fictional}
                onChange={(e) => setFictional(e.target.checked)}
              />
              I am using fictional information only.
            </label>
            <button
              className="primary"
              disabled={!!busy || !appointmentId}
              onClick={createBrief}
            >
              Prepare appointment brief
            </button>
          </div>
          {brief && (
            <article className="cj-card cj-brief">
              <h2>Visit brief for {profile.displayName}</h2>
              <p className="helper">
                Prepared {new Date(brief.createdAt).toLocaleString()} · Saved
                snapshot, not live clinical information
              </p>
              {brief.sections.map((section, i) => (
                <section key={i}>
                  <h3>{section.heading}</h3>
                  <ul>
                    {section.items.map((item, j) => (
                      <li key={j}>
                        {item.text}
                        <small className="cj-citation">
                          Sources: {item.sourceIds.join(", ")}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <h3>Questions to ask</h3>
              <ul>
                {brief.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <details>
                <summary>Review supporting sources</summary>
                {brief.sources.map((s) => (
                  <p key={s.id}>
                    <strong>{s.id}</strong>: {s.text}
                  </p>
                ))}
              </details>
              <button onClick={exportBrief}>Download brief (.txt)</button>
            </article>
          )}
        </>
      ) : (
        <>
          {!plan && (
            <div className="cj-card">
              <h2>
                {mode === "appointment"
                  ? "From a letter to a clear next step."
                  : "Keep the follow-up from getting lost."}
              </h2>
              <p>
                {mode === "appointment"
                  ? "Upload a fictional appointment letter or paste its text. Review the extracted details before creating records."
                  : "Paste fictional consultation notes or upload the instructions. Buddy separates recorded instructions, questions and proposed tasks."}
              </p>
              <label>
                Photo or PDF (PNG/JPEG/PDF, up to 6 MB, PDF up to 5 pages;
                English OCR)
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setDocument(null);
                  }}
                  disabled={!!busy}
                />
              </label>
              <label>
                Or paste {mode === "postVisit" ? "visit notes" : "letter text"}
                <textarea
                  value={text}
                  maxLength={24000}
                  disabled={!!file || !!busy}
                  onChange={(e) => {
                    setText(e.target.value);
                    setDocument(null);
                  }}
                  placeholder="Use a fictional person and clearly stated dates and instructions."
                />
              </label>
              <label className="cj-check">
                <input
                  type="checkbox"
                  checked={fictional}
                  onChange={(e) => setFictional(e.target.checked)}
                />
                This contains fictional information only.
              </label>
              <button className="primary" disabled={!!busy} onClick={extract}>
                Read source
              </button>
            </div>
          )}
          {document && !plan && (
            <div className="cj-card">
              <h2>Check the source text</h2>
              <p>
                Correct OCR errors against the original. Dates and instructions
                that are missing should remain missing.
              </p>
              {document.pages.map((page, i) => (
                <label key={page.page}>
                  Page {page.page}
                  <textarea
                    aria-label={`Page ${page.page}`}
                    value={page.text}
                    onChange={(e) =>
                      setDocument({
                        ...document,
                        pages: document.pages.map((p, j) =>
                          j === i ? { ...p, text: e.target.value } : p,
                        ),
                      })
                    }
                    disabled={!!busy}
                  />
                </label>
              ))}
              <button className="primary" disabled={!!busy} onClick={propose}>
                Prepare plan for review
              </button>
            </div>
          )}
          {plan && document && (
            <div className="cj-card">
              <div className="cj-heading">
                <h2>
                  {saved ? "Saved care plan" : "Review the proposed plan"}
                </h2>
                <button
                  disabled={!!busy}
                  onClick={() => {
                    setPlan(null);
                    setReviewed(false);
                  }}
                >
                  Back to source
                </button>
              </div>
              {!saved && (
                <>
                  <button onClick={saveDraftChanges} disabled={!!busy}>
                    Save draft changes
                  </button>
                  <p className="helper">
                    Save draft changes to keep edits and selected actions before
                    leaving this page.
                  </p>
                </>
              )}
              <p>{plan.summary}</p>
              <p>
                <strong>For {profile.displayName}</strong>
                {plan.sourcePersonName &&
                  ` · Name found in source: ${plan.sourcePersonName}`}
              </p>
              {plan.uncertainties.length > 0 && (
                <div className="notice">
                  <strong>Needs clarification</strong>
                  <ul>
                    {plan.uncertainties.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details>
                <summary>Original source: {document.name}</summary>
                {document.pages.map((p) => (
                  <div key={p.page}>
                    <h3>Page {p.page}</h3>
                    <pre className="cj-source">{p.text}</pre>
                  </div>
                ))}
              </details>
              {plan.instructions.length > 0 && (
                <section>
                  <h3>Instructions recorded in the source</h3>
                  <ul>
                    {plan.instructions.map((v, i) => (
                      <li key={i}>
                        {v.text}
                        <blockquote>
                          Page {v.page}: “{v.quote}”
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {plan.questions.length > 0 && (
                <section>
                  <h3>Questions to clarify</h3>
                  <ul>
                    {plan.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {saved && (
                <p className="helper">
                  Only actions marked Saved were added. To add an excluded item,
                  return to the source and prepare a new plan.
                </p>
              )}
              <h3>
                {saved
                  ? "Saved and excluded actions"
                  : "Choose and check each action"}
              </h3>
              {!plan.actions.length && (
                <p>
                  No sufficiently supported action was found. You can keep the
                  instructions and questions without creating a record.
                </p>
              )}
              {plan.actions.map((a) => (
                <fieldset
                  className="cj-action"
                  key={a.id}
                  disabled={saved || !!busy}
                >
                  <legend>
                    {a.type === "appointment"
                      ? "Appointment record"
                      : "Reminder"}
                    {saved
                      ? state.appliedActions.includes(
                          "care-plan:" + plan.id + ":" + a.id,
                        )
                        ? " — Saved"
                        : " — Not selected"
                      : ""}
                  </legend>
                  <label className="cj-check">
                    <input
                      type="checkbox"
                      checked={
                        saved
                          ? state.appliedActions.includes(
                              "care-plan:" + plan.id + ":" + a.id,
                            )
                          : selected.includes(a.id)
                      }
                      onChange={(e) => {
                        setSelected(
                          e.target.checked
                            ? [...selected, a.id]
                            : selected.filter((id) => id !== a.id),
                        );
                        setReviewed(false);
                      }}
                    />
                    Include this action
                  </label>
                  <label>
                    Title
                    <input
                      value={a.title}
                      maxLength={80}
                      onChange={(e) =>
                        editAction(a.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Date and time (
                    {Intl.DateTimeFormat().resolvedOptions().timeZone})
                    <input
                      type="datetime-local"
                      value={localDate(a.scheduledAt)}
                      onChange={(e) =>
                        editAction(a.id, {
                          scheduledAt: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                  </label>
                  {!a.scheduledAt && (
                    <p className="helper">
                      No definite time was provided. Enter a confirmed time or
                      exclude this action.
                    </p>
                  )}
                  {a.type === "appointment" ? (
                    <label>
                      Location
                      <input
                        value={a.location || ""}
                        maxLength={80}
                        onChange={(e) =>
                          editAction(a.id, { location: e.target.value })
                        }
                      />
                    </label>
                  ) : (
                    <label>
                      Repeat
                      <select
                        value={a.recurrence}
                        onChange={(e) =>
                          editAction(a.id, {
                            recurrence: e.target.value as "None" | "Daily",
                          })
                        }
                      >
                        <option>None</option>
                        <option>Daily</option>
                      </select>
                    </label>
                  )}
                  <label>
                    Recorded instructions
                    <textarea
                      value={a.instructions}
                      maxLength={500}
                      onChange={(e) =>
                        editAction(a.id, { instructions: e.target.value })
                      }
                    />
                  </label>
                  {a.evidence.map((e, i) => (
                    <blockquote key={i}>
                      Page {e.page}: “{e.quote}”
                    </blockquote>
                  ))}
                </fieldset>
              ))}
              {stale && (
                <div className="notice">
                  Care records changed since this draft was prepared.{" "}
                  <button
                    onClick={() => {
                      setExpected(careContextKey(state, plan.profileId));
                      setReviewed(false);
                      setNotice(
                        "Review all actions again against the latest care records.",
                      );
                    }}
                  >
                    Refresh review
                  </button>
                </div>
              )}
              {!saved && plan.actions.length > 0 && (
                <>
                  <label className="cj-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I checked the person, source, selected actions and dates.
                    Save only these records.
                  </label>
                  <button
                    className="primary"
                    disabled={
                      !!busy ||
                      !reviewed ||
                      stale ||
                      !selected.length ||
                      !profile.canManage
                    }
                    onClick={confirm}
                  >
                    Confirm and save {selected.length} selected{" "}
                    {selected.length === 1 ? "action" : "actions"}
                  </button>
                  <p className="helper">
                    No booking, prescription or provider contact is made.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
      <details className="cj-card">
        <summary>
          Saved journeys and briefs (
          {library.plans.length + library.briefs.length})
        </summary>
        {!library.plans.length && !library.briefs.length && (
          <p>Your reviewed drafts and briefs will appear here.</p>
        )}
        {library.plans.map((x) => (
          <article className="cj-saved" key={x.plan.id}>
            <button disabled={!!busy} onClick={() => reopen(x)}>
              {x.plan.kind === "postVisit"
                ? "After your visit"
                : "Letter to plan"}{" "}
              · {x.document.name}
            </button>
            <p className="helper">
              {state.appliedActions.includes("care-plan:" + x.plan.id)
                ? "Selected care records saved"
                : "Draft only — care records unchanged"}
            </p>
            {x.plan.kind === "postVisit" &&
              x.plan.instructions.map((v, i) => (
                <label className="cj-check" key={i}>
                  <input
                    type="checkbox"
                    disabled={!!busy || !profile.canManage}
                    checked={x.completed?.includes(String(i)) || false}
                    onChange={() => checkTask(x.plan.id, i)}
                  />
                  {v.text}
                </label>
              ))}
          </article>
        ))}
        {library.briefs.map((b) => (
          <button
            disabled={!!busy}
            key={b.id}
            onClick={() => {
              setMode("brief");
              setBrief(b);
              setAppointmentId(b.appointmentId);
            }}
          >
            Visit brief · {new Date(b.createdAt).toLocaleString()}
          </button>
        ))}
      </details>
    </section>
  );
}
