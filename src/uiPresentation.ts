import type { ReminderInput } from "./types";

export const ROUTINE_TEMPLATES: {
  id: string;
  title: string;
  description: string;
  icon: string;
  time: string;
  category: ReminderInput["category"];
}[] = [
  {
    id: "water",
    title: "Drink a glass of water",
    description: "A little hydration break",
    icon: "drop",
    time: "10:00",
    category: "Personal care",
  },
  {
    id: "walk",
    title: "Take a short walk",
    description: "Make room for movement",
    icon: "walk",
    time: "18:30",
    category: "Personal care",
  },
  {
    id: "wind-down",
    title: "Wind down for bed",
    description: "Ease into your evening",
    icon: "moon",
    time: "22:00",
    category: "Bedtime",
  },
];

export function greetingFor(now: string, name: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Singapore",
    }).format(new Date(now)),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name === "Me" ? greeting : `${greeting}, ${name}`;
}

// Display excerpts from the recorded terms without inferring cover or balances.
export function getBenefitHighlights(conditions: string): string[] {
  const amount = conditions.match(
    /(?:S\$|SGD\s*)\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:per|\/)\s*(?:visit|year|plan year))?/i,
  )?.[0];
  const limit = conditions.match(
    /(?:up to\s+)?\d+\s+visits?\s+(?:per|a)\s+(?:plan\s+)?year/i,
  )?.[0];
  return [amount, limit].filter((value): value is string => Boolean(value));
}
