import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import { interpretBuddyMessage } from "../backend/src/interpret";
const input = {
  profileId: "p-me",
  category: "Bedtime",
  title: "Bedtime reminder",
  scheduledAt: "2099-10-07T22:00:00+08:00",
  recurrence: "Daily",
  instructions: "",
};
function state() {
  const s = emptyState();
  s.started = true;
  s.selectedProfileId = "p-me";
  s.profiles = [
    {
      id: "p-me",
      displayName: "Me",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
  ];
  return s;
}
function provider(name: string, args: unknown) {
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: { name, arguments: JSON.stringify(args) },
                  },
                ],
              },
            },
          ],
        }),
      ),
  );
  vi.stubGlobal("fetch", transport);
  return transport;
}
beforeEach(() => {
  vi.stubEnv("TOKENHUB_API_KEY", "test-only");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "deepseek/deepseek-flash");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("turns an AI tool call into a validated read-only reminder proposal", async () => {
  const transport = provider("createReminder", { input });
  const s = state();
  const reply = await interpretBuddyMessage(
    s,
    "Create a daily bedtime reminder at 10 pm on 7 October 2099",
  );
  expect(reply.action?.command).toEqual({ type: "createReminder", input });
  expect(reply.text).toContain("Review");
  expect(s.reminders).toEqual([]);
  const options = transport.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(options[1].body as string).tools.length).toBeGreaterThan(0);
});
it("rejects an AI tool targeting another person's record", async () => {
  provider("createReminder", {
    input: { ...input, profileId: "someone-else" },
  });
  await expect(
    interpretBuddyMessage(state(), "Add reminder"),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects invented SQL tools and permission-changing arguments", async () => {
  provider("runSql", { sql: "DELETE FROM accounts" });
  await expect(
    interpretBuddyMessage(state(), "Add reminder"),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects multi-action output so each proposal can be reviewed independently", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "a",
                      type: "function",
                      function: {
                        name: "createReminder",
                        arguments: JSON.stringify({ input }),
                      },
                    },
                    {
                      id: "b",
                      type: "function",
                      function: {
                        name: "createReminder",
                        arguments: JSON.stringify({ input }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
    ),
  );
  await expect(
    interpretBuddyMessage(state(), "Make changes"),
  ).rejects.toMatchObject({ status: 502 });
});
it("uses conversation history for a follow-up time without writing before confirmation", async () => {
  provider("createReminder", { input });
  const s = state();
  s.chats = [
    {
      id: "u1",
      profileId: "p-me",
      role: "user",
      text: "Create a bedtime reminder",
      contextId: null,
      timestamp: s.now,
    },
    {
      id: "a1",
      profileId: "p-me",
      role: "assistant",
      text: "What time should I use?",
      contextId: null,
      timestamp: s.now,
    },
  ];
  const reply = await interpretBuddyMessage(
    s,
    "10 pm every day, starting 7 October 2099",
  );
  expect(reply.action?.command.type).toBe("createReminder");
  expect(s.reminders).toHaveLength(0);
});
