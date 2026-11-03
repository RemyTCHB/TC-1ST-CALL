// POST /api/delete-check: may this person delete a property, and is their password right?
// The page sends the person's Firebase ID token. This checks it (verified @totalchb.com only), then asks the Universal
// Team Hub, where the delete passwords live (HUB_DELETE_PASSWORDS, hub repo api/_lib/tcchecklist.js):
//   body {"ask": true}          → { need: 'confirm' | 'password', own }   or 403 { error } (Members can't delete)
//   body {"password": "..."}    → { ok: true }   or 403 { error, wrong } / 503 { error }
// Passwords are never logged, stored or sent back. Needs HUB_SYNC_SECRET (as for names).
const { verifyIdToken, hubPost, jsonBody, send } = require('./_lib/hub');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  let email;
  try { email = await verifyIdToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); }
  catch (e) { return send(res, 401, { error: 'Sign in with your @totalchb.com account.' }); }
  let b; try { b = await jsonBody(req); } catch (e) { return send(res, 400, { error: 'Not JSON.' }); }
  const ask = !!(b && b.ask), password = typeof (b && b.password) === 'string' ? b.password.slice(0, 200) : '';
  try {
    const r = await hubPost('/api/tc-checklist/delete-check', ask ? { email, ask: true } : { email, password });
    const out = {};
    for (const k of ['need', 'own', 'ok', 'error', 'wrong']) if (k in r.body) out[k] = r.body[k];
    if (r.status >= 500 && !out.error) out.error = 'The Team Hub did not answer. Try again in a moment.';
    console.log('delete-check: ' + r.status);
    send(res, r.status === 401 ? 502 : r.status, out);
  } catch (e) {
    console.error('delete-check failed: ' + (e && e.name));
    send(res, 502, { error: 'The Team Hub did not answer. Try again in a moment.' });
  }
};
