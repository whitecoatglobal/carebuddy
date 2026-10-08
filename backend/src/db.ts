import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  emptyState,
  materialize,
  validateState,
  seedDemoBenefits,
  type State,
} from "care-buddy-shared";

const DB_DIR = process.env.DB_DIR || path.resolve(process.cwd(), "../data");
const DB_PATH = path.join(DB_DIR, "care-buddy.db");

mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS state_snapshots (
  client_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES state_snapshots(client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_client ON chat_messages(client_id, timestamp);

CREATE TABLE IF NOT EXISTS health_vitals (
  client_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  systolic REAL NOT NULL,
  diastolic REAL NOT NULL,
  pulse_bpm REAL NOT NULL,
  temperature_c REAL NOT NULL,
  oxygen_percent REAL NOT NULL,
  breathing_per_minute REAL NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('demo', 'device', 'manual')),
  PRIMARY KEY (client_id, profile_id),
  FOREIGN KEY (client_id) REFERENCES state_snapshots(client_id) ON DELETE CASCADE
);
`);

// New browser rows default to allowed. Visibility is never sourced from uploaded state.
// Explicit INSERT values also support existing databases whose SQL column default was 0.
const columns = db.pragma("table_info(state_snapshots)") as Array<{
  name: string;
}>;
if (!columns.some((column) => column.name === "is_visible")) {
  db.exec(
    "ALTER TABLE state_snapshots ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))",
  );
}
if (!columns.some((column) => column.name === "clock_mode")) {
  db.exec(
    "ALTER TABLE state_snapshots ADD COLUMN clock_mode TEXT NOT NULL DEFAULT 'live' CHECK (clock_mode IN ('live', 'reference'))",
  );
}

export type ClockMode = "live" | "reference";

// Domain schedules use Singapore local dates and +08:00 timestamps.
export function liveNow(): string {
  return (
    new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19) + "+08:00"
  );
}

function projectClock(state: State, mode: ClockMode): State {
  state.clockMode = mode;
  if (mode === "live") state.now = liveNow();
  return materialize(state);
}

export function isClientVisible(clientId: string): boolean {
  const row = db
    .prepare("SELECT is_visible FROM state_snapshots WHERE client_id = ?")
    .get(clientId) as { is_visible: number } | undefined;
  return row?.is_visible === 1;
}

export function registerClientId(clientId: string): void {
  const fresh = emptyState();
  fresh.started = true;
  db.prepare(
    "INSERT OR IGNORE INTO state_snapshots(client_id, state_json, updated_at, is_visible) VALUES (?, ?, ?, 1)",
  ).run(clientId, JSON.stringify(fresh), new Date().toISOString());
}

export interface StoredState {
  clientId: string;
  stateJson: string;
  updatedAt: string;
  revision: number;
  clockMode: ClockMode;
}

export function ensureClientState(clientId: string): State {
  const row = loadStateRow(clientId);
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.stateJson);
      if (validateState(parsed)) {
        const seeded = seedDemoBenefits(
          parsed,
          row.clockMode === "live" ? liveNow() : parsed.now,
        );
        if (seeded !== parsed) {
          const result = db
            .prepare(
              `UPDATE state_snapshots
             SET state_json = ?, revision = revision + 1, updated_at = ?
             WHERE client_id = ? AND revision = ?`,
            )
            .run(
              JSON.stringify(seeded),
              new Date().toISOString(),
              clientId,
              row.revision,
            );
          if (!result.changes) return ensureClientState(clientId);
        }
        return projectClock(seeded, row.clockMode);
      }
    } catch {
      throw new Error("Saved care data could not be read");
    }
    throw new Error("Saved care data is invalid");
  }
  const fresh = emptyState();
  fresh.started = true;
  fresh.now = liveNow();
  upsertState(clientId, JSON.stringify(fresh));
  return projectClock(fresh, "live");
}

export function loadStateRow(clientId: string): StoredState | null {
  const row = db
    .prepare<
      [string],
      {
        client_id: string;
        state_json: string;
        updated_at: string;
        revision: number;
        clock_mode: ClockMode;
      }
    >(
      "SELECT client_id, state_json, updated_at, revision, clock_mode FROM state_snapshots WHERE client_id = ?",
    )
    .get(clientId);
  return row
    ? {
        clientId: row.client_id,
        stateJson: row.state_json,
        updatedAt: row.updated_at,
        revision: row.revision,
        clockMode: row.clock_mode,
      }
    : null;
}

export function upsertState(clientId: string, stateJson: string): StoredState {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO state_snapshots (client_id, state_json, updated_at, is_visible)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(client_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).run(clientId, stateJson, now);
  return {
    clientId,
    stateJson,
    updatedAt: now,
    revision: loadStateRow(clientId)!.revision,
    clockMode: loadStateRow(clientId)!.clockMode,
  };
}

export interface StoredChat {
  id: string;
  clientId: string;
  profileId: string;
  role: string;
  text: string;
  timestamp: string;
}

export function appendChat(
  clientId: string,
  message: {
    id: string;
    profileId: string;
    role: string;
    text: string;
    timestamp: string;
  },
): void {
  db.prepare(
    `INSERT OR IGNORE INTO chat_messages (id, client_id, profile_id, role, text, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    message.id,
    clientId,
    message.profileId,
    message.role,
    message.text,
    message.timestamp,
  );
}

export function listChats(clientId: string): StoredChat[] {
  const rows = db
    .prepare<
      [string],
      {
        id: string;
        client_id: string;
        profile_id: string;
        role: string;
        text: string;
        timestamp: string;
      }
    >(
      "SELECT id, client_id, profile_id, role, text, timestamp FROM chat_messages WHERE client_id = ? ORDER BY timestamp ASC",
    )
    .all(clientId);
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    profileId: r.profile_id,
    role: r.role,
    text: r.text,
    timestamp: r.timestamp,
  }));
}

export { db };

// Migrations preserve the browser visibility flag and the original care JSON.
if (!columns.some((column) => column.name === "revision")) {
  db.exec(
    "ALTER TABLE state_snapshots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0",
  );
}
db.exec(`
CREATE TABLE IF NOT EXISTS browser_command_receipts (
 client_id TEXT NOT NULL, action_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 PRIMARY KEY(client_id, action_id)
);
CREATE TABLE IF NOT EXISTS browser_buddy_requests (
 client_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL,
 PRIMARY KEY(client_id, request_id)
);
CREATE TABLE IF NOT EXISTS browser_pending_proposals (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, profile_id TEXT NOT NULL,
 command_json TEXT NOT NULL, label TEXT NOT NULL, revision INTEGER NOT NULL,
 expires_at TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0
);
`);
