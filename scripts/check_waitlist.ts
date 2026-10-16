import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function check() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("=== WAITLIST PLAYERS ===");
  const playersSnap = await getDocs(collection(db, 'players'));
  playersSnap.forEach(doc => {
    const data = doc.data();
    if (data.status === 'waitlist' || data.status === 'lista_espera' || data.status === 'waiting') {
      console.log(`- ${data.name} (ID: ${doc.id}, Status: ${data.status})`);
    }
  });
}

check().then(() => process.exit(0));
