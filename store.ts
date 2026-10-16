import { create } from 'zustand';
import { Player, Payment, Match, GenerationResult, SystemMetadata, UsageStats, Expense, Tournament, BalancingStrategy, SyncFrequencyMode } from './types';
import { User } from './firebase';

export type ViewMode = 'presence' | 'history' | 'generation' | 'members' | 'dashboard' | 'ranking' | 'rules' | 'payments' | 'admin' | 'tournament' | 'attendance_report' | 'intentions' | 'my_payments' | 'diagnostics' | 'court_tablet';

interface AppState {
  // Data
  players: Player[];
  payments: Payment[];
  expenses: Expense[];
  preConfirmations: Player[];
  matches: Match[];
  attendance: Player[];
  synergy: Record<string, number>;
  negativeSynergy: Record<string, number>;
  rivalry: Record<string, number>;
  systemMetadata: SystemMetadata;
  
  // UI State
  viewMode: ViewMode;
  isInitialLoading: boolean;
  isSyncing: boolean;
  isBackgroundSyncing: boolean;
  syncError: string | null;
  dbStatus: 'idle' | 'reading' | 'writing';
  user: User | null;
  userRole: 'ADMIN' | 'MEMBER' | null;
  isNearCourt: boolean;
  currentBeaconRssi: number | null;
  currentPlayer: Player | null;
  pendingRequests: any[];
  usageStats: UsageStats;
  monthlyUsageStats: UsageStats;
  syncTrigger: number;
  syncMode: SyncFrequencyMode;
  lastSyncTimestamp: number | null;
  isSyncSettingsOpen: boolean;
  isSyncDebuggerOpen: boolean;
  dateKey: string;
  idToCanonicalId: Record<string, string>;
  
  // Generation Result
  generationResult: GenerationResult | null;
  nextMatchPreview: GenerationResult | null;
  recentFormations: { setterA: string; playersA: string[]; setterB: string; playersB: string[] }[];
  teamGenerationMode: 'PURE_SKILLS' | 'TRUESKILL';
  balancingStrategy: BalancingStrategy;
  balancingRatingMode: 'HYBRID' | 'IC_ONLY';
  
  // Tournament State
  tournaments: Tournament[];
  activeTournament: Tournament | null;
  
  // Analysis & Rules
  analysis: string;
  ruleVerification: string;
  
  // Scoring & Narration
  scoreA: number;
  scoreB: number;
  tempScoreA: string;
  tempScoreB: string;
  scoreMode: 'QUICK' | 'SCORE' | 'SEQUENTIAL';
  elapsedTime: number;
  narrationScript: string;
  narrationAudio: string | null;
  isNarrating: boolean;
  isNarratingSummary: boolean;
  isAnalyzing: boolean;
  isVerifyingRules: boolean;
  isLoggingOut: boolean;
  isScanningAnomalies: boolean;
  anomalyReport: string | null;
  theme: 'light' | 'dark';
  selectedRankingPlayerId: string | null;
  
  // Match State
  matchServingTeam: 'A' | 'B';
  matchRotationA: string[];
  matchRotationB: string[];
  matchPlayEvents: any[];
  matchActiveGenerationId: string | null;
  
  // Management State
  isFormOpen: boolean;
  editingPlayer: Player | null;
  isPaymentFormOpen: boolean;
  editingPayment: Payment | null;
  swapSelection: { source: 'A' | 'B' | 'Bench'; playerId: string } | null;
  
