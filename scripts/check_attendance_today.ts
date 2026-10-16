import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function check() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const dateKey = '2026-10-01'; // Assuming today is 2026-10-01 based on logs
  console.log(`--- ATTENDANCE FOR ${dateKey} ---`);
  const attSnap = await getDocs(collection(db, 'attendance', dateKey, 'players'));
  attSnap.forEach(doc => {
    const data = doc.data();
    console.log(`${data.name} | ID: ${doc.id} | Status: ${data.status}`);
  });
}

check().then(() => process.exit(0));
