
import { Player, Gender, Team, GenerationResult, TournamentTeam, Tournament } from '../types';
import { SKILL_WEIGHTS } from '../constants';


const getImpactBonus = (level?: number) => {
  if (level === 3) return 200; // Elite / Power
  if (level === 2) return 75;  // Médio / Técnico
  return 0;                    // Base
};

export const calculateEffectiveElo = (player: Player | null) => {
  if (!player) return 0;
  
  // EFICIÊNCIA TÉCNICA (Para Balanceamento)
  // Baseada em Eficiência Conservadora (Consistência) + Skills Práticas + Impacto
  
  let trueSkillValue = 25; // Default mu
  if (player.trueSkill && typeof player.trueSkill.mu === 'number' && typeof player.trueSkill.sigma === 'number') {
    // Valor conservador de consistência técnica (mu - 3*sigma)
    trueSkillValue = player.trueSkill.mu - (3 * player.trueSkill.sigma);
  }

  let skillValue = 0;
  if (player.skills) {
    skillValue = (
      (player.skills.setting * SKILL_WEIGHTS.setting) +
      (player.skills.attacking * SKILL_WEIGHTS.attacking) +
      (player.skills.defense * SKILL_WEIGHTS.defense) +
      (player.skills.serving * SKILL_WEIGHTS.serving)
    ) * 150;
  }
  
  // NOTA: O player.elo (Ranking) é ignorado aqui para que o balanceamento 
  // seja puramente por qualidade técnica (Eficiência)
  return (trueSkillValue * 10) + getImpactBonus(player.impactLevel) + skillValue + 1200;
};

/**
 * Calcula a penalidade de recorrência para um time baseado nas formações anteriores.
 * Quanto mais duplas se repetem em relação à última partida, maior a "multa" no score de equilíbrio.
 */
export const calculateRecurrencePenalty = (
  setter: Player | null, 
  players: Player[], 
  previousFormations: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[]
): number => {
  if (!previousFormations || previousFormations.length === 0) return 0;
  
  // Focamos principalmente na última partida para evitar repetição imediata
  const lastMatch = previousFormations[previousFormations.length - 1];
  const lastPlayersA = new Set([lastMatch.setterA, ...lastMatch.playersA]);
  const lastPlayersB = new Set([lastMatch.setterB, ...lastMatch.playersB]);
  
  const currentPlayers = [setter?.id, ...players.map(p => p.id)].filter(Boolean);
  
  let pairsFromA = 0;
  let pairsFromB = 0;

  // Conta quantos jogadores deste time estavam juntos no Time A ou Time B da última partida
  currentPlayers.forEach(id => {
    if (lastPlayersA.has(id!)) pairsFromA++;
    if (lastPlayersB.has(id!)) pairsFromB++;
  });

  // Penalidade baseada no maior grupo repetido (se 4 ou mais jogadores se repetem)
  // Isso desencoraja manter o "núcleo" de um time anterior
  const repeatCount = Math.max(pairsFromA, pairsFromB);
  
  if (repeatCount >= 5) return 500; // Penalidade pesada (evita repetir o time quase todo)
  if (repeatCount >= 4) return 150; // Penalidade média
  if (repeatCount >= 3) return 30;  // Pequena penalidade para encorajar trocas
  
  return 0;
};

/**
 * Calculates the sum of practical skills (Ataque, Defesa, Levantamento) as requested.
 * Ataque: skills.attacking, Defesa: skills.defense, Levantamento: skills.setting
 */
export const calculatePracticalSkillsSum = (player: Player | null): number => {
  if (!player) return 0;
  const attacking = player.skills?.attacking || 1;
  const defense = player.skills?.defense || 1;
  const setting = player.skills?.setting || 1;
  const serving = player.skills?.serving || 1;
  return attacking + defense + setting + serving;
};

/**
 * Calculates the total sum of practical skills (Ataque, Defesa, Levantamento) for a team.
 */
export const getTeamPracticalSkillsSum = (setter: Player | null, players: Player[]): number => {
  const allPlayers = setter ? [setter, ...players] : players;
  return allPlayers.reduce((sum, p) => sum + calculatePracticalSkillsSum(p), 0);
};

