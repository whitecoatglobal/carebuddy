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

  it("keeps validated reminder actions and confirmation wording unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: "I already saved your changes" } },
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
