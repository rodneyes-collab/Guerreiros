import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

async function run() {
  const snap = await getDocs(collection(db, 'matches'));
  const today = '2026-09-03';
  const startOfDay = new Date('2026-09-03T00:00:00-03:00').getTime();
  
  let fixed = 0;
  for (const matchDoc of snap.docs) {
    const data = matchDoc.data();
    if (data.timestamp >= startOfDay && data.date === '2026-08-27') {
      console.log(`Fixing match ${matchDoc.id}, was ${data.date}`);
      await updateDoc(doc(db, 'matches', matchDoc.id), {
        date: today
      });
      fixed++;
    }
  }
  console.log(`Fixed ${fixed} matches to date ${today}`);
}
run().catch(console.error);
