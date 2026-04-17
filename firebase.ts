import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  EmailAuthProvider,
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged, 
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInAnonymously,
  signOut,
  User 
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, collection, doc, updateDoc, onSnapshot, setDoc, deleteDoc, getDoc, getDocFromServer, getDocs, writeBatch, increment, query, where, orderBy, arrayUnion, addDoc, serverTimestamp, collectionGroup } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from './firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Initialize Firebase Cloud Messaging and get a reference to the service
export const messaging = typeof window !== 'undefined' && 'Notification' in window ? getMessaging(app) : null;

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code == 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable persistence');
  }
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const emailProvider = new EmailAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let pendingReads = 0;
let pendingWrites = 0;
let lastSyncTime = 0;
let cachedLastUpdate: string | null = null; // Cache local para evitar getDoc desnecessário
let currentPlayerId: string | null = null;
let cachedPlayerLastUpdate: string | null = null;
let isQuotaExceeded = false;
const SYNC_INTERVAL = 60000; // Aumentado para 60s para máxima economia, já que a lógica está corrigida

export const setCurrentPlayerId = (id: string | null) => {
  if (id !== currentPlayerId) {
    currentPlayerId = id;
    cachedPlayerLastUpdate = null;
  }
};

export const trackAccess = async () => {
  if (!currentPlayerId || isQuotaExceeded) return;
  const today = getFirestoreDateKey();
  const playerRef = doc(db, 'players', currentPlayerId);
  try {
    await updateDoc(playerRef, {
      accesses: increment(1),
      lastReadUpdate: today
    });
    console.log(`[Usage] Acesso registrado para o sócio: ${currentPlayerId}`);
  } catch (e) {
    // Se falhar porque o campo não existe ou doc não existe, tenta setDoc
    try {
      await setDoc(playerRef, { accesses: 1, lastReadUpdate: today }, { merge: true });
    } catch (err) {
      console.warn('Erro ao rastrear acesso:', err);
    }
  }
};

export const getFirestoreDateKey = (date?: Date) => {
  const now = date || new Date();
  
  // Format the date strictly in Brazilian Timezone (America/Sao_Paulo)
  // This avoids any local timezone or UTC offsets bugs
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // en-CA format returns YYYY-MM-DD
  return formatter.format(now);
};

export const getBrazilDay = () => {
  const now = new Date();
  // A bulletproof way to get 0-6 day of week in Brazil
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short'
  }).formatToParts(now);
  
  const dayName = parts.find(p => p.type === 'weekday')?.value;
  const days: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return days[dayName || 'Sun'] || 0;
};

