import { calculateTrueSkillUpdate } from '../trueSkill';
import { Player } from '../../types';

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

const createMockPlayer = (id: string, mu?: number, sigma?: number): Player => {
  return {
    id,
    name: `Player ${id}`,
    matchesPlayed: 0,
    dailyMatches: 0,
    dailyWins: 0,
    dailyLosses: 0,
    dailyEloGain: 0,
    wins: 0,
    losses: 0,
    elo: 1500,
    status: 'active',
    trueSkill: mu !== undefined && sigma !== undefined ? { mu, sigma } : undefined,
  } as Player;
};

async function runTests() {
  console.log('🧪 Iniciando Verificação de calculateTrueSkillUpdate...');

  // Default values
  const defaultMu = 25;
  const defaultSigma = 25 / 3;

  // Test Case 1: Team A Wins
  const teamA1 = [createMockPlayer('A1', defaultMu, defaultSigma), createMockPlayer('A2', defaultMu, defaultSigma)];
  const teamB1 = [createMockPlayer('B1', defaultMu, defaultSigma), createMockPlayer('B2', defaultMu, defaultSigma)];

  const resultA1 = calculateTrueSkillUpdate(teamA1, teamB1, 'A');

  assert(resultA1.length === 4, 'Deve retornar atualizações para os 4 jogadores');

  const newA1 = resultA1.find(r => r.playerId === 'A1')!;
  const newB1 = resultA1.find(r => r.playerId === 'B1')!;

  assert(newA1.newTrueSkill.mu > defaultMu, 'Time vencedor deve ter aumento no mu (Team A)');
  assert(newB1.newTrueSkill.mu < defaultMu, 'Time perdedor deve ter diminuição no mu (Team B)');
  assert(newA1.newTrueSkill.sigma < defaultSigma, 'A incerteza (sigma) do vencedor deve diminuir');
  assert(newB1.newTrueSkill.sigma < defaultSigma, 'A incerteza (sigma) do perdedor deve diminuir');

  // Test Case 2: Team B Wins
  const resultB1 = calculateTrueSkillUpdate(teamA1, teamB1, 'B');
  const newA1_B = resultB1.find(r => r.playerId === 'A1')!;
  const newB1_B = resultB1.find(r => r.playerId === 'B1')!;

  assert(newB1_B.newTrueSkill.mu > defaultMu, 'Time vencedor deve ter aumento no mu (Team B)');
  assert(newA1_B.newTrueSkill.mu < defaultMu, 'Time perdedor deve ter diminuição no mu (Team A)');

  // Test Case 3: Draw
  const resultDraw = calculateTrueSkillUpdate(teamA1, teamB1, 'Draw');
  const newA1_Draw = resultDraw.find(r => r.playerId === 'A1')!;
  const newB1_Draw = resultDraw.find(r => r.playerId === 'B1')!;

  assert(Math.abs(newA1_Draw.newTrueSkill.mu - defaultMu) < 0.001, 'Empate entre times iguais não deve alterar o mu');
  assert(Math.abs(newB1_Draw.newTrueSkill.mu - defaultMu) < 0.001, 'Empate entre times iguais não deve alterar o mu');
  assert(newA1_Draw.newTrueSkill.sigma < defaultSigma, 'Empate deve diminuir a incerteza (sigma)');

  // Test Case 4: Default Values (Players missing trueSkill object or fields)
  const teamADefault = [createMockPlayer('A_Def')]; // No trueSkill
  const teamBDefault = [createMockPlayer('B_Def')]; // No trueSkill

  const resultDefault = calculateTrueSkillUpdate(teamADefault, teamBDefault, 'A');
  const newADef = resultDefault.find(r => r.playerId === 'A_Def')!;
  const newBDef = resultDefault.find(r => r.playerId === 'B_Def')!;

  assert(newADef.newTrueSkill.mu > defaultMu, 'Fallback para valores padrão: mu do vencedor deve aumentar');
  assert(newBDef.newTrueSkill.mu < defaultMu, 'Fallback para valores padrão: mu do perdedor deve diminuir');

  console.log(`\n🎉 Todos os ${passedTests}/${totalTests} testes do TrueSkill passaram com sucesso!`);
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
