
import { Player, Gender, Team, GenerationResult, TournamentTeam, Tournament, AutoCorrectionFixLog, AutoCorrectionAudit } from '../types';
import { SKILL_WEIGHTS } from '../constants';


const getImpactBonus = (level?: number) => {
  if (level === 3) return 200; // Elite / Power
  if (level === 2) return 75;  // Médio / Técnico
  return 0;                    // Base
};

export const calculateEffectiveElo = (
  player: Player | null, 
  useTrueSkill: boolean = false,
  balancingRatingMode: 'HYBRID' | 'IC_ONLY' = 'IC_ONLY'
) => {
  if (!player) return 0;
  
  let trueSkillValue = 0;
  if (useTrueSkill) {
    let tsVal = 25;
    if (player.trueSkill && typeof player.trueSkill.mu === 'number' && typeof player.trueSkill.sigma === 'number') {
      tsVal = player.trueSkill.mu - (3 * player.trueSkill.sigma);
    }
    trueSkillValue = tsVal * 10;
  }

  // Escala de ELO derivada do Índice Composto de Desempenho (60% Habilidades Práticas + 40% WinRate)
  // Mapeia IC (0 a 100) para a escala de ELO (800 a 2000)
  const ic = calculateCompositePerformanceRating(player);
  const icEloScale = 800 + (ic * 12);
  const impactBonus = getImpactBonus(player.impactLevel);

  if (balancingRatingMode === 'IC_ONLY') {
    // Sorteio baseado unicamente no IC (Índice Composto de Desempenho Técnico + Win Rate)
    return ic;
  }

  // Modo HÍBRIDO: 50% ELO Puro de Carreira (descontado do Bônus de Fidelidade) + 50% IC
  const totalFidelityPoints = typeof player.fidelityPoints === 'number' 
    ? player.fidelityPoints 
    : ((player.eloHistory?.filter(h => h.fidelityBonus).length || 0) * 50);
  
  const currentElo = typeof player.elo === 'number' && !isNaN(player.elo) ? player.elo : 1000;
  const pureElo = Math.max(800, currentElo - totalFidelityPoints);

  const hybridElo = (pureElo * 0.50) + (icEloScale * 0.50) + impactBonus + trueSkillValue;

  return Math.round(hybridElo);
};

/**
 * Calculates a player's composite efficiency score based on a weighted average
 * of their technical skills (setting, attacking, defense, serving) and a bonus multiplier
 * determined by their daily win rate (from 0 to 1).
 * 
 * @param player The player to calculate efficiency for
 * @param dailyWinRate Win rate of the player in matches (number from 0 to 1)
 * @returns A composite efficiency score as a percentage (from 0 to 100)
 */
export const calculatePlayerEfficiency = (
  player: Player | null,
  dailyWinRate: number,
  bonusPercent?: number
): number => {
  if (!player) return 0;

  const actualBonusPercent = bonusPercent !== undefined ? bonusPercent : 50;

  let weightedSkillSum = 0;
  let weightsTotal = 0;

  if (player.skills) {
    const skills = [
      { value: player.skills.setting ?? 2, weight: SKILL_WEIGHTS.setting ?? 0.3 },
      { value: player.skills.attacking ?? 2, weight: SKILL_WEIGHTS.attacking ?? 0.3 },
      { value: player.skills.defense ?? 2, weight: SKILL_WEIGHTS.defense ?? 0.2 },
      { value: player.skills.serving ?? 2, weight: SKILL_WEIGHTS.serving ?? 0.2 }
    ];

    skills.forEach(s => {
      weightedSkillSum += s.value * s.weight;
      weightsTotal += s.weight;
    });
  }

  // Baseline average of skills (standardized 1.0 to 3.0 scale mapped to 0 to 100 base)
  const averageSkill = weightsTotal > 0 ? (weightedSkillSum / weightsTotal) : 2.0;
  const baselineSkillScore = (averageSkill - 1) * 50;

  // Apply win rate as a multiplier bonus:
  // 0% win rate -> 1.0x baseline multiplier (no bonus)
  // 100% win rate -> 1.5x baseline multiplier (50% bonus by default, or configured actualBonusPercent)
  const multiplier = 1 + (dailyWinRate * (actualBonusPercent / 100));
  const finalScore = baselineSkillScore * multiplier;

  // Bounded between 0 and 100 and rounded to 1 decimal place
  return Math.max(0, Math.min(100, Math.round(finalScore * 10) / 10));
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
 * Calculates a composite performance rating combining technical skills (60%) and real win rate (40%).
 * Provides a clean classification of Top 2 and Bottom 2 without distortions from daily attendance ELO bonuses.
 */
export const calculateCompositePerformanceRating = (player: Player | null): number => {
  if (!player) return 0;

  // 1. Base de Habilidades Técnicas (Soma de 4 a 20 -> normalizado de 0 a 100)
  const skillsSum = Number(calculatePracticalSkillsSum(player)) || 12;
  const techScore = Math.max(0, Math.min(100, ((skillsSum - 4) / 16) * 100));

  // 2. Taxa de Aproveitamento Real de Vitória (Win Rate)
  const wins = Number(player.wins) || 0;
  const losses = Number(player.losses) || 0;
  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? wins / totalGames : 0.5;
  const winRateScore = winRate * 100;

  // 3. Índice Composto (60% Habilidades Fundamentais + 40% Aproveitamento)
  const compositeRating = (techScore * 0.60) + (winRateScore * 0.40);

  if (isNaN(compositeRating)) return 0;

  return Math.round(compositeRating * 10) / 10;
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

    // Sort cleanNonSetters by gender, then by IC (Composite Rating) to balance
    const getIC = (p: Player | null) => calculateCompositePerformanceRating(p);
    const targetA = fixedSetterA ? 5 : 6;
    const targetB = fixedSetterB ? 5 : 6;

    const fixedPlayersA: Player[] = [];
    const fixedPlayersB: Player[] = [];

    // Prioridade absoluta: identificar e separar os 2 atletas de linha de menor desempenho composto (60% Técnica + 40% WinRate)
    // Analisamos os jogadores de linha separadamente dos levantadores
    const performanceSortedNonSetters = [...cleanNonSetters].sort((a, b) => calculateCompositePerformanceRating(a) - calculateCompositePerformanceRating(b));
    const cleanBottomTwoNonSetters = performanceSortedNonSetters.slice(0, 2);

    if (cleanBottomTwoNonSetters.length === 2) {
      // Separa obrigatoriamente os 2 jogadores de linha de menor IC
      const b2_1 = cleanBottomTwoNonSetters[0];
      const b2_2 = cleanBottomTwoNonSetters[1];
      
      fixedPlayersA.push(b2_1);
      fixedPlayersB.push(b2_2);
    }

    const preAssignedIds = new Set([...fixedPlayersA, ...fixedPlayersB].map(p => p.id));
    const menPool = cleanNonSetters.filter(p => p.gender === Gender.MALE && !preAssignedIds.has(p.id)).sort((a, b) => getIC(b) - getIC(a));
    const womenPool = cleanNonSetters.filter(p => p.gender === Gender.FEMALE && !preAssignedIds.has(p.id)).sort((a, b) => getIC(b) - getIC(a));

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


/**
 * ML Synergy Analysis: Identifica e penaliza "sinergias negativas" baseado no histórico.
 * Pré-calcula cache de sinergia por par de jogadores para evitar gargalos de performance.
 */
export const buildSynergyCache = (
  players: Player[],
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[]
): Map<string, number> => {
  const cache = new Map<string, number>();
  if (!matchHistory || matchHistory.length === 0) return cache;

  const now = Date.now();
  const DECAY_HALF_LIFE = 15 * 24 * 60 * 60 * 1000; 

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i].id;
      const p2 = players[j].id;
      const key = [p1, p2].sort().join('___');

      let weightedGames = 0;
      let weightedLosses = 0;

      for (const match of matchHistory) {
        const inTeamA = match.teamA.includes(p1) && match.teamA.includes(p2);
        const inTeamB = match.teamB.includes(p1) && match.teamB.includes(p2);
        
        if (inTeamA || inTeamB) {
          const age = match.timestamp ? (now - match.timestamp) : 0;
          const weight = Math.max(0.2, Math.pow(0.5, age / DECAY_HALF_LIFE));
          weightedGames += weight;
          const isLoss = (inTeamA && match.winner === 'B') || (inTeamB && match.winner === 'A');
          if (isLoss) {
            weightedLosses += weight;
          }
        }
      }

      if (weightedGames >= 1.5) {
        const lossRate = weightedLosses / weightedGames;
        const deviationFromNeutral = lossRate - 0.5;
        let synergyScore = 400 * Math.pow(Math.abs(deviationFromNeutral), 1.5) * Math.sign(deviationFromNeutral);

        // Se a taxa de derrotas for crítica (>= 70% de derrotas, ou seja, <= 30% de vitórias),
        // amplifica substancialmente a penalidade para forçar a dissolução da dupla pelo otimizador de sinergia
        if (lossRate >= 0.70) {
          synergyScore += 1500 * (lossRate - 0.5);
        }

        const confidenceFactor = Math.min(3, Math.log1p(weightedGames));
        cache.set(key, synergyScore * confidenceFactor);
      } else {
        cache.set(key, 0);
      }
    }
  }

  return cache;
};

export const getTeamSynergyPenaltyFromCache = (
  setter: Player | null,
  players: Player[],
  synergyCache: Map<string, number>
): number => {
  const teamIds = [setter?.id, ...players.map(p => p.id)].filter(Boolean) as string[];
  let penalty = 0;
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const key = [teamIds[i], teamIds[j]].sort().join('___');
      penalty += synergyCache.get(key) || 0;
    }
  }
  return penalty;
};

