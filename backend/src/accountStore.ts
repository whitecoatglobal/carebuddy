import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyState,
  validateState,
  materialize,
  execute,
  type State,
  type Command,
  type Receipt,
} from "care-buddy-shared";
import { hashToken, token, SESSION_MS } from "./auth.js";
import { parseCommand } from "./commands.js";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface User {
  id: string;
  username: string;
  displayName: string;
  timeZone: string;
}
export interface Session {
  user: User;
  csrfToken: string;
}
export interface Snapshot {
  state: State;
  revision: number;
  schedulingWarning?: string;
}
export interface Proposal {
  id: string;
  owner_id: string;
  profile_id: string;
  command_json: string;
  revision: number;
  expires_at: string;
  status: string;
  metadata_json: string;
}
export class AccountStore {
  readonly db: Database.Database;
  constructor(
    filename = path.resolve(
      process.env.DB_DIR || path.resolve(process.cwd(), "../data"),
      "care-buddy.db",
    ),
  ) {
    if (filename !== ":memory:")
      mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,time_zone TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),csrf_token TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS account_states(user_id TEXT PRIMARY KEY REFERENCES accounts(id),state_json TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS pending_proposals(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES accounts(id),profile_id TEXT NOT NULL,command_json TEXT NOT NULL,revision INTEGER NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL,metadata_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS account_actions(user_id TEXT NOT NULL REFERENCES accounts(id),action_id TEXT NOT NULL,payload_json TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(user_id,action_id));
 CREATE TABLE IF NOT EXISTS account_audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),actor_id TEXT NOT NULL,profile_id TEXT NOT NULL,action_id TEXT NOT NULL,command_json TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  createAccount(
    username: string,
    displayName: string,
    timeZone: string,
    salt: string,
    hash: string,
  ): User {
    return this.db.transaction(() => {
      if (this.findAccount(username))
        throw new ApiError(409, "Username is already registered");
      const user = { id: randomUUID(), username, displayName, timeZone };
      this.db
        .prepare("INSERT INTO accounts VALUES(?,?,?,?,?,?,?)")
        .run(
          user.id,
          username,
          displayName,
          timeZone,
          salt,
          hash,
          new Date().toISOString(),
        );
      const state = emptyState();
      state.started = true;
      state.selectedProfileId = "p-me";
      state.profiles = [
        {
          id: "p-me",
          displayName,
          relationship: "Me",
          canView: true,
          canManage: true,
        },
      ];
      this.db
        .prepare("INSERT INTO account_states VALUES(?,?,0)")
        .run(user.id, JSON.stringify(state));
      return user;
    })();
  }
  findAccount(username: string) {
    return this.db
      .prepare("SELECT * FROM accounts WHERE username=?")
      .get(username) as
      | {
          id: string;
          username: string;
          display_name: string;
          time_zone: string;
          password_salt: string;
          password_hash: string;
        }
      | undefined;
  }
  createSession(user: User) {
    const value = token(),
      csrfToken = token();
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(
        hashToken(value),
        user.id,
        csrfToken,
        new Date(Date.now() + SESSION_MS).toISOString(),
      );
    return { value, csrfToken };
  }
  session(value?: string): Session | null {
    if (!value) return null;
    const row = this.db
      .prepare(
        "SELECT a.id,a.username,a.display_name,a.time_zone,s.csrf_token FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(hashToken(value), new Date().toISOString()) as any;
    return row
      ? {
          user: {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            timeZone: row.time_zone,
          },
          csrfToken: row.csrf_token,
        }
      : null;
  }
  logout(value: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(hashToken(value));
  }
  snapshot(userId: string): Snapshot {
    const row = this.db
      .prepare("SELECT state_json,revision FROM account_states WHERE user_id=?")
      .get(userId) as any;
    if (!row) throw new ApiError(401, "Sign in required");
    const account = this.db
      .prepare("SELECT time_zone FROM accounts WHERE id=?")
      .get(userId) as { time_zone: string } | undefined;
    if (!account) throw new ApiError(401, "Sign in required");
    const state: State = JSON.parse(row.state_json);
    state.timeZone = account.time_zone;
    state.now = new Date().toISOString();
    try {
      return {
        state: materialize(structuredClone(state)),
        revision: row.revision,
      };
    } catch (error) {
      return {
        state,
        revision: row.revision,
        schedulingWarning:
          error instanceof Error
            ? error.message
            : "A recurring reminder time needs review.",
      };
    }
  }
  profile(state: State, profileId: string, manage = false) {
    const p = state.profiles.find((p) => p.id === profileId && p.canView);
    if (!p || (manage && !p.canManage))
      throw new ApiError(403, "This profile is not available for this action");
  }
  save(userId: string, state: State, revision: number) {
    this.db
      .prepare(
        "UPDATE account_states SET state_json=?,revision=? WHERE user_id=?",
      )
      .run(JSON.stringify(state), revision, userId);
  }
  selectProfile(userId: string, profileId: string): Snapshot {
    return this.db.transaction(() => {
      const snap = this.snapshot(userId);
      this.profile(snap.state, profileId);
      snap.state.selectedProfileId = profileId;
      this.save(userId, snap.state, snap.revision);
      return snap;
    })();
  }
  chat(
    userId: string,
    profileId: string,
    role: "user" | "assistant",
    text: string,
    contextId: string | null,
  ) {
    return this.db.transaction(() => {
      const snap = this.snapshot(userId);
      this.profile(snap.state, profileId);
      snap.state.chats.push({
        id: randomUUID(),
        profileId,
        role,
        text,
        contextId,
        timestamp: new Date().toISOString(),
      });
      this.save(userId, snap.state, snap.revision);
      return snap;
    })();
  }
  command(
    userId: string,
    command: Command,
    actionId: string,
    revision: number,
    profileId: string,
    metadata: { sourceIds?: string[]; label?: string } = {},
  ) {
    return this.db.transaction(() => {
      const payload = JSON.stringify({
        command,
        profileId,
      });
      const previous = this.db
        .prepare(
          "SELECT payload_json,receipt_json FROM account_actions WHERE user_id=? AND action_id=?",
        )
        .get(userId, actionId) as any;
      if (previous) {
        if (previous.payload_json !== payload)
          throw new ApiError(
            409,
            "Action id was already used for a different request",
          );
        return {
          ...this.snapshot(userId),
          receipt: JSON.parse(previous.receipt_json) as Receipt,
        };
      }
      const snap = this.snapshot(userId);
      if (snap.revision !== revision)
        throw new ApiError(
          409,
          "Care records changed. Review the latest information",
        );
      const householdAdmin = [
        "addDependent",
        "updateDependent",
        "removeDependent",
        "reset",
        "start",
      ].includes(command.type);
      this.profile(
        snap.state,
        profileId,
        !["selectProfile", "markNotificationRead"].includes(command.type) &&
          !householdAdmin,
      );
      const before = structuredClone(snap.state);
      snap.state.selectedProfileId = profileId;
      snap.state.now = new Date().toISOString();
      let after: State;
      try {
        after = execute(snap.state, command, actionId, profileId, userId);
        if (command.type === "reset") {
          const me = before.profiles.find((p) => p.id === "p-me");
          if (!me) throw new ApiError(400, "Account profile unavailable");
          after.profiles = [{ ...me, canView: true, canManage: true }];
          after.selectedProfileId = "p-me";
          after.started = true;
          after.now = snap.state.now;
          after.timeZone = snap.state.timeZone;
        }
      } catch (e) {
        throw new ApiError(
          400,
          e instanceof Error ? e.message : "Invalid care action",
        );
      }
      const next = revision + (command.type === "selectProfile" ? 0 : 1);
      const subject =
        command.type === "addDependent"
          ? (after.profiles.find(
              (p) => !before.profiles.some((old) => old.id === p.id),
            )?.id ?? profileId)
          : command.type === "updateDependent" ||
              command.type === "removeDependent"
            ? command.id
            : profileId;
      const receipt: Receipt = {
        actionId,
        sourceIds:
          metadata.sourceIds ??
          ("id" in command
            ? [command.id]
            : "input" in command &&
                "appointmentId" in command.input &&
                command.input.appointmentId
              ? [command.input.appointmentId]
              : []),
        profileId: subject,
        actor: userId,
        operation: metadata.label ?? command.type,
        confirmation: true,
        outcome: "Saved",
        timestamp: snap.state.now,
      };
      this.save(userId, after, next);
      this.db
        .prepare("INSERT INTO account_actions VALUES(?,?,?,?)")
        .run(userId, actionId, payload, JSON.stringify(receipt));
      this.db
        .prepare("INSERT INTO account_audit VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          userId,
          userId,
          subject,
          actionId,
          JSON.stringify(command),
          JSON.stringify(before),
          JSON.stringify(after),
          receipt.timestamp,
        );
      return { state: after, revision: next, receipt };
    })();
  }
  proposal(
    userId: string,
    profileId: string,
    command: Command,
    revision: number,
    metadata: { sourceIds: string[]; label: string },
  ) {
    return this.db.transaction(() => {
      command = parseCommand(command, { aiOnly: true });
      const snap = this.snapshot(userId);
      if ("input" in command && command.input.profileId !== profileId)
        throw new ApiError(400, "Proposal belongs to a different profile");
      if ("id" in command) {
        const targetId = command.id;
        const record = [
          ...snap.state.profiles,
          ...snap.state.reminders,
          ...snap.state.appointments,
          ...snap.state.benefits,
          ...snap.state.notifications,
        ].find((record) => record.id === targetId);
        const ownerProfile =
          record && ("profileId" in record ? record.profileId : record.id);
        if (ownerProfile !== profileId)
          throw new ApiError(
            400,
            "Proposal source is unavailable for the selected profile",
          );
      }
      if (snap.revision !== revision)
        throw new ApiError(409, "Care records changed during this request");
      this.profile(snap.state, profileId, true);
      snap.state.selectedProfileId = profileId;
      snap.state.now = new Date().toISOString();
      const id = randomUUID(),
        expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      let after;
      try {
        after = execute(snap.state, command, id, profileId, userId);
      } catch (e) {
        throw new ApiError(
          400,
          e instanceof Error ? e.message : "Invalid proposal",
        );
      }
      this.db
        .prepare("INSERT INTO pending_proposals VALUES(?,?,?,?,?,?,?,?)")
        .run(
          id,
          userId,
          profileId,
          JSON.stringify(command),
          revision,
          expiresAt,
          "pending",
          JSON.stringify(metadata),
        );
      return {
        id,
        proposalId: id,
        profileId,
        command,
        ...metadata,
        revision,
        expiresAt,
        preview: proposalPreview(snap.state, after, command),
      };
    })();
  }
  confirm(userId: string, id: string, profileId: string) {
    return this.db.transaction(() => {
      const p = this.db
        .prepare("SELECT * FROM pending_proposals WHERE id=? AND owner_id=?")
        .get(id, userId) as Proposal | undefined;
      if (!p) throw new ApiError(404, "Proposal unavailable");
      if (p.profile_id !== profileId)
        throw new ApiError(403, "Proposal belongs to a different profile");
      if (!["pending", "confirmed"].includes(p.status))
        throw new ApiError(409, "Proposal is no longer pending");
      if (p.status !== "confirmed" && p.expires_at <= new Date().toISOString())
        throw new ApiError(409, "Proposal expired. Ask Buddy again");
      const result = this.command(
        userId,
        JSON.parse(p.command_json),
        p.id,
        p.revision,
        profileId,
        JSON.parse(p.metadata_json),
      );
      if (p.status !== "confirmed") {
        result.state.chats.push({
          id: randomUUID(),
          profileId: result.state.selectedProfileId,
          role: "assistant",
          text: `Saved: ${result.receipt.operation}`,
          contextId: result.receipt.sourceIds[0] ?? null,
          timestamp: result.receipt.timestamp,
          actionReceipt: result.receipt,
        });
        this.save(userId, result.state, result.revision);
      }
      this.db
        .prepare("UPDATE pending_proposals SET status='confirmed' WHERE id=?")
        .run(id);
      return result;
    })();
  }
  /** Administrator-only reviewed import. No HTTP route calls this method. */
  migrate(
    userId: string,
    reviewedState: unknown,
    expectedRevision: number,
    actionId: string,
  ) {
    return this.db.transaction(() => {
      if (!validateState(reviewedState))
        throw new ApiError(400, "Invalid reviewed legacy state");
      const snap = this.snapshot(userId);
      if (snap.revision !== expectedRevision)
        throw new ApiError(
          409,
          "Destination revision changed. Preview the migration again",
        );
      if (
        [
          snap.state.reminders,
          snap.state.appointments,
          snap.state.benefits,
          snap.state.chats,
          snap.state.notifications,
          snap.state.activity,
        ].some((list) => list.length) ||
        snap.state.profiles.length !== 1 ||
        snap.state.profiles[0].id !== "p-me"
      )
        throw new ApiError(409, "Reviewed migration requires an empty account");
      const state = structuredClone(reviewedState);
      if (
        !state.profiles.some((p) => p.id === "p-me" && p.canView && p.canManage)
      )
        throw new ApiError(
          400,
          "Legacy state must include a manageable Me profile",
        );
      state.now = new Date().toISOString();
      state.started = true;
      this.save(userId, state, expectedRevision + 1);
      this.db
        .prepare("INSERT INTO account_audit VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          userId,
          "admin-migration",
          "p-me",
          actionId,
          JSON.stringify({ type: "reviewedLegacyMigration" }),
          JSON.stringify(snap.state),
          JSON.stringify(state),
          state.now,
        );
      return { state, revision: expectedRevision + 1 };
    })();
  }
}

function proposalPreview(
  before: State,
  after: State,
  command: Command,
): { before: unknown; after: unknown } {
  const entities = (s: State) => [
    ...s.reminders,
    ...s.appointments,
    ...s.benefits,
    ...s.profiles,
    ...s.notifications,
  ];
  if ("id" in command)
    return {
      before: entities(before).find((r) => r.id === command.id) ?? null,
      after: entities(after).find((r) => r.id === command.id) ?? null,
    };
  if (command.type === "setPreference")
    return {
      before: { [command.key]: before.preferences[command.key] },
      after: { [command.key]: after.preferences[command.key] },
    };
  if (command.type === "setCarMode")
    return {
      before: { carMode: before.carMode },
      after: { carMode: after.carMode },
    };
  const existing = new Set(entities(before).map((r) => r.id));
  const added = entities(after).filter((r) => !existing.has(r.id));
  if (added.length === 1) return { before: null, after: added[0] };
  if (added.length > 1) return { before: null, after: added };
  return {
    before: { profileId: before.selectedProfileId },
    after: { profileId: after.selectedProfileId },
  };
}
