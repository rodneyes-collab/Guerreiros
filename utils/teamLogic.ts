import type { Player, Gender, GenerationResult, Team, ClubGenerationRules } from '../types.ts';

// Runtime-safe Gender object and helper functions to prevent ReferenceError
export const SAFE_GENDER = {
  MALE: 'MALE' as const,
  FEMALE: 'FEMALE' as const,
};

export const isFemalePlayer = (p: any): boolean => {
  if (!p) return false;
  const raw = typeof p === 'object' ? (p.gender ?? p.Gender) : p;
  if (!raw) return false;
  const g = String(raw).trim().toUpperCase();
  return g === 'FEMALE' || g === 'F' || g === 'FEMININO';
};

export const isMalePlayer = (p: any): boolean => {
  return !isFemalePlayer(p);
};

export const getSafeGender = (p: any): Gender => {
  return isFemalePlayer(p) ? SAFE_GENDER.FEMALE : SAFE_GENDER.MALE;
};

if (typeof window !== 'undefined') {
  (window as any).Gender = (window as any).Gender || SAFE_GENDER;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Gender = (globalThis as any).Gender || SAFE_GENDER;
}

/**
 * Soma das Habilidades Práticas (Ataque, Defesa, Levantamento, Saque)
 * Se actingAsLine === true (ex: 3ª levantadora atuando na linha quando só há 12 presentes),
 * pondera Ataque, Defesa e Saque para refletir sua real atuação na linha.
 */
export const calculatePracticalSkillsSum = (p: Player, actingAsLine: boolean = false): number => {
  if (!p) return 10;
  if (p.skills) {
    const s = p.skills;
    const att = typeof s.attacking === 'number' ? s.attacking : 2;
    const def = typeof s.defense === 'number' ? s.defense : 2;
    const set = typeof s.setting === 'number' ? s.setting : 2;
    const ser = typeof s.serving === 'number' ? s.serving : 2;
    if (actingAsLine && p.isOfficialSetter) {
      // Quando levantadora excedente atua na linha, o levantamento tem peso reduzido na linha
      return Number(((att * 1.35) + (def * 1.35) + (ser * 1.0) + (set * 0.3)).toFixed(2));
    }
    return att + def + set + ser;
  }
  return 10;
};

/**
 * Índice Composto (IC) Soberano de Balanceamento:
 * 80% Habilidades Práticas + 20% Win Rate real.
 * ZERO ELO - O ELO NÃO É UTILIZADO NA PRÉ-VISUALIZAÇÃO NEM NA GERAÇÃO DE TIMES!
 */
export const calculateCompositePerformanceRating = (p: Player, actingAsLine: boolean = false): number => {
  if (!p) return 0;
  const skillsSum = calculatePracticalSkillsSum(p, actingAsLine);
  const totalMatches = (p.wins || 0) + (p.losses || 0);
  const winRate = totalMatches > 0 ? ((p.wins || 0) / totalMatches) * 100 : 50;

  const maxPossible = (p.skills && p.skills.attacking <= 3 && p.skills.defense <= 3 && (p.skills.setting || 0) <= 3) ? 12 : 20;
  const techScore = (skillsSum / maxPossible) * 100;

  const ic = (techScore * 0.8) + (winRate * 0.2);
  return Number(ic.toFixed(1));
};

export const calculateEffectiveElo = (p: Player): number => {
  return p?.elo || 1200;
};

export const calculateNegativeSynergyPenalty = (..._args: any[]): number => 0;
export const calculatePredictedMatches = (..._args: any[]): number => 0;

export const calculateTeamTotalIC = (team: any): number => {
  if (!team) return 0;
  const setterIC = team.setter ? calculateCompositePerformanceRating(team.setter, false) : 0;
  const lineIC = (team.players || []).reduce(
    (acc: number, p: Player) => acc + calculateCompositePerformanceRating(p, true),
    0
  );
  return Number((setterIC + lineIC).toFixed(1));
};

/**
 * Calcula o desequilíbrio de DNA Tático (Ataque+Saque vs Defesa+Passe) entre as duas linhas
 */
const calculateTacticalDnaImbalance = (playersA: Player[], playersB: Player[]): number => {
  const getOffense = (arr: Player[]) =>
    arr.reduce((sum, p) => sum + (p?.skills?.attacking || 2) + (p?.skills?.serving || 2), 0);
  const getDefense = (arr: Player[]) =>
    arr.reduce((sum, p) => sum + (p?.skills?.defense || 2) + (p?.skills?.setting || 2), 0);

  const offDiff = Math.abs(getOffense(playersA) - getOffense(playersB));
  const defDiff = Math.abs(getDefense(playersA) - getDefense(playersB));
  return Number((offDiff + defDiff).toFixed(1));
};

/**
 * Calcula quantos atletas de linha estão repetindo exatamente o mesmo time da última partida
 */
