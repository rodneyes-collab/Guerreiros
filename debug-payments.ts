import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

async function run() {
  const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  console.log(`Payments count: ${snap.size}`);
  if (snap.size > 0) {
      console.log('Sample payment:', snap.docs[0].data());
  }
}
run().catch(console.error);
