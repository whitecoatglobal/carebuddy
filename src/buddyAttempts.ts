import { uid } from "care-buddy-shared";
interface RequestPayload {
  profileId: string;
  message: string;
  contextId?: string | null;
  scope?: "occurrence" | "future";
}
export class BuddyAttempts {
  private requests: Map<string, string> | null = null;
  constructor(private clientId: string) {}
  private key() {
    return `care-buddy.pending-buddy.${this.clientId}`;
  }
  private fingerprint(p: RequestPayload) {
    return JSON.stringify({
      profileId: p.profileId,
      message: p.message,
      contextId: p.contextId ?? null,
      scope: p.scope ?? null,
    });
  }
  private load() {
    if (this.requests) return this.requests;
    const raw = localStorage.getItem(this.key());
    if (!raw) return (this.requests = new Map());
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((x) => typeof x === "string"),
      )
    )
      throw new Error(
        "Could not read pending changes. Refresh Care Buddy before trying again.",
      );
    return (this.requests = new Map(parsed as Array<[string, string]>));
  }
  private save() {
    localStorage.setItem(this.key(), JSON.stringify([...this.load()]));
  }
  idFor(payload: RequestPayload) {
    const requests = this.load(),
      key = this.fingerprint(payload);
    const existing = requests.get(key);
    if (existing) return existing;
    const id = uid();
    requests.set(key, id);
    try {
      this.save();
    } catch {
      requests.delete(key);
      throw new Error(
        "Could not prepare this change. Enable browser storage and try again.",
      );
    }
    return id;
  }
  complete(payload: RequestPayload, id: string) {
    const requests = this.load(),
      key = this.fingerprint(payload);
    if (requests.get(key) !== id) return;
    requests.delete(key);
    try {
      this.save();
    } catch {
      /* Keep the stored retry ID: replaying a completed request is safe. */
    }
  }
}
