import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, doc, getDoc, onSnapshot, setDoc, updateDoc, writeBatch, collection, serverTimestamp, handleFirestoreError, OperationType, getDocs, query, where, deleteDoc, deleteField, getFirestoreDateKey, getBrazilDay, trackAccess, getNextThursday } from '../../firebase';
import { IntentionsData, Player } from '../../types';
import { useStore } from '../../store';

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
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      console.info(`[Sync Diagnóstico] [${opName}] Iniciando operação (tentativa ${attempt + 1}/${maxRetries})...`);
      const result = await operation();
      console.info(`[Sync Diagnóstico] [${opName}] Operação finalizada com sucesso na tentativa ${attempt + 1}.`);
      return result;
    } catch (error) {
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

export const useIntentions = (commitBatchWithLog?: (batch: any, label: string, size: number) => Promise<void>) => {
  const [rawIntentions, setRawIntentions] = useState<IntentionsData>(DEFAULT_INTENTIONS);
  const [isLoaded, setIsLoaded] = useState(false);
  const { players, userRole, idToCanonicalId, preConfirmations } = useStore();
  const sendingRef = useRef<Record<string, boolean>>({});

  // Memoized filtered intentions based on current players in store
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

    // Filtro Semanal Estrito: Exibir apenas confirmações realizadas a partir de segunda-feira da semana corrente
    const now = new Date();
    const brazilToday = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dayOfWeek = brazilToday.getDay(); // 0 (Sun) - 6 (Sat)
    const daysSinceMonday = (dayOfWeek + 6) % 7; // Monday = 0
    const currentMonday = new Date(brazilToday);
    currentMonday.setDate(brazilToday.getDate() - daysSinceMonday);
    currentMonday.setHours(0, 0, 0, 0);
    const mondayTimestamp = currentMonday.getTime();

    const filteredResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
    const filteredTimestamps: Record<string, number> = {};

    Object.entries(responses).forEach(([id, val]) => {
      const ts = timestamps[id] || 0;
      if (ts >= mondayTimestamp || (val === 'NOT_GOING' && (!ts || ts >= mondayTimestamp))) {
        filteredResponses[id] = val;
        if (ts) filteredTimestamps[id] = ts;
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
          // Use the EARLIEST non-zero timestamp for the queue position
          const combinedTs = (currentTs > 0 && newTs > 0) 
            ? Math.min(currentTs, newTs) 
            : (currentTs || newTs);
          
          if (combinedTs > 0) {
            filteredTimestamps[canonicalId] = combinedTs;
          }
        }
      }
    });

    // 2. Also propagate responses to players by UID or Email
    if (players && players.length > 0) {
      players.forEach(p => {
        let isGoing = filteredResponses[p.id] === 'GOING';
        let isNotGoing = filteredResponses[p.id] === 'NOT_GOING';
        let ts = filteredTimestamps[p.id] || 0;

        if (isGoing) {
          filteredResponses[p.id] = 'GOING';
          if (ts) filteredTimestamps[p.id] = ts;
        } else if (isNotGoing && !filteredResponses[p.id]) {
          filteredResponses[p.id] = 'NOT_GOING';
        }
      });
    }

    return {
      ...rawIntentions,
      responses: filteredResponses,
      confirmationTimestamps: filteredTimestamps
    };
  }, [rawIntentions, players, idToCanonicalId]);

  const getPlayerConfirmationTime = useCallback((p: Player) => {
    const tsMap = intentions.confirmationTimestamps || {};
    let ts = tsMap[p.id];
    
    // REMOVED: if (!ts && (p as any).timestamp) ts = (p as any).timestamp; 
    // This fallback was causing old timestamps (from registration or previous games) 
    // to be displayed when the current session's timestamp was missing.

    if (!ts && p.uid && tsMap[p.uid]) ts = tsMap[p.uid];
    if (!ts && p.email && tsMap[p.email.toLowerCase()]) ts = tsMap[p.email.toLowerCase()];
    if (!ts && idToCanonicalId?.[p.id] && tsMap[idToCanonicalId[p.id]]) ts = tsMap[idToCanonicalId[p.id]];
    
    // If still not found, check if this player is an alias for another ID that has a timestamp
    if (!ts && idToCanonicalId) {
      const canonicalId = idToCanonicalId[p.id];
      if (canonicalId && tsMap[canonicalId]) ts = tsMap[canonicalId];
    }

    return ts || 0;
  }, [intentions.confirmationTimestamps, idToCanonicalId]);

  // Helper to get the correct app URL (Shared vs Dev)
  const getAppUrl = useCallback(() => {
    // 1. Check for explicit env variable
    const envUrl = import.meta.env.VITE_APP_URL;
    if (envUrl) return envUrl.replace(/\/$/, '');
    
    // 2. Official Production URL provided by user
    const PROD_URL = 'https://guerreiros-volleyball-club-238897290870.us-west1.run.app';
    
    const origin = window.location.origin;
    
    // If we are in production, use the current origin
    if (origin.includes('guerreiros-volleyball-club')) {
      return origin;
    }

    // Default to the official PROD_URL for sharing, unless it's a dev environment where we might want to test
    // but the user specifically asked to fix the dev URL in messages.
    return PROD_URL;
  }, []);

  const _refreshIntentions = useCallback(async () => {
    console.info('[Sync Diagnóstico] [_refreshIntentions] Iniciando sincronização manual de intenções com Firestore...');
    try {
      // 1. Obter metadata/intentions com retry
      const snap = await executeWithRetry(() => getDoc(doc(db, 'metadata', 'intentions')), 'Leitura metadata/intentions');
      let masterTarget = getNextThursday();
      let normalized = DEFAULT_INTENTIONS;
      
      if (snap.exists()) {
        normalized = normalizeIntentionsData(snap.data());
        masterTarget = normalized.targetDate || masterTarget;
      }

      console.info(`[Sync Diagnóstico] [_refreshIntentions] metadata/intentions targetDate: "${masterTarget}". Respostas locais:`, Object.keys(normalized.responses || {}).length);

      // 2. Buscar preConfirmations/{masterTarget}/players no servidor
      console.info(`[Sync Diagnóstico] [_refreshIntentions] Buscando preConfirmations/${masterTarget}/players no servidor...`);
      const preConfSnap = await executeWithRetry(
        () => getDocs(collection(db, 'preConfirmations', masterTarget, 'players')),
        `Leitura preConfirmations/${masterTarget}`
      );

      console.info(`[Sync Diagnóstico] [_refreshIntentions] Documentos encontrados em preConfirmations/${masterTarget}: ${preConfSnap.size}`);

      const mergedResponses: Record<string, 'GOING' | 'NOT_GOING'> = { ...(normalized.responses || {}) };
      const mergedTimestamps: Record<string, number> = { ...(normalized.confirmationTimestamps || {}) };
      const preConfList: Player[] = [];
      let discrepanciesCount = 0;

      preConfSnap.forEach(d => {
        const pData = d.data();
        const pId = d.id;
        preConfList.push({ ...pData, id: pId } as Player);

        const currentResp = mergedResponses[pId];
        const currentTs = mergedTimestamps[pId] || 0;
        const pcTs = pData.timestamp ? Number(pData.timestamp) : 0;

        console.info(`[Sync Diagnóstico] [_refreshIntentions] Sócio ${pData.name || pId} - Status metadata: ${currentResp || 'Nenhum'}, TS metadata: ${currentTs}, TS preConfirmations: ${pcTs}`);

        // Se está na subcoleção preConfirmations, sua intenção é GOING
        if (currentResp !== 'GOING') {
          mergedResponses[pId] = 'GOING';
          discrepanciesCount++;
        }

        // Reconciliação de timestamp: priorizar o mais antigo válido
        if (pcTs > 0 && (currentTs === 0 || pcTs < currentTs)) {
          mergedTimestamps[pId] = pcTs;
          discrepanciesCount++;
        }
      });

      // Verificar atletas em metadata/intentions marcados como GOING que estejam ausentes na subcoleção preConfirmations
      const missingInPreConf: string[] = [];
      Object.entries(mergedResponses).forEach(([pId, status]) => {
        if (status === 'GOING' && !preConfList.some(p => p.id === pId)) {
          missingInPreConf.push(pId);
        }
      });

      console.info(`[Sync Diagnóstico] [_refreshIntentions] Discrepâncias: ${discrepanciesCount}. Pendentes em preConfirmations: ${missingInPreConf.length}`);

      // Persistir correções no Firestore caso detectada discrepância
      if (discrepanciesCount > 0 || missingInPreConf.length > 0) {
        console.info('[Sync Diagnóstico] [_refreshIntentions] Persistindo reconciliação unificada no Firestore...');
        await executeWithRetry(async () => {
          const batch = writeBatch(db);
          batch.set(doc(db, 'metadata', 'intentions'), {
            targetDate: masterTarget,
            automationEnabled: normalized.automationEnabled ?? true,
            responses: mergedResponses,
            confirmationTimestamps: mergedTimestamps,
            remindersSent: normalized.remindersSent || {},
            lastUpdated: Date.now()
          }, { merge: true });

          missingInPreConf.forEach(pId => {
            const playerMaster = (players || []).find(p => p.id === pId);
            const ref = doc(db, 'preConfirmations', masterTarget, 'players', pId);
            batch.set(ref, {
              id: pId,
              name: playerMaster?.name || pId,
              status: playerMaster?.status || 'active',
              timestamp: mergedTimestamps[pId] || Date.now()
            }, { merge: true });
          });

          await batch.commit();
        }, 'Persistência de Reconciliação');
      }

      const finalNormalized: IntentionsData = {
        targetDate: masterTarget,
        automationEnabled: normalized.automationEnabled ?? true,
        responses: mergedResponses,
        confirmationTimestamps: mergedTimestamps,
        remindersSent: normalized.remindersSent || {},
        lastUpdated: Date.now()
      };

      setRawIntentions(finalNormalized);
      useStore.getState().setPreConfirmations(preConfList);

      console.info(`[Sync Diagnóstico] [_refreshIntentions] Sincronização finalizada com sucesso! Total confirmados: ${Object.values(mergedResponses).filter(v => v === 'GOING').length}`);
      return finalNormalized;
    } catch (err) {
      console.error('[Sync Diagnóstico] [_refreshIntentions] Erro ao sincronizar com Firestore:', err);
      throw err;
    }
  }, [players]);

  const refreshIntentions = _refreshIntentions;

  // Listen to intentions data
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'intentions'), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const serverLastUpdated = data.lastUpdated || 0;
        const localLastUpdated = rawIntentions.lastUpdated || 0;

        if (serverLastUpdated > localLastUpdated) {
          console.info(`[Sync Diagnóstico] [useIntentions] Discrepância detectada: servidor(${serverLastUpdated}) > local(${localLastUpdated}). Executando full refresh.`);
          await _refreshIntentions();
        } else {
          const normalized = normalizeIntentionsData(data);
          setRawIntentions(normalized);
        }
      } else {
        // Initialize if not exists
        setDoc(doc(db, 'metadata', 'intentions'), {
          ...DEFAULT_INTENTIONS,
          targetDate: getNextThursday(),
          lastUpdated: Date.now()
        });
      }
      setIsLoaded(true);
    }, (err) => {
      console.error('useIntentions: Error in intentions snapshot:', err);
      handleFirestoreError(err, OperationType.GET, 'metadata/intentions');
      setIsLoaded(true);
    });
    return () => unsub();
  }, [rawIntentions.lastUpdated, _refreshIntentions]);



  // Reset list for the new week
  const resetIntentionsIfNeeded = useCallback(async () => {
    if (!isLoaded) return;
    const nextThu = getNextThursday();
    
    // Only reset if we have a target date and it's strictly in the past (before today's Brazil date)
    const todayStr = getFirestoreDateKey();
    const isPast = intentions.targetDate && intentions.targetDate < todayStr;

    // Reset if target date is in the past, regardless of the day of the week.
    // This ensures that the first Admin to log in after a game (Friday morning onwards) 
    // will properly rotate the list for the next session if the server automation fails.
    if (intentions.targetDate && intentions.targetDate !== nextThu && userRole === 'ADMIN' && isPast) {
      try {
        sendingRef.current = {}; // Reset sending ref for new week
        await setDoc(doc(db, 'metadata', 'intentions'), {
          ...DEFAULT_INTENTIONS,
          targetDate: nextThu,
          responses: {},
          confirmationTimestamps: {},
          automationEnabled: intentions.automationEnabled // preserve automation setting
        });
        console.log('Lista de intenções resetada para a nova semana:', nextThu);
      } catch (err) {
        console.error('Erro ao resetar intenções:', err);
        handleFirestoreError(err, OperationType.WRITE, 'metadata/intentions');
      }
    }
  }, [intentions.targetDate, intentions.automationEnabled, userRole, isLoaded]);

  useEffect(() => {
    resetIntentionsIfNeeded();
  }, [intentions.targetDate, resetIntentionsIfNeeded]);

  // Auto-heal: If preConfirmations from store has players that are missing in rawIntentions.responses,
  // we restore them in metadata/intentions.responses so the list is always complete and correct.
  useEffect(() => {
    if (!isLoaded || !rawIntentions.targetDate) return;
    
    const responses = rawIntentions.responses || {};
    const timestamps = rawIntentions.confirmationTimestamps || {};
    let needsUpdate = false;
    
    const updatedResponses = { ...responses };
    const updatedTimestamps = { ...timestamps };
    
    // Auto-heal: Restaurar preConfirmations válidas para a semana corrente
    const now = new Date();
    const brazilToday = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dayOfWeek = brazilToday.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const currentMonday = new Date(brazilToday);
    currentMonday.setDate(brazilToday.getDate() - daysSinceMonday);
    currentMonday.setHours(0, 0, 0, 0);
    const mondayTimestamp = currentMonday.getTime();

    (preConfirmations || []).forEach(pc => {
      const pcTimestamp = pc.timestamp || 0;
      const currentTs = timestamps[pc.id] || 0;
      const alreadyGoing = responses[pc.id] === 'GOING';
      const isNotGoing = responses[pc.id] === 'NOT_GOING';

      // Auto-heal se o jogador estiver ausente ou com timestamp zerado na lista principal,
      // desde que confirmado a partir da segunda-feira desta semana e não esteja marcado como NOT_GOING
      if (pcTimestamp >= mondayTimestamp && (!alreadyGoing || currentTs === 0) && !isNotGoing) {
        updatedResponses[pc.id] = 'GOING';
        updatedTimestamps[pc.id] = pcTimestamp;
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      console.info('[useIntentions] Auto-healing: Syncing preConfirmations into metadata/intentions responses map');
      const intentionsRef = doc(db, 'metadata', 'intentions');
      updateDoc(intentionsRef, {
        responses: updatedResponses,
        confirmationTimestamps: updatedTimestamps
      }).catch(err => {
        console.warn('Failed to auto-heal intentions:', err);
      });
    }
  }, [isLoaded, preConfirmations, rawIntentions.responses, rawIntentions.confirmationTimestamps, rawIntentions.targetDate]);

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
    // Optimistic UI Update
    const previousRaw = rawIntentions;
    const now = Date.now();
    setRawIntentions(prev => {
      const newResponses = { ...prev.responses };
      const newTimestamps = { ...prev.confirmationTimestamps };
      
      if (status === 'RESET') {
        delete newResponses[playerId];
        delete newTimestamps[playerId];
      } else {
        newResponses[playerId] = status as 'GOING' | 'NOT_GOING';
        if (status === 'GOING') {
          newTimestamps[playerId] = now;
        } else {
          delete newTimestamps[playerId];
        }
      }
      
      return {
        ...prev,
        responses: newResponses,
        confirmationTimestamps: newTimestamps
      };
    });

    try {
      // 1. Unified Batch Persistence (metadata/intentions + preConfirmations)
      const intentionsRef = doc(db, 'metadata', 'intentions');
      const today = getFirestoreDateKey();
      const nextThu = getNextThursday();
      
      // If the current stored targetDate is in the past, we MUST use the next upcoming Thursday
      // to avoid saving to an archived preConfirmations collection.
      const currentStoredTarget = rawIntentions.targetDate;
      const targetDate = (currentStoredTarget && currentStoredTarget >= today) 
        ? currentStoredTarget 
        : nextThu;
      
      const newResponses = { ...(rawIntentions.responses || {}) };
      const newTimestamps = { ...(rawIntentions.confirmationTimestamps || {}) };

      // If we detected a date rotation (current stored was past), we wipe old responses first
      const isDateRotating = currentStoredTarget && currentStoredTarget < today;
      const finalResponses = isDateRotating ? {} : newResponses;
      const finalTimestamps = isDateRotating ? {} : newTimestamps;

      if (status === 'RESET') {
        delete finalResponses[playerId];
        delete finalTimestamps[playerId];
      } else {
        finalResponses[playerId] = status;
        if (status === 'GOING') {
          // Só atualiza o timestamp se o jogador ainda não estiver como 'GOING',
          // se não houver um timestamp prévio registrado, OU se estivermos rotacionando a data.
          // Isso evita que re-confirmações (cliques duplos ou admin refrescando) 
          // joguem o sócio para o final da fila, mas garante o reset semanal.
          const alreadyGoing = rawIntentions.responses?.[playerId] === 'GOING';
          const hasTimestamp = Boolean(rawIntentions.confirmationTimestamps?.[playerId]);
          
          if (!alreadyGoing || !hasTimestamp || isDateRotating) {
            finalTimestamps[playerId] = now;
          }
        } else {
          delete finalTimestamps[playerId];
        }
      }

      const batch = writeBatch(db);
      let batchSize = 1;

      // When date is rotating, we wipe old data by using merge: false.
      // Otherwise, we save the COMPLETE computed maps (finalResponses/finalTimestamps) 
      // to ensure all players are preserved with their correct data.
      batch.set(intentionsRef, {
        targetDate: targetDate,
        automationEnabled: rawIntentions.automationEnabled ?? true,
        responses: finalResponses,
        confirmationTimestamps: finalTimestamps,
        remindersSent: isDateRotating ? {} : (rawIntentions.remindersSent || {}),
        lastUpdated: now
      }, { merge: !isDateRotating });

      const preConfirmationRef = doc(db, 'preConfirmations', targetDate, 'players', playerId);

      if (status === 'GOING') {
        const playerObjRaw = players.find(p => p.id === playerId) || {
          id: playerId,
          name: playerId.startsWith('guest_') ? playerId.replace('guest_', 'Convidado ') : playerId,
          status: 'guest'
        };

        // Sanitize object to remove undefined values, which are not allowed in Firestore
        const playerObj = Object.fromEntries(
          Object.entries(playerObjRaw).filter(([_, v]) => v !== undefined)
        );

        batch.set(preConfirmationRef, { ...playerObj, timestamp: now, id: playerId }, { merge: true });
        batchSize++;

        useStore.getState().setPreConfirmations((prev: Player[]) => {
          const filtered = (prev || []).filter(p => p.id !== playerId);
          return [...filtered, { ...playerObj, timestamp: now, id: playerId } as Player];
        });
      } else {
        batch.delete(preConfirmationRef);
        batchSize++;

        useStore.getState().setPreConfirmations((prev: Player[]) => {
          return (prev || []).filter(p => p.id !== playerId);
        });
      }

      console.info(`[Sync Diagnóstico] [setIntent] Persistindo intenção "${status}" para sócio "${playerId}"...`);
      await executeWithRetry(
        () => commitBatchWithLog ? commitBatchWithLog(batch, 'Atualização de Intenção', batchSize) : batch.commit(),
        `Escrita setIntent (${status})`
      );
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
      // Use the API to reset intent to bypass permission issues
      await setIntent(playerId, 'RESET');
    } catch (err) {
      console.error('Erro ao resetar intenção:', err);
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
      console.info('[Sync Diagnóstico] [clearIntentions] Limpando lista de intenções...');
      await executeWithRetry(() => setDoc(doc(db, 'metadata', 'intentions'), {
        ...DEFAULT_INTENTIONS,
        targetDate: getNextThursday()
      }), 'Limpeza de Intenções');
      console.info('[Sync Diagnóstico] [clearIntentions] Lista de intenções limpa com sucesso.');
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
        
        if (p.status === 'active' && !hasResponded && !isAlreadyInAttendance && p.fcmToken) {
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
        
        if (player.status === 'active' && !hasResponded && !isAlreadyInAttendance) {
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

  const copyToWhatsApp = () => {
    const confirmed: Player[] = [];
    const addedIds = new Set<string>();

    (players || []).filter(p => intentions.responses[p.id] === 'GOING').forEach(p => {
      addedIds.add(p.id);
      confirmed.push(p);
    });

    Object.entries(intentions.responses || {}).forEach(([respId, status]) => {
      if (status === 'GOING' && !addedIds.has(respId)) {
        const canonical = idToCanonicalId?.[respId];
        if (canonical && addedIds.has(canonical)) return;
        addedIds.add(respId);
        confirmed.push({ id: respId, name: respId.startsWith('guest_') ? respId.replace('guest_', 'Convidado ') : respId, status: 'guest' } as Player);
      }
    });

    const goingPlayers = confirmed.sort((a, b) => {
      const timeA = getPlayerConfirmationTime(a);
      const timeB = getPlayerConfirmationTime(b);
      return timeA - timeB;
    });

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
