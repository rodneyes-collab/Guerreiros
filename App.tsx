
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { playSound } from './src/utils/audio';
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
  DollarSign,
  WifiOff,
  Bluetooth,
  Cpu,
  RefreshCw,
  Tv
} from 'lucide-react';

import ViewManager from './src/components/ViewManager';
import { TimerTracker } from './src/components/TimerTracker';

import { getBrazilDay, getFirestoreDateKey, db, doc, updateDoc, setDoc, clearIndexedDbPersistence } from './firebase';
import { useStore } from './store';
import { useAuth } from './src/hooks/useAuth';
import { useFirestoreSync } from './src/hooks/useFirestoreSync';
import { useDailyReset } from './src/hooks/useDailyReset';
import { useNarration } from './src/hooks/useNarration';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { useAppLogic } from './src/hooks/useAppLogic';
import { useMatchSwaps } from './src/hooks/useMatchSwaps';
import { PaymentStatus } from './types';
import { APP_VERSION } from './constants';
import { useServiceWorkerUpdate } from './src/hooks/useServiceWorkerUpdate';
import { useIntentions } from './src/hooks/useIntentions';
import { useNavItems } from './src/hooks/useNavItems';
import { clearOldStorage } from './services/geminiService';
import { calculateEffectiveElo } from './utils/teamLogic';
import { cleanObject } from './utils/helpers';
import { useBirthdays } from './src/hooks/useBirthdays';
import { useWelcomeCelebration } from './src/hooks/useWelcomeCelebration';
import { useAdminAutomations } from './src/hooks/useAdminAutomations';
import { useDatabaseMaintenance } from './src/hooks/useDatabaseMaintenance';
import { useAutoVersionCheck } from './src/hooks/useAutoVersionCheck';

// Module-level safeguard to prevent multi-mount infinite loops in StrictMode/remounts
let versionUpdateChecked = false;

