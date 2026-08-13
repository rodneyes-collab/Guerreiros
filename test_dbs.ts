
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";
import path from "path";

async function test() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  const app = initializeApp(firebaseConfig);
  
  const dbs = ['(default)', firebaseConfig.firestoreDatabaseId];
  
  for (const dbId of dbs) {
    console.log(`--- Testing Database: ${dbId} ---`);
    const db = getFirestore(app, dbId);
    try {
      const q = query(collection(db, 'players'), limit(1));
      const snap = await getDocs(q);
      console.log(`Players count: ${snap.size}`);
      if (snap.size > 0) {
        console.log(`Example player: ${snap.docs[0].data().name}`);
      }
    } catch (e) {
      console.error(`Error in ${dbId}:`, e.message);
    }
  }
}

test();
