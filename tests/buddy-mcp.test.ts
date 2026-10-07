import { expect, it } from "vitest";
import { emptyState } from "care-buddy-shared";
import { connectBuddyMcp } from "../backend/src/buddyMcp";
function snapshot(name: string, canManage = true) {
  const s = emptyState();
  s.started = true;
  s.selectedProfileId = "p-me";
  s.profiles = [
    {
      id: "p-me",
      displayName: name,
      relationship: "Self",
      canView: true,
      canManage,
    },
    {
      id: "other-person",
      displayName: "Hidden family member",
      relationship: "Other",
      canView: true,
      canManage: true,
    },
  ];
  s.chats = [
    {
      id: "chat-private",
      profileId: "other-person",
      role: "user",
      text: "Private family conversation",
      createdAt: s.now,
    },
  ];
  return s;
}
it("negotiates real MCP and exposes only selected-person reads and approved proposal tools", async () => {
  const s = snapshot("Alice");
  const mcp = await connectBuddyMcp(s, "Asia/Kuala_Lumpur");
  try {
    const names = (await mcp.client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("read_selected_care");
    expect(names).toContain("createReminder");
    for (const name of [
      "runSql",
      "confirm",
      "deleteAccount",
      "reset",
      "migrate",
      "removeDependent",
    ])
      expect(names).not.toContain(name);
    const data = await mcp.read();
    expect(data.context.profile.displayName).toBe("Alice");
    expect(JSON.stringify(data)).not.toContain("Private family conversation");
    expect(JSON.stringify(data)).not.toContain("Hidden family member");
    await expect(
      mcp.client.callTool({
        name: "read_selected_care",
        arguments: { userId: "bob" },
      }),
    ).rejects.toThrow();
    await expect(
      mcp.client.callTool({
        name: "runSql",
        arguments: { sql: "SELECT * FROM accounts" },
      }),
    ).rejects.toThrow();
  } finally {
    await mcp.close();
  }
});
it("keeps simultaneous account snapshots isolated even with identical local profile IDs", async () => {
  const a = await connectBuddyMcp(snapshot("Alice"));
  const b = await connectBuddyMcp(snapshot("Bob"));
  try {
    expect((await a.read()).context.profile.displayName).toBe("Alice");
    expect((await b.read()).context.profile.displayName).toBe("Bob");
    await expect(
      a.client.callTool({
        name: "read_selected_care",
        arguments: { profileId: "other-person" },
      }),
    ).rejects.toThrow();
    expect((await b.read()).context.profile.displayName).toBe("Bob");
  } finally {
    await a.close();
    await b.close();
  }
});
it("prepares changes through MCP without modifying records and rejects owner/permission overrides", async () => {
  const s = snapshot("Alice");
  const original = structuredClone(s);
  const mcp = await connectBuddyMcp(s);
  const input = {
    profileId: "p-me",
    category: "Bedtime",
    title: "Bedtime reminder",
    scheduledAt: "2099-10-07T22:00:00+08:00",
    recurrence: "Daily",
    instructions: "",
  };
  try {
    expect(
      (await mcp.propose("createReminder", JSON.stringify({ input }))).type,
    ).toBe("createReminder");
    expect(s).toEqual(original);
    await expect(
      mcp.propose(
        "createReminder",
        JSON.stringify({ input: { ...input, profileId: "other-person" } }),
      ),
    ).rejects.toThrow();
    await expect(
      mcp.propose("createReminder", JSON.stringify({ input, ownerId: "bob" })),
    ).rejects.toThrow();
    await expect(
      mcp.propose(
        "updateDependent",
        JSON.stringify({ id: "p-me", input: { canManage: true } }),
      ),
    ).rejects.toThrow();
  } finally {
    await mcp.close();
  }
});
it("read-only profiles have no action tools, including when directly called", async () => {
  const mcp = await connectBuddyMcp(snapshot("Alice", false));
  try {
    expect((await mcp.client.listTools()).tools.map((t) => t.name)).toEqual([
      "read_selected_care",
    ]);
    await expect(
      mcp.client.callTool({
        name: "setPreference",
        arguments: { key: "genericReminders", value: true },
      }),
    ).rejects.toThrow();
  } finally {
    await mcp.close();
  }
});
