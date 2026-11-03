// TC Checklist checks. Runs inside `firebase emulators:exec` (see run.mjs) against a demo project with made-up data.
// Nothing here can reach the live database: the page only talks to the emulators on localhost (?emulator), and every
// request leaving localhost is blocked except Google Fonts. Output is counts and pass/fail lines only.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }));
// The last version of the original app (before the hub-design revamp): the frozen contract is checked against it.
const ORIGINAL = '8b7a613';
const PROJECT = 'demo-tc-checklist', BASE = ['artifacts', 'tchb-checklist-live', 'public', 'data'];
const CL = id => [...BASE, 'checklists', id].join('/');
const safeId = a => encodeURIComponent(a).replace(/\./g, '%2E');

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('  pass  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); }
}

// ---------------------------------------------------------------- the original page's question map (commit 8b7a613)
function originalMap() {
  let html;
  html = execSync(`git show ${ORIGINAL}:index.html`, { cwd: ROOT, encoding: 'utf8' });
  const main = html.slice(html.indexOf('id="checklist-container"'), html.indexOf('</main>'));
  const re = /<h2 class="text-sm[^>]*>([^<]+)<\/h2>|<label class="check-container( nested-(\d))?">[\s\S]*?<span class="check-text">([\s\S]*?)<\/span>|<div class="absolute left-3[^>]*>(HOI|Taxes)<\/div>/g;
  const out = []; let c = 0, a = 0, m;
  while ((m = re.exec(main))) {
    if (m[1]) out.push({ section: m[1].trim() });
    else if (m[5]) out.push({ extra: m[5], ans: a++ });
    else out.push({ text: m[4].replace(/&amp;/g, '&'), nest: +(m[3] || 0), chk: c++, ans: a++ });
  }
  return out;
}
const flatNew = map => { const out = [];
  for (const s of map) { out.push({ section: s.title });
    for (const q of s.qs) { out.push({ text: q.text, nest: q.nest, chk: q.chk, ans: q.ans }); (q.escrow || []).forEach(x => out.push({ extra: x.label, ans: x.ans })); } }
  return out; };

// ---------------------------------------------------------------- local web server (Date header, fake /api/team)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve(root, port, opts = {}) {
  const srv = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/team') { res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ people: [{ name: 'Alex Tester', email: 'alex.tester@totalchb.com', photo: '', role: 'member', dept: 'TC' }, { name: 'Morgan Manager', email: 'morgan.manager@totalchb.com', photo: '', role: 'manager', dept: '' }] })); }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(typeof root === 'function' ? root() : root, decodeURIComponent(p));
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

// Firebase's browser files come from the npm package (the same 12.15.0 build the page loads from gstatic).
async function guard(context, errors) {
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/12.15.0/')) {
      const f = join(HERE, 'node_modules/firebase', u.pathname.split('/').pop());
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(f) });
    }
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return route.continue();
    return route.abort();
  });
  context.on('weberror', e => errors.push('pageerror: ' + e.error().message));
}
async function openApp(browser, email, { viewport = { width: 1280, height: 900 }, theme = 'light', localStorageInit = {} } = {}) {
  const context = await browser.newContext({ viewport, colorScheme: theme, serviceWorkers: 'block' });
  const errors = []; await guard(context, errors);
  await context.addInitScript(init => { try { for (const [k, v] of Object.entries(init)) if (localStorage.getItem(k) === null && !sessionStorage.getItem('seeded')) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } catch (e) {} }, localStorageInit);
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:5173/?emulator#/');
  await page.waitForFunction(() => window.__emuSignIn);
  if (email) { await page.evaluate(e => window.__emuSignIn(e), email); await page.waitForSelector('#view-home:not([hidden])', { timeout: 15000 }); }
  return { context, page, errors };
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------- made-up data
const LEGACY_ADDR = '100 Test Lane, Faketown FL 00000';
const LONG = 'Lender is Example Mortgage Co. Seller says the payoff letter is coming next week; ' + 'details repeated for length. '.repeat(14) + 'END-OF-LONG-ANSWER';
function legacyRecord() {           // exactly what the original app wrote with setDoc
  const checks = {}, answers = {};
  for (let i = 0; i < 79; i++) checks['chk_' + i] = i === 0 || i === 5 || i === 9;
  for (let i = 0; i < 81; i++) answers['ans_' + i] = '';
  answers.ans_0 = 'Example Mortgage Co'; answers.ans_6 = '$111'; answers.ans_7 = '$222'; answers.ans_8 = LONG; answers.ans_11 = 'Pat HOA (555) 000-0000';
  return { crmLink: 'https://app.gohighlevel.com/example/contacts/fake', checks, answers, address: LEGACY_ADDR, updatedAt: '2026-10-01T14:00:00.000Z' };
}

// ================================================================= run
const rulesNow = readFileSync(join(ROOT, 'firebase/firestore.rules.current'), 'utf8');
const rulesNew = readFileSync(join(ROOT, 'firebase/firestore.rules'), 'utf8');

console.log('\nData contract');
const newMapRaw = await (async () => { const b = await chromium.launch(); const c = await b.newContext(); const e = []; await guard(c, e);
  const p = await c.newPage(); await p.goto('http://localhost:5173/?emulator'); const m = await p.evaluate(() => window.__TC_MAP); await b.close(); return m; })().catch(e => { throw e; });
await check('question order, nesting and chk_/ans_ numbers match the original page exactly', () => {
  const was = originalMap(), now = flatNew(newMapRaw);
  assert.equal(now.filter(x => x.chk !== undefined).length, 79); assert.equal(was.filter(x => x.ans !== undefined).length, 81);
  assert.deepEqual(now, was);
});

console.log('\nSecurity rules');
let env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080, rules: rulesNow } });
const ctx = (e, email, verified = true) => e.authenticatedContext('u-' + email.replace(/\W/g, ''), { email, email_verified: verified }).firestore();
await check('today\'s rules: any signed-in account can read (the gap)', () => assertSucceeds(getDoc(doc(ctx(env, 'someone@gmail.com'), CL('x')))));
await env.cleanup();
env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080, rules: rulesNew } });
await check('new rules: @totalchb.com can read and write checklists and presence', async () => {
  const f = ctx(env, 'alex.tester@totalchb.com');
  await assertSucceeds(setDoc(doc(f, CL('rules-probe')), { address: 'rules probe' }));
  await assertSucceeds(getDoc(doc(f, CL('rules-probe'))));
  await assertSucceeds(setDoc(doc(f, [...BASE, 'active_users', 'u1'].join('/')), { email: 'alex.tester@totalchb.com' }, { merge: true }));
});
await check('new rules: other domains, unverified emails, look-alike domains and signed-out are denied', async () => {
  for (const f of [ctx(env, 'someone@gmail.com'), ctx(env, 'alex.tester@totalchb.com', false), ctx(env, 'x@totalchb.com.evil.io'), ctx(env, 'x@nottotalchb.com'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(f, CL('rules-probe')))); await assertFails(setDoc(doc(f, CL('rules-probe2')), { a: 1 }));
  }
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), CL(safeId(LEGACY_ADDR))), legacyRecord()); });
const read = async id => { let d; await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), CL(id))); d = s.exists() ? s.data() : null; }); return d; };
const readPresence = async () => { const out = []; await env.withSecurityRulesDisabled(async c => {
  const { getDocs, collection } = await import('firebase/firestore'); (await getDocs(collection(c.firestore(), [...BASE, 'active_users'].join('/')))).forEach(d => out.push(d.data())); }); return out; };

