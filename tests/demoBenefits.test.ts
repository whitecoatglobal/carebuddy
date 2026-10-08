import { expect, it } from "vitest";
import {
  emptyState,
  execute,
  seedDemoBenefits,
  validateState,
} from "care-buddy-shared";

function care() {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.scenario = "public-demo";
  state.now = "2026-10-08T16:30:00+08:00";
  return state;
}

it("seeds consistent allowances and dated claims once without changing other care data", () => {
  const state = care();
  const seeded = seedDemoBenefits(state);
  expect(state.benefits).toEqual([]);
  expect({ ...seeded, benefits: [] }).toEqual(state);
  expect(seeded.benefits.map((benefit) => benefit.category)).toEqual([
    "gp",
    "screening",
    "dental",
  ]);
  expect(validateState(seeded)).toBe(true);
  for (const benefit of seeded.benefits) {
    const usage = benefit.usage!;
    expect(
      usage.claims
        .filter((claim) => claim.status === "Paid")
        .reduce((sum, claim) => sum + claim.amount, 0),
    ).toBe(usage.usedAmount);
    expect(
      usage.claims.every(
        (claim) => Date.parse(claim.date) <= Date.parse(state.now),
      ),
    ).toBe(true);
  }
  expect(seedDemoBenefits(seeded)).toBe(seeded);
});

it("keeps existing benefits, separates profile IDs and excludes unavailable profiles and ordinary care spaces", () => {
  const state = care();
  state.benefits = [
    {
      id: "saved-note",
      profileId: "p-me",
      category: "gp",
      status: "Needs confirmation",
      conditions: "My recorded plan",
      source: "Personal note",
      policyDate: null,
    },
  ];
  state.profiles.push(
    {
      id: "p-mum",
      displayName: "Mum",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
    {
      id: "p-hidden",
      displayName: "Hidden",
      relationship: "Other",
      canView: false,
      canManage: false,
    },
  );
  const seeded = seedDemoBenefits(state);
  expect(
    seeded.benefits.filter((benefit) => benefit.profileId === "p-me"),
  ).toEqual(state.benefits);
  expect(
    seeded.benefits.filter((benefit) => benefit.profileId === "p-mum"),
  ).toHaveLength(3);
  expect(
    seeded.benefits.some((benefit) => benefit.profileId === "p-hidden"),
  ).toBe(false);
  state.scenario = "user-care";
  expect(seedDemoBenefits(state)).toBe(state);
});

it("keeps claims in the Singapore policy year when a new demo starts near New Year", () => {
  const state = care();
  state.now = "2026-12-31T16:30:00Z";
  const seeded = seedDemoBenefits(state);
  expect(seeded.benefits[0].policyDate).toBe("2027-01-01T00:00:00+08:00");
  expect(
    seeded.benefits.every((benefit) =>
      benefit.usage!.claims.every((claim) =>
        claim.date.startsWith("2027-01-01"),
      ),
    ),
  ).toBe(true);
});

it("accepts older notes without balances and rejects invalid allowance or claim data", () => {
  expect(validateState(care())).toBe(true);
  const seeded = seedDemoBenefits(care());
  for (const change of [
    { usedAmount: -1 },
    { usedAmount: 501 },
    { usedAmount: Infinity },
    { visitsUsed: 13 },
    { visitsUsed: 1.5 },
    { currency: "USD" },
    {
      claims: [
        {
          id: "c",
          date: "invalid",
          description: "Visit",
          amount: 20,
          status: "Paid",
        },
      ],
    },
  ]) {
    const invalid = structuredClone(seeded);
    Object.assign(invalid.benefits[0].usage!, change);
    expect(validateState(invalid)).toBe(false);
  }
});
