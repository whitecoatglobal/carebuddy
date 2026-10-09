import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, ensureClientState, isClientVisible } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS notification_connections (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  target TEXT NOT NULL CHECK(target IN ('codex','claude')),
  profile_ids_json TEXT NOT NULL, include_health INTEGER NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
  FOREIGN KEY(client_id) REFERENCES state_snapshots(client_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  connection_id TEXT NOT NULL, alert_id TEXT NOT NULL, delivered_at TEXT NOT NULL,
  PRIMARY KEY(connection_id, alert_id),
  FOREIGN KEY(connection_id) REFERENCES notification_connections(id) ON DELETE CASCADE
);
`);

export type PluginTarget = "codex" | "claude";
export interface NotificationConnection {
  id: string;
  clientId: string;
  target: PluginTarget;
  profileIds: string[];
  includeHealth: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
interface ConnectionRow {
  id: string;
  client_id: string;
  target: PluginTarget;
  profile_ids_json: string;
  include_health: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}
function fromRow(row: ConnectionRow): NotificationConnection {
  return {
    id: row.id,
    clientId: row.client_id,
    target: row.target,
    profileIds: JSON.parse(row.profile_ids_json),
    includeHealth: row.include_health === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createConnection(clientId: string, input: unknown) {
  const value = input as Record<string, unknown> | null;
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["target", "profileIds", "includeHealth"].includes(key),
    ) ||
    !["codex", "claude"].includes(value.target as string) ||
    typeof value.includeHealth !== "boolean" ||
    !Array.isArray(value.profileIds) ||
    !value.profileIds.length ||
    value.profileIds.length > 10 ||
    !value.profileIds.every((id) => typeof id === "string") ||
    new Set(value.profileIds).size !== value.profileIds.length
  )
    throw new Error(
      "Choose an assistant, up to ten people, and your alert preferences.",
    );
  const state = ensureClientState(clientId);
  if (
    !value.profileIds.every((id) =>
      state.profiles.some((p) => p.id === id && p.canView),
    )
  )
    throw new Error("One of these care profiles is no longer available.");
  const active = db
    .prepare(
      "SELECT count(*) AS count FROM notification_connections WHERE client_id=? AND revoked_at IS NULL AND expires_at>?",
    )
    .get(clientId, new Date().toISOString()) as { count: number };
  if (active.count >= 5)
    throw new Error(
      "Revoke an existing connection before adding another. You can have five active connections.",
    );
  const token = "cbn_" + randomBytes(32).toString("base64url");
  const connection: NotificationConnection = {
    id: randomUUID(),
    clientId,
    target: value.target as PluginTarget,
    profileIds: value.profileIds as string[],
    includeHealth: value.includeHealth,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    revokedAt: null,
  };
  db.prepare(
    `INSERT INTO notification_connections
    (id,client_id,token_hash,target,profile_ids_json,include_health,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    connection.id,
    clientId,
    hash(token),
    connection.target,
    JSON.stringify(connection.profileIds),
    Number(connection.includeHealth),
    connection.createdAt,
    connection.expiresAt,
  );
  return { connection, token };
}

export function listConnections(clientId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM notification_connections WHERE client_id=? ORDER BY (revoked_at IS NULL AND expires_at>?) DESC, created_at DESC LIMIT 50",
    )
    .all(clientId, new Date().toISOString()) as ConnectionRow[];
  const state = ensureClientState(clientId);
  return rows.map((row) => {
    const { clientId: _clientId, ...connection } = fromRow(row);
    return {
      ...connection,
      profileNames: connection.profileIds.map(
        (id) =>
          state.profiles.find((p) => p.id === id && p.canView)?.displayName ??
          "Unavailable person",
      ),
    };
  });
}

export function revokeConnection(clientId: string, id: string): boolean {
  return (
    db
      .prepare(
        "UPDATE notification_connections SET revoked_at=coalesce(revoked_at,?) WHERE id=? AND client_id=?",
      )
      .run(new Date().toISOString(), id, clientId).changes === 1
  );
}

export function authenticateConnection(
  authorization: string | undefined,
): NotificationConnection | null {
  const token = authorization?.match(/^Bearer (cbn_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const row = db
    .prepare(
      "SELECT * FROM notification_connections WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
    )
    .get(hash(token), new Date().toISOString()) as ConnectionRow | undefined;
  if (!row || !isClientVisible(row.client_id)) return null;
  return fromRow(row);
}

export function deliveredAlertIds(connectionId: string): Set<string> {
  return new Set(
    (
      db
        .prepare(
          "SELECT alert_id FROM notification_deliveries WHERE connection_id=?",
        )
        .all(connectionId) as { alert_id: string }[]
    ).map((row) => row.alert_id),
  );
}
export function acknowledgeAlerts(connectionId: string, ids: string[]) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO notification_deliveries (connection_id,alert_id,delivered_at) VALUES (?,?,?)",
  );
  db.transaction(() => {
    for (const id of ids)
      insert.run(connectionId, id, new Date().toISOString());
  })();
}
