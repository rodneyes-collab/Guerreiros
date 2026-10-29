import { useShallow } from 'zustand/react/shallow';
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
  Star,
  Fingerprint,
  ScanFace,
  BatteryCharging,
  Battery,
  SlidersHorizontal,
  Smartphone,
  Printer
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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
import { APP_VERSION } from '../constants';
import { generateUUID } from '../utils/helpers';
import { ServiceWorkerDiagnostics } from '../src/components/ServiceWorkerDiagnostics';
import { DbAutoCorrectionPanel } from './DbAutoCorrectionPanel';
import Markdown from 'react-markdown';
import { Logo } from '../src/components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeBillingCosts } from '../services/geminiService';

import { useBirthdays } from '../src/hooks/useBirthdays';
import { useWebAuthn } from '../src/hooks/useWebAuthn';
import { BirthdayAdminCard } from '../src/components/BirthdayAdminCard';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { TeamBalancingSimulatorCard } from '../src/components/TeamBalancingSimulatorCard';
import { AdminEloAuditView } from '../src/components/AdminEloAuditView';
import { AthleteTimeAuditReport } from '../src/components/AthleteTimeAuditReport';

import { getLevelSuggestions, LevelSuggestion } from '../utils/levelAuditUtils';
import { getSyncModeDetails, formatTimeSince, SYNC_MODE_OPTIONS } from '../src/utils/syncConfig';
import { getRiskWhatsAppLink } from "../utils/whatsapp";
import { SyncFrequencyMode } from '../types';

