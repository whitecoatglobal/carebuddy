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
  ensureClientState,
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
  const { state, clientId, message, contextId, scope } = req.body || {};
  if (typeof message !== "string") {
    res.status(400).json({ error: "Missing message" });
    return;
  }
  try {
    const sourceState =
      state && typeof state === "object"
        ? state
        : ensureClientState(typeof clientId === "string" ? clientId : "guest");
    const result = interpretBuddyMessage(sourceState, message, contextId, scope);
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
  const state = ensureClientState(req.params.clientId);
  const row = loadStateRow(req.params.clientId);
  res.json({
    clientId: req.params.clientId,
    state,
    updatedAt: row ? row.updatedAt : new Date().toISOString(),
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

/* ---------- Per-entity list endpoints (backend DB source of truth) ---------- */

app.get("/api/profiles/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ profiles: state.profiles });
});

app.get("/api/reminders/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ reminders: state.reminders });
});

app.get("/api/appointments/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ appointments: state.appointments });
});

app.get("/api/benefits/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ benefits: state.benefits });
});

app.get("/api/notifications/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ notifications: state.notifications });
});

app.get("/api/activity/:clientId", (req, res) => {
  const state = ensureClientState(req.params.clientId);
  res.json({ activity: state.activity });
});

app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Care Buddy backend listening on http://0.0.0.0:${PORT}`);
});