const App: React.FC = () => {
  // --- Hooks ---
  const { hasNewVersion, serverVersion, forceUpdate } = useAutoVersionCheck();
  const { user, userRole, currentPlayer, isAuthReady, isRoleLoading } = useAuth();
  const { commitBatchWithLog } = useFirestoreSync();
  useDailyReset();
  usePushNotifications();
  useAdminAutomations();
  useDatabaseMaintenance();
  const { handleAnnounce } = useNarration();
  
  // --- Store State ---
  const isNearCourt = useStore(state => state.isNearCourt);
  const currentBeaconRssi = useStore(state => state.currentBeaconRssi);
  const attendance = useStore(state => state.attendance);
  const setAttendance = useStore(state => state.setAttendance);
  const players = useStore(state => state.players);
  const showConfirmModal = useStore(state => state.showConfirmModal);
  const viewMode = useStore(state => state.viewMode);
  const setViewMode = useStore(state => state.setViewMode);
  const matches = useStore(state => state.matches);
  const payments = useStore(state => state.payments);
  const preConfirmations = useStore(state => state.preConfirmations);
  const generationResult = useStore(state => state.generationResult);
  const activeTournament = useStore(state => state.activeTournament);
  const tournaments = useStore(state => state.tournaments);
  const idToCanonicalId = useStore(state => state.idToCanonicalId);
  const isVerifyingRules = useStore(state => state.isVerifyingRules);
  const isScanningAnomalies = useStore(state => state.isScanningAnomalies);
  const anomalyReport = useStore(state => state.anomalyReport);
  const isLoggingOut = useStore(state => state.isLoggingOut);
  const isSyncing = useStore(state => state.isSyncing);
  const syncError = useStore(state => state.syncError);
  const dbStatus = useStore(state => state.dbStatus);
  const isNarrating = useStore(state => state.isNarrating);
  const theme = useStore(state => state.theme);
  const toggleTheme = useStore(state => state.toggleTheme);
  const notification = useStore(state => state.notification);
  const hideNotification = useStore(state => state.hideNotification);
  const confirmModal = useStore(state => state.confirmModal);
  const hideConfirmModal = useStore(state => state.hideConfirmModal);
  const swapSelection = useStore(state => state.swapSelection);
  const setSwapSelection = useStore(state => state.setSwapSelection);
  const setElapsedTime = useStore(state => state.setElapsedTime);
  const systemMetadata = useStore(state => state.systemMetadata);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const showNotification = useStore(state => state.showNotification);
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
  const isNarratingSummary = useStore(state => state.isNarratingSummary);
  const prevIsNearCourt = React.useRef(isNearCourt);
  
  // --- App Logic ---
  const {
    magicLinkEmail,
    setMagicLinkEmail,
    isSendingMagicLink,
    isLoggingIn,
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    showSetterPromptModal,
    setShowSetterPromptModal,
    setterPromptData,
    createDataSnapshot,
    handleLogout,
    handleGoogleLogin,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    applyPreviewResult,
    handleDiscard,
    handleFinishDay,
    deleteMatchesByDate,
    handleFinishMatch,
    handleAnalyzeMatch,
    handleVerifyRules,
    handleAutoFixInconsistencies,
    isAnalyzing,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateDailyStats,
    updateSystemMetadata,
    registerAttendance,
    removeAttendance,
    updateDepartureTime,
    updateArrivalTime,
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
    updateMatchResult,
    reprocessAllMatchesAndStats,
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
    deleteTournament,
    exportPlayersCSV,
    exportMatchesCSV,
    exportPaymentsCSV,
    handleRecoverFinancials,
    recreateOctober15Matches
  } = useAppLogic(commitBatchWithLog);
  
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [entryRoute, setEntryRoute] = useState<'CHOICE' | 'LOGIN' | 'PRESENCE_BIOMETRICS'>('LOGIN');
  const { intentions, setIntent } = useIntentions(commitBatchWithLog);
  const [skippedIntentionChoice, setSkippedIntentionChoice] = useState(false);
  const [isSubmittingIntention, setIsSubmittingIntention] = useState(false);
  
  const { needRefresh, updateServiceWorker } = useServiceWorkerUpdate();

  // Automatic consecutive version marker with module-level safeguard
  useEffect(() => {
    if (userRole === 'ADMIN' && systemMetadata && systemMetadata.appVersion !== APP_VERSION && !versionUpdateChecked) {
      versionUpdateChecked = true;
      const nextBuildNumber = (systemMetadata.versionNumber || 0) + 1;
      updateSystemMetadata({
        appVersion: APP_VERSION,
        versionNumber: nextBuildNumber
      }).catch(() => {});
    }
  }, [userRole, systemMetadata, updateSystemMetadata]);

  useEffect(() => {
    if (!user) {
      setSkippedIntentionChoice(false);
    }
  }, [user]);
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Check-in automático de Presença via Bluetooth (com validação contínua e debounce de 3 segundos) ---
  useEffect(() => {
    if (!currentPlayer) return;

    const threshold = systemMetadata.bleProximityThreshold || -60;
    const rssiValue = currentBeaconRssi ?? -100;
    
    // O sinal é considerado aceitável se o scanner estiver ativo, estiver perto da quadra e com sinal forte o suficiente
    const isSignalAcceptable = isNearCourt && rssiValue >= threshold;

    let checkInTimer: NodeJS.Timeout | null = null;

    if (isSignalAcceptable) {
      const isAlreadyCheckedIn = attendance.some(p => p.email === currentPlayer.email);
      if (!isAlreadyCheckedIn) {
        // Inicia o contador de 3 segundos de sinal estável e contínuo
        checkInTimer = setTimeout(() => {
          registerAttendance(currentPlayer, 'MANUAL').catch(() => {});
          showNotification(
            `Estabilização de Sinal Confirmada! Sinal potente de rádio (${rssiValue} dBm >= limite de ${threshold} dBm) por 3s contínuos. Check-in automático de presença realizado com sucesso na quadra!`,
            'success'
          );
        }, 3000);
      }
    }

    return () => {
      if (checkInTimer) {
        clearTimeout(checkInTimer);
      }
    };
  }, [isNearCourt, currentBeaconRssi, systemMetadata.bleProximityThreshold, currentPlayer, attendance, registerAttendance, showNotification]);

  // --- Gerenciador de saída de quadra (Check-out) ---
  useEffect(() => {
    if (prevIsNearCourt.current === true && isNearCourt === false && currentPlayer) {
      // Saiu da quadra! Dispara confirmação de checkout.
      showConfirmModal("Check-out", "Você saiu do raio de sinal da quadra. Confirmar saída?", () => {
        setAttendance(prev => prev.filter(p => p.uid !== currentPlayer.uid));
      });
    }
    prevIsNearCourt.current = isNearCourt;
  }, [isNearCourt, currentPlayer, showConfirmModal, setAttendance]);



  useEffect(() => {
    if (user && entryRoute === 'PRESENCE_BIOMETRICS') {
      const player = players.find(p => p.email === user.email);
      if (player) {
        registerAttendance(player).catch(() => {});
        setEntryRoute('CHOICE'); 
        setViewMode('intentions'); 
      }
    }
  }, [user, entryRoute, players, registerAttendance, setViewMode]);



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

  // Safety reset for narration
  useEffect(() => {
    let timeout: any;
    if (isNarratingSummary || isNarrating) {
      timeout = setTimeout(() => {
        useStore.getState().setIsNarratingSummary(false);
        useStore.getState().setIsNarrating(false);
      }, 60000); // 1 minute safety reset
    }
    return () => clearTimeout(timeout);
  }, [isNarratingSummary, isNarrating]);

  // Diagnostic Log
  useEffect(() => {
    console.log('--- DIAGNOSTIC LOG: INITIALIZING APP ---');
    console.log('ViewManager status:', typeof ViewManager !== 'undefined' ? 'DEFINED' : 'UNDEFINED');
    console.log('App version:', APP_VERSION);
    console.log('Navigator online:', navigator.onLine);
    console.log('--- END DIAGNOSTIC LOG ---');
  }, []);

  // --- Local UI State ---
  const [isPublicMode, setIsPublicMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('public') === 'true';
  });

  useEffect(() => {
    if (user) {
      setIsPublicMode(false);
    }
  }, [user]);

  const [showRescueLoader, setShowRescueLoader] = useState(false);
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<any>(null);

  // --- Auto Check-in / Check-out for NFC/QR Scans ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNfcScan = params.get('source') === 'nfc';
    const isQrScan = params.get('source') === 'qr';

    if ((isNfcScan || isQrScan) && isAuthReady && user && currentPlayer) {
      const existingPlayer = attendance.find(p => p.id === currentPlayer.id && p.status !== 'left');
      
      if (!existingPlayer) {
        registerAttendance(currentPlayer, isNfcScan ? 'NFC' : 'QR').catch(() => {});
        showNotification(`Check-in realizado com sucesso: ${currentPlayer.name}!`, 'success');
        
        try { playSound('success'); } catch (e) {}
      } else {
        const checkInTime = existingPlayer.timestamp || 0;
        const diffMinutes = checkInTime > 0 ? (Date.now() - checkInTime) / (1000 * 60) : 0;
        const thresholdMinutes = 30;

        if (checkInTime === 0 || diffMinutes >= thresholdMinutes) {
          removeAttendance(currentPlayer.id);
          showNotification(`Check-out realizado (removido após ${Math.floor(diffMinutes)} min): ${currentPlayer.name}!`, 'info');
          try { playSound('success'); } catch (e) {}
        } else {
          const remainingMin = Math.ceil(thresholdMinutes - diffMinutes);
          showNotification(`Você já consta na lista (${Math.floor(diffMinutes)} min atrás). O check-out via NFC/QR só após 30 min (faltam ${remainingMin} min).`, 'info');
        }
      }

      // Clear the params to avoid repeated check-ins on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('source');
      url.searchParams.delete('public');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [user, currentPlayer, isAuthReady, attendance, registerAttendance, removeAttendance, showNotification]);

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

  const handleRescueReset = async () => {
    try {
      await clearIndexedDbPersistence(db);
    } catch (e) {
      console.warn('Failed to clear Firestore persistence during rescue:', e);
    }
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
    phone: '',
    deviceId: '',
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
        phone: editingPlayer.phone || '',
        deviceId: editingPlayer.deviceId || '',
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
        phone: '',
        deviceId: '',
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

  // --- Navigation Items (Optimized granular hook) ---
  const navItems = useNavItems({
    userRole,
    isTournamentEnabled: Boolean(systemMetadata?.isTournamentEnabled),
    isGameDay,
    hasAttendance: attendance.length > 0,
  });

  // --- Security Redirect ---
  useEffect(() => {
    if (isAuthReady && userRole) {
      const validViews = [...navItems.map(item => item.id), 'attendance_report', 'intentions', 'court_tablet'];
      const isRestricted = !validViews.includes(viewMode);
      if (isRestricted) {
        setViewMode('intentions');
      }
    }
  }, [userRole, viewMode, navItems, isAuthReady, setViewMode]);

  const isDarkView = true; // Always dark premium now

  // --- Match Swaps Logic (Extracted to useMatchSwaps hook) ---
  const {
    handleSwapClick,
    performSwap,
    handleRemovePlayer,
    promoteToSetter
  } = useMatchSwaps();

  // --- Render Logic ---
  if (!ViewManager) {
    return (
      <>
      <TimerTracker />
      <div className="min-h-screen bg-black flex items-center justify-center p-4 text-white">
        <div className="text-center">
          <p className="text-amber-400 font-bold mb-4 uppercase tracking-widest text-sm">Carregando Módulos do Aplicativo...</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-3 bg-amber-500 text-black font-black rounded-2xl uppercase tracking-widest text-xs"
          >
            Recarregar
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <TimerTracker />
      <ViewManager
      hasNewVersion={hasNewVersion}
      serverVersion={serverVersion}
      isLoggingOut={isLoggingOut} 
      isAuthReady={isAuthReady} 
      user={user} 
      isRoleLoading={isRoleLoading} 
      showRescueLoader={showRescueLoader} 
      handleRescueReset={handleRescueReset} 
      isPublicMode={isPublicMode} 
      setIsPublicMode={setIsPublicMode} 
      entryRoute={entryRoute} 
      setEntryRoute={setEntryRoute} 
      magicLinkEmail={magicLinkEmail} 
      setMagicLinkEmail={setMagicLinkEmail} 
      isSendingMagicLink={isSendingMagicLink} 
      isLoggingIn={isLoggingIn} 
      handleMagicLink={handleMagicLink} 
      handleGoogleLogin={handleGoogleLogin} 
      handleLogout={handleLogout} 
      userRole={userRole} 
      requestName={requestName} 
      setRequestName={setRequestName} 
      isRequestingAccess={isRequestingAccess} 
      isRequestSubmitted={isRequestSubmitted} 
      handleRequestAccess={handleRequestAccess} 
      needRefresh={needRefresh} 
      updateServiceWorker={updateServiceWorker} 
      todayBirthdays={todayBirthdays} 
      showWelcome={showWelcome} 
      setShowWelcome={setShowWelcome} 
      currentPlayer={currentPlayer} 
      isOffline={isOffline} 
      dbStatus={dbStatus} 
      isSyncing={isSyncing} 
      forceUpdate={forceUpdate} 
      isNearCourt={isNearCourt} 
      currentBeaconRssi={currentBeaconRssi} 
      attendance={attendance} 
      players={players}
      matches={matches} 
      tournaments={tournaments}
      generationResult={generationResult}
      systemMetadata={systemMetadata} 
      activeTournament={activeTournament} 
      navItems={navItems} 
      viewMode={viewMode} 
      setViewMode={setViewMode}
      isGameDay={isGameDay}
      isIntentionPhase={isIntentionPhase}
      preConfirmations={preConfirmations}
      isFormOpen={isFormOpen}
      setIsFormOpen={setIsFormOpen}
      editingPlayer={editingPlayer}
      setEditingPlayer={setEditingPlayer}
      formData={formData}
      setFormData={setFormData}
      handlePlayerSubmit={handlePlayerSubmit}
      isPaymentFormOpen={isPaymentFormOpen}
      setIsPaymentFormOpen={setIsPaymentFormOpen}
      editingPayment={editingPayment}
      setEditingPayment={setEditingPayment}
      paymentFormData={paymentFormData}
      setPaymentFormData={setPaymentFormData}
      handlePaymentSubmit={handlePaymentSubmit}
      isExpenseFormOpen={isExpenseFormOpen}
      setIsExpenseFormOpen={setIsExpenseFormOpen}
      editingExpense={editingExpense}
      setEditingExpense={setEditingExpense}
      expenseFormData={expenseFormData}
      setExpenseFormData={setExpenseFormData}
      handleExpenseSubmit={handleExpenseSubmit}
      onMoveToAttendance={(playerId) => {
        const player = players.find(p => p.id === playerId);
        if (player) registerAttendance(player);
      }}
      onToggleIntention={async (player) => {
        const canonicalId = idToCanonicalId[player.id] || player.id;
        const current = intentions[canonicalId]?.intent;
        await setIntent(player.id, current === 'GOING' ? 'NOT_GOING' : 'GOING');
      }}
      showNotification={showNotification}
      showConfirmModal={showConfirmModal}
      clearAttendance={clearAttendance}
      resetDailyMatches={recalculateDailyStats}
      removeAttendance={removeAttendance}
      updateDepartureTime={updateDepartureTime}
      updateArrivalTime={updateArrivalTime}
      registerAttendance={registerAttendance}
      refreshPlayers={refreshPlayers}
      handleGenerate={handleGenerate}
      handleDiscard={handleDiscard}
      handleFinishDay={handleFinishDay}
      handleDeleteMatchesByDate={deleteMatchesByDate}
      handleFinishMatch={handleFinishMatch}
      handleVerifyRules={handleVerifyRules}
      handleAutoFixInconsistencies={handleAutoFixInconsistencies}
      handleAnalyzeMatch={handleAnalyzeMatch}
      recalculateDailyStats={recalculateDailyStats}
      isVerifyingRules={isVerifyingRules}
      isAnalyzing={isAnalyzing}
      isNarratingSummary={isNarratingSummary}
      handleAnnounceSummary={handleAnnounce}
      handleSwapClick={handleSwapClick}
      handleRemovePlayer={handleRemovePlayer}
      promoteToSetter={promoteToSetter}
      updateSystemMetadata={updateSystemMetadata}
      handleApplyPreview={applyPreviewResult}
      clearAllPlayers={clearAllPlayers}
      deletePlayer={deletePlayer}
      savePlayer={savePlayer}
      repairDatabase={repairDatabase}
      deletePayment={deletePayment}
      deleteExpense={deleteExpense}
      updateMonthlyFee={updateMonthlyFee}
      startTournament={startTournament}
      recordTournamentMatch={recordTournamentMatch}
      resetTournamentMatch={resetTournamentMatch}
      endTournament={endTournament}
      addTournamentPlayer={addTournamentPlayer}
      substituteTournamentPlayer={substituteTournamentPlayer}
      deleteTournament={deleteTournament}
      deleteMatch={deleteMatch}
      updateMatchResult={updateMatchResult}
      reprocessAllMatchesAndStats={reprocessAllMatchesAndStats}
      resetDailyStats={recalculateDailyStats}
      resetElo={resetElo}
      triggerSync={triggerSync}
      recalculateStats={recalculateStats}
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
      exportPlayersCSV={exportPlayersCSV}
      exportMatchesCSV={exportMatchesCSV}
      exportPaymentsCSV={exportPaymentsCSV}
      handleRecoverFinancials={handleRecoverFinancials}
      recreateOctober15Matches={recreateOctober15Matches}
    />
    </>
  );
};
export default App;
