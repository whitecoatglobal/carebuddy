export * from "care-buddy-shared";
import type { State } from "care-buddy-shared";
import {
  STORAGE_KEY,
  emptyState,
  materialize,
  validateState,
} from "care-buddy-shared";
import { restorePreviousBrowserRecords } from "./browserRecovery";
import { createPublicDemoState, isPublicDemo } from "./publicDemo";

export function loadState(): { state: State; notice: string } {
  try {
    const recovered = restorePreviousBrowserRecords(localStorage);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        state: isPublicDemo ? createPublicDemoState() : emptyState(),
        notice: "",
      };
    const parsed: unknown = JSON.parse(raw);
    if (!validateState(parsed)) throw new Error("Invalid shape");
    (parsed as State).carMode =
      (parsed as State).carMode === "disconnected" ? "disconnected" : "parked";
    const state =
      isPublicDemo && !parsed.profiles.length
        ? createPublicDemoState()
        : parsed;
    return {
      state: materialize(state),
      notice: recovered ? "Your previous care space was restored" : "",
    };
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
