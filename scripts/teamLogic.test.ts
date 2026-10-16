import { 
  generateTeams, 
  calculateEffectiveElo,
  calculateCompositePerformanceRating
} from '../utils/teamLogic';
import { Player, Gender } from '../types';

/**
 * Teste de Carga: Simulação de 100 Partidas Consecutivas
 * Objetivos:
 * 1. Garantir que não haja derivação de ELO (soma total deve ser constante se for zero-sum).
 * 2. Garantir que o rodízio de levantadores seja justo.
 * 3. Garantir que o rodízio de jogadores de linha seja equilibrado.
 */

function createPlayer(id: string, name: string, gender: Gender, isSetter: boolean, skillLevel: 1|2|3): Player {
  return {
    id,
    name,
    gender,
    isOfficialSetter: isSetter,
    matchesPlayed: 0,
    dailyMatches: 0,
    dailyWins: 0,
    dailyLosses: 0,
    dailyEloGain: 0,
    wins: 0,
    losses: 0,
    elo: 1500,
    impactLevel: skillLevel,
    skills: {
      setting: isSetter ? Math.max(skillLevel, 2) as 1|2|3 : 1,
      attacking: skillLevel,
      defense: skillLevel,
      serving: skillLevel
    },
    playedLastMatch: false,
    consecutivePlayed: 0,
    consecutiveBenched: 0,
    status: 'active'
  };
}

// Pool de 20 jogadores (4 levantadores e 16 de linha)
const initialPool: Player[] = [
  // 4 Levantadores (2 Elite, 2 Médios)
  createPlayer('s1', 'Levantadora Elite 1', Gender.FEMALE, true, 3),
  createPlayer('s2', 'Levantadora Elite 2', Gender.FEMALE, true, 3),
  createPlayer('s3', 'Levantador Técnico 1', Gender.MALE, true, 2),
  createPlayer('s4', 'Levantador Técnico 2', Gender.MALE, true, 2),
  
  // 16 Jogadores de Linha (Mistura de gêneros e níveis)
  createPlayer('p1', 'Atacante M1', Gender.MALE, false, 3),
  createPlayer('p2', 'Atacante M2', Gender.MALE, false, 3),
  createPlayer('p3', 'Atacante M3', Gender.MALE, false, 3),
  createPlayer('p4', 'Médio M4', Gender.MALE, false, 2),
  createPlayer('p5', 'Médio M5', Gender.MALE, false, 2),
  createPlayer('p6', 'Médio M6', Gender.MALE, false, 2),
  createPlayer('p7', 'Base M7', Gender.MALE, false, 1),
  createPlayer('p8', 'Base M8', Gender.MALE, false, 1),
  
  createPlayer('p9', 'Atacante F1', Gender.FEMALE, false, 3),
  createPlayer('p10', 'Atacante F2', Gender.FEMALE, false, 3),
  createPlayer('p11', 'Atacante F3', Gender.FEMALE, false, 3),
  createPlayer('p12', 'Média F4', Gender.FEMALE, false, 2),
  createPlayer('p13', 'Média F5', Gender.FEMALE, false, 2),
  createPlayer('p14', 'Média F6', Gender.FEMALE, false, 2),
  createPlayer('p15', 'Base F7', Gender.FEMALE, false, 1),
  createPlayer('p16', 'Base F8', Gender.FEMALE, false, 1),
];

