import { test, expect } from "@playwright/test";
import { prepare, fixture, state, navigate, confirm } from "./helpers";

test.use({ serviceWorkers: "block" });

test("reminder creation, editing and deletion require confirmation and persist", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await page.getByLabel("What would you like to do?").fill("Evening stretch");
  await page.getByLabel("Time", { exact: true }).fill("19:00");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  expect(
    (await state(page)).reminders.some(
      (r: { title: string }) => r.title === "Evening stretch",
    ),
  ).toBe(false);
  await confirm(page);
  const created = (await state(page)).reminders.find(
    (r: { title: string }) => r.title === "Evening stretch",
  );
  expect(created.profileId).toBe("p-me");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Good morning, Alex Sample",
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, `/today?reminder=${created.id}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("What would you like to do?")
    .fill("Gentle evening stretch");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  expect(
    (await state(page)).reminders.find(
      (r: { id: string }) => r.id === created.id,
    ).title,
  ).toBe("Evening stretch");
  await confirm(page);
  expect(
    (await state(page)).reminders.find(
      (r: { id: string }) => r.id === created.id,
    ).title,
  ).toBe("Gentle evening stretch");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete reminder", exact: true })
    .click();
  expect(
    (await state(page)).reminders.find(
      (r: { id: string }) => r.id === created.id,
    ).deletedAt,
  ).toBe(null);
  await confirm(page);
  expect(
    (await state(page)).reminders.find(
      (r: { id: string }) => r.id === created.id,
    ).deletedAt,
  ).not.toBe(null);
});

test("view-only family profile cannot edit another person's reminder", async ({
  page,
}) => {
  const s = fixture();
  s.reminders.push({
    ...s.reminders[0],
    id: "family-walk",
    profileId: "p-family",
    title: "Family garden walk",
  });
  await prepare(page, s);
  await page.goto("/today");
  await page.getByLabel("Care for").selectOption("p-family");
  await navigate(page, "/today?reminder=family-walk");
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByRole("button", { name: "Edit", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.getByRole("button", { name: "Mark complete", exact: true }),
  ).toBeDisabled();
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await navigate(page, "/today?reminder=ui-walk");
  await expect(page.getByRole("dialog")).toContainText(
    "This item is no longer available",
  );
  expect(
    (await state(page)).reminders.find(
      (r: { id: string }) => r.id === "ui-walk",
    ).outcome,
  ).toBe(null);
});

test("Advanced tools preserve clock, car navigation and WorkBuddy export", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Advance 15 minutes", exact: true }),
  ).toBeHidden();
  await page.getByText("Advanced / Demo tools", { exact: true }).click();
  const before = Date.parse((await state(page)).now);
  await page
    .getByRole("button", { name: "Advance 15 minutes", exact: true })
    .click();
  await expect
    .poll(async () => Date.parse((await state(page)).now) - before)
    .toBe(15 * 60_000);
  await page.getByText("WorkBuddy handoff", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export skill context", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("care-buddy-context.json");
  await expect(page.getByLabel("Import reminder proposal")).toBeVisible();
  await page
    .getByRole("button", { name: "Simulated car connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect car mode", exact: true }),
  ).toBeVisible();
});
