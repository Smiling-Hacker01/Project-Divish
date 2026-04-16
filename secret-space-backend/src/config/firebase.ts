import admin from 'firebase-admin';
import logger from './logger';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (projectId && clientEmail && privateKey) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    logger.info('[Firebase] Admin SDK initialized');
  }
} else {
  logger.warn('[Firebase] Missing config — push notifications will fail');
}

export default admin;
