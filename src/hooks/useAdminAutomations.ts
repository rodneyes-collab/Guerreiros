import { useEffect } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { db, doc, getDoc, setDoc, updateDoc, getFirestoreDateKey, getBrazilDay } from '../../firebase';
import { analyzeBillingCosts } from '../../services/geminiService';

export const useAdminAutomations = () => {
  const {
 user, userRole, monthlyUsageStats, showNotification } = useStore(useShallow(state => ({
      user: state.user,
      userRole: state.userRole,
      monthlyUsageStats: state.monthlyUsageStats,
      showNotification: state.showNotification
    })));

  useEffect(() => {
    const checkWeeklyBillingReport = async () => {
      // 1. Only run for MASTER ADMIN
      if (!user || user.email !== 'rodneyes@gmail.com' || userRole !== 'ADMIN') return;

      // 2. Only run on FRIDAY (Day 5)
      const isFriday = getBrazilDay() === 5;
      if (!isFriday) return;

      const today = getFirestoreDateKey();
      const automationRef = doc(db, 'metadata', 'automation_weekly_billing');

      try {
        const snap = await getDoc(automationRef);
        const lastRun = snap.exists() ? snap.data().lastRun : null;

        // 3. Check if already run this week (Friday to Friday)
        if (lastRun === today) return;

        console.log('[Automation] Iniciando Relatório de Faturamento Semanal...');

        // Dados simulados baseados no relato do usuário para calibração
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

        // Armazenar os custos do mês para consulta histórica
        const monthKey = today.slice(0, 7); // YYYY-MM
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

        // Save report to history
        const reportId = `billing_report_${today}`;
        await setDoc(doc(db, 'reports', reportId), {
          type: 'WEEKLY_BILLING',
          date: today,
          report: report,
          data: { actualBRL, forecastBRL, mReads, mWrites, mAiCalls },
          createdAt: new Date().toISOString()
        });

        // Mark as run for today
        await setDoc(automationRef, { lastRun: today }, { merge: true });

        // Notify Master Admin
        showNotification('Relatório de Faturamento Semanal Gerado com IA! Verifique no Dashboard.', 'success');
        
        console.log('[Automation] Relatório semanal concluído com sucesso.');
      } catch (err) {
        console.error('[Automation] Erro no relatório semanal:', err);
      }
    };

    checkWeeklyBillingReport();
  }, [user, userRole, monthlyUsageStats, showNotification]);
};
