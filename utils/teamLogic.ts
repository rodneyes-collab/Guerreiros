
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
 * Calcula a posição tática ideal (1-6) para todos os jogadores do time simultaneamente.
 * Garante unicidade e respeita regras de simetria (Homens opostos, Fortes opostos).
 */
export const calculateTeamPositions = (team: Team, opponent: Team | null = null): Record<string, string> => {
  const allPlayers = [team.setter, ...team.players].filter((p): p is Player => p !== null);
  
  // Mapeamento final (ID -> Pos)
  const mapping: Record<string, string> = {};
  
  if (allPlayers.length !== 6) {
    // Fallback unificado e garantido: se não tiver 6 jogadores, usa a ordem da lista
    allPlayers.forEach((p, idx) => { 
      mapping[p.id] = (idx + 1).toString(); 
    });
    return mapping;
  }

  // Ordena por eficiência técnica decrescente
  const sorted = [...allPlayers].sort((a, b) => calculateEffectiveElo(b) - calculateEffectiveElo(a));
  
  const positions: (Player | null)[] = new Array(7).fill(null); // use 1-6 indices

  // 1. Levantador Oficial no 3 (ou o melhor 'passador' técnico)
  const mainSetter = team.setter || allPlayers.find(p => p.isOfficialSetter) || sorted.find(p => (p.skills?.setting || 0) >= 3) || sorted[2];
  positions[3] = mainSetter;
  
  let remaining = allPlayers.filter(p => p.id !== mainSetter.id);

  // 2. Definir o Oposto do Levantador (Posição 6)
  const topAttacker = remaining.sort((a, b) => (b.skills?.attacking || 0) - (a.skills?.attacking || 0))[0];
  positions[6] = topAttacker;
  remaining = remaining.filter(p => p.id !== topAttacker.id);

  // 3. Casal de Pontas / Fortes (4 e 1)
  const nextAttacker = remaining.sort((a, b) => (b.skills?.attacking || 0) - (a.skills?.attacking || 0))[0];
  positions[4] = nextAttacker;
  remaining = remaining.filter(p => p.id !== nextAttacker.id);

  // Oposto do 4 é o 1
  const oppositeOf4 = remaining.sort((a, b) => (b.skills?.defense || 0) - (a.skills?.defense || 0))[0];
  positions[1] = oppositeOf4;
  remaining = remaining.filter(p => p.id !== oppositeOf4.id);

  // 4. Posições 2 (Saída) e 5 (Fundo Esquerda)
  const topDefender = remaining.sort((a, b) => (b.skills?.defense || 0) - (a.skills?.defense || 0))[0];
  positions[5] = topDefender;
  remaining = remaining.filter(p => p.id !== topDefender.id);
  
  // O último player fica no 2
  positions[2] = remaining[0];

  // Ajuste Final para Homens Opostos (Regra do Usuário)
  const teamMen = allPlayers.filter(p => p.gender === Gender.MALE);
  if (teamMen.length === 2 && positions.length === 7) {
    const m1 = teamMen[0];
    const m2 = teamMen[1];
    
    const pos1Idx = positions.findIndex(p => p?.id === m1.id);
    const pos2Idx = positions.findIndex(p => p?.id === m2.id);
    
    if (pos1Idx > 0 && pos2Idx > 0) {
      const isOpposite = (a: number, b: number) => 
        (a === 1 && b === 4) || (a === 4 && b === 1) ||
        (a === 2 && b === 5) || (a === 5 && b === 2) ||
        (a === 3 && b === 6) || (a === 6 && b === 3);

      if (!isOpposite(pos1Idx, pos2Idx)) {
        // Garantimos que a posição 3 (Levantador) NUNCA seja afetada por essa rotação de opostos
        const setterId = mainSetter.id;
        
        if (m1.id === setterId) {
          // m1 é o levantador (na P3). m2 deve ser colocado na posição 6 (oposta direta de P3).
          const currentAt6 = positions[6];
          positions[pos2Idx] = currentAt6;
          positions[6] = m2;
        } else if (m2.id === setterId) {
          // m2 é o levantador (na P3). m1 deve ser colocado na posição 6 (oposta direta de P3).
          const currentAt6 = positions[6];
          positions[pos1Idx] = currentAt6;
          positions[6] = m1;
        } else {
          // Nenhum dos dois é o levantador. O levantador está seguro na posição 3.
          // Como o levantador ocupa a P3, eles não podem usar a diagonal (3, 6).
          // Devem, portanto, ser opostos nas diagonais (1, 4) ou (2, 5).
          if (pos1Idx === 1 || pos1Idx === 4 || pos1Idx === 2 || pos1Idx === 5) {
            const targetPos = pos1Idx === 1 ? 4 : (pos1Idx === 4 ? 1 : (pos1Idx === 2 ? 5 : 2));
            const currentAtTarget = positions[targetPos];
            positions[pos2Idx] = currentAtTarget;
            positions[targetPos] = m2;
          } else {
            // Se pos1Idx for 6, significa que m2 está em uma posição (1, 2, 4, 5).
            // Colocamos m1 na posição oposta de m2.
            const targetPos = pos2Idx === 1 ? 4 : (pos2Idx === 4 ? 1 : (pos2Idx === 2 ? 5 : 2));
            const currentAtTarget = positions[targetPos];
            positions[pos1Idx] = currentAtTarget;
            positions[targetPos] = m1;
          }
        }
      }
    }
  }

  // Preenche o mapping garantindo unicidade final
  for (let i = 1; i <= 6; i++) {
    if (positions[i]) {
      mapping[positions[i]!.id] = i.toString();
    }
  }

  // Backup final para jogadores que possam ter ficado de fora (segurança contra bugs de lógica)
  allPlayers.forEach(p => {
    if (!mapping[p.id]) {
      const usedPos = new Set(Object.values(mapping));
      for (let i = 1; i <= 6; i++) {
        if (!usedPos.has(i.toString())) {
          mapping[p.id] = i.toString();
          usedPos.add(i.toString());
          break;
        }
      }
    }
  });

  return mapping;
};

