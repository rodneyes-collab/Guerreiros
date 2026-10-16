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
  User,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc as updateDoc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  getDocFromServer, 
  getDocs, 
  getDocsFromServer, 
  writeBatch, 
  increment, 
  query, 
  where, 
  orderBy, 
  arrayUnion, 
  addDoc, 
  serverTimestamp, 
  collectionGroup, 
  limit, 
  setLogLevel, 
  enableIndexedDbPersistence,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  clearIndexedDbPersistence, 
  enableNetwork, 
  disableNetwork,
  deleteField 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase with persistence-friendly settings
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error('[Firebase] Init error:', e);
  app = getApp();
}

// Silencia logs internos do Firestore SDK para evitar ruído
if (typeof window !== 'undefined') {
  try {
    setLogLevel('error');
  } catch (e) {}
}

// Multi-Tab Persistence Setup for Firebase 11
let dbInstance;
// Prioriza o banco customizado se definido
const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

if (typeof window !== 'undefined') {
  try {
    const settings = {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      }),
      experimentalForceLongPolling: true
    };
    dbInstance = dbId ? initializeFirestore(app, settings, dbId) : initializeFirestore(app, settings);
  } catch (e) {
    console.warn('[Firestore] Modern persistence init skipped or already initialized, using existing instance:', e);
    dbInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
} else {
  dbInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db = dbInstance;
export const auth = getAuth(app);
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' && 'Notification' in window ? getMessaging(app) : null;

// Persistence Auth
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Firebase Auth] Failed to configure persistence:', err);
  });
}

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
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code;

  if (code === 'resource-exhausted' || message.includes('bandwidth for writes') || message.includes('quota exceeded')) {
    isQuotaExceeded = true;
    console.error('[Firestore] Quota exceeded! Disabling background writes.');
  }

  const errInfo: FirestoreErrorInfo = {
    error: message,
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
export let isQuotaExceeded = false;
const SYNC_INTERVAL = 600000; // Aumentado para 10 minutos para máxima economia de banda e escrita

export const setCurrentPlayerId = (id: string | null) => {
  if (id !== currentPlayerId) {
    currentPlayerId = id;
    cachedPlayerLastUpdate = null;
  }
};

export const trackAccess = async (overridePlayerId?: string) => {
  if (isQuotaExceeded) return;
  const targetId = overridePlayerId || currentPlayerId;
  if (!targetId || isQuotaExceeded) {
    if (!targetId && auth.currentUser) {
      try {
        const email = auth.currentUser.email;
        const uid = auth.currentUser.uid;
        const playersRef = collection(db, 'players');
        let q = query(playersRef, where('uid', '==', uid), limit(1));
        let snap = await getDocs(q);
        let foundId: string | null = null;
        if (!snap.empty) {
          foundId = snap.docs[0].id;
        } else if (email) {
          q = query(playersRef, where('email', '==', email.trim().toLowerCase()), limit(1));
          snap = await getDocs(q);
          if (!snap.empty) {
            foundId = snap.docs[0].id;
          }
        }
        if (foundId) {
          currentPlayerId = foundId;
          return trackAccess(foundId);
        }
      } catch (err) {
        console.warn('[trackAccess] Failed fallback player lookup:', err);
      }
    }
    return;
  }

  const today = getFirestoreDateKey();
  const playerRef = doc(db, 'players', targetId);
  try {
    const playerSnap = await getDoc(playerRef);
    const playerData = playerSnap.exists() ? playerSnap.data() : null;
    const isNewDay = !playerData || !playerData.lastReadUpdate || playerData.lastReadUpdate < today;

    console.log(`[trackAccess] Initing track for ${targetId}. isNewDay: ${isNewDay}`);

    const now = new Date().toISOString();
    const loginHistory = playerData?.loginHistory || [];
    
    // Avoid duplicate recording if called within 30 seconds
    if (loginHistory.length > 0) {
      const lastLoginTime = new Date(loginHistory[0]).getTime();
      if (!isNaN(lastLoginTime) && Date.now() - lastLoginTime < 30000) {
        console.log('[trackAccess] Skipping duplicate access within 30s');
        return;
      }
    }
    
    const newHistory = [now, ...loginHistory].slice(0, 20);
    const currentAccesses = Number(playerData?.accesses || 0);

    const batch = writeBatch(db);
    let batchSize = 0;

    if (isNewDay) {
      batch.update(playerRef, {
        accesses: currentAccesses + 1,
        dailyAccesses: 1,
        lastReadUpdate: today,
        lastLoginAt: now,
        loginHistory: newHistory
      });
    } else {
      const currentDaily = Number(playerData?.dailyAccesses || 0);
      batch.update(playerRef, {
        accesses: currentAccesses + 1,
        dailyAccesses: currentDaily + 1,
        lastReadUpdate: today,
        lastLoginAt: now,
        loginHistory: newHistory
      });
    }
    batchSize++;

    // Incrementar o contador global de acessos também
    const usageRef = doc(db, 'metadata', 'usage');
    batch.set(usageRef, {
      accesses: increment(1)
    }, { merge: true });
    batchSize++;

    console.log(`[trackAccess] Enviando lote de acesso (${targetId}): ${batchSize} operações.`);
    await batch.commit();

    console.log(`[Usage] Acesso registrado para o sócio: ${targetId} (Dia: ${isNewDay ? 1 : 'inc'}) às ${now}`);
  } catch (e: any) {
    if (e?.code === 'resource-exhausted' || e?.message?.includes('bandwidth for writes')) {
      isQuotaExceeded = true;
      console.error('[Firestore] Quota exceeded in trackAccess.');
      return;
    }
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(playerRef, { 
        accesses: 1, 
        dailyAccesses: 1, 
        lastReadUpdate: today,
        lastLoginAt: now,
        loginHistory: [now]
      }, { merge: true });
      batch.set(doc(db, 'metadata', 'usage'), {
        accesses: increment(1)
      }, { merge: true });
      await batch.commit();
      console.log(`[Usage] Acesso registrado via lote fallback para o sócio: ${targetId}`);
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

/**
 * Returns the date key (YYYY-MM-DD) for the next upcoming Thursday.
 * If today is Thursday, it returns today.
 */
export const getNextThursday = () => {
  const todayStr = getFirestoreDateKey();
  const [y, m, d] = todayStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = getBrazilDay();
  
  let diff = 4 - day;
  if (diff < 0) diff += 7;
  
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  const batch = writeBatch(db);
  let batchSize = 0;

  try {
    // Sincronização do Sócio (Individual)
    if (playerRef) {
      if (cachedPlayerLastUpdate === today) {
        batch.update(playerRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync),
          totalReads: increment(readsToSync),
          totalWrites: increment(writesToSync),
          lastReadUpdate: today
        });
        batchSize++;
      } else {
        const playerSnap = await getDoc(playerRef);
        const playerData = playerSnap.exists() ? playerSnap.data() : null;
        const shouldResetPlayer = !playerData || !playerData.lastReadUpdate || (playerData.lastReadUpdate < today);

        if (shouldResetPlayer) {
          batch.set(playerRef, {
            reads: readsToSync,
            writes: writesToSync,
            totalReads: increment(readsToSync),
            totalWrites: increment(writesToSync),
            lastReadUpdate: today
          }, { merge: true });
        } else {
          batch.update(playerRef, {
            reads: increment(readsToSync),
            writes: increment(writesToSync),
            totalReads: increment(readsToSync),
            totalWrites: increment(writesToSync),
            lastReadUpdate: today
          });
        }
        batchSize++;
        cachedPlayerLastUpdate = today;
      }
    }

    // Se já sabemos que o documento de hoje existe, apenas incrementamos
    if (cachedLastUpdate === today) {
      batch.update(usageRef, {
        reads: increment(readsToSync),
        writes: increment(writesToSync),
        lastUpdate: today
      });
      batchSize++;
      console.log(`[Usage] Batching: +${readsToSync}R, +${writesToSync}W (Cache)`);
    } else {
      const usageSnap = await getDoc(usageRef);
      const currentData = usageSnap.exists() ? usageSnap.data() : null;
      const shouldReset = !currentData || (currentData.lastUpdate < today);

      if (shouldReset) {
        console.log(`[Usage] Novo dia detectado (${today}). Arquivando e resetando contadores.`);
        if (currentData && currentData.lastUpdate) {
          const historyRef = doc(db, 'usage_history', currentData.lastUpdate);
          batch.set(historyRef, {
            ...currentData,
            archivedAt: serverTimestamp()
          }, { merge: true });
          batchSize++;
        }

        batch.set(usageRef, {
          reads: readsToSync,
          writes: writesToSync,
          aiCalls: 0,
          accesses: 0,
          lastUpdate: today
        }, { merge: true });
        batchSize++;
      } else if (currentData.lastUpdate === today) {
        batch.update(usageRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync),
          lastUpdate: today
        });
        batchSize++;
        console.log(`[Usage] Batching: +${readsToSync}R, +${writesToSync}W (DB Sync)`);
      } else {
        batch.update(usageRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync)
        });
        batchSize++;
      }
      cachedLastUpdate = today;
    }

    // Monthly usage
    batch.set(monthlyUsageRef, {
      reads: increment(readsToSync),
      writes: increment(writesToSync),
      lastUpdate: today
    }, { merge: true });
    batchSize++;

    if (batchSize > 0) {
      console.log(`[trackUsage] Enviando lote de uso: ${batchSize} operações.`);
      await batch.commit();
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
};

