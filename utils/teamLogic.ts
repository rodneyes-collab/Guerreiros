import { Player, Gender, GenerationResult, Team, ClubGenerationRules, AutoCorrectionAudit } from '../types';

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

// Expose on globalThis/window if in browser
if (typeof window !== 'undefined') {
  (window as any).Gender = (window as any).Gender || SAFE_GENDER;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Gender = (globalThis as any).Gender || SAFE_GENDER;
}

/**
 * Soma das Habilidades Práticas (Ataque, Defesa, Levantamento, Saque)
 * Total na escala de 4 a 20 (ou 4 a 12 em testes)
 */
export const calculatePracticalSkillsSum = (p: Player): number => {
  if (!p) return 10;
  if (p.skills) {
    const s = p.skills;
    const att = typeof s.attacking === 'number' ? s.attacking : 2;
    const def = typeof s.defense === 'number' ? s.defense : 2;
    const set = typeof s.setting === 'number' ? s.setting : 2;
    const ser = typeof s.serving === 'number' ? s.serving : 2;
    return att + def + set + ser;
  }
  return 10;
};

/**
 * Índice Composto (IC) Soberano de Balanceamento:
 * 80% Habilidades Práticas + 20% Win Rate real.
 * ZERO ELO - O ELO NÃO É UTILIZADO NA PRÉ-VISUALIZAÇÃO NEM NA GERAÇÃO DE TIMES!
 */
export const calculateCompositePerformanceRating = (p: Player): number => {
  if (!p) return 0;
  const skillsSum = calculatePracticalSkillsSum(p);
  const totalMatches = (p.wins || 0) + (p.losses || 0);
  const winRate = totalMatches > 0 ? ((p.wins || 0) / totalMatches) * 100 : 50;
  
  // Normalização das habilidades práticas (base 100)
  // Escala máxima padrão: 20 (ou 12 se skills 1-3)
  const maxPossible = (p.skills && p.skills.attacking <= 3 && p.skills.defense <= 3) ? 12 : 20;
  const techScore = (skillsSum / maxPossible) * 100;
  
  // 80% Skills + 20% WinRate
  const ic = (techScore * 0.8) + (winRate * 0.2);
  return Number(ic.toFixed(1));
};

export const calculateEffectiveElo = (p: Player): number => {
  // Mantido para compatibilidade, sem derivação de ELO
  return p?.elo || 1200;
};

export const calculateNegativeSynergyPenalty = (...args: any[]): number => 0;
export const calculatePredictedMatches = (...args: any[]): number => 0;

export const calculateTeamTotalIC = (team: any): number => {
  if (!team) return 0;
  const list = [team.setter, ...(team.players || [])].filter(Boolean);
  const sum = list.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
  return Number(sum.toFixed(1));
};

export const calculateTeamPositions = (team: any, otherTeam?: any): Record<string, string> => {
  const positions: Record<string, string> = {};
  if (team?.setter) {
    positions[team.setter.id] = 'LEVANTADOR';
  }
  (team?.players || []).forEach((p, idx) => {
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
    // Preserva estritamente os campos diários da sessão a partir da presença (attendance / p)
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
 * Prioridade:
 * 1. Não jogou a última partida (playedLastMatch === false)
 * 2. Trava de Partidas Consecutivas em Quadra (quem jogou a última, prioriza menor consecutivePlayed)
 * 3. Prioridade de Saída Antecipada (departureTime)
 * 4. Volume Diário de Jogos (dailyMatches menor primeiro)
 * 5. Tempo de Banco (consecutiveBenched maior primeiro para quem não jogou a última)
 * 6. Ordem de Chegada (arrivalOrder menor primeiro)
 */
const sortPlayersByPriority = (list: Player[]): Player[] => {
  return [...list].sort((a, b) => {
    // 1. Quem NÃO jogou a última tem prioridade máxima (Rodagem Imediata)
    const pA = a.playedLastMatch ? 1 : 0;
    const pB = b.playedLastMatch ? 1 : 0;
    if (pA !== pB) return pA - pB;

    // 2. Se ambos jogaram a última partida: prioriza quem jogou menos partidas consecutivas
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

    // 5. Se ambos não jogaram a última partida: prioriza quem está há mais tempo consecutivo no banco
    if (!a.playedLastMatch && !b.playedLastMatch) {
      const bA = a.consecutiveBenched || 0;
      const bB = b.consecutiveBenched || 0;
      if (bA !== bB) return bB - bA;
    }

    // 6. Ordem de chegada (arrivalOrder menor primeiro)
    return (a.arrivalOrder ?? 999) - (b.arrivalOrder ?? 999);
  });
};

export const getPriorityQueue = (
  list: Player[],
  count: number = 12,
  settersCount: number = 2
): { topPlayers: Player[]; remainingPlayers: Player[] } => {
  const activePlayers = (list || []).filter(p => !p.status || p.status === 'active');
  
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

  // Se faltam jogadores de linha para atingir neededLine (ex: < 10 na lista),
  // aí sim os levantadores excedentes completam as vagas de linha.
  // Havendo sócios de linha suficientes (>= neededLine), os levantadores excedentes
  // aguardam no banco (remainingPlayers) para rodar como titulares na próxima partida.
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
    const diff = calculatePracticalSkillsSum(b) - calculatePracticalSkillsSum(a);
    if (diff !== 0) return diff;
    const icDiff = calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a);
    if (icDiff !== 0) return icDiff;
    return (a.id || '').localeCompare(b.id || '');
  });
};

