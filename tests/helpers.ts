import type { Page } from "@playwright/test";
import { emptyState } from "../shared/src/domain";
import type { State, WeatherData } from "../shared/src/types";

const now = "2030-10-08T09:00:00+08:00";
export function fixture(): State {
  const s = emptyState();
  s.now = now;
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
  await page.addInitScript((state) => {
    if (!sessionStorage.getItem("ui-fixture-installed")) {
      localStorage.setItem("care-buddy-demo-v1", JSON.stringify(state));
      sessionStorage.setItem("ui-fixture-installed", "yes");
    }
  }, s);
  await page.route("**/api/access", (route) =>
    route.fulfill({
      json: {
        clientId: route.request().headers()["x-carebuddy-client-id"],
        isVisible: true,
      },
    }),
  );
  await page.route("**/api/state/**", (route) =>
    route.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/buddy/interpret", (route) =>
    route.fulfill({
      json: { text: "We can plan a routine together. No changes made." },
    }),
  );
  await page.route("**/api/weather", (route) =>
    route.fulfill({ json: { weather } }),
  );
  await page.route("**/api/health/snapshot", (route) =>
    route.fulfill({ json: { reading: null, weather: null, advice: [] } }),
  );
}
export const state = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("care-buddy-demo-v1")!));
export const navigate = (page: Page, path: string) =>
  page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
export const confirm = (page: Page) =>
  page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
