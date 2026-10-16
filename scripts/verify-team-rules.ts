import { 
  generateTeams, 
  verifyClubGenerationRules, 
  calculatePracticalSkillsSum,
  calculateCompositePerformanceRating 
} from '../utils/teamLogic';
import { Player, Gender } from '../types';

/**
 * Suíte de Testes de Integração Pré-Commit: Regras de Balanceamento do Clube
 * 1. Soberania do Bottom 2 (Separação mandatória entre Time A e Time B)
 * 2. Garantia de Levantadores Oficiais (1 por time quando >= 2 presentes)
 * 3. Paridade Rígida de Gênero (Diferença máxima de ±1 entre equipes)
 * 4. Validador Estatutário (verifyClubGenerationRules)
 */

function createMockPlayer(
  id: string, 
  name: string, 
  gender: Gender, 
  isSetter: boolean, 
  skillLevel: 1 | 2 | 3
): Player {
  return {
    id,
    name,
    gender,
    matchesPlayed: 20,
    dailyMatches: 0,
    dailyWins: 0,
    dailyLosses: 0,
    dailyEloGain: 0,
    isOfficialSetter: isSetter,
    skills: {
      attacking: skillLevel,
      defense: skillLevel,
      setting: isSetter ? Math.max(skillLevel, 2) as 1 | 2 | 3 : 1,
      serving: skillLevel
    },
    elo: 1500 + skillLevel * 100,
    wins: 10,
    losses: 10,
    status: 'active'
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FALHA NO TESTE: ${testName}`);
    process.exit(1);
  } else {
    console.log(`✅ APROVADO: ${testName}`);
    passedTests++;
  }
}

async function runTests() {
  console.log('🧪 Iniciando Verificação Automatizada de Regras de Balanceamento...');

  // Cenário 1: 12 Jogadores (2 Levantadoras, 5 Homens, 5 Mulheres de linha)
  // 2 Jogadores propositalmente com skills muito baixas (Bottom 2)
  const pool1: Player[] = [
    createMockPlayer('p1', 'Levantadora A', Gender.FEMALE, true, 3),
    createMockPlayer('p2', 'Levantadora B', Gender.FEMALE, true, 3),
    createMockPlayer('p3', 'Atacante Forte M1', Gender.MALE, false, 3),
    createMockPlayer('p4', 'Atacante Forte M2', Gender.MALE, false, 3),
    createMockPlayer('p5', 'Jogador Médio M3', Gender.MALE, false, 2),
    createMockPlayer('p6', 'Jogador Médio M4', Gender.MALE, false, 2),
    createMockPlayer('p7', 'Jogador Base M5', Gender.MALE, false, 1), // Bottom 2 candidato
    createMockPlayer('p8', 'Jogadora Forte F1', Gender.FEMALE, false, 2),
    createMockPlayer('p9', 'Jogadora Média F2', Gender.FEMALE, false, 2),
    createMockPlayer('p10', 'Jogadora Média F3', Gender.FEMALE, false, 2),
    createMockPlayer('p11', 'Jogadora Média F4', Gender.FEMALE, false, 2),
    createMockPlayer('p12', 'Jogadora Base F5', Gender.FEMALE, false, 1), // Bottom 2 candidato
  ];

  const res1 = generateTeams(pool1, undefined, false, false, [], 'BOTH', 'IC_ONLY');

  // Teste 1: Regra de Levantador
  const settersA = [res1.teamA.setter, ...res1.teamA.players].filter(p => p?.isOfficialSetter);
  const settersB = [res1.teamB.setter, ...res1.teamB.players].filter(p => p?.isOfficialSetter);
  assert(settersA.length === 1 && settersB.length === 1, 'Distribuição paritária de levantadores (1 em A e 1 em B)');

  // Teste 2: Soberania do Bottom 2
  const teamLinePlayers = pool1.filter(p => !p.isOfficialSetter);
  const sortedBySkill = [...teamLinePlayers].sort((a, b) => {
    const diff = calculatePracticalSkillsSum(b) - calculatePracticalSkillsSum(a);
    if (diff !== 0) return diff;
    return calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a);
  });
  
  const top2Ids = new Set(sortedBySkill.slice(0, 2).map(p => p.id));
  const bottom2Ids = new Set(sortedBySkill.slice(-2).map(p => p.id));

  const b2InTeamA = [res1.teamA.setter, ...res1.teamA.players].filter(p => p && bottom2Ids.has(p.id)).length;
  const b2InTeamB = [res1.teamB.setter, ...res1.teamB.players].filter(p => p && bottom2Ids.has(p.id)).length;
  assert(b2InTeamA === 1 && b2InTeamB === 1, 'Isolamento soberano do Bottom 2 da LINHA (exatamente 1 em cada equipe)');

  // Teste 2.1: Separação de Top 2
  const t2InTeamA = [res1.teamA.setter, ...res1.teamA.players].filter(p => p && top2Ids.has(p.id)).length;
  const t2InTeamB = [res1.teamB.setter, ...res1.teamB.players].filter(p => p && top2Ids.has(p.id)).length;
  assert(t2InTeamA === 1 && t2InTeamB === 1, 'Separação obrigatória de Top 2 da LINHA (exatamente 1 destaque por equipe)');

  // Teste 3: Paridade de Gênero
  const menA = [res1.teamA.setter, ...res1.teamA.players].filter(p => p?.gender === Gender.MALE).length;
  const menB = [res1.teamB.setter, ...res1.teamB.players].filter(p => p?.gender === Gender.MALE).length;
  assert(Math.abs(menA - menB) <= 1, 'Paridade estrita de gênero (diferença máxima de ±1 homem entre times)');

  // Teste 4: Verificador Estatutário
  const audit = verifyClubGenerationRules(res1);
  assert(audit.allFulfilled, 'verifyClubGenerationRules atesta cumprimento total dos 3 pilares estatutários');

  // Teste 5: Rejeição de desbalanceamento artificial (Bottom 2 concentrado)
  const bottom2List = Array.from(bottom2Ids).map(id => pool1.find(p => p.id === id)!);
  const otherPlayers = pool1.filter(p => !bottom2Ids.has(p.id) && !p.isOfficialSetter);
  
  const violatedResult = {
    ...res1,
    teamA: {
      ...res1.teamA,
      players: [bottom2List[0], bottom2List[1], otherPlayers[0], otherPlayers[1], otherPlayers[2]] // Ambos os bottom 2 no Time A
    }
  };
  const violationAudit = verifyClubGenerationRules(violatedResult);
  assert(!violationAudit.topBottom.fulfilled, 'Auditoria reprova corretamente escalação com Bottom 2 concentrado');

  // Teste 6: Rejeição de desbalanceamento artificial (Top 2 concentrado)
  const top2List = Array.from(top2Ids).map(id => pool1.find(p => p.id === id)!);
  const topViolatedResult = {
    ...res1,
    teamA: {
      ...res1.teamA,
      players: [top2List[0], top2List[1], otherPlayers[0], otherPlayers[1], otherPlayers[2]] // Ambos os Top 2 no mesmo time A
    }
  };
  const topViolationAudit = verifyClubGenerationRules(topViolatedResult);
  assert(!topViolationAudit.topBottom.fulfilled, 'Auditoria reprova corretamente escalação com Top 2 da LINHA concentrado');

  // Cenário 2: Regressão de Linha (2 Levantadoras, uma delas fraca)
  // Se uma levantadora for fraca, ela não deve "roubar" a vaga de Bottom da linha, 
  // permitindo que a linha adversária concentre jogadores de base.
  const pool2: Player[] = [
    createMockPlayer('s1', 'Setter Forte', Gender.FEMALE, true, 3),
    createMockPlayer('s2', 'Setter Fraca (Bibi)', Gender.FEMALE, true, 1), // Seria B2 se incluíssemos setters
    createMockPlayer('l1', 'Linha Forte 1', Gender.MALE, false, 3),
    createMockPlayer('l2', 'Linha Forte 2', Gender.MALE, false, 3),
    createMockPlayer('l3', 'Linha Forte 3', Gender.MALE, false, 3),
    createMockPlayer('l4', 'Linha Forte 4', Gender.MALE, false, 3),
    createMockPlayer('l5', 'Linha Forte 5', Gender.FEMALE, false, 3),
    createMockPlayer('l6', 'Linha Forte 6', Gender.FEMALE, false, 3),
    createMockPlayer('l7', 'Linha Forte 7', Gender.FEMALE, false, 3),
    createMockPlayer('l8', 'Linha Forte 8', Gender.FEMALE, false, 3),
    createMockPlayer('l9', 'Linha Fraca 1 (Anne)', Gender.FEMALE, false, 1), // Bottom 2 da LINHA
    createMockPlayer('l10', 'Linha Fraca 2 (Betinha)', Gender.FEMALE, false, 1), // Bottom 2 da LINHA
  ];

  const res2 = generateTeams(pool2, undefined, false, false, [], 'BOTH', 'IC_ONLY');
  const b2LinhaIds = new Set(['l9', 'l10']);
  const teamAPlayers2 = [res2.teamA.setter, ...res2.teamA.players].filter(Boolean) as Player[];
  const teamBPlayers2 = [res2.teamB.setter, ...res2.teamB.players].filter(Boolean) as Player[];
  
  const b2LinhaInA = teamAPlayers2.filter(p => b2LinhaIds.has(p.id)).length;
  const b2LinhaInB = teamBPlayers2.filter(p => b2LinhaIds.has(p.id)).length;

  assert(b2LinhaInA === 1 && b2LinhaInB === 1, 'Regra de Ouro: Anne e Betinha separadas na LINHA mesmo com Bibi levantadora fraca');

  console.log(`\n🎉 Todos os ${passedTests}/${totalTests} testes de integridade de regras passaram com sucesso!`);
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
