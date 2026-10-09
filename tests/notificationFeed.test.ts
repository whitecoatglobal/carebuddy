import { expect, it } from "vitest";
import {
  emptyState,
  type Reminder,
  type HealthVitals,
  type State,
} from "care-buddy-shared";
import { buildNotificationFeed } from "../backend/src/notificationFeed";

const now = "2026-10-08T12:00:00+08:00";
function state(): State {
  return {
    ...emptyState(),
    now,
    started: true,
    selectedProfileId: "me",
    profiles: [
      {
        id: "me",
        displayName: "Me",
        relationship: "Self",
        canView: true,
        canManage: true,
      },
      {
        id: "mom",
        displayName: "Mom",
        relationship: "Parent",
        canView: true,
        canManage: false,
      },
      {
        id: "hidden",
        displayName: "Hidden",
        relationship: "Parent",
        canView: false,
        canManage: false,
      },
    ],
  };
}
const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  profileId: "me",
  category: "Medication",
  title: "Medication reminder",
  scheduledAt: now,
  notificationSnoozedUntil: null,
  recurrence: "None",
  seriesId: null,
  occurrenceDate: "2026-10-08",
  instructions: "",
  appointmentId: null,
  outcome: null,
  completedAt: null,
  recordedBy: null,
  recordedAt: null,
  occurrenceOverride: false,
  deletedAt: null,
  history: [],
  ...patch,
});
const vitals = (patch: Partial<HealthVitals> = {}): HealthVitals => ({
  profileId: "me",
  systolic: 118,
  diastolic: 76,
  pulseBpm: 72,
  temperatureC: 36.7,
  oxygenPercent: 98,
  breathingPerMinute: 16,
  updatedAt: now,
  source: "demo",
  ...patch,
});
it("includes approaching, due and unrecorded routines without claiming a missed dose", () => {
  const s = state();
  s.reminders = [
    reminder(),
    reminder({ id: "soon", scheduledAt: "2026-10-08T12:15:00+08:00" }),
    reminder({ id: "old", scheduledAt: "2026-10-08T11:29:00+08:00" }),
  ];
  const alerts = buildNotificationFeed(s, ["me"], [], now);
  expect(alerts).toHaveLength(3);
  expect(alerts.some((a) => a.title.includes("due now"))).toBe(true);
  expect(alerts.some((a) => a.title.includes("coming up"))).toBe(true);
  expect(
    alerts.find((a) => a.title.includes("not yet recorded"))?.message,
  ).toContain("does not mean it was missed");
});
it("respects snoozing, reported outcomes, deletion, future and old records", () => {
  const s = state();
  s.reminders = [
    reminder({ notificationSnoozedUntil: "2026-10-08T13:00:00+08:00" }),
    reminder({ id: "done", outcome: "taken" }),
    reminder({ id: "deleted", deletedAt: now }),
    reminder({ id: "later", scheduledAt: "2026-10-08T12:16:00+08:00" }),
    reminder({ id: "past", scheduledAt: "2026-10-07T11:59:00+08:00" }),
  ];
  expect(buildNotificationFeed(s, ["me"], [], now)).toEqual([]);
});
it("enforces selected scopes and current view access for every record type", () => {
  const s = state();
  s.reminders = [
    reminder({ profileId: "mom" }),
    reminder({ id: "hidden", profileId: "hidden" }),
  ];
  expect(
    buildNotificationFeed(
      s,
      ["me", "hidden"],
      [
        vitals({ profileId: "mom", temperatureC: 39 }),
        vitals({ profileId: "hidden", pulseBpm: 150 }),
      ],
      now,
    ),
  ).toEqual([]);
  expect(buildNotificationFeed(s, ["mom"], [], now)[0].profileName).toBe("Mom");
});
it("projects daily occurrences without changing the stored state or selected person", () => {
  const s = state();
  s.now = "2026-10-07T12:00:00+08:00";
  s.reminders = [
    reminder({
      id: "yesterday",
      scheduledAt: s.now,
      occurrenceDate: "2026-10-07",
      recurrence: "Daily",
      seriesId: "daily",
    }),
  ];
  const before = structuredClone(s),
    alerts = buildNotificationFeed(s, ["me"], [], now);
  expect(alerts.some((a) => a.at === now)).toBe(true);
  expect(s).toEqual(before);
});
it("offers appointment preparation stages with honest clinic provenance", () => {
  const s = state();
  s.appointments = [
    {
      id: "a1",
      profileId: "me",
      title: "GP follow-up",
      category: "gp",
      startsAt: "2026-10-09T11:00:00+08:00",
      locationLabel: "Family clinic",
      checklist: [],
      recordOrigin: "demo",
      providerConfirmed: false,
      provenanceHistory: [],
    },
  ];
  const first = buildNotificationFeed(s, ["me"], [], now)[0];
  expect(first.title).toContain("within 24 hours");
  expect(first.message).toContain("confirmation is still needed");
  const second = buildNotificationFeed(
    s,
    ["me"],
    [],
    "2026-10-09T10:30:00+08:00",
  )[0];
  expect(second.id).not.toBe(first.id);
  expect(second.title).toContain("coming up");
});
it("keeps alert IDs stable until timing, reading or care content changes", () => {
  const s = state();
  s.reminders = [reminder()];
  const first = buildNotificationFeed(s, ["me"], [], now)[0].id;
  expect(
    buildNotificationFeed(s, ["me"], [], "2026-10-08T12:01:00+08:00")[0].id,
  ).toBe(first);
  expect(
    buildNotificationFeed(s, ["me"], [], "2026-10-08T12:31:00+08:00")[0].id,
  ).not.toBe(first);
  s.reminders[0].title = "Changed routine";
  expect(buildNotificationFeed(s, ["me"], [], now)[0].id).not.toBe(first);
});
it("keeps normal readings and exact safe boundaries quiet", () => {
  expect(
    buildNotificationFeed(
      state(),
      ["me"],
      [
        vitals(),
        vitals({
          systolic: 139,
          diastolic: 89,
          pulseBpm: 100,
          temperatureC: 37.9,
          oxygenPercent: 95,
          breathingPerMinute: 18,
        }),
        vitals({
          systolic: 90,
          diastolic: 60,
          pulseBpm: 60,
          breathingPerMinute: 12,
        }),
      ],
      now,
    ),
  ).toEqual([]);
});
it("flags all opted-in metric types with source context and demo labels", () => {
  const alerts = buildNotificationFeed(
    state(),
    ["me"],
    [
      vitals({
        systolic: 181,
        pulseBpm: 101,
        temperatureC: 38,
        oxygenPercent: 88,
        breathingPerMinute: 19,
      }),
    ],
    now,
  );
  expect(alerts).toHaveLength(5);
  expect(
    alerts.every(
      (a) =>
        a.title.startsWith("Demo reading") &&
        a.source === "demo" &&
        a.message.includes("fictional") &&
        a.referenceUrl?.startsWith("https://"),
    ),
  ).toBe(true);
  expect(alerts.some((a) => a.priority === "urgent")).toBe(false);
});
it("preserves urgent actions for severe non-demo readings", () => {
  const alerts = buildNotificationFeed(
    state(),
    ["me"],
    [vitals({ source: "manual", systolic: 181, oxygenPercent: 88 })],
    now,
  );
  expect(alerts.filter((a) => a.priority === "urgent")).toHaveLength(2);
  expect(
    alerts.some((a) => a.message.includes("immediate medical attention")),
  ).toBe(true);
});
it("labels stale data instead of treating yesterday's value as a current urgent reading", () => {
  const alerts = buildNotificationFeed(
    state(),
    ["me"],
    [
      vitals({
        source: "device",
        systolic: 200,
        updatedAt: "2026-10-07T11:59:00+08:00",
      }),
    ],
    now,
  );
  expect(alerts).toHaveLength(1);
  expect(alerts[0].title).toContain("need updating");
  expect(alerts[0].priority).toBe("attention");
  expect(
    buildNotificationFeed(
      state(),
      ["me"],
      [vitals({ updatedAt: "2026-10-09T12:00:00+08:00", pulseBpm: 101 })],
      now,
    ),
  ).toEqual([]);
});
it("only exports recent unread urgent care entries, not stale routine notifications", () => {
  const s = state();
  s.notifications = [
    {
      id: "n1",
      profileId: "me",
      title: "Care alert",
      targetType: "urgent",
      targetId: "urgent",
      readAt: null,
      timestamp: now,
    },
    {
      id: "n2",
      profileId: "me",
      title: "Old",
      targetType: "urgent",
      targetId: "urgent",
      readAt: null,
      timestamp: "2026-10-01T12:00:00+08:00",
    },
    {
      id: "n3",
      profileId: "me",
      title: "Done",
      targetType: "urgent",
      targetId: "urgent",
      readAt: now,
      timestamp: now,
    },
    {
      id: "n4",
      profileId: "me",
      title: "Stale routine",
      targetType: "reminder",
      targetId: "removed",
      readAt: null,
      timestamp: now,
    },
  ];
  expect(buildNotificationFeed(s, ["me"], [], now).map((a) => a.title)).toEqual(
    ["Care alert"],
  );
});
