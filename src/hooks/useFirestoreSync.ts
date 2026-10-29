import { useEffect, useCallback, useRef } from 'react';
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
  getFirestoreDateKey,
  getNextThursday,
  trackUsage
} from '../../firebase';
import { useStore } from '../../store';
import { safeLocalStorage, cleanObject } from '../../utils/helpers';
import { Player, Payment, Match, GenerationResult, UsageStats, Tournament, Expense, Gender, SyncFrequencyMode } from '../../types';
import { INITIAL_PLAYERS } from '../../constants';
import firebaseConfig from '../../firebase-applet-config.json';
import { syncWorkerService } from '../services/syncWorkerService';

const safeTimestamp = (ts: any): number => {
  if (!ts) return Date.now();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object') {
    if ('seconds' in ts) {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
    }
    if (typeof ts.toDate === 'function') {
      return ts.toDate().getTime();
    }
  }
  const parsed = Number(ts);
  return isNaN(parsed) ? Date.now() : parsed;
};

const parsePlayersSnapshot = (snapshot: any) => {
  const list: Player[] = [];
  const seenEmails = new Set<string>();
  const seenUids = new Set<string>();
  const idToCanonical = {} as Record<string, string>;
  const emailToCanonicalId = {} as Record<string, string>;
  const uidToCanonicalId = {} as Record<string, string>;

  snapshot.forEach((docSnap: any) => {
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
      const email = player.email;
      const uid = player.uid;

      if (email && seenEmails.has(email)) {
        idToCanonical[id] = emailToCanonicalId[email];
        return;
      }
      if (uid && seenUids.has(uid)) {
        idToCanonical[id] = uidToCanonicalId[uid];
        return;
      }

      if (email) {
        seenEmails.add(email);
        emailToCanonicalId[email] = id;
        idToCanonical[email] = id;
        idToCanonical[email.toLowerCase()] = id;
      }
      if (uid) {
        seenUids.add(uid);
        uidToCanonicalId[uid] = id;
        idToCanonical[uid] = id;
        idToCanonical[uid.toLowerCase()] = id;
      }
      
      idToCanonical[id] = id;
      list.push(player);
    } catch (itemErr) {
      console.error(`Firestore Sync: Error parsing player document ${docSnap.id}:`, itemErr);
    }
  });

  const sortedList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { sortedList, idToCanonical };
};

const parseAttendanceSnapshot = (snapshot: any) => {
  const list: Player[] = [];
  const seenIds = new Set<string>();
  let isInconsistent = false;

  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data() as Player;
    const docId = (docSnap.id || '').trim();
    const dataId = (data.id || '').trim();
    const id = dataId || docId;
    
    if (!id) {
      isInconsistent = true;
      return;
    }

    const lowerId = id.toLowerCase();
    if (seenIds.has(lowerId)) {
      isInconsistent = true;
      return;
    }
    
    seenIds.add(lowerId);
    list.push({ ...data, id });
  });

  const sorted = list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0));
  return { sorted, isInconsistent };
};

