import { writeBatch, doc, collection, addDoc } from '../firebase';
import { Player, DbAnomalyItem, DbAutoCorrectionSummary, Gender } from '../types';

/**
 * Normalizes string for name matching (lowercased, stripped accents, trimmed)
 */
export const normalizeName = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * AI & Heuristic Scanner for Database Inconsistencies
 */
export const scanDatabaseAnomalies = (
  players: Player[],
  matches: any[],
  systemMetadata: any
): DbAnomalyItem[] => {
  const anomalies: DbAnomalyItem[] = [];

  // --- 1. Detect Duplicate Players (Same Normalized Name, Email, or Phone) ---
  const seenNameMap = new Map<string, Player>();
  const seenEmailMap = new Map<string, Player>();
  const seenPhoneMap = new Map<string, Player>();

  players.forEach((player) => {
    const normName = normalizeName(player.name);
    const email = player.email?.trim().toLowerCase();
    const phone = player.phone?.replace(/\D/g, '');

    // Name duplication check
    if (normName && normName !== 'jogador sem nome') {
      if (seenNameMap.has(normName)) {
        const primary = seenNameMap.get(normName)!;
        // Choose primary as the one with more matches played or older record
        const isCurrentBetterPrimary = (player.matchesPlayed || 0) > (primary.matchesPlayed || 0);
        const primaryPlayer = isCurrentBetterPrimary ? player : primary;
        const duplicatePlayer = isCurrentBetterPrimary ? primary : player;

        anomalies.push({
          id: `dup_name_${duplicatePlayer.id}`,
          type: 'DUPLICATE_PLAYER',
          title: `Atleta Duplicado: ${duplicatePlayer.name}`,
          description: `Nome idêntico detectado para IDs diferentes ("${duplicatePlayer.name}" - ID ${duplicatePlayer.id}). Mesclar com ${primaryPlayer.name} (ID ${primaryPlayer.id}).`,
          severity: 'HIGH',
          entityId: duplicatePlayer.id,
          entityName: duplicatePlayer.name,
          targetIdToMerge: primaryPlayer.id,
          suggestedAction: `Fundir dados estatísticos com ${primaryPlayer.name} e remover registro redundante.`
        });
      } else {
        seenNameMap.set(normName, player);
      }
    }

    // Email duplication check
    if (email) {
      if (seenEmailMap.has(email)) {
        const primary = seenEmailMap.get(email)!;
        if (primary.id !== player.id) {
          anomalies.push({
            id: `dup_email_${player.id}`,
            type: 'DUPLICATE_PLAYER',
            title: `E-mail Duplicado: ${email}`,
            description: `Mesmo e-mail cadastrado em dois perfis ("${player.name}" e "${primary.name}").`,
            severity: 'HIGH',
            entityId: player.id,
            entityName: player.name,
            targetIdToMerge: primary.id,
            suggestedAction: `Unificar perfis associados ao e-mail ${email}.`
          });
        }
      } else {
        seenEmailMap.set(email, player);
      }
    }

    // Phone duplication check
    if (phone && phone.length >= 8) {
      if (seenPhoneMap.has(phone)) {
        const primary = seenPhoneMap.get(phone)!;
        if (primary.id !== player.id && primary.name !== player.name) {
          anomalies.push({
            id: `dup_phone_${player.id}`,
            type: 'DUPLICATE_PLAYER',
            title: `Telefone Compartilhado/Duplicado: ${phone}`,
            description: `Atletas "${player.name}" e "${primary.name}" possuem o mesmo número de telefone.`,
            severity: 'MEDIUM',
            entityId: player.id,
            entityName: player.name,
            targetIdToMerge: primary.id,
            suggestedAction: `Verificar se correspondem ao mesmo sócio.`
          });
        }
      } else {
        seenPhoneMap.set(phone, player);
      }
    }

    // ELO corruption check
    if (player.elo === undefined || player.elo === null || isNaN(player.elo) || player.elo <= 0) {
      anomalies.push({
        id: `elo_invalid_${player.id}`,
        type: 'INVALID_ELO',
        title: `ELO Corrompido/Inválido: ${player.name}`,
        description: `O atleta possui pontuação ELO nula ou inválida (${player.elo}).`,
        severity: 'HIGH',
        entityId: player.id,
        entityName: player.name,
        suggestedAction: `Resetar/Normalizar ELO do atleta para o padrão (1200).`
      });
    }
  });

  // --- 2. Detect Corrupted Match Records ---
  matches.forEach((m) => {
    // Score 0-0 with winner declared
    if ((m.scoreA === 0 || m.scoreA === undefined) && (m.scoreB === 0 || m.scoreB === undefined) && m.winner) {
      anomalies.push({
        id: `match_score_0_${m.id}`,
        type: 'CORRUPTED_MATCH',
        title: `Partida sem Placar Registrado (ID: ${m.id})`,
        description: `Partida finalizada com vencedor "${m.winner}", porém com placar Zerado (0 x 0).`,
        severity: 'MEDIUM',
        entityId: m.id,
        suggestedAction: `Preencher placar padrão de vitória (25 x 23) no registro da partida.`
      });
    }

    // Invalid score numbers
    if ((m.scoreA < 0 || m.scoreB < 0) || (m.scoreA > 50 || m.scoreB > 50)) {
      anomalies.push({
        id: `match_score_inv_${m.id}`,
        type: 'CORRUPTED_MATCH',
        title: `Pontuação Incoerente na Partida (ID: ${m.id})`,
        description: `Placar de partida fora do escopo do vôlei (${m.scoreA} x ${m.scoreB}).`,
        severity: 'HIGH',
        entityId: m.id,
        suggestedAction: `Ajustar placar para limites aceitáveis do conjunto.`
      });
    }

    // Missing date or timestamp
    if (!m.date || !m.timestamp || isNaN(m.timestamp)) {
      anomalies.push({
        id: `match_date_inv_${m.id}`,
        type: 'DATE_DISCREPANCY',
        title: `Data de Partida Inconsistente (ID: ${m.id})`,
        description: `Registro de partida sem timestamp ou formato de data nulo.`,
        severity: 'LOW',
        entityId: m.id,
        suggestedAction: `Atribuir data atual do sistema ao registro.`
      });
    }
  });

  return anomalies;
};

