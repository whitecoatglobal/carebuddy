import { z } from "zod";
import type { Command } from "care-buddy-shared";

export class CommandValidationError extends Error {
  readonly status = 400;
  readonly code = "INVALID_COMMAND";
  constructor() {
    super("Invalid care change. Check the required details and try again.");
  }
}
const id = z.string().trim().min(1).max(160);
const time = z.iso.datetime({ offset: true });
const title = z.string().trim().min(3).max(80);
const notes = z.string().max(500);
const category = z.enum([
  "Medication",
  "Bedtime",
  "Personal care",
  "Appointment preparation",
  "Other",
]);
const relationship = z.enum(["Parent", "Child", "Partner", "Other"]);
const reminder = z.strictObject({
  profileId: id,
  category,
  title,
  scheduledAt: time,
  recurrence: z.enum(["None", "Daily"]),
  instructions: notes,
  appointmentId: id.nullable().optional(),
});
const checklistItem = z.strictObject({
  id,
  label: z.string().trim().min(1).max(160),
  completed: z.boolean(),
});

export const commandSchemas = {
  start: z.strictObject({ type: z.literal("start") }),
  reset: z.strictObject({ type: z.literal("reset") }),
  selectProfile: z.strictObject({
    type: z.literal("selectProfile"),
    profileId: id,
  }),
  createReminder: z.strictObject({
    type: z.literal("createReminder"),
    input: reminder,
  }),
  editReminder: z.strictObject({
    type: z.literal("editReminder"),
    id,
    input: reminder,
    scope: z.enum(["occurrence", "future"]),
  }),
  completeReminder: z.strictObject({
    type: z.literal("completeReminder"),
    id,
    outcome: z.enum(["taken", "complete", "skipped"]),
    reason: z.string().max(500).optional(),
  }),
  undoCompletion: z.strictObject({ type: z.literal("undoCompletion"), id }),
  snoozeReminder: z.strictObject({
    type: z.literal("snoozeReminder"),
    id,
    until: time,
  }),
  deleteReminder: z.strictObject({ type: z.literal("deleteReminder"), id }),
  undoDeletion: z.strictObject({ type: z.literal("undoDeletion"), id }),
  addDependent: z.strictObject({
    type: z.literal("addDependent"),
    displayName: z.string().trim().min(2).max(40),
    relationship,
    acknowledged: z.boolean(),
    canManage: z.boolean().optional(),
  }),
  updateDependent: z.strictObject({
    type: z.literal("updateDependent"),
    id,
    patch: z
      .strictObject({
        displayName: z.string().trim().min(2).max(40).optional(),
        relationship: relationship.optional(),
        canManage: z.boolean().optional(),
      })
      .refine((p) => Object.keys(p).length > 0),
  }),
  removeDependent: z.strictObject({ type: z.literal("removeDependent"), id }),
  toggleChecklist: z.strictObject({
    type: z.literal("toggleChecklist"),
    id,
    index: z.number().int().min(0).max(19),
  }),
  updateChecklist: z.strictObject({
    type: z.literal("updateChecklist"),
    id,
    items: z
      .array(checklistItem)
      .min(1)
      .max(20)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length),
  }),
  createAppointment: z.strictObject({
    type: z.literal("createAppointment"),
    input: z.strictObject({
      profileId: id,
      category: z.string().trim().min(1).max(80),
      title,
      startsAt: time,
      locationLabel: z.string().max(80),
    }),
  }),
  editAppointment: z.strictObject({
    type: z.literal("editAppointment"),
    id,
    title,
    startsAt: time,
    locationLabel: z.string().max(80),
  }),
  addBenefitNote: z.strictObject({
    type: z.literal("addBenefitNote"),
    category: z.string().trim().min(1).max(80),
    notes,
  }),
  updateBenefitNote: z.strictObject({
    type: z.literal("updateBenefitNote"),
    id,
    notes,
  }),
  markNotificationRead: z.strictObject({
    type: z.literal("markNotificationRead"),
    id,
  }),
  setPreference: z.strictObject({
    type: z.literal("setPreference"),
    key: z.enum(["genericReminders", "spokenReminders"]),
    value: z.boolean(),
  }),
  setCarMode: z.strictObject({
    type: z.literal("setCarMode"),
    mode: z.enum(["disconnected", "parked", "driving"]),
  }),
  urgentViewed: z.strictObject({ type: z.literal("urgentViewed") }),
};