console.log('\nApp (two people, emulator)');
const browser = await chromium.launch();
const draft = { crmLink: 'https://app.gohighlevel.com/example/draft', checks: { chk_1: true, chk_78: true }, answers: { ans_1: 'Draft payoff answer', ans_80: 'Double' } };
const A = await openApp(browser, 'alex.tester@totalchb.com', { localStorageInit: { tchb_unsaved_draft: JSON.stringify(draft), tchb_device_id: 'dev_test_a' } });
const B = await openApp(browser, 'bea.sample@totalchb.com', { viewport: { width: 390, height: 844 } });
const lid = safeId(LEGACY_ADDR);

await check('home lists an existing (old-format) record under Open with its progress', async () => {
  await A.page.waitForSelector(`.prop-card[data-id="${lid}"]`);
  const txt = await A.page.textContent(`.prop-card[data-id="${lid}"]`);
  assert.match(txt, /100 Test Lane/); assert.match(txt, /4 of 79 Answered/); assert.match(txt, /Open/);
  assert.equal(await A.page.textContent('[data-n="open"]'), '1');
});
await check('names come from the hub directory, else from the email', async () => {
  await A.page.click('#avatar-btn'); assert.match(await A.page.textContent('.menu'), /Alex Tester/); await A.page.keyboard.press('Escape');
  await B.page.click('#avatar-btn'); assert.match(await B.page.textContent('.menu'), /Bea Sample/); await B.page.keyboard.press('Escape');
});
const helpOf = async page => {
  await page.click('#avatar-btn'); await page.click('[data-help]'); await page.waitForSelector('.help-panel h2[data-sec]');
  return { title: await page.textContent('[data-help-title]'), nav: await page.$$eval('[data-help-nav] [data-go]', els => els.length),
    pdfs: await page.$$eval('[data-pdf]', els => els.map(e => e.dataset.pdf + (e.classList.contains('mine') ? '*' : ''))) };
};
// Download a guide from Help and read it: pages and text (pdfinfo / pdftotext). Made-up passwords only.
const fetchGuide = async (page, kind) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-pdf-dl="${kind}"]`)]);
  const f = join(OUT, `guide-${kind}-${Date.now()}.pdf`); await dl.saveAs(f);
  return { pages: +execSync(`pdfinfo "${f}"`, { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1], text: execSync(`pdftotext "${f}" -`, { encoding: 'utf8' }) };
};
const pagesOf = file => +execSync(`pdfinfo "${join(ROOT, file)}"`, { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1];
await check('Help: a Member gets the Team Guide in the app, with no passwords; the PDF opens', async () => {
  await A.page.click('#avatar-btn'); assert.match(await A.page.textContent('.menu'), /Member · TC/); await A.page.keyboard.press('Escape');
  const h = await helpOf(A.page);
  assert.equal(h.title, 'Team Guide'); assert.equal(h.nav, 15, '14 sections + the Quick Reference Card');
  assert.deepEqual(h.pdfs, ['member*']);
  assert.equal(await A.page.locator('.help-panel [data-tc-pw], .help-panel code.pw').count(), 0);
  assert.match(await A.page.textContent('.help-body'), /only Team Leaders and Managers can delete/i);
  const g = await fetchGuide(A.page, 'member');
  assert.equal(g.pages, pagesOf('guides/TC_Checklist_Team_Guide.pdf'), 'a Member gets the plain guide');
  assert.doesNotMatch(g.text, /sample-pass|sample-own/);
  await A.page.click('[data-help-nav] [data-go="9"]'); await A.page.waitForTimeout(700);
  assert.equal(await A.page.getAttribute('[data-help-nav] [data-go="9"]', 'aria-current'), 'true', 'contents follow the scroll');
  await A.page.keyboard.press('Escape'); assert.equal(await A.page.locator('.help-panel').count(), 0);
  const hb = await helpOf(B.page); assert.equal(hb.title, 'Team Guide', 'not in the hub: a Member'); await B.page.click('.help-panel [data-close]');
});
await check('Help: a Manager gets the Manager Guide with the TC and own passwords; a Team Leader the TC one', async () => {
  for (const [email, title, pdf, own, kinds] of [['morgan.manager@totalchb.com', 'Manager Guide', 'Manager', true, ['manager*', 'lead', 'member']],
    ['lee.leader@totalchb.com', 'Team Leader Guide', 'Team_Leader', false, ['lead*', 'member']]]) {
    const M = await openApp(browser, email);
    const h = await helpOf(M.page);
    assert.equal(h.title, title); assert.deepEqual(h.pdfs, kinds);
    const kind = kinds[0].slice(0, -1), mine = await fetchGuide(M.page, kind);
    assert.equal(mine.pages, pagesOf(`guides/TC_Checklist_${pdf}_Guide.pdf`) + 1, 'own copy ends with the passwords page');
    assert.match(mine.text, /Your Delete Passwords/); assert.match(mine.text, /sample-pass/);
    assert.equal(/sample-own/.test(mine.text), own, 'own passwords only for managers');
    const other = await fetchGuide(M.page, 'member');
    assert.equal(other.pages, pagesOf('guides/TC_Checklist_Team_Guide.pdf')); assert.doesNotMatch(other.text, /sample-pass/);
    await M.page.waitForSelector('.help-panel code.pw');
    const pw = await M.page.$$eval('.help-panel code.pw', els => els.map(e => e.textContent));
    assert.deepEqual(pw, own ? ['sample-pass', 'sample-own'] : ['sample-pass'], email);
    assert.match(await M.page.textContent('.help-panel [data-tc-pw]'), /TC Team Leader password/);
    if (own) { await M.page.evaluate(() => document.querySelector('[data-tc-pw]').scrollIntoView()); await M.page.waitForTimeout(300);
      await M.page.screenshot({ path: join(OUT, 'light-desktop-7c-help-manager.png') }); }
    await M.page.keyboard.press('Escape'); await M.page.click('#avatar-btn'); await M.page.click('[data-signout]'); await M.page.waitForSelector('#gate:not([hidden])');
    await M.context.close();
  }
});
await check('the Help files and PDFs hold no passwords (only a slot the page fills after sign-in)', () => {
  const g = readFileSync(join(ROOT, 'help/guides.json'), 'utf8'), j = JSON.parse(g);
  assert.deepEqual(Object.keys(j), ['member', 'lead', 'manager']);
  assert.equal(j.member.html.includes('data-tc-pw'), false); assert.equal(j.lead.html.includes('data-tc-pw'), true); assert.equal(j.manager.html.includes('data-tc-pw'), true);
  assert.equal(/sample-pass|class="pw"/.test(g), false);
  for (const f of ['Team', 'Team_Leader', 'Manager']) assert.ok(statSync(join(ROOT, `guides/TC_Checklist_${f}_Guide.pdf`)).size > 100000, f);
});
await check('search finds a property by answer text and shows where it matched', async () => {
  await A.page.fill('#search', 'pat hoa'); await A.page.waitForSelector('.hit mark');
  assert.match(await A.page.textContent('.hit'), /Whats HOA Contact Info\?/);
  await A.page.fill('#search', 'no such thing zzz'); await A.page.waitForSelector('.empty'); await A.page.fill('#search', '');
});
await check('opening it shows every saved answer in its original place', async () => {
  await A.page.click(`.prop-card[data-id="${lid}"] .prop-title`); await A.page.waitForSelector('#view-check:not([hidden])');
  assert.equal(await A.page.inputValue('[data-ans="0"]'), 'Example Mortgage Co');
  assert.equal(await A.page.inputValue('[data-ans="6"]'), '$111'); assert.equal(await A.page.inputValue('[data-ans="7"]'), '$222');
  assert.equal(await A.page.inputValue('[data-ans="8"]'), LONG);
  assert.equal(await A.page.getAttribute('[data-mark="5"]', 'aria-label'), 'Answered');
  assert.equal(await A.page.getAttribute('[data-mark="6"]', 'aria-label'), 'Answered');
  assert.equal(await A.page.getAttribute('[data-mark="7"]', 'aria-label'), 'Open');
  assert.equal(await A.page.locator('.check, [role="checkbox"]').count(), 0, 'no tick boxes');
  assert.equal(await A.page.inputValue('#crm-link'), legacyRecord().crmLink);
  assert.ok(await A.page.isVisible('#crm-open'));
});
await check('two people editing the same property at once: both edits are kept and show live', async () => {
  await B.page.goto(`http://localhost:5173/?emulator#/p/${encodeURIComponent(lid)}`); await B.page.waitForSelector('#view-check:not([hidden])');
  await A.page.fill('[data-ans="1"]', 'A typed this payoff');            // Mortgage section (open by default)
  await B.page.fill('[data-ans="2"]', 'B typed this foreclosure note');
  await B.page.fill('[data-ans="3"]', 'B: none in 24 months');
  await A.page.waitForFunction(() => document.querySelector('[data-ans="2"]').value === 'B typed this foreclosure note', null, { timeout: 10000 });
  await B.page.waitForFunction(() => document.querySelector('[data-ans="1"]').value === 'A typed this payoff', null, { timeout: 10000 });
  await A.page.waitForFunction(() => document.querySelector('[data-mark="3"]').getAttribute('aria-label') === 'Answered', null, { timeout: 10000 });
  const d = await read(lid);
  assert.equal(d.answers.ans_1, 'A typed this payoff'); assert.equal(d.answers.ans_2, 'B typed this foreclosure note'); assert.equal(d.answers.ans_3, 'B: none in 24 months');
  assert.equal(d.answers.ans_8, LONG); assert.equal(d.answers.ans_0, 'Example Mortgage Co');
});
await check('done = the box has text: clearing it makes it open again; an old tick still counts; ticks are never written', async () => {
  const mark = n => A.page.getAttribute(`[data-mark="${n}"]`, 'aria-label');
  assert.equal(await mark(2), 'Answered');
  await A.page.fill('[data-ans="2"]', '   '); assert.equal(await mark(2), 'Open', 'spaces alone are not an answer');
  await A.page.fill('[data-ans="2"]', ''); assert.equal(await mark(2), 'Open');
  await A.page.fill('[data-ans="0"]', ''); assert.equal(await mark(0), 'Answered', 'question 0 was ticked before, so it stays done');
  await A.page.fill('[data-ans="0"]', 'Example Mortgage Co'); await A.page.fill('[data-ans="2"]', 'B typed this foreclosure note');
  await A.page.click('#p-address');
  await A.page.waitForFunction(() => document.getElementById('save-text').textContent === 'All Saved' || document.getElementById('save-text').textContent === 'Saved', null, { timeout: 8000 });
  assert.match(await A.page.textContent('#p-count'), /^7 of 79 Answered$/);
  assert.equal(await A.page.textContent('[data-sec-count="0"]'), '6 / 7');
  const d = await read(lid); assert.deepEqual(d.checks, legacyRecord().checks, 'stored ticks untouched');
});
await check('the record keeps its original shape (79 checks, 81 answers, same field types) plus approved fields only', async () => {
  const d = await read(lid);
  assert.equal(Object.keys(d.checks).length, 79); assert.equal(Object.keys(d.answers).length, 81);
  assert.ok(Object.values(d.checks).every(v => typeof v === 'boolean')); assert.ok(Object.values(d.answers).every(v => typeof v === 'string'));
  assert.equal(typeof d.updatedAt, 'string'); assert.ok(!isNaN(Date.parse(d.updatedAt)));
  const allowed = new Set(['address', 'crmLink', 'checks', 'answers', 'updatedAt', 'updatedBy', 'status', 'statusAt', 'statusBy', 'statusLog']);
  assert.deepEqual(Object.keys(d).filter(k => !allowed.has(k)), []);
  assert.ok(['alex.tester@totalchb.com', 'bea.sample@totalchb.com'].includes(d.updatedBy));   // last saver's email
});
await check('the box you are typing in is never overwritten by a teammate', async () => {
  await A.page.click('[data-ans="4"]'); await A.page.keyboard.type('A is mid-sentence');
  await B.page.fill('[data-ans="4"]', 'B overwrote');
  await A.page.waitForTimeout(1200);
  assert.equal(await A.page.inputValue('[data-ans="4"]'), 'A is mid-sentence');
  await A.page.click('#p-address');   // leave the box
});
await check('Print / PDF prints every answer in full and leaves out empty sections', async () => {
  await A.page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await A.page.click('#print-btn'); await A.page.waitForFunction(() => window.__printed);
  const sheet = await A.page.textContent('#print-sheet');
  assert.match(sheet, /END-OF-LONG-ANSWER/); assert.match(sheet, /HOI: \$111/); assert.match(sheet, /Mortgage Questions/); assert.match(sheet, /HOA Questions/);
  assert.doesNotMatch(sheet, /Mobile Homes/); assert.doesNotMatch(sheet, /Income Producing/);
  await A.page.emulateMedia({ media: 'print' });
  await A.page.pdf({ path: join(OUT, 'print.pdf'), format: 'Letter' });
  await A.page.screenshot({ path: join(OUT, 'print-preview.png'), fullPage: true });
  await A.page.emulateMedia({ media: 'screen' });
});
await check('Mark Closed: confirm, logged with who and when, view-only, moves to the Closed tab', async () => {
  await A.page.click('#status-btn'); await A.page.click('[data-st="closed"]'); await A.page.click('[data-m-ok]');
  await A.page.waitForSelector('#locked-note:not([hidden])');
  const d = await read(lid);
  assert.equal(d.status, 'closed'); assert.equal(d.statusBy, 'alex.tester@totalchb.com'); assert.equal(typeof d.statusAt, 'number');
  assert.equal(d.statusLog.length, 1); assert.equal(d.statusLog[0].status, 'closed');
  assert.equal(await A.page.getAttribute('[data-ans="0"]', 'readonly'), ''); assert.equal(await A.page.getAttribute('[data-ans="6"]', 'readonly'), '');
  await B.page.waitForSelector('#locked-note:not([hidden])');
  await A.page.click('#activity-btn'); assert.match(await A.page.textContent('.menu'), /Marked Closed/); await A.page.keyboard.press('Escape');
  await A.page.click('a.link-btn'); await A.page.waitForSelector('#view-home:not([hidden])');
  assert.equal(await A.page.textContent('[data-n="closed"]'), '1'); assert.equal(await A.page.textContent('[data-n="open"]'), '0');
  await A.page.click('[data-tab="closed"]'); await A.page.waitForSelector(`.prop-card[data-id="${lid}"]`);
});
await check('Reopen puts it back to Open and editable', async () => {
  await A.page.click(`.prop-card[data-id="${lid}"] .prop-title`); await A.page.click('#reopen-btn'); await A.page.click('[data-m-ok]');
  await A.page.waitForSelector('#locked-note', { state: 'hidden' });
  const d = await read(lid); assert.equal(d.status, 'open'); assert.equal(d.statusLog.length, 2);
  await A.page.fill('[data-ans="3"]', 'No late payments'); await A.page.waitForFunction(() => document.getElementById('save-text').textContent !== 'Saving…', null, { timeout: 8000 });
  await A.page.click('a.link-btn');
});
await check('New Property with the old unsaved draft: same full shape as the original app, draft cleared', async () => {
  await A.page.click('[data-tab="open"]');
  assert.ok(await A.page.isVisible('#draft-note'));
  await A.page.click('#draft-use'); await A.page.fill('[data-m-input]', '  22 Sample Road, Testville FL  '); await A.page.click('[data-m-ok]');
  await A.page.waitForSelector('#view-check:not([hidden])');
  const id = safeId('22 Sample Road, Testville FL'), d = await read(id);
  assert.equal(d.address, '22 Sample Road, Testville FL'); assert.equal(Object.keys(d.checks).length, 79); assert.equal(Object.keys(d.answers).length, 81);
  assert.equal(d.checks.chk_1, true); assert.equal(d.checks.chk_78, true); assert.equal(d.answers.ans_80, 'Double'); assert.equal(d.crmLink, draft.crmLink);
  assert.equal(d.status, undefined);
  assert.equal(await A.page.evaluate(() => localStorage.getItem('tchb_unsaved_draft')), null);
  assert.equal(await A.page.inputValue('[data-ans="1"]'), 'Draft payoff answer');
  // the escrow question is done when any of its three boxes has text
  const mark5 = () => A.page.getAttribute('[data-mark="5"]', 'aria-label');
  assert.equal(await mark5(), 'Open');
  await A.page.fill('[data-ans="6"]', '$90'); assert.equal(await mark5(), 'Answered', 'HOI alone');
  await A.page.fill('[data-ans="6"]', ''); await A.page.fill('[data-ans="7"]', '$120'); assert.equal(await mark5(), 'Answered', 'Taxes alone');
  await A.page.fill('[data-ans="7"]', ''); assert.equal(await mark5(), 'Open');
  await A.page.fill('[data-ans="5"]', 'About $400 a month'); assert.equal(await mark5(), 'Answered', 'its own box');
});
await check('New Property with an address that exists opens it instead of making a copy', async () => {
  await A.page.click('a.link-btn'); await A.page.click('#new-btn'); await A.page.fill('[data-m-input]', LEGACY_ADDR); await A.page.click('[data-m-ok]');
  await A.page.waitForSelector('#view-check:not([hidden])'); assert.equal(await A.page.textContent('#p-address'), LEGACY_ADDR);
});
await check('an address with quotes, dots and slashes is shown safely and works', async () => {
  const addr = `7 O'Neil "Annex" St. Apt 2/B <b>x</b>`;
  await A.page.click('a.link-btn'); await A.page.click('#new-btn'); await A.page.fill('[data-m-input]', addr); await A.page.click('[data-m-ok]');
  await A.page.waitForSelector('#view-check:not([hidden])'); assert.equal(await A.page.textContent('#p-address'), addr);
  assert.ok(await read(safeId(addr))); await A.page.click('a.link-btn');
  assert.equal(await A.page.locator('.prop-title b').count(), 0);
  await env.withSecurityRulesDisabled(async c => { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(doc(c.firestore(), CL(safeId(addr)))); });
});
await check('Delete: a Member is offered Mark Cancelled instead; nothing is deleted', async () => {
  const id = safeId('22 Sample Road, Testville FL');
  await A.page.click(`.prop-card[data-id="${id}"] .prop-title`); await A.page.click('#delete-btn');
  await A.page.waitForSelector('.modal'); assert.match(await A.page.textContent('.modal'), /Only Team Leaders and Managers/);
  assert.equal(await A.page.locator('.modal [data-m-input]').count(), 0, 'no password box for Members');
  await A.page.click('[data-m-cancel]'); assert.ok(await read(id));
  await A.page.click('a.link-btn'); await A.page.waitForSelector('#view-home:not([hidden])');
});
await check('Delete: a Manager needs the TC Team Leader password; a wrong one deletes nothing', async () => {
  const id = safeId('22 Sample Road, Testville FL'), M = await openApp(browser, 'morgan.manager@totalchb.com');
  await M.page.click(`.prop-card[data-id="${id}"] .prop-title`); await M.page.click('#delete-btn');
  await M.page.waitForSelector('.modal [data-m-input][type="password"]');
  await M.page.fill('[data-m-input]', 'not-it'); await M.page.click('[data-m-ok]');
  await M.page.waitForSelector('[data-m-err]:not([hidden])'); assert.match(await M.page.textContent('[data-m-err]'), /not right/);
  assert.ok(await read(id), 'still there after a wrong password');
  await M.page.fill('[data-m-input]', 'sample-pass'); await M.page.click('[data-m-ok]');
  await M.page.waitForSelector('#view-home:not([hidden])'); assert.equal(await read(id), null);
  await A.page.waitForFunction(i => !document.querySelector(`.prop-card[data-id="${i}"]`), id, { timeout: 10000 });
  await M.page.click('#avatar-btn'); await M.page.click('[data-signout]'); await M.page.waitForSelector('#gate:not([hidden])'); await M.context.close();
});
await check('presence: same active_users records as before, both people counted', async () => {
  await A.page.waitForFunction(() => document.getElementById('active-count').textContent === '2', null, { timeout: 10000 });
  const p = await readPresence(), a = p.find(x => x.email === 'alex.tester@totalchb.com');
  assert.ok(a.sessions.dev_test_a.lastActive > 0); assert.equal(a.sessions.dev_test_a.type, 'Desktop');
  assert.equal(p.find(x => x.email === 'bea.sample@totalchb.com') ? 1 : 0, 1);
});
await check('Sign Out sets this device offline (lastActive 0) and returns to sign-in', async () => {
  await B.page.click('#avatar-btn'); await B.page.click('[data-signout]'); await B.page.waitForSelector('#gate:not([hidden])');
  const p = await readPresence(), b = p.find(x => x.email === 'bea.sample@totalchb.com');
  assert.ok(Object.values(b.sessions).every(s => s.lastActive === 0));
});
await check('a non-totalchb.com account is turned away', async () => {
  await B.page.evaluate(() => window.__emuSignIn('someone@gmail.com'));
  await B.page.waitForSelector('#auth-error:not([hidden])'); assert.match(await B.page.textContent('#auth-error'), /Access Denied/);
  assert.ok(await B.page.isHidden('#app'));
});
await check('no console errors', () => { const errs = [...A.errors, ...B.errors].filter(e => !/ERR_FAILED|net::|Failed to load resource/.test(e)); assert.deepEqual(errs, []); });

