export * from "care-buddy-shared";
import type { State } from "care-buddy-shared";
import {
  STORAGE_KEY,
  emptyState,
  ensureSyntheticRecords,
  materialize,
  validateState,
} from "care-buddy-shared";

export function loadState(): { state: State; notice: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: emptyState(), notice: "" };
    const parsed: unknown = JSON.parse(raw);
    if (!validateState(parsed)) throw new Error("Invalid shape");
    (parsed as State).carMode =
      (parsed as State).carMode === "disconnected" ? "disconnected" : "parked";
    ensureSyntheticRecords(parsed as State);
    return { state: materialize(parsed as State), notice: "" };
  } catch {
    return {
      state: emptyState(),
      notice: "Local records were reset because they could not be loaded.",
    };
  }
}

export function saveState(s: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
