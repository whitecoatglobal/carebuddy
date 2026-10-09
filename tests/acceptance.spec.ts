import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const store = async (p: Page) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("care-buddy-demo-v1")!));
const btn = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
const confirm = async (p: Page) => {
  await p
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
};
const select = async (p: Page, id: string) =>
  p.getByLabel("Care for").selectOption(id);
const goto = async (p: Page, path: string) => {
  await p.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
};
const create = async (p: Page, title = "Evening walk") => {
  await btn(p, "Add reminder").first().click();
  await p
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Personal care");
  await p.getByLabel("Title", { exact: true }).fill(title);
  await p.getByLabel("Time", { exact: true }).fill("18:00");
  await btn(p, "Review changes").click();
  await confirm(p);
};
const chat = async (p: Page, text: string) => {
  await p.getByLabel("Message Buddy").fill(text);
  await btn(p, "Send").click();
};
test.beforeEach(async ({ page }) => {
  await page.goto("/welcome");
  await btn(page, "Get started").click();
});
test("AC01 start and reset restore fixed fixtures", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
  expect((await store(page)).now).toBe("2026-09-30T09:00:00+08:00");
  await expect(page.getByText("Demo data", { exact: true })).toHaveCount(0);
  await create(page);
  await goto(page, "/settings");
  await btn(page, "Reset local records").click();
  await confirm(page);
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Evening walk",
    ),
  ).toHaveLength(0);
  expect((await store(page)).carMode).toBe("disconnected");
});
test("AC02 reported completion and undo preserve tomorrow", async ({
  page,
}) => {
  await btn(page, "Mark as taken").click();
  await confirm(page);
  await expect(
    page
      .locator(".next-card")
      .getByRole("heading", { name: "Pack health-check documents" }),
  ).toBeVisible();
  const s = await store(page);
  expect(s.reminders.find((r: any) => r.id === "r-med-me").outcome).toBe(
    "taken",
  );
  expect(
    s.reminders.filter((r: any) => r.seriesId === "r-med-me"),
  ).toHaveLength(2);
  await page.getByText("Completed (1)", { exact: true }).click();
  await page.getByRole("button", { name: /Morning medication/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await confirm(page);
  expect(
    (await store(page)).reminders.find((r: any) => r.id === "r-med-me").outcome,
  ).toBe(null);
});
test("AC03 snooze persists without schedule change and rejects past", async ({
  page,
}) => {
  await btn(page, "Remind me later").first().click();
  await btn(page, "15 minutes").click();
  await confirm(page);
  await page.reload();
  const r = (await store(page)).reminders.find((r: any) => r.id === "r-med-me");
  expect(r.notificationSnoozedUntil).toBe("2026-09-30T09:15:00+08:00");
  expect(r.scheduledAt).toBe("2026-09-30T08:00:00+08:00");
  await btn(page, "Remind me later").first().click();
  await page.getByLabel("Choose time").fill("09:00");
  await btn(page, "Review chosen time").click();
  await confirm(page);
  await expect(page.getByRole("alert")).toContainText(
    "after the current reference time",
  );
});
test("AC04 reminder CRUD, validation and dirty discard", async ({ page }) => {
  await btn(page, "Add reminder").first().click();
  await page.getByLabel("Title", { exact: true }).fill(" ");
  await btn(page, "Review changes").click();
  await expect(page.getByRole("alert")).toContainText("3 to 80");
  await btn(page, "Cancel").click();
  await btn(page, "Discard changes").click();
  await create(page);
  const r = (await store(page)).reminders.find(
    (r: any) => r.title === "Evening walk",
  );
  await page.getByRole("button", { name: /Evening walk/ }).click();
  await btn(page, "Edit").click();
  await page.getByLabel("Title", { exact: true }).fill("Edited evening walk");
  await btn(page, "Review changes").click();
  await confirm(page);
  expect(
    (await store(page)).reminders.find((x: any) => x.id === r.id).title,
  ).toBe("Edited evening walk");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /Edited evening walk/ }).click();
  await btn(page, "Delete reminder").click();
  await confirm(page);
  await btn(page, "Undo deletion").click();
  expect(
    (await store(page)).reminders.find((x: any) => x.id === r.id).deletedAt,
  ).toBe(null);
});
test("AC05 profile isolation and pending cancellation", async ({ page }) => {
  await goto(page, "/buddy");
  await btn(page, "Prepare for my appointment").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await select(page, "p-maya");
  await expect(page.getByText("For: Maya", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saved. View your updated day.", { exact: true }),
  ).toHaveCount(0);
  await select(page, "p-leo");
  await goto(page, "/today");
  await expect(page.getByRole("heading", { name: "Leo's day" })).toBeVisible();
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Routine health check preparation",
    ),
  ).toHaveLength(0);
});
test("AC06 view access, dependent add/remove", async ({ page }) => {
  await goto(page, "/family");
  await page.getByRole("button", { name: /Leo Child/ }).click();
  await btn(page, "Why can't I edit?").click();
  await expect(page.getByRole("dialog")).toContainText("view-only");
  await btn(page, "Close").click();
  await goto(page, "/family");
  await btn(page, "Add dependent").click();
  await page.getByLabel("Display name").fill("Fictional Jo");
  await page.getByLabel("This is fictional data").check();
  await btn(page, "Review changes").click();
  await confirm(page);
  const p = (await store(page)).profiles.find(
    (p: any) => p.displayName === "Fictional Jo",
  );
  expect(p.canManage).toBe(false);
  await page.getByRole("button", { name: /Fictional Jo/ }).click();
  await btn(page, "Remove family member").click();
  await confirm(page);
  expect((await store(page)).selectedProfileId).toBe("p-me");
});
test("AC07 Maya checklist persistence and preparation reminder", async ({
  page,
}) => {
  await select(page, "p-maya");
  await goto(page, "/appointments/a-screen-maya");
  await page.getByLabel("Confirm transport plans").check();
  await page.reload();
  await expect(page.getByLabel("Confirm transport plans")).toBeChecked();
  await btn(page, "Create preparation reminder").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Review screening preparation",
  );
  const s = await store(page);
  expect(
    s.reminders.find((r: any) => r.id === "r-screen-maya").appointmentId,
  ).toBe("a-screen-maya");
  expect(
    s.appointments.find((a: any) => a.id === "a-screen-maya").providerConfirmed,
  ).toBe(false);
});
test("AC08 conditional/unknown benefits and unverified notes", async ({
  page,
}) => {
  await goto(page, "/benefits/b-check-me");
  await expect(
    page.getByText("Conditions apply", { exact: true }),
  ).toBeVisible();
  await select(page, "p-maya");
  await goto(page, "/benefits/b-screen-maya");
  await expect(
    page.getByText("Conditions apply", { exact: true }),
  ).toBeVisible();
  await select(page, "p-leo");
  await goto(page, "/benefits/b-dental-leo");
  await expect(
    page.getByText("Needs confirmation", { exact: true }),
  ).toBeVisible();
  await select(page, "p-me");
  await goto(page, "/benefits");
  await btn(page, "Add benefit note").click();
  await page
    .getByRole("textbox", { name: "Category", exact: true })
    .fill("Unverified category");
  await page.getByLabel("Notes", { exact: true }).fill("Fictional note");
  await btn(page, "Review changes").click();
  await confirm(page);
  expect((await store(page)).benefits.at(-1).status).toBe("Needs confirmation");
});
test("AC09 scripted chat, ambiguity, cancel and limitations", async ({
  page,
}) => {
  await goto(page, "/buddy");
  await chat(page, "bedtime at 8");
  await expect(page.getByText(/Do you mean 8:00 AM/)).toBeVisible();
  await chat(page, "how much medicine should I take");
  await expect(page.getByText(/I cannot advise on doses/)).toBeVisible();
  await chat(page, "Tell me a joke");
  await expect(page.getByText(/I can help with reminders/)).toBeVisible();
  await btn(page, "Prepare for my appointment").click();
  await btn(page, "Cancel").last().click();
  await expect(
    page.getByText("No changes made", { exact: true }).first(),
  ).toBeVisible();
  await btn(page, "Prepare for my appointment").click();
  await confirm(page);
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Routine health check preparation",
    ),
  ).toHaveLength(1);
});
test("AC10 GP preview explicitly unsent", async ({ page }) => {
  await goto(page, "/care/gp");
  await btn(page, "Preview appointment request").click();
  await btn(page, "Preview request").click();
  await expect(page.getByRole("dialog")).toContainText(
    "This request has not been sent",
  );
});
test("AC11 urgent simulation viewed only", async ({ page }) => {
  await goto(page, "/settings");
  await btn(page, "Urgent-help demo").click();
  await expect(
    page.getByRole("heading", { name: "Urgent help" }),
  ).toBeVisible();
  await expect(
    page.getByText("No emergency service has been contacted.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/urgent.png", fullPage: true });
  await btn(page, "View emergency-help instructions").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Contact the appropriate local emergency service directly",
  );
  await btn(page, "Close").click();
  await btn(page, "Return to Today").click();
  expect((await store(page)).activity.at(-1).text).toBe("Demo alert viewed");
});
test("AC12 car restriction, navigation guard and conservative reload", async ({
  page,
}) => {
  await goto(page, "/car");
  await btn(page, "Connect car mode").click();
  await btn(page, "Enter driving preview").click();
  await expect(
    page.getByRole("heading", { name: "Driving preview" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText("Morning medication")).toHaveCount(0);
  await page.screenshot({ path: "test-results/screenshots/driving.png", fullPage: true });
  await page.evaluate(() => {
    history.pushState({}, "", "/buddy");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Driving preview" }),
  ).toBeVisible();
  await btn(page, "Return to parked preview").click();
  await btn(page, "Enter driving preview").click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Connected · Parked" }),
  ).toBeVisible();
  await btn(page, "Disconnect").click();
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
});
test("AC13 save failure, retry, corrupt schema and missing targets", async ({
  page,
}) => {
  await goto(page, "/settings");
  await btn(page, "Save error").click();
  await goto(page, "/today");
  await btn(page, "Add reminder").first().click();
  await page.getByLabel("Title", { exact: true }).fill("Retry routine");
  await btn(page, "Review changes").click();
  await confirm(page);
  await expect(page.getByRole("alert")).toContainText(
    "Could not save on this device",
  );
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Retry routine",
    ),
  ).toHaveLength(0);
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Retry routine",
    ),
  ).toHaveLength(1);
  await page.evaluate(() =>
    localStorage.setItem("care-buddy-demo-v1", '{"version":99}'),
  );
  await page.reload();
  await expect(
    page.getByText(
      "Local records were reset because they could not be loaded.",
    ),
  ).toBeVisible();
  await btn(page, "Get started").click();
  await goto(page, "/appointments/not-an-id");
  await expect(
    page.getByRole("heading", {
      name: "This appointment is no longer available",
    }),
  ).toBeVisible();
});
test("AC14 widths, zoom, keyboard focus, contrast and reduced motion", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/today-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/text-200-percent.png",
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  // 200% browser-zoom reflow equivalent: 780 device pixels expose 390 CSS pixels.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 422,
    deviceScaleFactor: 2,
    mobile: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/zoom-200-percent.png",
    fullPage: true,
  });
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await btn(page, "Add reminder").first().click();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("[role=dialog]"),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement?.textContent),
  ).toContain("Add reminder");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});
