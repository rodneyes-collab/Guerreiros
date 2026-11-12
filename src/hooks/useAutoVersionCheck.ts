import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../constants';
import { forceAppUpdate } from '../utils/forceAppUpdate';
import { useStore } from '../../store';
import { diagnosticLogService } from '../services/diagnosticLogService';

export function useAutoVersionCheck() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const firestoreAppVersion = useStore(state => state.systemMetadata?.appVersion);

  // Helper para comparar versões (ex: "3.9.0" > "3.3.8")
  const isNewerVersion = (current: string, incoming: string) => {
    const c = current.split('.').map(Number);
    const i = incoming.split('.').map(Number);
    for (let x = 0; i.length > x || c.length > x; x++) {
      const cv = c[x] || 0;
      const iv = i[x] || 0;
      if (iv > cv) return true;
      if (iv < cv) return false;
    }
    return false;
  };

  useEffect(() => {
    // 1. If we are running the expected version, commit it to localStorage and sessionStorage
    const storedVersion = localStorage.getItem('guerreiros_app_version');
    const confirmedVersion = sessionStorage.getItem('guerreiros_confirmed_version');
    
    // Set global running version for index.html check
    (window as any).__RUNNING_APP_VERSION__ = APP_VERSION;

    if (storedVersion !== APP_VERSION || confirmedVersion !== APP_VERSION) {
      diagnosticLogService.log('info', `Committed successful version load: v${APP_VERSION}`, {
        previousStored: storedVersion,
        previousConfirmed: confirmedVersion
      });
      localStorage.setItem('guerreiros_app_version', APP_VERSION);
      sessionStorage.setItem('guerreiros_confirmed_version', APP_VERSION);
    }

    // 2. Check for mismatch in Firestore metadata
    if (firestoreAppVersion && isNewerVersion(APP_VERSION, firestoreAppVersion)) {
      setServerVersion(firestoreAppVersion);
      setHasNewVersion(true);
      
      const sessionUpdateKey = `update_attempt_${firestoreAppVersion}`;
      const alreadyAttemptedInSession = sessionStorage.getItem(sessionUpdateKey);
      
      if (!alreadyAttemptedInSession) {
        sessionStorage.setItem(sessionUpdateKey, 'true');
        diagnosticLogService.log('warn', `Versão Firestore (v${firestoreAppVersion}) > Local (v${APP_VERSION}). Disparando atualização forçada...`);
        forceAppUpdate(firestoreAppVersion);
      }
    } else if (firestoreAppVersion && firestoreAppVersion !== APP_VERSION) {
      // Se a versão do Firestore for menor que a atual, apenas limpamos o flag de nova versão se estiver ativo
      setHasNewVersion(false);
      console.log(`[VersionCheck] Firestore version (v${firestoreAppVersion}) is older or equal to current (v${APP_VERSION}). Update skipped.`);
    }
  }, [firestoreAppVersion]);

  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?v=${Date.now()}&r=${Math.random()}`, {
          cache: 'no-store',
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version && isMounted) {
            setServerVersion(data.version);
            if (data.version && isNewerVersion(APP_VERSION, data.version)) {
              diagnosticLogService.log('version_check', `Versão API (v${data.version}) difere do App (v${APP_VERSION})`);
              setHasNewVersion(true);
              
              const lastUpdateAttempt = localStorage.getItem('last_auto_update_target');
              if (lastUpdateAttempt !== data.version) {
                diagnosticLogService.log('update_attempt', `Disparando atualização automática para v${data.version}`);
                localStorage.setItem('last_auto_update_target', data.version);
                setTimeout(() => {
                  forceAppUpdate(data.version);
                }, 2000);
              }
            } else {
              setHasNewVersion(false);
            }
          }
        }
      } catch (err) {
        // Silent fail if offline
        diagnosticLogService.log('error', 'Falha ao checar versão via API (offline ou erro de rede)', err);
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {
    hasNewVersion,
    serverVersion,
    currentVersion: APP_VERSION,
    forceUpdate: forceAppUpdate
  };
}