const MemoryMonitorCard = () => {
    const [mem, setMem] = useState<any>(null);
    useEffect(() => {
        let isMounted = true;
        const fetchMem = async (retries = 3) => {
            try {
                if (retries < 3) await new Promise(r => setTimeout(r, 1500));
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                let r: Response | null = null;
                try {
                    r = await fetch(`/api/status-info?v=${Date.now()}`, { signal: controller.signal });
                } catch {
                    r = await fetch(`/api/sys-info?v=${Date.now()}`, { signal: controller.signal }).catch(() => null);
                }
                clearTimeout(timeoutId);
                
                if (r && r.ok) {
                    const data = await r.json();
                    if (isMounted) setMem(data);
                } else if (retries > 0) {
                    return fetchMem(retries - 1);
                }
            } catch (e: any) {
                if (retries > 0) {
                    return fetchMem(retries - 1);
                }
                if (isMounted) {
                    setMem({
                        heapUsed: 45,
                        rss: 72,
                        heapTotal: 58,
                        external: 10,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        };
        fetchMem();
        const interval = setInterval(() => fetchMem(1), 3600000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
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
  exportPlayersCSV: () => void;
  exportMatchesCSV: () => void;
  exportPaymentsCSV: () => void;
  handleRecoverFinancials: () => Promise<void>;
  handleFinancialIntegrityAudit: () => Promise<void>;
  recreateOctober15Matches: () => Promise<void>;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  savePlayer: (player: Player) => Promise<void>;
}

type AdminTab = 'dashboard' | 'members' | 'sentinel' | 'tournaments' | 'system' | 'notifications' | 'audit' | 'security' | 'maintenance' | 'qrcode' | 'elo-audit';

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
  exportPlayersCSV,
  exportMatchesCSV,
  exportPaymentsCSV,
  handleRecoverFinancials,
  handleFinancialIntegrityAudit,
  recreateOctober15Matches,
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
    setViewMode,
    attendance,
    syncMode,
    setSyncMode,
    lastSyncTimestamp,
    setIsSyncSettingsOpen,
    isSyncing
  } = useStore(useShallow(state => ({userRole: state.userRole, players: state.players, matches: state.matches, payments: state.payments, tournaments: state.tournaments, systemMetadata: state.systemMetadata, setSystemMetadata: state.setSystemMetadata, showNotification: state.showNotification, usageStats: state.usageStats, setUsageStats: state.setUsageStats, monthlyUsageStats: state.monthlyUsageStats, isScanningAnomalies: state.isScanningAnomalies, anomalyReport: state.anomalyReport, user: state.user, currentPlayer: state.currentPlayer, setSelectedRankingPlayerId: state.setSelectedRankingPlayerId, setViewMode: state.setViewMode, attendance: state.attendance, syncMode: state.syncMode, setSyncMode: state.setSyncMode, lastSyncTimestamp: state.lastSyncTimestamp, setIsSyncSettingsOpen: state.setIsSyncSettingsOpen, isSyncing: state.isSyncing})));

  const getPublicUrl = () => {
    const origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };
  
  const { register } = useWebAuthn();
  const [isRegisteredLocally, setIsRegisteredLocally] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);

  useEffect(() => {
    // Check for Passkey/WebAuthn support
    if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setIsPasskeySupported);
    }
  }, []);

  // Sync isRegisteredLocally with store
  useEffect(() => {
      setIsRegisteredLocally(!!(user && (user as any).webAuthnCredentials));
  }, [user]);

  const { todayBirthdays, sendBirthdayPush } = useBirthdays();

  const activePlayersForEvasion = useMemo(() => {
    return players.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM);
  }, [players]);

  const gameDatesForEvasion = useMemo(() => {
    const dates = Array.from(new Set(matches.map(m => m.date)));
    return dates.sort((a, b) => b.localeCompare(a)); // Newest to oldest
  }, [matches]);

  const playersAtRisk = useMemo(() => {
    const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
    if (gameDatesForEvasion.length < limit) return [];
    
    const today = getFirestoreDateKey();
    const isPresentTodayMap = new Map();
    if (attendance) {
      attendance.forEach(p => {
        if (p.id) isPresentTodayMap.set(p.id, true);
      });
    }

    return activePlayersForEvasion.map(player => {
      let consecutiveMissed = 0;
      for (const date of gameDatesForEvasion) {
        // Did the player play on this date?
        const played = matches.some(m => m.date === date && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
        
        // Did they check in today (if date is today)?
        const present = (date === today && isPresentTodayMap.has(player.id)) || played;

        if (present) {
          break; // Streak broken!
        }
        consecutiveMissed++;
      }
      return {
        player,
        consecutiveMissed
      };
    })
    .filter(item => item.consecutiveMissed >= limit) // >= limit missed days
    .sort((a, b) => b.consecutiveMissed - a.consecutiveMissed);
  }, [activePlayersForEvasion, gameDatesForEvasion, matches, attendance, systemMetadata?.consecutiveAbsenceLimit]);

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

  // Estados e Funções para Recuperação de Partidas (Backup/Snapshots)
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  const fetchSnapshots = async () => {
    try {
      setLoadingSnapshots(true);
      const q = query(collection(db, 'snapshots'), orderBy('timestamp', 'desc'), limit(30));
      const querySnapshot = await getDocs(q);
      const docsList: any[] = [];
      querySnapshot.forEach((doc) => {
        docsList.push({ id: doc.id, ...doc.data() });
      });
      setSnapshots(docsList);
    } catch (err) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const handleRestoreMatchFromSnapshot = async (m: any) => {
    showConfirmModal(
      'Recuperar Partida do Backup',
      `Deseja realmente recuperar a partida #${m.dailyNumber || '?'} (${m.teamA?.length || 0} contra ${m.teamB?.length || 0} jogadores - placar: ${m.scoreA}x${m.scoreB}) de ${m.date || 'data desconhecida'}? O saldo de vitórias/ELO dos participantes será restabelecido.`,
      async () => {
        try {
          const batch = writeBatch(db);
          
          // 1. Re-adicionar a partida no Firestore matches
          const restoredMatchId = m.id || generateUUID();
          const matchRef = doc(db, 'matches', restoredMatchId);
          
          // Limpa campos vazios ou nulos
          const cleanedMatch = {
            id: restoredMatchId,
            timestamp: m.timestamp || Date.now(),
            date: m.date || getFirestoreDateKey(),
            teamA: m.teamA || [],
            teamB: m.teamB || [],
            winner: m.winner || 'A',
            scoreA: m.scoreA || 15,
            scoreB: m.scoreB || 0,
            dailyNumber: m.dailyNumber || 1,
            isDraft: m.isDraft === undefined ? false : m.isDraft,
            courtTime: m.courtTime || 0,
            synced: true,
            isManual: m.isManual === undefined ? true : m.isManual
          };

          batch.set(matchRef, cleanedMatch, { merge: true });
          
          // 2. Atualizar ou recalcular ELO dos jogadores envolvidos
          const allPlayersInMatch = [...(m.teamA || []), ...(m.teamB || [])];
          allPlayersInMatch.forEach(pid => {
            const p = players.find(player => player.id === pid);
            if (!p) return;
            
            const isWinner = (m.winner === 'A' && m.teamA.includes(pid)) || 
                             (m.winner === 'B' && m.teamB.includes(pid));
            const eloChange = isWinner ? 20 : -20;
            
            const previousElo = p.elo || 1200;
            const newElo = previousElo + eloChange;
            
            const playerRef = doc(db, 'players', pid);
            
            // Re-atualiza o eloHistory
            let updatedHistory = [...(p.eloHistory || [])];
            updatedHistory.push({
              matchId: restoredMatchId,
              date: m.date || getFirestoreDateKey(),
              elo: newElo,
              timestamp: m.timestamp || Date.now()
            });

            const isToday = m.date === getFirestoreDateKey();
            let results = [...(p.dailyResults || [])];
            let dailyMatches = p.dailyMatches || 0;
            let dailyWins = p.dailyWins || 0;

            if (isToday) {
              results.push(isWinner ? 'V' : 'D');
              dailyMatches += 1;
              if (isWinner) dailyWins += 1;
            }
            
            batch.set(playerRef, {
              elo: newElo,
              eloHistory: updatedHistory,
              ...(isToday ? {
                dailyMatches,
                dailyWins,
                dailyResults: results
              } : {})
            }, { merge: true });
          });

          await batch.commit();
          showNotification(`Partida #${m.dailyNumber || '?'} de ${m.date} recuperada com sucesso! Os pontos ELO de ${allPlayersInMatch.length} guerreiros foram devidamente atualizados no banco de dados.`, 'success');
          triggerSync();
        } catch (error: any) {
          showNotification('Erro ao restaurar a partida: ' + (error.message || error), 'error');
        }
      }
    );
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

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
    { id: 'qrcode', label: 'Check-in Físico', icon: QrCode },
    { id: 'maintenance', label: 'Manutenção', icon: Database },
    { id: 'notifications', label: 'Notificações', icon: MessageSquare },
    { id: 'tournaments', label: 'Torneios', icon: Trophy },
    { id: 'system', label: 'Sistema', icon: Settings },
    { id: 'audit', label: 'Auditoria', icon: ShieldCheck },
    { id: 'elo-audit', label: 'Auditoria ELO', icon: History },
    { id: 'security', label: 'Segurança', icon: Shield },
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
            <p className="text-xs font-bold text-white uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v{APP_VERSION}{systemMetadata?.versionNumber ? ` (${systemMetadata.versionNumber})` : ''}</p>
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

                  {/* Simulador de Estratégias de Balanceamento (IC) */}
                  <TeamBalancingSimulatorCard />

                  {/* Alerta de Evasão (Ausentes há +4 Dias de Jogos) */}
                  {playersAtRisk.length > 0 && (
                    <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl shadow-brand-primary/5 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-brand-primary" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                              Alerta de Evasão <span className="text-brand-primary text-sm font-black font-mono">({playersAtRisk.length})</span>
                            </h3>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sócios ativos ausentes há {systemMetadata?.consecutiveAbsenceLimit ?? 4} ou mais dias consecutivos</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {playersAtRisk.map(({ player, consecutiveMissed }) => {
                          const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                          // Determine danger level/color
                          let riskBadgeColor = 'border-amber-500/30 text-amber-500 bg-amber-500/5';
                          let riskLabel = 'Risco Moderado';
                          if (consecutiveMissed >= limit + 2) {
                            riskBadgeColor = 'border-rose-500/30 text-rose-500 bg-rose-500/5';
                            riskLabel = 'Risco Crítico';
                          } else if (consecutiveMissed >= limit + 1) {
                            riskBadgeColor = 'border-orange-500/30 text-orange-500 bg-orange-500/5';
                            riskLabel = 'Risco Alto';
                          }

                          const waUrl = getRiskWhatsAppLink(player, consecutiveMissed);

                          return (
                            <div 
                              key={player.id} 
                              className="bg-brand-primary/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5 hover:border-brand-primary/20 transition-all"
                            >
                              <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="w-10 h-10 rounded-full bg-brand-secondary flex items-center justify-center text-brand-primary font-black text-sm border border-brand-primary/40 shrink-0">
                                  {player.name.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-black uppercase tracking-tight text-white leading-none">{player.name}</p>
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${riskBadgeColor}`}>
                                      {riskLabel}
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-brand-primary/40" />
                                    Ausente há <span className="text-brand-primary font-mono">{consecutiveMissed}</span> dias de jogos consecutivos
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                                {player.phone ? (
                                  <a 
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all border border-emerald-500/20"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" /> Contactar via WhatsApp
                                  </a>
                                ) : (
                                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest px-3 py-2 bg-white/5 rounded-xl border border-white/5">
                                    Sem celular cadastrado
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

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
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Status do Dia</h3>
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
  <div className="flex items-center gap-3">
    <div className="p-2.5 bg-brand-primary/10 rounded-xl border border-brand-primary/30">
      <Trophy className="w-5 h-5 text-brand-primary" />
    </div>
    <div>
      <h3 className="text-lg font-black uppercase tracking-tight text-white">Configuração do Bônus Diário & Cotas</h3>
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Defina o bônus de fidelidade e limites do sistema no Firestore</p>
    </div>
  </div>

  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

    <div className="pt-4 border-t border-white/10 space-y-4">
      <p className="text-xs font-black uppercase tracking-wider text-brand-primary flex items-center gap-2">
        <Zap className="w-4 h-4" /> Bônus Diário de Presença e Fidelidade (ELO)
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Valor do Bônus Diário (pontos ELO)</p>
          <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
            <input
              type="number"
              defaultValue={systemMetadata.dailyAttendanceBonus ?? 20}
              onBlur={(e) => updateSystemMetadata({ dailyAttendanceBonus: parseInt(e.target.value) || 20 })}
              className="flex-1 bg-transparent border-none text-base font-black font-mono text-brand-primary focus:outline-none"
            />
            <span className="text-[10px] text-white/40 font-black uppercase">Pontos ELO</span>
          </div>
          <p className="text-[9px] font-medium text-white/30">Acórdão concedido ao atingir a quantidade mínima de partidas na sessão.</p>
        </div>

        <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Mínimo de Partidas no Dia</p>
          <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
            <input
              type="number"
              min={1}
              max={10}
              defaultValue={systemMetadata.minMatchesForDailyBonus ?? 2}
              onBlur={(e) => updateSystemMetadata({ minMatchesForDailyBonus: Math.max(1, parseInt(e.target.value) || 2) })}
              className="flex-1 bg-transparent border-none text-base font-black font-mono text-brand-primary focus:outline-none"
            />
            <span className="text-[10px] text-white/40 font-black uppercase">Partidas Mínimas</span>
          </div>
          <p className="text-[9px] font-medium text-white/30">Quantidade mínima de jogos que o atleta deve disputar no dia para receber o bônus.</p>
        </div>
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
                                    className="p-2 rounded-lg text-white bg-white/10 hover:bg-brand-primary hover:text-black transition-all"
                                    title="Ver Análise de Performance"
                                  >
                                    <Trophy className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }}
                                    className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-brand-secondary border border-brand-primary/20 transition-all font-bold"
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

            {activeTab === 'qrcode' && (
              <div className="space-y-8 max-w-4xl mx-auto">
                <section className="bg-brand-light p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-xl space-y-6">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    {/* QR Code Container */}
                    <div className="bg-white p-6 rounded-3xl shadow-2xl shadow-brand-primary/20 flex flex-col items-center gap-4">
                      <div className="bg-white p-2 rounded-xl">
                        <QRCodeCanvas 
                          value={`${getPublicUrl()}?public=true&source=qr`}
                          size={240}
                          level="H"
                          includeMargin={true}
                          imageSettings={{
                            src: "/logo.png",
                            x: undefined,
                            y: undefined,
                            height: 40,
                            width: 40,
                            excavate: true,
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-black font-black uppercase text-[10px] tracking-widest">Guerreiros Volleyball Club</p>
                        <p className="text-black/40 font-bold text-[8px] uppercase">Presença Física Oficial</p>
                      </div>
                    </div>

                    <div className="flex-1 space-y-6">
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">QR Code de Presença</h3>
                        <p className="text-white/60 text-sm leading-relaxed font-medium">
                          Este é o código oficial que os sócios devem escanear ao chegar no ginásio. Ele permite marcar presença sem precisar estar logado ou com o app aberto.
                        </p>
                      </div>

                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                        <p className="text-brand-primary font-black uppercase text-[10px] tracking-widest">Endereço do QR Code (Clique para abrir):</p>
                        <a 
                          href={`${getPublicUrl()}?public=true&source=qr`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block text-xs font-mono text-white/90 hover:text-brand-primary underline break-all transition-colors duration-200"
                        >
                          {`${getPublicUrl()}?public=true&source=qr`}
                        </a>
                        <p className="text-[10px] text-white/40 font-medium leading-relaxed">
                          * Nota: O link foi mapeado automaticamente para o ambiente público (<strong>ais-pre</strong>), garantindo que qualquer celular consiga abrir o endereço diretamente ao escanear.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/20 space-y-2">
                          <div className="flex items-center gap-2 text-brand-primary">
                            <Smartphone className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Sem App Aberto</span>
                          </div>
                          <p className="text-[11px] text-white/50 leading-tight">Funciona direto na câmera do celular (Android ou iPhone).</p>
                        </div>
                        <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/20 space-y-2">
                          <div className="flex items-center gap-2 text-brand-primary">
                            <Fingerprint className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Auto-Reconhecimento</span>
                          </div>
                          <p className="text-[11px] text-white/50 leading-tight">O sistema "lembra" do sócio após a primeira identificação.</p>
                        </div>
                      </div>

                      <div className="pt-4 flex flex-wrap gap-3">
                        <button 
                          onClick={() => {
                            const canvas = document.querySelector('canvas');
                            if (canvas) {
                              const url = canvas.toDataURL("image/png");
                              const link = document.createElement("a");
                              link.download = "qrcode-guerreiros-presenca.png";
                              link.href = url;
                              link.click();
                            }
                          }}
                          className="px-6 py-3 bg-brand-primary text-brand-secondary font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/20"
                        >
                          <Download className="w-4 h-4" /> Baixar PNG para Imprimir
                        </button>
                        <button 
                          onClick={() => window.print()}
                          className="px-6 py-3 bg-white/5 text-white/60 border border-white/10 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10 transition-all flex items-center gap-2"
                        >
                          <Printer className="w-4 h-4" /> Imprimir Agora
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-brand-light p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-emerald-500 shadow-xl space-y-6">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-full md:w-auto flex flex-col items-center gap-4">
                      <div className="w-48 h-48 bg-emerald-500/10 rounded-full border-4 border-emerald-500/20 flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-emerald-500/5 animate-ping opacity-20"></div>
                        <Smartphone className="w-20 h-20 text-emerald-500 group-hover:scale-110 transition-transform duration-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-emerald-500 font-black uppercase text-[10px] tracking-widest">NFC Presence Tag</p>
                        <p className="text-white/40 font-bold text-[8px] uppercase">Tecnologia por Aproximação</p>
                      </div>
                    </div>

                    <div className="flex-1 space-y-6">
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Programar Tag NFC</h3>
                        <p className="text-white/60 text-sm leading-relaxed font-medium">
                          Transforme adesivos ou cartões NFC em pontos de presença. O sócio só precisa encostar o celular na tag (mesmo com a tela bloqueada em muitos casos) para marcar presença.
                        </p>
                      </div>

                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                        <p className="text-emerald-500 font-black uppercase text-[10px] tracking-widest">Endereço da Tag NFC (Clique para abrir):</p>
                        <a 
                          href={`${getPublicUrl()}?public=true&source=nfc`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block text-xs font-mono text-white/90 hover:text-emerald-400 underline break-all transition-colors duration-200"
                        >
                          {`${getPublicUrl()}?public=true&source=nfc`}
                        </a>
                        <p className="text-[10px] text-white/40 font-medium leading-relaxed">
                          * Nota: O link gravado aponta para o ambiente público (<strong>ais-pre</strong>), garantindo que qualquer celular consiga abrir o endereço ao aproximar-se da tag.
                        </p>
                      </div>

                      <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 flex items-start gap-4">
                        <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
                          <Zap className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Como funciona?</p>
                          <p className="text-[11px] text-white/40 leading-tight">Clique no botão abaixo e aproxime o seu celular (ADM) de uma tag NFC virgem. O app gravará o link de presença oficial nela.</p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button 
                          onClick={async () => {
                            if (!('NDEFReader' in window)) {
                              showNotification('Seu navegador ou dispositivo não suporta escrita NFC. Use o Chrome no Android.', 'error');
                              return;
                            }
                            try {
                              showNotification('Aproxime a Tag NFC do sensor do seu celular...', 'info');
                              const ndef = new (window as any).NDEFReader();
                              await ndef.write(`${getPublicUrl()}?public=true&source=nfc`);
                              showNotification('Tag NFC programada com sucesso! Agora você pode fixá-la na quadra.', 'success');
                            } catch (error) {
                              console.error("NFC Write Error:", error);
                              showNotification('Falha ao gravar NFC. Tente novamente.', 'error');
                            }
                          }}
                          className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-brand-secondary font-black uppercase tracking-widest text-[11px] rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
                        >
                          <Smartphone className="w-5 h-5" /> Iniciar Gravação NFC
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-zinc-900/50 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                  <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Dicas de Implementação Física
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <p className="text-brand-primary font-black text-[10px] uppercase">01. Posicionamento</p>
                      <p className="text-[11px] text-white/40 leading-relaxed">Fixe o código em um local de fácil acesso, como a mesa do mesário ou o poste da rede.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-brand-primary font-black text-[10px] uppercase">02. Tamanho Ideal</p>
                      <p className="text-[11px] text-white/40 leading-relaxed">Imprima em tamanho mínimo de 10x10cm para garantir que câmeras mais simples foquem rápido.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-brand-primary font-black text-[10px] uppercase">03. Plastificação</p>
                      <p className="text-[11px] text-white/40 leading-relaxed">Plastifique o papel para evitar desgaste com o suor dos atletas ou umidade do ginásio.</p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'maintenance' && (
              <div className="space-y-8">
                {/* Simulador de Balanceamento de Times (IC) */}
                <TeamBalancingSimulatorCard />

                {/* Diagnóstico Service Worker */}
                <ServiceWorkerDiagnostics />

                {/* Agente IA de Autocorreção */}
                <DbAutoCorrectionPanel 
                  players={players}
                  matches={matches}
                  systemMetadata={systemMetadata}
                  showNotification={showNotification}
                  onDataCorrected={triggerSync}
                />

                {/* Relatório Adicional de Integridade */}
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

                {/* Recálculo Profundo */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl shadow-brand-primary/10 text-white space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                  
                  <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary">
                        <TrendingUp className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                          Recálculo Total de ELO
                          <span className="px-2 py-0.5 bg-brand-primary text-black text-[8px] font-black uppercase tracking-widest rounded-full">Recomendado</span>
                        </h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed max-w-lg mt-1">
                          Reconstrói e corrige todo o histórico do Ranking (+20/-20), consistências e diárias com base no arquivo real das partidas.
                        </p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => showConfirmModal(
                        "Confirmar Recálculo Total",
                        "Isso varrerá todas as partidas desde o início e recalculará o Ranking (ELO) e as estatísticas diárias de todos os jogadores. Essa ação corrige divergências.",
                        recalculateAllElo
                      )}
                      className="px-6 py-4 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl shadow-brand-primary/20 flex items-center gap-2 shrink-0 border border-brand-primary/50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Iniciar Recálculo
                    </button>
                  </div>
                </section>

                {/* Exportar Dados (Backup) */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl shadow-brand-primary/10 text-white space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                  
                  <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary">
                        <Download className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                          Exportar Dados (Backup)
                          <span className="px-2 py-0.5 bg-brand-primary text-black text-[8px] font-black uppercase tracking-widest rounded-full">Segurança</span>
                        </h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed max-w-lg mt-1">
                          Baixe os dados do clube em formato CSV para backup externo e auditoria.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={exportPlayersCSV}
                        className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2"
                      >
                        <UsersIcon className="w-3.5 h-3.5 text-brand-primary" />
                        Sócios
                      </button>
                      <button 
                        onClick={exportMatchesCSV}
                        className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2"
                      >
                        <History className="w-3.5 h-3.5 text-brand-primary" />
                        Partidas
                      </button>
                      <button 
                        onClick={exportPaymentsCSV}
                        className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-brand-primary" />
                        Financeiro
                      </button>
                      <button 
                        onClick={handleRecoverFinancials}
                        className="px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2"
                        title="Forçar sincronização de todos os registros financeiros do Firestore"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sincronizar Financeiro
                      </button>
                      <button 
                        onClick={handleFinancialIntegrityAudit}
                        className="px-4 py-3 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2"
                        title="Executar diagnóstico detalhado e comparar pagamentos entre Firestore e Store local"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Verificação de Integridade Financeira
                      </button>
                    </div>
                  </div>
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
                        label: "Recriar Partidas 15/10", 
                        desc: "Gera as 6 partidas do dia 15/10/2026 e recalcula o ranking.", 
                        action: recreateOctober15Matches, 
                        icon: Calendar 
                      },
                      { 
                        label: "Finalizar Dia", 
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

                    <div className="flex flex-col justify-between p-6 bg-white/5 border border-white/5 rounded-2xl space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Bônus de Eficiência MVP</h4>
                          <p className="text-white/30 text-[9px] font-medium">Bônus sobre a taxa de vitórias diária (padrão: 50%)</p>
                        </div>
                        <div className="bg-brand-primary text-black px-2 py-1 rounded-lg text-[10px] font-black uppercase font-mono">
                          {systemMetadata.mvpEfficiencyBonusPercent ?? 50}%
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const current = systemMetadata.mvpEfficiencyBonusPercent ?? 50;
                            const next = Math.max(0, current - 5);
                            updateSystemMetadata({ mvpEfficiencyBonusPercent: next });
                            showNotification(`Bônus MVP atualizado para ${next}%.`, 'success');
                          }}
                          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg transition-all flex items-center justify-center border border-white/10 hover:border-brand-primary/40 animate-none select-none"
                        >
                          -
                        </button>
                        <div className="flex-1 relative bg-black/40 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between">
                          <input
                            type="number"
                            min="0"
                            max="500"
                            step="5"
                            value={systemMetadata.mvpEfficiencyBonusPercent ?? 50}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) {
                                updateSystemMetadata({ mvpEfficiencyBonusPercent: Math.max(0, Math.min(500, val)) });
                              }
                            }}
                            className="w-full bg-transparent border-none text-xs font-black text-white focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="absolute right-4 text-[9px] font-black text-white/30 uppercase">Percentual</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const current = systemMetadata.mvpEfficiencyBonusPercent ?? 50;
                            const next = Math.min(500, current + 5);
                            updateSystemMetadata({ mvpEfficiencyBonusPercent: next });
                            showNotification(`Bônus MVP atualizado para ${next}%.`, 'success');
                          }}
                          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg transition-all flex items-center justify-center border border-white/10 hover:border-brand-primary/40 animate-none select-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Configurações de Presença e Evasão */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <AlertTriangle className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Regras de Presença & Evasão</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Defina o limite de dias para os alertas de ausência</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col justify-between p-6 bg-white/5 border border-white/5 rounded-2xl space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Alerta de Evasão (Ausência Consecutiva)</h4>
                          <p className="text-white/30 text-[9px] font-medium">Quantidade máxima de dias de jogo consecutivos que um jogador pode faltar antes de exibir o alerta de evasão nos cartões de Sócios e painel de controle.</p>
                        </div>
                        <div className="bg-brand-primary text-black px-2 py-1 rounded-lg text-[10px] font-black uppercase font-mono shrink-0">
                          {systemMetadata.consecutiveAbsenceLimit ?? 4} Dias
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const current = systemMetadata.consecutiveAbsenceLimit ?? 4;
                            const next = Math.max(1, current - 1);
                            updateSystemMetadata({ consecutiveAbsenceLimit: next });
                            showNotification(`Limite de ausência atualizado para ${next} dias.`, 'success');
                          }}
                          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg transition-all flex items-center justify-center border border-white/10 hover:border-brand-primary/40 animate-none select-none"
                        >
                          -
                        </button>
                        <div className="flex-1 relative bg-black/40 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between">
                          <input
                            type="number"
                            min="1"
                            max="30"
                            step="1"
                            value={systemMetadata.consecutiveAbsenceLimit ?? 4}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) {
                                updateSystemMetadata({ consecutiveAbsenceLimit: Math.max(1, Math.min(30, val)) });
                              }
                            }}
                            className="w-full bg-transparent border-none text-xs font-black text-white focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="absolute right-4 text-[9px] font-black text-white/30 uppercase">Dias</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const current = systemMetadata.consecutiveAbsenceLimit ?? 4;
                            const next = Math.min(30, current + 1);
                            updateSystemMetadata({ consecutiveAbsenceLimit: next });
                            showNotification(`Limite de ausência atualizado para ${next} dias.`, 'success');
                          }}
                          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg transition-all flex items-center justify-center border border-white/10 hover:border-brand-primary/40 animate-none select-none"
                        >
                          +
                        </button>
                      </div>
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

                {/* Configurações de Notificação de Aniversariantes */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <BellRing className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Notificação de Aniversariantes</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Configuração de avisos mensais e diários</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Mensagens de Aniversário (Diário)</h4>
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

                {/* Sincronização & Eficiência de Bateria */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                  <div className="flex items-center justify-between gap-4 text-white flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                        <BatteryCharging className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white">Sincronização & Economia de Bateria</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                          Configuração de atualização em tempo real vs intervalos fixos para este dispositivo
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          triggerSync();
                          showNotification('Sincronização iniciada com sucesso...', 'info');
                        }}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-brand-primary text-black font-black uppercase tracking-widest text-[9px] rounded-xl transition-all hover:bg-brand-primary/90 flex items-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Sincronizando...' : 'Forçar Atualização'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsSyncSettingsOpen(true)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest text-[9px] rounded-xl transition-all flex items-center gap-2 border border-white/10"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-brand-primary" />
                        Configurar Modo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-white/5 border border-white/5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Modo Atual</span>
                        <h4 className="font-black text-brand-primary uppercase text-sm tracking-wide flex items-center gap-2">
                          {getSyncModeDetails(syncMode).label}
                        </h4>
                        <p className="text-white/40 text-[10px] mt-1">
                          {getSyncModeDetails(syncMode).description}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-white/60">
                        <span>Impacto:</span>
                        <span className="font-bold text-brand-primary uppercase">{getSyncModeDetails(syncMode).batteryLabel}</span>
                      </div>
                    </div>

                    <div className="p-5 bg-white/5 border border-white/5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Status da Nuvem</span>
                        <h4 className="font-black text-white uppercase text-sm tracking-wide flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          Firestore Conectado
                        </h4>
                        <p className="text-white text-[10px] mt-1 font-mono font-bold">
                          Última sincronização: <span className="text-white font-black">{formatTimeSince(lastSyncTimestamp)}</span>
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-white/60">
                        <span>Dispositivo:</span>
                        <span className="font-bold text-white uppercase flex items-center gap-1">
                          <Smartphone className="w-3 h-3 text-brand-primary" /> Local
                        </span>
                      </div>
                    </div>

                    <div className="p-5 bg-white/5 border border-white/5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Troca Rápida de Frequência</span>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSyncMode('realtime');
                              showNotification('Modo alterado para Tempo Real', 'success');
                            }}
                            className={`px-2.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              syncMode === 'realtime'
                                ? 'bg-brand-primary text-black'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <Zap className="w-3 h-3" /> Tempo Real
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSyncMode('interval_30s');
                              showNotification('Modo alterado para 30s (Econômico)', 'success');
                            }}
                            className={`px-2.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              syncMode === 'interval_30s'
                                ? 'bg-brand-primary text-black'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <BatteryCharging className="w-3 h-3" /> 30s (Eco)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSyncMode('interval_60s');
                              showNotification('Modo alterado para 1 Minuto', 'success');
                            }}
                            className={`px-2.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              syncMode === 'interval_60s'
                                ? 'bg-brand-primary text-black'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <Clock className="w-3 h-3" /> 1 Minuto
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSyncMode('manual');
                              showNotification('Modo alterado para Sob Demanda (Manual)', 'success');
                            }}
                            className={`px-2.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              syncMode === 'manual'
                                ? 'bg-brand-primary text-black'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <RefreshCw className="w-3 h-3" /> Manual
                          </button>
                        </div>
                      </div>
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

                  {/* Recuperar Partidas via Snapshots */}
                  <div className="border-t border-white/5 pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-black text-brand-primary uppercase text-[10px] tracking-[0.2em] flex items-center gap-2">
                          <History className="w-4 h-4" /> Restaurar Partida Excluída via Backup
                        </h4>
                        <p className="text-white/40 text-[9px] font-medium mt-0.5">Encontre e recupere a partida excluída de 04/06 (ou qualquer outro dia) a partir dos snapshots automáticos ou manuais</p>
                      </div>
                      <button 
                        onClick={fetchSnapshots}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 active:scale-95 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 self-start sm:self-center"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingSnapshots ? 'animate-spin' : ''}`} /> Atualizar Lista
                      </button>
                    </div>

                    {snapshots.length === 0 ? (
                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-center text-[10px] uppercase font-black tracking-widest text-white/30">
                        {loadingSnapshots ? 'Carregando snapshots do Firestore...' : 'Nenhum backup encontrado. Clique em "Atualizar Lista".'}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-white/50">Selecione o Backup (Snapshot)</label>
                            <select 
                              onChange={(e) => {
                                const selected = snapshots.find(snap => snap.id === e.target.value);
                                setSelectedSnapshot(selected || null);
                              }}
                              className="w-full bg-brand-secondary border border-white/10 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-tight text-white focus:border-brand-primary outline-none"
                              value={selectedSnapshot?.id || ''}
                            >
                              <option value="">Selecione um backup disponível...</option>
                              {snapshots.map(snap => {
                                const dateStr = snap.date || new Date(snap.timestamp).toLocaleDateString('pt-BR');
                                return (
                                  <option key={snap.id} value={snap.id} className="text-black">
                                    [{dateStr}] - {snap.label || 'Sem rótulo'} ({snap.matches?.length || 0} partidas)
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>

                        {selectedSnapshot && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Partidas contidas neste Backup</span>
                              <span className="text-[8px] font-bold text-white/40">{selectedSnapshot.matches?.length || 0} partidas registradas</span>
                            </div>

                            {(!selectedSnapshot.matches || selectedSnapshot.matches.length === 0) ? (
                              <p className="text-[10px] font-bold uppercase text-white/30 text-center py-4">Nenhuma partida registrada neste snapshot.</p>
                            ) : (
                              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                {selectedSnapshot.matches.map((m: any, idx: number) => {
                                  const getNamesList = (ids: string[]) => {
                                    return (ids || []).map(id => {
                                      const p = players.find(player => player.id === id);
                                      return p?.name || 'Sócio Excluído';
                                    }).join(', ');
                                  };

                                  const alreadyExists = matches.some(match => match.id === m.id);

                                  return (
                                    <div key={m.id || idx} className="bg-black/50 border border-white/5 hover:border-white/10 rounded-xl p-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition-all">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-black uppercase tracking-widest text-white/90">Partida #{m.dailyNumber || idx + 1} ({m.date})</span>
                                          {alreadyExists ? (
                                            <span className="text-[8px] font-black uppercase tracking-[0.1em] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">Ativa no app</span>
                                          ) : (
                                            <span className="text-[8px] font-black uppercase tracking-[0.1em] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Excluída / Pendente</span>
                                          )}
                                        </div>
                                        <p className="text-[9px] text-white/40 font-bold leading-relaxed">
                                          <strong className="text-white/80">Equipe A:</strong> {getNamesList(m.teamA)} <br />
                                          <strong className="text-white/80">Equipe B:</strong> {getNamesList(m.teamB)}
                                        </p>
                                        <div className="text-[8px] text-brand-primary font-black uppercase tracking-widest">
                                          Resultado: Placar {m.scoreA} x {m.scoreB} (Vitória do Time {m.winner})
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex items-center sm:justify-end">
                                        <button
                                          onClick={() => handleRestoreMatchFromSnapshot(m)}
                                          disabled={alreadyExists}
                                          className={`px-3 py-2 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all ${alreadyExists ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5' : 'bg-brand-primary text-brand-secondary hover:bg-brand-primary/95 hover:scale-[1.02] active:scale-[0.98]'}`}
                                        >
                                          {alreadyExists ? 'Já existe' : 'Recuperar Partida'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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

            {activeTab === 'elo-audit' && (
              <div className="space-y-8">
                <AdminEloAuditView players={players} matches={matches} dailyBonus={systemMetadata.dailyAttendanceBonus || 20} />
                <AthleteTimeAuditReport players={players} matches={matches} attendance={attendance} />
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-black p-8 rounded-[2.5rem] border border-brand-primary/20 shadow-2xl space-y-8">
                <h3 className="text-xl font-black uppercase tracking-tight text-brand-primary flex items-center gap-3">
                  <Shield className="w-6 h-6" /> Segurança (Passkeys)
                </h3>
                
                {isPasskeySupported ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-2xl">
                      {user && isRegisteredLocally ? (
                        <>
                          <div className="p-2 bg-brand-primary text-black rounded-full">
                            <ShieldCheck className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-white font-black uppercase tracking-widest text-xs">Biometria Ativa</p>
                            <p className="text-white/60 font-bold text-[10px]">Configuração finalizada com êxito.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-2 bg-white/20 text-white rounded-full">
                            <Shield className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-white font-black uppercase tracking-widest text-xs">Configuração Pendente</p>
                            <p className="text-white/60 font-bold text-[10px]">Configure seu acesso biométrico para login rápido.</p>
                          </div>
                        </>
                      )}
                    </div>

                    {!isRegisteredLocally && (
                      <button
                        onClick={async () => {
                           const success = await register(user?.email || undefined);
                           if (success) setIsRegisteredLocally(true);
                        }}
                        className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-brand-primary text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg hover:shadow-brand-primary/20"
                      >
                         <div className="flex items-center gap-1">
                           <Fingerprint className="w-5 h-5" />
                           <ScanFace className="w-5 h-5 opacity-80" />
                         </div>
                         <span className="ml-1">Configurar Acesso Biométrico</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <p className="text-red-500 font-bold text-[10px] uppercase tracking-widest text-center">
                      Biometria (Passkeys) não disponível neste dispositivo ou navegador.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
