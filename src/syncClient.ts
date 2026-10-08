import type { State } from "./types";

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";
const CLIENT_ID_KEY = "care-buddy.client-id";

export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        "client-" +
        Array.from({ length: 8 }, () =>
          Math.floor(Math.random() * 36).toString(36),
        ).join("");
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "client-local";
  }
}

export function isSyncEnabled(): boolean {
  return !!BACKEND_URL;
}

export async function pullState(clientId: string): Promise<State | null> {
  if (!BACKEND_URL) return null;
  try {
    const res = await fetch(
      `${BACKEND_URL.replace(/\/$/, "")}/api/state/${encodeURIComponent(clientId)}`,
      { headers: clientAccessHeaders(clientId), cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.state as State) ?? null;
  } catch {
    return null;
  }
}

export async function pushState(
  clientId: string,
  state: State,
): Promise<boolean> {
  if (!BACKEND_URL) return false;
  try {
    const res = await fetch(
      `${BACKEND_URL.replace(/\/$/, "")}/api/state/${encodeURIComponent(clientId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...clientAccessHeaders(clientId),
        },
        body: JSON.stringify(state),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function clientAccessHeaders(
  clientId = getClientId(),
): Record<string, string> {
  return { "X-CareBuddy-Client-Id": clientId };
}

export async function checkClientAccess(): Promise<boolean> {
  if (!BACKEND_URL) throw new Error("Care Buddy backend is not configured.");
  const clientId = getClientId();
  const response = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/api/access`, {
    headers: clientAccessHeaders(clientId),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      "Could not verify this browser's access. Please try again.",
    );
  const result = await response.json();
  if (result.clientId !== clientId || typeof result.isVisible !== "boolean") {
    throw new Error("Invalid browser access response.");
  }
  return result.isVisible;
}
