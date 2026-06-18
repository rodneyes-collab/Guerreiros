
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
import { Player, Payment, Match, GenerationResult, UsageStats, Tournament, Expense, Gender } from '../../types';
import { INITIAL_PLAYERS } from '../../constants';
import firebaseConfig from '../../firebase-applet-config.json';

export const useFirestoreSync = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const viewMode = useStore(state => state.viewMode);
  const players = useStore(state => state.players);
  const currentPlayer = useStore(state => state.currentPlayer);
  const setPlayers = useStore(state => state.setPlayers);
  const setAttendance = useStore(state => state.setAttendance);
  const setMatches = useStore(state => state.setMatches);
  const setPayments = useStore(state => state.setPayments);
  const setSystemMetadata = useStore(state => state.setSystemMetadata);
  const setSynergy = useStore(state => state.setSynergy);
  const setNegativeSynergy = useStore(state => state.setNegativeSynergy);
  const setRivalry = useStore(state => state.setRivalry);
  const setIsInitialLoading = useStore(state => state.setIsInitialLoading);
  const setDbStatus = useStore(state => state.setDbStatus);
  const setUsageStats = useStore(state => state.setUsageStats);
  const setPreConfirmations = useStore(state => state.setPreConfirmations);
  const setPendingRequests = useStore(state => state.setPendingRequests);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const setTournaments = useStore(state => state.setTournaments);
  const setActiveTournament = useStore(state => state.setActiveTournament);
  const syncTrigger = useStore(state => state.syncTrigger);
  const setIsSyncing = useStore(state => state.setIsSyncing);

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  // Usage Tracking
  useEffect(() => {
    if (!user) return;

    // Track initial load (approx 15 reads for metadata and initial snapshots)
    const trackInitialUsage = async () => {
      try {
        const { trackUsage } = await import('../../firebase');
        await trackUsage(15, 0);
      } catch (e) {
        console.warn('Usage tracking failed:', e);
      }
    };

    trackInitialUsage();
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

        // 2. Load players
        let playersSnapshot = await getDocs(collection(db, 'players'));

        // Set the players in Store so login validations and other unauthenticated views can use it
        const list: Player[] = [];
        const seenEmails = new Set<string>();
        const seenUids = new Set<string>();

        playersSnapshot.forEach((docSnap) => {
          try {
            const data = docSnap.data();
            const id = docSnap.id;
            
            const player: Player = {
              id,
              name: (data.name || 'Jogador Sem Nome').trim(),
              isAdmin: data.isAdmin || false,
              elo: typeof data.elo === 'number' ? data.elo : 1200,
              email: data.email?.trim().toLowerCase() || undefined,
              uid: data.uid || undefined,
              gender: data.gender || Gender.MALE,
              isOfficialSetter: data.isOfficialSetter || false,
              matchesPlayed: data.matchesPlayed || 0,
              dailyMatches: data.dailyMatches || 0,
              dailyWins: data.dailyWins || 0,
              dailyLosses: data.dailyLosses || 0,
              dailyEloGain: data.dailyEloGain || 0,
              wins: data.wins || 0,
              losses: data.losses || 0,
              arrivalOrder: data.arrivalOrder || 999,
              ...data
            };

            if (player.email && seenEmails.has(player.email)) return;
            if (player.uid && seenUids.has(player.uid)) return;

            if (player.email) seenEmails.add(player.email);
            if (player.uid) seenUids.add(player.uid);
            list.push(player);
          } catch (itemErr) {
            console.error(`Firestore Sync: Error parsing initial player document ${docSnap.id}:`, itemErr);
          }
        });

        const sortedList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setPlayers(sortedList);

        setIsInitialLoading(false);
        console.info('Firestore Sync: Initial data load complete (Players loaded: ' + sortedList.length + ')');
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
    const isPublicMode = window.location.search.includes('public=true');
    if (!user && !isPublicMode) return;
    
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
        try {
          const list: Player[] = [];
          const seenEmails = new Set<string>();
          const seenUids = new Set<string>();
          
          snapshot.forEach((docSnap) => {
            try {
              const data = docSnap.data();
              const id = docSnap.id;
              
              // 1. Basic Sanitization & Default Values
              const player: Player = {
                id,
                name: (data.name || 'Jogador Sem Nome').trim(),
                isAdmin: data.isAdmin || false,
                elo: typeof data.elo === 'number' ? data.elo : 1200,
                email: data.email?.trim().toLowerCase() || undefined,
                uid: data.uid || undefined,
                gender: data.gender || Gender.MALE,
                isOfficialSetter: data.isOfficialSetter || false,
                matchesPlayed: data.matchesPlayed || 0,
                dailyMatches: data.dailyMatches || 0,
                dailyWins: data.dailyWins || 0,
                dailyLosses: data.dailyLosses || 0,
                dailyEloGain: data.dailyEloGain || 0,
                wins: data.wins || 0,
                losses: data.losses || 0,
                pointsFor: data.pointsFor || 0,
                pointsAgainst: data.pointsAgainst || 0,
                pointsBalance: data.pointsBalance || 0,
                arrivalOrder: data.arrivalOrder || 999,
                ...data
              };

              // 2. Deduplication Logic (Email or UID)
              // If we have an email or UID, check if we've seen it.
              // We prioritize the most "complete" or latest record if possible, 
              // but for now, simple "first seen wins" prevents state explosion.
              if (player.email && seenEmails.has(player.email)) {
                console.warn(`Firestore Sync: Duplicate player found by email (${player.email}). Skipping ID: ${id}`);
                return;
              }
              if (player.uid && seenUids.has(player.uid)) {
                console.warn(`Firestore Sync: Duplicate player found by UID (${player.uid}). Skipping ID: ${id}`);
                return;
              }

              if (player.email) seenEmails.add(player.email);
              if (player.uid) seenUids.add(player.uid);
              
              list.push(player);
            } catch (itemErr) {
              console.error(`Firestore Sync: Error parsing player document ${docSnap.id}:`, itemErr);
            }
          });

          // Sort by name for UI consistency
          const sortedList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setPlayers(sortedList);
        } catch (syncErr) {
          console.error('Firestore Sync: Critical error in player list processing:', syncErr);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Players):', err);
        handleFirestoreError(err, OperationType.LIST, 'players');
      });

      // System Metadata Sync
      unsubscribeSystem = onSnapshot(doc(db, 'metadata', 'system'), (snapshot) => {
        if (snapshot.exists()) {
          setSystemMetadata(snapshot.data());
        }
      }, (err) => {
        console.error('Firestore Sync Error (System Metadata):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/system');
      });

      unsubscribeCurrentMatch = onSnapshot(doc(db, 'metadata', 'currentMatch'), (snapshot) => {
        if (snapshot.exists()) {
          setGenerationResult(snapshot.data() as GenerationResult);
        } else {
          setGenerationResult(null);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Current Match):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/currentMatch');
      });

      unsubscribeUsage = onSnapshot(doc(db, 'metadata', 'usage'), (snapshot) => {
        if (snapshot.exists()) {
          setUsageStats(snapshot.data() as UsageStats);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Usage):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/usage');
      });

      const monthKey = dateKey.slice(0, 7);
      unsubscribeMonthlyUsage = onSnapshot(doc(db, 'metadata', `usage_${monthKey}`), (snapshot) => {
        if (snapshot.exists()) {
          useStore.getState().setMonthlyUsageStats(snapshot.data() as UsageStats);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Monthly Usage):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/usage_' + monthKey);
      });

      // Attendance Sync
      unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setAttendance(list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)));
      }, (err) => {
        console.error('Firestore Sync Error (Attendance):', err);
        handleFirestoreError(err, OperationType.LIST, 'attendance/' + dateKey + '/players');
      });

      // Matches Sync (Limit to last 60 days to save Firestore reads)
      const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
      const matchesQuery = query(collection(db, 'matches'), where('timestamp', '>=', sixtyDaysAgo));
      unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
        const list: Match[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Match));
        setMatches(list.sort((a, b) => a.timestamp - b.timestamp));
      }, (err) => {
        console.error('Firestore Sync Error (Matches):', err);
        handleFirestoreError(err, OperationType.LIST, 'matches');
      });

      // Pre-Confirmations Sync
      unsubscribePreConfirmations = onSnapshot(collection(db, 'preConfirmations', dateKey, 'players'), (snapshot) => {
        const list: Player[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
        setPreConfirmations(list);
      }, (err) => {
        console.error('Firestore Sync Error (PreConfirmations):', err);
        handleFirestoreError(err, OperationType.LIST, 'preConfirmations/' + dateKey + '/players');
      });

      // Synergy Sync
      unsubscribeSynergy = onSnapshot(doc(db, 'metadata', 'synergy'), (snapshot) => {
        if (snapshot.exists()) setSynergy(snapshot.data());
      }, (err) => {
        console.error('Firestore Sync Error (Synergy):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/synergy');
      });

      unsubscribeNegativeSynergy = onSnapshot(doc(db, 'metadata', 'negative_synergy'), (snapshot) => {
        if (snapshot.exists()) setNegativeSynergy(snapshot.data());
      }, (err) => {
        console.error('Firestore Sync Error (NegativeSynergy):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/negative_synergy');
      });

      unsubscribeRivalry = onSnapshot(doc(db, 'metadata', 'rivalry'), (snapshot) => {
        if (snapshot.exists()) setRivalry(snapshot.data());
      }, (err) => {
        console.error('Firestore Sync Error (Rivalry):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/rivalry');
      });

      // Tournaments Sync
      unsubscribeTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
        const list: Tournament[] = [];
        snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Tournament));
        setTournaments(list.sort((a, b) => b.date.localeCompare(a.date)));
      }, (err) => {
        console.error('Firestore Sync Error (Tournaments):', err);
        handleFirestoreError(err, OperationType.LIST, 'tournaments');
      });

      unsubscribeActiveTournament = onSnapshot(doc(db, 'metadata', 'activeTournament'), (snapshot) => {
        if (snapshot.exists()) {
          setActiveTournament(snapshot.data() as Tournament);
        } else {
          setActiveTournament(null);
        }
      }, (err) => {
        console.error('Firestore Sync Error (Active Tournament):', err);
        handleFirestoreError(err, OperationType.GET, 'metadata/activeTournament');
      });

      // Admin-only Listeners - ONLY if confirmed authenticated and admin
      console.log('useFirestoreSync: Admin check - userRole:', userRole, 'auth.currentUser:', auth.currentUser?.email);
      if (userRole === 'ADMIN' && auth.currentUser) {
        console.info('Firestore Sync: Starting Admin Listeners');
        unsubscribePending = onSnapshot(collection(db, 'pendingRequests'), (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
          setPendingRequests(list);
        }, (err) => {
          console.error('Firestore Sync Error (Pending):', err);
          handleFirestoreError(err, OperationType.GET, 'pendingRequests');
        });

        // Payments Sync - Only for admins, members use query in MyPaymentsView
        unsubscribePayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
          const list: Payment[] = [];
          snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Payment));
          setPayments(list);
        }, (err) => {
          console.error('Firestore Sync Error (Payments):', err);
          handleFirestoreError(err, OperationType.GET, 'payments_admin');
        });

        // Expenses Sync - Analytics/Financeiro is for admins
        unsubscribeExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
          const list: Expense[] = [];
          snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as any));
          useStore.setState({ expenses: list });
        }, (err) => {
          console.error('Firestore Sync Error (Expenses):', err);
          handleFirestoreError(err, OperationType.GET, 'expenses');
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
