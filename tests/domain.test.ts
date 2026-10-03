import { describe, it, expect, vi, afterEach } from "vitest";
import {
  seed,
  execute,
  materialize,
  statusLabel,
  notificationTime,
  isoAt,
  BASE_NOW,
  validateState,
  loadState,
  buildChatAction,
  parseTime,
  STORAGE_KEY,
  importSkillProposal,
  assertFreshAction,
} from "../src/domain";
import type { ReminderInput } from "../src/types";
const input = (overrides: Partial<ReminderInput> = {}): ReminderInput => ({
  profileId: "p-me",
  category: "Personal care",
  title: "Evening walk",
  scheduledAt: isoAt("2026-09-30", "18:00"),
  recurrence: "None",
  instructions: "",
  ...overrides,
});
const get = (s: ReturnType<typeof seed>, id = "r-med-me") =>
  s.reminders.find((r) => r.id === id)!;
afterEach(() => vi.unstubAllGlobals());
describe("PDF v1.1 independent domain requirements", () => {
  it("fixed clock, permissions and tomorrow exist without completion", () => {
    const s = seed();
    expect(s.now).toBe(BASE_NOW);
    expect(s.selectedProfileId).toBe("p-me");
    expect(get(s).outcome).toBe(null);
    expect(statusLabel(get(s))).toBe("Upcoming");
    expect(s.profiles.find((p) => p.id === "p-leo")?.canManage).toBe(false);
    expect(s.reminders.filter((r) => r.seriesId === "r-med-me")).toHaveLength(
      2,
    );
    expect(
      materialize(s).reminders.filter((r) => r.seriesId === "r-med-me"),
    ).toHaveLength(2);
  });
  it("report and undo preserve independent tomorrow and actor", () => {
    let s = execute(
      seed(),
      { type: "completeReminder", id: "r-med-me", outcome: "taken" },
      "report",
    );
    expect(get(s).recordedBy).toBe("p-me");
    expect(get(s).recordedAt).toBe(BASE_NOW);
    expect(get(s).history[0].subject).toBe("p-me");
    s = execute(
      s,
      { type: "completeReminder", id: "r-med-me", outcome: "taken" },
      "again",
    );
    expect(get(s).history).toHaveLength(1);
    s = execute(s, { type: "undoCompletion", id: "r-med-me" });
    expect(get(s).outcome).toBe(null);
    expect(get(s).history).toHaveLength(2);
    expect(get(s, "r-med-me:2026-10-01").outcome).toBe(null);
  });
  it("snooze changes only notification and rejects past", () => {
    const s = execute(seed(), {
      type: "snoozeReminder",
      id: "r-med-me",
      until: isoAt("2026-09-30", "09:15"),
    });
    expect(notificationTime(get(s))).toBe(isoAt("2026-09-30", "09:15"));
    expect(get(s).scheduledAt).toBe(isoAt("2026-09-30", "08:00"));
    expect(get(s).recurrence).toBe("Daily");
    expect(get(s).outcome).toBe(null);
    expect(() =>
      execute(s, { type: "snoozeReminder", id: "r-med-me", until: BASE_NOW }),
    ).toThrow("after the current reference time");
  });
  it("create confirmation action is idempotent and edits preserve ID", () => {
    let s = execute(seed(), { type: "createReminder", input: input() }, "once");
    const r = s.reminders.find((r) => r.title === "Evening walk")!;
    s = execute(s, { type: "createReminder", input: input() }, "once");
    expect(s.reminders.filter((r) => r.title === "Evening walk")).toHaveLength(
      1,
    );
    s = execute(s, {
      type: "editReminder",
      id: r.id,
      input: input({ title: "Long evening walk" }),
      scope: "occurrence",
    });
    expect(get(s, r.id).title).toBe("Long evening walk");
    s = execute(s, { type: "deleteReminder", id: r.id });
    expect(get(s, r.id).deletedAt).toBe(BASE_NOW);
    s = execute(s, { type: "undoDeletion", id: r.id });
    expect(get(s, r.id).deletedAt).toBe(null);
  });
  it("validation rejects whitespace, past and long instructions", () => {
    for (const i of [
      input({ title: "   " }),
      input({ scheduledAt: BASE_NOW }),
      input({ instructions: "x".repeat(501) }),
    ])
      expect(() =>
        execute(seed(), { type: "createReminder", input: i }),
      ).toThrow();
  });
  it("stale recipient and view-only command rejected at execution", () => {
    let s = execute(seed(), { type: "selectProfile", profileId: "p-maya" });
    expect(() =>
      execute(s, { type: "createReminder", input: input() }, "stale", "p-me"),
    ).toThrow("different profile");
    s = execute(s, { type: "selectProfile", profileId: "p-leo" });
    expect(() =>
      execute(s, {
        type: "completeReminder",
        id: "r-bath-leo",
        outcome: "complete",
      }),
    ).toThrow("cannot update");
    expect(() =>
      execute(s, { type: "toggleChecklist", id: "a-dental-leo", index: 0 }),
    ).toThrow("cannot update");
  });
  it("new dependent is view-only and removal cleans their active entities", () => {
    let s = execute(seed(), {
      type: "addDependent",
      displayName: "Test child",
      relationship: "Child",
      acknowledged: true,
    });
    const p = s.profiles.find((p) => p.displayName === "Test child")!;
    expect(p.canManage).toBe(false);
    s = execute(s, { type: "selectProfile", profileId: p.id });
    s = execute(s, { type: "removeDependent", id: p.id });
    expect(s.selectedProfileId).toBe("p-me");
    expect(s.profiles).toHaveLength(3);
    expect(() => execute(s, { type: "removeDependent", id: "p-me" })).toThrow();
  });
  it("appointment edits retain provenance and linked reminder time", () => {
    let s = execute(seed(), { type: "selectProfile", profileId: "p-maya" });
    const before = get(s, "r-screen-maya").scheduledAt;
    s = execute(s, {
      type: "editAppointment",
      id: "a-screen-maya",
      title: "Changed screening",
      startsAt: isoAt("2026-10-01", "11:00"),
      locationLabel: "Demo clinic B",
    });
    const a = s.appointments.find((a) => a.id === "a-screen-maya")!;
    expect(a.recordOrigin).toBe("user-saved");
    expect(a.providerConfirmed).toBe(false);
    expect(a.provenanceHistory[0].text).toContain("original demo provenance");
    expect(get(s, "r-screen-maya").scheduledAt).toBe(before);
  });
  it("benefit notes remain unverified with no usage invented", () => {
    const s = execute(seed(), {
      type: "addBenefitNote",
      category: "Imagined cover",
      notes: "My note",
    });
    const b = s.benefits.at(-1)!;
    expect(b.status).toBe("Needs confirmation");
    expect(b.policyDate).toBe(null);
    expect(b.source).toBe("User-entered demo note");
    expect(b).not.toHaveProperty("balance");
  });
  it("bedtime ambiguity and tonight-only override", () => {
    expect(parseTime("bedtime at 8").ambiguous).toBe(true);
    expect(parseTime("bedtime at 10:30 pm").time).toBe("22:30");
    expect(parseTime("move bedtime to 10:30 tonight").time).toBe("22:30");
    const s = seed();
    expect(buildChatAction(s, "move bedtime to 10:30 tonight").needsScope).toBe(
      true,
    );
    const a = buildChatAction(
      s,
      "move bedtime to 10:30 pm tonight",
      undefined,
      "occurrence",
    ).action!;
    const edited = execute(s, a.command, a.id, a.profileId);
    expect(get(edited, "r-bed-me").scheduledAt).toBe(
      isoAt("2026-09-30", "22:30"),
    );
    expect(get(edited, "r-bed-me:2026-10-01").scheduledAt).toBe(
      isoAt("2026-10-01", "22:00"),
    );
    expect(
      edited.reminders.filter((r) => r.seriesId === "r-bed-me"),
    ).toHaveLength(2);
  });
  it("caregiver skipped report has actor separate from subject", () => {
    let s = execute(seed(), { type: "selectProfile", profileId: "p-maya" });
    s = execute(s, {
      type: "completeReminder",
      id: "r-screen-maya",
      outcome: "skipped",
    });
    const r = get(s, "r-screen-maya");
    expect(r.recordedBy).toBe("p-me");
    expect(r.profileId).toBe("p-maya");
    expect(r.history[0].text).toContain("for Maya by Me");
    expect(r.history[0].text).not.toContain("confirmed");
    expect(r.completedAt).toBe(null);
  });
  it("storage validation reset and reload exit driving", () => {
    expect(validateState(seed())).toBe(true);
    const s = seed();
    s.carMode = "driving";
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(s) });
    expect(loadState().state.carMode).toBe("parked");
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    expect(loadState().notice).toContain("reset");
    const bad = { ...seed(), version: 2 };
    expect(validateState(bad)).toBe(false);
  });
  it("driving refuses sensitive commands", () => {
    let s = execute(seed(), { type: "setCarMode", mode: "driving" });
    expect(() =>
      execute(s, { type: "createReminder", input: input() }),
    ).toThrow("Available when parked");
    s = execute(s, { type: "setCarMode", mode: "parked" });
    expect(s.carMode).toBe("parked");
  });
  it("schema rejects corrupted reminder reporting and receipt fields", () => {
    const s = seed();
    (s.reminders[0] as unknown as Record<string, unknown>).recordedBy = 123;
    expect(validateState(s)).toBe(false);
  });
  it("regular bedtime schedule changes future time without changing older reports", () => {
    const s = seed();
    const a = buildChatAction(
      s,
      "move bedtime to 10:30 tonight",
      undefined,
      "future",
    ).action!;
    const changed = execute(s, a.command, a.id, a.profileId);
    expect(get(changed, "r-bed-me").scheduledAt).toBe(
      isoAt("2026-09-30", "22:30"),
    );
    expect(get(changed, "r-bed-me:2026-10-01").scheduledAt).toBe(
      isoAt("2026-10-01", "22:30"),
    );
    expect(get(changed, "r-bed-me").occurrenceOverride).toBe(false);
  });
  it("moving an occurrence onto an existing day rejects series collision", () => {
    const s = seed();
    expect(() =>
      execute(s, {
        type: "editReminder",
        id: "r-bed-me",
        input: input({
          category: "Bedtime",
          title: "Bedtime reminder",
          scheduledAt: isoAt("2026-10-01", "22:30"),
          recurrence: "Daily",
        }),
        scope: "occurrence",
      }),
    ).toThrow();
  });
  it("appointment context explains its category benefit rather than GP fallback", () => {
    const response = buildChatAction(
      seed(),
      "Explain sample benefits",
      "a-check-me",
    );
    expect(response.text).toContain("Conditions apply");
    expect(response.text).not.toContain("Listed in sample plan");
  });
  it("preparation recognizes existing reminder instead of duplicating it", () => {
    const s = seed();
    s.now = isoAt("2026-09-30", "20:00");
    s.selectedProfileId = "p-maya";
    const response = buildChatAction(
      s,
      "Prepare for my appointment",
      "a-screen-maya",
    );
    expect(response.action).toBeUndefined();
    expect(response.sourceId).toBe("r-screen-maya");
  });
});

