import type {
  State,
  Reminder,
  Appointment,
  ReminderInput,
  Command,
  Activity,
  Category,
  Action,
  ChatMessage,
  Benefit,
} from "./types.js";
export const STORAGE_KEY = "care-buddy-demo-v1";
export const BASE_NOW = "2026-09-30T09:00:00+08:00";
export const categories: Category[] = [
  "Medication",
  "Bedtime",
  "Personal care",
  "Appointment preparation",
  "Other",
];
export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Math.random().toString(36).slice(2)}`;
const day = (iso: string) =>
  new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const isoAt = (date: string, time: string) => `${date}T${time}:00+08:00`;
export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
export const notificationTime = (r: Reminder) =>
  r.notificationSnoozedUntil || r.scheduledAt;
export const statusLabel = (r: Reminder) =>
  r.outcome === "taken"
    ? "Recorded as taken"
    : r.outcome === "complete"
      ? "Complete"
      : r.outcome === "skipped"
        ? "Recorded as skipped"
        : "Upcoming";
export function seed(): State {
  // Returns a fully empty state — no demo data.
  return emptyState();
}

export function emptyState(): State {
  return {
    version: 1,
    started: false,
    now: new Date().toISOString(),
    selectedProfileId: "",
    profiles: [],
    reminders: [],
    appointments: [],
    benefits: [],
    chats: [],
    notifications: [],
    appliedActions: [],
    activity: [],
    carMode: "disconnected",
    preferences: { genericReminders: false, spokenReminders: false },
    scenario: "",
  };
}
/**
 * No-op: synthetic demo data has been removed.
 * Kept for backward compatibility with existing states that have the tag.
 */
export function ensureSyntheticRecords(_s: State): void {
  // intentionally empty
}

export function materialize(s: State): State {
  // Occurrences are generated independently of their reported outcomes.
  const dates = [
    day(s.now),
    day(new Date(new Date(s.now).getTime() + 86400000).toISOString()),
  ];
  const groups = new Set(
    s.reminders
      .filter((r) => r.seriesId && r.recurrence === "Daily" && !r.deletedAt)
      .map((r) => r.seriesId!),
  );
  for (const seriesId of groups) {
    const originals = s.reminders
      .filter((r) => r.seriesId === seriesId && !r.deletedAt)
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
    for (const date of dates) {
      if (
        s.reminders.some(
          (r) => r.seriesId === seriesId && r.occurrenceDate === date,
        )
      )
        continue;
      const prior = originals
        .filter(
          (r) =>
            r.occurrenceDate <= date &&
            !r.occurrenceOverride &&
            r.recurrence === "Daily",
        )
        .at(-1);
      if (!prior) continue;
      s.reminders.push({
        ...prior,
        id: `${seriesId}:${date}`,
        scheduledAt: isoAt(date, prior.scheduledAt.slice(11, 16)),
        occurrenceDate: date,
        notificationSnoozedUntil: null,
        outcome: null,
        completedAt: null,
        recordedBy: null,
        recordedAt: null,
        occurrenceOverride: false,
        history: [],
      });
    }
  }
  return s;
}
function validIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function validateState(v: unknown): v is State {
  if (
    !isRecord(v) ||
    v.version !== 1 ||
    typeof v.started !== "boolean" ||
    !validIso(v.now) ||
    typeof v.selectedProfileId !== "string"
  )
    return false;
  for (const key of [
    "profiles",
    "reminders",
    "appointments",
    "benefits",
    "chats",
    "notifications",
    "appliedActions",
    "activity",
  ])
    if (!Array.isArray(v[key])) return false;
  const profiles = v.profiles as unknown[];
  if (
    !profiles.every(
      (p) =>
        isRecord(p) &&
        typeof p.id === "string" &&
        typeof p.displayName === "string" &&
        typeof p.relationship === "string" &&
        typeof p.canView === "boolean" &&
        typeof p.canManage === "boolean",
    )
  )
    return false;
  const ids = new Set(profiles.map((p) => (p as { id: string }).id));
  if (ids.size !== profiles.length) return false;
  if (profiles.length > 0 && !ids.has(v.selectedProfileId)) return false;
  const hist = (h: unknown) =>
    Array.isArray(h) &&
    h.every(
      (a) =>
        isRecord(a) &&
        typeof a.id === "string" &&
        typeof a.text === "string" &&
        validIso(a.at) &&
        typeof a.actor === "string" &&
        typeof a.subject === "string",
    );
  const nullableDate = (x: unknown) => x === null || validIso(x);
  const nullableString = (x: unknown) => x === null || typeof x === "string";
  const owned = (x: unknown) =>
    isRecord(x) &&
    typeof x.id === "string" &&
    typeof x.profileId === "string" &&
    ids.has(x.profileId);
  if (
    !(v.reminders as unknown[]).every(
      (r) =>
        owned(r) &&
        isRecord(r) &&
        categories.includes(r.category as Category) &&
        typeof r.title === "string" &&
        validIso(r.scheduledAt) &&
        (r.notificationSnoozedUntil === null ||
          validIso(r.notificationSnoozedUntil)) &&
        ["None", "Daily"].includes(r.recurrence as string) &&
        typeof r.occurrenceDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.occurrenceDate) &&
        nullableString(r.seriesId) &&
        nullableString(r.appointmentId) &&
        typeof r.occurrenceOverride === "boolean" &&
        nullableDate(r.completedAt) &&
        nullableDate(r.recordedAt) &&
        nullableString(r.recordedBy) &&
        typeof r.instructions === "string" &&
        [null, "taken", "complete", "skipped"].includes(r.outcome as null) &&
        hist(r.history) &&
        (r.deletedAt === null || validIso(r.deletedAt)),
    )
  )
    return false;
  if (
    !(v.appointments as unknown[]).every(
      (a) =>
        owned(a) &&
        isRecord(a) &&
        typeof a.title === "string" &&
        typeof a.category === "string" &&
        validIso(a.startsAt) &&
        typeof a.locationLabel === "string" &&
        Array.isArray(a.checklist) &&
        a.checklist.length === 3 &&
        a.checklist.every((b) => typeof b === "boolean") &&
        ["demo", "user-saved"].includes(a.recordOrigin as string) &&
        a.providerConfirmed === false &&
        hist(a.provenanceHistory),
    )
  )
    return false;
  if (
    !(v.benefits as unknown[]).every(
      (b) =>
        owned(b) &&
        isRecord(b) &&
        typeof b.category === "string" &&
        [
          "Listed in sample plan",
          "Conditions apply",
          "Needs confirmation",
          "Not listed in sample data",
        ].includes(b.status as string) &&
        typeof b.conditions === "string" &&
        typeof b.source === "string" &&
        (b.policyDate === null || validIso(b.policyDate)),
    )
  )
    return false;
  const receipt = (x: unknown) =>
    x === undefined ||
    (isRecord(x) &&
      typeof x.actionId === "string" &&
      Array.isArray(x.sourceIds) &&
      x.sourceIds.every((i) => typeof i === "string") &&
      typeof x.profileId === "string" &&
      typeof x.actor === "string" &&
      typeof x.operation === "string" &&
      typeof x.confirmation === "boolean" &&
      ["Saved", "Cancelled", "Save failed"].includes(x.outcome as string) &&
      validIso(x.timestamp));
  if (
    !(v.chats as unknown[]).every(
      (c) =>
        owned(c) &&
        isRecord(c) &&
        ["user", "assistant"].includes(c.role as string) &&
        typeof c.text === "string" &&
        nullableString(c.contextId) &&
        receipt(c.actionReceipt) &&
        validIso(c.timestamp),
    )
  )
    return false;
  if (
    !(v.notifications as unknown[]).every(
      (n) =>
        owned(n) &&
        isRecord(n) &&
        typeof n.title === "string" &&
        typeof n.targetId === "string" &&
        ["reminder", "appointment", "benefit", "urgent"].includes(
          n.targetType as string,
        ) &&
        validIso(n.timestamp) &&
        (n.readAt === null || validIso(n.readAt)),
    )
  )
    return false;
  if (
    !hist(v.activity) ||
    !(v.appliedActions as unknown[]).every((a) => typeof a === "string") ||
    !["disconnected", "parked", "driving"].includes(v.carMode as string) ||
    !isRecord(v.preferences) ||
    typeof v.preferences.genericReminders !== "boolean" ||
    typeof v.preferences.spokenReminders !== "boolean" ||
    typeof v.scenario !== "string"
  )
    return false;
  for (const key of [
    "reminders",
    "appointments",
    "benefits",
    "chats",
    "notifications",
  ]) {
    const arr = v[key] as { id: string }[];
    if (new Set(arr.map((x) => x.id)).size !== arr.length) return false;
  }
  return true;
}
export function validateReminder(input: ReminderInput, now: string) {
  if (!categories.includes(input.category))
    throw new Error("Choose a category");
  if (input.title.trim().length < 3 || input.title.trim().length > 80)
    throw new Error("Enter a title with 3 to 80 characters");
  if (!input.scheduledAt || !/^\d{4}-\d{2}-\d{2}T/.test(input.scheduledAt))
    throw new Error("Choose a date");
  if (!validIso(input.scheduledAt)) throw new Error("Choose a time");
  if (Date.parse(input.scheduledAt) <= Date.parse(now))
    throw new Error("Choose a time after the current reference time");
  if (input.instructions.length > 500)
    throw new Error("Keep instructions within 500 characters");
  if (!["None", "Daily"].includes(input.recurrence))
    throw new Error("Choose Repeat None or Daily");
}
export function execute(
  state: State,
  c: Command,
  actionId: string = uid(),
  expectedProfileId?: string,
): State {
  if (state.appliedActions.includes(actionId)) return state;
  const s: State = structuredClone(state);
  if (expectedProfileId && expectedProfileId !== s.selectedProfileId)
    throw new Error(
      "This action belongs to a different profile. No changes made.",
    );
  if (
    s.carMode === "driving" &&
    !(c.type === "setCarMode" && c.mode === "parked")
  )
    throw new Error("Available when parked");
  const profile = (id: string, manage = true) => {
    const p = s.profiles.find((x) => x.id === id);
    if (!p?.canView) throw new Error("This profile is no longer available");
    if (id !== s.selectedProfileId && manage)
      throw new Error("This action belongs to a different profile");
    if (manage && !p.canManage)
      throw new Error("You can view reminders, but cannot update this profile");
    return p;
  };
  const event = (subject: string, text: string): Activity => ({
    id: uid(),
    subject,
    actor: "p-me",
    text,
    at: s.now,
  });
  const reminder = (id: string) => {
    const r = s.reminders.find((x) => x.id === id && !x.deletedAt);
    if (!r) throw new Error("This reminder is no longer available");
    profile(r.profileId);
    return r;
  };
  const inputCheck = (input: ReminderInput) => {
    profile(input.profileId);
    validateReminder(input, s.now);
    if (
      input.appointmentId &&
      !s.appointments.some(
        (a) =>
          a.id === input.appointmentId &&
          a.profileId === input.profileId &&
          Date.parse(input.scheduledAt) < Date.parse(a.startsAt),
      )
    )
      throw new Error(
        "Preparation must be before an available appointment for this person",
      );
  };
  switch (c.type) {
    case "start": {
      s.started = true;
      break;
    }
    case "reset": {
      const fresh = emptyState();
      fresh.started = true;
      return fresh;
    }
    case "selectProfile": {
      const sp = s.profiles.find((x) => x.id === c.profileId);
      if (!sp?.canView) throw new Error("This profile is no longer available");
      s.selectedProfileId = c.profileId;
      break;
    }
    case "createReminder": {
      inputCheck(c.input);
      const i = c.input;
      if (
        i.appointmentId &&
        s.reminders.some(
          (r) =>
            r.appointmentId === i.appointmentId &&
            r.category === "Appointment preparation" &&
            !r.deletedAt &&
            !r.outcome,
        )
      )
        throw new Error(
          "An active preparation reminder already exists. Update that reminder instead.",
        );
      const id = uid();
      s.reminders.push({
        id,
        profileId: i.profileId,
        category: i.category,
        title: i.title.trim(),
        scheduledAt: i.scheduledAt,
        notificationSnoozedUntil: null,
        recurrence: i.recurrence,
        seriesId: i.recurrence === "Daily" ? id : null,
        occurrenceDate: day(i.scheduledAt),
        instructions: i.instructions,
        appointmentId: i.appointmentId || null,
        outcome: null,
        completedAt: null,
        recordedBy: null,
        recordedAt: null,
        occurrenceOverride: false,
        deletedAt: null,
        history: [event(i.profileId, "Reminder created")],
      });
      break;
    }
    case "editReminder": {
      const r = reminder(c.id);
      inputCheck(c.input);
      if (c.input.profileId !== r.profileId)
        throw new Error("Cannot move a reminder to another person");
      if (
        r.seriesId &&
        day(c.input.scheduledAt) !== r.occurrenceDate &&
        s.reminders.some(
          (t) =>
            t.id !== r.id &&
            t.seriesId === r.seriesId &&
            t.occurrenceDate === day(c.input.scheduledAt),
        )
      )
        throw new Error(
          "An occurrence already exists for this series on that date. Edit that occurrence instead.",
        );
      const old = `${r.title}, ${formatTime(r.scheduledAt)}`;
      const input = c.input;
      const targets =
        c.scope === "future" && r.seriesId
          ? s.reminders.filter(
              (x) =>
                x.seriesId === r.seriesId &&
                x.occurrenceDate >= r.occurrenceDate &&
                !x.deletedAt,
            )
          : [r];
      for (const t of targets) {
        const date = t === r ? day(input.scheduledAt) : t.occurrenceDate;
        Object.assign(t, {
          category: input.category,
          title: input.title.trim(),
          scheduledAt: isoAt(date, input.scheduledAt.slice(11, 16)),
          instructions: input.instructions,
          recurrence: input.recurrence,
          notificationSnoozedUntil: null,
          occurrenceDate: date,
          occurrenceOverride: c.scope === "occurrence" && !!r.seriesId,
        });
        t.history.push(
          event(
            t.profileId,
            `Updated from ${old} to ${t.title}, ${formatTime(t.scheduledAt)}${c.scope === "occurrence" ? " · This occurrence only" : ""}`,
          ),
        );
      }
      if (input.recurrence === "None" && c.scope === "future")
        s.reminders = s.reminders.filter(
          (t) =>
            t === r ||
            t.seriesId !== r.seriesId ||
            t.occurrenceDate <= r.occurrenceDate,
        );
      if (input.recurrence === "Daily" && !r.seriesId) r.seriesId = r.id;
      break;
    }
    case "completeReminder": {
      const r = reminder(c.id);
      if (r.outcome !== null) return state;
      if (
        (r.category === "Medication" && c.outcome === "complete") ||
        (r.category !== "Medication" && c.outcome === "taken")
      )
        throw new Error("Choose the appropriate reported outcome");
      r.outcome = c.outcome;
      r.completedAt = c.outcome === "skipped" ? null : s.now;
      r.recordedAt = s.now;
      r.recordedBy = "p-me";
      const name = profile(r.profileId).displayName;
      r.history.push(
        event(
          r.profileId,
          `Recorded as ${c.outcome} for ${name} by Me${c.reason ? ` · ${c.reason.slice(0, 500)}` : ""}`,
        ),
      );
      break;
    }
    case "undoCompletion": {
      const r = reminder(c.id);
      if (r.outcome === null) return state;
      r.history.push(event(r.profileId, `Undo reported ${r.outcome}`));
      r.outcome = null;
      r.completedAt = null;
      r.recordedAt = null;
      r.recordedBy = null;
      break;
    }
    case "snoozeReminder": {
      const r = reminder(c.id);
      if (!validIso(c.until) || Date.parse(c.until) <= Date.parse(s.now))
        throw new Error("Choose a time after the current reference time");
      r.notificationSnoozedUntil = c.until;
      r.history.push(
        event(
          r.profileId,
          `Notification postponed to ${formatTime(c.until)}. Schedule unchanged.`,
        ),
      );
      break;
    }
    case "deleteReminder": {
      const r = reminder(c.id);
      r.deletedAt = s.now;
      r.history.push(event(r.profileId, "Reminder deleted from active lists"));
      break;
    }
    case "undoDeletion": {
      const r = s.reminders.find((r) => r.id === c.id);
      if (!r) throw new Error("This reminder is no longer available");
      profile(r.profileId);
      r.deletedAt = null;
      r.history.push(event(r.profileId, "Deletion undone"));
      break;
    }
    case "addDependent": {
      if (!c.acknowledged)
        throw new Error("Confirm this is a fictional demo name");
      if (c.displayName.trim().length < 2 || c.displayName.trim().length > 40)
        throw new Error("Enter a name with 2 to 40 characters");
      if (!["Parent", "Child", "Partner", "Other"].includes(c.relationship))
        throw new Error("Choose a relationship");
      const id = uid();
      s.profiles.push({
        id,
        displayName: c.displayName.trim(),
        relationship: c.relationship,
        canView: true,
        canManage: c.canManage ?? false,
      });
      s.selectedProfileId = id;
      s.activity.push(
        event(
          id,
          "Fictional profile added with view access. No invitation sent.",
        ),
      );
      break;
    }
    case "updateDependent": {
      if (c.id === "p-me") throw new Error("Me cannot be changed");
      const p = profile(c.id, false);
      const patch = c.patch || {};
      if (
        patch.displayName !== undefined &&
        (patch.displayName.trim().length < 2 ||
          patch.displayName.trim().length > 40)
      )
        throw new Error("Enter a name with 2 to 40 characters");
      if (
        patch.relationship !== undefined &&
        !["Parent", "Child", "Partner", "Other"].includes(patch.relationship)
      )
        throw new Error("Choose a relationship");
      const changes: string[] = [];
      if (patch.displayName !== undefined && patch.displayName.trim() !== p.displayName) {
        changes.push(`renamed to ${patch.displayName.trim()}`);
        p.displayName = patch.displayName.trim();
      }
      if (
        patch.relationship !== undefined &&
        patch.relationship !== p.relationship
      ) {
        changes.push(`relationship ${p.relationship} → ${patch.relationship}`);
        p.relationship = patch.relationship;
      }
      if (patch.canManage !== undefined && patch.canManage !== p.canManage) {
        changes.push(patch.canManage ? "granted manage access" : "changed to view only");
        p.canManage = patch.canManage;
      }
      if (changes.length) {
        s.activity.push(event(c.id, `Fictional profile ${changes.join("; ")}`));
      }
      break;
    }
    case "removeDependent": {
      if (c.id === "p-me") throw new Error("Me cannot be removed");
      const p = s.profiles.find((x) => x.id === c.id);
      if (!p?.canView) throw new Error("This profile is no longer available");
      s.profiles = s.profiles.filter((p) => p.id !== c.id);
      s.reminders = s.reminders.filter((r) => r.profileId !== c.id);
      s.appointments = s.appointments.filter((a) => a.profileId !== c.id);
      s.benefits = s.benefits.filter((b) => b.profileId !== c.id);
      s.chats = s.chats.filter((m) => m.profileId !== c.id);
      s.notifications = s.notifications.filter((n) => n.profileId !== c.id);
      if (s.selectedProfileId === c.id) {
        // Fall back to "p-me" if still present; otherwise first remaining profile;
        // otherwise empty (no profiles left).
        const meStillThere = s.profiles.some((p) => p.id === "p-me");
        if (meStillThere) s.selectedProfileId = "p-me";
        else if (s.profiles.length > 0) s.selectedProfileId = s.profiles[0].id;
        else s.selectedProfileId = "";
      }
      s.activity.push(
        event(c.id, "Fictional profile removed from this browser"),
      );
      break;
    }
    case "toggleChecklist": {
      const a = s.appointments.find((a) => a.id === c.id);
      if (!a) throw new Error("This appointment is no longer available");
      profile(a.profileId);
      if (!Number.isInteger(c.index) || c.index < 0 || c.index > 2)
        throw new Error("Invalid checklist item");
      a.checklist[c.index] = !a.checklist[c.index];
      break;
    }
    case "editAppointment": {
      const a = s.appointments.find((a) => a.id === c.id);
      if (!a) throw new Error("This appointment is no longer available");
      profile(a.profileId);
      if (c.title.trim().length < 3 || c.title.trim().length > 80)
        throw new Error("Enter a title with 3 to 80 characters");
      if (!validIso(c.startsAt) || Date.parse(c.startsAt) <= Date.parse(s.now))
        throw new Error("Choose a time after the current reference time");
      if (c.locationLabel.length > 80)
        throw new Error("Keep fictional location within 80 characters");
      a.provenanceHistory.push(
        event(
          a.profileId,
          `Local update from ${a.title} at ${a.startsAt}; original demo provenance retained. Review linked preparation reminders.`,
        ),
      );
      a.title = c.title.trim();
      a.startsAt = c.startsAt;
      a.locationLabel = c.locationLabel;
      a.recordOrigin = "user-saved";
      a.providerConfirmed = false;
      break;
    }
    case "addBenefitNote": {
      profile(s.selectedProfileId);
      if (!c.category.trim()) throw new Error("Choose a category");
      if (c.category.length > 80 || c.notes.length > 500)
        throw new Error("Keep notes within 500 characters");
      s.benefits.push({
        id: uid(),
        profileId: s.selectedProfileId,
        category: c.category.trim(),
        notes: c.notes,
        status: "Needs confirmation",
        conditions:
          c.notes || "Confirm current terms with your benefits administrator.",
        source: "User-entered demo note",
        policyDate: null,
      });
      break;
    }
    case "markNotificationRead": {
      const n = s.notifications.find((n) => n.id === c.id);
      if (!n) throw new Error("This item is no longer available");
      n.readAt = s.now;
      break;
    }
    case "chatMessage": {
      profile(c.message.profileId, false);
      if (c.message.profileId !== s.selectedProfileId)
        throw new Error("This message belongs to a different profile");
      if (
        c.message.role === "user" &&
        (!c.message.text.trim() || c.message.text.length > 500)
      )
        throw new Error("Enter a message within 500 characters");
      if (!s.chats.some((m) => m.id === c.message.id)) s.chats.push(c.message);
      break;
    }
    case "setCarMode":
      s.carMode = c.mode;
      break;
    case "setPreference":
      s.preferences[c.key] = c.value;
      break;
    case "advanceClock":
      s.now =
        new Date(Date.parse(s.now) + 900000 + 8 * 3600000)
          .toISOString()
          .slice(0, 19) + "+08:00";
      break;
    case "restoreClock":
      s.now = BASE_NOW;
      break;
    case "scenario": {
      s.scenario = c.name;
      if (c.name === "Empty day") {
        s.reminders = s.reminders.filter(
          (r) => r.profileId !== s.selectedProfileId,
        );
        s.appointments = s.appointments.filter(
          (a) => a.profileId !== s.selectedProfileId,
        );
      }
      if (c.name === "Unknown benefit") {
        s.benefits = s.benefits.map((b) =>
          b.profileId === s.selectedProfileId
            ? {
                ...b,
                status: "Needs confirmation",
                conditions:
                  "The available terms do not contain enough information to confirm cover.",
              }
            : b,
        );
      }
      if (c.name === "View-only dependent") s.selectedProfileId = "p-leo";
      if (c.name === "Manage-access fixture") {
        const p = profile(s.selectedProfileId, false);
        p.canManage = true;
      }
      if (c.name === "Missing appointment")
        s.appointments = s.appointments.filter((a) => a.id !== "a-screen-maya");
      if (c.name === "Urgent-help demo")
        s.notifications.push({
          id: uid(),
          profileId: s.selectedProfileId,
          title: "Simulated urgent-help alert",
          targetType: "urgent",
          targetId: "urgent",
          readAt: null,
          timestamp: s.now,
        });
      break;
    }
    case "urgentViewed":
      s.activity.push(event(s.selectedProfileId, "Demo alert viewed"));
      break;
  }
  s.appliedActions.push(actionId);
  return materialize(s);
}
export function parseTime(text: string): {
  time?: string;
  ambiguous?: boolean;
} {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let h = +m[1],
      min = +(m[2] || 0);
    if (h < 1 || h > 12 || min > 59) return {};
    h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
    return {
      time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    };
  }
  const clock = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) {
    let h = +clock[1];
    const min = +clock[2];
    if (h > 23 || min > 59) return {};
    if (/tonight/i.test(text) && h < 12) h += 12;
    return {
      time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    };
  }
  if (/\b(?:at|to)\s+\d{1,2}\b/.test(text)) return { ambiguous: true };
  return {};
}
export function preparationTime(s: State, startsAt: string): string | null {
  const now = Date.parse(s.now),
    start = Date.parse(startsAt);
  if (!Number.isFinite(start) || start - now < 120000) return null;
  const previousDay = day(new Date(start - 86400000).toISOString());
  const evening = isoAt(previousDay, "19:00");
  const candidate =
    Date.parse(evening) > now ? Date.parse(evening) : start - 3600000;
  const at = candidate > now ? candidate : now + Math.floor((start - now) / 2);
  const local = new Date(at + 8 * 3600000).toISOString();
  return isoAt(local.slice(0, 10), local.slice(11, 16));
}
export function buildChatAction(
  s: State,
  text: string,
  contextId?: string,
  scope?: "occurrence" | "future",
): { text: string; action?: Action; needsScope?: boolean; sourceId?: string } {
  const p = s.profiles.find((p) => p.id === s.selectedProfileId)!;
  const t = text.toLowerCase();
  const action = (
    command: Command,
    label: string,
    sourceIds: string[],
  ): Action => ({
    id: uid(),
    profileId: p.id,
    command,
    label,
    sourceIds,
    expectedClock: s.now,
    expectedSources: structuredClone(
      [...s.reminders, ...s.appointments].filter((x) =>
        sourceIds.includes(x.id),
      ),
    ),
  });
  if (s.carMode === "driving")
    return {
      text: "Available when parked. Your care details stay private while driving.",
    };
  if (
    /dose|missed.*(?:medication|medicine)|symptom|pain|fever|diagnos|bleeding|prescrib|should i take|how much.*(?:medication|medicine)/.test(
      t,
    )
  )
    return {
      text: "I cannot advise on doses or missed medication, diagnose or assess symptoms. Follow your existing instructions or contact a qualified clinician. You can preview routine GP care or view emergency-help instructions.",
    };
  if (/benefit|cover|insurance/.test(t)) {
    const appointment = s.appointments.find(
      (a) => a.id === contextId && a.profileId === p.id,
    );
    const category = /dental|dentist/.test(t)
      ? "dental"
      : /screen|health check/.test(t)
        ? "screening"
        : /\bgp\b|general practitioner/.test(t)
          ? "gp"
          : null;
    const candidates = s.benefits.filter((b) => b.profileId === p.id);
    const b =
      candidates.find((b) => b.id === contextId) ||
      candidates.find(
        (b) => b.category === (category || appointment?.category),
      );
    if (!b && !category && !appointment && !contextId)
      return {
        text: `For ${p.displayName}:\n${candidates.map((b) => `${b.category === "gp" ? "GP visits" : b.category === "screening" ? "Health screening" : b.category === "dental" ? "Dental" : b.category}: ${b.status.replace("Listed in sample plan", "Listed in plan").replace("Not listed in sample data", "Not listed in available terms")}`).join("\n")}\nWhich service would you like to check? Current eligibility is not verified.`,
      };
    return {
      sourceId: b?.id,
      text: b
        ? `${b.status.replace("Listed in sample plan", "Listed in plan").replace("Not listed in sample data", "Not listed in available terms")}. ${b.conditions} Source: ${b.source}. ${b.policyDate ? formatDate(b.policyDate) : "Date not supplied"}. For: ${p.displayName}. Eligibility not verified. Confirm the current terms with your benefits administrator.`
        : "Needs confirmation. No matching policy source for this person. Eligibility not verified.",
    };
  }
  if (
    /bedtime|sleep/.test(t) &&
    !/mark|record|complete|done|skip|snooze|later/.test(t)
  ) {
    const parsed = parseTime(t);
    if (parsed.ambiguous)
      return {
        text: `Do you mean ${t.match(/(?:at|to)\s+(\d{1,2})/)?.[1] || "8"}:00 AM or ${t.match(/(?:at|to)\s+(\d{1,2})/)?.[1] || "8"}:00 PM? Please enter an explicit AM/PM or 24-hour time.`,
      };
    if (!parsed.time)
      return {
        text: "What time should the bedtime reminder use? Enter an explicit AM/PM or 24-hour time.",
      };
    const r = s.reminders.find(
      (r) =>
        r.profileId === p.id &&
        r.category === "Bedtime" &&
        r.occurrenceDate === day(s.now) &&
        !r.deletedAt,
    );
    if (r && !scope)
      return {
        text: "Tonight only, or your regular schedule?",
        needsScope: true,
      };
    const scheduledAt = isoAt(day(s.now), parsed.time);
    const input: ReminderInput = {
      profileId: p.id,
      category: "Bedtime",
      title: r?.title || "Bedtime reminder",
      scheduledAt,
      recurrence: r?.recurrence || "None",
      instructions: r?.instructions || "",
    };
    if (!p.canManage)
      return {
        text: "You can view reminders, but cannot update this profile.",
      };
    if (Date.parse(scheduledAt) <= Date.parse(s.now))
      return { text: "Choose a time after the current reference time." };
    const command: Command = r
      ? { type: "editReminder", id: r.id, input, scope: scope || "occurrence" }
      : { type: "createReminder", input };
    return {
      text: r
        ? `Review ${p.displayName}'s bedtime change: ${formatTime(r.scheduledAt)} → ${formatTime(scheduledAt)}. ${scope === "future" ? "Regular schedule: this and future occurrences." : "Tonight only. Other days: Unchanged."}`
        : `Review a new bedtime reminder for ${p.displayName} at ${formatTime(scheduledAt)}. Repeat: None.`,
      action: action(
        command,
        r ? "Confirm change" : "Confirm reminder",
        r ? [r.id] : [],
      ),
    };
  }
  if (
    /prepar|(?:get|getting).*ready|what.*bring/.test(t) &&
    !(
      /move|change|snooze|later|complete|record|done|skip/.test(t) &&
      s.reminders.some((r) => r.id === contextId && r.profileId === p.id)
    )
  ) {
    const a =
      s.appointments.find((a: Appointment) => a.id === contextId && a.profileId === p.id) ||
      s.appointments
        .filter(
          (a: Appointment) =>
            a.profileId === p.id && Date.parse(a.startsAt) > Date.parse(s.now),
        )
        .sort((a: Appointment, b: Appointment) => a.startsAt.localeCompare(b.startsAt))[0];
    if (!a)
      return { text: "No upcoming appointment is available for this person." };
    if (!p.canManage)
      return {
        text: "Review instructions from the provider; bring documents requested by the provider; confirm transport plans. Contact the provider for medical preparation instructions. You can view reminders, but cannot update this profile.",
      };
    const existing = s.reminders.find(
      (r: Reminder) =>
        r.profileId === p.id &&
        r.appointmentId === a.id &&
        r.category === "Appointment preparation" &&
        !r.deletedAt &&
        !r.outcome,
    );
    const checklist = [
      "review provider instructions",
      "bring requested documents",
      "confirm transport plans",
    ];
    const remaining = checklist.filter((_, i) => !a.checklist[i]);
    if (existing)
      return {
        sourceId: existing.id,
        text: `For ${p.displayName}: ${a.title}, ${formatDate(a.startsAt)} at ${formatTime(a.startsAt)}. ${remaining.length ? `Still to prepare: ${remaining.join("; ")}.` : "Your preparation checklist is complete."} Preparation reminder: ${formatDate(existing.scheduledAt)} at ${formatTime(existing.scheduledAt)}. Ask me to change that reminder if needed.`,
      };
    const defaultTime = preparationTime(s, a.startsAt);
    if (!defaultTime)
      return {
        text: "There is too little time to schedule preparation before this appointment. Review its current details directly.",
      };
    return {
      text: `For ${p.displayName}: ${remaining.length ? `Still to prepare: ${remaining.join("; ")}.` : "Your preparation checklist is complete."} Contact the provider for medical preparation instructions. Preview a preparation reminder on ${formatDate(defaultTime)} at ${formatTime(defaultTime)}, before ${a.title}.`,
      action: action(
        {
          type: "createReminder",
          input: {
            profileId: p.id,
            category: "Appointment preparation",
            title: `${a.title} preparation`,
            scheduledAt: defaultTime,
            recurrence: "None",
            instructions: remaining.length
              ? remaining.join("; ")
              : "Review your completed preparation checklist.",
            appointmentId: a.id,
          },
        },
        "Confirm reminder",
        [a.id],
      ),
    };
  }
  const active = s.reminders.filter(
    (r: Reminder) => r.profileId === p.id && !r.deletedAt,
  );
  const current = active.filter((r: Reminder) => r.occurrenceDate === day(s.now));
  const attached = contextId
    ? active.find((r: Reminder) => r.id === contextId)
    : undefined;
  const named = active.filter(
    (r: Reminder) => t.includes(r.title.toLowerCase()) && r.occurrenceDate === day(s.now),
  );
  const matched = attached || (named.length === 1 ? named[0] : undefined);
  if (
    matched &&
    /mark|record|complete|taken|done|skip|snooze|later|move|change|reschedul/.test(
      t,
    )
  ) {
    if (!p.canManage)
      return {
        text: "You can view reminders, but cannot update this profile.",
      };
    if (matched.outcome)
      return {
        sourceId: matched.id,
        text: `${matched.title} is already ${statusLabel(matched).toLowerCase()}. View the record to undo or change the report.`,
      };
    if (/mark|record|complete|taken|done|skip/.test(t)) {
      if (matched.category === "Medication" && !/taken|skip/.test(t))
        return {
          text: "Record as taken or skipped? This records what you report; it does not advise whether to take medication.",
        };
      const outcome = /skip/.test(t)
        ? "skipped"
        : matched.category === "Medication"
          ? "taken"
          : "complete";
      return {
        sourceId: matched.id,
        text: `Review: record ${matched.title} for ${p.displayName} as ${outcome}. No changes saved yet.`,
        action: action(
          { type: "completeReminder", id: matched.id, outcome },
          "Confirm report",
          [matched.id],
        ),
      };
    }
    const parsed = parseTime(t);
    const minutes = t.match(/(?:in|for)\s+(\d+)\s*(?:minutes?|mins?)\b/);
    if (/snooze|later/.test(t)) {
      const until = minutes
        ? new Date(Date.parse(s.now) + Number(minutes[1]) * 60000).toISOString()
        : parsed.time
          ? isoAt(day(s.now), parsed.time)
          : null;
      if (!until || Date.parse(until) <= Date.parse(s.now))
        return {
          text: "When should I remind you? Enter a future time or ‘in 15 minutes’.",
        };
      return {
        text: `Review: remind ${p.displayName} about ${matched.title} at ${formatTime(until)}. The original schedule stays unchanged.`,
        action: action(
          { type: "snoozeReminder", id: matched.id, until },
          "Confirm snooze",
          [matched.id],
        ),
      };
    }
    if (!parsed.time)
      return {
        text: "What time should this reminder use? Include AM/PM or a 24-hour time.",
      };
    if (matched.recurrence === "Daily" && !scope)
      return {
        text: "This occurrence only, or your regular schedule?",
        needsScope: true,
      };
    const date = /tomorrow/.test(t)
      ? day(new Date(Date.parse(s.now) + 86400000).toISOString())
      : matched.occurrenceDate;
    const scheduledAt = isoAt(date, parsed.time);
    if (Date.parse(scheduledAt) <= Date.parse(s.now))
      return { text: "Choose a time after the current reference time." };
    return {
      text: `Review ${matched.title} for ${p.displayName}: ${formatTime(matched.scheduledAt)} → ${formatTime(scheduledAt)}. ${scope === "future" ? "This and future occurrences." : "This occurrence only."}`,
      action: action(
        {
          type: "editReminder",
          id: matched.id,
          scope: scope || "occurrence",
          input: {
            profileId: p.id,
            category: matched.category,
            title: matched.title,
            scheduledAt,
            recurrence: matched.recurrence,
            instructions: matched.instructions,
            appointmentId: matched.appointmentId,
          },
        },
        "Confirm change",
        [matched.id],
      ),
    };
  }
  if (/remind me to|create.*reminder|add.*reminder/.test(t)) {
    if (!p.canManage)
      return {
        text: "You can view reminders, but cannot update this profile.",
      };
    const parsed = parseTime(t);
    const title = text
      .match(
        /remind me to\s+(.+?)(?:\s+(?:at|tomorrow|every day|daily)\b|$)/i,
      )?.[1]
      ?.trim();
    if (!title || title.length < 3 || !parsed.time)
      return {
        text: "Tell me the routine and time, for example ‘Remind me to take a walk at 6 pm’.",
      };
    if (/medication|medicine|tablet/.test(title.toLowerCase()))
      return {
        text: "Use Add reminder with your existing instructions for medication. I do not create medication schedules.",
      };
    const date = /tomorrow/.test(t)
      ? day(new Date(Date.parse(s.now) + 86400000).toISOString())
      : day(s.now);
    const scheduledAt = isoAt(date, parsed.time);
    if (Date.parse(scheduledAt) <= Date.parse(s.now))
      return {
        text: "That time has passed. Specify tomorrow or choose a later time.",
      };
    return {
      text: `Review: ${title} for ${p.displayName}, ${formatDate(scheduledAt)} at ${formatTime(scheduledAt)}. Repeat: ${/every day|daily/.test(t) ? "Daily" : "None"}.`,
      action: action(
        {
          type: "createReminder",
          input: {
            profileId: p.id,
            category: "Personal care",
            title,
            scheduledAt,
            recurrence: /every day|daily/.test(t) ? "Daily" : "None",
            instructions: "",
          },
        },
        "Confirm reminder",
        [],
      ),
    };
  }
  if (/today|day|next|schedule|reminders|plan/.test(t)) {
    const pending = current
      .filter((r: Reminder) => !r.outcome)
      .sort((a: Reminder, b: Reminder) => notificationTime(a).localeCompare(notificationTime(b)));
    const appts = s.appointments.filter(
      (a: Appointment) =>
        a.profileId === p.id &&
        day(a.startsAt) === day(s.now) &&
        Date.parse(a.startsAt) > Date.parse(s.now),
    );
    return {
      text: `For ${p.displayName}: ${current.filter((r: Reminder) => r.outcome === "taken" || r.outcome === "complete").length} routines recorded, ${pending.length} still to record.\n${pending.length ? pending.map((r: Reminder) => `${formatTime(r.scheduledAt)} · ${r.title}${Date.parse(r.scheduledAt) < Date.parse(s.now) ? " · not yet recorded" : ""}`).join("\n") : "No outstanding routines today."}\n${appts.length ? appts.map((a: Appointment) => `${formatTime(a.startsAt)} · ${a.title}`).join("\n") : "No upcoming appointments today."}`,
    };
  }
  if (/medication|medicine/.test(t))
    return {
      text: "I can show your recorded reminders, but do not provide medication advice. Attach a reminder to record what happened or use Add reminder with your existing instructions.",
    };
  return {
    text: "I can help with reminders, appointment preparation and benefits. Tell me what you’d like to organise, or choose an option below.",
  };
}
export function assistantMessage(
  s: State,
  text: string,
  receipt?: ChatMessage["actionReceipt"],
): ChatMessage {
  return {
    id: uid(),
    profileId: s.selectedProfileId,
    role: "assistant",
    text,
    contextId: null,
    timestamp: s.now,
    actionReceipt: receipt,
  };
}

