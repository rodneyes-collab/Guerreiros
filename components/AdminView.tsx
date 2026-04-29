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
  Edit2,
  Star
} from 'lucide-react';
import { db, doc, updateDoc, setDoc, deleteDoc, onSnapshot, writeBatch, collection, serverTimestamp, getDocs, query, where, orderBy, limit, getFirestoreDateKey } from '../firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { Player } from '../types';
import Markdown from 'react-markdown';
import { Logo } from '../src/components/Logo';
import { motion, AnimatePresence } from 'motion/react';

import { useBirthdays } from '../src/hooks/useBirthdays';
import { BirthdayAdminCard } from '../src/components/BirthdayAdminCard';
import { HelpTooltip } from '../src/components/HelpTooltip';

import { getLevelSuggestions, LevelSuggestion } from '../utils/levelAuditUtils';

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
  deleteTournament: (id: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  savePlayer: (player: Player) => Promise<void>;
}

type AdminTab = 'dashboard' | 'members' | 'maintenance' | 'tournaments' | 'system' | 'notifications';

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
    currentPlayer
  } = useStore();

  const { todayBirthdays, sendBirthdayPush } = useBirthdays();

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [memberSearch, setMemberSearch] = useState('');
  const [levelSuggestions, setLevelSuggestions] = useState<LevelSuggestion[]>([]);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

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
      case 3: return <Trophy className="w-3.5 h-3.5 text-brand-primary" />;
      case 2: return <Activity className="w-3.5 h-3.5 text-brand-primary/60" />;
      default: return <UsersIcon className="w-3.5 h-3.5 text-white/20" />;
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
    { id: 'maintenance', label: 'Manutenção', icon: Database },
    { id: 'notifications', label: 'Notificações', icon: MessageSquare },
    { id: 'tournaments', label: 'Torneios', icon: Trophy },
    { id: 'system', label: 'Sistema', icon: Settings },
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
                </div>

                <div className="space-y-8">
                  {/* Configurações Rápidas */}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white/5 rounded-3xl border border-white/5 border-l-4 border-l-brand-primary">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/20">
                        <Trophy className={`w-5 h-5 ${systemMetadata.matchNotificationsGlobalEnabled !== false ? 'text-brand-primary animate-pulse' : 'text-white/20'}`} />
                      </div>
                      <div>
                        <h4 className="text-[12px] font-black text-white uppercase tracking-tight">Alertas de Partidas</h4>
                        <p className="text-[9px] font-bold uppercase tracking-widest">
                          {systemMetadata.matchNotificationsGlobalEnabled !== false 
                            ? <span className="text-emerald-400">Ativado para o grupo</span> 
                            : <span className="text-rose-400">Desativado para o grupo</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const newState = systemMetadata.matchNotificationsGlobalEnabled === false;
                        updateSystemMetadata({ matchNotificationsGlobalEnabled: newState });
                        showNotification(newState ? 'Alertas de partidas ativados!' : 'Alertas de partidas desativados.', newState ? 'success' : 'info');
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        systemMetadata.matchNotificationsGlobalEnabled !== false
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                          : 'bg-brand-primary text-black'
                      }`}
                    >
                      {systemMetadata.matchNotificationsGlobalEnabled !== false ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white/5 rounded-3xl border border-white/5 border-l-4 border-l-brand-primary">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/20">
                        <BellRing className={`w-5 h-5 ${systemMetadata.pushNotificationsGlobalEnabled !== false ? 'text-brand-primary animate-bounce' : 'text-white/20'}`} />
                      </div>
                      <div>
                        <h4 className="text-[12px] font-black text-white uppercase tracking-tight">Push Notifications (Global)</h4>
                        <p className="text-[9px] font-bold uppercase tracking-widest">
                          {systemMetadata.pushNotificationsGlobalEnabled !== false 
                            ? <span className="text-emerald-400">Master Switch: ON</span> 
                            : <span className="text-rose-400">Master Switch: OFF</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const newState = systemMetadata.pushNotificationsGlobalEnabled === false;
                        updateSystemMetadata({ pushNotificationsGlobalEnabled: newState });
                        showNotification(newState ? 'Notificações Push Master ativadas!' : 'TODAS as notificações Push desativadas globalmente.', newState ? 'success' : 'info');
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        systemMetadata.pushNotificationsGlobalEnabled !== false
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                          : 'bg-brand-primary text-black'
                      }`}
                    >
                      {systemMetadata.pushNotificationsGlobalEnabled !== false ? 'DESATIVAR TUDO' : 'ATIVAR TUDO'}
                    </button>
                  </div>
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
