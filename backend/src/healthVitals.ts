import type { HealthVitals } from "care-buddy-shared";
import { db } from "./db.js";

interface VitalsRow {
  profile_id: string;
  systolic: number;
  diastolic: number;
  pulse_bpm: number;
  temperature_c: number;
  oxygen_percent: number;
  breathing_per_minute: number;
  updated_at: string;
  source: HealthVitals["source"];
}

// Call after the API has checked this browser's access to the care profile.
// Seed each profile once; subsequent requests always use the stored values.
export function readHealthVitals(
  clientId: string,
  profileId: string,
): HealthVitals {
  const select = db.prepare<[string, string], VitalsRow>(
    `SELECT profile_id, systolic, diastolic, pulse_bpm, temperature_c,
            oxygen_percent, breathing_per_minute, updated_at, source
     FROM health_vitals WHERE client_id = ? AND profile_id = ?`,
  );
  let row = select.get(clientId, profileId);
  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO health_vitals
       (client_id, profile_id, systolic, diastolic, pulse_bpm, temperature_c,
        oxygen_percent, breathing_per_minute, updated_at, source)
       VALUES (?, ?, 118, 76, 72, 36.7, 98, 16, ?, 'demo')`,
    ).run(clientId, profileId, new Date().toISOString());
    row = select.get(clientId, profileId);
  }
  if (!row) throw new Error("Health readings could not be loaded");
  return {
    profileId: row.profile_id,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulseBpm: row.pulse_bpm,
    temperatureC: row.temperature_c,
    oxygenPercent: row.oxygen_percent,
    breathingPerMinute: row.breathing_per_minute,
    updatedAt: row.updated_at,
    source: row.source,
  };
}
