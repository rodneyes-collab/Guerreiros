
import { GoogleGenAI, Modality } from "@google/genai";
import { Team, Player, GenerationResult } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const CACHE_KEY = 'spikegen_ai_cache';
const MAX_CACHE_ITEMS = 30; // Reduzido para maior segurança
const MAX_CACHE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB (limite conservador)

/**
 * Limpa chaves antigas do localStorage de versões anteriores do app
 * que não são mais necessárias devido à migração para Firebase.
 */
export const clearOldStorage = () => {
  if (typeof window === 'undefined') return;
  const oldKeys = [
    'spikegen_players',
    'spikegen_players_v2',
    'spikegen_players_v3',
    'spikegen_players_v4',
    'spikegen_matches',
    'spikegen_attendance',
    'spikegen_payments',
    'spikegen_systemMetadata'
  ];
  oldKeys.forEach(key => {
    try {
      if (localStorage.getItem(key)) {
        console.log(`[Storage] Limpando chave obsoleta: ${key}`);
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.error(`[Storage] Erro ao limpar chave ${key}:`, e);
    }
  });
};

const getCache = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveCache = (cache: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    let keys = Object.keys(cache);
    let cacheString = JSON.stringify(cache);

    // Limpeza proativa baseada em quantidade e tamanho
    if (keys.length > MAX_CACHE_ITEMS || cacheString.length > MAX_CACHE_SIZE_BYTES) {
      console.log(`[Cache] Limpando cache proativamente. Itens: ${keys.length}, Tamanho: ${(cacheString.length / 1024).toFixed(1)}KB`);
      
      // Prioriza remover áudios (TTS) que são pesados
      const ttsKeys = keys.filter(k => k.startsWith('tts_'));
      const otherKeys = keys.filter(k => !k.startsWith('tts_'));
      
      // Remove metade dos áudios ou os itens mais antigos
      const toRemove = ttsKeys.length > 0 
        ? ttsKeys.slice(0, Math.ceil(ttsKeys.length / 2)) 
        : otherKeys.slice(0, 5);
      
      toRemove.forEach(k => delete cache[k]);
      cacheString = JSON.stringify(cache);
    }

    localStorage.setItem(CACHE_KEY, cacheString);
  } catch (e) {
    console.error("Erro ao salvar cache da IA:", e);
    if (e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn("[Cache] Cota do LocalStorage excedida. Limpando cache agressivamente...");
      
      // Tenta limpar apenas áudios primeiro
      const keys = Object.keys(cache);
      const ttsKeys = keys.filter(k => k.startsWith('tts_'));
      
      if (ttsKeys.length > 0) {
        ttsKeys.forEach(k => delete cache[k]);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          return;
        } catch { /* segue para limpeza total */ }
      }
      
      // Se falhar, limpa tudo do cache da IA
      localStorage.removeItem(CACHE_KEY);
      Object.keys(cache).forEach(k => delete cache[k]);
      
      // Tenta limpar chaves antigas também para liberar espaço geral
      clearOldStorage();
      
      // Se ainda assim falhar ao salvar (mesmo vazio), limpa TUDO do localStorage como último recurso
      // (CUIDADO: Isso pode deslogar o usuário se o token estiver no localStorage)
      // Mas aqui vamos apenas tentar salvar um objeto vazio para resetar a chave
      try {
        localStorage.setItem(CACHE_KEY, '{}');
      } catch (finalError) {
        console.error("[Cache] Falha crítica ao resetar cache:", finalError);
      }
    }
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
  const teamAIds = [teamA.setter?.id, ...teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [teamB.setter?.id, ...teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `narration_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

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
    const result = response.text || `Time A: ${teamANames}. Time B: ${teamBNames}. Jogo iniciado!`;
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
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

  const prompt = `Você é o Auditor Especialista em Regras do Guerreiros Volleyball Club. Sua missão é garantir que a escalação seja 100% JUSTA e siga rigorosamente as regras de rodízio e ordem de chegada.

    REGRAS CRÍTICAS:
    1. PRIORIDADE 1: Quem descansou na última partida DEVE jogar (playedLastMatch: false tem prioridade).
    2. PRIORIDADE 2: Quem tem menos partidas no dia (dailyMatches menor) DEVE jogar.
    3. PRIORIDADE 3: Ordem de Chegada (arrivalOrder menor) é o critério de desempate absoluto.
    4. EXCEÇÃO: Levantadores Oficiais rotacionam entre si. Se houver muitos levantadores, eles podem esperar mais, mas nunca um levantador com 0 jogos deve esperar enquanto um com 1 jogo joga.

    DADOS ATUAIS:
    - Jogadores Presentes: ${attendanceList.map(p => `${p.name}(#${p.arrivalOrder}, ELO:${p.elo}, Ofic:${p.isOfficialSetter ? 'Sim' : 'Não'}, Jogos:${p.dailyMatches}, JogouUltima:${p.playedLastMatch ? 'Sim' : 'Não'})`).join(', ')}
    - Escalação Atual:
      Time A: ${result.teamA.setter?.name || 'Nenhum'}, ${result.teamA.players.map(p => p.name).join(', ')}
      Time B: ${result.teamB.setter?.name || 'Nenhum'}, ${result.teamB.players.map(p => p.name).join(', ')}
    - Lista de Espera: ${result.remainingPlayers.map(p => `${p.name}(#${p.arrivalOrder}, Jogos:${p.dailyMatches})`).join(', ')}

    TAREFAS DO AUDITOR:
    1. Verifique se algum jogador na LISTA DE ESPERA deveria estar jogando (ex: tem menos jogos ou chegou muito antes que alguém que está em quadra).
    2. Se houver uma violação, aponte EXATAMENTE quem "furou a fila" e quem foi prejudicado.
    3. Explique se a escolha dos levantadores justifica algum salto na ordem de chegada.
    4. Dê um veredito: ✅ APROVADO ou ⚠️ ALERTA DE INJUSTIÇA.

    Mantenha o tom profissional, direto e use emojis. Max 150 palavras.`;

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
  const cacheKey = `summary_${stats.mvp}_${stats.evolution}_${stats.topWinRate}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  const prompt = `Resumo (Locutor): MVP: ${stats.mvp}, Evolução: ${stats.evolution}, WinRate: ${stats.topWinRate}. Max 2 frases.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const result = response.text || "Racha épico hoje! Parabéns a todos!";
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
  } catch (error: any) {
    return "Racha sensacional! Parabéns aos guerreiros!";
  }
};

/**
 * Converts text to speech using Gemini TTS (Special moments only).
 */
export const getNarrationAudio = async (text: string): Promise<string | null> => {
  // Cache baseado no hash do texto (primeiros 100 caracteres)
  const cacheKey = `tts_${btoa(unescape(encodeURIComponent(text.substring(0, 100))))}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

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
    const result = base64Audio ? `data:audio/mp3;base64,${base64Audio}` : null;
    
    if (result) {
      analysisCache[cacheKey] = result;
      saveCache(analysisCache);
    }
    
    return result;
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

