import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { emptyState, execute, type State } from "care-buddy-shared";

const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-benefits-"));
let server: Server, base: string, database: typeof import("../backend/src/db");
function care(): State {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.scenario = "public-demo";
  state.demoFamilySeeded = true;
  return state;
}
beforeAll(async () => {
  process.env.DB_DIR = directory;
  database = await import("../backend/src/db");
  for (const id of [
    "client-benefits-a",
    "client-benefits-b",
    "client-benefits-blocked",
  ])
    database.upsertState(id, JSON.stringify(care()));
  database.db
    .prepare(
      "UPDATE state_snapshots SET is_visible=0, revision=7, clock_mode='reference' WHERE client_id='client-benefits-blocked'",
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
async function read(clientId: string, header = clientId) {
  const response = await fetch(`${base}/api/state/${clientId}`, {
    headers: header ? { "X-CareBuddy-Client-Id": header } : {},
  });
  return { status: response.status, body: await response.json() };
}
it("requires browser access before any demo benefits are added", async () => {
  const before = database.loadStateRow("client-benefits-blocked");
  expect((await read("client-benefits-blocked")).status).toBe(403);
  expect((await read("client-benefits-a", "client-benefits-b")).status).toBe(
    403,
  );
  expect((await read("client-benefits-a", "")).status).toBe(403);
  expect(database.loadStateRow("client-benefits-blocked")).toEqual(before);
  expect(
    JSON.parse(database.loadStateRow("client-benefits-a")!.stateJson).benefits,
  ).toEqual([]);
});
it("persists demo benefits once through the care API and preserves all other stored care data", async () => {
  const before = database.loadStateRow("client-benefits-a")!;
  const response = await read("client-benefits-a");
  expect(response.status).toBe(200);
  const stored = database.loadStateRow("client-benefits-a")!;
  const state = JSON.parse(stored.stateJson);
  expect(state.benefits).toEqual(response.body.state.benefits);
  expect(state.benefits).toHaveLength(3);
  expect({ ...state, benefits: [] }).toEqual(JSON.parse(before.stateJson));
  expect(stored.revision).toBe(before.revision + 1);
  expect(stored.clockMode).toBe(before.clockMode);
  await read("client-benefits-a");
  expect(database.loadStateRow("client-benefits-a")).toEqual(stored);
});
it("uses persisted usage values and keeps browsers with the same profile ID separate", async () => {
  const state = JSON.parse(
    database.loadStateRow("client-benefits-a")!.stateJson,
  );
  state.benefits[0].usage.usedAmount = 200;
  database.db
    .prepare(
      "UPDATE state_snapshots SET state_json=? WHERE client_id='client-benefits-a'",
    )
    .run(JSON.stringify(state));
  expect(
    (await read("client-benefits-a")).body.state.benefits[0].usage.usedAmount,
  ).toBe(200);
  expect(
    (await read("client-benefits-b")).body.state.benefits[0].usage.usedAmount,
  ).toBe(80);
});
it("keeps ordinary care and existing benefit notes while populating an empty visible demo profile", async () => {
  const ordinary = care();
  ordinary.scenario = "user-care";
  database.upsertState("client-benefits-ordinary", JSON.stringify(ordinary));
  expect((await read("client-benefits-ordinary")).body.state.benefits).toEqual(
    [],
  );
  const demo = care();
  demo.benefits = [
    {
      id: "personal-note",
      profileId: "p-me",
      category: "gp",
      status: "Needs confirmation",
      conditions: "Recorded terms",
      source: "User note",
      policyDate: null,
    },
  ];
  demo.profiles.push(
    {
      id: "p-mum",
      displayName: "Mum",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
    {
      id: "p-hidden",
      displayName: "Hidden",
      relationship: "Other",
      canView: false,
      canManage: false,
    },
  );
  database.upsertState("client-benefits-profile", JSON.stringify(demo));
  const benefits = (await read("client-benefits-profile")).body.state
    .benefits as State["benefits"];
  expect(benefits.filter((benefit) => benefit.profileId === "p-me")).toEqual(
    demo.benefits,
  );
  expect(
    benefits.filter((benefit) => benefit.profileId === "p-mum"),
  ).toHaveLength(3);
  expect(benefits.some((benefit) => benefit.profileId === "p-hidden")).toBe(
    false,
  );
});
