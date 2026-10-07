import { describe, it, expect, vi, afterEach } from "vitest";
import {
  emptyState,
  execute,
  materialize,
  statusLabel,
  isoAt,
  validateState,
  loadState,
  buildChatAction,
  parseTime,
  STORAGE_KEY,
  importSkillProposal,
  assertFreshAction,
} from "../src/domain";
import type { ReminderInput, State, Profile } from "../src/types";

afterEach(() => vi.unstubAllGlobals());

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p-me",
    displayName: "Me",
    relationship: "Self",
    canView: true,
    canManage: true,
    ...overrides,
  };
}

function makeState(overrides: Partial<State> = {}): State {
  const s: State = {
    version: 1,
    started: true,
    now: "2026-09-30T09:00:00+08:00",
    selectedProfileId: "p-me",
    profiles: [makeProfile()],
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
    ...overrides,
  };
  return materialize(s);
}

const input = (overrides: Partial<ReminderInput> = {}): ReminderInput => ({
  profileId: "p-me",
  category: "Personal care",
  title: "Evening walk",
  scheduledAt: isoAt("2026-09-30", "18:00"),
  recurrence: "None",
  instructions: "",
  ...overrides,
});

describe("empty state", () => {
  it("returns truly empty state", () => {
    const s = emptyState();
    expect(s.profiles).toHaveLength(0);
    expect(s.reminders).toHaveLength(0);
    expect(s.appointments).toHaveLength(0);
    expect(s.benefits).toHaveLength(0);
    expect(s.notifications).toHaveLength(0);
    expect(s.selectedProfileId).toBe("");
  });
});

describe("create and manage reminders", () => {
  it("creates a reminder and materializes occurrences", () => {
    let s = makeState();
    s = execute(s, { type: "createReminder", input: input() }, "create");
    expect(s.reminders).toHaveLength(1);
    expect(s.reminders[0].title).toBe("Evening walk");
    expect(s.reminders[0].outcome).toBeNull();
    expect(statusLabel(s.reminders[0])).toBe("Upcoming");
  });

  it("completes a reminder and records actor", () => {
    let s = makeState();
    s = execute(s, { type: "createReminder", input: input() }, "create");
    const id = s.reminders[0].id;
    s = execute(s, { type: "completeReminder", id, outcome: "complete" }, "confirm-complete");
    const r = s.reminders.find((x) => x.id === id)!;
    expect(r.outcome).toBe("complete");
    expect(r.recordedBy).toBe("p-me");
    expect(r.history.length).toBeGreaterThanOrEqual(1);
    expect(r.history[0].subject).toBe("p-me");
  });

  it("rejects completion for view-only profile", () => {
    let s = makeState();
    s = execute(s, { type: "createReminder", input: input() }, "create");
    s.profiles[0].canManage = false;
    const id = s.reminders[0].id;
    expect(() =>
      execute(s, { type: "completeReminder", id, outcome: "complete" }, "confirm-complete"),
    ).toThrow();
  });
});

describe("family member CRUD", () => {
  it("adds a dependent", () => {
    let s = emptyState();
    s = execute(
      s,
      {
        type: "addDependent",
        displayName: "Mom (demo)",
        relationship: "Parent",
        canManage: false,
        acknowledged: true,
      },
      "add",
    );
    expect(s.profiles).toHaveLength(1);
    expect(s.profiles[0].displayName).toBe("Mom (demo)");
    expect(s.profiles[0].canManage).toBe(false);
    expect(s.selectedProfileId).toBe(s.profiles[0].id);
    expect(s.selectedProfileId).not.toBe("");
  });

  it("removes a dependent and cascades", () => {
    let s = makeState();
    s = execute(
      s,
      {
        type: "addDependent",
        displayName: "Mom (demo)",
        relationship: "Parent",
        canManage: true,
        acknowledged: true,
      },
      "add",
    );
    const momId = s.profiles.find((p) => p.displayName === "Mom (demo)")!.id;
    // create reminder for Mom while p-me is still selected
    s = execute(s, { type: "createReminder", input: input({ profileId: momId }) }, "create");
    expect(s.reminders).toHaveLength(1);
    // removeDependent doesn't require manage=true since it's about the profile itself
    s = execute(s, { type: "removeDependent", id: momId }, "remove");
    expect(s.profiles).toHaveLength(1);
    expect(s.reminders).toHaveLength(0);
  });

  it("updates a dependent", () => {
    let s = makeState();
    s = execute(
      s,
      {
        type: "addDependent",
        displayName: "Mom (demo)",
        relationship: "Parent",
        canManage: true,
        acknowledged: true,
      },
      "add",
    );
    const momId = s.profiles.find((p) => p.displayName === "Mom (demo)")!.id;
    s = execute(
      s,
      { type: "updateDependent", id: momId, patch: { displayName: "Dad", canManage: false } },
      "update",
    );
    const p = s.profiles.find((x) => x.id === momId)!;
    expect(p.displayName).toBe("Dad");
    expect(p.canManage).toBe(false);
  });
});

describe("state validation", () => {
  it("validates correct state", () => {
    expect(validateState(makeState())).toBe(true);
  });

  it("rejects invalid state", () => {
    expect(validateState({})).toBe(false);
    expect(validateState(null)).toBe(false);
    expect(validateState({ version: 2 })).toBe(false);
  });
});

describe("local storage load/save", () => {
  it("loads empty state when no localStorage", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const result = loadState();
    expect(result.state.profiles).toHaveLength(0);
    expect(result.notice).toBe("");
  });

  it("loads saved state", () => {
    const s = makeState();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(s),
    });
    const result = loadState();
    expect(result.state.profiles).toHaveLength(1);
    expect(result.notice).toBe("");
  });
});

describe("time parsing", () => {
  it("parses am/pm times", () => {
    expect(parseTime("8 am")).toEqual({ time: "08:00" });
    expect(parseTime("2:30 pm")).toEqual({ time: "14:30" });
  });

  it("detects ambiguous times", () => {
    expect(parseTime("8")).toEqual({});
  });
});

describe("import skill proposal", () => {
  it("rejects unsupported commands", () => {
    const s = makeState();
    expect(() =>
      importSkillProposal(s, {
        id: "test",
        command: { type: "reset" },
        sourceIds: ["s1"],
        profileId: "p-me",
        actor: "user",
      }),
    ).toThrow();
  });
});
