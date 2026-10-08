import {
  execute,
  materialize,
  uid,
  validateState,
  type State,
  type Command,
  type ChatMessage,
  type Action,
} from "care-buddy-shared";
import {
  db,
  loadStateRow,
  ensureClientState,
  upsertState,
  appendChat,
} from "./db.js";
import { parseCommand } from "./commands.js";
export class PersistenceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function snapshot(clientId: string) {
  return {
    state: ensureClientState(clientId),
    revision: loadStateRow(clientId)!.revision,
  };
}
function save(clientId: string, state: State, revision: number) {
  upsertState(clientId, JSON.stringify(state));
  db.prepare("UPDATE state_snapshots SET revision=? WHERE client_id=?").run(
    revision,
    clientId,
  );
  return { state: materialize(state), revision };
}
export function bootstrap(
  clientId: string,
  raw: unknown,
  expectedRevision: unknown,
) {
  return db.transaction(() => {
    const current = snapshot(clientId);
    if (
      expectedRevision !== 0 ||
      current.revision !== 0 ||
      current.state.profiles.length
    )
      throw new PersistenceError(
        "This browser already has saved care data. Refresh to load it.",
        409,
      );
    if (!validateState(raw))
      throw new PersistenceError("Invalid initial care state");
    // Initial migration is allowed only once. Browser visibility is a separate column.
    const state = structuredClone(raw);
    state.chats = [];
    state.appliedActions = [];
    return save(clientId, state, 1);
  })();
}
function validateProfile(
  state: State,
  profileId: unknown,
  command: Command,
  ai = false,
) {
  if (typeof profileId !== "string" || profileId.length > 160)
    throw new PersistenceError("Missing profileId");
  const p = state.profiles.find((p) => p.id === profileId);
  if (command.type === "createSelfProfile" && !state.profiles.length) return;
  if (!p?.canView) throw new PersistenceError("This profile is not available");
  if (ai && !p.canManage)
    throw new PersistenceError(
      "You can view this profile, but cannot save changes for it",
      403,
    );
  if ("input" in command && command.input.profileId !== profileId)
    throw new PersistenceError("This action belongs to a different profile");
  if (command.type === "chatMessage") {
    if (command.message.profileId !== profileId)
      throw new PersistenceError("This chat belongs to a different profile");
    if (
      command.message.contextId &&
      ![...state.reminders, ...state.appointments, ...state.benefits].some(
        (r) => r.id === command.message.contextId && r.profileId === profileId,
      )
    )
      throw new PersistenceError("This care record is unavailable");
  }
  if ("id" in command) {
    const collections: Record<
      string,
      Array<{ id: string; profileId?: string }>
    > = {
      updateDependent: state.profiles,
      removeDependent: state.profiles,
      toggleChecklist: state.appointments,
      editAppointment: state.appointments,
      markNotificationRead: state.notifications,
    };
    const rows = collections[command.type] ?? state.reminders;
    const r = rows.find((r) => r.id === command.id);
    if (
      !r ||
      (r.profileId !== undefined && r.profileId !== profileId) ||
      (ai && r.profileId === undefined && r.id !== profileId)
    )
      throw new PersistenceError(
        "This care record is unavailable for this profile",
      );
  }
  if (command.type !== "selectProfile" && state.selectedProfileId !== profileId)
    throw new PersistenceError(
      "Selected profile changed. Review this action.",
      409,
    );
}
function apply(
  clientId: string,
  state: State,
  command: Command,
  actionId: string,
  profileId: string,
) {
  validateProfile(state, profileId, command);
  const timestamp = new Date().toISOString();
  if (command.type === "chatMessage")
    command = {
      ...command,
      message: { ...command.message, timestamp, role: "user" },
    };
  const previous = new Set(
    [
      ...state.activity,
      ...state.reminders.flatMap((r) => r.history),
      ...state.appointments.flatMap((a) => a.provenanceHistory),
    ].map((a) => a.id),
  );
  let next: State;
  try {
    next = execute(
      state,
      command,
      actionId,
      command.type === "selectProfile" ? undefined : profileId,
    );
  } catch (e) {
    throw new PersistenceError(
      e instanceof Error ? e.message : "Invalid care change",
    );
  }
  const stamp = (a: State["activity"][number]) =>
    previous.has(a.id) ? a : { ...a, actor: clientId, at: timestamp };
  next.activity = next.activity.map(stamp);
  next.reminders = next.reminders.map((r) => ({
    ...r,
    history: r.history.map(stamp),
    ...(command.type === "completeReminder" && r.id === command.id
      ? { recordedBy: clientId, recordedAt: timestamp }
      : {}),
  }));
  next.appointments = next.appointments.map((a) => ({
    ...a,
    provenanceHistory: a.provenanceHistory.map(stamp),
  }));
  if (command.type === "chatMessage") appendChat(clientId, command.message);
  return next;
}
export function runCommand(clientId: string, raw: any) {
  return db.transaction(() => {
    if (
      !raw ||
      Object.keys(raw).some(
        (k) =>
          !["command", "actionId", "profileId", "expectedRevision"].includes(k),
      )
    )
      throw new PersistenceError("Invalid command request");
    const command = parseCommand(raw.command);
    if (
      typeof raw.actionId !== "string" ||
      !raw.actionId.length ||
      raw.actionId.length > 160 ||
      !Number.isInteger(raw.expectedRevision) ||
      raw.expectedRevision < 0
    )
      throw new PersistenceError("Invalid action or revision");
    const fingerprint = JSON.stringify({ command, profileId: raw.profileId });
    const receipt = db
      .prepare(
        "SELECT fingerprint FROM browser_command_receipts WHERE client_id=? AND action_id=?",
      )
      .get(clientId, raw.actionId) as { fingerprint: string } | undefined;
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new PersistenceError(
          "This action ID was already used for another change",
          409,
        );
      return snapshot(clientId);
    }
    const current = snapshot(clientId);
    if (current.revision !== raw.expectedRevision)
      throw new PersistenceError(
        "Care data changed. Refresh and review this change.",
        409,
      );
    const next = apply(clientId, current.state, command, uid(), raw.profileId);
    const revision =
      current.revision +
      (["selectProfile", "chatMessage", "setCarMode"].includes(command.type)
        ? 0
        : 1);
    const result = save(clientId, next, revision);
    db.prepare("INSERT INTO browser_command_receipts VALUES(?,?,?)").run(
      clientId,
      raw.actionId,
      fingerprint,
    );
    return result;
  })();
}
export function storeChat(
  clientId: string,
  profileId: string,
  text: string,
  role: "user" | "assistant",
  action?: Action,
  actionReceipt?: ChatMessage["actionReceipt"],
  operationStatus?: "not_changed" | "pending_confirmation" | "saved",
) {
  const current = snapshot(clientId);
  const message: ChatMessage = {
    id: uid(),
    profileId,
    role,
    text,
    contextId: null,
    timestamp: new Date().toISOString(),
    ...(action ? { action } : {}),
    ...(actionReceipt ? { actionReceipt } : {}),
    ...(operationStatus ? { operationStatus } : {}),
  };
  current.state.chats.push(message);
  appendChat(clientId, message);
  return save(clientId, current.state, current.revision);
}
export function replayBuddy(
  clientId: string,
  requestId: string,
  fingerprint: string,
) {
  const row = db
    .prepare(
      "SELECT fingerprint,response_json FROM browser_buddy_requests WHERE client_id=? AND request_id=?",
    )
    .get(clientId, requestId) as
    { fingerprint: string; response_json: string } | undefined;
  if (!row) return;
  if (row.fingerprint !== fingerprint)
    throw new PersistenceError(
      "This request ID was already used for another Buddy request",
      409,
    );
  return { ...JSON.parse(row.response_json), ...snapshot(clientId) };
}
function savedCommandText(command: Command, state: State, profileId: string) {
  const person =
    state.profiles.find((p) => p.id === profileId)?.displayName ??
    "this profile";
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Singapore",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(new Date(value))
      .toLowerCase()
      .replace(":00", "")
      .replace(/\s/g, "");
  switch (command.type) {
    case "createReminder":
    case "editReminder": {
      const time = formatTime(command.input.scheduledAt);
      const timing =
        command.input.recurrence === "Daily" &&
        (command.type === "createReminder" || command.scope === "future")
          ? `${time} daily`
          : `${time} on ${new Intl.DateTimeFormat("en", { timeZone: "Asia/Singapore", year: "numeric", month: "short", day: "numeric" }).format(new Date(command.input.scheduledAt))}`;
      return `${command.type === "createReminder" ? "Created" : "Updated"} **${command.input.title}** for **${person}** to ${timing}${command.type === "editReminder" && command.scope === "occurrence" ? " for this occurrence" : ""}.`;
    }
    case "completeReminder":
      return `Recorded **${state.reminders.find((r) => r.id === command.id)?.title}** as ${command.outcome} for **${person}**.`;
    case "undoCompletion":
      return `Undid the recorded outcome for **${state.reminders.find((r) => r.id === command.id)?.title}** for **${person}**.`;
    case "snoozeReminder":
      return `Snoozed **${state.reminders.find((r) => r.id === command.id)?.title}** to ${formatTime(command.until)} for **${person}**.`;
    case "addDependent":
      return `Added **${command.displayName}** as a ${command.relationship.toLowerCase()} in your family care records.`;
    case "updateDependent":
      return `Updated family details for **${command.patch.displayName ?? person}**.`;
    case "toggleChecklist":
      return `Updated appointment checklist item ${command.index + 1} for **${person}**.`;
    case "editAppointment":
      return `Updated **${command.title}** to ${formatTime(command.startsAt)} for **${person}** in your appointment records.`;
    case "addBenefitNote":
      return `Added your **${command.category}** benefit note for **${person}**.`;
    case "setPreference":
      return `Updated ${command.key === "genericReminders" ? "generic reminders" : "spoken reminders"} to ${command.value ? "on" : "off"}.`;
    default:
      throw new PersistenceError("Unsupported Buddy change");
  }
}
export function persistBuddy(
  clientId: string,
  profileId: string,
  message: string,
  result: { text: string; action?: Action },
  expectedRevision: number,
  requestId: string,
  fingerprint: string,
) {
  return db.transaction(() => {
    const replay = replayBuddy(clientId, requestId, fingerprint);
    if (replay) return replay;
    const current = snapshot(clientId);
    if (current.revision !== expectedRevision)
      throw new PersistenceError(
        "Care data changed while Buddy was replying. Please try again.",
        409,
      );
    let text = result.text;
    let receipt: ChatMessage["actionReceipt"];
    const operationStatus = result.action
      ? ("saved" as const)
      : ("not_changed" as const);
    if (result.action) {
      const command = parseCommand(result.action.command, { aiOnly: true });
      validateProfile(current.state, profileId, command, true);
      text = savedCommandText(command, current.state, profileId);
      const next = apply(
        clientId,
        current.state,
        command,
        result.action.id,
        profileId,
      );
      save(clientId, next, current.revision + 1);
      receipt = {
        actionId: result.action.id,
        sourceIds: result.action.sourceIds ?? [],
        profileId,
        actor: clientId,
        operation: command.type,
        confirmation: false,
        authorization: "chat_request",
        outcome: "Saved",
        timestamp: new Date().toISOString(),
      };
    }
    storeChat(clientId, profileId, message, "user");
    const saved = storeChat(
      clientId,
      profileId,
      text,
      "assistant",
      undefined,
      receipt,
      operationStatus,
    );
    const response = {
      text,
      operationStatus,
      ...(receipt ? { actionReceipt: receipt } : {}),
    };
    db.prepare("INSERT INTO browser_buddy_requests VALUES(?,?,?,?)").run(
      clientId,
      requestId,
      fingerprint,
      JSON.stringify(response),
    );
    return { ...response, ...saved };
  })();
}
export function confirm(clientId: string, id: string, profileId: unknown) {
  return db.transaction(() => {
    const proposal = db
      .prepare(
        "SELECT * FROM browser_pending_proposals WHERE id=? AND client_id=?",
      )
      .get(id, clientId) as any;
    if (!proposal)
      throw new PersistenceError("This proposed change is unavailable", 404);
    if (proposal.profile_id !== profileId)
      throw new PersistenceError(
        "This proposal belongs to a different profile",
        409,
      );
    if (proposal.confirmed)
      return { ...snapshot(clientId), operationStatus: "saved" as const };
    const current = snapshot(clientId);
    if (Date.parse(proposal.expires_at) <= Date.now())
      throw new PersistenceError(
        "This proposal expired. Ask Buddy to prepare it again.",
        409,
      );
    if (current.revision !== proposal.revision)
      throw new PersistenceError(
        "Care data changed. Ask Buddy to review this change again.",
        409,
      );
    const command = parseCommand(JSON.parse(proposal.command_json), {
      aiOnly: true,
    });
    validateProfile(current.state, profileId, command, true);
    const next = apply(
      clientId,
      current.state,
      command,
      id,
      profileId as string,
    );
    save(clientId, next, current.revision + 1);
    db.prepare(
      "UPDATE browser_pending_proposals SET confirmed=1 WHERE id=? AND client_id=?",
    ).run(id, clientId);
    const saved = storeChat(
      clientId,
      profileId as string,
      `Saved. ${proposal.label}.`,
      "assistant",
      undefined,
      {
        actionId: id,
        sourceIds: "id" in command ? [command.id] : [],
        profileId: profileId as string,
        actor: clientId,
        operation: command.type,
        confirmation: true,
        outcome: "Saved",
        timestamp: new Date().toISOString(),
      },
      "saved",
    );
    return { ...saved, operationStatus: "saved" as const };
  })();
}
