import { Player } from '../types';

export const calculateEvasionLevel = (player: Player, attendancePercent?: number): 'low' | 'medium' | 'high' | 'critical' => {
  // Se informada a porcentagem de assiduidade real, utilize ela diretamente (mais preciso)
  if (attendancePercent !== undefined && !isNaN(attendancePercent)) {
    if (attendancePercent >= 75) return 'low';
    if (attendancePercent >= 50) return 'medium';
    if (attendancePercent >= 25) return 'high';
    return 'critical';
  }

  // Fallback baseado nos dados históricos globais do jogador para evitar falsos positivos de risco crítico
  const totalMatches = player.matchesPlayed || 0;
  
  if (totalMatches >= 15) {
    return 'low';
  } else if (totalMatches >= 8) {
    return 'medium';
  } else if (totalMatches >= 3) {
    return 'high';
  } else {
    // Jogadores novos ou inativos começam com maior propensão até criar recorrência
    return 'critical';
  }
};