describe("state-driven Buddy outcomes", () => {
  it("preparation follows edited appointment and reference clock, not profile identity", () => {
    let s = seed();
    s.now = isoAt("2026-10-02", "10:00");
    s.appointments[0].startsAt = isoAt("2026-10-02", "16:00");
    let reply = buildChatAction(s, "Prepare for my appointment");
    expect(reply.action?.command.type).toBe("createReminder");
    if (reply.action?.command.type === "createReminder")
      expect(reply.action.command.input.scheduledAt).toBe(
        isoAt("2026-10-02", "15:00"),
      );
    s.now = isoAt("2026-10-02", "15:30");
    reply = buildChatAction(s, "Prepare for my appointment");
    if (reply.action?.command.type === "createReminder")
      expect(reply.action.command.input.scheduledAt).toBe(
        isoAt("2026-10-02", "15:45"),
      );
    s.appointments[0].checklist = [true, true, true];
    expect(buildChatAction(s, "Prepare for my appointment").text).toContain(
      "checklist is complete",
    );
  });
  it("benefits select dental explicitly and overview never silently substitutes GP", () => {
    const s = seed();
    expect(buildChatAction(s, "Explain my dental cover").sourceId).toBe(
      "b-dental-p-me",
    );
    const overview = buildChatAction(s, "Explain my benefits");
    expect(overview.sourceId).toBeUndefined();
    expect(overview.text).toContain("GP visits");
    expect(overview.text).toContain("Dental");
    s.selectedProfileId = "p-leo";
    expect(buildChatAction(s, "Explain my dental cover").sourceId).toBe(
      "b-dental-leo",
    );
  });
  it("day summary changes after completion and never invents an appointment", () => {
    let s = seed();
    const initial = buildChatAction(s, "Plan my day").text;
    s = execute(s, {
      type: "completeReminder",
      id: "r-med-me",
      outcome: "taken",
    });
    const updated = buildChatAction(s, "Plan my day").text;
    expect(updated).not.toBe(initial);
    expect(updated).toContain("1 routines recorded");
    s.appointments = [];
    expect(buildChatAction(s, "Plan my day").text).toContain(
      "No upcoming appointments today",
    );
  });
  it("contextual snooze leaves schedule unchanged and report requires confirmation", () => {
    const s = seed();
    const reply = buildChatAction(
      s,
      "Remind me later in 15 minutes",
      "r-med-me",
    );
    expect(reply.action?.command.type).toBe("snoozeReminder");
    expect(s.reminders[0].notificationSnoozedUntil).toBeNull();
    const changed = execute(s, reply.action!.command);
    expect(changed.reminders[0].scheduledAt).toBe(s.reminders[0].scheduledAt);
    expect(
      buildChatAction(s, "Mark as taken", "r-med-me").action?.command.type,
    ).toBe("completeReminder");
    s.selectedProfileId = "p-leo";
    expect(
      buildChatAction(s, "Mark complete", "r-bath-leo").action,
    ).toBeUndefined();
  });
  it("new routine preserves explicit time and rejects medication schedule generation", () => {
    const s = seed();
    const reply = buildChatAction(s, "Remind me to take a walk at 6 pm");
    expect(reply.action?.command.type).toBe("createReminder");
    if (reply.action?.command.type === "createReminder")
      expect(reply.action.command.input.scheduledAt).toBe(
        isoAt("2026-09-30", "18:00"),
      );
    expect(
      buildChatAction(s, "Remind me to take medicine at 6 pm").action,
    ).toBeUndefined();
  });
  it("active preparation is unique across separate submissions and must precede appointment", () => {
    const s = seed();
    s.selectedProfileId = "p-maya";
    expect(() =>
      execute(s, {
        type: "createReminder",
        input: {
          profileId: "p-maya",
          category: "Appointment preparation",
          title: "Prepare again",
          scheduledAt: isoAt("2026-09-30", "20:00"),
          recurrence: "None",
          instructions: "",
          appointmentId: "a-screen-maya",
        },
      }),
    ).toThrow("already exists");
    s.selectedProfileId = "p-me";
    expect(() =>
      execute(s, {
        type: "createReminder",
        input: {
          profileId: "p-me",
          category: "Appointment preparation",
          title: "Too late",
          scheduledAt: isoAt("2026-09-30", "20:00"),
          recurrence: "None",
          instructions: "",
          appointmentId: "a-check-me",
        },
      }),
    ).toThrow("before");
  });
});

