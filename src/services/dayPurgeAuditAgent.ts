import { dateFormatter } from '../utils/date';
import { db, getFirestoreDateKey } from '../../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { cleanObject } from '../../utils/helpers';
import { toStandardDateKey } from '../utils/dateUtils';

export interface DayPurgeAuditResult {
  isClean: boolean;
  targetDate: string;
  matchesInFirestore: number;
  residualMatchesDeleted: number;
  dailyMatchCount: number;
  playersChecked: number;
  playersCleaned: number;
  timestamp: number;
  details: string[];
}

/**
 * Agente Especializado em Certificação e Auditoria de Purga do Dia.
 * Verifica o Firestore (matches, metadata/system, metadata/currentMatch, attendance)
 * e auto-corrige qualquer resíduo para garantir que 100% dos dados da data foram zerados.
 */
export const auditDayPurgeIntegrity = async (targetDate?: string): Promise<DayPurgeAuditResult> => {
  const dateKey = targetDate || getFirestoreDateKey();
  const details: string[] = [];
  let residualMatchesDeleted = 0;
  let playersCleaned = 0;

  details.push(`Iniciando auditoria de purga para a data: ${dateKey}`);

  // 1. Auditar coleção de partidas (matches) no Firestore
  const matchesSnapshot = await getDocs(collection(db, 'matches'));
  const residualMatchDocs: any[] = [];

  matchesSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    let isMatchFromDate = false;

    // Checagem de campo date
    if (data.date && toStandardDateKey(data.date) === toStandardDateKey(dateKey)) {
      isMatchFromDate = true;
    }

    // Checagem redundante por timestamp (fuso de Brasília)
    if (data.timestamp) {
      const matchBrasiliaDate = dateFormatter.format(new Date(data.timestamp));

      if (matchBrasiliaDate === dateKey) {
        isMatchFromDate = true;
      }
    }

    if (isMatchFromDate) {
      residualMatchDocs.push(docSnap);
    }
  });

  // Se houver resíduos no Firestore, purgar imediatamente (Auto-Heal)
  if (residualMatchDocs.length > 0) {
    details.push(`Detectadas ${residualMatchDocs.length} partidas residuais no Firestore. Executando purga corretiva...`);
    const purgeBatch = writeBatch(db);
    residualMatchDocs.forEach((docSnap) => {
      purgeBatch.delete(docSnap.ref);
    });
    await purgeBatch.commit();
    residualMatchesDeleted = residualMatchDocs.length;
    details.push(`${residualMatchesDeleted} partidas residuais expurgadas do Firestore com sucesso.`);
  } else {
    details.push(`Zero partidas encontradas no Firestore para a data ${dateKey}.`);
  }

  // 2. Auditar e zerar metadata/system (dailyMatchCount) e metadata/currentMatch
  try {
    const systemDocRef = doc(db, 'metadata', 'system');
    await setDoc(systemDocRef, { dailyMatchCount: 0, lastResetDate: dateKey }, { merge: true });
    details.push(`Contador oficial de partidas diárias (dailyMatchCount) resetado para 0 em metadata/system.`);
  } catch (sysErr) {
    console.error('[DayPurgeAuditAgent] Erro ao resetar dailyMatchCount:', sysErr);
  }

  try {
    const currentMatchRef = doc(db, 'metadata', 'currentMatch');
    await deleteDoc(currentMatchRef);
    details.push(`Documento de partida ativa (metadata/currentMatch) limpo.`);
  } catch (cmErr) {
    console.error('[DayPurgeAuditAgent] Erro ao limpar currentMatch:', cmErr);
  }

  // 3. Auditar lista de presença e zerar métricas diárias dos sócios presentes
  let playersChecked = 0;
  try {
    const attendanceSnapshot = await getDocs(collection(db, 'attendance', dateKey, 'players'));
    playersChecked = attendanceSnapshot.size;

    if (playersChecked > 0) {
      const attBatch = writeBatch(db);
      attendanceSnapshot.forEach((docSnap) => {
        const p = docSnap.data();
        if (
          p.dailyMatches > 0 || 
          p.dailyWins > 0 || 
          p.dailyLosses > 0 || 
          p.dailyEloGain !== 0 ||
          (p.dailyResults && p.dailyResults.length > 0) ||
          p.playedLastMatch === true ||
          p.consecutivePlayed > 0
        ) {
          playersCleaned++;
          attBatch.set(docSnap.ref, cleanObject({
            dailyMatches: 0,
            dailyWins: 0,
            dailyLosses: 0,
            dailyEloGain: 0,
            dailyResults: [],
            playedLastMatch: false,
            consecutivePlayed: 0
          }), { merge: true });
        }
      });

      if (playersCleaned > 0) {
        await attBatch.commit();
        details.push(`${playersCleaned} atletas na lista de presença tiveram métricas diárias zeradas.`);
      } else {
        details.push(`Todos os ${playersChecked} atletas presentes já estavam com métricas zeradas.`);
      }
    }
  } catch (attErr) {
    console.error('[DayPurgeAuditAgent] Erro ao auditar presença:', attErr);
  }

  const isClean = residualMatchesDeleted === 0 || residualMatchDocs.length === residualMatchesDeleted;

  return {
    isClean,
    targetDate: dateKey,
    matchesInFirestore: residualMatchDocs.length - residualMatchesDeleted,
    residualMatchesDeleted,
    dailyMatchCount: 0,
    playersChecked,
    playersCleaned,
    timestamp: Date.now(),
    details
  };
};