export const trackUsage = async (reads: number, writes: number) => {
  if (isQuotaExceeded) return;

  pendingReads += reads;
  pendingWrites += writes;

  const now = Date.now();
  const today = getFirestoreDateKey();
  
  // Se mudou o dia (comparando com a data da última sincronização), força o sync
  const lastSyncDate = lastSyncTime > 0 ? getFirestoreDateKey(new Date(lastSyncTime)) : null;
  const isNewDay = lastSyncDate && today !== lastSyncDate;

  if (!isNewDay && now - lastSyncTime < SYNC_INTERVAL && pendingWrites < 10 && pendingReads < 50) {
    return;
  }

  const readsToSync = pendingReads;
  const writesToSync = pendingWrites;
  pendingReads = 0;
  pendingWrites = 0;
  lastSyncTime = now;

  const monthKey = today.slice(0, 7);
  const usageRef = doc(db, 'metadata', 'usage');
  const monthlyUsageRef = doc(db, 'metadata', `usage_${monthKey}`);
  const playerRef = currentPlayerId ? doc(db, 'players', currentPlayerId) : null;

  try {
    // Sincronização do Sócio (Individual)
    if (playerRef) {
      try {
        if (cachedPlayerLastUpdate === today) {
          await updateDoc(playerRef, {
            reads: increment(readsToSync),
            writes: increment(writesToSync),
            lastReadUpdate: today
          });
        } else {
          const playerSnap = await getDoc(playerRef);
          const playerData = playerSnap.exists() ? playerSnap.data() : null;
          const shouldResetPlayer = !playerData || !playerData.lastReadUpdate || (playerData.lastReadUpdate < today);

          if (shouldResetPlayer) {
            await setDoc(playerRef, {
              reads: readsToSync,
              writes: writesToSync,
              lastReadUpdate: today
            }, { merge: true });
          } else {
            await updateDoc(playerRef, {
              reads: increment(readsToSync),
              writes: increment(writesToSync),
              lastReadUpdate: today
            });
          }
          cachedPlayerLastUpdate = today;
        }
      } catch (err) {
        console.warn('Erro ao atualizar uso do sócio:', err);
      }
    }

    // Se já sabemos que o documento de hoje existe, apenas incrementamos (0 leituras, 1 escrita)
    if (cachedLastUpdate === today) {
      await updateDoc(usageRef, {
        reads: increment(readsToSync),
        writes: increment(writesToSync),
        lastUpdate: today
      });
      console.log(`[Usage] Sincronizado: +${readsToSync}R, +${writesToSync}W (Cache)`);
    } else {
      // Caso contrário, verificamos uma única vez (1 leitura)
      const usageSnap = await getDoc(usageRef);
      const currentData = usageSnap.exists() ? usageSnap.data() : null;

      // SÓ RESETAMOS se o dia no banco for ANTERIOR ao dia atual de Brasília
      const shouldReset = !currentData || (currentData.lastUpdate < today);

      if (shouldReset) {
        console.log(`[Usage] Novo dia detectado (${today}). Resetando contadores.`);
        await setDoc(usageRef, {
          reads: readsToSync,
          writes: writesToSync,
          aiCalls: 0,
          lastUpdate: today
        }, { merge: true });
      } else if (currentData.lastUpdate === today) {
        // Mesmo dia: incrementamos
        await updateDoc(usageRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync),
          lastUpdate: today
        });
        console.log(`[Usage] Sincronizado: +${readsToSync}R, +${writesToSync}W (DB Sync)`);
      } else {
        // Caso raro: o dia no banco é FUTURO (ex: alguém em fuso horário muito adiantado)
        await updateDoc(usageRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync)
        });
        console.log(`[Usage] Sincronizado em data futura: ${currentData.lastUpdate}`);
      }
      cachedLastUpdate = today;
    }
  } catch (e: any) {
    if (e?.code === 'resource-exhausted') {
      isQuotaExceeded = true;
      console.error('Quota do Firestore excedida.');
      return;
    }
    // Fallback silencioso para não interromper o app
    console.warn('Erro ao atualizar uso diário:', e);
  }

  try {
    await updateDoc(monthlyUsageRef, {
      reads: increment(readsToSync),
      writes: increment(writesToSync),
      lastUpdate: today
    });
  } catch (e: any) {
    if (e.code === 'not-found') {
      await setDoc(monthlyUsageRef, { reads: readsToSync, writes: writesToSync, aiCalls: 0, lastUpdate: today });
    }
  }
};

export const trackAIUsage = async (calls: number) => {
  if (isQuotaExceeded) return;

  const today = getFirestoreDateKey();
  const monthKey = today.slice(0, 7);
  const usageRef = doc(db, 'metadata', 'usage');
  const monthlyUsageRef = doc(db, 'metadata', `usage_${monthKey}`);

  try {
    await updateDoc(usageRef, {
      aiCalls: increment(calls),
      lastUpdate: today
    });
  } catch (e: any) {
    try {
      await setDoc(usageRef, {
        aiCalls: calls,
        lastUpdate: today
      }, { merge: true });
    } catch (err) {
      console.error('Erro ao rastrear uso de IA:', err);
    }
  }

  try {
    await updateDoc(monthlyUsageRef, {
      aiCalls: increment(calls),
      lastUpdate: today
    });
  } catch (e: any) {
    if (e.code === 'not-found') {
      await setDoc(monthlyUsageRef, { reads: 0, writes: 0, aiCalls: calls, lastUpdate: today });
    }
  }
};

export { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged, 
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInAnonymously,
  signOut,
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  getDocFromServer, 
  getDocs, 
  writeBatch, 
  increment, 
  query, 
  where, 
  orderBy, 
  arrayUnion,
  addDoc,
  serverTimestamp,
  collectionGroup
};
export type { User };

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
