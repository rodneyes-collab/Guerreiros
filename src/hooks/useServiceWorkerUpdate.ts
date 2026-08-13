import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function useServiceWorkerUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('SW Registered:', swUrl, r);
      if (r) {
        setRegistration(r);
        // Periodically check for updates every 3 minutes
        const interval = setInterval(() => {
          r.update().catch(err => console.warn('SW update check failed:', err));
        }, 3 * 60 * 1000);

        // Check on window focus
        const onFocus = () => {
          r.update().catch(err => console.warn('SW update check on focus failed:', err));
        };
        window.addEventListener('focus', onFocus);

        return () => {
          clearInterval(interval);
          window.removeEventListener('focus', onFocus);
        };
      }
    },
    onRegisterError(error) {
      console.log('SW Registration error:', error);
      setError(error as Error);
    },
  });

  return {
    needRefresh,
    setNeedRefresh,
    offlineReady,
    setOfflineReady,
    updateServiceWorker,
    registration,
    error,
  };
}