// Helper to calculate a signature for a team for similarity comparison
const getTeamSignature = (team: Team) => {
  const setterId = team.setter ? team.setter.id : 'none';
  const playerIds = team.players.map(p => p.id).sort();
  return `${setterId}_${playerIds.join('_')}`;
};

// Check if the current generation is too similar to previous formations of the day
export const checkSimilarity = (result: GenerationResult, previousFormations: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[]) => {
  const sigA = getTeamSignature(result.teamA);
  const sigB = getTeamSignature(result.teamB);

  for (const prev of previousFormations) {
    const prevSigA = `${prev.setterA}_${prev.playersA.sort().join('_')}`;
    const prevSigB = `${prev.setterB}_${prev.playersB.sort().join('_')}`;

    // If matches exactly the same teams (order doesn't matter)
    if ((sigA === prevSigA && sigB === prevSigB) || (sigA === prevSigB && sigB === prevSigA)) {
      return true;
    }
  }
  return false;
};

// Function to apply forced swaps to increase variety
export const applyForcedSwaps = (result: GenerationResult): GenerationResult => {
  const teamA = result.teamA;
  const teamB = result.teamB;

  // 1. Swap Setters
  const newSetterA = teamB.setter;
  const newSetterB = teamA.setter;

  // 2. Male Swap (Swap lowest ELO men to vary from standard top-swaps)
  const menA = teamA.players.filter(p => p.gender === Gender.MALE).sort((a,b) => (a.elo || 0) - (b.elo || 0));
  const menB = teamB.players.filter(p => p.gender === Gender.MALE).sort((a,b) => (a.elo || 0) - (b.elo || 0));

  let playersA = [...teamA.players];
  let playersB = [...teamB.players];

  if (menA.length > 0 && menB.length > 0) {
    // Swap lowest ELO men as requested
    const manA = menA[0];
    const manB = menB[0];
    playersA = playersA.map(p => p.id === manA.id ? manB : p);
    playersB = playersB.map(p => p.id === manB.id ? manA : p);
  }

  // 3. Female Swap (Swap highest ELO women to maintain some balance)
  const womenA = teamA.players.filter(p => p.gender === Gender.FEMALE).sort((a,b) => (b.elo || 0) - (a.elo || 0));
  const womenB = teamB.players.filter(p => p.gender === Gender.FEMALE).sort((a,b) => (b.elo || 0) - (a.elo || 0));

  if (womenA.length > 0 && womenB.length > 0) {
    // Keep highest female swap for variety mix
    const womanA = womenA[0];
    const womanB = womenB[0];
    playersA = playersA.map(p => p.id === womanA.id ? womanB : p);
    playersB = playersB.map(p => p.id === womanB.id ? womanA : p);
  }

  return {
    ...result,
    teamA: { ...teamA, setter: newSetterA, players: playersA },
    teamB: { ...teamB, setter: newSetterB, players: playersB },
    swaps: [...(result.swaps || []), { playerA: 'Forced Swap', playerB: 'Adjustment' }]
  };
};

