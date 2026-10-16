import React, { Suspense, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Payment, Expense, TournamentStrategy, SetScore, SystemMetadata } from '../../types';
import { safeLazy } from '../utils/lazyHelper';

// Components
import { LoginView } from './LoginView';
import { PublicPresenceView } from '../../components/PublicPresenceView';
import { AccessRequestView } from './AccessRequestView';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';
import { UpdateNotificationToast } from './UpdateNotificationToast';
import { ReloadPrompt } from './ReloadPrompt';
import { BirthdayBanner } from './BirthdayBanner';
import { BirthdayList } from './BirthdayList';
import { WelcomeBanner } from './WelcomeBanner';
import { NotificationCenter } from './NotificationCenter';
import { PlayerStatusCard } from './PlayerStatusCard';
import { SyncStatusBadge } from './SyncStatusBadge';
import { Logo } from './Logo';
import { Notification } from '../../components/Notification';
import { ConfirmModal } from '../../components/ConfirmModal';
import { SetterStrategyModal } from '../../components/SetterStrategyModal';
import { SyncSettingsModal } from './SyncSettingsModal';
import { SyncDebuggerModal } from './SyncDebuggerModal';
import { PlayerForm } from '../../components/PlayerForm';
import { PaymentForm } from '../../components/PaymentForm';
import { ExpenseForm } from '../../components/ExpenseForm';
import { SidebarNavigation } from './SidebarNavigation';

// Atomic Lazy Loaded Views to isolate bundle chunks and prevent dependency cycles
const AttendanceView = safeLazy(() => import('../../components/AttendanceView').then(m => ({ default: m.AttendanceView })));
const AttendanceReportView = safeLazy(() => import('../../components/AttendanceReportView').then(m => ({ default: m.AttendanceReportView })));
const IntentionsView = safeLazy(() => import('../../components/IntentionsView').then(m => ({ default: m.IntentionsView })));
const MatchView = safeLazy(() => import('../../components/MatchView').then(m => ({ default: m.MatchView })));
const RankingView = safeLazy(() => import('../../components/RankingView').then(m => ({ default: m.RankingView })));
const MembersView = safeLazy(() => import('../../components/MembersView').then(m => ({ default: m.MembersView })));
const PaymentsView = safeLazy(() => import('../../components/PaymentsView').then(m => ({ default: m.PaymentsView })));
const RulesView = safeLazy(() => import('../../components/RulesView').then(m => ({ default: m.RulesView })));
const AdminView = safeLazy(() => import('../../components/AdminView').then(m => ({ default: m.AdminView })));
const HistoryView = safeLazy(() => import('../../components/HistoryView').then(m => ({ default: m.HistoryView })));
const TournamentView = safeLazy(() => import('../../components/TournamentView').then(m => ({ default: m.TournamentView })));
const MyPaymentsView = safeLazy(() => import('../../components/MyPaymentsView').then(m => ({ default: m.MyPaymentsView })));
const CourtTabletView = safeLazy(() => import('../../components/CourtTabletView').then(m => ({ default: m.CourtTabletView })));

import { LogOut, RefreshCw } from 'lucide-react';
import { APP_VERSION } from '../../constants';

const ViewLoadingFallback = () => (
  <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-white">
    <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
    <span className="text-xs font-black uppercase tracking-widest text-white/40">Carregando Módulo...</span>
  </div>
);

export interface ViewManagerProps {
  // Auth & Session
  isLoggingOut: boolean;
  isAuthReady: boolean;
  user: any;
  isRoleLoading: boolean;
  showRescueLoader: boolean;
  handleRescueReset: () => void;
  isPublicMode: boolean;
  setIsPublicMode: (mode: boolean) => void;
  entryRoute: 'CHOICE' | 'LOGIN' | 'PRESENCE_BIOMETRICS';
  setEntryRoute: (route: any) => void;
  magicLinkEmail: string;
  setMagicLinkEmail: (email: string) => void;
  isSendingMagicLink: boolean;
  isLoggingIn: boolean;
  handleMagicLink: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
  handleLogout: () => void;
  userRole: 'ADMIN' | 'MEMBER' | null;
  requestName: string;
  setRequestName: (name: string) => void;
  isRequestingAccess: boolean;
  isRequestSubmitted: boolean;
  handleRequestAccess: (e: React.FormEvent) => void;

