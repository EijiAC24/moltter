import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

let app: App | undefined;
let db: Firestore | undefined;
let storage: Storage | undefined;

function getAdminApp(): App {
  if (!app && getApps().length === 0) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
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

export function getAdminStorage(): Storage {
  if (!storage) {
    storage = getStorage(getAdminApp());
  }
  return storage;
}
