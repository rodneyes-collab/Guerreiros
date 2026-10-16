import { Player } from '../types';

/**
 * Obtém a soma das habilidades técnicas do sócio (1 a 5 cada, totalizando de 4 a 20).
 */
export const getPlayerSkillsSum = (player: Player | null): number => {
  if (!player || !player.skills) return 4;
  const s = player.skills as any;
  const attacking = Number(s.attacking ?? s.attack ?? 1);
  const defense = Number(s.defense ?? 1);
  const setting = Number(s.setting ?? s.setter ?? 1);
  const serving = Number(s.serving ?? s.serve ?? 1);
  return attacking + defense + setting + serving;
};

/**
 * Calcula o Índice Composto (IC): 80% Habilidades Práticas + 20% Win Rate real.
 */
export const calculatePlayerCompositeIndex = (
  player: Player | null,
  winRate: number
): number => {
  if (!player) return 0;
  const skillsSum = getPlayerSkillsSum(player);
  const techScore = (skillsSum / 20) * 100;
  const wrPercent = winRate <= 1.0 ? winRate * 100 : winRate;
  return (techScore * 0.8) + (wrPercent * 0.2);
};

/**
 * Calcula o Score Oficial de MVP (Opção B-1: Desempenho Técnico + Bônus de Volume).
 * 
 * Fórmula:
 * Pilar Desempenho = IC (60% Tech + 40% Win Rate) + (Saldo Médio de Pontos * 1.5)
 * Pilar Volume:
 *   - Acumulado (Carreira): até 15 pts com teto de 45 partidas (min(15, (partidas / 45) * 15))
 *   - Diário (Sessão): +2.0 pts por partida disputada na data
 * 
 * @param player Objeto do sócio
 * @param winRate Aproveitamento no período (0.0 a 1.0)
 * @param matches Total de partidas disputadas no período
 * @param eloGain Variação de ELO no período (mantido por retrocompatibilidade)
 * @param pointsFor Pontos pró marcados
 * @param pointsAgainst Pontos sofridos
 * @param isDaily Se o cálculo é referente à sessão diária
 * @returns Score B-1 ponderado
 */
export const calculateMvpEfficiencyScore = (
  player: Player | null,
  winRate: number,
  matches: number,
  eloGain: number,
  pointsFor: number,
  pointsAgainst: number,
  isDaily: boolean = false
): number => {
  if (!player || matches === 0) return 0;

  // 1. Índice Composto (60% Habilidades + 40% Win Rate do período)
  const ic = calculatePlayerCompositeIndex(player, winRate);

  // 2. Saldo Médio de Pontos por Partida (Multiplicador 1.5 de domínio)
  const saldoMedio = (pointsFor - pointsAgainst) / matches;
  const pilarDesempenho = ic + (saldoMedio * 1.5);

  // 3. Pilar de Volume
  const pilarVolume = isDaily
    ? matches * 2.0
    : Math.min(15, (matches / 45) * 15);

  return Number((pilarDesempenho + pilarVolume).toFixed(2));
};

