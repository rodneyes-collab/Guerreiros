const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  try {
    console.log("Checking metadata/intentions...");
    const intentionsSnap = await getDoc(doc(db, 'metadata', 'intentions'));
    if (intentionsSnap.exists()) {
      console.log("metadata/intentions data:", JSON.stringify(intentionsSnap.data(), null, 2));
    } else {
      console.log("metadata/intentions does not exist.");
    }

    const dates = ['2026-10-14', '2026-10-15', '2026-10-16'];
    for (const date of dates) {
      console.log(`\nChecking preConfirmations/${date}/players...`);
      const snap = await getDocs(collection(db, 'preConfirmations', date, 'players'));
      console.log(`Found ${snap.size} players in preConfirmations/${date}/players:`);
      snap.forEach(d => {
        const data = d.data();
        const time = data.timestamp ? new Date(data.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : 'No timestamp';
        console.log(` - ${d.id}: ${data.name || 'No name'} (Time: ${time})`);
      });
    }
  } catch (err) {
    console.error("Error checking intentions:", err);
  }
  process.exit(0);
}

check();
