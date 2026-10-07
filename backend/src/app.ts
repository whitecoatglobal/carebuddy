import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { z } from "zod";
import { AccountStore, ApiError, type Session } from "./accountStore.js";
import {
  checkPassword,
  hashPassword,
  readSessionCookie,
  sessionCookie,
} from "./auth.js";
import { interpretBuddyMessage } from "./interpret.js";
import { parseCommand, CommandValidationError } from "./commands.js";
import { buildHealthSnapshot } from "./health.js";
import { isTokenHubConfigured, TokenHubError } from "./tokenHub.js";
const identifier = z.string().min(1).max(100);
const username = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const timeZone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone");
export interface AppOptions {
  store?: AccountStore;
  origin?: string;
  production?: boolean;
  interpret?: typeof interpretBuddyMessage;
  staticDir?: string;
}
export function createApp(options: AppOptions = {}) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin =
    options.origin ??
    process.env.APP_ORIGIN ??
    (!production ? "http://localhost:5173" : undefined);
  if (!origin) throw new Error("APP_ORIGIN is required in production");
  if (new URL(origin).origin !== origin)
    throw new Error("APP_ORIGIN must be an exact origin");
  const store = options.store ?? new AccountStore(),
    interpret = options.interpret ?? interpretBuddyMessage,
    app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.vary("Cookie"); next(); });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({ error: "Request origin is not allowed" });
      return;
    }
    next();
  });
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const session = store.session(readSessionCookie(req.headers.cookie));
    if (!session) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    res.locals.session = session;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== session.csrfToken
    ) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }
    next();
  };
  const session = (res: Response) => res.locals.session as Session;
  const counters = new Map<string, { count: number; until: number }>();
  const limit =
    (kind: string, max: number, account = false) =>
    (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      for (const [key, value] of counters)
        if (value.until <= now) counters.delete(key);
      const key = `${kind}:${account ? session(res).user.id : req.ip}`;
      const entry = counters.get(key) ?? { count: 0, until: now + 60000 };
      entry.count++;
      counters.set(key, entry);
      if (entry.count > max) {
        res.status(429).json({ error: "Too many requests. Try again shortly" });
        return;
      }
      next();
    };
  const route =
    (fn: (req: Request, res: Response) => unknown) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };
  const bootstrap = (res: Response, user: Session["user"]) => {
    const s = store.createSession(user);
    res.setHeader("Set-Cookie", sessionCookie(s.value, production));
    res.json({ user, csrfToken: s.csrfToken, ...store.snapshot(user.id) });
  };
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", aiConfigured: isTokenHubConfigured() }),
  );
  app.post(
    "/api/auth/register",
    limit("register", 10),
    route(async (req, res) => {
      const b = z
        .object({
          username,
          password,
          displayName: z.string().trim().min(1).max(80).optional(),
          timeZone,
        })
        .strict()
        .parse(req.body);
      const hashed = await hashPassword(b.password);
      const user = store.createAccount(
        b.username,
        b.displayName ?? b.username,
        b.timeZone,
        hashed.salt,
        hashed.hash,
      );
      bootstrap(res, user);
    }),
  );
  app.post(
    "/api/auth/login",
    limit("login", 20),
    route(async (req, res) => {
      const b = z
        .object({ username, password: z.string().min(1).max(128) })
        .strict()
        .parse(req.body);
      const found = store.findAccount(b.username);
      const valid = await checkPassword(
        b.password,
        found?.password_salt ?? "unregistered-account",
        found?.password_hash ?? "0".repeat(128),
      );
      if (!found || !valid)
        throw new ApiError(401, "Invalid username or password");
      bootstrap(res, {
        id: found.id,
        username: found.username,
        displayName: found.display_name,
        timeZone: found.time_zone,
      });
    }),
  );
  app.get(
    "/api/auth/session",
    auth,
    route((_req, res) =>
      res.json({ ...session(res), ...store.snapshot(session(res).user.id) }),
    ),
  );
  app.post(
    "/api/auth/logout",
    auth,
    route((req, res) => {
      store.logout(readSessionCookie(req.headers.cookie)!);
      res.setHeader("Set-Cookie", sessionCookie("", production, true));
      res.json({ ok: true });
    }),
  );
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) {
      res.status(404).json({ error: "Endpoint unavailable" });
      return;
    }
    auth(req, res, next);
  });
  app.get(
    "/api/state",
    route((_req, res) => res.json(store.snapshot(session(res).user.id))),
  );
  app.post(
    "/api/commands",
    limit("commands", 120, true),
    route((req, res) => {
      const b = z
        .object({
          command: z.unknown(),
          actionId: identifier,
          expectedRevision: z.number().int().nonnegative(),
          profileId: identifier,
        })
        .strict()
        .parse(req.body);
      const command = parseCommand(b.command);
      if (
        ["chatMessage", "advanceClock", "restoreClock", "scenario"].includes(
          command.type,
        )
      )
        throw new ApiError(400, "This command is unavailable");
      res.json(
        store.command(
          session(res).user.id,
          command,
          b.actionId,
          b.expectedRevision,
          b.profileId,
        ),
      );
    }),
  );
  app.post(
    "/api/buddy/interpret",
    limit("ai", 20, true),
    route(async (req, res) => {
      const b = z
        .object({
          message: z.string().trim().min(1).max(500),
          profileId: identifier,
          contextId: identifier.nullable().optional(),
          scope: z.enum(["occurrence", "future"]).optional(),
        })
        .strict()
        .parse(req.body);
      const userId = session(res).user.id;
      const snap = store.snapshot(userId);
      store.profile(snap.state, b.profileId);
      if (
        b.contextId &&
        ![
          ...snap.state.reminders,
          ...snap.state.appointments,
          ...snap.state.benefits,
        ].some((x) => x.id === b.contextId && x.profileId === b.profileId)
      )
        throw new ApiError(400, "Care record unavailable for this profile");
      store.selectProfile(userId, b.profileId);
      const source = store.chat(
        userId,
        b.profileId,
        "user",
        b.message,
        b.contextId ?? null,
      );
      source.state.selectedProfileId = b.profileId;
      source.state.now = new Date().toISOString();
      let result;
      try {
        result = await interpret(
          source.state,
          b.message,
          b.contextId,
          b.scope,
          { timeZone: session(res).user.timeZone },
        );
      } catch (error) {
        if (error instanceof TokenHubError || error instanceof CommandValidationError) throw error;
        throw new ApiError(
          502,
          "Buddy could not process this request. Please try again",
        );
      }
      const action = result.action
        ? store.proposal(
            userId,
            b.profileId,
            parseCommand(result.action.command, { aiOnly: true }),
            snap.revision,
            {
              sourceIds: serverSources(result.action.command),
              label: z.string().min(1).max(200).parse(result.action.label),
            },
          )
        : undefined;
      if (store.snapshot(userId).revision !== snap.revision)
        throw new ApiError(409, "Care records changed during this request");
      const final = store.chat(
        userId,
        b.profileId,
        "assistant",
        result.text,
        b.contextId ?? null,
      );
      res.json({
        text: result.text,
        needsScope: result.needsScope,
        sourceId: result.sourceId,
        action,
        ...final,
      });
    }),
  );
  app.post(
    "/api/proposals/:id/confirm",
    limit("confirmation", 60, true),
    route((req, res) => {
      const b = z.object({ profileId: identifier }).strict().parse(req.body);
      const id = identifier.parse(req.params.id);
      res.json(store.confirm(session(res).user.id, id, b.profileId));
    }),
  );
  app.post(
    "/api/health/snapshot",
    route((req, res) => {
      const b = z.object({ profileId: identifier }).strict().parse(req.body);
      const snap = store.snapshot(session(res).user.id);
      store.profile(snap.state, b.profileId);
      snap.state.now = new Date().toISOString();
      res.json(buildHealthSnapshot(b.profileId, snap.state));
    }),
  );
  for (const entity of [
    "profiles",
    "reminders",
    "appointments",
    "benefits",
    "notifications",
    "activity",
    "chats",
  ] as const)
    app.get(
      `/api/${entity}`,
      route((_req, res) =>
        res.json({
          [entity]: store.snapshot(session(res).user.id).state[entity],
        }),
      ),
    );
  for (const entity of [
    "state",
    "profiles",
    "reminders",
    "appointments",
    "benefits",
    "notifications",
    "activity",
    "chats",
  ])
    app.all(`/api/${entity}/:clientId`, (_req, res) =>
      res
        .status(410)
        .json({ error: "Legacy client-addressed storage is retired" }),
    );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint unavailable" }),
  );
  const staticDir =
    options.staticDir ??
    process.env.STATIC_DIR ??
    path.resolve(process.cwd(), "../dist");
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "Invalid request",
          details: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        });
        return;
      }
      if (
        error instanceof ApiError ||
        error instanceof CommandValidationError || error instanceof TokenHubError
      ) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if ((error as any)?.type === "entity.too.large") {
        res.status(413).json({ error: "Request is too large" });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
      res.status(500).json({ error: "Request could not be completed" });
    },
  );
  return app;
}
function serverSources(command: import("care-buddy-shared").Command): string[] {
  const c = command as any;
  if (typeof c.id === "string") return [c.id];
  if (c.input?.appointmentId) return [c.input.appointmentId];
  return [];
}
