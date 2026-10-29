import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GenerationResult, Player, Match, Team } from "../types";
import { calculateCompositePerformanceRating } from "../utils/teamLogic";

export const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

export const serverAnalyzeMatch = async (result: GenerationResult, attendance: Player[]): Promise<string> => {
  const { teamA, teamB, swaps } = result;
  const ai = getAI();

  const formatPlayer = (p: Player) => `${p.name} (IC:${calculateCompositePerformanceRating(p).toFixed(1)}, Impacto:${p.impactLevel || 1})`;
  const playersA = [teamA.setter, ...teamA.players].filter((p): p is Player => p !== null).map(formatPlayer).join(', ');
  const playersB = [teamB.setter, ...teamB.players].filter((p): p is Player => p !== null).map(formatPlayer).join(', ');

  const swapInfo = swaps && swaps.length > 0
    ? swaps.map(s => {
        const pA = attendance.find(p => p.id === s.playerA)?.name || 'Desconhecido';
        const pB = attendance.find(p => p.id === s.playerB)?.name || 'Desconhecido';
        return `${pA} <-> ${pB}`;
      }).join(', ')
    : "Nenhuma troca de refinamento necessária.";

  const prompt = `Analise Técnica de Partida (Guerreiros Volleyball):
    
    TIME A (Média IC: ${(teamA.totalIC / (teamA.players.length + (teamA.setter ? 1 : 0))).toFixed(1)}):
    Jogadores: ${playersA}
    
    TIME B (Média IC: ${(teamB.totalIC / (teamB.players.length + (teamB.setter ? 1 : 0))).toFixed(1)}):
    Jogadores: ${playersB}

    AJUSTES DE BALANCEAMENTO FEITOS:
    ${swapInfo}
    
    TAREFA:
    1. Analise o equilíbrio das equipes (Índice Composto - IC e Nível de Impacto).
    2. Explique como as trocas feitas ajudaram a equilibrar os times (foram necessárias para otimizar o IC ou Nível de Impacto?).
    3. Determine a probabilidade de vitória para cada time (%).
    
    ESTILO: Analítico, direto e profissional. Max 100 palavras.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || "Análise indisponível no momento.";
};

export const serverVerifyRules = async (
  attendanceList: Player[],
  result: GenerationResult,
  balanceLevel: string,
  lastMatch: Match | null = null
): Promise<string> => {
  const ai = getAI();

  const getNamesFromIds = (ids: string[]) => {
    return ids.map(id => attendanceList.find(p => p.id === id)?.name || id).join(', ');
  };

  const lastMatchInfo = lastMatch
    ? `Última Partida - Time A: ${getNamesFromIds(lastMatch.teamA)} | Time B: ${getNamesFromIds(lastMatch.teamB)}`
    : "Nenhuma partida anterior registrada hoje.";

  const swapsInfo = result.swaps && result.swaps.length > 0
    ? result.swaps.map(s => {
        const pA = attendanceList.find(p => p.id === s.playerA);
        const pB = attendanceList.find(p => p.id === s.playerB);
        return `${pA?.name || s.playerA} (ELO ${pA?.elo}) <-> ${pB?.name || s.playerB} (ELO ${pB?.elo})`;
      }).join(', ')
    : "Nenhuma troca de refinamento necessária.";

  const prompt = `Auditoria Técnica (Guerreiros Volleyball):
    
    DADOS ATUAIS:
    - Presentes: ${attendanceList.map(p => `${p.name}(G:${p.gender === 'MALE' ? 'M' : 'F'}, ELO:${p.elo}, Impacto:${p.impactLevel || 1}, Jogos:${p.dailyMatches}, Ultima:${p.playedLastMatch ? 'Sim' : 'Não'}, Lev:${p.isOfficialSetter ? 'Sim' : 'Não'})`).join(', ')}
    - Time A: ${result.teamA.setter?.name || 'Sem Lev'}, ${result.teamA.players.map(p => p.name).join(', ')} (Total ELO:${result.teamA.totalIC})
    - Time B: ${result.teamB.setter?.name || 'Sem Lev'}, ${result.teamB.players.map(p => p.name).join(', ')} (Total ELO:${result.teamB.totalIC})
    - Espera: ${result.remainingPlayers.map(p => `${p.name}(Impacto:${p.impactLevel || 1}, Jogos:${p.dailyMatches})`).join(', ')}
    - ${lastMatchInfo}
    - Trocas de Refinamento (Impacto + ELO): ${swapsInfo}

    REGRAS DO CLUBE:
    1. Prioridade para quem tem MENOS jogos no dia.
    2. Critério de desempate: Quem NÃO jogou a última partida.
    3. Levantadores: Devem ser equilibrados.
    4. Nível de Impacto (Novo): O sistema usa "Pontos de Pressão" ocultos (Elite:+200, Médio:+75, Base:0) somados ao ELO para equilibrar atacantes e suporte.
    5. Waitlist Weight: Jogadores que ficam 2 ou mais partidas seguidas fora ganham prioridade máxima para entrar.
    
    TAREFA:
    1. Levantadores: Compare os 2 escolhidos.
    2. Equilíbrio e Fila (Waitlist): Justifique as escolhas.
    3. Rodízio e Impacto: Explique como os "Pontos de Pressão" ajudaram a equilibrar jogadores de alto impacto (Elite) entre as equipes para evitar que um time fique "pesado" demais ofensivamente.

    ESTILO: Respostas equilibradas, técnicas e diretas. Use emojis. Max 200 palavras.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || `Auditoria Guerreiros Volei: Escalação validada. Equilíbrio ${balanceLevel} garantido.`;
};

