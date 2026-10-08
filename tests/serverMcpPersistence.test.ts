import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Server } from "node:http";
import { emptyState, execute } from "care-buddy-shared";
let server: Server, base: string, db: any;
const directory = mkdtempSync(path.join(tmpdir(), "buddy-mcp-server-"));
const realFetch = globalThis.fetch;
beforeAll(async () => {
  process.env.DB_DIR = directory;
  const legacy = new Database(path.join(directory, "care-buddy.db"));
  legacy.exec(
    "CREATE TABLE pending_proposals(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,profile_id TEXT,command_json TEXT,revision INTEGER,expires_at TEXT,status TEXT,metadata_json TEXT); INSERT INTO pending_proposals VALUES('legacy-proposal','legacy-owner','legacy-profile','{}',1,'2099-01-01','pending','{}')",
  );
  legacy.close();
  db = (await import("../backend/src/db")).db;
  server = (await import("../backend/src/app"))
    .createApp()
    .listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});
async function req(route: string, id: string, body?: unknown, method?: string) {
  if (
    route === "/api/buddy/interpret" &&
    body &&
    typeof body === "object" &&
    !("requestId" in body)
  )
    body = { ...body, requestId: randomUUID() };
  const r = await realFetch(base + route, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      "X-CareBuddy-Client-Id": id,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.text().then((t) => {
      try {
        return JSON.parse(t);
      } catch {
        return { error: t };
      }
    }),
  };
}
async function init(id: string) {
  await req("/api/access", id);
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Person",
    acknowledged: true,
  });
  return req(`/api/state/${id}/bootstrap`, id, { state, expectedRevision: 0 });
}
const reminder = {
  type: "createReminder",
  input: {
    profileId: "p-me",
    category: "Other",
    title: "Read book",
    scheduledAt: "2099-10-10T10:00:00+08:00",
    recurrence: "None",
    instructions: "",
  },
};
it("bootstraps once, disables overwrite, validates and atomically deduplicates revisioned commands", async () => {
  const id = "client-transactions";
  const first = await init(id);
  expect(first.status).toBe(200);
  expect(first.body.revision).toBe(1);
  expect((await init(id)).status).toBe(409);
  expect((await req(`/api/state/${id}`, id, emptyState(), "PUT")).status).toBe(
    405,
  );
  const body = {
    command: reminder,
    actionId: "action-1",
    profileId: "p-me",
    expectedRevision: 1,
  };
  const save = await req("/api/commands", id, body);
  expect(save.status).toBe(200);
  expect(save.body.state.reminders).toHaveLength(1);
  expect(save.body.revision).toBe(2);
  const retry = await req("/api/commands", id, body);
  expect(retry.status).toBe(200);
  expect(retry.body.state.reminders).toHaveLength(1);
  expect(retry.body.revision).toBe(2);
  expect(
    (await req("/api/commands", id, { ...body, actionId: "stale" })).status,
  ).toBe(409);
  expect(
    (
      await req("/api/commands", id, {
        ...body,
        actionId: "bad",
        expectedRevision: 2,
        command: { ...reminder, owner: "foreign" },
      })
    ).status,
  ).toBe(400);
});
it("MCP commands save automatically and deduplicate requests with server receipts", async () => {
  expect(
    db
      .prepare("SELECT owner_id FROM pending_proposals WHERE id=?")
      .get("legacy-proposal").owner_id,
  ).toBe("legacy-owner");
  const a = "client-mcp-a",
    b = "client-mcp-b";
  await init(a);
  await init(b);
  vi.stubEnv("TOKENHUB_API_KEY", "fake");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "test");
  const provider = vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    expect(
      body.tools.some((t: any) => t.function.name === "createReminder"),
    ).toBe(true);
    expect(
      body.tools.some((t: any) =>
        [
          "reset",
          "deleteReminder",
          "removeDependent",
          "createAppointment",
        ].includes(t.function.name),
      ),
    ).toBe(false);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "createReminder",
                    arguments: JSON.stringify({ input: reminder.input }),
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
  const request = {
    message: "Remind me to read",
    profileId: "p-me",
    requestId: "auto-read",
  };
  const reply = await req("/api/buddy/interpret", a, request);
  expect(reply.status).toBe(200);
  expect(reply.body.state.reminders).toHaveLength(1);
  expect(reply.body.action).toBeUndefined();
  expect(reply.body.operationStatus).toBe("saved");
  expect(reply.body.revision).toBe(2);
  const receipt = reply.body.state.chats.at(-1).actionReceipt;
  expect(receipt).toMatchObject({
    actor: a,
    confirmation: false,
    authorization: "chat_request",
    outcome: "Saved",
  });
  expect(reply.body.state.appliedActions).toContain(receipt.actionId);
  expect(reply.body.state.chats).toHaveLength(2);
  expect(reply.body.text).toContain("10am");
  expect(reply.body.text).not.toMatch(/review|confirm/i);
  expect(
    db
      .prepare(
        "SELECT count(*) AS n FROM browser_pending_proposals WHERE client_id=?",
      )
      .get(a).n,
  ).toBe(0);
  const repeat = await req("/api/buddy/interpret", a, request);
  expect(repeat.body.state.chats).toHaveLength(2);
  expect(repeat.body.state.reminders).toHaveLength(1);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(
    (
      await req("/api/buddy/interpret", a, {
        ...request,
        message: "Another request",
      })
    ).status,
  ).toBe(409);
  expect(provider).toHaveBeenCalledTimes(1);
  await req("/api/commands", a, {
    command: { type: "setPreference", key: "spokenReminders", value: true },
    actionId: "later-change",
    profileId: "p-me",
    expectedRevision: 2,
  });
  const laterRepeat = await req("/api/buddy/interpret", a, request);
  expect(laterRepeat.body.revision).toBe(3);
  expect(laterRepeat.body.text).toBe(reply.body.text);
  expect(laterRepeat.body.state.chats).toHaveLength(2);
  expect(provider).toHaveBeenCalledTimes(1);
  const confirmed = reply;
  const foreignId = confirmed.body.state.reminders[0].id;
  expect(
    (
      await req("/api/commands", b, {
        command: {
          type: "completeReminder",
          id: foreignId,
          outcome: "complete",
        },
        actionId: "foreign",
        profileId: "p-me",
        expectedRevision: 1,
      })
    ).status,
  ).toBe(400);
  expect((await req(`/api/state/${a}`, b)).status).toBe(403);
  expect(
    (
      await req("/api/buddy/interpret", a, {
        message: "overwrite",
        profileId: "p-me",
        state: emptyState(),
      })
    ).status,
  ).toBe(400);
});
it("rejects forged assistant chats and keeps selection and user chats at business revision", async () => {
  const id = "client-chat";
  await init(id);
  const message = {
    id: "chat-id",
    profileId: "p-me",
    role: "assistant",
    text: "Saved!",
    contextId: null,
    timestamp: "2000-01-01T00:00:00Z",
  };
  const envelope = {
    command: { type: "chatMessage", message },
    actionId: "chat-action",
    profileId: "p-me",
    expectedRevision: 1,
  };
  expect((await req("/api/commands", id, envelope)).status).toBe(400);
  const saved = await req("/api/commands", id, {
    ...envelope,
    command: { type: "chatMessage", message: { ...message, role: "user" } },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.revision).toBe(1);
  expect(saved.body.state.chats[0].timestamp).not.toBe(message.timestamp);
});
it("rejects expired and stale proposals without altering records", async () => {
  const id = "client-stale";
  await init(id);
  const seed = (proposalId: string, expiresAt: string) =>
    db
      .prepare(
        "INSERT INTO browser_pending_proposals(id,client_id,profile_id,command_json,label,revision,expires_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        proposalId,
        id,
        "p-me",
        JSON.stringify(reminder),
        "Read book",
        1,
        expiresAt,
      );
  seed("expired", "2000-01-01");
  seed("stale", "2099-01-01");
  expect(
    (await req("/api/proposals/expired/confirm", id, { profileId: "p-me" }))
      .status,
  ).toBe(409);
  expect(
    (
      await req("/api/proposals/stale/confirm", "client-mcp-b", {
        profileId: "p-me",
      })
    ).status,
  ).toBe(404);
  expect(
    (await req("/api/proposals/stale/confirm", id, { profileId: "other" }))
      .status,
  ).toBe(409);
  await req("/api/commands", id, {
    command: { type: "setPreference", key: "spokenReminders", value: true },
    actionId: "change-pref",
    profileId: "p-me",
    expectedRevision: 1,
  });
  expect(
    (
      await req("/api/proposals/stale/confirm", id, {
        profileId: "p-me",
      })
    ).status,
  ).toBe(409);
  expect((await req(`/api/state/${id}`, id)).body.state.reminders).toHaveLength(
    0,
  );
});
it("offers no write tools to view-only profile and never echoes provider save claims", async () => {
  const id = "client-view";
  await init(id);
  const add = await req("/api/commands", id, {
    command: {
      type: "addDependent",
      displayName: "Leo",
      relationship: "Child",
      acknowledged: true,
    },
    profileId: "p-me",
    actionId: "add-view",
    expectedRevision: 1,
  });
  const profileId = add.body.state.selectedProfileId;
  vi.stubEnv("TOKENHUB_API_KEY", "fake");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).tools).toBeUndefined();
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "I saved the new reminder" } }],
        }),
      );
    }),
  );
  const reply = await req("/api/buddy/interpret", id, {
    message: "Save a reminder",
    profileId,
  });
  expect(reply.status).toBe(200);
  expect(reply.body.action).toBeUndefined();
  expect(reply.body.operationStatus).toBe("not_changed");
  expect(reply.body.state.chats.at(-1).operationStatus).toBe("not_changed");
  expect(reply.body.text).not.toContain("I saved");
  expect(reply.body.text).toContain("cannot save");
});
it("stamps care audit actor and confirmation receipt on the server", async () => {
  const id = "client-audit";
  await init(id);
  const saved = await req("/api/commands", id, {
    command: reminder,
    actionId: "audit-create",
    profileId: "p-me",
    expectedRevision: 1,
  });
  expect(saved.body.state.reminders[0].history[0].actor).toBe(id);
  const completed = await req("/api/commands", id, {
    command: {
      type: "completeReminder",
      id: saved.body.state.reminders[0].id,
      outcome: "complete",
    },
    actionId: "audit-complete",
    profileId: "p-me",
    expectedRevision: 2,
  });
  expect(completed.body.state.reminders[0].recordedBy).toBe(id);
});
it("permits ordinary family permission administration from the selected view-only profile", async () => {
  const id = "client-family-admin";
  await init(id);
  const add = await req("/api/commands", id, {
    command: {
      type: "addDependent",
      displayName: "Child",
      relationship: "Child",
      acknowledged: true,
    },
    profileId: "p-me",
    actionId: "child",
    expectedRevision: 1,
  });
  const profileId = add.body.state.selectedProfileId;
  const updated = await req("/api/commands", id, {
    command: {
      type: "updateDependent",
      id: profileId,
      patch: { canManage: true },
    },
    profileId,
    actionId: "grant-manage",
    expectedRevision: 2,
  });
  expect(updated.status).toBe(200);
  expect(
    updated.body.state.profiles.find((p: any) => p.id === profileId).canManage,
  ).toBe(true);
});
it("creates the first own profile through an ordinary validated command", async () => {
  const id = "client-create-self";
  await req("/api/access", id);
  const saved = await req("/api/commands", id, {
    command: {
      type: "createSelfProfile",
      displayName: "First name",
      acknowledged: true,
    },
    profileId: "",
    actionId: "setup",
    expectedRevision: 0,
  });
  expect(saved.status).toBe(200);
  expect(saved.body.revision).toBe(1);
  expect(saved.body.state.profiles[0].displayName).toBe("First name");
});
it("health context accepts only an owned viewable profile and rejects browser state", async () => {
  const id = "client-health-owner";
  await init(id);
  expect(
    (await req("/api/health/snapshot", id, { profileId: "foreign-profile" }))
      .status,
  ).toBe(400);
  expect(
    (
      await req("/api/health/snapshot", id, {
        profileId: "p-me",
        state: emptyState(),
      })
    ).status,
  ).toBe(400);
});
it("preserves malformed saved snapshots and returns a controlled error without replacement", async () => {
  const id = "client-malformed";
  await req("/api/access", id);
  const corrupted = "{original invalid care data";
  db.prepare("UPDATE state_snapshots SET state_json=? WHERE client_id=?").run(
    corrupted,
    id,
  );
  const get = await req(`/api/state/${id}`, id);
  expect(get.status).toBe(500);
  expect(get.body).toEqual({
    error: "Care data could not be saved. Please try again.",
  });
  expect(
    (
      await req("/api/buddy/interpret", id, {
        message: "Hello",
        profileId: "p-me",
      })
    ).status,
  ).toBe(500);
  expect(
    db
      .prepare("SELECT state_json FROM state_snapshots WHERE client_id=?")
      .get(id).state_json,
  ).toBe(corrupted);
});

