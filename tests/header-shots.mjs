// Header standard checks and screenshots (tests/out/header/). Made-up properties and people only, inside the
// Firebase emulators: cd tests && node run.mjs header-shots.mjs
// Light and dark; 1440, 1280, 1180, 1024, 390 and 360 wide; at the top and scrolled; as a manager, a Team Leader and a
// member. Fails if anything scrolls sideways.
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), OUT = join(HERE, 'out/header');
mkdirSync(OUT, { recursive: true });
const BASE = ['artifacts', 'tchb-checklist-live', 'public', 'data'];
const safeId = a => encodeURIComponent(a).replace(/\./g, '%2E');
const FILL = ['Yes', 'No', 'Confirmed with seller', 'N/A', 'Sample answer'];
function rec(address, n, extra = {}) {
  const checks = {}, answers = {};
  for (let i = 0; i < 79; i++) checks['chk_' + i] = false;
  for (let i = 0; i < 81; i++) answers['ans_' + i] = '';
  for (let q = 0; q < n; q++) answers['ans_' + (q <= 5 ? q : q + 2)] = FILL[q % FILL.length];
  return { address, crmLink: n % 2 ? 'https://app.gohighlevel.com/v2/location/sample/contacts/detail/demo' : '', checks, answers,
    updatedAt: new Date(Date.parse('2026-11-03T15:00:00Z') - n * 3600e3).toISOString(), updatedBy: 'alex.tester@totalchb.com', ...extra };
}
const STREETS = ['Sample Palm Dr', 'Demo Oak Ln', 'Placeholder Ct', 'Fictional Ave', 'Mock Harbor Way', 'Test Ridge Rd', 'Example Bay St', 'Pretend Pine Pl', 'Imaginary Elm Blvd', 'Madeup Maple Ter', 'Dummy Dune Dr', 'Specimen Shore Ct'];
const SAMPLES = STREETS.map((st, i) => rec(`${100 + i * 37} ${st}, Exampleton FL 330${String(i).padStart(2, '0')}`, [11, 41, 79, 3, 66, 25, 0, 52, 18, 70, 33, 8][i]));
SAMPLES.push(rec('51 Closed Sample Way, Mockville FL 33090', 79, { status: 'closed', statusAt: Date.parse('2026-10-29T18:30:00Z'), statusBy: 'morgan.manager@totalchb.com' }));

const env = await initializeTestEnvironment({ projectId: 'demo-tc-checklist', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(join(ROOT, 'firebase/firestore.rules'), 'utf8') } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore();
  for (const r of SAMPLES) await setDoc(doc(f, [...BASE, 'checklists', safeId(r.address)].join('/')), r);
  for (const [uid, email, type] of [['u1', 'morgan.manager@totalchb.com', 'Desktop'], ['u2', 'lee.leader@totalchb.com', 'Mobile']])
    await setDoc(doc(f, [...BASE, 'active_users', uid].join('/')), { email, sessions: { d1: { lastActive: Date.now(), type } } });
});

const browser = await chromium.launch();
async function open({ width, height = 900, theme = 'light', who = 'morgan.manager@totalchb.com' }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(u.hostname)) return route.continue();
    if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/12.15.0/'))
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(join(HERE, 'node_modules/firebase', u.pathname.split('/').pop())) });
    if (u.hostname.startsWith('fonts.')) return route.continue();
    return route.abort();
  });
  await context.addInitScript(t => { try { localStorage.setItem('tchb-checklist-theme', t); } catch (e) {} }, theme);
  const page = await context.newPage();
  await page.goto('http://localhost:5173/?emulator#/'); await page.waitForFunction(() => window.__emuSignIn);
  await page.evaluate(w => window.__emuSignIn(w), who); await page.waitForSelector('.prop-card'); await page.waitForTimeout(700);
  return { context, page };
}
const noSideways = async (page, what) => {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert.ok(r.sw <= r.w, `${what}: page is ${r.sw}px wide in a ${r.w}px window`);
};
const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: join(OUT, name + '.png') }); };
let n = 0;
const ok = msg => { n++; console.log('  pass  ' + msg); };

