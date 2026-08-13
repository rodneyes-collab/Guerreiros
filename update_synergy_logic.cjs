const fs = require('fs');
let code = fs.readFileSync('utils/teamLogic.ts', 'utf8');

const oldFunc = `export const calculateNegativeSynergyPenalty = (
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
};`;

const newFunc = `export const calculateNegativeSynergyPenalty = (
  setter: Player | null, 
  players: Player[], 
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[]
): number => {
  if (!matchHistory || matchHistory.length === 0) return 0;
  
  const currentTeamIds = [setter?.id, ...players.map(p => p.id)].filter(Boolean) as string[];
  let penalty = 0;

  const now = Date.now();
  // Constante de decaimento: 15 dias em milisegundos (meia-vida do peso da partida)
  const DECAY_HALF_LIFE = 15 * 24 * 60 * 60 * 1000; 

  for (let i = 0; i < currentTeamIds.length; i++) {
    for (let j = i + 1; j < currentTeamIds.length; j++) {
      const p1 = currentTeamIds[i];
      const p2 = currentTeamIds[j];
      
      let weightedGames = 0;
      let weightedLosses = 0;
      let weightedWins = 0;

      for (const match of matchHistory) {
        const inTeamA = match.teamA.includes(p1) && match.teamA.includes(p2);
        const inTeamB = match.teamB.includes(p1) && match.teamB.includes(p2);
        
        if (inTeamA || inTeamB) {
          // 4. Decaimento Temporal
          const age = match.timestamp ? (now - match.timestamp) : 0;
          // Peso decai exponencialmente (mínimo de 0.2 para jogos muito antigos)
          const weight = Math.max(0.2, Math.pow(0.5, age / DECAY_HALF_LIFE));
          
          weightedGames += weight;
          
          const isLoss = (inTeamA && match.winner === 'B') || (inTeamB && match.winner === 'A');
          if (isLoss) {
            weightedLosses += weight;
          } else {
            weightedWins += weight;
          }
        }
      }

      // Precisamos de uma "amostragem" mínima para ter confiança
      if (weightedGames >= 1.5) {
        const lossRate = weightedLosses / weightedGames;
        
        // 5. Escala Contínua e Suavizada + 3. Sinergia Positiva (Bônus)
        // Uma taxa de derrota de 0.5 é neutra. 
        // Se > 0.5, a sinergia é negativa (penalty positivo).
        // Se < 0.5, a sinergia é positiva (penalty negativo/bônus).
        
        const deviationFromNeutral = lossRate - 0.5;
        
        // Penaliza ou premia quadraticamente baseado na diferença (amplifica extremos)
        // deviationFromNeutral varia de -0.5 (100% vitória) a +0.5 (100% derrota)
        // Multiplicador base: 400.
        // Penalty máximo por par: ~100
        // Para uma dupla com alta certeza (weightedGames alto), o penalty/bônus é escalado.
        
        const synergyScore = 400 * Math.pow(Math.abs(deviationFromNeutral), 1.5) * Math.sign(deviationFromNeutral);
        
        // Fator de confiança (quanto mais jogos, mais peso até um limite)
        const confidenceFactor = Math.min(3, Math.log1p(weightedGames));
        
        penalty += synergyScore * confidenceFactor;
      }
    }
  }

  return penalty;
};`;

if (code.includes(oldFunc)) {
  code = code.replace(oldFunc, newFunc);
} else {
  console.log("Could not find old calculateNegativeSynergyPenalty function exactly");
}

const oldSig = `export function generateTeams(attendanceList: Player[], previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[], useTrueSkill: boolean = false, everyoneSets: boolean = false, matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B'}[]): GenerationResult {`;
const newSig = `export function generateTeams(attendanceList: Player[], previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[], useTrueSkill: boolean = false, everyoneSets: boolean = false, matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[]): GenerationResult {`;

if (code.includes(oldSig)) {
  code = code.replace(oldSig, newSig);
} else {
  console.log("Could not find generateTeams signature exactly");
}

fs.writeFileSync('utils/teamLogic.ts', code);
console.log('Saved changes to utils/teamLogic.ts');
