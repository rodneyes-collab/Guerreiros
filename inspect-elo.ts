import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

async function run() {
  const snap = await getDocs(collection(db, 'players'));
  if (snap.size > 0) {
    const p = snap.docs[0].data();
    console.log(p.eloHistory.slice(0, 5));
  }
}
run().catch(console.error);
