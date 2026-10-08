// Development-only comparison server. It never reads or changes production records.
// Build shared/backend/frontend first; use PREVIEW_DIST and PREVIEW_FIXTURE for comparisons.
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { emptyState, materialize, validateState } from "care-buddy-shared";
import { getWeather } from "../backend/dist/weather.js";
import { buildHealthSnapshot } from "../backend/dist/health.js";
import { interpretBuddyMessage } from "../backend/dist/interpret.js";
import {
  TokenHubError,
  isTokenHubConfigured,
} from "../backend/dist/tokenHub.js";

const port = Number(process.env.PORT || 4320);
const directory = path.resolve(process.env.PREVIEW_DIST || "dist");
const fixture = process.env.PREVIEW_FIXTURE
  ? JSON.parse(await readFile(process.env.PREVIEW_FIXTURE, "utf8"))
  : { ...emptyState(), started: true };
if (!validateState(fixture))
  throw new Error("Choose a valid fictional preview fixture.");
const states = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const json = (response, status, value) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
};
const body = async (request) => {
  let input = "";
  for await (const chunk of request) {
    input += chunk;
    if (input.length > 512000) throw new Error("Preview request is too large.");
  }
  return JSON.parse(input || "{}");
};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    const stateRoute = url.pathname.match(/^\/api\/state\/([^/]+)$/);
    if (stateRoute) {
      const id = decodeURIComponent(stateRoute[1]);
      if (!states.has(id))
        states.set(id, materialize(structuredClone(fixture)));
      if (request.method === "PUT") {
        const incoming = await body(request);
        if (!validateState(incoming))
          return json(response, 400, { error: "Invalid preview state." });
        states.set(id, incoming);
        return json(response, 200, {
          clientId: id,
          updatedAt: new Date().toISOString(),
        });
      }
      if (request.method === "GET")
        return json(response, 200, {
          clientId: id,
          state: states.get(id),
          updatedAt: new Date().toISOString(),
        });
    }
    if (url.pathname === "/api/health")
      return json(response, 200, {
        status: "ok",
        service: "care-buddy-local-ui-preview",
        ai: "tokenhub",
        aiConfigured: isTokenHubConfigured(),
      });
    if (url.pathname === "/api/weather") {
      try {
        return json(response, 200, { weather: await getWeather() });
      } catch {
        return json(response, 503, {
          weather: null,
          error: "Weather is temporarily unavailable. Please try again.",
        });
      }
    }
    if (url.pathname === "/api/health/snapshot" && request.method === "POST") {
      const input = await body(request);
      return json(
        response,
        200,
        await buildHealthSnapshot(input.profileId, input.state),
      );
    }
    if (url.pathname === "/api/buddy/interpret" && request.method === "POST") {
      const input = await body(request);
      try {
        return json(
          response,
          200,
          await interpretBuddyMessage(
            input.state,
            input.message,
            input.contextId,
            input.scope,
          ),
        );
      } catch (error) {
        return json(
          response,
          error instanceof TokenHubError ? error.status : 500,
          {
            error:
              error instanceof TokenHubError
                ? error.message
                : "Buddy could not process this request. Please try again.",
            code: error instanceof TokenHubError ? error.code : undefined,
          },
        );
      }
    }
    if (url.pathname.startsWith("/api/"))
      return json(response, 404, { error: "Preview route not found." });
    const target = path.resolve(
      directory,
      "." + decodeURIComponent(url.pathname),
    );
    if (target !== directory && !target.startsWith(directory + path.sep))
      return json(response, 403, { error: "Path unavailable." });
    let file = target;
    let content;
    try {
      content = await readFile(file);
    } catch {
      if (path.extname(url.pathname))
        return json(response, 404, { error: "File not found." });
      file = path.join(directory, "index.html");
      content = await readFile(file);
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    if (!response.headersSent)
      json(response, 400, { error: "Unable to process this preview request." });
    else response.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `Care Buddy UI preview: http://localhost:${port}/today\n`,
  ),
);
