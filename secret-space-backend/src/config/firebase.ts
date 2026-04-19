import admin from 'firebase-admin';
import logger from './logger';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && rawKey) {
  // Env vars from .env files or Render may contain literal "\n" (two chars: backslash + n).
  // We must convert them to real newline characters for the PEM to parse correctly.
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      logger.info('[Firebase] Admin SDK initialized successfully');
    } catch (err: any) {
      logger.error({ err: err.message }, '[Firebase] Failed to initialize Admin SDK');
    }
  }
} else {
  logger.warn({
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!rawKey,
  }, '[Firebase] Missing config — push notifications will be disabled');
}

export default admin;
