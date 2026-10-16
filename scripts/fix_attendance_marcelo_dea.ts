import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function fix() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const dateKey = '2026-10-01'; // Assuming today is 2026-10-01
  const players = [
    { id: '3d1624dc-44cd-4186-81c2-a88ed2a198da', name: 'Marcelo' },
    { id: 'ac45d7ad-29c1-42d5-aa0c-17b2d7157e5d', name: 'Dea Patricia' }
  ];

  for (const p of players) {
    const attRef = doc(db, 'attendance', dateKey, 'players', p.id);
    console.log(`Fixing ${p.name} in attendance: setting status to active`);
    await updateDoc(attRef, { status: 'active' });
  }
}

fix().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
