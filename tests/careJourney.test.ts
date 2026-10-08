import { describe, it, expect } from "vitest";
import {
  buildCarePlan,
  buildCareBrief,
  extractDocument,
} from "../backend/src/careJourney";
import { extractCareFile } from "../backend/src/careOcr";
const document = {
  id: "doc",
  name: "Sample",
  createdAt: "2026-10-08T00:00:00Z",
  pages: [
    {
      page: 1,
      text: "Alex has a checkup on 12 October 2026 at 10:00. Bring your letter.",
    },
  ],
};
const request = {
  fictionalOnly: true,
  profileId: "p-me",
  profileName: "Alex",
  kind: "appointment",
  timeZone: "Asia/Singapore",
  now: "2026-10-08T00:00:00Z",
  document,
};
const output = {
  summary: "Review the checkup.",
  instructions: [
    { text: "Bring your letter.", page: 1, quote: "Bring your letter." },
  ],
  questions: [],
  uncertainties: [],
  actions: [
    {
      type: "appointment",
      title: "Checkup",
      scheduledAt: "2026-10-12T10:00:00+08:00",
      location: "",
      instructions: "Bring your letter.",
      recurrence: "None",
      evidence: [{ page: 1, quote: document.pages[0].text }],
    },
  ],
};
const complete = (value: any) => async () => JSON.stringify(value);
describe("care document workflows", () => {
  it("extracts pasted fictional text without storing uploads", async () => {
    const d = await extractDocument({
      fictionalOnly: true,
      name: "Visit notes",
      text: "Bring your letter.",
    });
    expect(d.pages).toEqual([{ page: 1, text: "Bring your letter." }]);
    expect(d.id).toBeTruthy();
  });
  it("requires explicit fictional-only acknowledgement", async () => {
    await expect(
      extractDocument({ name: "Notes", text: "secret" }),
    ).rejects.toThrow("fictional");
  });
  it("produces reviewable source-linked actions, no records are executed", async () => {
    const p = await buildCarePlan(request, complete(output));
    expect(p.actions[0].scheduledAt).toBe("2026-10-12T10:00:00+08:00");
    expect(p.actions[0].evidence[0].quote).toBe(document.pages[0].text);
  });
  it("rejects fabricated evidence", async () => {
    const o = structuredClone(output);
    o.actions[0].evidence[0].quote = "Take 50 mg";
    await expect(buildCarePlan(request, complete(o))).rejects.toThrow(
      "not in the source",
    );
  });
  it("preserves unresolved dates and flags source person mismatches", async () => {
    const o: any = structuredClone(output);
    o.actions[0].scheduledAt = null;
    o.sourcePersonName = "Someone else";
    const p = await buildCarePlan(request, complete(o));
    expect(p.actions[0].scheduledAt).toBeNull();
    expect(p.uncertainties.join(" ")).toContain("selected person is Alex");
  });
  it("replaces fabricated clinical instructions with exact evidence", async () => {
    const o = structuredClone(output);
    o.actions[0].instructions = "Take twice the dose";
    const p = await buildCarePlan(request, complete(o));
    expect(p.actions[0].instructions).toBe(document.pages[0].text);
  });
  it("preserves negation when generated instructions omit it", async () => {
    const quote = "Do not take this medicine before the appointment.";
    const o = structuredClone(output);
    o.instructions = [];
    o.actions[0].instructions = "take this medicine before the appointment.";
    o.actions[0].evidence = [{ page: 1, quote }];
    const p = await buildCarePlan(
      {
        ...request,
        document: { ...document, pages: [{ page: 1, text: quote }] },
      },
      complete(o),
    );
    expect(p.actions[0].instructions).toBe(quote);
  });
  it("rejects unsafe dates, types and excessive document pages", async () => {
    const o = structuredClone(output);
    o.actions[0].scheduledAt = "tomorrow";
    await expect(buildCarePlan(request, complete(o))).rejects.toThrow(
      "invalid date",
    );
    await expect(
      buildCarePlan(
        {
          ...request,
          document: { ...document, pages: Array(6).fill(document.pages[0]) },
        },
        complete(output),
      ),
    ).rejects.toThrow();
  });
  it("rejects malformed files before invoking OCR", async () => {
    await expect(
      extractCareFile(Buffer.from("bad"), "image/png"),
    ).rejects.toThrow("valid PNG");
  });
});
const briefRequest = {
  fictionalOnly: true as const,
  profileId: "p-me",
  profileName: "Alex",
  appointment: {
    id: "a1",
    profileId: "p-me",
    title: "Checkup",
    startsAt: "2026-10-12T10:00:00+08:00",
    locationLabel: "Clinic",
  },
  reminders: [],
  concerns: ["Sleep interrupted"],
  questions: ["What should I record?"],
  pendingTasks: [],
};
describe("appointment brief grounding", () => {
  it("attaches source records and distinguishes concerns", async () => {
    const b = await buildCareBrief(
      briefRequest,
      complete({
        sections: [
          {
            heading: "Concerns",
            items: [{ text: "Sleep interrupted", sourceIds: ["concern:0"] }],
          },
        ],
        questions: ["What should I record?"],
      }),
    );
    expect(b.sources.find((s) => s.id === "concern:0")?.text).toBe(
      "Sleep interrupted",
    );
  });
  it("rejects cross-profile appointment records", async () => {
    await expect(
      buildCareBrief(
        {
          ...briefRequest,
          appointment: { ...briefRequest.appointment, profileId: "other" },
        },
        complete({}),
      ),
    ).rejects.toThrow("different person");
  });
  it("rejects nonexistent source citations", async () => {
    await expect(
      buildCareBrief(
        briefRequest,
        complete({
          sections: [
            {
              heading: "Summary",
              items: [{ text: "Invented fact", sourceIds: ["fake"] }],
            },
          ],
          questions: [],
        }),
      ),
    ).rejects.toThrow("unavailable records");
  });
});