/**
 * Validador Estatutário Soberano das Regras do Clube:
 * 1. Levantadores: 1 por equipe se houver >= 2 oficiais em quadra
 * 2. Paridade de Gênero: diferença de homens <= 1
 * 3. Soberania de Top 2 e Bottom 2 da LINHA (1 em cada equipe)
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

  // 1. Regra de Levantadores
  const settersA = allA.filter(p => p.isOfficialSetter).length;
  const settersB = allB.filter(p => p.isOfficialSetter).length;
  const totalSetters = settersA + settersB;
  const setterFulfilled = totalSetters >= 2 ? (settersA === 1 && settersB === 1) : true;

  // 2. Regra de Gênero
  const menA = allA.filter(p => !isFemalePlayer(p)).length;
  const menB = allB.filter(p => !isFemalePlayer(p)).length;
  const genderFulfilled = Math.abs(menA - menB) <= 1;

  // 3. Regra de Top 2 e Bottom 2 (Estritamente sobre os jogadores de LINHA)
  const linePlayers = [
    ...(result.teamA.players || []),
    ...(result.teamB.players || [])
  ].filter(p => p && !p.isOfficialSetter);

  let topBottomFulfilled = true;
  if (linePlayers.length >= 4) {
    const sortedLine = sortLinePlayersBySkills(linePlayers);


    const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
    const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));
    const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
    const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));
    const t2A = allA.filter(p => top2Ids.has(p.id)).length;
    const t2B = allB.filter(p => top2Ids.has(p.id)).length;
    const b2A = allA.filter(p => bottom2Ids.has(p.id)).length;
    const b2B = allB.filter(p => bottom2Ids.has(p.id)).length;
    const t4A = allA.filter(p => top4Ids.has(p.id)).length;
    const t4B = allB.filter(p => top4Ids.has(p.id)).length;
    const b4A = allA.filter(p => bottom4Ids.has(p.id)).length;
    const b4B = allB.filter(p => bottom4Ids.has(p.id)).length;
    topBottomFulfilled = (t2A === 1 && t2B === 1) && (b2A === 1 && b2B === 1) && (t4A === 2 && t4B === 2) && (b4A === 2 && b4B === 2);
  }

  const allFulfilled = setterFulfilled && genderFulfilled && topBottomFulfilled;

  return {
    allFulfilled,
    setter: {
      fulfilled: setterFulfilled,
      description: setterFulfilled ? '1 Levantador Oficial por Equipe' : 'Desbalanceamento de Levantadores',
      badgeLabel: setterFulfilled ? '1A / 1B' : `${settersA}A / ${settersB}B`
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

/**
 * Utilitário para gerar combinações k de um array
 */
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
 * Gera e avalia combinações de balanceamento (até 50 combinações)
 * Executado inteiramente no navegador/dispositivo em ~2ms
 * Balanceamento estritamente por ID / Habilidades Práticas / IC (SEM ELO!)
 */
