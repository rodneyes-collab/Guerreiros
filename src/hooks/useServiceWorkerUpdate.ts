import { useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function useServiceWorkerUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker: updateSW,
  } = useRegisterSW({
    onNeedRefresh() {
      console.log('[SWUpdate] New version detected!');
    },
    onRegisteredSW(swUrl, r) {
      if (r) {
        setRegistration(r);
        // Periodically check for updates every 10 minutes
        const interval = setInterval(() => {
          r.update().catch(err => console.warn('SW periodic update check failed:', err));
        }, 10 * 60 * 1000);

        return () => clearInterval(interval);
      }
    },
    onRegisterError(error) {
      console.error('SW Registration error:', error);
      setError(error as Error);
    },
  });

  const applyUpdate = useCallback(async () => {
    console.log('[SWUpdate] Applying service worker update...');
    try {
      await updateSW(true);
    } catch (e) {
      console.error('[SWUpdate] Failed to update service worker:', e);
      window.location.reload();
    }
  }, [updateSW]);

  return {
    needRefresh,
    setNeedRefresh,
    offlineReady,
    setOfflineReady,
    updateServiceWorker: applyUpdate,
    registration,
    error,
  };
}
