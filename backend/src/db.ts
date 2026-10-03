import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seed, emptyState, materialize, validateState, type State } from "care-buddy-shared";

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
`);

export interface StoredState {
  clientId: string;
  stateJson: string;
  updatedAt: string;
}

export function ensureClientState(clientId: string): State {
  const row = loadStateRow(clientId);
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.stateJson);
      if (validateState(parsed)) {
        return materialize(parsed as State);
      }
    } catch {
      // fall through to seed
    }
  }
  const fresh = emptyState();
  fresh.started = true;
  upsertState(clientId, JSON.stringify(fresh));
  return fresh;
}

export function loadStateRow(clientId: string): StoredState | null {
  const row = db
    .prepare<
      [string],
      { client_id: string; state_json: string; updated_at: string }
    >("SELECT client_id, state_json, updated_at FROM state_snapshots WHERE client_id = ?")
    .get(clientId);
  return row
    ? {
        clientId: row.client_id,
        stateJson: row.state_json,
        updatedAt: row.updated_at,
      }
    : null;
}

export function upsertState(clientId: string, stateJson: string): StoredState {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO state_snapshots (client_id, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).run(clientId, stateJson, now);
  return { clientId, stateJson, updatedAt: now };
}

export function listClientIds(): string[] {
  const rows = db
    .prepare<[], { client_id: string }>("SELECT client_id FROM state_snapshots ORDER BY updated_at DESC")
    .all();
  return rows.map((r) => r.client_id);
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
  message: { id: string; profileId: string; role: string; text: string; timestamp: string },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO chat_messages (id, client_id, profile_id, role, text, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(message.id, clientId, message.profileId, message.role, message.text, message.timestamp);
}

export function listChats(clientId: string): StoredChat[] {
  const rows = db
    .prepare<
      [string],
      { id: string; client_id: string; profile_id: string; role: string; text: string; timestamp: string }
    >("SELECT id, client_id, profile_id, role, text, timestamp FROM chat_messages WHERE client_id = ? ORDER BY timestamp ASC")
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
