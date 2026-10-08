export interface CarePage {
  page: number;
  text: string;
}
export interface CareDocument {
  id: string;
  name: string;
  pages: CarePage[];
  createdAt: string;
}
export interface CareEvidence {
  page: number;
  quote: string;
}
export interface CarePlanAction {
  id: string;
  type: "appointment" | "reminder";
  title: string;
  scheduledAt: string | null;
  location?: string;
  instructions: string;
  recurrence: "None" | "Daily";
  evidence: CareEvidence[];
}
export interface CarePlan {
  id: string;
  profileId: string;
  kind: "appointment" | "postVisit";
  summary: string;
  instructions: { text: string; page: number; quote: string }[];
  questions: string[];
  uncertainties: string[];
  actions: CarePlanAction[];
  sourcePersonName?: string;
}
export interface CareBriefSource {
  id: string;
  text: string;
}
export interface CareBrief {
  id: string;
  profileId: string;
  appointmentId: string;
  createdAt: string;
  sections: {
    heading: string;
    items: { text: string; sourceIds: string[] }[];
  }[];
  questions: string[];
  sources: CareBriefSource[];
}
export interface CareBriefRequest {
  profileId: string;
  profileName: string;
  fictionalOnly: true;
  appointment: {
    id: string;
    profileId: string;
    title: string;
    startsAt: string;
    locationLabel: string;
    preparationNotes?: string;
  };
  reminders: {
    id: string;
    profileId: string;
    title: string;
    instructions: string;
    scheduledAt: string;
    outcome: string | null;
  }[];
  concerns: string[];
  questions: string[];
  pendingTasks: { id: string; text: string }[];
}
