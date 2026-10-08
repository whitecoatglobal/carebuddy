import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "care-buddy-shared";
import { interpretBuddyMessage } from "../backend/src/interpret";

function state() {
  const s = emptyState();
  s.started = true;
  s.selectedProfileId = "qa-self";
  s.profiles = [
    {
      id: "qa-self",
      displayName: "Test person",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
    {
      id: "qa-other",
      displayName: "PRIVATE_OTHER_PERSON",
      relationship: "Other",
      canView: true,
      canManage: false,
    },
  ];
  s.chats = [
    {
      id: "other-chat",
      profileId: "qa-other",
      role: "user",
      text: "PRIVATE_OTHER_CHAT",
      contextId: null,
      timestamp: s.now,
    },
  ];
  return s;
}

beforeEach(() => {
  vi.stubEnv("TOKENHUB_API_KEY", "test-key-not-real");
  vi.stubEnv("TOKENHUB_BASE_URL", "https://tokenhub.example/v1");
  vi.stubEnv("TOKENHUB_MODEL", "deepseek/deepseek-flash");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Buddy TokenHub", () => {
  it("lists appointments without proposing an unwanted preparation reminder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content:
                      "**Dental cleaning**\n\n- Tomorrow at 11:30 am\n- Harbour Dental Studio",
                  },
                },
              ],
            }),
          ),
      ),
    );
    const s = state();
    s.now = "2026-10-07T09:00:00+08:00";
    s.appointments = [
      {
        id: "qa-dental",
        profileId: "qa-self",
        category: "Dental",
        title: "Dental cleaning",
        startsAt: "2026-10-08T11:30:00+08:00",
        locationLabel: "Harbour Dental Studio",
        checklist: [false, false, false],
        recordOrigin: "demo",
        providerConfirmed: false,
        provenanceHistory: [],
      },
    ];
    const reply = await interpretBuddyMessage(
      s,
      "Show my upcoming appointments.",
    );
    expect(reply.action).toBeUndefined();
    expect(reply.text).toContain("**Dental cleaning**");
  });

  it("still proposes preparation when the user explicitly requests it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        type: "function",
                        function: {
                          name: "createReminder",
                          arguments: JSON.stringify({
                            input: {
                              profileId: "qa-self",
                              category: "Appointment preparation",
                              title: "Prepare dental visit",
                              scheduledAt: "2026-10-08T10:30:00+08:00",
                              recurrence: "None",
                              instructions: "Bring your appointment details",
                              appointmentId: "qa-dental",
                            },
                          }),
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
    const s = state();
    s.now = "2026-10-07T09:00:00+08:00";
    s.appointments = [
      {
        id: "qa-dental",
        profileId: "qa-self",
        category: "Dental",
        title: "Dental cleaning",
        startsAt: "2026-10-08T11:30:00+08:00",
        locationLabel: "Harbour Dental Studio",
        checklist: [false, false, false],
        recordOrigin: "demo",
        providerConfirmed: false,
        provenanceHistory: [],
      },
    ];
    const reply = await interpretBuddyMessage(s, "Prepare for my appointment");
    expect(reply.action?.command.type).toBe("createReminder");
  });
  it("uses the configured model and sends only the selected profile's context", async () => {
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: "AI response for your care records" } },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", transport);
    const s = state();
    const reply = await interpretBuddyMessage(s, "Help me organise my day");
    expect(reply.text).toBe("AI response for your care records");
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://tokenhub.example/v1/chat/completions");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-key-not-real",
    });
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("deepseek/deepseek-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages.at(-1)).toEqual({
      role: "user",
      content: "Help me organise my day",
    });
    expect(options.body).not.toContain("PRIVATE_OTHER");
    expect(options.body).not.toContain("test-key-not-real");
    expect(s.appliedActions).toEqual([]);
  });

  it.each(["TOKENHUB_API_KEY", "TOKENHUB_BASE_URL", "TOKENHUB_MODEL"])(
    "requires %s without making a provider request",
    async (key) => {
      vi.stubEnv(key, "");
      const transport = vi.fn();
      vi.stubGlobal("fetch", transport);
      await expect(
        Promise.resolve().then(() => interpretBuddyMessage(state(), "Hello")),
      ).rejects.toMatchObject({ status: 503, code: "AI_NOT_CONFIGURED" });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("validates real MCP reminder tool calls and prepares a validated command for automatic persistence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "I already saved your changes",
                    tool_calls: [
                      {
                        type: "function",
                        function: {
                          name: "createReminder",
                          arguments: JSON.stringify({
                            input: {
                              profileId: "qa-self",
                              category: "Bedtime",
                              title: "Bedtime reminder",
                              scheduledAt: "2099-10-08T22:00:00+08:00",
                              recurrence: "None",
                              instructions: "",
                            },
                          }),
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
    const s = state();
    const reply = await interpretBuddyMessage(
      s,
      "Create a bedtime reminder at 10pm",
    );
    expect(reply.action?.command.type).toBe("createReminder");
    expect(reply.text).not.toContain("already saved");
    expect(reply.text).not.toMatch(/review|confirm/i);
    expect(s.reminders).toEqual([]);
  });

  it("does not transmit care records while the app is in driving mode", async () => {
    const s = state();
    s.carMode = "driving";
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const reply = await interpretBuddyMessage(s, "What is next today?");
    expect(reply.text).toContain("Available when parked");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects context belonging to another profile", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(
      interpretBuddyMessage(state(), "Hello", "other-record"),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CONTEXT" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a non-HTTPS endpoint before transmitting the API key", async () => {
    vi.stubEnv("TOKENHUB_BASE_URL", "http://tokenhub.example/v1");
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(interpretBuddyMessage(state(), "Hello")).rejects.toMatchObject(
      { status: 503 },
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects provider errors without exposing their body or credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("provider-debug test-key-not-real", { status: 401 }),
      ),
    );
    await expect(
      Promise.resolve().then(() => interpretBuddyMessage(state(), "Hello")),
    ).rejects.toMatchObject({
      status: 502,
      code: "AI_PROVIDER_ERROR",
      message:
        "Buddy's AI provider could not complete the request. Please try again later.",
    });
  });

  it.each([
    {},
    { choices: [{ message: { content: "" } }] },
    {
      choices: [
        { finish_reason: "length", message: { content: "Incomplete" } },
      ],
    },
  ])("rejects an unusable provider response", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body))),
    );
    await expect(
      Promise.resolve().then(() => interpretBuddyMessage(state(), "Hello")),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("reports a timed-out request without using a local canned reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Timeout", "TimeoutError");
      }),
    );
    await expect(
      Promise.resolve().then(() => interpretBuddyMessage(state(), "Hello")),
    ).rejects.toMatchObject({ status: 504, code: "AI_TIMEOUT" });
  });

  it("rejects a profile the caller cannot view before sending context", async () => {
    const s = state();
    s.profiles[0].canView = false;
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(
      Promise.resolve().then(() => interpretBuddyMessage(s, "Hello")),
    ).rejects.toMatchObject({ status: 400 });
    expect(transport).not.toHaveBeenCalled();
  });
});

