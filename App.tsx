
import React, { useState, useCallback, useMemo, useEffect, Component } from 'react';
import { INITIAL_PLAYERS } from './constants';
import { EloChart } from './src/components/EloChart';
import { WinLossChart } from './src/components/WinLossChart';
import { Player, Gender, GenerationResult, Team, Payment, PaymentStatus, Match, MatchMode, SystemMetadata } from './types';
import { generateTeams } from './utils/teamLogic';
import { analyzeMatch, generateNarrationScript, speakNarration, generateDailySummaryNarration, verifyRules, getNarrationAudio } from './services/geminiService';
import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  collection, 
  doc, 
  updateDoc,
  onSnapshot, 
  setDoc, 
  deleteDoc,
  getDocs,
  writeBatch,
  increment,
  arrayUnion,
  User,
  OperationType,
  handleFirestoreError,
  query,
  where,
  orderBy
} from './firebase';
import { 
  Users, 
  Trophy, 
  Calendar, 
  ArrowRight, 
  Plus, 
  Sparkles,
  RefreshCw,
  LogOut,
  Edit2,
  Trash2,
  Save,
  X,
  UserPlus,
  BarChart3,
  TrendingUp,
  TrendingDown,
  History,
  ArrowLeftRight,
  Medal,
  Check,
  RotateCcw,
  LayoutDashboard,
  ClipboardCheck,
  Swords,
  ShieldAlert,
  ShieldCheck,
  Megaphone,
  Volume2,
  LogIn,
  UserCheck,
  Clock,
  Hash,
  CheckCircle2,
  Gem,
  Scale,
  GraduationCap,
  CreditCard,
  DollarSign,
  Search,
  Settings,
  Zap,
  AlertTriangle,
  Database
} from 'lucide-react';
import { useStore, ViewMode } from './store';
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

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `spikegen_attendance_${year}-${month}-${day}`;
};

const safeLocalStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  }
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanObject);
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (val !== undefined) {
      newObj[key] = cleanObject(val);
    }
  });
  return newObj;
};

