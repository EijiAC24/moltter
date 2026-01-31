import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App | undefined;
let db: Firestore | undefined;

function getAdminApp(): App {
  if (!app && getApps().length === 0) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return app || getApps()[0];
}

export function getAdminDb(): Firestore {
  if (!db) {
    db = getFirestore(getAdminApp());
  }
  return db;
}
