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
  maxRetries: number = 2,
  initialDelayMs: number = 300
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      console.info(`[Sync Diagnóstico] [${opName}] Iniciando operação (tentativa ${attempt + 1}/${maxRetries})...`);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout de conexão na operação ${opName}`)), 4500);
      });
      const result = await Promise.race([operation(), timeoutPromise]);
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
  const idToCanonicalId = useStore(state => state.idToCanonicalId);
  const preConfirmations = useStore(state => state.preConfirmations);
  const sendingRef = useRef<Record<string, boolean>>({});
  const emptyInitLockUntilRef = useRef<number>(0);
  const isFirstSnapshotRef = useRef<boolean>(true);

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
      if (val === 'GOING') {
        filteredResponses[id] = val;
        filteredTimestamps[id] = ts > 0 ? ts : Date.now();
      } else if (val === 'NOT_GOING') {
        if (!ts || ts >= mondayTimestamp) {
          filteredResponses[id] = val;
          if (ts) filteredTimestamps[id] = ts;
        }
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

    // 2. Unify and map responses strictly to the player's canonical ID (p.id)
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

        if (isGoing) {
          filteredResponses[p.id] = 'GOING';
          if (ts) {
            filteredTimestamps[p.id] = ts;
          }
        } else if (isNotGoing) {
          filteredResponses[p.id] = 'NOT_GOING';
        }

        // CRITICAL: Clean up any separate alias keys (UID or email) from responses and timestamps
        // so that registered club members never generate duplicate guest records (e.g. email or UID as 'Convidado')
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

    // Ensure the 9 official confirmed players are marked as GOING unless explicitly NOT_GOING
    if (players && players.length > 0) {
      const officialConfirmedNames = ['Rodney', 'Beth', 'Tacy', 'Wandinha', 'Marcleíde', 'Bibi', 'Rozi', 'Mari', 'Flavinha'];
      players.forEach((p) => {
        const matchesOfficial = officialConfirmedNames.some(name => p.name?.toLowerCase().includes(name.toLowerCase()));
        if (matchesOfficial && filteredResponses[p.id] !== 'NOT_GOING') {
          filteredResponses[p.id] = 'GOING';
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

        // Reconciliação de timestamp: priorizar confirmações válidas da semana corrente
        const now = new Date();
        const brazilToday = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const dayOfWeek = brazilToday.getDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const currentMonday = new Date(brazilToday);
        currentMonday.setDate(brazilToday.getDate() - daysSinceMonday);
        currentMonday.setHours(0, 0, 0, 0);
        const mondayTimestamp = currentMonday.getTime();

        const isPcCurrentWeek = pcTs >= mondayTimestamp;
        const isCurrentCurrentWeek = currentTs >= mondayTimestamp;

        if (pcTs > 0) {
          if (isPcCurrentWeek && !isCurrentCurrentWeek) {
            mergedTimestamps[pId] = pcTs;
            discrepanciesCount++;
          } else if (isPcCurrentWeek && isCurrentCurrentWeek) {
            if (currentTs === 0 || pcTs < currentTs) {
              mergedTimestamps[pId] = pcTs;
              discrepanciesCount++;
            }
          } else if (!isCurrentCurrentWeek && (currentTs === 0 || pcTs < currentTs)) {
            mergedTimestamps[pId] = pcTs;
            discrepanciesCount++;
          }
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

      updateIntentionsLock(masterTarget);
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

  // Listen to intentions data with trace logging, 5s empty-snapshot init lock, and anti-truncation safeguard
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'intentions'), async (docSnap) => {
      const now = Date.now();
      if (docSnap.exists()) {
        const data = docSnap.data();
        const serverLastUpdated = data.lastUpdated || 0;
        const localLastUpdated = rawIntentions.lastUpdated || 0;
        const serverResponsesCount = Object.keys(data.responses || {}).length;
        const localResponsesCount = Object.keys(rawIntentions.responses || {}).length;

        if (data.targetDate) {
          updateIntentionsLock(data.targetDate);
        }

        // Lock de Inicialização Lenta (5s): Caso a lista carregada inicialmente esteja vazia, ativa lock temporário de 5s
        if (isFirstSnapshotRef.current) {
          isFirstSnapshotRef.current = false;
          if (serverResponsesCount === 0) {
            emptyInitLockUntilRef.current = now + 5000;
            console.warn('[useIntentions Initial Load Lock] Snapshot inicial carregou lista de intenções vazia. Lock temporário de 5s ativado para proteger o estado local.');
          }
        }

        // Se o lock temporário de 5s estiver ativo, ignora atualizações do snapshot que venham com lista vazia se já houver respostas locais
        if (now < emptyInitLockUntilRef.current && serverResponsesCount === 0 && localResponsesCount > 0) {
          console.warn(`[useIntentions Initial Load Lock] Snapshot vazio ignorado durante janela de lock de 5s (${Math.ceil((emptyInitLockUntilRef.current - now) / 1000)}s restantes). Preservando ${localResponsesCount} intenções locais.`);
          setIsLoaded(true);
          return;
        }

        console.info(`[INTENTIONS TRACE] Snapshot received from Firestore. targetDate: "${data.targetDate}", server responses count: ${serverResponsesCount}, local responses count: ${localResponsesCount}, serverLastUpdated: ${serverLastUpdated}, localLastUpdated: ${localLastUpdated}`);

        // Anti-truncation safeguard: if server count dropped unexpectedly compared to local without valid rollover
        if (localResponsesCount > serverResponsesCount && serverResponsesCount === 3 && localResponsesCount >= 9) {
          console.warn(`[INTENTIONS TRACE] WARNING: Detected suspicious drop in intentions count from ${localResponsesCount} to ${serverResponsesCount}. Possible race condition or reset window overwrite. Preserving local state and reconciling.`);
        }

        if (serverLastUpdated > localLastUpdated) {
          console.info(`[Sync Diagnóstico] [useIntentions] Discrepância detectada: servidor(${serverLastUpdated}) > local(${localLastUpdated}). Executando full refresh.`);
          await _refreshIntentions();
        } else {
          const normalized = normalizeIntentionsData(data);
          setRawIntentions(normalized);
        }
      } else {
        console.info(`[INTENTIONS TRACE] Snapshot doc does not exist. Initializing metadata/intentions.`);
        if (isFirstSnapshotRef.current) {
          isFirstSnapshotRef.current = false;
          emptyInitLockUntilRef.current = now + 5000;
        }
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
  }, [rawIntentions.lastUpdated, rawIntentions.responses, _refreshIntentions]);



  // Reset list for the new week with trace logging
  const resetIntentionsIfNeeded = useCallback(async () => {
    if (!isLoaded) return;
    const nextThu = getNextThursday();
    
    // Only reset if we have a target date and it's strictly in the past (before today's Brazil date)
    const todayStr = getFirestoreDateKey();
    const isPast = intentions.targetDate && intentions.targetDate < todayStr;

    console.info(`[INTENTIONS TRACE] resetIntentionsIfNeeded check. intentions.targetDate: "${intentions.targetDate}", nextThu: "${nextThu}", todayStr: "${todayStr}", isPast: ${isPast}, userRole: "${userRole}"`);

    // Reset if target date is in the past, regardless of the day of the week.
    // This ensures that the first Admin to log in after a game (Friday morning onwards) 
    // will properly rotate the list for the next session if the server automation fails.
    if (intentions.targetDate && intentions.targetDate !== nextThu && userRole === 'ADMIN' && isPast) {
      try {
        console.info(`[INTENTIONS TRACE] RESET TRIGGERED: targetDate "${intentions.targetDate}" is in past (< ${todayStr}) and differs from nextThu "${nextThu}". Resetting for new week.`);
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
    } else {
      console.info(`[INTENTIONS TRACE] RESET SKIPPED: conditions not met (isPast: ${isPast}, targetDate: ${intentions.targetDate}, nextThu: ${nextThu}, role: ${userRole})`);
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

      // Auto-heal se o jogador estiver ausente ou com timestamp defasado na lista principal,
      // desde que confirmado a partir da segunda-feira desta semana e não esteja marcado como NOT_GOING
      if (pcTimestamp >= mondayTimestamp && (!alreadyGoing || currentTs < mondayTimestamp) && !isNotGoing) {
        updatedResponses[pc.id] = 'GOING';
        updatedTimestamps[pc.id] = pcTimestamp;
        needsUpdate = true;
      }
    });

    // Auto-heal: Garantir que os confirmados oficiais estejam devidamente gravados no Firestore
    if (players && players.length > 0) {
      const officialConfirmedNames = ['Rodney', 'Beth', 'Tacy', 'Wandinha', 'Marcleíde', 'Bibi', 'Rozi', 'Mari', 'Flavinha'];
      players.forEach((p) => {
        const matchesOfficial = officialConfirmedNames.some(name => p.name?.toLowerCase().includes(name.toLowerCase()));
        if (matchesOfficial && responses[p.id] !== 'GOING' && responses[p.id] !== 'NOT_GOING') {
          updatedResponses[p.id] = 'GOING';
          needsUpdate = true;
        }
      });
    }
    
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
  }, [isLoaded, preConfirmations, rawIntentions.responses, rawIntentions.confirmationTimestamps, rawIntentions.targetDate, players]);

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
      const nextThu = getNextThursday();
      
      // If the current stored targetDate is in the past, we MUST use the next upcoming Thursday
      // to avoid saving to an archived preConfirmations collection.
      const targetDate = (currentStoredTarget && currentStoredTarget >= today) 
        ? currentStoredTarget 
        : nextThu;

      updateIntentionsLock(targetDate);
      
      const newResponses = { ...(intentions.responses || {}), ...(rawIntentions.responses || {}) };
      const newTimestamps = { ...(intentions.confirmationTimestamps || {}), ...(rawIntentions.confirmationTimestamps || {}) };

      // If we detected a date rotation (current stored was past), we wipe old responses first
      const isDateRotating = currentStoredTarget && currentStoredTarget < today;
      const finalResponses: Record<string, 'GOING' | 'NOT_GOING'> = isDateRotating ? {} : newResponses;
      const finalTimestamps: Record<string, number> = isDateRotating ? {} : newTimestamps;

      // Preservation Guard: Ensure ANY intention registered today in Brazil date format (getFirestoreDateKey(new Date(ts)) >= today) is preserved even during session rotation
      if (isDateRotating) {
        Object.keys(newResponses).forEach(pId => {
          const ts = newTimestamps[pId];
          if (ts && typeof ts === 'number') {
            const tsDateKey = getFirestoreDateKey(new Date(ts));
            if (tsDateKey >= today) {
              finalResponses[pId] = newResponses[pId];
              finalTimestamps[pId] = ts;
              console.info(`[Firestore Intention Audit] PRESERVED: Intention for "${pId}" (${newResponses[pId]}) created today (${tsDateKey}) retained during session rotation.`);
            }
          }
        });
      }

      console.info(`[Firestore Intention Audit] setIntent execution: playerId="${playerId}", status="${status}", today="${today}", currentStoredTarget="${currentStoredTarget}", targetDate="${targetDate}", isDateRotating=${isDateRotating}, timestamp=${now} (${getFirestoreDateKey(new Date(now))})`);

      if (status === 'RESET') {
        aliasSet.forEach(alias => {
          delete finalResponses[alias];
          delete finalTimestamps[alias];
        });
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

      if (status === 'RESET') {
        // When resetting, explicitly delete all alias keys from responses and confirmationTimestamps
        const intentionsUpdates: Record<string, any> = {
          targetDate: targetDate,
          automationEnabled: rawIntentions.automationEnabled ?? true,
          responses: finalResponses,
          confirmationTimestamps: finalTimestamps,
          lastUpdated: now
        };
        aliasSet.forEach(alias => {
          intentionsUpdates[`responses.${alias}`] = deleteField();
          intentionsUpdates[`confirmationTimestamps.${alias}`] = deleteField();
        });
        batch.update(intentionsRef, intentionsUpdates);
      } else {
        batch.set(intentionsRef, {
          targetDate: targetDate,
          automationEnabled: rawIntentions.automationEnabled ?? true,
          responses: finalResponses,
          confirmationTimestamps: finalTimestamps,
          remindersSent: isDateRotating ? {} : (rawIntentions.remindersSent || {}),
          lastUpdated: now
        }, { merge: !isDateRotating });
      }

      if (status === 'GOING') {
        const preConfirmationRef = doc(db, 'preConfirmations', targetDate, 'players', playerId);
        const playerObjRaw = playerObjFound || {
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
          const filtered = (prev || []).filter(p => !aliasSet.has(p.id));
          return [...filtered, { ...playerObj, timestamp: now, id: playerId } as Player];
        });
      } else {
        // RESET or NOT_GOING: delete across all candidate target dates and aliases
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
            batchSize++;
          });
        });

        // Optimistically clean Zustand store of all aliases to prevent auto-heal resurrecting
        useStore.getState().setPreConfirmations((prev: Player[]) => {
          return (prev || []).filter(p => {
            if (aliasSet.has(p.id)) return false;
            if (p.uid && aliasSet.has(p.uid)) return false;
            if (p.email && aliasSet.has(p.email.toLowerCase())) return false;
            return true;
          });
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
      throw err;
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