for (const theme of ['light', 'dark']) for (const width of [1440, 1280, 1180, 1024, 390, 360]) {
  const phone = width < 640, { context, page } = await open({ width, height: phone ? 844 : 900, theme });
  const tag = `${width}-${theme}`;
  // header checks
  const h = await page.evaluate(() => {
    const box = id => { const r = document.getElementById(id).getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top), vis: getComputedStyle(document.getElementById(id)).display !== 'none' }; };
    const logo = document.querySelector('.brand .logo-mark').getBoundingClientRect();
    const shown = [...document.querySelectorAll('.brand .logo-mark img')].filter(i => getComputedStyle(i).display !== 'none').map(i => i.className);
    return { pill: box('live-pill'), active: box('active-btn'), avatar: box('avatar-btn'), logo: Math.round(logo.height),
      shown, text: document.getElementById('live-pill').innerText.trim(), state: document.getElementById('live-pill').dataset.state };
  });
  assert.equal(h.pill.h, 40, 'clock pill is 40px high'); assert.equal(h.avatar.h, 40);
  assert.equal(h.logo, phone ? 40 : 64, 'logo height');
  assert.deepEqual(h.shown, [phone ? 'logo-m' : theme === 'dark' ? 'logo-d' : 'logo-l'], 'phones show the round mark, desktops the full logo for the theme');
  assert.equal(h.state, 'idle');
  if (phone) { assert.match(h.text, /^\d{1,2}:\d\d:\d\d [AP]M E[SD]T$/, 'time only on phones: ' + h.text); assert.ok(!h.active.vis, 'Active moves into the menu on phones');
    assert.equal(h.pill.top, h.avatar.top, 'one row on phones'); }
  else { assert.match(h.text, /^[A-Z][a-z]{2} \d\d\/\d\d\/\d{4} \d{1,2}:\d\d:\d\d [AP]M E[SD]T$/, 'full clock: ' + h.text); assert.equal(h.active.h, 40); }
  await noSideways(page, tag + ' top'); await shot(page, `${tag}-1-top`);
  await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400);
  const sc = await page.evaluate(() => ({ slim: document.getElementById('hdr').classList.contains('slim'), pinned: document.getElementById('tabs-line').classList.contains('pinned'),
    hdr: document.getElementById('hdr').getBoundingClientRect().height, tabsTop: document.getElementById('tabs-line').getBoundingClientRect().top,
    logo: document.querySelector('.brand .logo-mark').getBoundingClientRect().height, stats: getComputedStyle(document.querySelector('.stats')).display }));
  assert.ok(sc.slim && sc.pinned, 'header slims and tabs pin when scrolled');
  assert.ok(Math.abs(sc.tabsTop - sc.hdr) <= 1, 'tabs pin right under the header');
  assert.equal(Math.round(sc.logo), phone ? 40 : 64, 'logo keeps its size when slim');
  if (phone) assert.equal(sc.stats, 'none', 'stats hide when pinned on phones');
  await noSideways(page, tag + ' scrolled'); await shot(page, `${tag}-2-scrolled`);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  // the property's own page: same header, sections untouched
  await page.click('.prop-card .prop-title'); await page.waitForSelector('#view-check:not([hidden])'); await page.waitForTimeout(400);
  await noSideways(page, tag + ' checklist'); await shot(page, `${tag}-3-checklist`);
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(400); await noSideways(page, tag + ' checklist scrolled'); await shot(page, `${tag}-4-checklist-scrolled`);
  await page.evaluate(() => window.scrollTo(0, 0));
  // menus
  await page.click('#avatar-btn'); await page.waitForSelector('.menu.acct'); await noSideways(page, tag + ' photo menu');
  const items = await page.$$eval('.menu.acct > button', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(items.map(x => x.replace(/\s*\d+$/, '')), phone ? ['My Settings', 'Team Members', "Who's Online", 'Help', 'Sign Out'] : ['My Settings', 'Team Members', 'Help', 'Sign Out']);
  if (phone) assert.equal(await page.$$eval('.menu.acct [data-theme-btn]', b => b.map(x => x.textContent.trim()).join(',')), 'Light,Dark');
  await shot(page, `${tag}-5-photo-menu`); await page.keyboard.press('Escape');
  await page.click('#live-pill'); await page.waitForSelector('.menu.sync'); assert.match(await page.textContent('.menu.sync'), /Live: Everything Is Saved/);
  await shot(page, `${tag}-6-live-details`); await page.keyboard.press('Escape');
  ok(`${tag}: header, pinned tabs, menus, no sideways scroll`);
  await context.close();
}

