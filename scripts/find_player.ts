import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

async function findPlayer() {
  const playersCol = collection(db, 'players');
  const snapshot = await getDocs(playersCol);
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name && data.name.toLowerCase().includes('karina')) {
      console.log(`ID: ${doc.id}, Name: ${data.name}`);
    }
  });
}

findPlayer().catch(console.error);
