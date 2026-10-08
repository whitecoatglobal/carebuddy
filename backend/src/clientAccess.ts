import type { Request, Response, NextFunction } from "express";
import { isClientVisible, registerClientId } from "./db.js";

function browserId(req: Request): string | null {
  const id = req.get("X-CareBuddy-Client-Id");
  // The shared storage-error fallback must never become an approved identity.
  return id && /^client-[a-z0-9-]{1,150}$/.test(id) && id !== "client-local"
    ? id
    : null;
}

export function checkBrowserAccess(req: Request, res: Response): void {
  res.set("Cache-Control", "no-store");
  res.vary("X-CareBuddy-Client-Id");
  const id = browserId(req);
  if (!id) {
    res
      .status(400)
      .json({
        error:
          "A valid browser ID is required. Browser storage must be enabled.",
      });
    return;
  }
  // Registers an empty, blocked row only; never replaces an existing snapshot.
  registerClientId(id);
  res.json({ clientId: id, isVisible: isClientVisible(id) });
}

export function requireClientAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.set("Cache-Control", "no-store");
  res.vary("X-CareBuddy-Client-Id");
  const id = browserId(req);
  if (!id || !isClientVisible(id)) {
    res
      .status(403)
      .json({
        error:
          "Access is not enabled for this browser. Ask the owner to approve your browser ID.",
      });
    return;
  }
  if (req.body?.clientId !== undefined && req.body.clientId !== id) {
    res
      .status(403)
      .json({ error: "This browser cannot access another client ID" });
    return;
  }
  res.locals.clientId = id;
  next();
}
