import { describe, expect, it } from "vitest";
import { getBenefitHighlights } from "../src/uiPresentation";

describe("documented benefit highlights", () => {
  it("keeps the recorded currency, per-visit limit, and annual visit limit", () => {
    expect(
      getBenefitHighlights(
        "GP allowance of S$40 per visit, up to 6 visits per plan year. Eligibility requires confirmation.",
      ),
    ).toEqual(["S$40 per visit", "up to 6 visits per plan year"]);
  });
  it("does not infer an allowance from unrelated numbers or missing terms", () => {
    expect(
      getBenefitHighlights(
        "Call the administrator on 12345678. Policy dated 2026.",
      ),
    ).toEqual([]);
    expect(getBenefitHighlights("Not available")).toEqual([]);
  });
  it("preserves decimal amounts without calculating a remaining balance", () => {
    expect(
      getBenefitHighlights(
        "Recorded consultation limit SGD 40.50 per visit. Usage not supplied.",
      ),
    ).toEqual(["SGD 40.50 per visit"]);
  });
});

it("preserves annual allowance and a documented single-visit limit", () => {
  expect(
    getBenefitHighlights(
      "Illustrative annual health-check allowance of S$180. One visit per plan year; confirm eligible tests.",
    ),
  ).toEqual(["Annual allowance: S$180", "One visit per plan year"]);
});
it("preserves an upper-bound qualifier on the allowance", () => {
  expect(
    getBenefitHighlights("Up to S$40 per visit, 6 visits per year."),
  ).toEqual(["Up to S$40 per visit", "6 visits per year"]);
});