// ---------------------------------------------------------------- screenshots: light/dark x desktop/phone
console.log('\nScreens (light and dark, desktop and 390px phone)');
await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore(), mk = (addr, n, extra = {}) => { const r = legacyRecord(); r.address = addr; for (let i = 0; i < 79; i++) r.checks['chk_' + i] = i < n;
    r.updatedBy = 'morgan.manager@totalchb.com'; return setDoc(doc(f, CL(safeId(addr))), { ...r, ...extra }); };
  await mk('3150 Example Ave, Sampleton FL 00001', 41); await mk('9 Placeholder Ct, Mockville FL 00002', 79);
  await mk('48 Demo Blvd, Fakeburg FL 00003', 12, { status: 'closed', statusAt: Date.parse('2026-10-30T15:00:00Z'), statusBy: 'morgan.manager@totalchb.com',
    statusLog: [{ status: 'closed', at: Date.parse('2026-10-30T15:00:00Z'), by: 'morgan.manager@totalchb.com' }] });
});
const shots = [];
for (const theme of ['light', 'dark']) for (const [w, h, size] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
  await check(`${theme} ${size}: screens render with no sideways scroll`, async () => {
    const S = await openApp(browser, 'alex.tester@totalchb.com', { viewport: { width: w, height: h }, theme });
    const p = S.page, name = s => { const f = join(OUT, `${theme}-${size}-${s}.png`); shots.push(f); return f; };
    await p.waitForSelector('.prop-card'); await p.waitForTimeout(400);
    assert.ok(await noHScroll(p), 'home scrolls sideways'); await p.screenshot({ path: name('1-home') });
    await p.fill('#search', 'pat hoa'); await p.waitForTimeout(150); await p.screenshot({ path: name('2-search') }); await p.fill('#search', '');
    await p.click(`.prop-card[data-id="${lid}"] .prop-title`); await p.waitForSelector('#view-check:not([hidden])'); await p.waitForTimeout(300);
    assert.ok(await noHScroll(p), 'checklist scrolls sideways');
    await p.screenshot({ path: name('3-checklist') }); await p.screenshot({ path: name('4-checklist-full'), fullPage: true });
    await p.click('#status-btn'); await p.waitForTimeout(150); await p.screenshot({ path: name('5-status-menu') }); await p.keyboard.press('Escape');
    await p.click('#active-btn'); await p.waitForTimeout(150); await p.screenshot({ path: name('6-active-users') }); await p.keyboard.press('Escape');
    await p.click('#delete-btn'); await p.waitForSelector('.modal'); await p.waitForTimeout(150); await p.screenshot({ path: name('7-delete-confirm') }); await p.click('[data-m-cancel]');
    await p.click('#avatar-btn'); await p.click('[data-help]'); await p.waitForSelector('.help-panel h2[data-sec]'); await p.waitForTimeout(250); await p.screenshot({ path: name('7b-help') }); await p.keyboard.press('Escape');
    await p.click('a.link-btn'); await p.click('[data-tab="closed"]'); await p.click('.prop-card .prop-title'); await p.waitForSelector('#locked-note:not([hidden])'); await p.waitForTimeout(500);
    await p.screenshot({ path: name('8-closed') });
    await p.click('a.link-btn'); await p.click('#new-btn'); await p.waitForTimeout(150); await p.screenshot({ path: name('9-new-property') }); await p.click('[data-m-cancel]');
    const errs = S.errors.filter(e => !/ERR_FAILED|net::|Failed to load resource/.test(e)); assert.deepEqual(errs, []);
    await S.context.close();
  });
}
await check('sign-in and loading screens', async () => {
  for (const theme of ['light', 'dark']) for (const [w, h, size] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const S = await openApp(browser, null, { viewport: { width: w, height: h }, theme });
    await S.page.waitForSelector('#gate:not([hidden])'); await S.page.waitForTimeout(400);
    await S.page.screenshot({ path: join(OUT, `${theme}-${size}-0-sign-in.png`) });
    await S.page.evaluate(() => { const s = document.getElementById('splash'); s.hidden = false; s.classList.remove('out'); });
    await S.page.screenshot({ path: join(OUT, `${theme}-${size}-0-loading.png`) });
    await S.context.close();
  }
});
await A.context.close(); await B.context.close(); await browser.close(); await env.cleanup();

