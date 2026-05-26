
import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Trophy, 
  Calendar, 
  History, 
  LayoutDashboard, 
  ClipboardCheck, 
  Swords, 
  ShieldAlert, 
  Settings, 
  CreditCard,
  LogOut,
  UserCheck,
  LogIn,
  Database,
  Zap,
  CheckCircle2,
  Edit2,
  BarChart3,
  ListTodo,
  Medal,
  DollarSign
} from 'lucide-react';

import { getBrazilDay, getFirestoreDateKey, db, doc, updateDoc } from './firebase';
import { useStore } from './store';
import { useAuth } from './src/hooks/useAuth';
import { useFirestoreSync } from './src/hooks/useFirestoreSync';
import { useDailyReset } from './src/hooks/useDailyReset';
import { useNarration } from './src/hooks/useNarration';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { useAppLogic } from './src/hooks/useAppLogic';
import { PaymentStatus } from './types';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Notification } from './components/Notification';
import { ConfirmModal } from './components/ConfirmModal';
import { AttendanceView } from './components/AttendanceView';
import { AttendanceReportView } from './components/AttendanceReportView';
import { IntentionsView } from './components/IntentionsView';
import { useIntentions } from './src/hooks/useIntentions';
import { MatchView } from './components/MatchView';
import { RankingView } from './components/RankingView';
import { MembersView } from './components/MembersView';
import { PaymentsView } from './components/PaymentsView';
import { RulesView } from './components/RulesView';
const AdminView = lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));
const MatchViewLazy = lazy(() => import('./components/MatchView').then(m => ({ default: m.MatchView })));
import { HistoryView } from './components/HistoryView';
import { TournamentView } from './components/TournamentView';
import { MyPaymentsView } from './components/MyPaymentsView';
import { PlayerForm } from './components/PlayerForm';
import { PaymentForm } from './components/PaymentForm';
import { ExpenseForm } from './components/ExpenseForm';
import { PlayerStatusCard } from './src/components/PlayerStatusCard';
import { LoginView } from './src/components/LoginView';
import { AccessRequestView } from './src/components/AccessRequestView';
import { CourtDiagram } from './src/components/CourtDiagram';
import { Logo } from './src/components/Logo';
import { clearOldStorage } from './services/geminiService';
import { calculateEffectiveElo } from './utils/teamLogic';
import { useBirthdays } from './src/hooks/useBirthdays';
import { useWelcomeCelebration } from './src/hooks/useWelcomeCelebration';
import { useAdminAutomations } from './src/hooks/useAdminAutomations';
import { useDatabaseMaintenance } from './src/hooks/useDatabaseMaintenance';
import { BirthdayBanner } from './src/components/BirthdayBanner';
import { WelcomeBanner } from './src/components/WelcomeBanner';
import { NotificationCenter } from './src/components/NotificationCenter';

