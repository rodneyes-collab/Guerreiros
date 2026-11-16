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
      console.log('[SWUpdate] Nova versão do Service Worker pronta!');
    },
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setRegistration(r);
        // Verifica atualizações a cada 10 minutos
        const interval = setInterval(() => {
          r.update().catch(() => {});
        }, 10 * 60 * 1000);

        return () => clearInterval(interval);
      }
    },
    onRegisterError(err) {
      console.error('SW Registration error:', err);
      setError(err as Error);
    },
  });

  const applyUpdate = useCallback(async () => {
    console.log('[SWUpdate] Aplicando atualização limpa do Service Worker...');
    setNeedRefresh(false);
    try {
      // Limpa os caches de arquivos estáticos antigos para garantir download do bundle novo
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      await updateSW(true);
    } catch (e) {
      console.error('[SWUpdate] Fallback reload:', e);
    } finally {
      // Recarrega preservando o caminho mas forçando bypass de cache HTTP
      const url = new URL(window.location.href);
      url.searchParams.set('updated', String(Date.now()));
      window.location.replace(url.toString());
    }
  }, [updateSW, setNeedRefresh]);

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

