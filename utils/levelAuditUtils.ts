
import { Player } from '../types';

export interface LevelSuggestion {
  playerId: string;
  playerName: string;
  currentLevel: 1 | 2 | 3;
  suggestedLevel: 1 | 2 | 3;
  type: 'UPGRADE' | 'DOWNGRADE';
  reason: string;
  elo: number;
}

export const getLevelSuggestions = (players: Player[]): LevelSuggestion[] => {
  const suggestions: LevelSuggestion[] = [];

  players.forEach(player => {
    // Only suggest for players with some history to avoid noise
    if (player.matchesPlayed < 10) return;

    const elo = player.elo;
    const currentLevel = player.impactLevel || 1;

    // ELITE (3) Threshold: 1400
    // MÉDIO (2) Threshold: 1150
    // BASE  (1) Threshold: < 1150

    // UPGRADE LOGIC
    if (currentLevel === 1 && elo >= 1180) {
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentLevel: 1,
        suggestedLevel: 2,
        type: 'UPGRADE',
        reason: `Performance consistente de nível Médio detectada (ELO ${Math.round(elo)}).`,
        elo: Math.round(elo)
      });
    } else if (currentLevel === 2 && elo >= 1430) {
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentLevel: 2,
        suggestedLevel: 3,
        type: 'UPGRADE',
        reason: `Performance de Elite detectada (ELO ${Math.round(elo)}).`,
        elo: Math.round(elo)
      });
    }

    // DOWNGRADE LOGIC (with higher hysteresis to avoid frustration)
    else if (currentLevel === 3 && elo < 1320) {
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentLevel: 3,
        suggestedLevel: 2,
        type: 'DOWNGRADE',
        reason: `Performance abaixo do nível Elite (ELO ${Math.round(elo)}). Sugerimos reajuste para manter o equilíbrio.`,
        elo: Math.round(elo)
      });
    } else if (currentLevel === 2 && elo < 1080) {
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentLevel: 2,
        suggestedLevel: 1,
        type: 'DOWNGRADE',
        reason: `Performance abaixo do nível Médio (ELO ${Math.round(elo)}). Sugerimos reajuste para proteção do equilíbrio.`,
        elo: Math.round(elo)
      });
    }
  });

  return suggestions;
};