export const trackAIUsage = async (calls: number) => {
  if (isQuotaExceeded) return;

  const today = getFirestoreDateKey();
  const monthKey = today.slice(0, 7);
  const usageRef = doc(db, 'metadata', 'usage');
  const monthlyUsageRef = doc(db, 'metadata', `usage_${monthKey}`);

  try {
    const batch = writeBatch(db);
    batch.set(usageRef, {
      aiCalls: increment(calls),
      lastUpdate: today
    }, { merge: true });
    
    batch.set(monthlyUsageRef, {
      aiCalls: increment(calls),
      lastUpdate: today
    }, { merge: true });

    await batch.commit();
    console.log(`[trackAIUsage] Uso de IA registrado: ${calls} chamadas.`);
  } catch (e: any) {
    console.warn('Erro ao rastrear uso de IA:', e);
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
  limit,
  arrayUnion,
  addDoc,
  serverTimestamp,
  collectionGroup,
  clearIndexedDbPersistence,
  getDocsFromServer,
  deleteField,
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
};
export type { User };

// Test connection
async function testConnection() {
  // Se o navegador estiver offline ou se estivermos em um ambiente de build headless/sandbox,
  // evita registrar erro fatal de configuração para não quebrar a compilação do container.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn("Dispositivo offline. Operando em modo de cache local.");
    return;
  }

  try {
    // Adiciona um timeout curto para falhar rápido caso a rede pública não esteja acessível do container
    const checkPromise = getDocFromServer(doc(db, 'test', 'connection'));
    await Promise.race([
      checkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('the client is offline') || errMsg.includes('timeout') || errMsg.includes('Could not reach')) {
      console.warn("Verificação de conexão com Firebase expirou ou está offline. Operando em modo cache local.");
    } else {
      console.error("Please check your Firebase configuration.", error);
    }
  }
}
// testConnection();
