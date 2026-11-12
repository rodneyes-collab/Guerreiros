import {
  db,
  doc,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  setDoc,
  deleteDoc,
  getFirestoreDateKey,
  getBrazilDay,
  getNextThursday
} from '../../firebase';
import { Player } from '../../types';
import { useStore } from '../../store';

export interface WeeklyCutoffInfo {
  sevenDaysAgo: number;
  mondayTimestamp: number;
  cutoffTimestamp: number;
  mondayDateKey: string;
}

/**
 * Calcula o timestamp limite da semana atual (Segunda-feira 00:00:00 no horário de Brasília)
 * e o limite estrito de 7 dias atrás, retornando o mais restritivo (`Math.max(sevenDaysAgo, mondayTimestamp)`).
 * Garante que confirmações da semana passada ou com mais de 7 dias jamais sejam exibidas.
 */
export function getWeeklyCutoffTimestamp(): WeeklyCutoffInfo {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  try {
    const todayStr = getFirestoreDateKey();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = getBrazilDay(); // 0 (Dom) a 6 (Sáb)
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    const mondayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const mondayTimestamp = new Date(`${mondayStr}T00:00:00-03:00`).getTime();

    return {
      sevenDaysAgo,
      mondayTimestamp,
      cutoffTimestamp: mondayTimestamp, // Estritamente a partir de segunda-feira 00:00 da semana corrente
      mondayDateKey: mondayStr
    };
  } catch (err) {
    return {
      sevenDaysAgo,
      mondayTimestamp: sevenDaysAgo,
      cutoffTimestamp: sevenDaysAgo,
      mondayDateKey: ''
    };
  }
}

/**
 * Valida se um timestamp de confirmação pertence estritamente à semana vigente e últimos 7 dias.
 */
export function isValidWeeklyConfirmationTimestamp(ts?: number | null): boolean {
  if (!ts || typeof ts !== 'number' || isNaN(ts) || ts <= 0) return false;
  const { cutoffTimestamp } = getWeeklyCutoffTimestamp();
  return ts >= cutoffTimestamp;
}

/**
 * Limpa chaves obsoletas relacionadas à lista de intenção no localStorage do navegador/celular.
 */
export function purgeStaleLocalStorageIntentions(currentTargetDate?: string): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  const target = currentTargetDate || getNextThursday();
  let purgedKeys = 0;

  try {
    const resetDate = window.localStorage.getItem('intentions_reset_date');
    if (resetDate && resetDate !== target) {
      window.localStorage.removeItem('intentions_reset_date');
      purgedKeys++;
    }

    const keysToInspect: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) keysToInspect.push(k);
    }

    for (const key of keysToInspect) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith('intentions_cache') ||
        lower.startsWith('preconfirmations_cache') ||
        lower.startsWith('stale_intentions') ||
        (lower.includes('intention') && key !== 'intentions_reset_date' && key !== 'intentions_cleanup_last_run')
      ) {
        window.localStorage.removeItem(key);
        purgedKeys++;
      }
    }
  } catch (err) {
    console.warn('[IntentionsCleanup] Aviso ao limpar chaves locais de intenção:', err);
  }

  return purgedKeys;
}

/**
 * Calcula datas de quintas-feiras anteriores para varredura e expurgo de subcoleções antigas.
 */
function getPastThursdayDates(currentTargetDate: string, weeksBack: number = 4): string[] {
  const result: string[] = [];
  try {
    const [y, m, d] = currentTargetDate.split('-').map(Number);
    if (!y || !m || !d) return result;
    for (let w = 1; w <= weeksBack; w++) {
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - w * 7);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      result.push(dateStr);
    }
  } catch (err) {
    // Ignore parse error
  }
  return result;
}

export interface AdminCleanupResult {
  purgedResponsesCount: number;
  purgedPreConfirmationsCount: number;
  purgedLocalStorageKeys: number;
  preservedActiveConfirmations: number;
  cutoffTimestamp: number;
}

/**
 * Função automatizada executada ao carregar o app para ADMINs:
 * 1. Expurga entradas de 'Intention' (metadata/intentions e preConfirmations) mais antigas que 7 dias
 *    ou anteriores à segunda-feira 00:00 da semana atual.
 * 2. Remove subcoleções de preConfirmations de semanas anteriores.
 * 3. Limpa dados obsoletos do localStorage do aplicativo móvel.
 * 4. Preserva e reconcilia confirmações legítimas feitas na semana corrente.
 */
