
import { useEffect, useCallback } from 'react';
import { 
  db, 
  collection, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  writeBatch,
  OperationType,
  handleFirestoreError,
  auth
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
    setPlayers,
    setAttendance,
    setMatches,
    setPayments,
    setPreConfirmations,
    setSystemMetadata,
    setSynergy,
    setNegativeSynergy,
    setRivalry,
    setIsInitialLoading,
    setDbStatus,
    setPendingRequests,
    setGenerationResult,
    setUsageStats
  } = useStore();

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  // Initial Data Loading
  useEffect(() => {
    if (!user) {
      setIsInitialLoading(false);
      return;
    }

    const loadInitialData = async () => {
      triggerDbStatus('reading');
      try {
        // Check if project has changed to clear cache
        const storedProjectId = safeLocalStorage.getItem('spikegen_project_id');
        if (storedProjectId && storedProjectId !== firebaseConfig.projectId) {
          console.log('Projeto Firebase alterado. Limpando cache local...');
          safeLocalStorage.removeItem('spikegen_players_cache');
          safeLocalStorage.removeItem('spikegen_last_sync');
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
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'initial_load');
        setIsInitialLoading(false);
      }
    };

    loadInitialData();
  }, [user, setSystemMetadata, setSynergy, setNegativeSynergy, setRivalry, setIsInitialLoading, triggerDbStatus]);

  // Real-time Sync (Players, Attendance, Pending Requests, Matches)
  useEffect(() => {
    if (!user) return;

    let unsubscribePlayers: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;
    let unsubscribePending: (() => void) | undefined;
    let unsubscribeMatches: (() => void) | undefined;
    let unsubscribeSystem: (() => void) | undefined;
    let unsubscribeCurrentMatch: (() => void) | undefined;
    let unsubscribeUsage: (() => void) | undefined;

    const dateKey = new Date().toISOString().split('T')[0];
    
    // Players Sync - Always sync players to allow login and member access
    unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
      console.log('Firestore Sync: Players snapshot received, count:', snapshot.size);
      const list: Player[] = [];
      snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
      console.log('Firestore Sync: Players list mapped, count:', list.length);
      setPlayers(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }, (err) => {
      console.error('Firestore Sync Error (Players):', err);
      handleFirestoreError(err, OperationType.LIST, 'players');
    });

    if (!user) {
      return () => {
        if (unsubscribePlayers) unsubscribePlayers();
      };
    }
    
    // System Metadata Sync
    unsubscribeSystem = onSnapshot(doc(db, 'metadata', 'system'), (snapshot) => {
      if (snapshot.exists()) {
        setSystemMetadata(snapshot.data());
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'metadata/system');
    });

    unsubscribeCurrentMatch = onSnapshot(doc(db, 'metadata', 'currentMatch'), (snapshot) => {
      if (snapshot.exists()) {
        setGenerationResult(snapshot.data() as GenerationResult);
      } else {
        setGenerationResult(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'metadata/currentMatch');
    });

    unsubscribeUsage = onSnapshot(doc(db, 'metadata', 'usage'), (snapshot) => {
      if (snapshot.exists()) {
        setUsageStats(snapshot.data() as UsageStats);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'metadata/usage');
    });

    unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
      const list: Player[] = [];
      snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
      setAttendance(list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `attendance/${dateKey}/players`);
    });

    unsubscribeMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      const list: Match[] = [];
      snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Match));
      setMatches(list.sort((a, b) => a.timestamp - b.timestamp));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'matches');
    });

    if (userRole === 'ADMIN') {
      unsubscribePending = onSnapshot(collection(db, 'pendingRequests'), (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        setPendingRequests(list);
      }, (err) => {
        if (err.message.includes('permission')) return;
        handleFirestoreError(err, OperationType.LIST, 'pendingRequests');
      });
    }

    return () => {
      if (unsubscribePlayers) unsubscribePlayers();
      if (unsubscribeAttendance) unsubscribeAttendance();
      if (unsubscribePending) unsubscribePending();
      if (unsubscribeMatches) unsubscribeMatches();
      if (unsubscribeSystem) unsubscribeSystem();
      if (unsubscribeCurrentMatch) unsubscribeCurrentMatch();
      if (unsubscribeUsage) unsubscribeUsage();
    };
  }, [user, userRole, setPlayers, setAttendance, setPendingRequests, setMatches, setSystemMetadata, setGenerationResult, setUsageStats]);

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
};
