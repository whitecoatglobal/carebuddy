import { createHash } from "node:crypto";
import {
  materialize,
  notificationTime,
  type State,
  type HealthVitals,
} from "care-buddy-shared";

export interface CareAlert {
  id: string;
  profileId: string;
  profileName: string;
  kind: "reminder" | "appointment" | "health" | "care-alert";
  priority: "info" | "attention" | "urgent";
  title: string;
  message: string;
  at: string;
  url: string;
  source?: string;
  referenceUrl?: string;
}
const BP_SOURCE =
  "https://www.heart.org/en/health-topics/high-blood-pressure/blood-pressure-explained";
const VITALS_SOURCE = "https://medlineplus.gov/ency/article/002341.htm";
const OXYGEN_SOURCE = "https://medlineplus.gov/lab-tests/pulse-oximetry/";
const FEVER_SOURCE = "https://www.nhs.uk/symptoms/fever-in-adults/";
export const PUBLIC_SITE = "https://carebuddy.life";
function key(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

// Project a clone at the real clock. Reading the monitor never completes care,
// marks in-app notifications read, changes selection, or advances a demo clock.
export function buildNotificationFeed(
  saved: State,
  profileIds: string[],
  readings: HealthVitals[],
  now = new Date().toISOString(),
): CareAlert[] {
  const state = materialize({ ...structuredClone(saved), now });
  const profiles = state.profiles.filter(
    (p) => p.canView && profileIds.includes(p.id),
  );
  const alerts: CareAlert[] = [];
  const current = Date.parse(now),
    minute = 60000;
  const add = (
    profileId: string,
    event: Omit<CareAlert, "id" | "profileId" | "profileName">,
    identity: unknown[],
  ) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (profile)
      alerts.push({
        ...event,
        profileId,
        profileName: profile.displayName,
        id: key(profileId, ...identity),
      });
  };
  for (const r of state.reminders) {
    if (r.deletedAt || r.outcome) continue;
    const at = notificationTime(r),
      delta = Date.parse(at) - current;
    if (
      !Number.isFinite(delta) ||
      delta > 15 * minute ||
      delta < -24 * 60 * minute
    )
      continue;
    const stage =
      delta > 0 ? "soon" : delta > -30 * minute ? "due" : "unrecorded";
    add(
      r.profileId,
      {
        kind: "reminder",
        priority: stage === "unrecorded" ? "attention" : "info",
        title: `${r.title} · ${stage === "soon" ? "coming up" : stage === "due" ? "due now" : "not yet recorded"}`,
        message: `${r.category} reminder. ${stage === "unrecorded" ? "No outcome has been recorded; this does not mean it was missed." : "Open Care Buddy to review or record an outcome."}`,
        at,
        url: `${PUBLIC_SITE}/today`,
      },
      ["reminder", r.id, r.title, at, stage],
    );
  }
  for (const a of state.appointments) {
    const delta = Date.parse(a.startsAt) - current;
    if (
      !Number.isFinite(delta) ||
      delta < -15 * minute ||
      delta > 24 * 60 * minute
    )
      continue;
    const stage = delta <= 60 * minute ? "soon" : "tomorrow";
    add(
      a.profileId,
      {
        kind: "appointment",
        priority: "info",
        title: `${a.title} · ${stage === "soon" ? "coming up" : "within 24 hours"}`,
        message: `Saved care appointment${a.locationLabel ? ` at ${a.locationLabel}` : ""}. Clinic confirmation is still needed.`,
        at: a.startsAt,
        url: `${PUBLIC_SITE}/appointments/${encodeURIComponent(a.id)}`,
      },
      ["appointment", a.id, a.title, a.startsAt, a.locationLabel, stage],
    );
  }
  for (const n of state.notifications) {
    // Routine and appointment notifications above reflect their current records.
    if (
      n.readAt ||
      n.targetType !== "urgent" ||
      current - Date.parse(n.timestamp) > 86400000 ||
      Date.parse(n.timestamp) > current
    )
      continue;
    add(
      n.profileId,
      {
        kind: "care-alert",
        priority: "attention",
        title: n.title,
        message: "Open the saved care alert for details.",
        at: n.timestamp,
        url: `${PUBLIC_SITE}/notifications`,
      },
      ["care-alert", n.id, n.timestamp, n.title],
    );
  }
  for (const v of readings) {
    if (!profiles.some((p) => p.id === v.profileId)) continue;
    const age = current - Date.parse(v.updatedAt);
    if (!Number.isFinite(age) || age < -5 * minute) continue;
    const demo = v.source === "demo";
    const prefix = demo ? "Demo reading · " : "";
    const emit = (
      metric: string,
      value: string,
      message: string,
      referenceUrl: string,
      urgent = false,
    ) =>
      add(
        v.profileId,
        {
          kind: "health",
          priority: urgent && !demo ? "urgent" : "attention",
          title: `${prefix}${metric}: ${value}`,
          message: `${demo ? "This is a fictional reading, not a measurement from a person. " : ""}${message}`,
          at: v.updatedAt,
          source: v.source,
          referenceUrl,
          url: `${PUBLIC_SITE}/health/vitals`,
        },
        ["health", metric, v.updatedAt, value, v.source],
      );
    if (age > 86400000) {
      emit(
        "Readings need updating",
        "over 24 hours old",
        "The latest saved readings are older than 24 hours. Record a fresh measurement before treating them as current.",
        VITALS_SOURCE,
      );
      continue;
    }
    if (
      v.systolic >= 140 ||
      v.diastolic >= 90 ||
      v.systolic < 90 ||
      v.diastolic < 60
    ) {
      const severe = v.systolic > 180 || v.diastolic > 120;
      emit(
        "Blood pressure",
        `${v.systolic}/${v.diastolic} mmHg`,
        severe
          ? "This reading is very high. Repeat after one minute and seek urgent medical advice if it remains this high. With chest pain, trouble breathing, weakness or difficulty speaking, seek emergency help immediately."
          : "Outside the general adult monitoring range. Recheck at rest and discuss persistent changes with your clinician; individual targets can differ.",
        v.systolic < 90 || v.diastolic < 60 ? VITALS_SOURCE : BP_SOURCE,
        severe,
      );
    }
    if (v.pulseBpm < 60 || v.pulseBpm > 100)
      emit(
        "Pulse",
        `${v.pulseBpm} bpm`,
        "Outside the general adult resting range of 60–100 bpm. Activity, fitness and medicines can affect it. Recheck at rest and seek clinical advice if concerned.",
        VITALS_SOURCE,
      );
    if (v.temperatureC >= 38)
      emit(
        "Body temperature",
        `${v.temperatureC.toFixed(1)}°C`,
        "At or above the usual adult fever threshold of 38°C. Review how you feel and seek medical advice if symptoms persist or worsen.",
        FEVER_SOURCE,
      );
    if (v.oxygenPercent < 95)
      emit(
        "Blood oxygen",
        `${v.oxygenPercent}%`,
        v.oxygenPercent <= 88
          ? "Seek immediate medical attention. A pulse oximeter is an estimate; consider symptoms and your clinician's individual targets."
          : v.oxygenPercent <= 92
            ? "Contact a healthcare professional promptly about this reading. Individual targets and device accuracy can differ."
            : "Below the usual adult range of 95–100%. Check the device fit, recheck and discuss persistent changes with your clinician.",
        OXYGEN_SOURCE,
        v.oxygenPercent <= 88,
      );
    if (v.breathingPerMinute < 12 || v.breathingPerMinute > 18)
      emit(
        "Breathing rate",
        `${v.breathingPerMinute} breaths/min`,
        "Outside the general adult resting range of 12–18 breaths/min. Recheck while resting and discuss persistent changes with your clinician. Seek emergency help for severe trouble breathing.",
        VITALS_SOURCE,
      );
  }
  const priority = { urgent: 0, attention: 1, info: 2 };
  return alerts.sort(
    (a, b) =>
      priority[a.priority] - priority[b.priority] || a.at.localeCompare(b.at),
  );
}