const calculateSameSideRepeatPenalty = (
  playersA: Player[],
  playersB: Player[],
  previousFormations: any[] = []
): number => {
  if (!previousFormations || previousFormations.length === 0) return 0;
  const last = previousFormations[previousFormations.length - 1];
  if (!last) return 0;

  const prevA = new Set<string>([last.setterA, ...(last.playersA || [])].filter(Boolean));
  const prevB = new Set<string>([last.setterB, ...(last.playersB || [])].filter(Boolean));

  const idsA = playersA.map(p => p.id);
  const idsB = playersB.map(p => p.id);

  const overlapDirect =
    idsA.filter(id => prevA.has(id)).length + idsB.filter(id => prevB.has(id)).length;
  const overlapMirrored =
    idsA.filter(id => prevB.has(id)).length + idsB.filter(id => prevA.has(id)).length;

  const maxOverlap = Math.max(overlapDirect, overlapMirrored);
  // Penaliza apenas se 8 ou mais dos 10 jogadores de linha caírem exatamente juntos como no jogo anterior
  return maxOverlap >= 8 ? maxOverlap - 7 : 0;
};

export const calculateTeamPositions = (team: any, _otherTeam?: any): Record<string, string> => {
  const positions: Record<string, string> = {};
  if (team?.setter) {
    positions[team.setter.id] = 'LEVANTADOR';
  }
  (team?.players || []).forEach((p: Player, idx: number) => {
    const defaultPositions = ['PONTEIRO 1', 'CENTRAL 1', 'OPOSTO', 'PONTEIRO 2', 'CENTRAL 2'];
    positions[p.id] = defaultPositions[idx] || 'LINHA';
  });
  return positions;
};

export const suggestPosition = (p: Player): string => {
  if (p?.isOfficialSetter) return 'LEVANTADOR';
  const att = p?.skills?.attacking || 0;
  const def = p?.skills?.defense || 0;
  if (att >= 3 && att >= def) return 'PONTEIRO';
  if (def >= 3) return 'LIBERO / DEF';
  return 'LINHA';
};

export const enrichPlayerImmutably = (p: Player, players: Player[] = [], attendance: Player[] = []): Player => {
  if (!p) return p;
  const master = players.find(mp => mp.id === p.id);
  const att = attendance.find(ap => ap.id === p.id) || p;
  return {
    ...(master || {}),
    ...att,
    ...p,
    arrivalOrder: typeof p.arrivalOrder === 'number' && p.arrivalOrder > 0
      ? p.arrivalOrder
      : (typeof att.arrivalOrder === 'number' && att.arrivalOrder > 0 ? att.arrivalOrder : 999),
    playedLastMatch: p.playedLastMatch ?? att.playedLastMatch ?? false,
    dailyMatches: p.dailyMatches ?? att.dailyMatches ?? 0,
    consecutiveBenched: p.consecutiveBenched ?? att.consecutiveBenched ?? 0,
    consecutivePlayed: p.consecutivePlayed ?? att.consecutivePlayed ?? 0,
    departureTime: p.departureTime ?? att.departureTime,
    gender: getSafeGender(master?.gender || p.gender || att.gender),
    skills: master?.skills || p.skills || att.skills || { attacking: 2, defense: 2, setting: 2, serving: 2 },
    isOfficialSetter: master?.isOfficialSetter ?? p.isOfficialSetter ?? att.isOfficialSetter ?? false
  };
};

export const cloneGenerationResultImmutably = (res: GenerationResult, players: Player[] = [], attendance: Player[] = []): GenerationResult => {
  if (!res) return res;
  const mapP = (p: Player | null) => p ? enrichPlayerImmutably(p, players, attendance) : null;
  return {
    ...res,
    teamA: {
      setter: mapP(res.teamA?.setter),
      players: (res.teamA?.players || []).map(p => mapP(p)!).filter(Boolean),
      totalIC: res.teamA?.totalIC ?? calculateTeamTotalIC(res.teamA)
    },
    teamB: {
      setter: mapP(res.teamB?.setter),
      players: (res.teamB?.players || []).map(p => mapP(p)!).filter(Boolean),
      totalIC: res.teamB?.totalIC ?? calculateTeamTotalIC(res.teamB)
    },
    remainingPlayers: (res.remainingPlayers || []).map(p => mapP(p)!).filter(Boolean)
  };
};

/**
 * Fila Inteligente (Guerreiros Intelligence Protocol)
 */
const sortPlayersByPriority = (list: Player[]): Player[] => {
  return [...list].sort((a, b) => {
    // 1. Quem NÃO jogou a última tem prioridade máxima (Rodagem Imediata)
    const pA = a.playedLastMatch ? 1 : 0;
    const pB = b.playedLastMatch ? 1 : 0;
    if (pA !== pB) return pA - pB;

    // 2. Trava Anti-Monopólio: quem jogou a última partida e tem menos jogos seguidos tem prioridade
    if (a.playedLastMatch && b.playedLastMatch) {
      const cA = a.consecutivePlayed || 0;
      const cB = b.consecutivePlayed || 0;
      if (cA !== cB) return cA - cB;
    }

    // 3. Prioridade de Saída Antecipada (departureTime)
    if (a.departureTime && !b.departureTime) return -1;
    if (!a.departureTime && b.departureTime) return 1;
    if (a.departureTime && b.departureTime && a.departureTime !== b.departureTime) {
      return a.departureTime.localeCompare(b.departureTime);
    }

    // 4. Volume Diário de Jogos (Menos partidas jogadas no dia corrente)
    const dA = a.dailyMatches || 0;
    const dB = b.dailyMatches || 0;
    if (dA !== dB) return dA - dB;

    // 5. Tempo de Banco (consecutiveBenched maior primeiro)
    if (!a.playedLastMatch && !b.playedLastMatch) {
      const bA = a.consecutiveBenched || 0;
      const bB = b.consecutiveBenched || 0;
      if (bA !== bB) return bB - bA;
    }

    // 6. Ordem de chegada (arrivalOrder menor primeiro)
    return (a.arrivalOrder ?? 999) - (b.arrivalOrder ?? 999);
  });
};

