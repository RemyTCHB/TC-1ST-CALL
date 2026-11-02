// POST /api/team: who is who, from the Universal Team Hub's team directory.
// The page sends the signed-in person's Firebase ID token. This checks it (verified @totalchb.com only), then asks the hub
// through the endpoint the Title Commitment Agent already uses (POST /api/title-agent/team, signed with the shared secret).
// Vercel settings for this project (names only):
//   HUB_SYNC_SECRET  the hub's shared secret (the same value as the hub's TITLE_AGENT_SYNC_SECRET)
//   HUB_TEAM_URL     optional, default https://hub.totalchb.com/api/title-agent/team
// Without HUB_SYNC_SECRET it answers 503 and the page shows names from email addresses instead. Logs counts only.
const { verifyIdToken, sign, slim } = require('./_lib/hub');

const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, people: null };

const send = (res, code, body) => {
  res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { await verifyIdToken(token); } catch (e) { return send(res, 401, { error: 'Sign in with your @totalchb.com account.' }); }
  const secret = process.env.HUB_SYNC_SECRET;
  if (!secret) return send(res, 503, { error: 'Team names are not connected yet.' });
  if (cache.people && Date.now() - cache.at < CACHE_MS) return send(res, 200, { people: cache.people });
  try {
    const body = '{}';
    const r = await fetch(process.env.HUB_TEAM_URL || 'https://hub.totalchb.com/api/title-agent/team', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(secret, body) }, body });
    if (!r.ok) { console.error('hub team: status ' + r.status); return send(res, 502, { error: 'The hub did not answer.' }); }
    const people = slim((await r.json()).people);
    cache = { at: Date.now(), people };
    console.log('hub team: ' + people.length + ' people');
    send(res, 200, { people });
  } catch (e) {
    console.error('hub team failed: ' + (e && e.name));
    send(res, 502, { error: 'The hub did not answer.' });
  }
};