// ---------------------------------------------------------------- service worker: v1 devices pick up new versions
console.log('\nApp updates (service worker)');
async function swSite(port) {
  const dir = join(OUT, 'sw-site-' + port); mkdirSync(dir, { recursive: true });
  const oldSw = execSync(`git show ${ORIGINAL}:service_worker.js`, { cwd: ROOT, encoding: 'utf8' }).replace(/'https:\/\/raw[^']*',?\s*/g, '');
  // the old page only registers; the new one also checks for a newer worker straight away, as index.html now does
  const oldPage = v => `<!doctype html><title>${v}</title><body>${v}<script>navigator.serviceWorker.register('./service_worker.js')</script>`;
  const newPage = v => `<!doctype html><title>${v}</title><body>${v}<script>navigator.serviceWorker.register('./service_worker.js').then(r => r.update())</script>`;
  writeFileSync(join(dir, 'manifest.json'), '{}'); writeFileSync(join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dir, 'service_worker.js'), oldSw); writeFileSync(join(dir, 'index.html'), oldPage('OLD-VERSION'));
  const srv = await serve(dir, port);
  const b = await chromium.launch(), c = await b.newContext({ serviceWorkers: 'allow' }); await c.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  const p = await c.newPage(); await p.goto(`http://localhost:${port}/`);
  await p.waitForFunction(() => navigator.serviceWorker.ready.then(() => true)); await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  writeFileSync(join(dir, 'index.html'), newPage('NEW-VERSION'));
  await p.reload(); assert.match(await p.textContent('body'), /OLD-VERSION/, 'the old worker should be stuck on its cached copy (the bug)');
  writeFileSync(join(dir, 'service_worker.js'), readFileSync(join(ROOT, 'service_worker.js'), 'utf8'));
  return { dir, p, b, srv, newPage };
}
const v2Only = p => p.waitForFunction(async () => (await caches.keys()).join() === 'tchb-checklist-cache-v2', null, { timeout: 10000 });
await check('old-worker devices update on the browser\'s own daily check, then always get the newest page', async () => {
  const { dir, p, b, srv, newPage } = await swSite(5174);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));   // what the browser does about once a day
  await v2Only(p); await p.reload(); assert.match(await p.textContent('body'), /NEW-VERSION/);
  writeFileSync(join(dir, 'index.html'), newPage('NEWER-VERSION')); await p.reload(); assert.match(await p.textContent('body'), /NEWER-VERSION/);
  await b.close(); srv.close();
});
await check('or straight away after one hard reload (Ctrl+Shift+R)', async () => {
  const { p, b, srv } = await swSite(5175);
  const cdp = await p.context().newCDPSession(p); await cdp.send('Page.reload', { ignoreCache: true }); await p.waitForLoadState('load');
  assert.match(await p.textContent('body'), /NEW-VERSION/);
  await v2Only(p); await p.reload(); assert.match(await p.textContent('body'), /NEW-VERSION/);
  await b.close(); srv.close();
});
await check('offline: the last page still opens from the saved copy', async () => {
  const { p, b, srv } = await swSite(5176);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update())); await v2Only(p); await p.reload();
  srv.close(); await p.context().setOffline(true); await p.reload(); assert.match(await p.textContent('body'), /NEW-VERSION/);
  await b.close();
});

