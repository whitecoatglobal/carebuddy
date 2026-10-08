import { describe, it, expect } from "vitest";
import {
  emptyState,
  validateState,
  type CarePlan,
  type CareDocument,
} from "care-buddy-shared";
import { applyReviewedCarePlan, careContextKey } from "../src/careJourneyState";
function fixture() {
  const s = emptyState();
  s.started = true;
  s.selectedProfileId = "p-me";
  s.profiles = [
    {
      id: "p-me",
      displayName: "Demo",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
  ];
  s.now = new Date().toISOString();
  const d: CareDocument = {
    id: "doc",
    name: "Fictional letter",
    createdAt: s.now,
    pages: [
      { page: 1, text: "Visit on 20 October 2099 at 10 am. Bring your notes." },
    ],
  };
  const p: CarePlan = {
    id: "plan",
    profileId: "p-me",
    kind: "appointment",
    summary: "Visit",
    instructions: [],
    questions: [],
    uncertainties: [],
    actions: [
      {
        id: "a",
        type: "appointment",
        title: "Fictional visit",
        scheduledAt: "2099-10-20T10:00:00+08:00",
        location: "Demo clinic",
        instructions: "Bring your notes.",
        recurrence: "None",
        evidence: [{ page: 1, quote: d.pages[0].text }],
      },
      {
        id: "b",
        type: "reminder",
        title: "Prepare notes",
        scheduledAt: "2099-10-19T10:00:00+08:00",
        instructions: "Bring your notes.",
        recurrence: "None",
        evidence: [{ page: 1, quote: "Bring your notes." }],
      },
    ],
  };
  return { s, d, p, key: careContextKey(s, "p-me") };
}
describe("reviewed document plan", () => {
  it("creates a valid batch only on explicit apply and preserves source history", () => {
    const { s, d, p, key } = fixture();
    expect(s.appointments).toHaveLength(0);
    const n = applyReviewedCarePlan(s, p, d, key);
    expect(n.appointments).toHaveLength(1);
    expect(n.reminders).toHaveLength(1);
    expect(n.appointments[0].providerConfirmed).toBe(false);
    expect(n.reminders[0].history.at(-1)?.text).toContain("Bring your notes.");
    expect(validateState(n)).toBe(true);
    expect(s.appointments).toHaveLength(0);
  });
  it("replaying the same confirmed plan creates nothing twice", () => {
    const { s, d, p, key } = fixture();
    const n = applyReviewedCarePlan(s, p, d, key);
    expect(applyReviewedCarePlan(n, p, d, key)).toBe(n);
  });
  it("invalid second item leaves original fully unchanged", () => {
    const { s, d, p, key } = fixture();
    p.actions[1].scheduledAt = null;
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow(
      "explicit future",
    );
    expect(s.appointments).toHaveLength(0);
    expect(s.appliedActions).toHaveLength(0);
  });
  it("rejects wrong selected person and view-only access", () => {
    const { s, d, p, key } = fixture();
    s.selectedProfileId = "other";
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow(
      "selected person",
    );
    s.selectedProfileId = "p-me";
    s.profiles[0].canManage = false;
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow("Manage access");
  });
  it("rejects changed context before any write", () => {
    const { s, d, p, key } = fixture();
    s.profiles[0].displayName = "Updated";
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow(
      "records changed",
    );
  });
  it("rejects invented source quote", () => {
    const { s, d, p, key } = fixture();
    p.actions[1].evidence[0].quote = "Invented dosage";
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow(
      "source evidence",
    );
  });
  it("rejects equivalent records from a different imported plan", () => {
    const { s, d, p, key } = fixture();
    const n = applyReviewedCarePlan(s, p, d, key);
    const p2 = { ...p, id: "second" };
    expect(() =>
      applyReviewedCarePlan(n, p2, d, careContextKey(n, "p-me")),
    ).toThrow("already exists");
  });
  it("rejects duplicate action IDs before any write", () => {
    const { s, d, p, key } = fixture();
    p.actions[1].id = "a";
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow(
      "Duplicate action",
    );
  });
  it("blocks actions while driving", () => {
    const { s, d, p, key } = fixture();
    s.carMode = "driving";
    expect(() => applyReviewedCarePlan(s, p, d, key)).toThrow("parked");
  });
});
