import type { State, Command, Receipt, Action } from "./types";
const BASE = (import.meta.env.VITE_BUDDY_BACKEND_URL || "").replace(/\/$/, "");
export interface AccountBootstrap {
  state: State;
  revision: number;
  csrfToken: string;
  user: { id: string; username: string; displayName: string; timeZone: string };
  schedulingWarning?: string;
}
export interface AccountSnapshot {
  state: State;
  revision: number;
  receipt?: Receipt;
  schedulingWarning?: string;
}
export interface InterpretResult extends AccountSnapshot {
  text: string;
  action?: Action;
  sourceId?: string;
  needsScope?: boolean;
}
export class AccountApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function accountRequest<T>(
  path: string,
  body?: unknown,
  csrfToken?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      credentials: "include",
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new Error(
      "Could not reach Buddy. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new AccountApiError(
      response.status,
      typeof data?.error === "string"
        ? data.error
        : "The account request failed. Please try again.",
    );
  if (!data || typeof data !== "object")
    throw new Error("Buddy returned an invalid response. Please try again.");
  return data as T;
}
export class AccountClient {
  snapshot: AccountSnapshot;
  private tail: Promise<unknown> = Promise.resolve();
  private active = true;
  private generation = 0;
  private requests = new Map<
    string,
    {
      command: Command;
      profileId: string;
      actionId: string;
      expectedRevision: number;
    }
  >();
  constructor(
    private bootstrap: AccountBootstrap,
    private expired: () => void,
  ) {
    this.snapshot = {
      state: bootstrap.state,
      revision: bootstrap.revision,
      schedulingWarning: bootstrap.schedulingWarning,
    };
  }
  dispose() {
    this.active = false;
    this.requests.clear();
  }
  private check() {
    if (!this.active) throw new Error("Account changed. Sign in again.");
  }
  private enqueue<T extends AccountSnapshot>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    const run = this.tail.then(async () => {
      this.check();
      if (generation !== this.generation)
        throw new AccountApiError(
          409,
          "Care records changed. Review your input before trying again.",
        );
      try {
        const result = await operation();
        this.check();
        this.snapshot = result;
        return result;
      } catch (error) {
        if (!this.active) throw new Error("Account changed. Sign in again.");
        if (error instanceof AccountApiError && error.status === 401) {
          this.dispose();
          this.expired();
        }
        if (error instanceof AccountApiError && error.status === 409) {
          this.generation++;
          const latest = await this.request<AccountSnapshot>("/api/state");
          this.check();
          this.snapshot = latest;
        }
        throw error;
      }
    });
    this.tail = run.catch(() => {});
    return run;
  }
  async request<T>(path: string, body?: unknown): Promise<T> {
    this.check();
    try {
      const result = await accountRequest<T>(
        path,
        body,
        this.bootstrap.csrfToken,
      );
      this.check();
      return result;
    } catch (error) {
      if (
        this.active &&
        error instanceof AccountApiError &&
        error.status === 401
      ) {
        this.dispose();
        this.expired();
      }
      throw error;
    }
  }
  command(
    command: Command,
    profileId: string,
    actionId: string,
  ): Promise<AccountSnapshot> {
    return this.enqueue(() => {
      let body = this.requests.get(actionId);
      if (!body) {
        body = {
          command,
          profileId,
          actionId,
          expectedRevision: this.snapshot.revision,
        };
        this.requests.set(actionId, body);
      }
      return this.request<AccountSnapshot>("/api/commands", body);
    });
  }
  interpret(
    message: string,
    profileId: string,
    contextId?: string | null,
    scope?: "occurrence" | "future",
  ) {
    return this.enqueue(() =>
      this.request<InterpretResult>("/api/buddy/interpret", {
        message,
        profileId,
        ...(contextId !== undefined ? { contextId } : {}),
        ...(scope ? { scope } : {}),
      }),
    );
  }
  confirm(proposalId: string, profileId: string) {
    return this.enqueue(() =>
      this.request<AccountSnapshot>(
        "/api/proposals/" + encodeURIComponent(proposalId) + "/confirm",
        { profileId },
      ),
    );
  }
}