it("every no-tool reply has server-owned not-changed status despite unrecognized model wording", async () => {
  const id = "client-plain-status";
  await init(id);
  vi.stubEnv("TOKENHUB_API_KEY", "fake");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "Your requested adjustment is in place." },
              },
            ],
          }),
        ),
    ),
  );
  const reply = await req("/api/buddy/interpret", id, {
    message: "Set my reminder",
    profileId: "p-me",
  });
  expect(reply.status).toBe(200);
  expect(reply.body.operationStatus).toBe("not_changed");
  expect(reply.body.state.chats.at(-1).operationStatus).toBe("not_changed");
  expect(reply.body.state.reminders).toHaveLength(0);
  expect(
    (
      await req("/api/commands", id, {
        command: {
          type: "chatMessage",
          message: {
            id: "forged-status",
            profileId: "p-me",
            role: "user",
            text: "Save",
            contextId: null,
            timestamp: "2026-10-08",
            operationStatus: "saved",
          },
        },
        actionId: "forged-status",
        profileId: "p-me",
        expectedRevision: 1,
      })
    ).status,
  ).toBe(400);
});

it("requires a request ID before contacting Buddy", async () => {
  const id = "client-required-id";
  await init(id);
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  expect(
    (
      await req("/api/buddy/interpret", id, {
        requestId: "",
        message: "Hello",
        profileId: "p-me",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await req("/api/buddy/interpret", id, {
        requestId: undefined,
        message: "Hello",
        profileId: "p-me",
      })
    ).status,
  ).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});

it("concurrent identical Buddy requests save exactly once after both model calls", async () => {
  const id = "client-concurrent";
  await init(id);
  vi.stubEnv("TOKENHUB_API_KEY", "fake");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "test");
  let release!: () => void;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const provider = vi.fn(async () => {
    if (++calls === 2) release();
    await bothArrived;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "createReminder",
                    arguments: JSON.stringify({ input: reminder.input }),
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
  const request = {
    requestId: "same-concurrent-id",
    message: "Read book at 10am",
    profileId: "p-me",
  };
  const results = await Promise.all([
    req("/api/buddy/interpret", id, request),
    req("/api/buddy/interpret", id, request),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(results[0].body.actionReceipt.actionId).toBe(
    results[1].body.actionReceipt.actionId,
  );
  const stored = await req(`/api/state/${id}`, id);
  expect(stored.body.revision).toBe(2);
  expect(stored.body.state.reminders).toHaveLength(1);
  expect(stored.body.state.chats).toHaveLength(2);
  expect(provider).toHaveBeenCalledTimes(2);
});

it("rolls back the care command and both chats if request persistence fails", async () => {
  const id = "client-rollback";
  await init(id);
  const { persistBuddy } = await import("../backend/src/persistence");
  db.exec(
    "CREATE TRIGGER fail_buddy_request BEFORE INSERT ON browser_buddy_requests WHEN NEW.client_id='client-rollback' BEGIN SELECT RAISE(ABORT, 'test save failure'); END",
  );
  try {
    expect(() =>
      persistBuddy(
        id,
        "p-me",
        "Read",
        {
          text: "Ignore",
          action: {
            id: "rollback-action",
            profileId: "p-me",
            label: "Read",
            command: reminder as any,
          },
        },
        1,
        "rollback-request",
        "fingerprint",
      ),
    ).toThrow("test save failure");
    const stored = await req(`/api/state/${id}`, id);
    expect(stored.body.revision).toBe(1);
    expect(stored.body.state.reminders).toHaveLength(0);
    expect(stored.body.state.chats).toHaveLength(0);
    expect((await req(`/api/chats/${id}`, id)).body.chats).toHaveLength(0);
  } finally {
    db.exec("DROP TRIGGER fail_buddy_request");
  }
});

it("legacy pending proposals can still be confirmed once with review receipt", async () => {
  const id = "client-legacy-confirm";
  await init(id);
  db.prepare(
    "INSERT INTO browser_pending_proposals(id,client_id,profile_id,command_json,label,revision,expires_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    "legacy-valid",
    id,
    "p-me",
    JSON.stringify(reminder),
    "Read book",
    1,
    "2099-01-01",
  );
  const saved = await req("/api/proposals/legacy-valid/confirm", id, {
    profileId: "p-me",
  });
  expect(saved.status).toBe(200);
  expect(saved.body.state.chats.at(-1).actionReceipt.confirmation).toBe(true);
  const replay = await req("/api/proposals/legacy-valid/confirm", id, {
    profileId: "p-me",
  });
  expect(replay.body.revision).toBe(2);
  expect(replay.body.state.reminders).toHaveLength(1);
  expect(replay.body.state.chats).toHaveLength(1);
});

it("Buddy request IDs are scoped to the browser and stale inference cannot save", async () => {
  const { persistBuddy } = await import("../backend/src/persistence");
  const a = "client-scoped-request-a",
    b = "client-scoped-request-b";
  await init(a);
  await init(b);
  const result = { text: "No changes needed." };
  expect(
    persistBuddy(a, "p-me", "Hello", result, 1, "same-browser-id", "payload")
      .operationStatus,
  ).toBe("not_changed");
  expect(
    persistBuddy(
      b,
      "p-me",
      "Different",
      result,
      1,
      "same-browser-id",
      "different-payload",
    ).operationStatus,
  ).toBe("not_changed");
  await req("/api/commands", a, {
    command: { type: "setPreference", key: "spokenReminders", value: true },
    actionId: "stale-inference-change",
    profileId: "p-me",
    expectedRevision: 1,
  });
  expect(() =>
    persistBuddy(
      a,
      "p-me",
      "Read",
      {
        text: "Ignore",
        action: {
          id: "stale-action",
          profileId: "p-me",
          label: "Read",
          command: reminder as any,
        },
      },
      1,
      "stale-request",
      "payload",
    ),
  ).toThrow("Care data changed while Buddy was replying");
  const stored = await req(`/api/state/${a}`, a);
  expect(stored.body.state.reminders).toHaveLength(0);
  expect(stored.body.state.chats).toHaveLength(2);
  expect(
    db
      .prepare(
        "SELECT count(*) AS n FROM browser_buddy_requests WHERE client_id=? AND request_id=?",
      )
      .get(a, "stale-request").n,
  ).toBe(0);
});