const App: React.FC = () => {
  // --- Zustand Store ---
  const {
    players, setPlayers,
    attendance, setAttendance,
    matches, setMatches,
    payments, setPayments,
    preConfirmations, setPreConfirmations,
    viewMode, setViewMode,
    userRole, setUserRole,
    isNearCourt, setIsNearCourt,
    currentPlayer, setCurrentPlayer,
    systemMetadata, setSystemMetadata,
    generationResult, setGenerationResult,
    isSyncing, setIsSyncing,
    dbStatus, setDbStatus,
    isNarrating, setIsNarrating,
    isNarratingSummary, setIsNarratingSummary,
    isAnalyzing, setIsAnalyzing,
    isVerifyingRules, setIsVerifyingRules,
    scoreMode, setScoreMode,
    scoreA, setScoreA,
    scoreB, setScoreB,
    tempScoreA, setTempScoreA,
    tempScoreB, setTempScoreB,
    analysis, setAnalysis,
    ruleVerification, setRuleVerification,
    narrationScript, setNarrationScript,
    narrationAudio, setNarrationAudio,
    synergy, setSynergy,
    negativeSynergy, setNegativeSynergy,
    rivalry, setRivalry,
    elapsedTime, setElapsedTime,
    isInitialLoading, setIsInitialLoading,
    isPaymentFormOpen, setIsPaymentFormOpen,
    editingPayment, setEditingPayment,
    user, setUser,
    editingPlayer, setEditingPlayer,
    isFormOpen, setIsFormOpen,
    swapSelection, setSwapSelection,
    notification,
    showNotification,
    hideNotification,
    confirmModal,
    showConfirmModal,
    setConfirmModal,
    hideConfirmModal
  } = useStore();

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<Player | null>(null);

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

  const averageElo = useMemo(() => {
    if (players.length === 0) return 1200;
    const sum = players.reduce((acc, p) => acc + p.elo, 0);
    return Math.round(sum / players.length);
  }, [players]);

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => (b.month || '').localeCompare(a.month || '') || (a.playerName || '').localeCompare(b.playerName || ''));
  }, [payments]);

  // --- Redirecionamento de Segurança por Role ---
  useEffect(() => {
    const isRestricted = navItems.every(item => item.id !== viewMode);
    if (isRestricted) {
      setViewMode('generation'); // 'Partida' é a view padrão segura
    }
  }, [userRole, viewMode, navItems]);

  // --- Sincronização de Role baseada no Cadastro de Sócios ---
  useEffect(() => {
    if (user) {
      console.log('Sincronizando role para:', user.email);
      // Admin padrão por e-mail
      if (user.email?.toLowerCase() === 'rodneyes@gmail.com') {
        console.log('Admin detectado por e-mail: rodneyes@gmail.com');
        setUserRole('ADMIN');
        // Garante que o documento do usuário no Firestore também tenha a role ADMIN
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, cleanObject({ role: 'ADMIN', email: user.email }), { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
      
      if (players.length > 0) {
        const playerProfile = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
        if (playerProfile?.isAdmin) {
          console.log('Admin detectado no perfil do sócio:', playerProfile.name);
          setUserRole('ADMIN');
          // Sincroniza com a coleção 'users' para persistência
          const userRef = doc(db, 'users', user.uid);
          setDoc(userRef, cleanObject({ role: 'ADMIN' }), { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
        }
      }
    }
  }, [user, players]);

  const today = new Date().getDay();
  const isIntentionPhase = today === 2 || today === 3; // Terça ou Quarta
  const isGameDay = today === 4; // Quinta

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setUserRole(null);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Link user to player profile
  useEffect(() => {
    if (user && players.length > 0) {
      const player = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
      if (player) {
        setCurrentPlayer(player);
        // Se o player ainda não tem UID vinculado, vincula agora
        if (!player.uid) {
          const playerRef = doc(db, 'players', player.id);
          updateDoc(playerRef, { uid: user.uid }).catch(console.error);
        }
      }
    } else {
      setCurrentPlayer(null);
    }
  }, [user, players]);

  // Geofencing check
  useEffect(() => {
    if (!user) return;

    const checkLocation = () => {
      if (!navigator.geolocation) return;

      const loc = systemMetadata.courtLocation || { lat: -23.588453, lng: -46.658890 };
      const radius = systemMetadata.geofenceRadius || 150;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const distance = calculateDistance(
            latitude, 
            longitude, 
            loc.lat, 
            loc.lng
          );
          setIsNearCourt(distance <= radius);
        },
        (error) => {
          console.warn("Erro ao obter localização:", error);
        },
        { enableHighAccuracy: true }
      );
    };

    checkLocation();
    const interval = setInterval(checkLocation, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [user, systemMetadata.courtLocation, systemMetadata.geofenceRadius]);

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  }

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, []);

  // --- Firebase Sync ---
  useEffect(() => {
    if (!user) {
      setIsInitialLoading(false);
      return;
    }

    // Listen to user doc (Real-time is important for role changes)
    let unsubscribeUserDoc: (() => void) | null = null;
    const userRef = doc(db, 'users', user.uid);
    unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (user.email?.toLowerCase() === 'rodneyes@gmail.com') {
          setUserRole('ADMIN');
        } else {
          setUserRole(data.role);
        }
      } else {
        const defaultRole = user.email?.toLowerCase() === "rodneyes@gmail.com" ? 'ADMIN' : 'MEMBER';
        setDoc(userRef, cleanObject({
          uid: user.uid,
          email: user.email,
          role: defaultRole
        }), { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
        setUserRole(defaultRole);
      }
    }, (err) => {
      if (err.message.includes('permission') && !auth.currentUser) return;
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });

    // Fetch players and metadata (One-time fetch with local cache to save costs)
    const loadInitialData = async () => {
      triggerDbStatus('reading');
      try {
        // 1. Load Metadata
        const metaSnapshot = await getDocs(collection(db, 'metadata'));
        metaSnapshot.forEach((doc) => {
          if (doc.id === 'synergy') setSynergy(doc.data() || {});
          if (doc.id === 'negative_synergy') setNegativeSynergy(doc.data() || {});
          if (doc.id === 'rivalry') setRivalry(doc.data() || {});
          if (doc.id === 'system') setSystemMetadata(doc.data() || {});
        });

        // 2. Load Players with Local Cache Optimization
        const cachedPlayersStr = safeLocalStorage.getItem('spikegen_players_cache');
        const cachedPlayers: Player[] = cachedPlayersStr ? JSON.parse(cachedPlayersStr) : [];
        const lastSync = parseInt(safeLocalStorage.getItem('spikegen_last_sync') || '0');
        
        // Se o cache for recente (menos de 1 hora), usa ele primeiro
        if (cachedPlayers.length > 0) {
          setPlayers(cachedPlayers);
          if (Date.now() - lastSync < 3600000) {
            setIsInitialLoading(false);
            // Busca incremental em background para economizar leituras
            const q = query(collection(db, 'players'), where('updatedAt', '>', lastSync));
            const updateSnapshot = await getDocs(q);
            if (!updateSnapshot.empty) {
              const updatedPlayers = [...cachedPlayers];
              updateSnapshot.forEach(doc => {
                const data = doc.data() as Player;
                const idx = updatedPlayers.findIndex(p => p.id === data.id);
                if (idx !== -1) updatedPlayers[idx] = data;
                else updatedPlayers.push(data);
              });
              setPlayers(updatedPlayers);
              safeLocalStorage.setItem('spikegen_players_cache', JSON.stringify(updatedPlayers));
              safeLocalStorage.setItem('spikegen_last_sync', Date.now().toString());
            }
            return;
          }
        }

        const playerSnapshot = await getDocs(collection(db, 'players'));
        const playersList: Player[] = [];
        playerSnapshot.forEach((doc) => {
          playersList.push(doc.data() as Player);
        });

        if (playersList.length > 0) {
          setPlayers(playersList);
          safeLocalStorage.setItem('spikegen_players_cache', JSON.stringify(playersList));
          safeLocalStorage.setItem('spikegen_last_sync', Date.now().toString());
        } else {
          // Seed if empty
          const batch = writeBatch(db);
          INITIAL_PLAYERS.forEach(p => {
            const player = { ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, playedLastMatch: false, updatedAt: Date.now() };
            batch.set(doc(db, 'players', player.id), cleanObject(player));
          });
          await batch.commit();
          setPlayers(INITIAL_PLAYERS.map(p => ({ ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, playedLastMatch: false })));
        }
        setIsInitialLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'initial_load');
        setIsInitialLoading(false);
      }
    };

    loadInitialData();

    return () => {
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, [user]);

  const refreshPlayers = async () => {
    if (!user) return;
    setIsSyncing(true);
    triggerDbStatus('reading');
    try {
      const playerSnapshot = await getDocs(collection(db, 'players'));
      const playersList: Player[] = [];
      playerSnapshot.forEach((doc) => {
        playersList.push(doc.data() as Player);
      });
      if (playersList.length > 0) {
        setPlayers(playersList);
        safeLocalStorage.setItem('spikegen_players_cache', JSON.stringify(playersList));
        safeLocalStorage.setItem('spikegen_last_sync', Date.now().toString());
        showNotification("Lista de sócios atualizada!", "success");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'refresh_players');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Fetch Large Data (Payments & Matches) only when needed ---
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Fetch payments if in payments view
      if (viewMode === 'payments') {
        triggerDbStatus('reading');
        try {
          const snapshot = await getDocs(collection(db, 'payments'));
          const paymentsList: Payment[] = [];
          snapshot.forEach((doc) => paymentsList.push(doc.data() as Payment));
          setPayments(paymentsList);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'payments');
        }
      }

      // Fetch matches if in generation, dashboard, history or admin view
      if (viewMode === 'generation' || viewMode === 'dashboard' || viewMode === 'history' || viewMode === 'admin') {
        triggerDbStatus('reading');
        try {
          const snapshot = await getDocs(collection(db, 'matches'));
          const matchesList: Match[] = [];
          snapshot.forEach((doc) => matchesList.push(doc.data() as Match));
          setMatches(matchesList.sort((a, b) => a.timestamp - b.timestamp));
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'matches');
        }
      }
    };

    fetchData();

    let unsubscribePre: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;

    if (user) {
      // Sync preConfirmations in real-time
      unsubscribePre = onSnapshot(collection(db, 'preConfirmations'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push(doc.data() as Player));
        setPreConfirmations(list);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'preConfirmations');
      });

      // Sync attendance in real-time
      const dateKey = new Date().toISOString().split('T')[0];
      unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push(doc.data() as Player));
        setAttendance(list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, `attendance/${dateKey}/players`);
      });
    }

    return () => {
      if (unsubscribePre) unsubscribePre();
      if (unsubscribeAttendance) unsubscribeAttendance();
    };
  }, [user, viewMode]);

  const toggleIntention = async (player: Player) => {
    if (!user) return;
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      const isConfirmed = preConfirmations.some(p => p.id === player.id);
      if (isConfirmed) {
        await deleteDoc(doc(db, 'preConfirmations', player.id));
        showNotification("Intenção de jogo removida.", "info");
      } else {
        await setDoc(doc(db, 'preConfirmations', player.id), cleanObject(player));
        showNotification("Intenção de jogo confirmada!", "success");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `preConfirmations/${player.id}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncPlayerToFirebase = async (player: Player) => {
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      const playerWithTimestamp = { ...player, updatedAt: Date.now() };
      await setDoc(doc(db, 'players', player.id), cleanObject(playerWithTimestamp));
      // Update cache
      const cachedPlayersStr = safeLocalStorage.getItem('spikegen_players_cache');
      if (cachedPlayersStr) {
        const cachedPlayers: Player[] = JSON.parse(cachedPlayersStr);
        const updatedCache = cachedPlayers.map(p => p.id === player.id ? playerWithTimestamp : p);
        if (!updatedCache.some(p => p.id === player.id)) updatedCache.push(playerWithTimestamp);
        safeLocalStorage.setItem('spikegen_players_cache', JSON.stringify(updatedCache));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `players/${player.id}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const deletePlayerFromFirebase = async (id: string) => {
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      await deleteDoc(doc(db, 'players', id));
      // Update cache
      const cachedPlayersStr = safeLocalStorage.getItem('spikegen_players_cache');
      if (cachedPlayersStr) {
        const cachedPlayers: Player[] = JSON.parse(cachedPlayersStr);
        const updatedCache = cachedPlayers.filter(p => p.id !== id);
        safeLocalStorage.setItem('spikegen_players_cache', JSON.stringify(updatedCache));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `players/${id}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncMetadataToFirebase = async (type: 'synergy' | 'rivalry' | 'system', data: any) => {
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      const cleanedData = cleanObject(data);
      await setDoc(doc(db, 'metadata', type), cleanedData);
      
      // Update local state to keep UI in sync
      if (type === 'system') setSystemMetadata(cleanedData);
      if (type === 'synergy') setSynergy(cleanedData);
      if (type === 'rivalry') setRivalry(cleanedData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `metadata/${type}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const savePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Tentando salvar pagamento. UserRole:', userRole, 'UserEmail:', user?.email);
    if (userRole !== 'ADMIN') {
      showNotification('Apenas administradores podem salvar pagamentos.', 'error');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const playerId = formData.get('playerId') as string;
    const player = players.find(p => p.id === playerId);
    
    const amount = Number(formData.get('amount'));
    if (isNaN(amount)) {
      showNotification('Valor inválido.', 'error');
      return;
    }

    const paymentData: Payment = {
      id: editingPayment?.id || Date.now().toString(),
      playerId,
      playerName: player?.name || 'Desconhecido',
      amount: amount,
      month: formData.get('month') as string,
      paymentDate: formData.get('paymentDate') as string,
      dueDate: formData.get('dueDate') as string || new Date().toISOString().split('T')[0],
      status: (formData.get('status') as PaymentStatus) || PaymentStatus.PAID,
    };

    console.log('Dados do pagamento a serem salvos:', paymentData);
    console.log('ID do documento:', paymentData.id);

    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      const docRef = doc(db, 'payments', paymentData.id);
      console.log('Caminho do documento:', docRef.path);
      await setDoc(docRef, cleanObject(paymentData));
      console.log('Pagamento salvo com sucesso no Firestore!');
      setIsPaymentFormOpen(false);
      setEditingPayment(null);
      showNotification('Pagamento salvo com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao salvar pagamento no Firestore:', error);
      handleFirestoreError(error, OperationType.WRITE, `payments/${paymentData.id}`);
      showNotification('Erro ao salvar pagamento. Verifique as permissões.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const deletePayment = async (id: string) => {
    if (userRole !== 'ADMIN') return;
    
    setConfirmModal({
      title: 'Excluir Pagamento',
      message: 'Tem certeza que deseja excluir este registro de pagamento?',
      onConfirm: async () => {
        setIsSyncing(true);
        triggerDbStatus('writing');
        try {
          await deleteDoc(doc(db, 'payments', id));
          showNotification('Pagamento excluído!', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `payments/${id}`);
          showNotification('Erro ao excluir pagamento.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  // Auto-reset daily stats on new day
  useEffect(() => {
    if (isInitialLoading || !user || players.length === 0) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    if (systemMetadata.lastResetDate && systemMetadata.lastResetDate !== today) {
      const performReset = async () => {
        console.log("Novo dia detectado. Zerando estatísticas...");
        const reset = (p: Player) => ({ ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [] });
        
        try {
          const batch = writeBatch(db);
            players.forEach(p => {
              const playerRef = doc(db, 'players', p.id);
              batch.update(playerRef, { 
                dailyMatches: 0, 
                dailyWins: 0, 
                dailyLosses: 0,
                dailyEloGain: 0,
                dailyResults: []
              });
            });
          
          // Clear matches for the new day? 
          // Usually match history is kept, but maybe the user wants to see only today's matches in the table?
          // The user said "visualizar quais partidas cada um participou e a sequencia de partidas".
          // If it's a "Reset Day", maybe we should archive or just filter the matches in the UI.
          // Let's keep the matches but filter them in the UI by date if needed.
          
          const systemRef = doc(db, 'metadata', 'system');
          batch.set(systemRef, { 
            lastResetDate: today,
            dailyMatchCount: 0,
            matchStartTime: null
          });
          
          await batch.commit();
          
          setPlayers(prev => prev.map(reset));
          setAttendance(prev => prev.map(reset));
          showNotification("Novo dia! Estatísticas diárias foram zeradas.", "info");
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-reset-daily');
        }
      };
      
      performReset();
    } else if (!systemMetadata.lastResetDate && !isInitialLoading) {
      syncMetadataToFirebase('system', { 
        lastResetDate: today,
        dailyMatchCount: 0,
        matchStartTime: null
      });
    }
  }, [systemMetadata.lastResetDate, isInitialLoading, user, players.length]);

  // Pre-generate narration script and audio when teams are generated
  useEffect(() => {
    if (generationResult) {
      const loadNarration = async () => {
        try {
          const script = await generateNarrationScript(generationResult.teamA, generationResult.teamB);
          setNarrationScript(script);
          
          // Pre-fetch audio to eliminate delay during announcement
          const audioData = await getNarrationAudio(script);
          if (audioData) {
            setNarrationAudio(audioData);
          }
        } catch (err) {
          console.error("Failed to pre-generate narration:", err);
        }
      };
      loadNarration();
    } else {
      setNarrationScript('');
      setNarrationAudio(null);
    }
  }, [generationResult]);
  
  // --- Estados de Gestão ---
  // Migrated to Zustand

  // --- Persistência de ViewMode ---
  useEffect(() => {
    safeLocalStorage.setItem('spikegen_viewMode', viewMode);
  }, [viewMode]);

  // --- Persistência Local (Backup) ---
  useEffect(() => {
    safeLocalStorage.setItem('spikegen_players_v4', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    safeLocalStorage.setItem(getTodayKey(), JSON.stringify(attendance));
  }, [attendance]);

  // Sincroniza os dados da lista de presença com a lista mestre de jogadores
  // Isso garante que estatísticas (ELO, partidas) estejam sempre atualizadas na presença
  useEffect(() => {
    if (players.length > 0 && attendance.length > 0) {
      const updatedAttendance = attendance
        .map((attPlayer): Player | null => {
          const masterPlayer = players.find(p => p.id === attPlayer.id);
          if (masterPlayer) {
            // Mantém a ordem de chegada mas atualiza os dados técnicos/estatísticos
            return { ...masterPlayer, arrivalOrder: (attPlayer as any).arrivalOrder };
          }
          return null;
        })
        .filter((p): p is Player => p !== null);

      // Só atualiza se houver mudança real para evitar loops
      if (JSON.stringify(updatedAttendance) !== JSON.stringify(attendance)) {
        setAttendance(updatedAttendance);
      }
    }
  }, [players]);

  const translateGender = (gender: Gender) => gender === Gender.MALE ? 'Masculino' : 'Feminino';

  const resetDailyMatches = () => {
    setConfirmModal({
      title: 'Reiniciar o Dia',
      message: 'Deseja realmente zerar todas as estatísticas diárias e o contador de partidas? Esta ação sincronizará com todos os dispositivos e não pode ser desfeita.',
      onConfirm: async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          
          // Coleta todos os IDs únicos de jogadores (da lista mestre e da presença)
          const allPlayerIds = new Set([
            ...players.map(p => p.id),
            ...attendance.map(p => p.id)
          ]);
          
          allPlayerIds.forEach(id => {
            const playerRef = doc(db, 'players', id);
            batch.update(playerRef, { 
              dailyMatches: 0, 
              dailyWins: 0, 
              dailyLosses: 0,
              dailyEloGain: 0,
              playedLastMatch: false
            });
          });
          
          // Clear matches for the day when manually resetting
          matches.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });
          
          const systemRef = doc(db, 'metadata', 'system');
          batch.update(systemRef, { 
            dailyMatchCount: 0,
            matchStartTime: null
          });
          
          await batch.commit();
          setAttendance([]);
          
          showNotification('Dia reiniciado com sucesso! Recarregando...', 'success');
          
          // Pequeno delay para a notificação ser vista antes do reload
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-manual-reset');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  const handleFinishDay = async () => {
    setConfirmModal({
      title: 'Finalizar Sessão do Dia',
      message: 'Isso irá anunciar o resumo final, limpar a lista de presença e zerar as estatísticas de hoje para começar uma nova sessão amanhã. Confirmar?',
      onConfirm: async () => {
        try {
          // 1. Tenta anunciar o resumo primeiro
          await handleAnnounceSummary();
          
          // 2. Executa o reset
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          
          const allPlayerIds = new Set([
            ...players.map(p => p.id),
            ...attendance.map(p => p.id)
          ]);
          
          allPlayerIds.forEach(id => {
            batch.update(doc(db, 'players', id), { 
              dailyMatches: 0, 
              dailyWins: 0, 
              dailyLosses: 0,
              dailyEloGain: 0,
              playedLastMatch: false
            });
          });
          
          matches.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });
          
          batch.update(doc(db, 'metadata', 'system'), { 
            dailyMatchCount: 0,
            matchStartTime: null
          });
          
          await batch.commit();
          setAttendance([]);
          showNotification('Dia finalizado com sucesso!', 'success');
        } catch (error) {
          console.error("Erro ao finalizar dia:", error);
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  const resetCareerStats = () => {
    setConfirmModal({
      title: '⚠️ ZERAR ESTATÍSTICAS (PERIGOSO)',
      message: 'Deseja realmente zerar o ELO (1200) e todas as vitórias/derrotas históricas de TODOS os sócios? Esta ação é irreversível.',
      onConfirm: async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          players.forEach(p => {
            batch.update(doc(db, 'players', p.id), {
              elo: 1200,
              matchesPlayed: 0,
              wins: 0,
              losses: 0,
              dailyMatches: 0,
              dailyWins: 0,
              dailyLosses: 0,
              dailyEloGain: 0,
              playedLastMatch: false
            });
          });
          await batch.commit();
          showNotification('Estatísticas de todos os sócios foram zeradas.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-career-reset');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  const resetAllData = () => {
    setConfirmModal({
      title: '🚨 ZERAR TUDO (RECOMEÇO TOTAL)',
      message: 'Isso irá apagar TODAS as partidas, zerar todos os ELOs, limpar a presença e resetar as estatísticas diárias. Use apenas para começar uma temporada do zero. Confirmar?',
      onConfirm: async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          
          // 1. Zerar Jogadores
          players.forEach(p => {
            batch.update(doc(db, 'players', p.id), {
              elo: 1200,
              matchesPlayed: 0,
              wins: 0,
              losses: 0,
              dailyMatches: 0,
              dailyWins: 0,
              dailyLosses: 0,
              dailyEloGain: 0,
              playedLastMatch: false
            });
          });

          // 2. Apagar Partidas
          matches.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });

          // 3. Resetar Metadados do Sistema
          batch.update(doc(db, 'metadata', 'system'), { 
            dailyMatchCount: 0,
            matchStartTime: null,
            lastResetDate: new Date().toISOString().split('T')[0]
          });

          // 4. Limpar Sinergia e Rivalidades
          batch.set(doc(db, 'metadata', 'synergy'), {});
          batch.set(doc(db, 'metadata', 'rivalry'), {});

          await batch.commit();
          setAttendance([]);
          setMatches([]);
          
          showNotification('Sistema zerado com sucesso! Tudo pronto para o recomeço.', 'success');
          
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-total-reset');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  // --- Lógica de Sócios ---
  const savePlayer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      showNotification("Você precisa estar logado para realizar esta ação.", "error");
      return;
    }
    const formData = new FormData(e.currentTarget);
    const eloValue = formData.get('elo');
    const playerData: Player = {
      id: editingPlayer?.id || generateUUID(),
      name: formData.get('name') as string,
      gender: formData.get('gender') as Gender,
      isOfficialSetter: formData.get('isOfficialSetter') === 'on',
      isAdmin: formData.get('isAdmin') === 'on',
      elo: eloValue !== null ? parseInt(eloValue as string) : (editingPlayer?.elo || averageElo),
      playedLastMatch: editingPlayer?.playedLastMatch || false,
      matchesPlayed: editingPlayer?.matchesPlayed || 0,
      dailyMatches: editingPlayer?.dailyMatches || 0,
      dailyWins: editingPlayer?.dailyWins || 0,
      dailyLosses: editingPlayer?.dailyLosses || 0,
      dailyEloGain: editingPlayer?.dailyEloGain || 0,
      wins: editingPlayer?.wins || 0,
      losses: editingPlayer?.losses || 0,
    };

    const email = formData.get('email') as string;
    if (email && email.trim() !== '') playerData.email = email.trim();
    const joinedAt = formData.get('joinedAt') as string;
    if (joinedAt) playerData.joinedAt = joinedAt;
    const birthDate = formData.get('birthDate') as string;
    if (birthDate) playerData.birthDate = birthDate;

    // Update local state
    if (editingPlayer) {
      setPlayers(prev => prev.map(p => p.id === editingPlayer.id ? playerData : p));
      // FIX: Update attendance if player is there (fixes rename bug)
      setAttendance(prev => prev.map(p => p.id === editingPlayer.id ? { ...playerData, arrivalOrder: p.arrivalOrder } : p));
    } else {
      setPlayers(prev => [...prev, playerData]);
    }
    
    // Sync to Firebase
    syncPlayerToFirebase(playerData).then(() => {
      showNotification('Sócio salvo com sucesso.', 'success');
    }).catch(() => {
      showNotification('Erro ao salvar sócio no banco de dados.', 'error');
    });
    
    setIsFormOpen(false);
    setEditingPlayer(null);
  };

  const deletePlayer = (id: string) => {
    if (!user) {
      showNotification("Você precisa estar logado para realizar esta ação.", "error");
      return;
    }
    setConfirmModal({
      title: 'Excluir Sócio',
      message: 'Deseja excluir este sócio permanentemente?',
      onConfirm: () => {
        // Update local state
        setPlayers(players.filter(p => p.id !== id));
        setAttendance(attendance.filter(p => p.id !== id));
        
        // Sync to Firebase
        deletePlayerFromFirebase(id);
        showNotification('Sócio excluído com sucesso.', 'success');
        hideConfirmModal();
      }
    });
  };

  const clearAllPlayers = () => {
    if (players.length === 0) return;
    setConfirmModal({
      title: 'Excluir Todos os Sócios',
      message: 'Deseja excluir TODOS os sócios permanentemente? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        setIsSyncing(true);
        triggerDbStatus('writing');
        try {
          const batch = writeBatch(db);
          players.forEach(p => {
            batch.delete(doc(db, 'players', p.id));
          });
          await batch.commit();
          
          setPlayers([]);
          setAttendance([]);
          showNotification('Todos os sócios foram removidos.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-clear-players');
        } finally {
          setIsSyncing(false);
        }
      }
    });
  };

  // --- Lógica de Troca de Jogadores ---
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
    ].filter(Boolean) as Player[];

    const p1 = allPlayers.find(p => p.id === id1);
    const p2 = allPlayers.find(p => p.id === id2);

    if (!p1 || !p2) return;

    const swapInTeam = (team: Team) => {
      let newSetter = team.setter;
      if (team.setter?.id === id1) newSetter = p2;
      else if (team.setter?.id === id2) newSetter = p1;

      const newPlayers = team.players.map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });

      return { ...team, setter: newSetter, players: newPlayers };
    };

    const swapInList = (list: Player[]) => {
      return list.map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });
    };

    const newTeamA = swapInTeam(generationResult.teamA);
    const newTeamB = swapInTeam(generationResult.teamB);
    const newRemaining = swapInList(generationResult.remainingPlayers);

    const calcElo = (t: Team) => (t.players.reduce((s, p) => s + p.elo, 0) + (t.setter?.elo || 0));

    setGenerationResult({
      teamA: { ...newTeamA, totalElo: calcElo(newTeamA) },
      teamB: { ...newTeamB, totalElo: calcElo(newTeamB) },
      remainingPlayers: newRemaining
    });
  };

  const handleRemovePlayer = (playerId: string) => {
    if (!generationResult) return;
    if (generationResult.remainingPlayers.length === 0) {
      showNotification("Não há reservas disponíveis para substituição!", "error");
      return;
    }
    // Troca com o primeiro da reserva
    performSwap(playerId, generationResult.remainingPlayers[0].id);
  };

  // --- Lógica de Presença ---
  const registerAttendance = useCallback(async (player: Player) => {
    // Se for quinta-feira e o próprio jogador estiver fazendo check-in
    if (isGameDay && currentPlayer?.id === player.id) {
      // Verifica se ele pré-confirmou
      const hasPreConfirmed = preConfirmations.some(p => p.id === player.id);
      if (!hasPreConfirmed && userRole !== 'ADMIN') {
        showNotification("Apenas quem pré-confirmou na terça/quarta pode fazer auto-check-in.", "error");
        return;
      }
      
      // Verifica GPS se não for admin
      if (userRole !== 'ADMIN' && !isNearCourt) {
        showNotification("Você precisa estar na quadra para confirmar presença.", "error");
        return;
      }
    }

    if (attendance.some(p => p.id === player.id)) return;
    if (navigator.vibrate) navigator.vibrate(50);
    
    const dateKey = new Date().toISOString().split('T')[0];
    const playerWithOrder = { ...player, arrivalOrder: attendance.length + 1 };
    
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      await setDoc(doc(db, 'attendance', dateKey, 'players', player.id), cleanObject(playerWithOrder));
      showNotification(`${player.name} confirmado na lista!`, "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${dateKey}/players/${player.id}`);
    } finally {
      setIsSyncing(false);
    }
  }, [attendance, isGameDay, currentPlayer, preConfirmations, userRole, isNearCourt]);

  const removeAttendance = useCallback(async (playerId: string) => {
    if (navigator.vibrate) navigator.vibrate(30);
    
    const dateKey = new Date().toISOString().split('T')[0];
    setIsSyncing(true);
    triggerDbStatus('writing');
    try {
      await deleteDoc(doc(db, 'attendance', dateKey, 'players', playerId));
      
      // Reordenar os que ficaram
      const remaining = attendance.filter(p => p.id !== playerId).sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0));
      const batch = writeBatch(db);
      remaining.forEach((p, idx) => {
        const ref = doc(db, 'attendance', dateKey, 'players', p.id);
        batch.update(ref, { arrivalOrder: idx + 1 });
      });
      await batch.commit();
      
      showNotification("Removido da lista de presença.", "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${dateKey}/players/${playerId}`);
    } finally {
      setIsSyncing(false);
    }
  }, [attendance]);

  const clearAttendance = () => {
    if (attendance.length === 0) return;
    setConfirmModal({
      title: 'Limpar Lista',
      message: 'Deseja realmente limpar toda a lista de presença e ZERAR as estatísticas diárias de todos?',
      onConfirm: async () => {
        setIsSyncing(true);
        triggerDbStatus('writing');
        try {
          const dateKey = new Date().toISOString().split('T')[0];
          const batch = writeBatch(db);
          
          // 1. Deletar todos da presença no Firestore
          attendance.forEach(p => {
            batch.delete(doc(db, 'attendance', dateKey, 'players', p.id));
          });
          
          // 2. Resetar estatísticas diárias dos jogadores
          const reset = (p: Player) => ({ ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, playedLastMatch: false });
          players.forEach(p => {
            const ref = doc(db, 'players', p.id);
            batch.update(ref, reset(p));
          });
          
          await batch.commit();
          setAttendance([]);
          setPlayers(players.map(reset));
          
          showNotification("Lista e estatísticas diárias limpas.", "info");
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'clear-attendance-batch');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    });
  };

  const promoteToSetter = (teamKey: 'teamA' | 'teamB', playerId: string) => {
    if (!generationResult) return;
    
    const team = generationResult[teamKey];
    const playerIndex = team.players.findIndex(p => p.id === playerId);
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

  // Timer para duração da partida
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (generationResult && systemMetadata.matchStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - systemMetadata.matchStartTime!) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [generationResult, systemMetadata.matchStartTime]);

  const handleGenerate = async (onlyCurrentPlayers: boolean | any = false) => {
    // Se onlyCurrentPlayers for um evento (clique direto), tratamos como false
    const isReshuffle = onlyCurrentPlayers === true;
    
    const playersToUse = (isReshuffle && generationResult) 
      ? [
          ...(generationResult.teamA.setter ? [generationResult.teamA.setter] : []),
          ...generationResult.teamA.players,
          ...(generationResult.teamB.setter ? [generationResult.teamB.setter] : []),
          ...generationResult.teamB.players
        ]
      : attendance;

    if (playersToUse.length < 10) {
      showNotification("Para gerar uma partida equilibrada, são necessários no mínimo 10 sócios presentes (5 para cada time).", "info");
      return;
    }

    const performGeneration = () => {
      if (navigator.vibrate) navigator.vibrate(50);
      const result = generateTeams(playersToUse);
      setGenerationResult(result);
      setAnalysis('');
      setRuleVerification('');
      setViewMode('generation');
      setScoreA(0);
      setScoreB(0);
      setTempScoreA('0');
      setTempScoreB('0');
      setScoreMode('QUICK');

      // Só atualiza metadados se for uma geração COMPLETAMENTE NOVA (com rodízio de banco)
      if (!isReshuffle) {
        const newCount = (systemMetadata.dailyMatchCount || 0) + 1;
        syncMetadataToFirebase('system', {
          ...systemMetadata,
          dailyMatchCount: newCount,
          matchStartTime: Date.now()
        });
      }
      
      showNotification(isReshuffle ? "Jogadores reorganizados!" : "Nova escalação gerada com sucesso!", "success");
    };

    if (generationResult) {
      showConfirmModal(
        isReshuffle ? 'Reorganizar Times' : 'Nova Escalação',
        isReshuffle 
          ? 'Deseja trocar os jogadores de lado mantendo apenas estes 12 em quadra? O placar será zerado.'
          : 'Deseja descartar a escalação atual e gerar uma nova (incluindo quem está no banco)? O progresso atual será perdido.',
        () => {
          performGeneration();
          hideConfirmModal();
        }
      );
    } else {
      performGeneration();
    }
  };

  const handleDiscard = () => {
    if (!generationResult) return;
    
    showConfirmModal(
      'Descartar Partida',
      'Tem certeza que deseja descartar esta partida? Os dados não serão salvos no histórico.',
      () => {
        setGenerationResult(null);
        setScoreA(0);
        setScoreB(0);
        setTempScoreA('0');
        setTempScoreB('0');
        setElapsedTime(0);
        setNarrationScript('');
        setNarrationAudio(null);
        
        // Opcional: Decrementar o contador se desejar que ele reflita apenas partidas que "valeram"
        // Mas como o contador não é usado visualmente de forma crítica, vamos apenas limpar o tempo de início
        syncMetadataToFirebase('system', {
          ...systemMetadata,
          matchStartTime: null
        });

        hideConfirmModal();
        showNotification("Partida descartada.", "info");
      }
    );
  };

  const handleVerifyRules = async () => {
    if (!generationResult) return;
    
    // Inicia verificação de regras por IA
    setIsVerifyingRules(true);
    try {
      const eloDiff = Math.abs(generationResult.teamA.totalElo - generationResult.teamB.totalElo);
      const balanceLevel = eloDiff < 50 ? 'TITANS' : eloDiff < 150 ? 'BALANCED' : eloDiff < 300 ? 'CHALLENGING' : 'TECHNICAL';
      const report = await verifyRules(attendance, generationResult, balanceLevel);
      setRuleVerification(report);
    } catch (error) {
      console.error("Erro na verificação de regras:", error);
    } finally {
      setIsVerifyingRules(false);
    }
  };

  const handleAnalyze = async () => {
    if (!generationResult) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeMatch(generationResult.teamA, generationResult.teamB);
      setAnalysis(result);
      // Also speak the analysis
      await speakNarration(result);
    } catch (error) {
      console.error("Analysis Error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playWhistle = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, start + duration);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    // Som de apito duplo
    playTone(800, audioCtx.currentTime, 0.15);
    playTone(800, audioCtx.currentTime + 0.2, 0.3);
  };

  const handleFinishMatch = async (winner: 'A' | 'B', finalScoreA?: number, finalScoreB?: number) => {
    if (!generationResult) return;

    // Se estiver no modo SCORE, usa os valores temporários se não forem passados explicitamente
    const sA = finalScoreA !== undefined ? finalScoreA : (scoreMode === 'SCORE' ? parseInt(tempScoreA) || 0 : scoreA);
    const sB = finalScoreB !== undefined ? finalScoreB : (scoreMode === 'SCORE' ? parseInt(tempScoreB) || 0 : scoreB);

    const winningTeam = winner === 'A' ? generationResult.teamA : generationResult.teamB;
    const losingTeam = winner === 'A' ? generationResult.teamB : generationResult.teamA;

    const matchData: Match = {
      id: `match_${Date.now()}`,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      teamA: [generationResult.teamA.setter?.id, ...generationResult.teamA.players.map((p: any) => p.id)].filter(Boolean) as string[],
      teamB: [generationResult.teamB.setter?.id, ...generationResult.teamB.players.map((p: any) => p.id)].filter(Boolean) as string[],
      scoreA: sA,
      scoreB: sB,
      winner,
      duration: elapsedTime,
      mode: scoreMode
    };

    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const batch = writeBatch(db);
      const dateKey = matchData.date;
      
      // Salva a partida
      batch.set(doc(db, 'matches', matchData.id), matchData);

      // Atualiza jogadores no Firestore usando increment para evitar inconsistências
      const updatePlayerStatsFirestore = (p: any, isWinner: boolean) => {
        // Verifica se o jogador ainda existe na lista mestre antes de atualizar
        if (!players.some(mp => mp.id === p.id)) return;

        const playerRef = doc(db, 'players', p.id);
        const attendanceRef = doc(db, 'attendance', dateKey, 'players', p.id);
        
        const eloChange = isWinner ? 25 : -15;
        // Garante que elo é um número válido
        const currentElo = typeof p.elo === 'number' ? p.elo : 1000;
        const newElo = currentElo + eloChange;
        const today = dateKey;
        
        const updates = {
          elo: increment(eloChange),
          eloHistory: arrayUnion({ date: today, elo: newElo }),
          matchesPlayed: increment(1),
          dailyMatches: increment(1),
          wins: isWinner ? increment(1) : increment(0),
          losses: !isWinner ? increment(1) : increment(0),
          dailyWins: isWinner ? increment(1) : increment(0),
          dailyLosses: !isWinner ? increment(1) : increment(0),
          dailyEloGain: increment(eloChange),
          dailyResults: arrayUnion(isWinner ? 'V' : 'D'),
          playedLastMatch: true,
          updatedAt: Date.now()
        };

        batch.update(playerRef, updates);
        // TAMBÉM ATUALIZA NA LISTA DE PRESENÇA PARA SINCRONISMO EM TEMPO REAL
        batch.update(attendanceRef, {
          dailyMatches: increment(1),
          dailyWins: isWinner ? increment(1) : increment(0),
          dailyLosses: !isWinner ? increment(1) : increment(0),
          dailyEloGain: increment(eloChange),
          dailyResults: arrayUnion(isWinner ? 'V' : 'D'),
          playedLastMatch: true,
          elo: increment(eloChange)
        });
      };

      // Primeiro, reseta o status de "jogou a última" para todos na presença
      attendance.forEach(p => {
        if (players.some(mp => mp.id === p.id)) {
          batch.update(doc(db, 'players', p.id), { playedLastMatch: false });
          batch.update(doc(db, 'attendance', dateKey, 'players', p.id), { playedLastMatch: false });
        }
      });

      [winningTeam.setter, ...winningTeam.players].filter(Boolean).forEach(p => updatePlayerStatsFirestore(p, true));
      [losingTeam.setter, ...losingTeam.players].filter(Boolean).forEach(p => updatePlayerStatsFirestore(p, false));

      // Atualiza o estado local dos jogadores
      const playedIds = new Set([
        generationResult.teamA.setter?.id,
        ...generationResult.teamA.players.map(p => p.id),
        generationResult.teamB.setter?.id,
        ...generationResult.teamB.players.map(p => p.id)
      ].filter(Boolean));

      setPlayers(prev => {
        const updatedPlayers = prev.map(p => {
          if (playedIds.has(p.id)) {
            const isWinner = [winningTeam.setter?.id, ...winningTeam.players.map(wp => wp.id)].includes(p.id);
            const eloChange = isWinner ? 25 : -15;
            return {
              ...p,
              elo: (p.elo || 1000) + eloChange,
              matchesPlayed: (p.matchesPlayed || 0) + 1,
              dailyMatches: (p.dailyMatches || 0) + 1,
              wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
              losses: !isWinner ? (p.losses || 0) + 1 : (p.losses || 0),
              dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
              dailyLosses: !isWinner ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
              dailyEloGain: (p.dailyEloGain || 0) + eloChange,
              dailyResults: [...(p.dailyResults || []), isWinner ? 'V' : 'D'] as ('V' | 'D')[],
              playedLastMatch: true
            };
          }
          return { ...p, playedLastMatch: false };
        });
        return updatedPlayers;
      });

      setAttendance(prev => {
        const updatedAttendance = prev.map(p => {
          if (playedIds.has(p.id)) {
            const isWinner = [winningTeam.setter?.id, ...winningTeam.players.map(wp => wp.id)].includes(p.id);
            const eloChange = isWinner ? 25 : -15;
            return {
              ...p,
              elo: (p.elo || 1000) + eloChange,
              matchesPlayed: (p.matchesPlayed || 0) + 1,
              dailyMatches: (p.dailyMatches || 0) + 1,
              wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
              losses: !isWinner ? (p.losses || 0) + 1 : (p.losses || 0),
              dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
              dailyLosses: !isWinner ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
              dailyEloGain: (p.dailyEloGain || 0) + eloChange,
              dailyResults: [...(p.dailyResults || []), isWinner ? 'V' : 'D'] as ('V' | 'D')[],
              playedLastMatch: true
            };
          }
          return { ...p, playedLastMatch: false };
        });
        return updatedAttendance;
      });

      // 4. Atualizar Sinergia e Rivalidade
      const newSynergy = { ...synergy };
      const newNegativeSynergy = { ...negativeSynergy };
      const newRivalry = { ...rivalry };

      // Sinergia: Jogadores que ganharam juntos
      const winners = [winningTeam.setter?.id, ...winningTeam.players.map(p => p.id)].filter(Boolean) as string[];
      for (let i = 0; i < winners.length; i++) {
        for (let j = i + 1; j < winners.length; j++) {
          const pair = [winners[i], winners[j]].sort().join('_');
          newSynergy[pair] = (newSynergy[pair] || 0) + 1;
        }
      }

      // Sinergia Negativa: Jogadores que perderam juntos
      const losers = [losingTeam.setter?.id, ...losingTeam.players.map(p => p.id)].filter(Boolean) as string[];
      for (let i = 0; i < losers.length; i++) {
        for (let j = i + 1; j < losers.length; j++) {
          const pair = [losers[i], losers[j]].sort().join('_');
          newNegativeSynergy[pair] = (newNegativeSynergy[pair] || 0) + 1;
        }
      }

      // Rivalidade: Perdedores vs Ganhadores
      for (const loserId of losers) {
        for (const winnerId of winners) {
          const pair = `${loserId}_${winnerId}`;
          newRivalry[pair] = (newRivalry[pair] || 0) + 1;
        }
      }

      batch.set(doc(db, 'metadata', 'synergy'), newSynergy, { merge: true });
      batch.set(doc(db, 'metadata', 'negative_synergy'), newNegativeSynergy, { merge: true });
      batch.set(doc(db, 'metadata', 'rivalry'), newRivalry, { merge: true });

      // Limpa metadados da partida - usa set com merge para garantir que o documento existe
      const updatedSystemMetadata = { ...systemMetadata, matchStartTime: null };
      batch.set(doc(db, 'metadata', 'system'), updatedSystemMetadata, { merge: true });

      // Optimistic UI update: clear match state immediately for better responsiveness
      setSynergy(newSynergy);
      setNegativeSynergy(newNegativeSynergy);
      setRivalry(newRivalry);
      setSystemMetadata(updatedSystemMetadata);
      setGenerationResult(null);
      setViewMode('generation');
      setScoreA(0);
      setScoreB(0);
      setTempScoreA('0');
      setTempScoreB('0');
      setElapsedTime(0);
      setNarrationScript('');
      
      // Scroll to top to ensure the user sees the "Generate" button
      window.scrollTo({ top: 0, behavior: 'smooth' });

      console.log('Finalizando partida: commitando batch...');
      await batch.commit();
      console.log('Partida finalizada com sucesso no Firestore.');
      
      showNotification(`Partida registrada! Vitória do Time ${winner}`, 'success');
    } catch (error) {
      console.error('Erro ao finalizar partida:', error);
      handleFirestoreError(error, OperationType.WRITE, 'batch-match-winner');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAnnounce = async () => {
    if (!generationResult || isNarrating) return;
    setIsNarrating(true);
    try {
      playWhistle();
      // Wait for whistle to finish
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // If we have pre-loaded audio, use it immediately
      if (narrationAudio) {
        const audio = new Audio(narrationAudio);
        await audio.play();
      } else {
        // Fallback if audio wasn't ready
        const script = narrationScript || await generateNarrationScript(generationResult.teamA, generationResult.teamB);
        await speakNarration(script);
      }
    } catch (error) {
      console.error("Announce Error:", error);
      // Last resort fallback
      if (narrationScript) {
        const utterance = new SpeechSynthesisUtterance(narrationScript);
        utterance.lang = 'pt-BR';
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setIsNarrating(false);
    }
  };

  const handleAnnounceSummary = async () => {
    if (isNarratingSummary) return;
    
    const mvp = [...players].filter(p => p.dailyWins > 0).sort((a, b) => b.dailyWins - a.dailyWins || b.elo - a.elo)[0];
    const evolution = [...players].filter(p => p.dailyEloGain > 0).sort((a, b) => b.dailyEloGain - a.dailyEloGain)[0];
    const topWinRate = [...players].filter(p => p.matchesPlayed >= 5).sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed))[0];

    if (!mvp && !evolution && !topWinRate) {
      showNotification("Ainda não há estatísticas suficientes para o resumo do dia!", "info");
      return;
    }

    setIsNarratingSummary(true);
    try {
      const script = await generateDailySummaryNarration({
        mvp: mvp?.name || "Ninguém ainda",
        evolution: evolution?.name || "Ninguém ainda",
        topWinRate: topWinRate?.name || "Ninguém ainda"
      });
      await speakNarration(script);
    } catch (error) {
      console.error("Summary Announce Error:", error);
    } finally {
      setIsNarratingSummary(false);
    }
  };

  const topSynergies = useMemo(() => {
    return Object.entries(synergy)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 6)
      .map(([pair, wins]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        return { p1, p2, wins };
      })
      .filter(s => s.p1 && s.p2);
  }, [synergy, players]);

  const recalculateStats = async () => {
    if (matches.length === 0) {
      showNotification("Nenhuma partida encontrada para recalcular.", "info");
      return;
    }

    setIsSyncing(true);
    try {
      const newSynergy: Record<string, number> = {};
      const newNegativeSynergy: Record<string, number> = {};
      const newRivalry: Record<string, number> = {};

      matches.forEach(match => {
        const winners = match.winner === 'A' ? match.teamA : match.teamB;
        const losers = match.winner === 'A' ? match.teamB : match.teamA;

        // Synergy
        for (let i = 0; i < winners.length; i++) {
          for (let j = i + 1; j < winners.length; j++) {
            const pair = [winners[i], winners[j]].sort().join('_');
            newSynergy[pair] = (newSynergy[pair] || 0) + 1;
          }
        }

        // Negative Synergy
        for (let i = 0; i < losers.length; i++) {
          for (let j = i + 1; j < losers.length; j++) {
            const pair = [losers[i], losers[j]].sort().join('_');
            newNegativeSynergy[pair] = (newNegativeSynergy[pair] || 0) + 1;
          }
        }

        // Rivalry
        for (const loserId of losers) {
          for (const winnerId of winners) {
            const pair = `${loserId}_${winnerId}`;
            newRivalry[pair] = (newRivalry[pair] || 0) + 1;
          }
        }
      });

      const batch = writeBatch(db);
      batch.set(doc(db, 'metadata', 'synergy'), newSynergy, { merge: true });
      batch.set(doc(db, 'metadata', 'negative_synergy'), newNegativeSynergy, { merge: true });
      batch.set(doc(db, 'metadata', 'rivalry'), newRivalry, { merge: true });
      
      await batch.commit();

      setSynergy(newSynergy);
      setNegativeSynergy(newNegativeSynergy);
      setRivalry(newRivalry);

      showNotification("Estatísticas recalculadas com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao recalcular estatísticas:", error);
      showNotification("Erro ao recalcular estatísticas.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const availablePlayers = useMemo(() => {
    return players.filter(p => !attendance.some(a => a.id === p.id))
      .sort((a, b) => b.elo - a.elo);
  }, [players, attendance]);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 space-y-8 animate-pulse">
          <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200">
            <Trophy className="text-white w-10 h-10" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Guerreiros</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em]">Carregando Ranking...</p>
          </div>
          <div className="flex justify-center">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-emerald-200/50 p-8 md:p-12 border border-slate-100 text-center space-y-8 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto w-24 h-24 bg-emerald-600 rounded-[2rem] shadow-xl shadow-emerald-200 flex items-center justify-center transform -rotate-6 hover:rotate-0 transition-transform duration-500">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Guerreiros</h1>
            <p className="text-sm font-bold text-emerald-600 uppercase tracking-[0.3em]">Vôlei de Elite</p>
          </div>

          <div className="space-y-4 text-slate-500">
            <p className="text-lg font-medium leading-relaxed">
              Bem-vindo ao sistema oficial de gestão do <span className="text-slate-900 font-bold">Guerreiros V.C.</span>
            </p>
            <p className="text-sm">
              Faça login para marcar presença, acompanhar seu ranking e participar das partidas.
            </p>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Entrar com Google
          </button>

          <div className="pt-4 flex items-center justify-center gap-6 opacity-40">
            <div className="flex flex-col items-center gap-1">
              <Swords className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Partidas</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TrendingUp className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Ranking</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Seguro</span>
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Desenvolvido para atletas de alto rendimento
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 lg:pb-0">
      {/* ELO History Modal */}
      {selectedPlayerForHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-indigo-600" />
                  Evolução de ELO
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Histórico de {selectedPlayerForHistory.name}</p>
              </div>
              <button 
                onClick={() => setSelectedPlayerForHistory(null)}
                className="p-3 bg-white text-slate-400 hover:text-slate-600 rounded-2xl shadow-sm border border-slate-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">ELO Atual</p>
                  <p className="text-2xl font-black text-indigo-600 font-mono">{selectedPlayerForHistory.elo}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Vitórias</p>
                  <p className="text-2xl font-black text-emerald-600 font-mono">{selectedPlayerForHistory.wins}</p>
                </div>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Derrotas</p>
                  <p className="text-2xl font-black text-rose-600 font-mono">{selectedPlayerForHistory.losses}</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-3 h-3 text-indigo-600" />
                    Evolução de ELO
                  </h4>
                  <EloChart 
                    history={(selectedPlayerForHistory.eloHistory || []).map(h => {
                      const dateStr = h.date;
                      const dateObj = new Date(dateStr + 'T00:00:00');
                      
                      const groupElosAtDate = players.map(p => {
                        if (!p.eloHistory || p.eloHistory.length === 0) return p.elo;
                        const historyBefore = p.eloHistory
                          .filter(entry => entry.date <= dateStr)
                          .sort((a, b) => b.date.localeCompare(a.date));
                        return historyBefore.length > 0 ? historyBefore[0].elo : 1200;
                      });
                      
                      const avgAtDate = Math.round(groupElosAtDate.reduce((a, b) => a + b, 0) / (players.length || 1));
                      
                      return { ...h, groupAverage: avgAtDate };
                    })} 
                    averageElo={averageElo} 
                  />
                </div>
                
                <div className="pt-8 border-t border-slate-100 space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3 h-3 text-emerald-600" />
                    Evolução de Vitórias e Derrotas
                  </h4>
                  <WinLossChart matches={matches} playerId={selectedPlayerForHistory.id} />
                </div>
              </div>

              <div className="flex justify-center">
                <button 
                  onClick={() => setSelectedPlayerForHistory(null)}
                  className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Fechar Histórico
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Header - Otimizado para Mobile */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-100">
              <Trophy className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-none">Guerreiros</h1>
              <p className="text-[10px] md:text-xs font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Vôlei de Elite</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            {navItems.map(tab => (
              <button 
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)} 
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-widest ${viewMode === tab.id ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
             {/* Status do Banco */}
             <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
               <div className="relative flex h-2 w-2">
                 {dbStatus !== 'idle' && (
                   <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dbStatus === 'writing' ? 'bg-amber-400' : 'bg-blue-400'}`}></span>
                 )}
                 <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus === 'writing' ? 'bg-amber-500' : dbStatus === 'reading' ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
               </div>
               <span className="hidden xs:block text-[9px] font-black uppercase tracking-widest text-slate-500">
                 {dbStatus === 'writing' ? 'Gravando' : dbStatus === 'reading' ? 'Lendo' : 'Online'}
               </span>
             </div>

             {user ? (
               <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-slate-200">
                 <div className="hidden sm:flex flex-col items-end">
                   <span className="text-[10px] font-black text-slate-900 uppercase leading-none">{user.displayName}</span>
                   <button onClick={handleLogout} className="text-[9px] font-bold text-rose-500 uppercase hover:text-rose-600 transition-colors">Sair</button>
                 </div>
                 {user.photoURL ? (
                   <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-emerald-100 shadow-sm" referrerPolicy="no-referrer" />
                 ) : (
                   <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-xs">
                     {user.displayName?.charAt(0)}
                   </div>
                 )}
               </div>
             ) : (
               <button 
                 onClick={handleLogin}
                 className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100"
               >
                 <LogIn className="w-3.5 h-3.5" />
                 Entrar
               </button>
             )}
             {isInstallable && (
               <button 
                 onClick={handleInstallClick}
                 className="p-2 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-500 transition-all animate-bounce"
                 title="Instalar Aplicativo"
               >
                 <Zap className="w-4 h-4" />
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 py-3 flex items-center gap-1 overflow-x-auto scrollbar-hide shadow-[0_-4px_15px_rgba(0,0,0,0.08)]">
        {navItems.map(tab => (
          <button 
            key={tab.id}
            onClick={() => {
              if (navigator.vibrate) navigator.vibrate(10);
              setViewMode(tab.id as ViewMode);
            }} 
            className={`flex flex-col items-center gap-1.5 px-4 py-1 rounded-2xl transition-all flex-shrink-0 ${viewMode === tab.id ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
          >
            <tab.icon className={`w-6 h-6 ${viewMode === tab.id ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
            <span className={`text-[9px] font-black uppercase tracking-wider ${viewMode === tab.id ? 'opacity-100' : 'opacity-70'}`}>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 flex-grow w-full pb-24 lg:pb-8">
        {/* VIEW: ADMIN */}
        {viewMode === 'admin' && userRole === 'ADMIN' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Painel Admin</h2>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Controle total da sessão e estatísticas</p>
              </div>
              <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl border-2 border-slate-800">
                <Settings className="w-8 h-8" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ações Rápidas */}
              <section className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                  <Zap className="w-6 h-6 text-amber-500" />
                  Ações Rápidas
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={handleFinishDay} 
                    className="flex items-center gap-4 w-full p-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl transition-all group shadow-lg shadow-indigo-900/20"
                  >
                    <div className="p-3 bg-white/20 rounded-xl group-hover:scale-110 transition-transform"><CheckCircle2 className="w-6 h-6" /></div>
                    <div className="text-left">
                      <p className="text-lg font-black uppercase tracking-tight">Finalizar Sessão</p>
                      <p className="text-xs text-indigo-200 group-hover:text-white font-bold uppercase">Resumo IA + Limpar tudo</p>
                    </div>
                  </button>

                  {isInstallable && (
                    <button 
                      onClick={handleInstallClick}
                      className="flex items-center gap-4 w-full p-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-3xl transition-all group shadow-lg shadow-emerald-900/20"
                    >
                      <div className="p-3 bg-white/20 rounded-xl group-hover:scale-110 transition-transform"><Zap className="w-6 h-6" /></div>
                      <div className="text-left">
                        <p className="text-lg font-black uppercase tracking-tight">Instalar Aplicativo</p>
                        <p className="text-xs text-emerald-200 group-hover:text-white font-bold uppercase">Adicionar à tela de início</p>
                      </div>
                    </button>
                  )}

                  <button 
                    onClick={handleAnnounceSummary}
                    disabled={isNarratingSummary}
                    className="flex items-center gap-4 w-full p-6 bg-amber-500 hover:bg-amber-600 text-white rounded-3xl transition-all group shadow-lg shadow-amber-900/20"
                  >
                    <div className="p-3 bg-white/20 rounded-xl group-hover:scale-110 transition-transform">
                      {isNarratingSummary ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Megaphone className="w-6 h-6" />}
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-black uppercase tracking-tight">Resumo do Dia</p>
                      <p className="text-xs text-amber-100 group-hover:text-white font-bold uppercase">Anunciar destaques por voz</p>
                    </div>
                  </button>
                </div>
              </section>

              {/* Manutenção */}
              <section className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                  <RotateCcw className="w-6 h-6 text-slate-400" />
                  Manutenção
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={resetDailyMatches} 
                      className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 rounded-3xl transition-all group"
                    >
                      <RotateCcw className="w-6 h-6 text-slate-400 group-hover:text-rose-600" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-rose-600">Zerar Dia</span>
                    </button>
                    <button 
                      onClick={clearAttendance} 
                      className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-3xl transition-all group"
                    >
                      <Trash2 className="w-6 h-6 text-slate-400 group-hover:text-amber-600" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-amber-600">Limpar Fila</span>
                    </button>
                  </div>

                  <button 
                    onClick={resetCareerStats} 
                    className="flex items-center justify-center gap-3 w-full p-4 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-2xl transition-all border border-slate-100 hover:border-red-200"
                  >
                    <ShieldAlert className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Resetar Carreira (ELO)</span>
                  </button>

                  <button 
                    onClick={resetAllData} 
                    className="flex items-center justify-center gap-3 w-full p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-all shadow-lg shadow-red-900/20"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Zerar Tudo (Novo Começo)</span>
                  </button>

                  <a 
                    href="https://console.firebase.google.com/project/printwayy/firestore/databases/ai-studio-1630a408-19c0-4eed-9c72-a386f6308fe2/data"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full p-4 bg-slate-900 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-800"
                  >
                    <Database className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Visualizar Banco de Dados</span>
                  </a>
                </div>
              </section>

              {/* Auditoria e Probabilidades */}
              <section className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm space-y-6 md:col-span-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    Auditoria e Probabilidades
                  </h3>
                  <div className="bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Sessão Ativa</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Probabilidades */}
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Probabilidade de Jogo</p>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-xs font-black text-slate-700 uppercase">Geral</span>
                          <span className="text-lg font-black text-indigo-600">
                            {attendance.length > 0 ? Math.round(Math.min(100, (12 / attendance.length) * 100)) : 0}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 transition-all duration-1000" 
                            style={{ width: `${attendance.length > 0 ? Math.min(100, (12 / attendance.length) * 100) : 0}%` }}
                          />
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">
                          {attendance.length} jogadores para 12 vagas
                        </p>
                      </div>

                      <div>
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-xs font-black text-slate-700 uppercase">Levantadores</span>
                          <span className="text-lg font-black text-amber-500">
                            {attendance.filter(p => p.isOfficialSetter).length > 0 
                              ? Math.round(Math.min(100, (2 / attendance.filter(p => p.isOfficialSetter).length) * 100)) 
                              : 0}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-amber-400 transition-all duration-1000" 
                            style={{ width: `${attendance.filter(p => p.isOfficialSetter).length > 0 ? Math.min(100, (2 / attendance.filter(p => p.isOfficialSetter).length) * 100) : 0}%` }}
                          />
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">
                          {attendance.filter(p => p.isOfficialSetter).length} levantadores para 2 vagas
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Última Auditoria */}
                  <div className="md:col-span-2 bg-slate-900 rounded-3xl p-6 text-white space-y-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Sparkles className="w-24 h-24" />
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Relatório de Auditoria (IA)</p>
                    {isVerifyingRules ? (
                      <div className="flex items-center gap-3 py-4">
                        <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                        <p className="text-sm font-bold text-slate-400 uppercase animate-pulse">Analisando integridade da partida...</p>
                      </div>
                    ) : ruleVerification ? (
                      <div className="space-y-4">
                        <p className="text-sm leading-relaxed font-medium text-slate-300 italic">
                          "{ruleVerification}"
                        </p>
                        <div className="flex items-center gap-2 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" />
                          Verificado pelo Estatuto SpikeGen
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-slate-500 uppercase py-4">Nenhuma auditoria realizada nesta sessão.</p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <ShieldCheck className="w-32 h-32" />
              </div>
              <div className="relative z-10 space-y-4">
                <h3 className="text-xl font-black uppercase tracking-widest">Segurança do Sistema</h3>
                <p className="text-slate-400 text-sm font-bold uppercase leading-relaxed max-w-lg">
                  Todas as ações realizadas neste painel são definitivas e sincronizadas instantaneamente com todos os dispositivos conectados. Use com responsabilidade.
                </p>
                <div className="flex items-center gap-2 text-emerald-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Conexão Segura Ativa</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: PRESENÇA */}
        {viewMode === 'presence' && (
          <AttendanceView 
            clearAttendance={clearAttendance}
            resetDailyMatches={resetDailyMatches}
            removeAttendance={removeAttendance}
            registerAttendance={registerAttendance}
            availablePlayers={availablePlayers}
            refreshPlayers={refreshPlayers}
            isNearCourt={isNearCourt}
            currentPlayer={currentPlayer}
            preConfirmations={preConfirmations}
            isIntentionPhase={isIntentionPhase}
            isGameDay={isGameDay}
            onToggleIntention={toggleIntention}
            userRole={userRole}
          />
        )}

        {/* VIEW: GERAÇÃO (A QUADRA) */}
        {viewMode === 'generation' && (
          <MatchView 
            handleGenerate={handleGenerate}
            handleDiscard={handleDiscard}
            handleAnnounce={handleAnnounce}
            handleSwapClick={handleSwapClick}
            handleRemovePlayer={handleRemovePlayer}
            promoteToSetter={promoteToSetter}
            setSwapSelection={setSwapSelection}
            swapSelection={swapSelection}
            elapsedTime={elapsedTime}
            handleFinishMatch={handleFinishMatch}
            handleVerifyRules={handleVerifyRules}
          />
        )}

        {/* VIEW: HISTÓRICO */}
        {viewMode === 'history' && (
          <HistoryView />
        )}
        {/* VIEW: SÓCIOS */}
        {viewMode === 'members' && (
          <MembersView 
            setEditingPlayer={setEditingPlayer}
            setIsFormOpen={setIsFormOpen}
            deletePlayer={deletePlayer}
            clearAllPlayers={clearAllPlayers}
            refreshPlayers={refreshPlayers}
            translateGender={translateGender}
          />
        )}

        {/* VIEW: MENSALIDADES */}
        {viewMode === 'payments' && (
          <PaymentsView 
            payments={payments}
            players={players}
            setEditingPayment={setEditingPayment}
            setIsPaymentFormOpen={setIsPaymentFormOpen}
            deletePayment={deletePayment}
            userRole={userRole}
          />
        )}

        {/* VIEW: RANKING */}
        {viewMode === 'dashboard' && (
          <RankingView 
            userRole={userRole}
            refreshPlayers={refreshPlayers}
            handleAnnounceSummary={handleAnnounceSummary}
            isNarratingSummary={isNarratingSummary}
            resetDailyMatches={resetDailyMatches}
            topSynergies={topSynergies}
          />
        )}

        {/* VIEW: REGRAS */}
        {viewMode === 'rules' && (
          <RulesView />
        )}

        {/* VIEW: ADMIN */}
        {viewMode === 'admin' && (
          <AdminView 
            resetDailyStats={resetDailyMatches}
            triggerSync={refreshPlayers}
            recalculateStats={recalculateStats}
          />
        )}
      </main>

      {/* Modal de Formulário Estilizado */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300 border-4 border-white">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white"><UserPlus className="w-5 h-5"/></div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-slate-800">{editingPlayer ? 'Editar Sócio' : 'Cadastrar Sócio'}</h3>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={savePlayer} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Jogador</label>
                <input name="name" required defaultValue={editingPlayer?.name} placeholder="Ex: Lucas Silva" className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail (Para Login Admin)</label>
                <input name="email" type="email" defaultValue={editingPlayer?.email} placeholder="exemplo@email.com" className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
              </div>
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Entrada</label>
                  <input name="joinedAt" type="date" defaultValue={editingPlayer?.joinedAt} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Nascimento</label>
                  <input name="birthDate" type="date" defaultValue={editingPlayer?.birthDate} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gênero</label>
                  <select name="gender" defaultValue={editingPlayer?.gender || Gender.MALE} className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:border-indigo-400">
                    <option value={Gender.MALE}>Masculino</option>
                    <option value={Gender.FEMALE}>Feminino</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pontos ELO</label>
                  <input name="elo" type="number" required defaultValue={editingPlayer?.elo || averageElo} className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-5 p-6 bg-amber-50 rounded-[2rem] border border-amber-100 cursor-pointer">
                  <input id="setter-check" name="isOfficialSetter" type="checkbox" defaultChecked={editingPlayer?.isOfficialSetter} className="w-6 h-6 rounded-lg text-amber-600 focus:ring-amber-400 border-amber-200 shadow-sm" />
                  <label htmlFor="setter-check" className="text-xs font-black text-amber-900 uppercase tracking-widest cursor-pointer select-none">Levantador</label>
                </div>
                <div className="flex items-center gap-5 p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 cursor-pointer">
                  <input id="admin-check" name="isAdmin" type="checkbox" defaultChecked={editingPlayer?.isAdmin} className="w-6 h-6 rounded-lg text-indigo-600 focus:ring-indigo-400 border-indigo-200 shadow-sm" />
                  <label htmlFor="admin-check" className="text-xs font-black text-indigo-900 uppercase tracking-widest cursor-pointer select-none">Admin</label>
                </div>
              </div>

              {editingPlayer && (
                <div className="space-y-6 pt-4 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Melhores Parceiros
                      </h4>
                      <div className="space-y-2">
                        {(() => {
                          const partners = Object.entries(synergy)
                            .filter(([pair]) => pair.includes(editingPlayer.id))
                            .map(([pair, wins]) => {
                              const otherId = pair.split('_').find(id => id !== editingPlayer.id);
                              const otherPlayer = players.find(p => p.id === otherId);
                              return { player: otherPlayer, wins };
                            })
                            .filter(p => p.player)
                            .sort((a, b) => (b.wins as number) - (a.wins as number))
                            .slice(0, 3);
                          
                          return partners.length > 0 ? partners.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-emerald-50/50 p-2 rounded-xl">
                              <span>{p.player?.name.split(' ')[0]}</span>
                              <span className="text-emerald-700">{p.wins}V</span>
                            </div>
                          )) : <p className="text-[10px] text-slate-300 italic">Sem dados...</p>;
                        })()}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                        <TrendingDown className="w-3 h-3" /> Parceiros Difíceis
                      </h4>
                      <div className="space-y-2">
                        {(() => {
                          const partners = Object.entries(rivalry)
                            .filter(([pair]) => pair.includes(editingPlayer.id))
                            .map(([pair, losses]) => {
                              const otherId = pair.split('_').find(id => id !== editingPlayer.id);
                              const otherPlayer = players.find(p => p.id === otherId);
                              return { player: otherPlayer, losses };
                            })
                            .filter(p => p.player)
                            .sort((a, b) => (b.losses as number) - (a.losses as number))
                            .slice(0, 3);
                          
                          return partners.length > 0 ? partners.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-rose-50/50 p-2 rounded-xl">
                              <span>{p.player?.name.split(' ')[0]}</span>
                              <span className="text-rose-700">{p.losses}D</span>
                            </div>
                          )) : <p className="text-[10px] text-slate-300 italic">Sem dados...</p>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white px-4 py-4 rounded-[1.5rem] font-black flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all"><Save className="w-4 h-4" />Salvar Sócio</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Pagamento */}
      {isPaymentFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300 border-4 border-white">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white"><DollarSign className="w-5 h-5"/></div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-slate-800">{editingPayment ? 'Editar Pagamento' : 'Novo Pagamento'}</h3>
              </div>
              <button onClick={() => setIsPaymentFormOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={savePayment} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sócio</label>
                <select name="playerId" required defaultValue={editingPayment?.playerId} className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:border-indigo-400">
                  <option value="">Selecione um sócio...</option>
                  {players.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mês Referência</label>
                  <input name="month" type="month" required defaultValue={editingPayment?.month || new Date().toISOString().substring(0, 7)} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                  <input name="amount" type="number" step="0.01" required defaultValue={editingPayment?.amount || 50} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Pagamento</label>
                  <input name="paymentDate" type="date" required defaultValue={editingPayment?.paymentDate || new Date().toISOString().substring(0, 10)} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <select name="status" defaultValue={editingPayment?.status || PaymentStatus.PAID} className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:border-indigo-400">
                    <option value={PaymentStatus.PAID}>Pago</option>
                    <option value={PaymentStatus.PENDING}>Pendente</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsPaymentFormOpen(false)} className="flex-1 px-4 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white px-4 py-4 rounded-[1.5rem] font-black flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all"><Save className="w-4 h-4" />Salvar Pagamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notificações (Toasts) */}
      <Notification />
      <ConfirmModal />
    </div>
  );
};

// Componente CourtDiagram
const CourtDiagram: React.FC<{ teamA: Team; teamB: Team }> = ({ teamA, teamB }) => {
  const [isComparisonMode, setIsComparisonMode] = useState(false);

  // Organiza jogadores por ELO para o "Matchup"
  // Posições: 4, 3, 2 (Rede) | 5, 6, 1 (Fundo)
  const getPositions = (team: Team) => {
    const setter = team.setter;
    const others = [...team.players].sort((a, b) => b.elo - a.elo);
    const finalSetter = setter || others.pop();
    
    return {
      p4: others[0],
      p3: finalSetter,
      p2: others[1],
      p5: others[2],
      p6: others[3],
      p1: others[4]
    };
  };

  const posA = getPositions(teamA);
  const posB = getPositions(teamB);

  const PlayerCircle = ({ p, pos, isTeamB = false, isHighlighted = false }: { p: Player | undefined; pos: string; isTeamB?: boolean; isHighlighted?: boolean }) => (
    <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${isComparisonMode && !isHighlighted ? 'opacity-20 scale-90 grayscale' : 'opacity-100 scale-100'}`}>
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${
        isTeamB ? 'bg-rose-500 border-rose-200' : 'bg-indigo-600 border-indigo-200'
      } ${isHighlighted || isComparisonMode ? 'ring-4 ring-amber-400 ring-offset-2' : ''}`}>
        <span className="text-[12px] font-black text-white uppercase tracking-tighter">
          {p?.name ? p.name.split(' ')[0].substring(0, 4) : '---'}
        </span>
      </div>
      <div className="bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-100">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Pos {pos}</p>
      </div>
    </div>
  );

  const MatchupLine = ({ pA, pB, height = "h-24" }: { pA: Player | undefined; pB: Player | undefined; height?: string }) => {
    if (!pA || !pB) return null;
    const diff = pA.elo - pB.elo;
    const absDiff = Math.abs(diff);
    const isCritical = absDiff > 50;

    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className={`flex flex-col items-center gap-1 transition-opacity duration-500 ${isComparisonMode ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`${height} w-[2px] ${isCritical ? 'bg-rose-400' : 'bg-amber-400/50'} dashed-line`}></div>
          <div className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
            isCritical ? 'bg-rose-500 text-white border-rose-400' : 'bg-amber-400 text-slate-900 border-amber-300'
          }`}>
            {diff > 0 ? `+${diff}` : diff} ELO
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 rounded-[3rem] p-8 sm:p-12 shadow-2xl border-8 border-slate-800 relative overflow-hidden">
      {/* Botão de Comparação */}
      <button 
        onClick={() => setIsComparisonMode(!isComparisonMode)}
        className={`absolute top-6 right-6 z-20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${
          isComparisonMode 
            ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-lg shadow-amber-400/20' 
            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
        }`}
      >
        <Swords className="w-3 h-3" />
        {isComparisonMode ? 'Modo Normal' : 'Ver Duelos'}
      </button>

      {/* Detalhes da Quadra */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-white"></div>
        <div className="absolute top-0 left-1/2 w-1 h-full bg-white"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12">
        {/* Time B (Lado Superior) */}
        <div className="grid grid-cols-3 gap-x-12 gap-y-8">
          <PlayerCircle p={posB.p1} pos="1" isTeamB />
          <PlayerCircle p={posB.p6} pos="6" isTeamB />
          <PlayerCircle p={posB.p5} pos="5" isTeamB />
          <PlayerCircle p={posB.p2} pos="2" isTeamB isHighlighted={true} />
          <PlayerCircle p={posB.p3} pos="3" isTeamB isHighlighted={true} />
          <PlayerCircle p={posB.p4} pos="4" isTeamB isHighlighted={true} />
        </div>

        {/* Matchup Lines (Absolute Positioned) */}
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          {/* Linhas da Frente */}
          <div className="flex gap-x-12">
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p4} pB={posB.p2} />
            </div>
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p3} pB={posB.p3} />
            </div>
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p2} pB={posB.p4} />
            </div>
          </div>
          
          {/* Linhas do Fundo (Deslocadas) */}
          <div className="absolute inset-0 flex justify-center items-center">
             <div className="flex gap-x-12">
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p5} pB={posB.p1} height="h-64" />
                </div>
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p6} pB={posB.p6} height="h-64" />
                </div>
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p1} pB={posB.p5} height="h-64" />
                </div>
             </div>
          </div>
        </div>

        {/* Rede */}
        <div className="w-full flex items-center gap-4">
          <div className="h-[2px] flex-grow bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.5em]">Rede</span>
          <div className="h-[2px] flex-grow bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
        </div>

        {/* Time A (Lado Inferior) */}
        <div className="grid grid-cols-3 gap-x-12 gap-y-8">
          <PlayerCircle p={posA.p4} pos="4" isHighlighted={true} />
          <PlayerCircle p={posA.p3} pos="3" isHighlighted={true} />
          <PlayerCircle p={posA.p2} pos="2" isHighlighted={true} />
          <PlayerCircle p={posA.p5} pos="5" isHighlighted={false} />
          <PlayerCircle p={posA.p6} pos="6" isHighlighted={false} />
          <PlayerCircle p={posA.p1} pos="1" isHighlighted={false} />
        </div>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="bg-slate-800/50 backdrop-blur px-6 py-3 rounded-2xl border border-slate-700">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
            Estratégia: Levantador fixo na Posição 3. Demais jogadores distribuídos por ELO para equilíbrio na rede.
          </p>
        </div>
      </div>

      <style>{`
        .dashed-line {
          background-image: linear-gradient(to bottom, currentColor 50%, transparent 50%);
          background-size: 2px 8px;
          background-repeat: repeat-y;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

const AppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithBoundary;
