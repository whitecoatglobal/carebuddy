import express from "express";
import { checkBrowserAccess, requireClientAccess } from "./clientAccess.js";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { interpretBuddyMessage } from "./interpret.js";
import { buildHealthSnapshot } from "./health.js";
import { getWeather } from "./weather.js";
import { TokenHubError, isTokenHubConfigured } from "./tokenHub.js";
import { loadStateRow, listChats, ensureClientState } from "./db.js";

import {
  bootstrap,
  snapshot,
  runCommand,
  persistBuddy,
  replayBuddy,
  confirm,
  PersistenceError,
} from "./persistence.js";
import { CommandValidationError } from "./commands.js";
function apiError(res: express.Response, err: unknown) {
  if (err instanceof TokenHubError)
    return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof PersistenceError)
    return res.status(err.status).json({ error: err.message });
  if (err instanceof CommandValidationError)
    return res.status(400).json({ error: err.message });
  return res
    .status(500)
    .json({ error: "Care data could not be saved. Please try again." });
}
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
    const { message, profileId, contextId, scope, requestId } = req.body || {};
    try {
      if (
        !req.body ||
        typeof requestId !== "string" ||
        !requestId.trim() ||
        requestId.length > 160 ||
        Object.keys(req.body).some(
          (k) =>
            ![
              "message",
              "profileId",
              "contextId",
              "scope",
              "requestId",
            ].includes(k),
        )
      )
        throw new PersistenceError("Invalid Buddy request");
      const fingerprint = JSON.stringify({
        message,
        profileId,
        contextId: contextId ?? null,
        scope: scope ?? null,
      });
      const replay = replayBuddy(res.locals.clientId, requestId, fingerprint);
      if (replay) {
        res.json(replay);
        return;
      }
      const current = snapshot(res.locals.clientId);
      if (profileId !== current.state.selectedProfileId)
        throw new PersistenceError(
          "Select this profile before messaging Buddy",
          409,
        );
      const result = await interpretBuddyMessage(
        current.state,
        message,
        contextId,
        scope,
      );
      res.json(
        persistBuddy(
          res.locals.clientId,
          profileId,
          message,
          result,
          current.revision,
          requestId,
          fingerprint,
        ),
      );
    } catch (err) {
      apiError(res, err);
    }
  });
  app.post("/api/commands", (req, res) => {
    try {
      res.json(runCommand(res.locals.clientId, req.body));
    } catch (err) {
      apiError(res, err);
    }
  });
  app.post("/api/proposals/:id/confirm", (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).some((k) => k !== "profileId"))
        throw new PersistenceError("Invalid confirmation request");
      res.json(confirm(res.locals.clientId, req.params.id, req.body.profileId));
    } catch (err) {
      apiError(res, err);
    }
  });

  app.get("/api/weather", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json({ weather: await getWeather() });
    } catch {
      res.status(503).json({
        weather: null,
        error: "Weather is temporarily unavailable. Please try again.",
      });
    }
  });

  app.post("/api/health/snapshot", async (req, res) => {
    const { profileId } = req.body || {};
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "Missing profileId" });
      return;
    }
    try {
      if (!req.body || Object.keys(req.body).some((k) => k !== "profileId"))
        throw new PersistenceError("Invalid health context request");
      const state = snapshot(res.locals.clientId).state;
      if (!state.profiles.some((p) => p.id === profileId && p.canView))
        throw new PersistenceError("This profile is not available");
      const healthSnapshot = await buildHealthSnapshot(profileId, state);
      res.json(healthSnapshot);
    } catch (err) {
      apiError(res, err);
    }
  });

  /* ---------- State persistence (SQLite) ---------- */

  app.get("/api/state/:clientId", (req, res) => {
    const state = ensureClientState(req.params.clientId);
    const row = loadStateRow(req.params.clientId);
    res.json({
      clientId: req.params.clientId,
      state,
      revision: row!.revision,
      updatedAt: row ? row.updatedAt : new Date().toISOString(),
    });
  });

  app.put("/api/state/:clientId", (_req, res) => {
    res
      .status(405)
      .json({ error: "Whole-state overwrite is disabled. Use care commands." });
  });
  app.post("/api/state/:clientId/bootstrap", (req, res) => {
    try {
      if (
        !req.body ||
        Object.keys(req.body).some(
          (k) => !["state", "expectedRevision"].includes(k),
        )
      )
        throw new PersistenceError("Invalid bootstrap request");
      res.json(
        bootstrap(
          req.params.clientId,
          req.body.state,
          req.body.expectedRevision,
        ),
      );
    } catch (err) {
      apiError(res, err);
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

  // Express forwards synchronous route errors here; no stored care data or
  // diagnostic stack is sent to the browser when a saved snapshot is invalid.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      apiError(res, err);
    },
  );
  app.use(express.static(STATIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });

  return app;
}
