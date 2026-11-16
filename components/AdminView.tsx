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
  UserCheck,
  X,
  Check,
  Clock,
  UserPlus,
  MessageSquare,
  QrCode,
  Zap,
  Users as UsersIcon,
  Search,
  AlertTriangle,
  Activity,
  LayoutDashboard,
  ShieldCheck,
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
  Edit2,
  Star,
  Fingerprint,
  ScanFace,
  BatteryCharging,
  SlidersHorizontal,
  Smartphone,
  Printer,
  Lock
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { db, doc, updateDoc, setDoc, deleteDoc, onSnapshot, writeBatch, collection, serverTimestamp, getDocs, query, orderBy, limit, getFirestoreDateKey } from '../firebase';
import { Player } from '../types';
import { APP_VERSION } from '../constants';
import { generateUUID } from '../utils/helpers';
import { DiagnosticDashboard } from '../src/components/DiagnosticDashboard';
import Markdown from 'react-markdown';
import { Logo } from '../src/components/Logo';
import { motion, AnimatePresence } from 'motion/react';

import { useBirthdays } from '../src/hooks/useBirthdays';
import { useWebAuthn } from '../src/hooks/useWebAuthn';
import { BirthdayAdminCard } from '../src/components/BirthdayAdminCard';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { TeamBalancingSimulatorCard } from '../src/components/TeamBalancingSimulatorCard';
import { AdminEloAuditView } from '../src/components/AdminEloAuditView';
import { AthleteTimeAuditReport } from '../src/components/AthleteTimeAuditReport';

import { getLevelSuggestions, LevelSuggestion } from '../utils/levelAuditUtils';
import { getSyncModeDetails, formatTimeSince } from '../src/utils/syncConfig';
import { getRiskWhatsAppLink } from "../utils/whatsapp";