const App: React.FC = () => {
  // --- Hooks ---
  const { user, userRole, currentPlayer, isAuthReady, isRoleLoading } = useAuth();
  useFirestoreSync();
  useDailyReset();
  usePushNotifications();
  useAdminAutomations();
  useDatabaseMaintenance();
  const { handleAnnounce } = useNarration();

  // --- Store State ---
  const viewMode = useStore(state => state.viewMode);
  const setViewMode = useStore(state => state.setViewMode);
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const matches = useStore(state => state.matches);
  const payments = useStore(state => state.payments);
  const preConfirmations = useStore(state => state.preConfirmations);
  const generationResult = useStore(state => state.generationResult);
  const activeTournament = useStore(state => state.activeTournament);
  const isVerifyingRules = useStore(state => state.isVerifyingRules);
  const isScanningAnomalies = useStore(state => state.isScanningAnomalies);
  const anomalyReport = useStore(state => state.anomalyReport);
  const isLoggingOut = useStore(state => state.isLoggingOut);
  const isSyncing = useStore(state => state.isSyncing);
  const dbStatus = useStore(state => state.dbStatus);
  const theme = useStore(state => state.theme);
  const toggleTheme = useStore(state => state.toggleTheme);
  const notification = useStore(state => state.notification);
  const hideNotification = useStore(state => state.hideNotification);
  const confirmModal = useStore(state => state.confirmModal);
  const hideConfirmModal = useStore(state => state.hideConfirmModal);
  const swapSelection = useStore(state => state.swapSelection);
  const setSwapSelection = useStore(state => state.setSwapSelection);
  const elapsedTime = useStore(state => state.elapsedTime);
  const setElapsedTime = useStore(state => state.setElapsedTime);
  const systemMetadata = useStore(state => state.systemMetadata);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const showNotification = useStore(state => state.showNotification);
  const showConfirmModal = useStore(state => state.showConfirmModal);
  const setEditingPayment = useStore(state => state.setEditingPayment);
  const setIsPaymentFormOpen = useStore(state => state.setIsPaymentFormOpen);
  const editingPayment = useStore(state => state.editingPayment);
  const isPaymentFormOpen = useStore(state => state.isPaymentFormOpen);
  const pendingRequests = useStore(state => state.pendingRequests);
  const isFormOpen = useStore(state => state.isFormOpen);
  const setIsFormOpen = useStore(state => state.setIsFormOpen);
  const editingPlayer = useStore(state => state.editingPlayer);
  const setEditingPlayer = useStore(state => state.setEditingPlayer);
  const forceSync = useStore(state => state.triggerSync);

  const { todayBirthdays } = useBirthdays();
  const { showWelcome, setShowWelcome } = useWelcomeCelebration();

  // Limpeza de storage antigo uma única vez no boot
  useEffect(() => {
    clearOldStorage();
    
    // Handle tab from URL
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['presence', 'history', 'generation', 'members', 'dashboard', 'rules', 'payments', 'admin', 'tournament', 'attendance_report', 'intentions'].includes(tab)) {
      setViewMode(tab as any);
      // Clear the param from URL without refreshing
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const {
    magicLinkEmail,
    setMagicLinkEmail,
    isSendingMagicLink,
    isLoggingIn,
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    isNarratingSummary,
    createDataSnapshot,
    handleLogout,
    handleGoogleLogin,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    handleDiscard,
    handleFinishDay,
    handleFinishMatch,
    handleAnalyzeMatch,
    handleVerifyRules,
    isAnalyzing,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateDailyStats,
    updateSystemMetadata,
    registerAttendance,
    removeAttendance,
    clearAttendance,
    onToggleIntention,
    deletePlayer,
    clearAllPlayers,
    repairDatabase,
    updateQuotaSettings,
    savePlayer,
    savePayment,
    saveExpense,
    deleteExpense,
    updateMonthlyFee,
    clearAllHistory,
    clearMatchesOnly,
    deleteMatch,
    clearAllDatabase,
    resetElo,
    refreshPlayers,
    deletePayment,
    handleScanAnomalies,
    fixDatabaseAnomalies,
    recalculateAllElo,
    recalculateStats,
    initializeEloHistory,
    startTournament,
    recordTournamentMatch,
    endTournament,
    addTournamentPlayer,
    substituteTournamentPlayer,
    resetTournamentMatch,
    deleteTournament
  } = useAppLogic();

  // --- Local UI State ---
  const [showRescueLoader, setShowRescueLoader] = useState(false);
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<any>(null);

  // --- Rescue Timer ---
  useEffect(() => {
    if (!isAuthReady || (user && isRoleLoading)) {
      const timer = setTimeout(() => {
        setShowRescueLoader(true);
      }, 12000); // 12 seconds backup plan
      return () => clearTimeout(timer);
    } else {
      setShowRescueLoader(false);
    }
  }, [isAuthReady, isRoleLoading, user]);

  const handleRescueReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    playerId: '',
    month: '',
    amount: 0,
    dueDate: '',
    status: PaymentStatus.PENDING,
    method: '',
    paymentDate: ''
  });

  const [expenseFormData, setExpenseFormData] = useState({
    description: '',
    amount: 0,
    date: getFirestoreDateKey(),
    category: 'OTHER' as any,
    month: ''
  });

  const isGameDay = useMemo(() => {
    const day = getBrazilDay();
    // Quinta-feira (4) é o dia oficial, mas se houver presença ou partida, também é dia de jogo
    return day === 4 || attendance.length > 0 || matches.length > 0;
  }, [attendance.length, matches.length]);

  const isIntentionPhase = useMemo(() => {
    const day = getBrazilDay();
    // Quarta-feira (3) é o dia de intenção, a menos que já seja dia de jogo (presença aberta)
    return day === 3 && !isGameDay;
  }, [isGameDay]);

  const [formData, setFormData] = useState({
    name: '',
    gender: 'MALE',
    elo: 1200,
    matchesPlayed: 0,
    isOfficialSetter: false,
    isAdmin: false,
    joinedAt: getFirestoreDateKey(),
    birthDate: '',
    email: '',
    status: 'active',
    impactLevel: 1,
    skills: {
      setting: 1,
      attacking: 1,
      defense: 1,
      serving: 1
    },
    isExempt: false,
    isDM: false
  });

  // Sync form data when editing player changes
  useEffect(() => {
    if (editingPlayer) {
      setFormData({
        name: editingPlayer.name || '',
        gender: editingPlayer.gender || 'MALE',
        elo: editingPlayer.elo || 1200,
        matchesPlayed: editingPlayer.matchesPlayed || 0,
        isOfficialSetter: editingPlayer.isOfficialSetter || false,
        isAdmin: editingPlayer.isAdmin || false,
        joinedAt: editingPlayer.joinedAt || getFirestoreDateKey(),
        birthDate: editingPlayer.birthDate || '',
        email: editingPlayer.email || '',
        status: editingPlayer.status || 'active',
        impactLevel: editingPlayer.impactLevel || 1,
        skills: editingPlayer.skills || {
          setting: 1,
          attacking: 1,
          defense: 1,
          serving: 1
        },
        isExempt: editingPlayer.isExempt || false,
        isDM: editingPlayer.isDM || false
      });
    } else {
      setFormData({
        name: '',
        gender: 'MALE',
        elo: 1200,
        matchesPlayed: 0,
        isOfficialSetter: false,
        isAdmin: false,
        joinedAt: getFirestoreDateKey(),
        birthDate: '',
        email: '',
        status: 'active',
        impactLevel: 1,
        skills: {
          setting: 1,
          attacking: 1,
          defense: 1,
          serving: 1
        },
        isExempt: false,
        isDM: false
      });
    }
  }, [editingPlayer]);

  const handlePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePlayer({
      ...editingPlayer,
      ...formData
    } as any);
    setIsFormOpen(false);
    setEditingPlayer(null);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const player = players.find(p => p.id === paymentFormData.playerId);
    const amount = paymentFormData.amount || systemMetadata.monthlyFee || 0;
    const success = await savePayment({
      ...paymentFormData,
      amount,
      playerName: player?.name || 'Sócio desconhecido'
    }, editingPayment?.id);
    if (success) {
      setIsPaymentFormOpen(false);
      setEditingPayment(null);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await saveExpense(expenseFormData, editingExpense?.id);
    if (success) {
      setIsExpenseFormOpen(false);
      setEditingExpense(null);
    }
  };

  // --- Timer Logic ---
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (generationResult && systemMetadata.matchStartTime) {
      // Update immediately
      const updateTimer = () => {
        const now = Date.now();
        const start = systemMetadata.matchStartTime || now;
        const elapsed = Math.floor((now - start) / 1000);
        setElapsedTime(Math.max(0, elapsed));
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generationResult, systemMetadata.matchStartTime, setElapsedTime]);

  useEffect(() => {
    if (editingPayment) {
      setPaymentFormData({
        playerId: editingPayment.playerId,
        month: editingPayment.month,
        amount: editingPayment.amount,
        dueDate: editingPayment.dueDate,
        status: editingPayment.status,
        method: editingPayment.method || '',
        paymentDate: editingPayment.paymentDate || ''
      });
    } else {
      const now = new Date();
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const currentMonth = `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
      
      setPaymentFormData({
        playerId: '',
        month: currentMonth,
        amount: systemMetadata.monthlyFee || 0,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0],
        status: PaymentStatus.PENDING,
        method: '',
        paymentDate: ''
      });
    }
  }, [editingPayment]);

  useEffect(() => {
    if (editingExpense) {
      setExpenseFormData({
        description: editingExpense.description,
        amount: editingExpense.amount,
        date: editingExpense.date,
        category: editingExpense.category,
        month: editingExpense.month
      });
    } else {
      const now = new Date();
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const currentMonth = `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
      
      setExpenseFormData({
        description: '',
        amount: 0,
        date: now.toISOString().split('T')[0],
        category: 'OTHER',
        month: currentMonth
      });
    }
  }, [editingExpense]);

  // --- Navigation Items ---
  const navItems = useMemo(() => [
    { id: 'intentions', label: 'Lista', icon: ListTodo, adminOnly: false },
    { id: 'presence', label: 'Presença', icon: ClipboardCheck, adminOnly: false },
    { id: 'generation', label: 'Partida', icon: Swords, adminOnly: false },
    { id: 'tournament', label: 'Torneio', icon: Trophy, adminOnly: false },
    { id: 'history', label: 'Histórico', icon: History, adminOnly: false },
    { id: 'members', label: 'Sócios', icon: Users, adminOnly: false },
    { id: 'payments', label: 'Financeiro', icon: DollarSign, adminOnly: true },
    { id: 'ranking', label: 'Ranking', icon: Medal, adminOnly: false },
    { id: 'rules', label: 'Regras', icon: ShieldAlert, adminOnly: false },
    { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
  ].filter(item => {
    if (item.adminOnly && userRole !== 'ADMIN') return false;
    if (item.id === 'tournament' && !systemMetadata.isTournamentEnabled && userRole !== 'ADMIN') return false;
    if (item.id === 'presence' && !isGameDay && userRole !== 'ADMIN') return false;
    return true;
  }), [userRole, systemMetadata.isTournamentEnabled, isGameDay]);

  // --- Security Redirect ---
  useEffect(() => {
    if (isAuthReady && userRole) {
      const validViews = [...navItems.map(item => item.id), 'attendance_report', 'intentions'];
      const isRestricted = !validViews.includes(viewMode);
      if (isRestricted) {
        setViewMode('intentions');
      }
    }
  }, [userRole, viewMode, navItems, isAuthReady, setViewMode]);

  const isDarkView = true; // Always dark premium now

  // --- Helper Functions (Remaining in App for View Logic) ---
  const handleSwapClick = (source: 'A' | 'B' | 'Bench', playerId: string) => {
    if (!swapSelection) {
      setSwapSelection({ source, playerId });
    } else {
      if (swapSelection.playerId === playerId) {
        setSwapSelection(null);
      } else {
        performSwap(swapSelection.playerId, playerId);
        setSwapSelection(null);
      }
    }
  };

  const performSwap = (id1: string, id2: string) => {
    if (!generationResult) return;

    const allPlayers = [
      generationResult.teamA.setter,
      ...generationResult.teamA.players,
      generationResult.teamB.setter,
      ...generationResult.teamB.players,
      ...generationResult.remainingPlayers
    ].filter(Boolean) as any[];

    const p1 = allPlayers.find(p => p.id === id1);
    const p2 = allPlayers.find(p => p.id === id2);

    if (!p1 || !p2) return;

    const swapInTeam = (team: any) => {
      let newSetter = team.setter;
      if (team.setter?.id === id1) newSetter = p2;
      else if (team.setter?.id === id2) newSetter = p1;

      const newPlayers = team.players.map((p: any) => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });

      return { ...team, setter: newSetter, players: newPlayers };
    };

    const swapInList = (list: any[]) => {
      return list.map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });
    };

    const newTeamA = swapInTeam(generationResult.teamA);
    const newTeamB = swapInTeam(generationResult.teamB);
    const newRemaining = swapInList(generationResult.remainingPlayers);
    
    // Recalcula métricas em tempo real para feedback imediato no Drag and Drop
    const calcElo = (t: any) => (t.players.reduce((s: number, p: any) => s + (p.elo || 1200), 0) + (t.setter?.elo || 0));
    
    // Recalcula eficiência baseada na lógica centralizada do teamLogic
    const calcEff = (t: any) => {
      const allP = t.setter ? [t.setter, ...t.players] : t.players;
      return Math.round(allP.reduce((s: number, p: any) => s + calculateEffectiveElo(p), 0));
    };

    setGenerationResult({
      teamA: { ...newTeamA, totalElo: calcElo(newTeamA), totalEfficiency: calcEff(newTeamA) },
      teamB: { ...newTeamB, totalElo: calcElo(newTeamB), totalEfficiency: calcEff(newTeamB) },
      remainingPlayers: newRemaining
    });
  };

  const handleRemovePlayer = (playerId: string) => {
    if (!generationResult) return;
    if (!generationResult?.remainingPlayers || generationResult.remainingPlayers.length === 0) {
      showNotification("Não há reservas disponíveis para substituição!", "error");
      return;
    }
    performSwap(playerId, generationResult.remainingPlayers[0].id);
  };

  const promoteToSetter = (team: 'A' | 'B', playerId: string) => {
    if (!generationResult) return;
    
    const teamKey = team === 'A' ? 'teamA' : 'teamB';
    const teamData = generationResult[teamKey];
    const playerIndex = teamData.players.findIndex((p: any) => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = teamData.players[playerIndex];
    const newPlayers = [...teamData.players];
    newPlayers.splice(playerIndex, 1);
    
    setGenerationResult({
      ...generationResult,
      [teamKey]: {
        ...teamData,
        setter: player,
        players: newPlayers
      }
    });
    showNotification(`${player.name} designado como levantador temporário.`, 'info');
  };

  // --- Render Logic ---
  if (isLoggingOut) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <Logo size="lg" className="mx-auto mb-8" />
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">
            Até breve!
          </h1>
          <p className="text-slate-400 font-medium">
            Sua sessão foi encerrada com segurança.
          </p>
          <div className="pt-8">
            <div className="w-12 h-1 bg-amber-500 mx-auto rounded-full animate-pulse" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isAuthReady || (user && isRoleLoading)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 max-w-xs w-full">
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mx-auto"
          >
            <Logo size="lg" />
          </motion.div>
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Iniciando Sincronização...</p>
            
            {showRescueLoader && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center w-full"
              >
                <p className="text-xs text-white/60 mb-4 font-medium leading-relaxed">
                  A inicialização está demorando mais que o esperado. Isso pode ocorrer devido a manutenções no servidor ou conexões lentas.
                </p>
                <button
                  onClick={handleRescueReset}
                  className="w-full py-3 bg-brand-primary text-brand-secondary font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 active:scale-95 transition-all"
                >
                  Limpar Cache e Reiniciar
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView 
        magicLinkEmail={magicLinkEmail}
        setMagicLinkEmail={setMagicLinkEmail}
        isSendingMagicLink={isSendingMagicLink}
        isLoggingIn={isLoggingIn}
        handleMagicLink={handleMagicLink}
        handleGoogleLogin={handleGoogleLogin}
      />
    );
  }

  if (!userRole) {
    return (
      <AccessRequestView 
        user={user}
        requestName={requestName}
        setRequestName={setRequestName}
        isRequestingAccess={isRequestingAccess}
        isRequestSubmitted={isRequestSubmitted}
        handleRequestAccess={handleRequestAccess}
        handleLogout={handleLogout}
      />
    );
  }

  return (
    <ErrorBoundary>
      <BirthdayBanner birthdays={todayBirthdays} />
      <WelcomeBanner 
        show={showWelcome} 
        onClose={() => setShowWelcome(false)} 
        playerName={currentPlayer?.name || ''} 
      />
      <div className="min-h-screen transition-colors duration-500 pb-20 sm:pb-0 sm:pl-28 bg-brand-light">
        {/* Header */}
        <header className="sticky top-0 z-30 relative px-4 py-3 sm:px-12 sm:py-12 shadow-2xl shadow-black/50 border-b border-white/5 bg-brand-light transition-colors duration-500">
          {/* Header Background Image with Overlay */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img 
              src="https://images.unsplash.com/photo-1592656094267-764a45160876?auto=format&fit=crop&q=80&w=2000" 
              alt="Volleyball Background" 
              className="w-full h-full object-cover opacity-5 scale-110 blur-[4px]"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-light via-brand-light/95 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-brand-light/80"></div>
          </div>

          <div className="max-w-7xl mx-auto flex justify-between items-center relative z-10">
            <div className="flex items-center gap-3 sm:gap-10">
              <div className="relative group">
                <div className="absolute -inset-4 bg-brand-primary/10 rounded-full blur-3xl group-hover:bg-brand-primary/20 transition-all duration-500"></div>
                <Logo size="sm" className="!w-10 !h-10 sm:!w-24 sm:!h-24 -rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10" />
              </div>
              <div>
                <h1 className="text-lg sm:text-5xl font-black text-white tracking-tighter uppercase leading-none drop-shadow-2xl">
                  Guerreiros <span className="text-brand-primary">Volleyball</span> Club
                </h1>
                <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-4">
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full shadow-[0_0_12px_rgba(245,196,41,0.5)] ${dbStatus === 'idle' ? 'bg-brand-primary' : 'bg-brand-primary animate-pulse'}`}></div>
                  <p className="text-[8px] sm:text-xs font-black text-brand-primary uppercase tracking-[0.3em] drop-shadow-md">
                    {dbStatus === 'idle' ? 'Sistema Online' : 'Sincronizando...'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-8">
              <div className="sm:hidden flex items-center gap-2">
                <NotificationCenter />
                <PlayerStatusCard 
                  currentPlayer={currentPlayer}
                  attendance={attendance}
                  generationResult={generationResult}
                  matches={matches}
                  systemMetadata={systemMetadata}
                  activeTournament={activeTournament}
                />
              </div>
              
              {userRole === 'ADMIN' && (
                <button 
                  onClick={() => {
                    forceSync();
                    showNotification('Sincronização forçada iniciada...', 'info');
                  }}
                  className={`p-2.5 sm:p-5 rounded-xl sm:rounded-2xl transition-all border-2 ${isSyncing ? 'bg-brand-primary/20 border-brand-primary text-brand-primary animate-spin' : 'bg-white/5 text-white/80 hover:bg-brand-primary/20 hover:text-brand-primary border-brand-primary/40 hover:border-brand-primary/50'}`}
                  title="Sincronizar Agora"
                  disabled={isSyncing}
                >
                  <Database className="w-5 h-5 sm:w-8 sm:h-8" />
                </button>
              )}

              <div className="hidden sm:flex flex-col items-end">
                <p className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-1">Atleta</p>
                <div className="flex items-center gap-3">
                  <NotificationCenter />
                  <PlayerStatusCard 
                    currentPlayer={currentPlayer}
                    attendance={attendance}
                    generationResult={generationResult}
                    matches={matches}
                    systemMetadata={systemMetadata}
                    activeTournament={activeTournament}
                  />
                  <p className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    {currentPlayer?.name || user.displayName || 'Atleta'}
                    {userRole === 'ADMIN' && (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                        <span className="text-[10px] text-brand-primary font-black tracking-widest">ADMIN</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-500 border border-brand-primary/40 hover:border-rose-500/50 transition-all group"
                title="Sair"
              >
                <LogOut className="w-5 h-5 sm:w-8 sm:h-8 group-hover:-translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </header>

        {/* Sidebar Navigation */}
        <nav className="fixed bottom-0 left-0 w-full sm:w-28 sm:h-full bg-brand-nav border-t sm:border-t-0 sm:border-r border-white/5 z-40 flex sm:flex-col items-center overflow-x-auto sm:overflow-y-auto justify-start sm:justify-start sm:pt-28 sm:pb-12 gap-2 sm:gap-6 p-2 pr-12 sm:pr-0 scrollbar-hide shadow-2xl">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id as any)}
              className={`flex flex-col items-center gap-1 sm:gap-2 p-2.5 sm:p-6 rounded-2xl sm:rounded-3xl transition-all relative group flex-shrink-0 ${
                viewMode === item.id 
                  ? 'bg-brand-primary text-brand-secondary shadow-2xl shadow-brand-primary/30 scale-110' 
                  : 'text-white/80 hover:bg-brand-primary/10 hover:text-brand-primary'
              } transition-all`}
            >
              <item.icon className="w-5 h-5 sm:w-9 sm:h-9" />
              <span className={`text-[8px] font-black uppercase tracking-tighter sm:hidden`}>{item.label}</span>
              
              {/* Tooltip Desktop */}
              <div className="absolute left-full ml-6 px-4 py-3 bg-brand-primary text-brand-secondary text-[10px] font-black uppercase tracking-[0.2em] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-2xl hidden sm:block whitespace-nowrap z-50">
                {item.label}
              </div>
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main className="max-w-[1400px] mx-auto p-4 sm:p-8 lg:p-10">
          {/* Mismatch Session Control / Warning */}
          {currentPlayer && currentPlayer.uid && currentPlayer.uid !== 'undefined' && user?.uid && currentPlayer.uid !== user.uid && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-6 sm:p-8 bg-black rounded-[2rem] border border-brand-primary/40 shadow-2xl shadow-black relative overflow-hidden"
            >
              {/* Decorative background overlay */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative z-10">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                  <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary animate-pulse">
                    <ShieldAlert className="w-8 h-8 sm:w-10 sm:h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl sm:text-2xl font-black text-brand-primary uppercase tracking-tight">
                      Perfil em uso em outro navegador
                    </h3>
                    <p className="text-sm font-bold text-white/90">
                      Olá, <span className="text-brand-primary">{currentPlayer.name}</span>! Detectamos que este perfil já está conectado em outro navegador ou dispositivo.
                    </p>
                    <p className="text-xs text-white/60">
                      Isto acontece se você acessou o sistema de outro celular, computador ou aba anônima. Para garantir que suas confirmações de quadra funcionem perfeitamente nesta tela, vincule este navegador abaixo.
                    </p>
                  </div>
                </div>
                
                <div className="flex-shrink-0 w-full md:w-auto">
                  <button
                    onClick={async () => {
                      try {
                        const playerRef = doc(db, 'players', currentPlayer.id);
                        await updateDoc(playerRef, { uid: user.uid });
                        showNotification('Vínculo de dispositivo atualizado com sucesso para este navegador!', 'success');
                      } catch (e: any) {
                        console.error('Erro ao atualizar vínculo:', e);
                        showNotification('Erro ao redefinir o vínculo: ' + (e?.message || 'Erro desconhecido'), 'error');
                      }
                    }}
                    className="w-full md:w-auto flex items-center justify-center gap-3 px-6 py-4 bg-brand-primary text-brand-secondary text-xs font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-brand-primary/10 hover:shadow-brand-primary/20 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-brand-secondary" />
                    Vincular Este Navegador
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {viewMode === 'intentions' && (
            <IntentionsView 
              userRole={userRole}
              currentPlayer={currentPlayer}
              showNotification={showNotification}
              onMoveToAttendance={(playerId) => {
                const player = players.find(p => p.id === playerId);
                if (player) {
                  registerAttendance(player);
                  showNotification('Sócio movido para a quadra!', 'success');
                }
              }}
            />
          )}

          {viewMode === 'presence' && (
            <AttendanceView 
              userRole={userRole}
              isGameDay={isGameDay}
              isIntentionPhase={isIntentionPhase}
              currentPlayer={currentPlayer}
              registerAttendance={registerAttendance}
              removeAttendance={removeAttendance}
              clearAttendance={clearAttendance}
              onToggleIntention={onToggleIntention}
              refreshPlayers={refreshPlayers}
              resetDailyMatches={handleFinishDay}
              availablePlayers={players.filter(p => (!p.status || p.status === 'active') && !p.isDM)}
              preConfirmations={preConfirmations}
              setViewMode={setViewMode}
            />
          )}

          {viewMode === 'attendance_report' && (
            <AttendanceReportView setViewMode={setViewMode} />
          )}

          {viewMode === 'generation' && (
            <Suspense fallback={<div>Carregando...</div>}>
              <div className="space-y-12">
                <MatchViewLazy 
                  onGenerate={handleGenerate}
                  onDiscard={handleDiscard}
                  onFinishDay={handleFinishDay}
                  onFinishMatch={handleFinishMatch}
                  onVerifyRules={handleVerifyRules}
                  onAnalyzeMatch={handleAnalyzeMatch}
                  recalculateDailyStats={recalculateDailyStats}
                  isVerifyingRules={isVerifyingRules}
                  isAnalyzing={isAnalyzing}
                  isNarratingSummary={isNarratingSummary}
                  onAnnounce={() => handleAnnounce('teams')}
                  onSwapClick={handleSwapClick}
                  onRemovePlayer={handleRemovePlayer}
                  onPromoteToSetter={promoteToSetter}
                  systemMetadata={systemMetadata}
                  updateSystemMetadata={updateSystemMetadata}
                />
                
                {generationResult && (
                  <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 bg-black rounded-[3rem] border border-brand-primary/40 p-8 sm:p-12 shadow-2xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="h-px flex-grow bg-white/10"></div>
                      <h2 className="text-sm font-black text-white/40 uppercase tracking-[0.3em]">Posicionamento Tático</h2>
                      <div className="h-px flex-grow bg-white/10"></div>
                    </div>
                    <CourtDiagram teamA={generationResult.teamA} teamB={generationResult.teamB} />
                  </div>
                )}
              </div>
            </Suspense>
          )}

          {viewMode === 'history' && (
            <HistoryView onDeleteMatch={deleteMatch} />
          )}

          {viewMode === 'tournament' && (
            <TournamentView 
              onStart={startTournament}
              onRecord={recordTournamentMatch}
              onResetMatch={resetTournamentMatch}
              onEnd={endTournament}
              onAddPlayer={addTournamentPlayer}
              onSubstitute={substituteTournamentPlayer}
            />
          )}

          {viewMode === 'members' && (
            <MembersView 
              clearAllPlayers={clearAllPlayers}
              deletePlayer={deletePlayer}
              setEditingPlayer={setEditingPlayer}
              setIsFormOpen={setIsFormOpen}
              refreshPlayers={refreshPlayers}
              repairDatabase={repairDatabase}
              savePlayer={savePlayer}
            />
          )}

          {viewMode === 'payments' && (
            <PaymentsView 
              deletePayment={deletePayment}
              setEditingPayment={setEditingPayment}
              setIsPaymentFormOpen={setIsPaymentFormOpen}
              deleteExpense={deleteExpense}
              setEditingExpense={setEditingExpense}
              setIsExpenseFormOpen={setIsExpenseFormOpen}
              updateMonthlyFee={updateMonthlyFee}
            />
          )}

          {viewMode === 'ranking' && (
            <RankingView 
              userRole={userRole || 'MEMBER'}
              refreshPlayers={refreshPlayers}
              handleAnnounceSummary={(data) => handleAnnounce('ranking', data)}
              isNarratingSummary={isNarratingSummary}
              resetDailyMatches={handleFinishDay}
              fixDatabaseAnomalies={fixDatabaseAnomalies}
              isDark={isDarkView}
            />
          )}

          {viewMode === 'rules' && <RulesView />}

          {viewMode === 'my_payments' && currentPlayer && (
            <MyPaymentsView playerId={currentPlayer.id} />
          )}

          {viewMode === 'admin' && (
            <Suspense fallback={<div>Carregando Admin...</div>}>
              <AdminView 
                resetDailyStats={handleFinishDay}
                resetElo={resetElo}
                triggerSync={triggerSync}
                recalculateDailyStats={recalculateDailyStats}
                updateSystemMetadata={updateSystemMetadata}
                recalculateStats={recalculateStats}
                repairDatabase={repairDatabase}
                initializeEloHistory={initializeEloHistory}
                updateQuotaSettings={updateQuotaSettings}
                createDataSnapshot={createDataSnapshot}
                clearAllHistory={clearAllHistory}
                clearMatchesOnly={clearMatchesOnly}
                clearAllDatabase={clearAllDatabase}
                pendingRequests={pendingRequests}
                onApproveRequest={onApproveRequest}
                onRejectRequest={onRejectRequest}
                handleScanAnomalies={handleScanAnomalies}
                fixDatabaseAnomalies={fixDatabaseAnomalies}
                recalculateAllElo={recalculateAllElo}
                deleteTournament={deleteTournament}
                showConfirmModal={showConfirmModal}
                setEditingPlayer={setEditingPlayer}
                setIsFormOpen={setIsFormOpen}
                savePlayer={savePlayer}
              />
            </Suspense>
          )}
        </main>

        <PlayerForm 
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingPlayer(null);
          }}
          onSubmit={handlePlayerSubmit}
          editingPlayer={editingPlayer}
          formData={formData}
          setFormData={setFormData}
          isAdmin={userRole === 'ADMIN'}
        />

        <PaymentForm
          isOpen={isPaymentFormOpen}
          isSyncing={isSyncing}
          onClose={() => {
            setIsPaymentFormOpen(false);
            setEditingPayment(null);
          }}
          onSubmit={handlePaymentSubmit}
          editingPayment={editingPayment}
          paymentFormData={paymentFormData}
          setPaymentFormData={setPaymentFormData}
          players={players.filter(p => !p.status || (p.status !== 'inactive' && p.status !== 'waitlist' && !p.isDM))}
        />

        <ExpenseForm
          isOpen={isExpenseFormOpen}
          onClose={() => {
            setIsExpenseFormOpen(false);
            setEditingExpense(null);
          }}
          onSubmit={handleExpenseSubmit}
          editingExpense={editingExpense}
          expenseFormData={expenseFormData}
          setExpenseFormData={setExpenseFormData}
        />

        {/* Modals & Notifications */}
        <Notification />
        
        <ConfirmModal />

        {isSyncing && (
          <div className="fixed bottom-8 right-8 z-50 bg-black backdrop-blur-md px-8 py-4 rounded-[2rem] shadow-2xl border border-brand-primary/40 flex items-center gap-4 animate-in slide-in-from-right-8 border-l-[6px] border-l-brand-primary">
            <div className="w-3 h-3 rounded-full bg-brand-primary animate-ping"></div>
            <div className="flex flex-col">
               <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] leading-tight">Guerreiros Intelligence</p>
               <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mt-0.5">Sincronizando Resultados...</ p>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