async function runLoadTest() {
  console.log('🧪 Iniciando Teste de Carga: Simulação de 100 partidas consecutivas...');
  
  let currentPlayers = [...initialPool];
  const setterUsage: Record<string, number> = {};
  const playerMatches: Record<string, number> = {};
  
  initialPool.forEach(p => {
    playerMatches[p.id] = 0;
    if (p.isOfficialSetter) setterUsage[p.id] = 0;
  });
  
  const initialTotalElo = initialPool.reduce((sum, p) => sum + p.elo, 0);
  const iterations = 100;

  for (let i = 1; i <= iterations; i++) {
    // 1. Gerar Equipes (O algoritmo deve escolher os 12 com base na prioridade interna)
    const result = generateTeams(currentPlayers, undefined, false, false, [], 'BOTH', 'IC_ONLY');
    
    // 2. Registrar participação
    const teamAIds = [result.teamA.setter?.id, ...result.teamA.players.map(p => p.id)].filter(Boolean) as string[];
    const teamBIds = [result.teamB.setter?.id, ...result.teamB.players.map(p => p.id)].filter(Boolean) as string[];
    const allPlayedIds = [...teamAIds, ...teamBIds];
    
    if (result.teamA.setter) setterUsage[result.teamA.setter.id]++;
    if (result.teamB.setter) setterUsage[result.teamB.setter.id]++;
    
    allPlayedIds.forEach(id => playerMatches[id]++);
    
    // 3. Simular Resultado (Vencer quem tiver maior IC total com 70% de probabilidade)
    const icA = result.teamA.totalIC;
    const icB = result.teamB.totalIC;
    const probA = icA / (icA + icB);
    const winner = Math.random() < probA ? 'A' : 'B';
    
    // 4. Atualizar Estado dos Jogadores para a próxima rodada
    currentPlayers = currentPlayers.map(p => {
      const played = allPlayedIds.includes(p.id);
      
      if (!played) {
        return {
          ...p,
          playedLastMatch: false,
          consecutivePlayed: 0,
          consecutiveBenched: p.consecutiveBenched + 1
        };
      }
      
      const isTeamA = teamAIds.includes(p.id);
      const isTeamB = teamBIds.includes(p.id);
      const won = (isTeamA && winner === 'A') || (isTeamB && winner === 'B');
      const eloChange = won ? 20 : -20;
      
      return {
        ...p,
        wins: won ? p.wins + 1 : p.wins,
        losses: won ? p.losses : p.losses + 1,
        elo: p.elo + eloChange,
        matchesPlayed: p.matchesPlayed + 1,
        dailyMatches: p.dailyMatches + 1,
        playedLastMatch: true,
        consecutivePlayed: p.consecutivePlayed + 1,
        consecutiveBenched: 0
      };
    });
  }
  
  // VALIDAÇÕES
  
  console.log('\n--- 📊 RESULTADOS DO TESTE DE CARGA ---');
  
  // 1. Verificação de Derivação de ELO
  const finalTotalElo = currentPlayers.reduce((sum, p) => sum + p.elo, 0);
  const eloDrift = finalTotalElo - initialTotalElo;
  console.log(`Soma ELO Inicial: ${initialTotalElo}`);
  console.log(`Soma ELO Final: ${finalTotalElo}`);
  console.log(`Derivação de ELO: ${eloDrift}`);
  
  if (Math.abs(eloDrift) > 0.1) {
    console.error('❌ FALHA: Detectada derivação de ELO. A soma total deveria ser constante.');
    process.exit(1);
  } else {
    console.log('✅ SUCESSO: Sem derivação de ELO.');
  }
  
  // 2. Verificação de Equidade de Levantadores
  console.log('\nUso de Levantadores:');
  Object.entries(setterUsage).forEach(([id, count]) => {
    const p = initialPool.find(ip => ip.id === id);
    console.log(` - ${p?.name}: ${count} jogos`);
  });
  
  const sUsage = Object.values(setterUsage);
  const sSpread = Math.max(...sUsage) - Math.min(...sUsage);
  console.log(`Dispersão de Levantadores: ${sSpread}`);
  
  if (sSpread > (iterations / 4)) { // Margem de tolerância
    console.error('❌ FALHA: Desvio excessivo na prioridade de levantadores.');
    process.exit(1);
  } else {
    console.log('✅ SUCESSO: Distribuição de levantadores equilibrada.');
  }
  
  // 3. Verificação de Rodagem de Jogadores
  const mUsage = Object.values(playerMatches);
  const mSpread = Math.max(...mUsage) - Math.min(...mUsage);
  console.log(`\nDispersão de Jogos (Min: ${Math.min(...mUsage)}, Max: ${Math.max(...mUsage)}): ${mSpread}`);
  
  if (mSpread > 15) {
    console.error('❌ FALHA: O rodízio de jogadores não está equitativo.');
    process.exit(1);
  } else {
    console.log('✅ SUCESSO: Rodízio de jogadores dentro da normalidade.');
  }
  
  console.log('\n✨ Teste de carga concluído com êxito!');
}

runLoadTest().catch(err => {
  console.error('💥 Erro fatal no teste:', err);
  process.exit(1);
});
