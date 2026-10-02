import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));

await page.goto('http://124.156.206.120/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/cb_live_render.png', fullPage: true });

const buttons = await page.locator('button').allInnerTexts();
console.log('BUTTONS:', buttons);

if (buttons.some(t => t.trim() === 'Get started')) {
  await page.getByRole('button', { name: 'Get started' }).click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cb_live_today.png', fullPage: true });
} else {
  console.log('No "Get started" button found; skipping Today screenshot.');
}

await page.goto('http://124.156.206.120/buddy', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/cb_live_buddy_empty.png', fullPage: true });

await page.locator('#message').fill('What is next today?');
await page.locator('button:has-text("Send")').click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/cb_live_buddy_response.png', fullPage: true });

const body = await page.content();
console.log(body.includes('routines recorded') ? 'routines recorded: FOUND' : 'routines recorded: NOT FOUND');

await browser.close();
console.log('DONE');
