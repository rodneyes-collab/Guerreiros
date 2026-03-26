
import React, { useState, useMemo, useEffect } from 'react';
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
  Edit2
} from 'lucide-react';

import { getBrazilDay } from './firebase';
import { useStore } from './store';
import { useAuth } from './src/hooks/useAuth';
import { useFirestoreSync } from './src/hooks/useFirestoreSync';
import { useDailyReset } from './src/hooks/useDailyReset';
import { useNarration } from './src/hooks/useNarration';
import { useAppLogic } from './src/hooks/useAppLogic';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Notification } from './components/Notification';
import { ConfirmModal } from './components/ConfirmModal';
import { AttendanceView } from './components/AttendanceView';
import { MatchView } from './components/MatchView';
import { RankingView } from './components/RankingView';
import { MembersView } from './components/MembersView';
import { PaymentsView } from './components/PaymentsView';
import { RulesView } from './components/RulesView';
import { AdminView } from './components/AdminView';
import { HistoryView } from './components/HistoryView';
import { PlayerForm } from './components/PlayerForm';
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
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    isVerifyingRules,
    isNarratingSummary,
    handleLogin,
    handleLogout,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    handleDiscard,
    handleFinishDay,
    resetDailyMatches,
    handleFinishMatch,
    handleVerifyRules,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateStats,
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
    clearAllHistory,
    clearMatchesOnly,
    clearAllDatabase,
    resetElo,
    refreshPlayers
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
    pendingRequests,
    isFormOpen,
    setIsFormOpen,
    editingPlayer,
    setEditingPlayer,
    triggerSync: forceSync
  } = useStore();

  // --- Local UI State ---
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<any>(null);

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

  // --- Timer Logic ---
  useEffect(() => {
    if (generationResult && viewMode === 'presence') {
      setViewMode('generation');
    }
  }, [generationResult, viewMode, setViewMode]);

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

  // --- Navigation Items ---
  const navItems = useMemo(() => [
    { id: 'presence', label: 'Presença', icon: ClipboardCheck, adminOnly: false },
    { id: 'generation', label: 'Partida', icon: Swords, adminOnly: false },
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

  const promoteToSetter = (teamKey: 'teamA' | 'teamB', playerId: string) => {
    if (!generationResult) return;
    
    const team = generationResult[teamKey];
    const playerIndex = team.players.findIndex((p: any) => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = team.players[playerIndex];
    const newPlayers = [...team.players];
    newPlayers.splice(playerIndex, 1);
    
    setGenerationResult({
      ...generationResult,
      [teamKey]: {
        ...team,
        setter: player,
        players: newPlayers
      }
    });
    showNotification(`${player.name} designado como levantador temporário.`, 'info');
  };

  // --- Render Logic ---
  if (!isAuthReady || (user && isRoleLoading)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl rotate-12 flex items-center justify-center shadow-2xl shadow-indigo-500/20">
            <Zap className="w-10 h-10 text-white fill-white" />
          </div>
          <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">Carregando Sistema...</p>
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
        handleLogin={handleLogin}
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
              isNearCourt={false}
              currentPlayer={currentPlayer}
              registerAttendance={registerAttendance}
              removeAttendance={removeAttendance}
              clearAttendance={clearAttendance}
              onToggleIntention={onToggleIntention}
              refreshPlayers={refreshPlayers}
              resetDailyMatches={resetDailyMatches}
              availablePlayers={players}
              preConfirmations={preConfirmations}
            />
          )}

          {viewMode === 'generation' && (
            <div className="space-y-12">
              <MatchView 
                onGenerate={handleGenerate}
                onDiscard={handleDiscard}
                onFinishDay={handleFinishDay}
                onFinishMatch={handleFinishMatch}
                onVerifyRules={handleVerifyRules}
                isVerifyingRules={isVerifyingRules}
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
            <HistoryView 
              onPlayerClick={(p) => {
                setSelectedPlayerForHistory(p);
                setViewMode('dashboard');
              }}
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

          {viewMode === 'payments' && <PaymentsView />}

          {viewMode === 'dashboard' && (
            <RankingView 
              userRole={userRole}
              refreshPlayers={refreshPlayers}
              handleAnnounceSummary={handleAnnounce}
              isNarratingSummary={isNarratingSummary}
              resetDailyMatches={resetDailyMatches}
            />
          )}

          {viewMode === 'rules' && <RulesView />}

          {viewMode === 'admin' && (
            <AdminView 
              resetDailyStats={resetDailyMatches}
              resetElo={resetElo}
              triggerSync={triggerSync}
              recalculateStats={recalculateStats}
              repairDatabase={repairDatabase}
              initializeEloHistory={initializeEloHistory}
              updateQuotaSettings={updateQuotaSettings}
              clearAllHistory={clearAllHistory}
              clearMatchesOnly={clearMatchesOnly}
              clearAllDatabase={clearAllDatabase}
              pendingRequests={pendingRequests}
              onApproveRequest={onApproveRequest}
              onRejectRequest={onRejectRequest}
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

        {/* Modals & Notifications */}
        <Notification 
          notification={notification} 
          onClose={hideNotification} 
        />
        
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
