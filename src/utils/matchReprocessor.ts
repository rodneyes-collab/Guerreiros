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
  todayDateKey: string
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
    // Mantém as entradas de bônus de presença (fidelity bonus) já existentes no histórico do atleta
    const fidelityEntries = (p.eloHistory || []).filter(h => h.fidelityBonus || h.result === 'P');

    playerMap.set(p.id, {
      ...p,
      elo: 1200, // ELO base inicial padrão
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsBalance: 0,
      dailyMatches: 0,
      dailyWins: 0,
      dailyLosses: 0,
      dailyEloGain: 0,
      dailyResults: [],
      // Inicializa histórico com bônus de fidelidade preservados
      eloHistory: fidelityEntries.map(f => ({ ...f })),
    });
  });

  // Eventos cronológicos combinando partidas e bônus de fidelidade
  interface TimelineEvent {
    type: 'MATCH' | 'FIDELITY';
    timestamp: number;
    date: string;
    match?: Match;
    playerId?: string;
    fidelityEntry?: any;
  }

  const events: TimelineEvent[] = [];

  // Adiciona eventos de partidas
  sortedMatches.forEach(m => {
    const ts = m.timestamp || (m.endTime ? new Date(m.endTime).getTime() : 0);
    events.push({
      type: 'MATCH',
      timestamp: ts,
      date: m.date,
      match: m
    });
  });

  // Adiciona eventos de bônus de presença que cada jogador já possui
  currentPlayers.forEach(p => {
    (p.eloHistory || []).forEach(h => {
      if (h.fidelityBonus || h.result === 'P') {
        const ts = h.timestamp || (h.date ? new Date(h.date).getTime() : 0);
        events.push({
          type: 'FIDELITY',
          timestamp: ts,
          date: h.date?.includes('T') ? h.date.split('T')[0] : h.date,
          playerId: p.id,
          fidelityEntry: h
        });
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
      const change = ev.fidelityEntry.change || 50;
      p.elo = (p.elo || 1200) + change;
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
