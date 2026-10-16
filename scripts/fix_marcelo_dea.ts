import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';
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

  for (const p of players) {
    const pRef = doc(db, 'players', p.id);
    const snap = await getDoc(pRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.status === 'waitlist') {
        console.log(`Fixing ${p.name}: moving from waitlist to active`);
        await updateDoc(pRef, { status: 'active' });
      } else {
        console.log(`${p.name} is already ${data.status}`);
      }
    } else {
      console.log(`${p.name} (ID: ${p.id}) not found`);
    }
  }
}

fix().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
