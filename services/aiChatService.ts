
import type { Player, Match } from "../types.ts";
import { getAI, recordServerAIError } from "./serverGemini.ts";

/**
 * AI Chat Service to answer member questions with club context.
 */
export const runAIChat = async (
  _apiKey: string, 
  message: string, 
  history: { role: 'user' | 'model', parts: string }[],
  context: { players: Player[], matches: Match[], rules?: string }
): Promise<string> => {
  const ai = getAI();

  const clubContext = `
    CONTEXTO DO CLUBE:
    Nome: Guerreiros Volleyball Club
    Sistema de Ranking: ELO (Vitória +20, Derrota -20, Presença +50).
    Regras de Ouro:
    - 12 jogadores por partida.
    - Prioridade de entrada para quem não jogou a última (Rodagem Imediata).
    - Balanceamento por IC (Índice Composto): 60% Habilidade, 40% Win Rate.
    - Preservação de Levantadores em cada time.
    - Separação obrigatória dos 2 jogadores menos experientes.
    
    ESTATÍSTICAS ATUAIS:
    - Total de Sócios: ${context.players.length}
    - Últimas Partidas: ${context.matches.length} registradas.
    - Top 3 Ranking Geral: ${context.players.slice(0, 3).map((p, i) => `${i+1}º ${p.name} (${p.elo} pts)`).join(', ')}
  `;

  const systemInstruction = `Você é o Assistente Oficial do Guerreiros Volleyball Club. 
    Seu objetivo é ajudar os sócios com dúvidas sobre o ranking, regras de sorteio e desempenho.
    Use o contexto fornecido abaixo para responder. Se não souber algo, peça para consultarem a diretoria.
    Mantenha um tom profissional, esportivo e prestativo. Responda sempre em português brasileiro.
    
    ${clubContext}
  `;

  // Re-construct history into the prompt for simplicity and compatibility with generateContent
  const historyText = history.map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.parts}`).join('\n');
  const fullPrompt = `${systemInstruction}\n\nHistórico da Conversa:\n${historyText}\n\nUsuário: ${message}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: fullPrompt,
    });

    return response.text || "Ops! Não consegui gerar uma resposta agora.";
  } catch (error: any) {
    console.error("[AI Chat] Error:", error);
    recordServerAIError(error);
    throw error;
  }
};
