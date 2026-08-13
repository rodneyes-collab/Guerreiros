
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

async function test() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app); // Default
  
  console.log("Attempting to write to a test collection...");
  try {
    const docRef = await addDoc(collection(db, 'test_write'), {
      time: Date.now()
    });
    console.log("Success! ID:", docRef.id);
  } catch (e) {
    console.error("Error writing to test_write:", e);
  }
}

test();
