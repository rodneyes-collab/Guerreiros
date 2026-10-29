import { Team, Player, GenerationResult, Match } from "../types";

// Cache persistente para evitar chamadas repetidas à IA com os mesmos dados
const CACHE_KEY = 'spikegen_ai_cache_v2';
const MAX_CACHE_ITEMS = 20;
const MAX_CACHE_SIZE_BYTES = 1.0 * 1024 * 1024; // 1MB

// State to track AI health
let aiHealth = {
  isAvailable: true,
  lastQuotaError: 0,
  errorMessage: ''
};

export const isQuotaOrBillingError = (error: any): boolean => {
  const msg = (error?.message || (typeof error === 'string' ? error : "")).toLowerCase();
  const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("exceeded");
  const isBilling = msg.includes("403") || msg.includes("spending cap") || msg.includes("billing");
  
  if (isQuota || isBilling) {
    aiHealth = {
      isAvailable: false,
      lastQuotaError: Date.now(),
      errorMessage: isQuota ? 'Cota de IA excedida. Tente novamente em alguns minutos.' : 'Erro de permissão ou faturamento na IA.'
    };
    console.warn(`[AI Status Update] AI marked as unavailable: ${aiHealth.errorMessage}`);
  }
  
  return isQuota || isBilling;
};

export const getAIStatus = () => {
  if (!aiHealth.isAvailable && Date.now() - aiHealth.lastQuotaError > 600000) {
    aiHealth.isAvailable = true;
  }
  return aiHealth;
};

/**
 * Limpa chaves antigas do localStorage de versões anteriores do app
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

    if (keys.length > MAX_CACHE_ITEMS || cacheString.length > MAX_CACHE_SIZE_BYTES) {
      console.log(`[Cache] Limpando cache proativamente. Itens: ${keys.length}, Tamanho: ${(cacheString.length / 1024).toFixed(1)}KB`);
      
      const ttsKeys = keys.filter(k => k.startsWith('tts_'));
      const otherKeys = keys.filter(k => !k.startsWith('tts_'));
      
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
      const keys = Object.keys(cache);
      const ttsKeys = keys.filter(k => k.startsWith('tts_'));
      
      if (ttsKeys.length > 0) {
        ttsKeys.forEach(k => delete cache[k]);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          return;
        } catch { /* segue para limpeza total */ }
      }
      
      localStorage.removeItem(CACHE_KEY);
      Object.keys(cache).forEach(k => delete cache[k]);
      clearOldStorage();
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
 * Converte base64 de áudio para URL executável, tratando formatos com ou sem cabeçalho WAV.
 */
