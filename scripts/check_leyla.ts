import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

async function check() {
  const snap = await getDocs(collection(db, 'players'));
  console.log('Total players:', snap.size);
  snap.forEach(d => {
    const p = d.data();
    if (p.name && p.name.toLowerCase().includes('leyla')) {
      console.log('Found Leyla:', { id: d.id, name: p.name, email: p.email, status: p.status, isDM: p.isDM });
    }
  });
}

check().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
