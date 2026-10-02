import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { usePwa } from "./pwa";
import { APP_NAME, APP_SUBTITLE } from "./config";
import {
  loadState,
  saveState,
  execute,
  formatTime,
  formatDate,
  isoAt,
  notificationTime,
  statusLabel,
  buildChatAction,
  preparationTime,
  assertFreshAction,
  importSkillProposal,
  validateState,
  materialize,
} from "./domain";
import { interpretBuddyMessage, isBackendEnabled } from "./buddyClient";
import { fetchHealthSnapshot, type HealthSnapshot } from "./healthClient";
import { getClientId, isSyncEnabled, pullState, pushState } from "./syncClient";
import type {
  State,
  Command,
  Action,
  Reminder,
  ReminderInput,
  Receipt,
  HealthReading,
  WeatherData,
  HealthAdvice,
} from "./types";
const uid = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
};
const benefitStatus = (status: string) =>
  status
    .replace("Listed in sample plan", "Listed in plan")
    .replace("Not listed in sample data", "Not listed in available terms");
const benefitName = (category: string) =>
  ({
    gp: "GP visits",
    screening: "Health screening",
    "health-check": "Health screening",
    dental: "Dental",
    other: "Other services",
  })[category] || category;
const categories = [
  "Medication",
  "Bedtime",
  "Personal care",
  "Appointment preparation",
  "Other",
] as const;
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    today: (
      <>
        <path d="M8 2v4m8-4v4M3 10h18" />
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="m8 15 3 3 5-6" />
      </>
    ),
    family: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M2 21v-3a7 7 0 0 1 14 0v3m1-17a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2" />
      </>
    ),
    benefits: (
      <>
        <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    buddy: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="5" />
        <path d="m7 18-1 4 5-4M8 10h.01M16 10h.01M8 14h8" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 3 4 0 1 3 3 1 3 3-1 4-3 1-1 3-3 3-4-1-1-3-3-1-3-3 1-4 3-1Z" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    car: (
      <>
        <path d="m5 8 2-5h10l2 5M3 10h18v9H3Z" />
        <path d="M6 19v2m12-2v2M6 13h2m8 0h2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pulse: (
      <>
        <path d="M3 12h4l2-5 3 10 2-5h7" />
      </>
    ),
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.clock}
    </svg>
  );
}
function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    const node = ref.current!;
    const focus = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        ),
      ).filter((x) => !x.hasAttribute("disabled"));
    focus()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (
        Array.from(document.querySelectorAll("[role=dialog]")).at(-1) !== node
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const f = focus();
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      opener?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button aria-label="Close" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
function ReceiptView({ receipt, state }: { receipt: Receipt; state: State }) {
  return (
    <details className="receipt">
      <summary>Action details · {receipt.outcome}</summary>
      <dl>
        <dt>Source</dt>
        <dd>Care Buddy local action</dd>
        <dt>Information used</dt>
        <dd>{receipt.sourceIds.join(", ") || "User-entered input"}</dd>
        <dt>Person</dt>
        <dd>
          {state.profiles.find((p) => p.id === receipt.profileId)
            ?.displayName || "Removed profile"}
        </dd>
        <dt>Actor</dt>
        <dd>{receipt.actor === "p-me" ? "Me" : receipt.actor}</dd>
        <dt>Operation</dt>
        <dd>{receipt.operation}</dd>
        <dt>User confirmation</dt>
        <dd>{receipt.confirmation ? "Confirmed" : "Not confirmed"}</dd>
        <dt>Local save outcome</dt>
        <dd>{receipt.outcome}</dd>
        <dt>Recorded at</dt>
        <dd>{receipt.timestamp}</dd>
      </dl>
    </details>
  );
}
export default function App() {
  const pwa = usePwa();
  const initial = useRef(loadState());
  const [state, setState] = useState(initial.current.state);
  const stateRef = useRef(state);
  const clientId = useRef(getClientId());
  const [route, setRoute] = useState(location.pathname + location.search);
  const [toast, setToast] = useState(initial.current.notice);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const failNext = useRef(false);
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (!isSyncEnabled() || syncedOnce.current) return;
    syncedOnce.current = true;
    pullState(clientId.current).then((remote) => {
      if (remote && validateState(remote)) {
        const next = materialize(remote);
        saveState(next);
        stateRef.current = next;
        setState(next);
      } else if (remote) {
        pushState(clientId.current, stateRef.current);
      }
    });
  }, []);
  const [modal, setModal] = useState<{
    title: string;
    content: ReactNode;
  } | null>(null);
  const [pending, setPending] = useState<{
    action: Action;
    message?: string;
    onDone?: () => void;
  } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [form, setForm] = useState<{
    kind: string;
    values: Record<string, string>;
    original: string;
    id?: string;
    scope?: "occurrence" | "future";
  } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [scopePrompt, setScopePrompt] = useState<string | null>(null);

  const [snooze, setSnooze] = useState<Reminder | null>(null);
  const [snoozeTime, setSnoozeTime] = useState("09:15");
  const [scopeEdit, setScopeEdit] = useState<Reminder | null>(null);
  const [discard, setDiscard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buddyThinking, setBuddyThinking] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const profile = state.profiles.find((p) => p.id === state.selectedProfileId)!;
  const person = (id: string) =>
    state.profiles.find((p) => p.id === id)?.displayName || "Unknown person";
  const go = (path: string) => {
    if (stateRef.current.carMode === "driving" && path !== "/car") {
      setToast("Available when parked");
      path = "/car";
    }
    history.pushState({}, "", path);
    setRoute(path);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const pop = () => {
      if (
        stateRef.current.carMode === "driving" &&
        location.pathname !== "/car"
      ) {
        history.replaceState({}, "", "/car");
        setToast("Available when parked");
      }
      setRoute(location.pathname + location.search);
    };
    window.addEventListener("popstate", pop);
    if (
      location.pathname === "/" ||
      (!state.started && location.pathname === "/today")
    ) {
      history.replaceState({}, "", state.started ? "/today" : "/welcome");
      setRoute(state.started ? "/today" : "/welcome");
    }
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const commit = (
    command: Command,
    options: {
      id?: string;
      expected?: string;
      success?: string;
      done?: () => void;
      chatReceipt?: Receipt;
    } = {},
  ) => {
    const perform = () => {
      try {
        let next = execute(
          stateRef.current,
          command,
          options.id || uid(),
          options.expected,
        );
        if (options.chatReceipt)
          next = execute(
            next,
            {
              type: "chatMessage",
              message: {
                id: options.chatReceipt.actionId + "-receipt",
                profileId: options.chatReceipt.profileId,
                role: "assistant",
                text: "Saved. View your updated day.",
                contextId: context,
                timestamp: next.now,
                actionReceipt: options.chatReceipt,
              },
            },
            options.chatReceipt.actionId + "-receipt",
          );
        if (failNext.current) {
          failNext.current = false;
          throw new Error("Could not save on this device");
        }
        saveState(next);
        stateRef.current = next;
        setState(next);
        setError("");
        setRetry(null);
        if (options.success) setToast(options.success);
        options.done?.();
        if (isSyncEnabled()) pushState(clientId.current, next);
      } catch (e) {
        setError((e as Error).message);
        setRetry(() => perform);
      }
    };
    perform();
  };
  const select = (id: string) => {
    setPending(null);
    setReceipt(null);
    setContext(null);
    setScopePrompt(null);
    setForm(null);
    setSnooze(null);
    commit(
      { type: "selectProfile", profileId: id },
      {
        done: () => {
          if (
            /\/appointments\/|\/family\/|\/benefits\//.test(route) ||
            route.includes("?")
          )
            go("/today");
        },
      },
    );
  };
  const action = (
    command: Command,
    label: string,
    sourceIds: string[] = [],
    done?: () => void,
  ) => {
    if (
      "input" in command &&
      command.input.profileId !== stateRef.current.selectedProfileId
    ) {
      commit({ type: "selectProfile", profileId: command.input.profileId });
      setContext(null);
      setScopePrompt(null);
    }
    setReceipt(null);
    setPending({
      action: {
        id: uid(),
        profileId:
          "input" in command
            ? command.input.profileId
            : stateRef.current.selectedProfileId,
        command,
        sourceIds,
        label,
      },
      onDone: done,
    });
  };
  const confirm = () => {
    if (!pending || stateRef.current.appliedActions.includes(pending.action.id))
      return;
    const p = pending;
    try {
      assertFreshAction(stateRef.current, p.action);
    } catch (e) {
      setError((e as Error).message);
      setRetry(null);
      return;
    }
    const saved: Receipt = {
      actionId: p.action.id,
      sourceIds: p.action.sourceIds,
      profileId: p.action.profileId,
      actor: "Me",
      operation: p.action.label,
      confirmation: true,
      outcome: "Saved",
      timestamp: state.now,
    };
    commit(p.action.command, {
      id: p.action.id,
      expected: p.action.profileId,
      success: "Saved on this device",
      chatReceipt: p.message ? saved : undefined,
      done: () => {
        setReceipt(saved);
        setPending(null);
        p.onDone?.();
      },
    });
  };
  useEffect(() => {
    if (error && pending)
      setReceipt({
        actionId: pending.action.id,
        sourceIds: pending.action.sourceIds,
        profileId: pending.action.profileId,
        actor: "Me",
        operation: pending.action.label,
        confirmation: true,
        outcome: "Save failed",
        timestamp: state.now,
      });
  }, [error]);
  const cancelPending = () => {
    if (pending?.message) {
      const r: Receipt = {
        actionId: pending.action.id,
        sourceIds: pending.action.sourceIds,
        profileId: pending.action.profileId,
        actor: "Me",
        operation: pending.action.label,
        confirmation: false,
        outcome: "Cancelled",
        timestamp: state.now,
      };
      commit({
        type: "chatMessage",
        message: {
          id: uid(),
          profileId: pending.action.profileId,
          role: "assistant",
          text: "No changes made",
          contextId: context,
          timestamp: state.now,
          actionReceipt: r,
        },
      });
    }
    setPending(null);
    setReceipt(null);
    setToast("No changes made");
  };
  const openForm = (
    kind: string,
    values: Record<string, string>,
    id?: string,
    scope?: "occurrence" | "future",
  ) => {
    setFormErrors({});
    setForm({ kind, values, original: JSON.stringify(values), id, scope });
  };
  const closeForm = () => {
    if (form && JSON.stringify(form.values) !== form.original) {
      setDiscard(true);
    } else setForm(null);
  };
  const reminderForm = (
    r?: Reminder,
    scope: "occurrence" | "future" = "occurrence",
    appointmentId?: string,
  ) => {
    const a = state.appointments.find((x) => x.id === appointmentId);
    const existing =
      !r &&
      a &&
      state.reminders.find(
        (x) =>
          x.appointmentId === a.id &&
          !x.deletedAt &&
          !x.outcome &&
          x.category === "Appointment preparation",
      );
    if (existing) {
      viewReminder(existing.id);
      setToast(
        "An existing preparation reminder is already linked to this appointment.",
      );
      return;
    }
    const after = new Date(Date.parse(state.now) + 60 * 60000);
    const localAfter = new Date(after.getTime() + 8 * 3600000).toISOString();
    const time =
      r?.scheduledAt ||
      (a && preparationTime(state, a.startsAt)) ||
      isoAt(localAfter.slice(0, 10), localAfter.slice(11, 16));
    openForm(
      "reminder",
      {
        profileId: r?.profileId || a?.profileId || state.selectedProfileId,
        category: r?.category || (a ? "Appointment preparation" : "Other"),
        title: r?.title || (a ? a.title + " preparation" : ""),
        date: time.slice(0, 10),
        time: time.slice(11, 16),
        recurrence: r?.recurrence || "None",
        instructions: r?.instructions || "",
        appointmentId: r?.appointmentId || appointmentId || "",
      },
      r?.id,
      scope,
    );
  };
  const viewReminder = (id: string) =>
    go(location.pathname + "?reminder=" + encodeURIComponent(id));
  const closeReminder = () => go(location.pathname);
  const reminders = state.reminders.filter(
    (r) => r.profileId === profile.id && !r.deletedAt,
  );
  const todayReminders = reminders
    .filter((r) => r.occurrenceDate === state.now.slice(0, 10))
    .sort(
      (a, b) =>
        Date.parse(notificationTime(a)) - Date.parse(notificationTime(b)),
    );
  const appointments = state.appointments
    .filter((a) => a.profileId === profile.id)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const sorted = [...todayReminders.filter((r) => !r.outcome)].sort(
    (a, b) =>
      notificationTime(a).localeCompare(notificationTime(b)) ||
      a.id.localeCompare(b.id),
  );
  const nextReminder = sorted[0];
  const nextAppointment = [...appointments]
    .filter((a) => a.startsAt >= state.now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const next =
    nextReminder &&
    (!nextAppointment ||
      new Date(notificationTime(nextReminder)) <=
        new Date(nextAppointment.startsAt))
      ? nextReminder
      : undefined;
  const reminderId = new URLSearchParams(route.split("?")[1]).get("reminder");
  const detail = state.reminders.find(
    (r) => r.id === reminderId && r.profileId === profile.id && !r.deletedAt,
  );
  const path = route.split("?")[0];
  const ask = (id?: string) => {
    setContext(id || null);
    setPending(null);
    go("/buddy");
  };
  const complete = (r: Reminder, outcome: "taken" | "complete" | "skipped") =>
    action(
      { type: "completeReminder", id: r.id, outcome },
      `Record ${r.title} as ${outcome} for ${person(r.profileId)}?`,
      [r.id],
      () => closeReminder(),
    );
  const reminderRow = (r: Reminder) => (
    <button
      className="timeline-row"
      key={r.id}
      onClick={() => viewReminder(r.id)}
    >
      <span className={"type-icon " + (r.outcome ? "done" : "")}>
        <Icon name={r.outcome ? "check" : "clock"} />
      </span>
      <span className="row-copy">
        <strong>{r.title}</strong>
        <span>
          {formatTime(r.scheduledAt)} · {person(r.profileId)}
        </span>
        {r.notificationSnoozedUntil && (
          <small>Notification: {formatTime(r.notificationSnoozedUntil)}</small>
        )}
      </span>
      <span
        className={
          "status " + (!r.outcome && r.category === "Medication" ? "amber" : "")
        }
      >
        {statusLabel(r)}
      </span>
      <Icon name="arrow" />
    </button>
  );
  const summary = (p = profile) => {
    const rs = state.reminders
      .filter((r) => r.profileId === p.id && !r.deletedAt && !r.outcome)
      .sort((a, b) => notificationTime(a).localeCompare(notificationTime(b)));
    const a = state.appointments
      .filter(
        (a) =>
          a.profileId === p.id &&
          Date.parse(a.startsAt) > Date.parse(state.now),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return rs[0]
      ? rs[0].title + " · " + formatTime(rs[0].scheduledAt)
      : a
        ? a.title + " · " + formatDate(a.startsAt)
        : "No reminders or appointments yet";
  };
  const about = () =>
    setModal({
      title: "About Care Buddy",
      content: (
        <>
          <p>Fictional data only. Not a medical or insurance service.</p>
          <p>
            This is a prototype with fictional records and a reference clock.
            Buddy uses local rules and current records; it is not connected to
            WorkBuddy or a live AI model. Benefits, appointment requests, alerts
            and car connection are illustrative. All changes stay on this
            device.
          </p>
          <p>
            Care Buddy helps organise routine care. It does not assess symptoms,
            diagnose, prescribe, verify cover, make bookings or handle
            emergencies.
          </p>
          <h3>Install on your phone</h3>
          <p>
            iPhone: open in Safari, tap Share, then Add to Home Screen. Android:
            open the browser menu and choose Install app or Add to Home screen
            if available.
          </p>
          <p>
            Open once online before using offline. Install prompts vary by
            browser. No real push or background sync is included.
          </p>
        </>
      ),
    });
  function renderToday() {
    return (
      <>
        <div className="eyebrow">
          {new Intl.DateTimeFormat("en-SG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Asia/Singapore",
          }).format(new Date(state.now))}
        </div>
        <h1>
          {profile.id === "p-me" ? "Your day" : profile.displayName + "'s day"}
        </h1>
        <p className="lead">
          {todayReminders.filter((r) => !r.outcome).length} routines to record
          {appointments.some(
            (a) =>
              a.startsAt.slice(0, 10) === state.now.slice(0, 10) &&
              Date.parse(a.startsAt) >= Date.parse(state.now),
          )
            ? ` · ${appointments.filter((a) => a.startsAt.slice(0, 10) === state.now.slice(0, 10) && Date.parse(a.startsAt) >= Date.parse(state.now)).length} appointment${appointments.filter((a) => a.startsAt.slice(0, 10) === state.now.slice(0, 10) && Date.parse(a.startsAt) >= Date.parse(state.now)).length === 1 ? "" : "s"} today`
            : " · No appointments today"}
        </p>
        {!profile.canManage && (
          <div className="notice">
            You can view reminders, but cannot update this profile.
          </div>
        )}
        <div className="day-layout">
          <div className="day-focus">
            <section className="next-card">
              <div className="section-kicker">
                <Icon name="clock" /> NEXT UP
                {next && (
                  <span className="status amber">{statusLabel(next)}</span>
                )}
              </div>
              {next ? (
                <>
                  <div className="next-heading">
                    <h2>{next.title}</h2>
                  </div>
                  <p>
                    For: {profile.displayName} · Due at{" "}
                    {formatTime(next.scheduledAt)}
                  </p>
                  {next.notificationSnoozedUntil && (
                    <p>
                      Notification at{" "}
                      {formatTime(next.notificationSnoozedUntil)}
                    </p>
                  )}
                  <p className="helper">
                    {next.category === "Medication"
                      ? "Follow your existing medication instructions."
                      : "Your personal routine, at your chosen time."}
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={!profile.canManage}
                      onClick={() =>
                        complete(
                          next,
                          next.category === "Medication" ? "taken" : "complete",
                        )
                      }
                    >
                      <Icon name="check" />
                      {next.category === "Medication"
                        ? "Mark as taken"
                        : "Mark complete"}
                    </button>
                    <button
                      disabled={!profile.canManage}
                      onClick={() => {
                        setSnooze(next);
                        setSnoozeTime(
                          new Intl.DateTimeFormat("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: "Asia/Singapore",
                          }).format(
                            new Date(Date.parse(state.now) + 15 * 60000),
                          ),
                        );
                      }}
                    >
                      Remind me later
                    </button>
                    <button
                      className="text-button"
                      onClick={() => ask(next.id)}
                    >
                      Ask Buddy
                    </button>
                  </div>
                </>
              ) : nextAppointment ? (
                <>
                  <h2>{nextAppointment.title}</h2>
                  <p>
                    {formatDate(nextAppointment.startsAt)} ·{" "}
                    {formatTime(nextAppointment.startsAt)}
                  </p>
                  <button
                    onClick={() => go("/appointments/" + nextAppointment.id)}
                  >
                    View appointment
                  </button>
                </>
              ) : (
                <>
                  <h2>Nothing else scheduled</h2>
                  <p>Enjoy a little breathing room.</p>
                  <button
                    onClick={() => reminderForm()}
                    disabled={!profile.canManage}
                  >
                    Add reminder
                  </button>
                </>
              )}
            </section>
            {nextAppointment && (
              <div className="appointment-strip">
                <Icon name="today" />
                <div>
                  <small>NEXT APPOINTMENT</small>
                  <strong>{nextAppointment.title}</strong>
                  <span>
                    {formatDate(nextAppointment.startsAt)} ·{" "}
                    {formatTime(nextAppointment.startsAt)}
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => go("/appointments/" + nextAppointment.id)}
                >
                  View appointment <Icon name="arrow" />
                </button>
              </div>
            )}
          </div>
          <div className="day-timeline">
            <div className="section-heading">
              <h2>Daily timeline</h2>
              <button
                className="text-button"
                disabled={!profile.canManage}
                onClick={() => reminderForm()}
              >
                <Icon name="plus" />
                Add reminder
              </button>
            </div>
            {["Earlier", "Upcoming", "Completed", "Recorded as skipped"].map(
              (group) => {
                const items = todayReminders.filter((r) =>
                  group === "Completed"
                    ? r.outcome === "taken" || r.outcome === "complete"
                    : group === "Recorded as skipped"
                      ? r.outcome === "skipped"
                      : !r.outcome &&
                        (group === "Earlier"
                          ? notificationTime(r) < state.now
                          : notificationTime(r) >= state.now),
                );
                if (group === "Completed")
                  return (
                    <details className="timeline-group" key={group}>
                      <summary>Completed ({items.length})</summary>
                      {items.map(reminderRow)}
                      {items.length === 0 && (
                        <p className="helper">
                          Reported completions will appear here.
                        </p>
                      )}
                    </details>
                  );
                return items.length > 0 ? (
                  <section className="timeline-group" key={group}>
                    <h3>{group}</h3>
                    {items.map(reminderRow)}
                  </section>
                ) : null;
              },
            )}
            {appointments.filter(
              (a) =>
                a.startsAt.slice(0, 10) === state.now.slice(0, 10) &&
                Date.parse(a.startsAt) >= Date.parse(state.now),
            ).length > 0 && (
              <section className="timeline-group">
                <h3>Upcoming appointments</h3>
                {appointments
                  .filter(
                    (a) =>
                      a.startsAt.slice(0, 10) === state.now.slice(0, 10) &&
                      Date.parse(a.startsAt) >= Date.parse(state.now),
                  )
                  .map((a) => (
                    <button
                      className="timeline-row"
                      key={a.id}
                      onClick={() => go("/appointments/" + a.id)}
                    >
                      <span className="type-icon">
                        <Icon name="today" />
                      </span>
                      <span className="row-copy">
                        <strong>{a.title}</strong>
                        <span>
                          {formatTime(a.startsAt)} · {profile.displayName}
                        </span>
                      </span>
                      <span className="status">Appointment</span>
                      <Icon name="arrow" />
                    </button>
                  ))}
              </section>
            )}
            {todayReminders.length === 0 && (
              <div className="empty">
                <h3>No reminders today</h3>
                <p>Add a routine to help organise your day.</p>
                <button
                  onClick={() => reminderForm()}
                  disabled={!profile.canManage}
                >
                  Add reminder
                </button>
              </div>
            )}
          </div>
        </div>
        <aside className="care-insight">
          <Icon name="buddy" />
          <div>
            <strong>
              {
                todayReminders.filter(
                  (r) => r.outcome === "taken" || r.outcome === "complete",
                ).length
              }{" "}
              of {todayReminders.length} routines recorded
            </strong>
            <p>
              {nextAppointment
                ? `Next appointment: ${nextAppointment.title}, ${formatDate(nextAppointment.startsAt)}.`
                : "Your appointment list is clear."}
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setContext(null);
              go("/buddy");
            }}
          >
            Plan my day <Icon name="arrow" />
          </button>
        </aside>
        <div className="quiet-actions">
          <button className="text-button" onClick={() => go("/care/gp")}>
            Find GP care <Icon name="arrow" />
          </button>
          <button className="text-button" onClick={() => go("/car")}>
            <Icon name="car" />
            Car mode
          </button>
        </div>
      </>
    );
  }
  function renderFamily() {
    const id = path.split("/")[2];
    const member = state.profiles.find((p) => p.id === id);
    if (id) {
      if (!member || !member.canView) return notFound();
      return (
        <>
          <button className="text-button" onClick={() => go("/family")}>
            ← Back to Family
          </button>
          <h1>{member.displayName}</h1>
          <p className="lead">
            {member.relationship} ·{" "}
            {member.canManage ? "Can manage reminders" : "Can view reminders"}
          </p>
          <div className="notice">
            Actions on this page are for {member.displayName}.
          </div>
          {!member.canManage && (
            <button
              onClick={() =>
                setModal({
                  title: "Why can't I edit?",
                  content: (
                    <p>
                      This profile is view-only. Changing a relationship label
                      does not grant access.
                    </p>
                  ),
                })
              }
            >
              Why can't I edit?
            </button>
          )}
          <h2>Next action</h2>
          <p>{summary(member)}</p>
          <h2>Reminders</h2>
          {state.reminders
            .filter(
              (r) =>
                r.profileId === member.id &&
                !r.deletedAt &&
                r.occurrenceDate === state.now.slice(0, 10),
            )
            .map(reminderRow)}
          <h2>Upcoming appointments</h2>
          {state.appointments
            .filter((a) => a.profileId === member.id)
            .map((a) => (
              <button
                className="list-row"
                key={a.id}
                onClick={() => go("/appointments/" + a.id)}
              >
                <strong>{a.title}</strong>
                <span>
                  {formatDate(a.startsAt)} · {formatTime(a.startsAt)}
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          <div className="actions">
            <button onClick={() => ask()}>
              Ask Buddy about {member.displayName}
            </button>
            <button onClick={() => go("/benefits")}>Benefits</button>
            {member.id !== "p-me" && (
              <button
                className="danger-text"
                onClick={() =>
                  action(
                    { type: "removeDependent", id: member.id },
                    `Remove ${member.displayName}? This only removes fictional data from this browser.`,
                    [member.id],
                    () => go("/family"),
                  )
                }
              >
                Remove family member
              </button>
            )}
          </div>
        </>
      );
    }
    return (
      <>
        <h1>Family</h1>
        <p className="lead">Keep track of care for the people you support.</p>
        <div className="family-list">
          {state.profiles.map((p) => (
            <button
              className="profile-row"
              key={p.id}
              onClick={() => {
                select(p.id);
                go("/family/" + p.id);
              }}
            >
              <span className="avatar">{p.displayName.slice(0, 1)}</span>
              <span className="row-copy">
                <strong>{p.displayName}</strong>
                <span>
                  {p.relationship} ·{" "}
                  {p.canManage ? "Can manage reminders" : "Can view reminders"}
                </span>
                <small>{summary(p)}</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
        <button
          className="primary"
          onClick={() =>
            openForm("dependent", {
              displayName: "",
              relationship: "Parent",
              acknowledged: "",
            })
          }
        >
          <Icon name="plus" />
          Add dependent
        </button>
        <p className="helper">
          Use fictional names. Permissions in this prototype are local fixtures,
          not production security.
        </p>
      </>
    );
  }
  function renderAppointment() {
    const a = state.appointments.find(
      (x) => x.id === path.split("/")[2] && x.profileId === profile.id,
    );
    if (!a) return notFound("This appointment is no longer available");
    return (
      <>
        <button className="text-button" onClick={() => go("/today")}>
          ← Back to Today
        </button>
        <span className="eyebrow">APPOINTMENT</span>
        <h1>{a.title}</h1>
        <p className="lead">For: {profile.displayName}</p>
        <div className="detail-panel">
          <h2>{formatDate(a.startsAt)}</h2>
          <p>{formatTime(a.startsAt)} · Time in your care record</p>
          <p>{a.locationLabel}</p>
          <p className="helper">Confirm the location with the provider.</p>
          <div className="notice">
            Local appointment record. Provider confirmation: Not confirmed.
          </div>
          <p className="helper">
            Record origin:{" "}
            {a.recordOrigin === "user-saved"
              ? "User-saved local record"
              : "Initial care record"}
          </p>
        </div>
        <h2>Preparation checklist</h2>
        <p className="helper">
          Contact the provider for medical preparation instructions.
        </p>
        {[
          "Review instructions from the provider",
          "Bring documents requested by the provider",
          "Confirm transport plans",
        ].map((label, i) => (
          <label className="check-row" key={label}>
            <input
              type="checkbox"
              checked={a.checklist[i]}
              disabled={!profile.canManage}
              onChange={() =>
                commit(
                  { type: "toggleChecklist", id: a.id, index: i },
                  { expected: profile.id, success: "Preparation saved" },
                )
              }
            />
            {label}
          </label>
        ))}
        {!profile.canManage && (
          <p className="helper">
            You can view reminders, but cannot update this profile.
          </p>
        )}
        <div className="actions">
          <button
            disabled={!profile.canManage}
            onClick={() => reminderForm(undefined, "occurrence", a.id)}
          >
            Create preparation reminder
          </button>
          <button onClick={() => ask(a.id)}>Ask Buddy</button>
          <button
            onClick={() => {
              const b = state.benefits.find(
                (b) => b.profileId === profile.id && b.category === a.category,
              );
              if (b) go("/benefits/" + b.id + "?from=" + a.id);
              else
                setModal({
                  title: "Needs confirmation",
                  content: (
                    <p>
                      This service is not mapped in the available policy terms.
                      Confirm current terms with your benefits administrator.
                    </p>
                  ),
                });
            }}
          >
            Check benefits
          </button>
          <button
            disabled={!profile.canManage}
            onClick={() =>
              openForm(
                "appointment",
                {
                  title: a.title,
                  date: a.startsAt.slice(0, 10),
                  time: a.startsAt.slice(11, 16),
                  location: a.locationLabel,
                },
                a.id,
              )
            }
          >
            Update in Care Buddy
          </button>
        </div>
        <details>
          <summary>Record history</summary>
          {a.provenanceHistory.map((h) => (
            <p key={h.id}>
              {h.text} · {h.actor} · {formatTime(h.at)}
            </p>
          ))}
        </details>
      </>
    );
  }
  function renderBenefits() {
    const b = state.benefits.find(
      (x) => x.id === path.split("/")[2] && x.profileId === profile.id,
    );
    if (path.split("/")[2]) {
      if (!b) return notFound();
      return (
        <>
          <button
            className="text-button"
            onClick={() => {
              const from = new URLSearchParams(route.split("?")[1]).get("from");
              const a = state.appointments.find(
                (a) => a.id === from && a.profileId === profile.id,
              );
              go(a ? "/appointments/" + a.id : "/benefits");
            }}
          >
            {new URLSearchParams(route.split("?")[1]).get("from")
              ? "← Back to appointment"
              : "← Back to benefits"}
          </button>
          <span className="eyebrow">PLAN DETAILS</span>
          <h1>{benefitName(b.category)}</h1>
          <p className="lead">For: {profile.displayName}</p>
          <div className="detail-panel">
            <span className="status">{benefitStatus(b.status)}</span>
            <h2>Documented terms</h2>
            <p>{b.conditions}</p>
            {b.notes && <p>{b.notes}</p>}
            <dl>
              <dt>Source</dt>
              <dd>{b.source}</dd>
              <dt>Policy date</dt>
              <dd>
                {b.policyDate ? formatDate(b.policyDate) : "Date not supplied"}
              </dd>
              <dt>Person on this record</dt>
              <dd>{profile.displayName}</dd>
              <dt>Provider eligibility</dt>
              <dd>Eligibility not verified</dd>
              <dt>Used amount / remaining allowance</dt>
              <dd>Not available</dd>
            </dl>
            <p>Confirm the current terms with your benefits administrator.</p>
          </div>
          <div className="actions">
            <button
              onClick={() => openForm("benefitCheck", { category: b.category })}
            >
              Check an appointment
            </button>
            <button onClick={() => ask(b.id)}>
              Ask Buddy about this result
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        <h1>Benefits</h1>
        <p className="lead">
          Confirm current cover with your insurer or benefits administrator.
        </p>
        <div className="plan-heading">
          <Icon name="benefits" />
          <div>
            <strong>Care plan</strong>
            <span>{profile.displayName} · Policy date: 30 Sep 2026</span>
          </div>
        </div>
        {state.benefits
          .filter((b) => b.profileId === profile.id)
          .sort((a, b) => {
            const rank = (c: string) =>
              ({ gp: 0, screening: 1, "health-check": 1, dental: 2, other: 3 })[
                c
              ] ?? 4;
            return rank(a.category) - rank(b.category);
          })
          .map((b) => (
            <button
              className="benefit-row"
              key={b.id}
              onClick={() => go("/benefits/" + b.id)}
            >
              <span className="row-copy">
                <strong>{benefitName(b.category)}</strong>
                <span>{b.conditions}</span>
                <small>{b.status}</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        <div className="actions">
          <button
            onClick={() =>
              openForm("benefitCheck", {
                category: appointments[0]?.category || "gp",
              })
            }
          >
            Check benefits
          </button>
          <button
            disabled={!profile.canManage}
            onClick={() => openForm("benefitNote", { category: "", notes: "" })}
          >
            Add benefit note
          </button>
        </div>
      </>
    );
  }
  const applyReply = (
    reply: { text: string; sourceId?: string; needsScope?: boolean; action?: Action },
    sentText: string,
  ) => {
    commit({
      type: "chatMessage",
      message: {
        id: uid(),
        profileId: profile.id,
        role: "assistant",
        text: reply.text,
        contextId: reply.sourceId || context,
        timestamp: stateRef.current.now,
      },
    });
    setDraft("");
    if (reply.needsScope) setScopePrompt(sentText);
    if (reply.action) {
      setReceipt(null);
      setPending({ action: reply.action, message: sentText });
    }
  };
  const send = async (text: string, scope?: "occurrence" | "future") => {
    text = text.trim();
    if (!text) return;
    if (text === "Run urgent-help demo") {
      commit(
        { type: "scenario", name: "Urgent-help demo" },
        { done: () => go("/urgent") },
      );
      return;
    }
    const sentText = text;
    commit({
      type: "chatMessage",
      message: {
        id: uid(),
        profileId: profile.id,
        role: "user",
        text: sentText,
        contextId: context,
        timestamp: stateRef.current.now,
      },
    });
    if (isBackendEnabled()) {
      setBuddyThinking(true);
      try {
        const backendReply = await interpretBuddyMessage(
          stateRef.current,
          sentText,
          context,
          scope,
        );
        setBuddyThinking(false);
        if (backendReply) {
          applyReply(backendReply, sentText);
          return;
        }
      } catch {
        setBuddyThinking(false);
      }
    }
    const localReply = buildChatAction(
      stateRef.current,
      sentText,
      context || undefined,
      scope,
    );
    applyReply(localReply, sentText);
  };
  function renderBuddy() {
    const source = [
      ...state.reminders,
      ...state.appointments,
      ...state.benefits,
    ].find((x) => x.id === context && x.profileId === profile.id);
    return (
      <>
        <div className="eyebrow">YOUR CARE ASSISTANT</div>
        <h1>Buddy</h1>
        <p className="lead">For: {profile.displayName}</p>
        <div className="buddy-intro">
          <Icon name="buddy" />
          <p>
            Your day, appointments and benefits — in one conversation. I’ll ask
            you to confirm before changing a record.
          </p>
        </div>
        {source && (
          <div className="attachment">
            {profile.displayName} ·{" "}
            {"title" in source ? source.title : source.category}
            <button className="text-button" onClick={() => setContext(null)}>
              Remove
            </button>
          </div>
        )}
        <div className="chat-thread">
          {state.chats
            .filter((m) => m.profileId === profile.id)
            .map((m) => (
              <article key={m.id} className={"chat-bubble " + m.role}>
                <small>
                  {m.role === "assistant" ? "Buddy" : "You"} ·{" "}
                  {formatTime(m.timestamp)}
                </small>
                <p>{m.text}</p>
                {m.actionReceipt && (
                  <ReceiptView receipt={m.actionReceipt} state={state} />
                )}
                {m.role === "assistant" &&
                  !m.actionReceipt &&
                  state.benefits.some(
                    (b) => b.id === m.contextId && b.profileId === profile.id,
                  ) && (
                    <>
                      <button onClick={() => go("/benefits/" + m.contextId)}>
                        View benefit details
                      </button>
                      <details className="receipt">
                        <summary>Action details · Information only</summary>
                        <p>
                          Care Buddy explanation · For: {profile.displayName} ·
                          Actor: Me
                        </p>
                        <p>Information used: {m.contextId}</p>
                        <p>No changes saved. Eligibility not verified.</p>
                        <p>Recorded at: {m.timestamp}</p>
                      </details>
                    </>
                  )}
              </article>
            ))}
        </div>
        {scopePrompt && (
          <div className="detail-panel">
            <h3>Tonight only, or your regular schedule?</h3>
            <div className="actions">
              <button
                onClick={() => {
                  send(scopePrompt, "occurrence");
                  setScopePrompt(null);
                }}
              >
                Tonight only
              </button>
              <button
                onClick={() => {
                  send(scopePrompt, "future");
                  setScopePrompt(null);
                }}
              >
                Regular schedule
              </button>
              <button
                onClick={() => {
                  setScopePrompt(null);
                  setToast("No changes made");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="prompts">
          {[
            "Prepare for my appointment",
            "Create a bedtime reminder",
            "Explain my benefits",
            "What’s next today?",
          ].map((t) => (
            <button key={t} onClick={() => send(t)}>
              {t}
            </button>
          ))}
        </div>
        {buddyThinking && (
          <p className="helper" aria-live="polite">
            Buddy is preparing a demo response…
          </p>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label className="sr-only" htmlFor="message">
            Message Buddy
          </label>
          <textarea
            id="message"
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your reminders…"
            rows={2}
            disabled={buddyThinking}
            aria-busy={buddyThinking}
          />
          <button className="primary" disabled={!draft.trim() || buddyThinking}>
            {buddyThinking ? "Sending…" : "Send"}
          </button>
        </form>
        <p className="helper">Your messages and changes stay on this device.</p>
      </>
    );
  }
  function renderSettings() {
    return (
      <>
        <h1>Settings</h1>
        <div className="notice">
          {pwa.offline
            ? "Offline · using saved records"
            : pwa.ready
              ? "Offline app ready"
              : "Offline app preparing"}
          {pwa.updateAvailable && (
            <button onClick={pwa.refresh}>Update app</button>
          )}
        </div>
        <div className="detail-panel">
          <h2>Reference clock</h2>
          <p>
            Reference clock: {formatDate(state.now)}, {formatTime(state.now)}
          </p>
          <div className="actions">
            <button
              onClick={() =>
                commit(
                  { type: "advanceClock" },
                  { success: "Reference clock advanced 15 minutes" },
                )
              }
            >
              Advance 15 minutes
            </button>
            <button
              onClick={() =>
                commit(
                  { type: "restoreClock" },
                  { success: "Reference clock restored" },
                )
              }
            >
              Restore clock
            </button>
          </div>
        </div>
        <div className="settings-list">
          <button onClick={about}>
            About Care Buddy <Icon name="arrow" />
          </button>
          <button onClick={() => go("/welcome")}>
            Reopen welcome <Icon name="arrow" />
          </button>
          <button onClick={() => go("/car")}>
            Simulated car connection <Icon name="arrow" />
          </button>
        </div>
        <details className="detail-panel skill-handoff">
          <summary>WorkBuddy handoff</summary>
          <p className="helper">
            Export fictional context, run an installed skill in WorkBuddy, then
            import its JSON proposal. Review and confirm here to save. A live
            WorkBuddy connection is not configured.
          </p>
          <button
            onClick={() => {
              const current = stateRef.current;
              const data = {
                state: current,
                profileId: current.selectedProfileId,
                expectedClock: current.now,
                actionId: uid(),
              };
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "care-buddy-context.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export skill context
          </button>
          <label className="field">
            Import reminder proposal
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 2000000)
                    throw new Error("Choose a proposal under 2 MB.");
                  const proposal = importSkillProposal(
                    stateRef.current,
                    JSON.parse(await file.text()),
                  );
                  setError("");
                  setRetry(null);
                  setReceipt(null);
                  setPending({
                    action: proposal,
                    message: "WorkBuddy package proposal import",
                  });
                } catch (error) {
                  setError((error as Error).message);
                  setRetry(null);
                }
              }}
            />
          </label>
        </details>
        <h2>Presenter controls</h2>
        <p className="helper">
          Local test fixtures only. No backend execution or consent workflow.
        </p>
        <div className="scenario-grid">
          {[
            "Empty day",
            "Loading",
            "Save error",
            "Unknown benefit",
            "View-only dependent",
            "Manage-access fixture",
            "Missing appointment",
            "Urgent-help demo",
          ].map((name) => (
            <button
              key={name}
              onClick={() => {
                if (name === "Save error") {
                  failNext.current = true;
                  setToast(
                    "Next save will fail. Your input will be preserved.",
                  );
                  return;
                }
                if (name === "Loading") {
                  setLoading(true);
                  setTimeout(() => setLoading(false), 1000);
                  go("/today");
                  return;
                }
                commit(
                  { type: "scenario", name },
                  {
                    done: () =>
                      go(name === "Urgent-help demo" ? "/urgent" : "/today"),
                  },
                );
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          className="danger-text"
          onClick={() =>
            action(
              { type: "reset" },
              "Reset local records? All changes on this device will be removed.",
              [],
              () => {
                setContext(null);
                go("/today");
              },
            )
          }
        >
          Reset local records
        </button>
        <p className="helper">
          No real permissions, patient data, insurer checks, bookings or vehicle
          connections.
        </p>
      </>
    );
  }
  function refreshHealth() {
    setHealthLoading(true);
    setHealthError("");
    fetchHealthSnapshot(stateRef.current, profile.id)
      .then((snap) => {
        if (snap) {
          setHealth(snap);
        } else {
          setHealthError("Live stats unavailable. Reconnect a wearable or retry.");
        }
      })
      .catch(() =>
        setHealthError("Live stats unavailable. Reconnect a wearable or retry."),
      )
      .finally(() => setHealthLoading(false));
  }
  useEffect(() => {
    if (path !== "/health") return;
    setHealth(null);
    setHealthError("");
    setHealthLoading(true);
    fetchHealthSnapshot(stateRef.current, profile.id)
      .then((snap) => {
        if (snap) setHealth(snap);
        else setHealthError("Live stats unavailable. Reconnect a wearable or retry.");
      })
      .catch(() =>
        setHealthError("Live stats unavailable. Reconnect a wearable or retry."),
      )
      .finally(() => setHealthLoading(false));
  }, [path, profile.id, state.now]);
  function renderHealth() {
    const reading = health?.reading;
    const weather = health?.weather;
    const advice = health?.advice ?? [];
    return (
      <>
        <span className="eyebrow">WEARABLE PAIRING</span>
        <h1>Health</h1>
        <p className="lead">
          Live stats for {profile.displayName}. Pair a wearable to share heart
          rate, blood pressure, breathing and rest with Care Buddy.
        </p>
        <div className="detail-panel wearable-status">
          <div className="pairing-row">
            <div>
              <strong>Simulated wearable</strong>
              <p className="helper">
                {isBackendEnabled()
                  ? "Paired · streaming demo vitals from the backend"
                  : "Paired · using local demo vitals"}
              </p>
            </div>
            <button
              className="primary"
              onClick={refreshHealth}
              disabled={healthLoading}
              aria-busy={healthLoading}
            >
              {healthLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {healthError && (
            <div role="alert" className="error">
              {healthError}
            </div>
          )}
          {healthLoading && !reading && (
            <div className="loading" role="status">
              <div />
              <div />
              <div />
            </div>
          )}
          {reading && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Heart rate</span>
                  <span className="stat-value">{reading.heartRate}</span>
                  <span className="stat-unit">bpm</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Blood pressure</span>
                  <span className="stat-value">
                    {reading.systolic}/{reading.diastolic}
                  </span>
                  <span className="stat-unit">mmHg</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Breathing</span>
                  <span className="stat-value">{reading.breathingRate}</span>
                  <span className="stat-unit">breaths/min</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Sleep</span>
                  <span className="stat-value">{reading.sleepHours}</span>
                  <span className="stat-unit">hours · {reading.sleepQuality}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Steps</span>
                  <span className="stat-value">{reading.steps.toLocaleString()}</span>
                  <span className="stat-unit">today</span>
                </div>
              </div>
              <p className="helper">
                Last sync {formatTime(reading.updatedAt)} · This is a demo
                reading, not a medical measurement.
              </p>
            </>
          )}
        </div>
        {weather && (
          <div className="detail-panel">
            <span className="eyebrow">CURRENT WEATHER</span>
            <h2>{weather.location}</h2>
            <div className="weather-grid">
              <div className="weather-main">
                <span className="weather-temp">{weather.temperatureC}°C</span>
                <span className="weather-cond">{weather.condition}</span>
                <span className="helper">
                  Feels like {weather.feelsLikeC}°C
                </span>
              </div>
              <dl className="weather-detail">
                <div>
                  <dt>Humidity</dt>
                  <dd>{weather.humidity}%</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>{weather.windKph} km/h</dd>
                </div>
                <div>
                  <dt>UV index</dt>
                  <dd>{weather.uvIndex}</dd>
                </div>
                <div>
                  <dt>Air quality</dt>
                  <dd>{weather.airQuality}</dd>
                </div>
              </dl>
            </div>
            <p className="helper">
              Updated {formatTime(weather.updatedAt)} · Simulated local weather.
            </p>
          </div>
        )}
        {advice.length > 0 && (
          <div className="detail-panel">
            <span className="eyebrow">ADVICE &amp; RECOMMENDATIONS</span>
            <h2>What to do today</h2>
            <ul className="advice-list">
              {advice.map((a) => (
                <li key={a.id} className={"advice-" + a.tone}>
                  <span className="advice-category">{a.category}</span>
                  <span className="advice-text">{a.text}</span>
                </li>
              ))}
            </ul>
            <p className="helper">
              Recommendations are generated from the demo vitals and weather.
              They are not a diagnosis.
            </p>
          </div>
        )}
      </>
    );
  }
  function renderCar() {
    if (state.carMode === "disconnected")
      return (
        <div className="car-content">
          <Icon name="car" />
          <div className="eyebrow">SIMULATED CONNECTION</div>
          <h1>Connect a car</h1>
          <p className="lead">
            Preview how generic reminders could appear while parked or driving.
          </p>
          <p>This simulation does not share health details with a vehicle.</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.preferences.genericReminders}
              onChange={(e) =>
                commit({
                  type: "setPreference",
                  key: "genericReminders",
                  value: e.target.checked,
                })
              }
            />
            Generic reminders
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.preferences.spokenReminders}
              onChange={(e) =>
                commit({
                  type: "setPreference",
                  key: "spokenReminders",
                  value: e.target.checked,
                })
              }
            />
            Spoken reminders
          </label>
          <button
            className="primary"
            onClick={() =>
              commit(
                { type: "setCarMode", mode: "parked" },
                { success: "Car mode connected" },
              )
            }
          >
            Connect car mode
          </button>
        </div>
      );
    return (
      <div className="car-content">
        <span className="eyebrow">SIMULATED CONNECTION</span>
        <h1>Connected · Parked</h1>
        <p className="lead">Full care details remain in the phone app.</p>
        <div className="detail-panel">
          <Icon name="today" />
          <h2>You have an upcoming appointment</h2>
          <p>View the phone app for appointment details.</p>
        </div>
        <div className="detail-panel">
          <h2>
            {state.preferences.genericReminders
              ? "You have a reminder"
              : "Reminder previews are off"}
          </h2>
          <p>View it when parked.</p>
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              if ("speechSynthesis" in window) speechSynthesis.cancel();
              commit(
                { type: "setCarMode", mode: "driving" },
                { done: () => go("/car") },
              );
            }}
          >
            Enter driving preview
          </button>
          <button
            disabled={!state.preferences.spokenReminders}
            onClick={() => {
              if (!("speechSynthesis" in window)) {
                setToast("Audio preview is unavailable in this browser");
                return;
              }
              speechSynthesis.speak(
                new SpeechSynthesisUtterance(
                  "You have a reminder. View it when parked.",
                ),
              );
            }}
          >
            Play generic reminder
          </button>
          <button
            onClick={() => {
              if ("speechSynthesis" in window) speechSynthesis.cancel();
              commit(
                { type: "setCarMode", mode: "disconnected" },
                { done: () => go("/today") },
              );
            }}
          >
            Disconnect
          </button>
          <button onClick={() => go("/today")}>Back to app</button>
        </div>
      </div>
    );
  }
  function renderGp() {
    return (
      <>
        <span className="eyebrow">ROUTINE CARE ACCESS</span>
        <h1>Find GP care</h1>
        <p className="lead">
          Explore a routine care-access option. Care Buddy does not assess
          symptoms or book care.
        </p>
        <div className="actions">
          <button
            onClick={() => {
              const b = state.benefits.find(
                (b) => b.profileId === profile.id && /gp/i.test(b.category),
              );
              b
                ? go("/benefits/" + b.id)
                : setModal({
                    title: "Needs confirmation",
                    content: (
                      <p>
                        GP benefit information for this person is not available
                        in the available policy terms.
                      </p>
                    ),
                  });
            }}
          >
            View GP benefit
          </button>
          <button
            className="primary"
            onClick={() =>
              openForm("gp", { date: "2026-10-01", time: "10:00" })
            }
          >
            Preview appointment request
          </button>
        </div>
      </>
    );
  }
  const notFound = (text = "This item is no longer available") => (
    <div className="empty">
      <h1>{text}</h1>
      <p>Choose another item in Care Buddy.</p>
      <button onClick={() => go("/today")}>Go to Today</button>
    </div>
  );
  useEffect(() => {
    if (path.startsWith("/family/")) {
      const id = path.split("/")[2];
      if (
        stateRef.current.profiles.some((p) => p.id === id && p.canView) &&
        stateRef.current.selectedProfileId !== id
      ) {
        setPending(null);
        setContext(null);
        commit({ type: "selectProfile", profileId: id });
      }
    }
  }, [path]);
  const change = (key: string, value: string) =>
    setForm((f) =>
      f ? { ...f, values: { ...f.values, [key]: value } } : null,
    );
  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const v = form.values;
    const errors: Record<string, string> = {};
    const titleCheck = () => {
      if (v.title.trim().length < 3 || v.title.trim().length > 80)
        errors.title = "Enter a title with 3 to 80 characters";
    };
    const timeCheck = () => {
      if (!v.date) errors.date = "Choose a date";
      if (!v.time) errors.time = "Choose a time";
      if (v.date && v.time && isoAt(v.date, v.time) <= state.now)
        errors.time = "Choose a time after the current reference time";
    };
    let command: Command | undefined;
    let label = "";
    if (form.kind === "reminder") {
      titleCheck();
      timeCheck();
      if (v.instructions.length > 500)
        errors.instructions = "Keep instructions within 500 characters";
      const input: ReminderInput = {
        profileId: v.profileId,
        category: v.category as ReminderInput["category"],
        title: v.title.trim(),
        scheduledAt: isoAt(v.date, v.time),
        recurrence: v.recurrence as "None" | "Daily",
        instructions: v.instructions.trim(),
        appointmentId: v.appointmentId || null,
      };
      command = form.id
        ? {
            type: "editReminder",
            id: form.id,
            input,
            scope: form.scope || "occurrence",
          }
        : { type: "createReminder", input };
      label =
        (form.id ? "Update" : "Create") +
        " reminder for " +
        person(v.profileId) +
        "?";
    }
    if (form.kind === "dependent") {
      if (v.displayName.trim().length < 2 || v.displayName.trim().length > 40)
        errors.displayName = "Enter a display name with 2 to 40 characters";
      if (v.acknowledged !== "yes")
        errors.acknowledged = "Confirm this is fictional data";
      command = {
        type: "addDependent",
        displayName: v.displayName.trim(),
        relationship: v.relationship,
        acknowledged: v.acknowledged === "yes",
      };
      label = "Add fictional dependent " + v.displayName + " with view access?";
    }
    if (form.kind === "appointment") {
      titleCheck();
      timeCheck();
      command = {
        type: "editAppointment",
        id: form.id!,
        title: v.title.trim(),
        startsAt: isoAt(v.date, v.time),
        locationLabel: v.location.trim(),
      };
      label =
        "Update in Care Buddy for " +
        profile.displayName +
        "? This updates your record on this device only. No provider has been contacted.";
    }
    if (form.kind === "benefitNote") {
      if (!v.category.trim()) errors.category = "Enter a category";
      if (v.notes.length > 500)
        errors.notes = "Keep notes within 500 characters";
      command = {
        type: "addBenefitNote",
        category: v.category.trim(),
        notes: v.notes.trim(),
      };
      label =
        "Add benefit note for " +
        profile.displayName +
        "? Eligibility remains unverified.";
    }
    if (form.kind === "gp") {
      timeCheck();
      if (!Object.keys(errors).length) {
        setForm(null);
        setModal({
          title: "Appointment request preview",
          content: (
            <>
              <p>For: {profile.displayName}</p>
              <p>
                {v.date} · {v.time}
              </p>
              <div className="notice">
                This request has not been sent. No booking, payment or provider
                contact has occurred.
              </div>
            </>
          ),
        });
        return;
      }
    }
    if (form.kind === "benefitCheck") {
      const b = state.benefits.find(
        (b) => b.profileId === profile.id && b.category === v.category,
      );
      setForm(null);
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        b
          ? go("/benefits/" + b.id)
          : setModal({
              title: "Needs confirmation",
              content: (
                <>
                  <p>
                    For: {profile.displayName} · {v.category}
                  </p>
                  <p>
                    No matching policy information. Source: Illustrative policy,
                    v1. Eligibility not verified. Confirm current terms with
                    your benefits administrator.
                  </p>
                </>
              ),
            });
      }, 350);
      return;
    }
    setFormErrors(errors);
    if (!Object.keys(errors).length && command) {
      action(command, label, form.id ? [form.id] : [], () => {
        setForm(null);
        if (form.kind === "dependent") {
          setToast(
            "Profile added with view access. No invitation or consent request was sent.",
          );
        }
      });
    }
  };
  const field = (key: string, label: string, type = "text") => (
    <label className="field" key={key}>
      {label}
      {type === "textarea" ? (
        <textarea
          value={form!.values[key]}
          onChange={(e) => change(key, e.target.value)}
          maxLength={
            key === "instructions" || key === "notes" ? 600 : undefined
          }
          aria-invalid={!!formErrors[key]}
        />
      ) : (
        <input
          type={type}
          value={form!.values[key]}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={!!formErrors[key]}
        />
      )}{" "}
      {formErrors[key] && (
        <span className="field-error">{formErrors[key]}</span>
      )}
    </label>
  );
  const formSheet = form && (
    <Sheet
      title={
        form.kind === "reminder"
          ? form.id
            ? "Edit reminder"
            : "Add reminder"
          : form.kind === "dependent"
            ? "Add dependent"
            : form.kind === "appointment"
              ? "Update in Care Buddy"
              : form.kind === "gp"
                ? "Preview appointment request"
                : form.kind === "benefitNote"
                  ? "Add benefit note"
                  : "Check benefits"
      }
      onClose={closeForm}
    >
      <form onSubmit={submitForm}>
        {Object.keys(formErrors).length > 0 && (
          <div role="alert" className="error">
            Check the fields below. {Object.values(formErrors).join(". ")}
          </div>
        )}
        {form.kind === "reminder" && (
          <>
            <label className="field">
              Person
              <select
                value={form.values.profileId}
                onChange={(e) => change("profileId", e.target.value)}
                disabled={!!form.id}
              >
                {state.profiles.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.canManage}>
                    {p.displayName}
                    {!p.canManage ? " (view only)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Category
              <select
                value={form.values.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {field("title", "Title")}
            <div className="field-grid">
              {field("date", "Date", "date")}
              {field("time", "Time", "time")}
            </div>
            <label className="field">
              Repeat
              <select
                value={form.values.recurrence}
                onChange={(e) => change("recurrence", e.target.value)}
              >
                <option>None</option>
                <option>Daily</option>
              </select>
            </label>
            {field("instructions", "Instructions (optional)", "textarea")}
            {form.values.category === "Medication" && (
              <p className="helper">
                Use your existing instructions. Buddy does not prescribe
                medication.
              </p>
            )}
            <p className="helper">
              {form.scope === "future"
                ? "This and future occurrences"
                : "This occurrence only"}
            </p>
          </>
        )}
        {form.kind === "dependent" && (
          <>
            {field("displayName", "Display name")}
            <label className="field">
              Relationship
              <select
                value={form.values.relationship}
                onChange={(e) => change("relationship", e.target.value)}
              >
                {["Parent", "Child", "Partner", "Other"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <p className="helper">
              Use a fictional name. Do not enter real health information.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.values.acknowledged === "yes"}
                onChange={(e) =>
                  change("acknowledged", e.target.checked ? "yes" : "")
                }
              />
              This is fictional data
            </label>
            {formErrors.acknowledged && (
              <p className="field-error">{formErrors.acknowledged}</p>
            )}
          </>
        )}
        {form.kind === "appointment" && (
          <>
            <p>For: {profile.displayName}</p>
            {field("title", "Title")}
            <div className="field-grid">
              {field("date", "Date", "date")}
              {field("time", "Time", "time")}
            </div>
            {field("location", "Fictional location label")}
            <p className="helper">
              No provider has been contacted. Review linked preparation
              reminders; their times will not move automatically.
            </p>
          </>
        )}
        {form.kind === "benefitNote" && (
          <>
            <p>For: {profile.displayName}</p>
            {field("category", "Category")}
            {field("notes", "Notes", "textarea")}
            <p className="helper">
              This saves a note, not verified entitlement.
            </p>
          </>
        )}
        {form.kind === "benefitCheck" && (
          <>
            <p>For: {profile.displayName} (locked)</p>
            <label className="field">
              Appointment or service
              <select
                value={form.values.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {Array.from(
                  new Set([
                    ...appointments.map((a) => a.category),
                    "gp",
                    "health-check",
                    "screening",
                    "dental",
                    "other",
                    "Unmapped service",
                  ]),
                ).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {form.kind === "gp" && (
          <>
            <p>For: {profile.displayName}</p>
            <div className="field-grid">
              {field("date", "Preferred day", "date")}
              {field("time", "Preferred time", "time")}
            </div>
          </>
        )}
        <div className="actions">
          <button type="submit" className="primary">
            {form.kind === "gp"
              ? "Preview request"
              : form.kind === "benefitCheck"
                ? "Check benefits"
                : "Review changes"}
          </button>
          <button type="button" onClick={closeForm}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
  if (state.carMode === "driving")
    return (
      <main className="driving">
        <span className="eyebrow">SIMULATED CONNECTION</span>
        <Icon name="car" />
        <h1>Driving preview</h1>
        <p>View care details when parked</p>
        {state.preferences.genericReminders && <h2>Reminder waiting</h2>}
        <button
          className="primary"
          onClick={() =>
            commit(
              { type: "setCarMode", mode: "parked" },
              { done: () => go("/car") },
            )
          }
        >
          Return to parked preview
        </button>
        <p className="helper">
          Visual simulation only. Not certified automotive safety design.
        </p>
        <div aria-live="polite">{toast}</div>
      </main>
    );
  if (path === "/urgent")
    return (
      <main className="urgent">
        <span className="eyebrow">SIMULATED SCENARIO</span>
        <h1>Urgent help</h1>
        <div className="notice urgent-notice">
          No emergency service has been contacted.
        </div>
        <p>
          If you believe there is an immediate danger, contact your local
          emergency service. Buddy cannot assess or handle an emergency.
        </p>
        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              setModal({
                title: "Emergency-help instructions",
                content: (
                  <p>
                    Contact the appropriate local emergency service directly.
                    Care Buddy cannot call, dispatch or assess an emergency. No
                    service has been contacted.
                  </p>
                ),
              })
            }
          >
            View emergency-help instructions
          </button>
          <button
            onClick={() =>
              commit(
                { type: "urgentViewed" },
                { success: "Demo alert viewed", done: () => go("/today") },
              )
            }
          >
            Return to Today
          </button>
        </div>
        {modal && (
          <Sheet title={modal.title} onClose={() => setModal(null)}>
            {modal.content}
          </Sheet>
        )}
      </main>
    );
  if (path === "/welcome")
    return (
      <main className="welcome">
        {toast && (
          <div role="status" className="notice">
            {toast}
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            {retry ? (
              <button onClick={() => retry()}>Retry</button>
            ) : (
              <button onClick={() => setError("")}>Dismiss error</button>
            )}
          </div>
        )}
        <div className="welcome-mark">
          <Icon name="buddy" />
        </div>
        <p className="eyebrow">CARE, MADE SIMPLER</p>
        <h1>{APP_NAME}</h1>
        <h2>Your care, and your family's, in one place</h2>
        <p>Daily routines. Family care. A little less to keep in your head.</p>

        <button
          className="primary"
          onClick={() =>
            commit({ type: "start" }, { done: () => go("/today") })
          }
        >
          Get started <Icon name="arrow" />
        </button>
        <button className="text-button" onClick={about}>
          About Care Buddy
        </button>
        <p className="helper">
          Fictional data only. Not a medical or insurance service.
        </p>
        {modal && (
          <Sheet title={modal.title} onClose={() => setModal(null)}>
            {modal.content}
          </Sheet>
        )}
      </main>
    );
  return (
    <div className={"app " + (path === "/buddy" ? "buddy-view" : "")}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        inert={
          !!(
            form ||
            reminderId ||
            scopeEdit ||
            snooze ||
            pending ||
            modal ||
            discard
          )
        }
      >
        <div className="wordmark">
          <strong>{APP_NAME}</strong>
          <small>{APP_SUBTITLE}</small>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={
              "Notifications, " +
              state.notifications.filter((n) => !n.readAt).length +
              " unread"
            }
            onClick={() => go("/notifications")}
          >
            <Icon name="bell" />
            {state.notifications.some((n) => !n.readAt) && (
              <span className="count">
                {state.notifications.filter((n) => !n.readAt).length}
              </span>
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => go("/settings")}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <nav
        className="nav"
        aria-label="Main"
        inert={
          !!(
            form ||
            reminderId ||
            scopeEdit ||
            snooze ||
            pending ||
            modal ||
            discard
          )
        }
      >
        {["Today", "Family", "Benefits", "Health", "Buddy"].map((t) => (
          <button
            className={path.startsWith("/" + t.toLowerCase()) ? "active" : ""}
            key={t}
            onClick={() => go("/" + t.toLowerCase())}
            aria-current={
              path.startsWith("/" + t.toLowerCase()) ? "page" : undefined
            }
          >
            <Icon name={t.toLowerCase()} />
            <span>{t}</span>
          </button>
        ))}
      </nav>
      <main
        id="main"
        inert={
          !!(
            form ||
            reminderId ||
            scopeEdit ||
            snooze ||
            pending ||
            modal ||
            discard
          )
        }
      >
        <div className="profile-selector">
          <label htmlFor="profile">Care for</label>
          <select
            id="profile"
            value={profile.id}
            onChange={(e) => select(e.target.value)}
          >
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <span className="profile-access">
            {profile.id === "p-me"
              ? "Your care"
              : profile.relationship +
                " · " +
                (profile.canManage ? "Manage access" : "View only")}
          </span>
        </div>
        {error && !pending && (
          <div role="alert" className="error">
            {error}
            {retry ? (
              <button onClick={() => retry()}>Retry</button>
            ) : (
              <button onClick={() => setError("")}>Dismiss error</button>
            )}
          </div>
        )}
        {loading ? (
          <div role="status" className="loading">
            <h2>Loading your care…</h2>
            <div />
            <div />
            <div />
          </div>
        ) : path === "/today" ? (
          renderToday()
        ) : path.startsWith("/family") ? (
          renderFamily()
        ) : path.startsWith("/appointments/") ? (
          renderAppointment()
        ) : path.startsWith("/benefits") ? (
          renderBenefits()
        ) : path === "/health" ? (
          renderHealth()
        ) : path === "/buddy" ? (
          renderBuddy()
        ) : path === "/settings" ? (
          renderSettings()
        ) : path === "/car" ? (
          renderCar()
        ) : path === "/care/gp" ? (
          renderGp()
        ) : path === "/notifications" ? (
          <>
            <h1>Notifications</h1>
            <p className="lead">
              Simulated in-app entries. No real alert was delivered.
            </p>
            {state.notifications.map((n) => (
              <button
                className="list-row"
                key={n.id}
                onClick={() => {
                  commit({ type: "markNotificationRead", id: n.id });
                  if (n.targetType === "urgent") {
                    go("/urgent");
                    return;
                  }
                  const target = [
                    ...state.reminders,
                    ...state.appointments,
                    ...state.benefits,
                  ].find((x) => x.id === n.targetId);
                  if (!target) {
                    setModal({
                      title: "This item is no longer available",
                      content: <p>This record was removed or is missing.</p>,
                    });
                    return;
                  }
                  select(n.profileId);
                  go(
                    n.targetType === "reminder"
                      ? "/today?reminder=" + n.targetId
                      : n.targetType === "appointment"
                        ? "/appointments/" + n.targetId
                        : "/benefits/" + n.targetId,
                  );
                }}
              >
                <span className="row-copy">
                  <strong>{n.title}</strong>
                  <span>
                    {person(n.profileId)} · {formatTime(n.timestamp)} ·{" "}
                    {n.readAt ? "Read" : "Unread"}
                  </span>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </>
        ) : (
          notFound()
        )}
        {receipt?.outcome === "Saved" && (
          <div className="detail-panel">
            <ReceiptView receipt={receipt} state={state} />
            {state.reminders.find(
              (r) => receipt.sourceIds.includes(r.id) && r.outcome,
            ) && (
              <button
                onClick={() => {
                  const r = state.reminders.find(
                    (r) => receipt.sourceIds.includes(r.id) && r.outcome,
                  );
                  if (r)
                    commit(
                      { type: "undoCompletion", id: r.id },
                      {
                        success: "Reported outcome undone",
                        done: () => setReceipt(null),
                      },
                    );
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            ×
          </button>
        </div>
      )}
      {formSheet}
      {reminderId &&
        !form &&
        !pending &&
        (detail ? (
          <Sheet title={detail.title} onClose={closeReminder}>
            <p className="eyebrow">YOUR RECORDED INSTRUCTIONS</p>
            <p>
              For: {profile.displayName} · {detail.category}
            </p>
            <h3>
              Due {formatDate(detail.scheduledAt)} at{" "}
              {formatTime(detail.scheduledAt)}
            </h3>
            <p>
              Repeat: {detail.recurrence} · {statusLabel(detail)}
            </p>
            {detail.notificationSnoozedUntil && (
              <p>Notification: {formatTime(detail.notificationSnoozedUntil)}</p>
            )}
            <p>{detail.instructions || "No instructions entered."}</p>
            {detail.category === "Medication" && (
              <p className="helper">
                This is a reported outcome, not clinical verification.
              </p>
            )}
            {detail.outcome && (
              <div className="notice">
                Recorded as {detail.outcome} for {profile.displayName} by{" "}
                {detail.recordedBy || "Me"} at{" "}
                {detail.recordedAt
                  ? formatTime(detail.recordedAt)
                  : "Not available"}
                .
              </div>
            )}
            {!profile.canManage && (
              <p className="notice">
                You can view reminders, but cannot update this profile.
              </p>
            )}
            <div className="actions">
              {detail.outcome ? (
                <button
                  disabled={!profile.canManage}
                  onClick={() =>
                    action(
                      { type: "undoCompletion", id: detail.id },
                      "Undo reported outcome for " + profile.displayName + "?",
                      [detail.id],
                    )
                  }
                >
                  Undo
                </button>
              ) : (
                <>
                  <button
                    className="primary"
                    disabled={!profile.canManage}
                    onClick={() =>
                      complete(
                        detail,
                        detail.category === "Medication" ? "taken" : "complete",
                      )
                    }
                  >
                    {detail.category === "Medication"
                      ? "Mark as taken"
                      : "Mark complete"}
                  </button>
                  <button
                    disabled={!profile.canManage}
                    onClick={() => complete(detail, "skipped")}
                  >
                    Record as skipped
                  </button>
                  <button
                    disabled={!profile.canManage}
                    onClick={() => setSnooze(detail)}
                  >
                    Remind me later
                  </button>
                </>
              )}
              <button
                disabled={!profile.canManage}
                onClick={() =>
                  detail.recurrence === "Daily"
                    ? setScopeEdit(detail)
                    : reminderForm(detail)
                }
              >
                Edit
              </button>
              <button
                onClick={() => {
                  closeReminder();
                  ask(detail.id);
                }}
              >
                Ask Buddy
              </button>
              <button
                className="danger-text"
                disabled={!profile.canManage}
                onClick={() =>
                  action(
                    { type: "deleteReminder", id: detail.id },
                    "Delete this reminder for " +
                      profile.displayName +
                      "? " +
                      detail.title,
                    [detail.id],
                    () => {
                      closeReminder();
                      setModal({
                        title: "Reminder deleted",
                        content: (
                          <button
                            onClick={() =>
                              commit(
                                { type: "undoDeletion", id: detail.id },
                                {
                                  success: "Reminder restored",
                                  done: () => setModal(null),
                                },
                              )
                            }
                          >
                            Undo deletion
                          </button>
                        ),
                      });
                    },
                  )
                }
              >
                Delete reminder
              </button>
            </div>
            <h3>Activity history</h3>
            {detail.history.map((h) => (
              <p className="helper" key={h.id}>
                {h.text} · Recorded by {h.actor} for {person(h.subject)} ·{" "}
                {formatTime(h.at)}
              </p>
            ))}
          </Sheet>
        ) : (
          <Sheet
            title="This item is no longer available"
            onClose={closeReminder}
          >
            <p>Choose another reminder from Today.</p>
          </Sheet>
        ))}
      {scopeEdit && (
        <Sheet
          title="Edit repeating reminder"
          onClose={() => setScopeEdit(null)}
        >
          <p>
            For: {profile.displayName} · {scopeEdit.title}
          </p>
          <div className="actions">
            <button
              onClick={() => {
                reminderForm(scopeEdit, "occurrence");
                setScopeEdit(null);
              }}
            >
              This occurrence
            </button>
            <button
              onClick={() => {
                reminderForm(scopeEdit, "future");
                setScopeEdit(null);
              }}
            >
              This and future occurrences
            </button>
          </div>
        </Sheet>
      )}
      {snooze && (
        <Sheet title="Remind me later" onClose={() => setSnooze(null)}>
          <p>For: {person(snooze.profileId)}</p>
          <p>
            This postpones the notification only. It does not change your
            medication schedule.
          </p>
          <div className="actions">
            {[15, 60].map((n) => (
              <button
                key={n}
                onClick={() => {
                  const d = new Date(new Date(state.now).getTime() + n * 60000);
                  const local = new Date(d.getTime() + 8 * 3600000)
                    .toISOString()
                    .slice(0, 16);
                  const until = local + ":00+08:00";
                  action(
                    { type: "snoozeReminder", id: snooze.id, until },
                    "Notify " +
                      person(snooze.profileId) +
                      " again at " +
                      formatTime(until) +
                      "?",
                    [snooze.id],
                    () => setSnooze(null),
                  );
                }}
              >
                {n === 15 ? "15 minutes" : "1 hour"}
              </button>
            ))}
          </div>
          <label className="field">
            Choose time
            <input
              type="time"
              value={snoozeTime}
              onChange={(e) => setSnoozeTime(e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              action(
                {
                  type: "snoozeReminder",
                  id: snooze.id,
                  until: isoAt(state.now.slice(0, 10), snoozeTime),
                },
                "Notify " +
                  profile.displayName +
                  " again at " +
                  snoozeTime +
                  "?",
                [snooze.id],
                () => setSnooze(null),
              )
            }
          >
            Review chosen time
          </button>
        </Sheet>
      )}
      {pending && (
        <Sheet title={pending.action.label} onClose={cancelPending}>
          <p>For: {person(pending.action.profileId)} · Actor: Me</p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <p className="helper">
            Review this change. Nothing is saved until you confirm.
          </p>
          {pending.action.command.type === "completeReminder" && (
            <div className="detail-panel">
              <strong>
                {
                  state.reminders.find(
                    (r) =>
                      r.id === (pending.action.command as { id: string }).id,
                  )?.title
                }
              </strong>
              <p>
                Record as{" "}
                {pending.action.command.outcome === "taken"
                  ? "taken"
                  : pending.action.command.outcome === "skipped"
                    ? "skipped"
                    : "complete"}{" "}
                for {person(pending.action.profileId)}.
              </p>
            </div>
          )}
          {pending.action.command.type === "snoozeReminder" && (
            <div className="detail-panel">
              <strong>
                {
                  state.reminders.find(
                    (r) =>
                      r.id === (pending.action.command as { id: string }).id,
                  )?.title
                }
              </strong>
              <p>
                Notification at {formatTime(pending.action.command.until)}. The
                original schedule stays unchanged.
              </p>
            </div>
          )}
          {"input" in pending.action.command && (
            <>
              <h3>{pending.action.command.input.title}</h3>
              <p>
                {formatDate(pending.action.command.input.scheduledAt)} ·{" "}
                {formatTime(pending.action.command.input.scheduledAt)}
              </p>
              <p>Repeat: {pending.action.command.input.recurrence}</p>
              {pending.action.command.type === "editReminder" && (
                <>
                  <p>
                    Before:{" "}
                    {formatTime(
                      state.reminders.find(
                        (r) =>
                          r.id ===
                          ("id" in pending.action.command
                            ? pending.action.command.id
                            : ""),
                      )?.scheduledAt || state.now,
                    )}
                  </p>
                  <p>
                    After:{" "}
                    {formatTime(pending.action.command.input.scheduledAt)}
                  </p>
                  <p>
                    Other days:{" "}
                    {pending.action.command.scope === "occurrence"
                      ? "Unchanged"
                      : "Future schedule updated"}
                  </p>
                </>
              )}
            </>
          )}
          {receipt && <ReceiptView receipt={receipt} state={state} />}
          <div className="actions">
            <button className="primary" onClick={confirm}>
              {error ? "Retry" : "Confirm"}
            </button>
            {"input" in pending.action.command && (
              <button
                onClick={() => {
                  const c = pending.action.command;
                  if ("input" in c) {
                    const r =
                      c.type === "editReminder"
                        ? state.reminders.find((r) => r.id === c.id)
                        : undefined;
                    setPending(null);
                    reminderForm(
                      r,
                      c.type === "editReminder" ? c.scope : "occurrence",
                    );
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            values: {
                              ...f.values,
                              ...c.input,
                              appointmentId: c.input.appointmentId || "",
                              date: c.input.scheduledAt.slice(0, 10),
                              time: c.input.scheduledAt.slice(11, 16),
                            },
                          }
                        : f,
                    );
                  }
                }}
              >
                Edit
              </button>
            )}
            <button onClick={cancelPending}>Cancel</button>
          </div>
        </Sheet>
      )}
      {modal && (
        <Sheet title={modal.title} onClose={() => setModal(null)}>
          {modal.content}
        </Sheet>
      )}
      {discard && (
        <Sheet title="Discard changes?" onClose={() => setDiscard(false)}>
          <p>Your unsaved input will be removed.</p>
          <div className="actions">
            <button
              onClick={() => {
                setForm(null);
                setDiscard(false);
              }}
            >
              Discard changes
            </button>
            <button className="primary" onClick={() => setDiscard(false)}>
              Keep editing
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
