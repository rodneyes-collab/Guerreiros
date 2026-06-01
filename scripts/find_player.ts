import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

async function findPlayer() {
  const playersCol = collection(db, 'players');
  const snapshot = await getDocs(playersCol);
  console.log(`=== PLAYERS IN DATABASE (Total: ${snapshot.size}) ===`);
  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`- ${data.name} (ID: ${doc.id}, Email: ${data.email || 'N/A'}, Gender: ${data.gender})`);
  });
}

findPlayer().catch(console.error);
