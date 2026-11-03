// Screenshots for the user guide (docs/guide/shots/). Runs inside the Firebase emulators with made-up properties and
// people only (never real records): cd tests && node run.mjs guide-shots.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), SHOTS = join(ROOT, 'docs/guide/shots');
mkdirSync(SHOTS, { recursive: true });
const BASE = ['artifacts', 'tchb-checklist-live', 'public', 'data'];
const CL = id => [...BASE, 'checklists', id].join('/');
const safeId = a => encodeURIComponent(a).replace(/\./g, '%2E');
const T = iso => new Date(iso).toISOString();

// ---------------------------------------------------------------- made-up sample properties
function rec(address, checked, answers = {}, extra = {}) {   // checked: question numbers that are answered
  const checks = {}, ans = {};
  // done = the answer box has text, so the sample questions listed in `done` get a sample answer (no ticks stored)
  const FILL = ['Yes', 'No', 'Confirmed with seller', 'N/A', 'Seller to send by Friday', 'Sample answer'];
  for (let i = 0; i < 79; i++) checks['chk_' + i] = false;
  for (let i = 0; i < 81; i++) ans['ans_' + i] = answers[i] || '';
  for (const q of checked) { const a = q <= 5 ? q : q + 2; if (!ans['ans_' + a]) ans['ans_' + a] = FILL[q % FILL.length]; }
  return { address, crmLink: 'https://app.gohighlevel.com/v2/location/sample/contacts/detail/demo', checks, answers: ans, ...extra };
}
const MAIN = '1420 Sample Palm Dr, Exampleton FL 33000';
const SAMPLES = [
  rec(MAIN, [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 15], {
    0: 'Example Home Loans (sample)', 1: '$184,500 per seller; payoff letter requested', 3: 'No late payments in the last 24 months',
    4: '$1,212.40', 6: '$165.00 / mo', 7: '$310.25 / mo', 8: 'Yes, seller is emailing it today',
    9: 'Seller will send 20+ photos by Friday', 10: 'Jamie Example (sister), 555-0100, prefers text',
    11: 'Palm Grove HOA (sample), manager Pat Placeholder, 555-0142', 12: 'Email first, then phone', 17: '$95 / mo, paid quarterly' },
    { updatedAt: T('2026-11-02T15:42:00Z'), updatedBy: 'jordan.sample@totalchb.com' }),
  rec('88 Demo Oak Ln, Mockville FL 33001', [...Array(41).keys()], { 0: 'Sample Bank' },
    { updatedAt: T('2026-11-02T13:10:00Z'), updatedBy: 'morgan.manager@totalchb.com' }),
  rec('7 Placeholder Ct, Testburg FL 33002', [...Array(79).keys()], {},
    { updatedAt: T('2026-10-31T19:05:00Z'), updatedBy: 'alex.tester@totalchb.com' }),
  rec('305 Fictional Ave, Sampleton FL 33003', [0, 1, 2], { 0: 'Demo Credit Union' },
    { updatedAt: T('2026-10-30T14:20:00Z'), updatedBy: 'dee.spo@totalchb.com' }),
  rec('51 Mock Harbor Way, Exampleton FL 33004', [...Array(66).keys()], {},
    { updatedAt: T('2026-10-28T16:00:00Z'), updatedBy: 'jordan.sample@totalchb.com', status: 'closed',
      statusAt: Date.parse('2026-10-29T18:30:00Z'), statusBy: 'morgan.manager@totalchb.com',
      statusLog: [{ status: 'closed', at: Date.parse('2026-10-29T18:30:00Z'), by: 'morgan.manager@totalchb.com' }] }),
  rec('900 Test Ridge Rd, Mockville FL 33005', [0, 1], {},
    { updatedAt: T('2026-10-20T15:00:00Z'), updatedBy: 'alex.tester@totalchb.com', status: 'cancelled',
      statusAt: Date.parse('2026-10-21T13:00:00Z'), statusBy: 'alex.tester@totalchb.com',
      statusLog: [{ status: 'cancelled', at: Date.parse('2026-10-21T13:00:00Z'), by: 'alex.tester@totalchb.com' }] }),
];

