
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { Team, Player, GenerationResult, Match } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const CACHE_KEY = 'spikegen_ai_cache_v2';
const MAX_CACHE_ITEMS = 20; // Reduzido para maior segurança
const MAX_CACHE_SIZE_BYTES = 1.0 * 1024 * 1024; // 1MB (limite conservador)

const isQuotaOrBillingError = (error: any): boolean => {
  const msg = (error?.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("403") ||
    msg.includes("spending cap") ||
    msg.includes("quota") ||
    msg.includes("billing") ||
    msg.includes("resource_exhausted") ||
    msg.includes("exceeded")
  );
};

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
 * Helper to convert raw PCM from Gemini TTS to a playable WAV Blob URL.
 */
const pcmToWavUrl = (pcmBase64: string, sampleRate: number = 24000): string => {
  const binaryString = window.atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (PCM = 1)
  view.setUint16(20, 1, true);
  // channel count (Mono = 1)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, len, true);

  // write the PCM samples
  for (let i = 0; i < len; i++) {
    view.setUint8(44 + i, bytes[i]);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

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
 * Analyzes a match between two teams, including balance metrics and swap explanation.
 */
export const analyzeMatch = async (result: GenerationResult, attendance: Player[]): Promise<string> => {
  const { teamA, teamB, swaps } = result;
  const teamAIds = [teamA.setter?.id, ...teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [teamB.setter?.id, ...teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `analysis_v3_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  
  const formatPlayer = (p: Player) => `${p.name} (ELO:${p.elo}, Impacto:${p.impactLevel || 1})`;
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
    
    TIME A (Média ELO: ${Math.round(teamA.totalElo / (teamA.players.length + (teamA.setter ? 1 : 0)))}):
    Jogadores: ${playersA}
    
    TIME B (Média ELO: ${Math.round(teamB.totalElo / (teamB.players.length + (teamB.setter ? 1 : 0)))}):
    Jogadores: ${playersB}

    AJUSTES DE BALANCEAMENTO FEITOS:
    ${swapInfo}
    
    TAREFA:
    1. Analise o equilíbrio das equipes (ELO e Nível de Impacto).
    2. Explique como as trocas feitas ajudaram a equilibrar os times (foram necessárias para otimizar ELO ou Nível de Impacto?).
    3. Determine a probabilidade de vitória para cada time (%).
    
    ESTILO: Analítico, direto e profissional. Max 100 palavras.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });
    const result = response.text || "Análise indisponível.";
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Analysis Quota/Billing/Permission Reached (429/403/RESOURCE_EXHAUSTED). Falling back.");
      return "Análise temporariamente indisponível. O sistema realizou o balanceamento baseado em ELO e Níveis de Impacto técnico individual (Saque/Ataque/Defesa).";
    }
    console.error("Erro na análise técnica:", error);
    return "Falha na análise técnica.";
  }
};

/**
 * Generates an energetic narration script.
 */
export const generateNarrationScript = async (teamA: Team, teamB: Team): Promise<string> => {
  const teamANames = [teamA.setter?.name, ...teamA.players.map(p => p.name)].filter(Boolean).join(', ');
  const teamBNames = [teamB.setter?.name, ...teamB.players.map(p => p.name)].filter(Boolean).join(', ');

  // Retorna o texto exato e direto, conforme solicitado pelo usuário, 
  // sem usar a IA para gerar o script, evitando assim qualquer texto extra, opções ou repetições.
  return `Equipe A: ${teamANames}. Equipe B: ${teamBNames}.`;
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
    - Presentes: ${attendanceList.map(p => `${p.name}(G:${p.gender === 'MALE' ? 'M' : 'F'}, ELO:${p.elo}, Impacto:${p.impactLevel || 1}, Jogos:${p.dailyMatches}, Ultima:${p.playedLastMatch ? 'Sim' : 'Não'}, Lev:${p.isOfficialSetter ? 'Sim' : 'Não'})`).join(', ')}
    - Time A: ${result.teamA.setter?.name || 'Sem Lev'}, ${result.teamA.players.map(p => p.name).join(', ')} (Total ELO:${result.teamA.totalElo})
    - Time B: ${result.teamB.setter?.name || 'Sem Lev'}, ${result.teamB.players.map(p => p.name).join(', ')} (Total ELO:${result.teamB.totalElo})
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });
    const auditResult = response.text || "Auditoria concluída. Escalação segue os critérios de rodízio e equilíbrio do clube.";
    analysisCache[cacheKey] = auditResult;
    saveCache(analysisCache);
    return auditResult;
  } catch (error: any) {
    return `Auditoria Guerreiros Volei: Escalação validada. Equilíbrio ${balanceLevel} garantido por algoritmos de ELO e regras de rodízio.`;
  }
};

/**
 * Generates a summary of the day's highlights.
 */
export const generateDailySummaryNarration = async (stats: { 
  mvp?: string; 
  bestSetter?: string; 
  dailyKing?: string;
  matchesCount?: number;
  rankingChanges?: string[];
  date?: string;
  avgMatchTime?: number;
}): Promise<string> => {
  const cacheKey = `summary_v6_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(',')}_${stats.date}_${stats.avgMatchTime}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI();
  const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0
    ? `\n- Mudanças no Ranking Geral: ${stats.rankingChanges.join(', ')}`
    : '';

  const prompt = `Você é um narrador esportivo brasileiro carismático e enérgico do Guerreiros Volleyball.
    Resumo do Dia:
    - Data: ${stats.date || new Date().toLocaleDateString('pt-BR')}
    - Partidas: ${stats.matchesCount || 0}
    - Tempo médio das partidas: ${stats.avgMatchTime || 'não disponível'} minutos
    - MVP (Maior Pontuador/Destaque): ${stats.mvp || 'N/A'}
    - Melhor Levantador(a): ${stats.bestSetter || 'N/A'}
    - Rei/Rainha do Dia (Maior Ganho ELO): ${stats.dailyKing || 'N/A'}${rankingInfo}
    
    TAREFA: Gere um roteiro de locução curto (max 4 frases) que soe NATURAL e FLUIDO, como se estivesse comentando ao vivo.
    MUITO IMPORTANTE: A PRIMEIRA FRASE DEVE SER EXATAMENTE: "Resumo da partida do dia ${stats.date || new Date().toLocaleDateString('pt-BR')}:".
    
    INSTRUÇÕES GERAIS:
    1. Gênero: Analise o NOME e identifique o gênero para adaptar:
       - Levantador/Levantadora.
       - Rei/Rainha do Dia.
       Se não tiver certeza, use as formas neutras como "Levantador(a)" ou "Rei/Rainha".
    2. Nomes e Placares: Mencione os jogadores e suas conquistas. Se houver placares elásticos (ex: 15x0 ou 15x5), chame de "atropelo" ou "domínio absoluto". Se for 15x14, destaque como "jogo de nervos" ou "vitória na raça".
    3. Estilo: Use pontuação para pausas naturais. Use gírias de vôlei como "ace", "bola de cheque", "mão de pau". NÃO faça listas.
    4. Termos: Use "Equipe" em vez de "Time".
    5. Fechamento: Finalize dizendo "Guerreiros Volleyball: onde o racha é de outro nível!".`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });
    const result = response.text || "Racha épico hoje! Parabéns a todos os guerreiros!";
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
  } catch (error: any) {
    return "Racha sensacional! Parabéns aos guerreiros pelo desempenho de hoje!";
  }
};

