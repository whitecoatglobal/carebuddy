import { expect, it } from "vitest";
import {
  emptyState,
  execute,
  materialize,
  seedDemoFamily,
  validateState,
} from "care-buddy-shared";
import { createPublicDemoState } from "../src/publicDemo";

function care() {
  const state = execute(emptyState(), {
    type: "createSelfProfile",
    displayName: "Me",
    acknowledged: true,
  });
  state.scenario = "public-demo";
  state.now = "2026-10-08T17:00:00+08:00";
  return state;
}

it("creates a complete public demo with separate parent routines, appointments and benefits", () => {
  const state = createPublicDemoState(new Date("2026-10-08T01:00:00Z"));
  expect(validateState(state)).toBe(true);
  expect(state.selectedProfileId).toBe("p-me");
  expect(state.profiles.map((profile) => profile.displayName)).toEqual([
    "Me",
    "Mom",
    "Dad",
  ]);
  for (const id of ["p-demo-mom", "p-demo-dad"]) {
    expect(state.profiles.find((profile) => profile.id === id)).toMatchObject({
      relationship: "Parent",
      canView: true,
      canManage: true,
    });
    expect(
      state.reminders.filter(
        (reminder) =>
          reminder.profileId === id && reminder.occurrenceDate === "2026-10-08",
      ),
    ).toHaveLength(5);
    expect(
      state.benefits.filter((benefit) => benefit.profileId === id),
    ).toHaveLength(3);
    expect(
      state.appointments.filter((appointment) => appointment.profileId === id),
    ).toHaveLength(1);
  }
  expect(
    state.appointments.every(
      (appointment) =>
        appointment.recordOrigin === "demo" && !appointment.providerConfirmed,
    ),
  ).toBe(true);
  expect(
    state.reminders.find(
      (reminder) =>
        reminder.profileId === "p-demo-mom" && reminder.category === "Bedtime",
    )?.scheduledAt,
  ).toContain("21:30");
  expect(
    state.reminders.find(
      (reminder) =>
        reminder.profileId === "p-demo-dad" && reminder.category === "Bedtime",
    )?.scheduledAt,
  ).toContain("22:00");
});

it.each([
  ["2026-10-08T16:30:00Z", "2026-10-09", "2026-10-10", "2026-10-12"],
  ["2026-12-31T16:30:00Z", "2027-01-01", "2027-01-02", "2027-01-04"],
  ["2028-02-28T23:30:00+08:00", "2028-02-28", "2028-02-29", "2028-03-02"],
])(
  "dates family care in Singapore across calendar boundaries: %s",
  (now, today, momDay, dadDay) => {
    const state = care();
    state.now = now;
    const seeded = seedDemoFamily(state);
    expect(
      seeded.reminders.every((reminder) => reminder.occurrenceDate === today),
    ).toBe(true);
    expect(
      seeded.appointments.find(
        (appointment) => appointment.profileId === "p-demo-mom",
      )?.startsAt,
    ).toBe(`${momDay}T10:30:00+08:00`);
    expect(
      seeded.appointments.find(
        (appointment) => appointment.profileId === "p-demo-dad",
      )?.startsAt,
    ).toBe(`${dadDay}T09:00:00+08:00`);
    expect(validateState(materialize(seeded))).toBe(true);
  },
);

it("preserves saved care and selection, and does not change the supplied state", () => {
  const state = execute(care(), {
    type: "createReminder",
    input: {
      profileId: "p-me",
      category: "Other",
      title: "My existing routine",
      scheduledAt: "2026-10-08T19:00:00+08:00",
      recurrence: "None",
      instructions: "Keep these instructions",
    },
  });
  const before = structuredClone(state);
  const seeded = seedDemoFamily(state);
  expect(state).toEqual(before);
  expect(seeded.selectedProfileId).toBe(state.selectedProfileId);
  expect(
    seeded.reminders.filter((reminder) => reminder.profileId === "p-me"),
  ).toEqual(state.reminders);
  expect(seeded.chats).toBe(state.chats);
  expect(seedDemoFamily(seeded)).toBe(seeded);
});

it("keeps matching parent names and access without creating duplicate parents or care records", () => {
  const state = care();
  state.profiles.push(
    {
      id: "existing-mum",
      displayName: " Mum ",
      relationship: "Parent",
      canView: false,
      canManage: false,
    },
    {
      id: "existing-dad",
      displayName: "Dad",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
  );
  state.selectedProfileId = "existing-dad";
  const seeded = seedDemoFamily(state);
  expect(seeded.profiles).toEqual(state.profiles);
  expect(seeded.selectedProfileId).toBe("existing-dad");
  expect(seeded.reminders).toEqual([]);
  expect(seeded.appointments).toEqual([]);
  expect(seeded.demoFamilySeeded).toBe(true);
});

it("does not restore a removed parent or overwrite renamed parents and edited routines", () => {
  let state = seedDemoFamily(care());
  state = execute(state, {
    type: "updateDependent",
    id: "p-demo-dad",
    patch: { displayName: "Papa", canManage: false },
  });
  state = execute(state, { type: "removeDependent", id: "p-demo-mom" });
  expect(seedDemoFamily(state)).toBe(state);
  expect(state.profiles.map((profile) => profile.displayName)).toEqual([
    "Me",
    "Papa",
  ]);
  expect(state.profiles[1].canManage).toBe(false);
  expect(
    state.reminders.some((reminder) => reminder.profileId === "p-demo-mom"),
  ).toBe(false);
});

it("leaves ordinary care and empty onboarding spaces untouched and rejects invalid seeding flags", () => {
  const state = care();
  state.scenario = "user-care";
  expect(seedDemoFamily(state)).toBe(state);
  const empty = emptyState();
  empty.scenario = "public-demo";
  expect(seedDemoFamily(empty)).toBe(empty);
  expect(validateState({ ...care(), demoFamilySeeded: "yes" })).toBe(false);
});