  // UI Feedback
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  };
  setterStrategyModal: {
    isOpen: boolean;
    title: string;
    message: string;
    onChoose: (strategy: 'EVERYONE_SETS' | 'TEMPORARY_SETTER') => void;
    onCancel: () => void;
  };

  // Actions
  setPlayers: (players: Player[] | ((prev: Player[]) => Player[])) => void;
  setPayments: (payments: Payment[] | ((prev: Payment[]) => Payment[])) => void;
  setExpenses: (expenses: Expense[] | ((prev: Expense[]) => Expense[])) => void;
  setPreConfirmations: (players: Player[] | ((prev: Player[]) => Player[])) => void;
  setMatches: (matches: Match[] | ((prev: Match[]) => Match[])) => void;
  setAttendance: (attendance: Player[] | ((prev: Player[]) => Player[])) => void;
  setSynergy: (synergy: Record<string, number>) => void;
  setNegativeSynergy: (synergy: Record<string, number>) => void;
  setRivalry: (rivalry: Record<string, number>) => void;
  setSystemMetadata: (metadata: Partial<SystemMetadata>) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedRankingPlayerId: (id: string | null) => void;
  setIsInitialLoading: (loading: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setIsBackgroundSyncing: (is: boolean) => void;
  setSyncError: (error: string | null) => void;
  setDbStatus: (status: 'idle' | 'reading' | 'writing') => void;
  setUser: (user: User | null) => void;
  setUserRole: (role: 'ADMIN' | 'MEMBER' | null) => void;
  setIsNearCourt: (is: boolean) => void;
  setCurrentBeaconRssi: (rssi: number | null) => void;
  setCurrentPlayer: (player: Player | null) => void;
  setPendingRequests: (requests: any[]) => void;
  setUsageStats: (stats: UsageStats) => void;
  setMonthlyUsageStats: (stats: UsageStats) => void;
  setGenerationResult: (result: GenerationResult | null) => void;
  setNextMatchPreview: (result: GenerationResult | null) => void;
  addRecentFormation: (formation: { setterA: string; playersA: string[]; setterB: string; playersB: string[] }) => void;
  clearRecentFormations: () => void;
  setTeamGenerationMode: (mode: 'PURE_SKILLS' | 'TRUESKILL') => void;
  setBalancingStrategy: (strategy: BalancingStrategy) => void;
  setBalancingRatingMode: (mode: 'HYBRID' | 'IC_ONLY') => void;
  setTournaments: (tournaments: Tournament[] | ((prev: Tournament[]) => Tournament[])) => void;
  setActiveTournament: (tournament: Tournament | null) => void;
  triggerSync: () => void;
  setSyncMode: (mode: SyncFrequencyMode) => void;
  setLastSyncTimestamp: (ts: number | null) => void;
  setIsSyncSettingsOpen: (open: boolean) => void;
  setIsSyncDebuggerOpen: (open: boolean) => void;
  setIdToCanonicalId: (map: Record<string, string>) => void;
  
  setAnalysis: (analysis: string) => void;
  setRuleVerification: (verification: string) => void;
  
  setScoreA: (score: number) => void;
  setScoreB: (score: number) => void;
  setTempScoreA: (score: string) => void;
  setTempScoreB: (score: string) => void;
  setScoreMode: (mode: 'QUICK' | 'SCORE' | 'SEQUENTIAL') => void;
  setElapsedTime: (time: number | ((prev: number) => number)) => void;
  setNarrationScript: (script: string) => void;
  setNarrationAudio: (audio: string | null) => void;
  setIsNarrating: (is: boolean) => void;
  setIsNarratingSummary: (is: boolean) => void;
  setIsAnalyzing: (is: boolean) => void;
  setIsVerifyingRules: (is: boolean) => void;
  setIsLoggingOut: (is: boolean) => void;
  setIsScanningAnomalies: (is: boolean) => void;
  setAnomalyReport: (report: string | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  
  setMatchServingTeam: (team: 'A' | 'B') => void;
  setMatchRotationA: (rot: string[] | ((prev: string[]) => string[])) => void;
  setMatchRotationB: (rot: string[] | ((prev: string[]) => string[])) => void;
  setMatchPlayEvents: (events: any[] | ((prev: any[]) => any[])) => void;
  setMatchActiveGenerationId: (id: string | null) => void;
  
  setIsFormOpen: (isOpen: boolean) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsPaymentFormOpen: (isOpen: boolean) => void;
  setEditingPayment: (payment: Payment | null) => void;
  setSwapSelection: (selection: { source: 'A' | 'B' | 'Bench'; playerId: string } | null) => void;
  
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideNotification: () => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  setConfirmModal: (modal: { title: string; message: string; onConfirm: () => void }) => void;
  hideConfirmModal: () => void;
  showSetterStrategyModal: (title: string, message: string, onChoose: (strategy: 'EVERYONE_SETS' | 'TEMPORARY_SETTER') => void, onCancel?: () => void) => void;
  hideSetterStrategyModal: () => void;
  
  // Helpers
  triggerDbStatus: (status: 'reading' | 'writing') => void;
}

export const useStore = create<AppState>((set) => ({
  players: [],
  payments: [],
  expenses: [],
  preConfirmations: [],
  matches: [],
  attendance: [],
  synergy: {},
  negativeSynergy: {},
  rivalry: {},
  systemMetadata: { 
    lastResetDate: new Date().toISOString().split('T')[0], 
    dailyMatchCount: 0, 
    matchStartTime: null,
    courtLocation: { lat: -23.588453, lng: -46.658890 },
    geofenceRadius: 150,
    monthlyFee: 50,
    isTournamentEnabled: true,
    showEliteQueue: true,
    useTrueSkill: true,
    mvpEfficiencyBonusPercent: 50,
    consecutiveAbsenceLimit: 4
  },
  
  viewMode: (typeof window !== 'undefined' && localStorage.getItem('spikegen_viewMode') as ViewMode) || 'presence',
  isInitialLoading: true,
  isSyncing: false,
  isBackgroundSyncing: false,
  syncError: null,
  dbStatus: 'idle',
  user: null,
  userRole: null,
  isNearCourt: false,
  currentBeaconRssi: null,
  currentPlayer: null,
  pendingRequests: [],
  usageStats: { reads: 0, writes: 0, aiCalls: 0, lastUpdate: '' },
  monthlyUsageStats: { reads: 0, writes: 0, aiCalls: 0, lastUpdate: '' },
  syncTrigger: 0,
  syncMode: (typeof window !== 'undefined' && (localStorage.getItem('guerreiros_sync_mode') as SyncFrequencyMode)) || 'realtime',
  lastSyncTimestamp: null,
  isSyncSettingsOpen: false,
  isSyncDebuggerOpen: false,
  dateKey: '',
  idToCanonicalId: {},
  generationResult: null,
  nextMatchPreview: null,
  recentFormations: [],
  teamGenerationMode: 'PURE_SKILLS',
  balancingStrategy: 'BOTH',
  balancingRatingMode: 'IC_ONLY',
  tournaments: [],
  activeTournament: null,
  analysis: '',
  ruleVerification: '',
  
  scoreA: 0,
  scoreB: 0,
  tempScoreA: '0',
  tempScoreB: '0',
  scoreMode: 'QUICK',
  elapsedTime: 0,
  narrationScript: '',
  narrationAudio: null,
  isNarrating: false,
  isNarratingSummary: false,
  isAnalyzing: false,
  isVerifyingRules: false,
  isLoggingOut: false,
  isScanningAnomalies: false,
  anomalyReport: null,
  theme: (typeof window !== 'undefined' && localStorage.getItem('spikegen_theme') as 'light' | 'dark') || 'dark',
  selectedRankingPlayerId: null,
  
  matchServingTeam: 'A',
  matchRotationA: [],
  matchRotationB: [],
  matchPlayEvents: [],
  matchActiveGenerationId: null,

  isFormOpen: false,
  editingPlayer: null,
  isPaymentFormOpen: false,
  editingPayment: null,
  swapSelection: null,
  
  notification: null,
  confirmModal: {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  },
  setterStrategyModal: {
    isOpen: false,
    title: '',
    message: '',
    onChoose: () => {},
    onCancel: () => {}
  },
  
  setPlayers: (players) => set((state) => ({ 
    players: typeof players === 'function' ? players(state.players) : players 
  })),
  setPayments: (payments) => set((state) => ({ 
    payments: typeof payments === 'function' ? payments(state.payments) : payments 
  })),
  setExpenses: (expenses) => set((state) => ({ 
    expenses: typeof expenses === 'function' ? expenses(state.expenses) : expenses 
  })),
  setPreConfirmations: (preConfirmations) => set((state) => ({ 
    preConfirmations: typeof preConfirmations === 'function' ? preConfirmations(state.preConfirmations) : preConfirmations 
  })),
  setMatches: (matches) => set((state) => ({ 
    matches: typeof matches === 'function' ? matches(state.matches) : matches 
  })),
  setAttendance: (attendance) => set((state) => ({ 
    attendance: typeof attendance === 'function' ? attendance(state.attendance) : attendance 
  })),
  setSynergy: (synergy) => set({ synergy }),
  setNegativeSynergy: (negativeSynergy) => set({ negativeSynergy }),
  setRivalry: (rivalry) => set({ rivalry }),
  setSystemMetadata: (metadata) => set((state) => ({ 
    systemMetadata: { ...state.systemMetadata, ...metadata } 
  })),
  setViewMode: (viewMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('spikegen_viewMode', viewMode);
    }
    set({ viewMode });
  },
  setSelectedRankingPlayerId: (selectedRankingPlayerId) => set({ selectedRankingPlayerId }),
  setIsInitialLoading: (isInitialLoading) => set({ isInitialLoading }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setIsBackgroundSyncing: (isBackgroundSyncing) => set({ isBackgroundSyncing }),
  setSyncError: (syncError) => set({ syncError }),
  setDbStatus: (dbStatus) => set({ dbStatus }),
  setUser: (user) => set({ user }),
  setUserRole: (userRole) => set({ userRole }),
  setIsNearCourt: (isNearCourt) => set({ isNearCourt }),
  setCurrentBeaconRssi: (currentBeaconRssi) => set({ currentBeaconRssi }),
  setCurrentPlayer: (currentPlayer) => set({ currentPlayer }),
  setPendingRequests: (pendingRequests) => set({ pendingRequests }),
  setUsageStats: (usageStats) => set({ usageStats }),
  setMonthlyUsageStats: (monthlyUsageStats) => set({ monthlyUsageStats }),
  setGenerationResult: (generationResult) => set({ generationResult }),
  setNextMatchPreview: (nextMatchPreview) => set({ nextMatchPreview }),
  addRecentFormation: (formation) => set((state) => {
    // Avoid exact duplicate insertions
    const sigA = `${formation.setterA}_${(formation.playersA || []).slice().sort().join('_')}`;
    const sigB = `${formation.setterB}_${(formation.playersB || []).slice().sort().join('_')}`;
    const exists = state.recentFormations.some(f => {
      const fSigA = `${f.setterA}_${(f.playersA || []).slice().sort().join('_')}`;
      const fSigB = `${f.setterB}_${(f.playersB || []).slice().sort().join('_')}`;
      return (fSigA === sigA && fSigB === sigB) || (fSigA === sigB && fSigB === sigA);
    });
    if (exists) return state;
    return {
      recentFormations: [...state.recentFormations.slice(-20), formation]
    };
  }),
  clearRecentFormations: () => set({ recentFormations: [] }),
  setTeamGenerationMode: (teamGenerationMode) => set({ teamGenerationMode }),
  setBalancingStrategy: (balancingStrategy) => set({ balancingStrategy }),
  setBalancingRatingMode: (balancingRatingMode) => set({ balancingRatingMode }),
  setTournaments: (tournaments) => set((state) => ({ 
    tournaments: typeof tournaments === 'function' ? tournaments(state.tournaments) : tournaments 
  })),
  setActiveTournament: (activeTournament) => set({ activeTournament }),
  triggerSync: () => set((state) => ({ syncTrigger: state.syncTrigger + 1, isBackgroundSyncing: true })),
  setSyncMode: (syncMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('guerreiros_sync_mode', syncMode);
    }
    set({ syncMode, syncTrigger: Date.now(), isBackgroundSyncing: true });
  },
  setLastSyncTimestamp: (lastSyncTimestamp) => set({ lastSyncTimestamp }),
  setIsSyncSettingsOpen: (isSyncSettingsOpen) => set({ isSyncSettingsOpen }),
  setIsSyncDebuggerOpen: (isSyncDebuggerOpen) => set({ isSyncDebuggerOpen }),
  setIdToCanonicalId: (idToCanonicalId) => set({ idToCanonicalId }),
  setAnalysis: (analysis) => set({ analysis }),
  setRuleVerification: (ruleVerification) => set({ ruleVerification }),
  
  setScoreA: (scoreA) => set({ scoreA }),
  setScoreB: (scoreB) => set({ scoreB }),
  setTempScoreA: (tempScoreA) => set({ tempScoreA }),
  setTempScoreB: (tempScoreB) => set({ tempScoreB }),
  setScoreMode: (scoreMode) => set({ scoreMode }),
  setElapsedTime: (elapsedTime) => set((state) => ({ 
    elapsedTime: typeof elapsedTime === 'function' ? elapsedTime(state.elapsedTime) : elapsedTime 
  })),
  setNarrationScript: (narrationScript) => set({ narrationScript }),
  setNarrationAudio: (narrationAudio) => set({ narrationAudio }),
  setIsNarrating: (isNarrating) => set({ isNarrating }),
  setIsNarratingSummary: (isNarratingSummary) => set({ isNarratingSummary }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsVerifyingRules: (isVerifyingRules) => set({ isVerifyingRules }),
  setIsLoggingOut: (isLoggingOut) => set({ isLoggingOut }),
  setIsScanningAnomalies: (isScanningAnomalies) => set({ isScanningAnomalies }),
  setAnomalyReport: (anomalyReport) => set({ anomalyReport }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('spikegen_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ theme });
  },
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      localStorage.setItem('spikegen_theme', newTheme);
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    return { theme: newTheme };
  }),
  
  setMatchServingTeam: (matchServingTeam) => set({ matchServingTeam }),
  setMatchRotationA: (rot) => set((state) => ({ matchRotationA: typeof rot === 'function' ? rot(state.matchRotationA) : rot })),
  setMatchRotationB: (rot) => set((state) => ({ matchRotationB: typeof rot === 'function' ? rot(state.matchRotationB) : rot })),
  setMatchPlayEvents: (events) => set((state) => ({ matchPlayEvents: typeof events === 'function' ? events(state.matchPlayEvents) : events })),
  setMatchActiveGenerationId: (matchActiveGenerationId) => set({ matchActiveGenerationId }),
  
  setIsFormOpen: (isFormOpen) => set({ isFormOpen }),
  setEditingPlayer: (editingPlayer) => set({ editingPlayer }),
  setIsPaymentFormOpen: (isPaymentFormOpen) => set({ isPaymentFormOpen }),
  setEditingPayment: (editingPayment) => set({ editingPayment }),
  setSwapSelection: (swapSelection) => set({ swapSelection }),
  
  showNotification: (message, type = 'info') => set({ notification: { message, type } }),
  hideNotification: () => set({ notification: null }),
  showConfirmModal: (title, message, onConfirm) => set({ 
    confirmModal: { isOpen: true, title, message, onConfirm } 
  }),
  setConfirmModal: (modal) => set({
    confirmModal: { ...modal, isOpen: true }
  }),
  hideConfirmModal: () => set((state) => ({ 
    confirmModal: { ...state.confirmModal, isOpen: false } 
  })),
  showSetterStrategyModal: (title, message, onChoose, onCancel = () => {}) => set({
    setterStrategyModal: { isOpen: true, title, message, onChoose, onCancel }
  }),
  hideSetterStrategyModal: () => set((state) => ({
    setterStrategyModal: { ...state.setterStrategyModal, isOpen: false }
  })),
  
  triggerDbStatus: (status) => {
    set({ dbStatus: status });
    setTimeout(() => set({ dbStatus: 'idle' }), 2000);
  }
}));
