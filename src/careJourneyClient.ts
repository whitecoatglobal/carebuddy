import { clientAccessHeaders } from "./syncClient";
const BASE = (import.meta.env.VITE_BUDDY_BACKEND_URL || "").replace(/\/$/, "");
export async function careRequest<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(BASE + "/api/care/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clientAccessHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error || "Care tools are unavailable. Please try again.",
    );
  if (!result || typeof result !== "object")
    throw new Error("Care tools returned an invalid response.");
  return result as T;
}
export function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read this file."));
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(file);
  });
}
