import { useShallow } from 'zustand/react/shallow';
import { useEffect } from 'react';
import { useStore } from '../../store';
import { 
  db, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc,
  getFirestoreDateKey
} from '../../firebase';
import { scanDatabaseAnomalies, executeDbAutoCorrection } from '../../services/dbAutoCorrectionAgent';
import { Player } from '../../types';

/**
 * Hook to perform autonomous and periodic database maintenance & auto-corrections.
 * Runs autonomously for Admin sessions according to configured schedule (Daily/Weekly).
 */
export const useDatabaseMaintenance = () => {
  const { user, userRole, showNotification } = useStore(useShallow(state => ({user: state.user, userRole: state.userRole, showNotification: state.showNotification})));

  useEffect(() => {
    const runAutonomousAgent = async () => {
      // Delay execution to avoid resource contention during app startup (especially on mobile)
      await new Promise(resolve => setTimeout(resolve, 20000));

      // 1. Authorization: Master Admin or Admin role
      if (!user || userRole !== 'ADMIN') return;

      const todayKey = getFirestoreDateKey();
      const configRef = doc(db, 'system_config', 'autocorrect_settings');
      const maintenanceRef = doc(db, 'metadata', 'last_autocorrect_maintenance');

      try {
        // Fetch autonomous settings (Default: Enabled, Frequency: DAILY, AutoFix: true)
        const configSnap = await getDoc(configRef);
        const settings = configSnap.exists() ? configSnap.data() : {
          enabled: true,
          frequency: 'DAILY', // 'DAILY' | 'WEEKLY'
          autoFix: true,
          notifyAdmin: true
        };

        if (!settings.enabled) {
          console.log('[Agente Autônomo IA] Desativado nas configurações do sistema.');
          return;
        }

        // Check last run timestamp
        const lastRunSnap = await getDoc(maintenanceRef);
        const lastRunData = lastRunSnap.exists() ? lastRunSnap.data() : null;
        const lastRunTimestamp = lastRunData?.lastRunTimestamp || 0;
        const now = Date.now();

        const intervalMs = settings.frequency === 'WEEKLY' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        if (now - lastRunTimestamp < intervalMs) {
          console.log('[Agente Autônomo IA] Varredura já realizada no intervalo agendado.');
          return;
        }

        console.log('[Agente Autônomo IA] Executando varredura e autocorreção autônoma...');

        // Fetch data for analysis
        const playersSnap = await getDocs(collection(db, 'players'));
        const players: Player[] = [];
        playersSnap.forEach(d => players.push({ ...d.data(), id: d.id } as Player));

        const matchesSnap = await getDocs(collection(db, 'matches'));
        const matches: any[] = [];
        matchesSnap.forEach(d => matches.push({ ...d.data(), id: d.id }));

        if (players.length === 0) return;

        // Run anomaly scan
        const anomalies = scanDatabaseAnomalies(players, matches, settings);

        if (anomalies.length > 0 && settings.autoFix) {
          // Execute Autonomous Fixes
          const summary = await executeDbAutoCorrection(db, anomalies, players, matches);
          console.log('[Agente Autônomo IA] Autocorreções executadas com sucesso:', summary);

          if (settings.notifyAdmin) {
            showNotification(
              `🤖 Agente IA Autônomo: ${summary.duplicatePlayersMerged} duplicata(s) e ${summary.matchesRepaired} partida(s) corrigidas no banco.`,
              'success'
            );
          }
        } else if (anomalies.length > 0 && !settings.autoFix) {
          if (settings.notifyAdmin) {
            showNotification(
              `⚠️ Agente IA Autônomo: ${anomalies.length} anomalia(s) detectada(s) no banco. Ação automática desativada.`,
              'info'
            );
          }
        }

        // Update Last Run Metadata
        await setDoc(maintenanceRef, {
          lastRunDate: todayKey,
          lastRunTimestamp: now,
          frequency: settings.frequency,
          status: anomalies.length > 0 ? (settings.autoFix ? 'AUTOCORRECTED' : 'ANOMALIES_DETECTED') : 'CLEAN',
          anomaliesCount: anomalies.length
        }, { merge: true });

      } catch (err) {
        console.error('[Agente Autônomo IA] Erro ao executar manutenção autônoma:', err);
      }
    };

    runAutonomousAgent();
  }, [user, userRole, showNotification]);
};

