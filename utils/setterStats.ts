import { Match, Player } from '../types';

export const RODNEY_ID = 'eann8eWQgeeyTcFGf1sN';
export const RODNEY_SETTER_START_DATE = '2026-09-10';

export interface MatchSetters {
  setterAId: string | null;
  setterBId: string | null;
}

/**
 * Retorna os IDs dos atletas que atuaram na função de levantador nas equipes A e B de uma partida.
 * 
 * Regras:
 * 1. Respeita os campos explícitos setterA e setterB se presentes na partida.
 * 2. Em partidas legadas (onde o levantador da equipe ocupava o índice 0):
 *    - Se for o Rodney em data anterior a 10/09/2026, desconsidera pois sua estreia como levantador é 10/09/2026.
 *    - Se o jogador possuir um setterStartDate registrado e a partida for anterior a essa data, desconsidera.
 *    - Caso contrário, utiliza o atleta no índice 0 como levantador daquela equipe.
 */
export function getMatchSetters(match: Match, playersMap?: Record<string, Player>): MatchSetters {
  let sA = match.setterA ?? null;
  let sB = match.setterB ?? null;

  const extractId = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.id) return val.id;
    return '';
  };

  const isEligibleSetter = (id: string, date: string): boolean => {
    if (!id) return false;
    // Rodney iniciou como levantador em 10/09/2026. Partidas anteriores foram estritamente como jogador de linha.
    if (id === RODNEY_ID && date && date < RODNEY_SETTER_START_DATE) return false;
    const player = playersMap ? playersMap[id] : undefined;
    if (player?.setterStartDate && date && date < player.setterStartDate) return false;
    return true;
  };

  if (!sA && match.teamA && match.teamA.length > 0) {
    const candidateA = extractId(match.teamA[0]);
    if (candidateA && isEligibleSetter(candidateA, match.date)) {
      sA = candidateA;
    }
  }

  if (!sB && match.teamB && match.teamB.length > 0) {
    const candidateB = extractId(match.teamB[0]);
    if (candidateB && isEligibleSetter(candidateB, match.date)) {
      sB = candidateB;
    }
  }

  return { setterAId: sA, setterBId: sB };
}

export interface PlayerSetterStats {
  matches: number;
  wins: number;
  losses: number;
}

/**
 * Calcula a pontuação ponderada de eficiência de levantador (Setter Score),
 * aliando o aproveitamento de vitórias na função ao volume de partidas disputadas.
 * Evita que atletas com pouquíssimas atuações esporádicas superem levantadoras consistentes e regulares.
 * 
 * @param wins Vitórias atuando como levantador
 * @param matches Total de partidas atuando como levantador
 * @param isDaily Se o cálculo é diário (sessão) ou geral (acumulado)
 * @returns Pontuação ponderada de eficiência
 */
export function calculateSetterScore(
  wins: number,
  matches: number,
  isDaily: boolean = false
): number {
  if (matches <= 0) return 0;
  const winRate = (wins / matches) * 100;

  if (isDaily) {
    // Diário: Win Rate (70%) + Bônus de volume da sessão (até 15 pontos)
    const volumeBonus = Math.min(15, matches * 2.5);
    return Number(((winRate * 0.7) + volumeBonus).toFixed(2));
  }

  // Acumulado / Geral:
  // - Aproveitamento na função (peso 60%)
  // - Pilar Volume: até 40 pontos com base em teto de 50 partidas na função
  // Atletas regulares com alto volume (ex: 50+ partidas) garantem a pontuação máxima de volume.
  const volumeBonus = Math.min(40, (matches / 50) * 40);
  return Number(((winRate * 0.6) + volumeBonus).toFixed(2));
}

/**
 * Calcula as estatísticas exclusivas de atuação na função de levantador para uma lista de partidas.
 * Permite que sócios joguem como levantadores em um dia e como linha em outro sem distorções de ranking.
 */
export function calculateSetterStats(
  matches: Match[],
  playersMap?: Record<string, Player>
): Record<string, PlayerSetterStats> {
  const stats: Record<string, PlayerSetterStats> = {};

  matches.forEach(m => {
    const { setterAId, setterBId } = getMatchSetters(m, playersMap);

    if (setterAId) {
      if (!stats[setterAId]) stats[setterAId] = { matches: 0, wins: 0, losses: 0 };
      stats[setterAId].matches++;
      if (m.winner === 'A') stats[setterAId].wins++;
      else if (m.winner === 'B') stats[setterAId].losses++;
    }

    if (setterBId) {
      if (!stats[setterBId]) stats[setterBId] = { matches: 0, wins: 0, losses: 0 };
      stats[setterBId].matches++;
      if (m.winner === 'B') stats[setterBId].wins++;
      else if (m.winner === 'A') stats[setterBId].losses++;
    }
  });

  return stats;
}
