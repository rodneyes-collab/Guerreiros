import { useEffect, useCallback, useRef } from 'react';
import {
  db,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  doc,
  OperationType,
  handleFirestoreError,
  auth,
  getFirestoreDateKey,
  getNextThursday,
  trackUsage,
  isQuotaExceeded,
  isFirestoreQuotaError,
  markQuotaExceeded
} from '../../firebase';
import { useStore } from '../../store';
import { safeLocalStorage } from '../../utils/helpers';
import {
  Player,
  Payment,
  Match,
  GenerationResult,
  UsageStats,
  Tournament,
  Expense,
  Gender
} from '../../types';
import { isValidWeeklyConfirmationTimestamp } from '../utils/intentionsCleanup';
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
  const idToCanonical: Record<string, string> = {};
  const emailToCanonicalId: Record<string, string> = {};
  const uidToCanonicalId: Record<string, string> = {};

  snapshot.forEach((docSnap: any) => {
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
        pointsFor: data.pointsFor || 0,
        pointsAgainst: data.pointsAgainst || 0,
        pointsBalance: data.pointsBalance || 0,
        arrivalOrder: typeof data.arrivalOrder === 'number' ? data.arrivalOrder : undefined,
        ...data
      };

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
    } catch (err) {
      console.error(`Firestore Sync: Error parsing player ${docSnap.id}:`, err);
    }
  });

  const sortedList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { sortedList, idToCanonical };
};

const parseAttendanceSnapshot = (snapshot: any, allPlayers?: Player[]) => {
  const list: Player[] = [];
  const seenIds = new Set<string>();
  let isInconsistent = false;

  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data() as Player;
    const id = (data.id || docSnap.id || '').trim();
    if (!id) {
      isInconsistent = true;
      return;
    }

    const masterPlayer = allPlayers?.find(
      p =>
        p.id === id ||
        (p.uid && p.uid.toLowerCase() === id.toLowerCase()) ||
        (p.email && p.email.toLowerCase() === id.toLowerCase())
    );

    const status = masterPlayer?.status || data.status || 'active';
    const isDM = Boolean(masterPlayer?.isDM || data.isDM || status === 'dm');

    if (
      status === 'dm' ||
      status === 'inactive' ||
      status === 'waiting' ||
      isDM ||
      (status !== 'active' && status !== 'guest')
    ) {
      return;
    }

    const lowerId = id.toLowerCase();
    if (seenIds.has(lowerId)) {
      isInconsistent = true;
      return;
    }

    seenIds.add(lowerId);
    list.push({ ...data, ...masterPlayer, id, status, isDM });
  });

  const sorted = list.sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0));
  return { sorted, isInconsistent };
};

