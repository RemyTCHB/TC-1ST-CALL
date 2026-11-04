// POST /api/login-as: Remy signs in as a team member to check their view (photo menu → Login As User), and
// { back: true } from that borrowed sign-in returns him to his own account without Google (Back To Remy).
// The same as the Team Hub's /api/hub/login-as. Only Remy, never from a borrowed sign-in. The person is signed in with a
// one-time Firebase sign-in marked imp: Remy's email, so Remy sees and changes exactly what they can; the page saves
// updatedVia: Remy's email next to updatedBy while he's viewing as them. Logs no names or emails.
const { admin } = require('./_lib/admin');
const { jsonBody, send } = require('./_lib/hub');

const ADMIN = 'systems@totalchb.com';
const lower = v => String(v || '').trim().toLowerCase();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const app = admin();
  if (!app) return send(res, 503, { error: 'Login As User is not set up yet.' });
  let claims;
  try { claims = await app.auth().verifyIdToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); }
  catch (e) { return send(res, 401, { error: 'Sign in again.' }); }
  let body; try { body = await jsonBody(req) || {}; } catch (e) { return send(res, 400, { error: 'Not JSON.' }); }
  const email = lower(claims.email);

  // Back To Remy: only a sign-in Remy started (it carries imp: his email) can take him back to his own account.
  if (body.back === true) {
    if (lower(claims.imp) !== ADMIN) return send(res, 403, { error: 'Not a Login As session.' });
    try {
      const remy = await app.auth().getUserByEmail(ADMIN);
      const token = await app.auth().createCustomToken(remy.uid);
      console.log('tc login-as: back');
      return send(res, 200, { token });
    } catch (e) {
      console.error('tc login-as back failed', e.code || '');
      return send(res, 500, { error: 'Could not switch back. Sign in with Google.' });
    }
  }

  if (claims.email_verified !== true || email !== ADMIN || claims.imp) return send(res, 403, { error: 'Only Remy can do this.' });
  const target = lower(body.email);
  if (!/^[^@\s/]+@totalchb\.com$/.test(target) || target === ADMIN) return send(res, 400, { error: 'Which team member?' });
  try {
    let user;
    try { user = await app.auth().getUserByEmail(target); }
    catch (e) { if (e.code === 'auth/user-not-found') return send(res, 404, { error: 'They have not signed in to TC Checklist yet, so there is no account to open.' }); throw e; }
    if (user.disabled) return send(res, 403, { error: 'That account is turned off.' });
    const token = await app.auth().createCustomToken(user.uid, { imp: email });
    console.log('tc login-as: ok');
    send(res, 200, { token });
  } catch (e) {
    console.error('tc login-as failed', e.code || '');
    send(res, 500, { error: 'Could not sign in as them. Try again.' });
  }
};