export const serverDailySummary = async (stats: {
  mvp?: string;
  bestSetter?: string;
  dailyKing?: string;
  matchesCount?: number;
  rankingChanges?: string[];
  date?: string;
  avgMatchTime?: number;
  summaryType?: 'session' | 'career';
}): Promise<string> => {
  const ai = getAI();
  const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0
    ? `\n- Mudanças no Ranking: ${stats.rankingChanges.join(', ')}`
    : '';

  const isCareer = stats.summaryType === 'career';
  const typeLabel = isCareer ? 'GERAL ACUMULADO (CARREIRA)' : 'DO DIA (SESSÃO)';

  const prompt = `Você é um narrador esportivo brasileiro carismático e enérgico do Guerreiros Volleyball.
    TIPO DE RESUMO: ${typeLabel}
    Resumo dos Dados:
    - Data/Período: ${stats.date || new Date().toLocaleDateString('pt-BR')}
    - Partidas: ${stats.matchesCount || 0}
    - Tempo médio das partidas: ${stats.avgMatchTime || 'não disponível'} minutos
    - MVP (Maior Pontuador/Destaque): ${stats.mvp || 'N/A'}
    - Melhor Levantador(a): ${stats.bestSetter || 'N/A'}
    - Rei/Rainha (Maior Ganho ELO): ${stats.dailyKing || 'N/A'}${rankingInfo}
    
    TAREFA: Gere um roteiro de locução curto (max 5 frases) que soe NATURAL e FLUIDO, como se estivesse comentando ao vivo.
    MUITO IMPORTANTE: A PRIMEIRA FRASE DEVE SER EXATAMENTE: "Resumo ${isCareer ? 'do Ranking Geral' : 'da rodada'} do Guerreiros Volleyball:".
    
    INSTRUÇÕES GERAIS:
    1. Gênero: Analise o NOME e identifique o gênero para adaptar (Levantador/Levantadora, Rei/Rainha).
    2. Contexto: Se for resumo de CARREIRA, fale sobre a trajetória e as mudanças históricas no ranking. Se for SESSÃO, foque no que aconteceu hoje.
    3. Estilo: Use pontuação para pausas naturais. Use gírias de vôlei. NÃO faça listas.
    4. Termos: Use "Equipe" em vez de "Time".
    5. Fechamento: Finalize dizendo "Guerreiros Volleyball: onde o racha é de outro nível!".`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || "Racha épico hoje! Parabéns a todos os guerreiros!";
};

export const serverTTS = async (text: string): Promise<string | null> => {
  const ai = getAI();
  const promptText = `Narre o seguinte texto com empolgação e naturalidade de locutor esportivo, gerando apenas áudio: ${text}`;
  
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-lite-tts",
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Zephyr' }
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio || null;
};

