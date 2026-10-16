import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

async function run() {
  const snap = await getDocs(collection(db, 'payments'));
  console.log(`Payments count: ${snap.size}`);
  snap.docs.slice(0, 5).forEach(doc => {
      console.log('Sample payment:', doc.id, doc.data());
  });
}
run().catch(console.error);
