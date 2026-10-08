import {
  execute,
  validateState,
  type State,
  type CarePlan,
  type CareDocument,
} from "care-buddy-shared";
export function careContextKey(state: State, profileId: string): string {
  return JSON.stringify({
    profile: state.profiles.find((p) => p.id === profileId),
    appointments: state.appointments.filter((a) => a.profileId === profileId),
    reminders: state.reminders.filter((r) => r.profileId === profileId),
  });
}
/** Prepare the entire reviewed batch on a clone; caller persists once, only after confirmation. */
export function applyReviewedCarePlan(
  state: State,
  plan: CarePlan,
  document: CareDocument,
  expected: string,
): State {
  const actionId = "care-plan:" + plan.id;
  if (state.selectedProfileId !== plan.profileId)
    throw new Error("The selected person changed. Reopen their plan.");
  const profile = state.profiles.find((p) => p.id === plan.profileId);
  if (!profile?.canView || !profile.canManage)
    throw new Error("Manage access is required to save this plan.");
  if (state.appliedActions.includes(actionId)) return state;
  if (careContextKey(state, plan.profileId) !== expected)
    throw new Error(
      "Care records changed. Refresh the review before confirming.",
    );
  if (state.carMode === "driving") throw new Error("Available when parked.");
  if (!plan.actions.length || plan.actions.length > 12)
    throw new Error("Select between one and twelve actions.");
  if (new Set(plan.actions.map((a) => a.id)).size !== plan.actions.length)
    throw new Error("Duplicate action identifiers.");
  let next = structuredClone(state);
  const now = new Date().toISOString();
  next.now = now;
  for (const a of plan.actions) {
    if (
      !a.evidence.length ||
      a.evidence.some(
        (e) =>
          !e.quote.trim() ||
          !document.pages
            .find((p) => p.page === e.page)
            ?.text.includes(e.quote),
      )
    )
      throw new Error("An action is missing matching source evidence.");
    if (
      a.title.trim().length < 3 ||
      a.title.length > 80 ||
      a.instructions.length > 500 ||
      (a.location?.length ?? 0) > 80
    )
      throw new Error("Check the title, location and instruction lengths.");
    if (
      !a.scheduledAt ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(a.scheduledAt) ||
      !Number.isFinite(Date.parse(a.scheduledAt)) ||
      Date.parse(a.scheduledAt) <= Date.now()
    )
      throw new Error(
        "Every selected action needs an explicit future date and time.",
      );
    if (!["None", "Daily"].includes(a.recurrence))
      throw new Error("Choose a supported repeat setting.");
    const title = a.title.trim();
    const provenance = {
      id: crypto.randomUUID(),
      subject: plan.profileId,
      actor: "p-me",
      at: now,
      text: `Reviewed ${plan.kind === "postVisit" ? "post-visit" : "document"} plan: ${document.name}. ${a.evidence.map((e) => `Page ${e.page}: ${e.quote}`).join(" ")}`,
    };
    if (a.type === "appointment") {
      if (
        next.appointments.some(
          (x) =>
            x.profileId === plan.profileId &&
            x.title.toLowerCase() === title.toLowerCase() &&
            Date.parse(x.startsAt) === Date.parse(a.scheduledAt!),
        )
      )
        throw new Error(
          "A matching appointment already exists. Deselect it before saving.",
        );
      next.appointments.push({
        id: "care-" + plan.id + "-" + a.id,
        profileId: plan.profileId,
        category: "Other",
        title,
        startsAt: a.scheduledAt,
        locationLabel: a.location || "",
        preparationNotes: a.instructions,
        checklist: [false, false, false],
        recordOrigin: "user-saved",
        providerConfirmed: false,
        provenanceHistory: [provenance],
      });
    } else if (a.type === "reminder") {
      if (
        next.reminders.some(
          (x) =>
            x.profileId === plan.profileId &&
            !x.deletedAt &&
            x.title.toLowerCase() === title.toLowerCase() &&
            Date.parse(x.scheduledAt) === Date.parse(a.scheduledAt!),
        )
      )
        throw new Error(
          "A matching reminder already exists. Deselect it before saving.",
        );
      const existingIds = new Set(next.reminders.map((r) => r.id));
      next = execute(
        next,
        {
          type: "createReminder",
          input: {
            profileId: plan.profileId,
            title,
            category: "Other",
            scheduledAt: a.scheduledAt,
            recurrence: a.recurrence,
            instructions: a.instructions,
          },
        },
        actionId + ":" + a.id,
        plan.profileId,
      );
      const created = next.reminders.find(
        (r) =>
          !existingIds.has(r.id) &&
          r.profileId === plan.profileId &&
          r.title === title &&
          r.scheduledAt === a.scheduledAt,
      );
      if (!created)
        throw new Error(
          "The new reminder could not be identified. Nothing was saved.",
        );
      created.history.push(provenance);
    } else throw new Error("Unsupported plan action.");
    if (!next.appliedActions.includes(actionId + ":" + a.id))
      next.appliedActions.push(actionId + ":" + a.id);
    next.activity.push(provenance);
  }
  next.appliedActions.push(actionId);
  if (!validateState(next))
    throw new Error(
      "The reviewed plan could not be validated. Nothing was saved.",
    );
  return next;
}