export async function runAdminIntentionsCleanupOnLoad(options: {
  currentTargetDate?: string;
  players?: Player[];
  idToCanonicalId?: Record<string, string>;
}): Promise<AdminCleanupResult> {
  const nextThu = options.currentTargetDate || getNextThursday();
  const players = options.players || useStore.getState().players || [];
  const idToCanonicalId = options.idToCanonicalId || useStore.getState().idToCanonicalId || {};
  const { cutoffTimestamp } = getWeeklyCutoffTimestamp();

  let purgedResponsesCount = 0;
  let purgedPreConfirmationsCount = 0;
  const purgedLocalStorageKeys = purgeStaleLocalStorageIntentions(nextThu);

  const resolveCanonicalId = (rawId: string): string => {
    const clean = rawId.trim();
    if (idToCanonicalId[clean]) return idToCanonicalId[clean];
    const matched = players.find(
      p =>
        p.id === clean ||
        (p.uid && p.uid.toLowerCase() === clean.toLowerCase()) ||
        (p.email && p.email.toLowerCase() === clean.toLowerCase())
    );
    return matched ? matched.id : clean;
  };

  try {
    // 1. Expurgar subcoleções preConfirmations de semanas anteriores
    const pastDates = getPastThursdayDates(nextThu, 4);
    for (const pastDate of pastDates) {
      try {
        let pastSnap;
        try {
          pastSnap = await getDocsFromServer(collection(db, 'preConfirmations', pastDate, 'players'));
        } catch {
          pastSnap = await getDocs(collection(db, 'preConfirmations', pastDate, 'players'));
        }
        for (const docSnap of pastSnap.docs) {
          await deleteDoc(doc(db, 'preConfirmations', pastDate, 'players', docSnap.id));
          purgedPreConfirmationsCount++;
        }
      } catch (e) {
        // Ignora falha silenciosa em datas passadas
      }
    }

    // 2. Ler metadata/intentions diretamente do servidor
    const intentionsRef = doc(db, 'metadata', 'intentions');
    let metaSnap;
    try {
      metaSnap = await getDocFromServer(intentionsRef);
    } catch {
      metaSnap = await getDoc(intentionsRef);
    }

    const metaData = metaSnap.exists() ? metaSnap.data() : {};
    const storedTargetDate = metaData.targetDate || nextThu;

    // Se o targetDate salvo for diferente de nextThu e anterior, limpar preConfirmations dele também
    if (storedTargetDate && storedTargetDate < nextThu && !pastDates.includes(storedTargetDate)) {
      try {
        const oldTargetSnap = await getDocs(collection(db, 'preConfirmations', storedTargetDate, 'players'));
        for (const d of oldTargetSnap.docs) {
          await deleteDoc(doc(db, 'preConfirmations', storedTargetDate, 'players', d.id));
          purgedPreConfirmationsCount++;
        }
      } catch {}
    }

    // 3. Auditar preConfirmations da semana atual (nextThu)
    let currentPreConfSnap;
    try {
      currentPreConfSnap = await getDocsFromServer(collection(db, 'preConfirmations', nextThu, 'players'));
    } catch {
      currentPreConfSnap = await getDocs(collection(db, 'preConfirmations', nextThu, 'players'));
    }

    const validPreConfTimestamps: Record<string, number> = {};
    const validPreConfPlayers: Player[] = [];

    for (const d of currentPreConfSnap.docs) {
      const pData = d.data();
      const rawId = d.id;
      const canonicalId = resolveCanonicalId(rawId);
      const pcTs = Number(pData.timestamp || 0);
      const metaTs = Number(metaData?.confirmationTimestamps?.[canonicalId] || metaData?.confirmationTimestamps?.[rawId] || 0);
      const effectiveTs = pcTs > 0 ? pcTs : metaTs;

      if (!effectiveTs || effectiveTs < cutoffTimestamp) {
        // Documento mais antigo que 7 dias ou da semana passada -> Excluir
        await deleteDoc(doc(db, 'preConfirmations', nextThu, 'players', rawId));
        purgedPreConfirmationsCount++;
      } else {
        validPreConfTimestamps[canonicalId] = validPreConfTimestamps[canonicalId]
          ? Math.min(validPreConfTimestamps[canonicalId], effectiveTs)
          : effectiveTs;

        // Reparar dados do jogador no documento se foi gravado apenas com ID
        const matchedPlayer = players.find(p => p.id === canonicalId);
        if (matchedPlayer && (!pData.name || pData.name === rawId || pData.name === canonicalId)) {
          await setDoc(
            doc(db, 'preConfirmations', nextThu, 'players', canonicalId),
            {
              ...matchedPlayer,
              id: canonicalId,
              timestamp: effectiveTs
            },
            { merge: true }
          );
        }

        // Se estava salvo sob alias, remover o doc de alias duplicado
        if (rawId !== canonicalId) {
          await deleteDoc(doc(db, 'preConfirmations', nextThu, 'players', rawId));
          purgedPreConfirmationsCount++;
        } else {
          validPreConfPlayers.push({
            ...(matchedPlayer || (pData as Player)),
            id: canonicalId,
            timestamp: effectiveTs
          } as Player);
        }
      }
    }

    // 4. Auditar e limpar responses e confirmationTimestamps em metadata/intentions
    const rawResponses: Record<string, 'GOING' | 'NOT_GOING'> = { ...(metaData.responses || {}) };
    const rawTimestamps: Record<string, number> = { ...(metaData.confirmationTimestamps || {}) };

    // Também extrair eventuais chaves flat com ponto
    Object.keys(metaData).forEach(k => {
      if (k.startsWith('responses.')) {
        const id = k.substring('responses.'.length).trim();
        if (metaData[k] === 'GOING' || metaData[k] === 'NOT_GOING') {
          rawResponses[id] = metaData[k];
        }
      } else if (k.startsWith('confirmationTimestamps.')) {
        const id = k.substring('confirmationTimestamps.'.length).trim();
        const val = Number(metaData[k]);
        if (!isNaN(val) && val > 0) {
          rawTimestamps[id] = val;
        }
      }
    });

    const cleanResponses: Record<string, 'GOING' | 'NOT_GOING'> = {};
    const cleanTimestamps: Record<string, number> = {};
    let needsMetadataWrite = storedTargetDate !== nextThu;

    for (const [rawId, status] of Object.entries(rawResponses)) {
      const canonicalId = resolveCanonicalId(rawId);
      if (rawId !== canonicalId) {
        needsMetadataWrite = true;
      }

      const ts = Number(rawTimestamps[rawId] || rawTimestamps[canonicalId] || validPreConfTimestamps[canonicalId] || 0);

      // Regra estrita: SOMENTE confirmações desta semana e dentro de 7 dias (ts >= cutoffTimestamp) permanecem
      if (!ts || ts < cutoffTimestamp) {
        purgedResponsesCount++;
        needsMetadataWrite = true;
        continue;
      }

      // Verificar se o sócio existe e está ativo (ou se os players ainda não carregaram, preservar ID válido)
      if (players.length > 0) {
        const matchedPlayer = players.find(p => p.id === canonicalId);
        if (matchedPlayer) {
          const isEligible =
            (matchedPlayer.status === 'active' || matchedPlayer.status === 'guest' || !matchedPlayer.status) &&
            !matchedPlayer.isDM &&
            matchedPlayer.status !== 'dm';
          if (!isEligible) {
            purgedResponsesCount++;
            needsMetadataWrite = true;
            continue;
          }
        }
      }

      cleanResponses[canonicalId] = status;
      cleanTimestamps[canonicalId] = cleanTimestamps[canonicalId]
        ? Math.min(cleanTimestamps[canonicalId], ts)
        : ts;
    }

    // Reconciliar confirmações válidas de preConfirmations desta semana que possam faltar no mapa responses
    for (const [canonicalId, pcTs] of Object.entries(validPreConfTimestamps)) {
      if (!cleanResponses[canonicalId] && pcTs >= cutoffTimestamp) {
        cleanResponses[canonicalId] = 'GOING';
        cleanTimestamps[canonicalId] = pcTs;
        needsMetadataWrite = true;
      }
    }

    // Verificar timestamps órfãos em rawTimestamps que não têm resposta válida
    for (const rawId of Object.keys(rawTimestamps)) {
      const canonicalId = resolveCanonicalId(rawId);
      if (!cleanResponses[canonicalId] || rawId !== canonicalId) {
        needsMetadataWrite = true;
      }
    }

    if (needsMetadataWrite || purgedResponsesCount > 0 || purgedPreConfirmationsCount > 0) {
      await setDoc(intentionsRef, {
        targetDate: nextThu,
        automationEnabled: metaData.automationEnabled ?? true,
        responses: cleanResponses,
        confirmationTimestamps: cleanTimestamps,
        remindersSent: storedTargetDate === nextThu ? (metaData.remindersSent || {}) : {},
        lastUpdated: Date.now()
      });
    }

    if (validPreConfPlayers.length >= 0) {
      useStore.getState().setPreConfirmations(validPreConfPlayers);
    }

    const totalPurgedCount = purgedResponsesCount + purgedPreConfirmationsCount + purgedLocalStorageKeys;
    const now = Date.now();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const lastPurgeDateStr = formatter.format(new Date(now));

    const report: AdminCleanupResult & {
      lastPurgeTimestamp: number;
      lastPurgeDateStr: string;
      totalPurgedCount: number;
      targetDate: string;
      status: 'SUCCESS' | 'ERROR';
    } = {
      lastPurgeTimestamp: now,
      lastPurgeDateStr,
      purgedResponsesCount,
      purgedPreConfirmationsCount,
      purgedLocalStorageKeys,
      totalPurgedCount,
      preservedActiveConfirmations: Object.keys(cleanResponses).length,
      targetDate: nextThu,
      cutoffTimestamp,
      status: 'SUCCESS'
    };

    try {
      await setDoc(doc(db, 'metadata', 'intentions_cleanup_status'), report, { merge: true });
    } catch (saveErr) {
      console.warn('[IntentionsCleanup] Aviso ao salvar relatório de limpeza no Firestore:', saveErr);
    }

    console.info('[IntentionsCleanup] Limpeza automática concluída:', report);

    return report;
  } catch (error) {
    console.error('[IntentionsCleanup] Erro durante limpeza automática de intenções:', error);
    return {
      purgedResponsesCount,
      purgedPreConfirmationsCount,
      purgedLocalStorageKeys,
      preservedActiveConfirmations: 0,
      cutoffTimestamp
    };
  }
}
