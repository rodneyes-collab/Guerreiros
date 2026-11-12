import { db, doc, updateDoc, getDocFromServer } from './firebase';

async function forceUpdateVersion() {
  const TARGET_VERSION = '3.9.0';
  try {
    const sysRef = doc(db, 'metadata', 'system');
    const sysSnap = await getDocFromServer(sysRef);
    const currentData = sysSnap.exists() ? sysSnap.data() : {};
    
    console.log(`Current version in Firestore: ${currentData.appVersion || 'N/A'}`);
    
    if (currentData.appVersion !== TARGET_VERSION) {
      const nextBuild = (currentData.versionNumber || 0) + 1;
      await updateDoc(sysRef, {
        appVersion: TARGET_VERSION,
        versionNumber: nextBuild,
        lastUpdated: Date.now()
      });
      console.log(`Successfully updated Firestore version to ${TARGET_VERSION} (Build ${nextBuild})`);
    } else {
      console.log(`Firestore version is already ${TARGET_VERSION}. No update needed.`);
    }
  } catch (err) {
    console.error('Error updating version:', err);
  }
}

forceUpdateVersion();
