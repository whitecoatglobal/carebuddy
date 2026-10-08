import type { State } from "./types";
import { validateState } from "care-buddy-shared";

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

export function loadDisplayCache(clientId: string, fresh: State): State {
  try {
    const cached: unknown = JSON.parse(
      localStorage.getItem(`care-buddy.server-cache.${clientId}`) || "null",
    );
    return validateState(cached) ? cached : fresh;
  } catch {
    return fresh;
  }
}

export function saveDisplayCache(clientId: string, state: State) {
  try {
    localStorage.setItem(
      `care-buddy.server-cache.${clientId}`,
      JSON.stringify(state),
    );
  } catch {
    /* Server persistence succeeded even when the display cache is full. */
  }
}

// Keep a pending profile choice visible while older responses arrive. Once the
// selection settles, server choices (including newly added family) take over.
export class ProfileSelection {
  private token = 0;
  private intent: { token: number; profileId: string } | null = null;
  private authoritative: State | null = null;
  get version() {
    return this.token;
  }
  begin(profileId: string) {
    this.intent = { token: ++this.token, profileId };
    return this.token;
  }
  accept(state: State): State {
    this.authoritative = state;
    return this.intent &&
      state.profiles.some((p) => p.id === this.intent?.profileId)
      ? { ...state, selectedProfileId: this.intent.profileId }
      : state;
  }
  settle(token: number): State | null {
    if (this.intent?.token !== token) return null;
    this.intent = null;
    return this.authoritative;
  }
}

export interface ServerSnapshot {
  state: State;
  revision: number;
}

export class StaleChangeError extends Error {}

export class ServerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  clientId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!BACKEND_URL) throw new Error("Care Buddy backend is not configured.");
  const response = await fetch(`${BACKEND_URL.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...clientAccessHeaders(clientId),
    },
    ...(body === undefined
      ? { cache: "no-store" as const }
      : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new ServerError(
      result?.error || "Could not save. Please try again.",
      response.status,
    );
  return result as T;
}

export function pullState(clientId: string): Promise<ServerSnapshot> {
  return request(clientId, `/api/state/${encodeURIComponent(clientId)}`);
}

// This queue owns the revision. Request bodies are built at dequeue, after all
// earlier operations have committed. A conflict invalidates already queued work.
export class ServerClient {
  revision: number | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private queued = 0;
  get busy() {
    return this.queued > 0;
  }
  constructor(
    private clientId: string,
    private publish: (snapshot: ServerSnapshot) => void,
  ) {}

  private accept(snapshot: ServerSnapshot) {
    if (!validateState(snapshot?.state) || !Number.isInteger(snapshot.revision))
      throw new Error("Invalid care records response.");
    this.revision = snapshot.revision;
    this.publish(snapshot);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    this.queued++;
    const next = this.tail.then(async () => {
      if (generation !== this.generation)
        throw new StaleChangeError(
          "Care records changed. Review this change and try again.",
        );
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ServerError && error.status === 409) {
          this.generation++;
          this.accept(await pullState(this.clientId));
          throw new StaleChangeError(
            "Care records changed. Review the latest records before trying again.",
          );
        }
        throw error;
      }
    });
    const settled = next.finally(() => {
      this.queued--;
    });
    this.tail = settled.catch(() => undefined);
    return settled;
  }

  initialize(
    local: State,
    bootstrap: (local: State, remote: State) => State = (local, remote) =>
      local.profiles.length ? local : remote,
  ) {
    return this.enqueue(async () => {
      let snapshot = await pullState(this.clientId);
      if (snapshot.revision === 0 && !snapshot.state.profiles.length) {
        const { clockMode: _serverClockMode, ...state } = bootstrap(
          local,
          snapshot.state,
        );
        if (state.profiles.length)
          snapshot = await request(
            this.clientId,
            `/api/state/${encodeURIComponent(this.clientId)}/bootstrap`,
            { state, expectedRevision: 0 },
          );
      }
      this.accept(snapshot);
      return snapshot;
    });
  }

  // Reads share the write queue, so the published revision belongs to the
  // latest completed operation. A UI intent change can cancel publication.
  refresh(isCurrent: () => boolean = () => true) {
    return this.enqueue(async () => {
      if (!isCurrent()) return null;
      const snapshot = await pullState(this.clientId);
      if (!isCurrent()) return null;
      this.accept(snapshot);
      return snapshot;
    });
  }

  command(
    command: import("./types").Command,
    actionId: string,
    profileId: string,
    expectedRevision?: number,
  ) {
    return this.run(() => {
      this.assertRevision(expectedRevision);
      return request<ServerSnapshot>(this.clientId, "/api/commands", {
        command,
        actionId,
        profileId,
        expectedRevision: this.revision,
      });
    });
  }

  confirm(proposalId: string, profileId: string, expectedRevision?: number) {
    return this.run(() => {
      this.assertRevision(expectedRevision);
      return request<ServerSnapshot>(
        this.clientId,
        `/api/proposals/${encodeURIComponent(proposalId)}/confirm`,
        { profileId },
      );
    });
  }

  private assertRevision(expected?: number) {
    if (this.revision === null)
      throw new Error("Care records have not loaded. Reload and try again.");
    if (expected !== undefined && expected !== this.revision)
      throw new StaleChangeError(
        "Care records changed. Review this change before confirming.",
      );
  }

  run<T extends ServerSnapshot>(operation: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      this.assertRevision();
      const result = await operation();
      this.accept(result);
      return result;
    });
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