// ---------------------------------------------------------------- /api/team (hub names)
console.log('\nHub names function (/api/team)');
await (async () => {
  const crypto = await import('node:crypto');
  const { verifyIdToken, sign } = require(join(ROOT, 'api/_lib/hub.js'));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }), certs = { k1: pem };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), t = Math.floor(Date.now() / 1000);
  const jwt = (claims, kid = 'k1') => { const h = b64({ alg: 'RS256', kid }), p = b64({ aud: 'tc-1st-call-checklist', iss: 'https://securetoken.google.com/tc-1st-call-checklist', sub: 'u1', iat: t - 10, exp: t + 3000, email: 'alex.tester@totalchb.com', email_verified: true, ...claims });
    return h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey).toString('base64url'); };
  await check('accepts a verified @totalchb.com token for this project', async () => assert.equal(await verifyIdToken(jwt({}), { certs }), 'alex.tester@totalchb.com'));
  await check('rejects other domains, unverified, other projects, expired and forged tokens', async () => {
    for (const bad of [jwt({ email: 'x@gmail.com' }), jwt({ email_verified: false }), jwt({ aud: 'other' }), jwt({ exp: t - 5 }), jwt({}, 'nope'), jwt({}).slice(0, -4) + 'AAAA', 'junk'])
      await assert.rejects(verifyIdToken(bad, { certs }));
  });
  await check('signs hub requests exactly like the hub expects (api/_lib/titleagent.js)', () => {
    const body = '{}', ts = 1700000000, h = sign('s3cret', body, ts);
    assert.equal(h['X-Hub-Signature'], 'sha256=' + crypto.createHmac('sha256', 's3cret').update(ts + '.' + body).digest('hex'));
  });
  await check('departments to bring over come from HUB_TEAM_DEPTS (default TC and DISPO)', () => {
    const { deptsWanted } = require(join(ROOT, 'api/team.js'));
    assert.deepEqual(deptsWanted(undefined), ['TC', 'DISPO']); assert.deepEqual(deptsWanted(''), ['TC', 'DISPO']);
    assert.deepEqual(deptsWanted('tc, dispo,ACQ'), ['TC', 'DISPO', 'ACQ']); assert.deepEqual(deptsWanted('OPS'), ['OPS']);
    assert.deepEqual(deptsWanted('nonsense'), ['TC', 'DISPO']);
  });
  await check('handler: 401 without sign-in, 503 until the secret is set, then names (Managers, TC, DISPO) from the hub', async () => {
    const handler = require(join(ROOT, 'api/team.js'));
    const call = async (headers = {}) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
      await handler({ method: 'POST', headers }, res); return { code: res.statusCode, body: JSON.parse(res.body) }; };
    const realFetch = global.fetch; let hubCall = null;
    global.fetch = async (url, init) => {
      if (String(url).includes('securetoken')) return { ok: true, json: async () => certs };
      hubCall = { url, init }; return { ok: true, json: async () => ({ people: [{ name: 'Alex Tester', email: 'Alex.Tester@totalchb.com', role: 'manager', dept: 'TC', photo: '' }] }) };
    };
    try {
      assert.equal((await call()).code, 401);
      delete process.env.HUB_SYNC_SECRET; assert.equal((await call({ authorization: 'Bearer ' + jwt({}) })).code, 503);
      process.env.HUB_SYNC_SECRET = 'test-secret';
      const r = await call({ authorization: 'Bearer ' + jwt({}) });
      assert.equal(r.code, 200); assert.deepEqual(r.body.people, [{ name: 'Alex Tester', email: 'alex.tester@totalchb.com', photo: '', role: 'manager', dept: 'TC' }]);
      assert.equal(hubCall.url, 'https://hub.totalchb.com/api/title-agent/team');
      const ts = hubCall.init.headers['X-Hub-Timestamp'];
      assert.equal(hubCall.init.body, '{"depts":["TC","DISPO"]}');
      assert.equal(hubCall.init.headers['X-Hub-Signature'], 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(ts + '.' + hubCall.init.body).digest('hex'));
    } finally { global.fetch = realFetch; delete process.env.HUB_SYNC_SECRET; }
  });
})();

console.log(`\n${passed} passed, ${failed} failed. Screenshots: ${shots.length + 8} in tests/out/`);
process.exit(failed ? 1 : 0);
