import { afterEach, expect, it, vi } from "vitest";
import { BuddyAttempts } from "../src/buddyAttempts";
afterEach(() => vi.unstubAllGlobals());
it("retains unresolved requests across other profile requests and reloads, but completes only the matching request", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const a = {
    profileId: "a",
    message: "Create reminder",
    contextId: null,
    scope: undefined,
  };
  const b = { ...a, profileId: "b" };
  const attempts = new BuddyAttempts("client-test");
  const aId = attempts.idFor(a),
    bId = attempts.idFor(b);
  attempts.complete(b, bId);
  expect(attempts.idFor(a)).toBe(aId);
  expect(new BuddyAttempts("client-test").idFor(a)).toBe(aId);
  attempts.complete(a, aId);
  expect(attempts.idFor(a)).not.toBe(aId);
  expect(new BuddyAttempts("client-other").idFor(a)).not.toBe(aId);
});