describe("WorkBuddy proposal handoff", () => {
  const proposal = (s: ReturnType<typeof seed>) => {
    const a = buildChatAction(s, "Prepare for my appointment").action!;
    return {
      status: "proposal",
      executed: false,
      expectedClock: s.now,
      action: a,
    };
  };
  it("imports an unexecuted source-bound proposal without mutation and rejects repeat after execution", () => {
    const s = seed(),
      before = JSON.stringify(s),
      v = proposal(s),
      a = importSkillProposal(s, v);
    expect(JSON.stringify(s)).toBe(before);
    const next = execute(s, a.command, a.id, a.profileId);
    expect(next.reminders.length).toBe(s.reminders.length + 1);
    expect(() => importSkillProposal(next, v)).toThrow("already applied");
  });
  it("rejects stale clock, changed source, cross-person input, and unsupported commands", () => {
    const s = seed(),
      v = proposal(s);
    expect(() =>
      importSkillProposal(s, {
        ...v,
        expectedClock: BASE_NOW.replace("09:", "08:"),
      }),
    ).toThrow();
    s.appointments[0].startsAt = isoAt("2026-10-01", "12:00");
    expect(() => importSkillProposal(s, v)).toThrow("source record changed");
    const fresh = proposal(s);
    s.selectedProfileId = "p-leo";
    expect(() => importSkillProposal(s, fresh)).toThrow("recipient");
    s.selectedProfileId = "p-me";
    expect(() =>
      importSkillProposal(s, {
        ...fresh,
        action: { ...fresh.action, command: { type: "reset" } },
      }),
    ).toThrow("reminder proposals");
  });
  it("rechecks source on confirmation, not only import", () => {
    const s = seed(),
      a = importSkillProposal(s, proposal(s));
    s.appointments[0].checklist[0] = true;
    expect(() => assertFreshAction(s, a)).toThrow("source record changed");
  });
});

it("adds fictional records once while preserving edits and intentional deletion", () => {
  const old = seed();
  old.appliedActions = [];
  old.reminders = old.reminders.filter((r) => !r.id.startsWith("syn-"));
  old.appointments = old.appointments.filter((r) => !r.id.startsWith("syn-"));
  old.activity = [];
  old.reminders[0].title = "My edited reminder";
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(old) });
  const migrated = loadState().state;
  expect(validateState(migrated)).toBe(true);
  expect(migrated.reminders[0].title).toBe("My edited reminder");
  expect(migrated.reminders.some((r) => r.id === "syn-walk")).toBe(true);
  migrated.reminders = migrated.reminders.filter((r) => r.id !== "syn-walk");
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(migrated) });
  expect(loadState().state.reminders.some((r) => r.id === "syn-walk")).toBe(
    false,
  );
});
