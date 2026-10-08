import { expect, it } from "vitest";
import { emptyState, execute, isoAt, materialize } from "care-buddy-shared";
function fixture(now = "2026-10-08T13:19:00+08:00") {
  let s = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Test person",
    acknowledged: true,
  });
  s.now = isoAt("2026-10-08", "07:00");
  s = execute(
    s,
    {
      type: "createReminder",
      input: {
        profileId: "p-me",
        category: "Medication",
        title: "Morning medication",
        scheduledAt: isoAt("2026-10-08", "08:00"),
        recurrence: "Daily",
        instructions: "Use the instructions already provided to you",
      },
    },
    "seed",
    "p-me",
  );
  s.now = now;
  return materialize(s);
}
it("changes a daily clock to the next valid occurrence without rewriting today or directions", () => {
  const s = fixture(),
    r = s.reminders.find((r) => r.occurrenceDate === "2026-10-08")!;
  const before = structuredClone(r);
  const next = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" } as any,
    "reschedule",
    "p-me",
  );
  expect(next.reminders.find((x) => x.id === r.id)).toEqual(before);
  expect(
    next.reminders.find((x) => x.occurrenceDate === "2026-10-09")?.scheduledAt,
  ).toBe(isoAt("2026-10-09", "05:00"));
  expect(
    next.reminders.every((x) => x.instructions === before.instructions),
  ).toBe(true);
  expect(new Set(next.reminders.map((r) => r.id)).size).toBe(
    next.reminders.length,
  );
});
it("uses today when the requested clock is still in the future", () => {
  const s = fixture("2026-10-08T04:00:00+08:00"),
    r = s.reminders[0];
  const next = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" } as any,
    "early",
    "p-me",
  );
  expect(
    next.reminders.find((x) => x.occurrenceDate === "2026-10-08")?.scheduledAt,
  ).toBe(isoAt("2026-10-08", "05:00"));
});
it("honors explicit future starts, preserves reported occurrences, and does not touch another profile sharing a series ID", () => {
  const s = fixture(),
    r = s.reminders[0];
  s.profiles.push({
    id: "p-other",
    displayName: "Other",
    relationship: "Parent",
    canView: true,
    canManage: true,
  });
  const other = {
    ...structuredClone(s.reminders[1]),
    id: "other-occurrence",
    profileId: "p-other",
  };
  s.reminders.push(other);
  const next = execute(
    s,
    {
      type: "setDailyReminderTime",
      id: r.id,
      time: "05:00",
      startDate: "2026-10-10",
    } as any,
    "future",
    "p-me",
  );
  expect(next.reminders.find((x) => x.id === other.id)).toEqual(other);
  expect(
    next.reminders.find(
      (x) => x.profileId === "p-me" && x.occurrenceDate === "2026-10-09",
    )?.scheduledAt,
  ).toBe(isoAt("2026-10-09", "08:00"));
  expect(
    next.reminders.find(
      (x) => x.profileId === "p-me" && x.occurrenceDate === "2026-10-10",
    )?.scheduledAt,
  ).toBe(isoAt("2026-10-10", "05:00"));
});
it("rejects explicit passed dates, invalid clock strings and non-daily records", () => {
  const s = fixture(),
    r = s.reminders[0];
  expect(() =>
    execute(s, {
      type: "setDailyReminderTime",
      id: r.id,
      time: "05:00",
      startDate: "2026-10-08",
    } as any),
  ).toThrow();
  expect(() =>
    execute(s, {
      type: "setDailyReminderTime",
      id: r.id,
      time: "25:00",
    } as any),
  ).toThrow();
  const single = structuredClone(s);
  single.reminders[0].recurrence = "None";
  single.reminders[0].seriesId = null;
  expect(() =>
    execute(single, {
      type: "setDailyReminderTime",
      id: r.id,
      time: "05:00",
    } as any),
  ).toThrow();
});

it("keeps a reported future occurrence intact while the new regular clock drives later days", () => {
  const s = fixture(),
    r = s.reminders[0];
  const reported = {
    ...structuredClone(s.reminders[1]),
    id: "reported-future",
    occurrenceDate: "2026-10-10",
    scheduledAt: isoAt("2026-10-10", "08:00"),
    outcome: "taken" as const,
    completedAt: s.now,
    recordedAt: s.now,
    recordedBy: "p-me",
  };
  s.reminders.push(reported);
  const next = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" },
    "future-report",
    "p-me",
  );
  expect(next.reminders.find((r) => r.id === reported.id)).toEqual(reported);
  next.now = isoAt("2026-10-11", "04:00");
  materialize(next);
  expect(
    next.reminders.find(
      (r) => r.profileId === "p-me" && r.occurrenceDate === "2026-10-11",
    )?.scheduledAt,
  ).toBe(isoAt("2026-10-11", "05:00"));
});
it("allows ordinary reviewed future edits to supersede the daily clock", () => {
  const s = fixture(),
    r = s.reminders[0];
  const daily = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" },
    "daily",
    "p-me",
  );
  const nextDay = daily.reminders.find(
    (r) => r.occurrenceDate === "2026-10-09",
  )!;
  const edited = execute(
    daily,
    {
      type: "editReminder",
      id: nextDay.id,
      scope: "future",
      input: {
        profileId: "p-me",
        category: nextDay.category,
        title: nextDay.title,
        scheduledAt: isoAt("2026-10-09", "06:00"),
        recurrence: "Daily",
        instructions: nextDay.instructions,
      },
    },
    "ordinary",
    "p-me",
  );
  edited.now = isoAt("2026-10-10", "04:00");
  materialize(edited);
  expect(
    edited.reminders.find((r) => r.occurrenceDate === "2026-10-10")
      ?.scheduledAt,
  ).toBe(isoAt("2026-10-10", "06:00"));
});

