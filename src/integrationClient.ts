import { clientAccessHeaders } from "./syncClient";

const BACKEND_URL = import.meta.env.VITE_BUDDY_BACKEND_URL || "";
export type AssistantTarget = "codex" | "claude";
export interface AssistantConnection {
  id: string;
  target: AssistantTarget;
  profileIds: string[];
  profileNames: string[];
  includeHealth: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
async function request(
  clientId: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  if (!BACKEND_URL)
    throw new Error("Open the connected Care Buddy app to export a plugin.");
  const response = await fetch(`${BACKEND_URL.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...clientAccessHeaders(clientId),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    cache: "no-store",
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.error ||
        "Your connection could not be updated. Please try again.",
    );
  }
  return response;
}
export async function fetchConnections(
  clientId: string,
  signal?: AbortSignal,
): Promise<AssistantConnection[]> {
  const response = await request(
    clientId,
    "/api/integrations",
    undefined,
    signal,
  );
  return (await response.json()).connections;
}
export async function downloadAssistantPlugin(
  clientId: string,
  target: AssistantTarget,
  profileIds: string[],
  includeHealth: boolean,
) {
  const response = await request(clientId, "/api/integrations/export", {
    target,
    profileIds,
    includeHealth,
  });
  if (!response.headers.get("Content-Type")?.includes("application/zip"))
    throw new Error("The plugin download was incomplete. Please try again.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `care-buddy-${target}-plugin.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function revokeAssistantConnection(clientId: string, id: string) {
  await request(
    clientId,
    `/api/integrations/${encodeURIComponent(id)}/revoke`,
    {},
  );
}
