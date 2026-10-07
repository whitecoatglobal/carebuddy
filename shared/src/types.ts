export type Category =
  | "Medication"
  | "Bedtime"
  | "Personal care"
  | "Appointment preparation"
  | "Other";
export type Outcome = null | "taken" | "complete" | "skipped";
export interface Profile {
  id: string;
  displayName: string;
  relationship: string;
  canView: boolean;
  canManage: boolean;
}
export interface Activity {
  id: string;
  text: string;
  at: string;
  actor: string;
  subject: string;
}
export interface Reminder {
  id: string;
  profileId: string;
  category: Category;
  title: string;
  scheduledAt: string;
  notificationSnoozedUntil: string | null;
  recurrence: "None" | "Daily";
  seriesId: string | null;
  occurrenceDate: string;
  instructions: string;
  appointmentId: string | null;
  outcome: Outcome;
  completedAt: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
  occurrenceOverride: boolean;
  deletedAt: string | null;
  history: Activity[];
}
export interface Appointment {
  id: string;
  profileId: string;
  category: string;
  title: string;
  startsAt: string;
  locationLabel: string;
  checklist: boolean[];
  checklistItems?: { id: string; label: string; completed: boolean }[];
  recordOrigin: "demo" | "user-saved";
  providerConfirmed: false;
  provenanceHistory: Activity[];
}
export type BenefitStatus =
  | "Listed in sample plan"
  | "Conditions apply"
  | "Needs confirmation"
  | "Not listed in sample data";
export interface Benefit {
  id: string;
  profileId: string;
  category: string;
  status: BenefitStatus;
  conditions: string;
  source: string;
  policyDate: string | null;
  notes?: string;
}
export interface Receipt {
  actionId: string;
  sourceIds: string[];
  profileId: string;
  actor: string;
  operation: string;
  confirmation: boolean;
  outcome: "Saved" | "Cancelled" | "Save failed";
  timestamp: string;
}
export interface ChatMessage {
  id: string;
  profileId: string;
  role: "user" | "assistant";
  text: string;
  contextId: string | null;
  timestamp: string;
  actionReceipt?: Receipt;
}
export interface HealthReading {
  heartRate: number; // bpm
  systolic: number; // mmHg
  diastolic: number; // mmHg
  breathingRate: number; // breaths/min
  sleepHours: number;
  sleepQuality: "Restful" | "Light" | "Fragmented";
  steps: number;
  updatedAt: string;
}
export interface WeatherData {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number; // %
  windKph: number;
  condition: string;
  conditionIcon: string;
  uvIndex: number;
  airQuality: number; // AQI
  psi: number; // Pollutant Standards Index (SG)
  rainProbability: number; // % chance of rain
  updatedAt: string;
}
export interface HealthAdvice {
  id: string;
  category: "Heart rate" | "Blood pressure" | "Breathing" | "Sleep" | "Weather";
  tone: "info" | "watch" | "caution";
  text: string;
}
export interface Notification {
  id: string;
  profileId: string;
  title: string;
  targetType: "reminder" | "appointment" | "benefit" | "urgent";
  targetId: string;
  readAt: string | null;
  timestamp: string;
}
export interface State {
  timeZone?: string;
  schedulingWarnings?: string[];
  version: 1;
  started: boolean;
  now: string;
  selectedProfileId: string;
  profiles: Profile[];
  reminders: Reminder[];
  appointments: Appointment[];
  benefits: Benefit[];
  chats: ChatMessage[];
  notifications: Notification[];
  appliedActions: string[];
  activity: Activity[];
  carMode: "disconnected" | "parked" | "driving";
  preferences: { genericReminders: boolean; spokenReminders: boolean };
  scenario: string;
}
export interface ReminderInput {
  profileId: string;
  category: Category;
  title: string;
  scheduledAt: string;
  recurrence: "None" | "Daily";
  instructions: string;
  appointmentId?: string | null;
}
export type Command =
  | { type: "start" }
  | { type: "reset" }
  | { type: "selectProfile"; profileId: string }
  | { type: "createReminder"; input: ReminderInput }
  | {
      type: "editReminder";
      id: string;
      input: ReminderInput;
      scope: "occurrence" | "future";
    }
  | {
      type: "completeReminder";
      id: string;
      outcome: "taken" | "complete" | "skipped";
      reason?: string;
    }
  | { type: "undoCompletion"; id: string }
  | { type: "snoozeReminder"; id: string; until: string }
  | { type: "deleteReminder"; id: string }
  | { type: "undoDeletion"; id: string }
  | {
      type: "addDependent";
      displayName: string;
      relationship: string;
      acknowledged: boolean;
      canManage?: boolean;
    }
  | {
      type: "updateDependent";
      id: string;
      patch: Partial<Pick<Profile, "displayName" | "relationship" | "canManage">>;
    }
  | { type: "removeDependent"; id: string }
  | { type: "toggleChecklist"; id: string; index: number }
  | { type: "updateChecklist"; id: string; items: { id: string; label: string; completed: boolean }[] }
  | { type: "createAppointment"; input: { profileId: string; category: string; title: string; startsAt: string; locationLabel: string } }
  | { type: "updateBenefitNote"; id: string; notes: string }
  | {
      type: "editAppointment";
      id: string;
      title: string;
      startsAt: string;
      locationLabel: string;
    }
  | { type: "addBenefitNote"; category: string; notes: string }
  | { type: "markNotificationRead"; id: string }
  | { type: "chatMessage"; message: ChatMessage }
  | { type: "setCarMode"; mode: State["carMode"] }
  | {
      type: "setPreference";
      key: "genericReminders" | "spokenReminders";
      value: boolean;
    }
  | { type: "advanceClock" }
  | { type: "restoreClock" }
  | { type: "scenario"; name: string }
  | { type: "urgentViewed" };
export interface Action {
  id: string;
  profileId: string;
  command: Command;
  sourceIds: string[];
  label: string;
  expectedClock?: string;
  expectedSources?: (Reminder | Appointment)[];
  proposalId?: string;
  revision?: number;
  expiresAt?: string;
  preview?: { before?: unknown; after?: unknown };
}
