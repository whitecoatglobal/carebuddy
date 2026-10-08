import { describe, it, expect } from "vitest";
import { STORAGE_KEY, emptyState, validateState } from "care-buddy-shared";
import { restorePreviousBrowserRecords } from "../src/browserRecovery";
import { createPublicDemoState, publicBootstrapState } from "../src/publicDemo";

const storageFor = (entries: [string, string][]) => {
  const values = new Map(entries);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("public care space recovery", () => {
  it("restores only the current browser's backed-up records and client reference once", () => {
    const original = createPublicDemoState(new Date("2026-10-07T01:00:00Z"));
    const storage = storageFor([
      [STORAGE_KEY, JSON.stringify(emptyState())],
      [
        "carebuddy.legacy-unclaimed-v1",
        JSON.stringify({
          raw: JSON.stringify(original),
          reference: "client-example1",
        }),
      ],
    ]);
    expect(restorePreviousBrowserRecords(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(original);
    expect(storage.getItem("care-buddy.client-id")).toBe("client-example1");
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyState()));
    expect(restorePreviousBrowserRecords(storage)).toBe(false);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).profiles).toEqual([]);
  });
  it("keeps a populated current care space and rejects invalid backups", () => {
    const current = createPublicDemoState();
    const storage = storageFor([
      [STORAGE_KEY, JSON.stringify(current)],
      [
        "carebuddy.legacy-unclaimed-v1",
        JSON.stringify({ raw: "{}", reference: "client-other" }),
      ],
    ]);
    expect(restorePreviousBrowserRecords(storage)).toBe(false);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(current);
    const invalid = storageFor([
      ["carebuddy.legacy-unclaimed-v1", JSON.stringify({ raw: "{}" })],
    ]);
    expect(restorePreviousBrowserRecords(invalid)).toBe(false);
    expect(invalid.getItem(STORAGE_KEY)).toBeNull();
  });
  it("recovers a valid backup when the current cache cannot be read", () => {
    const previous = createPublicDemoState();
    const storage = storageFor([
      [STORAGE_KEY, "broken-json"],
      [
        "carebuddy.legacy-unclaimed-v1",
        JSON.stringify({
          raw: JSON.stringify(previous),
          reference: "client-original",
        }),
      ],
    ]);
    expect(restorePreviousBrowserRecords(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(previous);
  });
  it("preserves populated server records and supplies valid dated sample routines only for an empty demo", () => {
    const populated = createPublicDemoState(new Date("2026-10-08T16:30:00Z"));
    expect(validateState(populated)).toBe(true);
    expect(
      populated.reminders.some(
        (item) =>
          item.category === "Medication" &&
          item.occurrenceDate === "2026-10-09",
      ),
    ).toBe(true);
    expect(publicBootstrapState(createPublicDemoState(), populated)).toBe(
      populated,
    );
    expect(publicBootstrapState(populated, emptyState())).toBe(populated);
    expect(
      publicBootstrapState(emptyState(), emptyState()).profiles[0].id,
    ).toBe("p-me");
  });
});
