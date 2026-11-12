import { db, doc, getDocFromServer } from './firebase';

async function checkVersion() {
  try {
    const sysSnap = await getDocFromServer(doc(db, 'metadata', 'system'));
    if (sysSnap.exists()) {
      console.log('--- FIRESTORE VERSION DATA ---');
      console.log(JSON.stringify(sysSnap.data(), null, 2));
      console.log('------------------------------');
    } else {
      console.log('Metadata/system does not exist in Firestore.');
    }
  } catch (err) {
    console.error('Error checking version:', err);
  }
}

checkVersion();
