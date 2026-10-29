import { Match, Player } from '../../types';
import { cleanObject } from '../../utils/helpers';

export interface ReprocessResult {
  updatedPlayers: Player[];
  updatedMatches: Match[];
}

/**
 * Recalcula o ranking (ELO), histórico e estatísticas de vitórias/derrotas de todos os sócios
 * a partir das partidas e dos bônus de fidelidade registrados.
 */
export function recalculateAllStatsFromMatches(
  currentPlayers: Player[],
  allMatches: Match[],
  todayDateKey: string,
  dailyAttendanceBonus: number = 10
): Player[] {
  // Ordena todas as partidas cronologicamente
  const sortedMatches = [...allMatches].sort((a, b) => {
    const timeA = a.timestamp || (a.endTime ? new Date(a.endTime).getTime() : 0);
    const timeB = b.timestamp || (b.endTime ? new Date(b.endTime).getTime() : 0);
    return timeA - timeB;
  });

  // Mapeia jogadores por ID
  const playerMap = new Map<string, Player>();
  currentPlayers.forEach(p => {
    playerMap.set(p.id, {
      ...p,
      elo: 1200, // ELO base inicial padrão
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      fidelityPoints: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsBalance: 0,
      dailyMatches: 0,
      dailyWins: 0,
      dailyLosses: 0,
      dailyEloGain: 0,
      dailyResults: [],
      eloHistory: [],
    });
  });

  // Eventos cronológicos combinando partidas e bônus de fidelidade baseados em ter jogado >= 2 partidas no dia
  interface TimelineEvent {
    type: 'MATCH' | 'FIDELITY';
    timestamp: number;
    date: string;
    match?: Match;
    playerId?: string;
    fidelityEntry?: any;
  }

  const events: TimelineEvent[] = [];
  const playerMatchesPerDate: Record<string, Record<string, number>> = {};
  const playerFidelityAwarded: Record<string, Set<string>> = {};

  // Adiciona eventos de partidas e dispara o bônus de fidelidade ao completar 2 partidas no dia
  sortedMatches.forEach(m => {
    const ts = m.timestamp || (m.endTime ? new Date(m.endTime).getTime() : 0);
    const date = m.date;
    events.push({
      type: 'MATCH',
      timestamp: ts,
      date: date,
      match: m
    });

    const participants = new Set([...(m.teamA || []), ...(m.teamB || [])]);
    participants.forEach(pid => {
      if (!playerMatchesPerDate[pid]) playerMatchesPerDate[pid] = {};
      playerMatchesPerDate[pid][date] = (playerMatchesPerDate[pid][date] || 0) + 1;

      if (playerMatchesPerDate[pid][date] === 2) {
        if (!playerFidelityAwarded[pid]) playerFidelityAwarded[pid] = new Set();
        if (!playerFidelityAwarded[pid].has(date)) {
          playerFidelityAwarded[pid].add(date);
          events.push({
            type: 'FIDELITY',
            timestamp: ts - 100,
            date: date,
            playerId: pid,
            fidelityEntry: {
              date: date,
              change: dailyAttendanceBonus,
              fidelityBonus: true,
              result: 'P',
              matchId: `fidelity-${date}-${pid}`
            }
          });
        }
      }
    });
  });

  // Ordena linha do tempo
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Processa cada evento
  events.forEach(ev => {
    if (ev.type === 'FIDELITY' && ev.playerId) {
      const p = playerMap.get(ev.playerId);
      if (!p) return;
      const change = ev.fidelityEntry.change || dailyAttendanceBonus;
      p.elo = (p.elo || 1200) + change;
      p.fidelityPoints = (p.fidelityPoints || 0) + change;
      // Garante que o eloHistory registre o estado acumulado
      const existing = (p.eloHistory || []).find(h => h.matchId === ev.fidelityEntry.matchId);
      if (existing) {
        existing.elo = p.elo;
      } else {
        p.eloHistory = p.eloHistory || [];
        p.eloHistory.push({
          date: ev.date,
          timestamp: ev.timestamp,
          elo: p.elo,
          change: change,
          fidelityBonus: true,
          result: 'P',
          matchId: ev.fidelityEntry.matchId || `fidelity-${ev.date}-${ev.timestamp}`
        });
      }
      if (ev.date === todayDateKey) {
        p.dailyEloGain = (p.dailyEloGain || 0) + change;
      }
    } else if (ev.type === 'MATCH' && ev.match) {
      const m = ev.match;
      if (!m.winner || (m.winner !== 'A' && m.winner !== 'B')) return;

      const teamAPlayers = m.teamA || [];
      const teamBPlayers = m.teamB || [];
      const isToday = m.date === todayDateKey;

      // Processa Time A
      teamAPlayers.forEach(pid => {
        const p = playerMap.get(pid);
        if (!p) return;
        const isWinner = m.winner === 'A';
        const eloChange = isWinner ? 20 : -20;
        p.elo = Math.max(800, (p.elo || 1200) + eloChange);
        p.matchesPlayed = (p.matchesPlayed || 0) + 1;
        p.pointsFor = (p.pointsFor || 0) + (m.scoreA || 0);
        p.pointsAgainst = (p.pointsAgainst || 0) + (m.scoreB || 0);
        p.pointsBalance = (p.pointsFor || 0) - (p.pointsAgainst || 0);
        if (isWinner) p.wins = (p.wins || 0) + 1;
        else p.losses = (p.losses || 0) + 1;

        p.eloHistory = p.eloHistory || [];
        p.eloHistory.push({
          date: m.date,
          timestamp: ev.timestamp,
          elo: p.elo,
          change: eloChange,
          result: isWinner ? 'V' : 'D',
          matchId: m.id
        });

        // Atualiza estado de rodagem
        p.playedLastMatch = true;
        p.consecutiveBenched = 0;

        if (isToday) {
          p.dailyMatches = (p.dailyMatches || 0) + 1;
          if (isWinner) p.dailyWins = (p.dailyWins || 0) + 1;
          else p.dailyLosses = (p.dailyLosses || 0) + 1;
          p.dailyEloGain = (p.dailyEloGain || 0) + eloChange;
          p.dailyResults = p.dailyResults || [];
          p.dailyResults.push(isWinner ? 'V' : 'D');
        }
      });

      // Processa Time B
      teamBPlayers.forEach(pid => {
        const p = playerMap.get(pid);
        if (!p) return;
        const isWinner = m.winner === 'B';
        const eloChange = isWinner ? 20 : -20;
        p.elo = Math.max(800, (p.elo || 1200) + eloChange);
        p.matchesPlayed = (p.matchesPlayed || 0) + 1;
        p.pointsFor = (p.pointsFor || 0) + (m.scoreB || 0);
        p.pointsAgainst = (p.pointsAgainst || 0) + (m.scoreA || 0);
        p.pointsBalance = (p.pointsFor || 0) - (p.pointsAgainst || 0);
        if (isWinner) p.wins = (p.wins || 0) + 1;
        else p.losses = (p.losses || 0) + 1;

        p.eloHistory = p.eloHistory || [];
        p.eloHistory.push({
          date: m.date,
          timestamp: ev.timestamp,
          elo: p.elo,
          change: eloChange,
          result: isWinner ? 'V' : 'D',
          matchId: m.id
        });

        // Atualiza estado de rodagem
        p.playedLastMatch = true;
        p.consecutiveBenched = 0;

        if (isToday) {
          p.dailyMatches = (p.dailyMatches || 0) + 1;
          if (isWinner) p.dailyWins = (p.dailyWins || 0) + 1;
          else p.dailyLosses = (p.dailyLosses || 0) + 1;
          p.dailyEloGain = (p.dailyEloGain || 0) + eloChange;
          p.dailyResults = p.dailyResults || [];
          p.dailyResults.push(isWinner ? 'V' : 'D');
        }
      });

      // Atualiza banco para quem não participou DESTA partida (apenas se a partida for da sessão atual)
      // Nota: Esta lógica é simplificada para manter o estado final coerente com o último jogo processado.
      const participants = new Set([...teamAPlayers, ...teamBPlayers]);
      playerMap.forEach((p, pid) => {
        if (!participants.has(pid)) {
          // Se a partida é do mesmo dia que a última partida conhecida do jogador (ou hoje), incrementamos o banco
          // Para simplificar, assumimos que se ele não jogou esta, ele estava no banco se a partida for do dia atual.
          if (m.date === todayDateKey) {
             p.playedLastMatch = false;
             p.consecutiveBenched = (p.consecutiveBenched || 0) + 1;
          }
        }
      });
    }
  });

  return Array.from(playerMap.values());
}
