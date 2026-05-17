import * as dotenv from 'dotenv';
import path from 'path';

// Load directly from the .env file in the backend folder
dotenv.config({ path: path.join(__dirname, '.env') });

import admin from './src/config/firebase';

console.log('Firebase configure attempt complete.');
console.log('Admin apps length:', admin.apps.length);
if (admin.apps.length === 0) {
  console.log('Firebase config is invalid.');
} else {
  console.log('Firebase config is VALID.');
}
