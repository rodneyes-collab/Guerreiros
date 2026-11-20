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
  updateDoc, 
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
  memoryLocalCache,
  CACHE_SIZE_UNLIMITED,
  clearIndexedDbPersistence, 
  enableNetwork, 
  disableNetwork,
  deleteField 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase App
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error('[Firebase] Init error:', e);
  app = getApp();
}

// Silencia logs internos verbosos do Firestore SDK (inclusive reconexões de stream ocioso gRPC/WebChannel)
try {
  setLogLevel('silent');
} catch (e) {}

export type FirestorePersistenceMode = 'bounded' | 'memory' | 'unlimited';

/**
 * Define 'memory' como padrão absoluto para garantir sincronia 100% em tempo real
 * entre Celular (PWA), Bot WhatsApp e AI Studio, evitando filas travadas no IndexedDB.
 */
export const getFirestorePersistenceMode = (): FirestorePersistenceMode => {
  if (typeof window === 'undefined' || !window.localStorage) return 'memory';
  const saved = window.localStorage.getItem('guerreiros_firestore_persistence_mode');
  if (saved === 'memory' || saved === 'bounded' || saved === 'unlimited') return saved;
  return 'memory';
};

export const purgeFirestoreLocalStorageKeys = (): number => {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let count = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (
        k.includes('firestore_targets_') || 
        k.includes('firebaseLocalStorage') || 
        k.includes('firestore_client_side_state') || 
        k.includes('volleyclub-manager')
      )) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      window.localStorage.removeItem(k);
      count++;
    });
  } catch (err) {
    console.warn('[Firestore] Erro ao expurgar chaves do LocalStorage:', err);
  }
  return count;
};

export const setFirestorePersistenceMode = (mode: FirestorePersistenceMode): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem('guerreiros_firestore_persistence_mode', mode);
  purgeFirestoreLocalStorageKeys();
  window.location.reload();
};

let dbInstance;
export let isMemoryFallbackActive = true;

// TRAVA UNIFICADA DE BANCO DE DADOS (Idêntica ao server.ts):
// Conecta Frontend, Backend e Cloud Run ao banco (default) do projeto volleyclub-manager,
// evitando o teto rígido de 50.000 leituras diárias do banco 'ai-studio-*' (free tier database).
export const ACTIVE_FIRESTORE_DB_ID: string | undefined =
  (firebaseConfig.firestoreDatabaseId &&
    firebaseConfig.firestoreDatabaseId !== '(default)' &&
    !firebaseConfig.firestoreDatabaseId.startsWith('ai-studio-'))
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

if (typeof window !== 'undefined') {
  const currentMode = getFirestorePersistenceMode();
  purgeFirestoreLocalStorageKeys();

  let localCacheSetting;
  if (currentMode === 'bounded') {
    isMemoryFallbackActive = false;
    localCacheSetting = persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: 10 * 1024 * 1024 // 10 MB
    });
  } else if (currentMode === 'unlimited') {
    isMemoryFallbackActive = false;
    localCacheSetting = persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED
    });
  } else {
    isMemoryFallbackActive = true;
    localCacheSetting = memoryLocalCache();
  }

  try {
    const settings = { localCache: localCacheSetting };
    dbInstance = ACTIVE_FIRESTORE_DB_ID
      ? initializeFirestore(app, settings, ACTIVE_FIRESTORE_DB_ID)
      : initializeFirestore(app, settings);
  } catch (e: any) {
    isMemoryFallbackActive = true;
    try {
      const memSettings = { localCache: memoryLocalCache() };
      dbInstance = ACTIVE_FIRESTORE_DB_ID
        ? initializeFirestore(app, memSettings, ACTIVE_FIRESTORE_DB_ID)
        : initializeFirestore(app, memSettings);
    } catch (fallbackErr) {
      dbInstance = ACTIVE_FIRESTORE_DB_ID
        ? getFirestore(app, ACTIVE_FIRESTORE_DB_ID)
        : getFirestore(app);
    }
  }

  window.addEventListener('online', () => {
    if (dbInstance) {
      enableNetwork(dbInstance).catch(() => {});
    }
  });
} else {
  dbInstance = ACTIVE_FIRESTORE_DB_ID
    ? getFirestore(app, ACTIVE_FIRESTORE_DB_ID)
    : getFirestore(app);
}

export const db = dbInstance;
export const auth = getAuth(app);
export const storage = getStorage(app);

let messagingInstance: ReturnType<typeof getMessaging> | null = null;
if (
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window
) {
  try {
    messagingInstance = getMessaging(app);
  } catch {
    messagingInstance = null;
  }
}
export const messaging = messagingInstance;

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

export const resetFirestoreNetworkSession = async (): Promise<void> => {
  if (typeof window === 'undefined' || !db) return;
  try {
    await disableNetwork(db);
    purgeFirestoreLocalStorageKeys();
    await enableNetwork(db);
  } catch (err) {
    try {
      await enableNetwork(db);
    } catch (e) {}
  }
};

export function isFirestoreQuotaError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  const code = (error as any)?.code;
  return (
    code === 'resource-exhausted' ||
    message.includes('quota limit exceeded') ||
    message.includes('quota exceeded') ||
    message.includes('free daily read units') ||
    message.includes('bandwidth for writes') ||
    message.includes('quotaexceedederror') ||
    message.includes('maximum bandwidth')
  );
}

