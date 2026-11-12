import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { db, doc, getDoc, onSnapshot, setDoc, getFirestoreDateKey, getBrazilDay } from '../../firebase';
import { analyzeBillingCosts } from '../../services/geminiService';
import { runAdminIntentionsCleanupOnLoad } from '../utils/intentionsCleanup';

export interface IntentionCleanupReportData {
  lastPurgeTimestamp?: number;
  lastPurgeDateStr?: string;
  purgedResponsesCount?: number;
  purgedPreConfirmationsCount?: number;
  purgedLocalStorageKeys?: number;
  totalPurgedCount?: number;
  preservedActiveConfirmations?: number;
  targetDate?: string;
  cutoffTimestamp?: number;
  status?: 'SUCCESS' | 'ERROR';
}

export const useAdminAutomations = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const currentPlayer = useStore(state => state.currentPlayer);
  const monthlyUsageStats = useStore(state => state.monthlyUsageStats);
  const showNotification = useStore(state => state.showNotification);
  const players = useStore(state => state.players);
  const idToCanonicalId = useStore(state => state.idToCanonicalId);

  const [cleanupStatus, setCleanupStatus] = useState<IntentionCleanupReportData | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  const isAdmin = userRole === 'ADMIN' || Boolean(currentPlayer?.isAdmin) || (user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com');

  // 1. Escuta em tempo real do relatório de purga de 7 dias
  useEffect(() => {
    if (!isAdmin) return;

    const unsub = onSnapshot(doc(db, 'metadata', 'intentions_cleanup_status'), (snapshot) => {
      if (snapshot.exists()) {
        setCleanupStatus(snapshot.data() as IntentionCleanupReportData);
      } else {
        // Inicialização se ainda não existir
        runAdminIntentionsCleanupOnLoad({ players, idToCanonicalId }).catch(console.warn);
      }
    }, (err) => {
      console.warn('[useAdminAutomations] Erro ao escutar status de limpeza de intenções:', err);
    });

    return () => unsub();
  }, [isAdmin, players, idToCanonicalId]);

  // 2. Método para disparar limpeza manual de intenções > 7 dias
  const triggerManualPurge = useCallback(async () => {
    setIsPurging(true);
    try {
      const result = await runAdminIntentionsCleanupOnLoad({ players, idToCanonicalId });
      showNotification(
        `Limpeza concluída! ${result.purgedResponsesCount + result.purgedPreConfirmationsCount + result.purgedLocalStorageKeys} itens obsoletos expurgados com sucesso.`,
        'success'
      );
      return result;
    } catch (err) {
      showNotification('Erro ao executar limpeza manual de intenções.', 'error');
      throw err;
    } finally {
      setIsPurging(false);
    }
  }, [players, idToCanonicalId, showNotification]);

  // 3. Automação Semanal de Relatório de Faturamento
  useEffect(() => {
    const checkWeeklyBillingReport = async () => {
      if (!user || user.email !== 'rodneyes@gmail.com' || userRole !== 'ADMIN') return;

      const isFriday = getBrazilDay() === 5;
      if (!isFriday) return;

      const today = getFirestoreDateKey();
      const automationRef = doc(db, 'metadata', 'automation_weekly_billing');

      try {
        const snap = await getDoc(automationRef);
        const lastRun = snap.exists() ? snap.data().lastRun : null;

        if (lastRun === today) return;

        console.log('[Automation] Iniciando Relatório de Faturamento Semanal...');

        const baseCloudRun = 58.73;
        const savingCloudRun = 31.07;
        const costGemini = 12.38;
        const costAppEngine = 0.62;
        const costFunctions = 0.17;
        const savingFunctions = 0.17;
        const actualBRL = 40.66;
        const forecastBRL = 53.01;

        const services = [
          { name: 'Cloud Run', cost: baseCloudRun, savings: savingCloudRun },
          { name: 'Gemini API', cost: costGemini },
          { name: 'Firestore', cost: costAppEngine },
          { name: 'Functions', cost: costFunctions, savings: savingFunctions },
        ];

        const mReads = monthlyUsageStats?.reads || 0;
        const mWrites = monthlyUsageStats?.writes || 0;
        const mAiCalls = monthlyUsageStats?.aiCalls || 0;

        const monthKey = today.slice(0, 7);
        const monthRef = doc(db, 'billing_history', monthKey);
        await setDoc(monthRef, {
          month: monthKey,
          lastUpdate: today,
          data: {
            actualBRL,
            forecastBRL,
            services,
            usage: { mReads, mWrites, mAiCalls }
          }
        }, { merge: true });

        const report = await analyzeBillingCosts({
          actual: actualBRL,
          forecast: forecastBRL,
          services,
          usage: { reads: mReads, writes: mWrites, aiCalls: mAiCalls }
        });

        const reportId = `billing_report_${today}`;
        await setDoc(doc(db, 'reports', reportId), {
          type: 'WEEKLY_BILLING',
          date: today,
          report: report,
          data: { actualBRL, forecastBRL, mReads, mWrites, mAiCalls },
          createdAt: new Date().toISOString()
        });

        await setDoc(automationRef, { lastRun: today }, { merge: true });
        showNotification('Relatório de Faturamento Semanal Gerado com IA! Verifique no Dashboard.', 'success');
      } catch (err) {
        console.error('[Automation] Erro no relatório semanal:', err);
      }
    };

    checkWeeklyBillingReport();
  }, [user, userRole, monthlyUsageStats, showNotification]);

  return {
    cleanupStatus,
    isPurging,
    triggerManualPurge
  };
};
