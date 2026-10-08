import { test, expect } from "@playwright/test";
import { prepare, fixture, navigate } from "./helpers";

test.use({ serviceWorkers: "block" });

test("Today refreshes yesterday's clock and shows future care with its date", async ({
  page,
}) => {
  const stale = fixture();
  stale.now = "2030-10-07T09:00:00+08:00";
  stale.clockMode = "live";
  const current = structuredClone(stale);
  current.now = "2030-10-08T10:30:00Z"; // 8 October, 6:30pm in Singapore.
  current.reminders.push({
    ...current.reminders[0],
    id: "tomorrow",
    title: "Tomorrow's stretch",
    scheduledAt: "2030-10-09T14:00:00+08:00",
    occurrenceDate: "2030-10-09",
  });
  current.reminders.push({
    ...current.reminders[0],
    id: "utc-today",
    title: "Early local routine",
    scheduledAt: "2030-10-07T17:00:00Z",
    occurrenceDate: "2030-10-07",
  });
  current.reminders.push({
    ...current.reminders[0],
    id: "yesterday",
    title: "Yesterday's routine",
    scheduledAt: "2030-10-07T10:00:00Z",
    occurrenceDate: "2030-10-07",
  });
  await prepare(page, stale);
  let reads = 0;
  await page.route("**/api/state/**", (route) =>
    route.fulfill({
      json: {
        state: ++reads === 1 ? stale : current,
        revision: reads === 1 ? 1 : 2,
      },
    }),
  );
  await page.goto("/today");
  await expect(page.locator(".today-heading .eyebrow")).toHaveText(/8 October/);
  await expect(page.locator(".next-card h2")).toHaveText("Tomorrow's stretch");
  await expect(page.locator(".next-card .next-time")).toContainText("9 Oct");
  await expect(
    page.locator(".timeline-group").filter({
      has: page.getByRole("heading", { name: "Earlier", exact: true }),
    }),
  ).toContainText("Afternoon walk");
  await expect(
    page.locator(".timeline-group").filter({
      has: page.getByRole("heading", { name: "Earlier", exact: true }),
    }),
  ).toContainText("Early local routine");
  await expect(page.locator(".today-view")).not.toContainText(
    "Yesterday's routine",
  );
  await expect(page.locator(".today-heading")).not.toContainText(
    "Reference clock",
  );
  expect(reads).toBe(2);
});

test("focus and timer refreshes pause while a reminder form or confirmation is open", async ({
  page,
}) => {
  const s = fixture();
  await prepare(page, s);
  let reads = 0;
  await page.route("**/api/state/**", (route) => {
    reads++;
    return route.fulfill({ json: { state: s, revision: 1 } });
  });
  await page.goto("/today");
  await expect(page.locator(".next-card h2")).toHaveText("Afternoon walk");
  await expect.poll(() => reads).toBe(2);
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await page.getByLabel("What would you like to do?").fill("Unsaved stretch");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(60_000);
  expect(reads).toBe(2);
  await expect(page.getByLabel("What would you like to do?")).toHaveValue(
    "Unsaved stretch",
  );
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(60_000);
  expect(reads).toBe(2);
});

test("a delayed Today refresh cannot replace an unsaved form", async ({
  page,
}) => {
  const s = fixture();
  await prepare(page, s);
  let reads = 0;
  let release!: () => void;
  await page.route("**/api/state/**", async (route) => {
    if (++reads > 2)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return route.fulfill({
      json: {
        state: { ...s, now: reads > 2 ? "2030-10-09T09:00:00+08:00" : s.now },
        revision: reads > 2 ? 2 : 1,
      },
    });
  });
  await page.goto("/today");
  await expect.poll(() => reads).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBe(3);
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await page.getByLabel("What would you like to do?").fill("Keep this draft");
  release();
  await expect(page.getByLabel("What would you like to do?")).toHaveValue(
    "Keep this draft",
  );
  await expect(page.locator(".today-heading .eyebrow")).toHaveText(/8 October/);
  await expect(page.locator(".today-heading")).toContainText("Reference clock");
});

test("entering Today and becoming visible reads the owned current snapshot", async ({
  page,
}) => {
  const s = fixture();
  await prepare(page, s);
  let reads = 0;
  await page.route("**/api/state/**", (route) => {
    reads++;
    return route.fulfill({
      json: {
        state: { ...s, now: reads > 1 ? "2030-10-09T09:00:00+08:00" : s.now },
        revision: 1,
      },
    });
  });
  await page.goto("/settings");
  await expect(page.getByText("Advanced / Demo tools")).toBeVisible();
  expect(reads).toBe(1);
  await navigate(page, "/today");
  await expect(page.locator(".today-heading .eyebrow")).toHaveText(/9 October/);
  expect(reads).toBe(2);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect.poll(() => reads).toBe(3);
  await page.clock.runFor(60_000);
  await expect.poll(() => reads).toBe(4);
});

test("a delayed Today refresh preserves a newer selected profile", async ({
  page,
}) => {
  const s = fixture();
  await prepare(page, s);
  let reads = 0;
  let release!: () => void;
  await page.route("**/api/state/**", async (route) => {
    if (++reads > 2)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return route.fulfill({ json: { state: s, revision: 1 } });
  });
  await page.goto("/today");
  await expect.poll(() => reads).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBe(3);
  await page.getByLabel("Care for").selectOption("p-family");
  await expect(page.getByLabel("Care for")).toHaveValue("p-family");
  release();
  await expect(
    page.getByRole("heading", { name: "Good morning, Jo Sample" }),
  ).toBeVisible();
  await expect(page.getByLabel("Care for")).toHaveValue("p-family");
});
