// POST /api/passwords: the delete passwords this person may see in Help (Managers: the TC Team Leader password and
// anyone's own; Team Leaders who see TC: the TC one; Members: none). Checks the person's sign-in, then asks the
// Universal Team Hub (hub repo api/_lib/tcchecklist.js). Never cached or logged; the page keeps them in memory only.
const { verifyIdToken, hubPost, send } = require('./_lib/hub');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  let email;
  try { email = await verifyIdToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); }
  catch (e) { return send(res, 401, { error: 'Sign in with your @totalchb.com account.' }); }
  try {
    const r = await hubPost('/api/tc-checklist/passwords', { email });
    if (r.status !== 200) { console.error('passwords: hub ' + r.status); return send(res, r.status === 503 ? 503 : 502, { error: r.body.error || 'Could not load the passwords.' }); }
    const rows = (r.body.rows || []).map(x => ({ dept: String(x.dept || ''), lead: String(x.lead || '') }));
    const own = (r.body.own || []).map(x => ({ name: String(x.name || ''), pw: String(x.pw || '') }));
    console.log(`passwords: ${rows.length} departments, ${own.length} own`);
    send(res, 200, { rows, own, confirmOnly: !!r.body.confirmOnly });
  } catch (e) {
    console.error('passwords failed: ' + (e && e.name));
    send(res, 502, { error: 'Could not load the passwords.' });
  }
};
