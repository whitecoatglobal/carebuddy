import { clientAccessHeaders } from "./syncClient";
import type { State, Action } from "./types";

export interface BuddyInterpretResult {
  text: string;
  sourceId?: string;
  needsScope?: boolean;
  action?: Action;
}

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";

export async function interpretBuddyMessage(
  state: State,
  message: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
): Promise<BuddyInterpretResult> {
  if (!BACKEND_URL) throw new Error("Buddy backend is not configured.");
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/buddy/interpret";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...clientAccessHeaders() },
      body: JSON.stringify({ state, message, contextId, scope }),
    });
  } catch {
    throw new Error(
      "Could not reach Buddy. Check your connection and try again.",
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Buddy could not complete the request. Please try again.",
    );
  if (!data || typeof data.text !== "string" || !data.text.trim())
    throw new Error("Buddy returned an invalid response. Please try again.");
  return data as BuddyInterpretResult;
}

export function isBackendEnabled(): boolean {
  return !!BACKEND_URL;
}