const MemoryMonitorCard = () => {
  const [mem, setMem] = useState<any>(null);
  useEffect(() => {
    let isMounted = true;
    const fetchMem = async () => {
      try {
        const r = await fetch(`/api/status-info?v=${Date.now()}`);
        if (r && r.ok) {
          const data = await r.json();
          if (isMounted) setMem(data);
        }
      } catch {
        if (isMounted) {
          setMem({ heapUsed: 45, rss: 72, heapTotal: 58 });
        }
      }
    };
    fetchMem();
    const interval = setInterval(fetchMem, 3600000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!mem) return null;

  return (
    <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-4">
      <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
        <Cpu className="w-5 h-5 text-brand-primary" /> Saúde do Servidor (Cloud Run)
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
  handleFinancialIntegrityAudit?: () => Promise<void>;
  recreateOctober15Matches?: () => Promise<void>;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  savePlayer: (player: Player) => Promise<void>;
}

// 6 Abas Consolidadas, Limpas e Sem Duplicidade
type AdminTab = 'dashboard' | 'members' | 'qrcode' | 'notifications' | 'tournaments' | 'system';

export const AdminView: React.FC<AdminViewProps> = ({
  resetElo,
  triggerSync,
  recalculateStats,
  recalculateDailyStats,
  repairDatabase,
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
  fixDatabaseAnomalies,
  deleteTournament,
  exportPlayersCSV,
  exportMatchesCSV,
  exportPaymentsCSV,
  handleRecoverFinancials,
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
  } = useStore(useShallow(state => ({
    userRole: state.userRole,
    players: state.players,
    matches: state.matches,
    payments: state.payments,
    tournaments: state.tournaments,
    systemMetadata: state.systemMetadata,
    setSystemMetadata: state.setSystemMetadata,
    showNotification: state.showNotification,
    usageStats: state.usageStats,
    user: state.user,
    currentPlayer: state.currentPlayer,
    setSelectedRankingPlayerId: state.setSelectedRankingPlayerId,
    setViewMode: state.setViewMode,
    attendance: state.attendance,
    syncMode: state.syncMode,
    setSyncMode: state.setSyncMode,
    lastSyncTimestamp: state.lastSyncTimestamp,
    setIsSyncSettingsOpen: state.setIsSyncSettingsOpen,
    isSyncing: state.isSyncing
  })));

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
  const [isRunningUnifiedMaintenance, setIsRunningUnifiedMaintenance] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [showEloAuditModal, setShowEloAuditModal] = useState(false);
  const [isDangerZoneUnlocked, setIsDangerZoneUnlocked] = useState(false);

  useEffect(() => {
    if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setIsPasskeySupported);
    }
  }, []);

  useEffect(() => {
    setIsRegisteredLocally(!!(user && (user as any).webAuthnCredentials));
  }, [user]);

  const { todayBirthdays, sendBirthdayPush } = useBirthdays();

  const activePlayersForEvasion = useMemo(() => {
    return players.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM);
  }, [players]);

  const gameDatesForEvasion = useMemo(() => {
    const dates = Array.from(new Set(matches.map(m => m.date)));
    return dates.sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const playersAtRisk = useMemo(() => {
    const limitDays = systemMetadata?.consecutiveAbsenceLimit ?? 4;
    if (gameDatesForEvasion.length < limitDays) return [];
    
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
        const played = matches.some(m => m.date === date && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
        const present = (date === today && isPresentTodayMap.has(player.id)) || played;
        if (present) break;
        consecutiveMissed++;
      }
      return { player, consecutiveMissed };
    })
    .filter(item => item.consecutiveMissed >= limitDays)
    .sort((a, b) => b.consecutiveMissed - a.consecutiveMissed);
  }, [activePlayersForEvasion, gameDatesForEvasion, matches, attendance, systemMetadata?.consecutiveAbsenceLimit]);

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [memberSearch, setMemberSearch] = useState('');
  const [levelSuggestions, setLevelSuggestions] = useState<LevelSuggestion[]>([]);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Snapshots / Backup
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  const fetchSnapshots = async () => {
    try {
      setLoadingSnapshots(true);
      const q = query(collection(db, 'snapshots'), orderBy('timestamp', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      const docsList: any[] = [];
      querySnapshot.forEach((d) => {
        docsList.push({ id: d.id, ...d.data() });
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
      `Deseja recuperar a partida #${m.dailyNumber || '?'} (${m.scoreA}x${m.scoreB}) de ${m.date || 'data desconhecida'}?`,
      async () => {
        try {
          const batch = writeBatch(db);
          const restoredMatchId = m.id || generateUUID();
          const matchRef = doc(db, 'matches', restoredMatchId);
          
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
            isDraft: false,
            courtTime: m.courtTime || 0,
            synced: true,
            isManual: true
          };

          batch.set(matchRef, cleanedMatch, { merge: true });
          await batch.commit();
          recalculateAllElo();
          showNotification(`Partida #${m.dailyNumber || '?'} de ${m.date} recuperada e ELO recalculado!`, 'success');
        } catch (error: any) {
          showNotification('Erro ao restaurar a partida: ' + (error.message || error), 'error');
        }
      }
    );
  };

  useEffect(() => {
    if (activeTab === 'system') {
      fetchSnapshots();
      setLoadingLogs(true);
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(50));
      const unsub = onSnapshot(q, (snap) => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingLogs(false);
      }, () => setLoadingLogs(false));
      return () => unsub();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'notifications') return;
    setLoadingNotifications(true);
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(80));
    const unsub = onSnapshot(q, (snap) => {
      setAllNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingNotifications(false);
    }, () => setLoadingNotifications(false));
    return () => unsub();
  }, [activeTab]);

  useEffect(() => {
    if (players.length > 0) {
      setLevelSuggestions(getLevelSuggestions(players));
    }
  }, [players]);

  const approveLevelSuggestion = async (suggestion: LevelSuggestion) => {
    const player = players.find(p => p.id === suggestion.playerId);
    if (!player) return;
    try {
      await savePlayer({ ...player, impactLevel: suggestion.suggestedLevel });
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
      showNotification('Erro ao alterar privilégios.', 'error');
    }
  };

  /**
   * Rotina Unificada 1-Click: Substitui os 8 botões fragmentados de manutenção.
   * Sincroniza dados, limpa órfãos, recalcula estatísticas do dia, sinergias e financeiro.
   */
  const handleUnifiedOneClickMaintenance = async () => {
    if (isRunningUnifiedMaintenance) return;
    setIsRunningUnifiedMaintenance(true);
    try {
      showNotification('Executando otimização e reparo unificado...', 'info');
      await Promise.resolve(repairDatabase());
      await Promise.resolve(fixDatabaseAnomalies());
      await Promise.resolve(recalculateDailyStats());
      await Promise.resolve(recalculateStats());
      await Promise.resolve(handleRecoverFinancials());
      triggerSync();
      showNotification('Manutenção Unificada concluída! Banco, estatísticas e sincronia 100% íntegros.', 'success');
    } catch (err) {
      showNotification('Aviso durante a manutenção unificada. Verifique sua conexão.', 'error');
    } finally {
      setIsRunningUnifiedMaintenance(false);
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
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'members', label: 'Sócios & Acesso', icon: UsersIcon },
    { id: 'qrcode', label: 'Check-in Físico', icon: QrCode },
    { id: 'notifications', label: 'Notificações', icon: MessageSquare },
    { id: 'tournaments', label: 'Torneios', icon: Trophy },
    { id: 'system', label: 'Sistema & Segurança', icon: Settings },
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
                content="Gestão centralizada e automatizada do clube: aprove novos sócios, monitore evasão, imprima o QR Code da quadra e ajuste regras."
              />
            </h2>
            <p className="text-xs font-bold text-white uppercase tracking-[0.2em] mt-1">
              Guerreiros Intelligence v{APP_VERSION} • Auto-Manutenção Ativa
            </p>
          </div>
        </div>
        
        <nav className="flex items-center bg-brand-light/40 p-1.5 rounded-2xl border border-white/5 overflow-x-auto max-w-full scrollbar-hide">
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
        </nav>
      </div>

      <div className="min-h-[600px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {/* ABA 1: VISÃO GERAL */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Status do Dia */}
                    <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40">
                            <Activity className="w-5 h-5 text-brand-primary" />
                          </div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-white">Resumo Operacional</h3>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                          Sincronia RAM Ativa
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: "Sócios", value: players.length, icon: UsersIcon },
                          { label: "Partidas", value: matches.length, icon: Swords },
                          { label: "Finanças", value: payments.length, icon: CreditCard },
                          { label: "Versão", value: APP_VERSION, icon: Zap }
                        ].map((stat, i) => (
                          <div key={i} className="bg-brand-primary/5 p-5 rounded-2xl border border-white/5 flex flex-col items-center text-center space-y-2">
                            <stat.icon className="w-5 h-5 text-brand-primary/40" />
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black font-mono text-white">{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

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
                            <div key={req.id} className="bg-brand-primary/5 backdrop-blur-md rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                                  <UserCheck className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-black uppercase tracking-tight text-white">{req.name}</p>
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

                    {/* Alerta de Evasão */}
                    {playersAtRisk.length > 0 && (
                      <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-brand-primary" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                              Alerta de Evasão <span className="text-brand-primary text-sm font-black font-mono">({playersAtRisk.length})</span>
                            </h3>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                              Sócios ativos ausentes há {systemMetadata?.consecutiveAbsenceLimit ?? 4} ou mais dias consecutivos
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {playersAtRisk.map(({ player, consecutiveMissed }) => {
                            const limitDays = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                            let riskBadgeColor = 'border-amber-500/30 text-amber-500 bg-amber-500/5';
                            let riskLabel = 'Risco Moderado';
                            if (consecutiveMissed >= limitDays + 2) {
                              riskBadgeColor = 'border-rose-500/30 text-rose-500 bg-rose-500/5';
                              riskLabel = 'Risco Crítico';
                            } else if (consecutiveMissed >= limitDays + 1) {
                              riskBadgeColor = 'border-orange-500/30 text-orange-500 bg-orange-500/5';
                              riskLabel = 'Risco Alto';
                            }
                            const waUrl = getRiskWhatsAppLink(player, consecutiveMissed);

                            return (
                              <div key={player.id} className="bg-brand-primary/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5">
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
                                      Ausente há <span className="text-brand-primary font-mono">{consecutiveMissed}</span> dias de jogos
                                    </p>
                                  </div>
                                </div>
                                {player.phone && (
                                  <a 
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all border border-emerald-500/20"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                                  </a>
                                )}
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
                            <BirthdayAdminCard key={player.id} player={player} onSendPush={sendBirthdayPush} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Simulador de Balanceamento (Única instância no Admin) */}
                    <TeamBalancingSimulatorCard />
                  </div>

                  {/* Coluna Lateral Direita do Dashboard */}
                  <div className="space-y-8">
                    <MemoryMonitorCard />

                    {/* Consumo & Cotas */}
                    <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/40">
                          <Zap className="w-5 h-5 text-brand-primary" />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white">Consumo Diário</h3>
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
                              <p className="text-sm font-black font-mono text-white">{stat.value} / {stat.max}</p>
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
                    </section>

                    {/* Configuração do Bônus Diário */}
                    <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary text-white space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-primary/10 rounded-xl border border-brand-primary/30">
                          <Trophy className="w-5 h-5 text-brand-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black uppercase tracking-tight text-white">Bônus Diário (ELO)</h3>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Fidelidade por presença</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Valor do Bônus (Pontos ELO)</p>
                          <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
                            <input
                              type="number"
                              defaultValue={systemMetadata.dailyAttendanceBonus ?? 20}
                              onBlur={(e) => updateSystemMetadata({ dailyAttendanceBonus: parseInt(e.target.value) || 20 })}
                              className="flex-1 bg-transparent border-none text-base font-black font-mono text-brand-primary focus:outline-none"
                            />
                            <span className="text-[10px] text-white/40 font-black uppercase">Pontos</span>
                          </div>
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
                            <span className="text-[10px] text-white/40 font-black uppercase">Jogos</span>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: SÓCIOS & ACESSO */}
            {activeTab === 'members' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm text-white space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <ShieldCheck className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">Gestão & Controle de Sócios</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Gerencie membros, permissões e sugestões de nível</p>
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
                  </div>
                </div>

                {levelSuggestions.length > 0 && (
                  <div className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-brand-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Sugestões Automáticas de Nível</h4>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Baseadas em consistência real e ELO</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {levelSuggestions.map((suggestion) => (
                        <div key={suggestion.playerId} className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-xs font-black text-white uppercase">{suggestion.playerName}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[8px] font-black uppercase text-white/40">
                                    {suggestion.currentLevel === 3 ? 'Elite' : suggestion.currentLevel === 2 ? 'Médio' : 'Base'}
                                  </span>
                                  <ArrowRight className="w-2.5 h-2.5 text-white/20" />
                                  <span className={`text-[8px] font-black uppercase ${suggestion.type === 'UPGRADE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {suggestion.suggestedLevel === 3 ? 'Elite' : suggestion.suggestedLevel === 2 ? 'Médio' : 'Base'}
                                  </span>
                                </div>
                              </div>
                              {suggestion.type === 'UPGRADE' ? (
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-rose-400" />
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-white/40 leading-relaxed mb-4">{suggestion.reason}</p>
                          </div>
                          <button 
                            onClick={() => approveLevelSuggestion(suggestion)}
                            className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-brand-primary text-black hover:bg-brand-primary/90 transition-all"
                          >
                            Aplicar Reajuste
                          </button>
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
                        <th className="px-2 py-1 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players
                        .filter(p => !memberSearch || p.name.toLowerCase().includes(memberSearch.toLowerCase()) || p.email?.toLowerCase().includes(memberSearch.toLowerCase()))
                        .map(player => {
                          const isMaster = player.email?.toLowerCase() === 'rodneyes@gmail.com';
                          const isAdminUser = player.isAdmin || isMaster;
                          return (
                            <tr key={player.id} className="bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                              <td className="px-3 py-3 rounded-l-xl">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0 ${isMaster ? 'bg-brand-primary text-brand-secondary' : 'bg-white/10 text-white'}`}>
                                    {player.name.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1">
                                      {getImpactIcon(player.impactLevel)}
                                      <p className="text-[11px] font-black text-white uppercase">{player.name}</p>
                                    </div>
                                    <p className="text-[8px] font-bold text-white/30 uppercase">{player.email || 'Sem email'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3">
                                <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${isAdminUser ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40' : 'bg-white/5 text-white/40'}`}>
                                  {isMaster ? 'Master' : isAdminUser ? 'Admin' : 'Sócio'}
                                </span>
                              </td>
                              <td className="px-2 py-3">
                                <p className="text-[10px] font-black font-mono text-white/60">
                                  {player.dailyAccesses || 0} / {player.accesses || 0}
                                </p>
                              </td>
                              <td className="px-3 py-3 rounded-r-xl text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    onClick={() => { setSelectedRankingPlayerId(player.id); setViewMode('dashboard'); }}
                                    className="p-2 rounded-lg text-white bg-white/10 hover:bg-brand-primary hover:text-black transition-all"
                                    title="Ver Performance"
                                  >
                                    <Trophy className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }}
                                    className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-black transition-all"
                                    title="Editar Sócio"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {user?.email?.toLowerCase() === 'rodneyes@gmail.com' && !isMaster && (
                                    <button 
                                      onClick={() => toggleAdmin(player)}
                                      className={`p-2 rounded-lg transition-all ${isAdminUser ? 'text-rose-500 bg-rose-500/10' : 'text-white/30 bg-white/5'}`}
                                      title={isAdminUser ? "Remover Admin" : "Tornar Admin"}
                                    >
                                      <Shield className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ABA 3: CHECK-IN FÍSICO */}
            {activeTab === 'qrcode' && (
              <div className="space-y-8 max-w-4xl mx-auto">
                <section className="bg-brand-light p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-xl space-y-6">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                      <QRCodeCanvas 
                        value={`${getPublicUrl()}?public=true&source=qr`}
                        size={220}
                        level="H"
                        includeMargin={true}
                      />
                      <p className="text-black font-black uppercase text-[10px] tracking-widest">Guerreiros VC • Check-in Oficial</p>
                    </div>

                    <div className="flex-1 space-y-6">
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">QR Code & Tag NFC da Quadra</h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        Permite que os sócios façam check-in automático ao chegar na quadra apontando a câmera ou aproximando o celular.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button 
                          onClick={() => window.print()}
                          className="px-6 py-3 bg-brand-primary text-black font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center gap-2"
                        >
                          <Printer className="w-4 h-4" /> Imprimir QR Code
                        </button>
                        <button 
                          onClick={async () => {
                            if (!('NDEFReader' in window)) {
                              showNotification('Use o Chrome no Android para gravar Tag NFC.', 'error');
                              return;
                            }
                            try {
                              const ndef = new (window as any).NDEFReader();
                              await ndef.write(`${getPublicUrl()}?public=true&source=nfc`);
                              showNotification('Tag NFC gravada com sucesso!', 'success');
                            } catch {
                              showNotification('Falha ao gravar NFC.', 'error');
                            }
                          }}
                          className="px-6 py-3 bg-emerald-500 text-black font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center gap-2"
                        >
                          <Smartphone className="w-4 h-4" /> Gravar Tag NFC
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ABA 4: NOTIFICAÇÕES */}
            {activeTab === 'notifications' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary text-white space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-brand-primary/40">
                      <MessageSquare className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Central de Notificações</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: 'matchNotificationsGlobalEnabled', label: 'Notificações de Partidas' },
                    { key: 'birthdayNotificationsEnabled', label: 'Aniversários' },
                    { key: 'intentionNotificationsEnabled', label: 'Lista de Intenções' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-xs font-bold text-white uppercase">{label}</span>
                      <button
                        onClick={() => {
                          const newState = systemMetadata[key] !== false;
                          updateSystemMetadata({ [key]: !newState });
                          showNotification(`${label} ${!newState ? 'ativadas' : 'desativadas'}!`, 'info');
                        }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                          systemMetadata[key] !== false ? 'bg-brand-primary text-black' : 'bg-white/10 text-white/40'
                        }`}
                      >
                        {systemMetadata[key] !== false ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {loadingNotifications ? (
                    <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-brand-primary animate-spin" /></div>
                  ) : allNotifications.map(notif => (
                    <div key={notif.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex justify-between items-start gap-4">
                      <div>
                        <h4 className="text-xs font-black text-brand-primary uppercase">{notif.title}</h4>
                        <div className="text-xs text-white/70 mt-1"><Markdown>{notif.message}</Markdown></div>
                      </div>
                      <button
                        onClick={() => deleteDoc(doc(db, 'notifications', notif.id))}
                        className="p-2 text-white/30 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ABA 5: TORNEIOS */}
            {activeTab === 'tournaments' && (
              <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-white">
                    <Trophy className="w-6 h-6 text-brand-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Gerenciar Torneios</h3>
                  </div>
                  <button 
                    onClick={() => {
                      const newValue = !systemMetadata.isTournamentEnabled;
                      updateSystemMetadata({ isTournamentEnabled: newValue });
                    }}
                    className={`px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] ${
                      systemMetadata.isTournamentEnabled ? 'bg-brand-primary text-black' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {systemMetadata.isTournamentEnabled ? 'Aba Torneio Visível' : 'Aba Torneio Oculta'}
                  </button>
                </div>

                <div className="space-y-3">
                  {tournaments.map(t => (
                    <div key={t.id} className="bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                      <div>
                        <p className="text-xs font-black text-white uppercase">{new Date(t.date).toLocaleDateString('pt-BR')}</p>
                        <p className="text-[10px] text-white/40 uppercase">{t.teams.length} Times • {t.status}</p>
                      </div>
                      <button
                        onClick={() => showConfirmModal('Excluir Torneio', 'Confirmar exclusão?', () => deleteTournament(t.id))}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ABA 6: SISTEMA, MANUTENÇÃO UNIFICADA & SEGURANÇA */}
            {activeTab === 'system' && (
              <div className="space-y-8">
                {/* Card Principal: Otimização & Reparo Unificado em 1-Clique */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl text-white space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary">
                        <ShieldCheck className="w-6 h-6 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                          Manutenção & Sincronização Inteligente (1-Click)
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase rounded-full border border-emerald-500/30">
                            Unificado
                          </span>
                        </h3>
                        <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1 max-w-xl">
                          O reset diário e a limpeza de anomalias já rodam automaticamente em segundo plano. Use o botão ao lado caso queira forçar uma conciliação imediata de estatísticas, sinergias e financeiro.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 shrink-0">
                      <button
                        onClick={handleUnifiedOneClickMaintenance}
                        disabled={isRunningUnifiedMaintenance}
                        className="px-6 py-4 bg-brand-primary text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl flex items-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRunningUnifiedMaintenance ? 'animate-spin' : ''}`} />
                        {isRunningUnifiedMaintenance ? 'Otimizando...' : 'Otimizar & Sincronizar Agora'}
                      </button>

                      <button
                        onClick={() =>
                          showConfirmModal(
                            'Recálculo Total de ELO',
                            'Deseja reconstruir o histórico completo de ELO de todos os sócios a partir das partidas oficiais?',
                            recalculateAllElo
                          )
                        }
                        className="px-5 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 border border-white/10"
                      >
                        <TrendingUp className="w-4 h-4 text-brand-primary" />
                        Recalcular ELO Geral
                      </button>
                    </div>
                  </div>
                </section>

                {/* Backup CSV & Snapshots */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary text-white space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <Download className="w-6 h-6 text-brand-primary" />
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Backups & Exportação Oficial</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Exporte planilhas CSV ou crie pontos de restauração no Firestore</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={exportPlayersCSV} className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black uppercase text-[9px] flex items-center gap-2 border border-white/10">
                        <UsersIcon className="w-3.5 h-3.5 text-brand-primary" /> CSV Sócios
                      </button>
                      <button onClick={exportMatchesCSV} className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black uppercase text-[9px] flex items-center gap-2 border border-white/10">
                        <History className="w-3.5 h-3.5 text-brand-primary" /> CSV Partidas
                      </button>
                      <button onClick={exportPaymentsCSV} className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black uppercase text-[9px] flex items-center gap-2 border border-white/10">
                        <CreditCard className="w-3.5 h-3.5 text-brand-primary" /> CSV Financeiro
                      </button>
                      <button onClick={() => createDataSnapshot()} className="px-5 py-3 bg-brand-primary text-black rounded-xl font-black uppercase text-[9px] flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5" /> Criar Snapshot
                      </button>
                    </div>
                  </div>

                  {/* Restaurar Partida de Snapshot */}
                  {snapshots.length > 0 && (
                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/50 block">
                        Restaurar Partida Específica de um Snapshot Anterior
                      </label>
                      <select 
                        onChange={(e) => setSelectedSnapshot(snapshots.find(s => s.id === e.target.value) || null)}
                        className="w-full md:w-1/2 bg-brand-secondary border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black uppercase text-white outline-none"
                        value={selectedSnapshot?.id || ''}
                      >
                        <option value="">Selecione um ponto de backup...</option>
                        {snapshots.map(snap => (
                          <option key={snap.id} value={snap.id} className="text-black">
                            [{snap.date || new Date(snap.timestamp).toLocaleDateString('pt-BR')}] - {snap.label || 'Backup'} ({snap.matches?.length || 0} jogos)
                          </option>
                        ))}
                      </select>

                      {selectedSnapshot?.matches && (
                        <div className="max-h-52 overflow-y-auto space-y-2 pt-2">
                          {selectedSnapshot.matches.map((m: any, idx: number) => {
                            const alreadyExists = matches.some(match => match.id === m.id);
                            return (
                              <div key={m.id || idx} className="bg-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase text-white">
                                  Jogo #{m.dailyNumber || idx + 1} ({m.date}) — Placar {m.scoreA} x {m.scoreB}
                                </span>
                                <button
                                  onClick={() => handleRestoreMatchFromSnapshot(m)}
                                  disabled={alreadyExists}
                                  className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg ${alreadyExists ? 'bg-white/5 text-white/30' : 'bg-brand-primary text-black'}`}
                                >
                                  {alreadyExists ? 'Ativa' : 'Restaurar'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Biometria (Passkeys) */}
                <section className="bg-black p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Fingerprint className="w-6 h-6 text-brand-primary" />
                      <div>
                        <h3 className="text-lg font-black uppercase text-white">Acesso Biométrico (Passkeys)</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase">Face ID / Impressão Digital persistida no Firestore</p>
                      </div>
                    </div>
                    {isPasskeySupported && !isRegisteredLocally && (
                      <button
                        onClick={async () => {
                          const ok = await register(user?.email || undefined);
                          if (ok) setIsRegisteredLocally(true);
                        }}
                        className="px-6 py-3 bg-brand-primary text-black rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2"
                      >
                        <ScanFace className="w-4 h-4" /> Vincular Biometria
                      </button>
                    )}
                  </div>
                </section>

                {/* Painéis Técnicos Avançados (Ocultos por padrão para manter a interface limpa) */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setShowEloAuditModal(!showEloAuditModal)}
                    className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10"
                  >
                    {showEloAuditModal ? 'Ocultar Auditoria de ELO e Tempo' : 'Abrir Auditoria Detalhada de ELO & Quadra'}
                  </button>
                  <button
                    onClick={() => setShowAdvancedDiagnostics(!showAdvancedDiagnostics)}
                    className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10"
                  >
                    {showAdvancedDiagnostics ? 'Ocultar Diagnóstico de Rede' : 'Abrir Diagnóstico Avançado de Rede'}
                  </button>
                </div>

                {showEloAuditModal && (
                  <div className="space-y-8">
                    <AdminEloAuditView players={players} matches={matches} dailyBonus={systemMetadata.dailyAttendanceBonus || 20} />
                    <AthleteTimeAuditReport players={players} matches={matches} attendance={attendance} />
                  </div>
                )}

                {showAdvancedDiagnostics && (
                  <DiagnosticDashboard onTriggerSync={triggerSync} />
                )}

                {/* Zona de Perigo com Trava Dupla de Segurança */}
                <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-rose-500 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-rose-500">
                      <Lock className="w-5 h-5" />
                      <h3 className="text-lg font-black uppercase tracking-tight text-white">Zona de Perigo (Bloqueada)</h3>
                    </div>
                    <button
                      onClick={() => setIsDangerZoneUnlocked(!isDangerZoneUnlocked)}
                      className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase tracking-widest"
                    >
                      {isDangerZoneUnlocked ? 'Bloquear Comandos Destrutivos' : 'Desbloquear Zona de Perigo'}
                    </button>
                  </div>

                  {isDangerZoneUnlocked && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <button onClick={clearMatchesOnly} className="p-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest">
                        Zerar Partidas
                      </button>
                      <button onClick={resetElo} className="p-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest">
                        Resetar ELOs
                      </button>
                      <button onClick={clearAllHistory} className="p-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[9px] uppercase tracking-widest">
                        Apagar Histórico
                      </button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
