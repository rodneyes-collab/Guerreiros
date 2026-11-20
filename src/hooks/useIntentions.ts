import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  db,
  auth,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  handleFirestoreError,
  OperationType,
  getFirestoreDateKey,
  getNextThursday,
  isQuotaExceeded,
  isFirestoreQuotaError,
  markQuotaExceeded
} from '../../firebase';
import { IntentionsData, Player } from '../../types';
import { useStore } from '../../store';
import { purgeStaleLocalStorageIntentions } from '../utils/intentionsCleanup';

const DEFAULT_INTENTIONS: IntentionsData = {
  targetDate: '',
  automationEnabled: true,
  responses: {},
  confirmationTimestamps: {},
  remindersSent: {},
  lastUpdated: 0
};

export const getCycleFridayCutoffTimestamp = (targetThursdayStr?: string): number => {
  const thursdayStr =
    targetThursdayStr && /^\d{4}-\d{2}-\d{2}$/.test(targetThursdayStr)
      ? targetThursdayStr
      : getNextThursday();

  const thursdayMidnightBRT = new Date(`${thursdayStr}T00:00:00-03:00`).getTime();
  return thursdayMidnightBRT - 6 * 24 * 60 * 60 * 1000;
};

export const normalizeIntentionsData = (data: any): IntentionsData => {
  if (!data) return DEFAULT_INTENTIONS;
  const responses: Record<string, 'GOING' | 'NOT_GOING'> = {};
  const confirmationTimestamps: Record<string, number> = {};
  const remindersSent: Record<string, boolean> = {};

  if (data.responses && typeof data.responses === 'object') {
    Object.entries(data.responses).forEach(([k, val]) => {
      if (val === 'GOING' || val === 'NOT_GOING') {
        responses[k.trim()] = val;
      }
    });
  }

  if (data.confirmationTimestamps && typeof data.confirmationTimestamps === 'object') {
    Object.entries(data.confirmationTimestamps).forEach(([k, val]) => {
      const ts = Number(val);
      if (!isNaN(ts) && ts > 0) {
        confirmationTimestamps[k.trim()] = ts;
      }
    });
  }

  if (data.remindersSent && typeof data.remindersSent === 'object') {
    Object.entries(data.remindersSent).forEach(([k, val]) => {
      remindersSent[k.trim()] = Boolean(val);
    });
  }

  Object.keys(data).forEach(key => {
    if (key.startsWith('responses.')) {
      const pId = key.substring('responses.'.length).trim();
      const val = data[key];
      if (val === 'GOING' || val === 'NOT_GOING') {
        responses[pId] = val;
      }
    } else if (key.startsWith('confirmationTimestamps.')) {
      const pId = key.substring('confirmationTimestamps.'.length).trim();
      const val = Number(data[key]);
      if (!isNaN(val) && val > 0) {
        confirmationTimestamps[pId] = val;
      }
    } else if (key.startsWith('remindersSent.')) {
      const pId = key.substring('remindersSent.'.length).trim();
      remindersSent[pId] = Boolean(data[key]);
    }
  });

  return {
    targetDate: data.targetDate || '',
    automationEnabled: data.automationEnabled ?? true,
    responses,
    confirmationTimestamps,
    remindersSent,
    lastUpdated: data.lastUpdated || Date.now()
  };
};

const INTENTIONS_LOCK_KEY = 'guerreiros_last_processed_intentions_date';

export const updateIntentionsLock = (dateStr?: string) => {
  if (typeof window !== 'undefined' && window.localStorage && dateStr) {
    try {
      window.localStorage.setItem(INTENTIONS_LOCK_KEY, dateStr);
    } catch (e) {}
  }
};

export const getStoredIntentionsLock = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(INTENTIONS_LOCK_KEY);
    } catch (e) {
      return null;
    }
  }
  return null;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    if (auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (e) {}
  return headers;
}