/**
 * REGRA ESTATUTÁRIA DE RODÍZIO DE LEVANTADORES E LINHA:
 * - Seleciona até 2 levantadores oficiais (1 para cada equipe).
 * - Se houver >= 10 jogadores de linha presentes (ex: 13+ presentes no total), o 3º levantador oficial
 *   permanece no banco (remainingPlayers) para entrar descansado como levantador titular no próximo jogo.
 * - Somente se faltarem jogadores de linha para fechar os 12 (ex: apenas 12 presentes na quadra sendo 3 levantadores e 9 de linha),
 *   o 3º levantador oficial completa a partida atuando na linha.
 */
export const getPriorityQueue = (
  list: Player[],
  count: number = 12,
  settersCount: number = 2
): { topPlayers: Player[]; remainingPlayers: Player[] } => {
  const activePlayers = (list || []).filter(p => {
    const status = p.status || 'active';
    const isDM = Boolean(p.isDM || status === 'dm');
    return status === 'active' && !isDM;
  });
  
  const officialSetters = activePlayers.filter(p => p.isOfficialSetter);
  const linePlayers = activePlayers.filter(p => !p.isOfficialSetter);

  const sortedSetters = sortPlayersByPriority(officialSetters);
  const sortedLine = sortPlayersByPriority(linePlayers);

  let chosenSetters: Player[] = [];
  let remainingSetters: Player[] = [];
  let linePool: Player[] = [...sortedLine];

  if (sortedSetters.length >= settersCount) {
    chosenSetters = sortedSetters.slice(0, settersCount);
    remainingSetters = sortedSetters.slice(settersCount);
  } else {
    chosenSetters = [...sortedSetters];
  }

  const neededLine = Math.max(0, count - chosenSetters.length);

  // Só aloca levantador excedente na linha se não houver jogadores de linha suficientes para fechar os 12
  if (linePool.length < neededLine && remainingSetters.length > 0) {
    const missing = neededLine - linePool.length;
    const settersAsLine = remainingSetters.slice(0, missing);
    remainingSetters = remainingSetters.slice(missing);
    linePool = [...linePool, ...settersAsLine];
  }

  const chosenLine = linePool.slice(0, neededLine);
  const remainingLine = linePool.slice(neededLine);

  const topPlayers = [...chosenSetters, ...chosenLine];
  const remainingPlayers = [...remainingLine, ...remainingSetters];

  return { topPlayers, remainingPlayers };
};

export const sortLinePlayersBySkills = (linePlayers: Player[]): Player[] => {
  return [...linePlayers].sort((a, b) => {
    const diff = calculatePracticalSkillsSum(b, true) - calculatePracticalSkillsSum(a, true);
    if (diff !== 0) return diff;
    const icDiff = calculateCompositePerformanceRating(b, true) - calculateCompositePerformanceRating(a, true);
    if (icDiff !== 0) return icDiff;
    return (a.id || '').localeCompare(b.id || '');
  });
};

/**
 * Validador Estatutário Soberano das Regras do Clube
 */