const aiSchemas = {
  createReminder: commandSchemas.createReminder,
  editReminder: commandSchemas.editReminder,
  completeReminder: commandSchemas.completeReminder,
  undoCompletion: commandSchemas.undoCompletion,
  snoozeReminder: commandSchemas.snoozeReminder,
  addDependent: commandSchemas.addDependent.omit({ canManage: true }),
  updateDependent: z.strictObject({
    type: z.literal("updateDependent"),
    id,
    patch: z
      .strictObject({
        displayName: z.string().trim().min(2).max(40).optional(),
        relationship: relationship.optional(),
      })
      .refine((p) => Object.keys(p).length > 0),
  }),
  updateChecklist: commandSchemas.updateChecklist,
  createAppointment: commandSchemas.createAppointment,
  editAppointment: commandSchemas.editAppointment,
  addBenefitNote: commandSchemas.addBenefitNote,
  updateBenefitNote: commandSchemas.updateBenefitNote,
  setPreference: commandSchemas.setPreference,
};

export function parseCommand(
  raw: unknown,
  options: { aiOnly?: boolean } = {},
): Command {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !("type" in raw) ||
    typeof raw.type !== "string"
  )
    throw new CommandValidationError();
  const schemas = options.aiOnly ? aiSchemas : commandSchemas;
  const schema = Object.prototype.hasOwnProperty.call(schemas, raw.type)
    ? schemas[raw.type as keyof typeof schemas]
    : undefined;
  if (!schema) throw new CommandValidationError();
  const result = schema.safeParse(raw);
  if (!result.success) throw new CommandValidationError();
  return result.data as Command;
}

const descriptions: Record<keyof typeof aiSchemas, string> = {
  createReminder:
    "Propose a new reminder for the selected person. Require a clear future date/time and user-supplied instructions. Ask for missing details. Never invent medication directions.",
  editReminder:
    "Propose changing an existing selected-person reminder by its exact ID. Ask occurrence versus future scope for recurring changes. Keep unchanged fields from server records.",
  completeReminder:
    "Propose recording the user's explicit report of completion, taken or skipped for an existing reminder. Never infer a clinical outcome.",
  undoCompletion:
    "Propose undoing a recorded reminder completion the user asks to undo.",
  snoozeReminder:
    "Propose snoozing the selected-person reminder to a specified future time.",
  addDependent:
    "Propose adding an owned family care profile with display name and relationship. acknowledged=true denotes the pending addition reviewed by the user; no sharing or permissions are granted.",
  updateDependent:
    "Propose changing an existing selected family profile's display name or relationship. Account ownership and permissions cannot change.",
  updateChecklist:
    "Propose the complete custom appointment checklist, preserving existing stable item IDs and completion states unless explicitly changed. Give new items new stable IDs and completed=false. No completion may be inferred.",
  createAppointment:
    "Propose adding an appointment record with title, date/time, category and location. This does not book or confirm a clinic visit.",
  editAppointment:
    "Propose updating the selected person's existing appointment record by exact ID. Keep fields unchanged unless requested. No clinic booking is changed.",
  addBenefitNote:
    "Propose adding a user-entered benefit note. This cannot verify coverage or insurer eligibility.",
  updateBenefitNote:
    "Propose editing an existing benefit note by exact ID without changing authoritative policy or coverage fields.",
  setPreference:
    "Propose changing genericReminders or spokenReminders only when the user explicitly requests the preference change.",
};

export const AI_TOOL_DEFINITIONS = Object.entries(aiSchemas).map(
  ([name, schema]) => {
    const parameters = z.toJSONSchema(schema, { unrepresentable: "any" });
    if (parameters.properties) delete parameters.properties.type;
    if (parameters.required)
      parameters.required = parameters.required.filter((key) => key !== "type");
    return {
      type: "function" as const,
      function: {
        name,
        description: descriptions[name as keyof typeof descriptions],
        parameters,
      },
    };
  },
);

export function commandFromTool(name: string, argumentsJson: string): Command {
  if (
    !Object.prototype.hasOwnProperty.call(aiSchemas, name) ||
    argumentsJson.length > 16_000
  )
    throw new CommandValidationError();
  let args: unknown;
  try {
    args = JSON.parse(argumentsJson);
  } catch {
    throw new CommandValidationError();
  }
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    "type" in args
  )
    throw new CommandValidationError();
  return parseCommand({ ...args, type: name }, { aiOnly: true });
}
