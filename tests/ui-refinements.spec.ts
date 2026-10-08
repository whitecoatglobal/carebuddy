import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture, prepare, state, navigate, confirm } from "./helpers";
import { emptyState } from "../shared/src/domain";
import type { WeatherData } from "../shared/src/types";

// Build with VITE_BUDDY_BACKEND_URL=/ npm run build before this suite.
// The real fetch clients are exercised against intercepted provider responses.
// Do not enable VITE_PUBLIC_DEMO: onboarding must begin with empty records.
test.use({ serviceWorkers: "block" });
const now = "2030-10-08T09:00:00+08:00";
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
test("self onboarding reviews and persists the selected Walking starter", async ({
  page,
}) => {
  const s = emptyState();
  s.now = now;
  await prepare(page, s);
  await page.goto("/welcome");
  await expect(
    page.getByRole("button", { name: /For someone I care for/ }),
  ).toBeVisible();
  await page.getByLabel(/Start with a routine/).selectOption("Walking");
  await page.getByRole("button", { name: /For myself/ }).click();
  await page.getByLabel("What should we call you?").fill("Alex Sample");
  await page.getByLabel(/using a fictional name/).check();
  await page
    .getByRole("button", { name: "Create my space", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("What would you like to do?")).toHaveValue(
    /walk/i,
  );
  expect((await state(page)).reminders).toHaveLength(0);
  await form.getByRole("button", { name: "Review changes" }).click();
  await confirm(page);
  await page.reload();
  const saved = await state(page);
  expect(
    saved.profiles.find(
      (p: { relationship: string }) => p.relationship === "Self",
    ).canManage,
  ).toBe(true);
  expect(
    saved.reminders.some(
      (r: { title: string; profileId: string }) =>
        /walk/i.test(r.title) && r.profileId === saved.selectedProfileId,
    ),
  ).toBe(true);
});

test("sleep preserves exact sample figures and offers one wind-down action", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/health");
  await page.getByRole("button", { name: "Review Sleep" }).click();
  const sleep = page.locator(".sleep-details");
  await expect(sleep.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(sleep.locator(".sleep-score")).toHaveText("63%");
  await expect(sleep.locator(".sleep-summary-stats")).toContainText("6h 40m");
  for (const [name, percentage] of [
    ["Light sleep", "55%"],
    ["Deep sleep", "20%"],
    ["REM sleep", "25%"],
  ]) {
    const row = sleep.locator("details").filter({ hasText: name });
    await expect(row.locator("summary")).toContainText(percentage);
    await expect(row).not.toHaveAttribute("open", "");
    await row.locator("summary").click();
    await expect(row.locator("p")).toBeVisible();
  }
  await expect(sleep.locator(".sleep-recommendation")).toHaveCount(1);
  await sleep
    .getByRole("button", { name: "Create wind-down reminder" })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("What would you like to do?"),
  ).toHaveValue(/wind.down/i);
  await expect(
    page.getByRole("dialog").getByLabel("Time", { exact: true }),
  ).toHaveValue("22:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Review changes" })
    .click();
  await expect(page.getByRole("dialog").last()).toContainText("Alex Sample");
  await confirm(page);
  await page.reload();
  await expect(page.locator(".sleep-details")).toBeVisible();
  const saved = await state(page);
  const reminder = saved.reminders.find(
    (r: { title: string; occurrenceDate: string }) =>
      /wind.down/i.test(r.title) && r.occurrenceDate === "2030-10-08",
  );
  expect(reminder).toMatchObject({
    category: "Bedtime",
    profileId: "p-me",
    recurrence: "Daily",
    scheduledAt: "2030-10-08T22:00:00+08:00",
  });
  expect(
    saved.reminders.filter((r: { id: string }) => r.id === reminder.id),
  ).toHaveLength(1);
});

test("weather retains loading, error and retry around a collapsed strip", async ({
  page,
}) => {
  await prepare(page);
  let requests = 0;
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/weather", async (route) => {
    requests++;
    if (fail) {
      await gate;
      await route.fulfill({ status: 503, body: "unavailable" });
    } else await route.fulfill({ json: { weather } });
  });
  await page.goto("/today");
  const strip = page.getByRole("region", { name: "Singapore weather" });
  await expect(strip).toHaveAttribute("aria-busy", "true");
  release();
  await expect(strip.getByRole("alert")).toContainText("unavailable");
  fail = false;
  const beforeRetry = requests;
  await strip.getByRole("button", { name: "Retry weather" }).click();
  await expect(strip.locator("summary")).toContainText("29°C · Cloudy");
  await expect(strip.locator("details")).not.toHaveAttribute("open", "");
  await strip.locator("summary").click();
  await expect(strip).toContainText("Test weather provider");
  await expect(strip).toContainText("24 · Good");
  expect(requests).toBeGreaterThan(beforeRetry);
});

test("Health uses provider readings and exposes refresh without a fake connect action", async ({
  page,
}) => {
  await prepare(page);
  let requests = 0;
  await page.route("**/api/health/snapshot", async (route) => {
    requests++;
    expect(route.request().postDataJSON().profileId).toBe("p-me");
    await route.fulfill({
      json: {
        reading: {
          heartRate: 71,
          systolic: 117,
          diastolic: 76,
          breathingRate: 14,
          sleepHours: 7.2,
          sleepQuality: "Restful",
          steps: 2345,
          updatedAt: now,
        },
        weather: null,
        advice: [],
      },
    });
  });
  await page.goto("/health");
  await expect(page.locator(".stats-grid")).toContainText("117/76");
  await expect(
    page.getByRole("button", { name: /Connect a wearable/i }),
  ).toHaveCount(0);
  const beforeRefresh = requests;
  await page.getByRole("button", { name: "Refresh readings" }).click();
  await expect.poll(() => requests).toBeGreaterThan(beforeRefresh);
  const overview = page.locator(".health-overview");
  await expect(overview.locator(":scope > *").first()).toHaveClass(
    /sleep-review-card/,
  );
});

