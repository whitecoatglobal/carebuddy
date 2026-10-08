import { isoAt } from "./domain.js";
import type {
  Category,
  Profile,
  Reminder,
  Appointment,
  State,
} from "./types.js";

const parents = [
  {
    id: "p-demo-mom",
    name: "Mom",
    aliases: ["mom", "mum", "mother"],
    times: ["08:00", "08:30", "11:00", "17:30", "21:30"],
    appointment: {
      category: "GP",
      title: "GP follow-up",
      daysAway: 1,
      time: "10:30",
      location: "Family clinic",
    },
  },
  {
    id: "p-demo-dad",
    name: "Dad",
    aliases: ["dad", "father"],
    times: ["08:30", "08:45", "12:00", "18:00", "22:00"],
    appointment: {
      category: "Screening",
      title: "Annual health screening",
      daysAway: 3,
      time: "09:00",
      location: "Health screening centre",
    },
  },
];
const routines: {
  key: string;
  title: string;
  category: Category;
  instructions: string;
}[] = [
  {
    key: "medication",
    title: "Take medication",
    category: "Medication",
    instructions: "Follow your existing medication instructions.",
  },
  {
    key: "blood-pressure",
    title: "Record blood pressure",
    category: "Personal care",
    instructions: "Keep your reading handy for your next appointment.",
  },
  {
    key: "water",
    title: "Drink a glass of water",
    category: "Personal care",
    instructions: "A little hydration break.",
  },
  {
    key: "walk",
    title: "Take a short walk",
    category: "Personal care",
    instructions: "Make room for movement.",
  },
  {
    key: "bedtime",
    title: "Wind down for bed",
    category: "Bedtime",
    instructions: "Ease into your evening.",
  },
];

// Add fictional parents once to an existing or newly created public demo.
// Existing family profiles retain their own records, names and access settings.
export function seedDemoFamily(state: State, now = state.now): State {
  if (
    state.scenario !== "public-demo" ||
    state.demoFamilySeeded ||
    !state.started ||
    !state.profiles.length
  )
    return state;
  const dateAt = (daysAway: number) =>
    new Date(Date.parse(now) + daysAway * 86_400_000 + 28_800_000)
      .toISOString()
      .slice(0, 10);
  const date = dateAt(0);
  const profiles: Profile[] = [];
  const reminders: Reminder[] = [];
  const appointments: Appointment[] = [];
  for (const parent of parents) {
    if (
      state.profiles.some(
        (profile) =>
          profile.id === parent.id ||
          (profile.relationship === "Parent" &&
            parent.aliases.includes(profile.displayName.trim().toLowerCase())),
      )
    )
      continue;
    profiles.push({
      id: parent.id,
      displayName: parent.name,
      relationship: "Parent",
      canView: true,
      canManage: true,
    });
    for (const [index, routine] of routines.entries()) {
      const seriesId = `demo-family-${parent.id}-${routine.key}`;
      reminders.push({
        id: `${seriesId}:${date}`,
        profileId: parent.id,
        category: routine.category,
        title: routine.title,
        scheduledAt: isoAt(date, parent.times[index]),
        notificationSnoozedUntil: null,
        recurrence: "Daily",
        seriesId,
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
      });
    }
    appointments.push({
      id: `demo-family-${parent.id}-appointment`,
      profileId: parent.id,
      category: parent.appointment.category,
      title: parent.appointment.title,
      startsAt: isoAt(
        dateAt(parent.appointment.daysAway),
        parent.appointment.time,
      ),
      locationLabel: parent.appointment.location,
      checklist: [false, false, false],
      recordOrigin: "demo",
      providerConfirmed: false,
      provenanceHistory: [],
    });
  }
  return {
    ...state,
    demoFamilySeeded: true,
    profiles: [...state.profiles, ...profiles],
    reminders: [...state.reminders, ...reminders],
    appointments: [...state.appointments, ...appointments],
  };
}
