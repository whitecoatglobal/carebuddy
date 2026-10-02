import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4173/buddy');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/cb_buddy.png' });
await browser.close();
