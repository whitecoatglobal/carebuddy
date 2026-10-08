import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import {
  emptyState,
  execute,
  validateState,
  type State,
} from "care-buddy-shared";

const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-family-"));
let server: Server, base: string, database: typeof import("../backend/src/db");
function care(): State {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.scenario = "public-demo";
  state.now = "2026-12-31T23:55:00+08:00";
  state.benefits = [
    {
      id: "my-plan",
      profileId: "p-me",
      category: "gp",
      status: "Needs confirmation",
      conditions: "Keep my recorded terms",
      source: "Personal note",
      policyDate: null,
    },
  ];
  state.chats = [
    {
      id: "existing-chat",
      profileId: "p-me",
      role: "assistant",
      text: "Your saved chat reply",
      careNavigation: "gp",
      contextId: null,
      timestamp: state.now,
    },
  ];
  return execute(state, {
    type: "createReminder",
    input: {
      profileId: "p-me",
      category: "Other",
      title: "My existing care",
      scheduledAt: "2027-01-01T12:00:00+08:00",
      recurrence: "None",
      instructions: "Keep my instructions",
    },
  });
}
function save(
  id: string,
  state = care(),
  mode: "live" | "reference" = "reference",
) {
  database.upsertState(id, JSON.stringify(state));
  database.db
    .prepare(
      "UPDATE state_snapshots SET revision=7, clock_mode=? WHERE client_id=?",
    )
    .run(mode, id);
}
beforeAll(async () => {
  process.env.DB_DIR = directory;
  database = await import("../backend/src/db");
  save("client-family-existing");
  save("client-family-blocked");
  database.db
    .prepare(
      "UPDATE state_snapshots SET is_visible=0 WHERE client_id='client-family-blocked'",
    )
    .run();
  const { createApp } = await import("../backend/src/app");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  database?.db.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});
async function request(
  clientId: string,
  route = `/api/state/${clientId}`,
  body?: unknown,
  header = clientId,
) {
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "X-CareBuddy-Client-Id": header } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

it("requires browser access before seeding any family profiles", async () => {
  const before = database.loadStateRow("client-family-blocked");
  expect((await request("client-family-blocked")).status).toBe(403);
  expect(
    (
      await request(
        "client-family-existing",
        undefined,
        undefined,
        "client-other",
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("client-family-existing", undefined, undefined, "")).status,
  ).toBe(403);
  expect(database.loadStateRow("client-family-blocked")).toEqual(before);
  expect(
    JSON.parse(database.loadStateRow("client-family-existing")!.stateJson)
      .profiles,
  ).toHaveLength(1);
});

it("upgrades an existing demo once with Mom and Dad while preserving saved care, selection and clock", async () => {
  const before = database.loadStateRow("client-family-existing")!;
  const original = JSON.parse(before.stateJson);
  const response = await request("client-family-existing");
  expect(response.status).toBe(200);
  expect(validateState(response.body.state)).toBe(true);
  const stored = database.loadStateRow("client-family-existing")!;
  const state = JSON.parse(stored.stateJson) as State;
  expect(state.profiles.map((profile) => profile.displayName)).toEqual([
    "Me",
    "Mom",
    "Dad",
  ]);
  expect(state.selectedProfileId).toBe(original.selectedProfileId);
  expect(state.now).toBe(original.now);
  expect(state.chats).toEqual(original.chats);
  expect(
    state.reminders.filter((reminder) => reminder.profileId === "p-me"),
  ).toEqual(original.reminders);
  expect(
    state.benefits.filter((benefit) => benefit.profileId === "p-me"),
  ).toEqual(original.benefits);
  for (const profileId of ["p-demo-mom", "p-demo-dad"]) {
    expect(
      state.reminders.filter((reminder) => reminder.profileId === profileId),
    ).toHaveLength(5);
    expect(
      state.appointments.filter(
        (appointment) => appointment.profileId === profileId,
      ),
    ).toHaveLength(1);
    expect(
      state.benefits.filter((benefit) => benefit.profileId === profileId),
    ).toHaveLength(3);
  }
  expect(state.demoFamilySeeded).toBe(true);
  expect(stored.revision).toBe(before.revision + 1);
  expect(stored.clockMode).toBe("reference");
  await request("client-family-existing");
  expect(database.loadStateRow("client-family-existing")).toEqual(stored);
});

it("uses the current Singapore day for older live demos without changing the stored clock mode", async () => {
  const state = care();
  state.now = "2000-01-01T00:00:00+08:00";
  save("client-family-live", state, "live");
  const response = await request("client-family-live");
  const today = database.liveNow().slice(0, 10);
  expect(
    response.body.state.reminders.some(
      (reminder: State["reminders"][number]) =>
        reminder.profileId === "p-demo-mom" &&
        reminder.occurrenceDate === today,
    ),
  ).toBe(true);
  expect(database.loadStateRow("client-family-live")!.clockMode).toBe("live");
});

it("loads each parent's own health readings through the existing backend API", async () => {
  for (const profileId of ["p-demo-mom", "p-demo-dad"]) {
    const response = await request(
      "client-family-existing",
      `/api/health/vitals?profileId=${profileId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.vitals).toMatchObject({
      profileId,
      systolic: 118,
      diastolic: 76,
      source: "demo",
    });
  }
  expect(
    database.db
      .prepare(
        "SELECT count(*) AS n FROM health_vitals WHERE client_id='client-family-existing'",
      )
      .get(),
  ).toEqual({ n: 2 });
});

it("keeps removed parents removed across subsequent care API reads", async () => {
  save("client-family-remove");
  const seeded = await request("client-family-remove");
  const removed = await request("client-family-remove", "/api/commands", {
    command: { type: "removeDependent", id: "p-demo-mom" },
    actionId: "remove-demo-mom",
    profileId: "p-me",
    expectedRevision: seeded.body.revision,
  });
  expect(removed.status).toBe(200);
  const after = await request("client-family-remove");
  expect(
    after.body.state.profiles.map(
      (profile: State["profiles"][number]) => profile.displayName,
    ),
  ).toEqual(["Me", "Dad"]);
  expect(
    after.body.state.reminders.some(
      (reminder: State["reminders"][number]) =>
        reminder.profileId === "p-demo-mom",
    ),
  ).toBe(false);
  expect(after.body.revision).toBe(removed.body.revision);
});

it("preserves matching existing parents and access settings, and leaves ordinary care untouched", async () => {
  const state = care();
  state.profiles.push(
    {
      id: "existing-mom",
      displayName: "Mom",
      relationship: "Parent",
      canView: false,
      canManage: false,
    },
    {
      id: "existing-dad",
      displayName: "Father",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
  );
  save("client-family-matching", state);
  const response = await request("client-family-matching");
  expect(response.body.state.profiles).toEqual(state.profiles);
  expect(response.body.state.appointments).toEqual([]);
  expect(response.body.state.reminders).toEqual(state.reminders);
  const ordinary = care();
  ordinary.scenario = "user-care";
  save("client-family-ordinary", ordinary);
  const before = database.loadStateRow("client-family-ordinary");
  expect((await request("client-family-ordinary")).body.state.profiles).toEqual(
    ordinary.profiles,
  );
  expect(database.loadStateRow("client-family-ordinary")).toEqual(before);
});