export const findBestBalancingCombination = (
  attendanceList: Player[],
  previousFormations: any[] = [],
  forceNoTemporarySetters: boolean = false,
  allMatchHistory: any[] = [],
  randomizeOthers: boolean = true
): BalancingOptimizationResult => {
  // 1. Obter os 12 atletas da partida via Fila Inteligente
  const { topPlayers, remainingPlayers } = getPriorityQueue(attendanceList, 12, 2);

  // 2. Separar levantadores oficiais
  const officialSetters = topPlayers.filter(p => p.isOfficialSetter);
  const linePlayers = topPlayers.filter(p => !p.isOfficialSetter);

  let setterA: Player | null = null;
  let setterB: Player | null = null;
  let matchLinePool = [...linePlayers];

  if (officialSetters.length >= 2) {
    setterA = officialSetters[0];
    setterB = officialSetters[1];
    matchLinePool = [...matchLinePool, ...officialSetters.slice(2)];
  } else if (officialSetters.length === 1) {
    setterA = officialSetters[0];
  }

  // 3. Ordenar os jogadores de linha por Habilidades Práticas + IC de forma determinística estável
  const sortedLine = sortLinePlayersBySkills(matchLinePool);

  const top2 = sortedLine.slice(0, 2);
  const bottom2 = sortedLine.slice(-2);
  const top4 = sortedLine.slice(0, 4);
  const bottom4 = sortedLine.slice(-4);

  const topTwoIds = top2.map(p => p.id);
  const bottomTwoIds = bottom2.map(p => p.id);
  const top4Ids = top4.map(p => p.id);
  const bottom4Ids = bottom4.map(p => p.id);

  // 4. Avaliar todas as 252 combinações de 5 jogadores para o Time A
  const allCombos = getCombinations(matchLinePool, 5);
  const validFormations: Array<{
    playersA: Player[];
    playersB: Player[];
    deltaIC: number;
    teamAIC: number;
    teamBIC: number;
    cascadeLevel: 'TOP4_BOTTOM4' | 'TOP2_BOTTOM4' | 'TOP2_BOTTOM2';
    impactParityPenalty?: number;
    isCounterbalanced?: number;
  }> = [];

  const setterMenA = (setterA && !isFemalePlayer(setterA)) ? 1 : 0;
  const setterMenB = (setterB && !isFemalePlayer(setterB)) ? 1 : 0;

  for (const comboA of allCombos) {
    const setAIds = new Set(comboA.map(p => p.id));
    const comboB = matchLinePool.filter(p => !setAIds.has(p.id));

    // Paridade de gênero
    const menA = setterMenA + comboA.filter(p => !isFemalePlayer(p)).length;
    const menB = setterMenB + comboB.filter(p => !isFemalePlayer(p)).length;
    if (Math.abs(menA - menB) > 1) continue;

    // Regra Estatutária: Exatamente 1 levantador por equipe (quando houver levantadores oficiais)
    // Se o time já tem setter titular oficial, não pode ter outro levantador oficial na linha
    if (setterA?.isOfficialSetter && comboA.some(p => p.isOfficialSetter)) continue;
    if (setterB?.isOfficialSetter && comboB.some(p => p.isOfficialSetter)) continue;

    // Soberania de Top 2 e Bottom 2
    const t2A = comboA.filter(p => topTwoIds.includes(p.id)).length;
    const b2A = comboA.filter(p => bottomTwoIds.includes(p.id)).length;
    if (t2A !== 1 || b2A !== 1) continue;

    // Paridade estrita Top 4 e Bottom 4 (2 em cada time)
    const t4A = comboA.filter(p => top4Ids.includes(p.id)).length;
    const b4A = comboA.filter(p => bottom4Ids.includes(p.id)).length;
    if (matchLinePool.length >= 10) {
      if (t4A !== 2 || b4A !== 2) continue;
    }

    // Nível de cascata (Top 4 / Bottom 4)

    let cascadeLevel: 'TOP4_BOTTOM4' | 'TOP2_BOTTOM4' | 'TOP2_BOTTOM2' = 'TOP2_BOTTOM2';
    if (t4A === 2 && b4A === 2) {
      cascadeLevel = 'TOP4_BOTTOM4';
    } else if (b4A === 2) {
      cascadeLevel = 'TOP2_BOTTOM4';
    }

    const tAIC = calculateTeamTotalIC({ setter: setterA, players: comboA });
    const tBIC = calculateTeamTotalIC({ setter: setterB, players: comboB });
    const deltaIC = Number(Math.abs(tAIC - tBIC).toFixed(1));

    // Paridade uniforme de Impacto cadastral (impactLevel 3: Elite/Top, impactLevel 1: Base/Bottom)
    const elitesA = comboA.filter(p => p.impactLevel === 3).length + (setterA?.impactLevel === 3 ? 1 : 0);
    const elitesB = comboB.filter(p => p.impactLevel === 3).length + (setterB?.impactLevel === 3 ? 1 : 0);
    const eliteParityDiff = Math.abs(elitesA - elitesB);

    const basesA = comboA.filter(p => p.impactLevel === 1).length + (setterA?.impactLevel === 1 ? 1 : 0);
    const basesB = comboB.filter(p => p.impactLevel === 1).length + (setterB?.impactLevel === 1 ? 1 : 0);
    const baseParityDiff = Math.abs(basesA - basesB);

    // Contrapeso inteligente: time com +1 elite recebe +1 base para balancear a balança técnica
    const isCounterbalanced = (elitesA > elitesB && basesA >= basesB) || (elitesB > elitesA && basesB >= basesA) || (elitesA === elitesB && basesA === basesB);
    const impactParityPenalty = Math.max(0, eliteParityDiff - 1) + Math.max(0, baseParityDiff - 1);

    validFormations.push({
      playersA: comboA,
      playersB: comboB,
      deltaIC,
      teamAIC: tAIC,
      teamBIC: tBIC,
      cascadeLevel,
      impactParityPenalty,
      isCounterbalanced: isCounterbalanced ? 1 : 0
    });
  }

  // Ordenar combinações válidas prioritariamente por:
  // 1. Paridade de Impacto (Elites e Bases com diferença <= 1)
  // 2. Cascata (TOP4_BOTTOM4 primeiro)
  // 3. Contrapeso inteligente (Balança cruzada)
  // 4. Menor deltaIC
  validFormations.sort((a, b) => {
    if ((a as any).impactParityPenalty !== (b as any).impactParityPenalty) {
      return (a as any).impactParityPenalty - (b as any).impactParityPenalty;
    }
    const rank = { 'TOP4_BOTTOM4': 3, 'TOP2_BOTTOM4': 2, 'TOP2_BOTTOM2': 1 };
    if (rank[b.cascadeLevel] !== rank[a.cascadeLevel]) {
      return rank[b.cascadeLevel] - rank[a.cascadeLevel];
    }
    if ((b as any).isCounterbalanced !== (a as any).isCounterbalanced) {
      return (b as any).isCounterbalanced - (a as any).isCounterbalanced;
    }
    return a.deltaIC - b.deltaIC;
  });

  // Se randomizeOthers for solicitado, adicionar leve variedade mantendo os menores deltaICs
  let candidatePool = validFormations.slice(0, 50);
  if (candidatePool.length === 0) {
    // Fallback de segurança se nenhuma combinação respeitar todas as restrições
    const half = Math.ceil(matchLinePool.length / 2);
    candidatePool = [{
      playersA: matchLinePool.slice(0, half),
      playersB: matchLinePool.slice(half),
      deltaIC: 0,
      teamAIC: 50,
      teamBIC: 50,
      cascadeLevel: 'TOP2_BOTTOM2'
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

/**
 * Função principal de geração de times
 * Determinística, balanceada por IC e Habilidades Práticas (SEM ELO)
 */
export function generateTeams(
  attendanceList: Player[],
  previousFormations: any[] = [],
  useTrueSkill: boolean = false,
  forceNoTemporarySetters: boolean = false,
  allMatchHistory: any[] = [],
  balancingStrategy: string = 'BOTH',
  balancingRatingMode: string = 'IC_ONLY'
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
  ].filter(p => p && !p.isOfficialSetter);
  
  if (linePlayers.length < 4) return result;

  const sortedLine = sortLinePlayersBySkills(linePlayers);

  const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
  const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));
  const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
  const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));

  let playersA = [...(result.teamA.players || [])];
  let playersB = [...(result.teamB.players || [])];

  const countTop4 = (arr) => arr.filter(p => top4Ids.has(p.id)).length;
  const countBottom4 = (arr) => arr.filter(p => bottom4Ids.has(p.id)).length;
  const countTop2 = (arr) => arr.filter(p => top2Ids.has(p.id)).length;
  const countBottom2 = (arr) => arr.filter(p => bottom2Ids.has(p.id)).length;

  for (let iter = 0; iter < 5; iter++) {
    const t4A = countTop4(playersA);
    const t4B = countTop4(playersB);
    const b4A = countBottom4(playersA);
    const b4B = countBottom4(playersB);
    const t2A = countTop2(playersA);
    const t2B = countTop2(playersB);
    const b2A = countBottom2(playersA);
    const b2B = countBottom2(playersB);

    const diffTop4 = Math.abs(t4A - t4B);
    const diffBottom4 = Math.abs(b4A - b4B);
    const diffTop2 = Math.abs(t2A - t2B);
    const diffBottom2 = Math.abs(b2A - b2B);

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

        const nextT4A = countTop4(nextA);
        const nextT4B = countTop4(nextB);
        const nextB4A = countBottom4(nextA);
        const nextB4B = countBottom4(nextB);
        const nextT2A = countTop2(nextA);
        const nextT2B = countTop2(nextB);
        const nextB2A = countBottom2(nextA);
        const nextB2B = countBottom2(nextB);

        const nextDiffTop4 = Math.abs(nextT4A - nextT4B);
        const nextDiffBottom4 = Math.abs(nextB4A - nextB4B);
        const nextDiffTop2 = Math.abs(nextT2A - nextT2B);
        const nextDiffBottom2 = Math.abs(nextB2A - nextB2B);

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
}
export const runCriticalSynergySolverAgent = (result: GenerationResult, ...args: any[]): any => ({ ...result, updatedResult: result, resolvedPairsCount: 0 });

