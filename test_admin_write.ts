
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

async function test() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  console.log("Initializing firebase-admin with project:", firebaseConfig.projectId);
  
  try {
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    
    const db = admin.firestore();
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
       // Note: In some versions of firebase-admin, you set databaseId in initializeApp or use another method
       // For this test, we'll try to just write to the default and see if it works
    }
    
    console.log("Attempting to write with Admin SDK...");
    const res = await db.collection('test_admin_write').add({
      time: Date.now(),
      server: true
    });
    console.log("Success! ID:", res.id);
  } catch (e) {
    console.error("Admin SDK Error:", e);
  }
}

test();
