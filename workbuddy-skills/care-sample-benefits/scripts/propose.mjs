import { readFileSync } from "node:fs";
const mode = "benefit";
const result = (status, message, extra = {}) => ({
  status,
  message,
  executed: false,
  provenance: "CareBuddy fictional local records",
  ...extra,
});
function run(input) {
  const { state, profileId, actionId, expectedClock } = input;
  if (!state || !Array.isArray(state.profiles) || !profileId)
    return result("clarification", "Provide a demo state and exact profileId.");
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile?.canView)
    return result(
      "refusal",
      "This profile is unavailable or viewing is not permitted.",
    );
  if (state.selectedProfileId !== profileId)
    return result(
      "refusal",
      "Selected profile differs from the requested recipient. Select the recipient in the PWA first.",
    );
  if (expectedClock !== state.now || !Number.isFinite(Date.parse(state.now)))
    return result(
      "clarification",
      "Provide expectedClock matching the current demo clock; refresh stale context.",
    );
  if (mode === "benefit") {
    const rows = (state.benefits || []).filter(
      (b) =>
        b.profileId === profileId &&
        b.category.toLowerCase() === String(input.category || "").toLowerCase(),
    );
    if (!rows.length)
      return result(
        "information",
        "The sample has no matching source. Real eligibility needs confirmation.",
        {
          profileId,
          items: [
            {
              id: null,
              status: "Needs confirmation",
              conditions: "No matching source in this fictional sample.",
              source: "Unknown — absent from sample",
              policyDate: null,
            },
          ],
          sourceIds: [],
        },
      );
    return result(
      "information",
      "Sample plan explanation only; confirm real eligibility with the provider or insurer.",
      {
        profileId,
        items: rows.map((b) => ({
          id: b.id,
          status: b.status,
          conditions: b.conditions,
          source: b.source,
          policyDate: b.policyDate,
        })),
        sourceIds: rows.map((b) => b.id),
      },
    );
  }
  if (state.carMode === "driving")
    return result("refusal", "Action proposals are available when parked.");
  if (!profile.canManage)
    return result(
      "refusal",
      "This profile is view-only; no action proposal is available.",
    );
  if (typeof actionId !== "string" || !actionId.trim())
    return result("clarification", "Provide a unique actionId.");
  if ((state.appliedActions || []).includes(actionId))
    return result(
      "refusal",
      "This action was already applied; do not submit it again.",
    );
  if (
    !Number.isFinite(Date.parse(input.scheduledAt)) ||
    Date.parse(input.scheduledAt) <= Date.parse(state.now)
  )
    return result(
      "clarification",
      "Choose a valid future scheduledAt with a timezone offset.",
    );
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt))
    return result(
      "clarification",
      "Use an ISO timestamp with an explicit timezone.",
    );
  if (mode === "appointment") {
    const appt = (state.appointments || []).find(
      (a) => a.id === input.appointmentId && a.profileId === profileId,
    );
    if (!appt)
      return result(
        "refusal",
        "The appointment source is missing or belongs to another profile.",
      );
    if (Date.parse(input.scheduledAt) >= Date.parse(appt.startsAt))
      return result(
        "clarification",
        "Preparation reminder must precede the appointment.",
      );
    if (
      (state.reminders || []).some(
        (r) =>
          r.appointmentId === appt.id &&
          r.category === "Appointment preparation" &&
          !r.deletedAt &&
          !r.outcome,
      )
    )
      return result(
        "information",
        "An active preparation reminder already exists; use the reminder-change skill instead.",
        { profileId, sourceIds: [appt.id] },
      );
    const command = {
      type: "createReminder",
      input: {
        profileId,
        category: "Appointment preparation",
        title: "Prepare for " + appt.title,
        scheduledAt: input.scheduledAt,
        recurrence: "None",
        instructions:
          "Review the appointment details and your existing checklist.",
        appointmentId: appt.id,
      },
    };
    return result(
      "proposal",
      "Review and confirm in CareBuddy before saving. This does not book or confirm an appointment.",
      {
        expectedClock,
        action: {
          id: actionId,
          profileId,
          command,
          sourceIds: [appt.id],
          expectedClock,
          expectedSources: [appt],
          label: "Prepare for " + appt.title,
        },
        providerConfirmed: false,
      },
    );
  }
  if (input.userRequestedTime !== true)
    return result(
      "clarification",
      "Confirm that this is a time explicitly requested by the user; do not generate medication scheduling advice.",
    );
  const reminder = (state.reminders || []).find(
    (r) =>
      r.id === input.reminderId && r.profileId === profileId && !r.deletedAt,
  );
  if (!reminder)
    return result(
      "refusal",
      "The reminder source is missing, deleted or belongs to another profile.",
    );
  if (reminder.outcome)
    return result("refusal", "A recorded reminder cannot be rescheduled.");
  if (!["occurrence", "future"].includes(input.scope))
    return result(
      "clarification",
      "Choose occurrence or future scope explicitly.",
    );
  const command = {
    type: "editReminder",
    id: reminder.id,
    scope: input.scope,
    input: {
      profileId,
      category: reminder.category,
      title: reminder.title,
      scheduledAt: input.scheduledAt,
      recurrence: reminder.recurrence,
      instructions: reminder.instructions,
      appointmentId: reminder.appointmentId,
    },
  };
  return result(
    "proposal",
    "Review the recipient, time and recurrence scope in CareBuddy, then confirm. No action has been saved.",
    {
      expectedClock,
      action: {
        id: actionId,
        profileId,
        command,
        sourceIds: [reminder.id],
        expectedClock,
        expectedSources: [reminder],
        label: "Change " + reminder.title,
      },
    },
  );
}
try {
  const value = JSON.parse(readFileSync(0, "utf8"));
  console.log(JSON.stringify(run(value), null, 2));
} catch {
  console.log(
    JSON.stringify(
      result("refusal", "Invalid JSON input; no action was performed."),
    ),
  );
  process.exitCode = 1;
}