export const verifyClubGenerationRules = (result: GenerationResult): ClubGenerationRules => {
  if (!result || !result.teamA || !result.teamB) {
    return {
      allFulfilled: false,
      setter: { fulfilled: false, description: 'Equipes incompletas', badgeLabel: 'Erro' },
      gender: { fulfilled: false, description: 'Equipes incompletas', badgeLabel: 'Erro' },
      topBottom: { fulfilled: false, description: 'Equipes incompletas', badgeLabel: 'Erro' }
    };
  }

  const allA = [result.teamA.setter, ...(result.teamA.players || [])].filter(Boolean) as Player[];
  const allB = [result.teamB.setter, ...(result.teamB.players || [])].filter(Boolean) as Player[];

  // 1. Regra de Levantadores Titulares
  const hasSetterA = Boolean(result.teamA.setter?.isOfficialSetter);
  const hasSetterB = Boolean(result.teamB.setter?.isOfficialSetter);
  const totalOfficialSetters = [...allA, ...allB].filter(p => p.isOfficialSetter).length;
  const setterFulfilled = totalOfficialSetters >= 2 ? (hasSetterA && hasSetterB) : true;

  // 2. Regra de Gênero
  const menA = allA.filter(p => !isFemalePlayer(p)).length;
  const menB = allB.filter(p => !isFemalePlayer(p)).length;
  const genderFulfilled = Math.abs(menA - menB) <= 1;

  // 3. Regra de Top 2/4 e Bottom 2/4 (Sobre os 10 jogadores de LINHA)
  const linePlayers = [
    ...(result.teamA.players || []),
    ...(result.teamB.players || [])
  ].filter(Boolean);

  let topBottomFulfilled = true;
  if (linePlayers.length >= 4) {
    const sortedLine = sortLinePlayersBySkills(linePlayers);
    const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
    const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));
    const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
    const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));

    const lineA = result.teamA.players || [];
    const lineB = result.teamB.players || [];

    const t2A = lineA.filter(p => top2Ids.has(p.id)).length;
    const t2B = lineB.filter(p => top2Ids.has(p.id)).length;
    const b2A = lineA.filter(p => bottom2Ids.has(p.id)).length;
    const b2B = lineB.filter(p => bottom2Ids.has(p.id)).length;
    const t4A = lineA.filter(p => top4Ids.has(p.id)).length;
    const t4B = lineB.filter(p => top4Ids.has(p.id)).length;
    const b4A = lineA.filter(p => bottom4Ids.has(p.id)).length;
    const b4B = lineB.filter(p => bottom4Ids.has(p.id)).length;

    topBottomFulfilled =
      t2A === 1 &&
      t2B === 1 &&
      b2A === 1 &&
      b2B === 1 &&
      (linePlayers.length < 10 || (t4A === 2 && t4B === 2 && b4A === 2 && b4B === 2));
  }

  const allFulfilled = setterFulfilled && genderFulfilled && topBottomFulfilled;

  return {
    allFulfilled,
    setter: {
      fulfilled: setterFulfilled,
      description: setterFulfilled ? '1 Levantador Oficial Titular por Equipe' : 'Desbalanceamento de Levantadores',
      badgeLabel: setterFulfilled ? '1A / 1B' : 'Alerta'
    },
    gender: {
      fulfilled: genderFulfilled,
      description: genderFulfilled ? 'Paridade de gênero mantida (±1)' : 'Desequilíbrio de gênero entre equipes',
      badgeLabel: genderFulfilled ? `${menA}H / ${menB}H` : `Alerta (${menA} vs ${menB})`
    },
    topBottom: {
      fulfilled: topBottomFulfilled,
      description: topBottomFulfilled ? 'Top 2/4 e Bottom 2/4 da linha perfeitamente distribuídos' : 'Desbalanceamento de Top/Bottom entre equipes',
      badgeLabel: topBottomFulfilled ? 'Isolados' : 'Desbalanceado'
    }
  };
};

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = getCombinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

export interface BalancingOptimizationResult {
  allCombinations: Array<{
    teamGenerationMode: 'PURE_SKILLS' | 'TRUESKILL';
    balancingRatingMode: 'HYBRID' | 'IC_ONLY';
    balancingStrategy: 'BOTH' | 'BOTTOM_TWO' | 'SYNERGY';
    deltaIC: number;
    teamAIC: number;
    teamBIC: number;
    result: GenerationResult;
  }>;
  bestCombination: {
    teamGenerationMode: 'PURE_SKILLS' | 'TRUESKILL';
    balancingRatingMode: 'HYBRID' | 'IC_ONLY';
    balancingStrategy: 'BOTH' | 'BOTTOM_TWO' | 'SYNERGY';
    useTrueSkill: boolean;
  };
  bestGenerationResult: GenerationResult;
  minDeltaIC: number;
  teamAIC: number;
  teamBIC: number;
}

/**
 * Busca Exaustiva Determinística sobre as 252 formações possíveis dos 10 jogadores de linha (~2ms)
 */