export const useFirestoreSync = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
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
  const setCollectionSyncMeta = useStore(state => state.setCollectionSyncMeta);

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

  const revalidateAttendanceSilently = useCallback(async () => {
    if (isQuotaExceeded) return;
    try {
      const dateKey = getFirestoreDateKey();
      const attendanceSnap = await getDocs(collection(db, 'attendance', dateKey, 'players'));
      const { sorted } = parseAttendanceSnapshot(attendanceSnap);
      setAttendance(sorted);
      setSyncError(null);
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markQuotaExceeded();
      }
    }
  }, [setAttendance, setSyncError]);

  useEffect(() => {
    if (!user || isQuotaExceeded) return;
    trackUsage(15, 0).catch(() => {});
  }, [user, currentPlayer?.id]);

  const executeBatchFetch = useCallback(async () => {
    if (isFetchingRef.current || isQuotaExceeded) return;
    isFetchingRef.current = true;
    setIsBackgroundSyncing(true);
    setSyncError(null);

    try {
      const dateKey = getFirestoreDateKey();
      const targetThursdayKey = getNextThursday();
      useStore.setState({ dateKey });

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
        getDocs(collection(db, 'preConfirmations', targetThursdayKey, 'players')),
        getDoc(doc(db, 'metadata', 'currentMatch')),
        getDoc(doc(db, 'metadata', 'nextMatchPreview')),
        getDoc(doc(db, 'metadata', 'activeTournament')),
        getDocs(collection(db, 'tournaments')),
        getDocs(collection(db, 'matches'))
      ]);

      metaSnap.forEach(docSnap => {
        if (docSnap.id === 'synergy') setSynergy(docSnap.data() || {});
        if (docSnap.id === 'negative_synergy') setNegativeSynergy(docSnap.data() || {});
        if (docSnap.id === 'rivalry') setRivalry(docSnap.data() || {});
        if (docSnap.id === 'system') {
          setSystemMetadata({
            monthlyFee: 50,
            lastResetDate: new Date().toISOString().split('T')[0],
            ...(docSnap.data() || {})
          });
        }
        if (docSnap.id === 'usage') {
          setUsageStats(docSnap.data() as UsageStats);
        }
      });

      const { sortedList, idToCanonical } = parsePlayersSnapshot(playersSnap);
      setPlayers(sortedList);
      setIdToCanonicalId(idToCanonical);

      const { sorted: sortedAttendance } = parseAttendanceSnapshot(attendanceSnap, sortedList);
      setAttendance(sortedAttendance);

      const preConfList: Player[] = [];
      preConfSnap.forEach(d => {
        const data = d.data();
        if (isValidWeeklyConfirmationTimestamp(Number(data.timestamp || 0))) {
          preConfList.push({ ...data, id: d.id } as Player);
        }
      });
      setPreConfirmations(preConfList);

      setGenerationResult(currentMatchSnap.exists() ? (currentMatchSnap.data() as GenerationResult) : null);
      setNextMatchPreview(nextMatchPreviewSnap.exists() ? (nextMatchPreviewSnap.data() as GenerationResult) : null);
      setActiveTournament(activeTournSnap.exists() ? (activeTournSnap.data() as Tournament) : null);

      const tournList: Tournament[] = [];
      tournamentsSnap.forEach(d => tournList.push({ ...d.data(), id: d.id } as Tournament));
      setTournaments(tournList.sort((a, b) => b.date.localeCompare(a.date)));

      const matchesList: Match[] = [];
      matchesSnap.forEach(d => {
        const data = d.data();
        matchesList.push({ ...data, timestamp: safeTimestamp(data.timestamp), id: d.id } as Match);
      });
      setMatches(matchesList.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));

      try {
        const [paymentsSnap, expensesSnap] = await Promise.all([
          getDocs(collection(db, 'payments')),
          getDocs(collection(db, 'expenses'))
        ]);
        const paymentsList: Payment[] = [];
        paymentsSnap.forEach(d => paymentsList.push({ ...d.data(), id: d.id } as Payment));
        setPayments(paymentsList);

        const expensesList: Expense[] = [];
        expensesSnap.forEach(d => expensesList.push({ ...d.data(), id: d.id } as Expense));
        setExpenses(expensesList);
      } catch (e) {}

      if (userRole === 'ADMIN' && auth.currentUser) {
        const pendingSnap = await getDocs(collection(db, 'pendingRequests'));
        const pendingList: any[] = [];
        pendingSnap.forEach(d => pendingList.push({ id: d.id, ...d.data() }));
        setPendingRequests(pendingList);
      }

      setLastSyncTimestamp(Date.now());
      setIsInitialLoading(false);
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markQuotaExceeded();
        setSyncError('Cota diária do Firestore excedida.');
      } else {
        setSyncError('Falha ao sincronizar dados.');
      }
    } finally {
      isFetchingRef.current = false;
      setTimeout(() => setIsBackgroundSyncing(false), 500);
    }
  }, [
    userRole,
    setSynergy,
    setNegativeSynergy,
    setRivalry,
    setSystemMetadata,
    setUsageStats,
    setPlayers,
    setIdToCanonicalId,
    setAttendance,
    setPreConfirmations,
    setGenerationResult,
    setNextMatchPreview,
    setActiveTournament,
    setTournaments,
    setMatches,
    setPendingRequests,
    setPayments,
    setExpenses,
    setLastSyncTimestamp,
    setIsInitialLoading,
    setIsBackgroundSyncing,
    setSyncError
  ]);

  useEffect(() => {
    const storedProjectId = safeLocalStorage.getItem('spikegen_project_id');
    if (storedProjectId && storedProjectId !== firebaseConfig.projectId) {
      localStorage.clear();
    }
    safeLocalStorage.setItem('spikegen_project_id', firebaseConfig.projectId);
  }, []);

  useEffect(() => {
    const dateKey = getFirestoreDateKey();
    useStore.setState({ dateKey });
    let financialTimer: NodeJS.Timeout | undefined;

    if (isQuotaExceeded) {
      setIsBackgroundSyncing(false);
      setIsInitialLoading(false);
      return;
    }

    if (syncMode === 'realtime') {
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

      const handleListenerError = (label: string, critical = false) => (err: any) => {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
          setSyncError('Cota diária do Firestore excedida.');
          setIsBackgroundSyncing(false);
          setIsInitialLoading(false);
          return;
        }
        if (critical) {
          handleFirestoreError(err, OperationType.LIST, label);
        } else {
          console.warn(`[FirestoreSync] Erro no listener (${label}):`, err?.message || err);
        }
      };

      setIsBackgroundSyncing(true);
      setSyncError(null);

      try {
        let currentTargetDate = getNextThursday();

        const setupPreConfirmations = (target: string) => {
          if (unsubscribePreConfirmations) unsubscribePreConfirmations();
          if (isQuotaExceeded) return;
          unsubscribePreConfirmations = onSnapshot(
            collection(db, 'preConfirmations', target, 'players'),
            snapshot => {
              const list: Player[] = [];
              snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (isValidWeeklyConfirmationTimestamp(Number(data.timestamp || 0))) {
                  list.push({ ...data, id: docSnap.id } as Player);
                }
              });
              setPreConfirmations(list);
              throttleSyncTimestamp();
            },
            handleListenerError(`preConfirmations/${target}`)
          );
        };

        setupPreConfirmations(currentTargetDate);

        unsubscribeIntentions = onSnapshot(
          doc(db, 'metadata', 'intentions'),
          snapshot => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              const newTarget = data.targetDate || getNextThursday();
              if (newTarget !== currentTargetDate) {
                currentTargetDate = newTarget;
                setupPreConfirmations(newTarget);
              }
            }
          },
          handleListenerError('metadata/intentions')
        );

        unsubscribePlayers = onSnapshot(
          collection(db, 'players'),
          snapshot => {
            if (playersDebounceRef.current) clearTimeout(playersDebounceRef.current);
            playersDebounceRef.current = setTimeout(async () => {
              try {
                const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
                const { sortedList, idToCanonical } = await syncWorkerService.parsePlayers(docs);
                setPlayers(sortedList);
                setIdToCanonicalId(idToCanonical);
                throttleSyncTimestamp();
                setIsInitialLoading(false);
              } catch (e) {}
            }, 250);
          },
          handleListenerError('players', true)
        );

        unsubscribeSystem = onSnapshot(
          doc(db, 'metadata', 'system'),
          snapshot => {
            if (snapshot.exists()) setSystemMetadata(snapshot.data());
          },
          handleListenerError('metadata/system')
        );

        unsubscribeCurrentMatch = onSnapshot(
          doc(db, 'metadata', 'currentMatch'),
          snapshot => {
            setGenerationResult(snapshot.exists() ? (snapshot.data() as GenerationResult) : null);
          },
          handleListenerError('metadata/currentMatch')
        );

        unsubscribeNextMatchPreview = onSnapshot(
          doc(db, 'metadata', 'nextMatchPreview'),
          snapshot => {
            setNextMatchPreview(snapshot.exists() ? (snapshot.data() as GenerationResult) : null);
          },
          handleListenerError('metadata/nextMatchPreview')
        );

        unsubscribeUsage = onSnapshot(
          doc(db, 'metadata', 'usage'),
          snapshot => {
            if (snapshot.exists()) setUsageStats(snapshot.data() as UsageStats);
          },
          handleListenerError('metadata/usage')
        );

        const monthKey = dateKey.slice(0, 7);
        unsubscribeMonthlyUsage = onSnapshot(
          doc(db, 'metadata', `usage_${monthKey}`),
          snapshot => {
            if (snapshot.exists()) useStore.getState().setMonthlyUsageStats(snapshot.data() as UsageStats);
          },
          handleListenerError(`metadata/usage_${monthKey}`)
        );

        unsubscribeAttendance = onSnapshot(
          collection(db, 'attendance', dateKey, 'players'),
          snapshot => {
            if (attendanceDebounceRef.current) clearTimeout(attendanceDebounceRef.current);
            attendanceDebounceRef.current = setTimeout(async () => {
              try {
                const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
                const { sorted, isInconsistent } = await syncWorkerService.parseAttendance(docs);
                const activeMasterPlayers = useStore.getState().players;
                const activeSorted = sorted.filter(p => {
                  const master = activeMasterPlayers.find(m => m.id === p.id || (m.uid && m.uid === p.uid));
                  const status = master?.status || p.status || 'active';
                  const isDM = Boolean(master?.isDM || p.isDM || status === 'dm');
                  return (status === 'active' || status === 'guest') && !isDM;
                });
                setAttendance(activeSorted);
                throttleSyncTimestamp();
                if (isInconsistent) revalidateAttendanceSilently();
              } catch (e) {}
            }, 250);
          },
          handleListenerError(`attendance/${dateKey}/players`)
        );

        unsubscribeMatches = onSnapshot(
          collection(db, 'matches'),
          snapshot => {
            if (matchesDebounceRef.current) clearTimeout(matchesDebounceRef.current);
            matchesDebounceRef.current = setTimeout(async () => {
              try {
                const docs = snapshot.docs.map(d => ({
                  id: d.id,
                  data: { ...d.data(), timestamp: safeTimestamp(d.data().timestamp) }
                }));
                const { sorted } = await syncWorkerService.parseMatches(docs);
                setMatches(sorted);
                throttleSyncTimestamp();
                if (useStore.getState().players.length > 0) setIsInitialLoading(false);
              } catch (e) {}
            }, 300);
          },
          handleListenerError('matches')
        );

        unsubscribeSynergy = onSnapshot(
          doc(db, 'metadata', 'synergy'),
          s => {
            if (s.exists()) setSynergy(s.data());
          },
          handleListenerError('metadata/synergy')
        );
        unsubscribeNegativeSynergy = onSnapshot(
          doc(db, 'metadata', 'negative_synergy'),
          s => {
            if (s.exists()) setNegativeSynergy(s.data());
          },
          handleListenerError('metadata/negative_synergy')
        );
        unsubscribeRivalry = onSnapshot(
          doc(db, 'metadata', 'rivalry'),
          s => {
            if (s.exists()) setRivalry(s.data());
          },
          handleListenerError('metadata/rivalry')
        );

        unsubscribeTournaments = onSnapshot(
          collection(db, 'tournaments'),
          snapshot => {
            const list: Tournament[] = [];
            snapshot.forEach(d => list.push({ ...d.data(), id: d.id } as Tournament));
            setTournaments(list.sort((a, b) => b.date.localeCompare(a.date)));
          },
          handleListenerError('tournaments')
        );

        unsubscribeActiveTournament = onSnapshot(
          doc(db, 'metadata', 'activeTournament'),
          s => {
            setActiveTournament(s.exists() ? (s.data() as Tournament) : null);
          },
          handleListenerError('metadata/activeTournament')
        );

        financialTimer = setTimeout(() => {
          if (isQuotaExceeded) return;
          unsubscribePayments = onSnapshot(
            collection(db, 'payments'),
            snapshot => {
              const list: Payment[] = [];
              snapshot.forEach(d => list.push({ ...d.data(), id: d.id } as Payment));
              setPayments(list);
            },
            handleListenerError('payments')
          );

          unsubscribeExpenses = onSnapshot(
            collection(db, 'expenses'),
            snapshot => {
              const list: Expense[] = [];
              snapshot.forEach(d => list.push({ ...d.data(), id: d.id } as Expense));
              useStore.setState({ expenses: list });
            },
            handleListenerError('expenses')
          );

          if (userRole === 'ADMIN' && auth.currentUser) {
            unsubscribePending = onSnapshot(
              collection(db, 'pendingRequests'),
              snapshot => {
                const list: any[] = [];
                snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
                setPendingRequests(list);
              },
              handleListenerError('pendingRequests')
            );
          }
        }, 800);
      } catch (e) {}

      const syncTimer = setTimeout(() => {
        setIsBackgroundSyncing(false);
        setIsInitialLoading(false);
      }, 2000);

      return () => {
        clearTimeout(syncTimer);
        if (financialTimer) clearTimeout(financialTimer);
        if (attendanceDebounceRef.current) clearTimeout(attendanceDebounceRef.current);
        if (playersDebounceRef.current) clearTimeout(playersDebounceRef.current);
        if (matchesDebounceRef.current) clearTimeout(matchesDebounceRef.current);
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

    executeBatchFetch();

    let intervalMs: number | null = null;
    if (syncMode === 'interval_15s') intervalMs = 15000;
    else if (syncMode === 'interval_30s') intervalMs = 30000;
    else if (syncMode === 'interval_60s') intervalMs = 60000;
    else if (syncMode === 'interval_300s') intervalMs = 300000;

    const intervalId = intervalMs ? setInterval(() => executeBatchFetch(), intervalMs) : null;

    const handleFocus = () => {
      if (document.visibilityState === 'visible') executeBatchFetch();
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    syncMode,
    syncTrigger,
    user,
    userRole,
    executeBatchFetch,
    revalidateAttendanceSilently,
    setPlayers,
    setAttendance,
    setPendingRequests,
    setMatches,
    setSystemMetadata,
    setGenerationResult,
    setNextMatchPreview,
    setUsageStats,
    setPreConfirmations,
    setSynergy,
    setNegativeSynergy,
    setRivalry,
    setTournaments,
    setActiveTournament,
    setIsBackgroundSyncing,
    setIsInitialLoading,
    setPayments,
    setLastSyncTimestamp,
    setSyncError,
    setIdToCanonicalId,
    setCollectionSyncMeta,
    throttleSyncTimestamp
  ]);

  const commitBatchWithLog = useCallback(async (batch: any, _label: string, size: number) => {
    if (size > 30) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    await batch.commit();
  }, []);

  const hardSync = useCallback(async () => {
    if (isQuotaExceeded) return false;
    setIsBackgroundSyncing(true);
    try {
      const dateKey = getFirestoreDateKey();
      const targetThursdayKey = getNextThursday();

      const [, attendanceSnap, playersSnap, matchesSnap, preConfSnap] = await Promise.all([
        getDocFromServer(doc(db, 'metadata', 'intentions')),
        getDocsFromServer(collection(db, 'attendance', dateKey, 'players')),
        getDocsFromServer(collection(db, 'players')),
        getDocsFromServer(collection(db, 'matches')),
        getDocsFromServer(collection(db, 'preConfirmations', targetThursdayKey, 'players'))
      ]);

      const { sortedList, idToCanonical } = parsePlayersSnapshot(playersSnap);
      setPlayers(sortedList);
      setIdToCanonicalId(idToCanonical);

      const { sorted: sortedAttendance } = parseAttendanceSnapshot(attendanceSnap, sortedList);
      setAttendance(sortedAttendance);

      const matchesList: any[] = [];
      matchesSnap.forEach(d => matchesList.push({ id: d.id, ...d.data() }));
      setMatches(matchesList);

      const preConfList: Player[] = [];
      preConfSnap.forEach(d => {
        const data = d.data();
        if (isValidWeeklyConfirmationTimestamp(Number(data.timestamp || 0))) {
          preConfList.push({ ...data, id: d.id } as Player);
        }
      });
      setPreConfirmations(preConfList);

      if (useStore.getState().syncMode !== 'realtime') {
        useStore.setState(s => ({ syncTrigger: (s.syncTrigger || 0) + 1 }));
      }
      setLastSyncTimestamp(Date.now());
      return true;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markQuotaExceeded();
      }
      return false;
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [
    setPlayers,
    setIdToCanonicalId,
    setAttendance,
    setMatches,
    setPreConfirmations,
    setLastSyncTimestamp,
    setIsBackgroundSyncing
  ]);

  useEffect(() => {
    useStore.setState({ hardSync });
  }, [hardSync]);

  return {
    syncTrigger,
    syncMode,
    isInitialLoading,
    executeBatchFetch,
    revalidateAttendanceSilently,
    commitBatchWithLog,
    hardSync
  };
};