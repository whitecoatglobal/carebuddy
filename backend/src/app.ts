import express from "express";
import { checkBrowserAccess, requireClientAccess } from "./clientAccess.js";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { interpretBuddyMessage } from "./interpret.js";
import { buildHealthSnapshot } from "./health.js";
import { getWeather } from "./weather.js";
import { TokenHubError, isTokenHubConfigured } from "./tokenHub.js";
import {
  loadStateRow,
  upsertState,
  listChats,
  ensureClientState,
} from "./db.js";

export function createApp() {
  const app = express();
  const STATIC_DIR =
    process.env.STATIC_DIR || path.resolve(process.cwd(), "../dist");

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
  app.get("/api/access", checkBrowserAccess);
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" && ["/health", "/weather"].includes(req.path)) {
      next();
      return;
    }
    requireClientAccess(req, res, next);
  });
  app.param("clientId", (req, res, next, clientId) => {
    if (clientId !== res.locals.clientId) {
      res
        .status(403)
        .json({ error: "This browser cannot access another client ID" });
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "care-buddy-backend",
      ai: "tokenhub",
      aiConfigured: isTokenHubConfigured(),
      db: "sqlite",
    });
  });

  app.post("/api/buddy/interpret", async (req, res) => {
    const { state, message, contextId, scope } = req.body || {};
    if (typeof message !== "string") {
      res.status(400).json({ error: "Missing message" });
      return;
    }
    try {
      const sourceState =
        state && typeof state === "object"
          ? state
          : ensureClientState(res.locals.clientId);
      const result = await interpretBuddyMessage(
        sourceState,
        message,
        contextId,
        scope,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof TokenHubError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res
        .status(500)
        .json({
          error: "Buddy could not process this request. Please try again.",
        });
    }
  });

  app.get("/api/weather", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json({ weather: await getWeather() });
    } catch {
      res
        .status(503)
        .json({
          weather: null,
          error: "Weather is temporarily unavailable. Please try again.",
        });
    }
  });

  app.post("/api/health/snapshot", async (req, res) => {
    const { profileId, state } = req.body || {};
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "Missing profileId" });
      return;
    }
    try {
      const snapshot = await buildHealthSnapshot(profileId, state);
      res.json(snapshot);
    } catch (err) {
      res
        .status(500)
        .json({
          error: err instanceof Error ? err.message : "Health snapshot failed",
        });
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
      res
        .status(500)
        .json({
          error: err instanceof Error ? err.message : "State save failed",
        });
    }
  });

  app.get("/api/state", (_req, res) => {
    res.json({ clients: [res.locals.clientId] });
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

  return app;
}
