import { BuddyAttempts } from "./buddyAttempts";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { usePwa } from "./pwa";
import { Icon } from "./Icon";
import { Onboarding } from "./Onboarding";
import {
  isPublicDemo,
  publicBootstrapState,
  createPublicDemoState,
} from "./publicDemo";
import {
  ROUTINE_TEMPLATES,
  getBenefitHighlights,
  greetingFor,
} from "./uiPresentation";
import { ChatMarkdown } from "./ChatMarkdown";
import { BuddyCareAction } from "./BuddyCareAction";
import { chatOperationLabel, displayActor } from "./operationPresentation";
import { WeatherBanner } from "./WeatherBanner";
import { SleepDetails } from "./SleepDetails";
import { HealthCard } from "./HealthCard";
import { HealthDetails } from "./HealthDetails";
import { AssistantExport } from "./AssistantExport";
import {
  BenefitBalance,
  BenefitClaims,
  formatBenefitAmount,
} from "./BenefitUsage";
import { useHealthVitals } from "./useHealthVitals";
import {
  SAMPLE_SLEEP_NIGHT,
  formatSleepDuration,
  getSleepNightLabels,
} from "./sleepData";
import { APP_NAME } from "./config";
import {
  formatTime,
  formatDate,
  isoAt,
  notificationTime,
  statusLabel,
  preparationTime,
  assertFreshAction,
  importSkillProposal,
  emptyState,
} from "./domain";
import { interpretBuddyMessage } from "./buddyClient";
import {
  fetchHealthSnapshot,
  fetchWeather,
  type HealthSnapshot,
} from "./healthClient";
import {
  getClientId,
  isSyncEnabled,
  ServerClient,
  ProfileSelection,
  StaleChangeError,
  loadDisplayCache,
  saveDisplayCache,
} from "./syncClient";
import type {
  State,
  Command,
  Action,
  Reminder,
  ReminderInput,
  Receipt,
  WeatherData,
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
// Older demo records keep their original stored instructions. Hide only the
// retired label on the unchanged seeded medication reminder.
const reminderInstructions = (reminder: Reminder) =>
  reminder.id.startsWith("sample-medication-") &&
  reminder.instructions ===
    "Follow your existing medication instructions. This reminder is fictional sample data."
    ? "Follow your existing medication instructions."
    : reminder.instructions;
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
          'button,input,select,textarea,summary,a[href],[tabindex="0"]',
        ),
      ).filter(
        (x) => !x.hasAttribute("disabled") && x.getClientRects().length > 0,
      );
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
function ReceiptView({
  receipt,
  state,
  clientId,
}: {
  receipt: Receipt;
  state: State;
  clientId: string;
}) {
  return (
    <details className="receipt">
      <summary>Action details · {receipt.outcome}</summary>
      <dl>
        <dt>Source</dt>
        <dd>CareBuddy action</dd>
        <dt>Information used</dt>
        <dd>{receipt.sourceIds.join(", ") || "User-entered input"}</dd>
        <dt>Person</dt>
        <dd>
          {state.profiles.find((p) => p.id === receipt.profileId)
            ?.displayName || "Removed profile"}
        </dd>
        <dt>Actor</dt>
        <dd>{displayActor(receipt.actor, clientId, state.profiles)}</dd>
        <dt>Operation</dt>
        <dd>{receipt.operation}</dd>
        <dt>Authorization</dt>
        <dd>
          {receipt.authorization === "chat_request"
            ? "Requested in chat"
            : receipt.confirmation
              ? "Confirmed"
              : "Not confirmed"}
        </dd>
        <dt>Save outcome</dt>
        <dd>{receipt.outcome}</dd>
        <dt>Recorded at</dt>
        <dd>{receipt.timestamp}</dd>
      </dl>
    </details>
  );
}
const singaporeDay = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 10);

