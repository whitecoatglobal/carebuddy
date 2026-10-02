import { chromium } from '@playwright/test';

const API = 'http://124.156.206.120';

// Seed a known state for a known client id on the backend, then verify the
// loaded app reflects it (proving pull-on-mount works).
const CID = 'e2e-sync-' + Date.now();
const seedState = {
  version: 1,
  started: true,
  now: '2026-10-02T18:00:00+08:00',
  selectedProfileId: 'p-me',
  profiles: [{ id: 'p-me', displayName: 'Me', relationship: 'Self', canView: true, canManage: true }],
  reminders: [],
  appointments: [],
  benefits: [],
  chats: [
    { id: 'seed-chat-1', profileId: 'p-me', role: 'assistant', text: 'Welcome back from your saved record.', contextId: null, timestamp: '2026-10-02T18:00:00+08:00' },
  ],
  notifications: [],
  appliedActions: ['synthetic-household-v2'],
  activity: [],
  carMode: 'disconnected',
  preferences: { genericReminders: true, spokenReminders: false },
  scenario: '',
};

const putRes = await fetch(`${API}/api/state/${CID}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(seedState),
});
console.log('PUT status:', putRes.status);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url()));

// Inject the client id before the app boots so the pull hits our seeded record.
await page.addInitScript((id) => {
  try { localStorage.setItem('care-buddy.client-id', id); } catch {}
}, CID);

await page.goto('http://124.156.206.120/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/cb_sync_welcome.png', fullPage: true });

// If the pulled state had started=true, we should land on /today, not /welcome.
const url = page.url();
console.log('LANDED ON:', url);

await page.goto('http://124.156.206.120/buddy', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const body = await page.content();
console.log('HAS SEED CHAT:', body.includes('Welcome back from your saved record.'));

// Now make a change (send a message) and confirm it persisted on the server.
await page.locator('#message').fill('What is next today?');
await page.locator('button:has-text("Send")').click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/cb_sync_buddy.png', fullPage: true });
const after = await page.content();
console.log('BUDDY REPLIED:', after.includes('routines recorded'));

// Verify the server now has the updated state (with the user's new chat).
const getRes = await fetch(`${API}/api/state/${CID}`);
const data = await getRes.json();
console.log('SERVER CHATS COUNT:', data?.state?.chats?.length ?? 0);
console.log('SERVER HAS USER MSG:', JSON.stringify(data?.state?.chats || []).includes('What is next today?'));

await browser.close();
console.log('DONE');