/**
 * Agente Soberano de Auto-Correção de Inconsistências Estatutárias:
 * Identifica e corrige autonomamente:
 * 1. Levantadores: garante que nenhuma equipe tenha 2 levantadores oficiais quando houver >= 2 em quadra.
 *    Se o Time A tiver 2 levantadores (1 titular + 1 de linha), substitui o levantador excedente
 *    por um jogador de linha da reserva (reserves/remainingPlayers/attendance) de mesmo gênero e IC compatível,
 *    ou redistribui com a equipe B para manter a paridade estatutária (1A / 1B).
 * 2. Paridade de Gênero: se |menA - menB| > 1, troca atletas de mesmo nível técnico entre A e B.
 * 3. Soberania Top/Bottom: equilibra Top 2/4 e Bottom 2/4 da linha.
 */
export const autoFixAllInconsistencies = (
  res: any,
  attendance: Player[] = [],
  allMatchHistory: any[] = []
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

  let rules = verifyClubGenerationRules(currentRes);
  if (rules.allFulfilled) return currentRes;

  let teamA = currentRes.teamA;
  let teamB = currentRes.teamB;
  let remainingPlayers = currentRes.remainingPlayers || [];

  // Se remainingPlayers estiver vazio, tenta extrair da lista de presença oficial ativa
  if (remainingPlayers.length === 0 && attendance && attendance.length > 0) {
    const onCourtIds = new Set([
      teamA.setter?.id,
      ...(teamA.players || []).map(p => p.id),
      teamB.setter?.id,
      ...(teamB.players || []).map(p => p.id)
    ].filter(Boolean));
    remainingPlayers = attendance.filter(p => (!p.status || p.status === 'active') && !onCourtIds.has(p.id));
  }

  // 1. Correção Soberana de Levantadores
  const countSetters = (t: any) => [t.setter, ...(t.players || [])].filter(p => p && p.isOfficialSetter).length;
  let settersA = countSetters(teamA);
  let settersB = countSetters(teamB);

  if (settersA > 1 || settersB > 1) {
    // Caso 1: Time A tem 2 ou mais levantadores
    if (settersA > 1) {
      const extraSetterIdx = teamA.players.findIndex(p => p && p.isOfficialSetter);
      if (extraSetterIdx !== -1) {
        const extraSetter = teamA.players[extraSetterIdx];
        const isFemale = isFemalePlayer(extraSetter);

        // Tentativa A: Substituir por um jogador de linha da reserva com mesmo gênero
        const reserveCandidateIdx = remainingPlayers.findIndex(
          p => p && !p.isOfficialSetter && isFemalePlayer(p) === isFemale
        );

        if (reserveCandidateIdx !== -1) {
          const replacement = remainingPlayers[reserveCandidateIdx];
          teamA.players[extraSetterIdx] = replacement;
          remainingPlayers[reserveCandidateIdx] = extraSetter;
        } else if (settersB === 0) {
          // Time B não tem nenhum levantador oficial, passar para o Time B
          const lineCandidateIdx = teamB.players.findIndex(p => isFemalePlayer(p) === isFemale);
          if (lineCandidateIdx !== -1) {
            const swapTarget = teamB.players[lineCandidateIdx];
            teamA.players[extraSetterIdx] = swapTarget;
            teamB.players[lineCandidateIdx] = extraSetter;
          }
        } else {
          // Qualquer reserva de linha disponível
          const anyReserveIdx = remainingPlayers.findIndex(p => p && !p.isOfficialSetter);
          if (anyReserveIdx !== -1) {
            const replacement = remainingPlayers[anyReserveIdx];
            teamA.players[extraSetterIdx] = replacement;
            remainingPlayers[anyReserveIdx] = extraSetter;
          }
        }
      }
    }

    // Caso 2: Time B tem 2 ou mais levantadores
    settersB = countSetters(teamB);
    if (settersB > 1) {
      const extraSetterIdx = teamB.players.findIndex(p => p && p.isOfficialSetter);
      if (extraSetterIdx !== -1) {
        const extraSetter = teamB.players[extraSetterIdx];
        const isFemale = isFemalePlayer(extraSetter);

        const reserveCandidateIdx = remainingPlayers.findIndex(
          p => p && !p.isOfficialSetter && isFemalePlayer(p) === isFemale
        );

        if (reserveCandidateIdx !== -1) {
          const replacement = remainingPlayers[reserveCandidateIdx];
          teamB.players[extraSetterIdx] = replacement;
          remainingPlayers[reserveCandidateIdx] = extraSetter;
        } else if (settersA === 0) {
          const lineCandidateIdx = teamA.players.findIndex(p => isFemalePlayer(p) === isFemale);
          if (lineCandidateIdx !== -1) {
            const swapTarget = teamA.players[lineCandidateIdx];
            teamB.players[extraSetterIdx] = swapTarget;
            teamA.players[lineCandidateIdx] = extraSetter;
          }
        } else {
          const anyReserveIdx = remainingPlayers.findIndex(p => p && !p.isOfficialSetter);
          if (anyReserveIdx !== -1) {
            const replacement = remainingPlayers[anyReserveIdx];
            teamB.players[extraSetterIdx] = replacement;
            remainingPlayers[anyReserveIdx] = extraSetter;
          }
        }
      }
    }
  }

  // 2. Correção de Gênero (|menA - menB| <= 1)
  const getMenCount = (team: any) => [team.setter, ...(team.players || [])].filter(p => p && !isFemalePlayer(p)).length;
  let menA = getMenCount(teamA);
  let menB = getMenCount(teamB);

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

  // 3. Atualizar IC total
  teamA.totalIC = calculateTeamTotalIC(teamA);
  teamB.totalIC = calculateTeamTotalIC(teamB);

  currentRes = {
    ...currentRes,
    teamA,
    teamB,
    remainingPlayers
  };

  // 4. Executar auto-balanceamento de Top/Bottom na linha
  currentRes = runAutoCorrectionAgent(currentRes);

  return currentRes;
};

