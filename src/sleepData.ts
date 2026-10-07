// Frontend sample data. Replace this source when sleep data is connected.
export const SAMPLE_SLEEP_NIGHT = {
  score: 63,
  sleepMinutes: 400,
  awakeMinutes: 30,
  bedtime: "11:10 pm",
  wakeTime: "6:20 am",
  stages: [
    {
      id: "light",
      name: "Light sleep",
      phase: "N1 & N2",
      percentage: 55,
      minutes: 220,
      color: "#B9AEDC",
      description: "The transition into sleep and the lighter part of each non-REM cycle.",
    },
    {
      id: "deep",
      name: "Deep sleep",
      phase: "N3",
      percentage: 20,
      minutes: 80,
      color: "#4F7A66",
      description: "Slow-wave sleep, with slower brain activity. You usually spend more time here early in the night.",
    },
    {
      id: "rem",
      name: "REM sleep",
      phase: "REM",
      percentage: 25,
      minutes: 100,
      color: "#A8CBDB",
      description: "Your brain is active and dreaming often happens. REM periods tend to be longer later in the night.",
    },
  ],
} as const;

export const SLEEP_RECOMMENDATIONS = [
  {
    title: "Make a little more room for sleep",
    text: "Try an earlier wind-down tonight so you have more time to rest. Keep your bedtime and wake-up time steady, including weekends.",
  },
  {
    title: "Give your last hour a calmer pace",
    text: "Dim the lights and put screens aside. Choose a quiet book or a few minutes of slow breathing before bed.",
  },
  {
    title: "Move caffeine earlier in the day",
    text: "Have coffee or caffeinated tea earlier. Avoid them late in the afternoon or evening, when they may interfere with sleep.",
  },
  {
    title: "Set up a restful room",
    text: "Keep your bedroom cool, dark and quiet. A dim night light is fine if you need one.",
  },
] as const;

export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

const singaporeDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
});
const nightLabel = new Intl.DateTimeFormat("en-SG", {
  timeZone: "UTC", weekday: "short", day: "numeric", month: "short",
});

export function getSleepNightLabels(now = new Date()) {
  const parts = Object.fromEntries(singaporeDate.formatToParts(now).map((part) => [part.type, part.value]));
  const wakeDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const bedDate = new Date(wakeDate.getTime() - 24 * 60 * 60_000);
  return {
    bedDate: bedDate.toISOString().slice(0, 10),
    wakeDate: wakeDate.toISOString().slice(0, 10),
    label: `${nightLabel.format(bedDate)} – ${nightLabel.format(wakeDate)}`,
  };
}
