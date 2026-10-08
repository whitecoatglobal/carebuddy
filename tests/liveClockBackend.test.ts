import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { emptyState, execute } from "care-buddy-shared";
import { parseCommand } from "../backend/src/commands";
const directory = mkdtempSync(path.join(tmpdir(), "buddy-live-clock-"));
let database: typeof import("../backend/src/db"),
  persistence: typeof import("../backend/src/persistence");
function care() {
  let state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Person",
    acknowledged: true,
  });
  state.now = "2026-10-07T04:00:00+08:00";
  state = execute(state, {
    type: "createReminder",
    input: {
      profileId: "p-me",
      title: "Morning medicine",
      category: "Medication",
      scheduledAt: "2026-10-07T08:00:00+08:00",
      recurrence: "Daily",
      instructions: "Keep prescribed directions",
    },
  });
  return state;
}
beforeAll(async () => {
  process.env.DB_DIR = directory;
  const legacy = new Database(path.join(directory, "care-buddy.db"));
  legacy.exec(
    "CREATE TABLE state_snapshots(client_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL,is_visible INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0)",
  );
  legacy
    .prepare("INSERT INTO state_snapshots VALUES(?,?,?,0,9)")
    .run("legacy", JSON.stringify(care()), "2026-10-07T00:00:00Z");
  legacy.close();
  database = await import("../backend/src/db");
  persistence = await import("../backend/src/persistence");
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  database.db.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});
function today() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T17:30:00Z"));
}
it("migrates frozen legacy data to live snapshots without changing saved JSON, visibility, revision or timestamps", () => {
  today();
  const before = database.loadStateRow("legacy")!;
  const state = persistence.snapshot("legacy");
  expect(state.state.now).toBe("2026-10-08T01:30:00+08:00");
  expect(state.state.clockMode).toBe("live");
  expect(
    state.state.reminders.some((r) => r.occurrenceDate === "2026-10-08"),
  ).toBe(true);
  expect(
    state.state.reminders.find((r) => r.occurrenceDate === "2026-10-07")
      ?.instructions,
  ).toBe("Keep prescribed directions");
  expect(database.loadStateRow("legacy")).toEqual(before);
  expect(state.revision).toBe(9);
  expect(database.isClientVisible("legacy")).toBe(false);
});
it("bootstraps only a live server clock and refuses clock metadata injection", () => {
  today();
  const bad = { ...care(), clockMode: "reference" };
  expect(() => persistence.bootstrap("inject", bad, 0)).toThrow();
  const result = persistence.bootstrap("bootstrap", care(), 0);
  expect(result.state.now).toBe("2026-10-08T01:30:00+08:00");
  expect(result.state.clockMode).toBe("live");
});
it("keeps manual reference time across reads and ordinary writes, then restores actual Singapore time", () => {
  today();
  persistence.bootstrap("controls", care(), 0);
  const command = (type: string, rev: number, extra = {}) =>
    persistence.runCommand("controls", {
      command: { type, ...extra },
      actionId: `action-${rev}`,
      profileId: "p-me",
      expectedRevision: rev,
    });
  const advanced = command("advanceClock", 1);
  expect(advanced.state.clockMode).toBe("reference");
  expect(advanced.state.now).toBe("2026-10-08T01:45:00+08:00");
  vi.setSystemTime(new Date("2026-10-08T04:00:00Z"));
  expect(persistence.snapshot("controls").state.now).toBe(advanced.state.now);
  expect(
    command("setPreference", 2, { key: "genericReminders", value: true }).state
      .clockMode,
  ).toBe("reference");
  const restored = command("restoreClock", 3);
  expect(restored.state.clockMode).toBe("live");
  expect(restored.state.now).toBe("2026-10-08T12:00:00+08:00");
  const scenario = command("scenario", 4, { name: "Unknown benefit" });
  expect(scenario.state.clockMode).toBe("reference");
  expect(command("reset", 5).state.clockMode).toBe("live");
});
it("rejects live past reminder writes using today's server time despite yesterday's persisted now", () => {
  today();
  database.upsertState("past", JSON.stringify(care()));
  expect(() =>
    persistence.runCommand("past", {
      command: {
        type: "createReminder",
        input: {
          profileId: "p-me",
          title: "Past medicine",
          category: "Other",
          scheduledAt: "2026-10-07T20:00:00+08:00",
          recurrence: "None",
          instructions: "",
        },
      },
      actionId: "past",
      profileId: "p-me",
      expectedRevision: 0,
    }),
  ).toThrow();
  expect(database.loadStateRow("past")!.revision).toBe(0);
});
it("AI cannot choose clock mode or invoke manual reference controls", () => {
  for (const type of ["advanceClock", "restoreClock", "scenario", "reset"])
    expect(() =>
      parseCommand({ type, name: "Unknown benefit" }, { aiOnly: true }),
    ).toThrow();
  expect(() =>
    parseCommand(
      {
        type: "setPreference",
        key: "genericReminders",
        value: true,
        clockMode: "reference",
      },
      { aiOnly: true },
    ),
  ).toThrow();
});
it("chooses the future daily occurrence from actual Singapore time when a saved clock is stale", () => {
  today();
  vi.setSystemTime(new Date("2026-10-08T05:19:00Z"));
  const state = care();
  const id = state.reminders[0].id;
  database.upsertState("future", JSON.stringify(state));
  const result = persistence.runCommand("future", {
    command: { type: "setDailyReminderTime", id, time: "05:00" },
    actionId: "future",
    profileId: "p-me",
    expectedRevision: 0,
  });
  expect(result.state.dailyReminderSchedules?.at(-1)).toMatchObject({
    startsOn: "2026-10-09",
    time: "05:00",
  });
  expect(result.state.clockMode).toBe("live");
});
it("restores live time without materializing occurrences at the historical demo clock", () => {
  today();
  const state = care();
  state.reminders = [
    {
      ...state.reminders[0],
      scheduledAt: "2026-09-29T08:00:00+08:00",
      occurrenceDate: "2026-09-29",
    },
  ];
  database.upsertState("restore-history", JSON.stringify(state));
  database.db
    .prepare(
      "UPDATE state_snapshots SET clock_mode='reference' WHERE client_id=?",
    )
    .run("restore-history");
  const restored = persistence.runCommand("restore-history", {
    command: { type: "restoreClock" },
    actionId: "restore",
    profileId: "p-me",
    expectedRevision: 0,
  });
  expect(
    restored.state.reminders.some((r) => r.occurrenceDate === "2026-09-30"),
  ).toBe(false);
  expect(
    restored.state.reminders.some((r) => r.occurrenceDate === "2026-10-08"),
  ).toBe(true);
});
