import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Server } from "node:http";
let server: Server, base: string, db: any;
let ensureClientState: (id: string) => any,
  upsertState: (id: string, state: string) => unknown;
const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-access-test-"));
beforeAll(async () => {
  process.env.DB_DIR = directory;
  const legacy = new Database(path.join(directory, "care-buddy.db"));
  legacy.exec(
    "CREATE TABLE state_snapshots(client_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL)",
  );
  legacy
    .prepare("INSERT INTO state_snapshots VALUES(?,?,?)")
    .run("client-legacy", '{"existing":"preserved"}', "2026-10-07T00:00:00Z");
  legacy.close();
  const database = await import("../backend/src/db");
  db = database.db;
  ensureClientState = database.ensureClientState;
  upsertState = database.upsertState;
  const { createApp } = await import("../backend/src/app");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  db?.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});
async function request(
  route: string,
  id?: string,
  body?: unknown,
  method?: string,
) {
  const r = await fetch(base + route, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(id ? { "X-CareBuddy-Client-Id": id } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: await r.json(),
    cache: r.headers.get("cache-control"),
  };
}
function approve(id: string) {
  ensureClientState(id);
  db.prepare("UPDATE state_snapshots SET is_visible=1 WHERE client_id=?").run(
    id,
  );
}
it("registers browser ID as blocked without returning care records", async () => {
  const r = await request("/api/access", "client-new");
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ clientId: "client-new", isVisible: false });
  expect(
    db
      .prepare("SELECT is_visible FROM state_snapshots WHERE client_id=?")
      .get("client-new").is_visible,
  ).toBe(0);
  expect((await request("/api/state/client-new", "client-new")).status).toBe(
    403,
  );
});
it("denies missing and unapproved IDs across every care route before creating records", async () => {
  const before = db
    .prepare("SELECT COUNT(*) AS n FROM state_snapshots")
    .get().n;
  const routes = [
    "state",
    "chats",
    "profiles",
    "reminders",
    "appointments",
    "benefits",
    "notifications",
    "activity",
  ];
  for (const route of routes) {
    expect((await request(`/api/${route}/client-denied`)).status).toBe(403);
    expect(
      (await request(`/api/${route}/client-denied`, "client-denied")).status,
    ).toBe(403);
  }
  for (const route of ["/api/buddy/interpret", "/api/health/snapshot"])
    expect(
      (
        await request(route, "client-denied", {
          message: "Hello",
          profileId: "p-me",
          state: {},
        })
      ).status,
    ).toBe(403);
  expect(
    (await request("/api/state/client-denied", "client-denied", {}, "PUT"))
      .status,
  ).toBe(403);
  expect(db.prepare("SELECT COUNT(*) AS n FROM state_snapshots").get().n).toBe(
    before,
  );
});
it("admits the approved browser only for its matching client ID and never lists other IDs", async () => {
  approve("client-alice");
  approve("client-bob");
  const own = await request("/api/state/client-alice", "client-alice");
  expect(own.status).toBe(200);
  expect(own.body.clientId).toBe("client-alice");
  expect(own.cache).toContain("no-store");
  expect((await request("/api/state/client-bob", "client-alice")).status).toBe(
    403,
  );
  expect((await request("/api/state", "client-alice")).body).toEqual({
    clients: ["client-alice"],
  });
  expect(
    (
      await request("/api/buddy/interpret", "client-alice", {
        clientId: "client-bob",
        message: "Hello",
      })
    ).status,
  ).toBe(403);
});
it("does not let state uploads change the access flag and honors revocation immediately", async () => {
  approve("client-revoke");
  const s = ensureClientState("client-revoke");
  expect(
    (
      await request(
        "/api/state/client-revoke",
        "client-revoke",
        { ...s, is_visible: 0 },
        "PUT",
      )
    ).status,
  ).toBe(200);
  expect(
    db
      .prepare("SELECT is_visible FROM state_snapshots WHERE client_id=?")
      .get("client-revoke").is_visible,
  ).toBe(1);
  db.prepare("UPDATE state_snapshots SET is_visible=0 WHERE client_id=?").run(
    "client-revoke",
  );
  expect(
    (await request("/api/state/client-revoke", "client-revoke")).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/state/client-revoke",
        "client-revoke",
        { ...s, is_visible: 1 },
        "PUT",
      )
    ).status,
  ).toBe(403);
});
it("never allows the shared storage-error ID", async () => {
  approve("client-local");
  expect(
    (await request("/api/state/client-local", "client-local")).status,
  ).toBe(403);
  expect((await request("/api/access", "client-local")).status).toBe(400);
});
it("preserves the visibility flag during ordinary database upserts", () => {
  approve("client-upsert");
  upsertState(
    "client-upsert",
    JSON.stringify(ensureClientState("client-upsert")),
  );
  expect(
    db
      .prepare("SELECT is_visible FROM state_snapshots WHERE client_id=?")
      .get("client-upsert").is_visible,
  ).toBe(1);
});
it("keeps non-personal service health public", async () => {
  expect((await request("/api/health")).status).toBe(200);
});

it("adds the visibility column to existing databases without changing saved record JSON", () => {
  const row = db
    .prepare(
      "SELECT state_json,is_visible FROM state_snapshots WHERE client_id=?",
    )
    .get("client-legacy");
  expect(row.state_json).toBe('{"existing":"preserved"}');
  expect(row.is_visible).toBe(0);
});