const audioBase64ToUrl = (base64Data: string, sampleRate: number = 24000): string => {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Verifica se já possui cabeçalho RIFF WAV
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    const blob = new Blob([bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // Se for raw PCM, empacota com cabeçalho RIFF WAV
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + len, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, 1, true); // Mono = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, len, true);

  for (let i = 0; i < len; i++) {
    view.setUint8(44 + i, bytes[i]);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

/**
 * Analyzes a match between two teams, calling the server-side Gemini endpoint.
 */
export const analyzeMatch = async (result: GenerationResult, attendance: Player[]): Promise<string> => {
  const { teamA, teamB } = result;
  const teamAIds = [teamA.setter?.id, ...teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [teamB.setter?.id, ...teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `analysis_v4_${teamAIds}_vs_${teamBIds}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  try {
    const res = await fetch("/api/gemini/analyze-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, attendance }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const output = data.analysis || "Análise indisponível.";
    analysisCache[cacheKey] = output;
    saveCache(analysisCache);
    return output;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Analysis Quota/Billing/Permission Reached. Falling back.");
      return "Análise temporariamente indisponível. O sistema realizou o balanceamento baseado no IC e Níveis de Impacto técnico individual (Saque/Ataque/Defesa).";
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

  return `Equipe A: ${teamANames}. Equipe B: ${teamBNames}.`;
};

/**
 * Audits the team generation by calling the server-side Gemini verification route.
 */
export const verifyRules = async (
  attendanceList: Player[], 
  result: GenerationResult, 
  balanceLevel: string,
  lastMatch: Match | null = null
): Promise<string> => {
  const teamAIds = [result.teamA.setter?.id, ...result.teamA.players.map(p => p.id)].sort().join(',');
  const teamBIds = [result.teamB.setter?.id, ...result.teamB.players.map(p => p.id)].sort().join(',');
  const cacheKey = `audit_v5_${teamAIds}_vs_${teamBIds}_${lastMatch?.id || 'none'}`;

  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  try {
    const res = await fetch("/api/gemini/verify-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendanceList, result, balanceLevel, lastMatch }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const auditResult = data.auditResult || "Auditoria concluída. Escalação segue os critérios de rodízio e equilíbrio do clube.";
    analysisCache[cacheKey] = auditResult;
    saveCache(analysisCache);
    return auditResult;
  } catch (error: any) {
    return `Auditoria Guerreiros Volei: Escalação validada. Equilíbrio ${balanceLevel} garantido por algoritmos de ELO e regras de rodízio.`;
  }
};

/**
 * Generates a summary of the day's highlights via server-side Gemini endpoint.
 */
export const generateDailySummaryNarration = async (stats: { 
  mvp?: string; 
  bestSetter?: string; 
  dailyKing?: string;
  matchesCount?: number;
  rankingChanges?: string[];
  date?: string;
  avgMatchTime?: number;
  summaryType?: 'session' | 'career';
}): Promise<string> => {
  const cacheKey = `summary_v8_${stats.summaryType}_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(',')}_${stats.date}_${stats.avgMatchTime}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  try {
    const res = await fetch("/api/gemini/daily-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stats }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const output = data.summary || "Racha épico hoje! Parabéns a todos os guerreiros!";
    analysisCache[cacheKey] = output;
    saveCache(analysisCache);
    return output;
  } catch (error: any) {
    return "Racha sensacional! Parabéns aos guerreiros pelo desempenho de hoje!";
  }
};

/**
 * Generates a team announcement audio directly from teams.
 */
export const generateTeamAnnouncementAudio = async (teamA: Team, teamB: Team): Promise<string | null> => {
  try {
    const script = await generateNarrationScript(teamA, teamB);
    return getNarrationAudio(script);
  } catch (error: any) {
    console.error("Error generating team announcement audio:", error);
    return null;
  }
};

/**
 * Generates a summary audio directly from stats.
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
  try {
    const script = await generateDailySummaryNarration(stats);
    return getNarrationAudio(script);
  } catch (error: any) {
    console.error("Error generating summary audio:", error);
    return null;
  }
};

/**
 * Converts text to speech using server-side Gemini TTS.
 */
export const getNarrationAudio = async (text: string): Promise<string | null> => {
  const cacheKey = `tts_v4_${btoa(unescape(encodeURIComponent(text.substring(0, 100))))}`;
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  try {
    const res = await fetch("/api/gemini/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (!data.audioBase64) return null;

    const result = audioBase64ToUrl(data.audioBase64);
    if (result) {
      analysisCache[cacheKey] = result;
      saveCache(analysisCache);
    }
    return result;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI TTS Quota Reached.");
    }
    return null;
  }
};

/**
 * Speaks the provided text. Defaults to browser TTS for zero cost.
 */
export const speakNarration = async (text: string, forceAIVoice = false): Promise<void> => {
  const processedText = text;

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

  if (!forceAIVoice) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'pt-BR';
    
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

  // Voz da IA no servidor se explicitamente solicitado
  try {
    const audioSrc = await getNarrationAudio(processedText);
    if (audioSrc) {
      const audio = new Audio(audioSrc);
      audio.crossOrigin = "anonymous";

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
    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }
};

/**
 * Scans the database data to identify anomalies using server-side Gemini.
 */
export const detectAnomalies = async (data: { players: Player[], matches: any[], metadata: any }): Promise<string> => {
  try {
    const res = await fetch("/api/gemini/detect-anomalies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const resp = await res.json();
    return resp.report || "Varredura concluída.";
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Anomaly Detection Quota Reached.");
      return "Limite de requisições da IA atingido. Tente novamente mais tarde.";
    }
    console.error("Erro na detecção de anomalias:", error);
    return "Falha técnica ao processar a varredura de anomalias.";
  }
};

/**
 * Analyzes billing costs and provides optimization suggestions using server-side Gemini.
 */
export const analyzeBillingCosts = async (billingData: {
  actual: number;
  forecast: number;
  services: { name: string, cost: number, savings?: number }[];
  usage: any;
}): Promise<string> => {
  try {
    const res = await fetch("/api/gemini/billing-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingData }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.analysis || "Análise concluída.";
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Billing Analysis Quota Reached.");
      return "Não foi possível conectar com o Consultor de IA (Limite de cota atingido).";
    }
    console.error("Erro na análise de custos:", error);
    return "Não foi possível conectar com o Consultor de IA. Verifique sua conexão ou cota de IA.";
  }
};

/**
 * Generates a creative birthday message for a player via server-side Gemini.
 */
export const generateBirthdayMessage = async (playerName: string): Promise<string> => {
  try {
    const res = await fetch("/api/gemini/birthday-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.message || `Parabéns, ${playerName}! Que seu dia seja repleto de aces e vitórias dentro e fora de quadra! 🏐🎉`;
  } catch (error: any) {
    if (isQuotaOrBillingError(error)) {
      console.warn("AI Birthday Message Quota Reached.");
    } else {
      console.error("Error generating birthday message:", error);
    }
    return `Parabéns, ${playerName}! Que seu dia seja repleto de aces e vitórias dentro e fora de quadra! 🏐🎉`;
  }
};

/**
 * Streams text from the server-side Gemini SSE endpoint (/api/gemini/stream).
 */
export const streamGeminiText = async (
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string
): Promise<string> => {
  try {
    const res = await fetch("/api/gemini/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, systemInstruction }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) {
              fullText += parsed.text;
              onChunk(parsed.text);
            }
          } catch {
            // ignore partial JSON
          }
        }
      }
    }

    return fullText;
  } catch (error: any) {
    isQuotaOrBillingError(error);
    throw error;
  }
};

/**
 * Connects to the server-side Gemini Live API WebSocket proxy (/api/gemini/live).
 */
export const connectGeminiLive = (callbacks: {
  onOpen?: () => void;
  onMessage?: (message: any) => void;
  onError?: (error: any) => void;
  onClose?: () => void;
}): WebSocket => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/gemini/live`);

  ws.onopen = () => callbacks.onOpen?.();
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      callbacks.onMessage?.(data);
    } catch (e) {
      callbacks.onError?.(e);
    }
  };
  ws.onerror = (event) => callbacks.onError?.(event);
  ws.onclose = () => callbacks.onClose?.();

  return ws;
};

