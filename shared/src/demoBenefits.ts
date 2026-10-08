import type { Benefit, State } from "./types.js";

// Shared fixtures are saved with the demo care space; they are not live cover.
export function seedDemoBenefits(state: State, now = state.now): State {
  if (state.scenario !== "public-demo") return state;
  const year = new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(now));
  const policyDate = `${year}-01-01T00:00:00+08:00`;
  const claimDate = (daysAgo: number) => {
    const date = new Date(Date.parse(now) - daysAgo * 86_400_000 + 28_800_000)
      .toISOString()
      .slice(0, 10);
    return `${date.startsWith(year) ? date : `${year}-01-01`}T00:00:00+08:00`;
  };
  const added: Benefit[] = [];
  for (const profile of state.profiles) {
    if (
      !profile.canView ||
      state.benefits.some((benefit) => benefit.profileId === profile.id)
    )
      continue;
    const prefix = `demo-benefit-${encodeURIComponent(profile.id)}`;
    const common = {
      profileId: profile.id,
      source: "Care Buddy demo plan",
      policyDate,
      notes:
        "Illustrative plan for exploring Care Buddy. Pending claims are not deducted from the used balance.",
    };
    added.push(
      {
        ...common,
        id: `${prefix}-gp`,
        category: "gp",
        status: "Listed in sample plan",
        conditions:
          "Annual allowance of S$500. Up to 12 visits per year, with a limit of S$50 per visit at participating clinics. Consultations and prescribed medication are subject to the recorded plan terms.",
        usage: {
          currency: "SGD",
          annualAllowance: 500,
          usedAmount: 80,
          visitLimit: 12,
          visitsUsed: 2,
          claims: [
            {
              id: `${prefix}-gp-claim-1`,
              date: claimDate(12),
              description: "GP consultation",
              amount: 35,
              status: "Paid",
            },
            {
              id: `${prefix}-gp-claim-2`,
              date: claimDate(35),
              description: "GP consultation and medication",
              amount: 45,
              status: "Paid",
            },
          ],
        },
      },
      {
        ...common,
        id: `${prefix}-screening`,
        category: "screening",
        status: "Listed in sample plan",
        conditions:
          "Annual allowance of S$250. One visit per plan year for an eligible health-screening package at a participating provider. Confirm the included tests before booking.",
        usage: {
          currency: "SGD",
          annualAllowance: 250,
          usedAmount: 0,
          visitLimit: 1,
          visitsUsed: 0,
          claims: [
            {
              id: `${prefix}-screening-claim-1`,
              date: claimDate(3),
              description: "Health-screening package",
              amount: 180,
              status: "Pending",
            },
          ],
        },
      },
      {
        ...common,
        id: `${prefix}-dental`,
        category: "dental",
        status: "Conditions apply",
        conditions:
          "Annual allowance of S$300. Up to 2 visits per year for routine dental examinations, scaling and polishing. Other treatments need confirmation before the visit.",
        usage: {
          currency: "SGD",
          annualAllowance: 300,
          usedAmount: 85,
          visitLimit: 2,
          visitsUsed: 1,
          claims: [
            {
              id: `${prefix}-dental-claim-1`,
              date: claimDate(60),
              description: "Dental check-up, scaling and polishing",
              amount: 85,
              status: "Paid",
            },
          ],
        },
      },
    );
  }
  return added.length
    ? { ...state, benefits: [...state.benefits, ...added] }
    : state;
}
