import { test, expect } from "@playwright/test";
test("PWA metadata, local icons and offline deep-route reopening", async ({
  page,
  context,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const m = await manifest.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("./");
  expect(m.icons.map((i: any) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const i of m.icons) {
    expect((await request.get("/" + i.src.replace(/^\.\//, ""))).ok()).toBe(
      true,
    );
  }
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cachesBefore = await page.evaluate(() => caches.keys());
  expect(cachesBefore.some((x) => x.startsWith("care-buddy-"))).toBe(true);
  await context.setOffline(true);
  await page.goto("/benefits");
  await expect(
    page.getByRole("heading", { name: "Benefits", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/offline-benefits.png",
    fullPage: true,
  });
  await context.setOffline(false);
});
test("worker replacement activates only on refresh and removes old cache", async ({
  browser,
}) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  let replacement = false;
  const original = await readFile("dist/sw.js", "utf8");
  const oldCache = original.match(/const CACHE="([^"]+)"/)![1];
  const nextCache = oldCache + "-replacement";
  const server = createServer(async (req, res) => {
    try {
      const path = (req.url || "/").split("?")[0];
      const target =
        path === "/sw.js"
          ? "dist/sw.js"
          : path.startsWith("/assets/") ||
              path.startsWith("/icons/") ||
              path === "/manifest.webmanifest"
            ? "dist" + path
            : "dist/index.html";
      let body = await readFile(resolve(target));
      if (path === "/sw.js") {
        res.setHeader("content-type", "application/javascript");
        res.setHeader("cache-control", "no-store");
        if (replacement)
          body = Buffer.from(original.replace(oldCache, nextCache));
      } else
        res.setHeader(
          "content-type",
          target.endsWith(".js")
            ? "application/javascript"
            : target.endsWith(".css")
              ? "text/css"
              : target.endsWith(".png")
                ? "image/png"
                : target.endsWith(".webmanifest")
                  ? "application/manifest+json"
                  : "text/html",
        );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(4180, "127.0.0.1", r));
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4180/welcome");
    await page
      .getByRole("button", { name: "Get started", exact: true })
      .click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    expect(await page.evaluate(() => caches.keys())).toContain(oldCache);
    replacement = true;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      await r.update();
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          navigator.serviceWorker.getRegistration().then((r) => !!r?.waiting),
        ),
      )
      .toBe(true);
    expect(await page.evaluate(() => caches.keys())).toContain(oldCache);
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      r.waiting!.postMessage({ type: "SKIP_WAITING" });
    });
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toContain(nextCache);
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain(oldCache);
  } finally {
    await context.close();
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});