test("AC15 no outbound calls, injection or real permission/PII fields", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173")) remote.push(r.url());
  });
  await create(page, "<img src=x onerror=alert(1)>");
  await expect(page.getByRole("button", { name: /<img src=x/ })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await goto(page, "/buddy");
  await chat(page, "hello");
  expect(remote).toEqual([]);
  expect(
    await page
      .locator('a[href^="tel:"],input[type="email"],input[type="tel"]')
      .count(),
  ).toBe(0);
});
test("AC16 state persistence, duplicate submit and invalid IDs", async ({
  page,
}) => {
  await btn(page, "Add reminder").first().click();
  await page.getByLabel("Title", { exact: true }).fill("Persisted routine");
  await btn(page, "Review changes").click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Confirm", exact: true })
    .evaluate((el: HTMLButtonElement) => {
      el.click();
      el.click();
    });
  await goto(page, "/buddy");
  await chat(page, "Explain my GP benefits");
  await page.reload();
  await expect(page.getByText(/Source: Care plan/)).toBeVisible();
  expect(
    (await store(page)).reminders.filter(
      (r: any) => r.title === "Persisted routine",
    ),
  ).toHaveLength(1);
  await goto(page, "/today?reminder=invalid");
  await expect(page.getByRole("dialog")).toContainText(
    "This item is no longer available",
  );
});
test("AC17 welcome reopen preserves saved changes", async ({ page }) => {
  await create(page, "Keep this routine");
  await goto(page, "/settings");
  await btn(page, "Reopen welcome").click();
  await expect(
    page.getByRole("heading", { name: "Care Buddy", exact: true }),
  ).toBeVisible();
  await btn(page, "Get started").click();
  expect(
    (await store(page)).reminders.some(
      (r: any) => r.title === "Keep this routine",
    ),
  ).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
});
test("AC18 tonight-only bedtime override before/after and reload", async ({
  page,
}) => {
  await goto(page, "/buddy");
  await chat(page, "Move my bedtime reminder to 10:30 tonight");
  await btn(page, "Tonight only").click();
  await expect(page.getByRole("dialog")).toContainText("Before: 10:00 pm");
  await expect(page.getByRole("dialog")).toContainText("After: 10:30 pm");
  await expect(page.getByRole("dialog")).toContainText("Other days: Unchanged");
  await confirm(page);
  await page.reload();
  const s = await store(page);
  expect(
    s.reminders.find((r: any) => r.id === "r-bed-me").scheduledAt,
  ).toContain("22:30");
  expect(
    s.reminders.find((r: any) => r.id === "r-bed-me:2026-10-01").scheduledAt,
  ).toContain("22:00");
  await page.screenshot({ path: "test-results/screenshots/buddy-receipt.png", fullPage: true });
});
test("AC19 caregiver attribution, skipped undo and receipt fields", async ({
  page,
}) => {
  await select(page, "p-maya");
  await goto(page, "/today?reminder=r-screen-maya");
  await btn(page, "Record as skipped").click();
  await confirm(page);
  await goto(page, "/today?reminder=r-screen-maya");
  await expect(page.getByRole("dialog")).toContainText("for Maya by");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await confirm(page);
  await btn(page, "Close").click();
  await goto(page, "/buddy");
  await goto(page, "/today?reminder=r-screen-maya");
  await btn(page, "Delete reminder").click();
  await confirm(page);
  await btn(page, "Close").click();
  await goto(page, "/buddy");
  await btn(page, "Prepare for my appointment").click();
  await confirm(page);
  await page
    .getByText("Action details · Saved", { exact: true })
    .first()
    .click();
  await expect(
    page.getByText("a-screen-maya", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".receipt[open]").getByText("Me", { exact: true }),
  ).toBeVisible();
  expect((await store(page)).chats.at(-1).actionReceipt.confirmation).toBe(
    true,
  );
});
test("AC20 appointment origin and benefit distinctions", async ({ page }) => {
  await select(page, "p-maya");
  await goto(page, "/appointments/a-screen-maya");
  await btn(page, "Update in Care Buddy").click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Local screening change");
  await page.getByLabel("Time", { exact: true }).fill("11:00");
  await btn(page, "Review changes").click();
  await expect(page.getByRole("dialog").last()).toContainText(
    "No provider has been contacted",
  );
  await confirm(page);
  const s = await store(page);
  expect(
    s.appointments.find((a: any) => a.id === "a-screen-maya").recordOrigin,
  ).toBe("user-saved");
  expect(
    s.appointments.find((a: any) => a.id === "a-screen-maya").providerConfirmed,
  ).toBe(false);
  expect(
    s.reminders.find((r: any) => r.id === "r-screen-maya").scheduledAt,
  ).toContain("19:00");
  await goto(page, "/benefits/b-screen-maya");
  await expect(
    page.getByText("Eligibility not verified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not available", { exact: true }).first(),
  ).toBeVisible();
});
test("AC13 empty day and removed notification target", async ({ page }) => {
  await goto(page, "/settings");
  await btn(page, "Empty day").click();
  await expect(
    page.getByRole("heading", { name: "Nothing else scheduled" }),
  ).toBeVisible();
  await btn(page, "Add reminder").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await btn(page, "Close").click();
  await goto(page, "/notifications");
  await page.getByRole("button", { name: /Reminder due/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "This item is no longer available",
  );
});
test("AC18 cancelled bedtime and failed proposal retry update once", async ({
  page,
}) => {
  await goto(page, "/buddy");
  await chat(page, "Move my bedtime reminder to 10:30 tonight");
  await btn(page, "Tonight only").click();
  await btn(page, "Cancel").last().click();
  expect(
    (await store(page)).reminders.find((r: any) => r.id === "r-bed-me")
      .scheduledAt,
  ).toContain("22:00");
  await chat(page, "Move my bedtime reminder to 10:30 tonight");
  await btn(page, "Tonight only").click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (k, v) {
      if (fail && k === "care-buddy-demo-v1") {
        fail = false;
        throw new Error("Could not save on this device");
      }
      return original.call(this, k, v);
    };
  });
  await confirm(page);
  await expect(page.getByRole("dialog").last()).toContainText("Save failed");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  expect(
    (await store(page)).reminders.filter((r: any) => r.seriesId === "r-bed-me"),
  ).toHaveLength(2);
  expect(
    (await store(page)).reminders.find((r: any) => r.id === "r-bed-me")
      .scheduledAt,
  ).toContain("22:30");
});
test("contextual benefit, appointment return and four friendly categories", async ({
  page,
}) => {
  await goto(page, "/benefits");
  for (const name of [
    "GP visits",
    "Health screening",
    "Dental",
    "Other services",
  ])
    await expect(
      page.getByRole("button", { name: new RegExp(name) }).first(),
    ).toBeVisible();
  await goto(page, "/appointments/a-check-me");
  await btn(page, "Check benefits").click();
  await expect(
    page.getByText("Conditions apply", { exact: true }),
  ).toBeVisible();
  await btn(page, "Ask Buddy about this result").click();
  await chat(page, "Explain my sample benefits");
  await expect(page.getByText(/Conditions apply.*Source:/)).toBeVisible();
});
test("restricted profile mutations and cross-person confirmed form", async ({
  page,
}) => {
  await select(page, "p-leo");
  await goto(page, "/today");
  await expect(btn(page, "Mark complete")).toBeDisabled();
  await select(page, "p-me");
  await btn(page, "Add reminder").first().click();
  await page
    .getByRole("combobox", { name: "Person", exact: true })
    .selectOption("p-maya");
  await page.getByLabel("Title", { exact: true }).fill("Maya chosen routine");
  await btn(page, "Review changes").click();
  await expect(page.getByRole("dialog").last()).toContainText("Maya");
  await confirm(page);
  const s = await store(page);
  expect(
    s.reminders.find((r: any) => r.title === "Maya chosen routine").profileId,
  ).toBe("p-maya");
});
test("route accessibility and keyboard primary actions", async ({ page }) => {
  for (const path of [
    "/family",
    "/benefits",
    "/buddy",
    "/appointments/a-check-me",
    "/care/gp",
    "/settings",
    "/car",
    "/notifications",
  ]) {
    await goto(page, path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations, `AA issues on ${path}`).toEqual([]);
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return (
          el !== document.body && getComputedStyle(el).outlineStyle !== "none"
        );
      }),
      `focus visible on ${path}`,
    ).toBe(true);
  }
});
test("AC12 honest unavailable browser audio and privacy preferences persistence", async ({
  page,
}) => {
  await goto(page, "/car");
  await page.getByLabel("Generic reminders", { exact: true }).uncheck();
  await page.getByLabel("Spoken reminders", { exact: true }).check();
  await btn(page, "Connect car mode").click();
  await expect(
    page.getByRole("heading", { name: "Reminder previews are off" }),
  ).toBeVisible();
  await page.evaluate(() => {
    delete (window as any).speechSynthesis;
  });
  await btn(page, "Play generic reminder").click();
  await expect(
    page.getByText("Audio preview is unavailable in this browser", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  expect((await store(page)).preferences).toEqual({
    genericReminders: false,
    spokenReminders: true,
  });
  await expect(
    page.getByRole("heading", { name: "Connected · Parked" }),
  ).toBeVisible();
});

test("WorkBuddy file handoff exports current context and confirms an actual package proposal", async ({
  page,
}) => {
  await goto(page, "/settings");
  await page.getByText("WorkBuddy handoff", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await btn(page, "Export skill context").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("care-buddy-context.json");
  const state = await store(page);
  const { execFileSync } = await import("node:child_process");
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["workbuddy-skills/care-reminder-change/scripts/propose.mjs"],
      {
        input: JSON.stringify({
          state,
          profileId: state.selectedProfileId,
          expectedClock: state.now,
          actionId: "browser-package-roundtrip",
          reminderId: "r-bed-me",
          scheduledAt: "2026-09-30T21:30:00+08:00",
          scope: "occurrence",
          userRequestedTime: true,
        }),
        encoding: "utf8",
      },
    ),
  );
  expect(result.executed).toBe(false);
  await page.getByLabel("Import reminder proposal").setInputFiles({
    name: "proposal.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(result)),
  });
  await expect(page.getByRole("dialog")).toContainText("Bedtime reminder");
  expect(
    (await store(page)).reminders.find((r: any) => r.id === "r-bed-me")
      .scheduledAt,
  ).toContain("22:00");
  await confirm(page);
  expect(
    (await store(page)).reminders.find((r: any) => r.id === "r-bed-me")
      .scheduledAt,
  ).toContain("21:30");
  expect((await store(page)).chats.at(-1).actionReceipt.outcome).toBe("Saved");
  await page.getByLabel("Import reminder proposal").setInputFiles({
    name: "proposal.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(result)),
  });
  await expect(page.getByRole("alert")).toContainText("already applied");
});
test("WorkBuddy import refuses forged scope, unsupported commands and stale source snapshots", async ({
  page,
}) => {
  await goto(page, "/settings");
  await page.getByText("WorkBuddy handoff", { exact: true }).click();
  const state = await store(page),
    source = state.reminders.find((r: any) => r.id === "r-bed-me");
  const v = {
    status: "proposal",
    executed: false,
    expectedClock: state.now,
    action: {
      id: "bad-proposal",
      profileId: "p-me",
      sourceIds: [source.id],
      expectedSources: [source],
      label: "Change bedtime",
      command: {
        type: "editReminder",
        id: source.id,
        scope: "all",
        input: {
          profileId: "p-me",
          category: source.category,
          title: source.title,
          scheduledAt: "2026-09-30T21:30:00+08:00",
          recurrence: "Daily",
          instructions: "",
        },
      },
    },
  };
  const upload = async (value: any) =>
    page.getByLabel("Import reminder proposal").setInputFiles({
      name: "proposal.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await upload(v);
  await expect(page.getByRole("alert")).toContainText("occurrence or future");
  await upload({ ...v, action: { ...v.action, command: { type: "reset" } } });
  await expect(page.getByRole("alert")).toContainText("reminder proposals");
  await upload({
    ...v,
    action: {
      ...v.action,
      command: { ...v.action.command, scope: "occurrence" },
      expectedSources: [{ ...source, title: "Changed source" }],
    },
  });
  await expect(page.getByRole("alert")).toContainText("source record changed");
  expect(
    (await store(page)).reminders.find((r: any) => r.id === source.id)
      .scheduledAt,
  ).toContain("22:00");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("clean product chrome and Buddy outcomes follow changed care records", async ({
  page,
}) => {
  await expect(page.locator("header")).not.toContainText(/demo|workbuddy/i);
  await expect(page.getByText("Rain this afternoon.")).toHaveCount(0);
  await goto(page, "/buddy");
  await chat(page, "Remind me to take a walk at 6 pm");
  await confirm(page);
  await chat(page, "Plan my day");
  await expect(page.getByText(/6:00 pm · take a walk/)).toBeVisible();
  await chat(page, "Explain my dental cover");
  await expect(page.getByText(/Source:.*Date not supplied/)).toBeVisible();
  await chat(page, "Mark take a walk complete");
  await expect(page.getByRole("dialog")).not.toContainText(
    "Action details · Saved",
  );
  await expect(page.getByRole("dialog")).toContainText("Nothing is saved");
  await confirm(page);
  expect(
    (await store(page)).reminders.find((r: any) => r.title === "take a walk")
      .outcome,
  ).toBe("complete");
  await page.screenshot({
    path: "test-results/screenshots/buddy-state-driven.png",
    fullPage: true,
  });
});
