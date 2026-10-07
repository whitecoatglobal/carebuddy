/** Missing zones retain the legacy Singapore contract; explicit zones must be valid. */
export const LEGACY_TIME_ZONE = "Asia/Singapore";
export class LocalTimeSchedulingError extends Error {}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone = LEGACY_TIME_ZONE) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, value);
  }
  return value;
}
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}
export function localDateTime(
  iso: string,
  timeZone?: string,
): { date: string; time: string } {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export const day = (iso: string, timeZone?: string) =>
  localDateTime(iso, timeZone).date;
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function isoAt(date: string, time: string, timeZone?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Choose a valid date and time");
  const local = `${date}T${time}:00`;
  const wall = Date.parse(`${local}Z`);
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== local.slice(0, 16)
  )
    throw new Error("Choose a valid date and time");
  if (timeZone === undefined) return `${local}+08:00`;
  formatter(timeZone); // Invalid explicit zones must not silently use a different zone.
  const offsets = new Set<number>();
  // Probe both sides of nearby transitions, including fractional-hour offsets.
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = wall + hours * 3600000;
    const parts = Object.fromEntries(
      formatter(timeZone)
        .formatToParts(new Date(instant))
        .map((p) => [p.type, p.value]),
    );
    const projected = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    offsets.add(projected - instant);
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => {
      const actual = localDateTime(new Date(instant).toISOString(), timeZone);
      return actual.date === date && actual.time === time;
    });
  if (!matches.length)
    throw new LocalTimeSchedulingError(
      "This local time does not exist because the clocks change. Choose another time.",
    );
  if (matches.length > 1)
    throw new LocalTimeSchedulingError(
      "This local time occurs twice because the clocks change. Choose another time.",
    );
  return new Date(matches[0]).toISOString();
}
export const formatTime = (iso: string, timeZone = LEGACY_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
export const formatDate = (iso: string, timeZone = LEGACY_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
