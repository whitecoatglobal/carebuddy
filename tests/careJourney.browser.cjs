const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const testClientId =
  process.env.CARE_TEST_CLIENT_ID || "client-fictional-care-journey-test";
if (
  !/^client-[a-z0-9-]{1,150}$/.test(testClientId) ||
  testClientId === "client-local"
)
  throw Error("CARE_TEST_CLIENT_ID must be a valid, approvable browser ID");
const accessHeaders = { "X-CareBuddy-Client-Id": testClientId };
let browser, server, database;
async function prepareAccess(base) {
  const blocked = await fetch(base + "/api/care/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fictionalOnly: true }),
  });
  if (blocked.status !== 403)
    throw Error("Care extraction did not reject a missing browser ID");
  const initial = await fetch(base + "/api/access", { headers: accessHeaders });
  if (!initial.ok) throw Error("Could not register fictional test browser ID");
  const access = await initial.json();
  if (database) {
    if (access.isVisible !== false)
      throw Error("Fresh test browser was not blocked by default");
    const Database = require("better-sqlite3");
    const db = new Database(path.join(database, "care-buddy.db"));
    try {
      const result = db
        .prepare(
          "UPDATE state_snapshots SET is_visible = 1 WHERE client_id = ?",
        )
        .run(testClientId);
      if (result.changes !== 1)
        throw Error("Test browser approval did not affect one row");
    } finally {
      db.close();
    }
  }
  const approved = await fetch(base + "/api/access", {
    headers: accessHeaders,
  });
  if (!approved.ok || (await approved.json()).isVisible !== true)
    throw Error(
      "Test browser is not approved. For an external test backend, approve CARE_TEST_CLIENT_ID (default client-fictional-care-journey-test) first.",
    );
}
async function startBackend() {
  if (process.env.CARE_TEST_BASE_URL) return process.env.CARE_TEST_BASE_URL;
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  database = fs.mkdtempSync(path.join(os.tmpdir(), "care-journey-test-"));
  server = spawn(process.execPath, ["backend/dist/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_DIR: database,
      STATIC_DIR: path.resolve("dist"),
    },
    stdio: "ignore",
  });
  let spawnError;
  server.on("error", (error) => {
    spawnError = error;
  });
  const base = `http://127.0.0.1:${port}`;
  let readinessError;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null)
      throw Error("Test backend exited before readiness");
    try {
      const response = await fetch(base + "/today");
      if (response.ok) return base;
      readinessError = "HTTP " + response.status;
    } catch (error) {
      readinessError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Test backend readiness timed out: " + readinessError);
}
async function cleanup() {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill("SIGTERM");
    });
  }
  if (database) fs.rmSync(database, { recursive: true, force: true });
}
(async () => {
  const baseURL = await startBackend();
  await prepareAccess(baseURL);
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Singapore",
  });
  await page.addInitScript((clientId) => {
    localStorage.setItem("care-buddy.client-id", clientId);
  }, testClientId);
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const screenshotDir = "/tmp/carebuddy-journey-evidence";
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.route("**/api/weather", (r) =>
    r.fulfill({ json: { weather: null } }),
  );
  let n = 0,
    failPlan = false;
  await page.route("**/api/care/plan", async (r) => {
    const b = r.request().postDataJSON();
    if (failPlan) {
      failPlan = false;
      await r.fulfill({
        status: 503,
        json: { error: "Buddy AI is not configured for this test." },
      });
      return;
    }
    n++;
    const quote = b.document.pages[0].text;
    await r.fulfill({
      json: {
        plan: {
          id: "browser-plan-" + n,
          profileId: b.profileId,
          kind: b.kind,
          summary: "Review the recorded appointment and preparation task.",
          instructions: [
            { text: "Bring your notes.", page: 1, quote: "Bring your notes." },
          ],
          questions: ["Which documents should I bring?"],
          uncertainties: [],
          actions: [
            {
              id: "a",
              type: b.kind === "postVisit" ? "reminder" : "appointment",
              title:
                b.kind === "postVisit" ? "Follow-up notes" : "Demo appointment",
              scheduledAt: "2099-10-20T10:00:00+08:00",
              location: "Demo clinic",
              instructions: "Bring your notes.",
              recurrence: "None",
              evidence: [{ page: 1, quote }],
            },
          ],
        },
      },
    });
  });
  await page.route("**/api/care/brief", (r) => {
    const b = r.request().postDataJSON();
    r.fulfill({
      json: {
        brief: {
          id: "brief-1",
          profileId: b.profileId,
          appointmentId: b.appointment.id,
          createdAt: new Date().toISOString(),
          sections: [
            {
              heading: "Appointment",
              items: [
                {
                  text: b.appointment.title,
                  sourceIds: ["appointment:" + b.appointment.id],
                },
              ],
            },
            {
              heading: "Your concerns",
              items: [{ text: b.concerns[0], sourceIds: ["concern:0"] }],
            },
          ],
          questions: b.questions,
          sources: [
            {
              id: "appointment:" + b.appointment.id,
              text:
                "Appointment: " +
                b.appointment.title +
                "; " +
                b.appointment.startsAt,
            },
            { id: "concern:0", text: b.concerns[0] },
          ],
        },
      },
    });
  });
  await page.goto(baseURL + "/today");
  await page.getByRole("button", { name: "Open care journey" }).click();
  await page
    .getByLabel(/Photo or PDF/)
    .setInputFiles("tests/fixtures/care-appointment.png");
  await page.getByLabel("This contains fictional information only.").check();
  await page.getByRole("button", { name: "Read source", exact: true }).click();
  await page.getByRole("heading", { name: "Check the source text" }).waitFor();
  if (
    !(await page.getByLabel("Page 1", { exact: true }).inputValue()).includes(
      "Bring your letter",
    )
  )
    throw Error("Actual image OCR failed");
  const pdf = await page.request.post(baseURL + "/api/care/extract", {
    headers: accessHeaders,
    data: {
      fictionalOnly: true,
      name: "Fictional PDF",
      mimeType: "application/pdf",
      dataBase64: fs
        .readFileSync("tests/fixtures/care-appointment.pdf")
        .toString("base64"),
    },
  });
  if (
    !pdf.ok() ||
    !(await pdf.json()).document.pages[0].text.includes("Bring your letter")
  )
    throw Error("Actual PDF extraction failed");
  await page
    .getByRole("button", { name: "Appointment brief", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Letter to plan", exact: true })
    .click();
  await page
    .getByLabel("Or paste letter text")
    .fill(
      "Fictional appointment on 20 October 2099 at 10 am. Bring your notes.",
    );
  await page.getByLabel("This contains fictional information only.").check();
  await page.getByRole("button", { name: "Read source", exact: true }).click();
  await page.getByRole("heading", { name: "Check the source text" }).waitFor();
  failPlan = true;
  await page.getByRole("button", { name: "Prepare plan for review" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Buddy AI is not configured" })
    .waitFor();
  if (
    !(await page.getByLabel("Page 1", { exact: true }).inputValue()).includes(
      "Bring your notes",
    )
  )
    throw Error("Failure lost source");
  await page.getByRole("button", { name: "Prepare plan for review" }).click();
  await page
    .getByRole("heading", { name: "Review the proposed plan" })
    .waitFor();
  await page
    .getByLabel("Location", { exact: true })
    .fill("Demo clinic, room 2");
  await page
    .getByRole("button", { name: "Save draft changes", exact: true })
    .click();
  await page.reload();
  await page
    .getByText("Saved journeys and briefs (1)", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Letter to plan · Appointment notes",
      exact: true,
    })
    .click();
  if (
    (await page.getByLabel("Location", { exact: true }).inputValue()) !==
    "Demo clinic, room 2"
  )
    throw Error("Edited draft did not persist");
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("care-buddy-demo-v1")).appointments
        .length,
  );
  if (before !== 0) throw Error("Saved before confirmation");
  await page
    .getByLabel(
      "I checked the person, source, selected actions and dates. Save only these records.",
    )
    .check();
  await page
    .getByRole("button", {
      name: "Confirm and save 1 selected action",
      exact: true,
    })
    .click();
  await page.getByRole("heading", { name: "Saved care plan" }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: screenshotDir + "/plan-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByText("Saved journeys and briefs (1)", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Letter to plan · Appointment notes",
      exact: true,
    })
    .click();
  await page.getByRole("heading", { name: "Saved care plan" }).waitFor();
  await page
    .getByRole("button", { name: "Appointment brief", exact: true })
    .click();
  await page
    .getByLabel("Appointment", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Your concerns — one per line")
    .fill("I want to discuss my routine.");
  await page
    .getByLabel("Your questions — one per line")
    .fill("What should I prepare?");
  await page.getByLabel("I am using fictional information only.").check();
  await page
    .getByRole("button", { name: "Prepare appointment brief", exact: true })
    .click();
  await page.getByRole("heading", { name: "Visit brief for Me" }).waitFor();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download brief (.txt)" }).click();
  const download = await downloadEvent;
  await download.saveAs(screenshotDir + "/brief.txt");
  if (
    !fs
      .readFileSync(screenshotDir + "/brief.txt", "utf8")
      .includes("I want to discuss my routine.")
  )
    throw Error("Brief export incomplete");
  await page
    .getByRole("button", { name: "After your visit", exact: true })
    .click();
  await page
    .getByLabel("Or paste visit notes")
    .fill("Bring your notes. Follow up on 20 October 2099 at 10 am.");
  await page.getByLabel("This contains fictional information only.").check();
  await page.getByRole("button", { name: "Read source", exact: true }).click();
  await page.getByRole("heading", { name: "Check the source text" }).waitFor();
  await page.getByRole("button", { name: "Prepare plan for review" }).click();
  await page
    .getByRole("heading", { name: "Review the proposed plan" })
    .waitFor();
  await page
    .getByLabel(
      "I checked the person, source, selected actions and dates. Save only these records.",
    )
    .check();
  await page
    .getByRole("button", {
      name: "Confirm and save 1 selected action",
      exact: true,
    })
    .click();
  await page.getByRole("heading", { name: "Saved care plan" }).waitFor();
  await page
    .getByText("Saved journeys and briefs (3)", { exact: true })
    .click()
    .catch(() => {});
  const followup = page.getByLabel("Bring your notes.", { exact: true });
  if (!(await followup.isVisible()))
    await page
      .getByText("Saved journeys and briefs (3)", { exact: true })
      .click();
  await followup.check();
  await page.reload();
  await page
    .getByText("Saved journeys and briefs (3)", { exact: true })
    .click();
  if (
    !(await page.getByLabel("Bring your notes.", { exact: true }).isChecked())
  )
    throw Error("Checklist did not persist");
  await page
    .getByRole("button", {
      name: "After your visit · Post-visit notes",
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: screenshotDir + "/postvisit-desktop.png",
    fullPage: true,
  });
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("care-buddy-demo-v1")),
  );
  if (
    data.appointments.length !== 1 ||
    !data.reminders.some((r) => r.title === "Follow-up notes")
  )
    throw Error("Records missing");
  if (errors.length) throw Error(errors.join("; "));
  console.log(
    JSON.stringify({
      passed: [
        "real browser whitelist gate",
        "edited draft persistence",
        "real image OCR",
        "real PDF extraction",
        "provider failure preserves source",
        "postvisit checklist persistence",
        "real text extraction",
        "no save before confirmation",
        "batch save",
        "refresh persistence",
        "saved plan replay",
        "brief generation fixture",
        "brief download",
        "postvisit reminder",
      ],
      errors,
      evidence: screenshotDir,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
