import { Player } from '../types';

export const calculateEvasionLevel = (player: Player): 'low' | 'medium' | 'high' | 'critical' => {
  // Regra: 75% Presença/Participação, 25% Resultados
  const hasParticipated = player.dailyMatches > 0;
  const participationScore = hasParticipated ? 100 : 0;
  
  const totalMatches = player.dailyWins + player.dailyLosses;
  const winRate = totalMatches > 0 
    ? (player.dailyWins / totalMatches) * 100 
    : 50; // Neutro se não jogou ou empatado

  const score = (0.75 * participationScore) + (0.25 * winRate);
  const riskScore = 100 - score;

  if (riskScore < 25) return 'low';
  if (riskScore < 50) return 'medium';
  if (riskScore < 75) return 'high';
  return 'critical';
};