export function assertFreshAction(s: State, a: Action): void {
  if (a.expectedClock && a.expectedClock !== s.now)
    throw new Error("The reference time changed. Request a fresh proposal.");
  for (const expected of a.expectedSources || []) {
    const current = [...s.reminders, ...s.appointments].find(
      (x) => x.id === expected.id && x.profileId === a.profileId,
    );
    if (JSON.stringify(current) !== JSON.stringify(expected))
      throw new Error("The source record changed. Request a fresh proposal.");
  }
}
export function importSkillProposal(s: State, value: unknown): Action {
  const v = value as {
    status?: string;
    executed?: boolean;
    expectedClock?: string;
    action?: Action;
  };
  if (
    !v ||
    v.status !== "proposal" ||
    v.executed !== false ||
    v.expectedClock !== s.now ||
    !v.action
  )
    throw new Error(
      "Import an unexecuted proposal for the current reference time.",
    );
  const a = v.action;
  if (
    typeof a.id !== "string" ||
    !a.id.trim() ||
    a.id.length > 120 ||
    a.profileId !== s.selectedProfileId ||
    typeof a.label !== "string" ||
    a.label.length > 200 ||
    !Array.isArray(a.sourceIds) ||
    !a.sourceIds.every((x: string) => typeof x === "string")
  )
    throw new Error("The proposal recipient or action fields are invalid.");
  if (s.appliedActions.includes(a.id))
    throw new Error("This proposal was already applied.");
  if (
    !a.command ||
    !["createReminder", "editReminder"].includes(a.command.type)
  )
    throw new Error("This import supports reminder proposals only.");
  if (
    a.command.type === "editReminder" &&
    !["occurrence", "future"].includes(a.command.scope)
  )
    throw new Error("Specify occurrence or future scope.");
  const sources = [...s.reminders, ...s.appointments].filter(
    (x) => a.sourceIds.includes(x.id) && x.profileId === a.profileId,
  );
  if (
    sources.length !== a.sourceIds.length ||
    !Array.isArray(a.expectedSources) ||
    a.expectedSources.length !== sources.length
  )
    throw new Error(
      "The proposal needs current source records for this person.",
    );
  if (a.command.type === "editReminder" && !a.sourceIds.includes(a.command.id))
    throw new Error("The reminder source is missing.");
  if (
    a.command.type === "createReminder" &&
    (!a.command.input?.appointmentId ||
      !a.sourceIds.includes(a.command.input.appointmentId))
  )
    throw new Error("The appointment source is missing.");
  const result = { ...a, expectedClock: v.expectedClock };
  assertFreshAction(s, result);
  execute(s, result.command, result.id, result.profileId); // Validation preview only; never saved.
  return result;
}