/**
 * Sugere a posição tática ideal baseada nas competências técnicas (Retorna o número da posição 1-6)
 */
export const suggestPosition = (player: Player | null): string => {
  if (!player) return '';
  
  const s = player.skills || { setting: 1, attacking: 1, defense: 1, serving: 1 };
  
  // 1. Levantador (Posição 3 - Hub de distribuição)
  if (player.isOfficialSetter || (s.setting >= 3 && s.setting >= s.attacking && s.setting >= s.defense)) {
    return '3';
  }
  
  // 2. Central (Posição 6 - Foco em bloqueio e ataque rápido)
  if (player.impactLevel === 3 && s.attacking >= 2) {
    return '6';
  }

  // 3. Ponta (Posição 4 - Atacante de entrada equilibrado)
  if (s.attacking >= 2 && s.defense >= 2) {
    return '4';
  }

  // 4. Oposto (Posição 2 - Saída de rede agressiva)
  if (s.attacking >= 2) {
    return '2';
  }

  // 5. Líbero / Fundo (Posição 5 - Defesa profunda)
  if (s.defense >= 3 && s.attacking <= 2) {
    return '5';
  }

  // 6. Default: Fundo / Apoio (Posição 1 - Defesa/Saque)
  return '1';
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

// Reusable safety function to validate and enforce 6 vs 6 team sizes with unique players
export const validateAndForceBalancedSizes = (result: GenerationResult, matchPool: Player[]): GenerationResult => {
  const setterA = result.teamA.setter;
  const setterB = result.teamB.setter;
  const playersA = result.teamA.players || [];
  const playersB = result.teamB.players || [];

  const allAssignedIds = new Set([
    setterA?.id,
    ...playersA.map(p => p.id),
    setterB?.id,
    ...playersB.map(p => p.id)
  ].filter(Boolean));

  const totalA = (setterA ? 1 : 0) + playersA.length;
  const totalB = (setterB ? 1 : 0) + playersB.length;

  if (totalA !== 6 || totalB !== 6 || allAssignedIds.size !== 12) {
    console.warn("Anomalia detectada na integridade ou tamanho dos times (Atletas A:", totalA, ", Atletas B:", totalB, "). Aplicando correção rígida.");
    const cleanPool = matchPool && matchPool.length >= 12 ? matchPool.slice(0, 12) : [];
    if (cleanPool.length < 12) return result; // Fallback if not enough players

    // Designate Setters
    let fixedSetterA = setterA && cleanPool.some(p => p.id === setterA.id) ? setterA : null;
    let fixedSetterB = setterB && cleanPool.some(p => p.id === setterB.id) ? setterB : null;

    const settersPool = cleanPool.filter(p => p.isOfficialSetter);
    if (!fixedSetterA) {
      fixedSetterA = settersPool[0] || cleanPool[0];
    }
    if (!fixedSetterB) {
      fixedSetterB = settersPool.filter(p => p.id !== fixedSetterA?.id)[0] || cleanPool.filter(p => p.id !== fixedSetterA?.id)[0];
    }

    const assignedSetters = new Set([fixedSetterA?.id, fixedSetterB?.id].filter(Boolean));
    const cleanNonSetters = cleanPool.filter(p => !assignedSetters.has(p.id));

    // Sort cleanNonSetters by gender, then by ELO to balance
    const getElo = (p: Player | null) => calculateEffectiveElo(p);
    const targetA = fixedSetterA ? 5 : 6;
    const targetB = fixedSetterB ? 5 : 6;

    const fixedPlayersA: Player[] = [];
    const fixedPlayersB: Player[] = [];

    // Prioridade absoluta: identificar e separar as 2 jogadoras / atletas mais fracas (pela soma técnica)
    const techSorted = [...cleanPool].sort((a, b) => calculatePracticalSkillsSum(a) - calculatePracticalSkillsSum(b));
    const cleanSetterIds = new Set([fixedSetterA?.id, fixedSetterB?.id].filter(Boolean));
    const cleanBottomTwoArray = techSorted.slice(0, 2);
    const cleanBottomTwoSetters = cleanBottomTwoArray.filter(p => cleanSetterIds.has(p.id));
    const cleanBottomTwoNonSetters = cleanBottomTwoArray.filter(p => !cleanSetterIds.has(p.id));

  if (cleanBottomTwoSetters.length === 1) {
      const otherB2 = cleanBottomTwoNonSetters[0];
      // If setterA is the B2, we need to assign otherB2 to B, but only if it doesn't break gender balance.
      // Or rather, we assign otherB2 to the opposite team of B2Setter, but check if it helps or hurts gender balance.
      // For now, let's keep the mandatory separation, but we can improve which team gets which if there were options.
      // Mandatory: B2 Setter and B2 Non-setter must be in different teams.
      if (fixedSetterA?.id === cleanBottomTwoSetters[0].id) {
        if (fixedPlayersB.length < targetB) fixedPlayersB.push(otherB2);
      } else {
        if (fixedPlayersA.length < targetA) fixedPlayersA.push(otherB2);
      }
    } else if (cleanBottomTwoSetters.length === 0 && cleanBottomTwoNonSetters.length === 2) {
      // Both are non-setters, must separate.
      const b2_1 = cleanBottomTwoNonSetters[0];
      const b2_2 = cleanBottomTwoNonSetters[1];
      
      fixedPlayersA.push(b2_1);
      fixedPlayersB.push(b2_2);
    }

    const preAssignedIds = new Set([...fixedPlayersA, ...fixedPlayersB].map(p => p.id));
    const menPool = cleanNonSetters.filter(p => p.gender === Gender.MALE && !preAssignedIds.has(p.id)).sort((a, b) => getElo(b) - getElo(a));
    const womenPool = cleanNonSetters.filter(p => p.gender === Gender.FEMALE && !preAssignedIds.has(p.id)).sort((a, b) => getElo(b) - getElo(a));

    const getGenderCountA = (gender: Gender) => fixedPlayersA.filter(p => p.gender === gender).length;
    const getGenderCountB = (gender: Gender) => fixedPlayersB.filter(p => p.gender === gender).length;

    // Alternate distribution of men while checking overall balance
    menPool.forEach((m, idx) => {
      const canAddToA = fixedPlayersA.length < targetA;
      const canAddToB = fixedPlayersB.length < targetB;
      const mA = getGenderCountA(Gender.MALE);
      const mB = getGenderCountB(Gender.MALE);

      if (mA < mB && canAddToA) {
        fixedPlayersA.push(m);
      } else if (mB < mA && canAddToB) {
        fixedPlayersB.push(m);
      } else {
        if (idx % 2 === 0) {
          if (canAddToA) fixedPlayersA.push(m);
          else if (canAddToB) fixedPlayersB.push(m);
        } else {
          if (canAddToB) fixedPlayersB.push(m);
          else if (canAddToA) fixedPlayersA.push(m);
        }
      }
    });

    // Alternate distribution of women while checking overall balance
    womenPool.forEach((w, idx) => {
      const canAddToA = fixedPlayersA.length < targetA;
      const canAddToB = fixedPlayersB.length < targetB;
      const wA = getGenderCountA(Gender.FEMALE);
      const wB = getGenderCountB(Gender.FEMALE);

      if (wA < wB && canAddToA) {
        fixedPlayersA.push(w);
      } else if (wB < wA && canAddToB) {
        fixedPlayersB.push(w);
      } else {
        if (idx % 2 === 0) {
          if (canAddToA) fixedPlayersA.push(w);
          else if (canAddToB) fixedPlayersB.push(w);
        } else {
          if (canAddToB) fixedPlayersB.push(w);
          else if (canAddToA) fixedPlayersA.push(w);
        }
      }
    });

    // Safe fallbacks to guarantee exact layout counts
    const alreadyAssigned = new Set([...fixedPlayersA.map(p => p.id), ...fixedPlayersB.map(p => p.id)]);
    const remainder = cleanNonSetters.filter(p => !alreadyAssigned.has(p.id));
    remainder.forEach(p => {
      if (fixedPlayersA.length < targetA) fixedPlayersA.push(p);
      else if (fixedPlayersB.length < targetB) fixedPlayersB.push(p);
    });

    // Truncate/pad to exact target lengths just in case of any weird bounds
    while (fixedPlayersA.length > targetA) fixedPlayersA.pop();
    while (fixedPlayersB.length > targetB) fixedPlayersB.pop();

    const realElo = (setter: Player | null, players: Player[]) => {
      return players.reduce((sum, p) => sum + (p.elo || 1200), 0) + (setter?.elo || 0);
    };

    const totalEff = (setter: Player | null, players: Player[]) => {
      return Math.round(players.reduce((sum, p) => sum + calculateEffectiveElo(p), 0) + calculateEffectiveElo(setter));
    };

    return {
      ...result,
      teamA: {
        setter: fixedSetterA,
        players: fixedPlayersA,
        totalElo: realElo(fixedSetterA, fixedPlayersA),
        totalEfficiency: totalEff(fixedSetterA, fixedPlayersA)
      },
      teamB: {
        setter: fixedSetterB,
        players: fixedPlayersB,
        totalElo: realElo(fixedSetterB, fixedPlayersB),
        totalEfficiency: totalEff(fixedSetterB, fixedPlayersB)
      }
    };
  }

  return result;
};

// Function to apply forced swaps to increase variety
export const applyForcedSwaps = (result: GenerationResult, bottomTwoIds?: Set<string>): GenerationResult => {
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

  const newResult: GenerationResult = {
    ...result,
    teamA: { ...teamA, setter: newSetterA, players: playersA },
    teamB: { ...teamB, setter: newSetterB, players: playersB },
    swaps: [...(result.swaps || []), { playerA: 'Forced Swap', playerB: 'Adjustment' }]
  };

  // Re-validate Bottom Two after forced swap
  if (bottomTwoIds) {
    const checkBottomTwo = (s: Player | null, pls: Player[]) => {
      const ids = new Set([s?.id, ...pls.map(p => p.id)].filter(Boolean));
      return Array.from(bottomTwoIds).filter(id => ids.has(id)).length;
    };

    let b2A = checkBottomTwo(newResult.teamA.setter, newResult.teamA.players);
    if (b2A === 2 || b2A === 0) {
      // Re-fix it
      const isBothInA = b2A === 2;
      const sPlayers = isBothInA ? newResult.teamA.players : newResult.teamB.players;
      const tPlayers = isBothInA ? newResult.teamB.players : newResult.teamA.players;
      const setterS = isBothInA ? newResult.teamA.setter : newResult.teamB.setter;

      const pMov = sPlayers.find(p => bottomTwoIds.has(p.id));
      if (pMov) {
        const pTar = tPlayers.find(p => p.gender === pMov.gender && !bottomTwoIds.has(p.id));
        if (pTar) {
          const idxS = sPlayers.indexOf(pMov);
          const idxT = tPlayers.indexOf(pTar);
          sPlayers[idxS] = pTar;
          tPlayers[idxT] = pMov;
        } else {
          const pTarFallback = tPlayers.find(p => !bottomTwoIds.has(p.id));
          if (pTarFallback) {
             const idxS = sPlayers.indexOf(pMov);
             const idxT = tPlayers.indexOf(pTarFallback);
             sPlayers[idxS] = pTarFallback;
             tPlayers[idxT] = pMov;
          }
        }
      } else if (setterS && bottomTwoIds.has(setterS.id)) {
        // If setter is the one to move, it's more complex, but we can just swap another player
        // to balance genders if needed, but here we just need them separated.
        // Actually if setter is B2, and another player is B2, and they are together,
        // moving the non-setter B2 works.
        const otherB2 = sPlayers.find(p => bottomTwoIds.has(p.id));
        if (otherB2) {
           const pTar = tPlayers.find(p => p.gender === otherB2.gender && !bottomTwoIds.has(p.id));
           if (pTar) {
             const idxS = sPlayers.indexOf(otherB2);
             const idxT = tPlayers.indexOf(pTar);
             sPlayers[idxS] = pTar;
             tPlayers[idxT] = otherB2;
           } else {
             const pTarFallback = tPlayers.find(p => !bottomTwoIds.has(p.id));
             if (pTarFallback) {
               const idxS = sPlayers.indexOf(otherB2);
               const idxT = tPlayers.indexOf(pTarFallback);
               sPlayers[idxS] = pTarFallback;
               tPlayers[idxT] = otherB2;
             }
           }
        }
      }
    }
  }

  return newResult;
};

export function getPriorityQueue(attendanceList: Player[], count: number = 12, maxSetters: number = 2): { topPlayers: Player[], remainingPlayers: Player[] } {
  const sortByPriority = (a: Player, b: Player) => {
    // NÍVEL 1: Rodagem Imediata - Prioridade absoluta para quem NÃO jogou a última partida
    const playedA = a.playedLastMatch ? 1 : 0;
    const playedB = b.playedLastMatch ? 1 : 0;
    if (playedA !== playedB) return playedA - playedB;

    // NÍVEL 2: Volume de Jogo - Desempate para quem jogou MENOS no total do dia
    const matchesA = a.dailyMatches || 0;
    const matchesB = b.dailyMatches || 0;
    if (matchesA !== matchesB) return matchesA - matchesB;

    // NÍVEL 3: Consistência de Banco - Quem está há mais tempo sentado (consecutivamente)
    const benchedA = a.consecutiveBenched || 0;
    const benchedB = b.consecutiveBenched || 0;
    if (benchedA !== benchedB) return benchedB - benchedA;

    // NÍVEL 4: Ordem de Chegada - Critério final de desempate (Prioridade na Fila de Presença)
    const orderA = a.arrivalOrder ?? 999;
    const orderB = b.arrivalOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;

    return 0;
  };

  const allPlayersSorted = [...attendanceList].sort(sortByPriority);

  // 1. Selecionamos inicialmente os 12 primeiros
  let topPlayers = allPlayersSorted.slice(0, count);
  let remainingPlayers = allPlayersSorted.slice(count);

  // 2. Ajustamos o número de levantadores para exatamente maxSetters
  const currentSetters = topPlayers.filter(p => p.isOfficialSetter);
  
  // Se houver mais levantadores do que permitido, removemos o excedente
  if (currentSetters.length > maxSetters) {
      const extraCount = currentSetters.length - maxSetters;
      for (let i = 0; i < extraCount; i++) {
          const setterIdx = topPlayers.slice().reverse().findIndex(p => p.isOfficialSetter);
          const actualIdx = topPlayers.length - 1 - setterIdx;
          const extraSetter = topPlayers.splice(actualIdx, 1)[0];
          remainingPlayers.push(extraSetter);
          
          const nonSetterIdx = remainingPlayers.findIndex(p => !p.isOfficialSetter);
          if (nonSetterIdx !== -1) {
              const replacement = remainingPlayers.splice(nonSetterIdx, 1)[0];
              topPlayers.push(replacement);
          }
      }
  } 
  // Se houver menos levantadores do que permitido, adicionamos
  else if (currentSetters.length < maxSetters) {
    const needed = maxSetters - currentSetters.length;
    
    for (let i = 0; i < needed; i++) {
        // Busca um levantador no pool de espera
        const setterIndex = remainingPlayers.findIndex(p => p.isOfficialSetter);
        if (setterIndex !== -1) {
            const setter = remainingPlayers.splice(setterIndex, 1)[0];
            
            // Remove um não-levantador do topPlayers
            const nonSetterIndex = topPlayers.slice().reverse().findIndex(p => !p.isOfficialSetter);
            if (nonSetterIndex !== -1) {
                const actualIndex = topPlayers.length - 1 - nonSetterIndex;
                const replaced = topPlayers.splice(actualIndex, 1)[0];
                topPlayers.push(setter);
                remainingPlayers.push(replaced);
            }
        }
    }
  }

  // 3. Re-ordena ambos os pools para manter a prioridade calculada
  topPlayers = topPlayers.sort(sortByPriority);
  remainingPlayers = remainingPlayers.sort(sortByPriority);

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
  // const shuffledPool = [...matchPool].sort(() => Math.random() - 0.5);
  const shuffledPool = [...matchPool];

  const poolSetters = shuffledPool.filter(p => p.isOfficialSetter);
  const poolNonSettersStrict = shuffledPool.filter(p => !p.isOfficialSetter).sort((a, b) => getElo(b) - getElo(a));

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  
  // 1. Determina os levantadores (setterA e setterB) antes de tudo
  if (poolSetters.length >= 2) {
    // Sorteia aleatoriamente os levantadores para A e B
    const sIndices = [0, 1].sort(() => Math.random() - 0.5);
    setterA = poolSetters[sIndices[0]];
    setterB = poolSetters[sIndices[1]];
  } else if (poolSetters.length === 1) {
    setterA = poolSetters[0];
    if (poolNonSettersStrict.length > 0) {
      setterB = poolNonSettersStrict[0];
    }
  } else {
    if (poolNonSettersStrict.length >= 2) {
      setterA = poolNonSettersStrict[0];
      setterB = poolNonSettersStrict[1];
    }
  }

  const setterIds = new Set([setterA?.id, setterB?.id].filter(Boolean));
  // Os outros 10 jogadores que não são levantadores designados da partida
  const matchNonSetters = shuffledPool.filter(p => !setterIds.has(p.id));
  
  // Identificamos as jogadoras mais fracas pela SOMA TÉCNICA (Analise prática: Saque, Ataque, etc)
  // e não por ELO ou Eficiência, utilizando estritamente os 10 não-levantadores.
  const techSorted = [...matchNonSetters].sort((a, b) => calculatePracticalSkillsSum(a) - calculatePracticalSkillsSum(b));
  const bottomTwoIds = new Set(techSorted.slice(0, 2).map(p => p.id));
  const topTwoIds = new Set(techSorted.slice(-2).map(p => p.id));
  const bottomTechIds = new Set([...techSorted.slice(0, 4).map(p => p.id), ...techSorted.slice(-2).map(p => p.id)]);

  const poolNonSetters = matchNonSetters.map((p) => {
    // Se for uma das tecnicamente mais fracas/fortes (pela soma saque/ataque/etc), protege do ruído aleatório
    if (bottomTechIds.has(p.id)) return { p, sortElo: getElo(p) };
    return { p, sortElo: getRandomizedElo(p) };
  })
  .sort((a, b) => b.sortElo - a.sortElo)
  .map(item => item.p);

  let playersA: Player[] = [];
  let playersB: Player[] = [];

  const requiredA = setterA ? 5 : 6;
  const requiredB = setterB ? 5 : 6;

  // Rule: Mandatory separation of the 2 players with lowest practical skills (Bottom 2) among non-setters
  const bottomTwoArray = techSorted.slice(0, 2);
  if (bottomTwoArray.length === 2) {
    const b2_1 = bottomTwoArray[0];
    const b2_2 = bottomTwoArray[1];
    
    // Separate the two bottom players
    playersA.push(b2_1);
    playersB.push(b2_2);
  }

  const preAssignedIds = new Set([...playersA, ...playersB].map(p => p.id));
  const men = poolNonSetters.filter(p => p.gender === Gender.MALE && !preAssignedIds.has(p.id));
  const women = poolNonSetters.filter(p => p.gender === Gender.FEMALE && !preAssignedIds.has(p.id));

  // Randomize initial team choice for the greedy distribution
  const firstTeam = Math.random() > 0.5 ? 'A' : 'B';

  // Target team index (Alternating distribution: A, B, A, B, A, B...)
  const getTargetTeam = (globalIdx: number, startWithA: boolean) => {
    const isTeamA = globalIdx % 2 === 0;
    if (startWithA) return isTeamA ? 'A' : 'B';
    return isTeamA ? 'B' : 'A';
  };

  let globalIdx = 0;

  // Calculate current gender counts to help balance initial distribution
  const getGenderCount = (gender: Gender, setter: Player | null, players: Player[]) => {
    return players.filter(p => p.gender === gender).length;
  };

  // Distribute men first, explicitly balancing counts
  men.forEach((man) => {
    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;
    const countMenA = getGenderCount(Gender.MALE, setterA, playersA);
    const countMenB = getGenderCount(Gender.MALE, setterB, playersB);

    if (countMenA < countMenB && canAddToA) {
      playersA.push(man);
    } else if (countMenB < countMenA && canAddToB) {
      playersB.push(man);
    } else {
      const targetTeam = getTargetTeam(globalIdx, firstTeam === 'A');
      if (targetTeam === 'A') {
        if (canAddToA) playersA.push(man);
        else if (canAddToB) playersB.push(man);
      } else {
        if (canAddToB) playersB.push(man);
        else if (canAddToA) playersA.push(man);
      }
    }
    globalIdx++;
  });

  // Distribute women next, explicitly balancing counts
  women.forEach((woman) => {
    const canAddToA = playersA.length < requiredA;
    const canAddToB = playersB.length < requiredB;
    const countWomenA = getGenderCount(Gender.FEMALE, setterA, playersA);
    const countWomenB = getGenderCount(Gender.FEMALE, setterB, playersB);

    if (countWomenA < countWomenB && canAddToA) {
      playersA.push(woman);
    } else if (countWomenB < countWomenA && canAddToB) {
      playersB.push(woman);
    } else {
      const targetTeam = getTargetTeam(globalIdx, firstTeam === 'A');
      if (targetTeam === 'A') {
        if (canAddToA) playersA.push(woman);
        else if (canAddToB) playersB.push(woman);
      } else {
        if (canAddToB) playersB.push(woman);
        else if (canAddToA) playersA.push(woman);
      }
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
            
            // Compare top 4 and bottom 4 as requested (excluding the setter from the top 4 / bottom 4 calculations)
            const sortedNonSetterElos = players.map(p => getElo(p)).sort((a,b) => b-a);
            const top4Elo = sortedNonSetterElos.slice(0, 4).reduce((a,b)=>a+b, 0);
            const bot4Elo = sortedNonSetterElos.slice(-4).reduce((a,b)=>a+b, 0);

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

          // Penalidade para as 2 jogadoras mais fracas e as 2 mais fortes ficarem juntas (Regra Extremados 4)
          const tempIdsA = new Set([setterA?.id, ...tempPlayersA.map(p => p.id)].filter(Boolean));
          const bottomTwoCountInTempA = Array.from(bottomTwoIds).filter(id => tempIdsA.has(id)).length;
          const topTwoCountInTempA = Array.from(topTwoIds).filter(id => tempIdsA.has(id)).length;
          // Se Count for 2 ou 0, significa que estão juntas (ou no A ou no B)
          const bottomTwoTogetherPenalty = (bottomTwoCountInTempA === 2 || bottomTwoCountInTempA === 0) ? 10000 : 0;
          const topTwoTogetherPenalty = (topTwoCountInTempA === 2 || topTwoCountInTempA === 0) ? 10000 : 0;

          // Combined score with symmetry weight, RECURRENCE PENALTY and EXTREMES 4 SPLIT
          const newScore = diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetryDiff * 0.5) + recurrencePenalty + bottomTwoTogetherPenalty + topTwoTogetherPenalty;
          
          const currentMetricsA = getTeamMetrics(setterA, playersA);
          const currentMetricsB = getTeamMetrics(setterB, playersB);
          
          let currentSymmetry = 0;
          const currentMaxLen = Math.min(currentMetricsA.sortedElos.length, currentMetricsB.sortedElos.length);
          for (let k = 0; k < currentMaxLen; k++) {
            currentSymmetry += Math.abs(currentMetricsA.sortedElos[k] - currentMetricsB.sortedElos[k]);
          }

          const currentRecurrence = calculateRecurrencePenalty(setterA, playersA, previousFormations || []) + 
                                  calculateRecurrencePenalty(setterB, playersB, previousFormations || []);

          const currentIdsA = new Set([setterA?.id, ...playersA.map(p => p.id)].filter(Boolean));
          const bottomTwoCountInCurrA = Array.from(bottomTwoIds).filter(id => currentIdsA.has(id)).length;
          const topTwoCountInCurrA = Array.from(topTwoIds).filter(id => currentIdsA.has(id)).length;
          const currentBottomTwoPenalty = (bottomTwoCountInCurrA === 2 || bottomTwoCountInCurrA === 0) ? 10000 : 0;
          const currentTopTwoPenalty = (topTwoCountInCurrA === 2 || topTwoCountInCurrA === 0) ? 10000 : 0;

          const currentScore = Math.abs(currentMetricsA.totalElo - currentMetricsB.totalElo) + 
                               Math.abs(currentMetricsA.top4Elo - currentMetricsB.top4Elo) * 0.8 +
                               Math.abs(currentMetricsA.bot4Elo - currentMetricsB.bot4Elo) * 1.5 +
                               Math.abs(currentMetricsA.totalSkills - currentMetricsB.totalSkills) * 20 +
                               (currentSymmetry * 0.5) + currentRecurrence + currentBottomTwoPenalty + currentTopTwoPenalty;

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
        
        // Compare top 4 and bottom 4 as requested (excluding the setter)
        const sortedNonSetterElos = pls.map(p => calculateEffectiveElo(p)).sort((a,b) => b-a);
        const top4Elo = sortedNonSetterElos.slice(0, 4).reduce((a,b)=>a+b, 0);
        const bot4Elo = sortedNonSetterElos.slice(-4).reduce((a,b)=>a+b, 0);
        
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
        const t2Count = Array.from(topTwoIds).filter(id => idsA.has(id)).length;
        const t2Penalty = (t2Count === 2 || t2Count === 0) ? 5000 : 0;
        return diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetry * 0.5) + rec + b2Penalty + t2Penalty;
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
  const checkBottomTwo = (s: Player | null, pls: Player[]) => {
    const ids = new Set([s?.id, ...pls.map(p => p.id)].filter(Boolean));
    return Array.from(bottomTwoIds).filter(id => ids.has(id)).length;
  };

  const checkTopTwo = (s: Player | null, pls: Player[]) => {
    const ids = new Set([s?.id, ...pls.map(p => p.id)].filter(Boolean));
    return Array.from(topTwoIds).filter(id => ids.has(id)).length;
  };

  let b2CountInA = checkBottomTwo(setterA, playersA);
  if (b2CountInA === 2 || b2CountInA === 0) {
    const isBothInA = b2CountInA === 2;
    const sPlayers = isBothInA ? playersA : playersB;
    const tPlayers = isBothInA ? playersB : playersA;

    // Tenta mover qualquer um dos Bottom 2 que esteja na lista de jogadores
    const pMov = sPlayers.find(p => bottomTwoIds.has(p.id));
    if (pMov) {
      // Prioridade MÁXIMA: manter gênero para NÃO quebrar a distribuição (ex: 3x1 homens)
      const pTar = tPlayers.find(p => p.gender === pMov.gender && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id));
      
      if (pTar) {
        const idxS = sPlayers.indexOf(pMov);
        const idxT = tPlayers.indexOf(pTar);
        sPlayers[idxS] = pTar;
        tPlayers[idxT] = pMov;
        swaps.push({ playerA: `AUTO-FIX: ${pMov.name}`, playerB: pTar.name });
      } else {
         // Se não for possível trocar por mesmo gênero (raro), infelizmente quebra-se o gênero
         // mas pelo menos a regra bottom 2 será observada
         const pTarFallback = tPlayers.find(p => !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id));
         if (pTarFallback) {
           const idxS = sPlayers.indexOf(pMov);
           const idxT = tPlayers.indexOf(pTarFallback);
           sPlayers[idxS] = pTarFallback;
           tPlayers[idxT] = pMov;
           swaps.push({ playerA: `AUTO-FIX (MIX): ${pMov.name}`, playerB: pTarFallback.name });
         }
      }
    }
  }

  // Auto-correção para as 2 jogadoras mais fortes (Top 2)
  let t2CountInA = checkTopTwo(setterA, playersA);
  if (t2CountInA === 2 || t2CountInA === 0) {
    const isBothInA = t2CountInA === 2;
    const sPlayers = isBothInA ? playersA : playersB;
    const tPlayers = isBothInA ? playersB : playersA;

    const pMov = sPlayers.find(p => topTwoIds.has(p.id));
    if (pMov) {
      const pTar = tPlayers.find(p => p.gender === pMov.gender && !topTwoIds.has(p.id) && !bottomTwoIds.has(p.id));
      
      if (pTar) {
        const idxS = sPlayers.indexOf(pMov);
        const idxT = tPlayers.indexOf(pTar);
        sPlayers[idxS] = pTar;
        tPlayers[idxT] = pMov;
        swaps.push({ playerA: `AUTO-FIX TOP-2: ${pMov.name}`, playerB: pTar.name });
      } else {
         const pTarFallback = tPlayers.find(p => !topTwoIds.has(p.id) && !bottomTwoIds.has(p.id));
         if (pTarFallback) {
           const idxS = sPlayers.indexOf(pMov);
           const idxT = tPlayers.indexOf(pTarFallback);
           sPlayers[idxS] = pTarFallback;
           tPlayers[idxT] = pMov;
           swaps.push({ playerA: `AUTO-FIX TOP-2 (MIX): ${pMov.name}`, playerB: pTarFallback.name });
         }
      }
    }
  }

  // --- AGENTE DE GÊNERO (AUTO-FIX) ---
  // Verifica se há discrepância na quantidade de homens/mulheres entre A e B (desconsiderando os levantadores)
  let totalMenA = playersA.filter(p => p.gender === Gender.MALE).length;
  let totalMenB = playersB.filter(p => p.gender === Gender.MALE).length;

  // O ideal é que Math.abs(totalMenA - totalMenB) <= 1
  while (Math.abs(totalMenA - totalMenB) > 1) {
    const isAMoreMen = totalMenA > totalMenB;
    const sPlayersWithMoreMen = isAMoreMen ? playersA : playersB;
    const sPlayersWithLessMen = isAMoreMen ? playersB : playersA;

    // Acha um homem do time com mais homens (que não seja um bottom 2 / top 2 protegido se possível)
    let manToMove = sPlayersWithMoreMen.find(p => p.gender === Gender.MALE && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id));
    if (!manToMove) manToMove = sPlayersWithMoreMen.find(p => p.gender === Gender.MALE && !bottomTwoIds.has(p.id));
    if (!manToMove) manToMove = sPlayersWithMoreMen.find(p => p.gender === Gender.MALE);

    // Acha uma mulher do time com menos homens (que não seja bottom 2 / top 2 se possível)
    let womanToMove = sPlayersWithLessMen.find(p => p.gender === Gender.FEMALE && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id));
    if (!womanToMove) womanToMove = sPlayersWithLessMen.find(p => p.gender === Gender.FEMALE && !bottomTwoIds.has(p.id));
    if (!womanToMove) womanToMove = sPlayersWithLessMen.find(p => p.gender === Gender.FEMALE);

    if (manToMove && womanToMove) {
      const idxS = sPlayersWithMoreMen.indexOf(manToMove);
      const idxT = sPlayersWithLessMen.indexOf(womanToMove);
      sPlayersWithMoreMen[idxS] = womanToMove;
      sPlayersWithLessMen[idxT] = manToMove;
      swaps.push({ playerA: `GENDER-FIX: ${manToMove.name}`, playerB: womanToMove.name });

      // Atualiza os contadores
      totalMenA = playersA.filter(p => p.gender === Gender.MALE).length;
      totalMenB = playersB.filter(p => p.gender === Gender.MALE).length;
    } else {
      break; // Proteção contra loop infinito se não houver pares para trocar
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
    remainingPlayers,
    bottomTwoIds: Array.from(bottomTwoIds),
    topTwoIds: Array.from(topTwoIds)
  };

  // Check similarity and apply forced swaps if needed
  if (previousFormations && checkSimilarity(result, previousFormations)) {
    const forcedResult = applyForcedSwaps(result, bottomTwoIds);
    return validateAndForceBalancedSizes(forcedResult, matchPool);
  }

  return validateAndForceBalancedSizes(result, matchPool);
}

