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
  signOut,
  User 
} from 'firebase/auth';
import { getFirestore, collection, doc, updateDoc, onSnapshot, setDoc, deleteDoc, getDoc, getDocFromServer, getDocs, writeBatch, increment, query, where, orderBy, arrayUnion, addDoc, serverTimestamp, collectionGroup } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
let isQuotaExceeded = false;
const SYNC_INTERVAL = 30000; // 30 segundos

export const getFirestoreDateKey = () => {
  // Use Brazil time (UTC-3) for consistent date keys across all users
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brTime = new Date(utc + (3600000 * -3));
  
  const year = brTime.getUTCFullYear();
  const month = String(brTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getBrazilDay = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brTime = new Date(utc + (3600000 * -3));
  return brTime.getUTCDay();
};

export const trackUsage = async (reads: number, writes: number) => {
  if (isQuotaExceeded) return; // Para de tentar se a quota foi excedida

  pendingReads += reads;
  pendingWrites += writes;

  const now = Date.now();
  if (now - lastSyncTime < SYNC_INTERVAL && pendingWrites < 50) {
    return;
  }

  const readsToSync = pendingReads;
  const writesToSync = pendingWrites;
  pendingReads = 0;
  pendingWrites = 0;
  lastSyncTime = now;

  const today = getFirestoreDateKey();
  const usageRef = doc(db, 'metadata', 'usage');
  try {
    await updateDoc(usageRef, {
      reads: increment(readsToSync),
      writes: increment(writesToSync),
      lastUpdate: today
    });
  } catch (e: any) {
    if (e?.code === 'resource-exhausted') {
      isQuotaExceeded = true;
      console.error('Quota do Firestore excedida. Rastreamento desativado até o próximo carregamento.');
      return;
    }
    try {
      // Se o documento não existir, cria um novo
      await setDoc(usageRef, {
        reads: readsToSync,
        writes: writesToSync,
        lastUpdate: today
      }, { merge: true });
    } catch (err: any) {
      if (err?.code === 'resource-exhausted') {
        isQuotaExceeded = true;
      }
      console.error('Erro crítico ao rastrear uso:', err);
      // Devolve os valores para tentar novamente na próxima
      pendingReads += readsToSync;
      pendingWrites += writesToSync;
    }
  }
};

export const trackAIUsage = async (calls: number) => {
  if (isQuotaExceeded) return;

  const today = getFirestoreDateKey();
  const usageRef = doc(db, 'metadata', 'usage');
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
};

export { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged, 
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
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