export const useFirestoreSync = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const viewMode = useStore(state => state.viewMode);
  const players = useStore(state => state.players);
  const currentPlayer = useStore(state => state.currentPlayer);
  const setPlayers = useStore(state => state.setPlayers);
  const setIdToCanonicalId = useStore(state => state.setIdToCanonicalId);
  const setAttendance = useStore(state => state.setAttendance);
  const setMatches = useStore(state => state.setMatches);
  const setPayments = useStore(state => state.setPayments);
  const setExpenses = useStore(state => state.setExpenses);
  const setSystemMetadata = useStore(state => state.setSystemMetadata);
  const setSynergy = useStore(state => state.setSynergy);
  const setNegativeSynergy = useStore(state => state.setNegativeSynergy);
  const setRivalry = useStore(state => state.setRivalry);
  const isInitialLoading = useStore(state => state.isInitialLoading);
  const setIsInitialLoading = useStore(state => state.setIsInitialLoading);
  const setDbStatus = useStore(state => state.setDbStatus);
  const setUsageStats = useStore(state => state.setUsageStats);
  const setPreConfirmations = useStore(state => state.setPreConfirmations);
  const setPendingRequests = useStore(state => state.setPendingRequests);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const setNextMatchPreview = useStore(state => state.setNextMatchPreview);
  const setTournaments = useStore(state => state.setTournaments);
  const setActiveTournament = useStore(state => state.setActiveTournament);
  const syncTrigger = useStore(state => state.syncTrigger);
  const syncMode = useStore(state => state.syncMode);
  const setLastSyncTimestamp = useStore(state => state.setLastSyncTimestamp);
  const setIsBackgroundSyncing = useStore(state => state.setIsBackgroundSyncing);
  const setSyncError = useStore(state => state.setSyncError);

  const isFetchingRef = useRef(false);
  const attendanceDebounceRef = useRef<any>(null);
  const playersDebounceRef = useRef<any>(null);
  const matchesDebounceRef = useRef<any>(null);

  const lastSyncTimestampRef = useRef<number>(0);
  const throttleSyncTimestamp = useCallback(() => {
    const now = Date.now();
    if (now - lastSyncTimestampRef.current > 5000) {
      lastSyncTimestampRef.current = now;
      setLastSyncTimestamp(now);
    }
  }, [setLastSyncTimestamp]);

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  // --- Revalidação Silenciosa do Estado da Lista de Presença ---
  const revalidateAttendanceSilently = useCallback(async (reason: string = 'heartbeat') => {
    try {
      const dateKey = getFirestoreDateKey();
      console.info(`[HeartbeatSync] Revalidação silenciosa executada (${reason}) em ${dateKey}...`);
      
      const attendanceSnap = await getDocs(collection(db, 'attendance', dateKey, 'players'));
      const { sorted, isInconsistent } = parseAttendanceSnapshot(attendanceSnap);
      
      setAttendance(sorted);
      setSyncError(null);

      if (isInconsistent) {
        console.info('[HeartbeatSync] Inconsistências sanadas com sucesso no estado de presença.');
      }
    } catch (err) {
      console.warn('[HeartbeatSync] Falha tratada na revalidação silenciosa:', err);
    }
  }, [setAttendance, setSyncError]);

  // Usage Tracking
  useEffect(() => {
    if (!user) return;

    // Track initial load (approx 15 reads for metadata and initial snapshots)
    const trackInitialUsage = async () => {
      try {
        
        await trackUsage(15, 0);
      } catch (e) {
        console.warn('Usage tracking failed:', e);
      }
    };

    trackInitialUsage();
  }, [user, currentPlayer?.id]);

  // --- Unified Batch Fetch Function (For Periodic/Interval and Manual Modes) ---
  const executeBatchFetch = useCallback(async (isManual: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsBackgroundSyncing(true);
    setSyncError(null);

    try {
      const dateKey = getFirestoreDateKey();
      useStore.setState({ dateKey });
      console.info(`[FirestoreSync] Executing batch fetch (Mode: ${syncMode}, Manual: ${isManual}, Date: ${dateKey})`);

      // 1. Fetch Metadata Docs in Parallel
      const [
        metaSnap,
        playersSnap,
        attendanceSnap,
        preConfSnap,
        currentMatchSnap,
        nextMatchPreviewSnap,
        activeTournSnap,
        tournamentsSnap,
        matchesSnap
      ] = await Promise.all([
        getDocs(collection(db, 'metadata')),
        getDocs(collection(db, 'players')),
        getDocs(collection(db, 'attendance', dateKey, 'players')),
        getDocs(collection(db, 'preConfirmations', dateKey, 'players')),
        getDoc(doc(db, 'metadata', 'currentMatch')),
        getDoc(doc(db, 'metadata', 'nextMatchPreview')),
        getDoc(doc(db, 'metadata', 'activeTournament')),
        getDocs(collection(db, 'tournaments')),
        getDocs(collection(db, 'matches'))
      ]);

      // Process Metadata
      metaSnap.forEach((docSnap) => {
        if (docSnap.id === 'synergy') setSynergy(docSnap.data() || {});
        if (docSnap.id === 'negative_synergy') setNegativeSynergy(docSnap.data() || {});
        if (docSnap.id === 'rivalry') setRivalry(docSnap.data() || {});
        if (docSnap.id === 'system') {
          const data = docSnap.data() || {};
          setSystemMetadata({
            monthlyFee: 50,
            lastResetDate: new Date().toISOString().split('T')[0],
            ...data
          });
        }
        if (docSnap.id === 'usage') {
          setUsageStats(docSnap.data() as UsageStats);
        }
      });

      // Process Players
      const { sortedList, idToCanonical } = parsePlayersSnapshot(playersSnap);
      setPlayers(sortedList);
      setIdToCanonicalId(idToCanonical);

      // Process Attendance
      const { sorted: sortedAttendance } = parseAttendanceSnapshot(attendanceSnap);
      setAttendance(sortedAttendance);

      // Process Pre-Confirmations
      const preConfList: Player[] = [];
      preConfSnap.forEach((d) => preConfList.push({ ...d.data(), id: d.id } as Player));
      setPreConfirmations(preConfList);

      // Process Current Match
      if (currentMatchSnap.exists()) {
        setGenerationResult(currentMatchSnap.data() as GenerationResult);
      } else {
        setGenerationResult(null);
      }

      // Process Next Match Preview
      if (nextMatchPreviewSnap.exists()) {
        setNextMatchPreview(nextMatchPreviewSnap.data() as GenerationResult);
      } else {
        setNextMatchPreview(null);
      }

      // Process Active Tournament
      if (activeTournSnap.exists()) {
        setActiveTournament(activeTournSnap.data() as Tournament);
      } else {
        setActiveTournament(null);
      }

      // Process Tournaments
      const tournList: Tournament[] = [];
      tournamentsSnap.forEach((d) => tournList.push({ ...d.data(), id: d.id } as Tournament));
      setTournaments(tournList.sort((a, b) => b.date.localeCompare(a.date)));

      // Process Matches
      const matchesList: Match[] = [];
      matchesSnap.forEach((d) => {
        const data = d.data();
        const ts = safeTimestamp(data.timestamp);
        matchesList.push({ ...data, timestamp: ts, id: d.id } as Match);
      });
      setMatches(matchesList.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));

      // Admin-only collections or public financial collections
      // Admin-only collections or public financial collections
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      const currentUser = auth.currentUser;
      const effectiveEmail = currentUser?.email?.trim().toLowerCase();
      const isOwner = effectiveEmail === 'rodneyes@gmail.com';
      const isAdminSession = userRole === 'ADMIN' || isOwner || currentUser?.uid === 'YwBU0W89ktMLB7XY8noA5TuWg9G3';

      console.log('[MOBILE FIRESTORE SYNC DEBUG] Checking ADMIN role and device status before batch payments query:', {
        isMobileDevice,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        currentUserEmail: currentUser?.email,
        currentUserUid: currentUser?.uid,
        userRole,
        isOwner,
        isAdminSession,
        isAdminValidated: isAdminSession,
        action: 'Fetching full payments collection'
      });

      // Fetch financial data with robust fallback and cache check
      let paymentsSnap;
      let expensesSnap;
      try {
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      } catch (err) {
        console.warn('[MOBILE PAYMENTS DEBUG] Fetch failed:', err);
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      }

      const paymentsList: Payment[] = [];
      paymentsSnap.forEach((d) => paymentsList.push({ ...d.data(), id: d.id } as Payment));
      console.log('[MOBILE PAYMENTS DEBUG] Payments loaded in batch fetch:', {
        count: paymentsList.length,
        fromCache: paymentsSnap.metadata.fromCache,
        isAdminSession
      });
      setPayments(paymentsList);

      const expensesList: Expense[] = [];
      expensesSnap.forEach((d) => expensesList.push({ ...d.data(), id: d.id } as any));
      setExpenses(expensesList);

      // ADMIN-only fetch
      if (userRole === 'ADMIN' && auth.currentUser) {
        const pendingSnap = await getDocs(collection(db, 'pendingRequests'));
        const pendingList: any[] = [];
        pendingSnap.forEach((d) => pendingList.push({ id: d.id, ...d.data() }));
        setPendingRequests(pendingList);
      }

      setLastSyncTimestamp(Date.now());
      setIsInitialLoading(false);
    } catch (err: any) {
      console.error('[FirestoreSync] Batch fetch error:', err);
      setSyncError('Falha ao sincronizar dados. Tentando reconectar...');
    } finally {
      isFetchingRef.current = false;
      setTimeout(() => {
        setIsBackgroundSyncing(false);
      }, 500);
    }
  }, [syncMode, userRole, setSynergy, setNegativeSynergy, setRivalry, setSystemMetadata, setUsageStats, setPlayers, setIdToCanonicalId, setAttendance, setPreConfirmations, setGenerationResult, setActiveTournament, setTournaments, setMatches, setPendingRequests, setPayments, setLastSyncTimestamp, setIsInitialLoading, setIsBackgroundSyncing, setSyncError]);

  // Initial Data Loading on project change / mount
  useEffect(() => {
    const storedProjectId = safeLocalStorage.getItem('spikegen_project_id');
    if (storedProjectId && storedProjectId !== firebaseConfig.projectId) {
      console.warn('Firestore Sync: Project ID changed, clearing local storage');
      localStorage.clear();
      safeLocalStorage.setItem('spikegen_project_id', firebaseConfig.projectId);
    } else if (!storedProjectId) {
      safeLocalStorage.setItem('spikegen_project_id', firebaseConfig.projectId);
    }
  }, []);

  // --- Main Synchronization Engine ---
  useEffect(() => {
    const dateKey = getFirestoreDateKey();
    useStore.setState({ dateKey });
    let financialTimer: NodeJS.Timeout | undefined;

    // MODE 1: REAL-TIME (Active WebSocket onSnapshot listeners)
    if (syncMode === 'realtime') {
      console.info('Firestore Sync: Starting REAL-TIME listeners for date:', dateKey, 'User:', user?.email, 'Role:', userRole, 'Trigger:', syncTrigger);
      
      let unsubscribePlayers: (() => void) | undefined;
      let unsubscribeAttendance: (() => void) | undefined;
      let unsubscribePending: (() => void) | undefined;
      let unsubscribeMatches: (() => void) | undefined;
      let unsubscribeSystem: (() => void) | undefined;
      let unsubscribeCurrentMatch: (() => void) | undefined;
      let unsubscribeNextMatchPreview: (() => void) | undefined;
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
      let unsubscribeIntentions: (() => void) | undefined;

      setIsBackgroundSyncing(true);
      setSyncError(null);

      try {
        // Metadata / Intentions Sync (needed for targetDate)
        let currentTargetDate = getNextThursday();
        console.info(`[Sync Diagnóstico] [useFirestoreSync] Inicializando escuta de metadata/intentions e preConfirmations (alvo inicial: ${currentTargetDate})...`);
        
        unsubscribeIntentions = onSnapshot(doc(db, 'metadata', 'intentions'), (snapshot) => {
          console.info('[Sync Diagnóstico] [useFirestoreSync] Snapshot de metadata/intentions recebido.');
          if (snapshot.exists()) {
            const data = snapshot.data();
            const newTarget = data.targetDate || getNextThursday();
            console.info(`[Sync Diagnóstico] [useFirestoreSync] metadata/intentions targetDate atual: ${newTarget}`);
            if (newTarget !== currentTargetDate) {
              console.info(`[Sync Diagnóstico] [useFirestoreSync] targetDate alterado de ${currentTargetDate} para ${newTarget}. Reinscrevendo preConfirmations.`);
              currentTargetDate = newTarget;
              setupPreConfirmations(newTarget);
            }
          }
        });

        const setupPreConfirmations = (target: string) => {
          console.info(`[Sync Diagnóstico] [useFirestoreSync] Configurando escuta em tempo real para preConfirmations/${target}/players...`);
          if (unsubscribePreConfirmations) unsubscribePreConfirmations();
          unsubscribePreConfirmations = onSnapshot(collection(db, 'preConfirmations', target, 'players'), (snapshot) => {
            const list: Player[] = [];
            snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Player));
            console.info(`[Sync Diagnóstico] [useFirestoreSync] Snapshot de preConfirmations/${target}/players recebido. Total de atletas: ${list.length}`);
            setPreConfirmations(list);
            throttleSyncTimestamp();
          }, (err) => {
            console.error(`[Sync Diagnóstico] [useFirestoreSync] Erro na escuta de preConfirmations (${target}):`, err);
          });
        };

        // Initial setup for preConfirmations
        setupPreConfirmations(currentTargetDate);

        // Players Sync
        unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
          if (playersDebounceRef.current) clearTimeout(playersDebounceRef.current);
          playersDebounceRef.current = setTimeout(async () => {
            try {
              const docs = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
              console.log('[SYNC DEBUG] Players snapshot received:', {
                count: docs.length,
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites
              });
              const { sortedList, idToCanonical } = await syncWorkerService.parsePlayers(docs);
              setPlayers(sortedList);
              setIdToCanonicalId(idToCanonical);
              throttleSyncTimestamp();
              setIsInitialLoading(false);
            } catch (syncErr) {
              console.error('Firestore Sync: Critical error in player list processing:', syncErr);
            }
          }, 250);
        }, (err) => {
          console.error('Firestore Sync Error (Players):', err);
          handleFirestoreError(err, OperationType.LIST, 'players');
        });

        // System Metadata Sync
        unsubscribeSystem = onSnapshot(doc(db, 'metadata', 'system'), (snapshot) => {
          if (snapshot.exists()) {
            setSystemMetadata(snapshot.data());
            throttleSyncTimestamp();
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
          throttleSyncTimestamp();
        }, (err) => {
          console.error('Firestore Sync Error (Current Match):', err);
        });

        unsubscribeNextMatchPreview = onSnapshot(doc(db, 'metadata', 'nextMatchPreview'), (snapshot) => {
          if (snapshot.exists()) {
            setNextMatchPreview(snapshot.data() as GenerationResult);
          } else {
            setNextMatchPreview(null);
          }
          throttleSyncTimestamp();
        }, (err) => {
          console.error('Firestore Sync Error (Next Match Preview):', err);
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

        // Attendance Sync com Detector de Inconsistências
        unsubscribeAttendance = onSnapshot(collection(db, 'attendance', dateKey, 'players'), (snapshot) => {
          if (attendanceDebounceRef.current) clearTimeout(attendanceDebounceRef.current);
          attendanceDebounceRef.current = setTimeout(async () => {
            try {
              const docs = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
              const { sorted, isInconsistent } = await syncWorkerService.parseAttendance(docs);

              setAttendance(sorted);
              setSyncError(null);
              throttleSyncTimestamp();

              if (isInconsistent) {
                console.warn(`[AttendanceSync] Inconsistência detectada no snapshot! Forçando revalidação silenciosa.`);
                revalidateAttendanceSilently('snapshot_inconsistency');
              }
            } catch (attErr) {
              console.error('Firestore Sync: Critical error in attendance parsing:', attErr);
            }
          }, 250);
        }, (err) => {
          console.warn(`[AttendanceSync] Listener de presença com erro (${dateKey}). Acionando revalidação silenciosa:`, err);
          revalidateAttendanceSilently('listener_error');
        });

        // Matches Sync (Fetch all history for full ranking support)
        const matchesQuery = collection(db, 'matches');
        unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
          if (matchesDebounceRef.current) clearTimeout(matchesDebounceRef.current);
          matchesDebounceRef.current = setTimeout(async () => {
            try {
              const docs = snapshot.docs.map(doc => {
                const data = doc.data();
                const ts = safeTimestamp(data.timestamp);
                return {
                  id: doc.id,
                  data: {
                    ...data,
                    timestamp: ts
                  }
                };
              });
              const { sorted } = await syncWorkerService.parseMatches(docs);
              setMatches(sorted);
              throttleSyncTimestamp();
              // Only stop loading when players AND matches are here
              if (players.length > 0) {
                setIsInitialLoading(false);
              }
            } catch (matchErr) {
              console.error('Firestore Sync: Critical error in matches parsing:', matchErr);
            }
          }, 300);
        }, (err) => {
          console.error('Firestore Sync Error (Matches):', err);
        });

        // Synergy Sync
        unsubscribeSynergy = onSnapshot(doc(db, 'metadata', 'synergy'), (snapshot) => {
          if (snapshot.exists()) setSynergy(snapshot.data());
        }, (err) => {
          console.error('Firestore Sync Error (Synergy):', err);
        });

        unsubscribeNegativeSynergy = onSnapshot(doc(db, 'metadata', 'negative_synergy'), (snapshot) => {
          if (snapshot.exists()) setNegativeSynergy(snapshot.data());
        }, (err) => {
          console.error('Firestore Sync Error (NegativeSynergy):', err);
        });

        unsubscribeRivalry = onSnapshot(doc(db, 'metadata', 'rivalry'), (snapshot) => {
          if (snapshot.exists()) setRivalry(snapshot.data());
        }, (err) => {
          console.error('Firestore Sync Error (Rivalry):', err);
        });

        // Tournaments Sync
        unsubscribeTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
          const list: Tournament[] = [];
          snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Tournament));
          setTournaments(list.sort((a, b) => b.date.localeCompare(a.date)));
          throttleSyncTimestamp();
        }, (err) => {
          console.error('Firestore Sync Error (Tournaments):', err);
        });

        unsubscribeActiveTournament = onSnapshot(doc(db, 'metadata', 'activeTournament'), (snapshot) => {
          if (snapshot.exists()) {
            setActiveTournament(snapshot.data() as Tournament);
          } else {
            setActiveTournament(null);
          }
          throttleSyncTimestamp();
        }, (err) => {
          console.error('Firestore Sync Error (Active Tournament):', err);
        });

        // Public Financial Listeners (staggered slightly to avoid startup contention)
        financialTimer = setTimeout(async () => {
          const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
          const currentUser = auth.currentUser;
          const effectiveEmail = currentUser?.email?.trim().toLowerCase();
          const isOwner = effectiveEmail === 'rodneyes@gmail.com';
          const isAdminSession = userRole === 'ADMIN' || isOwner || currentUser?.uid === 'YwBU0W89ktMLB7XY8noA5TuWg9G3';

          console.log('[MOBILE FIRESTORE SYNC DEBUG] Realtime financial listener - Validating ADMIN role on mobile device before fetching payments:', {
            isMobileDevice,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            currentUserEmail: currentUser?.email,
            currentUserUid: currentUser?.uid,
            userRole,
            isAdminSession,
            isAdminValidated: isAdminSession,
            isOwner
          });

          if (isMobileDevice || isAdminSession) {
            try {
              const initialServerPayments = await getDocs(collection(db, 'payments'));
              const list: Payment[] = [];
              initialServerPayments.forEach((d) => list.push({ ...d.data(), id: d.id } as Payment));
              console.log('[MOBILE FIRESTORE SYNC DEBUG] Initial fresh payments fetch completed for admin/mobile:', {
                count: list.length,
                isAdminSession,
                isMobileDevice
              });
              setPayments(list);
            } catch (err) {
              console.warn('[MOBILE FIRESTORE SYNC DEBUG] Initial payments fetch error:', err);
            }
          }

          unsubscribePayments = onSnapshot(collection(db, 'payments'), async (snapshot) => {
            const list: Payment[] = [];
            snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Payment));
            console.log('[MOBILE FIRESTORE SYNC DEBUG] Payments snapshot received:', {
              count: list.length,
              fromCache: snapshot.metadata.fromCache,
              hasPendingWrites: snapshot.metadata.hasPendingWrites,
              isAdminSession,
              isMobileDevice
            });

            if (snapshot.metadata.fromCache && (isMobileDevice || isAdminSession)) {
              console.warn('[MOBILE PAYMENTS REALTIME DEBUG] Snapshot served from cache for admin/mobile!');
              try {
                const freshSnap = await getDocs(collection(db, 'payments'));
                const freshList: Payment[] = [];
                freshSnap.forEach((doc) => freshList.push({ ...doc.data(), id: doc.id } as Payment));
                console.log('[MOBILE PAYMENTS REALTIME DEBUG] Fresh fetch completed:', freshList.length);
                setPayments(freshList);
                return;
              } catch (e) {
                console.error('[MOBILE PAYMENTS REALTIME DEBUG] Failed to refresh fetch:', e);
              }
            }

            setPayments(list);
          }, (err) => {
            console.error('Firestore Sync Error (Payments):', err);
          });

          unsubscribeExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
            const list: Expense[] = [];
            snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as any));
            useStore.setState({ expenses: list });
          }, (err) => {
            console.error('Firestore Sync Error (Expenses):', err);
          });

          // Admin-only Listeners
          if (userRole === 'ADMIN' && auth.currentUser) {
            unsubscribePending = onSnapshot(collection(db, 'pendingRequests'), (snapshot) => {
              const list: any[] = [];
              snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
              setPendingRequests(list);
            }, (err) => {
              console.error('Firestore Sync Error (Pending Requests):', err);
            });
          }
        }, 800);

      } catch (e) {
        console.error('Firestore Sync: Fatal error setting up listeners:', e);
      }

      // Reset syncing state after a longer delay to allow mobile thread to breath
      const syncTimer = setTimeout(() => {
        setIsBackgroundSyncing(false);
        setIsInitialLoading(false);
      }, 2500);

      // Heartbeat listener for real-time mode
      const heartbeatInterval = setInterval(() => {
        revalidateAttendanceSilently('realtime_heartbeat');
      }, 45000);

      return () => {
        clearTimeout(syncTimer);
        if (financialTimer) clearTimeout(financialTimer);
        clearInterval(heartbeatInterval);
        if (attendanceDebounceRef.current) clearTimeout(attendanceDebounceRef.current);
        if (playersDebounceRef.current) clearTimeout(playersDebounceRef.current);
        if (matchesDebounceRef.current) clearTimeout(matchesDebounceRef.current);
        console.info('Firestore Sync: Cleaning up real-time listeners');
        if (unsubscribePlayers) unsubscribePlayers();
        if (unsubscribeAttendance) unsubscribeAttendance();
        if (unsubscribePending) unsubscribePending();
        if (unsubscribeMatches) unsubscribeMatches();
        if (unsubscribeSystem) unsubscribeSystem();
        if (unsubscribeCurrentMatch) unsubscribeCurrentMatch();
        if (unsubscribeNextMatchPreview) unsubscribeNextMatchPreview();
        if (unsubscribeUsage) unsubscribeUsage();
        if (unsubscribeMonthlyUsage) unsubscribeMonthlyUsage();
        if (unsubscribePreConfirmations) unsubscribePreConfirmations();
        if (unsubscribeIntentions) unsubscribeIntentions();
        if (unsubscribeSynergy) unsubscribeSynergy();
        if (unsubscribeNegativeSynergy) unsubscribeNegativeSynergy();
        if (unsubscribeRivalry) unsubscribeRivalry();
        if (unsubscribeTournaments) unsubscribeTournaments();
        if (unsubscribeActiveTournament) unsubscribeActiveTournament();
        if (unsubscribePayments) unsubscribePayments();
        if (unsubscribeExpenses) unsubscribeExpenses();
      };
    } 

    // MODE 2: FIXED INTERVALS & MANUAL MODE (Battery Saver)
    console.info(`Firestore Sync: Operating in PERIODIC / INTERVAL mode (${syncMode})`);
    
    // Initial fetch on mode mount / trigger
    executeBatchFetch(false);

    let intervalMs: number | null = null;
    if (syncMode === 'interval_15s') intervalMs = 15000;
    else if (syncMode === 'interval_30s') intervalMs = 30000;
    else if (syncMode === 'interval_60s') intervalMs = 60000;
    else if (syncMode === 'interval_300s') intervalMs = 300000;

    let intervalId: any = null;
    if (intervalMs) {
      intervalId = setInterval(() => {
        executeBatchFetch(false);
      }, intervalMs);
    }

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        console.info('[FirestoreSync] Window focused/visible, refreshing data...');
        executeBatchFetch(false);
      }
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncMode, syncTrigger, user, userRole, executeBatchFetch, revalidateAttendanceSilently, setPlayers, setAttendance, setPendingRequests, setMatches, setSystemMetadata, setGenerationResult, setUsageStats, setPreConfirmations, setSynergy, setNegativeSynergy, setRivalry, setTournaments, setActiveTournament, setIsBackgroundSyncing, setIsInitialLoading, setPayments, setLastSyncTimestamp, setSyncError, setIdToCanonicalId]);

  const commitBatchWithLog = useCallback(async (batch: any, label: string, size: number) => {
    const startTime = performance.now();
    console.info(`[Guerreiros Intelligence] 🚀 Preparando envio de lote "${label}" | Contagem de operações: ${size} | Timestamp: ${new Date().toISOString()}`);
    
    // Pacing / throttling to prevent 'Rate exceeded' (RESOURCE_EXHAUSTED) on rapid successive writes
    if (size > 30) {
      console.info(`[Guerreiros Intelligence] ⏳ Aplicando pacing otimizado (30ms) para lote de ${size} operações para evitar 'Rate exceeded'...`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    try {
      await batch.commit();
      const duration = (performance.now() - startTime).toFixed(2);
      console.info(`[Guerreiros Intelligence] ✅ Lote "${label}" processado com sucesso em ${duration}ms. (Total de operações commitadas: ${size})`);
    } catch (error: any) {
      console.error(`[Guerreiros Intelligence] ❌ Erro ao processar lote "${label}" (${size} operações):`, error);
      if (error?.code === 'resource-exhausted' || error?.message?.includes('Rate exceeded') || error?.message?.includes('Quota exceeded')) {
        console.warn(`[Guerreiros Intelligence] ⚠️ Detectado limite de taxa (Rate Exceeded). Recomenda-se lotes menores e frequentes.`);
      }
      throw error;
    }
  }, []);

  return {
    syncTrigger,
    syncMode,
    isInitialLoading,
    executeBatchFetch,
    revalidateAttendanceSilently,
    commitBatchWithLog
  };
};
