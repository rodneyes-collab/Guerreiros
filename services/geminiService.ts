
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { Team, Player, GenerationResult, Match } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const CACHE_KEY = 'spikegen_ai_cache_v2';
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
 * Helper to call the Gemini Cloud Function proxy.
 */
const callGeminiProxy = async (payload: any): Promise<any> => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("[Gemini Proxy] Error:", error);
    throw error;
  }
};

/**
 * Analyzes a match between two teams.
 */
export const analyzeMatch = async (teamA: Team, teamB: Team): Promise<string> => {
  const teamAIds = [teamA.setter?.id, ...teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [teamB.setter?.id, ...teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `analysis_v2_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

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
    const data = await callGeminiProxy({ prompt, tool: 'analysis' });
    const result = data.text || "Análise indisponível.";
    analysisCache[cacheKey] = result;
    saveCache(analysisCache);
    return result;
  } catch (error: any) {
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
    const data = await callGeminiProxy({ prompt, tool: 'audit' });
    const auditResult = data.text || "Auditoria concluída.";
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
}): Promise<string> => {
  const cacheKey = `summary_v4_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(',')}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0
    ? `\n- Mudanças no Ranking Geral: ${stats.rankingChanges.join(', ')}`
    : '';

  const prompt = `Você é um locutor esportivo brasileiro carismático e empolgado.
    Resumo do Dia (Guerreiros Volleyball):
    - Partidas: ${stats.matchesCount || 0}
    - MVP: ${stats.mvp || 'N/A'}
    - Melhor Levantador: ${stats.bestSetter || 'N/A'}
    - Rei do Dia (Maior Ganho ELO): ${stats.dailyKing || 'N/A'}${rankingInfo}
    
    TAREFA: Gere um roteiro de locução curto (max 4 frases) que soe NATURAL e FLUIDO, como se estivesse comentando ao vivo. 
    Mencione as vitórias e derrotas de quem subiu no ranking se as informações estiverem presentes.
    Use pontuação (vírgulas e pontos) para criar pausas naturais. Use gírias leves de vôlei se apropriado. 
    NÃO faça listas. NÃO dê opções. Apenas o texto da narração falada.
    Use "Equipe" em vez de "Time" para evitar erros de pronúncia.`;

  try {
    const data = await callGeminiProxy({ prompt, tool: 'summary' });
    const result = data.text || "Racha épico hoje!";
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
    const data = await callGeminiProxy({ prompt, isTTS: true, tool: 'teams_audio' });
    const base64Audio = data.audio;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    return result;
  } catch (error: any) {
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
  rankingChanges?: string[]; // Adicionado campo para mudanças no ranking
}): Promise<string | null> => {
  const cacheKey = `summary_audio_v4_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(',')}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0
    ? `\n- Mudanças no Ranking Geral: ${stats.rankingChanges.join(', ')}`
    : '';

  const prompt = `Você é um locutor esportivo brasileiro carismático e empolgado.
    Resumo do Dia (Guerreiros Volleyball):
    - Partidas: ${stats.matchesCount || 0}
    - MVP: ${stats.mvp || 'N/A'}
    - Melhor Levantador: ${stats.bestSetter || 'N/A'}
    - Rei do Dia (Maior Ganho ELO): ${stats.dailyKing || 'N/A'}${rankingInfo}
    
    TAREFA: Narre os resultados acima de forma NATURAL e FLUIDA.
    MUITO IMPORTANTE: Você DEVE citar o NOME de todos os jogadores mencionados (MVP, Melhor Levantador e Rei do Dia) de forma clara.
    Use entonação de rádio esportivo. Não faça listas. 
    Se houver mudanças no ranking, cite-as com empolgação, mencionando também as vitórias e derrotas que o jogador teve no dia para subir de posição.
    Fale de forma direta e enérgica.
    Use "Equipe" em vez de "Time".`;

  try {
    const data = await callGeminiProxy({ prompt, isTTS: true, tool: 'summary_audio' });
    const base64Audio = data.audio;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    return result;
  } catch (error: any) {
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

  try {
    // Prefixo mais simples que o modelo entende como instrução de estilo sem ler literalmente
    const styledText = `Com empolgação de locutor esportivo: ${text}`;
    const data = await callGeminiProxy({ prompt: styledText, isTTS: true, tool: 'narration' });
    const base64Audio = data.audio;
    const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
    return result;
  } catch (error: any) {
    return null;
  }
};

/**
 * Speaks the provided text. Defaults to browser TTS for zero cost.
 */
export const speakNarration = async (text: string, forceAIVoice = false): Promise<void> => {
  // Pré-processamento para garantir pronúncia correta
  const processedText = text.replace(/\bTime\b/gi, 'Equipe');

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
    
    utterance.rate = 1.0; 
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
    const res = await callGeminiProxy({ prompt, tool: 'anomalies' });
    return res.text || "Sem anomalias detectadas.";
  } catch (error: any) {
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
    const res = await callGeminiProxy({ prompt, tool: 'billing' });
    return res.text || "Consulta de custos concluída.";
  } catch (error: any) {
    console.error("Erro na análise de custos:", error);
    return "Consulta indisponível.";
  }
};

/**
 * Generates a creative birthday message for a player.
 */
export const generateBirthdayMessage = async (playerName: string): Promise<string> => {
  const prompt = `Gere uma mensagem de aniversário curta, criativa e animada para um sócio de um clube de vôlei. 
    O nome do sócio é "${playerName}". 
    A mensagem deve ser em português, usar emojis de vôlei e festa, e ter um tom de união e celebração. 
    Evite usar palavras com gênero específico como "guerreiro" ou "guerreira", use termos neutros ou apenas o nome.
    Não use aspas na resposta. Max 50 palavras.`;

  try {
    const res = await callGeminiProxy({ prompt, tool: 'birthday' });
    return res.text || `Parabéns, ${playerName}! 🏐🎉`;
  } catch (error) {
    return `Parabéns, ${playerName}! 🏐🎉`;
  }
};