  // System & Offline
  hasNewVersion?: boolean;
  serverVersion?: string;
  needRefresh: boolean;
  updateServiceWorker: () => void;
  todayBirthdays: any[];
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
  currentPlayer: Player | null;
  isOffline: boolean;
  dbStatus: string;
  isSyncing: boolean;
  forceUpdate: () => void;
  isNearCourt: boolean;
  currentBeaconRssi: number | null;

  // State & Data
  attendance: Player[];
  players: Player[];
  matches: any[];
  tournaments: any[];
  systemMetadata: SystemMetadata;
  activeTournament: any;
  generationResult: any;
  navItems: { id: string; label: string; icon: any; adminOnly: boolean }[];
  viewMode: string;
  setViewMode: (mode: any) => void;
  isGameDay: boolean;
  isIntentionPhase: boolean;
  preConfirmations: Player[];

  // Modals & Form States
  isFormOpen: boolean;
  setIsFormOpen: (open: boolean) => void;
  editingPlayer: Player | null;
  setEditingPlayer: (player: Player | null) => void;
  formData: any;
  setFormData: (data: any) => void;
  handlePlayerSubmit: (e: React.FormEvent) => void;

  isPaymentFormOpen: boolean;
  setIsPaymentFormOpen: (open: boolean) => void;
  editingPayment: Payment | null;
  setEditingPayment: (payment: Payment | null) => void;
  paymentFormData: any;
  setPaymentFormData: (data: any) => void;
  handlePaymentSubmit: (e: React.FormEvent) => void;

  isExpenseFormOpen: boolean;
  setIsExpenseFormOpen: (open: boolean) => void;
  editingExpense: any;
  setEditingExpense: (expense: any) => void;
  expenseFormData: any;
  setExpenseFormData: (data: any) => void;
  handleExpenseSubmit: (e: React.FormEvent) => void;

  // Handlers for Views
  onMoveToAttendance: (playerId: string) => void;
  onToggleIntention: (player: Player) => Promise<void>;
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;

  // Attendance Handlers
  clearAttendance: () => void;
  resetDailyMatches: () => void;
  removeAttendance: (id: string) => void;
  updateDepartureTime?: (id: string, time: string | null) => Promise<void>;
  updateArrivalTime?: (id: string, time: string | null) => Promise<void>;
  registerAttendance: (player: Player, method?: string) => Promise<void>;
  refreshPlayers: () => Promise<void>;

  // Match Generation Handlers
  handleGenerate: (onlyCurrentPlayers?: boolean) => void;
  handleDiscard: () => void;
  handleFinishDay: () => void;
  handleDeleteMatchesByDate: (date: string) => void;
  handleFinishMatch: (winner: 'A' | 'B', scoreA?: number, scoreB?: number, stats?: any[]) => void;
  handleVerifyRules: () => void;
  handleAutoFixInconsistencies?: () => void;
  handleAnalyzeMatch: () => void;
  recalculateDailyStats: () => void;
  isVerifyingRules: boolean;
  isAnalyzing: boolean;
  isNarratingSummary: boolean;
  handleAnnounceSummary: (data?: any) => void;
  handleSwapClick: (source: 'A' | 'B' | 'Bench', playerId: string) => void;
  handleRemovePlayer: (team: 'A' | 'B' | string, playerId?: string) => void;
  promoteToSetter: (team: 'A' | 'B', playerId: string) => void;
  updateSystemMetadata: (metadata: Partial<SystemMetadata>) => void;
  handleApplyPreview?: (result: any) => void;

  // Member & Finance Handlers
  clearAllPlayers: () => void;
  deletePlayer: (id: string) => void;
  savePlayer: (player: Player) => Promise<void>;
  repairDatabase: () => void;
  deletePayment: (id: string) => void;
  deleteExpense: (id: string) => void;
  updateMonthlyFee: (fee: number) => void;

