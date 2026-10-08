import type { ChatMessage } from "care-buddy-shared";

// Navigation is response metadata, never a provider-supplied URL or a care command.
export function parseCareNavigation(text: string): {
  text: string;
  careNavigation?: ChatMessage["careNavigation"];
} {
  const suffix = text.match(
    /(?:^|\n)[ \t]*\[CARE_NAVIGATION:(?:gp|emergency)\][ \t]*(?:\n[ \t]*\[CARE_NAVIGATION:(?:gp|emergency)\][ \t]*)*$/,
  );
  if (!suffix) return { text };
  return {
    text: text.slice(0, suffix.index).trim(),
    // If a provider returns conflicting markers, emergency guidance takes priority.
    careNavigation: suffix[0].includes("[CARE_NAVIGATION:emergency]")
      ? "emergency"
      : "gp",
  };
}
