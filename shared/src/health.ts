import type {
  HealthReading,
  WeatherData,
  HealthAdvice,
} from "./types.js";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function deterministicNow(stateNow?: string): number {
  if (stateNow) {
    const t = Date.parse(stateNow);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * Generate a deterministic, gently varying health reading for a profile.
 * Values stay inside plausible resting ranges and drift across time so the
 * "live" stats feel alive without real device integration.
 */
export function buildHealthReading(
  profileId: string,
  stateNow?: string,
): HealthReading {
  const base = deterministicNow(stateNow) / 60000; // minute bucket
  const rand = seeded(profileId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(base));
  const drift = Math.sin(base / 7) * 0.5 + 0.5;
  const heartRate = Math.round(clamp(62 + drift * 8 + rand() * 6, 55, 95));
  const systolic = Math.round(clamp(116 + drift * 6 + rand() * 8, 100, 140));
  const diastolic = Math.round(clamp(74 + drift * 4 + rand() * 6, 60, 90));
  const breathingRate = Math.round(clamp(15 + drift * 2 + rand() * 3, 11, 22));
  const sleepHours = Math.round(clamp(6.5 + rand() * 2, 4, 9) * 10) / 10;
  const sleepQuality: HealthReading["sleepQuality"] =
    sleepHours >= 7.5 ? "Restful" : sleepHours >= 6 ? "Light" : "Fragmented";
  const steps = Math.round(clamp(4000 + rand() * 8000, 0, 16000));
  return {
    heartRate,
    systolic,
    diastolic,
    breathingRate,
    sleepHours,
    sleepQuality,
    steps,
    updatedAt: new Date(deterministicNow(stateNow)).toISOString(),
  };
}

/**
 * Generate deterministic current weather. No external API is called.
 */
export function buildWeather(stateNow?: string): WeatherData {
  const t = deterministicNow(stateNow);
  const rand = seeded(Math.floor(t / (1000 * 60 * 60))); // hourly bucket
  const temperatureC = Math.round(clamp(14 + Math.sin(t / 86400000) * 8 + rand() * 4, -5, 38));
  const humidity = Math.round(clamp(55 + rand() * 30, 20, 95));
  const windKph = Math.round(clamp(8 + rand() * 14, 0, 35));
  const uvIndex = Math.round(clamp(rand() * 9, 0, 11));
  const airQuality = Math.round(clamp(30 + rand() * 60, 10, 180));
  const psi = Math.round(clamp(20 + rand() * 80, 5, 200));
  const rainProbability = Math.round(clamp(rand() * 60 + (humidity > 75 ? 20 : 0), 0, 95));
  const condition =
    temperatureC >= 28
      ? "Sunny"
      : temperatureC >= 18
        ? "Partly cloudy"
        : temperatureC >= 10
          ? "Cloudy"
          : "Cold";
  const conditionIcon =
    condition === "Sunny"
      ? "☀️"
      : condition === "Partly cloudy"
        ? "⛅"
        : condition === "Cloudy"
          ? "☁️"
          : "🌧️";
  return {
    location: "Local area",
    temperatureC,
    feelsLikeC: temperatureC + Math.round(windKph / 5) - 1,
    humidity,
    windKph,
    condition,
    conditionIcon,
    uvIndex,
    airQuality,
    psi,
    rainProbability,
    updatedAt: new Date(t).toISOString(),
  };
}

function id(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/**
 * Produce deterministic, plain-language advice from a reading + weather pair.
 * This is the "AI interpretation" surface: it inspects vitals and weather and
 * returns structured recommendations a carer can act on.
 */
export function buildHealthAdvice(
  reading: HealthReading,
  weather: WeatherData,
): HealthAdvice[] {
  const advice: HealthAdvice[] = [];
  let i = 0;

  // Heart rate
  if (reading.heartRate > 90) {
    advice.push({
      id: id("hr", ++i),
      category: "Heart rate",
      tone: "watch",
      text: "Resting heart rate is a little high. Sit down, breathe slowly for a minute, and recheck if it stays above 95 at rest.",
    });
  } else if (reading.heartRate < 55) {
    advice.push({
      id: id("hr", ++i),
      category: "Heart rate",
      tone: "watch",
      text: "Resting heart rate is lower than typical. If there are no symptoms this is often fine, but mention it at the next routine check.",
    });
  } else {
    advice.push({
      id: id("hr", ++i),
      category: "Heart rate",
      tone: "info",
      text: "Resting heart rate is within a typical range. Keep up gentle daily activity.",
    });
  }

  // Blood pressure
  if (reading.systolic >= 140 || reading.diastolic >= 90) {
    advice.push({
      id: id("bp", ++i),
      category: "Blood pressure",
      tone: "caution",
      text: "Blood pressure reading is high. Rest for 5 minutes, avoid caffeine, and recheck. If it stays at this level, contact the GP.",
    });
  } else if (reading.systolic < 100) {
    advice.push({
      id: id("bp", ++i),
      category: "Blood pressure",
      tone: "watch",
      text: "Blood pressure is on the lower side. Encourage fluids and stand up slowly. Mention at the next routine review.",
    });
  } else {
    advice.push({
      id: id("bp", ++i),
      category: "Blood pressure",
      tone: "info",
      text: "Blood pressure is within the typical resting range.",
    });
  }

  // Breathing
  if (reading.breathingRate > 20) {
    advice.push({
      id: id("br", ++i),
      category: "Breathing",
      tone: "caution",
      text: "Breathing rate is raised. If there is shortness of breath, chest tightness, or a cough, seek routine care today.",
    });
  } else {
    advice.push({
      id: id("br", ++i),
      category: "Breathing",
      tone: "info",
      text: "Breathing rate is steady. Good indoor ventilation helps keep it comfortable.",
    });
  }

  // Sleep
  if (reading.sleepHours < 6) {
    advice.push({
      id: id("sl", ++i),
      category: "Sleep",
      tone: "watch",
      text: "Sleep was short last night. Plan a quiet, screen-free wind-down tonight and aim for 7–8 hours.",
    });
  } else if (reading.sleepQuality === "Fragmented") {
    advice.push({
      id: id("sl", ++i),
      category: "Sleep",
      tone: "watch",
      text: "Sleep was fragmented. Reducing late-day caffeine and fluids may help restfulness.",
    });
  } else {
    advice.push({
      id: id("sl", ++i),
      category: "Sleep",
      tone: "info",
      text: "Sleep looks restful. Keep a consistent bedtime and morning light exposure.",
    });
  }

  // Weather
  if (weather.temperatureC >= 30) {
    advice.push({
      id: id("wx", ++i),
      category: "Weather",
      tone: "caution",
      text: "It is hot today. Prioritise fluids, avoid midday sun, and check the room is cool for rest.",
    });
  } else if (weather.temperatureC <= 5) {
    advice.push({
      id: id("wx", ++i),
      category: "Weather",
      tone: "watch",
      text: "It is cold outside. Dress in layers and keep the home warm during the morning and evening.",
    });
  } else {
    advice.push({
      id: id("wx", ++i),
      category: "Weather",
      tone: "info",
      text: "Weather is mild. A short outdoor walk supports circulation and mood.",
    });
  }
  if (weather.uvIndex >= 6) {
    advice.push({
      id: id("uv", ++i),
      category: "Weather",
      tone: "watch",
      text: "UV index is high. Use sun protection and a hat for any outdoor time.",
    });
  }
  if (weather.airQuality >= 100) {
    advice.push({
      id: id("aq", ++i),
      category: "Weather",
      tone: "watch",
      text: "Air quality is poor. Keep windows closed and limit outdoor activity for anyone with a breathing condition.",
    });
  }
  return advice;
}