  // Tournament Handlers
  startTournament: (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number; strategy: TournamentStrategy }) => Promise<void>;
  recordTournamentMatch: (matchId: string, setScores: SetScore[]) => Promise<void>;
  resetTournamentMatch: (matchId: string) => Promise<void>;
  endTournament: () => Promise<void>;
  addTournamentPlayer: (teamId: string, playerId: string) => Promise<void>;
  substituteTournamentPlayer: (teamId: string, oldPlayerId: string, newPlayerId: string) => Promise<void>;
  deleteTournament: (id: string) => void;

  // History & Admin Handlers
  deleteMatch: (id: string) => void;
  updateMatchResult?: (matchId: string, newWinner: "A" | "B", newScoreA: number, newScoreB: number, newTeamA?: string[], newTeamB?: string[]) => Promise<void>;
  reprocessAllMatchesAndStats?: () => Promise<void>;
  resetDailyStats: () => void;
  resetElo: () => void;
  triggerSync: () => void;
  recalculateStats: () => void;
  initializeEloHistory: () => void;
  updateQuotaSettings: (totalQuota: number) => void;
  createDataSnapshot: (label?: string) => void;
  clearAllHistory: () => void;
  clearMatchesOnly: () => void;
  clearAllDatabase: () => void;
  pendingRequests: any[];
  onApproveRequest: (req: any) => void;
  onRejectRequest: (reqId: string) => void;
  handleScanAnomalies: () => void;
  fixDatabaseAnomalies: () => Promise<void>;
  recalculateAllElo: () => void;
  exportPlayersCSV: () => void;
  exportMatchesCSV: () => void;
  exportPaymentsCSV: () => void;
  handleRecoverFinancials: () => Promise<void>;
  handleFinancialIntegrityAudit?: () => Promise<void>;
}

