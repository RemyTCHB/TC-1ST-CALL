// Helpers for /api/team: check the caller's Firebase sign-in, and sign requests to the Universal Team Hub.
// No packages needed: Node's own crypto checks the Google-signed token, and fetch talks to the hub.
const crypto = require('crypto');

const PROJECT_ID = 'tc-1st-call-checklist';
const DOMAIN = '@totalchb.com';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const b64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let certCache = { at: 0, certs: null };
async function googleCerts(fetchImpl = fetch) {
  if (certCache.certs && Date.now() - certCache.at < 60 * 60 * 1000) return certCache.certs;
  const r = await fetchImpl(CERTS_URL);
  if (!r.ok) throw new Error('certs ' + r.status);
  certCache = { at: Date.now(), certs: await r.json() };
  return certCache.certs;
}

/** Checks a Firebase ID token the way Firebase documents it (RS256, Google's keys, this project, not expired) and that
 *  the person is a verified @totalchb.com account. Returns the email, or throws. */
async function verifyIdToken(token, { projectId = PROJECT_ID, certs, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = JSON.parse(b64url(parts[0]).toString('utf8')), payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');
  const keys = certs || await googleCerts(), pem = keys[header.kid];
  if (!pem) throw new Error('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey(pem), b64url(parts[2]));
  if (!ok) throw new Error('bad signature');
  if (payload.aud !== projectId || payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('wrong project');
  if (!(payload.exp > nowSec) || !(payload.iat <= nowSec + 60) || !payload.sub) throw new Error('expired');
  const email = String(payload.email || '').toLowerCase();
  if (payload.email_verified !== true || !email.endsWith(DOMAIN)) throw new Error('not allowed');
  return email;
}

// The hub's shared-secret signature (hub repo, api/_lib/titleagent.js): HMAC-SHA256 of "<unix seconds>.<raw body>".
function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
  return { 'X-Hub-Timestamp': String(ts), 'X-Hub-Signature': 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex') };
}

/** Only what this app uses: name, email, photo, and the hub role and department (which guides Help shows). */
const ROLES = ['manager', 'lead', 'member'];
const slim = people => (Array.isArray(people) ? people : []).filter(p => p && p.email)
  .map(p => ({ name: String(p.name || '').trim(), email: String(p.email).toLowerCase(), photo: String(p.photo || ''),
    role: ROLES.includes(p.role) ? p.role : 'member', dept: String(p.dept || '').toUpperCase() }));

module.exports = { verifyIdToken, sign, slim, PROJECT_ID };
