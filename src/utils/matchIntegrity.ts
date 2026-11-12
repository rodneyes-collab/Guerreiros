import { Match } from '../../types';
import { db } from '../../firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { toStandardDateKey } from './dateUtils';

/**
 * Converte um timestamp numérico ou string de data para o formato canônico 'YYYY-MM-DD'
 * no fuso horário oficial de Brasília (America/Sao_Paulo).
 */
export const toCanonicalDateString = (timestampOrDate: number | string): string => {
  if (typeof timestampOrDate === 'number') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(timestampOrDate));
  }

  if (typeof timestampOrDate === 'string' && timestampOrDate.trim()) {
    const trimmed = timestampOrDate.trim();
    // Trata formato ISO com horário (ex: 2026-11-05T20:14:33.000Z)
    if (trimmed.includes('T')) {
      const parsedTs = Date.parse(trimmed);
      if (!isNaN(parsedTs)) {
        return toCanonicalDateString(parsedTs);
      }
    }
    return toStandardDateKey(trimmed);
  }

  return '';
};

/**
 * Padroniza o campo 'date' de um registro de partida para o formato estrito 'YYYY-MM-DD',
 * utilizando o timestamp oficial de Brasília como fonte primária ou a string de data normalizada.
 */
export const standardizeMatchDateFormat = (match: Match): Match => {
  if (!match) return match;

  let canonicalDate = '';

  // 1. Prioridade para o timestamp oficial de realização da partida no fuso de Brasília
  if (match.timestamp && typeof match.timestamp === 'number' && !isNaN(match.timestamp)) {
    canonicalDate = toCanonicalDateString(match.timestamp);
  }

  // 2. Fallback para a propriedade 'date' existente caso o timestamp esteja ausente
  if (!canonicalDate && match.date) {
    canonicalDate = toCanonicalDateString(match.date);
  }

  // 3. Fallback final para hoje se ambos estiverem ausentes
  if (!canonicalDate) {
    canonicalDate = toCanonicalDateString(Date.now());
  }

  // Se a data já for estritamente igual, retorna a referência original para evitar renders desnecessários
  if (match.date === canonicalDate) {
    return match;
  }

  return {
    ...match,
    date: canonicalDate
  };
};

/**
 * Processa e padroniza uma lista completa de partidas, garantindo que 100% dos registros
 * possuam a data formatada como 'YYYY-MM-DD' antes da renderização no histórico e rankings.
 */
export const standardizeMatchesList = (matches: Match[]): Match[] => {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return matches.map(standardizeMatchDateFormat);
};

export interface DateIntegrityReport {
  targetDate: string;
  totalMatches: number;
  matchesWithStandardDate: number;
  matchesFixedInMemory: number;
  attendanceVerified: boolean;
  attendanceAthletesCount: number;
  anomalies: string[];
}

/**
 * Verifica a integridade dos dados no Firestore para uma data específica.
 * Confirma o formato 'YYYY-MM-DD', valida contra a lista oficial de presença (attendance)
 * e opcionalmente corrige documentos no Firestore com datas fora do padrão.
 */
export const verifyFirestoreMatchDateIntegrity = async (
  specificDate: string,
  options?: { autoFixFirestore?: boolean }
): Promise<DateIntegrityReport> => {
  const stdDate = toCanonicalDateString(specificDate);
  const anomalies: string[] = [];

  // 1. Buscar todas as partidas no Firestore
  const matchesSnap = await getDocs(collection(db, 'matches'));
  let totalMatchesForDate = 0;
  let matchesWithStandardDate = 0;
  let matchesFixedInMemory = 0;
  const docsToFix: { id: string; correctDate: string }[] = [];

  matchesSnap.forEach(d => {
    const data = d.data() as Match;
    const matchId = d.id;
    const directDate = data.date ? toStandardDateKey(data.date) : '';
    const tsDate = data.timestamp ? toCanonicalDateString(data.timestamp) : '';

    const belongsToDate = directDate === stdDate || tsDate === stdDate;
    if (belongsToDate) {
      totalMatchesForDate++;
      if (data.date === stdDate) {
        matchesWithStandardDate++;
      } else {
        matchesFixedInMemory++;
        docsToFix.push({ id: matchId, correctDate: stdDate });
        anomalies.push(`Partida ID "${matchId}" com data não-padronizada: "${data.date}" (esperado: "${stdDate}")`);
      }

      // Validar coerência entre timestamp e date
      if (tsDate && directDate && tsDate !== directDate) {
        anomalies.push(`Divergência de fuso na Partida "${matchId}": timestamp indica "${tsDate}", mas date era "${directDate}"`);
      }
    }
  });

  // 2. Verificar lista de presença oficial do dia no Firestore
  let attendanceCount = 0;
  let attendanceVerified = false;
  try {
    const attSnap = await getDocs(collection(db, 'attendance', stdDate, 'players'));
    attendanceCount = attSnap.size;
    attendanceVerified = attendanceCount > 0;
    if (!attendanceVerified && totalMatchesForDate > 0) {
      anomalies.push(`Alerta de Integridade: Encontradas ${totalMatchesForDate} partidas para ${stdDate}, mas a lista oficial de presença (attendance/${stdDate}/players) consta vazia no Firestore.`);
    }
  } catch (err: any) {
    anomalies.push(`Erro ao consultar attendance/${stdDate}/players: ${err?.message || err}`);
  }

  // 3. Auto-fix no Firestore se solicitado
  if (options?.autoFixFirestore && docsToFix.length > 0) {
    const batch = writeBatch(db);
    docsToFix.forEach(item => {
      const ref = doc(db, 'matches', item.id);
      batch.update(ref, { date: item.correctDate });
    });
    await batch.commit();
    console.info(`[Integridade Firestore] Auto-fix executado: ${docsToFix.length} partidas atualizadas com date="${stdDate}".`);
  }

  return {
    targetDate: stdDate,
    totalMatches: totalMatchesForDate,
    matchesWithStandardDate,
    matchesFixedInMemory,
    attendanceVerified,
    attendanceAthletesCount: attendanceCount,
    anomalies
  };
};