export const markQuotaExceeded = (): void => {
  if (!isQuotaExceeded) {
    isQuotaExceeded = true;
    console.warn('[Firestore] Cota diária excedida. Pausando reconexões e leituras automáticas.');
  }
  if (typeof window !== 'undefined' && db) {
    disableNetwork(db).catch(() => {});
  }
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code;

  if (isFirestoreQuotaError(error)) {
    markQuotaExceeded();
    return;
  }

  if (code === 'unavailable' || message.includes('unavailable') || message.includes('Could not reach Cloud Firestore backend') || message.includes('client is offline')) {
    console.warn('[Firestore Connection Handled] Oscilação temporária de rede:', message);
    return;
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
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let pendingReads = 0;
let pendingWrites = 0;
let lastSyncTime = 0;
let cachedLastUpdate: string | null = null;
let currentPlayerId: string | null = null;
let cachedPlayerLastUpdate: string | null = null;
let lastAccessTrackTime = 0;
export let isQuotaExceeded = false;
const SYNC_INTERVAL = 600000; // 10 minutos

export const setCurrentPlayerId = (id: string | null) => {
  if (id !== currentPlayerId) {
    currentPlayerId = id;
    cachedPlayerLastUpdate = null;
  }
};

export const trackAccess = async (overridePlayerId?: string) => {
  if (isQuotaExceeded) return;
  if (Date.now() - lastAccessTrackTime < 60000) return;
  lastAccessTrackTime = Date.now();

  const targetId = overridePlayerId || currentPlayerId;
  if (!targetId) return;

  const today = getFirestoreDateKey();
  const playerRef = doc(db, 'players', targetId);
  try {
    const playerSnap = await getDoc(playerRef);
    const playerData = playerSnap.exists() ? playerSnap.data() : null;
    const isNewDay = !playerData || !playerData.lastReadUpdate || playerData.lastReadUpdate < today;

    const now = new Date().toISOString();
    const loginHistory = playerData?.loginHistory || [];
    
    if (loginHistory.length > 0) {
      const lastLoginTime = new Date(loginHistory[0]).getTime();
      if (!isNaN(lastLoginTime) && Date.now() - lastLoginTime < 60000) {
        return;
      }
    }
    
    const newHistory = [now, ...loginHistory].slice(0, 20);
    const currentAccesses = Number(playerData?.accesses || 0);
    const currentDaily = Number(playerData?.dailyAccesses || 0);

    const batch = writeBatch(db);
    batch.set(playerRef, {
      accesses: currentAccesses + 1,
      dailyAccesses: isNewDay ? 1 : currentDaily + 1,
      lastReadUpdate: today,
      lastLoginAt: now,
      loginHistory: newHistory
    }, { merge: true });

    batch.set(doc(db, 'metadata', 'usage'), {
      accesses: increment(1)
    }, { merge: true });

    await batch.commit();
  } catch (e: any) {
    if (isFirestoreQuotaError(e)) {
      markQuotaExceeded();
    }
  }
};

export const getFirestoreDateKey = (date?: Date) => {
  const now = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
};

export const getBrazilDay = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short'
  }).formatToParts(now);
  
  const dayName = parts.find(p => p.type === 'weekday')?.value;
  const days: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return days[dayName || 'Sun'] || 0;
};

export const getNextThursday = () => {
  const todayStr = getFirestoreDateKey();
  const [y, m, d] = todayStr.split('-').map(Number);
  // Usa meio-dia UTC para evitar desvios de fuso horário local entre diferentes celulares e o servidor
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = getBrazilDay();
  
  let diff = 4 - day;
  if (diff < 0) diff += 7;
  
  date.setUTCDate(date.getUTCDate() + diff);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

export const trackUsage = async (reads: number, writes: number) => {
  if (isQuotaExceeded) return;

  pendingReads += reads;
  pendingWrites += writes;

  const now = Date.now();
  const today = getFirestoreDateKey();
  const lastSyncDate = lastSyncTime > 0 ? getFirestoreDateKey(new Date(lastSyncTime)) : null;
  const isNewDay = lastSyncDate && today !== lastSyncDate;

  if (!isNewDay && now - lastSyncTime < SYNC_INTERVAL && pendingWrites < 20 && pendingReads < 100) {
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
        batch.set(playerRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync),
          totalReads: increment(readsToSync),
          totalWrites: increment(writesToSync),
          lastReadUpdate: today
        }, { merge: true });
        batchSize++;
        cachedPlayerLastUpdate = today;
      }
    }

    if (cachedLastUpdate === today) {
      batch.set(usageRef, {
        reads: increment(readsToSync),
        writes: increment(writesToSync),
        lastUpdate: today
      }, { merge: true });
      batchSize++;
    } else {
      const usageSnap = await getDoc(usageRef);
      const currentData = usageSnap.exists() ? usageSnap.data() : null;
      const shouldReset = !currentData || (currentData.lastUpdate < today);

      if (shouldReset) {
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
      } else {
        batch.set(usageRef, {
          reads: increment(readsToSync),
          writes: increment(writesToSync),
          lastUpdate: today
        }, { merge: true });
        batchSize++;
      }
      cachedLastUpdate = today;
    }

    batch.set(monthlyUsageRef, {
      reads: increment(readsToSync),
      writes: increment(writesToSync),
      lastUpdate: today
    }, { merge: true });
    batchSize++;

    if (batchSize > 0) {
      await batch.commit();
    }
  } catch (e: any) {
    if (isFirestoreQuotaError(e)) {
      markQuotaExceeded();
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
  } catch (e: any) {}
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
  enableNetwork,
  disableNetwork,
  getDocsFromServer,
  deleteField,
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  getToken,
  onMessage
};
export type { User };