import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, doc, getDoc, getDocFromServer, onSnapshot, setDoc, updateDoc, writeBatch, collection, serverTimestamp, handleFirestoreError, OperationType, getDocs, getDocsFromServer, query, where, deleteDoc, deleteField, getFirestoreDateKey, getBrazilDay, trackAccess, getNextThursday } from '../../firebase';
import { IntentionsData, Player } from '../../types';
import { useStore } from '../../store';
import {
  getWeeklyCutoffTimestamp,
  isValidWeeklyConfirmationTimestamp,
  purgeStaleLocalStorageIntentions,
  runAdminIntentionsCleanupOnLoad
} from '../utils/intentionsCleanup';

let adminCleanupExecutedThisSession = false;

const DEFAULT_INTENTIONS: IntentionsData = {
  targetDate: '',
  automationEnabled: true,
  responses: {},
  confirmationTimestamps: {},
  remindersSent: {},
  lastUpdated: 0
};

export const normalizeIntentionsData = (data: any): IntentionsData => {
  if (!data) return DEFAULT_INTENTIONS;
  const responses: Record<string, 'GOING' | 'NOT_GOING'> = { ...(data.responses || {}) };
  const confirmationTimestamps: Record<string, number> = { ...(data.confirmationTimestamps || {}) };
  const remindersSent: Record<string, boolean> = { ...(data.remindersSent || {}) };

  // Parse any flat dot-notation keys that might exist
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

/**
 * Utilitário de Retry com Exponential Backoff para operações assíncronas do Firestore.
 * Registra logs de diagnóstico sempre que a operação for iniciada, repetida ou finalizada.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  opName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 300,
  timeoutMs: number = 15000
): Promise<T> {
  let attempt = 0;
  while (true) {
    let timeoutHandle: any;
    try {
      console.info(`[Sync Diagnóstico] [${opName}] Iniciando operação (tentativa ${attempt + 1}/${maxRetries})...`);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Timeout de conexão na operação ${opName}`)), timeoutMs);
      });
      const result = await Promise.race([operation(), timeoutPromise]);
      clearTimeout(timeoutHandle);
      console.info(`[Sync Diagnóstico] [${opName}] Operação finalizada com sucesso na tentativa ${attempt + 1}.`);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle);
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[Sync Diagnóstico] [${opName}] Falha permanente após ${maxRetries} tentativas:`, error);
        throw error;
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Sync Diagnóstico] [${opName}] Falha na tentativa ${attempt}. Repetindo em ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const INTENTIONS_LOCK_KEY = 'guerreiros_last_processed_intentions_date';

export const updateIntentionsLock = (dateStr?: string) => {
  if (typeof window !== 'undefined' && window.localStorage && dateStr) {
    try {
      window.localStorage.setItem(INTENTIONS_LOCK_KEY, dateStr);
      console.info(`[Intentions Lock] Lock atualizado no localStorage: "${dateStr}"`);
    } catch (e) {
      console.warn('[Intentions Lock] Erro ao gravar lock no localStorage:', e);
    }
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

export const useIntentions = (commitBatchWithLog?: (batch: any, label: string, size: number) => Promise<void>) => {
  const [rawIntentions, setRawIntentions] = useState<IntentionsData>(DEFAULT_INTENTIONS);
  const [isLoaded, setIsLoaded] = useState(false);
  const players = useStore(state => state.players);
  const userRole = useStore(state => state.userRole);
  const user = useStore(state => state.user);
  const currentPlayer = useStore(state => state.currentPlayer);
  const idToCanonicalId = useStore(state => state.idToCanonicalId);
  const preConfirmations = useStore(state => state.preConfirmations);
  const sendingRef = useRef<Record<string, boolean>>({});

  // Limpa chaves locais obsoletas ao montar o hook em qualquer dispositivo (especialmente mobile PWA)
  useEffect(() => {
    purgeStaleLocalStorageIntentions(getNextThursday());
  }, []);

  // Memoized filtered intentions based on current players in store and strict weekly/7-day cutoff
  const intentions = useMemo(() => {
    const responses = rawIntentions.responses || {};
    const timestamps = rawIntentions.confirmationTimestamps || {};
    
    // Validação de Sessão: Se o targetDate for do passado em relação a hoje, ignoramos as respostas antigas
    const todayStr = getFirestoreDateKey();
    const isPastSession = rawIntentions.targetDate && rawIntentions.targetDate < todayStr;
    if (isPastSession) {
      return {
        ...rawIntentions,
        responses: {},
        confirmationTimestamps: {}
      };
    }

    // Filtro Semanal Estrito: Descartar estritamente todos os registros com timestamp anterior à data da semana corrente (Segunda-feira 00:00 BRT / 7 Dias)
    const { cutoffTimestamp, mondayTimestamp } = getWeeklyCutoffTimestamp();

    const preConfTsMap: Record<string, number> = {};
    (preConfirmations || []).forEach(pc => {
      if (pc && pc.id && pc.timestamp && pc.timestamp >= cutoffTimestamp) {
        preConfTsMap[pc.id] = pc.timestamp;
      }
    });

    const filteredResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
    const filteredTimestamps: Record<string, number> = {};

    Object.entries(responses).forEach(([id, val]) => {
      const canonical = idToCanonicalId?.[id] || id;
      const ts = Number(timestamps[id] || timestamps[canonical] || preConfTsMap[id] || preConfTsMap[canonical] || 0);

      // Descarte estrito: Somente confirmações com timestamp igual ou posterior ao limite da semana corrente (>= cutoffTimestamp)
      if (ts >= cutoffTimestamp && (val === 'GOING' || val === 'NOT_GOING')) {
        filteredResponses[canonical] = val;
        filteredTimestamps[canonical] = ts;
      }
    });
    
    // 1. Map canonical aliases bidirectionally so confirmation is accessible under both original and canonical ID
    Object.entries({ ...filteredResponses }).forEach(([id, val]) => {
      const canonicalId = idToCanonicalId?.[id];
      if (canonicalId && canonicalId !== id) {
        const currentVal = filteredResponses[canonicalId];
        const currentTs = filteredTimestamps[canonicalId] || 0;
        const newTs = filteredTimestamps[id] || 0;
        
        if (!currentVal || val === 'GOING') {
          filteredResponses[canonicalId] = val;
          const combinedTs = (currentTs > 0 && newTs > 0) 
            ? Math.min(currentTs, newTs) 
            : (currentTs || newTs);
          
          if (combinedTs >= cutoffTimestamp) {
            filteredTimestamps[canonicalId] = combinedTs;
          } else {
            delete filteredResponses[canonicalId];
            delete filteredTimestamps[canonicalId];
          }
        }
      }
    });

    // 2. Unify and map responses strictly to the player's canonical ID (p.id) and discard any outdated entries
    if (players && players.length > 0) {
      players.forEach(p => {
        const uidKey = p.uid;
        const emailKey = p.email ? p.email.trim().toLowerCase() : undefined;
        
        const isGoing = filteredResponses[p.id] === 'GOING' || 
                        Boolean(uidKey && filteredResponses[uidKey] === 'GOING') ||
                        Boolean(emailKey && filteredResponses[emailKey] === 'GOING');
        const isNotGoing = !isGoing && (
          filteredResponses[p.id] === 'NOT_GOING' ||
          Boolean(uidKey && filteredResponses[uidKey] === 'NOT_GOING') ||
          Boolean(emailKey && filteredResponses[emailKey] === 'NOT_GOING')
        );
        const ts = filteredTimestamps[p.id] || 
                   (uidKey ? filteredTimestamps[uidKey] : 0) || 
                   (emailKey ? filteredTimestamps[emailKey] : 0) || 0;

        // Descarte estrito de qualquer confirmação com timestamp anterior ao limite da semana corrente
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

        // Limpeza de chaves de alias redundantes (UID ou email)
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
      responses: filteredResponses,
      confirmationTimestamps: filteredTimestamps
    };
  }, [rawIntentions, players, idToCanonicalId, preConfirmations]);

  const getPlayerConfirmationTime = useCallback((p: Player) => {
    const tsMap = intentions.confirmationTimestamps || {};
    let ts = tsMap[p.id];

    if (!ts && p.uid && tsMap[p.uid]) ts = tsMap[p.uid];
    if (!ts && p.email && tsMap[p.email.toLowerCase()]) ts = tsMap[p.email.toLowerCase()];
    if (!ts && idToCanonicalId?.[p.id] && tsMap[idToCanonicalId[p.id]]) ts = tsMap[idToCanonicalId[p.id]];
    
    if (!ts && idToCanonicalId) {
      const canonicalId = idToCanonicalId[p.id];
      if (canonicalId && tsMap[canonicalId]) ts = tsMap[canonicalId];
    }

    return isValidWeeklyConfirmationTimestamp(ts) ? ts : 0;
  }, [intentions.confirmationTimestamps, idToCanonicalId]);

  // Helper to get the correct app URL (Shared vs Dev)
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

  const _refreshIntentions = useCallback(async () => {
    console.info('[Sync Diagnóstico] [_refreshIntentions] Iniciando sincronização direta com o servidor Firestore...');
    try {
      const { cutoffTimestamp } = getWeeklyCutoffTimestamp();

      // 1. Obter metadata/intentions diretamente do servidor (bypass de cache IndexedDB)
      const snap = await executeWithRetry(async () => {
        try {
          return await getDocFromServer(doc(db, 'metadata', 'intentions'));
        } catch {
          return await getDoc(doc(db, 'metadata', 'intentions'));
        }
      }, 'Leitura metadata/intentions (Server)');

      let masterTarget = getNextThursday();
      let normalized = DEFAULT_INTENTIONS;
      
      if (snap.exists()) {
        normalized = normalizeIntentionsData(snap.data());
        const todayStr = getFirestoreDateKey();
        if (normalized.targetDate && normalized.targetDate >= todayStr) {
          masterTarget = normalized.targetDate;
        }
      }

      // 2. Buscar preConfirmations/{masterTarget}/players diretamente no servidor
      const preConfSnap = await executeWithRetry(
        async () => {
          try {
            return await getDocsFromServer(collection(db, 'preConfirmations', masterTarget, 'players'));
          } catch {
            return await getDocs(collection(db, 'preConfirmations', masterTarget, 'players'));
          }
        },
        `Leitura preConfirmations/${masterTarget} (Server)`
      );

      const mergedResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
      const mergedTimestamps: Record<string, number> = {};
      let discrepanciesCount = 0;

      // Filtrar respostas do metadata/intentions mantendo apenas as que pertencem a esta semana (>= cutoffTimestamp)
      Object.entries(normalized.responses || {}).forEach(([rawId, status]) => {
        const canonicalId = idToCanonicalId?.[rawId] || rawId;
        const ts = Number(normalized.confirmationTimestamps?.[rawId] || normalized.confirmationTimestamps?.[canonicalId] || 0);
        if (ts >= cutoffTimestamp && (status === 'GOING' || status === 'NOT_GOING')) {
          mergedResponses[canonicalId] = status;
          mergedTimestamps[canonicalId] = mergedTimestamps[canonicalId]
            ? Math.min(mergedTimestamps[canonicalId], ts)
            : ts;
          if (rawId !== canonicalId) discrepanciesCount++;
        } else {
          // Entrada antiga (> 7 dias ou semana passada) descartada
          discrepanciesCount++;
        }
      });

      const preConfList: Player[] = [];
      const stalePreConfIdsToDelete: string[] = [];

      preConfSnap.forEach(d => {
        const pData = d.data();
        const rawId = d.id;
        const canonicalId = idToCanonicalId?.[rawId] || rawId;
        const pcTs = pData.timestamp ? Number(pData.timestamp) : 0;
        const currentTs = mergedTimestamps[canonicalId] || 0;
        const effectiveTs = pcTs > 0 ? pcTs : currentTs;

        // Somente aceitar preConfirmations desta semana e <= 7 dias
        if (!effectiveTs || effectiveTs < cutoffTimestamp) {
          stalePreConfIdsToDelete.push(rawId);
          discrepanciesCount++;
          return;
        }

        const matchedPlayer = (players || []).find(p => p.id === canonicalId);
        preConfList.push({
          ...(matchedPlayer || (pData as Player)),
          id: canonicalId,
          timestamp: effectiveTs
        } as Player);

        if (mergedResponses[canonicalId] !== 'GOING') {
          mergedResponses[canonicalId] = 'GOING';
          discrepanciesCount++;
        }

        if (!mergedTimestamps[canonicalId] || effectiveTs < mergedTimestamps[canonicalId]) {
          mergedTimestamps[canonicalId] = effectiveTs;
          discrepanciesCount++;
        }
      });

      // Verificar atletas em metadata/intentions marcados como GOING nesta semana que estejam ausentes em preConfirmations
      const missingInPreConf: string[] = [];
      Object.entries(mergedResponses).forEach(([pId, status]) => {
        if (status === 'GOING' && mergedTimestamps[pId] >= cutoffTimestamp && !preConfList.some(p => p.id === pId)) {
          missingInPreConf.push(pId);
        }
      });

      // Persistir limpeza/reconciliação no Firestore caso detectada discrepância
      const isAdminUser = userRole === 'ADMIN' || Boolean(currentPlayer?.isAdmin) || (user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com');
      if (isAdminUser && (discrepanciesCount > 0 || missingInPreConf.length > 0 || stalePreConfIdsToDelete.length > 0)) {
        try {
          await executeWithRetry(async () => {
            const batch = writeBatch(db);
            batch.set(doc(db, 'metadata', 'intentions'), {
              targetDate: masterTarget,
              automationEnabled: normalized.automationEnabled ?? true,
              responses: mergedResponses,
              confirmationTimestamps: mergedTimestamps,
              remindersSent: normalized.remindersSent || {},
              lastUpdated: Date.now()
            });

            stalePreConfIdsToDelete.forEach(staleId => {
              batch.delete(doc(db, 'preConfirmations', masterTarget, 'players', staleId));
            });

            missingInPreConf.forEach(pId => {
              const playerMaster = (players || []).find(p => p.id === pId);
              const ref = doc(db, 'preConfirmations', masterTarget, 'players', pId);
              batch.set(ref, {
                ...(playerMaster ? Object.fromEntries(Object.entries(playerMaster).filter(([_, v]) => v !== undefined)) : {}),
                id: pId,
                name: playerMaster?.name || pId,
                status: playerMaster?.status || 'active',
                timestamp: mergedTimestamps[pId]
              }, { merge: true });
            });

            await batch.commit();
          }, 'Persistência de Reconciliação Semanal', 2, 400, 15000);
        } catch (reconcileErr) {
          console.warn('[Sync Diagnóstico] [_refreshIntentions] Aviso na reconciliação em background:', reconcileErr);
        }
      }

      const finalNormalized: IntentionsData = {
        targetDate: masterTarget,
        automationEnabled: normalized.automationEnabled ?? true,
        responses: mergedResponses,
        confirmationTimestamps: mergedTimestamps,
        remindersSent: normalized.remindersSent || {},
        lastUpdated: Date.now()
      };

      updateIntentionsLock(masterTarget);
      setRawIntentions(finalNormalized);
      useStore.getState().setPreConfirmations(preConfList);

      return finalNormalized;
    } catch (err) {
      console.error('[Sync Diagnóstico] [_refreshIntentions] Erro ao sincronizar com Firestore:', err);
      throw err;
    }
  }, [players, idToCanonicalId, userRole, currentPlayer?.isAdmin, user?.email]);

  const refreshIntentions = _refreshIntentions;

  // Escuta em tempo real de metadata/intentions (sem bloqueio de deleção ou retenção de cache obsoleto)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'intentions'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.targetDate) {
          updateIntentionsLock(data.targetDate);
        }
        const normalized = normalizeIntentionsData(data);
        setRawIntentions(normalized);
        if (Object.keys(normalized.responses || {}).length === 0) {
          useStore.getState().setPreConfirmations([]);
        }
      } else {
        const nextThu = getNextThursday();
        const emptyData: IntentionsData = {
          ...DEFAULT_INTENTIONS,
          targetDate: nextThu,
          lastUpdated: Date.now()
        };
        setRawIntentions(emptyData);
        setDoc(doc(db, 'metadata', 'intentions'), emptyData).catch(() => {});
      }
      setIsLoaded(true);
    }, (err) => {
      console.error('useIntentions: Error in intentions snapshot:', err);
      handleFirestoreError(err, OperationType.GET, 'metadata/intentions');
      setIsLoaded(true);
    });
    return () => unsub();
  }, []);

  // Limpeza Automatizada ao Carregar o App para todos os usuários:
  // Expurga entradas de 'Intention' anteriores à semana corrente no Firestore e no localStorage móvel
  useEffect(() => {
    if (!isLoaded || adminCleanupExecutedThisSession) return;

    adminCleanupExecutedThisSession = true;
    const targetDate = rawIntentions.targetDate || getNextThursday();
    runAdminIntentionsCleanupOnLoad({
      currentTargetDate: targetDate,
      players,
      idToCanonicalId
    }).then(() => {
      _refreshIntentions().catch(() => {});
    }).catch(err => {
      console.warn('[useIntentions] Falha não impeditiva na limpeza automática de intenções:', err);
    });
  }, [isLoaded, rawIntentions.targetDate, players, idToCanonicalId, _refreshIntentions]);

  // Reset list for the new week with trace logging
  const resetIntentionsIfNeeded = useCallback(async () => {
    if (!isLoaded) return;
    const nextThu = getNextThursday();
    const todayStr = getFirestoreDateKey();
    const isPast = intentions.targetDate && intentions.targetDate < todayStr;
    const isAdminUser = userRole === 'ADMIN' || Boolean(currentPlayer?.isAdmin) || (user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com');

    if (intentions.targetDate && intentions.targetDate !== nextThu && isAdminUser && isPast) {
      try {
        sendingRef.current = {};
        await setDoc(doc(db, 'metadata', 'intentions'), {
          ...DEFAULT_INTENTIONS,
          targetDate: nextThu,
          responses: {},
          confirmationTimestamps: {},
          automationEnabled: intentions.automationEnabled,
          lastUpdated: Date.now()
        });
      } catch (err) {
        console.error('Erro ao resetar intenções:', err);
        handleFirestoreError(err, OperationType.WRITE, 'metadata/intentions');
      }
    }
  }, [intentions.targetDate, intentions.automationEnabled, userRole, currentPlayer?.isAdmin, user?.email, isLoaded]);

  useEffect(() => {
    resetIntentionsIfNeeded();
  }, [intentions.targetDate, resetIntentionsIfNeeded]);

  // Auto-heal: Restaurar preConfirmations válidas (estritamente desta semana e <= 7 dias) ausentes em metadata/intentions
  useEffect(() => {
    if (!isLoaded || !rawIntentions.targetDate) return;
    const todayStr = getFirestoreDateKey();
    if (rawIntentions.targetDate < todayStr) return;

    const { cutoffTimestamp } = getWeeklyCutoffTimestamp();
    const responses = rawIntentions.responses || {};
    const timestamps = rawIntentions.confirmationTimestamps || {};
    let needsUpdate = false;
    
    const updatedResponses = { ...responses };
    const updatedTimestamps = { ...timestamps };

    (preConfirmations || []).forEach(pc => {
      const canonicalId = idToCanonicalId?.[pc.id] || pc.id;
      const pcTimestamp = Number(pc.timestamp || 0);
      const currentTs = Number(timestamps[canonicalId] || timestamps[pc.id] || 0);
      const alreadyGoing = responses[canonicalId] === 'GOING' || responses[pc.id] === 'GOING';
      const isNotGoing = responses[canonicalId] === 'NOT_GOING' || responses[pc.id] === 'NOT_GOING';

      if (pcTimestamp >= cutoffTimestamp && (!alreadyGoing || currentTs < cutoffTimestamp) && !isNotGoing) {
        updatedResponses[canonicalId] = 'GOING';
        updatedTimestamps[canonicalId] = pcTimestamp;
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      const intentionsRef = doc(db, 'metadata', 'intentions');
      updateDoc(intentionsRef, {
        responses: updatedResponses,
        confirmationTimestamps: updatedTimestamps,
        lastUpdated: Date.now()
      }).catch(err => {
        console.warn('Failed to auto-heal intentions:', err);
      });
    }
  }, [isLoaded, preConfirmations, rawIntentions.responses, rawIntentions.confirmationTimestamps, rawIntentions.targetDate, idToCanonicalId]);

  // Sync intention confirmations into player access records
  useEffect(() => {
    if (!isLoaded || !intentions.responses) return;
    const timestamps = intentions.confirmationTimestamps || {};
    const responses = intentions.responses;

    Object.entries(responses).forEach(([pId, status]) => {
      if (status) {
        const ts = timestamps[pId];
        const p = players.find(player => player.id === pId);
        if (p) {
          const confirmDate = ts ? new Date(ts).toISOString().slice(0, 10) : getFirestoreDateKey();
          const hasConfirmDate = p.loginHistory?.some(h => new Date(h).toISOString().slice(0, 10) === confirmDate);
          if (!p.lastLoginAt || !hasConfirmDate) {
            trackAccess(pId);
          }
        }
      }
    });
  }, [isLoaded, intentions.responses, intentions.confirmationTimestamps, players]);

  const clearRemindersForPlayer = async (playerId: string, playerUid?: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('playerUid', '==', playerUid || ''),
        where('type', '==', 'reminder')
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.warn('Erro ao limpar lembretes antigos:', err);
    }
  };

  const setIntent = async (playerId: string, status: 'GOING' | 'NOT_GOING' | 'RESET') => {
    const today = getFirestoreDateKey();
    const currentStoredTarget = rawIntentions.targetDate;
    const lastProcessedLock = getStoredIntentionsLock();

    // Lock Guard: Validação antes de qualquer escrita no Firestore
    if (currentStoredTarget && currentStoredTarget < today && status !== 'RESET') {
      console.warn(`[useIntentions Out-Of-Sync Guard] Gravação bloqueada! targetDate ("${currentStoredTarget}") < hoje ("${today}"). Lock local: "${lastProcessedLock}".`);
      throw new Error('Atenção: A lista de presença está desincronizada (out-of-sync). Atualize a página antes de alterar.');
    }

    // Collect all aliases for the player to ensure complete removal across aliases
    const playerObjFound = (players || []).find(p => p.id === playerId || p.uid === playerId || (p.email && p.email.toLowerCase() === playerId.toLowerCase()));
    const aliasSet = new Set<string>([playerId]);
    if (playerObjFound) {
      if (playerObjFound.id) aliasSet.add(playerObjFound.id);
      if (playerObjFound.uid) aliasSet.add(playerObjFound.uid);
      if (playerObjFound.email) aliasSet.add(playerObjFound.email.toLowerCase());
    }
    if (idToCanonicalId) {
      if (idToCanonicalId[playerId]) aliasSet.add(idToCanonicalId[playerId]);
      Object.entries(idToCanonicalId).forEach(([k, v]) => {
        if (v === playerId || aliasSet.has(v) || aliasSet.has(k)) {
          aliasSet.add(k);
          aliasSet.add(v);
        }
      });
    }

    // Optimistic UI Update
    const previousRaw = rawIntentions;
    const now = Date.now();
    setRawIntentions(prev => {
      const newResponses = { ...prev.responses };
      const newTimestamps = { ...prev.confirmationTimestamps };
      
      if (status === 'RESET') {
        aliasSet.forEach(alias => {
          delete newResponses[alias];
          delete newTimestamps[alias];
        });
      } else {
        newResponses[playerId] = status as 'GOING' | 'NOT_GOING';
        newTimestamps[playerId] = now;
      }
      
      return {
        ...prev,
        responses: newResponses,
        confirmationTimestamps: newTimestamps,
        lastUpdated: now
      };
    });

    try {
      // 1. Unified Batch Persistence (metadata/intentions + preConfirmations)
      const intentionsRef = doc(db, 'metadata', 'intentions');
      const nextThu = getNextThursday();
      const { cutoffTimestamp } = getWeeklyCutoffTimestamp();
      
      // If the current stored targetDate is in the past, we MUST use the next upcoming Thursday
      // to avoid saving to an archived preConfirmations collection.
      const targetDate = (currentStoredTarget && currentStoredTarget >= today) 
        ? currentStoredTarget 
        : nextThu;

      updateIntentionsLock(targetDate);
      
      // Use strictly the weekly-filtered intentions so stale entries are never re-persisted
      const newResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
      const newTimestamps: Record<string, number> = {};

      Object.entries(intentions.responses || {}).forEach(([id, val]) => {
        const ts = Number(intentions.confirmationTimestamps?.[id] || 0);
        if (ts >= cutoffTimestamp && (val === 'GOING' || val === 'NOT_GOING')) {
          newResponses[id] = val;
          newTimestamps[id] = ts;
        }
      });

      const isDateRotating = Boolean(currentStoredTarget && currentStoredTarget < today);
      const finalResponses: Record<string, 'GOING' | 'NOT_GOING'> = isDateRotating ? {} : newResponses;
      const finalTimestamps: Record<string, number> = isDateRotating ? {} : newTimestamps;

      if (isDateRotating) {
        Object.keys(newResponses).forEach(pId => {
          const ts = newTimestamps[pId];
          if (ts && typeof ts === 'number' && ts >= cutoffTimestamp) {
            const tsDateKey = getFirestoreDateKey(new Date(ts));
            if (tsDateKey >= today) {
              finalResponses[pId] = newResponses[pId];
              finalTimestamps[pId] = ts;
            }
          }
        });
      }

      if (status === 'RESET') {
        aliasSet.forEach(alias => {
          delete finalResponses[alias];
          delete finalTimestamps[alias];
        });
      } else {
        finalResponses[playerId] = status;
        if (status === 'GOING') {
          const existingTs = Number(rawIntentions.confirmationTimestamps?.[playerId] || 0);
          const alreadyGoing = rawIntentions.responses?.[playerId] === 'GOING' && existingTs >= cutoffTimestamp;
          if (!alreadyGoing || isDateRotating) {
            finalTimestamps[playerId] = now;
          } else {
            finalTimestamps[playerId] = existingTs;
          }
        } else {
          finalTimestamps[playerId] = now;
        }
      }

      console.info(`[Sync Diagnóstico] [setIntent] Persistindo intenção "${status}" para sócio "${playerId}"...`);
      await executeWithRetry(
        async () => {
          const batch = writeBatch(db);
          let currentBatchSize = 1;

          if (status === 'RESET') {
            batch.set(intentionsRef, {
              targetDate: targetDate,
              automationEnabled: rawIntentions.automationEnabled ?? true,
              responses: finalResponses,
              confirmationTimestamps: finalTimestamps,
              remindersSent: rawIntentions.remindersSent || {},
              lastUpdated: now
            });
          } else {
            batch.set(intentionsRef, {
              targetDate: targetDate,
              automationEnabled: rawIntentions.automationEnabled ?? true,
              responses: finalResponses,
              confirmationTimestamps: finalTimestamps,
              remindersSent: isDateRotating ? {} : (rawIntentions.remindersSent || {}),
              lastUpdated: now
            });
          }

          if (status === 'GOING') {
            const preConfirmationRef = doc(db, 'preConfirmations', targetDate, 'players', playerId);
            const playerObjRaw = playerObjFound || {
              id: playerId,
              name: playerId.startsWith('guest_') ? playerId.replace('guest_', 'Convidado ') : playerId,
              status: 'guest'
            };

            const playerObj = Object.fromEntries(
              Object.entries(playerObjRaw).filter(([_, v]) => v !== undefined)
            );

            const effectiveTs = finalTimestamps[playerId] || now;
            batch.set(preConfirmationRef, { ...playerObj, timestamp: effectiveTs, id: playerId }, { merge: true });
            currentBatchSize++;
          } else {
            const datesToClean = Array.from(new Set([
              targetDate,
              currentStoredTarget,
              rawIntentions.targetDate,
              today,
              nextThu
            ].filter(Boolean) as string[]));

            datesToClean.forEach(dKey => {
              aliasSet.forEach(alias => {
                const pRef = doc(db, 'preConfirmations', dKey, 'players', alias);
                batch.delete(pRef);
                currentBatchSize++;
              });
            });
          }

          return commitBatchWithLog 
            ? commitBatchWithLog(batch, 'Atualização de Intenção', currentBatchSize) 
            : batch.commit();
        },
        `Escrita setIntent (${status})`
      );

      // Optimistically update Zustand store after successful Firestore write
      if (status === 'GOING') {
        const playerObjRaw = playerObjFound || {
          id: playerId,
          name: playerId.startsWith('guest_') ? playerId.replace('guest_', 'Convidado ') : playerId,
          status: 'guest'
        };
        const playerObj = Object.fromEntries(
          Object.entries(playerObjRaw).filter(([_, v]) => v !== undefined)
        );
        const effectiveTs = finalTimestamps[playerId] || now;
        useStore.getState().setPreConfirmations((prev: Player[]) => {
          const filtered = (prev || []).filter(p => !aliasSet.has(p.id));
          return [...filtered, { ...playerObj, timestamp: effectiveTs, id: playerId } as Player];
        });
      } else {
        useStore.getState().setPreConfirmations((prev: Player[]) => {
          return (prev || []).filter(p => {
            if (aliasSet.has(p.id)) return false;
            if (p.uid && aliasSet.has(p.uid)) return false;
            if (p.email && aliasSet.has(p.email.toLowerCase())) return false;
            return true;
          });
        });
      }
      
      console.info(`[Sync Diagnóstico] [setIntent] Intenção "${status}" para sócio "${playerId}" persistida com sucesso.`);

      // 3. Background call to server endpoint (for telemetry / server-side validations)
      const currentStore = useStore.getState();
      const currentAuthUser = currentStore.user;
      const currentPlayerProfile = currentStore.currentPlayer;
      const simpleEmail = typeof window !== 'undefined' ? window.localStorage.getItem('simpleLoginEmail')?.trim() : null;
      const effectiveEmail = currentAuthUser?.email || currentPlayerProfile?.email || simpleEmail || null;

      fetch('/api/presence/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          playerId, 
          status, 
          uid: currentAuthUser?.uid || currentPlayerProfile?.uid || null,
          userEmail: effectiveEmail,
          isAdmin: currentStore.userRole === 'ADMIN'
        })
      }).catch(apiErr => {
        console.warn('[useIntentions] /api/presence/set background call non-blocking error:', apiErr);
      });
      
      if (status !== 'RESET') {
        trackAccess(playerId).catch(console.warn);
      }
      
    } catch (err: any) {
      console.error('[Sync Diagnóstico] [setIntent] Erro ao definir intenção:', err);
      // Only rollback if direct Firestore write completely failed
      setRawIntentions(previousRaw);
      throw err;
    }
  };

  const resetIntent = async (playerId: string) => {
    try {
      console.info(`[useIntentions] Resetting intent for player: ${playerId}`);
      await setIntent(playerId, 'RESET');
    } catch (err) {
      console.warn('[useIntentions] setIntent RESET falhou, tentando fallback direto com deleteField...', err);
      try {
        const intentionsRef = doc(db, 'metadata', 'intentions');
        const updates: Record<string, any> = {};
        updates[`responses.${playerId}`] = deleteField();
        updates[`confirmationTimestamps.${playerId}`] = deleteField();
        
        const playerObjFound = (players || []).find(p => p.id === playerId || p.uid === playerId || (p.email && p.email.toLowerCase() === playerId.toLowerCase()));
        if (playerObjFound) {
          updates[`responses.${playerObjFound.id}`] = deleteField();
          updates[`confirmationTimestamps.${playerObjFound.id}`] = deleteField();
          if (playerObjFound.uid) {
            updates[`responses.${playerObjFound.uid}`] = deleteField();
            updates[`confirmationTimestamps.${playerObjFound.uid}`] = deleteField();
          }
        }
        
        await updateDoc(intentionsRef, updates);
        
        const nextThu = getNextThursday();
        const candidateDates = [nextThu, getFirestoreDateKey()];
        const batch = writeBatch(db);
        candidateDates.forEach(dKey => {
          batch.delete(doc(db, 'preConfirmations', dKey, 'players', playerId));
          if (playerObjFound) {
            batch.delete(doc(db, 'preConfirmations', dKey, 'players', playerObjFound.id));
          }
        });
        await batch.commit().catch(() => {});

        setRawIntentions(prev => {
          const newResponses = { ...prev.responses };
          const newTimestamps = { ...prev.confirmationTimestamps };
          delete newResponses[playerId];
          delete newTimestamps[playerId];
          if (playerObjFound) {
            delete newResponses[playerObjFound.id];
            delete newTimestamps[playerObjFound.id];
          }
          return { ...prev, responses: newResponses, confirmationTimestamps: newTimestamps, lastUpdated: Date.now() };
        });

        console.info('[useIntentions] Fallback de reset de intenção concluído com sucesso.');
      } catch (fallbackErr) {
        console.error('Erro fatal ao resetar intenção:', fallbackErr);
        throw fallbackErr;
      }
    }
  };

  const toggleAutomation = async (enabled: boolean) => {
    try {
      console.info(`[Sync Diagnóstico] [toggleAutomation] Alternando automação para: ${enabled}...`);
      await executeWithRetry(() => setDoc(doc(db, 'metadata', 'intentions'), {
        automationEnabled: enabled
      }, { merge: true }), 'Atualização de Automação');
      console.info('[Sync Diagnóstico] [toggleAutomation] Automação atualizada com sucesso.');
    } catch (err) {
      console.error('Erro ao alternar automação:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'metadata/intentions');
    }
  };

  const clearIntentions = async () => {
    try {
      console.info('[Sync Diagnóstico] [clearIntentions] Limpando lista de intenções e subcoleções preConfirmations...');
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

      // 1. Atualização otimista imediata na memória e store para evitar ressurreição por auto-heal
      setRawIntentions(clearedState);
      useStore.getState().setPreConfirmations([]);
      purgeStaleLocalStorageIntentions(nextThu);

      // 2. Excluir todos os documentos em preConfirmations para as datas candidatas e persistir estado limpo
      const candidateDates = Array.from(new Set([
        nextThu,
        rawIntentions.targetDate,
        getFirestoreDateKey()
      ].filter(Boolean) as string[]));

      await executeWithRetry(
        async () => {
          const batch = writeBatch(db);
          let currentBatchCount = 1;

          for (const dKey of candidateDates) {
            try {
              let snap;
              try {
                snap = await getDocsFromServer(collection(db, 'preConfirmations', dKey, 'players'));
              } catch {
                snap = await getDocs(collection(db, 'preConfirmations', dKey, 'players'));
              }
              snap.forEach(docSnap => {
                batch.delete(doc(db, 'preConfirmations', dKey, 'players', docSnap.id));
                currentBatchCount++;
              });
            } catch (e) {
              // Ignorar erro de leitura em datas vazias
            }
          }

          // Sobrescrever metadata/intentions integralmente (sem merge) com lastUpdated atualizado
          batch.set(doc(db, 'metadata', 'intentions'), clearedState);

          return commitBatchWithLog 
            ? commitBatchWithLog(batch, 'Limpar Lista de Intenções', currentBatchCount) 
            : batch.commit();
        },
        'Limpeza Completa de Intenções'
      );

      fetch('/api/presence/clear', { method: 'POST' }).catch(() => {});
      console.info('[Sync Diagnóstico] [clearIntentions] Lista de intenções e preConfirmations limpas com sucesso.');
    } catch (err) {
      console.error('Erro ao limpar intenções:', err);
      handleFirestoreError(err, OperationType.WRITE, 'metadata/intentions');
    }
  };

  const sendReminders = useCallback(async (customMessage?: string) => {
    try {
      const batch = writeBatch(db);
      let count = 0;

      // Get attendance from store directly to ensure latest data
      const currentStore = useStore.getState();
      const currentAttendance = currentStore.attendance;
      const currentIntentions = intentions; // Use current intentions from state

      // Prepare unread counts for non-responded players
      const notificationData = await Promise.all(players.map(async (p) => {
        const isAlreadyInAttendance = currentAttendance.some(a => a.id === p.id);
        const hasResponded = currentIntentions.responses[p.id] === 'GOING' || currentIntentions.responses[p.id] === 'NOT_GOING';
        
        if (p.status === 'active' && !p.isDM && !hasResponded && !isAlreadyInAttendance && p.fcmToken) {
          try {
            const q = query(collection(db, 'notifications'), where('playerUid', '==', p.uid), where('read', '==', false));
            const snap = await getDocs(q);
            return { id: p.id, unreadCount: snap.size + 1 };
          } catch (e) {
            return { id: p.id, unreadCount: 1 };
          }
        }
        return { id: p.id, unreadCount: 1 };
      }));

      const intentionsDocRef = doc(db, 'metadata', 'intentions');
      const updatedRemindersSent: Record<string, boolean> = { ...(rawIntentions.remindersSent || {}) };
      const metadataUpdates: Record<string, any> = {};

      players.forEach(player => {
        // Don't send reminder if player has already responded or is already in attendance
        const isAlreadyInAttendance = currentAttendance.some(a => a.id === player.id);
        const hasResponded = currentIntentions.responses[player.id] === 'GOING' || currentIntentions.responses[player.id] === 'NOT_GOING';
        
        if (player.status === 'active' && !player.isDM && !hasResponded && !isAlreadyInAttendance) {
          const appLink = `${getAppUrl()}?tab=intentions`;
          const unreadCount = notificationData.find(d => d.id === player.id)?.unreadCount || 1;
          
          // Marca no registro de lembretes enviados para este atleta
          updatedRemindersSent[player.id] = true;
          metadataUpdates[`remindersSent.${player.id}`] = true;

          // Save to in-app notifications
          const appNotifRef = doc(collection(db, 'notifications'));
          const tDate = currentIntentions.targetDate;
          let dateStr = 'xx/xx';
          if (tDate) {
            const [y, m, d] = tDate.split('-').map(Number);
            dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
          }
          
          batch.set(appNotifRef, {
            playerId: player.id,
            playerUid: player.uid || null,
            title: 'Aviso de Presença',
            message: customMessage || `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n[Clique aqui para confirmar](${appLink}) ou no grupo de WhatsApp.`,
            createdAt: Date.now(),
            read: false,
            type: 'reminder'
          });

          // If player has FCM token, also send push notification via fcm_messages
          if (player.fcmToken) {
            const notifRef = doc(collection(db, 'fcm_messages'));
            batch.set(notifRef, {
              token: player.fcmToken,
              notification: {
                title: 'Aviso de Presença',
                body: customMessage || `Bora pra lista mais esperada da semana !!! Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa... Confirme no app: ${appLink}`,
                sound: 'default'
              },
              data: {
                unreadCount: String(unreadCount),
                type: 'reminder'
              },
              android: {
                notification: {
                  sound: 'default'
                }
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'default'
                  }
                }
              },
              createdAt: serverTimestamp()
            });
          }
          count++;
        }
      });

      if (count > 0) {
        batch.set(intentionsDocRef, metadataUpdates, { merge: true });
        await batch.commit();
        setRawIntentions(prev => ({
          ...prev,
          remindersSent: updatedRemindersSent
        }));
      }
      return count;
    } catch (err) {
      console.error('Erro ao enviar lembretes:', err);
      handleFirestoreError(err, OperationType.WRITE, 'notifications/fcm_messages');
      return 0;
    }
  }, [players, intentions.responses, rawIntentions.remindersSent, getAppUrl]);

  const copyToWhatsApp = (customGoingPlayers?: Player[]) => {
    let goingPlayers: Player[] = [];

    if (customGoingPlayers && customGoingPlayers.length > 0) {
      goingPlayers = customGoingPlayers;
    } else {
      const confirmed: Player[] = [];
      const addedIds = new Set<string>();

      const markPlayerAdded = (p: Player) => {
        addedIds.add(p.id);
        if (p.uid) {
          addedIds.add(p.uid);
          addedIds.add(p.uid.toLowerCase());
        }
        if (p.email) {
          addedIds.add(p.email.toLowerCase());
        }
        const canonical = idToCanonicalId?.[p.id];
        if (canonical) addedIds.add(canonical);
      };

      (players || []).filter(p => intentions.responses[p.id] === 'GOING').forEach(p => {
        markPlayerAdded(p);
        confirmed.push(p);
      });

      Object.entries(intentions.responses || {}).forEach(([respId, status]) => {
        if (status === 'GOING' && !addedIds.has(respId)) {
          // Double check against registered players by ID, UID, or email
          const matchingPlayer = (players || []).find(p => 
            p.id === respId || 
            (p.uid && p.uid.toLowerCase() === respId.toLowerCase()) || 
            (p.email && p.email.toLowerCase() === respId.toLowerCase()) ||
            idToCanonicalId?.[respId] === p.id
          );
          if (matchingPlayer) {
            markPlayerAdded(matchingPlayer);
            if (!confirmed.some(c => c.id === matchingPlayer.id)) {
              confirmed.push(matchingPlayer);
            }
            return;
          }

          const canonical = idToCanonicalId?.[respId];
          if (canonical && addedIds.has(canonical)) return;

          // Never synthesize a guest from a raw UID or email
          if (respId.includes('@') || /^[a-zA-Z0-9]{25,32}$/.test(respId)) {
            return;
          }

          addedIds.add(respId);
          confirmed.push({ id: respId, name: respId.startsWith('guest_') ? respId.replace('guest_', 'Convidado ') : respId, status: 'guest' } as Player);
        }
      });

      goingPlayers = confirmed.sort((a, b) => {
        const timeA = getPlayerConfirmationTime(a);
        const timeB = getPlayerConfirmationTime(b);
        return timeA - timeB;
      });
    }

    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [y, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }

    let text = `Bora pra lista mais esperada da semana !!!\n\n`;
    text += `Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n`;
    text += `*Guerreiros confirmados*\n\n`;
    
    if (goingPlayers.length === 0) {
      text += "Nenhum sócio confirmado ainda.";
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
      const [y, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }
    const text = `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\nConfirme a sua presença direto no app: ${appLink} ou no grupo de WhatsApp.`;
    navigator.clipboard.writeText(text);
    return true;
  };

  // Automatic Reminders Logic
  useEffect(() => {
    // A automação agora é feita 100% pelo backend via Cloud Scheduler.
    // O setInterval(checkAndSend, 60000) foi removido
    // para evitar que abas esquecidas abertas pelos admins causem leituras excessivas
    // e picos de custo no Cloud Run/Firestore.
  }, []);

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
