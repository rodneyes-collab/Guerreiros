
import { Player, Gender, Team, GenerationResult, TournamentTeam, Tournament } from '../types';

export function getPriorityQueue(attendanceList: Player[], count: number = 12, maxSetters: number = 2): { topPlayers: Player[], remainingPlayers: Player[] } {
  const sortByPriority = (a: Player, b: Player) => {
    const benchedA = a.consecutiveBenched || 0;
    const benchedB = b.consecutiveBenched || 0;
    if (benchedA !== benchedB) return benchedB - benchedA;

    const matchesA = a.dailyMatches || 0;
    const matchesB = b.dailyMatches || 0;
    if (matchesA !== matchesB) return matchesA - matchesB;

    const playedA = a.playedLastMatch ? 1 : 0;
    const playedB = b.playedLastMatch ? 1 : 0;
    if (playedA !== playedB) return playedA - playedB;

    const orderA = a.arrivalOrder ?? 999;
    const orderB = b.arrivalOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;

    return 0;
  };

  // Separate setters and others
  const officialSetters = attendanceList.filter(p => p.isOfficialSetter).sort(sortByPriority);
  const nonSetters = attendanceList.filter(p => !p.isOfficialSetter).sort(sortByPriority);

  // Pick up to maxSetters (2) from official setters
  const selectedSetters = officialSetters.slice(0, maxSetters);
  const leftoverSetters = officialSetters.slice(maxSetters);

  // To avoid having more than 2 official setters in a match, we prioritize non-setters.
  // We only use leftover setters if we don't have enough non-setters to reach the required count.
  const neededCount = Math.max(0, count - selectedSetters.length);
  
  let selectedOthers: Player[] = [];
  let remainingPlayers: Player[] = [];

  if (nonSetters.length >= neededCount) {
    // We have enough non-setters, so we bench all leftover setters
    selectedOthers = nonSetters.slice(0, neededCount);
    remainingPlayers = [...nonSetters.slice(neededCount), ...leftoverSetters].sort(sortByPriority);
  } else {
    // We don't have enough non-setters, so we MUST use some leftover setters
    selectedOthers = [...nonSetters];
    const stillNeeded = neededCount - nonSetters.length;
    selectedOthers.push(...leftoverSetters.slice(0, stillNeeded));
    remainingPlayers = leftoverSetters.slice(stillNeeded);
  }

  return {
    topPlayers: [...selectedSetters, ...selectedOthers],
    remainingPlayers
  };
}