export const serverDetectAnomalies = async (data: { players: Player[], matches: any[], metadata: any }): Promise<string> => {
  const ai = getAI();
  const currentSystemDate = new Date().toISOString();

  const prompt = `Você é um Agente de IA Especialista em Integridade de Dados para o Guerreiros Volleyball Club. 
    Sua missão é varrer os dados do banco de dados e identificar ANOMALIAS, INCONSISTÊNCIAS ou possíveis ERROS que possam causar crashes ou injustiças no sistema.

    DATA ATUAL DO SISTEMA: ${currentSystemDate}
    (Nota: Se as datas das partidas estiverem próximas a esta data, elas estão CORRETAS. Não considere 2026 como futuro se o sistema disser que estamos em 2026).

    DADOS PARA ANÁLISE:
    - Jogadores: ${JSON.stringify(data.players.map(p => ({ id: p.id, name: p.name, elo: p.elo, matches: p.matchesPlayed, wins: p.wins, losses: p.losses })))}
    - Últimas Partidas: ${JSON.stringify(data.matches.slice(0, 10))}
    - Metadados do Sistema: ${JSON.stringify(data.metadata)}

    O QUE PROCURAR:
    1. ELOs impossíveis ou saltos desproporcionais.
    2. Inconsistência entre Vitórias/Derrotas e total de Partidas Jogadas.
    3. Jogadores com muitos jogos mas ELO muito baixo (ou vice-versa sem explicação).
    4. Partidas com placares impossíveis ou falta de dados essenciais.
    5. Erros de lógica nos metadados (ex: data de reset futura).
    6. Jogadores duplicados ou com nomes suspeitos.

    FORMATO DA RESPOSTA:
    - Use Markdown.
    - Comece com um resumo do estado de saúde do banco (✅ SAUDÁVEL, ⚠️ ATENÇÃO ou 🚨 CRÍTICO).
    - Liste as anomalias encontradas em tópicos.
    - Para cada anomalia, sugira uma ação corretiva.
    - Se não houver anomalias, elogie a integridade dos dados.

    Mantenha o tom profissional e técnico. Max 300 palavras.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || "Varredura concluída sem observações.";
};

export const serverAnalyzeBillingCosts = async (billingData: {
  actual: number;
  forecast: number;
  services: { name: string, cost: number, savings?: number }[];
  usage: any;
}): Promise<string> => {
  const ai = getAI();

  const prompt = `Você é um Consultor Sênior de FinOps e Especialista em Google Cloud. 
    Analise o faturamento atual do aplicativo Guerreiros Volleyball e sugira estratégias de otimização de custos.

    DADOS FINANCEIROS:
    - Total Acumulado: R$ ${billingData.actual.toFixed(2)}
    - Previsão Mensal: R$ ${billingData.forecast.toFixed(2)}
    
    DETALHE POR SERVIÇO:
    ${billingData.services.map(s => `- ${s.name}: R$ ${s.cost.toFixed(2)}${s.savings ? ` (Economia: -R$ ${s.savings.toFixed(2)})` : ''}`).join('\n')}

    MONITORAMENTO DE USO INTERNO:
    - Leituras Firestore: ${billingData.usage.reads}
    - Escritas Firestore: ${billingData.usage.writes}
    - Chamadas de IA: ${billingData.usage.aiCalls}

    MISSÃO:
    1. Explique por que o Google Cloud Console e o Firebase Console mostram valores diferentes (Firebase é apenas uma sub-parte do faturamento total do Google Cloud).
    2. Identifique o serviço "vilão" dos custos (o que está gastando mais).
    3. Para o Cloud Run: Sugira se a configuração de "Instância Mínima = 0" e "CPU apenas durante requisição" faz sentido.
    4. Para o Firestore: Sugira se o volume de leituras está alto para o número de sócios e sugira cache.
    5. Para o Gemini: Explique as cotas gratuitas e se o uso atual justifica o custo.

    ESTILO: Tom executivo, consultivo, direto e útil. Use Markdown e emojis. Max 250 palavras.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || "Análise de faturamento temporariamente indisponível.";
};

export const serverGenerateBirthdayMessage = async (playerName: string): Promise<string> => {
  const ai = getAI();
  const prompt = `Gere uma mensagem de aniversário curta, criativa e animada para um sócio de um clube de vôlei. 
    O nome do sócio é "${playerName}". 
    A mensagem deve ser em português, usar emojis de vôlei e festa, e ter um tom de união e celebração. 
    Evite usar palavras com gênero específico como "guerreiro" ou "guerreira", use termos neutros ou apenas o nome.
    Não use aspas na resposta. Max 50 palavras.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: prompt,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });

  return response.text || `Parabéns, ${playerName}! Que seu dia seja repleto de aces e vitórias dentro e fora de quadra! 🏐🎉`;
};
