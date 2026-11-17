import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  db,
  auth,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  writeBatch,
  collection,
  serverTimestamp,
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
  }, []);

  // Fonte Única da Verdade: unifica metadata/intentions + preConfirmations
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

    // Cruza também com preConfirmations sincronizados pelo FirestoreSync
    if (Array.isArray(preConfirmations) && preConfirmations.length > 0) {
      preConfirmations.forEach(pc => {
        if (!pc || !pc.id) return;
        const canonical = idToCanonicalId?.[pc.id] || pc.id;
        if (isRecentlyReset(pc.id) || isRecentlyReset(canonical)) return;
        if (!filteredResponses[canonical]) {
          const pcTs = Number((pc as any).timestamp || Date.now());
          if (pcTs >= cutoffTimestamp) {
            filteredResponses[canonical] = 'GOING';
            filteredTimestamps[canonical] = pcTs;
          }
        }
      });
    }

    if (players && players.length > 0) {
      players.forEach(p => {
        const uidKey = p.uid;
        const emailKey = p.email ? p.email.trim().toLowerCase() : undefined;

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

        const isGoing =
          filteredResponses[p.id] === 'GOING' ||
          Boolean(uidKey && filteredResponses[uidKey] === 'GOING') ||
          Boolean(emailKey && filteredResponses[emailKey] === 'GOING') ||
          Boolean(responses[p.id] === 'GOING') ||
          Boolean(uidKey && responses[uidKey] === 'GOING') ||
          Boolean(emailKey && responses[emailKey] === 'GOING');

        const isNotGoing =
          !isGoing &&
          (filteredResponses[p.id] === 'NOT_GOING' ||
            Boolean(uidKey && filteredResponses[uidKey] === 'NOT_GOING') ||
            Boolean(emailKey && filteredResponses[emailKey] === 'NOT_GOING') ||
            Boolean(responses[p.id] === 'NOT_GOING') ||
            Boolean(uidKey && responses[uidKey] === 'NOT_GOING') ||
            Boolean(emailKey && responses[emailKey] === 'NOT_GOING'));

        const ts =
          filteredTimestamps[p.id] ||
          (uidKey ? filteredTimestamps[uidKey] : 0) ||
          (emailKey ? filteredTimestamps[emailKey] : 0) ||
          timestamps[p.id] ||
          (uidKey ? timestamps[uidKey] : 0) ||
          (emailKey ? timestamps[emailKey] : 0) ||
          0;

        if (isGoing && ts >= cutoffTimestamp) {
          filteredResponses[p.id] = 'GOING';
          filteredTimestamps[p.id] = ts;
        } else if (isNotGoing && ts >= cutoffTimestamp) {
          filteredResponses[p.id] = 'NOT_GOING';
          filteredTimestamps[p.id] = ts;
        } else {
          delete filteredResponses[p.id];
          delete filteredTimestamps[p.id];
        }

        if (uidKey && uidKey !== p.id) {
          delete filteredResponses[uidKey];
          delete filteredTimestamps[uidKey];
        }
        if (emailKey && emailKey !== p.id) {
          delete filteredResponses[emailKey];
          delete filteredTimestamps[emailKey];
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
    if (isQuotaExceeded) return DEFAULT_INTENTIONS;
    const now = Date.now();
    if (!force && now - lastRefreshTimeRef.current < 60000) {
      return DEFAULT_INTENTIONS;
    }
    lastRefreshTimeRef.current = now;

    try {
      const resp = await fetch(`/api/presence/state?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && json.data) {
          const normalized = normalizeIntentionsData(json.data);
          updateIntentionsLock(normalized.targetDate);
          setRawIntentions(normalized);
          setIsLoaded(true);
          return normalized;
        }
      }
    } catch (e) {}

    if (isQuotaExceeded) return DEFAULT_INTENTIONS;

    try {
      const snap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
      if (snap.exists()) {
        const normalized = normalizeIntentionsData(snap.data());
        updateIntentionsLock(normalized.targetDate);
        setRawIntentions(normalized);
        setIsLoaded(true);
        return normalized;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markQuotaExceeded();
        return DEFAULT_INTENTIONS;
      }
      try {
        const snap = await getDoc(doc(db, 'metadata', 'intentions'));
        if (snap.exists()) {
          const normalized = normalizeIntentionsData(snap.data());
          updateIntentionsLock(normalized.targetDate);
          setRawIntentions(normalized);
          setIsLoaded(true);
          return normalized;
        }
      } catch (fallbackErr) {
        if (isFirestoreQuotaError(fallbackErr)) {
          markQuotaExceeded();
        }
      }
    }
    return DEFAULT_INTENTIONS;
  }, []);

  const refreshIntentions = useCallback(() => _refreshIntentions(true), [_refreshIntentions]);

  // Atualiza ao montar, ao mudar para a aba 'intentions', ao disparar syncTrigger ou focar o app
  useEffect(() => {
    if (viewMode === 'intentions' || syncTrigger > 0) {
      _refreshIntentions(syncTrigger > 0).catch(() => {});
    }
  }, [_refreshIntentions, viewMode, syncTrigger]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isQuotaExceeded) {
        _refreshIntentions(false).catch(() => {});
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

          const cutoffTimestamp = getCycleFridayCutoffTimestamp(normalized.targetDate || nextThu);

          Object.keys(normalized.responses || {}).forEach(k => {
            const ts = Number(normalized.confirmationTimestamps?.[k] || normalized.lastUpdated || 0);
            if (isRecentlyReset(k) || ts < cutoffTimestamp) {
              delete normalized.responses[k];
              delete normalized.confirmationTimestamps?.[k];
            }
          });

          setRawIntentions(normalized);
        }
        setIsLoaded(true);
      },
      err => {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
          setIsLoaded(true);
          return;
        }
        console.error('useIntentions: Error in intentions snapshot:', err);
        setIsLoaded(true);
      }
    );
    return () => unsub();
  }, [isRecentlyReset]);

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
          setRawIntentions(normalizeIntentionsData(json.data));
        }
        return;
      }
    } catch (apiErr) {
      console.warn('[setIntent] Fallback para escrita direta Firestore:', apiErr);
    }

    try {
      // Escreve mapas aninhados limpos (sem usar updateDoc com chaves ponto que quebram e-mails)
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
        const batch = writeBatch(db);
        let count = 0;

        const currentStore = useStore.getState();
        const currentAttendance = currentStore.attendance;
        const currentIntentions = intentions;

        const intentionsDocRef = doc(db, 'metadata', 'intentions');
        const updatedRemindersSent: Record<string, boolean> = { ...(rawIntentions.remindersSent || {}) };

        players.forEach(player => {
          const isAlreadyInAttendance = currentAttendance.some(a => a.id === player.id);
          const hasResponded =
            currentIntentions.responses[player.id] === 'GOING' ||
            currentIntentions.responses[player.id] === 'NOT_GOING';

          if (player.status === 'active' && !player.isDM && !hasResponded && !isAlreadyInAttendance) {
            const appLink = `${getAppUrl()}?tab=intentions`;
            updatedRemindersSent[player.id] = true;

            const appNotifRef = doc(collection(db, 'notifications'));
            const tDate = currentIntentions.targetDate;
            let dateStr = 'xx/xx';
            if (tDate) {
              const [, m, d] = tDate.split('-').map(Number);
              dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
            }

            batch.set(appNotifRef, {
              playerId: player.id,
              playerUid: player.uid || null,
              title: 'Aviso de Presença',
              message:
                customMessage ||
                `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n[Clique aqui para confirmar](${appLink}) ou no grupo de WhatsApp.`,
              createdAt: Date.now(),
              read: false,
              type: 'reminder'
            });

            if (player.fcmToken) {
              const notifRef = doc(collection(db, 'fcm_messages'));
              batch.set(notifRef, {
                token: player.fcmToken,
                notification: {
                  title: 'Aviso de Presença',
                  body:
                    customMessage ||
                    `Bora pra lista mais esperada da semana !!! Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa... Confirme no app: ${appLink}`,
                  sound: 'default'
                },
                data: {
                  unreadCount: '1',
                  type: 'reminder'
                },
                createdAt: serverTimestamp()
              });
            }
            count++;
          }
        });

        if (count > 0) {
          batch.set(intentionsDocRef, { remindersSent: updatedRemindersSent }, { merge: true });
          await batch.commit();
          setRawIntentions(prev => ({
            ...prev,
            remindersSent: updatedRemindersSent
          }));
        }
        return count;
      } catch (err) {
        console.error('Erro ao enviar lembretes:', err);
        return 0;
      }
    },
    [players, intentions, rawIntentions.remindersSent, getAppUrl]
  );

  const copyToWhatsApp = (customGoingPlayers?: Player[]) => {
    let goingPlayers: Player[] = [];

    if (customGoingPlayers && customGoingPlayers.length > 0) {
      goingPlayers = customGoingPlayers;
    } else {
      goingPlayers = (players || [])
        .filter(p => intentions.responses[p.id] === 'GOING')
        .sort((a, b) => getPlayerConfirmationTime(a) - getPlayerConfirmationTime(b));
    }

    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }

    let text = `Bora pra lista mais esperada da semana !!!\n\n`;
    text += `Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n`;
    text += `*Guerreiros confirmados*\n\n`;

    if (goingPlayers.length === 0) {
      text += 'Nenhum sócio confirmado ainda.';
    } else {
      goingPlayers.forEach((p, index) => {
        const isGuest = p.status === 'guest';
        text += `${index + 1} . ${p.name}${isGuest ? ' ( Convidado)' : ''}\n`;
      });
      text += `\nTotal: ${goingPlayers.length} confirmados`;
    }

    text += `\n\nConfirme sua presença no app: ${getAppUrl()}?tab=intentions ou no grupo do WhatsApp!`;
    navigator.clipboard.writeText(text);
    return true;
  };

  const copyReminder = () => {
    const appLink = `${getAppUrl()}?tab=intentions`;
    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }
    const text = `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\nConfirme a sua presença direto no app: ${appLink} ou no grupo do WhatsApp.`;
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
    copyReminder,
    getPlayerConfirmationTime,
    refreshIntentions,
    forceSyncIntentions: refreshIntentions
  };
};