it.each(["deleteReminder", "reset", "createAppointment", "removeDependent"])(
  "rejects unsupported model tool %s before producing an action",
  async (name) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      { type: "function", function: { name, arguments: "{}" } },
                    ],
                  },
                },
              ],
            }),
          ),
      ),
    );
    await expect(
      interpretBuddyMessage(state(), "Make that change"),
    ).rejects.toMatchObject({ status: 400 });
  },
);
it("rejects MCP proposal that names another profile despite provider-visible selected context", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "createReminder",
                        arguments: JSON.stringify({
                          input: {
                            profileId: "qa-other",
                            category: "Other",
                            title: "Foreign reminder",
                            scheduledAt: "2099-10-08T10:00:00+08:00",
                            recurrence: "None",
                            instructions: "",
                          },
                        }),
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
    interpretBuddyMessage(state(), "Create reminder"),
  ).rejects.toMatchObject({ status: 400 });
});

it.each([
  "I saved the reminder for tonight.",
  "I've updated your bedtime reminder.",
  "Done — your reminder has been created.",
  "Saved your changes.",
  "The reminder was saved.",
  "Done — your reminder is now set for tomorrow.",
  "我已经保存了提醒。",
])(
  "does not report an unexecuted provider operation as saved: %s",
  async (text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: text } }] }),
          ),
      ),
    );
    const reply = await interpretBuddyMessage(
      state(),
      "Create a bedtime reminder",
    );
    expect(reply.action).toBeUndefined();
    expect(reply.text).toBe(
      "No change has been saved yet. Please describe the change so I can save it.",
    );
  },
);
it("preserves truthful information about existing saved records", async () => {
  const text =
    "Your saved reminder is scheduled for 10 pm. Would you like to change it?";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: text } }] }),
        ),
    ),
  );
  expect(
    (await interpretBuddyMessage(state(), "What is in my saved records?")).text,
  ).toBe(text);
});

it("does not transmit browser access IDs from server audit fields to the provider", async () => {
  const browserId = "client-private-audit-owner";
  const s = state();
  s.reminders = [
    {
      id: "audited-reminder",
      profileId: "qa-self",
      category: "Other",
      title: "Existing reminder",
      scheduledAt: "2099-10-08T10:00:00+08:00",
      notificationSnoozedUntil: null,
      recurrence: "None",
      seriesId: null,
      occurrenceDate: "2099-10-08",
      instructions: "Read book",
      appointmentId: null,
      outcome: "complete",
      completedAt: s.now,
      recordedBy: browserId,
      recordedAt: s.now,
      occurrenceOverride: false,
      deletedAt: null,
      history: [
        {
          id: "audit-history",
          subject: "qa-self",
          actor: browserId,
          text: "Reminder complete",
          at: s.now,
        },
      ],
    },
  ];
  s.appointments = [
    {
      id: "audited-appointment",
      profileId: "qa-self",
      category: "Dental",
      title: "Dental appointment",
      startsAt: "2099-10-08T11:00:00+08:00",
      locationLabel: "Clinic",
      checklist: [false, false, false],
      recordOrigin: "user-saved",
      providerConfirmed: false,
      provenanceHistory: [
        {
          id: "appointment-audit",
          subject: "qa-self",
          actor: browserId,
          text: "Appointment changed",
          at: s.now,
        },
      ],
    },
  ];
  const transport = vi.fn(async (_url, options) => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "Your saved reminder is complete." } }],
      }),
    );
  });
  vi.stubGlobal("fetch", transport);
  await interpretBuddyMessage(s, "Read my care records");
  const providerBody = transport.mock.calls[0][1].body;
  expect(providerBody).not.toContain(browserId);
  expect(providerBody).toContain("audited-reminder");
  expect(providerBody).toContain('\\"outcome\\":\\"complete\\"');
  expect(providerBody).toContain("recordedAt");
  expect(s.reminders[0].recordedBy).toBe(browserId);
  expect(s.reminders[0].history[0].actor).toBe(browserId);
  expect(s.appointments[0].provenanceHistory[0].actor).toBe(browserId);
});
