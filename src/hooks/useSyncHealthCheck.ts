import { useEffect, useRef } from 'react';
import { db, doc, getDocFromServer, getFirestoreDateKey } from '../../firebase';
import { useStore } from '../../store';
import { selectiveForceSyncService } from '../services/selectiveForceSyncService';

/**
 * Hook de Health Check de Sincronização (useSyncHealthCheck)
 * Compara periodicamente os timestamps da nuvem com os locais e, se houver
 * disparidade persistente, dispara um re-fetch forçado apenas dos documentos
 * críticos do dia corrente (metadata/intentions, attendance, matches).
 */
export const useSyncHealthCheck = () => {
  const lastSyncTimestamp = useStore(state => state.lastSyncTimestamp);
  const triggerSync = useStore(state => state.triggerSync);
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const lastHealthCheckRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isCancelled = false;

    const performHealthCheck = async () => {
      if (isBackgroundSyncing || isCancelled) return;
      
      const now = Date.now();
      // Executa no máximo a cada 30 segundos
      if (now - lastHealthCheckRef.current < 30000) return;
      lastHealthCheckRef.current = now;

      try {
        console.info('[SyncHealthCheck] Verificando consistência entre cache local e nuvem (Firestore)...');
        
        // 1. Consulta estrita ao servidor (ignora cache local IndexedDB)
        const intentionsServerSnap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
        if (!intentionsServerSnap.exists() || isCancelled) return;

        const serverData = intentionsServerSnap.data() || {};
        const serverLastUpdated = Number(serverData.lastUpdated || 0);
        const serverResponsesCount = Object.keys(serverData.responses || {}).length;

        // 2. Compara com estado atual do store
        const storeState = useStore.getState();
        const localLastSync = storeState.lastSyncTimestamp || 0;

        // Se o servidor tiver uma atualização mais recente ou se houver disparidade temporal (> 45 segundos)
        const timeDisparity = serverLastUpdated - localLastSync;
        const hasDisparity = timeDisparity > 45000 || (serverLastUpdated > 0 && localLastSync === 0);

        if (hasDisparity) {
          console.warn(`[SyncHealthCheck] Disparidade detectada! Servidor lastUpdated: ${serverLastUpdated}, Local lastSync: ${localLastSync}. Disparando force-sync crítico...`);
          
          // Dispara sincronização cirúrgica focada em intentions e dados do dia
          await selectiveForceSyncService.executeSelectiveForceSync(['intentions', 'attendance', 'matches', 'preConfirmations']);
          
          // Dispara triggerSync geral do store
          storeState.triggerSync();
          console.info('[SyncHealthCheck] Re-fetch forçado concluído com sucesso. Estado sincronizado com o AI Studio.');
        } else {
          console.info('[SyncHealthCheck] Saúde de sincronização OK. Nenhum desvio detectado.');
        }
      } catch (err) {
        console.warn('[SyncHealthCheck] Aviso ao verificar saúde de sync (possivelmente offline):', err);
      }
    };

    // Executa após 5 segundos da montagem inicial
    const initialTimer = setTimeout(performHealthCheck, 5000);

    // Intervalo periódico de 45 segundos
    const interval = setInterval(performHealthCheck, 45000);

    // Eventos de foco e reconexão
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        performHealthCheck();
      }
    };

    window.addEventListener('focus', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    };
  }, [isBackgroundSyncing, triggerSync]);
};