// roles: the photo menu and My Settings for a manager, a Team Leader and a member
for (const [who, role] of [['morgan.manager@totalchb.com', 'Manager'], ['lee.leader@totalchb.com', 'Team Leader · TC'], ['alex.tester@totalchb.com', 'Member · TC']]) {
  const { context, page } = await open({ width: 1280, who });
  await page.click('#avatar-btn'); assert.match(await page.textContent('.menu.acct .type'), new RegExp(role));
  await page.click('[data-mysettings]'); await page.waitForSelector('.modal'); const t = await page.textContent('.modal');
  assert.match(t, /My Settings/); assert.match(t, /Nothing to set here yet/); assert.match(t, new RegExp(role));
  await shot(page, `role-${role.split(' ')[0].toLowerCase()}-my-settings`); await page.click('[data-m-ok]');
  // Sign Out asks first; Cancel keeps you signed in
  await page.click('#avatar-btn'); await page.click('[data-signout]'); await page.waitForSelector('.modal'); assert.match(await page.textContent('.modal'), /Sign Out\?/);
  await page.click('[data-m-cancel]'); assert.ok(await page.isVisible('#app'));
  ok(`${role}: photo menu, My Settings, Sign Out asks first`);
  await context.close();
}

// save states on the clock: saving (indigo), then Live again; a phone opens Who's Online from the menu
{
  const { context, page } = await open({ width: 1280 });
  await page.click('.prop-card .prop-title'); await page.waitForSelector('#view-check:not([hidden])');
  await page.fill('[data-ans="3"]', 'Sample typing');
  assert.equal(await page.getAttribute('#live-pill', 'data-state'), 'saving'); await shot(page, 'state-saving');
  await page.waitForFunction(() => ['idle', 'saved'].includes(document.getElementById('live-pill').dataset.state), null, { timeout: 8000 });
  await page.click('#live-pill'); assert.match(await page.textContent('.menu.sync'), /Last saved \w{3} \d\d\/\d\d\/\d{4}/); await page.keyboard.press('Escape');
  ok('clock goes indigo while saving, then green with the last-saved time');
  await context.close();
}
{
  const { context, page } = await open({ width: 390, height: 844 });
  await page.click('#avatar-btn'); await page.click('[data-online]'); await page.waitForSelector('.menu.pop'); assert.match(await page.textContent('.menu.pop'), /Online Now · \d+/);
  await shot(page, '390-light-7-whos-online'); await page.keyboard.press('Escape');
  await page.click('#avatar-btn'); await page.click('.menu [data-theme-btn="dark"]'); assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  ok("phone: Who's Online and the Light / Dark switch in the photo menu");
  await context.close();
}

// moving between properties: Previous / Jump To / Next, desktop and phone
for (const [width, theme] of [[1280, 'light'], [390, 'light'], [360, 'dark']]) {
  const { context, page } = await open({ width, height: width < 640 ? 844 : 900, theme });
  await page.click('.prop-card:nth-child(3) .prop-title'); await page.waitForSelector('#view-check:not([hidden])'); await page.waitForTimeout(400);
  assert.equal(await page.textContent('#nav-pos'), '3 of 12');
  await noSideways(page, width + ' nav'); await shot(page, `nav-${width}-${theme}-1-bar`);
  await page.click('#nav-jump'); await page.waitForSelector('.menu.jump'); await noSideways(page, width + ' jump'); await shot(page, `nav-${width}-${theme}-2-jump`);
  await page.keyboard.press('Escape'); await page.click('#nav-next'); await page.waitForFunction(() => document.getElementById('nav-pos').textContent === '4 of 12');
  ok(`${width} ${theme}: Previous / Jump To / Next`);
  await context.close();
}

// Login As User (Remy only): the picker, then the amber bar, desktop and phone
for (const width of [1280, 390]) {
  const { context, page } = await open({ width, height: width < 640 ? 844 : 900, who: 'systems@totalchb.com' });
  await page.click('#avatar-btn'); await shot(page, `loginas-${width}-0-menu`); await page.click('[data-team]'); await page.waitForSelector('.tm [data-as="alex.tester@totalchb.com"]');
  await noSideways(page, width + ' team members'); await shot(page, `loginas-${width}-1-team-members`);
  await page.click('.tm [data-as="alex.tester@totalchb.com"]'); await page.waitForSelector('.modal h2:has-text("Login As Alex Tester?")'); await shot(page, `loginas-${width}-2-confirm`);
  await page.click('.modal [data-m-ok]'); await page.waitForSelector('#imp-bar:not([hidden])', { timeout: 15000 }); await page.waitForTimeout(600);
  await noSideways(page, width + ' login as'); await shot(page, `loginas-${width}-3-viewing-as`);
  await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await noSideways(page, width + ' login as scrolled'); await shot(page, `loginas-${width}-4-scrolled`);
  await page.click('#imp-back'); await page.waitForSelector('#imp-bar[hidden]', { state: 'attached', timeout: 15000 });
  ok(`${width}: Team Members with Login As User, amber bar, Back To Remy`);
  await context.close();
}

await browser.close(); await env.cleanup();
console.log(`  ${n} passed, ${n} checks`);
