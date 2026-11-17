import { useEffect, useRef } from 'react';
import {
  db,
  doc,
  getDocFromServer,
  isQuotaExceeded,
  isFirestoreQuotaError,
  markQuotaExceeded
} from '../../firebase';
import { useStore } from '../../store';
import { selectiveForceSyncService } from '../services/selectiveForceSyncService';

/**
 * Hook de Health Check de Sincronização (useSyncHealthCheck)
 * Compara periodicamente os timestamps da nuvem com os locais e, se houver
 * disparidade persistente, dispara um re-fetch cirúrgico apenas dos documentos
 * críticos do dia corrente (metadata/intentions, attendance, matches).
 */
export const useSyncHealthCheck = () => {
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const isBackgroundSyncingRef = useRef(isBackgroundSyncing);
  const lastHealthCheckRef = useRef<number>(Date.now());

  useEffect(() => {
    isBackgroundSyncingRef.current = isBackgroundSyncing;
  }, [isBackgroundSyncing]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isCancelled = false;

    const performHealthCheck = async () => {
      if (isBackgroundSyncingRef.current || isCancelled || isQuotaExceeded) return;

      const now = Date.now();
      // Executa no máximo a cada 3 minutos para evitar consumo excessivo de leituras no Firestore
      if (now - lastHealthCheckRef.current < 180000) return;
      lastHealthCheckRef.current = now;

      try {
        // 1. Consulta estrita ao servidor (ignora cache local IndexedDB)
        const intentionsServerSnap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
        if (!intentionsServerSnap.exists() || isCancelled) return;

        const serverData = intentionsServerSnap.data() || {};
        const serverLastUpdated = Number(serverData.lastUpdated || 0);

        // 2. Compara com estado atual do store
        const storeState = useStore.getState();
        const localLastSync = storeState.lastSyncTimestamp || 0;

        const timeDisparity = serverLastUpdated - localLastSync;
        const hasDisparity = timeDisparity > 45000 || (serverLastUpdated > 0 && localLastSync === 0);

        if (hasDisparity) {
          console.warn(`[SyncHealthCheck] Disparidade detectada! Servidor lastUpdated: ${serverLastUpdated}, Local lastSync: ${localLastSync}. Disparando force-sync cirúrgico...`);
          await selectiveForceSyncService.executeSelectiveForceSync(['intentions', 'attendance', 'matches']);
          if (storeState.syncMode !== 'realtime') {
            storeState.triggerSync();
          }
        }
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
          return;
        }
        console.warn('[SyncHealthCheck] Aviso ao verificar saúde de sync (possivelmente offline):', err);
      }
    };

    // Intervalo periódico de 3 minutos
    const interval = setInterval(performHealthCheck, 180000);

    // Eventos de foco e reconexão (respeitando o cooldown de 3 minutos)
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !isQuotaExceeded) {
        performHealthCheck();
      }
    };

    window.addEventListener('focus', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    };
  }, []);
};
