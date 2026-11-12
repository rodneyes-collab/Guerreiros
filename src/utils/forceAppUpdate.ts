import { APP_VERSION } from '../../constants';
import { db, doc, setDoc, serverTimestamp } from '../../firebase';

/**
 * Registra o disparo da atualização crítica no Firestore para auditoria remota.
 */
async function logUpdateTriggerToFirestore(serverVersion: string) {
  try {
    const logId = `update_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const userEmail = typeof window !== 'undefined' ? localStorage.getItem('simpleLoginEmail') : 'unknown';
    
    await setDoc(doc(db, 'system_audit_logs', logId), {
      type: 'CRITICAL_UPDATE_TRIGGERED',
      runningVersion: (window as any).__RUNNING_APP_VERSION__ || APP_VERSION,
      targetVersion: serverVersion,
      bundleVersion: APP_VERSION,
      userAgent: navigator.userAgent,
      userEmail,
      timestamp: serverTimestamp(),
      localStorageMark: localStorage.getItem('guerreiros_app_version'),
      sessionStorageMark: sessionStorage.getItem('guerreiros_confirmed_version')
    });
  } catch (e) {
    console.warn('[AppUpdate] Falha ao registrar log de auditoria no Firestore:', e);
  }
}

export async function forceAppUpdate(serverVersion?: string) {
  console.log('[AppUpdate] INITIALIZING ABSOLUTE PURGE - FORCING VERSION UPDATE...');
  
  if (serverVersion) {
    await logUpdateTriggerToFirestore(serverVersion);
  }
  
  try {
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[AppUpdate] Unregistered SW:', registration.scope);
      }
    }
    
    // 2. Clear ALL cache storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log('[AppUpdate] Purged cache:', name);
      }
    }

    // 3. Clear IndexedDB (Firestore local cache)
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name) {
            indexedDB.deleteDatabase(dbInfo.name);
            console.log('[AppUpdate] Deleted IndexedDB:', dbInfo.name);
          }
        }
      } catch (idbErr) {
        console.warn('[AppUpdate] Non-fatal IndexedDB cleanup error:', idbErr);
      }
    }

    // 4. Comprehensive Storage Cleanup (LocalStorage & SessionStorage)
    const authKeys = ['emailForSignIn', 'simpleLoginEmail', 'hasBiometricsLinked', 'firebase:auth:'];
    
    const purgeStorage = (storage: Storage) => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && !authKeys.some(ak => key.includes(ak))) {
          keys.push(key);
        }
      }
      keys.forEach(k => storage.removeItem(k));
    };

    if (typeof window !== 'undefined') {
      if (window.localStorage) purgeStorage(window.localStorage);
      if (window.sessionStorage) purgeStorage(window.sessionStorage);
    }
    
    console.log('[AppUpdate] All storages purged successfully.');

  } catch (e) {
    console.error('[AppUpdate] Critical error during cleanup:', e);
  } finally {
    // 5. Hard Reload with multiple cache-busting layers
    console.log('[AppUpdate] Triggering hard reload with cache-bust...');
    
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('v_update', APP_VERSION);
    url.searchParams.set('bust', Date.now().toString());
    url.searchParams.set('nocache', 'true');
    
    // Using replace to prevent going back to stale version
    window.location.replace(url.toString());
    
    // Fallback if replace is somehow blocked
    setTimeout(() => {
      window.location.href = url.toString();
    }, 500);
  }
}
