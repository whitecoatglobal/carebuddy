import {
  emptyState,
  isoAt,
  materialize,
  type Category,
  type State,
} from "care-buddy-shared";
import { getSleepNightLabels } from "./sleepData";

export const isPublicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";

// Frontend-only fictional content for the public prototype. Existing care
// records always take precedence; no account records are copied into this demo.
export function createPublicDemoState(now = new Date()): State {
  const state = emptyState();
  const date = getSleepNightLabels(now).wakeDate;
  state.now = new Date(now.getTime() + 8 * 3600000)
    .toISOString()
    .replace("Z", "+08:00");
  state.started = true;
  state.scenario = "public-demo";
  state.selectedProfileId = "p-me";
  state.profiles = [
    {
      id: "p-me",
      displayName: "Me",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
  ];
  const routines: {
    id: string;
    title: string;
    category: Category;
    time: string;
    instructions: string;
  }[] = [
    {
      id: "medication",
      title: "Take medication",
      category: "Medication",
      time: "08:00",
      instructions: "Follow your existing medication instructions.",
    },
    {
      id: "water",
      title: "Drink a glass of water",
      category: "Personal care",
      time: "12:00",
      instructions: "A little hydration break.",
    },
    {
      id: "walk",
      title: "Take a short walk",
      category: "Personal care",
      time: "18:30",
      instructions: "Make room for movement.",
    },
    {
      id: "bedtime",
      title: "Wind down for bed",
      category: "Bedtime",
      time: "22:00",
      instructions: "Ease into your evening.",
    },
  ];
  state.reminders = routines.map((routine) => ({
    id: `sample-${routine.id}-${date}`,
    profileId: "p-me",
    category: routine.category,
    title: routine.title,
    scheduledAt: isoAt(date, routine.time),
    notificationSnoozedUntil: null,
    recurrence: "Daily",
    seriesId: `sample-${routine.id}`,
    occurrenceDate: date,
    instructions: routine.instructions,
    appointmentId: null,
    outcome: null,
    completedAt: null,
    recordedBy: null,
    recordedAt: null,
    occurrenceOverride: false,
    deletedAt: null,
    history: [],
  }));
  return materialize(state);
}

export function publicBootstrapState(local: State, remote: State): State {
  if (remote.profiles.length) return remote;
  return local.profiles.length ? local : createPublicDemoState();
}