/**
 * Executes Auto-Correction Operations in Firestore (Batch Execution)
 */
export const executeDbAutoCorrection = async (
  db: any,
  anomalies: DbAnomalyItem[],
  players: Player[],
  matches: any[]
): Promise<DbAutoCorrectionSummary> => {
  const batch = writeBatch(db);
  const logs: string[] = [];
  let duplicatePlayersMerged = 0;
  let matchesRepaired = 0;
  let eloStatsNormalized = 0;

  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  const duplicateMerges = anomalies.filter(a => a.type === 'DUPLICATE_PLAYER' && a.targetIdToMerge);
  const eloFixes = anomalies.filter(a => a.type === 'INVALID_ELO');
  const matchFixes = anomalies.filter(a => a.type === 'CORRUPTED_MATCH' || a.type === 'DATE_DISCREPANCY');

  // 1. Process Duplicate Players Merging
  for (const dup of duplicateMerges) {
    const dupPlayer = playerMap.get(dup.entityId);
    const targetPlayer = playerMap.get(dup.targetIdToMerge!);

    if (dupPlayer && targetPlayer && dupPlayer.id !== targetPlayer.id) {
      // Merge statistical counters
      const mergedWins = (targetPlayer.wins || 0) + (dupPlayer.wins || 0);
      const mergedLosses = (targetPlayer.losses || 0) + (dupPlayer.losses || 0);
      const mergedMatches = (targetPlayer.matchesPlayed || 0) + (dupPlayer.matchesPlayed || 0);
      const mergedPF = (targetPlayer.pointsFor || 0) + (dupPlayer.pointsFor || 0);
      const mergedPA = (targetPlayer.pointsAgainst || 0) + (dupPlayer.pointsAgainst || 0);

      // Preserve user authentication details
      const email = targetPlayer.email || dupPlayer.email || '';
      const uid = targetPlayer.uid || dupPlayer.uid || '';
      const phone = targetPlayer.phone || dupPlayer.phone || '';

      // Update primary player
      batch.set(doc(db, 'players', targetPlayer.id), {
        wins: mergedWins,
        losses: mergedLosses,
        matchesPlayed: mergedMatches,
        pointsFor: mergedPF,
        pointsAgainst: mergedPA,
        pointsBalance: mergedPF - mergedPA,
        email,
        uid,
        phone
      }, { merge: true });

      // Update references in all matches where dupPlayer ID appeared
      matches.forEach(m => {
        let matchUpdated = false;
        const updatedTeamA = (m.teamA?.players || []).map((p: any) => {
          if (p.id === dupPlayer.id) {
            matchUpdated = true;
            return { ...p, id: targetPlayer.id, name: targetPlayer.name };
          }
          return p;
        });

        const updatedTeamB = (m.teamB?.players || []).map((p: any) => {
          if (p.id === dupPlayer.id) {
            matchUpdated = true;
            return { ...p, id: targetPlayer.id, name: targetPlayer.name };
          }
          return p;
        });

        let updatedSetterA = m.teamA?.setter;
        if (updatedSetterA?.id === dupPlayer.id) {
          updatedSetterA = { ...updatedSetterA, id: targetPlayer.id, name: targetPlayer.name };
          matchUpdated = true;
        }

        let updatedSetterB = m.teamB?.setter;
        if (updatedSetterB?.id === dupPlayer.id) {
          updatedSetterB = { ...updatedSetterB, id: targetPlayer.id, name: targetPlayer.name };
          matchUpdated = true;
        }

        if (matchUpdated) {
          batch.set(doc(db, 'matches', m.id), {
            teamA: { ...m.teamA, players: updatedTeamA, setter: updatedSetterA },
            teamB: { ...m.teamB, players: updatedTeamB, setter: updatedSetterB }
          }, { merge: true });
          matchesRepaired++;
        }
      });

      // Delete the redundant duplicate player document
      batch.delete(doc(db, 'players', dupPlayer.id));
      duplicatePlayersMerged++;
      logs.push(`Fundido atleta duplicado "${dupPlayer.name}" (${dupPlayer.id}) -> Primário "${targetPlayer.name}" (${targetPlayer.id}).`);
    }
  }

  // 2. Process Corrupted Matches Repair
  for (const fix of matchFixes) {
    const match = matches.find(m => m.id === fix.entityId);
    if (match) {
      const updates: any = {};
      if ((match.scoreA === 0 || !match.scoreA) && (match.scoreB === 0 || !match.scoreB) && match.winner) {
        updates.scoreA = match.winner === 'A' ? 25 : 23;
        updates.scoreB = match.winner === 'B' ? 25 : 23;
      }
      if (!match.date || !match.timestamp || isNaN(match.timestamp)) {
        updates.timestamp = Date.now();
        updates.date = new Date().toISOString().split('T')[0];
      }
      batch.set(doc(db, 'matches', match.id), updates, { merge: true });
      matchesRepaired++;
      logs.push(`Partida #${match.id} corrigida com placar e data padronizados.`);
    }
  }

  // 3. Process Invalid ELO Normalization
  for (const fix of eloFixes) {
    const player = playerMap.get(fix.entityId);
    if (player) {
      batch.set(doc(db, 'players', player.id), {
        elo: 1200,
        eloHistory: [{ date: new Date().toISOString().split('T')[0], elo: 1200 }]
      }, { merge: true });
      eloStatsNormalized++;
      logs.push(`ELO do atleta "${player.name}" normalizado para 1200.`);
    }
  }

  // Commit Batch to Firestore
  if (duplicatePlayersMerged > 0 || matchesRepaired > 0 || eloStatsNormalized > 0) {
    await batch.commit();
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const summary: DbAutoCorrectionSummary = {
    timestamp: Date.now(),
    dateStr: todayStr,
    anomaliesDetected: anomalies,
    duplicatePlayersMerged,
    matchesRepaired,
    eloStatsNormalized,
    logs,
    status: anomalies.length > 0 ? 'SUCCESS' : 'CLEAN'
  };

  // Save audit log to Firestore
  try {
    await addDoc(collection(db, 'autocorrect_logs'), {
      ...summary,
      executedBy: 'Agente Sentinela IA / Auto-Correção',
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Falha ao salvar log de autocorreção no Firestore:', err);
  }

  return summary;
};