describe("brief input and question fidelity", () => {
  it("keeps the user questions even if AI omits them", async () => {
    const brief = await buildCareBrief(
      briefRequest,
      complete({
        sections: [
          {
            heading: "Visit",
            items: [{ text: "Checkup", sourceIds: ["appointment:a1"] }],
          },
        ],
        questions: [],
      }),
    );
    expect(brief.questions).toContain("What should I record?");
  });
  it("rejects a different person in routine evidence", async () => {
    await expect(
      buildCareBrief(
        {
          ...briefRequest,
          reminders: [
            {
              id: "r1",
              profileId: "other",
              title: "Walk",
              instructions: "",
              scheduledAt: "2026-10-12T10:00:00Z",
              outcome: null,
            },
          ],
        },
        complete({}),
      ),
    ).rejects.toThrow("different person");
  });
  it("rejects invalid recorded outcomes", async () => {
    await expect(
      buildCareBrief(
        {
          ...briefRequest,
          reminders: [
            {
              id: "r1",
              profileId: "p-me",
              title: "Walk",
              instructions: "",
              scheduledAt: "2026-10-12T10:00:00Z",
              outcome: "clinically confirmed",
            },
          ],
        },
        complete({}),
      ),
    ).rejects.toThrow("Invalid recorded");
  });
});

describe("appointment preparation evidence", () => {
  it("includes saved preparation notes in the source snapshot", async () => {
    const brief = await buildCareBrief(
      {
        ...briefRequest,
        appointment: {
          ...briefRequest.appointment,
          preparationNotes: "Bring your appointment letter.",
        },
      },
      complete({
        sections: [
          {
            heading: "Preparation",
            items: [
              {
                text: "Bring your appointment letter.",
                sourceIds: ["appointment:a1"],
              },
            ],
          },
        ],
        questions: [],
      }),
    );
    expect(brief.sources[0].text).toContain(
      "Recorded preparation: Bring your appointment letter.",
    );
  });
  it("rejects oversized preparation notes before calling AI", async () => {
    await expect(
      buildCareBrief(
        {
          ...briefRequest,
          appointment: {
            ...briefRequest.appointment,
            preparationNotes: "x".repeat(501),
          },
        },
        complete({}),
      ),
    ).rejects.toThrow("overly long");
  });
});
