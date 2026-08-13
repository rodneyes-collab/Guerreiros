const fs = require('fs');
let code = fs.readFileSync('utils/teamLogic.ts', 'utf8');

// 1. Add calculateNegativeSynergyPenalty before getPriorityQueue
const synergyFunc = `
/**
 * ML Synergy Analysis: Identifica e penaliza "sinergias negativas" baseado no histórico.
 * Se pares de jogadores frequentemente perdem quando jogam juntos, o sistema penaliza 
 * essa formação para forçar combinações mais vitoriosas (Machine Learning Simulation).
 */
export const calculateNegativeSynergyPenalty = (
  setter: Player | null, 
  players: Player[], 
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B'}[]
): number => {
  if (!matchHistory || matchHistory.length === 0) return 0;
  
  const currentTeamIds = [setter?.id, ...players.map(p => p.id)].filter(Boolean) as string[];
  let penalty = 0;

  for (let i = 0; i < currentTeamIds.length; i++) {
    for (let j = i + 1; j < currentTeamIds.length; j++) {
      const p1 = currentTeamIds[i];
      const p2 = currentTeamIds[j];
      
      let gamesTogether = 0;
      let lossesTogether = 0;

      for (const match of matchHistory) {
        const inTeamA = match.teamA.includes(p1) && match.teamA.includes(p2);
        const inTeamB = match.teamB.includes(p1) && match.teamB.includes(p2);
        
        if (inTeamA || inTeamB) {
          gamesTogether++;
          if ((inTeamA && match.winner === 'B') || (inTeamB && match.winner === 'A')) {
            lossesTogether++;
          }
        }
      }

      if (gamesTogether >= 3) {
        const lossRate = lossesTogether / gamesTogether;
        if (lossRate > 0.7) {
          penalty += 200 * lossRate; 
        } else if (lossRate >= 0.5) {
          penalty += 50 * lossRate;
        }
      }
    }
  }

  return penalty;
};

`;

code = code.replace('export function getPriorityQueue', synergyFunc + 'export function getPriorityQueue');

// 2. Modify generateTeams signature
code = code.replace(
  'export function generateTeams(attendanceList: Player[], previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[], useTrueSkill: boolean = false, everyoneSets: boolean = false): GenerationResult {',
  'export function generateTeams(attendanceList: Player[], previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[], useTrueSkill: boolean = false, everyoneSets: boolean = false, matchHistory?: {teamA: string[], teamB: string[], winner: \'A\'|\'B\'}[]): GenerationResult {'
);

// 3. Add negativeSynergyPenalty to the score calculation
const newScoreCalcOld = `          const newScore = diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetryDiff * 0.5) + recurrencePenalty + bottomTwoTogetherPenalty + topTwoTogetherTogetherPenalty + guestImbalancePenalty;`;
const newScoreCalcNew = `          const synergyPenalty = calculateNegativeSynergyPenalty(setterA, tempPlayersA, matchHistory) + calculateNegativeSynergyPenalty(setterB, tempPlayersB, matchHistory);
          const newScore = diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetryDiff * 0.5) + recurrencePenalty + bottomTwoTogetherPenalty + topTwoTogetherTogetherPenalty + guestImbalancePenalty + synergyPenalty;`;
code = code.replace(newScoreCalcOld, newScoreCalcNew);

const currentScoreCalcOld = `          const currentScore = Math.abs(currentMetricsA.totalElo - currentMetricsB.totalElo) + 
                               Math.abs(currentMetricsA.top4Elo - currentMetricsB.top4Elo) * 0.8 +
                               Math.abs(currentMetricsA.bot4Elo - currentMetricsB.bot4Elo) * 1.5 +
                               Math.abs(currentMetricsA.totalSkills - currentMetricsB.totalSkills) * 20 +
                               (currentSymmetry * 0.5) + currentRecurrence + currentBottomTwoPenalty + currentTopTwoPenalty + currentGuestImbalancePenalty;`;
const currentScoreCalcNew = `          const currentSynergy = calculateNegativeSynergyPenalty(setterA, playersA, matchHistory) + calculateNegativeSynergyPenalty(setterB, playersB, matchHistory);
          const currentScore = Math.abs(currentMetricsA.totalElo - currentMetricsB.totalElo) + 
                               Math.abs(currentMetricsA.top4Elo - currentMetricsB.top4Elo) * 0.8 +
                               Math.abs(currentMetricsA.bot4Elo - currentMetricsB.bot4Elo) * 1.5 +
                               Math.abs(currentMetricsA.totalSkills - currentMetricsB.totalSkills) * 20 +
                               (currentSymmetry * 0.5) + currentRecurrence + currentBottomTwoPenalty + currentTopTwoPenalty + currentGuestImbalancePenalty + currentSynergy;`;
code = code.replace(currentScoreCalcOld, currentScoreCalcNew);

// 4. Update the setter score function
const getScoreForSettersOld = `        const guestPenalty = guestDiff > 1 ? (guestDiff * 5000) : 0;

        return diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetry * 0.5) + rec + b2Penalty + t2Penalty + guestPenalty;`;
const getScoreForSettersNew = `        const guestPenalty = guestDiff > 1 ? (guestDiff * 5000) : 0;
        const synergyPenalty = calculateNegativeSynergyPenalty(sA, pA, matchHistory) + calculateNegativeSynergyPenalty(sB, pB, matchHistory);

        return diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetry * 0.5) + rec + b2Penalty + t2Penalty + guestPenalty + synergyPenalty;`;
code = code.replace(getScoreForSettersOld, getScoreForSettersNew);

fs.writeFileSync('utils/teamLogic.ts', code);
console.log('Patched teamLogic.ts');
