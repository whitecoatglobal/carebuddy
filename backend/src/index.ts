import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { interpretBuddyMessage } from "./interpret.js";
import { buildHealthSnapshot } from "./health.js";
import {
  loadStateRow,
  upsertState,
  listClientIds,
  listChats,
} from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(process.cwd(), "../dist");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "512kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "care-buddy-backend", ai: "deterministic", db: "sqlite" });
});

app.post("/api/buddy/interpret", (req, res) => {
  const { state, message, contextId, scope } = req.body || {};
  if (!state || typeof message !== "string") {
    res.status(400).json({ error: "Missing state or message" });
    return;
  }
  try {
    const result = interpretBuddyMessage(state, message, contextId, scope);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Interpretation failed" });
  }
});

app.post("/api/health/snapshot", (req, res) => {
  const { profileId, state } = req.body || {};
  if (!profileId || typeof profileId !== "string") {
    res.status(400).json({ error: "Missing profileId" });
    return;
  }
  try {
    const snapshot = buildHealthSnapshot(profileId, state);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Health snapshot failed" });
  }
});

/* ---------- State persistence (SQLite) ---------- */

app.get("/api/state/:clientId", (req, res) => {
  const row = loadStateRow(req.params.clientId);
  if (!row) {
    res.status(404).json({ error: "No saved state for this client" });
    return;
  }
  res.json({
    clientId: row.clientId,
    state: JSON.parse(row.stateJson),
    updatedAt: row.updatedAt,
  });
});

app.put("/api/state/:clientId", (req, res) => {
  const state = req.body;
  if (!state || typeof state !== "object") {
    res.status(400).json({ error: "Missing state body" });
    return;
  }
  try {
    const row = upsertState(req.params.clientId, JSON.stringify(state));
    res.json({ clientId: row.clientId, updatedAt: row.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "State save failed" });
  }
});

app.get("/api/state", (_req, res) => {
  res.json({ clients: listClientIds() });
});

app.get("/api/chats/:clientId", (req, res) => {
  res.json({ chats: listChats(req.params.clientId) });
});

app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Care Buddy backend listening on http://0.0.0.0:${PORT}`);
});