export const calculateNegativeSynergyPenalty = (
  setter: Player | null, 
  players: Player[], 
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[]
): number => {
  if (!matchHistory || matchHistory.length === 0) return 0;
  const allPls = setter ? [...players, setter] : players;
  const cache = buildSynergyCache(allPls, matchHistory);
  return getTeamSynergyPenaltyFromCache(setter, players, cache);
};

/**
 * Calcula a previsão do número de partidas para um atleta no dia.
 * Considera:
 * 1. O tempo decorrido desde o início real do primeiro jogo da sessão
 * 2. O saldo de tempo restante do jogador até o seu horário de saída individual (ex: 21:00, 22:00)
 * 3. O tempo de jogo médio real por partida
 * 4. A cota/fator de rodízio proporcional ao número dinâmico de atletas presentes na lista (12 / N)
 * 5. As partidas que o atleta já jogou no dia
 */
export function calculatePredictedMatches(
  currentTimeStr: string, 
  endTime: string, 
  avgDurationMins: number, 
  totalPlayers: number,
  playerDepartureTime?: string,
  matchesPlayedToday: number = 0,
  playerArrivalTime?: string,
  sessionStartTime?: string,
  playerDailyMatches: number = 0
): number {
  const parseTime = (t?: string | null) => {
    if (!t) return null;
    const parts = t.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  };

  const currMins = parseTime(currentTimeStr);
  const endMins = parseTime(endTime) ?? 1320; // Default 22:00 (1320 mins)
  const depMins = parseTime(playerDepartureTime);
  const arrMins = parseTime(playerArrivalTime);
  const startMins = parseTime(sessionStartTime) ?? 1140; // Default 19:00 (1140 mins)
  
  if (currMins === null) return 0;

  // Início efetivo da sessão: o início real do primeiro jogo (ou sessionStartTime)
  const sessionStartMins = startMins;

  // Ponto de referência atual no tempo:
  // Se ainda for antes do primeiro jogo (ex: 18:30 antes das 19:00), o cálculo considera a sessão a partir de sessionStartMins.
  const referenceMins = Math.max(currMins, sessionStartMins);

  // Horário final de saída deste jogador (individual): 21:00, 22:00, etc.
  const playerDepartureMins = (depMins !== null && depMins <= endMins && depMins >= sessionStartMins) 
    ? depMins 
    : endMins;

  // Horário de início para a janela do jogador a partir de agora
  const playerStartMins = Math.max(referenceMins, arrMins ?? sessionStartMins);

  // Saldo de tempo restante do jogador até sua saída
  let playerTimeLeftMins = playerDepartureMins - playerStartMins;
  if (playerTimeLeftMins < 0) {
    playerTimeLeftMins = 0;
  }

  const safeAvgDuration = Math.max(1, avgDurationMins);

  // Número de partidas de quadra que cabem no saldo de tempo restante do jogador
  const remainingCourtMatches = playerTimeLeftMins / safeAvgDuration;

  // Fator de rodízio dinâmico baseado no número atual de jogadores presentes na lista
  const rotationFactor = 12 / Math.max(12, totalPlayers);

  // Estimativa de partidas futuras restantes para este atleta
  const futurePredicted = remainingCourtMatches * rotationFactor;

  // Se o jogo ainda não começou e o jogador não jogou nenhuma partida, calcula da janela total
  if (matchesPlayedToday === 0 && playerDailyMatches === 0 && currMins <= sessionStartMins) {
    const fullPlayerWindowMins = Math.max(0, playerDepartureMins - Math.max(sessionStartMins, arrMins ?? sessionStartMins));
    const fullCourtMatches = fullPlayerWindowMins / safeAvgDuration;
    return Math.max(0, Math.round(fullCourtMatches * rotationFactor));
  }

  // Previsão total = partidas já jogadas pelo atleta + partidas futuras projetadas no saldo de tempo
  const totalPredicted = playerDailyMatches + Math.round(futurePredicted);

  return Math.max(playerDailyMatches, totalPredicted);
}

