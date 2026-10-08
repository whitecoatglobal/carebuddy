import type { HealthVitals } from "./types";

export const HEALTH_METRICS = [
  {
    id: "blood-pressure",
    label: "Blood pressure",
    cardLabel: "Blood pressure",
    unit: "mmHg",
    icon: "heart",
    context: "Upper-arm cuff · At rest",
    reference: "Below 120/80 and above 90/60 mmHg",
    description:
      "Blood pressure measures the force of blood against your artery walls. The first number is the pressure when your heart beats; the second is the pressure between beats.",
    note: "A single reading is a snapshot. Your usual pattern and your clinician's targets matter too.",
  },
  {
    id: "pulse",
    label: "Pulse / heart rate",
    cardLabel: "Pulse",
    unit: "bpm",
    icon: "pulse",
    context: "At rest · Beats per minute",
    reference: "60–100 bpm at rest",
    description:
      "Your pulse tells you how many times your heart beats in a minute. Activity, fitness, medicines, and whether you're sitting or standing can affect it.",
    note: "Compare readings taken under similar conditions, rather than immediately after activity.",
  },
  {
    id: "temperature",
    label: "Body temperature",
    cardLabel: "Body temperature",
    unit: "°C",
    icon: "thermometer",
    context: "Oral thermometer · Celsius",
    reference: "Typically 36.5–37.3°C",
    description:
      "Body temperature shows how warm your body is. It varies between people, through the day, and with the way it is measured.",
    note: "Record the measurement method, so future readings can be compared consistently.",
  },
  {
    id: "oxygen",
    label: "Blood oxygen",
    cardLabel: "Blood oxygen",
    unit: "%",
    icon: "drop",
    context: "Fingertip pulse oximeter · SpO₂",
    reference: "Usually 95–100%",
    description:
      "SpO₂ estimates the percentage of your blood's haemoglobin carrying oxygen. A fingertip pulse oximeter uses light to estimate this value.",
    note: "Device accuracy, skin pigmentation, circulation, and nail polish can affect the estimate. Consider how you feel alongside the number.",
  },
  {
    id: "breathing",
    label: "Breathing rate",
    cardLabel: "Breathing",
    unit: "breaths/min",
    icon: "lungs",
    context: "At rest · Breaths per minute",
    reference: "12–18 breaths/min at rest",
    description:
      "Breathing rate counts how many breaths you take in a minute. Exercise and other changes in how you feel can affect the rate.",
    note: "Resting readings provide a more consistent point of comparison.",
  },
] as const;

export function healthMetricsFor(vitals: HealthVitals) {
  const values = {
    "blood-pressure": `${vitals.systolic}/${vitals.diastolic}`,
    pulse: String(vitals.pulseBpm),
    temperature: vitals.temperatureC.toFixed(1),
    oxygen: String(vitals.oxygenPercent),
    breathing: String(vitals.breathingPerMinute),
  };
  return HEALTH_METRICS.map((metric) => ({
    ...metric,
    value: values[metric.id],
  }));
}

export const HEALTH_RECOMMENDATIONS = [
  {
    title: "Give yourself a quiet moment",
    text: "Before checking blood pressure, sit quietly for at least five minutes. Support your back, keep your feet flat, and rest your arm at heart level.",
    icon: "leaf",
  },
  {
    title: "Make each reading consistent",
    text: "Use an upper-arm blood pressure cuff that fits and follow the device instructions. Note how your temperature was measured when recording it.",
    icon: "heart",
  },
  {
    title: "Keep a simple record",
    text: "Write down the date, time, and how you feel. A series of readings can help your healthcare professional understand your usual pattern.",
    icon: "today",
  },
  {
    title: "Let an oxygen reading settle",
    text: "With a fingertip pulse oximeter, keep your hand warm and sit still. Wait for a steady number, and follow your clinician's advice on when to measure.",
    icon: "drop",
  },
] as const;

export const HEALTH_SOURCES = [
  {
    label: "Vital signs · MedlinePlus",
    url: "https://medlineplus.gov/ency/article/002341.htm",
  },
  {
    label: "Blood pressure · AHA",
    url: "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home",
  },
  {
    label: "Pulse oximeters · FDA",
    url: "https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics",
  },
] as const;