export function getPriorityQueue(attendanceList: Player[], count: number = 12, maxSetters: number = 2): { topPlayers: Player[], remainingPlayers: Player[] } {
  const sortByPriority = (a: Player, b: Player) => {
    const orderA = a.arrivalOrder ?? 999;
    const orderB = b.arrivalOrder ?? 999;

    // NÍVEL 1: Rodagem Imediata - Prioridade absoluta para quem NÃO jogou a última partida
    // Isso evita que jogadores repitam partidas consecutivas (back-to-back)
    const playedA = a.playedLastMatch ? 1 : 0;
    const playedB = b.playedLastMatch ? 1 : 0;
    if (playedA !== playedB) return playedA - playedB;
    if (orderA !== orderB) return orderA - orderB;

    // NÍVEL 2: Volume de Jogo - Desempate para quem jogou MENOS no total do dia
    const matchesA = a.dailyMatches || 0;
    const matchesB = b.dailyMatches || 0;
    if (matchesA !== matchesB) return matchesA - matchesB;
    if (orderA !== orderB) return orderA - orderB;

    // NÍVEL 3: Consistência de Banco - Quem está há mais tempo sentado (consecutivamente)
    const benchedA = a.consecutiveBenched || 0;
    const benchedB = b.consecutiveBenched || 0;
    if (benchedA !== benchedB) return benchedB - benchedA;
    if (orderA !== orderB) return orderA - orderB;

    return 0;
  };

  // 1. Separate setters and non-setters, both sorted by priority
  const allSetters = attendanceList.filter(p => p.isOfficialSetter).sort(sortByPriority);
  const allNonSetters = attendanceList.filter(p => !p.isOfficialSetter).sort(sortByPriority);

  // 2. Select exactly up to 2 setters (one for each team)
  const selectedSetters = allSetters.slice(0, maxSetters);
  
  // 3. Fill the rest of the slots with non-setters
  const neededNonSetters = count - selectedSetters.length;
  const selectedNonSetters = allNonSetters.slice(0, neededNonSetters);

  // 4. Combine to form the match pool
  const topPlayers = [...selectedSetters, ...selectedNonSetters];
  
  // 5. Remaining players are those not selected, sorted by priority for the waitlist
  const selectedIds = new Set(topPlayers.map(p => p.id));
  const remainingPlayers = attendanceList
    .filter(p => !selectedIds.has(p.id))
    .sort(sortByPriority);

  return {
    topPlayers,
    remainingPlayers
  };
}

export function generateTournamentTeams(participants: Player[], numTeams: number): { teams: TournamentTeam[], reserves: string[] } {
  const totalPlayersNeeded = numTeams * 6;
  const { topPlayers, remainingPlayers } = getPriorityQueue(participants, totalPlayersNeeded, numTeams);

  const sortedPlayers = [...topPlayers].sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  
  const officialSetters = sortedPlayers.filter(p => p.isOfficialSetter);
  const others = sortedPlayers.filter(p => !p.isOfficialSetter);

  const teams: TournamentTeam[] = [];
  for (let i = 0; i < numTeams; i++) {
    teams.push({
      id: Math.random().toString(36).substr(2, 9),
      name: `Time ${String.fromCharCode(65 + i)}`,
      players: [],
      totalElo: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0
    });
  }

  const reserves: string[] = remainingPlayers.map(p => p.id);

  // 1. Distribute official setters (max 1 per team)
  let setterIdx = 0;
  while (setterIdx < officialSetters.length) {
    const setter = officialSetters[setterIdx];
    if (setterIdx < numTeams) {
      teams[setterIdx].players.push(setter.id);
      teams[setterIdx].totalElo = (teams[setterIdx].totalElo || 0) + calculateEffectiveElo(setter);
    } else {
      others.push(setter); // If more setters than teams, treat them as normal players
    }
    setterIdx++;
  }

  // 2. Distribute others (until teams have 6 players)
  const men = others.filter(p => p.gender === Gender.MALE).sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  const women = others.filter(p => p.gender === Gender.FEMALE).sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  const otherPool = [...men, ...women];

  // Randomize starting team for snake draft
  let currentTeamIdx = Math.floor(Math.random() * numTeams);
  let direction = Math.random() > 0.5 ? 1 : -1;

  while (otherPool.length > 0) {
    const player = otherPool.shift()!;
    
    // Find a team that has less than 6 players
    let foundTeam = false;
    let attempts = 0;
    while (attempts < numTeams) {
      if (teams[currentTeamIdx].players.length < 6) {
        teams[currentTeamIdx].players.push(player.id);
        teams[currentTeamIdx].totalElo = (teams[currentTeamIdx].totalElo || 0) + calculateEffectiveElo(player);
        foundTeam = true;
        
        // Move to next team for next player
        currentTeamIdx += direction;
        if (currentTeamIdx >= numTeams) {
          currentTeamIdx = numTeams - 1;
          direction = -1;
        } else if (currentTeamIdx < 0) {
          currentTeamIdx = 0;
          direction = 1;
        }
        break;
      }
      
      currentTeamIdx += direction;
      if (currentTeamIdx >= numTeams) {
        currentTeamIdx = numTeams - 1;
        direction = -1;
      } else if (currentTeamIdx < 0) {
        currentTeamIdx = 0;
        direction = 1;
      }
      attempts++;
    }

    if (!foundTeam) {
      reserves.push(player.id);
    }
  }

  // 3. ELO Refinement: Try to swap players between teams to minimize ELO variance
  // We only swap players of the same gender and setter status to maintain balance
  let improved = true;
  while (improved) {
    improved = false;
    
    // Randomize team iteration order
    const teamIndices = Array.from({ length: teams.length }, (_, i) => i).sort(() => Math.random() - 0.5);
    
    for (const i of teamIndices) {
      for (const j of teamIndices) {
        if (i === j) continue;

        const teamA = teams[i];
        const teamB = teams[j];
        
        // Randomize player iteration order
        const pAIndices = Array.from({ length: teamA.players.length }, (_, i) => i).sort(() => Math.random() - 0.5);
        const pBIndices = Array.from({ length: teamB.players.length }, (_, i) => i).sort(() => Math.random() - 0.5);
        
        for (const pAIdx of pAIndices) {
          for (const pBIdx of pBIndices) {
            const pA = participants.find(p => p.id === teamA.players[pAIdx]);
            const pB = participants.find(p => p.id === teamB.players[pBIdx]);

            if (!pA || !pB) continue;

            if (pA.isOfficialSetter === pB.isOfficialSetter && pA.gender === pB.gender) {
              const currentDiff = Math.abs((teamA.totalElo || 0) - (teamB.totalElo || 0));
              
              const newEloA = (teamA.totalElo || 0) - calculateEffectiveElo(pA) + calculateEffectiveElo(pB);
              const newEloB = (teamB.totalElo || 0) - calculateEffectiveElo(pB) + calculateEffectiveElo(pA);
              const newDiff = Math.abs(newEloA - newEloB);

              if (newDiff < currentDiff) {
                teamA.players[pAIdx] = pB.id;
                teamB.players[pBIdx] = pA.id;
                teamA.totalElo = newEloA;
                teamB.totalElo = newEloB;
                improved = true;
              }
            }
          }
        }
      }
    }
  }

  return { teams, reserves };
}

