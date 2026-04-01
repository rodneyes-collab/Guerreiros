
import React, { useState, useMemo, useEffect } from 'react';
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
  BarChart3
} from 'lucide-react';

import { getBrazilDay } from './firebase';
import { useStore } from './store';
import { useAuth } from './src/hooks/useAuth';
import { useFirestoreSync } from './src/hooks/useFirestoreSync';
import { useDailyReset } from './src/hooks/useDailyReset';
import { useNarration } from './src/hooks/useNarration';
import { useAppLogic } from './src/hooks/useAppLogic';
import { PaymentStatus } from './types';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Notification } from './components/Notification';
import { ConfirmModal } from './components/ConfirmModal';
import { AttendanceView } from './components/AttendanceView';
import { AttendanceReportView } from './components/AttendanceReportView';
import { MatchView } from './components/MatchView';
import { RankingView } from './components/RankingView';
import { MembersView } from './components/MembersView';
import { PaymentsView } from './components/PaymentsView';
import { RulesView } from './components/RulesView';
import { AdminView } from './components/AdminView';
import { HistoryView } from './components/HistoryView';
import { TournamentView } from './components/TournamentView';
import { PlayerForm } from './components/PlayerForm';
import { PaymentForm } from './components/PaymentForm';
import { ExpenseForm } from './components/ExpenseForm';
import { LoginView } from './src/components/LoginView';
import { AccessRequestView } from './src/components/AccessRequestView';
import { CourtDiagram } from './src/components/CourtDiagram';
import { clearOldStorage } from './services/geminiService';

