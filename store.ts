import { create } from 'zustand';
import { Player, Payment, Match, GenerationResult, SystemMetadata, UsageStats, Expense, Tournament } from './types';
import { User } from './firebase';

export type ViewMode = 'presence' | 'history' | 'generation' | 'members' | 'dashboard' | 'rules' | 'payments' | 'admin' | 'tournament' | 'attendance_report';

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
  dbStatus: 'idle' | 'reading' | 'writing';
  user: User | null;
  userRole: 'ADMIN' | 'MEMBER' | null;
  isNearCourt: boolean;
  currentPlayer: Player | null;
  pendingRequests: any[];
  usageStats: UsageStats;
  syncTrigger: number;
  dateKey: string;
  
  // Generation Result
  generationResult: GenerationResult | null;
  
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

  // Actions
  setPlayers: (players: Player[] | ((prev: Player[]) => Player[])) => void;
  setPayments: (payments: Payment[] | ((prev: Payment[]) => Payment[])) => void;
  setPreConfirmations: (players: Player[] | ((prev: Player[]) => Player[])) => void;
  setMatches: (matches: Match[] | ((prev: Match[]) => Match[])) => void;
  setAttendance: (attendance: Player[] | ((prev: Player[]) => Player[])) => void;
  setSynergy: (synergy: Record<string, number>) => void;
  setNegativeSynergy: (synergy: Record<string, number>) => void;
  setRivalry: (rivalry: Record<string, number>) => void;
  setSystemMetadata: (metadata: Partial<SystemMetadata>) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsInitialLoading: (loading: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setDbStatus: (status: 'idle' | 'reading' | 'writing') => void;
  setUser: (user: User | null) => void;
  setUserRole: (role: 'ADMIN' | 'MEMBER' | null) => void;
  setIsNearCourt: (is: boolean) => void;
  setCurrentPlayer: (player: Player | null) => void;
  setPendingRequests: (requests: any[]) => void;
  setUsageStats: (stats: UsageStats) => void;
  setGenerationResult: (result: GenerationResult | null) => void;
  setTournaments: (tournaments: Tournament[] | ((prev: Tournament[]) => Tournament[])) => void;
  setActiveTournament: (tournament: Tournament | null) => void;
  triggerSync: () => void;
  
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
    lastResetDate: null, 
    dailyMatchCount: 0, 
    matchStartTime: null,
    courtLocation: { lat: -23.588453, lng: -46.658890 },
    geofenceRadius: 150
  },
  
  viewMode: (typeof window !== 'undefined' && localStorage.getItem('spikegen_viewMode') as ViewMode) || 'presence',
  isInitialLoading: true,
  isSyncing: false,
  dbStatus: 'idle',
  user: null,
  userRole: null,
  isNearCourt: false,
  currentPlayer: null,
  pendingRequests: [],
  usageStats: { reads: 0, writes: 0, aiCalls: 0, lastUpdate: '' },
  syncTrigger: 0,
  dateKey: '',
  generationResult: null,
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
  setIsInitialLoading: (isInitialLoading) => set({ isInitialLoading }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setDbStatus: (dbStatus) => set({ dbStatus }),
  setUser: (user) => set({ user }),
  setUserRole: (userRole) => set({ userRole }),
  setIsNearCourt: (isNearCourt) => set({ isNearCourt }),
  setCurrentPlayer: (currentPlayer) => set({ currentPlayer }),
  setPendingRequests: (pendingRequests) => set({ pendingRequests }),
  setUsageStats: (usageStats) => set({ usageStats }),
  setGenerationResult: (generationResult) => set({ generationResult }),
  setTournaments: (tournaments) => set((state) => ({ 
    tournaments: typeof tournaments === 'function' ? tournaments(state.tournaments) : tournaments 
  })),
  setActiveTournament: (activeTournament) => set({ activeTournament }),
  triggerSync: () => set((state) => ({ syncTrigger: state.syncTrigger + 1, isSyncing: true })),
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
  
  triggerDbStatus: (status) => {
    set({ dbStatus: status });
    setTimeout(() => set({ dbStatus: 'idle' }), 2000);
  }
}));
