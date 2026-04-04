import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);

async function check() {
  try {
    const db1 = getFirestore(app, config.firestoreDatabaseId);
    const snap1 = await getDocs(collection(db1, 'players'));
    console.log(`Current DB (${config.firestoreDatabaseId}): ${snap1.size} players`);
  } catch (e) {
    console.log(`Current DB error: ${e.message}`);
  }

  try {
    const db2 = getFirestore(app); // default
    const snap2 = await getDocs(collection(db2, 'players'));
    console.log(`Default DB: ${snap2.size} players`);
  } catch (e) {
    console.log(`Default DB error: ${e.message}`);
  }
}
check();
