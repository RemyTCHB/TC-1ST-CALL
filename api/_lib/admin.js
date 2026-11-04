// firebase-admin for TC Checklist's own Firebase project, used only by /api/login-as (Remy's Login As User).
// Vercel setting (name only): TC_FIREBASE_SERVICE_ACCOUNT, the whole JSON key of a service account in the
// tc-1st-call-checklist project. Without it, Login As User answers 503 and nothing else changes.
// Local tests use the Firebase Auth emulator instead (FIREBASE_AUTH_EMULATOR_HOST), which is never honoured on Vercel.
const { PROJECT_ID } = require('./hub');

let cached = null;
function admin(env = process.env) {
  if (cached) return cached;
  const fb = require('firebase-admin');
  const existing = fb.apps.find(a => a && a.name === 'tc');
  if (existing) return (cached = existing);
  if (env.FIREBASE_AUTH_EMULATOR_HOST && !env.VERCEL) {
    return (cached = fb.initializeApp({ projectId: env.GCLOUD_PROJECT || 'demo-tc-checklist' }, 'tc'));
  }
  let key; try { key = JSON.parse(env.TC_FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { return null; }
  if (!key || key.project_id !== PROJECT_ID || !key.private_key || !key.client_email) return null;   // only this project's key
  return (cached = fb.initializeApp({ credential: fb.credential.cert(key), projectId: PROJECT_ID }, 'tc'));
}

module.exports = { admin };