export const ViewManager: React.FC<ViewManagerProps> = (props) => {
  const {
    isLoggingOut,
    isAuthReady,
    user,
    isRoleLoading,
    showRescueLoader,
    handleRescueReset,
    isPublicMode,
    setIsPublicMode,
    entryRoute,
    magicLinkEmail,
    setMagicLinkEmail,
    isSendingMagicLink,
    isLoggingIn,
    handleMagicLink,
    handleGoogleLogin,
    handleLogout,
    userRole,
    requestName,
    setRequestName,
    isRequestingAccess,
    isRequestSubmitted,
    handleRequestAccess,
    hasNewVersion,
    serverVersion,
    forceUpdate,
    needRefresh,
    updateServiceWorker,
    todayBirthdays,
    showWelcome,
    setShowWelcome,
    currentPlayer,
    isSyncing,
    attendance,
    players,
    matches,
    systemMetadata,
    activeTournament,
    generationResult,
    navItems,
    viewMode,
    setViewMode,
    isGameDay,
    isIntentionPhase,
    preConfirmations,
    isFormOpen,
    setIsFormOpen,
    editingPlayer,
    setEditingPlayer,
    formData,
    setFormData,
    handlePlayerSubmit,
    isPaymentFormOpen,
    setIsPaymentFormOpen,
    editingPayment,
    setEditingPayment,
    paymentFormData,
    setPaymentFormData,
    handlePaymentSubmit,
    isExpenseFormOpen,
    setIsExpenseFormOpen,
    editingExpense,
    setEditingExpense,
    expenseFormData,
    setExpenseFormData,
    handleExpenseSubmit,
    onMoveToAttendance,
    onToggleIntention,
    showNotification,
    showConfirmModal,
    clearAttendance,
    resetDailyMatches,
    removeAttendance,
    updateDepartureTime,
    updateArrivalTime,
    registerAttendance,
    refreshPlayers,
    handleGenerate,
    handleDiscard,
    handleFinishDay,
    handleDeleteMatchesByDate,
    handleFinishMatch,
    handleVerifyRules,
    handleAutoFixInconsistencies,
    handleAnalyzeMatch,
    recalculateDailyStats,
    isVerifyingRules,
    isAnalyzing,
    isNarratingSummary,
    handleAnnounceSummary,
    handleSwapClick,
    handleRemovePlayer,
    promoteToSetter,
    updateSystemMetadata,
    handleApplyPreview,
    clearAllPlayers,
    deletePlayer,
    savePlayer,
    repairDatabase,
    deletePayment,
    deleteExpense,
    updateMonthlyFee,
    startTournament,
    recordTournamentMatch,
    resetTournamentMatch,
    endTournament,
    addTournamentPlayer,
    substituteTournamentPlayer,
    deleteTournament,
    deleteMatch,
    updateMatchResult,
    reprocessAllMatchesAndStats,
    resetDailyStats,
    resetElo,
    triggerSync,
    recalculateStats,
    initializeEloHistory,
    updateQuotaSettings,
    createDataSnapshot,
    clearAllHistory,
    clearMatchesOnly,
    clearAllDatabase,
    pendingRequests,
    onApproveRequest,
    onRejectRequest,
    handleScanAnomalies,
    fixDatabaseAnomalies,
    recalculateAllElo,
    exportPlayersCSV,
    exportMatchesCSV,
    exportPaymentsCSV,
    handleRecoverFinancials,
    handleFinancialIntegrityAudit
  } = props;

  const isAdmin = userRole === 'ADMIN';

  // 1. Logging out screen
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

  // 2. Auth Loading / Rescue screen
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

  // Helper to render version banners on any screen
  const renderVersionOverlay = () => (
    <>
      <ReloadPrompt />
      <UpdateNotificationToast needRefresh={needRefresh} updateServiceWorker={updateServiceWorker} />
      {hasNewVersion && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 right-4 z-[100] bg-amber-500 text-black px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 border border-amber-400/50"
        >
          <div className="p-1.5 bg-black/10 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Nova Versão Disponível</span>
            <span className="text-[9px] font-bold opacity-80 italic">v{serverVersion || '?.?.?'} detectada</span>
          </div>
          <button 
            onClick={() => forceUpdate()}
            className="ml-2 px-3 py-1.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Atualizar Agora
          </button>
        </motion.div>
      )}
    </>
  );

  // 3. Unauthenticated Screen
  if (!user) {
    if (isPublicMode) {
      return (
        <>
          {renderVersionOverlay()}
          <PublicPresenceView 
            onBackToLogin={() => {
              setIsPublicMode(false);
              const url = new URL(window.location.href);
              url.searchParams.delete('public');
              window.history.replaceState({}, document.title, url.pathname + url.search);
            }} 
            handleGoogleLogin={handleGoogleLogin}
          />
        </>
      );
    }

    return (
      <>
        {renderVersionOverlay()}
        <LoginView 
          isAttendanceMode={entryRoute === 'PRESENCE_BIOMETRICS'}
          magicLinkEmail={magicLinkEmail}
          setMagicLinkEmail={setMagicLinkEmail}
          isSendingMagicLink={isSendingMagicLink}
          isLoggingIn={isLoggingIn}
          handleMagicLink={handleMagicLink}
          handleGoogleLogin={handleGoogleLogin}
          onClickPublic={() => {
            setIsPublicMode(true);
            const url = new URL(window.location.href);
            url.searchParams.set('public', 'true');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }}
          onLoginSuccess={() => {
            setIsPublicMode(false);
          }}
        />
      </>
    );
  }

  // 4. Pending Authorization Screen
  if (!userRole) {
    return (
      <>
        {renderVersionOverlay()}
        <AccessRequestView 
          user={user}
          requestName={requestName}
          setRequestName={setRequestName}
          isRequestingAccess={isRequestingAccess}
          isRequestSubmitted={isRequestSubmitted}
          handleRequestAccess={handleRequestAccess}
          handleLogout={handleLogout}
        />
      </>
    );
  }

  // 5. Main Authenticated Application Dashboard
  return (
    <div className="min-h-screen bg-black text-white selection:bg-brand-primary selection:text-brand-secondary pb-24 md:pb-12">
      {/* Animated Desktop Vertical Sidebar */}
      <SidebarNavigation
        navItems={navItems}
        activeTab={viewMode}
        setActiveTab={(id) => setViewMode(id as any)}
        currentPlayer={currentPlayer}
        isAdmin={isAdmin}
        handleLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />

      {/* Main Content Area (Offset by sidebar width on desktop) */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Network & Diagnostics */}
        <NetworkStatusIndicator />
        <UpdateNotificationToast needRefresh={needRefresh} updateServiceWorker={updateServiceWorker} />
        
        {/* Manual Version Update Banner */}
        {hasNewVersion && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-4 right-4 z-[100] bg-amber-500 text-black px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 border border-amber-400/50"
          >
            <div className="p-1.5 bg-black/10 rounded-lg">
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">Nova Versão Disponível</span>
              <span className="text-[9px] font-bold opacity-80 italic">v{serverVersion || '?.?.?'} detectada</span>
            </div>
            <button 
              onClick={() => forceUpdate()}
              className="ml-2 px-3 py-1.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Atualizar Agora
            </button>
          </motion.div>
        )}
        <BirthdayBanner birthdays={todayBirthdays} />
        <WelcomeBanner show={showWelcome} onClose={() => setShowWelcome(false)} playerName={currentPlayer?.name || ''} />

        {/* Header Bar */}
        <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl border-b border-white/5 px-4 lg:px-8 py-3 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setViewMode('intentions')}>
              <Logo size="sm" />
              <div>
                <h1 className="font-black text-sm sm:text-base uppercase tracking-tight italic flex items-center gap-1.5">
                  Guerreiros <span className="text-brand-primary text-[10px] sm:text-xs font-normal bg-brand-primary/10 px-1.5 py-0.5 rounded-lg border border-brand-primary/20">v{APP_VERSION}</span>
                </h1>
                <p className="text-[8px] sm:text-[9px] font-bold text-white/40 uppercase tracking-widest leading-none sm:leading-normal">Volleyball Club</p>
              </div>
            </div>

            {/* Center / Right controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              <SyncStatusBadge />
              <NotificationCenter />
              {currentPlayer && (
                <PlayerStatusCard 
                  currentPlayer={currentPlayer}
                  attendance={attendance}
                  generationResult={generationResult}
                  matches={matches}
                  systemMetadata={systemMetadata}
                  activeTournament={activeTournament}
                />
              )}
              <button
                onClick={handleLogout}
                className="p-2 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-rose-500/20 text-white/60 hover:text-rose-400 rounded-xl border border-white/10 transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-wider md:hidden"
                title="Sair da Conta"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Sair</span>
              </button>
            </div>
          </div>
        </header>

        <BirthdayList todayBirthdays={todayBirthdays} players={players} />

        {/* Main Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
          <Suspense fallback={<ViewLoadingFallback />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {viewMode === 'intentions' && (
                  <IntentionsView 
                    userRole={userRole} 
                    currentPlayer={currentPlayer} 
                    onMoveToAttendance={onMoveToAttendance} 
                    showNotification={showNotification} 
                  />
                )}

                {viewMode === 'presence' && (
                  <AttendanceView 
                    clearAttendance={clearAttendance}
                    resetDailyMatches={resetDailyMatches}
                    removeAttendance={removeAttendance}
                    updateDepartureTime={updateDepartureTime}
                    updateArrivalTime={updateArrivalTime}
                    registerAttendance={registerAttendance}
                    availablePlayers={players}
                    refreshPlayers={refreshPlayers}
                    currentPlayer={currentPlayer}
                    preConfirmations={preConfirmations}
                    isIntentionPhase={isIntentionPhase}
                    isGameDay={isGameDay}
                    onToggleIntention={onToggleIntention}
                    userRole={userRole}
                    setViewMode={setViewMode}
                  />
                )}

                {viewMode === 'generation' && (
                  <MatchView 
                    onGenerate={handleGenerate}
                    onDiscard={handleDiscard}
                    onFinishDay={handleFinishDay}
                    onDeleteMatchesByDate={handleDeleteMatchesByDate}
                    onFinishMatch={handleFinishMatch}
                    onVerifyRules={handleVerifyRules}
                    onAutoFixInconsistencies={handleAutoFixInconsistencies}
                    onAnalyzeMatch={handleAnalyzeMatch}
                    recalculateDailyStats={recalculateDailyStats}
                    isVerifyingRules={isVerifyingRules}
                    isAnalyzing={isAnalyzing}
                    isNarratingSummary={isNarratingSummary}
                    onAnnounce={handleAnnounceSummary}
                    onSwapClick={handleSwapClick}
                    onRemovePlayer={handleRemovePlayer}
                    onPromoteToSetter={promoteToSetter}
                    systemMetadata={systemMetadata}
                    updateSystemMetadata={updateSystemMetadata}
                    updateDepartureTime={updateDepartureTime}
                    userRole={userRole || undefined}
                    onApplyPreview={handleApplyPreview}
                  />
                )}

                {viewMode === 'court_tablet' && (
                  <CourtTabletView onBack={() => setViewMode('generation')} />
                )}

                {viewMode === 'ranking' && (
                  <RankingView 
                    userRole={userRole || 'MEMBER'}
                    refreshPlayers={refreshPlayers}
                    handleAnnounceSummary={handleAnnounceSummary}
                    isNarratingSummary={isNarratingSummary}
                    resetDailyMatches={async () => { resetDailyMatches(); }}
                    fixDatabaseAnomalies={fixDatabaseAnomalies}
                    isDark={true}
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
                    handleFinancialIntegrityAudit={handleFinancialIntegrityAudit}
                  />
                )}

                {viewMode === 'my_payments' && (
                  <MyPaymentsView playerId={currentPlayer?.id || ''} />
                )}

                {viewMode === 'rules' && (
                  <RulesView />
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

                {viewMode === 'history' && (
                  <HistoryView 
                    onDeleteMatch={deleteMatch}
                    onDeleteMatchesByDate={handleDeleteMatchesByDate}
                    onUpdateMatchResult={updateMatchResult}
                    onReprocessAllMatches={reprocessAllMatchesAndStats}
                  />
                )}

                {viewMode === 'admin' && (
                  <AdminView 
                    resetDailyStats={resetDailyStats}
                    resetElo={resetElo}
                    triggerSync={triggerSync}
                    recalculateStats={recalculateStats}
                    recalculateDailyStats={recalculateDailyStats}
                    repairDatabase={repairDatabase}
                    initializeEloHistory={initializeEloHistory}
                    updateQuotaSettings={updateQuotaSettings}
                    updateSystemMetadata={updateSystemMetadata}
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
                    exportPlayersCSV={exportPlayersCSV}
                    exportMatchesCSV={exportMatchesCSV}
                    exportPaymentsCSV={exportPaymentsCSV}
                    handleRecoverFinancials={handleRecoverFinancials}
                    handleFinancialIntegrityAudit={handleFinancialIntegrityAudit}
                    showConfirmModal={showConfirmModal}
                    setEditingPlayer={setEditingPlayer}
                    setIsFormOpen={setIsFormOpen}
                    savePlayer={savePlayer}
                  />
                )}

                {viewMode === 'attendance_report' && (
                  <AttendanceReportView setViewMode={setViewMode} />
                )}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-xl border-t border-white/10 px-2 py-2 flex items-center justify-around overflow-x-auto no-scrollbar">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id as any)}
              className={`flex flex-col items-center gap-1 p-2 min-w-[56px] rounded-xl transition-all ${
                isActive 
                  ? 'text-brand-primary scale-105' 
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Modals & Dialogs */}
      <Notification />
      <ConfirmModal />
      <SetterStrategyModal />
      <SyncSettingsModal />
      <SyncDebuggerModal />

      <PlayerForm 
        isOpen={isFormOpen} 
        onClose={() => { setIsFormOpen(false); setEditingPlayer(null); }} 
        onSubmit={handlePlayerSubmit} 
        formData={formData} 
        setFormData={setFormData} 
        editingPlayer={editingPlayer} 
        isAdmin={userRole === 'ADMIN'} 
      />

      <PaymentForm 
        isOpen={isPaymentFormOpen} 
        onClose={() => { setIsPaymentFormOpen(false); setEditingPayment(null); }} 
        onSubmit={handlePaymentSubmit} 
        paymentFormData={paymentFormData} 
        setPaymentFormData={setPaymentFormData} 
        editingPayment={editingPayment} 
        players={players} 
        isSyncing={isSyncing} 
      />

      <ExpenseForm 
        isOpen={isExpenseFormOpen} 
        onClose={() => { setIsExpenseFormOpen(false); setEditingExpense(null); }} 
        onSubmit={handleExpenseSubmit} 
        expenseFormData={expenseFormData} 
        setExpenseFormData={setExpenseFormData} 
        editingExpense={editingExpense} 
      />
    </div>
  );
};

export default ViewManager;