const env = await initializeTestEnvironment({ projectId: 'demo-tc-checklist', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(join(ROOT, 'firebase/firestore.rules'), 'utf8') } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore();
  for (const r of SAMPLES) await setDoc(doc(f, CL(safeId(r.address))), r);
  const now = Date.now();
  for (const [uid, email, type] of [['u1', 'morgan.manager@totalchb.com', 'Desktop'], ['u2', 'dee.spo@totalchb.com', 'Mobile']])
    await setDoc(doc(f, [...BASE, 'active_users', uid].join('/')), { email, sessions: { d1: { lastActive: now, type } } });
});

const browser = await chromium.launch();
async function open({ width = 1280, height = 860, theme = 'light', signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(u.hostname)) return route.continue();
    if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/12.15.0/'))
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(join(HERE, 'node_modules/firebase', u.pathname.split('/').pop())) });
    if (u.hostname.startsWith('fonts.')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/?emulator#/');
  await page.waitForFunction(() => window.__emuSignIn);
  if (signedIn) { await page.evaluate(() => window.__emuSignIn('jordan.sample@totalchb.com')); await page.waitForSelector('.prop-card'); }
  await page.waitForTimeout(900);
  return { context, page };
}
const snap = async (page, name, opts = {}) => { await page.waitForTimeout(450); await page.screenshot({ path: join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 88, ...opts }); console.log('  pass  shot ' + name); };
const openMain = async page => { await page.click(`.prop-card[data-id="${safeId(MAIN)}"] .prop-title`); await page.waitForSelector('#view-check:not([hidden])'); await page.waitForTimeout(400); };

// ---------------------------------------------------------------- desktop, light
let { context, page } = await open({ signedIn: false });
await page.waitForSelector('#gate:not([hidden])'); await snap(page, '01-signin');
await context.close();

({ context, page } = await open());
await snap(page, '02-home');
await page.fill('#search', 'palm grove'); await snap(page, '03-search'); await page.fill('#search', '');
await page.click('[data-tab="closed"]'); await snap(page, '04-closed-tab'); await page.click('[data-tab="open"]');
await page.click('#active-btn'); await snap(page, '05-active'); await page.keyboard.press('Escape');
await page.click('#avatar-btn'); await snap(page, '06-avatar'); await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1280, height: 1180 });
await page.click('#avatar-btn'); await page.click('[data-help]'); await page.waitForSelector('.modal.help'); await snap(page, '16-help');
await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1280, height: 860 });
await page.click('#new-btn'); await page.fill('[data-m-input]', '12 Example Bay St, Sampleton FL 33006'); await snap(page, '07-new-property'); await page.click('[data-m-cancel]');
await openMain(page);
await snap(page, '08-checklist-top');
await page.evaluate(() => window.scrollTo(0, document.querySelector('.sec').getBoundingClientRect().top + window.scrollY - 90));
await snap(page, '09-mortgage-section');
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#status-btn'); await snap(page, '10-status-menu'); await page.keyboard.press('Escape');
await page.click('#delete-btn'); await page.fill('[data-m-input]', 'DELETE'); await snap(page, '11-delete'); await page.click('[data-m-cancel]');
await page.evaluate(() => { window.print = () => {}; }); await page.click('#print-btn'); await page.waitForTimeout(300);
await page.emulateMedia({ media: 'print' }); await page.setViewportSize({ width: 900, height: 1160 });
await snap(page, '12-print', { fullPage: false }); await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1280, height: 860 });
await page.click('a.link-btn'); await page.click('[data-tab="closed"]'); await page.click('.prop-card .prop-title'); await page.waitForSelector('#locked-note:not([hidden])');
await page.evaluate(() => window.scrollTo(0, 60)); await snap(page, '13-closed-view');
await page.evaluate(() => window.scrollTo(0, 0)); await page.click('#activity-btn'); await snap(page, '14-activity'); await page.keyboard.press('Escape');
await context.close();

// ---------------------------------------------------------------- dark and phone
({ context, page } = await open({ theme: 'dark' })); await snap(page, '15-home-dark'); await context.close();
({ context, page } = await open({ width: 390, height: 844 })); await snap(page, '21-phone-home');
await openMain(page); await page.evaluate(() => window.scrollTo(0, document.querySelector('.sec').getBoundingClientRect().top + window.scrollY - 20));
await snap(page, '22-phone-checklist'); await context.close();

await browser.close(); await env.cleanup();
console.log('  passed, shots in docs/guide/shots');