test("Today puts next action beside timeline on desktop and keeps review visible on mobile", async ({
  page,
}) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/today");
  await expect(page.locator(".today-heading")).toContainText("Alex Sample");
  const focus = await page.locator(".day-focus").boundingBox();
  const timeline = await page.locator(".day-timeline").first().boundingBox();
  expect(focus).not.toBeNull();
  expect(timeline).not.toBeNull();
  expect(timeline!.x).toBeGreaterThan(focus!.x + focus!.width - 2);
  const weatherBox = await page
    .getByRole("region", { name: "Singapore weather" })
    .boundingBox();
  expect(weatherBox!.y).toBeGreaterThan(focus!.y);
  await page.setViewportSize({ width: 390, height: 640 });
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await page.getByText("More options & instructions").click();
  await page
    .getByLabel("Instructions (optional)")
    .fill("A quiet walk after dinner.");
  await page.getByLabel("Instructions (optional)").scrollIntoViewIfNeeded();
  const review = await page
    .getByRole("button", { name: "Review changes" })
    .boundingBox();
  expect(review).not.toBeNull();
  expect(review!.y).toBeGreaterThanOrEqual(0);
  expect(review!.y + review!.height).toBeLessThanOrEqual(640);
});

test("Family removal is hidden in overflow and benefit terms retain provenance", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/family");
  await expect(
    page.getByRole("button", { name: "Add family member" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove family member" }),
  ).toBeHidden();
  await page.getByLabel("More options for Jo Sample").click();
  await expect(
    page.getByRole("button", { name: "Remove family member" }),
  ).toBeVisible();
  await navigate(page, "/benefits/ui-benefit");
  await expect(
    page.getByRole("heading", { name: "Allowance and limits" }),
  ).toBeVisible();
  await expect(page.locator(".recorded-benefit-summary")).toContainText("$300");
  await expect(
    page.getByText("Fictional UI test policy", { exact: true }),
  ).toBeHidden();
  await page
    .getByText("Conditions, source and policy date", { exact: true })
    .click();
  await expect(
    page.getByText("Fictional UI test policy", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Eligibility not verified", { exact: true }),
  ).toBeVisible();
});

test("Buddy prioritises starter prompts only for an empty conversation", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/buddy");
  await expect(page.locator(".prompts")).toBeVisible();
  await page.getByLabel("Message Buddy").fill("Help me plan a walk");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".prompts")).toHaveCount(0);
  await expect(page.locator(".buddy-intro")).toHaveClass(/buddy-intro-compact/);
  await expect(page.getByLabel("Message Buddy")).toBeVisible();
  expect(
    (await state(page)).chats.some(
      (m: { role: string; text: string }) =>
        m.role === "user" && m.text === "Help me plan a walk",
    ),
  ).toBe(true);
});

test("a late health refresh cannot overwrite the newly selected person's readings", async ({
  page,
}) => {
  await prepare(page);
  let delaySelf = false;
  let releaseSelf!: () => void;
  let selfRefreshStarted!: () => void;
  const delayed = new Promise<void>((resolve) => {
    releaseSelf = resolve;
  });
  const started = new Promise<void>((resolve) => {
    selfRefreshStarted = resolve;
  });
  await page.route("**/api/health/snapshot", async (route) => {
    const person = route.request().postDataJSON().profileId;
    if (person === "p-me" && delaySelf) {
      selfRefreshStarted();
      await delayed;
    }
    await route.fulfill({
      json: {
        reading: {
          heartRate: person === "p-me" ? 71 : 83,
          systolic: person === "p-me" ? 117 : 125,
          diastolic: person === "p-me" ? 76 : 82,
          breathingRate: 14,
          sleepHours: 7.2,
          sleepQuality: "Restful",
          steps: 2345,
          updatedAt: now,
        },
        weather: null,
        advice: [],
      },
    });
  });
  await page.goto("/health");
  await expect(page.locator(".stats-grid")).toContainText("117/76");
  delaySelf = true;
  await page.getByRole("button", { name: "Refresh readings" }).click();
  await started;
  await page.getByLabel("Care for", { exact: true }).selectOption("p-family");
  await expect(page.locator(".stats-grid")).toContainText("125/82");
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/health/snapshot") &&
      response.request().postDataJSON().profileId === "p-me",
  );
  releaseSelf();
  const response = await staleResponse;
  await response.finished();
  // Allow the resolved fetch and React render to settle before the isolation assertion.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".stats-grid")).toContainText("125/82");
  await expect(page.locator(".stats-grid")).not.toContainText("117/76");
  expect((await state(page)).selectedProfileId).toBe("p-family");
});

for (const width of [320, 390, 1440]) {
  test(`welcome, sleep and Health are accessible without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await prepare(page, fixture());
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/welcome");
    await expect(
      page.getByRole("button", { name: /For myself/ }),
    ).toBeVisible();
    const check = async (surface: string) => {
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.scrollWidth,
        `${surface} overflow at ${width}px`,
      ).toBeLessThanOrEqual(dimensions.width);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations,
        `${surface} accessibility at ${width}px`,
      ).toEqual([]);
    };
    await check("Welcome");
    await page
      .getByRole("button", { name: /Explore the sample sleep review/ })
      .click();
    await expect(page.locator(".sleep-details")).toBeVisible();
    await check("Sleep");
    await navigate(page, "/health");
    await expect(page.locator(".health-overview")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Singapore weather" }),
    ).toHaveAttribute("aria-busy", "false");
    await check("Health");
  });
}
