import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));

await page.goto('http://124.156.206.120/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Get started' }).click({ timeout: 5000 });
await page.waitForTimeout(1000);
await page.goto('http://124.156.206.120/health', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/cb_live_health.png', fullPage: true });

const body = await page.content();
console.log('HAS HR:', body.includes('Heart rate'));
console.log('HAS BP:', body.includes('Blood pressure'));
console.log('HAS BREATHING:', body.includes('Breathing'));
console.log('HAS SLEEP:', body.includes('hours'));
console.log('HAS WEATHER:', body.includes('CURRENT WEATHER'));
console.log('HAS ADVICE:', body.includes('ADVICE'));
console.log('HAS TEMP:', body.includes('°C'));

await browser.close();
console.log('DONE');
