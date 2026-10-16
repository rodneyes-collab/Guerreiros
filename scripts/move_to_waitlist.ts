import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function fix() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const players = [
    { id: '3d1624dc-44cd-4186-81c2-a88ed2a198da', name: 'Marcelo' },
    { id: 'ac45d7ad-29c1-42d5-aa0c-17b2d7157e5d', name: 'Dea Patricia' }
  ];

  const dateKey = '2026-10-01';

  for (const p of players) {
    // 1. Set to waitlist in players collection
    const pRef = doc(db, 'players', p.id);
    console.log(`Setting ${p.name} to waitlist in players collection`);
    await updateDoc(pRef, { status: 'waitlist' });

    // 2. Set to left in today's attendance
    const attRef = doc(db, 'attendance', dateKey, 'players', p.id);
    console.log(`Setting ${p.name} to left in attendance for ${dateKey}`);
    await updateDoc(attRef, { status: 'left' });
  }
}

fix().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