export default function App() {
  const pwa = usePwa();
  const clientId = useRef(getClientId());
  const initial = useRef({
    state: isPublicDemo ? createPublicDemoState() : emptyState(),
    notice: "",
  });
  const bootstrapCache = useRef(
    loadDisplayCache(clientId.current, initial.current.state),
  );
  const [state, setState] = useState(initial.current.state);
  const stateRef = useRef(state);
  const selection = useRef(new ProfileSelection());
  const initialPath = useRef(location.pathname);
  const [syncLoading, setSyncLoading] = useState(isSyncEnabled());
  const [route, setRoute] = useState(location.pathname + location.search);
  const [toast, setToast] = useState(initial.current.notice);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const server = useRef<ServerClient | null>(null);
  const refreshIntent = useRef(0);
  if (!server.current)
    server.current = new ServerClient(clientId.current, ({ state: remote }) => {
      const next = selection.current.accept(remote);
      saveDisplayCache(clientId.current, next);
      stateRef.current = next;
      setState(next);
    });
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (!isSyncEnabled() || syncedOnce.current) return;
    syncedOnce.current = true;
    server
      .current!.initialize(
        bootstrapCache.current,
        isPublicDemo ? publicBootstrapState : undefined,
      )
      .then(({ state: next }) => {
        if (
          next.started &&
          next.profiles.length > 0 &&
          location.pathname === "/welcome" &&
          ["/", "/today"].includes(initialPath.current)
        ) {
          history.replaceState({}, "", "/today");
          setRoute("/today");
        }
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not load care records.",
        ),
      )
      .finally(() => setSyncLoading(false));
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
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
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
  const buddyRequestPending = useRef(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");
  const healthRequestId = useRef(0);
  const [liveTime, setLiveTime] = useState(() => new Date());
  const [todayWeather, setTodayWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [weatherRequest, setWeatherRequest] = useState(0);
  const [dismissedReminderCards, setDismissedReminderCards] = useState<
    string[]
  >([]);
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!state.started) return;
    const controller = new AbortController();
    setWeatherLoading(true);
    setWeatherError("");
    fetchWeather(controller.signal)
      .then((weather) => {
        if (!controller.signal.aborted) setTodayWeather(weather);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTodayWeather(null);
        setWeatherError(
          error instanceof Error ? error.message : "Weather is unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setWeatherLoading(false);
      });
    return () => controller.abort();
  }, [state.started, weatherRequest]);
  useEffect(() => {
    if (!state.started) return;
    const timer = setInterval(
      () => setWeatherRequest((request) => request + 1),
      5 * 60_000,
    );
    return () => clearInterval(timer);
  }, [state.started]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const profile = state.profiles.find(
    (p) => p.id === state.selectedProfileId,
  ) ||
    state.profiles[0] || {
      id: "",
      displayName: "No family member",
      relationship: "",
      canView: true,
      canManage: true,
    };
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
    } = {},
  ) => {
    refreshIntent.current++;
    const selectionToken =
      command.type === "selectProfile"
        ? selection.current.begin(command.profileId)
        : null;
    const actionId = options.id || uid();
    const profileId =
      options.expected ||
      ("input" in command
        ? command.input.profileId
        : command.type === "selectProfile"
          ? command.profileId
          : stateRef.current.selectedProfileId);
    if (command.type === "selectProfile") {
      const next = {
        ...stateRef.current,
        selectedProfileId: command.profileId,
      };
      stateRef.current = next;
      setState(next);
    }
    const perform = async () => {
      try {
        await server.current!.command(command, actionId, profileId);
        if (selectionToken !== null) {
          const authoritative = selection.current.settle(selectionToken);
          if (authoritative) {
            stateRef.current = authoritative;
            setState(authoritative);
          }
        }
        setError("");
        setRetry(null);
        if (options.success) setToast(options.success);
        options.done?.();
      } catch (e) {
        setError((e as Error).message);
        if (command.type === "selectProfile") {
          const authoritative =
            selectionToken === null
              ? null
              : selection.current.settle(selectionToken);
          if (authoritative) {
            stateRef.current = authoritative;
            setState(authoritative);
          }
          setRetry(null);
        } else if (e instanceof StaleChangeError) setRetry(null);
        else setRetry(() => perform);
      }
    };
    void perform();
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
        revision: server.current?.revision ?? undefined,
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
  const confirmingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
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
    const finish = () => {
      setError("");
      setRetry(null);
      setToast("Saved");
      if (pendingRef.current?.action.id === p.action.id) {
        setReceipt({ ...saved, timestamp: stateRef.current.now });
        setPending((current) =>
          current?.action.id === p.action.id ? null : current,
        );
        p.onDone?.();
      }
    };
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    const operation = p.action.proposalId
      ? server.current!.confirm(
          p.action.proposalId,
          p.action.profileId,
          p.action.revision,
        )
      : server.current!.command(
          p.action.command,
          p.action.id,
          p.action.profileId,
          p.action.revision,
        );
    operation
      .then(finish)
      .catch((e) => {
        setError(
          e instanceof Error ? e.message : "Could not save. Please try again.",
        );
        setRetry(null);
      })
      .finally(() => {
        confirmingRef.current = false;
        setConfirming(false);
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
        instructions: r ? reminderInstructions(r) : "",
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
  const today = singaporeDay(state.now);
  const todayReminders = reminders
    .filter((r) => singaporeDay(r.scheduledAt) === today)
    .sort(
      (a, b) =>
        Date.parse(notificationTime(a)) - Date.parse(notificationTime(b)),
    );
  const appointments = state.appointments
    .filter((a) => a.profileId === profile.id)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const sorted = reminders
    .filter(
      (r) =>
        !r.outcome && Date.parse(notificationTime(r)) >= Date.parse(state.now),
    )
    .sort(
      (a, b) =>
        Date.parse(notificationTime(a)) - Date.parse(notificationTime(b)) ||
        a.id.localeCompare(b.id),
    );
  const nextReminder = sorted[0];
  const nextAppointment = [...appointments]
    .filter((a) => Date.parse(a.startsAt) >= Date.parse(state.now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
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
  const healthVitals = useHealthVitals(
    profile.id,
    Boolean(
      profile.id &&
      profile.canView &&
      !syncLoading &&
      ["/today", "/health", "/health/vitals"].includes(path),
    ),
  );
  const liveHealth = {
    ...healthVitals,
    loading: syncLoading || healthVitals.loading,
  };
  // A refresh may start only while Today is idle. Invalidate a delayed read
  // if navigation, a draft, a confirmation, or profile intent changes meanwhile.
  const refreshActivity = [
    route,
    form,
    pending,
    modal,
    draft,
    snooze,
    scopeEdit,
    discard,
    scopePrompt,
    context,
    loading,
    buddyThinking,
    syncLoading,
  ];
  const previousRefreshActivity = useRef(refreshActivity);
  if (
    refreshActivity.some(
      (value, index) => value !== previousRefreshActivity.current[index],
    )
  ) {
    refreshIntent.current++;
    previousRefreshActivity.current = refreshActivity;
  }
  const refreshIdle = useRef(false);
  refreshIdle.current =
    path === "/today" &&
    !route.includes("?") &&
    state.started &&
    !syncLoading &&
    !form &&
    !pending &&
    !modal &&
    !draft &&
    !snooze &&
    !scopeEdit &&
    !discard &&
    !loading &&
    !buddyThinking;
  const refreshToday = useRef(() => {});
  refreshToday.current = () => {
    const client = server.current;
    if (
      !isSyncEnabled() ||
      !refreshIdle.current ||
      !client ||
      client.busy ||
      buddyRequestPending.current ||
      document.visibilityState === "hidden"
    )
      return;
    const intent = refreshIntent.current;
    const profileIntent = selection.current.version;
    void client
      .refresh(
        () =>
          refreshIdle.current &&
          !buddyRequestPending.current &&
          intent === refreshIntent.current &&
          profileIntent === selection.current.version,
      )
      .catch(() => {
        /* A later foreground refresh can retry a failed read. */
      });
  };
  useEffect(() => {
    refreshToday.current();
  }, [path, syncLoading]);
  useEffect(() => {
    const refresh = () => refreshToday.current();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, []);
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
      title: "About CareBuddy",
      content: (
        <>
          <p>Fictional data only. Not a medical or insurance service.</p>
          <p>
            This is a prototype with fictional records and a reference clock.
            Buddy uses the selected person’s care records and asks for automatic
            saves for clear Buddy requests. Forms use a review step. Sleep uses
            frontend data; benefits, appointment requests, alerts and car
            connection are illustrative. A live WorkBuddy connection is not
            configured.
          </p>
          <p>
            CareBuddy helps organise routine care. It does not assess symptoms,
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
  const openSleep = (from: "today" | "health") =>
    go("/health/sleep?from=" + from);
  const openHealthDetails = (from: "today" | "health") =>
    go("/health/vitals?from=" + from);
  const startTemplate = (id: string) => {
    const template = ROUTINE_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    const current = stateRef.current;
    const existing =
      template.id === "wind-down"
        ? current.reminders.find(
            (reminder) =>
              reminder.profileId === current.selectedProfileId &&
              reminder.category === "Bedtime" &&
              !reminder.deletedAt &&
              !reminder.outcome &&
              Date.parse(reminder.scheduledAt) > Date.parse(current.now),
          )
        : undefined;
    if (existing) {
      reminderForm(
        existing,
        existing.recurrence === "Daily" ? "future" : "occurrence",
      );
      return;
    }
    const date = getSleepNightLabels(new Date(current.now)).wakeDate;
    let scheduled = isoAt(date, template.time);
    if (Date.parse(scheduled) <= Date.parse(current.now)) {
      scheduled = isoAt(
        getSleepNightLabels(new Date(Date.parse(current.now) + 86400000))
          .wakeDate,
        template.time,
      );
    }
    openForm("reminder", {
      profileId: current.selectedProfileId,
      category: template.category,
      title: template.title,
      date: scheduled.slice(0, 10),
      time: template.time,
      recurrence: "Daily",
      instructions: "",
      appointmentId: "",
    });
  };
  function renderProfilePicker(compact = false) {
    return (
      <div
        className={
          "profile-selector " + (compact ? "profile-selector-compact" : "")
        }
      >
        {state.profiles.length === 0 ? (
          <button className="profile-empty" onClick={() => go("/welcome")}>
            <Icon name="leaf" />
            <span>
              <strong>Create your care space</strong>
              <small>For you or someone you care for</small>
            </span>
            <Icon name="arrow" />
          </button>
        ) : (
          <>
            <label htmlFor="profile">Care for</label>
            <select
              id="profile"
              value={profile.id}
              onChange={(event) => select(event.target.value)}
            >
              {state.profiles
                .filter((person) => person.canView)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
            </select>
            {!compact && (
              <span className="profile-access">
                {profile.id === "p-me"
                  ? "Your care"
                  : profile.relationship +
                    (profile.canManage ? " · Manage access" : " · View only")}
              </span>
            )}
          </>
        )}
      </div>
    );
  }
  function renderOnboarding() {
    return (
      <Onboarding
        onSelf={(starter) => {
          const nextTemplate =
            starter === "Bedtime"
              ? "wind-down"
              : starter === "Walking"
                ? "walk"
                : starter === "Drinking water"
                  ? "water"
                  : "";
          const self = state.profiles.find(
            (person) => person.id === "p-me" || person.relationship === "Self",
          );
          if (self) {
            select(self.id);
            go("/today");
            if (nextTemplate) startTemplate(nextTemplate);
          } else
            openForm("self", {
              displayName: "",
              acknowledged: "",
              nextTemplate,
            });
        }}
        onFamily={() =>
          openForm("dependent", {
            displayName: "",
            relationship: "Parent",
            acknowledged: "",
          })
        }
        onSleep={() => openSleep("today")}
      />
    );
  }
  function renderSleepCard(from: "today" | "health") {
    return (
      <section className="sleep-review-card" aria-label="Last night's sleep">
        <div className="sleep-card-heading">
          <span className="feature-icon lavender-icon">
            <Icon name="moon" />
          </span>
          <span className="eyebrow">LAST NIGHT'S REST</span>
        </div>
        <div className="sleep-card-numbers">
          <strong>
            {SAMPLE_SLEEP_NIGHT.score}
            <small>%</small>
          </strong>
          <span>
            <b>{formatSleepDuration(SAMPLE_SLEEP_NIGHT.sleepMinutes)}</b>
            <small>Time asleep</small>
          </span>
        </div>
        <p>
          A little room for better rest. Explore your sleep stages and a calmer
          evening.
        </p>
        <button
          className="text-button sleep-card-link"
          onClick={() => openSleep(from)}
        >
          Review Sleep <Icon name="arrow" />
        </button>
      </section>
    );
  }
  function renderToday() {
    if (!profile.id) return renderOnboarding();
    const completed = todayReminders.filter(
      (reminder) =>
        reminder.outcome === "taken" || reminder.outcome === "complete",
    ).length;
    const progress = todayReminders.length
      ? Math.round((completed / todayReminders.length) * 100)
      : 0;
    const featuredKey = next
      ? `${profile.id}:${next.id}:${next.occurrenceDate}`
      : "";
    const hidden = dismissedReminderCards.includes(featuredKey);
    return (
      <div className="today-view">
        <WeatherBanner
          weather={todayWeather}
          loading={weatherLoading}
          error={weatherError}
          onRetry={() => setWeatherRequest((request) => request + 1)}
        />
        <div className="today-heading">
          <div>
            <span className="eyebrow">
              {new Intl.DateTimeFormat("en-SG", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Asia/Singapore",
              }).format(new Date(state.now))}
            </span>
            <h1>{greetingFor(state.now, profile.displayName)}</h1>
            <p>A little care goes a long way.</p>
            {state.clockMode === "reference" && (
              <span className="status">Reference clock</span>
            )}
          </div>
          {renderProfilePicker(true)}
        </div>
        {todayReminders.length === 0 && (
          <p className="empty-progress">
            No routines scheduled today. Start with one below.
          </p>
        )}
        {todayReminders.length > 0 && (
          <div className="care-progress">
            <span className="progress-icon">
              <Icon name="check" />
            </span>
            <div>
              <strong>
                {completed} of {todayReminders.length} routines completed
              </strong>
              <span>
                {completed === todayReminders.length
                  ? "A moment to appreciate the care you've taken."
                  : "One small step at a time."}
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Daily routines completed"
              aria-valuenow={completed}
              aria-valuemin={0}
              aria-valuemax={todayReminders.length}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {!profile.canManage && (
          <div className="notice view-only-notice">
            <span>You’re viewing {profile.displayName}’s care.</span>
            <button
              className="text-button"
              onClick={() => go("/family/" + profile.id)}
            >
              View access <Icon name="arrow" />
            </button>
          </div>
        )}
        <div className="day-layout">
          <div className="day-focus">
            {hidden ? (
              <div className="dismissed-feature">
                <Icon name="clock" />
                <span>Your reminder is still on your timeline.</span>
                <button
                  className="text-button"
                  onClick={() =>
                    setDismissedReminderCards((cards) =>
                      cards.filter((key) => key !== featuredKey),
                    )
                  }
                >
                  Show next up
                </button>
              </div>
            ) : (
              <section className="next-card">
                <div className="section-kicker">
                  <Icon name="clock" /> NEXT UP{" "}
                  {next && <span className="status">Upcoming</span>}
                </div>
                {next ? (
                  <>
                    <h2>{next.title}</h2>
                    <p className="next-time">
                      <Icon name="clock" />
                      {singaporeDay(next.scheduledAt) !== today && (
                        <> {formatDate(next.scheduledAt)} ·</>
                      )}{" "}
                      {formatTime(next.scheduledAt)}
                      {next.notificationSnoozedUntil && (
                        <small>
                          {" "}
                          · Notify {formatTime(next.notificationSnoozedUntil)}
                        </small>
                      )}
                    </p>
                    {next.category === "Medication" && (
                      <p className="helper">
                        Follow your existing medication instructions.
                      </p>
                    )}
                    <div className="card-actions">
                      <button
                        className="primary"
                        disabled={!profile.canManage}
                        onClick={() =>
                          complete(
                            next,
                            next.category === "Medication"
                              ? "taken"
                              : "complete",
                          )
                        }
                      >
                        <Icon name="check" />
                        {next.category === "Medication"
                          ? "Mark as taken"
                          : "Mark complete"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setDismissedReminderCards((cards) => [
                            ...cards,
                            featuredKey,
                          ]);
                          setToast(
                            "Card dismissed. The reminder remains on your timeline.",
                          );
                        }}
                      >
                        Dismiss
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
                      className="primary"
                      onClick={() => go("/appointments/" + nextAppointment.id)}
                    >
                      View appointment <Icon name="arrow" />
                    </button>
                  </>
                ) : (
                  <>
                    <h2>
                      {todayReminders.length
                        ? "A little breathing room"
                        : "Start with one small routine"}
                    </h2>
                    <p>
                      {todayReminders.length
                        ? "Nothing else scheduled. Take a moment for yourself."
                        : "Make space for something that helps you feel good."}
                    </p>
                    <button
                      className="primary"
                      disabled={!profile.canManage}
                      onClick={() => reminderForm()}
                    >
                      <Icon name="plus" />
                      Add a routine
                    </button>
                  </>
                )}
              </section>
            )}
            {nextAppointment && next && (
              <button
                className="appointment-strip appointment-card"
                onClick={() => go("/appointments/" + nextAppointment.id)}
              >
                <span className="feature-icon">
                  <Icon name="today" />
                </span>
                <span>
                  <small>NEXT APPOINTMENT</small>
                  <strong>{nextAppointment.title}</strong>
                  <span>
                    {formatDate(nextAppointment.startsAt)} ·{" "}
                    {formatTime(nextAppointment.startsAt)}
                  </span>
                </span>
                <Icon name="arrow" />
              </button>
            )}
            {renderSleepCard("today")}
            <HealthCard
              {...liveHealth}
              onReview={() => openHealthDetails("today")}
            />
          </div>
          {todayReminders.length > 0 ? (
            <div className="day-timeline">
              <div className="section-heading">
                <h2>Your day</h2>
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
                            ? Date.parse(notificationTime(r)) <
                              Date.parse(state.now)
                            : Date.parse(notificationTime(r)) >=
                              Date.parse(state.now)),
                  );
                  if (group === "Completed" && items.length === 0) return null;
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
                  singaporeDay(a.startsAt) === today &&
                  Date.parse(a.startsAt) >= Date.parse(state.now),
              ).length > 0 && (
                <section className="timeline-group">
                  <h3>Upcoming appointments</h3>
                  {appointments
                    .filter(
                      (a) =>
                        singaporeDay(a.startsAt) === today &&
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
                    Add a routine
                  </button>
                </div>
              )}
            </div>
          ) : (
            <section className="day-timeline first-routines">
              <span className="eyebrow">YOUR FIRST STEPS</span>
              <h2>
                {profile.canManage
                  ? "Find your daily rhythm"
                  : "Their day, at a glance"}
              </h2>
              <p>
                {profile.canManage
                  ? "Pick a small routine to make your own."
                  : "Their shared routines will appear here when they’re added."}
              </p>
              {profile.canManage && (
                <div className="routine-grid">
                  {ROUTINE_TEMPLATES.map((template) => (
                    <button
                      className="routine-template"
                      key={template.id}
                      onClick={() => startTemplate(template.id)}
                    >
                      <span className="feature-icon">
                        <Icon name={template.icon} />
                      </span>
                      <span>
                        <strong>{template.title}</strong>
                        <small>{template.description}</small>
                      </span>
                      <Icon name="plus" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
        {profile.canManage && todayReminders.length > 0 && (
          <section className="routine-starters">
            <div className="section-heading">
              <div>
                <span className="eyebrow">MAKE IT YOUR OWN</span>
                <h2>
                  {todayReminders.length
                    ? "A little more care"
                    : "Try a starter routine"}
                </h2>
              </div>
              <button className="text-button" onClick={() => reminderForm()}>
                Create your own <Icon name="plus" />
              </button>
            </div>
            <div className="routine-grid">
              {ROUTINE_TEMPLATES.map((template) => (
                <button
                  className="routine-template"
                  key={template.id}
                  onClick={() => startTemplate(template.id)}
                >
                  <span className="feature-icon">
                    <Icon name={template.icon} />
                  </span>
                  <span>
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </span>
                  <Icon name="plus" />
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="quiet-actions">
          <button className="text-button" onClick={() => go("/care/gp")}>
            Explore GP care <Icon name="arrow" />
          </button>
          <button className="text-button" onClick={() => ask()}>
            Plan with Buddy <Icon name="buddy" />
          </button>
        </div>
      </div>
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
          <div className="family-detail-heading">
            <span className="avatar" aria-hidden="true">
              {member.displayName.slice(0, 1)}
            </span>
            <h1>{member.displayName}</h1>
          </div>
          <p className="lead">
            {member.relationship} ·{" "}
            {member.canManage ? "Can manage reminders" : "Can view reminders"}
          </p>
          <div className="notice">
            Actions on this page are for {member.displayName}.
          </div>
          {member.id !== "p-me" && (
            <button
              className={member.canManage ? "secondary" : "primary"}
              onClick={() =>
                action(
                  {
                    type: "updateDependent",
                    id: member.id,
                    patch: { canManage: !member.canManage },
                  },
                  member.canManage
                    ? `Change ${member.displayName} to view only? You will no longer be able to record outcomes or edit reminders for them.`
                    : `Grant manage access for ${member.displayName}? You will be able to add reminders, record outcomes, and edit benefits for them on this device.`,
                  [member.id],
                )
              }
            >
              {member.canManage ? "Change to view only" : "Grant manage access"}
            </button>
          )}
          {!member.canManage && member.id !== "p-me" && (
            <button
              onClick={() =>
                setModal({
                  title: "Why can't I edit?",
                  content: (
                    <p>
                      This profile is view-only. Grant manage access above to
                      add reminders and record outcomes for this person.
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
                singaporeDay(r.scheduledAt) === today,
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
              <details className="profile-menu family-detail-menu">
                <summary aria-label={`More options for ${member.displayName}`}>
                  <Icon name="more" />
                </summary>
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
              </details>
            )}
          </div>
        </>
      );
    }
    return (
      <>
        <h1>Family</h1>
        <p className="lead">
          A little care for you and the people close to you.
        </p>
        <div className="family-list">
          {state.profiles.map((person, index) => (
            <div className="profile-row" key={person.id}>
              <button
                className="profile-row-main"
                onClick={() => {
                  select(person.id);
                  go("/family/" + person.id);
                }}
                aria-label={`Open ${person.displayName}`}
              >
                <span className={`avatar avatar-tone-${index % 3}`}>
                  {person.displayName.slice(0, 1)}
                </span>
                <span className="row-copy">
                  <strong>{person.displayName}</strong>
                  <span>
                    {person.relationship === "Self"
                      ? "Your care"
                      : person.relationship}
                  </span>
                  <small>
                    <strong>Next:</strong> {summary(person)}
                  </small>
                </span>
                <Icon name="arrow" />
              </button>
              <div className="profile-card-footer">
                <span
                  className={
                    "access-pill " +
                    (person.canManage ? "can-manage" : "view-only")
                  }
                >
                  <Icon name={person.canManage ? "check" : "family"} />
                  {person.canManage ? "Manage access" : "View only"}
                </span>
                {person.id !== "p-me" && (
                  <details className="profile-menu">
                    <summary
                      aria-label={`More options for ${person.displayName}`}
                    >
                      <Icon name="more" />
                    </summary>
                    <div>
                      <button
                        className="danger-text"
                        onClick={() =>
                          action(
                            { type: "removeDependent", id: person.id },
                            `Remove ${person.displayName} and their care records from this device?`,
                            [person.id],
                            () => go("/family"),
                          )
                        }
                      >
                        <Icon name="x" />
                        Remove family member
                      </button>
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="actions family-actions">
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
            Add family member
          </button>
          {!state.profiles.some(
            (person) => person.id === "p-me" || person.relationship === "Self",
          ) && (
            <button
              onClick={() =>
                openForm("self", { displayName: "", acknowledged: "" })
              }
            >
              <Icon name="leaf" />
              Add my own care space
            </button>
          )}
        </div>
        <p className="helper">
          Use fictional names. Access settings apply to this local care space.
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
        <section className="appointment-details-card appointment-details-compact">
          <div className="appointment-date">
            <span className="feature-icon">
              <Icon name="today" />
            </span>
            <div>
              <strong>{formatDate(a.startsAt)}</strong>
              <span>{formatTime(a.startsAt)}</span>
            </div>
            <span className="status amber">Not confirmed</span>
          </div>
          <p className="appointment-location">
            <Icon name="location" />
            {a.locationLabel}
          </p>
          <details className="record-details">
            <summary>About this appointment record</summary>
            <p className="helper">
              Confirm the date, location, and medical preparation instructions
              with the provider. This record does not confirm a booking.
            </p>
            <p className="helper">
              {a.recordOrigin === "user-saved"
                ? "Saved by you in CareBuddy."
                : "Initial care record."}
            </p>
          </details>
        </section>
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
            className="primary"
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
            Update in CareBuddy
          </button>
        </div>
        <details>
          <summary>Record history</summary>
          {a.provenanceHistory.map((h) => (
            <p key={h.id}>
              {h.text} ·{" "}
              {displayActor(h.actor, clientId.current, state.profiles)} ·{" "}
              {formatTime(h.at)}
            </p>
          ))}
        </details>
      </>
    );
  }
  function renderBenefits() {
    const recordedHighlights = getBenefitHighlights;
    const b = state.benefits.find(
      (x) => x.id === path.split("/")[2] && x.profileId === profile.id,
    );
    if (!profile.id) {
      return (
        <>
          <h1>Benefits</h1>
          <p className="lead">
            Set up your care space to keep benefit notes and check recorded
            terms with your insurer or benefits administrator.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => go("/welcome")}>
              Set up your care space
            </button>
          </div>
        </>
      );
    }
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
            <h2>Allowance and limits</h2>
            {recordedHighlights(b.conditions).length > 0 ? (
              <ul className="recorded-benefit-summary">
                {recordedHighlights(b.conditions).map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            ) : (
              <p>See the recorded conditions below for available terms.</p>
            )}
            {b.usage ? (
              <BenefitBalance usage={b.usage} />
            ) : (
              <p className="helper">
                Used amount / remaining allowance: Not available
              </p>
            )}
            {b.notes && <p>{b.notes}</p>}
            {b.usage && <BenefitClaims usage={b.usage} />}
            <details className="record-details">
              <summary>Conditions, source and policy date</summary>
              <p>{b.conditions}</p>
              <dl>
                <dt>Source</dt>
                <dd>{b.source}</dd>
                <dt>Policy date</dt>
                <dd>
                  {b.policyDate
                    ? new Intl.DateTimeFormat("en-SG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "Asia/Singapore",
                      }).format(new Date(b.policyDate))
                    : "Date not supplied"}
                </dd>
                <dt>Person on this record</dt>
                <dd>{profile.displayName}</dd>
                <dt>Provider eligibility</dt>
                <dd>Eligibility not verified</dd>
                <dt>Used amount / remaining allowance</dt>
                <dd>
                  {b.usage
                    ? `${formatBenefitAmount(b.usage.usedAmount)} used / ${formatBenefitAmount(b.usage.annualAllowance - b.usage.usedAmount)} remaining`
                    : "Not available"}
                </dd>
              </dl>
            </details>
            <p>Confirm the current terms with your benefits administrator.</p>
          </div>
          <div className="actions">
            <button
              className="primary"
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
            <span>
              {profile.displayName} ·{" "}
              {state.benefits.some(
                (benefit) =>
                  benefit.profileId === profile.id && benefit.policyDate,
              )
                ? "Recorded policy terms"
                : "Policy details not added"}
            </span>
          </div>
        </div>
        <div className="benefit-grid">
          {state.benefits
            .filter((b) => b.profileId === profile.id)
            .sort((a, b) => {
              const rank = (c: string) =>
                ({
                  gp: 0,
                  screening: 1,
                  "health-check": 1,
                  dental: 2,
                  other: 3,
                })[c] ?? 4;
              return rank(a.category) - rank(b.category);
            })
            .map((b) => (
              <button
                className="benefit-row"
                key={b.id}
                onClick={() => go("/benefits/" + b.id)}
              >
                <span className="benefit-card-heading">
                  <span className="feature-icon">
                    <Icon name={b.category === "gp" ? "heart" : "benefits"} />
                  </span>
                  <span
                    className={
                      "status " +
                      (/confirmation|Conditions/.test(b.status) ? "amber" : "")
                    }
                  >
                    {benefitStatus(b.status)}
                  </span>
                </span>
                <span className="row-copy">
                  <strong>{benefitName(b.category)}</strong>
                  <span className="benefit-highlights">
                    {recordedHighlights(b.conditions).map((highlight) => (
                      <b key={highlight}>{highlight}</b>
                    ))}
                  </span>
                  <span className="benefit-excerpt">
                    View conditions, source and policy date
                  </span>
                </span>
                {b.usage && <BenefitBalance usage={b.usage} />}
                <Icon name="arrow" />
              </button>
            ))}
        </div>
        {state.benefits.filter((benefit) => benefit.profileId === profile.id)
          .length === 0 && (
          <div className="empty benefits-empty">
            <Icon name="benefits" />
            <h2>Your benefits, a little clearer</h2>
            <p>
              Add a note from your plan to keep important terms close.
              Eligibility and remaining allowances still need confirmation.
            </p>
          </div>
        )}
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
    reply: {
      text: string;
      sourceId?: string;
      needsScope?: boolean;
      action?: Action;
    },
    sentText: string,
  ) => {
    setDraft("");
    if (reply.needsScope) setScopePrompt(sentText);
  };
  const buddyAttempts = useRef<BuddyAttempts | null>(null);
  if (!buddyAttempts.current)
    buddyAttempts.current = new BuddyAttempts(clientId.current);
  const send = async (text: string, scope?: "occurrence" | "future") => {
    text = text.trim();
    if (!text || buddyRequestPending.current) return;
    buddyRequestPending.current = true;
    setBuddyThinking(true);
    setError("");
    const requestProfileId = stateRef.current.selectedProfileId;
    const requestSelectionVersion = selection.current.version;
    const sentText = text;
    const requestContext = context;
    const payload = {
      profileId: requestProfileId,
      message: sentText,
      contextId: requestContext,
      scope,
    };
    try {
      const requestId = buddyAttempts.current!.idFor(payload);
      const backendReply = await server.current!.run(() =>
        interpretBuddyMessage(
          requestProfileId,
          sentText,
          requestContext,
          scope,
          requestId,
        ),
      );
      buddyAttempts.current!.complete(payload, requestId);
      if (selection.current.version === requestSelectionVersion) {
        applyReply(backendReply, sentText);
        if (
          backendReply.operationStatus === "saved" &&
          stateRef.current.selectedProfileId !== requestProfileId
        )
          setToast(backendReply.text.replace(/\*\*/g, ""));
      }
    } catch (error) {
      if (
        stateRef.current.selectedProfileId === requestProfileId &&
        selection.current.version === requestSelectionVersion
      ) {
        setError(
          error instanceof Error
            ? error.message
            : "Buddy could not complete the request.",
        );
      }
    } finally {
      buddyRequestPending.current = false;
      setBuddyThinking(false);
    }
  };
  function renderBuddy() {
    const source = [
      ...state.reminders,
      ...state.appointments,
      ...state.benefits,
    ].find((x) => x.id === context && x.profileId === profile.id);
    if (!profile.id) {
      return (
        <>
          <div className="eyebrow">YOUR CARE ASSISTANT</div>
          <h1>Buddy</h1>
          <p className="lead">
            Set up your care space to plan routines and appointments with Buddy.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => go("/welcome")}>
              Set up your care space
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="eyebrow">YOUR CARE ASSISTANT</div>
        <h1>Buddy</h1>
        <p className="lead">For: {profile.displayName}</p>
        <div
          className={
            "buddy-intro " +
            (state.chats.some((message) => message.profileId === profile.id)
              ? "buddy-intro-compact"
              : "")
          }
        >
          <span className="buddy-avatar">
            <Icon name="buddy" />
          </span>
          <p>
            {state.chats.some((message) => message.profileId === profile.id)
              ? "Here to help you make a little more room for care."
              : "Routines, appointments, and the small things on your mind. Let’s work through them together. Clear requests are saved for you."}
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
                {m.role === "assistant" ? (
                  <>
                    <ChatMarkdown text={m.text} />
                    <BuddyCareAction
                      navigation={m.careNavigation}
                      onUrgentHelp={() => go("/urgent")}
                    />
                  </>
                ) : (
                  <p>{m.text}</p>
                )}
                {m.role === "assistant" && (
                  <small className="helper">
                    {chatOperationLabel(m, state)}
                  </small>
                )}
                {m.actionReceipt && (
                  <ReceiptView
                    receipt={m.actionReceipt}
                    state={state}
                    clientId={clientId.current}
                  />
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
                          CareBuddy explanation · For: {profile.displayName} ·
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
        {!state.chats.some((message) => message.profileId === profile.id) && (
          <div className="prompts">
            {[
              "Prepare for my appointment",
              "Create a bedtime reminder",
              "Explain my benefits",
              "What’s next today?",
            ].map((t) => (
              <button key={t} onClick={() => send(t)} disabled={buddyThinking}>
                {t}
              </button>
            ))}
          </div>
        )}
        {buddyThinking && (
          <p className="helper" aria-live="polite">
            Buddy is preparing a response…
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
            placeholder="What’s on your mind?"
            rows={1}
            disabled={buddyThinking}
            aria-busy={buddyThinking}
          />
          <button className="primary" disabled={!draft.trim() || buddyThinking}>
            {buddyThinking ? "Sending…" : "Send"}
          </button>
        </form>
        <p className="helper composer-note">
          For {profile.displayName} · Clear requests are saved automatically.
        </p>
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
        <div className="settings-section">
          <span className="eyebrow">YOUR CARE SPACE</span>
          <div className="settings-list">
            <button onClick={() => go("/family")}>
              <span>
                <Icon name="family" />
                People & care access
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => go("/today")}>
              <span>
                <Icon name="today" />
                Daily routines
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => go("/integrations")}>
              <span>
                <Icon name="buddy" />
                Connect your AI assistant
              </span>
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <div className="settings-section">
          <span className="eyebrow">APP & SUPPORT</span>
          <div className="settings-list">
            <button onClick={about}>
              <span>
                <Icon name="leaf" />
                About CareBuddy & installation
              </span>
              <Icon name="arrow" />
            </button>
            <button onClick={() => go("/welcome")}>
              <span>
                <Icon name="heart" />
                Revisit your welcome
              </span>
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <details className="advanced-settings">
          <summary>
            Advanced / Demo tools <Icon name="settings" />
          </summary>
          <div className="detail-panel">
            <h2>Reference clock</h2>
            <p>
              {state.clockMode === "reference"
                ? "Reference clock"
                : "Live clock"}
              : {formatDate(state.now)}, {formatTime(state.now)}
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
          <button onClick={() => go("/car")}>
            <Icon name="car" />
            Simulated car connection
          </button>
          <details className="detail-panel skill-handoff">
            <summary>WorkBuddy handoff</summary>
            <p className="helper">
              Export fictional context, run an installed skill in WorkBuddy,
              then import its JSON proposal. Review and confirm here to save. A
              live WorkBuddy connection is not configured.
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
        </details>
        <p className="helper">
          No real permissions, patient data, insurer checks, bookings or vehicle
          connections.
        </p>
      </>
    );
  }
  function refreshHealth() {
    if (!profile.id || syncLoading) return;
    const requestId = ++healthRequestId.current;
    const requestedProfile = profile.id;
    const selectionVersion = selection.current.version;
    const isCurrent = () =>
      requestId === healthRequestId.current &&
      stateRef.current.selectedProfileId === requestedProfile &&
      selection.current.version === selectionVersion;
    setHealthLoading(true);
    setHealthError("");
    fetchHealthSnapshot(requestedProfile)
      .then((snap) => {
        if (!isCurrent()) return;
        if (snap) setHealth(snap);
        else
          setHealthError(
            "Readings are unavailable. Try refreshing again later.",
          );
      })
      .catch(() => {
        if (isCurrent())
          setHealthError(
            "Readings are unavailable. Try refreshing again later.",
          );
      })
      .finally(() => {
        if (isCurrent()) setHealthLoading(false);
      });
  }
  useEffect(() => {
    ++healthRequestId.current;
    setHealth(null);
    setHealthError("");
    setHealthLoading(false);
    if (path === "/health" && profile.id && !syncLoading) refreshHealth();
    return () => {
      ++healthRequestId.current;
    };
  }, [path, profile.id, state.now, syncLoading]);
  function renderHealth() {
    const reading = health?.reading;
    if (!profile.id)
      return (
        <>
          <h1>Health</h1>
          <p className="lead">A space for rest and your daily wellbeing.</p>
          <div className="actions">
            <button className="primary" onClick={() => go("/welcome")}>
              <Icon name="leaf" />
              Set up your care space
            </button>
            <button onClick={() => openSleep("health")}>Explore sleep</button>
            <button onClick={() => openHealthDetails("health")}>
              Explore health
            </button>
          </div>
        </>
      );
    return (
      <div className="health-view">
        <span className="eyebrow">A LITTLE MORE BALANCE</span>
        <h1>Your health, at a glance</h1>
        <p className="lead">
          Rest, routines, and the bigger picture for {profile.displayName}.
        </p>
        <div className="health-overview">
          {renderSleepCard("health")}
          <HealthCard
            {...liveHealth}
            onReview={() => openHealthDetails("health")}
          />
          <section className="wearable-card">
            <span className="feature-icon">
              <Icon name="pulse" />
            </span>
            <div>
              <h2>
                {reading ? "Wearable readings" : "Your wearable, here soon"}
              </h2>
              <p>
                {reading
                  ? "Your latest available readings."
                  : "Wearable pairing is coming soon. Your live vitals will appear here when a device is connected."}
              </p>
            </div>
            {reading ? (
              <button
                className="text-button"
                onClick={refreshHealth}
                disabled={healthLoading}
              >
                {healthLoading ? "Refreshing…" : "Refresh readings"}
              </button>
            ) : (
              <span className="coming-soon-tag">Coming soon</span>
            )}
            {healthLoading && !reading && (
              <p role="status">Checking available readings…</p>
            )}
            {healthError && (
              <div role="alert" className="error">
                <p>{healthError}</p>
                {!reading && (
                  <button
                    className="text-button"
                    onClick={refreshHealth}
                    disabled={healthLoading}
                  >
                    Retry readings
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
        {reading && (
          <div className="stats-grid">
            {[
              ["Heart rate", reading.heartRate, "bpm"],
              [
                "Blood pressure",
                `${reading.systolic}/${reading.diastolic}`,
                "mmHg",
              ],
              ["Breathing", reading.breathingRate, "breaths/min"],
              ["Sleep", reading.sleepHours, `hours · ${reading.sleepQuality}`],
              ["Steps", reading.steps.toLocaleString(), "today"],
            ].map(([label, value, unit]) => (
              <div className="stat-card" key={label}>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}</span>
                <span className="stat-unit">{unit}</span>
              </div>
            ))}
          </div>
        )}
        <div className="section-heading health-weather-heading">
          <h2>Before you head out</h2>
        </div>
        <WeatherBanner
          weather={todayWeather}
          loading={weatherLoading}
          error={weatherError}
          onRetry={() => setWeatherRequest((request) => request + 1)}
        />
        {(health?.advice.length ?? 0) > 0 && (
          <section className="detail-panel">
            <h2>What to do today</h2>
            <ul className="advice-list">
              {health?.advice.map((advice) => (
                <li key={advice.id} className={"advice-" + advice.tone}>
                  <span className="advice-category">{advice.category}</span>
                  <span>{advice.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="care-insight">
          <Icon name="buddy" />
          <div>
            <strong>Make a plan that fits your day</strong>
            <p>Buddy can help organise your routines and appointments.</p>
          </div>
          <button className="text-button" onClick={() => ask()}>
            Ask Buddy <Icon name="arrow" />
          </button>
        </div>
      </div>
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
        <h1>Plan GP care</h1>
        <p className="lead">
          Explore a routine care-access option. CareBuddy does not assess
          symptoms or book care.
        </p>
        <section className="gp-care-card">
          <span className="feature-icon">
            <Icon name="heart" />
          </span>
          <h2>A little preparation for your next visit</h2>
          <p>
            Review the recorded GP benefit, then preview a preferred day and
            time.
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
                          GP benefit information for this person is not
                          available in the available policy terms.
                        </p>
                      ),
                    });
              }}
            >
              View GP benefit
            </button>
            <button
              className="primary"
              disabled={!profile.canManage}
              onClick={() =>
                openForm("gp", {
                  date: getSleepNightLabels(
                    new Date(
                      Math.max(Date.now(), Date.parse(state.now)) + 86400000,
                    ),
                  ).wakeDate,
                  time: "10:00",
                })
              }
            >
              Preview appointment request
            </button>
          </div>
          {!profile.canManage && (
            <p className="helper">
              Choose a profile with manage access to prepare an appointment
              request.
            </p>
          )}
        </section>
      </>
    );
  }
  const notFound = (text = "This item is no longer available") => (
    <div className="empty">
      <h1>{text}</h1>
      <p>Choose another item in CareBuddy.</p>
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
      if (
        v.date &&
        v.time &&
        Date.parse(isoAt(v.date, v.time)) <= Date.parse(state.now)
      )
        errors.time = "Choose a time after the current time";
    };
    let command: Command | undefined;
    let label = "";
    if (form.kind === "self") {
      if (v.displayName.trim().length < 2 || v.displayName.trim().length > 40)
        errors.displayName = "Enter a display name with 2 to 40 characters";
      if (v.acknowledged !== "yes")
        errors.acknowledged = "Confirm you’re using a fictional name";
      setFormErrors(errors);
      if (!Object.keys(errors).length)
        commit(
          {
            type: "createSelfProfile",
            displayName: v.displayName.trim(),
            acknowledged: true,
          },
          {
            success: "Your care space is ready",
            done: () => {
              setForm(null);
              go("/today");
              if (v.nextTemplate) startTemplate(v.nextTemplate);
            },
          },
        );
      return;
    }
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
      label = "Add " + v.displayName + " with view access on this device?";
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
        "Update in CareBuddy for " +
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
          commit({ type: "start" }, { done: () => go("/today") });
          setToast(
            "Family member added with view access. No invitation was sent.",
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
            key === "instructions" || key === "notes" ? 500 : undefined
          }
          aria-invalid={!!formErrors[key]}
        />
      ) : (
        <input
          type={type}
          value={form!.values[key]}
          placeholder={
            key === "displayName"
              ? "e.g. Jamie"
              : key === "title"
                ? "e.g. Evening stretch"
                : undefined
          }
          maxLength={
            key === "displayName" ? 40 : key === "title" ? 80 : undefined
          }
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={!!formErrors[key]}
        />
      )}{" "}
      {formErrors[key] && (
        <span className="field-error">{formErrors[key]}</span>
      )}
    </label>
  );
  const formSheet = form && !pending && (
    <Sheet
      title={
        form.kind === "reminder"
          ? form.id
            ? "Edit reminder"
            : "Add reminder"
          : form.kind === "self"
            ? "Your own care space"
            : form.kind === "dependent"
              ? "Add family member"
              : form.kind === "appointment"
                ? "Update in CareBuddy"
                : form.kind === "gp"
                  ? "Preview appointment request"
                  : form.kind === "benefitNote"
                    ? "Add benefit note"
                    : "Check benefits"
      }
      onClose={closeForm}
      footer={
        <div className="actions">
          <button type="submit" form="care-form" className="primary">
            {form.kind === "self"
              ? "Create my space"
              : form.kind === "gp"
                ? "Preview request"
                : form.kind === "benefitCheck"
                  ? "Check benefits"
                  : "Review changes"}
            <Icon name="arrow" />
          </button>
          <button type="button" className="text-button" onClick={closeForm}>
            Cancel
          </button>
        </div>
      }
    >
      <form id="care-form" onSubmit={submitForm}>
        {Object.keys(formErrors).length > 0 && (
          <div role="alert" className="error">
            Check the fields below. {Object.values(formErrors).join(". ")}
          </div>
        )}
        {form.kind === "reminder" && (
          <>
            <p className="form-person">
              <Icon name="leaf" />
              For {person(form.values.profileId)}
              <span>{form.values.category}</span>
            </p>
            {field("title", "What would you like to do?")}
            <div className="field-grid">
              {field("date", "Day", "date")}
              {field("time", "Time", "time")}
            </div>
            <label className="field">
              Repeat
              <select
                value={form.values.recurrence}
                onChange={(event) => change("recurrence", event.target.value)}
              >
                <option value="None">Just once</option>
                <option value="Daily">Every day</option>
              </select>
            </label>
            <details
              className="form-more"
              open={
                form.values.category === "Medication" ||
                !!form.values.instructions ||
                !!formErrors.instructions
              }
            >
              <summary>
                More options & instructions <Icon name="plus" />
              </summary>
              <label className="field">
                Category
                <select
                  value={form.values.category}
                  onChange={(event) => change("category", event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              {state.profiles.length > 1 && (
                <label className="field">
                  Person
                  <select
                    value={form.values.profileId}
                    disabled={!!form.id}
                    onChange={(event) =>
                      change("profileId", event.target.value)
                    }
                  >
                    {state.profiles.map((person) => (
                      <option
                        key={person.id}
                        value={person.id}
                        disabled={!person.canManage}
                      >
                        {person.displayName}
                        {!person.canManage ? " (view only)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {field("instructions", "Instructions (optional)", "textarea")}
            </details>
            {form.values.category === "Medication" && (
              <p className="helper">
                Use your existing medication instructions. Buddy does not
                prescribe medication.
              </p>
            )}
            {form.id && (
              <p className="helper">
                {form.scope === "future"
                  ? "This and future occurrences"
                  : "This occurrence only"}
              </p>
            )}
          </>
        )}
        {form.kind === "self" && (
          <>
            <div className="setup-form-intro">
              <span className="feature-icon">
                <Icon name="leaf" />
              </span>
              <p>A space for your routines, rest, and a little more balance.</p>
            </div>
            {field("displayName", "What should we call you?")}
            <p className="helper">
              Use a fictional display name while trying the app.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.values.acknowledged === "yes"}
                onChange={(event) =>
                  change("acknowledged", event.target.checked ? "yes" : "")
                }
              />
              I’m using a fictional name
            </label>
            {formErrors.acknowledged && (
              <p className="field-error">{formErrors.acknowledged}</p>
            )}
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
                    CareBuddy cannot call, dispatch or assess an emergency. No
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
  return (
    <div
      className={
        "app " +
        (path === "/buddy" ? "buddy-view " : "") +
        (path === "/welcome" || (path === "/today" && !profile.id)
          ? "setup-view"
          : "")
      }
    >
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
        <a className="wordmark" href="/" aria-label="CareBuddy home">
          <img
            className="brand-symbol"
            src="/branding/carebuddy-symbol-v1.png"
            width="256"
            height="249"
            alt=""
            aria-hidden="true"
          />
          <img
            className="brand-wordmark"
            src="/branding/carebuddy-wordmark-v1.png"
            width="640"
            height="140"
            alt={APP_NAME}
          />
        </a>

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
      {import.meta.env.VITE_UI_PREVIEW === "true" && (
        <div
          className="preview-banner"
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
          <span>Local preview · fictional household</span>
          <a
            href={
              import.meta.env.VITE_UI_COMPARE_URL ||
              "http://localhost:4319/today"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Compare previous design <Icon name="arrow" />
          </a>
        </div>
      )}
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
        {path !== "/" &&
          path !== "/today" &&
          path !== "/welcome" &&
          (!["/health/sleep", "/health/vitals"].includes(path) ||
            state.profiles.length > 0) &&
          renderProfilePicker()}
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
        {loading || syncLoading ? (
          <div role="status" className="loading">
            <h2>Loading your care…</h2>
            <div />
            <div />
            <div />
          </div>
        ) : path === "/welcome" ? (
          renderOnboarding()
        ) : path === "/today" ? (
          renderToday()
        ) : path.startsWith("/family") ? (
          renderFamily()
        ) : path.startsWith("/appointments/") ? (
          renderAppointment()
        ) : path.startsWith("/benefits") ? (
          renderBenefits()
        ) : path === "/health/sleep" ? (
          <SleepDetails
            profileName={profile.id ? profile.displayName : undefined}
            now={liveTime}
            backLabel={
              new URLSearchParams(route.split("?")[1]).get("from") === "health"
                ? "Health"
                : "Today"
            }
            onBack={() =>
              go(
                new URLSearchParams(route.split("?")[1]).get("from") ===
                  "health"
                  ? "/health"
                  : "/today",
              )
            }
            canManage={!profile.id || profile.canManage}
            reminderLabel={
              state.reminders.some(
                (reminder) =>
                  reminder.profileId === profile.id &&
                  reminder.category === "Bedtime" &&
                  !reminder.deletedAt &&
                  !reminder.outcome &&
                  Date.parse(reminder.scheduledAt) > Date.parse(state.now),
              )
                ? "Adjust wind-down reminder"
                : "Create wind-down reminder"
            }
            onCreateReminder={() =>
              profile.id
                ? startTemplate("wind-down")
                : openForm("self", {
                    displayName: "",
                    acknowledged: "",
                    nextTemplate: "wind-down",
                  })
            }
          />
        ) : path === "/health/vitals" ? (
          <HealthDetails
            {...liveHealth}
            profileName={profile.id ? profile.displayName : undefined}
            backLabel={
              new URLSearchParams(route.split("?")[1]).get("from") === "health"
                ? "Health"
                : "Today"
            }
            onBack={() =>
              go(
                new URLSearchParams(route.split("?")[1]).get("from") ===
                  "health"
                  ? "/health"
                  : "/today",
              )
            }
          />
        ) : path === "/health" ? (
          renderHealth()
        ) : path === "/buddy" ? (
          renderBuddy()
        ) : path === "/settings" ? (
          renderSettings()
        ) : path === "/integrations" ? (
          <AssistantExport
            clientId={clientId.current}
            profiles={state.profiles}
            selectedProfileId={state.selectedProfileId}
            onBack={() => go("/settings")}
          />
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
            <ReceiptView
              receipt={receipt}
              state={state}
              clientId={clientId.current}
            />
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
            <p>{reminderInstructions(detail) || "No instructions entered."}</p>
            {detail.category === "Medication" && (
              <p className="helper">
                This is a reported outcome, not clinical verification.
              </p>
            )}
            {detail.outcome && (
              <div className="notice">
                Recorded as {detail.outcome} for {profile.displayName} by{" "}
                {displayActor(
                  detail.recordedBy,
                  clientId.current,
                  state.profiles,
                )}{" "}
                at{" "}
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
                {h.text} · Recorded by{" "}
                {displayActor(h.actor, clientId.current, state.profiles)} for{" "}
                {person(h.subject)} · {formatTime(h.at)}
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
                  until: isoAt(today, snoozeTime),
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
          <p>
            For:{" "}
            {pending.action.command.type === "addDependent"
              ? (pending.action.command as { displayName: string })
                  .displayName + " (new)"
              : person(pending.action.profileId)}{" "}
            · Actor: Me
          </p>
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
          {pending.action.revision !== undefined &&
            pending.action.revision !== server.current?.revision && (
              <p className="helper">
                Care records changed. Close this review and prepare a new
                change.
              </p>
            )}
          {receipt && (
            <ReceiptView
              receipt={receipt}
              state={state}
              clientId={clientId.current}
            />
          )}
          <div className="actions">
            <button
              className="primary"
              onClick={confirm}
              disabled={
                confirming ||
                (pending.action.revision !== undefined &&
                  pending.action.revision !== server.current?.revision)
              }
            >
              {confirming ? "Saving…" : "Confirm"}
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
