import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function check() {
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
      console.log(`PLAYER: ${p.name} | Status: ${data.status} | isDM: ${data.isDM}`);
    } else {
      console.log(`${p.name} not found`);
    }
  }
}

check().then(() => process.exit(0));