export const useIntentions = () => {
  const [rawIntentions, setRawIntentions] = useState<IntentionsData>(DEFAULT_INTENTIONS);
  const [isLoaded, setIsLoaded] = useState(false);
  const players = useStore(state => state.players);
  const idToCanonicalId = useStore(state => state.idToCanonicalId);
  const viewMode = useStore(state => state.viewMode);
  const syncTrigger = useStore(state => state.syncTrigger);
  const preConfirmations = useStore(state => state.preConfirmations);

  const recentlyModifiedIdsRef = useRef<Record<string, number>>({});
  const lastOptimisticRef = useRef<{ data: IntentionsData; at: number } | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  const isRecentlyReset = useCallback((idOrAlias: string) => {
    const resetTime = recentlyModifiedIdsRef.current[idOrAlias];
    if (!resetTime) return false;
    if (Date.now() - resetTime < 12000) {
      return true;
    }
    delete recentlyModifiedIdsRef.current[idOrAlias];
    return false;
  }, []);

  useEffect(() => {
    purgeStaleLocalStorageIntentions(getNextThursday());
    // Auto-recuperação imediata caso o navegador esteja com cache/store zerado
    const st = useStore.getState();
    if (!st.players || st.players.length < 5) {
      fetch(`/api/bootstrap?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
        .then(r => (r.ok ? r.json() : null))
        .then(json => {
          if (!json || !json.success) return;
          const cur = useStore.getState();
          if (
            (!cur.players || cur.players.length < 5) &&
            Array.isArray(json.players) &&
            json.players.length >= 15 &&
            json.players.some((p: any) => Boolean(p?.birthDate))
          ) {
            cur.setPlayers(json.players);
          }
          if (
            (!cur.matches || cur.matches.length === 0) &&
            Array.isArray(json.matches) &&
            json.matches.length >= 5
          ) {
            cur.setMatches(json.matches);
          }
          if (json.intentions) {
            setRawIntentions(normalizeIntentionsData(json.intentions));
            setIsLoaded(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  const intentions = useMemo(() => {
    const todayStr = getFirestoreDateKey();
    const nextThu = getNextThursday();

    const isPastSession = Boolean(
      rawIntentions.targetDate && rawIntentions.targetDate < todayStr
    );
    if (isPastSession) {
      return {
        ...rawIntentions,
        targetDate: nextThu,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {}
      };
    }

    const activeTargetDate = rawIntentions.targetDate || nextThu;
    const cutoffTimestamp = getCycleFridayCutoffTimestamp(activeTargetDate);

    const responses = rawIntentions.responses || {};
    const timestamps = rawIntentions.confirmationTimestamps || {};

    const filteredResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
    const filteredTimestamps: Record<string, number> = {};

    Object.entries(responses).forEach(([id, val]) => {
      const cleanId = id.trim();
      const canonical = idToCanonicalId?.[cleanId] || idToCanonicalId?.[cleanId.toLowerCase()] || cleanId;
      if (isRecentlyReset(cleanId) || isRecentlyReset(canonical)) return;

      const ts = Number(timestamps[id] || timestamps[cleanId] || timestamps[canonical] || 0);
      const validTs = ts >= cutoffTimestamp ? ts : (rawIntentions.lastUpdated >= cutoffTimestamp ? rawIntentions.lastUpdated : 0);

      if (validTs >= cutoffTimestamp && (val === 'GOING' || val === 'NOT_GOING')) {
        filteredResponses[canonical] = val;
        filteredTimestamps[canonical] = validTs;
      }
    });

    const normText = (s?: string) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    if (players && players.length > 0) {
      players.forEach(p => {
        const uidKey = p.uid;
        const emailKey = p.email ? p.email.trim().toLowerCase() : undefined;
        const nameKey = normText(p.name);
        const cleanPhone = String(p.phone || '').replace(/\D/g, '');
        const phoneAlias = cleanPhone.length >= 8 ? `wa_${cleanPhone}` : undefined;
        const phoneAlias55 = cleanPhone.length >= 10 && !cleanPhone.startsWith('55') ? `wa_55${cleanPhone}` : undefined;

        if (
          isRecentlyReset(p.id) ||
          (uidKey && isRecentlyReset(uidKey)) ||
          (emailKey && isRecentlyReset(emailKey))
        ) {
          delete filteredResponses[p.id];
          delete filteredTimestamps[p.id];
          if (uidKey) {
            delete filteredResponses[uidKey];
            delete filteredTimestamps[uidKey];
          }
          if (emailKey) {
            delete filteredResponses[emailKey];
            delete filteredTimestamps[emailKey];
          }
          return;
        }

        const firstToken = nameKey.split(/[^a-z0-9]+/)[0];
        const compactName = nameKey.replace(/[^a-z0-9]+/g, '');
        const seedKey = firstToken ? `seed_${firstToken}` : undefined;
        const seedCompactKey = compactName ? `seed_${compactName}` : undefined;
        const candidateKeys = [
          p.id,
          uidKey,
          emailKey,
          nameKey,
          compactName || undefined,
          firstToken || undefined,
          seedKey,
          seedCompactKey,
          phoneAlias,
          phoneAlias55
        ].filter(Boolean) as string[];
        if (cleanPhone.length >= 8) {
          const last8 = cleanPhone.slice(-8);
          Object.keys(responses).forEach(rk => {
            if (rk.startsWith('wa_') && rk.slice(-8) === last8 && !candidateKeys.includes(rk)) {
              candidateKeys.push(rk);
            }
          });
        }

        let bestStatus: 'GOING' | 'NOT_GOING' | null = null;
        let latestDecisionTs = 0;
        let earliestGoingTs = Infinity;

        candidateKeys.forEach(k => {
          const st = filteredResponses[k] || responses[k];
          const kTs = Number(filteredTimestamps[k] || timestamps[k] || 0);
          if ((st === 'GOING' || st === 'NOT_GOING') && kTs >= cutoffTimestamp) {
            if (st === 'GOING' && kTs < earliestGoingTs) {
              earliestGoingTs = kTs;
            }
            if (!bestStatus || kTs > latestDecisionTs) {
              bestStatus = st;
              latestDecisionTs = kTs;
            }
          }
        });

        // Remove chaves de alias redundantes para evitar duplicidade ou falsos convidados
        candidateKeys.forEach(k => {
          if (k !== p.id) {
            delete filteredResponses[k];
            delete filteredTimestamps[k];
          }
        });

        const resolvedTs =
          bestStatus === 'GOING' && earliestGoingTs < Infinity
            ? earliestGoingTs
            : latestDecisionTs;

        if (bestStatus === 'GOING' && resolvedTs >= cutoffTimestamp) {
          filteredResponses[p.id] = 'GOING';
          filteredTimestamps[p.id] = resolvedTs;
        } else if (bestStatus === 'NOT_GOING' && resolvedTs >= cutoffTimestamp) {
          filteredResponses[p.id] = 'NOT_GOING';
          filteredTimestamps[p.id] = resolvedTs;
        } else {
          delete filteredResponses[p.id];
          delete filteredTimestamps[p.id];
        }
      });
    }

    // Espelhamento de preConfirmations somente se o sócio ainda não tiver resposta explícita (GOING ou NOT_GOING)
    if (Array.isArray(preConfirmations) && preConfirmations.length > 0) {
      preConfirmations.forEach(pc => {
        if (!pc || !pc.id) return;
        const canonical = idToCanonicalId?.[pc.id] || pc.id;
        if (isRecentlyReset(pc.id) || isRecentlyReset(canonical)) return;
        if (!filteredResponses[canonical]) {
          const pcTs = Number((pc as any).timestamp || 0);
          if (pcTs >= cutoffTimestamp) {
            filteredResponses[canonical] = 'GOING';
            filteredTimestamps[canonical] = pcTs;
          }
        }
      });
    }

    return {
      ...rawIntentions,
      targetDate: activeTargetDate,
      responses: filteredResponses,
      confirmationTimestamps: filteredTimestamps
    };
  }, [rawIntentions, players, idToCanonicalId, preConfirmations, isRecentlyReset]);

  useEffect(() => {
    const st = useStore.getState();
    if (st.players && st.players.length >= 10) {
      fetch('/api/cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: st.players,
          matches: st.matches || [],
          intentions
        })
      }).catch(() => {});
    }
  }, [intentions]);

  const getPlayerConfirmationTime = useCallback(
    (p: Player) => {
      const activeTargetDate = intentions.targetDate || getNextThursday();
      const cutoffTimestamp = getCycleFridayCutoffTimestamp(activeTargetDate);
      const tsMap = intentions.confirmationTimestamps || {};
      let ts = tsMap[p.id];

      if (!ts && p.uid && tsMap[p.uid]) ts = tsMap[p.uid];
      if (!ts && p.email && tsMap[p.email.toLowerCase()]) ts = tsMap[p.email.toLowerCase()];
      if (!ts && idToCanonicalId?.[p.id] && tsMap[idToCanonicalId[p.id]])
        ts = tsMap[idToCanonicalId[p.id]];

      return ts && ts >= cutoffTimestamp ? ts : 0;
    },
    [intentions.confirmationTimestamps, intentions.targetDate, idToCanonicalId]
  );

  const getAppUrl = useCallback(() => {
    const envUrl = import.meta.env.VITE_APP_URL;
    if (envUrl) return envUrl.replace(/\/$/, '');

    const PROD_URL = 'https://guerreiros-volleyball-club-238897290870.us-west1.run.app';
    const origin = window.location.origin;
    if (origin.includes('guerreiros-volleyball-club')) {
      return origin;
    }
    return PROD_URL;
  }, []);

  const _refreshIntentions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshTimeRef.current < 15000) {
      return rawIntentions;
    }
    lastRefreshTimeRef.current = now;

    let serverState: IntentionsData | null = null;
    let firestoreState: IntentionsData | null = null;

    try {
      const storeState = useStore.getState();
      const needsFullBootstrap =
        !storeState.players || storeState.players.length < 5 || !storeState.matches || storeState.matches.length === 0;
      const endpoint = needsFullBootstrap ? '/api/presence/state?includeFull=1' : '/api/presence/state';
      const resp = await fetch(endpoint);
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && json.data) {
          serverState = normalizeIntentionsData(json.data);
          // TRAVA DE REDUNDÂNCIA E INTEGRIDADE:
          // Só hidrata players/matches via servidor se a store local estiver zerada (< 5 sócios)
          // E o payload do servidor estiver 100% íntegro (>= 15 sócios com birthDate e matchesPlayed).
          if (
            (!storeState.players || storeState.players.length < 5) &&
            Array.isArray(json.players) &&
            json.players.length >= 15 &&
            json.players.some((p: any) => Boolean(p?.birthDate))
          ) {
            storeState.setPlayers(json.players);
          }
          if (
            (!storeState.matches || storeState.matches.length === 0) &&
            Array.isArray(json.matches) &&
            json.matches.length >= 5
          ) {
            storeState.setMatches(json.matches);
          }
        }
      }
    } catch (e) {}

    if (!isQuotaExceeded) {
      try {
        const snap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
        if (snap.exists()) {
          firestoreState = normalizeIntentionsData(snap.data());
        }
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
        } else {
          try {
            const snap = await getDoc(doc(db, 'metadata', 'intentions'));
            if (snap.exists()) {
              firestoreState = normalizeIntentionsData(snap.data());
            }
          } catch {}
        }
      }
    }

    const recentOpt =
      lastOptimisticRef.current && Date.now() - lastOptimisticRef.current.at < 45000
        ? lastOptimisticRef.current.data
        : null;

    if (serverState || firestoreState || recentOpt) {
      // Escolhe a fonte mais recente por lastUpdated para não ressuscitar sócios resetados/removidos
      const candidates = [serverState, firestoreState].filter(Boolean) as IntentionsData[];
      candidates.sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
      const authoritative = candidates[0] || recentOpt!;

      const merged: IntentionsData =
        recentOpt && Number(recentOpt.lastUpdated || 0) > Number(authoritative.lastUpdated || 0)
          ? {
              ...recentOpt,
              targetDate: recentOpt.targetDate || authoritative.targetDate || getNextThursday()
            }
          : {
              ...authoritative,
              targetDate: authoritative.targetDate || getNextThursday()
            };

      updateIntentionsLock(merged.targetDate);
      setRawIntentions(merged);
      setIsLoaded(true);
      return merged;
    }

    setIsLoaded(true);
    return recentOpt || serverState || firestoreState || DEFAULT_INTENTIONS;
  }, []);

  const refreshIntentions = useCallback(() => _refreshIntentions(true), [_refreshIntentions]);

  useEffect(() => {
    if (viewMode === 'intentions' || syncTrigger > 0) {
      _refreshIntentions(true).catch(() => {});
    }
  }, [_refreshIntentions, viewMode, syncTrigger]);

  useEffect(() => {
    // Firestore onSnapshot já mantém a lista sincronizada em tempo real.
    // Mantém apenas um fallback leve a cada 2 minutos quando a aba está visível e na tela de intenções.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && viewMode === 'intentions') {
        _refreshIntentions(false).catch(() => {});
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [_refreshIntentions, viewMode]);

    useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        _refreshIntentions(true).catch(() => {});
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [_refreshIntentions]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'metadata', 'intentions'),
      docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const todayStr = getFirestoreDateKey();
          const nextThu = getNextThursday();
          const normalized = normalizeIntentionsData(data);

          if (normalized.targetDate && normalized.targetDate < todayStr) {
            const rotatedEmpty: IntentionsData = {
              ...DEFAULT_INTENTIONS,
              targetDate: nextThu,
              automationEnabled: normalized.automationEnabled ?? true,
              lastUpdated: Date.now()
            };
            updateIntentionsLock(nextThu);
            setRawIntentions(rotatedEmpty);
            setIsLoaded(true);
            return;
          }

          if (normalized.targetDate) {
            updateIntentionsLock(normalized.targetDate);
          }

          const recentOpt =
            lastOptimisticRef.current && Date.now() - lastOptimisticRef.current.at < 8000
              ? lastOptimisticRef.current.data
              : null;

          if (!recentOpt || Number(normalized.lastUpdated || 0) >= Number(recentOpt.lastUpdated || 0)) {
            setRawIntentions(normalized);
          }
          setIsLoaded(true);
        } else {
          setIsLoaded(true);
        }
      },
      err => {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
        }
        _refreshIntentions(true).catch(() => {});
        setIsLoaded(true);
      }
    );
    return () => unsub();
  }, [_refreshIntentions]);

  const setIntent = async (playerId: string, status: 'GOING' | 'NOT_GOING' | 'RESET') => {
    const today = getFirestoreDateKey();
    const nextThu = getNextThursday();
    const currentStoredTarget = rawIntentions.targetDate;
    const isRotating = Boolean(currentStoredTarget && currentStoredTarget < today);
    const targetDate = !isRotating && currentStoredTarget ? currentStoredTarget : nextThu;

    const playerObjFound = (players || []).find(
      p =>
        p.id === playerId ||
        p.uid === playerId ||
        (p.email && p.email.toLowerCase() === playerId.toLowerCase())
    );
    const canonicalPlayerId = playerObjFound?.id || idToCanonicalId?.[playerId] || playerId;
    const aliasSet = new Set<string>([playerId, canonicalPlayerId]);
    if (playerObjFound) {
      if (playerObjFound.id) aliasSet.add(playerObjFound.id);
      if (playerObjFound.uid) aliasSet.add(playerObjFound.uid);
      if (playerObjFound.email) aliasSet.add(playerObjFound.email.trim().toLowerCase());
    }
    if (idToCanonicalId) {
      if (idToCanonicalId[playerId]) aliasSet.add(idToCanonicalId[playerId]);
      Object.entries(idToCanonicalId).forEach(([k, v]) => {
        if (v === playerId || v === canonicalPlayerId || aliasSet.has(v) || aliasSet.has(k)) {
          aliasSet.add(k);
          aliasSet.add(v);
        }
      });
    }

    const now = Date.now();
    const cutoffTimestamp = getCycleFridayCutoffTimestamp(targetDate);

    const existingTs = Number(
      rawIntentions.confirmationTimestamps?.[canonicalPlayerId] ||
        rawIntentions.confirmationTimestamps?.[playerId] ||
        0
    );
    const alreadyGoing =
      !isRotating &&
      (rawIntentions.responses?.[canonicalPlayerId] === 'GOING' ||
        rawIntentions.responses?.[playerId] === 'GOING') &&
      existingTs >= cutoffTimestamp;
    const effectiveTs = status === 'GOING' && alreadyGoing ? existingTs : now;

    if (status === 'RESET' || status === 'NOT_GOING') {
      aliasSet.forEach(alias => {
        recentlyModifiedIdsRef.current[alias] = now;
      });
    } else if (status === 'GOING') {
      aliasSet.forEach(alias => {
        delete recentlyModifiedIdsRef.current[alias];
      });
    }

    const previousRaw = rawIntentions;
    const nextResponses = isRotating ? {} : { ...rawIntentions.responses };
    const nextTimestamps = isRotating ? {} : { ...rawIntentions.confirmationTimestamps };

    aliasSet.forEach(alias => {
      delete nextResponses[alias];
      delete nextTimestamps[alias];
    });

    if (status !== 'RESET') {
      aliasSet.forEach(alias => {
        nextResponses[alias] = status;
        nextTimestamps[alias] = effectiveTs;
      });
    }

    const optimisticNext: IntentionsData = {
      ...rawIntentions,
      targetDate,
      responses: nextResponses,
      confirmationTimestamps: nextTimestamps,
      lastUpdated: now
    };

    lastOptimisticRef.current = { data: optimisticNext, at: now };
    setRawIntentions(optimisticNext);
    updateIntentionsLock(targetDate);

    const currentStore = useStore.getState();
    const currentAuthUser = currentStore.user;
    const currentPlayerProfile = currentStore.currentPlayer;
    const simpleEmail =
      typeof window !== 'undefined' ? window.localStorage.getItem('simpleLoginEmail')?.trim() : null;
    const effectiveEmail =
      currentAuthUser?.email || currentPlayerProfile?.email || simpleEmail || null;

    try {
      const headers = await getAuthHeaders();
      const apiResp = await fetch('/api/presence/set', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          playerId: canonicalPlayerId,
          status,
          uid: currentAuthUser?.uid || currentPlayerProfile?.uid || null,
          userEmail: effectiveEmail,
          isAdmin: currentStore.userRole === 'ADMIN'
        })
      });

      if (apiResp.ok) {
        const json = await apiResp.json();
        if (json.data) {
          const normalizedServer = normalizeIntentionsData(json.data);
          const mergedWithOpt: IntentionsData = {
            ...normalizedServer,
            responses: {
              ...(normalizedServer.responses || {}),
              ...(optimisticNext.responses || {})
            },
            confirmationTimestamps: {
              ...(normalizedServer.confirmationTimestamps || {}),
              ...(optimisticNext.confirmationTimestamps || {})
            },
            lastUpdated: Math.max(normalizedServer.lastUpdated || 0, now)
          };
          lastOptimisticRef.current = { data: mergedWithOpt, at: Date.now() };
          setRawIntentions(mergedWithOpt);
        }
        return;
      }
    } catch (apiErr) {
      console.warn('[setIntent] Fallback para escrita direta Firestore:', apiErr);
    }

    try {
      const intentionsRef = doc(db, 'metadata', 'intentions');
      await setDoc(intentionsRef, {
        targetDate,
        automationEnabled: rawIntentions.automationEnabled ?? true,
        responses: nextResponses,
        confirmationTimestamps: nextTimestamps,
        remindersSent: rawIntentions.remindersSent || {},
        lastUpdated: now
      });
    } catch (err: any) {
      setRawIntentions(previousRaw);
      throw err;
    }
  };

  const resetIntent = async (playerId: string) => {
    await setIntent(playerId, 'RESET');
  };

  const toggleAutomation = async (enabled: boolean) => {
    try {
      await setDoc(doc(db, 'metadata', 'intentions'), { automationEnabled: enabled }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'metadata/intentions');
    }
  };

  const clearIntentions = async () => {
    try {
      const nextThu = getNextThursday();
      const now = Date.now();
      const clearedState: IntentionsData = {
        targetDate: nextThu,
        automationEnabled: rawIntentions.automationEnabled ?? true,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {},
        lastUpdated: now
      };

      setRawIntentions(clearedState);
      purgeStaleLocalStorageIntentions(nextThu);

      const headers = await getAuthHeaders();
      const currentStore = useStore.getState();
      await fetch('/api/presence/clear', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uid: currentStore.user?.uid || null,
          userEmail: currentStore.user?.email || null,
          isAdmin: currentStore.userRole === 'ADMIN'
        })
      });
      setDoc(doc(db, 'metadata', 'intentions'), clearedState).catch(() => {});
    } catch (err) {
      console.error('Erro ao limpar intenções:', err);
    }
  };

  const sendReminders = useCallback(
    async (customMessage?: string) => {
      try {
        const headers = await getAuthHeaders();
        const resp = await fetch('/api/whatsapp/remind-undecided', {
          method: 'POST',
          headers,
          body: JSON.stringify({ customMessage })
        });
        if (resp.ok) {
          const data = await resp.json();
          await _refreshIntentions(true);
          return Number(data.count || data.totalUndecided || 0);
        }
        return 0;
      } catch (err) {
        console.error('Erro ao enviar lembretes via WhatsApp:', err);
        return 0;
      }
    },
    [_refreshIntentions]
  );

  const buildWhatsAppListText = (customGoingPlayers?: Player[]) => {
    let goingPlayers: Player[] = [];

    if (customGoingPlayers && customGoingPlayers.length > 0) {
      goingPlayers = customGoingPlayers;
    } else {
      goingPlayers = (players || [])
        .filter(p => intentions.responses[p.id] === 'GOING')
        .sort((a, b) => getPlayerConfirmationTime(a) - getPlayerConfirmationTime(b));
    }

    const totalActiveClub = (players || []).filter(p => p.status === 'active' && !p.isDM).length;
    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }

    let text = `Bora pra lista mais esperada da semana !!! 🏐🔥\n\n`;
    text += `Guerreiro(a), vamos jogar quinta-feira dia ${dateStr}? Não perca, vai ser massa...\n\n`;
    text += `*Guerreiros confirmados:*\n\n`;

    if (goingPlayers.length === 0) {
      text += 'Nenhum sócio confirmado ainda.';
    } else {
      goingPlayers.forEach((p, index) => {
        const isGuest = p.status === 'guest';
        const isSetter = p.isOfficialSetter ? ' *(L)*' : '';
        text += `${index + 1}. ${p.name}${isSetter}${isGuest ? ' (Convidado)' : ''}\n`;
      });
      text += `\n✅ *Total:* ${goingPlayers.length}/${totalActiveClub} confirmados`;
    }

    text +=
      `\n\n───────────────────\n` +
      `📱 *Confirme pelo App:*\n${getAppUrl()}?tab=intentions\n\n` +
      `🤖 *Ou confirme em 1 clique com o Guerreirinho no WhatsApp:*\n` +
      `🟢 *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n` +
      `🔴 *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou`;

    return text;
  };

  const copyToWhatsApp = (customGoingPlayers?: Player[]) => {
    const text = buildWhatsAppListText(customGoingPlayers);
    navigator.clipboard.writeText(text);
    return true;
  };

  const sendListToWhatsAppGroup = async (customGoingPlayers?: Player[]): Promise<boolean> => {
    try {
      const text = buildWhatsAppListText(customGoingPlayers);
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/whatsapp/broadcast-intentions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          targetDate: intentions.targetDate || getNextThursday(),
          goingCount: customGoingPlayers?.length ?? Object.values(intentions.responses || {}).filter(v => v === 'GOING').length
        })
      });
      if (!resp.ok) return false;
      const data = await resp.json().catch(() => ({}));
      return Boolean(data?.success !== false);
    } catch (err) {
      console.error('Erro ao enviar lista para o grupo do WhatsApp:', err);
      return false;
    }
  };

  const copyReminder = () => {
    const appLink = `${getAppUrl()}?tab=intentions`;
    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }
    const text =
      `Bora pra lista mais esperada da semana !!! 🏐🔥\n\n` +
      `Guerreiro(a), vamos jogar quinta-feira dia ${dateStr}? Não perca, vai ser massa...\n\n` +
      `📱 *Confirme direto no App:*\n${appLink}\n\n` +
      `🤖 *Ou confirme em 1 clique com o Guerreirinho no WhatsApp:*\n` +
      `🟢 *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n` +
      `🔴 *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou`;
    navigator.clipboard.writeText(text);
    return true;
  };

  return {
    intentions,
    isLoaded,
    setIntent,
    resetIntent,
    clearIntentions,
    toggleAutomation,
    sendReminders,
    copyToWhatsApp,
    sendListToWhatsAppGroup,
    copyReminder,
    getPlayerConfirmationTime,
    refreshIntentions,
    forceSyncIntentions: refreshIntentions,
    stabilizeIntentions: async () => {
      try {
        const headers = await getAuthHeaders();
        const resp = await fetch('/api/intentions/stabilize', {
          method: 'POST',
          headers,
          body: JSON.stringify({ targetDate: intentions.targetDate || getNextThursday() })
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json?.success && json?.data) {
            const norm = normalizeIntentionsData(json.data);
            lastOptimisticRef.current = { data: norm, at: Date.now() };
            setRawIntentions(norm);
          }
        }
      } catch {}
      return _refreshIntentions(true);
    }
  };
};
