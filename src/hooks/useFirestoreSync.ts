
import { useEffect, useCallback } from 'react';
import { 
  db, 
  collection, 
  getDoc,
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  updateDoc,
  writeBatch,
  increment,
  OperationType,
  handleFirestoreError,
  auth,
  getFirestoreDateKey
} from '../../firebase';
import { useStore } from '../../store';
import { safeLocalStorage, cleanObject } from '../../utils/helpers';
import { Player, Payment, Match, GenerationResult, UsageStats, Tournament, Expense } from '../../types';
import { INITIAL_PLAYERS } from '../../constants';
import firebaseConfig from '../../firebase-applet-config.json';

export const useFirestoreSync = () => {
  const {
    user,
    userRole,
    viewMode,
    players,
    currentPlayer,
    setPlayers,
    setAttendance,
    setMatches,
    setPayments,
    setSystemMetadata,
    setSynergy,
    setNegativeSynergy,
    setRivalry,
    setIsInitialLoading,
    setDbStatus,
    setUsageStats,
    setPreConfirmations,
    setPendingRequests,
    setGenerationResult,
    setTournaments,
    setActiveTournament,
    syncTrigger,
    setIsSyncing
  } = useStore();

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  // Usage Tracking
  useEffect(() => {
    if (!user) return;

    const trackUsage = async () => {
      const date = getFirestoreDateKey();
      const monthKey = date.slice(0, 7); // YYYY-MM
      const usageRef = doc(db, 'metadata', 'usage');
      const monthlyUsageRef = doc(db, 'metadata', `usage_${monthKey}`);
      
      try {
        // Increment global daily usage
        const usageSnap = await getDoc(usageRef);
        let currentUsage = usageSnap.exists() ? usageSnap.data() as UsageStats : { reads: 0, writes: 0, lastUpdate: date };
        
        // Reset if new day (sync with Google's reset)
        if (currentUsage.lastUpdate !== date) {
          await setDoc(usageRef, { reads: 15, writes: 0, aiCalls: 0, lastUpdate: date });
        } else {
          await updateDoc(usageRef, { reads: increment(15), lastUpdate: date });
        }

        // Increment global monthly usage
        try {
          await updateDoc(monthlyUsageRef, { reads: increment(15), lastUpdate: date });
        } catch (e: any) {
          if (e.code === 'not-found') {
            await setDoc(monthlyUsageRef, { reads: 15, writes: 0, aiCalls: 0, lastUpdate: date });
          }
        }
      } catch (e) {
        console.warn('Usage tracking skipped (likely permission or initial load):', e);
      }
    };

    // Track on load and when currentPlayer is identified
    trackUsage();
  }, [user, currentPlayer?.id]);

  // Initial Data Loading
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.info('Firestore Sync: Initial data load started');
        // Check if project has changed to clear cache
        const storedProjectId = safeLocalStorage.getItem('spikegen_project_id');
        if (storedProjectId && storedProjectId !== firebaseConfig.projectId) {
          console.warn('Firestore Sync: Project ID changed, clearing local storage');
          localStorage.clear();
          safeLocalStorage.setItem('spikegen_project_id', firebaseConfig.projectId);
        } else if (!storedProjectId) {
          safeLocalStorage.setItem('spikegen_project_id', firebaseConfig.projectId);
        }

        // 1. Load Metadata
        const metaSnapshot = await getDocs(collection(db, 'metadata'));
        metaSnapshot.forEach((doc) => {
          if (doc.id === 'synergy') setSynergy(doc.data() || {});
          if (doc.id === 'negative_synergy') setNegativeSynergy(doc.data() || {});
          if (doc.id === 'rivalry') setRivalry(doc.data() || {});
          if (doc.id === 'system') setSystemMetadata(doc.data() || {});
        });

        // 2. Populate players if empty
        const playersSnapshot = await getDocs(collection(db, 'players'));
        if (playersSnapshot.empty) {
          console.info('Firestore Sync: Players collection is empty, populating with INITIAL_PLAYERS');
          const batch = writeBatch(db);
          INITIAL_PLAYERS.forEach(player => {
            const playerRef = doc(db, 'players', player.id);
            batch.set(playerRef, player);
          });
          await batch.commit();
          console.info('Firestore Sync: INITIAL_PLAYERS populated successfully');
        }

        setIsInitialLoading(false);
        console.info('Firestore Sync: Initial data load complete');
      } catch (err) {
        console.error('Firestore Sync: Initial load error:', err);
        handleFirestoreError(err, OperationType.LIST, 'initial_load');
        setIsInitialLoading(false);
      }
    };

    loadInitialData();
  }, [user, setSystemMetadata, setSynergy, setNegativeSynergy, setRivalry, setIsInitialLoading, triggerDbStatus]);

  // Real-time Sync (Players, Attendance, Pending Requests, Matches)
  useEffect(() => {
    let unsubscribePlayers: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;
    let unsubscribePending: (() => void) | undefined;
    let unsubscribeMatches: (() => void) | undefined;
    let unsubscribeSystem: (() => void) | undefined;
    let unsubscribeCurrentMatch: (() => void) | undefined;
    let unsubscribeUsage: (() => void) | undefined;
    let unsubscribeMonthlyUsage: (() => void) | undefined;
    let unsubscribePreConfirmations: (() => void) | undefined;
    let unsubscribeSynergy: (() => void) | undefined;
    let unsubscribeNegativeSynergy: (() => void) | undefined;
    let unsubscribeRivalry: (() => void) | undefined;
    let unsubscribeTournaments: (() => void) | undefined;
    let unsubscribeActiveTournament: (() => void) | undefined;
    let unsubscribePayments: (() => void) | undefined;
    let unsubscribeExpenses: (() => void) | undefined;

    const dateKey = getFirestoreDateKey();
    console.info('Firestore Sync: Starting listeners for date:', dateKey, 'User:', user?.email, 'Role:', userRole, 'Trigger:', syncTrigger);
    
    // Update dateKey in store for debugging
    useStore.setState({ dateKey });

    setIsSyncing(true);

    try {
      // Players Sync - Always sync players to allow login and member access
      unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setPlayers(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      }, (err) => {
        console.error('Firestore Sync Error (Players):', err);
        useStore.getState().showNotification('Erro ao carregar jogadores: ' + err.message, 'error');
      });

      // System Metadata Sync
      unsubscribeSystem = onSnapshot(doc(db, 'metadata', 'system'), (snapshot) => {
        if (snapshot.exists()) {
          setSystemMetadata(snapshot.data());
        }
      }, (err) => {
        console.error('Firestore Sync Error (System Metadata):', err);
      });

      unsubscribeCurrentMatch = onSnapshot(doc(db, 'metadata', 'currentMatch'), (snapshot) => {
        if (snapshot.exists()) {
          setGenerationResult(snapshot.data() as GenerationResult);
        } else {
          setGenerationResult(null);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Current Match):', err);
      });

      unsubscribeUsage = onSnapshot(doc(db, 'metadata', 'usage'), (snapshot) => {
        if (snapshot.exists()) {
          setUsageStats(snapshot.data() as UsageStats);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Usage):', err);
      });

      const monthKey = dateKey.slice(0, 7);
      unsubscribeMonthlyUsage = onSnapshot(doc(db, 'metadata', `usage_${monthKey}`), (snapshot) => {
        if (snapshot.exists()) {
          useStore.getState().setMonthlyUsageStats(snapshot.data() as UsageStats);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Monthly Usage):', err);
      });

      // Attendance Sync
      unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setAttendance(list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)));
      }, (err) => {
        console.error('Firestore Sync Error (Attendance):', err);
      });

      // Matches Sync (Limit to last 60 days)
      const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
      const matchesQuery = query(collection(db, 'matches'), where('timestamp', '>=', sixtyDaysAgo));
      unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
        const list: Match[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Match));
        setMatches(list.sort((a, b) => a.timestamp - b.timestamp));
      }, (err) => {
        console.error('Firestore Sync Error (Matches):', err);
      });

      // Pre-Confirmations Sync
      unsubscribePreConfirmations = onSnapshot(collection(db, 'preConfirmations', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setPreConfirmations(list);
      }, (err) => {
        console.error('Firestore Sync Error (PreConfirmations):', err);
      });

      // Synergy Sync
      unsubscribeSynergy = onSnapshot(doc(db, 'metadata', 'synergy'), (snapshot) => {
        if (snapshot.exists()) setSynergy(snapshot.data());
      }, (err) => console.error('Firestore Sync Error (Synergy):', err));

      unsubscribeNegativeSynergy = onSnapshot(doc(db, 'metadata', 'negative_synergy'), (snapshot) => {
        if (snapshot.exists()) setNegativeSynergy(snapshot.data());
      }, (err) => console.error('Firestore Sync Error (NegativeSynergy):', err));

      unsubscribeRivalry = onSnapshot(doc(db, 'metadata', 'rivalry'), (snapshot) => {
        if (snapshot.exists()) setRivalry(snapshot.data());
      }, (err) => console.error('Firestore Sync Error (Rivalry):', err));

      // Tournaments Sync
      unsubscribeTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
        const list: Tournament[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Tournament));
        setTournaments(list.sort((a, b) => b.date.localeCompare(a.date)));
      }, (err) => {
        console.error('Firestore Sync Error (Tournaments):', err);
      });

      // Payments Sync
      unsubscribePayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
        const list: Payment[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Payment));
        setPayments(list);
      }, (err) => {
        console.error('Firestore Sync Error (Payments):', err);
        useStore.getState().showNotification('Erro ao carregar pagamentos: ' + err.message, 'error');
      });

      // Expenses Sync
      unsubscribeExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as any));
        useStore.setState({ expenses: list });
      }, (err) => {
        console.error('Firestore Sync Error (Expenses):', err);
      });

      unsubscribeActiveTournament = onSnapshot(doc(db, 'metadata', 'activeTournament'), (snapshot) => {
        if (snapshot.exists()) {
          setActiveTournament(snapshot.data() as Tournament);
        } else {
          setActiveTournament(null);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Active Tournament):', err);
      });

      // Admin-only Listeners
      if (userRole === 'ADMIN') {
        unsubscribePending = onSnapshot(collection(db, 'pendingRequests'), (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
          setPendingRequests(list);
        }, (err) => {
          console.error('Firestore Sync Error (Pending):', err);
        });
      }
    } catch (e) {
      console.error('Firestore Sync: Fatal error setting up listeners:', e);
    }

    // Reset syncing state after a short delay
    const syncTimer = setTimeout(() => {
      setIsSyncing(false);
      setIsInitialLoading(false);
    }, 1500);

    return () => {
      clearTimeout(syncTimer);
      console.info('Firestore Sync: Cleaning up listeners');
      if (unsubscribePlayers) unsubscribePlayers();
      if (unsubscribeAttendance) unsubscribeAttendance();
      if (unsubscribePending) unsubscribePending();
      if (unsubscribeMatches) unsubscribeMatches();
      if (unsubscribeSystem) unsubscribeSystem();
      if (unsubscribeCurrentMatch) unsubscribeCurrentMatch();
      if (unsubscribeUsage) unsubscribeUsage();
      if (unsubscribeMonthlyUsage) unsubscribeMonthlyUsage();
      if (unsubscribePreConfirmations) unsubscribePreConfirmations();
      if (unsubscribeSynergy) unsubscribeSynergy();
      if (unsubscribeNegativeSynergy) unsubscribeNegativeSynergy();
      if (unsubscribeRivalry) unsubscribeRivalry();
      if (unsubscribeTournaments) unsubscribeTournaments();
      if (unsubscribeActiveTournament) unsubscribeActiveTournament();
      if (unsubscribePayments) unsubscribePayments();
      if (unsubscribeExpenses) unsubscribeExpenses();
    };
  }, [user, userRole, syncTrigger, setPlayers, setAttendance, setPendingRequests, setMatches, setSystemMetadata, setGenerationResult, setUsageStats, setPreConfirmations, setSynergy, setNegativeSynergy, setRivalry, setTournaments, setActiveTournament, setIsSyncing, setIsInitialLoading, setPayments]);

  // Initialize eloHistory for the current user if missing - REMOVED to allow full reset
  /*
  useEffect(() => {
    if (!user || !players || players.length === 0) return;
    
    const currentPlayer = players.find(p => p.uid === user.uid || (p.email && p.email.trim().toLowerCase() === user.email?.trim().toLowerCase()));
    if (currentPlayer && (!currentPlayer.eloHistory || currentPlayer.eloHistory.length === 0)) {
      const playerRef = doc(db, 'players', currentPlayer.id);
      updateDoc(playerRef, {
        eloHistory: [{ date: getFirestoreDateKey(), elo: currentPlayer.elo || 1200 }]
      }).catch(err => console.error("Erro ao inicializar histórico de ELO:", err));
    }
  }, [user, players]);
  */
};