export function generateTournamentTeams(participants: Player[], numTeams: number): { teams: TournamentTeam[], reserves: string[] } {
  const sortedPlayers = [...participants].sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  
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

  const reserves: string[] = [];

  // 1. Distribute official setters (max 1 per team)
  let setterIdx = 0;
  while (setterIdx < officialSetters.length) {
    const setter = officialSetters[setterIdx];
    if (setterIdx < numTeams) {
      teams[setterIdx].players.push(setter.id);
      teams[setterIdx].totalElo = (teams[setterIdx].totalElo || 0) + (setter.elo || 1200);
    } else {
      reserves.push(setter.id);
    }
    setterIdx++;
  }

  // 2. Distribute others (until teams have 6 players)
  const men = others.filter(p => p.gender === Gender.MALE);
  const women = others.filter(p => p.gender === Gender.FEMALE);
  const otherPool = [...men, ...women]; // Already sorted by ELO indirectly because 'others' was sorted

  let currentTeamIdx = 0;
  let direction = 1;

  while (otherPool.length > 0) {
    const player = otherPool.shift()!;
    
    // Find a team that has less than 6 players
    let foundTeam = false;
    let attempts = 0;
    while (attempts < numTeams) {
      if (teams[currentTeamIdx].players.length < 6) {
        teams[currentTeamIdx].players.push(player.id);
        teams[currentTeamIdx].totalElo = (teams[currentTeamIdx].totalElo || 0) + (player.elo || 1200);
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
    
    for (let i = 0; i < teams.length; i++) {
      for (let j = 0; j < teams.length; j++) {
        if (i === j) continue;

        const teamA = teams[i];
        const teamB = teams[j];
        
        for (let pAIdx = 0; pAIdx < teamA.players.length; pAIdx++) {
          for (let pBIdx = 0; pBIdx < teamB.players.length; pBIdx++) {
            const pA = participants.find(p => p.id === teamA.players[pAIdx]);
            const pB = participants.find(p => p.id === teamB.players[pBIdx]);

            if (!pA || !pB) continue;

            if (pA.isOfficialSetter === pB.isOfficialSetter && pA.gender === pB.gender) {
              const currentDiff = Math.abs((teamA.totalElo || 0) - (teamB.totalElo || 0));
              
              const newEloA = (teamA.totalElo || 0) - (pA.elo || 1200) + (pB.elo || 1200);
              const newEloB = (teamB.totalElo || 0) - (pB.elo || 1200) + (pA.elo || 1200);
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

export function generateTeams(attendanceList: Player[]): GenerationResult {
  const { topPlayers: matchPool, remainingPlayers } = getPriorityQueue(attendanceList, 12, 2);

  // Shuffle matchPool to handle equal ELOs randomly and vary initial distribution
  const shuffledPool = [...matchPool].sort(() => Math.random() - 0.5);

  const poolSetters = shuffledPool.filter(p => p.isOfficialSetter);
  const poolNonSetters = shuffledPool.filter(p => !p.isOfficialSetter).sort((a, b) => b.elo - a.elo);

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  
  if (poolSetters.length >= 2) {
    // Randomly assign setters to A or B
    const sIndices = [0, 1].sort(() => Math.random() - 0.5);
    setterA = poolSetters[sIndices[0]];
    setterB = poolSetters[sIndices[1]];
    
    if (poolSetters.length > 2) {
      poolNonSetters.push(...poolSetters.slice(2));
      poolNonSetters.sort((a, b) => b.elo - a.elo);
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

  const men = poolNonSetters.filter(p => p.gender === Gender.MALE).sort((a, b) => b.elo - a.elo);
  const women = poolNonSetters.filter(p => p.gender === Gender.FEMALE).sort((a, b) => b.elo - a.elo);

  let playersA: Player[] = [];
  let playersB: Player[] = [];

  const requiredA = setterA ? 5 : 6;
  const requiredB = setterB ? 5 : 6;

  // Randomize initial team choice for the greedy distribution
  const firstTeam = Math.random() > 0.5 ? 'A' : 'B';

  men.forEach((man) => {
    const eloA = playersA.reduce((sum, p) => sum + p.elo, 0) + (setterA?.elo || 0);
    const eloB = playersB.reduce((sum, p) => sum + p.elo, 0) + (setterB?.elo || 0);

    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;

    if (canAddToA && (!canAddToB || eloA <= eloB)) {
      playersA.push(man);
    } else if (canAddToB) {
      playersB.push(man);
    } else if (canAddToA) {
      playersA.push(man);
    }
  });

  women.forEach(woman => {
    const eloA = playersA.reduce((sum, p) => sum + p.elo, 0) + (setterA?.elo || 0);
    const eloB = playersB.reduce((sum, p) => sum + p.elo, 0) + (setterB?.elo || 0);

    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;

    if (canAddToA && (!canAddToB || eloA <= eloB)) {
      playersA.push(woman);
    } else if (canAddToB) {
      playersB.push(woman);
    } else if (canAddToA) {
      playersA.push(woman);
    }
  });

  // 5. Otimização por Trocas (Refinamento de Equilíbrio)
  const calculateTotalElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + p.elo, 0) + (setter?.elo || 0);
  };

  let currentEloA = calculateTotalElo(setterA, playersA);
  let currentEloB = calculateTotalElo(setterB, playersB);
  let improved = true;
  const swaps: { playerA: string; playerB: string }[] = [];

  while (improved) {
    improved = false;
    let bestDiff = Math.abs(currentEloA - currentEloB);

    // Shuffle indices to explore different swap paths and avoid deterministic local optima
    const indicesA = Array.from({ length: playersA.length }, (_, i) => i).sort(() => Math.random() - 0.5);
    const indicesB = Array.from({ length: playersB.length }, (_, i) => i).sort(() => Math.random() - 0.5);

    for (const i of indicesA) {
      for (const j of indicesB) {
        const pA = playersA[i];
        const pB = playersB[j];

        if (pA.gender === pB.gender) {
          const newEloA = currentEloA - pA.elo + pB.elo;
          const newEloB = currentEloB - pB.elo + pA.elo;
          const newDiff = Math.abs(newEloA - newEloB);

          if (newDiff < bestDiff) {
            playersA[i] = pB;
            playersB[j] = pA;
            currentEloA = newEloA;
            currentEloB = newEloB;
            bestDiff = newDiff;
            improved = true;
            swaps.push({ playerA: pA.name, playerB: pB.name });
          }
        }
      }
    }
  }

  return {
    teamA: { setter: setterA, players: playersA, totalElo: currentEloA },
    teamB: { setter: setterB, players: playersB, totalElo: currentEloB },
    swaps,
    remainingPlayers
  };
}
