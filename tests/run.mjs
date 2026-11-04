// Runs the checks: starts a local web server for the page, then the Firebase emulators (demo project, made-up data),
// and runs suite.mjs inside them. Usage: cd tests && npm install && npm test
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const TYPES = { '.pdf': 'application/pdf', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const FAKE_PEOPLE = [{ name: 'Alex Tester', email: 'alex.tester@totalchb.com', photo: '', role: 'member', dept: 'TC' },
  { name: 'Morgan Manager', email: 'morgan.manager@totalchb.com', photo: '', role: 'manager', dept: '' },
  { name: 'Lee Leader', email: 'lee.leader@totalchb.com', photo: '', role: 'lead', dept: 'TC' }];
const FAKE_TEAM = JSON.stringify({ people: FAKE_PEOPLE });
// Stand-ins for the server functions that ask the Team Hub. Made-up passwords only; the real ones never leave the hub.
const FAKE_PASSWORD = 'sample-pass';
const roleFromAuth = req => {   // the emulator's sign-in token names the person (not checked here: local tests only)
  try { const email = JSON.parse(Buffer.from(String(req.headers.authorization || '').split('.')[1], 'base64url')).email;
    return (FAKE_PEOPLE.find(p => p.email === email) || { role: 'member' }).role; } catch (e) { return 'member'; } };
const readJson = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); });
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

const srv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/team') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(FAKE_TEAM); }
  if (url.pathname === '/api/delete-check') {
    const role = roleFromAuth(req), b = await readJson(req);
    if (role === 'member') return json(res, 403, { error: 'Only Team Leaders and Managers can delete a property. Mark it Cancelled instead.' });
    if (b.ask) return json(res, 200, { need: 'password', own: false });
    return b.password === FAKE_PASSWORD ? json(res, 200, { ok: true }) : json(res, 403, { error: 'That password is not right.', wrong: true });
  }
  if (url.pathname === '/api/passwords') {
    const role = roleFromAuth(req);
    return json(res, 200, role === 'member' ? { rows: [], own: [], confirmOnly: false }
      : { rows: [{ dept: 'TC', lead: FAKE_PASSWORD }], own: role === 'manager' ? [{ name: 'Sample Owner', pw: 'sample-own' }] : [], confirmOnly: false });
  }
  const file = join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file.includes('/tests/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
});
srv.listen(5173, '127.0.0.1', () => {
  const script = process.argv[2] || 'suite.mjs';
  const p = spawn('npx', ['firebase', 'emulators:exec', '--project', 'demo-tc-checklist', '--only', 'auth,firestore', 'node ' + script],
    { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] });
  // emulator chatter is hidden; the suite's own lines are shown
  const keep = l => process.env.VERBOSE ? !/^i\s|emulators|Emulator/.test(l)
    : /^\s*(pass|FAIL)|^\s{8}|passed, |^[A-Z][a-zA-Z /()'.,0-9-]+$|Error|error:/.test(l) && !/^i\s|emulators|Emulator|⚠|✔/.test(l);
  const show = d => String(d).split('\n').filter(keep).forEach(l => console.log(l));   // VERBOSE=1 shows everything
  p.stdout.on('data', show); p.stderr.on('data', show);
  p.on('exit', code => { srv.close(); process.exit(code); });
});