export const findBestBalancingCombination = (
  attendanceList: Player[],
  previousFormations: any[] = [],
  _forceNoTemporarySetters: boolean = false,
  allMatchHistory: any[] = [],
  _randomizeOthers: boolean = false
): BalancingOptimizationResult => {
  // 1. Obter os 12 atletas da partida via Fila Inteligente
  const { topPlayers, remainingPlayers } = getPriorityQueue(attendanceList, 12, 2);

  // 2. Separar os até 2 levantadores titulares; se houver 3º levantador (apenas quando total presente == 12), vai para matchLinePool
  const officialSetters = topPlayers.filter(p => p.isOfficialSetter);
  const linePlayers = topPlayers.filter(p => !p.isOfficialSetter);

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  let matchLinePool = [...linePlayers];

  if (officialSetters.length >= 2) {
    setterA = officialSetters[0];
    setterB = officialSetters[1];
    // Se a fila incluiu um 3º levantador por falta de jogadores de linha no banco, ele atua nos 10 de linha
    if (officialSetters.length > 2) {
      matchLinePool = [...matchLinePool, ...officialSetters.slice(2)];
    }
  } else if (officialSetters.length === 1) {
    setterA = officialSetters[0];
    // Promove o jogador de linha com melhor levantamento para equilibrar como levantador do Time B
    const sortedBySetting = [...matchLinePool].sort(
      (a, b) => (b.skills?.setting || 0) - (a.skills?.setting || 0)
    );
    if (sortedBySetting.length > 0 && !_forceNoTemporarySetters) {
      setterB = sortedBySetting[0];
      matchLinePool = matchLinePool.filter(p => p.id !== setterB!.id);
    }
  } else if (officialSetters.length === 0 && !_forceNoTemporarySetters && matchLinePool.length >= 12) {
    const sortedBySetting = [...matchLinePool].sort(
      (a, b) => (b.skills?.setting || 0) - (a.skills?.setting || 0)
    );
    setterA = sortedBySetting[0];
    setterB = sortedBySetting[1];
    matchLinePool = matchLinePool.filter(p => p.id !== setterA!.id && p.id !== setterB!.id);
  }

  // 3. Ordenar os 10 jogadores de linha por Habilidades Práticas + IC de Linha
  const sortedLine = sortLinePlayersBySkills(matchLinePool);

  const top2 = sortedLine.slice(0, 2);
  const bottom2 = sortedLine.slice(-2);
  const top4 = sortedLine.slice(0, 4);
  const bottom4 = sortedLine.slice(-4);

  const topTwoIds = top2.map(p => p.id);
  const bottomTwoIds = bottom2.map(p => p.id);
  const top4Ids = top4.map(p => p.id);
  const bottom4Ids = bottom4.map(p => p.id);

  // 4. Avaliar todas as combinações possíveis de metade da linha para o Time A
  const targetTeamLineSize = Math.floor(matchLinePool.length / 2);
  const allCombos = getCombinations(matchLinePool, targetTeamLineSize);

  const validFormations: Array<{
    playersA: Player[];
    playersB: Player[];
    deltaIC: number;
    teamAIC: number;
    teamBIC: number;
    cascadeLevel: 'TOP4_BOTTOM4' | 'TOP2_BOTTOM4' | 'TOP2_BOTTOM2';
    impactParityPenalty: number;
    isCounterbalanced: number;
    dnaImbalance: number;
    repeatPenalty: number;
  }> = [];

  const setterMenA = setterA && !isFemalePlayer(setterA) ? 1 : 0;
  const setterMenB = setterB && !isFemalePlayer(setterB) ? 1 : 0;

  for (const comboA of allCombos) {
    const setAIds = new Set(comboA.map(p => p.id));
    const comboB = matchLinePool.filter(p => !setAIds.has(p.id));

    // Regra 1: Paridade de gênero (diferença máxima de ±1 homem entre os times completos)
    const menA = setterMenA + comboA.filter(p => !isFemalePlayer(p)).length;
    const menB = setterMenB + comboB.filter(p => !isFemalePlayer(p)).length;
    if (Math.abs(menA - menB) > 1) continue;

    // Regra 2: Soberania de Top 2 e Bottom 2 (1 em cada equipe)
    const t2A = comboA.filter(p => topTwoIds.includes(p.id)).length;
    const b2A = comboA.filter(p => bottomTwoIds.includes(p.id)).length;
    if (t2A !== 1 || b2A !== 1) continue;

    // Regra 3: Paridade estrita Top 4 e Bottom 4 (2 em cada time quando há 10 jogadores de linha)
    const t4A = comboA.filter(p => top4Ids.includes(p.id)).length;
    const b4A = comboA.filter(p => bottom4Ids.includes(p.id)).length;
    if (matchLinePool.length >= 10) {
      if (t4A !== 2 || b4A !== 2) continue;
    }

    let cascadeLevel: 'TOP4_BOTTOM4' | 'TOP2_BOTTOM4' | 'TOP2_BOTTOM2' = 'TOP2_BOTTOM2';
    if (t4A === 2 && b4A === 2) {
      cascadeLevel = 'TOP4_BOTTOM4';
    } else if (b4A === 2) {
      cascadeLevel = 'TOP2_BOTTOM4';
    }

    const tAIC = calculateTeamTotalIC({ setter: setterA, players: comboA });
    const tBIC = calculateTeamTotalIC({ setter: setterB, players: comboB });
    const deltaIC = Number(Math.abs(tAIC - tBIC).toFixed(1));

    const elitesA = comboA.filter(p => p.impactLevel === 3).length + (setterA?.impactLevel === 3 ? 1 : 0);
    const elitesB = comboB.filter(p => p.impactLevel === 3).length + (setterB?.impactLevel === 3 ? 1 : 0);
    const eliteParityDiff = Math.abs(elitesA - elitesB);

    const basesA = comboA.filter(p => p.impactLevel === 1).length + (setterA?.impactLevel === 1 ? 1 : 0);
    const basesB = comboB.filter(p => p.impactLevel === 1).length + (setterB?.impactLevel === 1 ? 1 : 0);
    const baseParityDiff = Math.abs(basesA - basesB);

    const isCounterbalanced =
      (elitesA > elitesB && basesA >= basesB) ||
      (elitesB > elitesA && basesB >= basesA) ||
      (elitesA === elitesB && basesA === basesB);
    const impactParityPenalty = Math.max(0, eliteParityDiff - 1) + Math.max(0, baseParityDiff - 1);

    const dnaImbalance = calculateTacticalDnaImbalance(comboA, comboB);
    const repeatPenalty = calculateSameSideRepeatPenalty(comboA, comboB, previousFormations);

    validFormations.push({
      playersA: comboA,
      playersB: comboB,
      deltaIC,
      teamAIC: tAIC,
      teamBIC: tBIC,
      cascadeLevel,
      impactParityPenalty,
      isCounterbalanced: isCounterbalanced ? 1 : 0,
      dnaImbalance,
      repeatPenalty
    });
  }

  // Ordenação multicritério soberana:
  // 1. Nível de Cascata (TOP4_BOTTOM4)
  // 2. Paridade de Impacto (Elite/Base <= 1)
  // 3. Contrapeso inteligente
  // 4. Menor repetição idêntica à partida anterior
  // 5. Menor diferença de IC (deltaIC)
  // 6. Melhor equilíbrio de DNA Tático (Ataque vs Defesa)
  validFormations.sort((a, b) => {
    const rank = { TOP4_BOTTOM4: 3, TOP2_BOTTOM4: 2, TOP2_BOTTOM2: 1 };
    if (rank[b.cascadeLevel] !== rank[a.cascadeLevel]) {
      return rank[b.cascadeLevel] - rank[a.cascadeLevel];
    }
    if (a.impactParityPenalty !== b.impactParityPenalty) {
      return a.impactParityPenalty - b.impactParityPenalty;
    }
    if (b.isCounterbalanced !== a.isCounterbalanced) {
      return b.isCounterbalanced - a.isCounterbalanced;
    }
    if (a.repeatPenalty !== b.repeatPenalty) {
      return a.repeatPenalty - b.repeatPenalty;
    }
    if (Math.abs(a.deltaIC - b.deltaIC) > 0.3) {
      return a.deltaIC - b.deltaIC;
    }
    return a.dnaImbalance - b.dnaImbalance;
  });

  let candidatePool = validFormations.slice(0, 30);
  if (candidatePool.length === 0) {
    // Fallback distribuindo intercalado ABAB por ordem de habilidade (nunca slice(0,5) vs slice(5)!)
    const fallbackA: Player[] = [];
    const fallbackB: Player[] = [];
    sortedLine.forEach((p, idx) => {
      if (idx % 4 === 0 || idx % 4 === 3) {
        if (fallbackA.length < targetTeamLineSize) fallbackA.push(p);
        else fallbackB.push(p);
      } else {
        if (fallbackB.length < matchLinePool.length - targetTeamLineSize) fallbackB.push(p);
        else fallbackA.push(p);
      }
    });
    const tAIC = calculateTeamTotalIC({ setter: setterA, players: fallbackA });
    const tBIC = calculateTeamTotalIC({ setter: setterB, players: fallbackB });
    candidatePool = [{
      playersA: fallbackA,
      playersB: fallbackB,
      deltaIC: Number(Math.abs(tAIC - tBIC).toFixed(1)),
      teamAIC: tAIC,
      teamBIC: tBIC,
      cascadeLevel: 'TOP2_BOTTOM2',
      impactParityPenalty: 0,
      isCounterbalanced: 1,
      dnaImbalance: 0,
      repeatPenalty: 0
    }];
  }

  const combinationsList = candidatePool.map(form => {
    const genResult: GenerationResult = {
      teamA: {
        setter: setterA,
        players: form.playersA,
        totalIC: form.teamAIC
      },
      teamB: {
        setter: setterB,
        players: form.playersB,
        totalIC: form.teamBIC
      },
      remainingPlayers,
      topTwoIds,
      bottomTwoIds,
      techTierIds: {
        top4Ids,
        bottom4Ids,
        cascadeLevel: form.cascadeLevel
      },
      appliedCascadeLevel: form.cascadeLevel,
      combinationsCount: candidatePool.length,
      balancingStrategy: 'BOTH',
      balancingRatingMode: 'IC_ONLY',
      teamGenerationMode: 'PURE_SKILLS'
    };

    return {
      teamGenerationMode: 'PURE_SKILLS' as const,
      balancingRatingMode: 'IC_ONLY' as const,
      balancingStrategy: 'BOTH' as const,
      deltaIC: form.deltaIC,
      teamAIC: form.teamAIC,
      teamBIC: form.teamBIC,
      result: genResult
    };
  });

  const best = combinationsList[0];
  const autoCorrected = autoFixAllInconsistencies(best.result, attendanceList, allMatchHistory);

  return {
    allCombinations: combinationsList,
    bestCombination: {
      teamGenerationMode: 'PURE_SKILLS',
      balancingRatingMode: 'IC_ONLY',
      balancingStrategy: 'BOTH',
      useTrueSkill: false
    },
    bestGenerationResult: autoCorrected,
    minDeltaIC: Number(Math.abs((autoCorrected.teamA?.totalIC || 0) - (autoCorrected.teamB?.totalIC || 0)).toFixed(1)),
    teamAIC: autoCorrected.teamA?.totalIC || best.teamAIC,
    teamBIC: autoCorrected.teamB?.totalIC || best.teamBIC
  };
};

