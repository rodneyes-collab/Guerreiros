import { GoogleGenAI } from "@google/genai";

export async function runDeepAnalyticsChat(
  apiKey: string,
  userQuestion: string,
  callerPlayer: any,
  allPlayers: any[],
  allMatches: any[]
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  // Resumo estatístico consolidado de todos os sócios ativos
  const playersSummary = allPlayers.map(p => ({
    id: p.id,
    name: p.name,
    elo: Math.round(p.elo || 1200),
    wins: p.wins || 0,
    losses: p.losses || 0,
    matches: p.matchesPlayed || 0,
    winRate: p.matchesPlayed ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0,
    isSetter: p.isOfficialSetter ? "Sim" : "Não"
  }));

  // Histórico de partidas do sócio que fez a pergunta
  const callerMatches = allMatches.filter(m => 
    callerPlayer && (
      (Array.isArray(m.teamA) && m.teamA.includes(callerPlayer.id)) ||
      (Array.isArray(m.teamB) && m.teamB.includes(callerPlayer.id))
    )
  );

  const prompt = `
Você é o **Assistente Inteligente e Estrategista Oficial do Guerreiros Volleyball Club**. 
Sua missão é ser um bot extremamente inteligente, analítico, interativo, motivador e com espírito de resenha saudável de quadra de vôlei.

DADOS DO SÓCIO QUE PERGUNTOU:
- Nome: ${callerPlayer?.name || "Convidado/Visitante"}
- ELO Atual: ${Math.round(callerPlayer?.elo || 1200)} pts
- Partidas Totais: ${callerPlayer?.matchesPlayed || 0} (Vitórias: ${callerPlayer?.wins || 0}, Derrotas: ${callerPlayer?.losses || 0})

PANORAMA GERAL DO CLUBE (${allPlayers.length} sócios ativos):
${JSON.stringify(playersSummary, null, 2)}

HISTÓRICO RECENTE DE PARTIDAS DO SÓCIO (${callerMatches.length} partidas analisadas):
${JSON.stringify(callerMatches.slice(0, 25), null, 2)}

PERGUNTA FEITA PELO SÓCIO:
"${userQuestion}"

DIRETRIZES DE PENSAMENTO E RESPOSTA:
1. **Raciocínio Profundo e Cruzamento de Dados:** Se o usuário perguntar sobre rivais, parcerias, desempenho em sequências ou evolução de ELO, analise o JSON de partidas e estatísticas para extrair respostas reais e lógicas.
2. **Incentivo e Gamificação:** Sempre termine com uma pitada de incentivo motivacional esportivo (ex: desafiando a subir no ranking, elogiando o aproveitamento ou encorajando para a próxima quinta-feira).
3. **Interatividade:** Se a pergunta for aberta ou vaga, responda com inteligência e faça uma pergunta de acompanhamento para engajar o sócio (ex: "Quer ver sua evolução em relação ao mês passado também?").
4. **Transparência Elegante:** Se realmente não houver dados suficientes nas partidas para responder a uma pergunta muito específica, seja claro e espirituoso: "🤖 Guerreiro(a), os dados das súmulas ainda não registram isso com precisão, mas no próximo rachão a gente tira a limpo!".
5. **Formatação para WhatsApp:** Use negritos (*texto*), emojis com moderação (🏐🔥🏆) e mantenha os textos dinâmicos e fáceis de ler no celular.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "🤖 Analisei os dados, mas não consegui montar a resposta completa agora.";
  } catch (err) {
    console.error("[Deep Analytics Error]:", err);
    return "🤖 Ocorreu um erro ao processar sua análise estatística.";
  }
}