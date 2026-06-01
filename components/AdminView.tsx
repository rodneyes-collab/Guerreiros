import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { 
  Settings, 
  Database, 
  Shield, 
  Trophy,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  UserCheck,
  X,
  Check,
  Link as LinkIcon,
  Clock,
  UserPlus,
  MessageSquare,
  QrCode,
  Zap,
  Send,
  Users as UsersIcon,
  Search,
  AlertTriangle,
  Activity,
  LayoutDashboard,
  ShieldCheck,
  FileJson,
  History,
  Swords,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CreditCard,
  BellRing,
  Eye,
  Cpu,
  Bot,
  Calendar,
  DollarSign,
  ExternalLink,
  Edit2,
  Star
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  Legend
} from 'recharts';
import { db, doc, updateDoc, setDoc, deleteDoc, onSnapshot, writeBatch, collection, serverTimestamp, getDocs, query, where, orderBy, limit, getFirestoreDateKey } from '../firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { Player } from '../types';
import Markdown from 'react-markdown';
import { Logo } from '../src/components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeBillingCosts } from '../services/geminiService';

import { useBirthdays } from '../src/hooks/useBirthdays';
import { BirthdayAdminCard } from '../src/components/BirthdayAdminCard';
import { BleModuleConfigCard } from '../src/components/BleModuleConfigCard';
import { HelpTooltip } from '../src/components/HelpTooltip';

import { getLevelSuggestions, LevelSuggestion } from '../utils/levelAuditUtils';

const MemoryMonitorCard = () => {
    const [mem, setMem] = useState<any>(null);
    useEffect(() => {
        const fetchMem = async () => {
            try {
                const r = await fetch('/api/memory-usage');
                setMem(await r.json());
            } catch (e) {
                console.error("Erro ao buscar memória:", e);
            }
        };
        fetchMem();
        const interval = setInterval(fetchMem, 3600000);
        return () => clearInterval(interval);
    }, []);
    if (!mem) return (
        <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-4">
            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                 <Cpu className="w-5 h-5 text-brand-primary" /> Consumo de Memória (Server)
            </h3>
            <p className="text-white/30 font-bold text-center">Carregando...</p>
        </section>
    );
    return (
        <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-4">
            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                 <Cpu className="w-5 h-5 text-brand-primary" /> Consumo de Memória (Server)
            </h3>
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-brand-primary/5 p-3 rounded-xl border border-white/5 text-center">
                    <p className="text-[9px] font-black text-white/40 uppercase">Heap</p>
                    <p className="text-lg font-black font-mono text-white">{mem.heapUsed}MB</p>
                </div>
                <div className="bg-brand-primary/5 p-3 rounded-xl border border-white/5 text-center">
                    <p className="text-[9px] font-black text-white/40 uppercase">RSS</p>
                    <p className="text-lg font-black font-mono text-white">{mem.rss}MB</p>
                </div>
                <div className="bg-brand-primary/5 p-3 rounded-xl border border-white/5 text-center">
                    <p className="text-[9px] font-black text-white/40 uppercase">Total</p>
                    <p className="text-lg font-black font-mono text-white">{mem.heapTotal}MB</p>
                </div>
            </div>
            <p className="text-[8px] text-white/30 font-bold uppercase text-center">Atualizado a cada 1 hora</p>
        </section>
    );
};

