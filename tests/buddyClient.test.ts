import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("surfaces the backend's unconfigured AI error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "AI_NOT_CONFIGURED",
            error:
              "Buddy AI is not configured. Add the TokenHub settings on the server.",
          }),
          { status: 503 },
        ),
    ),
  );
  const { interpretBuddyMessage } = await import("../src/buddyClient");
  await expect(interpretBuddyMessage("p-me", "Hello")).rejects.toThrow(
    "Buddy AI is not configured",
  );
});

it("reports an unreachable backend instead of returning a local reply", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("network detail");
    }),
  );
  const { interpretBuddyMessage } = await import("../src/buddyClient");
  await expect(interpretBuddyMessage("p-me", "Hello")).rejects.toThrow(
    "Could not reach Buddy",
  );
});

it("requires a backend configuration", async () => {
  vi.stubEnv("VITE_BUDDY_BACKEND_URL", "");
  const { interpretBuddyMessage } = await import("../src/buddyClient");
  await expect(interpretBuddyMessage("p-me", "Hello")).rejects.toThrow(
    "Buddy backend is not configured",
  );
});
