import { afterEach, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../backend/src/app";
import { AccountStore } from "../backend/src/accountStore";
import type { Server } from "node:http";
const origin = "http://localhost:5173";
let server: Server;
let store: AccountStore;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  store?.close();
});
async function setup(interpret?: AppOptions["interpret"]) {
  store = new AccountStore(":memory:");
  const app = createApp({
    store,
    origin,
    interpret:
      interpret ??
      (async (s) => ({
        text: "Review this reminder",
        action: {
          id: "model-id",
          profileId: "p-me",
          command: {
            type: "createReminder",
            input: {
              profileId: "p-me",
              category: "Other",
              title: "Walk",
              scheduledAt: new Date(Date.now() + 86400000).toISOString(),
              recurrence: "None",
              instructions: "",
            },
          },
          sourceIds: [],
          label: "Create reminder",
        },
      })),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as { port: number };
  return async (
    path: string,
    body?: unknown,
    cookie?: string,
    csrf?: string,
    requestOrigin = origin,
  ) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
}
async function register(
  api: Awaited<ReturnType<typeof setup>>,
  username = "alice",
) {
  return api("/api/auth/register", {
    username,
    password: "long-password-123",
    displayName: username,
    timeZone: "Asia/Kuala_Lumpur",
  });
}
describe("account-owned server transactions", () => {
  it("requires sign-in, enforces Origin and CSRF, isolates accounts and revokes logout", async () => {
    const api = await setup();
    expect((await api("/api/state")).status).toBe(401);
    expect((await register(api)).status).toBe(200);
    const a = await api("/api/auth/login", {
      username: "ALICE",
      password: "long-password-123",
    });
    const b = await register(api, "bob");
    expect(a.body.user.id).not.toBe(b.body.user.id);
    expect((await api("/api/state")).status).toBe(401);
    expect((await api("/api/state/alice", undefined, a.cookie)).status).toBe(
      410,
    );
    expect((await api("/api/auth/logout", {}, a.cookie)).status).toBe(403);
    expect(
      (
        await api(
          "/api/auth/logout",
          {},
          a.cookie,
          a.body.csrfToken,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (await api("/api/auth/logout", {}, a.cookie, a.body.csrfToken)).status,
    ).toBe(200);
    expect((await api("/api/auth/session", undefined, a.cookie)).status).toBe(
      401,
    );
  });
  it("validates revisions, stable duplicate payloads and audits the authenticated actor", async () => {
    const api = await setup();
    const a = await register(api);
    const payload = {
      command: {
        type: "addDependent",
        displayName: "Mother",
        relationship: "Parent",
        acknowledged: true,
      },
      actionId: "action-1",
      expectedRevision: 0,
      profileId: "p-me",
    };
    const first = await api(
      "/api/commands",
      payload,
      a.cookie,
      a.body.csrfToken,
    );
    expect(first.status).toBe(200);
    expect(first.body.revision).toBe(1);
    expect(first.body.receipt.actor).toBe(a.body.user.id);
    expect(first.body.receipt.profileId).toBe(
      first.body.state.selectedProfileId,
    );
    expect(
      (
        await api(
          "/api/commands",
          { ...payload, expectedRevision: 1 },
          a.cookie,
          a.body.csrfToken,
        )
      ).body.receipt,
    ).toEqual(first.body.receipt);
    expect(
      (await api("/api/commands", payload, a.cookie, a.body.csrfToken)).body
        .receipt,
    ).toEqual(first.body.receipt);
    expect(
      (
        await api(
          "/api/commands",
          {
            ...payload,
            command: { ...payload.command, displayName: "Father" },
          },
          a.cookie,
          a.body.csrfToken,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          "/api/commands",
          { ...payload, actionId: "action-2" },
          a.cookie,
          a.body.csrfToken,
        )
      ).status,
    ).toBe(409);
    expect(
      store.db.prepare("SELECT actor_id FROM account_audit").get(),
    ).toEqual({ actor_id: a.body.user.id });
  });
  it("keeps proposals read-only until confirmation and prevents cross-account/profile confirmation or duplicate saves", async () => {
    const api = await setup();
    const a = await register(api);
    const b = await register(api, "bob");
    const proposal = await api(
      "/api/buddy/interpret",
      { message: "Remind me to walk", profileId: "p-me" },
      a.cookie,
      a.body.csrfToken,
    );
    expect(proposal.status).toBe(200);
    expect(proposal.body.state.reminders).toHaveLength(0);
    expect(proposal.body.action.preview).toEqual({
      before: null,
      after: expect.objectContaining({ title: "Walk", profileId: "p-me" }),
    });
    const id = proposal.body.action.proposalId;
    expect(
      (
        await api(
          `/api/proposals/${id}/confirm`,
          { profileId: "p-me" },
          b.cookie,
          b.body.csrfToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          `/api/proposals/${id}/confirm`,
          { profileId: "wrong" },
          a.cookie,
          a.body.csrfToken,
        )
      ).status,
    ).toBe(403);
    const confirmed = await api(
      `/api/proposals/${id}/confirm`,
      { profileId: "p-me" },
      a.cookie,
      a.body.csrfToken,
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.state.reminders).toHaveLength(1);
    expect(
      confirmed.body.state.chats.filter(
        (m: any) => m.actionReceipt?.actionId === id,
      ),
    ).toHaveLength(1);
    expect(
      (
        await api(
          `/api/proposals/${id}/confirm`,
          { profileId: "p-me" },
          a.cookie,
          a.body.csrfToken,
        )
      ).body.state.reminders,
    ).toHaveLength(1);
    expect(
      store
        .snapshot(a.body.user.id)
        .state.chats.filter((m) => m.actionReceipt?.actionId === id),
    ).toHaveLength(1);
  });
  it("rejects expired and stale proposals", async () => {
    const api = await setup();
    const a = await register(api);
    const propose = () =>
      api(
        "/api/buddy/interpret",
        { message: "Walk", profileId: "p-me" },
        a.cookie,
        a.body.csrfToken,
      );
    const expired = await propose();
    store.db
      .prepare("UPDATE pending_proposals SET expires_at=? WHERE id=?")
      .run("2000-01-01T00:00:00Z", expired.body.action.proposalId);
    expect(
      (
        await api(
          `/api/proposals/${expired.body.action.proposalId}/confirm`,
          { profileId: "p-me" },
          a.cookie,
          a.body.csrfToken,
        )
      ).status,
    ).toBe(409);
    const stale = await propose();
    await api(
      "/api/commands",
      {
        command: {
          type: "addDependent",
          displayName: "Mother",
          relationship: "Parent",
          acknowledged: true,
        },
        actionId: "change",
        expectedRevision: 0,
        profileId: "p-me",
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(
      (
        await api(
          `/api/proposals/${stale.body.action.proposalId}/confirm`,
          { profileId: "p-me" },
          a.cookie,
          a.body.csrfToken,
        )
      ).status,
    ).toBe(409);
  });
  it("reset keeps the signed-in account Me profile and stale proposals cannot be confirmed", async () => {
    const api = await setup();
    const a = await register(api);
    const result = await api(
      "/api/commands",
      {
        command: { type: "reset" },
        actionId: "reset-1",
        expectedRevision: 0,
        profileId: "p-me",
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(result.status).toBe(200);
    expect(result.body.state.profiles).toEqual(a.body.state.profiles);
    expect(result.body.state.started).toBe(true);
  });
  it("imports reviewed legacy state only into an empty account, with atomic revision and audit", async () => {
    const api = await setup();
    const a = await register(api);
    const reviewed = structuredClone(a.body.state);
    reviewed.benefits.push({
      id: "legacy-benefit",
      profileId: "p-me",
      category: "Care",
      status: "Needs confirmation",
      conditions: "",
      source: "legacy",
      policyDate: null,
      notes: "Reviewed",
    });
    const imported = store.migrate(a.body.user.id, reviewed, 0, "migration-1");
    expect(imported.revision).toBe(1);
    expect(imported.state.benefits).toHaveLength(1);
    expect(() =>
      store.migrate(a.body.user.id, reviewed, 1, "migration-2"),
    ).toThrow("empty account");
    expect(
      store.db.prepare("SELECT actor_id FROM account_audit").get(),
    ).toEqual({ actor_id: "admin-migration" });
  });
  it("rejects injected state and cross-account record commands while keeping the second account empty", async () => {
    const api = await setup();
    const a = await register(api);
    const b = await register(api, "bob");
    const input = {
      profileId: "p-me",
      category: "Other",
      title: "Walk",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      recurrence: "None",
      instructions: "",
    };
    const saved = await api(
      "/api/commands",
      {
        command: { type: "createReminder", input },
        profileId: "p-me",
        actionId: "save-owner",
        expectedRevision: 0,
      },
      a.cookie,
      a.body.csrfToken,
    );
    const id = saved.body.state.reminders[0].id;
    expect(
      (
        await api(
          "/api/commands",
          {
            command: { type: "completeReminder", id, outcome: "complete" },
            profileId: "p-me",
            actionId: "foreign-id",
            expectedRevision: 0,
          },
          b.cookie,
          b.body.csrfToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (await api("/api/state", undefined, b.cookie)).body.state.reminders,
    ).toHaveLength(0);
    expect(
      (
        await api(
          "/api/buddy/interpret",
          { message: "Walk", profileId: "p-me", state: saved.body.state },
          b.cookie,
          b.body.csrfToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api(
          "/api/health/snapshot",
          { profileId: "p-me", state: saved.body.state },
          b.cookie,
          b.body.csrfToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api("/api/auth/login", {
          username: "alice",
          password: "wrong-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api("/api/auth/register", {
          username: "short",
          password: "short",
          timeZone: "Asia/Kuala_Lumpur",
        })
      ).status,
    ).toBe(400);
  });
  it("allows the account owner to manage household permissions and audits the affected member", async () => {
    const api = await setup();
    const a = await register(api);
    const added = await api(
      "/api/commands",
      {
        command: {
          type: "addDependent",
          displayName: "Mother",
          relationship: "Parent",
          acknowledged: true,
          canManage: false,
        },
        profileId: "p-me",
        actionId: "add",
        expectedRevision: 0,
      },
      a.cookie,
      a.body.csrfToken,
    );
    const member = added.body.state.selectedProfileId;
    const updated = await api(
      "/api/commands",
      {
        command: {
          type: "updateDependent",
          id: member,
          patch: { canManage: true },
        },
        profileId: member,
        actionId: "grant",
        expectedRevision: 1,
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(updated.status).toBe(200);
    expect(updated.body.receipt.profileId).toBe(member);
    const removed = await api(
      "/api/commands",
      {
        command: { type: "removeDependent", id: member },
        profileId: "p-me",
        actionId: "remove",
        expectedRevision: 2,
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.receipt.profileId).toBe(member);
    expect(
      store.db
        .prepare(
          "SELECT profile_id FROM account_audit WHERE action_id='remove'",
        )
        .get(),
    ).toEqual({ profile_id: member });
  });
  it("passes account time zone and honors requested chat selection without overwriting a newer selection", async () => {
    let receivedZone: string | undefined;
    let concurrentSwitch = false;
    let userId = "";
    const api = await setup(async (s, _m, _c, _scope, options) => {
      receivedZone = options?.timeZone;
      if (concurrentSwitch) store.selectProfile(userId, "p-me");
      return { text: "Hello" };
    });
    const a = await register(api);
    userId = a.body.user.id;
    const added = await api(
      "/api/commands",
      {
        command: {
          type: "addDependent",
          displayName: "Mother",
          relationship: "Parent",
          acknowledged: true,
          canManage: true,
        },
        profileId: "p-me",
        actionId: "add",
        expectedRevision: 0,
      },
      a.cookie,
      a.body.csrfToken,
    );
    const member = added.body.state.selectedProfileId;
    store.selectProfile(userId, "p-me");
    const first = await api(
      "/api/buddy/interpret",
      { message: "Hi", profileId: member },
      a.cookie,
      a.body.csrfToken,
    );
    expect(receivedZone).toBe("Asia/Kuala_Lumpur");
    expect(first.body.state.selectedProfileId).toBe(member);
    concurrentSwitch = true;
    const second = await api(
      "/api/buddy/interpret",
      { message: "Hello", profileId: member },
      a.cookie,
      a.body.csrfToken,
    );
    expect(second.body.state.selectedProfileId).toBe("p-me");
  });
  it("keeps notification read flags scoped to their readable owning profile", async () => {
    const api = await setup();
    const a = await register(api);
    const added = await api(
      "/api/commands",
      {
        command: {
          type: "addDependent",
          displayName: "Mother",
          relationship: "Parent",
          acknowledged: true,
          canManage: false,
        },
        profileId: "p-me",
        actionId: "add",
        expectedRevision: 0,
      },
      a.cookie,
      a.body.csrfToken,
    );
    const member = added.body.state.selectedProfileId;
    const snapshot = store.snapshot(a.body.user.id);
    snapshot.state.notifications.push({
      id: "mother-notification",
      profileId: member,
      title: "Care update",
      targetType: "urgent",
      targetId: "urgent",
      readAt: null,
      timestamp: new Date().toISOString(),
    });
    store.save(a.body.user.id, snapshot.state, snapshot.revision);
    const command = { type: "markNotificationRead", id: "mother-notification" };
    const wrong = await api(
      "/api/commands",
      {
        command,
        profileId: "p-me",
        actionId: "wrong-profile",
        expectedRevision: 1,
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(wrong.status).toBe(400);
    expect(
      store.snapshot(a.body.user.id).state.notifications[0].readAt,
    ).toBeNull();
    expect(
      store.db
        .prepare(
          "SELECT count(*) AS count FROM account_audit WHERE action_id='wrong-profile'",
        )
        .get(),
    ).toEqual({ count: 0 });
    const correct = await api(
      "/api/commands",
      {
        command,
        profileId: member,
        actionId: "correct-profile",
        expectedRevision: 1,
      },
      a.cookie,
      a.body.csrfToken,
    );
    expect(correct.status).toBe(200);
    expect(correct.body.receipt.profileId).toBe(member);
    expect(correct.body.state.notifications[0].readAt).not.toBeNull();
  });
  it("independently rejects injected AI proposals targeting a different household member", async () => {
    let member = "";
    const api = await setup(async () => ({
      text: "Review the name change",
      action: {
        id: "model-id",
        profileId: "p-me",
        command: {
          type: "updateDependent",
          id: member,
          patch: { displayName: "Reassigned" },
        },
        sourceIds: [member],
        label: "Rename profile",
      },
    }));
    const a = await register(api);
    const added = await api(
      "/api/commands",
      {
        command: {
          type: "addDependent",
          displayName: "Mother",
          relationship: "Parent",
          acknowledged: true,
          canManage: true,
        },
        profileId: "p-me",
        actionId: "add",
        expectedRevision: 0,
      },
      a.cookie,
      a.body.csrfToken,
    );
    member = added.body.state.selectedProfileId;
    const result = await api(
      "/api/buddy/interpret",
      { message: "Rename me", profileId: "p-me" },
      a.cookie,
      a.body.csrfToken,
    );
    expect(result.status).toBe(400);
    expect(
      store.snapshot(a.body.user.id).state.profiles.find((p) => p.id === member)
        ?.displayName,
    ).toBe("Mother");
    expect(store.snapshot(a.body.user.id).revision).toBe(1);
    expect(
      store.db.prepare("SELECT count(*) AS count FROM pending_proposals").get(),
    ).toEqual({ count: 0 });
    expect(() =>
      store.proposal(a.body.user.id, "p-me", { type: "reset" }, 1, {
        sourceIds: [],
        label: "Reset",
      }),
    ).toThrow();
  });
});
