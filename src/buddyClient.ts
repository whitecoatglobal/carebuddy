import { clientAccessHeaders, ServerError } from "./syncClient";
import { uid } from "care-buddy-shared";
import type { State, Action } from "./types";

export interface BuddyInterpretResult {
  text: string;
  operationStatus?: "saved" | "not_changed" | "pending_confirmation";
  state: State;
  revision: number;
  sourceId?: string;
  needsScope?: boolean;
  action?: Action;
}

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";

export async function interpretBuddyMessage(
  profileId: string,
  message: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
  requestId = uid(),
): Promise<BuddyInterpretResult> {
  if (!BACKEND_URL) throw new Error("Buddy backend is not configured.");
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/buddy/interpret";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...clientAccessHeaders() },
      body: JSON.stringify({ message, profileId, contextId, scope, requestId }),
    });
  } catch {
    throw new Error(
      "Could not reach Buddy. Check your connection and try again.",
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new ServerError(
      typeof data?.error === "string"
        ? data.error
        : "Buddy could not complete the request. Please try again.",
      res.status,
    );
  if (
    !data?.state ||
    !Number.isInteger(data.revision) ||
    typeof data.text !== "string" ||
    !data.text.trim()
  )
    throw new Error("Buddy returned an invalid response. Please try again.");
  return data as BuddyInterpretResult;
}

export function isBackendEnabled(): boolean {
  return !!BACKEND_URL;
}
