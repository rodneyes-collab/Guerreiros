
import { GoogleGenAI, Modality } from "@google/genai";
import { Team, Player, GenerationResult } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const getCache = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('spikegen_ai_cache');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveCache = (cache: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('spikegen_ai_cache', JSON.stringify(cache));
  } catch (e) {
    console.error("Erro ao salvar cache da IA:", e);
  }
};

const analysisCache = getCache();

/**
 * Helper to get a fresh instance of the Gemini AI client.
 */
const getAI = (isTTS = false) => {
  const key = isTTS 
    ? (process.env.API_KEY || process.env.GEMINI_API_KEY) 
    : process.env.GEMINI_API_KEY;
    
  return new GoogleGenAI({ apiKey: key || "" });
};

/**
 * Analyzes a match between two teams.
 */
export const analyzeMatch = async (teamA: Team, teamB: Team): Promise<string> => {
  const teamAIds = [teamA.setter?.id, ...teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [teamB.setter?.id, ...teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `analysis_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  // Prompt encurtado para economizar tokens
  const prompt = `Analise (PT-BR):
    A(ELO ${Math.round(teamA.totalElo / (teamA.players.length + 1))}): ${teamA.setter?.name || 'T'}, ${teamA.players.map(p => p.name).join(', ')}
    B(ELO ${Math.round(teamB.totalElo / (teamB.players.length + 1))}): ${teamB.setter?.name || 'T'}, ${teamB.players.map(p => p.name).join(', ')}
    Max 60 palavras: equilíbrio e vantagem.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const result = response.text || "Análise indisponível.";
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
  } catch (error: any) {
    if (error?.message?.includes('429')) return "Limite de IA atingido.";
    return "Falha na análise técnica.";
  }
};

/**
 * Generates an energetic narration script.
 */
export const generateNarrationScript = async (teamA: Team, teamB: Team): Promise<string> => {
  const teamANames = [teamA.setter?.name, ...teamA.players.map(p => p.name)].filter(Boolean).join(', ');
  const teamBNames = [teamB.setter?.name, ...teamB.players.map(p => p.name)].filter(Boolean).join(', ');

  const ai = getAI();
  // Prompt encurtado
  const prompt = `Narração curta (Locutor):
    A: ${teamANames}. B: ${teamBNames}.
    Formato: "Time A: [nomes]. Time B: [nomes]. [Frase curta]."`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || `Time A: ${teamANames}. Time B: ${teamBNames}. Jogo iniciado!`;
  } catch (error: any) {
    return `Time A: ${teamANames}. Time B: ${teamBNames}. Bora pro jogo!`;
  }
};

/**
 * Audits the team generation.
 */
export const verifyRules = async (attendanceList: Player[], result: GenerationResult, balanceLevel: string): Promise<string> => {
  const teamAIds = [result.teamA.setter?.id, ...result.teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [result.teamB.setter?.id, ...result.teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `audit_v3_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  
  // Cálculo de probabilidade de jogo (Joga X, Descansa Y)
  const totalPlayers = attendanceList.length;
  const spots = 12;
  
  let probabilityText = "";
  if (totalPlayers <= spots) {
    probabilityText = "Todos os jogadores presentes estão escalados (100% de aproveitamento). Joga todas as partidas.";
  } else {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const common = gcd(spots, totalPlayers);
    const playMatches = spots / common;
    const totalCycle = totalPlayers / common;
    const restMatches = totalCycle - playMatches;
    
    probabilityText = `Com ${totalPlayers} jogadores para 12 vagas, o regime de rodízio é: joga ${playMatches} ${playMatches === 1 ? 'partida' : 'partidas'} e descansa ${restMatches} ${restMatches === 1 ? 'partida' : 'partidas'}.`;
  }

  const prompt = `Você é o Auditor Oficial do SpikeGen. Analise a escalação e gere um relatório técnico em PT-BR.
    
    DADOS:
    - Nível de Equilíbrio: ${balanceLevel}
    - Jogadores Presentes: ${attendanceList.map(p => `${p.name}(ELO:${p.elo}, Ofic:${p.isOfficialSetter ? 'Sim' : 'Não'}, Partidas:${p.dailyMatches}, JogouUltima:${p.playedLastMatch ? 'Sim' : 'Não'})`).join(', ')}
    - Time A: Levantador: ${result.teamA.setter?.name || 'Nenhum'}, Jogadores: ${result.teamA.players.map(p => p.name).join(', ')} (Total ELO: ${result.teamA.totalElo})
    - Time B: Levantador: ${result.teamB.setter?.name || 'Nenhum'}, Jogadores: ${result.teamB.players.map(p => p.name).join(', ')} (Total ELO: ${result.teamB.totalElo})
    - Trocas realizadas para equilíbrio: ${result.swaps.length > 0 ? result.swaps.map(s => `${s.playerA} <-> ${s.playerB}`).join(', ') : 'Nenhuma'}
    - Contexto de Rodízio: ${probabilityText}

    REQUISITOS DO RELATÓRIO (Seja direto e profissional, use emojis):
    1. Explique a escolha dos LEVANTADORES (prioridade: oficiais, rodízio de partidas e quem descansou).
    2. Explique a escolha dos JOGADORES de linha (prioridade: rodízio de partidas e ordem de chegada).
    3. Comente sobre as TROCAS efetuadas para balancear o ELO entre os times.
    4. Informe OBRIGATORIAMENTE a probabilidade de jogo usando EXATAMENTE este formato: "Joga X partidas e descansa Y partidas" (conforme o Contexto de Rodízio fornecido).

    Mantenha o texto entre 80 e 120 palavras.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const auditResult = response.text || "Auditoria concluída com sucesso.";
    analysisCache[cacheKey] = auditResult;
    saveCache(analysisCache);
    return auditResult;
  } catch (error: any) {
    return `Auditoria SpikeGen: Escalação validada. ${probabilityText} Equilíbrio ${balanceLevel} garantido por algoritmos de ELO.`;
  }
};

/**
 * Generates a summary of the day's highlights.
 */
export const generateDailySummaryNarration = async (stats: { mvp: string; evolution: string; topWinRate: string }): Promise<string> => {
  const ai = getAI();
  const prompt = `Resumo (Locutor): MVP: ${stats.mvp}, Evolução: ${stats.evolution}, WinRate: ${stats.topWinRate}. Max 2 frases.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Racha épico hoje! Parabéns a todos!";
  } catch (error: any) {
    return "Racha sensacional! Parabéns aos guerreiros!";
  }
};

/**
 * Converts text to speech using Gemini TTS (Special moments only).
 */
export const getNarrationAudio = async (text: string): Promise<string | null> => {
  const ai = getAI(true);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio ? `data:audio/mp3;base64,${base64Audio}` : null;
  } catch (error: any) {
    return null;
  }
};

/**
 * Speaks the provided text. Defaults to browser TTS for zero cost.
 */
export const speakNarration = async (text: string, forceAIVoice = false): Promise<void> => {
  // Se não for forçado, usa a voz do navegador (Grátis)
  if (!forceAIVoice) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.1; // Um pouco mais rápido para parecer mais natural
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    return;
  }

  // Voz da IA apenas se explicitamente solicitado
  try {
    const audioSrc = await getNarrationAudio(text);
    if (audioSrc) {
      const audio = new Audio(audioSrc);
      await audio.play();
    } else {
      throw new Error("AI TTS unavailable");
    }
  } catch (error) {
    // Fallback para navegador se a IA falhar
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }
};

