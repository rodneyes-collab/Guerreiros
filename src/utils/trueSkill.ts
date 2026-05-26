import { Rating, rate } from 'ts-trueskill';
import { Player } from '../../types';

interface TrueSkillUpdateResult {
  playerId: string;
  newTrueSkill: { mu: number; sigma: number };
}

export const calculateTrueSkillUpdate = (
  teamAPlayers: Player[],
  teamBPlayers: Player[],
  winner: 'A' | 'B' | 'Draw'
): TrueSkillUpdateResult[] => {
  // Convert players to ts-trueskill Rating objects
  const createRating = (p: Pick<Player, 'trueSkill'>) => {
    if (p.trueSkill && typeof p.trueSkill.mu === 'number' && typeof p.trueSkill.sigma === 'number') {
      return new Rating(p.trueSkill.mu, p.trueSkill.sigma);
    }
    // Default initial values: mu=25, sigma=25/3 ~ 8.333
    return new Rating();
  };

  const ratingsA = teamAPlayers.map(createRating);
  const ratingsB = teamBPlayers.map(createRating);

  let ranks: number[];
  if (winner === 'A') {
    ranks = [0, 1];
  } else if (winner === 'B') {
    ranks = [1, 0];
  } else {
    // Draw
    ranks = [0, 0];
  }

  // Calculate new ratings
  const [newRatingsA, newRatingsB] = rate([ratingsA, ratingsB], ranks);

  const results: TrueSkillUpdateResult[] = [];

  teamAPlayers.forEach((p, idx) => {
    results.push({
      playerId: p.id,
      newTrueSkill: { mu: newRatingsA[idx].mu, sigma: newRatingsA[idx].sigma }
    });
  });

  teamBPlayers.forEach((p, idx) => {
    results.push({
      playerId: p.id,
      newTrueSkill: { mu: newRatingsB[idx].mu, sigma: newRatingsB[idx].sigma }
    });
  });

  return results;
};
