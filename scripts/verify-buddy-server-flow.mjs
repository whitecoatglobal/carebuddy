// Isolated regression verification: creates its own temporary DB, never a live DB.
import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { emptyState, execute, isoAt } from "care-buddy-shared";
const directory = mkdtempSync(path.join(tmpdir(), "carebuddy-mcp-browser-"));
process.env.DB_DIR = directory;
process.env.STATIC_DIR = path.resolve("dist");
process.env.TOKENHUB_API_KEY = "isolated-test";
process.env.TOKENHUB_BASE_URL = "https://tokenhub.example/v1";
process.env.TOKENHUB_MODEL = "test";
const { createApp } = await import("../backend/dist/app.js");
const { db, upsertState, registerClientId } =
  await import("../backend/dist/db.js");
const clientId = "client-isolated-browser";
const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
let seed = emptyState();
seed.started = true;
seed.now = isoAt(date, "11:00");
seed.selectedProfileId = "p-leo";
seed.profiles = [
  {
    id: "p-me",
    displayName: "Me",
    relationship: "Self",
    canView: true,
    canManage: true,
  },
  {
    id: "p-leo",
    displayName: "Leo",
    relationship: "Child",
    canView: true,
    canManage: true,
  },
];
seed = execute(
  seed,
  {
    type: "createReminder",
    input: {
      profileId: "p-leo",
      category: "Personal care",
      title: "Bath-time reminder",
      scheduledAt: isoAt(date, "19:30"),
      recurrence: "Daily",
      instructions: "",
    },
  },
  "seed-bath",
  "p-leo",
);
const reminder = seed.reminders.find((r) => r.occurrenceDate === date);
registerClientId(clientId);
upsertState(clientId, JSON.stringify(seed));
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://tokenhub.example/")) {
    const body = JSON.parse(options.body);
    assert.ok(body.tools.some((t) => t.function.name === "editReminder"));
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "editReminder",
                    arguments: JSON.stringify({
                      id: reminder.id,
                      scope: "future",
                      input: {
                        profileId: "p-leo",
                        category: "Personal care",
                        title: "Bath-time reminder",
                        scheduledAt: isoAt(date, "21:00"),
                        recurrence: "Daily",
                        instructions: "",
                        appointmentId: null,
                      },
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  }
  return realFetch(url, options);
};
const server = createApp().listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
let browser;
const row = () =>
  JSON.parse(
    db
      .prepare("SELECT state_json FROM state_snapshots WHERE client_id=?")
      .get(clientId).state_json,
  );
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(12000);
  await context.addInitScript(
    (id) => localStorage.setItem("care-buddy.client-id", id),
    clientId,
  );
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/today`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator(".next-card .next-time")
    .filter({ hasText: "7:30 pm" })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Buddy", exact: true })
    .click();
  await page
    .getByPlaceholder("What’s on your mind?")
    .fill("Move Leo’s bath-time reminder to 9 pm every evening.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await confirm.waitFor();
  assert.equal(
    row().reminders.find((r) => r.id === reminder.id).scheduledAt,
    isoAt(date, "19:30"),
  );
  await page.getByText("Awaiting confirmation", { exact: true }).waitFor();
  await page.route("**/api/proposals/*/confirm", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Could not save. Please try again." }),
    }),
  );
  await confirm.click();
  await page.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
  assert.equal(
    row().reminders.find((r) => r.id === reminder.id).scheduledAt,
    isoAt(date, "19:30"),
  );
  assert.equal(
    await page
      .locator(".chat-bubble.assistant")
      .filter({ hasText: "Saved. Update reminder." })
      .count(),
    0,
  );
  await page.unroute("**/api/proposals/*/confirm");
  await confirm.click();
  await page
    .locator(".chat-bubble.assistant")
    .filter({ hasText: "Saved. Update reminder." })
    .waitFor();
  assert.equal(
    row().reminders.find((r) => r.id === reminder.id).scheduledAt,
    isoAt(date, "21:00"),
  );
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Today", exact: true })
    .click();
  await page
    .locator(".next-card .next-time")
    .filter({ hasText: "9:00 pm" })
    .waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(".next-card .next-time")
    .filter({ hasText: "9:00 pm" })
    .waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  const applied = row().appliedActions.length;
  const proposal = db
    .prepare("SELECT id FROM browser_pending_proposals WHERE client_id=?")
    .get(clientId);
  const again = await realFetch(
    `http://127.0.0.1:${server.address().port}/api/proposals/${proposal.id}/confirm`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CareBuddy-Client-Id": clientId,
      },
      body: JSON.stringify({ profileId: "p-leo" }),
    },
  );
  assert.equal(again.status, 200);
  assert.equal(row().appliedActions.length, applied);
  console.log(
    "BROWSER PASS: MCP proposal does not write; failed save has no success; Confirm saves; Today immediately shows 9pm; reload persists; duplicate confirmation is harmless; no login",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  globalThis.fetch = realFetch;
  rmSync(directory, { recursive: true, force: true });
}
