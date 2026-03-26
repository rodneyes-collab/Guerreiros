
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
  OperationType,
  handleFirestoreError,
  auth,
  getFirestoreDateKey
} from '../../firebase';
import { useStore } from '../../store';
import { safeLocalStorage, cleanObject } from '../../utils/helpers';
import { Player, Payment, Match, GenerationResult, UsageStats } from '../../types';
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
      const usageRef = doc(db, 'metadata', 'usage');
      
      try {
        // Increment global usage
        const usageSnap = await getDoc(usageRef);
        let currentUsage = usageSnap.exists() ? usageSnap.data() as UsageStats : { reads: 0, writes: 0, lastUpdate: date };
        
        // Reset if new day (sync with Google's reset)
        if (currentUsage.lastUpdate !== date) {
          currentUsage = { reads: 0, writes: 0, lastUpdate: date };
        }
        
        await setDoc(usageRef, {
          ...currentUsage,
          reads: (currentUsage.reads || 0) + 15, // Estimate 15 reads per session load
          lastUpdate: date
        }, { merge: true });

        // Increment per-player usage
        if (currentPlayer) {
          const playerRef = doc(db, 'players', currentPlayer.id);
          const lastUpdate = currentPlayer.lastReadUpdate || '';
          let currentReads = (lastUpdate === date) ? (currentPlayer.reads || 0) : 0;
          
          await updateDoc(playerRef, {
            reads: currentReads + 15,
            lastReadUpdate: date
          });
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
    let unsubscribePreConfirmations: (() => void) | undefined;
    let unsubscribeSynergy: (() => void) | undefined;
    let unsubscribeNegativeSynergy: (() => void) | undefined;
    let unsubscribeRivalry: (() => void) | undefined;

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

      // Attendance Sync
      unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setAttendance(list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)));
      }, (err) => {
        console.error('Firestore Sync Error (Attendance):', err);
      });

      // Matches Sync
      unsubscribeMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
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
      if (unsubscribePreConfirmations) unsubscribePreConfirmations();
      if (unsubscribeSynergy) unsubscribeSynergy();
      if (unsubscribeNegativeSynergy) unsubscribeNegativeSynergy();
      if (unsubscribeRivalry) unsubscribeRivalry();
    };
  }, [user, userRole, syncTrigger, setPlayers, setAttendance, setPendingRequests, setMatches, setSystemMetadata, setGenerationResult, setUsageStats, setPreConfirmations, setSynergy, setNegativeSynergy, setRivalry, setIsSyncing, setIsInitialLoading]);

  // View-specific Fetching (Payments & Matches)
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      if (viewMode === 'payments') {
        triggerDbStatus('reading');
        try {
          const snapshot = await getDocs(collection(db, 'payments'));
          const paymentsList: Payment[] = [];
          snapshot.forEach((doc) => paymentsList.push({ ...doc.data(), id: doc.id } as Payment));
          setPayments(paymentsList);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'payments');
        }
      }
    };

    fetchData();
  }, [user, viewMode, setPayments, setMatches, triggerDbStatus]);

  // Initialize eloHistory for the current user if missing
  useEffect(() => {
    if (!user || !players || players.length === 0) return;
    
    const currentPlayer = players.find(p => p.uid === user.uid || (p.email && p.email === user.email));
    if (currentPlayer && (!currentPlayer.eloHistory || currentPlayer.eloHistory.length === 0)) {
      const playerRef = doc(db, 'players', currentPlayer.id);
      updateDoc(playerRef, {
        eloHistory: [{ date: getFirestoreDateKey(), elo: currentPlayer.elo || 1200 }]
      }).catch(err => console.error("Erro ao inicializar histórico de ELO:", err));
    }
  }, [user, players]);
};
