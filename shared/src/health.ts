import type {
  HealthReading,
  WeatherData,
  HealthAdvice,
} from "./types.js";

function deterministicNow(stateNow?: string): number {
  if (stateNow) {
    const t = Date.parse(stateNow);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * Returns null — no fake health readings.
 * Integrate a real wearable API here when available.
 */
export function buildHealthReading(
  _profileId: string,
  _stateNow?: string,
): HealthReading | null {
  return null;
}

/**
 * Returns null — no fake weather.
 * Integrate a real weather API here when available.
 */
export function buildWeather(_stateNow?: string): WeatherData | null {
  return null;
}

/**
 * Returns empty array when no reading/weather data is available.
 */
export function buildHealthAdvice(
  reading: HealthReading | null,
  weather: WeatherData | null,
): HealthAdvice[] {
  if (!reading || !weather) return [];
  const advice: HealthAdvice[] = [];
  let i = 0;
  const id = (prefix: string, n: number) => `${prefix}-${n}`;

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