const App: React.FC = () => {
  // --- Hooks ---
  const { user, userRole, currentPlayer, isAuthReady, isRoleLoading } = useAuth();
  useFirestoreSync();
  useDailyReset();
  const { handleAnnounce } = useNarration();

  // Limpeza de storage antigo uma única vez no boot
  useEffect(() => {
    clearOldStorage();
  }, []);
  
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
    recalculateStats,
    recalculateDailyStats,
    registerAttendance,
    removeAttendance,
    clearAttendance,
    onToggleIntention,
    deletePlayer,
    clearAllPlayers,
    repairDatabase,
    initializeEloHistory,
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
    startTournament,
    recordTournamentMatch,
    endTournament,
    addTournamentPlayer,
    substituteTournamentPlayer,
    resetTournamentMatch,
    deleteTournament
  } = useAppLogic();

  // --- Store State ---
  const {
    viewMode,
    setViewMode,
    players,
    attendance,
    matches,
    payments,
    preConfirmations,
    generationResult,
    activeTournament,
    isVerifyingRules,
    isScanningAnomalies,
    anomalyReport,
    isLoggingOut,
    isSyncing,
    dbStatus,
    notification,
    hideNotification,
    confirmModal,
    hideConfirmModal,
    swapSelection,
    setSwapSelection,
    elapsedTime,
    setElapsedTime,
    systemMetadata,
    setGenerationResult,
    showNotification,
    showConfirmModal,
    setEditingPayment,
    setIsPaymentFormOpen,
    editingPayment,
    isPaymentFormOpen,
    pendingRequests,
    isFormOpen,
    setIsFormOpen,
    editingPlayer,
    setEditingPlayer,
    triggerSync: forceSync
  } = useStore();

  // --- Local UI State ---
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<any>(null);
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
    date: new Date().toISOString().split('T')[0],
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
    joinedAt: new Date().toISOString().split('T')[0],
    email: ''
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
        joinedAt: editingPlayer.joinedAt || new Date().toISOString().split('T')[0],
        email: editingPlayer.email || ''
      });
    } else {
      setFormData({
        name: '',
        gender: 'MALE',
        elo: 1200,
        matchesPlayed: 0,
        isOfficialSetter: false,
        isAdmin: false,
        joinedAt: new Date().toISOString().split('T')[0],
        email: ''
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
        amount: 0,
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
    { id: 'presence', label: 'Presença', icon: ClipboardCheck, adminOnly: false },
    { id: 'attendance_report', label: 'Relatório', icon: BarChart3, adminOnly: false },
    { id: 'generation', label: 'Partida', icon: Swords, adminOnly: false },
    { id: 'tournament', label: 'Torneio', icon: Trophy, adminOnly: false },
    { id: 'history', label: 'Histórico', icon: History, adminOnly: false },
    { id: 'members', label: 'Sócios', icon: Users, adminOnly: true },
    { id: 'payments', label: 'Mensalidades', icon: CreditCard, adminOnly: true },
    { id: 'dashboard', label: 'Ranking', icon: LayoutDashboard, adminOnly: false },
    { id: 'rules', label: 'Regras', icon: ShieldAlert, adminOnly: false },
    { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
  ].filter(item => !item.adminOnly || userRole === 'ADMIN'), [userRole]);

  // --- Security Redirect ---
  useEffect(() => {
    if (isAuthReady && userRole) {
      const isRestricted = navItems.every(item => item.id !== viewMode);
      if (isRestricted) {
        setViewMode('generation');
      }
    }
  }, [userRole, viewMode, navItems, isAuthReady, setViewMode]);

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

    const calcElo = (t: any) => (t.players.reduce((s: number, p: any) => s + p.elo, 0) + (t.setter?.elo || 0));

    setGenerationResult({
      teamA: { ...newTeamA, totalElo: calcElo(newTeamA) },
      teamB: { ...newTeamB, totalElo: calcElo(newTeamB) },
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
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <LogOut className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">
            Até breve!
          </h1>
          <p className="text-slate-400 font-medium">
            Sua sessão foi encerrada com segurança.
          </p>
          <div className="pt-8">
            <div className="w-12 h-1 bg-indigo-500 mx-auto rounded-full animate-pulse" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isAuthReady || (user && isRoleLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Carregando...</p>
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
      <div className="min-h-screen bg-slate-50 pb-32 sm:pb-0 sm:pl-24">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-6 py-4 sm:px-12 sm:py-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-indigo-600 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/20 rotate-3">
                <Zap className="w-5 h-5 sm:w-8 h-8 text-white fill-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Guerreiros Volleyball Club</h1>
                <div className="flex items-center gap-2 mt-1 sm:mt-2">
                  <div className={`w-2 h-2 rounded-full ${dbStatus === 'idle' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {dbStatus === 'idle' ? 'Sistema Online' : 'Sincronizando...'}
                    {useStore.getState().dateKey && ` | KEY: ${useStore.getState().dateKey}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6">
              <button 
                onClick={() => {
                  forceSync();
                  showNotification('Sincronização forçada iniciada...', 'info');
                }}
                className={`p-3 sm:p-4 rounded-2xl transition-all ${isSyncing ? 'bg-indigo-50 text-indigo-600 animate-spin' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                title="Sincronizar Agora"
                disabled={isSyncing}
              >
                <Database className="w-5 h-5 sm:w-6 h-6" />
              </button>
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bem-vindo,</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    {currentPlayer?.name || user.displayName || 'Atleta'}
                    {userRole === 'ADMIN' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                  </p>
                  {currentPlayer && (
                    <button 
                      onClick={() => { setEditingPlayer(currentPlayer); setIsFormOpen(true); }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Editar meu perfil"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-3 sm:p-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all group"
                title="Sair"
              >
                <LogOut className="w-5 h-5 sm:w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </header>

        {/* Sidebar Navigation */}
        <nav className="fixed bottom-0 left-0 w-full sm:w-24 sm:h-full bg-white border-t sm:border-t-0 sm:border-r border-slate-200 z-40 flex sm:flex-col items-center overflow-x-auto sm:overflow-x-visible justify-start sm:justify-center gap-2 p-4 sm:p-0 scrollbar-hide">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id as any)}
              className={`flex flex-col items-center gap-1 p-3 sm:p-4 rounded-2xl transition-all relative group flex-shrink-0 ${
                viewMode === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className="w-6 h-6 sm:w-7 h-7" />
              <span className={`text-[8px] font-black uppercase tracking-tighter sm:hidden`}>{item.label}</span>
              
              {/* Tooltip Desktop */}
              <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block whitespace-nowrap">
                {item.label}
              </div>
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto p-6 sm:p-12">
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
              availablePlayers={players}
              preConfirmations={preConfirmations}
            />
          )}

          {viewMode === 'attendance_report' && (
            <AttendanceReportView />
          )}

          {viewMode === 'generation' && (
            <div className="space-y-12">
              <MatchView 
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
                onAnnounce={handleAnnounce}
                onSwapClick={handleSwapClick}
                onRemovePlayer={handleRemovePlayer}
                onPromoteToSetter={promoteToSetter}
              />
              
              {generationResult && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-px flex-grow bg-slate-200"></div>
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">Posicionamento Tático</h2>
                    <div className="h-px flex-grow bg-slate-200"></div>
                  </div>
                  <CourtDiagram teamA={generationResult.teamA} teamB={generationResult.teamB} />
                </div>
              )}
            </div>
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

          {viewMode === 'dashboard' && (
            <RankingView 
              userRole={userRole}
              refreshPlayers={refreshPlayers}
              handleAnnounceSummary={handleAnnounce}
              isNarratingSummary={isNarratingSummary}
              resetDailyMatches={handleFinishDay}
            />
          )}

          {viewMode === 'rules' && <RulesView />}

          {viewMode === 'admin' && (
            <AdminView 
              resetDailyStats={handleFinishDay}
              resetElo={resetElo}
              triggerSync={triggerSync}
              recalculateStats={recalculateStats}
              recalculateDailyStats={recalculateDailyStats}
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
              deleteTournament={deleteTournament}
              showConfirmModal={showConfirmModal}
            />
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
        />

        <PaymentForm
          isOpen={isPaymentFormOpen}
          onClose={() => {
            setIsPaymentFormOpen(false);
            setEditingPayment(null);
          }}
          onSubmit={handlePaymentSubmit}
          editingPayment={editingPayment}
          paymentFormData={paymentFormData}
          setPaymentFormData={setPaymentFormData}
          players={players}
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
          <div className="fixed bottom-8 right-8 z-50 bg-white/90 backdrop-blur px-6 py-3 rounded-2xl shadow-2xl border border-slate-200 flex items-center gap-4 animate-in slide-in-from-right-8">
            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sincronizando Dados...</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
