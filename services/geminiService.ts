
import { GoogleGenAI, Modality } from "@google/genai";
import { Team, Player, GenerationResult, Match } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const CACHE_KEY = 'spikegen_ai_cache';
const MAX_CACHE_ITEMS = 20; // Reduzido para maior segurança
const MAX_CACHE_SIZE_BYTES = 1.0 * 1024 * 1024; // 1MB (limite conservador)

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
  const cacheKey = `analysis_v2_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  
  const formatPlayer = (p: Player) => `${p.name} (ELO:${p.elo}, Vit:${p.wins})`;
  const playersA = [teamA.setter, ...teamA.players].filter((p): p is Player => p !== null).map(formatPlayer).join(', ');
  const playersB = [teamB.setter, ...teamB.players].filter((p): p is Player => p !== null).map(formatPlayer).join(', ');

  const prompt = `Analise Técnica de Partida (Guerreiros Volleyball):
    
    TIME A (Média ELO: ${Math.round(teamA.totalElo / (teamA.players.length + (teamA.setter ? 1 : 0)))}):
    Jogadores: ${playersA}
    
    TIME B (Média ELO: ${Math.round(teamB.totalElo / (teamB.players.length + (teamB.setter ? 1 : 0)))}):
    Jogadores: ${playersB}
    
    TAREFA:
    1. Analise o equilíbrio das equipes com base no ELO e histórico de vitórias.
    2. Determine a probabilidade de vitória para cada time (%).
    3. Justifique a vantagem técnica (ex: força do levantador, consistência do grupo).
    
    ESTILO: Analítico, direto e profissional. Max 80 palavras.`;

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
  // Prompt ultra-curto
  const prompt = `Narração (Locutor):
    A: ${teamANames}. B: ${teamBNames}.
    Curto e energético.`;

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
export const verifyRules = async (
  attendanceList: Player[], 
  result: GenerationResult, 
  balanceLevel: string,
  lastMatch: Match | null = null
): Promise<string> => {
  const teamAIds = [result.teamA.setter?.id, ...result.teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [result.teamB.setter?.id, ...result.teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `audit_v4_${teamAIds}_vs_${teamBIds}_${lastMatch?.id || 'none'}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  
  // Mapear nomes para os IDs da última partida para facilitar a leitura da IA
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
    - Presentes: ${attendanceList.map(p => `${p.name}(G:${p.gender === 'MALE' ? 'M' : 'F'}, ELO:${p.elo}, Jogos:${p.dailyMatches}, Ultima:${p.playedLastMatch ? 'Sim' : 'Não'}, Lev:${p.isOfficialSetter ? 'Sim' : 'Não'})`).join(', ')}
    - Time A: ${result.teamA.setter?.name || 'Sem Lev'}, ${result.teamA.players.map(p => p.name).join(', ')} (Total ELO:${result.teamA.totalElo})
    - Time B: ${result.teamB.setter?.name || 'Sem Lev'}, ${result.teamB.players.map(p => p.name).join(', ')} (Total ELO:${result.teamB.totalElo})
    - Espera: ${result.remainingPlayers.map(p => `${p.name}(Jogos:${p.dailyMatches})`).join(', ')}
    - ${lastMatchInfo}
    - Trocas de Refinamento ELO: ${swapsInfo}

    REGRAS DO CLUBE:
    1. Prioridade para quem tem MENOS jogos no dia.
    2. Critério de desempate: Quem NÃO jogou a última partida.
    3. Levantadores: Devem ser equilibrados.
    4. Waitlist Weight: Jogadores que ficam 2 ou mais partidas seguidas fora ganham prioridade máxima para entrar.
    
    TAREFA:
    1. Levantadores: Compare os 2 escolhidos com os outros levantadores oficiais que ficaram de fora. Cite nomes e número de jogos. Justifique a escolha.
    2. Equilíbrio e Fila (Waitlist): Compare os jogadores de linha escolhidos com os que ficaram na espera. Cite nomes, número de jogos e quantas partidas seguidas estão fora (consecutiveBenched). Explique por que estes foram escolhidos seguindo as regras de prioridade (menos jogos) e o peso de espera (quem está há mais tempo fora tem prioridade máxima).
    3. Rodízio (Refinamento): Explique as trocas de refinamento realizadas para equilibrar o ELO. Compare os jogadores envolvidos e como isso equalizou os times tecnicamente.

    ESTILO: Respostas equilibradas, técnicas e diretas. Use emojis. Max 200 palavras.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const auditResult = response.text || "Auditoria concluída. Escalação segue os critérios de rodízio e equilíbrio do clube.";
    analysisCache[cacheKey] = auditResult;
    saveCache(analysisCache);
    return auditResult;
  } catch (error: any) {
    return `Auditoria SpikeGen: Escalação validada. Equilíbrio ${balanceLevel} garantido por algoritmos de ELO e regras de rodízio.`;
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

/**
 * Scans the database data to identify anomalies using AI.
 */
export const detectAnomalies = async (data: { players: Player[], matches: any[], metadata: any }): Promise<string> => {
  const ai = getAI();
  
  const prompt = `Você é um Agente de IA Especialista em Integridade de Dados para o Guerreiros Volleyball Club. 
    Sua missão é varrer os dados do banco de dados e identificar ANOMALIAS, INCONSISTÊNCIAS ou possíveis ERROS que possam causar crashes ou injustiças no sistema.

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Não foi possível realizar a varredura de anomalias no momento.";
  } catch (error: any) {
    console.error("Erro na detecção de anomalias:", error);
    if (error?.message?.includes('429')) return "Limite de requisições da IA atingido. Tente novamente mais tarde.";
    return "Falha técnica ao processar a varredura de anomalias.";
  }
};

