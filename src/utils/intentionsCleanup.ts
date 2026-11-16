import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  writeBatch,
  getFirestoreDateKey,
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
 * REGRA OFICIAL DO CLUBE:
 * O ciclo da lista de intenção encerra na Quinta-feira e zera na Sexta-feira às 00:00:00 (BRT).
 */
export function getWeeklyCutoffTimestamp(targetThursdayStr?: string): WeeklyCutoffInfo {
  const now = Date.now();
  const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  try {
    const thursdayStr =
      targetThursdayStr && /^\d{4}-\d{2}-\d{2}$/.test(targetThursdayStr)
        ? targetThursdayStr
        : getNextThursday();

    const thursdayMidnightBRT = new Date(`${thursdayStr}T00:00:00-03:00`).getTime();
    const fridayCutoffTimestamp = thursdayMidnightBRT - SIX_DAYS_MS;
    const fridayDateKey = getFirestoreDateKey(new Date(fridayCutoffTimestamp));

    return {
      sevenDaysAgo,
      mondayTimestamp: fridayCutoffTimestamp,
      cutoffTimestamp: fridayCutoffTimestamp,
      mondayDateKey: fridayDateKey
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

export function isValidWeeklyConfirmationTimestamp(
  ts?: number | null,
  targetThursdayStr?: string
): boolean {
  if (!ts || typeof ts !== 'number' || isNaN(ts) || ts <= 0) return false;
  const { cutoffTimestamp } = getWeeklyCutoffTimestamp(targetThursdayStr);
  return ts >= cutoffTimestamp;
}

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
        lower.startsWith('stale_intentions')
      ) {
        window.localStorage.removeItem(key);
        purgedKeys++;
      }
    }
  } catch (err) {}

  return purgedKeys;
}

export interface AdminCleanupResult {
  purgedResponsesCount: number;
  purgedPreConfirmationsCount: number;
  purgedLocalStorageKeys: number;
  preservedActiveConfirmations: number;
  cutoffTimestamp: number;
}

export async function runAdminIntentionsCleanupOnLoad(options: {
  currentTargetDate?: string;
  players?: Player[];
  idToCanonicalId?: Record<string, string>;
}): Promise<AdminCleanupResult> {
  const todayStr = getFirestoreDateKey();
  const nextThu = getNextThursday();
  const { cutoffTimestamp } = getWeeklyCutoffTimestamp(nextThu);
  const purgedLocalStorageKeys = purgeStaleLocalStorageIntentions(nextThu);

  let purgedResponsesCount = 0;
  let purgedPreConfirmationsCount = 0;

  try {
    const intentionsRef = doc(db, 'metadata', 'intentions');
    const metaSnap = await getDoc(intentionsRef);
    if (!metaSnap.exists()) {
      return {
        purgedResponsesCount: 0,
        purgedPreConfirmationsCount: 0,
        purgedLocalStorageKeys,
        preservedActiveConfirmations: 0,
        cutoffTimestamp
      };
    }

    const metaData = metaSnap.data();
    const storedTargetDate = metaData.targetDate || nextThu;

    // Só escreve no banco se a quinta-feira salva já tiver passado
    if (storedTargetDate < todayStr) {
      const batch = writeBatch(db);
      batch.set(intentionsRef, {
        targetDate: nextThu,
        automationEnabled: metaData.automationEnabled ?? true,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {},
        lastUpdated: Date.now()
      });

      const oldSnap = await getDocs(collection(db, 'preConfirmations', storedTargetDate, 'players'));
      oldSnap.forEach(d => {
        batch.delete(d.ref);
        purgedPreConfirmationsCount++;
      });

      await batch.commit();
      purgedResponsesCount = Object.keys(metaData.responses || {}).length;
    }

    return {
      purgedResponsesCount,
      purgedPreConfirmationsCount,
      purgedLocalStorageKeys,
      preservedActiveConfirmations: Object.keys(metaData.responses || {}).length,
      cutoffTimestamp
    };
  } catch (error) {
    return {
      purgedResponsesCount,
      purgedPreConfirmationsCount,
      purgedLocalStorageKeys,
      preservedActiveConfirmations: 0,
      cutoffTimestamp
    };
  }
}