export function generateTeams(
  attendanceList: Player[],
  previousFormations: any[] = [],
  _useTrueSkill: boolean = false,
  forceNoTemporarySetters: boolean = false,
  allMatchHistory: any[] = [],
  _balancingStrategy: string = 'BOTH',
  _balancingRatingMode: string = 'IC_ONLY'
): GenerationResult {
  const optResult = findBestBalancingCombination(
    attendanceList,
    previousFormations,
    forceNoTemporarySetters,
    allMatchHistory,
    false
  );
  const bestRes = optResult.bestGenerationResult;
  const verifiedAndFixed = autoFixAllInconsistencies(bestRes, attendanceList, allMatchHistory);
  const toleranceValidation = validateTopBottomTolerance(verifiedAndFixed);

  return {
    ...verifiedAndFixed,
    topBottomValidation: toleranceValidation,
    diffTop: toleranceValidation.diffTop,
    diffBottom: toleranceValidation.diffBottom
  };
}

export const runAutoCorrectionAgent = (result: GenerationResult): GenerationResult => {
  if (!result || !result.teamA || !result.teamB) return result;
  
  const linePlayers = [
    ...(result.teamA.players || []),
    ...(result.teamB.players || [])
  ].filter(Boolean);
  
  if (linePlayers.length < 4) return result;

  const sortedLine = sortLinePlayersBySkills(linePlayers);

  const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
  const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));
  const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
  const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));

  let playersA = [...(result.teamA.players || [])];
  let playersB = [...(result.teamB.players || [])];

  const countTop4 = (arr: Player[]) => arr.filter(p => top4Ids.has(p.id)).length;
  const countBottom4 = (arr: Player[]) => arr.filter(p => bottom4Ids.has(p.id)).length;
  const countTop2 = (arr: Player[]) => arr.filter(p => top2Ids.has(p.id)).length;
  const countBottom2 = (arr: Player[]) => arr.filter(p => bottom2Ids.has(p.id)).length;

  for (let iter = 0; iter < 5; iter++) {
    const diffTop4 = Math.abs(countTop4(playersA) - countTop4(playersB));
    const diffBottom4 = Math.abs(countBottom4(playersA) - countBottom4(playersB));
    const diffTop2 = Math.abs(countTop2(playersA) - countTop2(playersB));
    const diffBottom2 = Math.abs(countBottom2(playersA) - countBottom2(playersB));

    if (diffTop4 <= 1 && diffBottom4 <= 1 && diffTop2 <= 1 && diffBottom2 <= 1) {
      break;
    }

    let swapped = false;
    for (let i = 0; i < playersA.length; i++) {
      for (let j = 0; j < playersB.length; j++) {
        const pA = playersA[i];
        const pB = playersB[j];
        if (!pA || !pB) continue;
        if (isFemalePlayer(pA) !== isFemalePlayer(pB)) continue;

        const nextA = [...playersA];
        const nextB = [...playersB];
        nextA[i] = pB;
        nextB[j] = pA;

        const nextDiffTop4 = Math.abs(countTop4(nextA) - countTop4(nextB));
        const nextDiffBottom4 = Math.abs(countBottom4(nextA) - countBottom4(nextB));
        const nextDiffTop2 = Math.abs(countTop2(nextA) - countTop2(nextB));
        const nextDiffBottom2 = Math.abs(countBottom2(nextA) - countBottom2(nextB));

        const currentMaxDiff = Math.max(diffTop4, diffBottom4, diffTop2, diffBottom2);
        const nextMaxDiff = Math.max(nextDiffTop4, nextDiffBottom4, nextDiffTop2, nextDiffBottom2);

        if (nextMaxDiff < currentMaxDiff) {
          playersA = nextA;
          playersB = nextB;
          swapped = true;
          break;
        }
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }

  const teamAIC = calculateTeamTotalIC({ setter: result.teamA.setter, players: playersA });
  const teamBIC = calculateTeamTotalIC({ setter: result.teamB.setter, players: playersB });

  const correctedResult = {
    ...result,
    teamA: {
      ...result.teamA,
      players: playersA,
      totalIC: teamAIC
    },
    teamB: {
      ...result.teamB,
      players: playersB,
      totalIC: teamBIC
    }
  };

  const toleranceValidation = validateTopBottomTolerance(correctedResult);
  return {
    ...correctedResult,
    topBottomValidation: toleranceValidation,
    diffTop: toleranceValidation.diffTop,
    diffBottom: toleranceValidation.diffBottom
  };
};

export const runCriticalSynergySolverAgent = (result: GenerationResult, ..._args: any[]): any => ({
  ...result,
  updatedResult: result,
  resolvedPairsCount: 0
});

export const autoFixAllInconsistencies = (
  res: any,
  attendance: Player[] = [],
  _allMatchHistory: any[] = []
): GenerationResult => {
  if (!res || !res.teamA || !res.teamB) return res;

  let currentRes: GenerationResult = {
    ...res,
    teamA: {
      ...res.teamA,
      players: [...(res.teamA.players || [])]
    },
    teamB: {
      ...res.teamB,
      players: [...(res.teamB.players || [])]
    },
    remainingPlayers: [...(res.remainingPlayers || [])]
  };

  const rules = verifyClubGenerationRules(currentRes);
  if (rules.allFulfilled) return currentRes;

  let teamA = currentRes.teamA;
  let teamB = currentRes.teamB;
  let remainingPlayers = currentRes.remainingPlayers || [];

  if (remainingPlayers.length === 0 && attendance && attendance.length > 0) {
    const onCourtIds = new Set([
      teamA.setter?.id,
      ...(teamA.players || []).map(p => p.id),
      teamB.setter?.id,
      ...(teamB.players || []).map(p => p.id)
    ].filter(Boolean));
    remainingPlayers = attendance.filter(p => {
      const status = p.status || 'active';
      const isDM = Boolean(p.isDM || status === 'dm');
      return status === 'active' && !isDM && !onCourtIds.has(p.id);
    });
  }

  // 1. Se houver jogador de linha no banco (remainingPlayers) e um 3º levantador oficial caiu na linha,
  // substitui o 3º levantador pelo jogador de linha do banco!
  const replaceExtraSetterWithBenchLine = (team: Team) => {
    if (!team.setter?.isOfficialSetter) return;
    const extraSetterIdx = team.players.findIndex(p => p && p.isOfficialSetter);
    if (extraSetterIdx === -1) return;

    const extraSetter = team.players[extraSetterIdx];
    const isFemale = isFemalePlayer(extraSetter);

    // Procura reserva de linha do mesmo gênero, ou qualquer reserva de linha
    let benchIdx = remainingPlayers.findIndex(p => p && !p.isOfficialSetter && isFemalePlayer(p) === isFemale);
    if (benchIdx === -1) {
      benchIdx = remainingPlayers.findIndex(p => p && !p.isOfficialSetter);
    }

    if (benchIdx !== -1) {
      const replacement = remainingPlayers[benchIdx];
      team.players[extraSetterIdx] = replacement;
      remainingPlayers[benchIdx] = extraSetter;
    }
  };

  replaceExtraSetterWithBenchLine(teamA);
  replaceExtraSetterWithBenchLine(teamB);

  // 2. Correção de Gênero (|menA - menB| <= 1)
  const getMenCount = (team: any) => [team.setter, ...(team.players || [])].filter(p => p && !isFemalePlayer(p)).length;
  const menA = getMenCount(teamA);
  const menB = getMenCount(teamB);

  if (Math.abs(menA - menB) > 1) {
    const moreMenTeam = menA > menB ? 'A' : 'B';
    const sourcePlayers = moreMenTeam === 'A' ? teamA.players : teamB.players;
    const targetPlayers = moreMenTeam === 'A' ? teamB.players : teamA.players;

    const maleIdx = sourcePlayers.findIndex(p => p && !isFemalePlayer(p) && !p.isOfficialSetter);
    const femaleIdx = targetPlayers.findIndex(p => p && isFemalePlayer(p) && !p.isOfficialSetter);

    if (maleIdx !== -1 && femaleIdx !== -1) {
      const malePlayer = sourcePlayers[maleIdx];
      const femalePlayer = targetPlayers[femaleIdx];
      sourcePlayers[maleIdx] = femalePlayer;
      targetPlayers[femaleIdx] = malePlayer;
    }
  }

  teamA.totalIC = calculateTeamTotalIC(teamA);
  teamB.totalIC = calculateTeamTotalIC(teamB);

  currentRes = {
    ...currentRes,
    teamA,
    teamB,
    remainingPlayers
  };

  return runAutoCorrectionAgent(currentRes);
};

export const optimizeTeamSynergyIteratively = (res: any, ..._args: any[]): any => res;
export const generateTournamentTeams = (_list: Player[], _numTeams: number = 2, ..._args: any[]): any => ({ teams: [], reserves: [] });

export interface TopBottomValidationResult {
  isValid: boolean;
  diffTop: number;
  diffBottom: number;
  message: string;
}

export const validateTopBottomTolerance = (result: GenerationResult): TopBottomValidationResult => {
  if (!result || !result.teamA || !result.teamB) {
    return { isValid: false, diffTop: 99, diffBottom: 99, message: "Times não gerados" };
  }
  const linePlayers = [
    ...(result.teamA.players || []),
    ...(result.teamB.players || [])
  ].filter(Boolean);

  if (linePlayers.length < 4) {
    return { isValid: true, diffTop: 0, diffBottom: 0, message: "Jogadores insuficientes para rigor de Top/Bottom" };
  }

  const sortedLine = sortLinePlayersBySkills(linePlayers);
  const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
  const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));
  const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
  const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));

  const lineA = result.teamA.players || [];
  const lineB = result.teamB.players || [];

  const t2A = lineA.filter(p => top2Ids.has(p.id)).length;
  const t2B = lineB.filter(p => top2Ids.has(p.id)).length;
  const b2A = lineA.filter(p => bottom2Ids.has(p.id)).length;
  const b2B = lineB.filter(p => bottom2Ids.has(p.id)).length;
  const t4A = lineA.filter(p => top4Ids.has(p.id)).length;
  const t4B = lineB.filter(p => top4Ids.has(p.id)).length;
  const b4A = lineA.filter(p => bottom4Ids.has(p.id)).length;
  const b4B = lineB.filter(p => bottom4Ids.has(p.id)).length;

  const diffTop2 = Math.abs(t2A - t2B);
  const diffBottom2 = Math.abs(b2A - b2B);
  const diffTop4 = Math.abs(t4A - t4B);
  const diffBottom4 = Math.abs(b4A - b4B);
  const diffTop = Math.max(diffTop2, diffTop4);
  const diffBottom = Math.max(diffBottom2, diffBottom4);
  const isValid = diffTop2 <= 1 && diffBottom2 <= 1 && diffTop4 <= 1 && diffBottom4 <= 1;

  return {
    isValid,
    diffTop,
    diffBottom,
    message: isValid 
      ? "Equilíbrio Validado: Distribuição dentro da tolerância (dif <= 1)" 
      : `Desequilíbrio: Top diff=${diffTop}, Bottom diff=${diffBottom}`
  };
};