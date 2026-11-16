import { Player } from '../types';

/**
 * Obtém a soma das habilidades técnicas do sócio (escala 4 a 20, ou 4 a 12).
 */
export const getPlayerSkillsSum = (player: Player | null): number => {
  if (!player || !player.skills) return 10;
  const s = player.skills as any;
  const attacking = Number(s.attacking ?? s.attack ?? 2);
  const defense = Number(s.defense ?? 2);
  const setting = Number(s.setting ?? s.setter ?? 2);
  const serving = Number(s.serving ?? s.serve ?? 2);
  return attacking + defense + setting + serving;
};

/**
 * Calcula o Índice Composto (IC) conforme diretriz estatutária (AGENTS.md):
 * 80% Habilidades Práticas (convertidas para base 0-100) + 20% Win Rate real no período.
 */
export const calculatePlayerCompositeIndex = (
  player: Player | null,
  winRate: number,
  _isDaily: boolean = false
): number => {
  if (!player) return 0;
  const skillsSum = getPlayerSkillsSum(player);
  const s = player.skills as any;
  const maxPossible =
    s && Number(s.attacking || 0) <= 3 && Number(s.defense || 0) <= 3 && Number(s.setting || 0) <= 3
      ? 12
      : 20;

  const techScore = Math.min(100, (skillsSum / maxPossible) * 100);
  const wrPercent = winRate <= 1.0 ? winRate * 100 : winRate;

  // Fórmula Oficial B-1 (AGENTS.md): 80% Skills + 20% Win Rate %
  const ic = (techScore * 0.8) + (wrPercent * 0.2);
  return Number(ic.toFixed(2));
};

/**
 * Calcula o Score Oficial de MVP (Fórmula B-1: Desempenho Técnico + Pilar Volume).
 * Score B-1 = Pilar Desempenho + Pilar Volume
 * - Pilar Desempenho = IC + (Saldo Médio de Pontos * 1.5)
 * - Pilar Volume (Diário): +2.0 pontos por partida disputada no dia
 * - Pilar Volume (Carreira): min(15, (Partidas / 45) * 15)
 */
export const calculateMvpEfficiencyScore = (
  player: Player | null,
  winRate: number,
  matches: number,
  _eloGain: number,
  pointsFor: number,
  pointsAgainst: number,
  isDaily: boolean = false
): number => {
  if (!player || matches <= 0) return 0;

  const normalizedWr = winRate > 1.0 ? winRate / 100 : winRate;

  // 1. Índice Composto (IC)
  const ic = calculatePlayerCompositeIndex(player, normalizedWr, isDaily);

  // 2. Saldo Médio de Pontos por Partida (Multiplicador 1.5 de domínio de quadra)
  const saldoMedio = (pointsFor - pointsAgainst) / matches;
  let pilarDesempenho = ic + (saldoMedio * 1.5);

  // 3. Salvaguarda na Sessão Diária contra MVP sem vitórias no dia
  if (isDaily) {
    if (normalizedWr === 0) {
      pilarDesempenho = Math.max(0, pilarDesempenho * 0.45);
    } else if (normalizedWr < 0.35) {
      pilarDesempenho = pilarDesempenho * (0.55 + normalizedWr);
    }
  }

  // 4. Pilar de Volume (Participação e Compromisso)
  const pilarVolume = isDaily
    ? matches * 2.0
    : Math.min(15, (matches / 45) * 15);

  return Number(Math.max(0, pilarDesempenho + pilarVolume).toFixed(2));
};

