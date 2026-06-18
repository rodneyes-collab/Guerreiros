import { useEffect, useState } from 'react';
// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react';

export function useServiceWorkerUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        // Verifica atualizações automaticamente a cada 1 hora (3600000 ms)
        setInterval(() => {
          r.update();
        }, 3600 * 1000);
      }
    },
    onRegisterError(error: any) {
      console.error('Erro na configuração do Service Worker:', error);
    },
  });

  return {
    needRefresh,
    setNeedRefresh,
    updateServiceWorker,
  };
}
