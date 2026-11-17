import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { db, doc, setDoc, getFirestoreDateKey, isQuotaExceeded, isFirestoreQuotaError, markQuotaExceeded } from '../../firebase';
import { scanDatabaseAnomalies, executeDbAutoCorrection } from '../../services/dbAutoCorrectionAgent';

/**
 * Manutenção e Autocorreção Autônoma Otimizada:
 * Opera diretamente sobre os dados já carregados na Store (Zero getDocs redundantes),
 * executando no máximo 1 vez por dia para sessões de Administrador.
 */
export const useDatabaseMaintenance = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const showNotification = useStore(state => state.showNotification);
  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current || !user || userRole !== 'ADMIN' || isQuotaExceeded) return;
    if (!players || players.length === 0) return;

    const todayKey = getFirestoreDateKey();
    const localRunKey = 'guerreiros_last_autonomous_db_check';
    if (localStorage.getItem(localRunKey) === todayKey) {
      executedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      if (executedRef.current) return;
      executedRef.current = true;

      try {
        const settings = {
          enabled: true,
          frequency: 'DAILY',
          autoFix: true,
          notifyAdmin: false // Silencioso para não interromper a operação de quadra
        };

        const anomalies = scanDatabaseAnomalies(players, matches, settings);

        if (anomalies.length > 0) {
          const summary = await executeDbAutoCorrection(db, anomalies, players, matches);
          console.info('[Agente Autônomo] Autocorreção silenciosa concluída:', summary);
          if (summary.duplicatePlayersMerged > 0 || summary.matchesRepaired > 0) {
            showNotification(
              ` Manutenção Automática: ${summary.duplicatePlayersMerged} duplicata(s) e ${summary.matchesRepaired} partida(s) ajustadas.`,
              'info'
            );
          }
        }

        localStorage.setItem(localRunKey, todayKey);
        await setDoc(
          doc(db, 'metadata', 'last_autocorrect_maintenance'),
          {
            lastRunDate: todayKey,
            lastRunTimestamp: Date.now(),
            status: anomalies.length > 0 ? 'AUTOCORRECTED' : 'CLEAN',
            anomaliesCount: anomalies.length
          },
          { merge: true }
        );
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
          return;
        }
        console.warn('[Agente Autônomo] Aviso na manutenção em segundo plano:', err);
      }
    }, 12000);

    return () => clearTimeout(timer);
  }, [user, userRole, players, matches, showNotification]);
};
