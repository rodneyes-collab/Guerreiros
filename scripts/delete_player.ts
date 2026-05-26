import { doc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';

async function deletePlayer(name: string) {
  const playersCol = collection(db, 'players');
  const q = query(playersCol, where('name', '==', name));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log(`No player found with name: ${name}`);
    return;
  }
  
  snapshot.forEach(async (d) => {
    await deleteDoc(doc(db, 'players', d.id));
    console.log(`Deleted player: ${d.data().name} (ID: ${d.id})`);
  });
}

deletePlayer('Karina Japa').catch(console.error);