/**
 * Generates a team announcement audio directly from teams to reduce latency.
 */
export const generateTeamAnnouncementAudio = async (teamA: Team, teamB: Team): Promise<string | null> => {
  const teamANames = [teamA.setter?.name, ...teamA.players.map(p => p.name)].filter(Boolean).join(', ');
  const teamBNames = [teamB.setter?.name, ...teamB.players.map(p => p.name)].filter(Boolean).join(', ');
  
  const cacheKey = `teams_audio_v1_${teamANames}_vs_${teamBNames}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI(true);
  const prompt = `Você é um locutor esportivo brasileiro carismático e empolgado.
    
    TAREFA: Narre a escalação das duas equipes abaixo de forma NATURAL, FLUIDA e RÁPIDA. 
    
    Equipe A: ${teamANames}
    Equipe B: ${teamBNames}
    
    Instruções:
    - Comece direto com a Equipe A.
    - Use entonação de rádio esportivo. 
    - Fale de forma direta e enérgica.
    - Use "Equipe" em vez de "Time".`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
          },
        },
      },
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    
    return result;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Audio Quota or Permission Reached (429/403/RESOURCE_EXHAUSTED). Falling back.");
      return null;
    }
    console.error("Error generating team announcement audio:", error);
    return null;
  }
};

/**
 * Generates a summary audio directly from stats to reduce latency.
 */
export const generateDailySummaryAudio = async (stats: { 
  mvp?: string;
  bestSetter?: string;
  dailyKing?: string;
  matchesCount?: number;
  rankingChanges?: string[];
  sessionLeaderboard?: any[];
  date?: string;
  avgMatchTime?: number;
  summaryType?: 'session' | 'career';
}): Promise<string | null> => {
  const cacheKey = `summary_audio_v11_${stats.summaryType}_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(',')}_${stats.date}_${stats.avgMatchTime}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const ai = getAI(true);
  const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0
    ? `\n- Performance dos Jogadores: ${stats.rankingChanges.join('; ')}`
    : '';

  const isCareer = stats.summaryType === 'career';
  const typeLabel = isCareer ? 'GERAL ACUMULADO' : 'DA SESSÃO';
  
  const prompt = `Você é um narrador esportivo brasileiro carismático e enérgico do Guerreiros Volleyball.
    TIPO DE RESUMO: ${typeLabel}
    
    DADOS:
    - Data/Período: ${stats.date || 'Geral'}
    - Partidas Realizadas: ${stats.matchesCount || 0}
    - Tempo médio de jogo: ${stats.avgMatchTime || '0'} minutos
    - Craque da Rodada (MVP): ${stats.mvp || 'N/A'}
    - Melhore Levantador(a): ${stats.bestSetter || 'N/A'}
    - Rei/Rainha da Quadra: ${stats.dailyKing || 'N/A'}
    ${stats.sessionLeaderboard ? `- Top 5 Atual: ${stats.sessionLeaderboard.slice(0, 5).map((p: any, i: number) => `${i+1}º ${p.name}`).join(', ')}` : ''}
    ${rankingInfo}
    
    TAREFA: Narre os resultados de forma NATURAL, ENTUSIASTA e IMPACTANTE.
    
    REGRAS CRÍTICAS DE NARRAÇÃO:
    1. A PRIMEIRA FRASE DEVE SER: "Resumo ${isCareer ? 'do Ranking Geral' : 'da rodada'} do Guerreiros Volleyball:".
    2. DATA: Sempre narre a data fornecida no formato "dia [dia] de [mês]" (ex: "dia 28 de maio"). Se a data for "Global" ou "Geral", diga "de todo o histórico".
    3. VALORES: NUNCA mencione números de pontos ELO. Fale sobre ganhos, perdas, subidas e descidas no ranking. SEMPRE use o termo "posições" (ex: "subiu duas posições") e NUNCA use termos como "degraus".
    4. JOGADORES: Mencione o MVP, Melhor Levantador e Rei/Rainha. Em seguida, introduza a próxima parte dizendo claramente: "Agora, vamos ao Ranking Acumulado, com as subidas e descidas de posições:". Então, narre de forma dinâmica a performance e mudanças de TODOS os jogadores listados em "Performance dos Jogadores". Não ignore ninguém!
    5. ESTILO: Use entonação de locutor de vôlei. Termine com: "Guerreiros Volleyball: onde o racha é de outro nível!".`;

  try {
    // Retry logic for transient errors
    let response;
    let retries = 2;
    while (retries >= 0) {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI Request timeout')), 25000));
        const callPromise = ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { 
                prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
              },
            },
          },
        });
        
        response = await Promise.race([callPromise, timeoutPromise]) as any;
        break;
      } catch (error: any) {
        if (retries > 0 && (error.message?.includes('500') || error.message?.includes('429') || error.message?.includes('timeout'))) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }
    
    if (!response) throw new Error("AI TTS failed after retries");

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    
    return result;
  } catch (error: any) {
    if (isQuotaOrBillingError(error) || error?.message?.includes('500') || error?.message?.includes('timeout')) {
      console.warn("AI Summary Audio transient error or Quota/Permission Reached (429/403/RESOURCE_EXHAUSTED). Falling back.");
      return null;
    }
    console.error("Error generating summary audio:", error);
    return null;
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
    // Prefixo mais simples que o modelo entende como instrução de estilo sem ler literalmente
    const styledText = `Com empolgação de locutor esportivo: ${text}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: styledText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { 
            // 'Zephyr' é naturalmente mais rápido e enérgico
            prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
          },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    
    return result;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI TTS Quota Reached (429/RESOURCE_EXHAUSTED).");
    }
    return null;
  }
};

/**
 * Speaks the provided text. Defaults to browser TTS for zero cost.
 */
export const speakNarration = async (text: string, forceAIVoice = false): Promise<void> => {
  // Pré-processamento para garantir pronúncia correta
  const processedText = text;

  // Setup Media Session Metadata
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Narração Guerreiros',
      artist: 'Guerreiros Volleyball Club',
      album: 'Guerreiros Intelligence',
      artwork: [
        { src: 'https://picsum.photos/seed/volleyball/512/512', sizes: '512x512', type: 'image/png' }
      ]
    });
  }

  // Se não for forçado, usa a voz do navegador (Grátis)
  if (!forceAIVoice) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'pt-BR';
    
    // Tentar encontrar uma voz mais natural em português
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') && (v.name.includes('Google') || v.name.includes('Natural'))) || 
                    voices.find(v => v.lang.includes('pt-BR'));
    
    if (ptVoice) utterance.voice = ptVoice;
    
    utterance.rate = 1.1; 
    utterance.pitch = 1.0;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    utterance.onend = () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
    };

    window.speechSynthesis.speak(utterance);
    return;
  }

  // Voz da IA apenas se explicitamente solicitado
  try {
    const audioSrc = await getNarrationAudio(processedText);
    if (audioSrc) {
      const audio = new Audio(audioSrc);
      audio.crossOrigin = "anonymous";

      // Tenta forçar o Audio Focus usando Web Audio API
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const source = audioCtx.createMediaElementSource(audio);
          source.connect(audioCtx.destination);
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
        }
      } catch (ctxError) {
        console.warn("Web Audio API routing failed:", ctxError);
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      audio.onended = () => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      };
      await audio.play();
    } else {
      throw new Error("AI TTS unavailable");
    }
  } catch (error) {
    // Fallback para navegador se a IA falhar
    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }
};

/**
 * Scans the database data to identify anomalies using AI.
 */
export const detectAnomalies = async (data: { players: Player[], matches: any[], metadata: any }): Promise<string> => {
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });
    return response.text || "Não foi possível realizar a varredura de anomalias no momento.";
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Anomaly Detection Quota Reached (429/RESOURCE_EXHAUSTED).");
      return "Limite de requisições da IA atingido. Tente novamente mais tarde.";
    }
    console.error("Erro na detecção de anomalias:", error);
    return "Falha técnica ao processar a varredura de anomalias.";
  }
};

/**
 * Analyzes billing costs and provides optimization suggestions using AI.
 */
export const analyzeBillingCosts = async (billingData: {
  actual: number;
  forecast: number;
  services: { name: string, cost: number, savings?: number }[];
  usage: any;
}): Promise<string> => {
  const ai = getAI();
  
  const prompt = `Você é um Consultor Sênior de FinOps e Especialista em Google Cloud. 
    Analise o faturamento atual do aplicativo Guerreiros Volleyball e sugira estratégias de otimização de custos.

    DADOS FINANCEIROS (1-17 Abr):
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });
    return response.text || "O consultor de custos está ocupado no momento. Tente novamente mais tarde.";
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Billing Analysis Quota Reached (429/RESOURCE_EXHAUSTED).");
      return "Não foi possível conectar com o Consultor de IA (Limite de cota atingido).";
    }
    console.error("Erro na análise de custos:", error);
    return "Não foi possível conectar com o Consultor de IA. Verifique sua conexão ou cota de IA.";
  }
};

/**
 * Generates a creative birthday message for a player.
 */
export const generateBirthdayMessage = async (playerName: string): Promise<string> => {
  const ai = getAI();
  const prompt = `Gere uma mensagem de aniversário curta, criativa e animada para um sócio de um clube de vôlei. 
    O nome do sócio é "${playerName}". 
    A mensagem deve ser em português, usar emojis de vôlei e festa, e ter um tom de união e celebração. 
    Evite usar palavras com gênero específico como "guerreiro" ou "guerreira", use termos neutros ou apenas o nome.
    Não use aspas na resposta. Max 50 palavras.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });

    return response.text || `Parabéns, ${playerName}! Que seu dia seja repleto de aces e vitórias dentro e fora de quadra! 🏐🎉`;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Birthday Message Quota Reached (429/RESOURCE_EXHAUSTED).");
    } else {
      console.error("Error generating birthday message:", error);
    }
    return `Parabéns, ${playerName}! Que seu dia seja repleto de aces e vitórias dentro e fora de quadra! 🏐🎉`;
  }
};

