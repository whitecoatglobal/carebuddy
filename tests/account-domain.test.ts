import { describe, expect, it } from "vitest";
import { emptyState, execute, validateState } from "../shared/src/domain";

function state() {
  const s = emptyState();
  s.started = true;
  s.now = "2026-10-07T09:00:00+08:00";
  s.selectedProfileId = "p-me";
  s.profiles = [
    {
      id: "p-me",
      displayName: "Me",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
  ];
  return s;
}
const appointment = {
  profileId: "p-me",
  category: "Dental",
  title: "Dental cleaning",
  startsAt: "2026-10-08T11:30:00+08:00",
  locationLabel: "Harbour Dental Studio",
};

describe("account-owned domain changes", () => {
  it("rejects the same reminder submitted under a different request id", () => {
    const command = {
      type: "createReminder" as const,
      input: {
        profileId: "p-me",
        category: "Personal care" as const,
        title: "Evening walk",
        scheduledAt: "2026-10-07T19:00:00+08:00",
        recurrence: "None" as const,
        instructions: "",
      },
    };
    const s = execute(state(), command, "first-create");
    expect(() => execute(s, command, "second-create")).toThrow(
      "already exists",
    );
  });
  it("creates an unconfirmed appointment record with server actor attribution", () => {
    const next = execute(
      state(),
      { type: "createAppointment", input: appointment } as any,
      "request-1",
      "p-me",
      "user-123",
    );
    expect(next.appointments).toHaveLength(1);
    expect(next.appointments[0].providerConfirmed).toBe(false);
    expect(next.activity.at(-1)?.actor).toBe("user-123");
    expect(validateState(next)).toBe(true);
  });
  it("rejects a past appointment instead of persisting it", () => {
    expect(() =>
      execute(state(), {
        type: "createAppointment",
        input: { ...appointment, startsAt: "2026-10-06T09:00:00+08:00" },
      } as any),
    ).toThrow();
  });
  it("stores custom checklist items with stable identities and toggles the intended item", () => {
    let s = state();
    s.appointments = [
      {
        ...appointment,
        id: "appointment-1",
        checklist: [false, false, false],
        recordOrigin: "user-saved",
        providerConfirmed: false,
        provenanceHistory: [],
      },
    ];
    s = execute(
      s,
      {
        type: "updateChecklist",
        id: "appointment-1",
        items: [
          {
            id: "insurance-card",
            label: "Bring insurance card",
            completed: false,
          },
        ],
      } as any,
      "checklist-1",
    );
    expect((s.appointments[0] as any).checklistItems?.[0].label).toBe(
      "Bring insurance card",
    );
    s = execute(
      s,
      { type: "toggleChecklist", id: "appointment-1", index: 0 },
      "toggle-1",
    );
    expect((s.appointments[0] as any).checklistItems?.[0].completed).toBe(true);
    expect(s.appointments[0].checklist).toEqual([false, false, false]);
    expect(validateState(s)).toBe(true);
  });
  it("attributes existing reminder actions to the authenticated account", () => {
    const s = execute(
      state(),
      {
        type: "createReminder",
        input: {
          profileId: "p-me",
          category: "Personal care",
          title: "Evening walk",
          scheduledAt: "2026-10-07T19:00:00+08:00",
          recurrence: "None",
          instructions: "",
        },
      },
      "reminder-1",
      "p-me",
      "user-123",
    );
    expect(s.reminders[0].history[0].actor).toBe("user-123");
  });
  it("updates explicit appointment links, preserves omitted links, and rejects another person", () => {
    let s = state();
    s.profiles.push({
      id: "other",
      displayName: "Other",
      relationship: "Parent",
      canView: true,
      canManage: true,
    });
    s.appointments = ["a1", "a2", "other-appointment"].map((id) => ({
      ...appointment,
      id,
      profileId: id === "other-appointment" ? "other" : "p-me",
      checklist: [false, false, false],
      recordOrigin: "user-saved",
      providerConfirmed: false,
      provenanceHistory: [],
    }));
    const input = {
      profileId: "p-me",
      category: "Appointment preparation" as const,
      title: "Dental preparation",
      scheduledAt: "2026-10-07T19:00:00+08:00",
      recurrence: "None" as const,
      instructions: "",
    };
    s = execute(s, {
      type: "createReminder",
      input: { ...input, appointmentId: "a1" },
    });
    const id = s.reminders[0].id;
    s = execute(s, {
      type: "editReminder",
      id,
      scope: "occurrence",
      input: { ...input, appointmentId: "a2" },
    });
    expect(s.reminders[0].appointmentId).toBe("a2");
    s = execute(s, { type: "editReminder", id, scope: "occurrence", input });
    expect(s.reminders[0].appointmentId).toBe("a2");
    expect(() =>
      execute(s, {
        type: "editReminder",
        id,
        scope: "occurrence",
        input: { ...input, appointmentId: "other-appointment" },
      }),
    ).toThrow(/for this person/);
    expect(s.reminders[0].appointmentId).toBe("a2");
    s = execute(s, {
      type: "editReminder",
      id,
      scope: "occurrence",
      input: { ...input, appointmentId: null },
    });
    expect(s.reminders[0].appointmentId).toBeNull();
  });
});