it("does not generate occurrences before a future daily start", () => {
  let s = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Person",
    acknowledged: true,
  });
  s.now = isoAt("2026-10-08", "13:19");
  s = execute(
    s,
    {
      type: "createReminder",
      input: {
        profileId: "p-me",
        category: "Personal care",
        title: "Morning routine",
        scheduledAt: isoAt("2026-10-09", "05:00"),
        recurrence: "Daily",
        instructions: "",
      },
    },
    "future-start",
    "p-me",
  );
  expect(s.reminders.every((r) => r.occurrenceDate >= "2026-10-09")).toBe(true);
});

it("does not resurrect a stopped series after changing its daily clock", () => {
  const s = fixture(),
    r = s.reminders[0];
  const daily = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" },
    "daily-stop",
    "p-me",
  );
  const tomorrow = daily.reminders.find(
    (r) => r.occurrenceDate === "2026-10-09",
  )!;
  const stopped = execute(
    daily,
    {
      type: "editReminder",
      id: tomorrow.id,
      scope: "future",
      input: {
        profileId: "p-me",
        category: tomorrow.category,
        title: tomorrow.title,
        scheduledAt: tomorrow.scheduledAt,
        recurrence: "None",
        instructions: tomorrow.instructions,
      },
    },
    "stop",
    "p-me",
  );
  stopped.now = isoAt("2026-10-10", "04:00");
  materialize(stopped);
  expect(stopped.reminders.some((r) => r.occurrenceDate === "2026-10-10")).toBe(
    false,
  );
});

it("does not rewrite an overdue morning record when the new clock is later today", () => {
  const s = fixture(),
    r = s.reminders[0],
    before = structuredClone(r);
  const next = execute(
    s,
    { type: "setDailyReminderTime", id: r.id, time: "21:00" },
    "later-clock",
    "p-me",
  );
  expect(next.reminders.find((x) => x.id === r.id)).toEqual(before);
  expect(
    next.reminders.find((x) => x.occurrenceDate === "2026-10-09")?.scheduledAt,
  ).toBe(isoAt("2026-10-09", "21:00"));
});
it("creates a missing anchor from the effective regular instructions rather than historical directions", () => {
  const s = fixture(),
    r = s.reminders[0],
    tomorrow = s.reminders[1];
  const changed = execute(
    s,
    {
      type: "editReminder",
      id: tomorrow.id,
      scope: "future",
      input: {
        profileId: "p-me",
        category: tomorrow.category,
        title: tomorrow.title,
        scheduledAt: tomorrow.scheduledAt,
        recurrence: "Daily",
        instructions: "Updated regular directions",
      },
    },
    "new-directions",
    "p-me",
  );
  const next = execute(
    changed,
    {
      type: "setDailyReminderTime",
      id: r.id,
      time: "05:00",
      startDate: "2026-10-10",
    },
    "anchor-directions",
    "p-me",
  );
  expect(
    next.reminders.find((x) => x.occurrenceDate === "2026-10-10")?.instructions,
  ).toBe("Updated regular directions");
});
it("preserves one-day instruction overrides so they never propagate as regular directions", () => {
  const s = fixture(),
    r = s.reminders[0],
    tomorrow = s.reminders[1];
  const changed = execute(
    s,
    {
      type: "editReminder",
      id: tomorrow.id,
      scope: "occurrence",
      input: {
        profileId: "p-me",
        category: tomorrow.category,
        title: tomorrow.title,
        scheduledAt: tomorrow.scheduledAt,
        recurrence: "Daily",
        instructions: "One day directions",
      },
    },
    "one-day-directions",
    "p-me",
  );
  const next = execute(
    changed,
    { type: "setDailyReminderTime", id: r.id, time: "05:00" },
    "override-clock",
    "p-me",
  );
  expect(
    next.reminders.find((x) => x.id === tomorrow.id)?.occurrenceOverride,
  ).toBe(true);
  next.now = isoAt("2026-10-10", "04:00");
  materialize(next);
  expect(
    next.reminders.find((x) => x.occurrenceDate === "2026-10-10")?.instructions,
  ).toBe(r.instructions);
});