export function addPlayerToTournamentTeam(tournament: Tournament, teamId: string, playerId: string): Tournament {
  const updatedTeams = tournament.teams.map(team => {
    if (team.id === teamId) {
      return {
        ...team,
        players: [...team.players, playerId]
      };
    }
    return team;
  });

  return {
    ...tournament,
    teams: updatedTeams
  };
}

export function substituteTournamentPlayer(tournament: Tournament, teamId: string, oldPlayerId: string, newPlayerId: string): Tournament {
  const updatedTeams = tournament.teams.map(team => {
    if (team.id === teamId) {
      return {
        ...team,
        players: team.players.map(pid => pid === oldPlayerId ? newPlayerId : pid)
      };
    }
    return team;
  });

  return {
    ...tournament,
    teams: updatedTeams
  };
}

export function generateTeams(attendanceList: Player[], previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[]): GenerationResult {
  const getElo = (p: Player | null) => calculateEffectiveElo(p);
  
  // Adiciona um pequeno fator de entropia (ruído aleatório de ±3%) para o sorteio inicial
  // Isso permite que jogadores de nível muito similar variem de posição no ranking de distribuição
  const getRandomizedElo = (p: Player | null) => {
    const base = getElo(p);
    const variation = base * 0.03; // 3% de variação
    return base + (Math.random() * variation * 2 - variation);
  };

  const { topPlayers: matchPool, remainingPlayers } = getPriorityQueue(attendanceList, 12, 2);

  // Shuffle matchPool to handle equal ELOs randomly and vary initial distribution
  const shuffledPool = [...matchPool].sort(() => Math.random() - 0.5);

  const poolSetters = shuffledPool.filter(p => p.isOfficialSetter);
  const poolNonSettersStrict = shuffledPool.filter(p => !p.isOfficialSetter).sort((a, b) => getElo(b) - getElo(a));
  
  // Identificamos as jogadoras mais fracas pela SOMA TÉCNICA (Analise prática: Saque, Ataque, etc)
  // e não por ELO ou Eficiência. Protegemos elas da aleatoriedade inicial para garantir que
  // o ABAB as coloque em times opostos.
  const techSorted = [...shuffledPool].sort((a, b) => calculatePracticalSkillsSum(a) - calculatePracticalSkillsSum(b));
  const bottomTwoIds = new Set(techSorted.slice(0, 2).map(p => p.id));
  const bottomTechIds = new Set(techSorted.slice(0, 4).map(p => p.id));

  const poolNonSetters = poolNonSettersStrict.map((p) => {
    // Se for uma das tecnicamente mais fracas (pela soma saque/ataque/etc), protege do ruído aleatório
    if (bottomTechIds.has(p.id)) return { p, sortElo: getElo(p) };
    // Para os outros (núcleo técnico), aplica o ruído de ±3% para permitir variações de formação
    return { p, sortElo: getRandomizedElo(p) };
  })
  .sort((a, b) => b.sortElo - a.sortElo)
  .map(item => item.p);

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  
  if (poolSetters.length >= 2) {
    // Randomly assign setters to A or B
    const sIndices = [0, 1].sort(() => Math.random() - 0.5);
    setterA = poolSetters[sIndices[0]];
    setterB = poolSetters[sIndices[1]];
    
    if (poolSetters.length > 2) {
      poolNonSetters.push(...poolSetters.slice(2));
      poolNonSetters.sort((a, b) => getElo(b) - getElo(a));
    }
  } else if (poolSetters.length === 1) {
    setterA = poolSetters[0];
    if (poolNonSetters.length > 0) {
      setterB = poolNonSetters.shift()!;
    }
  } else {
    if (poolNonSetters.length >= 2) {
      setterA = poolNonSetters.shift()!;
      setterB = poolNonSetters.shift()!;
    }
  }

  const men = poolNonSetters.filter(p => p.gender === Gender.MALE).sort((a, b) => getElo(b) - getElo(a));
  const women = poolNonSetters.filter(p => p.gender === Gender.FEMALE).sort((a, b) => getElo(b) - getElo(a));

  let playersA: Player[] = [];
  let playersB: Player[] = [];

  const requiredA = setterA ? 5 : 6;
  const requiredB = setterB ? 5 : 6;

  // Randomize initial team choice for the greedy distribution
  const firstTeam = Math.random() > 0.5 ? 'A' : 'B';

  // Target team index (Alternating distribution: A, B, A, B, A, B...)
  const getTargetTeam = (globalIdx: number, startWithA: boolean) => {
    const isTeamA = globalIdx % 2 === 0;
    if (startWithA) return isTeamA ? 'A' : 'B';
    return isTeamA ? 'B' : 'A';
  };

  let globalIdx = 0;

  // Distribute men first using Snake pattern
  men.forEach((man) => {
    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;
    const targetTeam = getTargetTeam(globalIdx, firstTeam === 'A');

    if (targetTeam === 'A') {
      if (canAddToA) playersA.push(man);
      else if (canAddToB) playersB.push(man);
    } else {
      if (canAddToB) playersB.push(man);
      else if (canAddToA) playersA.push(man);
    }
    globalIdx++;
  });

  // Distribute women next using Snake pattern
  women.forEach((woman) => {
    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;
    const targetTeam = getTargetTeam(globalIdx, firstTeam === 'A');

    if (targetTeam === 'A') {
      if (canAddToA) playersA.push(woman);
      else if (canAddToB) playersB.push(woman);
    } else {
      if (canAddToB) playersB.push(woman);
      else if (canAddToA) playersA.push(woman);
    }
    globalIdx++;
  });

  // 5. Otimização por Trocas (Refinamento de Equilíbrio)
  const calculateTotalEffectiveElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + getElo(p), 0) + getElo(setter);
  };

  let currentEloA = calculateTotalEffectiveElo(setterA, playersA);
  let currentEloB = calculateTotalEffectiveElo(setterB, playersB);
  let improved = true;
  const swaps: { playerA: string; playerB: string }[] = [];
  let combinationsCount = 0;

  while (improved) {
    improved = false;

    // Shuffle indices to explore different swap paths and avoid deterministic local optima
    const indicesA = Array.from({ length: playersA.length }, (_, i) => i).sort(() => Math.random() - 0.5);
    const indicesB = Array.from({ length: playersB.length }, (_, i) => i).sort(() => Math.random() - 0.5);

    for (const i of indicesA) {
      for (const j of indicesB) {
        combinationsCount++;
        const pA = playersA[i];
        const pB = playersB[j];

        if (pA.gender === pB.gender) {
          // Calculate new Elo sums
          const newEloA = currentEloA - getElo(pA) + getElo(pB);
          const newEloB = currentEloB - getElo(pB) + getElo(pA);

          const getTeamMetrics = (setter: Player | null, players: Player[]) => {
            const allPlayers = setter ? [setter, ...players] : players;
            
            const totalElo = allPlayers.reduce((s, p) => s + getElo(p), 0);
            const totalSkills = allPlayers.reduce((s, p) => 
               s + (p.skills?.setting || 1) + (p.skills?.attacking || 1) + (p.skills?.defense || 1) + (p.skills?.serving || 1), 0);
            
            const sortedElos = allPlayers.map(p => getElo(p)).sort((a,b) => b-a);
            
            // Compare top 4 and bottom 4 as requested
            const top4Elo = sortedElos.slice(0, 4).reduce((a,b)=>a+b, 0);
            const bot4Elo = sortedElos.slice(-4).reduce((a,b)=>a+b, 0);

            return { totalElo, top4Elo, bot4Elo, totalSkills, sortedElos };
          };

          const tempPlayersA = [...playersA];
          tempPlayersA[i] = pB;
          const tempPlayersB = [...playersB];
          tempPlayersB[j] = pA;

          const metricsA = getTeamMetrics(setterA, tempPlayersA);
          const metricsB = getTeamMetrics(setterB, tempPlayersB);
          
          const diffElo = Math.abs(metricsA.totalElo - metricsB.totalElo);
          const diffTop4 = Math.abs(metricsA.top4Elo - metricsB.top4Elo);
          const diffBot4 = Math.abs(metricsA.bot4Elo - metricsB.bot4Elo);
          const diffSkills = Math.abs(metricsA.totalSkills - metricsB.totalSkills);
          
          // New: Symmetry metric - compares players in the same rank between teams
          let symmetryDiff = 0;
          const maxLen = Math.min(metricsA.sortedElos.length, metricsB.sortedElos.length);
          for (let k = 0; k < maxLen; k++) {
            symmetryDiff += Math.abs(metricsA.sortedElos[k] - metricsB.sortedElos[k]);
          }

          // Penalidade por repetição de time (Recorrência)
          const recurrencePenalty = calculateRecurrencePenalty(setterA, tempPlayersA, previousFormations || []) + 
                                   calculateRecurrencePenalty(setterB, tempPlayersB, previousFormations || []);

          // Penalidade para as 2 jogadoras mais fracas ficarem juntas
          const tempIdsA = new Set(tempPlayersA.map(p => p.id));
          if (setterA) tempIdsA.add(setterA.id);
          const bottomTwoCountInTempA = Array.from(bottomTwoIds).filter(id => tempIdsA.has(id)).length;
          // Se Count for 2 ou 0, significa que estão juntas (ou no A ou no B)
          const bottomTwoTogetherPenalty = (bottomTwoCountInTempA === 2 || bottomTwoCountInTempA === 0) ? 5000 : 0;

          // Combined score with symmetry weight, RECURRENCE PENALTY and BOTTOM 2 SPLIT
          // Aumentamos o peso do diffBot4 para garantir que os mais fracos fiquem separados
          const newScore = diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetryDiff * 0.5) + recurrencePenalty + bottomTwoTogetherPenalty;
          
          const currentMetricsA = getTeamMetrics(setterA, playersA);
          const currentMetricsB = getTeamMetrics(setterB, playersB);
          
          let currentSymmetry = 0;
          const currentMaxLen = Math.min(currentMetricsA.sortedElos.length, currentMetricsB.sortedElos.length);
          for (let k = 0; k < currentMaxLen; k++) {
            currentSymmetry += Math.abs(currentMetricsA.sortedElos[k] - currentMetricsB.sortedElos[k]);
          }

          const currentRecurrence = calculateRecurrencePenalty(setterA, playersA, previousFormations || []) + 
                                  calculateRecurrencePenalty(setterB, playersB, previousFormations || []);

          const currentIdsA = new Set(playersA.map(p => p.id));
          if (setterA) currentIdsA.add(setterA.id);
          const bottomTwoCountInCurrA = Array.from(bottomTwoIds).filter(id => currentIdsA.has(id)).length;
          const currentBottomTwoPenalty = (bottomTwoCountInCurrA === 2 || bottomTwoCountInCurrA === 0) ? 5000 : 0;

          const currentScore = Math.abs(currentMetricsA.totalElo - currentMetricsB.totalElo) + 
                               Math.abs(currentMetricsA.top4Elo - currentMetricsB.top4Elo) * 0.8 +
                               Math.abs(currentMetricsA.bot4Elo - currentMetricsB.bot4Elo) * 1.5 +
                               Math.abs(currentMetricsA.totalSkills - currentMetricsB.totalSkills) * 20 +
                               (currentSymmetry * 0.5) + currentRecurrence + currentBottomTwoPenalty;

          // Tie-breaker criterion using the sum of practical skills (Ataque, Defesa, Levantamento)
          const currentPracticalDiff = Math.abs(
            getTeamPracticalSkillsSum(setterA, playersA) - getTeamPracticalSkillsSum(setterB, playersB)
          );
          const newPracticalDiff = Math.abs(
            getTeamPracticalSkillsSum(setterA, tempPlayersA) - getTeamPracticalSkillsSum(setterB, tempPlayersB)
          );

          const isBetterScore = newScore < currentScore;
          // If the primary metrics are tied or extremely close, break the tie by choosing the option with more balanced practical skills
          const isTieWithBetterPracticalSkills = 
            Math.abs(newScore - currentScore) < 0.01 && newPracticalDiff < currentPracticalDiff;

          if (isBetterScore || isTieWithBetterPracticalSkills) {
            playersA[i] = pB;
            playersB[j] = pA;
            currentEloA = newEloA;
            currentEloB = newEloB;
            improved = true;
            swaps.push({ playerA: pA.name, playerB: pB.name });
          }
        }
      }
    }

    // Otimização Adicional: Tenta trocar os Levantadores
    if (setterA && setterB) {
      const getTeamMetricsLocal = (s: Player | null, pls: Player[]) => {
        const allPlayers = s ? [s, ...pls] : pls;
        const totalElo = allPlayers.reduce((sum, p) => sum + calculateEffectiveElo(p), 0);
        const totalSkills = allPlayers.reduce((sum, p) => 
           sum + (p.skills?.setting || 1) + (p.skills?.attacking || 1) + (p.skills?.defense || 1) + (p.skills?.serving || 1), 0);
        const sortedElos = allPlayers.map(p => calculateEffectiveElo(p)).sort((a,b) => b-a);
        const top4Elo = sortedElos.slice(0, 4).reduce((a,b)=>a+b, 0);
        const bot4Elo = sortedElos.slice(-4).reduce((a,b)=>a+b, 0);
        return { totalElo, top4Elo, bot4Elo, totalSkills, sortedElos };
      };

      const getScoreForSetters = (sA: Player | null, sB: Player | null, pA: Player[], pB: Player[]) => {
        const metricsA = getTeamMetricsLocal(sA, pA);
        const metricsB = getTeamMetricsLocal(sB, pB);
        const diffElo = Math.abs(metricsA.totalElo - metricsB.totalElo);
        const diffTop4 = Math.abs(metricsA.top4Elo - metricsB.top4Elo);
        const diffBot4 = Math.abs(metricsA.bot4Elo - metricsB.bot4Elo);
        const diffSkills = Math.abs(metricsA.totalSkills - metricsB.totalSkills);
        let symmetry = 0;
        const mLen = Math.min(metricsA.sortedElos.length, metricsB.sortedElos.length);
        for (let k = 0; k < mLen; k++) symmetry += Math.abs(metricsA.sortedElos[k] - metricsB.sortedElos[k]);
        const rec = calculateRecurrencePenalty(sA, pA, previousFormations || []) + calculateRecurrencePenalty(sB, pB, previousFormations || []);
        const idsA = new Set(pA.map(p => p.id));
        if (sA) idsA.add(sA.id);
        const b2Count = Array.from(bottomTwoIds).filter(id => idsA.has(id)).length;
        const b2Penalty = (b2Count === 2 || b2Count === 0) ? 5000 : 0;
        return diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetry * 0.5) + rec + b2Penalty;
      };

      const cScore = getScoreForSetters(setterA, setterB, playersA, playersB);
      const sScore = getScoreForSetters(setterB, setterA, playersA, playersB);

      if (sScore < cScore) {
        const temp = setterA;
        setterA = setterB;
        setterB = temp;
        currentEloA = calculateTotalEffectiveElo(setterA, playersA);
        currentEloB = calculateTotalEffectiveElo(setterB, playersB);
        improved = true;
        swaps.push({ playerA: `Setter: ${setterB?.name}`, playerB: `Setter: ${setterA?.name}` });
      }
    }
  }

  // --- CAMADA DE AUTO-CORREÇÃO (GARANTIA DO AGENTE DE BALANCEAMENTO) ---
  // O Agente de IA valida se a regra de separação das 2 jogadoras mais fracas foi cumprida.
  const checkBottomTwo = (sA: Player | null, pA: Player[]) => {
    const idsA = new Set(pA.map(p => p.id));
    if (sA) idsA.add(sA.id);
    return Array.from(bottomTwoIds).filter(id => idsA.has(id)).length;
  };

  let b2CountInA = checkBottomTwo(setterA, playersA);
  if (b2CountInA === 2 || b2CountInA === 0) {
    // CORREÇÃO AUTOMÁTICA: As duas menores técnicas estão no mesmo time.
    // O sistema força uma troca imediata para garantir a regra.
    const sourceTeam = b2CountInA === 2 ? playersA : playersB;
    const targetTeam = b2CountInA === 2 ? playersB : playersA;
    
    // Identifica qual dos dois B2 será movido
    const pMove = sourceTeam.find(p => bottomTwoIds.has(p.id));
    // Identifica um alvo no outro time (que não seja o outro B2) para troca
    const pTarget = targetTeam.find(p => !bottomTwoIds.has(p.id));

    if (pMove && pTarget) {
      const idxS = sourceTeam.indexOf(pMove);
      const idxT = targetTeam.indexOf(pTarget);
      sourceTeam[idxS] = pTarget;
      targetTeam[idxT] = pMove;
      swaps.push({ playerA: `AUTO-FIX: ${pMove.name}`, playerB: pTarget.name });
    }
  }

  // Calculate REAL ELO and Technical Efficiency for display purposes
  const realElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + (p.elo || 1200), 0) + (setter?.elo || 0);
  };

  const totalEff = (setter: Player | null, players: Player[]) => {
    return Math.round(players.reduce((sum, p) => sum + calculateEffectiveElo(p), 0) + calculateEffectiveElo(setter));
  };

  const result: GenerationResult = {
    teamA: { 
      setter: setterA, 
      players: playersA, 
      totalElo: realElo(setterA, playersA),
      totalEfficiency: totalEff(setterA, playersA)
    },
    teamB: { 
      setter: setterB, 
      players: playersB, 
      totalElo: realElo(setterB, playersB),
      totalEfficiency: totalEff(setterB, playersB)
    },
    swaps,
    combinationsCount,
    remainingPlayers
  };

  // Check similarity and apply forced swaps if needed
  if (previousFormations && checkSimilarity(result, previousFormations)) {
    return applyForcedSwaps(result);
  }

  return result;
}

