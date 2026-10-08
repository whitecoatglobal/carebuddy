import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Server } from "node:http";
import { emptyState, execute, type HealthVitals } from "care-buddy-shared";

const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-vitals-"));
let server: Server, base: string, database: typeof import("../backend/src/db");
const original = '{"existing":"preserved"}';

function care() {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.profiles.push(
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
  return state;
}
beforeAll(async () => {
  process.env.DB_DIR = directory;
  const legacy = new Database(path.join(directory, "care-buddy.db"));
  legacy.exec(`CREATE TABLE state_snapshots (
    client_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    is_visible INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 0,
    clock_mode TEXT NOT NULL DEFAULT 'live')`);
  legacy
    .prepare("INSERT INTO state_snapshots VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      "client-preserved",
      original,
      "2026-10-01T00:00:00Z",
      0,
      9,
      "reference",
    );
  legacy.close();
  database = await import("../backend/src/db");
  for (const id of [
    "client-vitals-a",
    "client-vitals-b",
    "client-vitals-blocked",
  ])
    database.upsertState(id, JSON.stringify(care()));
  database.db
    .prepare("UPDATE state_snapshots SET is_visible=0 WHERE client_id=?")
    .run("client-vitals-blocked");
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
async function request(query: string, clientId?: string) {
  const response = await fetch(base + "/api/health/vitals" + query, {
    headers: clientId ? { "X-CareBuddy-Client-Id": clientId } : {},
  });
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
  };
}
function count() {
  return (
    database.db.prepare("SELECT COUNT(*) AS n FROM health_vitals").get() as {
      n: number;
    }
  ).n;
}

it("adds health storage without changing existing care records, clock, revision or visibility", () => {
  expect(
    database.db
      .prepare("SELECT * FROM state_snapshots WHERE client_id=?")
      .get("client-preserved"),
  ).toEqual({
    client_id: "client-preserved",
    state_json: original,
    updated_at: "2026-10-01T00:00:00Z",
    is_visible: 0,
    revision: 9,
    clock_mode: "reference",
  });
  expect(count()).toBe(0);
});
it("seeds an owned profile once and returns the persisted readings with no-store", async () => {
  const before = database.loadStateRow("client-vitals-a");
  const result = await request("?profileId=p-me", "client-vitals-a");
  expect(result.status).toBe(200);
  expect(result.cache).toContain("no-store");
  expect(result.body.vitals).toMatchObject({
    profileId: "p-me",
    systolic: 118,
    diastolic: 76,
    pulseBpm: 72,
    temperatureC: 36.7,
    oxygenPercent: 98,
    breathingPerMinute: 16,
    source: "demo",
  });
  expect(Number.isFinite(Date.parse(result.body.vitals.updatedAt))).toBe(true);
  expect((await request("?profileId=p-me", "client-vitals-a")).body).toEqual(
    result.body,
  );
  expect(count()).toBe(1);
  expect(database.loadStateRow("client-vitals-a")).toEqual(before);
});
it("returns database changes without reseeding values or timestamps", async () => {
  const timestamp = "2026-10-08T06:30:00Z";
  database.db
    .prepare(
      `UPDATE health_vitals SET pulse_bpm=84, temperature_c=37.1,
    updated_at=? WHERE client_id=? AND profile_id=?`,
    )
    .run(timestamp, "client-vitals-a", "p-me");
  const result = await request("?profileId=p-me", "client-vitals-a");
  expect(result.body.vitals).toMatchObject({
    pulseBpm: 84,
    temperatureC: 37.1,
    updatedAt: timestamp,
  });
  expect((await request("?profileId=p-me", "client-vitals-a")).body).toEqual(
    result.body,
  );
  const reopened = new Database(path.join(directory, "care-buddy.db"), {
    readonly: true,
  });
  expect(
    reopened
      .prepare(
        "SELECT pulse_bpm, temperature_c, updated_at FROM health_vitals WHERE client_id=? AND profile_id=?",
      )
      .get("client-vitals-a", "p-me"),
  ).toEqual({ pulse_bpm: 84, temperature_c: 37.1, updated_at: timestamp });
  reopened.close();
});
it("separates matching profile IDs across browsers and different care profiles", async () => {
  const other = await request("?profileId=p-me", "client-vitals-b");
  const family = await request("?profileId=p-mum", "client-vitals-a");
  expect(other.body.vitals.pulseBpm).toBe(72);
  expect(family.body.vitals.pulseBpm).toBe(72);
  expect(
    (await request("?profileId=p-me", "client-vitals-a")).body.vitals.pulseBpm,
  ).toBe(84);
  expect(family.body.vitals.profileId).toBe("p-mum");
  expect(other.body.vitals).not.toHaveProperty("clientId");
});
it("denies missing, unregistered, blocked and revoked browsers before accessing health rows", async () => {
  const before = count();
  for (const id of [
    undefined,
    "client-vitals-unknown",
    "client-vitals-blocked",
  ])
    expect((await request("?profileId=p-me", id)).status).toBe(403);
  database.db
    .prepare("UPDATE state_snapshots SET is_visible=0 WHERE client_id=?")
    .run("client-vitals-b");
  expect((await request("?profileId=p-me", "client-vitals-b")).status).toBe(
    403,
  );
  expect(count()).toBe(before);
});
it("rejects invisible, missing and removed profiles without exposing or seeding their readings", async () => {
  const before = count();
  for (const profile of ["p-hidden", "p-foreign", "not-a-profile"])
    expect(
      (await request("?profileId=" + profile, "client-vitals-a")).status,
    ).toBe(400);
  const state = care();
  state.profiles = state.profiles.filter((profile) => profile.id !== "p-mum");
  database.upsertState("client-vitals-a", JSON.stringify(state));
  expect((await request("?profileId=p-mum", "client-vitals-a")).status).toBe(
    400,
  );
  expect(count()).toBe(before);
});
it("rejects extra context and invalid profile parameters", async () => {
  const before = count();
  for (const query of [
    "",
    "?profileId=",
    "?profileId=p-me&clientId=client-vitals-b",
    "?profileId=p-me&profileId=p-mum",
  ])
    expect((await request(query, "client-vitals-a")).status).toBe(400);
  expect(count()).toBe(before);
});
