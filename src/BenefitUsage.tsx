import type { BenefitUsage } from "./types";

export function formatBenefitAmount(amount: number): string {
  return `S$${new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function BenefitBalance({ usage }: { usage: BenefitUsage }) {
  const remaining = usage.annualAllowance - usage.usedAmount;
  const visits = usage.visitLimit - usage.visitsUsed;
  return (
    <span className="benefit-balance">
      <span className="benefit-balance-amount">
        <strong>{formatBenefitAmount(remaining)}</strong> remaining
      </span>
      <span
        className="benefit-balance-track"
        role="progressbar"
        aria-label="Annual allowance used"
        aria-valuemin={0}
        aria-valuemax={usage.annualAllowance}
        aria-valuenow={usage.usedAmount}
      >
        <span
          style={{
            width: `${usage.annualAllowance ? (usage.usedAmount / usage.annualAllowance) * 100 : 0}%`,
          }}
        />
      </span>
      <span className="benefit-balance-caption">
        {formatBenefitAmount(usage.usedAmount)} used of{" "}
        {formatBenefitAmount(usage.annualAllowance)}
      </span>
      <span className="benefit-balance-caption">
        {visits} of {usage.visitLimit}{" "}
        {usage.visitLimit === 1 ? "visit" : "visits"} available
      </span>
    </span>
  );
}

export function BenefitClaims({ usage }: { usage: BenefitUsage }) {
  return (
    <section className="benefit-claims" aria-label="Recent claims">
      <h3>Recent claims</h3>
      {usage.claims.length ? (
        <ul>
          {usage.claims.map((claim) => (
            <li key={claim.id}>
              <span className="benefit-claim-copy">
                <strong>{claim.description}</strong>
                <small>
                  {new Intl.DateTimeFormat("en-SG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Singapore",
                  }).format(new Date(claim.date))}
                </small>
              </span>
              <span className="benefit-claim-result">
                <strong>{formatBenefitAmount(claim.amount)}</strong>
                <span
                  className={`status ${claim.status === "Paid" ? "" : "amber"}`}
                >
                  {claim.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper">No claims recorded yet.</p>
      )}
    </section>
  );
}