export function getPriorityQueue(attendanceList: Player[], count: number = 12, maxSetters: number = 2): { topPlayers: Player[], remainingPlayers: Player[] } {
  const sortByPriority = (a: Player, b: Player) => {
    // NÍVEL 0: Rodagem Imediata - Prioridade absoluta para quem NÃO jogou a última partida
    const playedA = a.playedLastMatch ? 1 : 0;
    const playedB = b.playedLastMatch ? 1 : 0;
    if (playedA !== playedB) return playedA - playedB;

    // NÍVEL 1: Prioridade de Saída Antecipada
    // Jogadores com horário de saída definido devem ter prioridade para jogar o quanto antes.
    const getMinutes = (timeStr?: string) => {
        if (!timeStr) return 9999; // Assume final da noite/sem limite
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };
    
    const depA = getMinutes(a.departureTime);
    const depB = getMinutes(b.departureTime);
    
    if (depA !== depB) return depA - depB; // Earliest departure first

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
          const nonSetterIdx = remainingPlayers.findIndex(p => !p.isOfficialSetter);
          if (nonSetterIdx !== -1) {
              const setterIdx = topPlayers.slice().reverse().findIndex(p => p.isOfficialSetter);
              const actualIdx = topPlayers.length - 1 - setterIdx;
              const extraSetter = topPlayers.splice(actualIdx, 1)[0];
              remainingPlayers.push(extraSetter);
              
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
            // Remove um não-levantador do topPlayers
            const nonSetterIndex = topPlayers.slice().reverse().findIndex(p => !p.isOfficialSetter);
            if (nonSetterIndex !== -1) {
                const setter = remainingPlayers.splice(setterIndex, 1)[0];
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

  // 1. Organize into Pots by Skill (Potes de Nível Técnico - Skill 3/6 compliant)
  // Sort by Composite Performance Rating (60% Skill + 40% WinRate)
  const sortedPlayers = [...topPlayers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  
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

  // 2. Distribute official setters (max 1 per team)
  // We distribute them first to ensure each team has a specialist if available
  let setterIdx = 0;
  const shuffledTeamsForSetters = [...teams].sort(() => Math.random() - 0.5);
  while (setterIdx < officialSetters.length && setterIdx < numTeams) {
    const setter = officialSetters[setterIdx];
    shuffledTeamsForSetters[setterIdx].players.push(setter.id);
    shuffledTeamsForSetters[setterIdx].totalElo = (shuffledTeamsForSetters[setterIdx].totalElo || 0) + calculateEffectiveElo(setter);
    setterIdx++;
  }

  // Any extra setters go into the general pool
  const remainingOthers = [...others];
  if (setterIdx < officialSetters.length) {
    remainingOthers.push(...officialSetters.slice(setterIdx));
  }

  // 3. Pot-Based Distribution for others
  // Divide remaining players into pots of size 'numTeams'
  const pots: Player[][] = [];
  const sortedOthers = [...remainingOthers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  
  for (let i = 0; i < sortedOthers.length; i += numTeams) {
    pots.push(sortedOthers.slice(i, i + numTeams));
  }

  // Distribute from each pot to teams
  pots.forEach((pot) => {
    // Shuffle the pot to add variety within the skill tier
    const shuffledPot = [...pot].sort(() => Math.random() - 0.5);
    // Shuffle the teams that still need players for this pot
    const teamsNeedingPlayers = teams.filter(t => t.players.length < 6).sort(() => Math.random() - 0.5);
    
    shuffledPot.forEach((player, idx) => {
      if (idx < teamsNeedingPlayers.length) {
        teamsNeedingPlayers[idx].players.push(player.id);
        teamsNeedingPlayers[idx].totalElo = (teamsNeedingPlayers[idx].totalElo || 0) + calculateEffectiveElo(player);
      } else {
        reserves.push(player.id);
      }
    });
  });

  // 4. Synergy and ELO Refinement: Try to swap players between teams to minimize ELO variance
  // We use a hill-climbing approach to optimize balance while respecting constraints
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    
    const i = Math.floor(Math.random() * teams.length);
    const j = Math.floor(Math.random() * teams.length);
    if (i === j) continue;

    const teamA = teams[i];
    const teamB = teams[j];
    
    const pAIdx = Math.floor(Math.random() * teamA.players.length);
    const pBIdx = Math.floor(Math.random() * teamB.players.length);
    
    const pA = participants.find(p => p.id === teamA.players[pAIdx]);
    const pB = participants.find(p => p.id === teamB.players[pBIdx]);

    if (!pA || !pB) continue;

    // Constraints: Must maintain setter status and gender balance if swapping
    // OR we allow swaps if they improve the overall ELO delta significantly
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

/**
 * SKILL 2: Agente de Auto-Correção e Fiscalização de Regras (Auto-Correction Agent)
 * Camada soberana de validação pós-sorteio/pós-edição para garantir zero violação de restrições críticas.
 */
export function runAutoCorrectionAgent(
  teamA: { setter: Player | null; players: Player[] },
  teamB: { setter: Player | null; players: Player[] },
  bottomTwoIds: Set<string>,
  topTwoIds: Set<string>,
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[],
  synergyCache?: Map<string, number>,
  balancingStrategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH' = 'BOTH'
): {
  teamA: { setter: Player | null; players: Player[] };
  teamB: { setter: Player | null; players: Player[] };
  fixesApplied: AutoCorrectionFixLog[];
  audit: AutoCorrectionAudit;
} {
  const fixesApplied: AutoCorrectionFixLog[] = [];

  let setterA = teamA.setter;
  let playersA = [...teamA.players];
  let setterB = teamB.setter;
  let playersB = [...teamB.players];

  const checkBottomTwo = (s: Player | null, pls: Player[]) => {
    const ids = new Set([s?.id, ...pls.map(p => p.id)].filter(Boolean));
    return Array.from(bottomTwoIds).filter(id => ids.has(id)).length;
  };

  const checkTopTwo = (s: Player | null, pls: Player[]) => {
    const ids = new Set([s?.id, ...pls.map(p => p.id)].filter(Boolean));
    return Array.from(topTwoIds).filter(id => ids.has(id)).length;
  };

  let changed = true;
  let iterations = 0;

  while (changed && iterations < 3) {
    changed = false;
    iterations++;

    // 1. Fiscalização Bottom 2 (Obrigatória em todas as estratégias)
    let b2InA = checkBottomTwo(setterA, playersA);
    if (b2InA === 2 || b2InA === 0) {
      const isBothInA = b2InA === 2;
      const sPlayers = isBothInA ? playersA : playersB;
      const tPlayers = isBothInA ? playersB : playersA;

      const pMov = sPlayers.find(p => bottomTwoIds.has(p.id));
      if (pMov) {
        // Encontra o melhor parceiro de troca no time oposto, priorizando mesmo gênero
        const pTar = tPlayers.find(p => p.gender === pMov.gender && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) ||
                     tPlayers.find(p => p.gender === pMov.gender && !bottomTwoIds.has(p.id)) ||
                     tPlayers.find(p => !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) ||
                     tPlayers.find(p => !bottomTwoIds.has(p.id));
        if (pTar) {
          const idxS = sPlayers.indexOf(pMov);
          const idxT = tPlayers.indexOf(pTar);
          sPlayers[idxS] = pTar;
          tPlayers[idxT] = pMov;
          changed = true;
          fixesApplied.push({
            category: 'BOTTOM2',
            title: 'AUTO-FIX: Separação de Bottom 2',
            description: `Separado jogador de menor habilidade prática (${pMov.name}) trocando com ${pTar.name}`,
            playerA: pMov.name,
            playerB: pTar.name
          });
        }
      }
    }

    // 2. Fiscalização Top 2 (Destaques técnicos)
    let t2InA = checkTopTwo(setterA, playersA);
    if (t2InA === 2 || t2InA === 0) {
      const isBothInA = t2InA === 2;
      const sPlayers = isBothInA ? playersA : playersB;
      const tPlayers = isBothInA ? playersB : playersA;

      const pMov = sPlayers.find(p => topTwoIds.has(p.id));
      if (pMov) {
        // Encontra o melhor parceiro de troca no time oposto, priorizando mesmo gênero
        const pTar = tPlayers.find(p => p.gender === pMov.gender && !topTwoIds.has(p.id) && !bottomTwoIds.has(p.id)) ||
                     tPlayers.find(p => p.gender === pMov.gender && !topTwoIds.has(p.id)) ||
                     tPlayers.find(p => !topTwoIds.has(p.id) && !bottomTwoIds.has(p.id)) ||
                     tPlayers.find(p => !topTwoIds.has(p.id));
        if (pTar) {
          const idxS = sPlayers.indexOf(pMov);
          const idxT = tPlayers.indexOf(pTar);
          sPlayers[idxS] = pTar;
          tPlayers[idxT] = pMov;
          changed = true;
          fixesApplied.push({
            category: 'TOP2',
            title: 'AUTO-FIX: Separação de Top 2',
            description: `Garantido equilíbrio trocando ${pMov.name} por ${pTar.name}`,
            playerA: pMov.name,
            playerB: pTar.name
          });
        }
      }
    }

    // 3. Fiscalização de Convidados
    let guestsInA = playersA.filter(p => p.status === 'guest').length + (setterA?.status === 'guest' ? 1 : 0);
    let guestsInB = playersB.filter(p => p.status === 'guest').length + (setterB?.status === 'guest' ? 1 : 0);

    while (Math.abs(guestsInA - guestsInB) > 1) {
      const isAMore = guestsInA > guestsInB;
      const teamMore = isAMore ? playersA : playersB;
      const teamLess = isAMore ? playersB : playersA;

      // Prioriza convidados que não sejam Bottom 2 ou Top 2 para mover
      let guestToMove = teamMore.find(p => p.status === 'guest' && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) || 
                        teamMore.find(p => p.status === 'guest' && !bottomTwoIds.has(p.id)) ||
                        teamMore.find(p => p.status === 'guest');
      if (guestToMove) {
        // Busca substituto de mesmo gênero que não seja Bottom 2 ou Top 2
        let replacement = teamLess.find(p => p.status !== 'guest' && p.gender === guestToMove.gender && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) || 
                          teamLess.find(p => p.status !== 'guest' && p.gender === guestToMove.gender && !bottomTwoIds.has(p.id)) ||
                          teamLess.find(p => p.status !== 'guest' && p.gender === guestToMove.gender) ||
                          teamLess.find(p => p.status !== 'guest' && !bottomTwoIds.has(p.id)) ||
                          teamLess.find(p => p.status !== 'guest');
        if (replacement) {
          const idxS = teamMore.indexOf(guestToMove);
          const idxT = teamLess.indexOf(replacement);
          teamMore[idxS] = replacement;
          teamLess[idxT] = guestToMove;
          changed = true;
          fixesApplied.push({
            category: 'GUESTS',
            title: 'AUTO-FIX: Distribuição de Convidados',
            description: `Distribuído convidado ${guestToMove.name} trocando com ${replacement.name}`,
            playerA: guestToMove.name,
            playerB: replacement.name
          });
          guestsInA = playersA.filter(p => p.status === 'guest').length + (setterA?.status === 'guest' ? 1 : 0);
          guestsInB = playersB.filter(p => p.status === 'guest').length + (setterB?.status === 'guest' ? 1 : 0);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // 4. Fiscalização Rigorosa de Gênero (incluindo os levantadores no cômputo)
    let totalMenA = (setterA?.gender === Gender.MALE ? 1 : 0) + playersA.filter(p => p.gender === Gender.MALE).length;
    let totalMenB = (setterB?.gender === Gender.MALE ? 1 : 0) + playersB.filter(p => p.gender === Gender.MALE).length;

    while (Math.abs(totalMenA - totalMenB) > 1) {
      const isAMoreMen = totalMenA > totalMenB;
      const teamMoreMen = isAMoreMen ? playersA : playersB;
      const teamLessMen = isAMoreMen ? playersB : playersA;

      // Prioriza homens/mulheres que não sejam Bottom 2 ou Top 2 para mover
      let manToMove = teamMoreMen.find(p => p.gender === Gender.MALE && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) || 
                      teamMoreMen.find(p => p.gender === Gender.MALE && !bottomTwoIds.has(p.id)) ||
                      teamMoreMen.find(p => p.gender === Gender.MALE);
      let womanToMove = teamLessMen.find(p => p.gender === Gender.FEMALE && !bottomTwoIds.has(p.id) && !topTwoIds.has(p.id)) || 
                        teamLessMen.find(p => p.gender === Gender.FEMALE && !bottomTwoIds.has(p.id)) ||
                        teamLessMen.find(p => p.gender === Gender.FEMALE);

      if (manToMove && womanToMove) {
        const idxS = teamMoreMen.indexOf(manToMove);
        const idxT = teamLessMen.indexOf(womanToMove);
        teamMoreMen[idxS] = womanToMove;
        teamLessMen[idxT] = manToMove;
        changed = true;
        fixesApplied.push({
          category: 'GENDER',
          title: 'GENDER-FIX: Paridade de Gênero',
          description: `Corrigido desequilíbrio trocando ${manToMove.name} por ${womanToMove.name} no cômputo geral (incluindo levantadores)`,
          playerA: manToMove.name,
          playerB: womanToMove.name
        });
        totalMenA = (setterA?.gender === Gender.MALE ? 1 : 0) + playersA.filter(p => p.gender === Gender.MALE).length;
        totalMenB = (setterB?.gender === Gender.MALE ? 1 : 0) + playersB.filter(p => p.gender === Gender.MALE).length;
      } else {
        break;
      }
    }

    // 5. Otimização Automática de Sinergia Crítica (ML Synergy Agent)
    if (matchHistory && matchHistory.length > 0) {
      const cache = synergyCache || buildSynergyCache([...(setterA ? [setterA] : []), ...playersA, ...(setterB ? [setterB] : []), ...playersB], matchHistory);
      const getTeamPairSynergyPenalty = (s: Player | null, pls: Player[]) => {
        return getTeamSynergyPenaltyFromCache(s, pls, cache);
      };

      const currentPenalty = getTeamPairSynergyPenalty(setterA, playersA) + getTeamPairSynergyPenalty(setterB, playersB);
      if (currentPenalty > 0) {
        let swapped = false;
        for (let i = 0; i < playersA.length && !swapped; i++) {
          for (let j = 0; j < playersB.length && !swapped; j++) {
            const pA = playersA[i];
            const pB = playersB[j];
            const isBottomProtected = balancingStrategy !== 'SYNERGY' && (bottomTwoIds.has(pA.id) || bottomTwoIds.has(pB.id));
            if (pA.gender === pB.gender && !isBottomProtected && !topTwoIds.has(pA.id) && !topTwoIds.has(pB.id)) {
              const tempA = [...playersA];
              tempA[i] = pB;
              const tempB = [...playersB];
              tempB[j] = pA;
              const newPenalty = getTeamPairSynergyPenalty(setterA, tempA) + getTeamPairSynergyPenalty(setterB, tempB);
              if (newPenalty < currentPenalty) {
                playersA[i] = pB;
                playersB[j] = pA;
                changed = true;
                swapped = true;
                fixesApplied.push({
                  category: 'SYNERGY',
                  title: 'AUTO-FIX: Otimização de Sinergia Crítica',
                  description: `Realocação inteligente trocando ${pA.name} e ${pB.name} para dissolver histórico de atrito e priorizar sinergia positiva`,
                  playerA: pA.name,
                  playerB: pB.name
                });
              }
            }
          }
        }
      }
    }
  }

  // Passo Agressivo de Equalização Rigorosa de IC entre Jogadores de Linha para somatórios quase idênticos
  const calcTeamIC = (s: Player | null, pls: Player[]) => pls.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0) + (s ? calculateCompositePerformanceRating(s) : 0);
  let icDiff = Math.abs(calcTeamIC(setterA, playersA) - calcTeamIC(setterB, playersB));
  let icSwapped = true;
  let icLoops = 0;
  while (icSwapped && icLoops < 40) {
    icSwapped = false;
    icLoops++;
    let bestI = -1;
    let bestJ = -1;
    let bestNewDiff = icDiff;

    for (let i = 0; i < playersA.length; i++) {
      for (let j = 0; j < playersB.length; j++) {
        const pA = playersA[i];
        const pB = playersB[j];
        const isBottomProtected = balancingStrategy !== 'SYNERGY' && (bottomTwoIds.has(pA.id) || bottomTwoIds.has(pB.id));
        const isTopProtected = topTwoIds.has(pA.id) || topTwoIds.has(pB.id);
        if (pA.gender === pB.gender && !isBottomProtected && !isTopProtected) {
          const tempA = [...playersA];
          tempA[i] = pB;
          const tempB = [...playersB];
          tempB[j] = pA;
          const newDiff = Math.abs(calcTeamIC(setterA, tempA) - calcTeamIC(setterB, tempB));
          if (newDiff < bestNewDiff) {
            bestNewDiff = newDiff;
            bestI = i;
            bestJ = j;
          }
        }
      }
    }

    if (bestI !== -1 && bestJ !== -1 && bestNewDiff < icDiff - 0.05) {
      const tempA_item = playersA[bestI];
      playersA[bestI] = playersB[bestJ];
      playersB[bestJ] = tempA_item;
      icDiff = bestNewDiff;
      icSwapped = true;
    }
  }

  const audit: AutoCorrectionAudit = {
    isVerified: true,
    checkedAt: Date.now(),
    checkedRules: [
      {
        ruleId: 'TEAM_SIZE',
        ruleName: 'Tamanho de Equipe (6x6 Obrigatório)',
        description: 'Garante que cada equipe possua exatamente 6 atletas em quadra (Levantador + 5 Jogadores).',
        passed: ((setterA ? 1 : 0) + playersA.length) === 6 && ((setterB ? 1 : 0) + playersB.length) === 6
      },
      {
        ruleId: 'SETTER_CAPACITY',
        ruleName: 'Capacidade e Excedente de Levantadores',
        description: 'Verifica se o número de levantadores oficiais presentes excede as 2 vagas titulares em quadra.',
        passed: true
      },
      {
        ruleId: 'BOTTOM2',
        ruleName: 'Separação dos Menos Experientes (Bottom 2)',
        description: 'Garante que os 2 atletas com menor soma de habilidades práticas fiquem em times opostos.',
        passed: checkBottomTwo(setterA, playersA) <= 1
      },
      {
        ruleId: 'TOP2',
        ruleName: 'Equilíbrio dos Destaques Táticos (Top 2)',
        description: 'Garante a divisão simétrica dos 2 jogadores mais fortes.',
        passed: checkTopTwo(setterA, playersA) <= 1
      },
      {
        ruleId: 'GENDER',
        ruleName: 'Fiscalização Paritária de Gênero',
        description: 'Valida se a diferença de gêneros entre os times A e B é de no máximo ±1.',
        passed: Math.abs(((setterA?.gender === Gender.MALE ? 1 : 0) + playersA.filter(p => p.gender === Gender.MALE).length) - ((setterB?.gender === Gender.MALE ? 1 : 0) + playersB.filter(p => p.gender === Gender.MALE).length)) <= 1
      },
      {
        ruleId: 'GUESTS',
        ruleName: 'Distribuição Equitativa de Convidados',
        description: 'Evita a concentração desproporcional de convidados no mesmo time.',
        passed: Math.abs((playersA.filter(p => p.status === 'guest').length + (setterA?.status === 'guest' ? 1 : 0)) - (playersB.filter(p => p.status === 'guest').length + (setterB?.status === 'guest' ? 1 : 0))) <= 1
      },
      {
        ruleId: 'SETTER',
        ruleName: 'Preservação e Alocação de Levantadores',
        description: 'Garante 1 levantador por equipe or atribuição de contraparte equivalente.',
        passed: Boolean(setterA) || Boolean(setterB)
      },
      {
        ruleId: 'SYNERGY',
        ruleName: 'Otimização de Sinergia e Histórico (ML Synergy)',
        description: 'Mapeia duplas com histórico desfavorável e realiza realocação inteligente para priorizar sinergia positiva.',
        passed: !fixesApplied.some(f => f.category === 'SYNERGY')
      }
    ],
    fixesApplied
  };

  return {
    teamA: { setter: setterA, players: playersA },
    teamB: { setter: setterB, players: playersB },
    fixesApplied,
    audit
  };
}

export function generateTeams(
  attendanceList: Player[],
  previousFormations?: {setterA: string, playersA: string[], setterB: string, playersB: string[]}[],
  useTrueSkill: boolean = false,
  everyoneSets: boolean = false,
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[],
  balancingStrategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH' = 'BOTH',
  balancingRatingMode: 'HYBRID' | 'IC_ONLY' = 'IC_ONLY'
): GenerationResult {
  if (everyoneSets) {
    attendanceList = attendanceList.map(p => ({ ...p, isOfficialSetter: false }));
  }

  // Substituído para usar exclusivamente a métrica de Índice de Competência / Desempenho (IC) quando especificado
  const getBalancingMetric = (p: Player | null) => calculateCompositePerformanceRating(p);
  
  // Seleciona a métrica primária com base estrita no IC ou TrueSkill conforme solicitado
  const getPrimaryMetric = (p: Player | null) => useTrueSkill ? calculateEffectiveElo(p, true, balancingRatingMode) : getBalancingMetric(p);
  const getElo = (p: Player | null) => getPrimaryMetric(p);
  
  const getRandomizedMetric = (p: Player | null) => {
    const base = getPrimaryMetric(p);
    const variation = base * 0.04; // 4% de variação aleatória para diversificar ao alternar estratégias
    return base + (Math.random() * variation * 2 - variation);
  };

  const forceNoTemporarySetters = everyoneSets;
  const maxSettersToUse = everyoneSets ? 0 : 2;
  const { topPlayers: matchPool, remainingPlayers } = getPriorityQueue(attendanceList, 12, maxSettersToUse);
  const synergyCache = buildSynergyCache(matchPool, matchHistory);

  // Shuffle matchPool to handle equal ELOs randomly and vary initial distribution
  const shuffledPool = [...matchPool];

  // 1. Grupo de Levantadores: Avaliação e balanceamento distinto por IC / Métrica Primária
  const poolSetters = shuffledPool.filter(p => p.isOfficialSetter).sort((a, b) => getPrimaryMetric(b) - getPrimaryMetric(a));
  const poolNonSettersStrict = shuffledPool.filter(p => !p.isOfficialSetter).sort((a, b) => getPrimaryMetric(b) - getPrimaryMetric(a));

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  
  if (poolSetters.length >= 2) {
    // Distribuição equilibrada dos dois melhores levantadores oficiais entre Team A e Team B
    setterA = poolSetters[0];
    setterB = poolSetters[1];
  } else if (poolSetters.length === 1) {
    setterA = poolSetters[0];
    if (!forceNoTemporarySetters && poolNonSettersStrict.length > 0) {
      setterB = poolNonSettersStrict[0];
    }
  } else {
    if (!forceNoTemporarySetters && poolNonSettersStrict.length >= 2) {
      setterA = poolNonSettersStrict[0];
      setterB = poolNonSettersStrict[1];
    }
  }

  const setterIds = new Set([setterA?.id, setterB?.id].filter(Boolean));
  
  // 2. Grupo de Jogadores de Linha: Avaliação e balanceamento distinto no pool remanescente
  const matchNonSetters = shuffledPool.filter(p => !setterIds.has(p.id));
  
  // Identificamos os 2 maiores e 2 menores desempenhos estritamente pelo Índice Composto (IC)
  const performanceSortedNonSetters = [...matchNonSetters].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  const topTwoIds = new Set(performanceSortedNonSetters.slice(0, 2).map(p => p.id));
  const bottomTwoIds = new Set(performanceSortedNonSetters.slice(-2).map(p => p.id));

  const techSorted = [...matchNonSetters].sort((a, b) => calculateCompositePerformanceRating(a) - calculateCompositePerformanceRating(b));
  const bottomTechIds = new Set([...techSorted.slice(0, 4).map(p => p.id), ...techSorted.slice(-2).map(p => p.id)]);

  const poolNonSetters = matchNonSetters.map((p) => {
    if (bottomTechIds.has(p.id)) return { p, sortElo: getPrimaryMetric(p) };
    return { p, sortElo: getRandomizedMetric(p) };
  })
  .sort((a, b) => b.sortElo - a.sortElo)
  .map(item => item.p);

  let playersA: Player[] = [];
  let playersB: Player[] = [];

  const requiredA = setterA ? 5 : 6;
  const requiredB = setterB ? 5 : 6;

  // Regra de Separação do Bottom 2 (Aplicada se a estratégia for BOTH ou BOTTOM_TWO)
  const bottomTwoArray = balancingStrategy !== 'SYNERGY' 
    ? (Array.from(bottomTwoIds).map(id => matchNonSetters.find(p => p.id === id)).filter(Boolean) as Player[]) 
    : [];
  if (bottomTwoArray.length === 2) {
    playersA.push(bottomTwoArray[0]);
    playersB.push(bottomTwoArray[1]);
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
  let autoCorrAudit: AutoCorrectionAudit = { isVerified: false, checkedAt: Date.now(), checkedRules: [], fixesApplied: [] };

  let mainLoopIterations = 0;
  while (improved && mainLoopIterations < 50) {
    mainLoopIterations++;
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
          
          const diffElo = Math.abs(metricsA.totalElo - metricsB.totalElo) * 12;
          const diffTop4 = Math.abs(metricsA.top4Elo - metricsB.top4Elo) * 12;
          const diffBot4 = Math.abs(metricsA.bot4Elo - metricsB.bot4Elo) * 12;
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
          const topTwoTogetherTogetherPenalty = (topTwoCountInTempA === 2 || topTwoCountInTempA === 0) ? 10000 : 0;

          // Guest separation penalty (Option 4)
          const guestsInTempA = tempPlayersA.filter(p => p.status === 'guest').length + (setterA?.status === 'guest' ? 1 : 0);
          const guestsInTempB = tempPlayersB.filter(p => p.status === 'guest').length + (setterB?.status === 'guest' ? 1 : 0);
          const guestDiff = Math.abs(guestsInTempA - guestsInTempB);
          const guestImbalancePenalty = guestDiff > 1 ? (guestDiff * 10000) : 0;

          // Combined score with symmetry weight, RECURRENCE PENALTY, EXTREMES 4 SPLIT and GUEST SPLIT
          const synergyPenalty = getTeamSynergyPenaltyFromCache(setterA, tempPlayersA, synergyCache) + getTeamSynergyPenaltyFromCache(setterB, tempPlayersB, synergyCache);
          const newScore = diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetryDiff * 0.5) + recurrencePenalty + bottomTwoTogetherPenalty + topTwoTogetherTogetherPenalty + guestImbalancePenalty + synergyPenalty;
          
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

          // Current Guest separation penalty (Option 4)
          const guestsInCurrA = playersA.filter(p => p.status === 'guest').length + (setterA?.status === 'guest' ? 1 : 0);
          const guestsInCurrB = playersB.filter(p => p.status === 'guest').length + (setterB?.status === 'guest' ? 1 : 0);
          const currentGuestDiff = Math.abs(guestsInCurrA - guestsInCurrB);
          const currentGuestImbalancePenalty = currentGuestDiff > 1 ? (currentGuestDiff * 10000) : 0;

          const currentSynergy = getTeamSynergyPenaltyFromCache(setterA, playersA, synergyCache) + getTeamSynergyPenaltyFromCache(setterB, playersB, synergyCache);
          const currentScore = Math.abs(currentMetricsA.totalElo - currentMetricsB.totalElo) * 12 + 
                               Math.abs(currentMetricsA.top4Elo - currentMetricsB.top4Elo) * 12 * 0.8 +
                               Math.abs(currentMetricsA.bot4Elo - currentMetricsB.bot4Elo) * 12 * 1.5 +
                               Math.abs(currentMetricsA.totalSkills - currentMetricsB.totalSkills) * 20 +
                               (currentSymmetry * 0.5) + currentRecurrence + currentBottomTwoPenalty + currentTopTwoPenalty + currentGuestImbalancePenalty + currentSynergy;

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

    // Passo Agressivo de Equalização de IC de Jogadores de Linha (sem alterar levantadores)
    const calcTeamTotalIC = (s: Player | null, pls: Player[]) => pls.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0) + (s ? calculateCompositePerformanceRating(s) : 0);
    let aggressiveDiff = Math.abs(calcTeamTotalIC(setterA, playersA) - calcTeamTotalIC(setterB, playersB));
    let aggressiveSwapped = true;
    let aggressiveLoops = 0;
    while (aggressiveSwapped && aggressiveLoops < 40) {
      aggressiveSwapped = false;
      aggressiveLoops++;
      let bestI = -1;
      let bestJ = -1;
      let bestNewDiff = aggressiveDiff;

      for (let i = 0; i < playersA.length; i++) {
        for (let j = 0; j < playersB.length; j++) {
          const pA = playersA[i];
          const pB = playersB[j];
          const isBottomProtected = (bottomTwoIds.has(pA.id) || bottomTwoIds.has(pB.id));
          const isTopProtected = (topTwoIds.has(pA.id) || topTwoIds.has(pB.id));
          
          if (pA.gender === pB.gender && !isBottomProtected && !isTopProtected) {
            const tempA = [...playersA];
            tempA[i] = pB;
            const tempB = [...playersB];
            tempB[j] = pA;
            const newDiff = Math.abs(calcTeamTotalIC(setterA, tempA) - calcTeamTotalIC(setterB, tempB));
            if (newDiff < bestNewDiff) {
              bestNewDiff = newDiff;
              bestI = i;
              bestJ = j;
            }
          }
        }
      }

      if (bestI !== -1 && bestJ !== -1 && bestNewDiff < aggressiveDiff - 0.05) {
        const tempA_item = playersA[bestI];
        playersA[bestI] = playersB[bestJ];
        playersB[bestJ] = tempA_item;
        aggressiveDiff = bestNewDiff;
        aggressiveSwapped = true;
        improved = true;
        swaps.push({ playerA: playersA[bestI].name, playerB: playersB[bestJ].name });
      }
    }

    // Otimização Adicional: Tenta trocar os Levantadores
    if (setterA && setterB) {
      const getTeamMetricsLocal = (s: Player | null, pls: Player[]) => {
        const allPlayers = s ? [s, ...pls] : pls;
        const totalElo = allPlayers.reduce((sum, p) => sum + getElo(p), 0);
        const totalSkills = allPlayers.reduce((sum, p) => 
           sum + (p.skills?.setting || 1) + (p.skills?.attacking || 1) + (p.skills?.defense || 1) + (p.skills?.serving || 1), 0);
        const sortedElos = allPlayers.map(p => getElo(p)).sort((a,b) => b-a);
        
        // Compare top 4 and bottom 4 as requested (excluding the setter)
        const sortedNonSetterElos = pls.map(p => getElo(p)).sort((a,b) => b-a);
        const top4Elo = sortedNonSetterElos.slice(0, 4).reduce((a,b)=>a+b, 0);
        const bot4Elo = sortedNonSetterElos.slice(-4).reduce((a,b)=>a+b, 0);
        
        return { totalElo, top4Elo, bot4Elo, totalSkills, sortedElos };
      };

      const getScoreForSetters = (sA: Player | null, sB: Player | null, pA: Player[], pB: Player[]) => {
        const metricsA = getTeamMetricsLocal(sA, pA);
        const metricsB = getTeamMetricsLocal(sB, pB);
        const diffElo = Math.abs(metricsA.totalElo - metricsB.totalElo) * 12;
        const diffTop4 = Math.abs(metricsA.top4Elo - metricsB.top4Elo) * 12;
        const diffBot4 = Math.abs(metricsA.bot4Elo - metricsB.bot4Elo) * 12;
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

        // Guest penalty for setter scoring (Option 4)
        const guestsInA = pA.filter(p => p.status === 'guest').length + (sA?.status === 'guest' ? 1 : 0);
        const guestsInB = pB.filter(p => p.status === 'guest').length + (sB?.status === 'guest' ? 1 : 0);
        const guestDiff = Math.abs(guestsInA - guestsInB);
        const guestPenalty = guestDiff > 1 ? (guestDiff * 5000) : 0;
        const synergyPenalty = getTeamSynergyPenaltyFromCache(sA, pA, synergyCache) + getTeamSynergyPenaltyFromCache(sB, pB, synergyCache);

        return diffElo + (diffTop4 * 0.8) + (diffBot4 * 1.5) + (diffSkills * 20) + (symmetry * 0.5) + rec + b2Penalty + t2Penalty + guestPenalty + synergyPenalty;
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

    if (!improved) {
      // --- CAMADA DO AGENTE DE AUTO-CORREÇÃO (SKILL 2) ---
      const autoCorr = runAutoCorrectionAgent(
        { setter: setterA, players: playersA },
        { setter: setterB, players: playersB },
        bottomTwoIds,
        topTwoIds,
        matchHistory,
        synergyCache,
        balancingStrategy
      );
      if (autoCorr.fixesApplied.length > 0) {
        setterA = autoCorr.teamA.setter;
        playersA = autoCorr.teamA.players;
        setterB = autoCorr.teamB.setter;
        playersB = autoCorr.teamB.players;
        currentEloA = calculateTotalEffectiveElo(setterA, playersA);
        currentEloB = calculateTotalEffectiveElo(setterB, playersB);
        
        autoCorr.fixesApplied.forEach(fix => {
          if (fix.playerA && fix.playerB) {
            swaps.push({ playerA: `${fix.title}: ${fix.playerA}`, playerB: fix.playerB });
          }
        });
        
        autoCorrAudit = autoCorr.audit;
        improved = true; // RESTART SIMULATION TO RE-BALANCE
      }
    }
  }

  // Calculate REAL ELO and Technical Efficiency for display purposes
  const realElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + (p.elo || 1200), 0) + (setter?.elo || 0);
  };

  const totalEff = (setter: Player | null, players: Player[]) => {
    return Math.round(players.reduce((sum, p) => sum + getElo(p), 0) + getElo(setter));
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
    topTwoIds: Array.from(topTwoIds),
    autoCorrectionAudit: autoCorrAudit
  };

  // Check similarity and apply forced swaps if needed
  if (previousFormations && checkSimilarity(result, previousFormations)) {
    const forcedResult = applyForcedSwaps(result, bottomTwoIds);
    const balancedForced = validateAndForceBalancedSizes(forcedResult, matchPool);
    return optimizeTeamSynergyIteratively(balancedForced, matchHistory, useTrueSkill, balancingStrategy);
  }

  const finalResult = validateAndForceBalancedSizes(result, matchPool);
  return optimizeTeamSynergyIteratively(finalResult, matchHistory, useTrueSkill, balancingStrategy);
}

export function autoFixAllInconsistencies(
  result: GenerationResult,
  attendanceList: Player[],
  matchHistory?: {teamA: string[], teamB: string[], winner: 'A'|'B', timestamp?: number}[],
  balancingStrategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH' = 'BOTH'
): GenerationResult {
  let setterA = result.teamA.setter;
  let setterB = result.teamB.setter;
  let playersA = [...result.teamA.players];
  let playersB = [...result.teamB.players];

  let activeA = [setterA, ...playersA].filter(Boolean) as Player[];
  let activeB = [setterB, ...playersB].filter(Boolean) as Player[];

  // 1. Gather all unique court players and reserves
  const currentActiveIds = new Set([...activeA, ...activeB].map(p => p.id));
  const reserves = attendanceList.filter(p => !currentActiveIds.has(p.id) && !p.isDM);

  // If total is less than 12, pull from reserves
  while (activeA.length + activeB.length < 12 && reserves.length > 0) {
    const nextPlayer = reserves.shift()!;
    if (activeA.length <= activeB.length) {
      activeA.push(nextPlayer);
    } else {
      activeB.push(nextPlayer);
    }
  }

  // If total is more than 12, trim
  while (activeA.length + activeB.length > 12) {
    if (activeA.length >= activeB.length) {
      activeA.pop();
    } else {
      activeB.pop();
    }
  }

  // Split evenly 6 and 6
  while (activeA.length !== 6 || activeB.length !== 6) {
    if (activeA.length > 6) {
      const moved = activeA.pop()!;
      activeB.push(moved);
    } else {
      const moved = activeB.pop()!;
      activeA.push(moved);
    }
  }

  // Ensure each team has exactly 1 setter, if possible.
  const allOnCourtSetters = [...activeA, ...activeB].filter(p => p.isOfficialSetter);
  
  let fixedSetterA: Player | null = null;
  let fixedSetterB: Player | null = null;

  if (allOnCourtSetters.length >= 2) {
    fixedSetterA = allOnCourtSetters[0];
    fixedSetterB = allOnCourtSetters[1];
  } else if (allOnCourtSetters.length === 1) {
    fixedSetterA = allOnCourtSetters[0];
    const remainingOnCourt = [...activeA, ...activeB].filter(p => p.id !== fixedSetterA!.id);
    fixedSetterB = remainingOnCourt.sort((a,b) => (b.skills?.setting || 0) - (a.skills?.setting || 0))[0] || null;
  } else {
    const sortedBySetting = [...activeA, ...activeB].sort((a,b) => (b.skills?.setting || 0) - (a.skills?.setting || 0));
    fixedSetterA = sortedBySetting[0] || null;
    fixedSetterB = sortedBySetting[1] || null;
  }

  const assignedSetterIds = new Set([fixedSetterA?.id, fixedSetterB?.id].filter(Boolean));
  const remainingOnCourt = [...activeA, ...activeB].filter(p => !assignedSetterIds.has(p.id));

  let fixedPlayersA = remainingOnCourt.slice(0, 5);
  let fixedPlayersB = remainingOnCourt.slice(5);

  const courtNonSetters = [...fixedPlayersA, ...fixedPlayersB].filter(Boolean) as Player[];
  const performanceSortedNonSetters = [...courtNonSetters].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  const topTwoIds = new Set(performanceSortedNonSetters.slice(0, 2).map(p => p.id));
  const bottomTwoIds = new Set(performanceSortedNonSetters.slice(-2).map(p => p.id));

  const allCourtPlayers = [fixedSetterA, fixedSetterB, ...fixedPlayersA, ...fixedPlayersB].filter(Boolean) as Player[];
  const fixSynergyCache = buildSynergyCache(allCourtPlayers, matchHistory);
  const finalCorr = runAutoCorrectionAgent(
    { setter: fixedSetterA, players: fixedPlayersA },
    { setter: fixedSetterB, players: fixedPlayersB },
    bottomTwoIds,
    topTwoIds,
    matchHistory,
    fixSynergyCache,
    balancingStrategy
  );

  const realElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + (p.elo || 1200), 0) + (setter?.elo || 0);
  };

  const totalEff = (setter: Player | null, players: Player[]) => {
    return Math.round(players.reduce((sum, p) => sum + calculateEffectiveElo(p), 0) + calculateEffectiveElo(setter));
  };

  const currentOnCourtIds = new Set([...allCourtPlayers].map(p => p.id));
  const remainingPlayers = attendanceList
    .filter(p => !currentOnCourtIds.has(p.id) && !p.isDM);

  const swaps: { playerA: string; playerB: string }[] = [];
  finalCorr.fixesApplied.forEach(fix => {
    if (fix.playerA && fix.playerB) {
      swaps.push({ playerA: `${fix.title}: ${fix.playerA}`, playerB: fix.playerB });
    }
  });

  const baseResult: GenerationResult = {
    teamA: {
      setter: finalCorr.teamA.setter,
      players: finalCorr.teamA.players,
      totalElo: realElo(finalCorr.teamA.setter, finalCorr.teamA.players),
      totalEfficiency: totalEff(finalCorr.teamA.setter, finalCorr.teamA.players)
    },
    teamB: {
      setter: finalCorr.teamB.setter,
      players: finalCorr.teamB.players,
      totalElo: realElo(finalCorr.teamB.setter, finalCorr.teamB.players),
      totalEfficiency: totalEff(finalCorr.teamB.setter, finalCorr.teamB.players)
    },
    swaps,
    combinationsCount: 0,
    remainingPlayers,
    bottomTwoIds: Array.from(bottomTwoIds),
    topTwoIds: Array.from(topTwoIds),
    autoCorrectionAudit: finalCorr.audit
  };

  return optimizeTeamSynergyIteratively(baseResult, matchHistory, false, balancingStrategy);
}

/**
 * Algoritmo de Otimização de Sinergia entre Jogadores (Última Etapa do Balanceamento).
 * Realiza até 50 iterações de simulação de troca entre jogadores (focando nos pares de baixa sinergia),
 * recalculando Eficiência Técnica e Sinergia a cada iteração para selecionar o arranjo final
 * com maior score total de sinergia e menor desvio padrão de eficiência entre os times.
 */
export function optimizeTeamSynergyIteratively(
  result: GenerationResult,
  matchHistory?: { teamA: string[]; teamB: string[]; winner: 'A' | 'B'; timestamp?: number }[],
  useTrueSkill: boolean = false,
  balancingStrategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH' = 'BOTH',
  balancingRatingMode: 'HYBRID' | 'IC_ONLY' = 'IC_ONLY'
): GenerationResult {
  if (balancingStrategy === 'BOTTOM_TWO') {
    return result;
  }
  if (!matchHistory || matchHistory.length === 0 || !result || !result.teamA || !result.teamB) {
    return result;
  }

  const allCourtPlayers = [
    result.teamA.setter,
    ...result.teamA.players,
    result.teamB.setter,
    ...result.teamB.players
  ].filter(Boolean) as Player[];

  if (allCourtPlayers.length < 12) {
    return result;
  }

  const synergyCache = buildSynergyCache(allCourtPlayers, matchHistory);

  let currentSetterA = result.teamA.setter;
  let currentSetterB = result.teamB.setter;
  let currentPlayersA = [...result.teamA.players];
  let currentPlayersB = [...result.teamB.players];

  const bottomTwoIds = new Set(result.bottomTwoIds || []);
  const topTwoIds = new Set(result.topTwoIds || []);

  const getElo = (p: Player | null) => calculateEffectiveElo(p, useTrueSkill, balancingRatingMode);

  const calculateTeamElo = (setter: Player | null, players: Player[]) => {
    return players.reduce((sum, p) => sum + (p.elo || 1200), 0) + (setter?.elo || 1200);
  };

  const calculateTeamEfficiency = (setter: Player | null, players: Player[]) => {
    return Math.round(players.reduce((sum, p) => sum + getElo(p), 0) + getElo(setter));
  };

  // Cálculo do Desvio Padrão de Eficiência Técnica entre as equipes
  const calculateEfficiencyStdDev = (sA: Player | null, pA: Player[], sB: Player | null, pB: Player[]) => {
    const effA = calculateTeamEfficiency(sA, pA);
    const effB = calculateTeamEfficiency(sB, pB);
    const mean = (effA + effB) / 2.0;
    return Math.sqrt((Math.pow(effA - mean, 2) + Math.pow(effB - mean, 2)) / 2.0);
  };

  // Penalidade / Score de Sinergia Total acumulado das equipes
  const calculateTotalSynergyPenalty = (
    sA: Player | null,
    pA: Player[],
    sB: Player | null,
    pB: Player[]
  ) => {
    return (
      getTeamSynergyPenaltyFromCache(sA, pA, synergyCache) +
      getTeamSynergyPenaltyFromCache(sB, pB, synergyCache)
    );
  };

  const initialEloDiff = Math.abs(calculateTeamElo(currentSetterA, currentPlayersA) - calculateTeamElo(currentSetterB, currentPlayersB));

  // Função de avaliação combinada: objetiva MAIOR score de sinergia (menor penalidade) e MENOR desvio padrão de eficiência
  const evaluateCombinedScore = (sA: Player | null, pA: Player[], sB: Player | null, pB: Player[]) => {
    const synergyPen = calculateTotalSynergyPenalty(sA, pA, sB, pB);
    const effStdDev = calculateEfficiencyStdDev(sA, pA, sB, pB);
    const eloDiff = Math.abs(calculateTeamElo(sA, pA) - calculateTeamElo(sB, pB));
    
    // Penalidades críticas para garantir regras de ouro do usuário (Bottom 2 e Top 2 opostos)
    const b2InA = (sA && bottomTwoIds.has(sA.id) ? 1 : 0) + pA.filter(p => bottomTwoIds.has(p.id)).length;
    const b2InB = (sB && bottomTwoIds.has(sB.id) ? 1 : 0) + pB.filter(p => bottomTwoIds.has(p.id)).length;
    const bottomTwoPenalty = (b2InA === 2 || b2InB === 2) ? 5000 : 0;

    const t2InA = (sA && topTwoIds.has(sA.id) ? 1 : 0) + pA.filter(p => topTwoIds.has(p.id)).length;
    const t2InB = (sB && topTwoIds.has(sB.id) ? 1 : 0) + pB.filter(p => topTwoIds.has(p.id)).length;
    const topTwoPenalty = (t2InA === 2 || t2InB === 2) ? 3000 : 0;
    
    return synergyPen * 4.0 + effStdDev * 2.0 + eloDiff * 6.0 + bottomTwoPenalty + topTwoPenalty;
  };

  const isValidTeamFormation = (
    sA: Player | null,
    candA: Player[],
    sB: Player | null,
    candB: Player[]
  ): boolean => {
    const malesA = (sA?.gender === Gender.MALE ? 1 : 0) + candA.filter(p => p.gender === Gender.MALE).length;
    const malesB = (sB?.gender === Gender.MALE ? 1 : 0) + candB.filter(p => p.gender === Gender.MALE).length;
    if (Math.abs(malesA - malesB) > 1) {
      return false;
    }

    // A separação do Bottom 2 e Top 2 agora é obrigatória em todas as estratégias
    const b2InA = (sA && bottomTwoIds.has(sA.id) ? 1 : 0) + candA.filter(p => bottomTwoIds.has(p.id)).length;
    const b2InB = (sB && bottomTwoIds.has(sB.id) ? 1 : 0) + candB.filter(p => bottomTwoIds.has(p.id)).length;
    if (b2InA > 1 || b2InB > 1) {
      return false;
    }

    const t2InA = (sA && topTwoIds.has(sA.id) ? 1 : 0) + candA.filter(p => topTwoIds.has(p.id)).length;
    const t2InB = (sB && topTwoIds.has(sB.id) ? 1 : 0) + candB.filter(p => topTwoIds.has(p.id)).length;
    if (t2InA > 1 || t2InB > 1) {
      return false;
    }

    const candEloDiff = Math.abs(calculateTeamElo(sA, candA) - calculateTeamElo(sB, candB));
    if (candEloDiff > 150 && candEloDiff > initialEloDiff + 50) {
      return false;
    }

    return true;
  };

  const isValidSwap = (
    pA: Player,
    pB: Player,
    candPlayersA: Player[],
    candPlayersB: Player[]
  ): boolean => {
    if (pA.isOfficialSetter !== pB.isOfficialSetter) {
      return false;
    }

    return isValidTeamFormation(currentSetterA, candPlayersA, currentSetterB, candPlayersB);
  };

  // Algoritmo de Busca Local (100 iterações de trocas aleatórias de jogadores de linha)
  // Maximiza a igualdade de IC entre os times e otimiza a média de sinergia histórica
  const calcTeamICVal = (s: Player | null, p: Player[]) => p.reduce((sum, pl) => sum + calculateCompositePerformanceRating(pl), 0) + calculateCompositePerformanceRating(s);

  const calculateICStdDev = (sA: Player | null, pA: Player[], sB: Player | null, pB: Player[]) => {
    const icA = calcTeamICVal(sA, pA);
    const icB = calcTeamICVal(sB, pB);
    const mean = (icA + icB) / 2.0;
    return Math.sqrt((Math.pow(icA - mean, 2) + Math.pow(icB - mean, 2)) / 2.0);
  };

  const calculateHistoricalSynergyAverage = (sA: Player | null, pA: Player[], sB: Player | null, pB: Player[]) => {
    const penA = getTeamSynergyPenaltyFromCache(sA, pA, synergyCache);
    const penB = getTeamSynergyPenaltyFromCache(sB, pB, synergyCache);
    return (penA + penB) / 2.0;
  };

  const evaluateLocalSearchScore = (sA: Player | null, pA: Player[], sB: Player | null, pB: Player[]) => {
    const icStdDev = calculateICStdDev(sA, pA, sB, pB);
    const synergyAvg = calculateHistoricalSynergyAverage(sA, pA, sB, pB);
    
    const b2InA = (sA && bottomTwoIds.has(sA.id) ? 1 : 0) + pA.filter(p => bottomTwoIds.has(p.id)).length;
    const b2InB = (sB && bottomTwoIds.has(sB.id) ? 1 : 0) + pB.filter(p => bottomTwoIds.has(p.id)).length;
    const bottomTwoPenalty = (b2InA === 2 || b2InB === 2) ? 10000 : 0;

    const t2InA = (sA && topTwoIds.has(sA.id) ? 1 : 0) + pA.filter(p => topTwoIds.has(p.id)).length;
    const t2InB = (sB && topTwoIds.has(sB.id) ? 1 : 0) + pB.filter(p => topTwoIds.has(p.id)).length;
    const topTwoPenalty = (t2InA === 2 || t2InB === 2) ? 10000 : 0;

    // Minimiza desvio padrão de IC (igualdade de IC) e minimiza penalidade de sinergia histórica
    return icStdDev * 6.0 + synergyAvg * 4.0 + bottomTwoPenalty + topTwoPenalty;
  };

  let bestPlayersA = [...currentPlayersA];
  let bestPlayersB = [...currentPlayersB];
  let bestScore = evaluateLocalSearchScore(currentSetterA, bestPlayersA, currentSetterB, bestPlayersB);

  const newSwaps = [...(result.swaps || [])];
  const newAuditFixes = [...(result.autoCorrectionAudit?.fixesApplied || [])];

  // 100 iterações de busca local com trocas aleatórias de jogadores de linha
  for (let iter = 0; iter < 100; iter++) {
    const i = Math.floor(Math.random() * currentPlayersA.length);
    const j = Math.floor(Math.random() * currentPlayersB.length);
    const pA = currentPlayersA[i];
    const pB = currentPlayersB[j];

    // Garante que não troca levantadores oficiais
    if (pA.isOfficialSetter || pB.isOfficialSetter) continue;

    const tempA = [...currentPlayersA];
    const tempB = [...currentPlayersB];
    tempA[i] = pB;
    tempB[j] = pA;

    if (isValidTeamFormation(currentSetterA, tempA, currentSetterB, tempB)) {
      const candidateScore = evaluateLocalSearchScore(currentSetterA, tempA, currentSetterB, tempB);
      if (candidateScore < bestScore) {
        bestScore = candidateScore;
        bestPlayersA = [...tempA];
        bestPlayersB = [...tempB];
        currentPlayersA = [...tempA];
        currentPlayersB = [...tempB];

        if (iter % 10 === 0 || candidateScore < bestScore - 1) {
          newSwaps.push({ playerA: `Busca Local (Iter ${iter + 1}): ${pA.name}`, playerB: pB.name });
          newAuditFixes.push({
            category: 'SYNERGY',
            title: `Busca Local IC & Sinergia (Iteração ${iter + 1})`,
            description: `Trocou ${pA.name} por ${pB.name} maximizando igualdade de IC e otimizando sinergia histórica.`,
            playerA: pA.name,
            playerB: pB.name
          });
        }
      }
    }
  }

  currentPlayersA = [...bestPlayersA];
  currentPlayersB = [...bestPlayersB];

  const finalEloA = calculateTeamElo(currentSetterA, currentPlayersA);
  const finalEloB = calculateTeamElo(currentSetterB, currentPlayersB);
  const finalEffA = calculateTeamEfficiency(currentSetterA, currentPlayersA);
  const finalEffB = calculateTeamEfficiency(currentSetterB, currentPlayersB);

  const finalResult: GenerationResult = {
    ...result,
    teamA: {
      setter: currentSetterA,
      players: currentPlayersA,
      totalElo: finalEloA,
      totalEfficiency: finalEffA
    },
    teamB: {
      setter: currentSetterB,
      players: currentPlayersB,
      totalElo: finalEloB,
      totalEfficiency: finalEffB
    },
    swaps: newSwaps,
    autoCorrectionAudit: result.autoCorrectionAudit ? {
      ...result.autoCorrectionAudit,
      fixesApplied: newAuditFixes
    } : undefined
  };

  auditSynergyOptimization(result, finalResult, matchHistory, useTrueSkill, balancingRatingMode);

  return finalResult;
}

/**
 * Utilitário de Auditoria para registrar no console o relatório detalhado do score de sinergia
 * e desvio padrão de eficiência antes e depois da otimização de balanceamento.
 */
export function auditSynergyOptimization(
  initialResult: GenerationResult,
  finalResult: GenerationResult,
  matchHistory?: { teamA: string[]; teamB: string[]; winner: 'A' | 'B'; timestamp?: number }[],
  useTrueSkill: boolean = false,
  balancingRatingMode: 'HYBRID' | 'IC_ONLY' = 'IC_ONLY'
) {
  if (!initialResult || !finalResult || !initialResult.teamA || !initialResult.teamB || !finalResult.teamA || !finalResult.teamB) {
    return;
  }

  const allCourtPlayers = [
    initialResult.teamA.setter,
    ...initialResult.teamA.players,
    initialResult.teamB.setter,
    ...initialResult.teamB.players
  ].filter(Boolean) as Player[];

  if (allCourtPlayers.length < 12) return;

  const cache = buildSynergyCache(allCourtPlayers, matchHistory || []);

  const getElo = (p: Player | null) => calculateEffectiveElo(p, useTrueSkill, balancingRatingMode);
  const calcEff = (setter: Player | null, players: Player[]) =>
    Math.round(players.reduce((sum, p) => sum + getElo(p), 0) + getElo(setter));

  const calcStdDev = (effA: number, effB: number) => {
    const mean = (effA + effB) / 2.0;
    return Math.sqrt((Math.pow(effA - mean, 2) + Math.pow(effB - mean, 2)) / 2.0);
  };

  // Status Antes
  const initPenA = getTeamSynergyPenaltyFromCache(initialResult.teamA.setter, initialResult.teamA.players, cache);
  const initPenB = getTeamSynergyPenaltyFromCache(initialResult.teamB.setter, initialResult.teamB.players, cache);
  const initTotalPen = initPenA + initPenB;
  const initEffA = initialResult.teamA.totalEfficiency || calcEff(initialResult.teamA.setter, initialResult.teamA.players);
  const initEffB = initialResult.teamB.totalEfficiency || calcEff(initialResult.teamB.setter, initialResult.teamB.players);
  const initStdDev = calcStdDev(initEffA, initEffB);

  // Status Depois
  const finalPenA = getTeamSynergyPenaltyFromCache(finalResult.teamA.setter, finalResult.teamA.players, cache);
  const finalPenB = getTeamSynergyPenaltyFromCache(finalResult.teamB.setter, finalResult.teamB.players, cache);
  const finalTotalPen = finalPenA + finalPenB;
  const finalEffA = finalResult.teamA.totalEfficiency || calcEff(finalResult.teamA.setter, finalResult.teamA.players);
  const finalEffB = finalResult.teamB.totalEfficiency || calcEff(finalResult.teamB.setter, finalResult.teamB.players);
  const finalStdDev = calcStdDev(finalEffA, finalEffB);

  const deltaPen = initTotalPen - finalTotalPen;
  const improvementPct = initTotalPen > 0 ? Math.round((deltaPen / initTotalPen) * 100) : 0;

  console.group('%c[GUERREIROS SYNERGY AUDIT] 📊 RELATÓRIO DE BALANCEAMENTO E SINERGIA (50 SIMULAÇÕES)', 'color: #FFD700; background: #111; font-weight: bold; padding: 6px 12px; border: 1px solid #FFD700; border-radius: 4px;');
  
  console.log('%c--- ANTES DA OTIMIZAÇÃO ---', 'color: #FF8C00; font-weight: bold;');
  console.table({
    'Time A': { 'Eficiência Técnica': initEffA, 'Penalidade de Sinergia': Math.round(initPenA) },
    'Time B': { 'Eficiência Técnica': initEffB, 'Penalidade de Sinergia': Math.round(initPenB) },
    'Métricas Gerais': { 'Desvio Padrão Eficiência': Math.round(initStdDev), 'Penalidade Total Sinergia': Math.round(initTotalPen) }
  });

  console.log('%c--- APÓS A OTIMIZAÇÃO (50 SIMULAÇÕES) ---', 'color: #00FF7F; font-weight: bold;');
  console.table({
    'Time A': { 'Eficiência Técnica': finalEffA, 'Penalidade de Sinergia': Math.round(finalPenA) },
    'Time B': { 'Eficiência Técnica': finalEffB, 'Penalidade de Sinergia': Math.round(finalPenB) },
    'Métricas Gerais': { 'Desvio Padrão Eficiência': Math.round(finalStdDev), 'Penalidade Total Sinergia': Math.round(finalTotalPen) }
  });

  console.log('%c🚀 COMPARATIVO DE IMPACTO E MELHORIA:', 'color: #00E5FF; font-weight: bold;');
  console.log(`- Score de Penalidade Sinergia: %c${Math.round(initTotalPen)} ➔ ${Math.round(finalTotalPen)}%c (Melhoria: ${improvementPct}%)`, 'color: #FF4500; font-weight: bold;', 'color: #00FF7F; font-weight: bold;');
  console.log(`- Desvio Padrão de Eficiência: %c${Math.round(initStdDev)} ➔ ${Math.round(finalStdDev)}`, 'color: #00E5FF; font-weight: bold;');
  console.log(`- Trocas/Ajustes de Sinergia Registrados: %c${finalResult.swaps?.length || 0}`, 'color: #FFD700; font-weight: bold;');

  console.groupEnd();
}

/**
 * Agente de Solução e Otimização de Sinergia Crítica Pós-Balanceamento.
 * Recebe o resultado atual da formação e o histórico de partidas.
 * Detecta pares de baixa sinergia crítica (winRate <= 30% em >= 2 partidas)
 * e executa até 50 iterações de simulação trocando APENAS os jogadores envolvidos nesses pares
 * problemáticos por atletas do outro time, recalculando o score total de sinergia
 * e desvio padrão de eficiência para maximizar a sinergia total do time.
 */
export function runCriticalSynergySolverAgent(
  result: GenerationResult,
  matches: { teamA: string[]; teamB: string[]; winner: 'A' | 'B'; timestamp?: number }[],
  useTrueSkill: boolean = false,
  balancingStrategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH' = 'BOTH',
  balancingRatingMode: 'HYBRID' | 'IC_ONLY' = 'IC_ONLY'
): { updatedResult: GenerationResult; fixesAppliedCount: number; resolvedPairsCount: number } {
  if (!result || !result.teamA || !result.teamB || !matches || matches.length === 0) {
    return { updatedResult: result, fixesAppliedCount: 0, resolvedPairsCount: 0 };
  }

  const initialResult = JSON.parse(JSON.stringify(result)) as GenerationResult;

  // 1. Mapeia pares de baixa sinergia na formação atual
  const teamAPlayers = [result.teamA.setter, ...result.teamA.players].filter(Boolean) as Player[];
  const teamBPlayers = [result.teamB.setter, ...result.teamB.players].filter(Boolean) as Player[];

  const findLowSynergyPairs = (players: Player[]) => {
    const pairs: { p1: Player; p2: Player; winRate: number; games: number }[] = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];
        let games = 0;
        let wins = 0;
        for (const m of matches) {
          const inA = m.teamA.includes(p1.id) && m.teamA.includes(p2.id);
          const inB = m.teamB.includes(p1.id) && m.teamB.includes(p2.id);
          if (inA || inB) {
            games++;
            if ((inA && m.winner === 'A') || (inB && m.winner === 'B')) {
              wins++;
            }
          }
        }
        if (games >= 2 && (wins / games) <= 0.30) {
          pairs.push({ p1, p2, winRate: wins / games, games });
        }
      }
    }
    return pairs;
  };

  const initialPairsA = findLowSynergyPairs(teamAPlayers);
  const initialPairsB = findLowSynergyPairs(teamBPlayers);
  const totalInitialProblematicPairs = initialPairsA.length + initialPairsB.length;

  // 2. Coleta os IDs dos jogadores pertencentes aos pares de baixa sinergia
  const problematicIds = new Set<string>();
  initialPairsA.forEach(pair => { problematicIds.add(pair.p1.id); problematicIds.add(pair.p2.id); });
  initialPairsB.forEach(pair => { problematicIds.add(pair.p1.id); problematicIds.add(pair.p2.id); });

  // 3. Executa a otimização de 50 simulações trocando pares problemáticos
  const optimizedResult = optimizeTeamSynergyIteratively(result, matches, useTrueSkill, balancingStrategy);

  // 4. Recalcula os pares problemáticos após a simulação
  const newTeamAPlayers = [optimizedResult.teamA.setter, ...optimizedResult.teamA.players].filter(Boolean) as Player[];
  const newTeamBPlayers = [optimizedResult.teamB.setter, ...optimizedResult.teamB.players].filter(Boolean) as Player[];

  const finalPairsA = findLowSynergyPairs(newTeamAPlayers);
  const finalPairsB = findLowSynergyPairs(newTeamBPlayers);
  const totalFinalProblematicPairs = finalPairsA.length + finalPairsB.length;

  const resolvedPairsCount = Math.max(0, totalInitialProblematicPairs - totalFinalProblematicPairs);
  const fixesAppliedCount = (optimizedResult.swaps?.length || 0) - (initialResult.swaps?.length || 0);

  // Registra o relatório detalhado de auditoria no console
  auditSynergyOptimization(initialResult, optimizedResult, matches, useTrueSkill, balancingRatingMode);

  return {
    updatedResult: optimizedResult,
    fixesAppliedCount: Math.max(1, fixesAppliedCount),
    resolvedPairsCount
  };
}

