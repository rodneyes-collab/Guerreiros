
import { Player, Gender, Team, GenerationResult } from '../types';

export function generateTeams(attendanceList: Player[]): GenerationResult {
  // 1. Seleção de Levantadores Oficiais
  const officialSetters = attendanceList.filter(p => p.isOfficialSetter);
  const nonSetters = attendanceList.filter(p => !p.isOfficialSetter);

  // Regra: Escolhe primeiro os levantadores oficiais por:
  // 1º Menos partidas no dia (Rodízio)
  // 2º Ordem de chegada na lista de presença (com um pequeno fator aleatório para "Nova Escalação")
  // 3º Nível técnico (ELO) em caso de desempate
  const sortedOfficialSetters = [...officialSetters].sort((a, b) => {
    // Prioridade 1: Quem descansou na partida anterior (tem prioridade máxima)
    if (a.playedLastMatch !== b.playedLastMatch) {
      return a.playedLastMatch ? 1 : -1;
    }
    // Prioridade 2: Menos partidas no dia (Rodízio)
    if (a.dailyMatches !== b.dailyMatches) {
      return a.dailyMatches - b.dailyMatches;
    }
    // Prioridade 3: Aleatoriedade controlada para permitir novas escalações
    // Se ambos têm o mesmo status de rodízio, damos uma chance aleatória
    return Math.random() - 0.5;
  });

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  let remainingSetters: Player[] = [];

  if (sortedOfficialSetters.length >= 2) {
    setterA = sortedOfficialSetters[0];
    setterB = sortedOfficialSetters[1];
    remainingSetters = sortedOfficialSetters.slice(2);
  } else if (sortedOfficialSetters.length === 1) {
    setterA = sortedOfficialSetters[0];
  }

  // 2. Seleção dos demais jogadores por número de partidas, ordem de chegada e gênero
  const pool = [...nonSetters].sort((a, b) => {
    // Prioridade 1: Quem descansou na partida anterior (tem prioridade máxima)
    if (a.playedLastMatch !== b.playedLastMatch) {
      return a.playedLastMatch ? 1 : -1;
    }
    // Prioridade 2: Menos partidas no dia (Rodízio)
    if (a.dailyMatches !== b.dailyMatches) {
      return a.dailyMatches - b.dailyMatches;
    }
    // Prioridade 3: Aleatoriedade para variar a escalação entre jogadores com mesma prioridade
    return Math.random() - 0.5;
  });

  // Define quantos jogadores de linha precisamos
  const requiredA = setterA ? 5 : 6;
  const requiredB = setterB ? 5 : 6;
  const totalRequired = requiredA + requiredB;
  
  const matchPool = pool.slice(0, totalRequired);
  const remainingLinePlayers = pool.slice(totalRequired);

  const men = matchPool.filter(p => p.gender === Gender.MALE).sort((a, b) => b.elo - a.elo);
  const women = matchPool.filter(p => p.gender === Gender.FEMALE).sort((a, b) => b.elo - a.elo);

  let playersA: Player[] = [];
  let playersB: Player[] = [];

  // 3. Distribuir Homens (Equilíbrio de ELO)
  men.forEach((man, index) => {
    const eloA = playersA.reduce((sum, p) => sum + p.elo, 0) + (setterA?.elo || 0);
    const eloB = playersB.reduce((sum, p) => sum + p.elo, 0) + (setterB?.elo || 0);

    if ((playersA.length < requiredA && (eloA <= eloB || playersB.length >= requiredB)) || playersB.length >= requiredB) {
      playersA.push(man);
    } else {
      playersB.push(man);
    }
  });

  // 4. Distribuir Mulheres (Equilíbrio de ELO)
  women.forEach(woman => {
    const eloA = playersA.reduce((sum, p) => sum + p.elo, 0) + (setterA?.elo || 0);
    const eloB = playersB.reduce((sum, p) => sum + p.elo, 0) + (setterB?.elo || 0);

    if (playersA.length < requiredA && (eloA <= eloB || playersB.length >= requiredB)) {
      playersA.push(woman);
    } else {
      playersB.push(woman);
    }
  });

  // 5. Otimização por Trocas (Refinamento de Equilíbrio)
  // Tenta trocar jogadores do mesmo gênero para diminuir a diferença de ELO
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

    for (let i = 0; i < playersA.length; i++) {
      for (let j = 0; j < playersB.length; j++) {
        const pA = playersA[i];
        const pB = playersB[j];

        // Só troca se forem do mesmo gênero
        if (pA.gender === pB.gender) {
          const newEloA = currentEloA - pA.elo + pB.elo;
          const newEloB = currentEloB - pB.elo + pA.elo;
          const newDiff = Math.abs(newEloA - newEloB);

          if (newDiff < bestDiff) {
            // Realiza a troca
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
    remainingPlayers: [...remainingSetters, ...remainingLinePlayers].sort((a, b) => {
      if (a.playedLastMatch !== b.playedLastMatch) {
        return a.playedLastMatch ? 1 : -1;
      }
      if (a.dailyMatches !== b.dailyMatches) {
        return a.dailyMatches - b.dailyMatches;
      }
      return (a.arrivalOrder || 0) - (b.arrivalOrder || 0);
    })
  };
}
