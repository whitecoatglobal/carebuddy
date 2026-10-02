export * from "care-buddy-shared";
import type { State } from "care-buddy-shared";
import { STORAGE_KEY, seed, materialize, validateState } from "care-buddy-shared";

export function loadState(): { state: State; notice: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: seed(), notice: "" };
    const parsed: unknown = JSON.parse(raw);
    if (!validateState(parsed)) throw new Error("Invalid shape");
    const samples = seed();
    if (!parsed.appliedActions.includes("synthetic-household-v2")) {
      for (const key of ["reminders", "appointments", "activity"] as const) {
        for (const item of samples[key]) {
          if (
            item.id.startsWith("syn-") &&
            (("profileId" in item && parsed.profiles.some((p: { id: string }) => p.id === item.profileId)) || !("profileId" in item)) &&
            !parsed[key].some((saved: { id: string }) => saved.id === item.id)
          ) {
            (parsed[key] as (typeof samples)[typeof key]).push(item as never);
          }
        }
      }
      parsed.appliedActions.push("synthetic-household-v2");
    }
    parsed.carMode =
      parsed.carMode === "disconnected" ? "disconnected" : "parked";
    return { state: materialize(parsed), notice: "" };
  } catch {
    return {
      state: seed(),
      notice: "Local records were reset because they could not be loaded.",
    };
  }
}

export function saveState(s: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
