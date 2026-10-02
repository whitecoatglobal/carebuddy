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
): Promise<BuddyInterpretResult | null> {
  if (!BACKEND_URL) return null;
  const url = BACKEND_URL.replace(/\/$/, "") + "/api/buddy/interpret";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, message, contextId, scope }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BuddyInterpretResult;
    return data;
  } catch {
    return null;
  }
}

export function isBackendEnabled(): boolean {
  return !!BACKEND_URL;
}
