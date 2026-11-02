// Runs the checks: starts a local web server for the page, then the Firebase emulators (demo project, made-up data),
// and runs suite.mjs inside them. Usage: cd tests && npm install && npm test
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const FAKE_TEAM = JSON.stringify({ people: [{ name: 'Alex Tester', email: 'alex.tester@totalchb.com', photo: '' }, { name: 'Morgan Manager', email: 'morgan.manager@totalchb.com', photo: '' }] });

const srv = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/team') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(FAKE_TEAM); }
  const file = join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file.includes('/tests/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
});
srv.listen(5173, '127.0.0.1', () => {
  const p = spawn('npx', ['firebase', 'emulators:exec', '--project', 'demo-tc-checklist', '--only', 'auth,firestore', 'node suite.mjs'],
    { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] });
  // emulator chatter is hidden; the suite's own lines are shown
  const show = d => String(d).split('\n').filter(l => /^\s*(pass|FAIL)|^\s{8}|passed, |^[A-Z][a-zA-Z /()'.,0-9-]+$|Error|error:/.test(l) && !/^i\s|emulators|Emulator|⚠|✔/.test(l)).forEach(l => console.log(l));
  p.stdout.on('data', show); p.stderr.on('data', show);
  p.on('exit', code => { srv.close(); process.exit(code); });
});
