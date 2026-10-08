import type { Page } from "@playwright/test";
import { emptyState, execute, uid } from "../shared/src/domain";
import type { State, WeatherData } from "../shared/src/types";

const now = "2030-10-08T09:00:00+08:00";
export function fixture(): State {
  const s = emptyState();
  s.now = now;
  s.clockMode = "reference";
  s.started = true;
  s.selectedProfileId = "p-me";
  s.profiles = [
    {
      id: "p-me",
      displayName: "Alex Sample",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
    {
      id: "p-family",
      displayName: "Jo Sample",
      relationship: "Parent",
      canView: true,
      canManage: false,
    },
  ];
  s.reminders = [
    {
      id: "ui-walk",
      profileId: "p-me",
      category: "Personal care",
      title: "Afternoon walk",
      scheduledAt: "2030-10-08T18:00:00+08:00",
      notificationSnoozedUntil: null,
      recurrence: "None",
      seriesId: null,
      occurrenceDate: "2030-10-08",
      instructions: "",
      appointmentId: null,
      outcome: null,
      completedAt: null,
      recordedBy: null,
      recordedAt: null,
      occurrenceOverride: false,
      deletedAt: null,
      history: [],
    },
  ];
  s.benefits = [
    {
      id: "ui-benefit",
      profileId: "p-me",
      category: "dental",
      status: "Conditions apply",
      conditions:
        "Annual allowance: S$300. Limit: 2 visits per year. Prior approval required.",
      source: "Fictional UI test policy",
      policyDate: "2030-01-01T00:00:00+08:00",
    },
  ];
  return s;
}
const weather: WeatherData = {
  location: "Singapore",
  temperatureC: 29,
  feelsLikeC: null,
  humidity: 73,
  windKph: null,
  condition: "Cloudy",
  conditionIcon: "☁",
  uvIndex: null,
  airQuality: null,
  psi: 24,
  rainProbability: null,
  updatedAt: now,
  stationName: "Test station",
  source: "Test weather provider",
  forecastValidUntil: "2030-10-08T11:00:00+08:00",
  forecastPeriod: "9am–11am",
};
export async function prepare(page: Page, s: State = fixture()) {
  await page.clock.setFixedTime(new Date(now));
  let saved = structuredClone(s);
  let revision = 1;
  const applied = new Set<string>();
  await page.addInitScript(() => {
    localStorage.setItem("care-buddy.client-id", "client-ui-fixture");
  });
  await page.route("**/api/access", (route) =>
    route.fulfill({ json: { clientId: "client-ui-fixture", isVisible: true } }),
  );
  await page.route("**/api/state/**", (route) =>
    route.fulfill({ json: { state: saved, revision } }),
  );
  await page.route("**/api/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (!applied.has(body.actionId)) {
      if (body.expectedRevision !== revision) {
        await route.fulfill({
          status: 409,
          json: { error: "Care records changed" },
        });
        return;
      }
      try {
        saved = execute(
          saved,
          body.command,
          body.actionId,
          body.command.type === "selectProfile" ? undefined : body.profileId,
        );
        if (["reset", "restoreClock"].includes(body.command.type))
          saved.clockMode = "live";
        if (["advanceClock", "scenario"].includes(body.command.type))
          saved.clockMode = "reference";
        applied.add(body.actionId);
        if (!["selectProfile", "chatMessage"].includes(body.command.type))
          revision++;
      } catch (error) {
        await route.fulfill({
          status: 400,
          json: { error: (error as Error).message },
        });
        return;
      }
    }
    await route.fulfill({ json: { state: saved, revision } });
  });
  await page.route("**/api/buddy/interpret", (route) => {
    const body = route.request().postDataJSON();
    saved.chats.push({
      id: uid(),
      profileId: body.profileId,
      role: "user",
      text: body.message,
      timestamp: saved.now,
      contextId: null,
    });
    const text = "We can plan a routine together. No changes made.";
    saved.chats.push({
      id: uid(),
      profileId: body.profileId,
      role: "assistant",
      text,
      timestamp: saved.now,
      contextId: null,
      operationStatus: "not_changed",
    });
    return route.fulfill({
      json: { text, state: saved, revision, operationStatus: "not_changed" },
    });
  });
  await page.route("**/api/weather", (route) =>
    route.fulfill({ json: { weather } }),
  );
  await page.route("**/api/health/snapshot", (route) =>
    route.fulfill({ json: { reading: null, weather: null, advice: [] } }),
  );
}
export const state = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        `care-buddy.server-cache.${localStorage.getItem("care-buddy.client-id")}`,
      )!,
    ),
  );
export const navigate = (page: Page, path: string) =>
  page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
export const confirm = async (page: Page) => {
  const dialog = page.getByRole("dialog").last();
  const label = await dialog.getAttribute("aria-label");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await page
    .getByRole("dialog", { name: label!, exact: true })
    .waitFor({ state: "detached" });
};
