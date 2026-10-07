import { describe, expect, it } from "vitest";
import { SAMPLE_SLEEP_NIGHT, getSleepNightLabels } from "../src/sleepData";

describe("sample sleep report", () => {
  it("keeps stage percentages and durations consistent, excluding awake time", () => {
    expect(SAMPLE_SLEEP_NIGHT.stages.reduce((sum, stage) => sum + stage.percentage, 0)).toBe(100);
    expect(SAMPLE_SLEEP_NIGHT.stages.reduce((sum, stage) => sum + stage.minutes, 0)).toBe(SAMPLE_SLEEP_NIGHT.sleepMinutes);
    for (const stage of SAMPLE_SLEEP_NIGHT.stages) {
      expect(stage.minutes * 100).toBe(SAMPLE_SLEEP_NIGHT.sleepMinutes * stage.percentage);
    }
    expect(SAMPLE_SLEEP_NIGHT.sleepMinutes + SAMPLE_SLEEP_NIGHT.awakeMinutes).toBe(7 * 60 + 10);
  });

  it("switches yesterday's night at Singapore midnight, independently of host timezone", () => {
    expect(getSleepNightLabels(new Date("2026-10-06T15:59:00Z"))).toMatchObject({ bedDate: "2026-10-05", wakeDate: "2026-10-06" });
    expect(getSleepNightLabels(new Date("2026-10-06T16:01:00Z"))).toMatchObject({ bedDate: "2026-10-06", wakeDate: "2026-10-07" });
  });

  it("handles year boundaries and leap days", () => {
    expect(getSleepNightLabels(new Date("2026-01-01T02:00:00+08:00"))).toMatchObject({ bedDate: "2025-12-31", wakeDate: "2026-01-01" });
    expect(getSleepNightLabels(new Date("2024-03-01T02:00:00+08:00"))).toMatchObject({ bedDate: "2024-02-29", wakeDate: "2024-03-01" });
  });
});
