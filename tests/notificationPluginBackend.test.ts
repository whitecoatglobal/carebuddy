import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { emptyState, execute } from "care-buddy-shared";
const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-plugin-"));
let server: HttpServer,
  base: string,
  database: typeof import("../backend/src/db"),
  connections: typeof import("../backend/src/notificationConnections");
let counter = 0;
function save(id: string) {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.now = new Date().toISOString();
  state.demoFamilySeeded = true;
  state.profiles.push(
    {
      id: "mom",
      displayName: "Mom",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
    {
      id: "hidden",
      displayName: "Hidden",
      relationship: "Parent",
      canView: false,
      canManage: false,
    },
  );
  const updated = execute(state, {
    type: "createReminder",
    input: {
      profileId: "p-me",
      category: "Other",
      title: "Current routine",
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      recurrence: "None",
      instructions: "",
    },
  });
  database.upsertState(id, JSON.stringify(updated));
  return updated;
}
function issue(includeHealth = true, profileIds = ["p-me"]) {
  const id = `client-plugin-${++counter}`;
  save(id);
  return {
    ...connections.createConnection(id, {
      target: "codex",
      profileIds,
      includeHealth,
    }),
    clientId: id,
  };
}
async function browser(clientId: string, route: string, body?: unknown) {
  return fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-CareBuddy-Client-Id": clientId,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function client(token: string) {
  const sdk = new Client({ name: "plugin-test", version: "1" });
  await sdk.connect(
    new StreamableHTTPClientTransport(new URL(base + "/api/integrations/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return sdk;
}
async function call(
  sdk: Client,
  name = "get_care_notifications",
  args: Record<string, unknown> = {},
) {
  const result = await sdk.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return {
    result,
    value: result.isError ? content[0].text : JSON.parse(content[0].text),
  };
}
beforeAll(async () => {
  process.env.DB_DIR = directory;
  database = await import("../backend/src/db");
  connections = await import("../backend/src/notificationConnections");
  const { createApp } = await import("../backend/src/app");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  database.db.close();
  delete process.env.DB_DIR;
  rmSync(directory, { recursive: true, force: true });
});
it("downloads personal ZIPs through approved browser access and lists no credentials", async () => {
  const id = "client-plugin-download";
  save(id);
  for (const target of ["codex", "claude"]) {
    const response = await browser(id, "/api/integrations/export", {
      target,
      profileIds: ["p-me", "mom"],
      includeHealth: true,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/zip");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer()).readUInt32LE()).toBe(
      0x04034b50,
    );
  }
  const listed = await (await browser(id, "/api/integrations")).text();
  expect(JSON.parse(listed).connections).toHaveLength(2);
  expect(listed).not.toContain("cbn_");
  expect(listed).not.toContain("token_hash");
  expect(listed).not.toContain(id);
});
it("rejects unapproved browsers and export scopes with hidden or unknown people", async () => {
  expect(
    (await browser("client-missing-plugin", "/api/integrations/export", {}))
      .status,
  ).toBe(403);
  const { clientId } = issue();
  for (const profileIds of [["hidden"], ["other"], [], ["p-me", "p-me"]])
    expect(
      (
        await browser(clientId, "/api/integrations/export", {
          target: "codex",
          profileIds,
          includeHealth: true,
        })
      ).status,
    ).toBe(400);
});
it("rejects malformed export targets and extra scope fields", async () => {
  const { clientId } = issue();
  for (const body of [
    { target: "unknown", profileIds: ["p-me"], includeHealth: true },
    { target: "codex", profileIds: ["p-me"], includeHealth: "true" },
    {
      target: "codex",
      profileIds: ["p-me"],
      includeHealth: true,
      clientId: "client-other",
    },
    {
      target: "codex",
      profileIds: ["p-me"],
      includeHealth: true,
      allProfiles: true,
    },
  ]) {
    expect(
      (await browser(clientId, "/api/integrations/export", body)).status,
    ).not.toBe(200);
  }
});
it("stores only a token hash and limits active personal connections", () => {
  const issued = issue();
  const stored = database.db
    .prepare("SELECT * FROM notification_connections WHERE id=?")
    .get(issued.connection.id);
  expect(JSON.stringify(stored)).not.toContain(issued.token);
  for (let i = 1; i < 5; i++)
    connections.createConnection(issued.clientId, {
      target: "claude",
      profileIds: ["p-me"],
      includeHealth: false,
    });
  expect(() =>
    connections.createConnection(issued.clientId, {
      target: "claude",
      profileIds: ["p-me"],
      includeHealth: false,
    }),
  ).toThrow("five active");
  connections.revokeConnection(issued.clientId, issued.connection.id);
  expect(() =>
    connections.createConnection(issued.clientId, {
      target: "codex",
      profileIds: ["p-me"],
      includeHealth: true,
    }),
  ).not.toThrow();
});
it("keeps active connections visible after many revoked exports", () => {
  const original = issue();
  for (let i = 0; i < 55; i++) {
    const extra = connections.createConnection(original.clientId, {
      target: "claude",
      profileIds: ["p-me"],
      includeHealth: false,
    });
    connections.revokeConnection(original.clientId, extra.connection.id);
  }
  expect(connections.listConnections(original.clientId)).toHaveLength(50);
  expect(connections.listConnections(original.clientId)[0].id).toBe(
    original.connection.id,
  );
});
it("requires a bearer credential rather than a browser ID for the MCP endpoint", async () => {
  const { clientId } = issue();
  expect((await browser(clientId, "/api/integrations/mcp", {})).status).toBe(
    401,
  );
  expect(
    (await fetch(base + "/api/integrations/mcp?token=cbn_fake")).status,
  ).toBe(401);
  expect(
    (
      await fetch(base + "/api/integrations/mcp", {
        headers: { Authorization: "Bearer cbn_fake" },
      })
    ).status,
  ).toBe(401);
});
it("supports SDK initialization, tool listing and real scoped calls over Streamable HTTP", async () => {
  const { token } = issue();
  const sdk = await client(token);
  try {
    expect((await sdk.listTools()).tools.map((t) => t.name)).toEqual([
      "get_care_notifications",
      "acknowledge_notifications",
    ]);
    const { value } = await call(sdk);
    expect(value.profiles.map((p: { name: string }) => p.name)).toEqual(["Me"]);
    expect(value.notifications).toHaveLength(1);
    expect(value.notifications[0].title).toContain("Current routine");
    expect(value.healthAlertsEnabled).toBe(true);
  } finally {
    await sdk.close();
  }
});
it("acknowledges delivery idempotently without changing care or in-app read status", async () => {
  const { token, clientId } = issue();
  const before = database.loadStateRow(clientId),
    sdk = await client(token);
  try {
    const { value } = await call(sdk),
      alertIds = value.notifications.map((a: { id: string }) => a.id);
    expect(
      (await call(sdk, "acknowledge_notifications", { alertIds })).value
        .careRecordsChanged,
    ).toBe(false);
    expect(
      (await call(sdk, "acknowledge_notifications", { alertIds })).result
        .isError,
    ).not.toBe(true);
    expect((await call(sdk)).value.notifications).toEqual([]);
    expect(database.loadStateRow(clientId)).toEqual(before);
  } finally {
    await sdk.close();
  }
});
it("rejects cross-connection acknowledgement and care write tools", async () => {
  const first = issue(),
    second = issue(),
    a = await client(first.token),
    b = await client(second.token);
  try {
    const { value } = await call(a);
    expect(
      (
        await call(b, "acknowledge_notifications", {
          alertIds: [value.notifications[0].id],
        })
      ).result.isError,
    ).toBe(true);
    expect(
      (await call(a, "completeReminder", { id: "r1" })).result.isError,
    ).toBe(true);
    expect(
      (await call(a, "get_care_notifications", { profileId: "mom" })).result
        .isError,
    ).toBe(true);
  } finally {
    await a.close();
    await b.close();
  }
});
it("keeps delivery state separate for independently exported connections", async () => {
  const first = issue(),
    second = connections.createConnection(first.clientId, {
      target: "claude",
      profileIds: ["p-me"],
      includeHealth: false,
    });
  const a = await client(first.token),
    b = await client(second.token);
  try {
    const { value } = await call(a);
    await call(a, "acknowledge_notifications", {
      alertIds: value.notifications.map((n: { id: string }) => n.id),
    });
    expect((await call(b)).value.notifications).toHaveLength(1);
  } finally {
    await a.close();
    await b.close();
  }
});
it("reads new database health values and applies the export's health opt-in", async () => {
  const first = issue(),
    sdk = await client(first.token);
  try {
    await call(sdk);
    database.db
      .prepare(
        "UPDATE health_vitals SET temperature_c=38.5 WHERE client_id=? AND profile_id='p-me'",
      )
      .run(first.clientId);
    const { value } = await call(sdk);
    expect(
      value.notifications.some((n: { kind: string }) => n.kind === "health"),
    ).toBe(true);
    expect(
      value.notifications.find((n: { kind: string }) => n.kind === "health")
        .source,
    ).toBe("demo");
    const other = connections.createConnection(first.clientId, {
      target: "claude",
      profileIds: ["p-me"],
      includeHealth: false,
    });
    const second = await client(other.token);
    try {
      expect(
        (await call(second)).value.notifications.some(
          (n: { kind: string }) => n.kind === "health",
        ),
      ).toBe(false);
    } finally {
      await second.close();
    }
  } finally {
    await sdk.close();
  }
});
it("rechecks family view access after export", async () => {
  const issued = issue(true, ["p-me", "mom"]),
    sdk = await client(issued.token);
  try {
    const state = JSON.parse(database.loadStateRow(issued.clientId)!.stateJson);
    state.profiles.find((p: { id: string }) => p.id === "mom").canView = false;
    database.upsertState(issued.clientId, JSON.stringify(state));
    expect(
      (await call(sdk)).value.profiles.map((p: { name: string }) => p.name),
    ).toEqual(["Me"]);
  } finally {
    await sdk.close();
  }
});
it("reports an unavailable connection when all its profiles lose view access", async () => {
  const issued = issue(),
    sdk = await client(issued.token);
  try {
    const state = JSON.parse(database.loadStateRow(issued.clientId)!.stateJson);
    const person = state.profiles.find((p: { id: string }) => p.id === "p-me");
    person.canView = false;
    person.canManage = false;
    database.upsertState(issued.clientId, JSON.stringify(state));
    const result = await call(sdk);
    expect(result.result.isError).toBe(true);
    expect(result.value).toContain("no longer available");
  } finally {
    await sdk.close();
  }
});
it("revokes only the current browser's connection and rejects later MCP calls", async () => {
  const first = issue(),
    other = issue();
  expect(
    (
      await browser(
        other.clientId,
        `/api/integrations/${first.connection.id}/revoke`,
        {},
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await browser(
        first.clientId,
        `/api/integrations/${first.connection.id}/revoke`,
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await browser(
        first.clientId,
        `/api/integrations/${first.connection.id}/revoke`,
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(base + "/api/integrations/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${first.token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(401);
});
it("blocks expired credentials and browser-wide revocation", async () => {
  const expired = issue(),
    hidden = issue();
  database.db
    .prepare(
      "UPDATE notification_connections SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    )
    .run(expired.connection.id);
  database.db
    .prepare("UPDATE state_snapshots SET is_visible=0 WHERE client_id=?")
    .run(hidden.clientId);
  for (const issued of [expired, hidden])
    expect(
      connections.authenticateConnection(`Bearer ${issued.token}`),
    ).toBeNull();
});
it("rejects browser-origin use, streaming GET and private API access with only a plugin token", async () => {
  const { token, clientId } = issue();
  expect(
    (
      await fetch(base + "/api/integrations/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(base + "/api/integrations/mcp", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(405);
  expect(
    (
      await fetch(base + `/api/state/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(403);
});
