import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyState, execute } from "care-buddy-shared";
import { connectBuddyMcp } from "../backend/src/buddyMcp";
import { commandFromTool, AI_TOOL_DEFINITIONS } from "../backend/src/commands";
import { interpretBuddyMessage } from "../backend/src/interpret";

function care() {
  let state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Person",
    acknowledged: true,
  });
  state.now = "2026-10-08T04:00:00+08:00";
  state = execute(state, {
    type: "createReminder",
    input: {
      profileId: "p-me",
      category: "Medication",
      title: "Morning med reminder",
      scheduledAt: "2026-10-08T08:00:00+08:00",
      recurrence: "Daily",
      instructions: "Follow clinician directions; one prescribed tablet",
    },
  });
  state.now = "2026-10-08T13:19:00+08:00";
  return state;
}
const directory = mkdtempSync(path.join(tmpdir(), "buddy-daily-time-"));
let persistence: typeof import("../backend/src/persistence"),
  database: typeof import("../backend/src/db");
beforeAll(async () => {
  process.env.DB_DIR = directory;
  persistence = await import("../backend/src/persistence");
  database = await import("../backend/src/db");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  database.db.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});

it("exposes a strict daily time tool without replacement reminder fields", () => {
  const command = commandFromTool(
    "setDailyReminderTime",
    JSON.stringify({ id: "exact", time: "05:00" }),
  );
  expect(command).toEqual({
    type: "setDailyReminderTime",
    id: "exact",
    time: "05:00",
  });
  const tool = AI_TOOL_DEFINITIONS.find(
    (tool) => tool.function.name === "setDailyReminderTime",
  )!;
  expect(Object.keys(tool.function.parameters.properties!)).toEqual([
    "id",
    "time",
    "startDate",
  ]);
  for (const time of ["24:00", "05:60", "5:00"])
    expect(() =>
      commandFromTool(
        "setDailyReminderTime",
        JSON.stringify({ id: "exact", time }),
      ),
    ).toThrow();
  expect(() =>
    commandFromTool(
      "setDailyReminderTime",
      JSON.stringify({ id: "exact", time: "05:00", startDate: "2026-02-30" }),
    ),
  ).toThrow();
});
it.each([
  ["2026-10-08T13:19:00+08:00", "2026-10-09"],
  ["2026-10-08T04:59:00+08:00", "2026-10-08"],
])("normalizes the next future daily date at %s", async (now, startDate) => {
  const state = care();
  state.now = now;
  const mcp = await connectBuddyMcp(state, "Asia/Singapore");
  try {
    expect(
      await mcp.propose(
        "setDailyReminderTime",
        JSON.stringify({ id: state.reminders[0].id, time: "05:00" }),
      ),
    ).toEqual({
      type: "setDailyReminderTime",
      id: state.reminders[0].id,
      time: "05:00",
      startDate,
    });
  } finally {
    await mcp.close();
  }
});
it("returns safe business validation for an explicitly elapsed daily time", async () => {
  const state = care();
  const mcp = await connectBuddyMcp(state);
  try {
    await expect(
      mcp.propose(
        "setDailyReminderTime",
        JSON.stringify({
          id: state.reminders[0].id,
          time: "05:00",
          startDate: "2026-10-08",
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Choose a time after the current reference time",
    });
  } finally {
    await mcp.close();
  }
});
it("keeps an exact source through model normalization, autonomous saving and request replay", async () => {
  const state = care(),
    id = state.reminders[0].id,
    original = structuredClone(state.reminders[0]);
  state.chats = [
    {
      id: "ask",
      profileId: "p-me",
      role: "user",
      text: "Change my morning medication reminder to 5 AM daily",
      contextId: null,
      timestamp: state.now,
    },
    {
      id: "clarify",
      profileId: "p-me",
      role: "assistant",
      text: "Set Morning med reminder to 5 AM daily?",
      contextId: null,
      timestamp: state.now,
    },
  ];
  vi.stubEnv("TOKENHUB_API_KEY", "fake");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "test");
  const provider = vi.fn(async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    expect(
      body.tools.some(
        (tool: any) => tool.function.name === "setDailyReminderTime",
      ),
    ).toBe(true);
    expect(body.messages.at(-1).content).toBe("yes");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "setDailyReminderTime",
                    arguments: JSON.stringify({ id, time: "05:00" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  });
  vi.stubGlobal("fetch", provider);
  const result = await interpretBuddyMessage(state, "yes");
  expect(result.action?.sourceIds).toEqual([id]);
  expect(result.action?.command).toMatchObject({ startDate: "2026-10-09" });
  database.ensureClientState("daily-save");
  persistence.bootstrap("daily-save", state, 0);
  // This test deliberately evaluates the 8 Oct reference-time boundary.
  database.db
    .prepare(
      "UPDATE state_snapshots SET state_json=?, clock_mode='reference' WHERE client_id=?",
    )
    .run(JSON.stringify(state), "daily-save");
  const saved = persistence.persistBuddy(
    "daily-save",
    "p-me",
    "yes",
    result,
    1,
    "daily-request",
    "payload",
  );
  expect(saved.operationStatus).toBe("saved");
  expect(saved.text).toContain("5am daily starting 9 Oct 2026");
  expect(saved.state.reminders.find((r: any) => r.id === id)).toEqual(original);
  expect(
    saved.state.reminders.some(
      (r: any) =>
        r.scheduledAt === "2026-10-09T05:00:00+08:00" &&
        r.instructions === original.instructions &&
        r.seriesId === original.seriesId,
    ),
  ).toBe(true);
  const replay = persistence.persistBuddy(
    "daily-save",
    "p-me",
    "yes",
    result,
    1,
    "daily-request",
    "payload",
  );
  expect(replay.text).toBe(saved.text);
  expect(replay.revision).toBe(saved.revision);
  expect(replay.state.reminders).toEqual(saved.state.reminders);
});

it("keeps an explicit future starting date and rejects a foreign exact reminder ID", async () => {
  const state = care();
  state.profiles.push({
    id: "foreign-profile",
    displayName: "Other",
    relationship: "Other",
    canView: true,
    canManage: true,
  });
  state.reminders.push({
    ...structuredClone(state.reminders[0]),
    id: "foreign-reminder",
    profileId: "foreign-profile",
  });
  const mcp = await connectBuddyMcp(state);
  try {
    expect(
      await mcp.propose(
        "setDailyReminderTime",
        JSON.stringify({
          id: state.reminders[0].id,
          time: "05:00",
          startDate: "2026-10-12",
        }),
      ),
    ).toMatchObject({ startDate: "2026-10-12" });
    await expect(
      mcp.propose(
        "setDailyReminderTime",
        JSON.stringify({ id: "foreign-reminder", time: "05:00" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  } finally {
    await mcp.close();
  }
});
