
import { Player, Match } from "../types";
import { getAI } from "./serverGemini";

export interface CoachAnalysisData {
  player: Player;
  allPlayers: Player[];
  recentMatches: Match[];
}

/**
 * AI Coach Service to provide personalized feedback to players.
 */
export const runAICoachAnalysis = async (_apiKey: string, data: CoachAnalysisData): Promise<string> => {
  const ai = getAI();

  const { player, allPlayers, recentMatches } = data;

  // Prepare context
  const avgElo = allPlayers.reduce((acc, p) => acc + p.elo, 0) / allPlayers.length;
  const playerRank = [...allPlayers].sort((a, b) => b.elo - a.elo).findIndex(p => p.id === player.id) + 1;
  
  const recentResults = recentMatches
    .filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id))
    .slice(0, 5)
    .map(m => {
      const isTeamA = m.teamA.includes(player.id);
      const won = (isTeamA && m.winner === 'A') || (!isTeamA && m.winner === 'B');
      return won ? 'Vitória' : 'Derrota';
    })
    .join(', ');

  const prompt = `Você é o "Treinador IA" do Guerreiros Volleyball Club. Seu tom é motivador, técnico e direto ao ponto.
    Você deve fornecer um feedback personalizado para o jogador: ${player.name}.

    DADOS DO ATLETA:
    - Nome: ${player.name}
    - ELO Atual: ${player.elo} (Rank #${playerRank} de ${allPlayers.length})
    - Média de ELO do Clube: ${avgElo.toFixed(0)}
    - Vitórias: ${player.wins} | Derrotas: ${player.losses} (Aproveitamento: ${((player.wins / (player.wins + player.losses || 1)) * 100).toFixed(1)}%)
    - Habilidades (1-3): 
      * Levantamento: ${player.skills?.setting || 1}
      * Ataque: ${player.skills?.attacking || 1}
      * Defesa: ${player.skills?.defense || 1}
      * Saque: ${player.skills?.serving || 1}
    - Nível de Impacto: ${player.impactLevel || 1} (1: Base, 2: Técnico, 3: Elite)
    - Resultados Recentes (Últimos 5 jogos): ${recentResults || 'Nenhum jogo recente registrado'}

    TAREFAS:
    1. **Análise de Desempenho**: Compare o jogador com a média do clube e seu rank atual.
    2. **Destaques Técnicos**: Com base nas habilidades, identifique o que ele faz bem.
    3. **Sugestões de Melhoria**: Aponte em qual habilidade ele deve focar para subir de nível/ELO.
    4. **Dica Tática**: Dê uma dica específica de voleibol (posicionamento, mentalidade ou técnica) baseada no perfil dele.

    FORMATO DA RESPOSTA (Markdown):
    ### 🏐 Feedback do Treinador IA
    **Olá, ${player.name}!** Aqui está sua análise de performance:

    [Sua análise motivadora aqui]

    #### 📈 Raio-X Técnico
    - **Pontos Fortes**: [Analise baseado nas habilidades 3/3]
    - **Oportunidades**: [Analise baseado nas habilidades 1/3 ou 2/3]

    #### 💡 Dica de Ouro
    [Dica tática específica]

    Mantenha a resposta curta, em português, e focada em melhorar o desempenho no próximo jogo do Guerreiros Club.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });
    return response.text || "O Treinador IA está sem fôlego no momento. Tente novamente mais tarde.";
  } catch (error: any) {
    console.error("[AI Coach] Analysis failed:", error);
    if (error.message?.includes('429') || error.status === 429) {
      return "O Treinador IA atingiu o limite de uso mensal (Cota Excedida). Por favor, verifique as configurações de faturamento em ai.studio/spend.";
    }
    return "Desculpe, não consegui processar seu feedback agora. O Treinador está em tempo técnico.";
  }
};