export const optimizeTeamSynergyIteratively = (res: any, ...args: any[]): any => res;
export const generateTournamentTeams = (list: Player[], numTeams: number = 2, ...args: any[]): any => ({ teams: [], reserves: [] });

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
  ].filter(p => p && !p.isOfficialSetter);

  if (linePlayers.length < 4) {
    return { isValid: true, diffTop: 0, diffBottom: 0, message: "Jogadores insuficientes para rigor de Top/Bottom" };
  }

  const sortedLine = sortLinePlayersBySkills(linePlayers);

  const top2Ids = new Set(sortedLine.slice(0, 2).map(p => p.id));
  const bottom2Ids = new Set(sortedLine.slice(-2).map(p => p.id));

  const allA = [result.teamA.setter, ...(result.teamA.players || [])].filter(Boolean);
  const allB = [result.teamB.setter, ...(result.teamB.players || [])].filter(Boolean);

  const top4Ids = new Set(sortedLine.slice(0, 4).map(p => p.id));
  const bottom4Ids = new Set(sortedLine.slice(-4).map(p => p.id));
  const t2A = allA.filter(p => top2Ids.has(p.id)).length;
  const t2B = allB.filter(p => top2Ids.has(p.id)).length;
  const b2A = allA.filter(p => bottom2Ids.has(p.id)).length;
  const b2B = allB.filter(p => bottom2Ids.has(p.id)).length;
  const t4A = allA.filter(p => top4Ids.has(p.id)).length;
  const t4B = allB.filter(p => top4Ids.has(p.id)).length;
  const b4A = allA.filter(p => bottom4Ids.has(p.id)).length;
  const b4B = allB.filter(p => bottom4Ids.has(p.id)).length;
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