interface AdminViewProps {
  resetDailyStats: () => void;
  resetElo: () => void;
  triggerSync: () => void;
  recalculateStats: () => void;
  recalculateDailyStats: () => void;
  repairDatabase: () => void;
  initializeEloHistory: () => void;
  updateQuotaSettings: (totalQuota: number) => void;
  updateSystemMetadata: (metadata: any) => void;
  createDataSnapshot: (label?: string) => void;
  clearAllHistory: () => void;
  clearMatchesOnly: () => void;
  clearAllDatabase: () => void;
  pendingRequests: any[];
  onApproveRequest: (req: any) => void;
  onRejectRequest: (reqId: string) => void;
  handleScanAnomalies: () => void;
  fixDatabaseAnomalies: () => void;
  recalculateAllElo: () => void;
  deleteTournament: (id: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  savePlayer: (player: Player) => Promise<void>;
}

type AdminTab = 'dashboard' | 'members' | 'maintenance' | 'sentinel' | 'tournaments' | 'system' | 'notifications' | 'audit';

export const AdminView: React.FC<AdminViewProps> = ({
  resetDailyStats,
  resetElo,
  triggerSync,
  recalculateStats,
  recalculateDailyStats,
  repairDatabase,
  initializeEloHistory,
  updateQuotaSettings,
  updateSystemMetadata,
  createDataSnapshot,
  clearAllHistory,
  clearMatchesOnly,
  clearAllDatabase,
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
  recalculateAllElo,
  handleScanAnomalies,
  fixDatabaseAnomalies,
  deleteTournament,
  showConfirmModal,
  setEditingPlayer,
  setIsFormOpen,
  savePlayer
}) => {
  const { 
    userRole, 
    players, 
    matches, 
    payments, 
    tournaments,
    systemMetadata, 
    setSystemMetadata, 
    showNotification, 
    usageStats,
    setUsageStats,
    monthlyUsageStats,
    isScanningAnomalies,
    anomalyReport,
    user,
    currentPlayer,
    setSelectedRankingPlayerId,
    setViewMode
  } = useStore();

  const { todayBirthdays, sendBirthdayPush } = useBirthdays();

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [billingAnalysis, setBillingAnalysis] = useState<string | null>(null);
  const [isMonitoringDisabled, setIsMonitoringDisabled] = useState(false);
  const [activeServiceAccount, setActiveServiceAccount] = useState<string | null>(null);
  const [isAnalyzingBilling, setIsAnalyzingBilling] = useState(false);
  const [weeklyReports, setWeeklyReports] = useState<any[]>([]);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [dailyUsageHistory, setDailyUsageHistory] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [syncDate, setSyncDate] = useState(getFirestoreDateKey());
  const [syncValue, setSyncValue] = useState('');
  const [isSyncingBilling, setIsSyncingBilling] = useState(false);
  const [isFetchingGCP, setIsFetchingGCP] = useState(false);
  const [lastSyncBreakdown, setLastSyncBreakdown] = useState<any>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [levelSuggestions, setLevelSuggestions] = useState<LevelSuggestion[]>([]);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [sentinelReports, setSentinelReports] = useState<any[]>([]);
  const [isRunningSentinel, setIsRunningSentinel] = useState(false);
  const [loadingSentinel, setLoadingSentinel] = useState(false);

  useEffect(() => {
    if (activeTab !== 'sentinel') return;
    setLoadingSentinel(true);
    const q = query(
      collection(db, 'sentinelReports'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSentinelReports(reports);
      setLoadingSentinel(false);
    }, (err) => {
      console.error("error fetching sentinel reports", err);
      setLoadingSentinel(false);
    });
    
    return () => unsub();
  }, [activeTab]);

  const runSentinelScan = async () => {
    setIsRunningSentinel(true);
    try {
      // 1. Fetch relevant datasets client-side (where rule authorization is fully granted)
      const [playersSnap, matchesSnap, loginLogsSnap, auditLogsSnap, metadataSnap] = await Promise.all([
        getDocs(collection(db, 'players')),
        getDocs(query(collection(db, 'matches'), orderBy('timestamp', 'desc'), limit(20))),
        getDocs(query(collection(db, 'loginLogs'), orderBy('timestamp', 'desc'), limit(50))),
        getDocs(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(30))),
        getDocs(query(collection(db, 'metadata'), limit(1)))
      ]);

      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const loginLogs = loginLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const auditLogs = auditLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      let metadata = {};
      const configDoc = metadataSnap.docs.find(d => d.id === 'system_config');
      if (configDoc) {
        metadata = configDoc.data();
      }

      // 2. Relay datasets to our serverless Gemini proxy
      const resp = await fetch('/api/sentinel/deep-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players,
          matches,
          loginLogs,
          auditLogs,
          metadata
        })
      });

      if (!resp.ok) {
        const errDetails = await resp.json().catch(() => ({}));
        throw new Error(errDetails.error || 'Falha ao acionar Sentinela');
      }

      const resData = await resp.json();

      // 3. Persist the generated Sentinel Report back into Firestore from client-side
      const reportId = `report_${Date.now()}`;
      await setDoc(doc(db, 'sentinelReports', reportId), {
        id: reportId,
        status: resData.status,
        report: resData.report,
        anomaliesFound: (resData.report.match(/anomalia|erro|problema/gi) || []).length,
        timestamp: new Date().toISOString(),
        createdAt: new Date().getTime()
      });

      showNotification('Varredura do Sentinela concluída com sucesso!', 'success');
    } catch (e: any) {
      console.error('Sentinel Error:', e);
      showNotification(`Erro no Sentinela: ${e.message}`, 'error');
    } finally {
      setIsRunningSentinel(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'audit') return;
    setLoadingLogs(true);
    const q = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAuditLogs(logs);
      setLoadingLogs(false);
    }, (err) => {
      console.error("error fetching audit logs", err);
      setLoadingLogs(false);
    });
    
    return () => unsub();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'notifications') return;
    setLoadingNotifications(true);
    const q = query(
      collection(db, 'notifications'), 
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllNotifications(notifs);
      setLoadingNotifications(false);
    }, (err) => {
      console.error("error fetching all notifications", err);
      setLoadingNotifications(false);
    });
    
    return () => unsub();
  }, [activeTab]);

  useEffect(() => {
    if (players.length > 0) {
      const suggestions = getLevelSuggestions(players);
      setLevelSuggestions(suggestions);
    }
  }, [players]);

  const approveLevelSuggestion = async (suggestion: LevelSuggestion) => {
    const player = players.find(p => p.id === suggestion.playerId);
    if (!player) return;

    try {
      await savePlayer({
        ...player,
        impactLevel: suggestion.suggestedLevel
      });
      // Filter out the handled suggestion
      setLevelSuggestions(prev => prev.filter(s => s.playerId !== suggestion.playerId));
    } catch (error) {
      console.error('Error approving level suggestion:', error);
    }
  };

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-3 h-3 text-white/20" />;
    }
  };

  const syncGCPDataForDate = async (targetDateStr: string): Promise<boolean> => {
    try {
      const resp = await fetch(`/api/billing/real-time?date=${targetDateStr}`);
      
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await resp.text();
        if (text.includes("Starting Server...")) {
          throw new Error("O servidor está acordando. Aguarde 5 segundos e tente novamente.");
        }
        throw new Error(`O servidor retornou um formato inesperado. Erro HTTP: ${resp.status}`);
      }

      const data = await resp.json();
      
      if (data.estimatedCostBRL === null && !data.metricsAvailable) {
        showNotification('Métricas indisponíveis no Google Monitoring no momento. Tente novamente em 15 min.', 'info');
        return false;
      }
      
      if (data.success === false && data.isGcpError) {
        if (data.serviceAccount) setActiveServiceAccount(data.serviceAccount);
        else setActiveServiceAccount('ais-sandbox@ais-us-east1-3182cc021eb343ff9.iam.gserviceaccount.com');
        setIsMonitoringDisabled(true);
        if (data.errorType === 'API_DISABLED') {
          showNotification('Acesso Negado. Veja as instruções no painel abaixo.', 'error');
        } else {
          showNotification(`Acesso Negado: O App não tem autorização IAM. Veja abaixo.`, 'error');
        }
        return false;
      }

      if (!resp.ok) return false;
      
      const val = data.estimatedCostBRL;
      const breakdown = data.breakdown;
      const today = getFirestoreDateKey();
      
      if (targetDateStr === today) {
        const usageRef = doc(db, 'metadata', 'usage');
        const updatePayload = { 
          officialValue: val,
          breakdown: breakdown || null,
          lastGcpSync: new Date().toISOString()
        };
        await updateDoc(usageRef, updatePayload).catch(() => setDoc(usageRef, updatePayload, { merge: true }));
        setUsageStats({ 
          ...usageStats, 
          officialValue: val,
          lastGcpSync: updatePayload.lastGcpSync
        });
        setLastSyncBreakdown(breakdown);
      } else {
        const historyRef = doc(db, 'usage_history', targetDateStr);
        const historyDoc = {
          officialValue: val,
          breakdown: breakdown || null,
          updatedAt: serverTimestamp()
        };
        await updateDoc(historyRef, historyDoc).catch(() => setDoc(historyRef, { 
          ...historyDoc,
          lastUpdate: targetDateStr
        }, { merge: true }));
      }
      return true;
    } catch (error: any) {
      console.error(`[Admin] Erro no fetch para ${targetDateStr}:`, error);
      throw error;
    }
  };

  const fetchGCPData = async () => {
    setIsFetchingGCP(true);
    setIsMonitoringDisabled(false);
    setActiveServiceAccount(null);
    try {
      await syncGCPDataForDate(syncDate);
      showNotification(`Sincronizado via Google monitoring!`, 'success');
      
      const dailySnap = await getDocs(query(collection(db, 'usage_history'), limit(60)));
      const dailyData = dailySnap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .sort((a, b) => (a.lastUpdate || '').localeCompare(b.lastUpdate || ''));
      setDailyUsageHistory(dailyData);
    } catch (error: any) {
      showNotification(`Erro de conexão: ${error.message || 'Falha ao buscar dados'}.`, 'error');
    } finally {
      setIsFetchingGCP(false);
    }
  };

  const syncHistoricalGCPData = async () => {
    setIsSyncingBilling(true); // Reusing the boolean flag
    setIsMonitoringDisabled(false);
    setActiveServiceAccount(null);
    try {
      const today = new Date();
      // Sync last 7 days
      for (let i = 0; i <= 7; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        const dateStr = targetDate.toISOString().split('T')[0];
        
        const success = await syncGCPDataForDate(dateStr);
        if (!success) break; 
      }
      
      showNotification('Histórico dos últimos 7 dias sincronizado com sucesso!', 'success');
      
      const dailySnap = await getDocs(query(collection(db, 'usage_history'), limit(60)));
      const dailyData = dailySnap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .sort((a, b) => (a.lastUpdate || '').localeCompare(b.lastUpdate || ''));
      setDailyUsageHistory(dailyData);
    } catch (error: any) {
      showNotification(`Falha ao sincronizar histórico: ${error.message}`, 'error');
    } finally {
      setIsSyncingBilling(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard' && userRole === 'ADMIN') {
      const lastSyncStr = usageStats.lastGcpSync;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      // Auto-sync today if never synced today or if last sync was more than 4 hours ago
      const isNeverSyncedToday = !lastSyncStr || !lastSyncStr.startsWith(todayStr);
      const lastSyncTime = lastSyncStr ? new Date(lastSyncStr).getTime() : 0;
      const hoursSinceSync = (now.getTime() - lastSyncTime) / (1000 * 60 * 60);
      
      // Auto-sync today se não existe - DESABILITADO para economizar custos de Cloud Run
      // O usuário pode sincronizar manualmente pelo botão se quiser ver.
      /*
      if ((isNeverSyncedToday || hoursSinceSync > 4) && !isFetchingGCP && !isSyncingBilling) {
        fetchGCPData();
      }

      // NOVIDADE: Sincronização automática do HISTÓRICO (Últimos 7 dias) 
      // Acontece apenas 1 vez por dia ao abrir o Dashboard - DESABILITADO para economia
      const lastHistoricalSync = localStorage.getItem('last_historical_sync');
      if (lastHistoricalSync !== todayStr && !isSyncingBilling && !isFetchingGCP) {
        syncHistoricalGCPData().then(() => {
          localStorage.setItem('last_historical_sync', todayStr);
        });
      }
      */
    }
  }, [activeTab, userRole, usageStats.lastGcpSync]);

  useEffect(() => {
    const fetchReports = async () => {
      if (activeTab === 'dashboard') {
        setIsLoadingReports(true);
        try {
          const reportsSnap = await getDocs(query(collection(db, 'reports'), where('type', '==', 'WEEKLY_BILLING')));
          const data = reportsSnap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setWeeklyReports(data);

          const historySnap = await getDocs(query(collection(db, 'billing_history')));
          const historyData = historySnap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
            .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
          setBillingHistory(historyData);

          const dailySnap = await getDocs(query(collection(db, 'usage_history'), limit(60)));
          const dailyData = dailySnap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
            .sort((a, b) => (a.lastUpdate || '').localeCompare(b.lastUpdate || ''));
          setDailyUsageHistory(dailyData);
        } catch (error) {
          console.error("Erro ao carregar relatórios/histórico:", error);
        } finally {
          setIsLoadingReports(false);
        }
      }
    };
    fetchReports();
  }, [activeTab]);

  const chartData = useMemo(() => {
    // Adicionar o uso de hoje ao histórico para o gráfico ficar completo
    const todayKey = getFirestoreDateKey();
    const todayData = {
      lastUpdate: todayKey,
      reads: usageStats.reads || 0,
      writes: usageStats.writes || 0,
      aiCalls: usageStats.aiCalls || 0,
      accesses: usageStats.accesses || 0,
      officialValue: usageStats.officialValue
    };
    
    // Filtrar dados do mês atual
    const currentMonth = todayKey.slice(0, 7);
    const monthlyHistory = dailyUsageHistory.filter(d => d.lastUpdate.startsWith(currentMonth) && d.lastUpdate !== todayKey);
    
    // Agora usamos APENAS dados reais registrados. Se não houver registro para um dia, ele não aparece no gráfico.
    let combinedData = [...monthlyHistory, todayData].sort((a,b) => a.lastUpdate.localeCompare(b.lastUpdate));
    
    let accumulated = 0;
    return combinedData.map(day => {
      let dailyTotal = 0;
      let breakdown = { cloudRun: '0.00', firestore: '0.00', gemini: '0.00' };
      
      // CÁLCULO FINAL: Prioridade para Valor Oficial, mas se oficial for 0 e tivermos acessos, usamos a estimativa
      // Isso evita o gráfico "zerado" quando o Google Monitoring está com delay mas o app está sendo usado.
      const accessesCount = day.accesses || 0;
      const cRun = accessesCount > 0 ? (0.04 + (accessesCount * 0.01)) : 0; 
      const fStore = ((day.reads || 0) / 10000) * 0.12 + ((day.writes || 0) / 5000) * 0.18;
      const gApi = (day.aiCalls || 0) * 0.08;
      const estimatedDayTotal = cRun + fStore + gApi;

      if (day.officialValue !== undefined && day.officialValue !== null && day.officialValue > 0) {
        dailyTotal = day.officialValue;
        breakdown = {
          cloudRun: dailyTotal.toFixed(3),
          firestore: '0.00',
          gemini: '0.00'
        };
      } else {
        dailyTotal = estimatedDayTotal;
        breakdown = {
          cloudRun: cRun.toFixed(3),
          firestore: fStore.toFixed(3),
          gemini: gApi.toFixed(3)
        };
      }

      accumulated += dailyTotal;
      
      return {
        date: day.lastUpdate.split('-').slice(2).join('/'), 
        'Valor do Dia': Number(dailyTotal.toFixed(dailyTotal < 1 ? 3 : 2)),
        'Valor Acumulado': Number(accumulated.toFixed(accumulated < 1 ? 3 : 2)),
        breakdown
      };
    });
  }, [dailyUsageHistory, usageStats]);

  const billingSummary = useMemo(() => {
    // --- DADOS REAIS DO CONSOLE (FORNECIDOS PELO USUÁRIO PARA ABRIL/2026) ---
    // Período: 1-21 de Abril
    const officialActualApril = 42.15;
    const officialForecastApril = 41.78;
    const officialCloudRun = 29.13;
    const officialGemini = 12.38;
    const officialFirestore = 0.64;

    if (chartData.length === 0) {
      return {
        totalActualBRL: officialActualApril,
        totalForecastBRL: officialForecastApril,
        totalCloudRun: officialCloudRun,
        totalFirestore: officialFirestore,
        totalGemini: officialGemini,
        periodLabel: '1-21 Abr',
        currentMonthName: 'Abril'
      };
    }
    
    const lastEntry = chartData[chartData.length - 1];
    const estimatedSum = lastEntry['Valor Acumulado'];
    
    // Se o acumulado estimado for menor que o valor oficial de 21 dias, usamos o oficial
    // Isso garante que o resumo nunca recue em relação ao dado verificado pelo usuário
    const totalActualBRL = Math.max(officialActualApril, estimatedSum);
    
    const now = new Date();
    const daysElapsed = now.getDate();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Calcula a previsão baseada no valor real oficial até dia 21 + projeção dos dias restantes
    const totalForecastBRL = totalActualBRL > officialActualApril 
      ? (totalActualBRL / daysElapsed) * totalDaysInMonth
      : officialForecastApril;
    
    let totalCloudRun = officialCloudRun;
    let totalFirestore = officialFirestore;
    let totalGemini = officialGemini;
    
    // Soma apenas a diferença das estimativas recentes após o dia 21, se houver
    if (estimatedSum > officialActualApril) {
      // Nota: Aqui poderíamos refinar a distribuição por serviço da diferença
    }

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const currentMonthName = monthNames[now.getMonth()];
    const periodLabel = daysElapsed <= 21 ? '1-21 Abr (Verificado)' : `1-${daysElapsed} ${currentMonthName}`;

    return {
      totalActualBRL,
      totalForecastBRL,
      totalCloudRun,
      totalFirestore,
      totalGemini,
      periodLabel,
      currentMonthName
    };
  }, [chartData]);

  const toggleAdmin = async (player: Player) => {
    if (player.email?.trim().toLowerCase() === 'rodneyes@gmail.com') {
      showNotification('O Administrador Master não pode ser alterado.', 'error');
      return;
    }
    
    try {
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { isAdmin: !player.isAdmin });
      
      if (player.uid) {
        const userRef = doc(db, 'users', player.uid);
        await setDoc(userRef, { role: !player.isAdmin ? 'ADMIN' : 'MEMBER' }, { merge: true });
      }
      
      showNotification(`${player.name} agora é ${!player.isAdmin ? 'Administrador' : 'Sócio'}.`, 'success');
    } catch (error) {
      console.error('Erro ao alterar privilégios:', error);
      showNotification('Erro ao alterar privilégios.', 'error');
    }
  };

  if (userRole !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-white/5 border border-brand-primary/40 rounded-full text-brand-primary">
          <Shield className="w-16 h-16" />
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h2>
        <p className="text-white/60 font-bold uppercase tracking-widest text-sm">Esta área é exclusiva para administradores</p>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'members', label: 'Sócios & Acesso', icon: UsersIcon },
    { id: 'sentinel', label: 'Agente Sentinela', icon: Bot },
    { id: 'maintenance', label: 'Manutenção', icon: Database },
    { id: 'notifications', label: 'Notificações', icon: MessageSquare },
    { id: 'tournaments', label: 'Torneios', icon: Trophy },
    { id: 'system', label: 'Sistema', icon: Settings },
    { id: 'audit', label: 'Auditoria', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-brand-light p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-xl">
        <div className="flex items-center gap-6">
          <Logo size="md" />
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center">
              Painel Admin
              <HelpTooltip 
                title="Painel do Administrador" 
                content="Área restrita para gestão do aplicativo. Aqui você pode aprovar novos sócios, editar perfis, resetar dados, criar torneios e configurar regras do sistema."
              />
            </h2>
            <p className="text-xs font-bold text-white uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v3.0</p>
          </div>
        </div>
        
        <motion.nav 
          initial={{ x: 0 }}
          animate={{ x: [0, -100, 0] }}
          transition={{ 
            duration: 1.5, 
            delay: 0.5,
            ease: "easeInOut",
            times: [0, 0.5, 1]
          }}
          className="flex items-center bg-brand-light/40 p-1.5 rounded-2xl border border-white/5 overflow-x-auto max-w-full scrollbar-hide"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </motion.nav>
      </div>

      <div className="min-h-[600px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Monitor de Memória */}
                  <MemoryMonitorCard />
                  <BleModuleConfigCard />

                  {/* Aniversariantes do Dia */}
                  {todayBirthdays.length > 0 && (
                    <section className="bg-brand-primary/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                      <div className="flex items-center gap-4">
                        <Trophy className="w-6 h-6 text-brand-primary" />
                        <h3 className="text-xl font-black uppercase tracking-tight text-white">Aniversariantes do Dia</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {todayBirthdays.map(player => (
                          <BirthdayAdminCard 
                            key={player.id} 
                            player={player} 
                            onSendPush={sendBirthdayPush} 
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Solicitações Pendentes */}
                  {pendingRequests.length > 0 && (
                    <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40">
                            <UserPlus className="w-5 h-5 text-brand-primary" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Solicitações Pendentes</h3>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Novos usuários aguardando aprovação</p>
                          </div>
                        </div>
                        <span className="bg-brand-primary text-brand-secondary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                          {pendingRequests.length}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {pendingRequests.map((req) => (
                          <div key={req.id} className="bg-brand-primary/5 backdrop-blur-md rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5 hover:border-brand-primary/40 transition-all">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                                <UserCheck className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-sm font-black uppercase tracking-tight">{req.name}</p>
                                <p className="text-[10px] font-medium text-brand-primary/60">{req.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                              <button 
                                onClick={() => onRejectRequest(req.id)}
                                className="flex-1 md:flex-none p-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl transition-all border border-rose-500/10"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => onApproveRequest(req)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border border-emerald-500/10"
                              >
                                <Check className="w-4 h-4" /> Aprovar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Status do Sistema */}
                  <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40">
                        <Activity className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Status da Sessão</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Sócios", value: players.length, icon: UsersIcon },
                        { label: "Partidas", value: matches.length, icon: Swords },
                        { label: "Finanças", value: payments.length, icon: CreditCard },
                        { label: "Versão", value: "3.0.0", icon: Zap }
                      ].map((stat, i) => (
                        <div key={i} className="bg-brand-primary/5 p-5 rounded-2xl border border-white/5 flex flex-col items-center text-center space-y-2">
                          <stat.icon className="w-5 h-5 text-brand-primary/40" />
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                          <p className="text-xl font-black font-mono">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </section>


                  {/* Consumo de Recursos */}
                  <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40">
                        <Zap className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Consumo & Cotas</h3>
                    </div>
                    
                    <div className="space-y-6">
                      {[
                        { label: "Leituras Firestore", value: usageStats.reads, max: systemMetadata.dailyReadQuota || 50000 },
                        { label: "Escritas Firestore", value: usageStats.writes, max: 20000 },
                        { label: "Chamadas IA (Gemini)", value: usageStats.aiCalls || 0, max: systemMetadata.dailyAICallsQuota || 100 },
                      ].map((stat, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-sm font-black font-mono">{stat.value} / {stat.max}</p>
                          </div>
                          <div className="h-1.5 bg-brand-primary/10 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ${
                                (stat.value / stat.max) > 0.8 ? 'bg-rose-500' : (stat.value / stat.max) > 0.5 ? 'bg-brand-primary' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (stat.value / (stat.max || 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 bg-brand-primary rounded-full mt-1.5" />
                        <p className="text-[9px] text-white/40 font-medium leading-relaxed">
                          <span className="text-brand-primary font-black">Reset do App:</span> Meia-noite (Brasília). Atualmente o app usa a data de Brasília para os contadores.
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-1 bg-brand-primary rounded-full mt-1.5" />
                        <p className="text-[9px] text-white/40 font-medium leading-relaxed">
                          <span className="text-brand-primary font-black">Reset do Google:</span> Meia-noite (Horário do Pacífico), que equivale às <span className="text-white/60">04:00 AM</span> em Brasília.
                        </p>
                      </div>
                    </div>









                  </section>

                    
                    
<section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary text-white space-y-6">
  <h3 className="text-lg font-black uppercase tracking-tight text-white">Configurações</h3>
  <div className="space-y-4">
    <div className="space-y-2">
      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cota Diária IA</p>
      <div className="grid grid-cols-4 gap-2">
        {[50, 100, 200, 500].map(q => (
          <button
            key={q}
            onClick={() => setSystemMetadata({ dailyAICallsQuota: q })}
            className={`py-2 rounded-xl text-[10px] font-black transition-all ${
              (systemMetadata.dailyAICallsQuota || 100) === q
                ? 'bg-brand-primary text-brand-secondary'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
    <div className="space-y-2">
      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cota Total Leituras</p>
      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
        <input
          type="number"
          defaultValue={systemMetadata.dailyReadQuota || 50000}
          onBlur={(e) => updateQuotaSettings(parseInt(e.target.value))}
          className="flex-1 bg-transparent border-none text-sm font-black text-white focus:outline-none"
        />
        <span className="text-[10px] text-white/20 font-black uppercase">Leituras</span>
      </div>
    </div>
  </div>
</section>

                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm text-white space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <ShieldCheck className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Gestão & Controle de Sócios</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Gerencie membros e monitore consumo</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                      <input 
                        type="text"
                        placeholder="Buscar sócio..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-[10px] font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all w-48"
                      />
                    </div>
                    <button 
                      onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }}
                      className="bg-brand-primary text-brand-secondary px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-brand-primary/20"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Novo Sócio
                    </button>
                    <div className="bg-brand-primary/10 px-4 py-2 rounded-xl border border-brand-primary/40">
                      <p className="text-[9px] font-black text-white uppercase tracking-widest">Cota por Sócio</p>
                      <p className="text-sm font-black text-white">
                        ~{Math.floor((systemMetadata.dailyReadQuota || 50000) / (players.length || 1))} leituras/dia
                      </p>
                    </div>
                  </div>
                </div>

                {/* Level Audit Section */}
                {levelSuggestions.length > 0 && (
                  <div className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-brand-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Auditoria de Performance</h4>
                        <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Sugestões de Reajuste de Nível baseadas em Consistência e ELO</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {levelSuggestions.map((suggestion) => (
                        <div key={suggestion.playerId} className="bg-black/40 border border-white/5 p-4 rounded-2xl hover:border-brand-primary/30 transition-all group overflow-hidden relative">
                          <div className={`absolute top-0 right-0 w-16 h-16 opacity-5 -mr-4 -mt-4 transition-transform group-hover:scale-110 ${suggestion.type === 'UPGRADE' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {suggestion.type === 'UPGRADE' ? <TrendingUp className="w-full h-full" /> : <TrendingDown className="w-full h-full" />}
                          </div>
                          
                          <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between mb-3">
                              <div className="min-w-0">
                                <p className="text-xs font-black text-white uppercase truncate">{suggestion.playerName}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[7px] font-black uppercase text-white/40">Atual: {suggestion.currentLevel === 3 ? 'Elite' : suggestion.currentLevel === 2 ? 'Médio' : 'Base'}</span>
                                  <ArrowRight className="w-2 h-2 text-white/20" />
                                  <span className={`text-[7px] font-black uppercase ${suggestion.type === 'UPGRADE' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    Sugerido: {suggestion.suggestedLevel === 3 ? 'Elite' : suggestion.suggestedLevel === 2 ? 'Médio' : 'Base'}
                                  </span>
                                </div>
                              </div>
                              <div className={`p-1.5 rounded-lg ${suggestion.type === 'UPGRADE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {suggestion.type === 'UPGRADE' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              </div>
                            </div>
                            
                            <p className="text-[9px] font-bold text-white/40 leading-relaxed mb-4 flex-1">
                              {suggestion.reason}
                            </p>

                            <button 
                              onClick={() => approveLevelSuggestion(suggestion)}
                              className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                suggestion.type === 'UPGRADE' 
                                  ? 'bg-emerald-500 text-black hover:bg-emerald-400' 
                                  : 'bg-rose-500 text-white hover:bg-rose-600'
                              }`}
                            >
                              Aplicar Reajuste
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto -mx-8 px-8">
                  <table className="w-full text-left border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                        <th className="px-2 py-1">Sócio</th>
                        <th className="px-2 py-1">Permissão</th>
                        <th className="px-2 py-1">Acessos (Dia/Total)</th>
                        <th className="px-2 py-1">Uso R/W (Dia/Total)</th>
                        <th className="px-2 py-1">Status da Cota</th>
                        <th className="px-2 py-1 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filtered = players
                          .filter(p => {
                            if (!memberSearch) return true;
                            return p.name.toLowerCase().includes(memberSearch.toLowerCase()) || 
                                   p.email?.toLowerCase().includes(memberSearch.toLowerCase());
                          });

                        const rodney = filtered.find(p => p.email?.toLowerCase() === 'rodneyes@gmail.com');
                        const others = filtered
                          .filter(p => p.email?.toLowerCase() !== 'rodneyes@gmail.com')
                          .sort((a, b) => ((b.reads || 0) + (b.writes || 0)) - ((a.reads || 0) + (a.writes || 0)));
                        
                        const list = rodney ? [rodney, ...others] : others;
                        return list.map(player => {
                          const quota = Math.floor((systemMetadata.dailyReadQuota || 50000) / (players.length || 1));
                          const usage = (player.reads || 0);
                          const percentage = Math.min(100, (usage / quota) * 100);
                          const isMaster = player.email?.toLowerCase() === 'rodneyes@gmail.com';
                          const isAdmin = player.isAdmin || isMaster;
                          
                          return (
                            <tr key={player.id} className={`bg-white/5 hover:bg-white/10 transition-all group border border-white/5 ${isMaster ? 'border-l-2 border-l-brand-primary' : ''}`}>
                              <td className="px-2 py-3 rounded-l-xl">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0 ${isMaster ? 'bg-brand-primary text-brand-secondary' : 'bg-white/10 text-white'}`}>
                                    {player.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <div className="shrink-0 mr-1" title={`Nível: ${player.impactLevel === 3 ? 'Elite' : player.impactLevel === 2 ? 'Médio' : 'Base'}`}>
                                        {getImpactIcon(player.impactLevel)}
                                      </div>
                                      <p className="text-[11px] font-black text-white uppercase tracking-tight truncate max-w-[120px]">
                                        {player.name}
                                      </p>
                                      {isMaster && (
                                        <span className="px-1 py-0.5 bg-brand-primary/20 text-brand-primary text-[6px] rounded uppercase tracking-tighter border border-brand-primary/40">Master</span>
                                      )}
                                      {player.impactLevel && player.impactLevel > 1 && (
                                        <span className={`px-1 py-0.5 text-[6px] rounded uppercase tracking-tighter border ${
                                          player.impactLevel === 3 
                                            ? 'bg-brand-primary text-black border-brand-primary' 
                                            : 'bg-white/10 text-brand-primary border-brand-primary/40'
                                        }`}>
                                          {player.impactLevel === 3 ? 'Elite' : 'Médio'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-tight truncate max-w-[140px]">{player.email || 'Sem email'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3">
                                {isMaster ? (
                                  <span className="bg-brand-secondary text-brand-primary text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 border border-brand-primary/40 w-fit">
                                    <Shield className="w-2 h-2" /> Master
                                  </span>
                                ) : isAdmin ? (
                                  <span className="bg-brand-primary/20 text-brand-primary text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 border border-brand-primary/40 w-fit">
                                    <Shield className="w-2 h-2" /> Admin
                                  </span>
                                ) : (
                                  <span className="bg-white/5 text-white/20 text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 border border-white/5 w-fit">
                                    Sócio
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-3">
                                <p className="text-[10px] font-black font-mono text-white/60">
                                  {player.dailyAccesses || 0} <span className="text-white/20">/</span> {player.accesses || 0}
                                </p>
                              </td>
                              <td className="px-2 py-3">
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-black font-mono text-white/60">
                                    {player.reads || 0} / {player.writes || 0}
                                  </p>
                                  <p className="text-[8px] font-bold font-mono text-white/20 uppercase">
                                    Total: {player.totalReads || 0} / {player.totalWrites || 0}
                                  </p>
                                </div>
                              </td>
                              <td className="px-2 py-3">
                                <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden mb-1">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      percentage > 80 ? 'bg-rose-500' : percentage > 50 ? 'bg-brand-primary' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-3 rounded-r-xl text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button 
                                    onClick={() => { setSelectedRankingPlayerId(player.id); setViewMode('dashboard'); }}
                                    className="p-1.5 rounded-lg text-white/20 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                                    title="Ver Análise de Performance"
                                  >
                                    <Trophy className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }}
                                    className="p-1.5 rounded-lg text-white/20 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                                    title="Editar Sócio"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {user?.email?.toLowerCase() === 'rodneyes@gmail.com' && !isMaster && (
                                    <button 
                                      onClick={() => toggleAdmin(player)}
                                      className={`p-1.5 rounded-lg transition-all ${isAdmin ? 'text-rose-500 hover:bg-rose-500/10' : 'text-brand-primary hover:bg-brand-primary/10'}`}
                                      title={isAdmin ? "Remover Admin" : "Tornar Admin"}
                                    >
                                      {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5 opacity-20" />}
                                    </button>
                                  )}
                                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">
                                    {player.lastReadUpdate ? new Date(player.lastReadUpdate).toLocaleDateString('pt-BR') : '--/--'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'sentinel' && (
              <div className="space-y-8">
                <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40 animate-pulse">
                        <Bot className="w-6 h-6 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                          Agente Sentinela IA
                          <span className="bg-brand-primary text-black text-[10px] px-2 py-0.5 rounded-full font-black">BETA</span>
                        </h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Monitoramento, Integridade e Estabilidade de Acesso</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={runSentinelScan}
                      disabled={isRunningSentinel}
                      className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg ${
                        isRunningSentinel 
                          ? 'bg-white/10 text-white/30 cursor-not-allowed' 
                          : 'bg-brand-primary text-brand-secondary hover:scale-105 shadow-brand-primary/20'
                      }`}
                    >
                      {isRunningSentinel ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Varrendo Sistema...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Executar Varredura Profunda
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/20">
                    <div className="flex gap-4">
                      <AlertTriangle className="w-5 h-5 text-brand-primary shrink-0 mt-1" />
                      <div>
                        <p className="text-xs font-bold text-white/70 leading-relaxed">
                          O Sentinela analisa em tempo real os logs de login, inconsistências de ELO, audit logs e saúde da infraestrutura para garantir que nenhum sócio tenha problemas técnicos ao usar o app.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-6">
                  {loadingSentinel ? (
                    <div className="flex flex-col items-center py-20 animate-pulse">
                      <Bot className="w-12 h-12 text-white/10 mb-4" />
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Consultando relatórios históricos...</p>
                    </div>
                  ) : sentinelReports.length === 0 ? (
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-20 text-center space-y-4">
                      <Shield className="w-16 h-16 text-white/10 mx-auto" />
                      <h4 className="text-xl font-black text-white/40 uppercase">Nenhum relatório gerado</h4>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Execute sua primeira varredura para iniciar o monitoramento ativo</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <h4 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <History className="w-5 h-5 text-brand-primary" />
                        Histórico de Relatórios
                      </h4>
                      {sentinelReports.map((report) => (
                        <div key={report.id} className="bg-brand-light/50 backdrop-blur-xl rounded-[2.5rem] border border-white/5 overflow-hidden">
                          <div className={`p-6 border-b border-white/5 flex items-center justify-between ${
                            report.status === 'CRITICAL' ? 'bg-rose-500/10' : report.status === 'WARNING' ? 'bg-amber-500/10' : 'bg-brand-primary/10'
                          }`}>
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                                report.status === 'CRITICAL' 
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-500' 
                                  : report.status === 'WARNING' 
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-500' 
                                    : 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary'
                              }`}>
                                {report.status === 'CRITICAL' ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                              </div>
                              <div>
                                <h5 className="font-black text-white uppercase tracking-tight">Status: {report.status || 'CONCLUÍDO'}</h5>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{new Date(report.timestamp).toLocaleString('pt-BR')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right hidden md:block">
                                <p className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">Anomalias</p>
                                <p className="text-lg font-black text-white leading-none">{report.anomaliesFound || 0}</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-8 prose prose-invert prose-sm max-w-none">
                            <div className="markdown-body text-white/80 leading-relaxed">
                              <Markdown>
                                {report.report}
                              </Markdown>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'maintenance' && (
              <div className="space-y-8">
                {/* Agente IA */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm text-white space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                  
                  <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 backdrop-blur rounded-xl flex items-center justify-center border border-brand-primary/40">
                        <Activity className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white">Agente de Integridade IA</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Varrer banco de dados em busca de anomalias</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={fixDatabaseAnomalies}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all bg-brand-primary hover:bg-brand-primary/85 text-brand-secondary shadow-lg shadow-brand-primary/20"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Corrigir
                      </button>
                      <button 
                        onClick={handleScanAnomalies}
                        disabled={isScanningAnomalies}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                          isScanningAnomalies 
                            ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                            : 'bg-white/10 hover:bg-white/20 text-white border border-brand-primary/40'
                        }`}
                      >
                        {isScanningAnomalies ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Escaneando...</>
                        ) : (
                          <><Search className="w-3.5 h-3.5" /> Varredura</>
                        )}
                      </button>
                    </div>
                  </div>

                  {anomalyReport && (
                    <div className="relative bg-black/40 backdrop-blur border border-white/5 rounded-2xl p-6 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="flex items-center gap-2 mb-4 text-brand-primary">
                        <Shield className="w-4 h-4" />
                        <h4 className="font-black uppercase tracking-widest text-[10px]">Relatório Técnico</h4>
                      </div>
                      <div className="prose prose-invert prose-xs max-w-none prose-p:text-white/60 prose-strong:text-brand-primary">
                        <Markdown>{anomalyReport}</Markdown>
                      </div>
                    </div>
                  )}
                </section>

                {/* Manutenção de Dados */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Database className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Manutenção de Dados</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { 
                        label: "Testar Push", 
                        desc: "Envia uma notificação de teste para você agora.", 
                        action: async () => {
                          if (!currentPlayer?.fcmToken) {
                            showNotification('Seu token de notificação não foi encontrado. Ative as notificações no sino da barra lateral.', 'error');
                            return;
                          }
                          try {
                            const batch = writeBatch(db);
                            const notifRef = doc(collection(db, 'fcm_messages'));
                            batch.set(notifRef, {
                              token: currentPlayer.fcmToken,
                              notification: {
                                title: 'Teste de Notificação',
                                body: 'Se você está vendo isso, as notificações Push estão funcionando!'
                              },
                              createdAt: serverTimestamp()
                            });
                            await batch.commit();
                            showNotification('Notificação de teste enviada!', 'success');
                          } catch (error) {
                            showNotification('Erro ao enviar notificação de teste.', 'error');
                          }
                        }, 
                        icon: BellRing 
                      },
                      { 
                        label: "Recuperar Hoje", 
                        desc: "Recalcula estatísticas diárias via histórico.", 
                        action: recalculateDailyStats, 
                        icon: RefreshCw 
                      },
                      { 
                        label: "Finalizar Sessão", 
                        desc: "Zera estatísticas diárias e arquiva jogos.", 
                        action: resetDailyStats, 
                        icon: History 
                      },
                      { 
                        label: "Reparar Banco", 
                        desc: "Corrige inconsistências e limpa dados órfãos.", 
                        action: repairDatabase, 
                        icon: Database 
                      },
                      { 
                        label: "Recalcular ELO", 
                        desc: "Recalcula todos os pontos (+20/-20) desde o início.", 
                        action: recalculateAllElo, 
                        icon: TrendingUp 
                      },
                      { 
                        label: "Histórico ELO", 
                        desc: "Inicializa pontos de evolução para todos.", 
                        action: initializeEloHistory, 
                        icon: Clock 
                      },
                      { 
                        label: "Forçar Sync", 
                        desc: "Sincroniza dados locais com a nuvem.", 
                        action: triggerSync, 
                        icon: RefreshCw 
                      },
                      { 
                        label: "Recalcular Stats", 
                        desc: "Reconstrói sinergias e rivalidades.", 
                        action: recalculateStats, 
                        icon: Activity 
                      },
                      {
                        label: "Limpar Mensagens",
                        desc: "Apaga todas as notificações do sistema.",
                        action: () => {
                          showConfirmModal(
                            "Limpar Mensagens",
                            "Tem certeza que deseja apagar TODAS as notificações do sistema para todos os usuários?",
                            async () => {
                              try {
                                const notifsSnap = await getDocs(collection(db, 'notifications'));
                                let count = 0;
                                
                                // Firestore batch limit is 500
                                for (let i = 0; i < notifsSnap.docs.length; i += 400) {
                                  const chunk = notifsSnap.docs.slice(i, i + 400);
                                  const batch = writeBatch(db);
                                  chunk.forEach(d => {
                                    batch.delete(d.ref);
                                    count++;
                                  });
                                  await batch.commit();
                                }
                                
                                if (count > 0) {
                                  showNotification(`${count} mensagens apagadas com sucesso!`, 'success');
                                } else {
                                  showNotification('Nenhuma mensagem para apagar.', 'info');
                                }
                              } catch (error) {
                                showNotification('Erro ao apagar mensagens.', 'error');
                              }
                            }
                          );
                        },
                        icon: Trash2
                      }
                    ].map((btn, i) => (
                      <button 
                        key={i}
                        onClick={btn.action}
                        className="flex flex-col items-start p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group text-left"
                      >
                        <btn.icon className="w-6 h-6 text-brand-primary mb-3 group-hover:scale-110 transition-transform" />
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest mb-1">{btn.label}</h4>
                        <p className="text-white/40 text-[9px] leading-relaxed">{btn.desc}</p>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'notifications' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm text-white space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <MessageSquare className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Monitor de Notificações</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Acompanhe todas as mensagens enviadas aos sócios</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                    <h4 className="text-sm font-black text-white uppercase tracking-tight">Gerenciamento de Mensagens</h4>
                    {[
                      { key: 'matchNotificationsGlobalEnabled', label: 'Notificações de Partidas' },
                      { key: 'birthdayNotificationsEnabled', label: 'Mensagens de Aniversários' },
                      { key: 'intentionNotificationsEnabled', label: 'Lista de Intenções' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between p-4 bg-black rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-white uppercase">{label}</span>
                        <button
                          onClick={() => {
                            const newState = systemMetadata[key] !== false;
                            updateSystemMetadata({ [key]: !newState });
                            showNotification(`${label} ${!newState ? 'ativadas' : 'desativadas'}!`, !newState ? 'success' : 'info');
                          }}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            systemMetadata[key] !== false
                              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                              : 'bg-brand-primary text-black'
                          }`}
                        >
                          {systemMetadata[key] !== false ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">Notificações do Sistema</h3>
                  <button
                    onClick={() => {
                      showConfirmModal(
                        'Limpar Todas as Notificações',
                        'Tem certeza que deseja apagar todas as notificações recebidas?',
                        async () => {
                          try {
                            // Get all notifications to clear everything, not just the visible 100
                            const allNotifsSnap = await getDocs(collection(db, 'notifications'));
                            
                            if (allNotifsSnap.empty) {
                              showNotification('Não há notificações para limpar.', 'info');
                              return;
                            }

                            // Firestore batch limit is 500
                            const docs = allNotifsSnap.docs;
                            for (let i = 0; i < docs.length; i += 400) {
                              const batch = writeBatch(db);
                              const chunk = docs.slice(i, i + 400);
                              chunk.forEach(d => {
                                batch.delete(d.ref);
                              });
                              await batch.commit();
                            }
                            
                            setAllNotifications([]);
                            showNotification(`${docs.length} notificações foram limpas.`, 'success');
                          } catch (e) {
                            console.error(e);
                            showNotification('Erro ao limpar notificações.', 'error');
                          }
                        }
                      );
                    }}
                    className="px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border border-rose-500/30"
                  >
                    Limpar Mensagens
                  </button>
                </div>

                <div className="space-y-4">
                  {loadingNotifications ? (
                    <div className="flex justify-center py-20">
                      <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
                    </div>
                  ) : allNotifications.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                      <p className="text-sm font-black text-white/40 uppercase">Nenhuma notificação encontrada no sistema.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {allNotifications.map(notif => {
                        const player = players.find(p => p.id === notif.playerId);
                        return (
                          <div key={notif.id} className="bg-white/5 border border-white/5 rounded-2xl p-6 hover:border-brand-primary/20 transition-all">
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary text-[8px] font-black rounded uppercase border border-brand-primary/20">
                                    {notif.type || 'SISTEMA'}
                                  </span>
                                  <span className="text-[10px] font-black text-white uppercase tracking-tight">
                                    Para: <span className="text-brand-primary">{player?.name || 'Sócio Desconhecido'}</span>
                                  </span>
                                </div>
                                <h4 className="text-sm font-black text-white uppercase tracking-tight">{notif.title}</h4>
                                <div className="text-xs text-white/60 leading-relaxed max-w-2xl">
                                  <Markdown>{notif.message}</Markdown>
                                </div>
                                <div className="flex items-center gap-4 pt-2">
                                  <span className="text-[9px] text-white/30 font-bold uppercase">
                                    Enviada: {new Date(notif.createdAt).toLocaleString('pt-BR')}
                                  </span>
                                  {notif.read ? (
                                    <span className="flex items-center gap-1 text-[9px] text-emerald-500 font-bold uppercase">
                                      <Check className="w-3 h-3" /> Lida
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[9px] text-white/20 font-bold uppercase">
                                      <Clock className="w-3 h-3" /> Pendente
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button 
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'notifications', notif.id));
                                    showNotification('Notificação removida.', 'success');
                                  } catch (e) {
                                    showNotification('Erro ao remover.', 'error');
                                  }
                                }}
                                className="p-2 text-white/20 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'tournaments' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Trophy className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Gerenciar Torneios</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Controle de visibilidade e histórico</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const newValue = !systemMetadata.isTournamentEnabled;
                      updateSystemMetadata({ isTournamentEnabled: newValue });
                      showNotification(`Visualização do Torneio ${newValue ? 'Habilitada' : 'Desabilitada'}.`, 'info');
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                      systemMetadata.isTournamentEnabled 
                        ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                        : 'bg-white/5 text-white/40 border border-brand-primary/40 hover:bg-white/10'
                    }`}
                  >
                    {systemMetadata.isTournamentEnabled ? (
                      <><Check className="w-3.5 h-3.5" /> Visível</>
                    ) : (
                      <><X className="w-3.5 h-3.5" /> Oculto</>
                    )}
                  </button>
                </div>

                <div className="overflow-x-auto -mx-8 px-8">
                  <table className="w-full text-left border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                        <th className="px-4 py-2">Data</th>
                        <th className="px-4 py-2">Times</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournaments.map(tournament => (
                        <tr key={tournament.id} className="bg-white/5 hover:bg-white/10 transition-all group border border-white/5">
                          <td className="px-4 py-4 rounded-l-2xl">
                            <p className="text-xs font-black text-white uppercase tracking-tight">
                              {new Date(tournament.date).toLocaleDateString('pt-BR')}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-xs font-bold text-white/60">{tournament.teams.length} Times</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-0.5 text-[7px] font-black rounded uppercase tracking-widest ${
                              tournament.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40'
                            }`}>
                              {tournament.status === 'completed' ? 'Concluído' : 'Em Andamento'}
                            </span>
                          </td>
                          <td className="px-4 py-4 rounded-r-2xl text-right">
                            <button 
                              onClick={() => {
                                showConfirmModal(
                                  'Excluir Torneio',
                                  'Tem certeza que deseja excluir este torneio? Esta ação é irreversível.',
                                  () => deleteTournament(tournament.id)
                                );
                              }}
                              className="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tournaments.length === 0 && (
                    <div className="py-12 text-center bg-white/5 rounded-3xl border border-dashed border-brand-primary/40">
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Nenhum torneio registrado</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'system' && (
              <div className="space-y-8">
                {/* Configurações de Algoritmo */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Zap className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Algoritmo de Ranking</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Defina como a força dos jogadores é calculada</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Cálculo de Eficiência Técnica</h4>
                        <p className="text-white/30 text-[9px] font-medium">Algoritmo avançado para balanceamento de times</p>
                      </div>
                      <button 
                        onClick={() => {
                          const currentState = systemMetadata.useTrueSkill !== false;
                          updateSystemMetadata({ useTrueSkill: !currentState });
                          showNotification(`Cálculo de Eficiência ${!currentState ? 'Habilitado' : 'Desabilitado'}.`, !currentState ? 'success' : 'info');
                        }}
                        className={`min-w-[80px] px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex justify-center items-center gap-2 ${
                          systemMetadata.useTrueSkill !== false
                            ? 'bg-brand-primary text-brand-secondary shadow-[0_0_15px_rgba(255,215,0,0.3)]' 
                            : 'bg-white/5 text-white/40 border border-brand-primary/40 hover:bg-white/10'
                        }`}
                      >
                        {systemMetadata.useTrueSkill !== false ? (
                          <><Check className="w-3.5 h-3.5" /> ON</>
                        ) : (
                          <><X className="w-3.5 h-3.5" /> OFF</>
                        )}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Configurações de Visibilidade */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Eye className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Visibilidade Global</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Fila de Prioridade Elite</h4>
                        <p className="text-white/30 text-[9px] font-medium">Oculta a fila para todos os usuários</p>
                      </div>
                      <button 
                        onClick={() => {
                          const newValue = !systemMetadata.showEliteQueue;
                          updateSystemMetadata({ showEliteQueue: newValue });
                          showNotification(`Fila de Elite ${newValue ? 'Visível' : 'Oculta'} para todos.`, 'info');
                        }}
                        className={`px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all ${
                          systemMetadata.showEliteQueue 
                            ? 'bg-brand-primary text-brand-secondary' 
                            : 'bg-white/10 text-white/40 border border-brand-primary/40'
                        }`}
                      >
                        {systemMetadata.showEliteQueue ? 'Visível' : 'Oculto'}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Automations Config */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Settings className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Automações Diárias</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Serviço de Background (CRON)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Mensagens de Aniversário</h4>
                        <p className="text-white/30 text-[9px] font-medium">Verificação todo dia as 09:00 AM</p>
                      </div>
                      <button 
                        onClick={() => {
                          const newValue = systemMetadata.enableAutoBirthdays === false ? true : false;
                          updateSystemMetadata({ enableAutoBirthdays: newValue });
                          showNotification(`Mensagens de aniversário ${newValue ? 'Habilitadas' : 'Desabilitadas'}.`, 'info');
                        }}
                        className={`min-w-[80px] px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex justify-center items-center gap-2 ${
                          systemMetadata.enableAutoBirthdays !== false
                            ? 'bg-brand-primary text-brand-secondary shadow-[0_0_15px_rgba(255,215,0,0.3)]' 
                            : 'bg-white/5 text-white/40 border border-brand-primary/40 hover:bg-white/10'
                        }`}
                      >
                        {systemMetadata.enableAutoBirthdays !== false ? (
                          <><Check className="w-3.5 h-3.5" /> ON</>
                        ) : (
                          <><X className="w-3.5 h-3.5" /> OFF</>
                        )}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Backup & Export */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <Download className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Exportação & Backup</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button className="flex items-center gap-4 p-5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all text-left">
                      <Download className="w-5 h-5 text-brand-primary flex-shrink-0" />
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Exportar CSV</h4>
                        <p className="text-white/30 text-[9px] font-medium">Lista de sócios e ELO</p>
                      </div>
                    </button>

                    <button className="flex items-center gap-4 p-5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all text-left">
                      <Upload className="w-5 h-5 text-brand-primary flex-shrink-0" />
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Importar JSON</h4>
                        <p className="text-white/30 text-[9px] font-medium">Restaurar via arquivo</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => createDataSnapshot()}
                      className="flex items-center gap-4 p-6 bg-brand-primary text-brand-secondary rounded-2xl hover:bg-brand-primary/90 transition-all text-left shadow-lg shadow-brand-primary/20 md:col-span-2"
                    >
                      <Shield className="w-6 h-6 flex-shrink-0" />
                      <div>
                        <h4 className="font-black uppercase text-[10px] tracking-widest">Criar Snapshot de Segurança</h4>
                        <p className="text-brand-secondary/70 text-[9px] font-medium mt-0.5">Backup manual do estado atual do banco</p>
                      </div>
                    </button>
                  </div>
                </section>

                {/* Zona de Perigo */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-rose-500 shadow-sm space-y-6">
                  <div className="flex items-center gap-4 text-rose-500">
                    <AlertTriangle className="w-6 h-6" />
                    <h3 className="text-lg font-black uppercase tracking-tight text-white">Zona de Perigo</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button 
                      onClick={clearMatchesOnly}
                      className="p-5 bg-rose-500/5 text-rose-500 border border-rose-500/10 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-500/10 transition-all text-center"
                    >
                      Zerar Partidas
                    </button>
                    <button 
                      onClick={resetElo}
                      className="p-5 bg-rose-500/5 text-rose-500 border border-rose-500/10 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-500/10 transition-all text-center"
                    >
                      Resetar ELOs
                    </button>
                    <button 
                      onClick={clearAllHistory}
                      className="p-5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-500/20 transition-all text-center"
                    >
                      Apagar Histórico
                    </button>
                    <button 
                      onClick={clearAllDatabase}
                      className="md:col-span-3 p-5 bg-rose-600/10 text-rose-600 border border-rose-600/30 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-600/20 transition-all text-center"
                    >
                      Limpar Todo o Banco (Nuclear)
                    </button>
                  </div>
                  <p className="text-rose-500/40 text-[8px] font-bold text-center uppercase tracking-widest">
                    Ações nesta área são irreversíveis. Tenha cautela absoluta.
                  </p>
                </section>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 mb-4 text-white">
                  <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40">
                    <History className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white">Log de Auditoria</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Histórico de ações administrativas no sistema</p>
                  </div>
                </div>

                <div className="bg-brand-light rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
                  {loadingLogs ? (
                    <div className="p-20 flex flex-col items-center justify-center space-y-4">
                      <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
                      <p className="text-xs font-black uppercase tracking-widest text-white/40">Carregando logs...</p>
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="p-20 text-center space-y-4">
                      <ShieldCheck className="w-12 h-12 text-white/10 mx-auto" />
                      <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhum log encontrado</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/5">
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Data/Hora</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Ação</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Sócio</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Executado por</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-4">
                                <p className="text-xs font-mono text-white/60">
                                  {new Date(log.timestamp).toLocaleString('pt-BR')}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                  log.action.includes('DELETE') ? 'bg-rose-500/10 text-rose-500' :
                                  log.action.includes('CREATE') ? 'bg-emerald-500/10 text-emerald-500' :
                                  log.action.includes('DM') ? 'bg-amber-500/10 text-amber-500' :
                                  'bg-brand-primary/10 text-brand-primary'
                                }`}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-black text-white uppercase">{log.playerName}</p>
                                <p className="text-[10px] font-mono text-white/20">{log.playerId}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-bold text-white/60">{log.performedByEmail}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
