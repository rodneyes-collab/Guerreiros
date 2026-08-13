import { Player } from '../types';

/**
 * Calculates a player's MVP Efficiency score (Option 4).
 * 
 * This score is purely based on actual match performance (Win Rate, Impact, Point Diff, and Volume)
 * rather than hardcoded technical skill inputs.
 * 
 * @param player The player object
 * @param winRate The win rate (0.0 to 1.0)
 * @param matches Total matches played in the period
 * @param eloGain Total ELO gained/lost in the period
 * @param pointsFor Total points scored by their team
 * @param pointsAgainst Total points scored against their team
 * @returns A composite score 
 */
export const calculateMvpEfficiencyScore = (
  player: Player | null,
  winRate: number,
  matches: number,
  eloGain: number,
  pointsFor: number,
  pointsAgainst: number
): number => {
  if (!player || matches === 0) return 0;
  
  // 1. Base Score: Win Rate (0 to 100)
  const winRateScore = winRate * 100;
  
  // 2. Impact: ELO gained per match (Weight: x3)
  // E.g., +5 ELO/match = +15 to score
  const impactPerMatch = eloGain / matches;
  const impactScore = impactPerMatch * 3;
  
  // 3. Dominance: Point Differential per match (Weight: x2)
  // E.g., +3 points diff/match = +6 to score
  const pointDiffPerMatch = (pointsFor - pointsAgainst) / matches;
  const pointDiffScore = pointDiffPerMatch * 2;
  
  // 4. Volume: Small consistency bonus for playing more matches (+0.5 per match, capped at 15 matches)
  const volumeBonus = Math.min(matches, 15) * 0.5;
  
  return winRateScore + impactScore + pointDiffScore + volumeBonus;
};
