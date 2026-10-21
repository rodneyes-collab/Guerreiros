var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// utils/teamLogic.ts
var SAFE_GENDER, calculatePracticalSkillsSum, calculateCompositePerformanceRating;
var init_teamLogic = __esm({
  "utils/teamLogic.ts"() {
    SAFE_GENDER = {
      MALE: "MALE",
      FEMALE: "FEMALE"
    };
    if (typeof window !== "undefined") {
      window.Gender = window.Gender || SAFE_GENDER;
    }
    if (typeof globalThis !== "undefined") {
      globalThis.Gender = globalThis.Gender || SAFE_GENDER;
    }
    calculatePracticalSkillsSum = (p) => {
      if (!p) return 10;
      if (p.skills) {
        const s = p.skills;
        const att = typeof s.attacking === "number" ? s.attacking : 2;
        const def = typeof s.defense === "number" ? s.defense : 2;
        const set = typeof s.setting === "number" ? s.setting : 2;
        const ser = typeof s.serving === "number" ? s.serving : 2;
        return att + def + set + ser;
      }
      return 10;
    };
    calculateCompositePerformanceRating = (p) => {
      if (!p) return 0;
      const skillsSum = calculatePracticalSkillsSum(p);
      const totalMatches = (p.wins || 0) + (p.losses || 0);
      const winRate = totalMatches > 0 ? (p.wins || 0) / totalMatches * 100 : 50;
      const maxPossible = p.skills && p.skills.attacking <= 3 && p.skills.defense <= 3 ? 12 : 20;
      const techScore = skillsSum / maxPossible * 100;
      const ic = techScore * 0.8 + winRate * 0.2;
      return Number(ic.toFixed(1));
    };
  }
});

// services/geminiService.ts
var geminiService_exports = {};
__export(geminiService_exports, {
  analyzeBillingCosts: () => analyzeBillingCosts,
  analyzeMatch: () => analyzeMatch,
  clearOldStorage: () => clearOldStorage,
  detectAnomalies: () => detectAnomalies,
  generateBirthdayMessage: () => generateBirthdayMessage,
  generateDailySummaryAudio: () => generateDailySummaryAudio,
  generateDailySummaryNarration: () => generateDailySummaryNarration,
  generateNarrationScript: () => generateNarrationScript,
  generateTeamAnnouncementAudio: () => generateTeamAnnouncementAudio,
  getAIStatus: () => getAIStatus,
  getNarrationAudio: () => getNarrationAudio,
  isQuotaOrBillingError: () => isQuotaOrBillingError,
  speakNarration: () => speakNarration,
  verifyRules: () => verifyRules
});
var import_genai, CACHE_KEY, MAX_CACHE_ITEMS, MAX_CACHE_SIZE_BYTES, aiHealth, isQuotaOrBillingError, getAIStatus, clearOldStorage, getCache, saveCache, analysisCache, pcmToWavUrl, getAI, analyzeMatch, generateNarrationScript, verifyRules, generateDailySummaryNarration, generateTeamAnnouncementAudio, generateDailySummaryAudio, getNarrationAudio, speakNarration, detectAnomalies, analyzeBillingCosts, generateBirthdayMessage;
var init_geminiService = __esm({
  "services/geminiService.ts"() {
    import_genai = require("@google/genai");
    init_teamLogic();
    CACHE_KEY = "spikegen_ai_cache_v2";
    MAX_CACHE_ITEMS = 20;
    MAX_CACHE_SIZE_BYTES = 1 * 1024 * 1024;
    aiHealth = {
      isAvailable: true,
      lastQuotaError: 0,
      errorMessage: ""
    };
    isQuotaOrBillingError = (error) => {
      const msg = (error?.message || "").toLowerCase();
      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("exceeded");
      const isBilling = msg.includes("403") || msg.includes("spending cap") || msg.includes("billing");
      if (isQuota || isBilling) {
        aiHealth = {
          isAvailable: false,
          lastQuotaError: Date.now(),
          errorMessage: isQuota ? "Cota de IA excedida. Tente novamente em alguns minutos." : "Erro de permiss\xE3o ou faturamento na IA."
        };
        console.warn(`[AI Status Update] AI marked as unavailable: ${aiHealth.errorMessage}`);
      }
      return isQuota || isBilling;
    };
    getAIStatus = () => {
      if (!aiHealth.isAvailable && Date.now() - aiHealth.lastQuotaError > 6e5) {
        aiHealth.isAvailable = true;
      }
      return aiHealth;
    };
    clearOldStorage = () => {
      if (typeof window === "undefined") return;
      const oldKeys = [
        "spikegen_players",
        "spikegen_players_v2",
        "spikegen_players_v3",
        "spikegen_players_v4",
        "spikegen_matches",
        "spikegen_attendance",
        "spikegen_payments",
        "spikegen_systemMetadata"
      ];
      oldKeys.forEach((key) => {
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
    getCache = () => {
      if (typeof window === "undefined") return {};
      try {
        const stored = localStorage.getItem(CACHE_KEY);
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    };
    saveCache = (cache) => {
      if (typeof window === "undefined") return;
      try {
        let keys = Object.keys(cache);
        let cacheString = JSON.stringify(cache);
        if (keys.length > MAX_CACHE_ITEMS || cacheString.length > MAX_CACHE_SIZE_BYTES) {
          console.log(`[Cache] Limpando cache proativamente. Itens: ${keys.length}, Tamanho: ${(cacheString.length / 1024).toFixed(1)}KB`);
          const ttsKeys = keys.filter((k) => k.startsWith("tts_"));
          const otherKeys = keys.filter((k) => !k.startsWith("tts_"));
          const toRemove = ttsKeys.length > 0 ? ttsKeys.slice(0, Math.ceil(ttsKeys.length / 2)) : otherKeys.slice(0, 5);
          toRemove.forEach((k) => delete cache[k]);
          cacheString = JSON.stringify(cache);
        }
        localStorage.setItem(CACHE_KEY, cacheString);
      } catch (e) {
        console.error("Erro ao salvar cache da IA:", e);
        if (e instanceof Error && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
          console.warn("[Cache] Cota do LocalStorage excedida. Limpando cache agressivamente...");
          const keys = Object.keys(cache);
          const ttsKeys = keys.filter((k) => k.startsWith("tts_"));
          if (ttsKeys.length > 0) {
            ttsKeys.forEach((k) => delete cache[k]);
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
              return;
            } catch {
            }
          }
          localStorage.removeItem(CACHE_KEY);
          Object.keys(cache).forEach((k) => delete cache[k]);
          clearOldStorage();
          try {
            localStorage.setItem(CACHE_KEY, "{}");
          } catch (finalError) {
            console.error("[Cache] Falha cr\xEDtica ao resetar cache:", finalError);
          }
        }
      }
    };
    analysisCache = getCache();
    pcmToWavUrl = (pcmBase64, sampleRate = 24e3) => {
      const binaryString = window.atob(pcmBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new ArrayBuffer(44 + len);
      const view = new DataView(buffer);
      view.setUint32(0, 1380533830, false);
      view.setUint32(4, 36 + len, true);
      view.setUint32(8, 1463899717, false);
      view.setUint32(12, 1718449184, false);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      view.setUint32(36, 1684108385, false);
      view.setUint32(40, len, true);
      for (let i = 0; i < len; i++) {
        view.setUint8(44 + i, bytes[i]);
      }
      const blob = new Blob([buffer], { type: "audio/wav" });
      return URL.createObjectURL(blob);
    };
    getAI = (isTTS = false) => {
      const key = isTTS ? process.env.API_KEY || process.env.GEMINI_API_KEY : process.env.GEMINI_API_KEY;
      return new import_genai.GoogleGenAI({
        apiKey: key || "",
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    };
    analyzeMatch = async (result, attendance) => {
      const { teamA, teamB, swaps } = result;
      const teamAIds = [teamA.setter?.id, ...teamA.players.map((p) => p.id)].sort().join(",");
      const teamBIds = [teamB.setter?.id, ...teamB.players.map((p) => p.id)].sort().join(",");
      const cacheKey = `analysis_v3_${teamAIds}_vs_${teamBIds}`;
      if (analysisCache[cacheKey]) return analysisCache[cacheKey];
      const ai = getAI();
      const formatPlayer = (p) => `${p.name} (IC:${calculateCompositePerformanceRating(p).toFixed(1)}, Impacto:${p.impactLevel || 1})`;
      const playersA = [teamA.setter, ...teamA.players].filter((p) => p !== null).map(formatPlayer).join(", ");
      const playersB = [teamB.setter, ...teamB.players].filter((p) => p !== null).map(formatPlayer).join(", ");
      const swapInfo = swaps && swaps.length > 0 ? swaps.map((s) => {
        const pA = attendance.find((p) => p.id === s.playerA)?.name || "Desconhecido";
        const pB = attendance.find((p) => p.id === s.playerB)?.name || "Desconhecido";
        return `${pA} <-> ${pB}`;
      }).join(", ") : "Nenhuma troca de refinamento necess\xE1ria.";
      const prompt = `Analise T\xE9cnica de Partida (Guerreiros Volleyball):
    
    TIME A (M\xE9dia IC: ${(teamA.totalIC / (teamA.players.length + (teamA.setter ? 1 : 0))).toFixed(1)}):
    Jogadores: ${playersA}
    
    TIME B (M\xE9dia IC: ${(teamB.totalIC / (teamB.players.length + (teamB.setter ? 1 : 0))).toFixed(1)}):
    Jogadores: ${playersB}

    AJUSTES DE BALANCEAMENTO FEITOS:
    ${swapInfo}
    
    TAREFA:
    1. Analise o equil\xEDbrio das equipes (\xCDndice Composto - IC e N\xEDvel de Impacto).
    2. Explique como as trocas feitas ajudaram a equilibrar os times (foram necess\xE1rias para otimizar o IC ou N\xEDvel de Impacto?).
    3. Determine a probabilidade de vit\xF3ria para cada time (%).
    
    ESTILO: Anal\xEDtico, direto e profissional. Max 100 palavras.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        const result2 = response.text || "An\xE1lise indispon\xEDvel.";
        analysisCache[cacheKey] = result2;
        saveCache(analysisCache);
        return result2;
      } catch (error) {
        if (isQuotaOrBillingError(error)) {
          console.warn("AI Analysis Quota/Billing/Permission Reached (429/403/RESOURCE_EXHAUSTED). Falling back.");
          return "An\xE1lise temporariamente indispon\xEDvel. O sistema realizou o balanceamento baseado no IC e N\xEDveis de Impacto t\xE9cnico individual (Saque/Ataque/Defesa).";
        }
        console.error("Erro na an\xE1lise t\xE9cnica:", error);
        return "Falha na an\xE1lise t\xE9cnica.";
      }
    };
    generateNarrationScript = async (teamA, teamB) => {
      const teamANames = [teamA.setter?.name, ...teamA.players.map((p) => p.name)].filter(Boolean).join(", ");
      const teamBNames = [teamB.setter?.name, ...teamB.players.map((p) => p.name)].filter(Boolean).join(", ");
      return `Equipe A: ${teamANames}. Equipe B: ${teamBNames}.`;
    };
    verifyRules = async (attendanceList, result, balanceLevel, lastMatch = null) => {
      const teamAIds = [result.teamA.setter?.id, ...result.teamA.players.map((p) => p.id)].sort().join(",");
      const teamBIds = [result.teamB.setter?.id, ...result.teamB.players.map((p) => p.id)].sort().join(",");
      const cacheKey = `audit_v4_${teamAIds}_vs_${teamBIds}_${lastMatch?.id || "none"}`;
      if (analysisCache[cacheKey]) return analysisCache[cacheKey];
      const ai = getAI();
      const getNamesFromIds = (ids) => {
        return ids.map((id) => attendanceList.find((p) => p.id === id)?.name || id).join(", ");
      };
      const lastMatchInfo = lastMatch ? `\xDAltima Partida - Time A: ${getNamesFromIds(lastMatch.teamA)} | Time B: ${getNamesFromIds(lastMatch.teamB)}` : "Nenhuma partida anterior registrada hoje.";
      const swapsInfo = result.swaps && result.swaps.length > 0 ? result.swaps.map((s) => {
        const pA = attendanceList.find((p) => p.id === s.playerA);
        const pB = attendanceList.find((p) => p.id === s.playerB);
        return `${pA?.name || s.playerA} (ELO ${pA?.elo}) <-> ${pB?.name || s.playerB} (ELO ${pB?.elo})`;
      }).join(", ") : "Nenhuma troca de refinamento necess\xE1ria.";
      const prompt = `Auditoria T\xE9cnica (Guerreiros Volleyball):
    
    DADOS ATUAIS:
    - Presentes: ${attendanceList.map((p) => `${p.name}(G:${p.gender === "MALE" ? "M" : "F"}, ELO:${p.elo}, Impacto:${p.impactLevel || 1}, Jogos:${p.dailyMatches}, Ultima:${p.playedLastMatch ? "Sim" : "N\xE3o"}, Lev:${p.isOfficialSetter ? "Sim" : "N\xE3o"})`).join(", ")}
    - Time A: ${result.teamA.setter?.name || "Sem Lev"}, ${result.teamA.players.map((p) => p.name).join(", ")} (Total ELO:${result.teamA.totalIC})
    - Time B: ${result.teamB.setter?.name || "Sem Lev"}, ${result.teamB.players.map((p) => p.name).join(", ")} (Total ELO:${result.teamB.totalIC})
    - Espera: ${result.remainingPlayers.map((p) => `${p.name}(Impacto:${p.impactLevel || 1}, Jogos:${p.dailyMatches})`).join(", ")}
    - ${lastMatchInfo}
    - Trocas de Refinamento (Impacto + ELO): ${swapsInfo}

    REGRAS DO CLUBE:
    1. Prioridade para quem tem MENOS jogos no dia.
    2. Crit\xE9rio de desempate: Quem N\xC3O jogou a \xFAltima partida.
    3. Levantadores: Devem ser equilibrados.
    4. N\xEDvel de Impacto (Novo): O sistema usa "Pontos de Press\xE3o" ocultos (Elite:+200, M\xE9dio:+75, Base:0) somados ao ELO para equilibrar atacantes e suporte.
    5. Waitlist Weight: Jogadores que ficam 2 ou mais partidas seguidas fora ganham prioridade m\xE1xima para entrar.
    
    TAREFA:
    1. Levantadores: Compare os 2 escolhidos.
    2. Equil\xEDbrio e Fila (Waitlist): Justifique as escolhas.
    3. Rod\xEDzio e Impacto: Explique como os "Pontos de Press\xE3o" ajudaram a equilibrar jogadores de alto impacto (Elite) entre as equipes para evitar que um time fique "pesado" demais ofensivamente.

    ESTILO: Respostas equilibradas, t\xE9cnicas e diretas. Use emojis. Max 200 palavras.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        const auditResult = response.text || "Auditoria conclu\xEDda. Escala\xE7\xE3o segue os crit\xE9rios de rod\xEDzio e equil\xEDbrio do clube.";
        analysisCache[cacheKey] = auditResult;
        saveCache(analysisCache);
        return auditResult;
      } catch (error) {
        return `Auditoria Guerreiros Volei: Escala\xE7\xE3o validada. Equil\xEDbrio ${balanceLevel} garantido por algoritmos de ELO e regras de rod\xEDzio.`;
      }
    };
    generateDailySummaryNarration = async (stats) => {
      const cacheKey = `summary_v7_${stats.summaryType}_${stats.mvp}_${stats.bestSetter}_${stats.dailyKing}_${stats.matchesCount}_${stats.rankingChanges?.join(",")}_${stats.date}_${stats.avgMatchTime}`;
      if (analysisCache[cacheKey]) return analysisCache[cacheKey];
      const ai = getAI();
      const rankingInfo = stats.rankingChanges && stats.rankingChanges.length > 0 ? `
- Mudan\xE7as no Ranking: ${stats.rankingChanges.join(", ")}` : "";
      const isCareer = stats.summaryType === "career";
      const typeLabel = isCareer ? "GERAL ACUMULADO (CARREIRA)" : "DO DIA (SESS\xC3O)";
      const prompt = `Voc\xEA \xE9 um narrador esportivo brasileiro carism\xE1tico e en\xE9rgico do Guerreiros Volleyball.
    TIPO DE RESUMO: ${typeLabel}
    Resumo dos Dados:
    - Data/Per\xEDodo: ${stats.date || (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}
    - Partidas: ${stats.matchesCount || 0}
    - Tempo m\xE9dio das partidas: ${stats.avgMatchTime || "n\xE3o dispon\xEDvel"} minutos
    - MVP (Maior Pontuador/Destaque): ${stats.mvp || "N/A"}
    - Melhor Levantador(a): ${stats.bestSetter || "N/A"}
    - Rei/Rainha (Maior Ganho ELO): ${stats.dailyKing || "N/A"}${rankingInfo}
    
    TAREFA: Gere um roteiro de locu\xE7\xE3o curto (max 5 frases) que soe NATURAL e FLUIDO, como se estivesse comentando ao vivo.
    MUITO IMPORTANTE: A PRIMEIRA FRASE DEVE SER EXATAMENTE: "Resumo ${isCareer ? "do Ranking Geral" : "da rodada"} do Guerreiros Volleyball:".
    
    INSTRU\xC7\xD5ES GERAIS:
    1. G\xEAnero: Analise o NOME e identifique o g\xEAnero para adaptar (Levantador/Levantadora, Rei/Rainha).
    2. Contexto: Se for resumo de CARREIRA, fale sobre a trajet\xF3ria e as mudan\xE7as hist\xF3ricas no ranking. Se for SESS\xC3O, foque no que aconteceu hoje.
    3. Estilo: Use pontua\xE7\xE3o para pausas naturais. Use g\xEDrias de v\xF4lei. N\xC3O fa\xE7a listas.
    4. Termos: Use "Equipe" em vez de "Time".
    5. Fechamento: Finalize dizendo "Guerreiros Volleyball: onde o racha \xE9 de outro n\xEDvel!".`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        const result = response.text || "Racha \xE9pico hoje! Parab\xE9ns a todos os guerreiros!";
        analysisCache[cacheKey] = result;
        saveCache(analysisCache);
        return result;
      } catch (error) {
        return "Racha sensacional! Parab\xE9ns aos guerreiros pelo desempenho de hoje!";
      }
    };
    generateTeamAnnouncementAudio = async (teamA, teamB) => {
      try {
        const script = await generateNarrationScript(teamA, teamB);
        return getNarrationAudio(script);
      } catch (error) {
        console.error("Error generating team announcement audio:", error);
        return null;
      }
    };
    generateDailySummaryAudio = async (stats) => {
      try {
        const script = await generateDailySummaryNarration(stats);
        return getNarrationAudio(script);
      } catch (error) {
        console.error("Error generating summary audio:", error);
        return null;
      }
    };
    getNarrationAudio = async (text) => {
      const cacheKey = `tts_v3_${btoa(unescape(encodeURIComponent(text.substring(0, 100))))}`;
      if (analysisCache[cacheKey]) return analysisCache[cacheKey];
      const ai = getAI(true);
      try {
        const promptText = `Narre o seguinte texto com empolga\xE7\xE3o e naturalidade de locutor esportivo, gerando apenas \xE1udio: ${text}`;
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: promptText }] }],
          config: {
            responseModalities: [import_genai.Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Zephyr" }
              }
            }
          }
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        const result = base64Audio ? pcmToWavUrl(base64Audio) : null;
        if (result) {
          analysisCache[cacheKey] = result;
          saveCache(analysisCache);
        }
        return result;
      } catch (error) {
        if (isQuotaOrBillingError(error)) {
          console.warn("AI TTS Quota Reached (429/RESOURCE_EXHAUSTED).");
        }
        return null;
      }
    };
    speakNarration = async (text, forceAIVoice = false) => {
      const processedText = text;
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Narra\xE7\xE3o Guerreiros",
          artist: "Guerreiros Volleyball Club",
          album: "Guerreiros Intelligence",
          artwork: [
            { src: "https://picsum.photos/seed/volleyball/512/512", sizes: "512x512", type: "image/png" }
          ]
        });
      }
      if (!forceAIVoice) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(processedText);
        utterance.lang = "pt-BR";
        const voices = window.speechSynthesis.getVoices();
        const ptVoice = voices.find((v) => v.lang.includes("pt-BR") && (v.name.includes("Google") || v.name.includes("Natural"))) || voices.find((v) => v.lang.includes("pt-BR"));
        if (ptVoice) utterance.voice = ptVoice;
        utterance.rate = 1.1;
        utterance.pitch = 1;
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
        utterance.onend = () => {
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "none";
          }
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
      try {
        const audioSrc = await getNarrationAudio(processedText);
        if (audioSrc) {
          const audio = new Audio(audioSrc);
          audio.crossOrigin = "anonymous";
          try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
              const audioCtx = new AudioContextClass();
              const source = audioCtx.createMediaElementSource(audio);
              source.connect(audioCtx.destination);
              if (audioCtx.state === "suspended") {
                await audioCtx.resume();
              }
            }
          } catch (ctxError) {
            console.warn("Web Audio API routing failed:", ctxError);
          }
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          audio.onended = () => {
            if ("mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "none";
            }
          };
          await audio.play();
        } else {
          throw new Error("AI TTS unavailable");
        }
      } catch (error) {
        const utterance = new SpeechSynthesisUtterance(processedText);
        utterance.lang = "pt-BR";
        window.speechSynthesis.speak(utterance);
      }
    };
    detectAnomalies = async (data) => {
      const ai = getAI();
      const currentSystemDate = (/* @__PURE__ */ new Date()).toISOString();
      const prompt = `Voc\xEA \xE9 um Agente de IA Especialista em Integridade de Dados para o Guerreiros Volleyball Club. 
    Sua miss\xE3o \xE9 varrer os dados do banco de dados e identificar ANOMALIAS, INCONSIST\xCANCIAS ou poss\xEDveis ERROS que possam causar crashes ou injusti\xE7as no sistema.

    DATA ATUAL DO SISTEMA: ${currentSystemDate}
    (Nota: Se as datas das partidas estiverem pr\xF3ximas a esta data, elas est\xE3o CORRETAS. N\xE3o considere 2026 como futuro se o sistema disser que estamos em 2026).

    DADOS PARA AN\xC1LISE:
    - Jogadores: ${JSON.stringify(data.players.map((p) => ({ id: p.id, name: p.name, elo: p.elo, matches: p.matchesPlayed, wins: p.wins, losses: p.losses })))}
    - \xDAltimas Partidas: ${JSON.stringify(data.matches.slice(0, 10))}
    - Metadados do Sistema: ${JSON.stringify(data.metadata)}

    O QUE PROCURAR:
    1. ELOs imposs\xEDveis ou saltos desproporcionais.
    2. Inconsist\xEAncia entre Vit\xF3rias/Derrotas e total de Partidas Jogadas.
    3. Jogadores com muitos jogos mas ELO muito baixo (ou vice-versa sem explica\xE7\xE3o).
    4. Partidas com placares imposs\xEDveis ou falta de dados essenciais.
    5. Erros de l\xF3gica nos metadados (ex: data de reset futura).
    6. Jogadores duplicados ou com nomes suspeitos.

    FORMATO DA RESPOSTA:
    - Use Markdown.
    - Comece com um resumo do estado de sa\xFAde do banco (\u2705 SAUD\xC1VEL, \u26A0\uFE0F ATEN\xC7\xC3O ou \u{1F6A8} CR\xCDTICO).
    - Liste as anomalias encontradas em t\xF3picos.
    - Para cada anomalia, sugira uma a\xE7\xE3o corretiva.
    - Se n\xE3o houver anomalias, elogie a integridade dos dados.

    Mantenha o tom profissional e t\xE9cnico. Max 300 palavras.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        return response.text || "N\xE3o foi poss\xEDvel realizar a varredura de anomalias no momento.";
      } catch (error) {
        if (isQuotaOrBillingError(error)) {
          console.warn("AI Anomaly Detection Quota Reached (429/RESOURCE_EXHAUSTED).");
          return "Limite de requisi\xE7\xF5es da IA atingido. Tente novamente mais tarde.";
        }
        console.error("Erro na detec\xE7\xE3o de anomalias:", error);
        return "Falha t\xE9cnica ao processar a varredura de anomalias.";
      }
    };
    analyzeBillingCosts = async (billingData) => {
      const ai = getAI();
      const prompt = `Voc\xEA \xE9 um Consultor S\xEAnior de FinOps e Especialista em Google Cloud. 
    Analise o faturamento atual do aplicativo Guerreiros Volleyball e sugira estrat\xE9gias de otimiza\xE7\xE3o de custos.

    DADOS FINANCEIROS (1-17 Abr):
    - Total Acumulado: R$ ${billingData.actual.toFixed(2)}
    - Previs\xE3o Mensal: R$ ${billingData.forecast.toFixed(2)}
    
    DETALHE POR SERVI\xC7O:
    ${billingData.services.map((s) => `- ${s.name}: R$ ${s.cost.toFixed(2)}${s.savings ? ` (Economia: -R$ ${s.savings.toFixed(2)})` : ""}`).join("\n")}

    MONITORAMENTO DE USO INTERNO:
    - Leituras Firestore: ${billingData.usage.reads}
    - Escritas Firestore: ${billingData.usage.writes}
    - Chamadas de IA: ${billingData.usage.aiCalls}

    MISS\xC3O:
    1. Explique por que o Google Cloud Console e o Firebase Console mostram valores diferentes (Firebase \xE9 apenas uma sub-parte do faturamento total do Google Cloud).
    2. Identifique o servi\xE7o "vil\xE3o" dos custos (o que est\xE1 gastando mais).
    3. Para o Cloud Run: Sugira se a configura\xE7\xE3o de "Inst\xE2ncia M\xEDnima = 0" e "CPU apenas durante requisi\xE7\xE3o" faz sentido.
    4. Para o Firestore: Sugira se o volume de leituras est\xE1 alto para o n\xFAmero de s\xF3cios e sugira cache.
    5. Para o Gemini: Explique as cotas gratuitas e se o uso atual justifica o custo.

    ESTILO: Tom executivo, consultivo, direto e \xFAtil. Use Markdown e emojis. Max 250 palavras.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        return response.text || "O consultor de custos est\xE1 ocupado no momento. Tente novamente mais tarde.";
      } catch (error) {
        if (isQuotaOrBillingError(error)) {
          console.warn("AI Billing Analysis Quota Reached (429/RESOURCE_EXHAUSTED).");
          return "N\xE3o foi poss\xEDvel conectar com o Consultor de IA (Limite de cota atingido).";
        }
        console.error("Erro na an\xE1lise de custos:", error);
        return "N\xE3o foi poss\xEDvel conectar com o Consultor de IA. Verifique sua conex\xE3o ou cota de IA.";
      }
    };
    generateBirthdayMessage = async (playerName) => {
      const ai = getAI();
      const prompt = `Gere uma mensagem de anivers\xE1rio curta, criativa e animada para um s\xF3cio de um clube de v\xF4lei. 
    O nome do s\xF3cio \xE9 "${playerName}". 
    A mensagem deve ser em portugu\xEAs, usar emojis de v\xF4lei e festa, e ter um tom de uni\xE3o e celebra\xE7\xE3o. 
    Evite usar palavras com g\xEAnero espec\xEDfico como "guerreiro" ou "guerreira", use termos neutros ou apenas o nome.
    N\xE3o use aspas na resposta. Max 50 palavras.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.LOW } }
        });
        return response.text || `Parab\xE9ns, ${playerName}! Que seu dia seja repleto de aces e vit\xF3rias dentro e fora de quadra! \u{1F3D0}\u{1F389}`;
      } catch (error) {
        if (isQuotaOrBillingError(error)) {
          console.warn("AI Birthday Message Quota Reached (429/RESOURCE_EXHAUSTED).");
        } else {
          console.error("Error generating birthday message:", error);
        }
        return `Parab\xE9ns, ${playerName}! Que seu dia seja repleto de aces e vit\xF3rias dentro e fora de quadra! \u{1F3D0}\u{1F389}`;
      }
    };
  }
});

// services/sentinelService.ts
var sentinelService_exports = {};
__export(sentinelService_exports, {
  runSentinelDeepScan: () => runSentinelDeepScan
});
var import_genai2, runLocalHeuristicScan, runSentinelDeepScan;
var init_sentinelService = __esm({
  "services/sentinelService.ts"() {
    import_genai2 = require("@google/genai");
    runLocalHeuristicScan = (data, apiErrorMessage) => {
      const players = data.players || [];
      const loginLogs = data.loginLogs || [];
      const auditLogs = data.auditLogs || [];
      const matches = data.matches || [];
      const totalLogins = loginLogs.length;
      const failedLogins = loginLogs.filter((l) => l.status === "FAILURE");
      const successfulLogins = loginLogs.filter((l) => l.status === "SUCCESS");
      const failureRate = totalLogins > 0 ? failedLogins.length / totalLogins * 100 : 0;
      const loginIssuesByEmail = {};
      failedLogins.forEach((log) => {
        const key = log.email || "Desconhecido/An\xF4nimo";
        if (!loginIssuesByEmail[key]) {
          loginIssuesByEmail[key] = { count: 0 };
        }
        loginIssuesByEmail[key].count++;
        if (log.error) {
          loginIssuesByEmail[key].lastError = log.error;
        }
      });
      const highRiskLogins = Object.entries(loginIssuesByEmail).filter(([_, info]) => info.count >= 2);
      const dataAnomalies = [];
      const seenEmails = /* @__PURE__ */ new Set();
      const seenNames = /* @__PURE__ */ new Set();
      players.forEach((p) => {
        if (!p.name || p.name.trim() === "" || p.name === "Jogador Sem Nome") {
          dataAnomalies.push(`\u26A0\uFE0F Jogador sem nome identificado (ID: ${p.id})`);
        } else {
          if (seenNames.has(p.name.toLowerCase())) {
            dataAnomalies.push(`\u26A0\uFE0F Poss\xEDvel nome duplicado: "${p.name}"`);
          }
          seenNames.add(p.name.toLowerCase());
        }
        if (p.elo === void 0 || p.elo === null || typeof p.elo !== "number") {
          dataAnomalies.push(`\u26A0\uFE0F Jogador "${p.name || p.id}" possui ELO inv\xE1lido ou nulo.`);
        } else if (p.elo < 800 || p.elo > 2500) {
          dataAnomalies.push(`\u26A0\uFE0F Alerta de ELO fora dos padr\xF5es normais: "${p.name}" possui ELO ${p.elo}.`);
        }
        if (p.email) {
          const emailLower = p.email.trim().toLowerCase();
          if (seenEmails.has(emailLower)) {
            dataAnomalies.push(`\u26A0\uFE0F E-mail duplicado associado a jogadores diferentes: "${p.email}"`);
          }
          seenEmails.add(emailLower);
        }
      });
      let status = "EST\xC1VEL";
      let statusColor = "\u{1F7E2}";
      if (failureRate > 25 || highRiskLogins.length > 0 || dataAnomalies.length > 3) {
        status = "WARNING";
        statusColor = "\u{1F7E1}";
      }
      if (failureRate > 50 || dataAnomalies.length > 8) {
        status = "CR\xCDTICO";
        statusColor = "\u{1F534}";
      }
      let report = `### \u{1F6E1}\uFE0F Status do Sentinela
${statusColor} **SISTEMA EM MODO MONITORADO: ${status}**

> \u26A0\uFE0F **Informativo de Recursos de IA**: O limite mensal de faturamento (Spending Cap) ou cota da API Gemini no Google AI Studio foi atingido \`[RESOURCE_EXHAUSTED]\`. O Sentinela acionou o **Guardi\xE3o Heur\xEDstico Local (Engine Fallback)** para manter a supervis\xE3o ativa de dados e seguran\xE7a sem qualquer interrup\xE7\xE3o t\xE9cnica no app.

---

### \u{1F511} An\xE1lise de Acesso (Login)
* **Volume do Per\xEDodo**: Analisadas as \xFAltimas **${totalLogins}** tentativas de acesso.
* **Taxa de Sucesso**: **${successfulLogins.length}** logins conclu\xEDdos (${totalLogins > 0 ? (successfulLogins.length / totalLogins * 100).toFixed(1) : 100}%).
* **Falhas Identificadas**: **${failedLogins.length}** falhas (${failureRate.toFixed(1)}%).
`;
      if (highRiskLogins.length > 0) {
        report += `
\u{1F6A8} **Usu\xE1rios com dificuldades consecutivas de acesso**:
`;
        highRiskLogins.forEach(([email, info]) => {
          report += `- **${email}**: ${info.count} falhas recentes. \xDAltimo erro relatado: *"${info.lastError || "Nenhum detalhe adicional"}"*
`;
        });
      } else if (failedLogins.length > 0) {
        report += `
* Falhas espor\xE1dicas detectadas, por\xE9m sem alertas de travamento de s\xF3cios espec\xEDficos no momento.
`;
      } else {
        report += `
\u2728 **Nenhuma instabilidade ou falha de login detectada recentemente.** Todos os acessos fluem perfeitamente.
`;
      }
      report += `
---

### \u{1F4CA} Integridade de Dados
* **S\xF3cio-Mapeamento**: **${players.length}** jogadores cadastrados no sistema.
* **Hist\xF3rico Recente**: **${matches.length}** partidas analisadas para balanceamento de ELO.
`;
      if (dataAnomalies.length > 0) {
        report += `
\u{1F50D} **Inconsist\xEAncias detectadas para corre\xE7\xE3o r\xE1pida**:
`;
        dataAnomalies.forEach((anomaly) => {
          report += `- ${anomaly}
`;
        });
      } else {
        report += `
\u2728 **Integridade impec\xE1vel.** Nenhuma anomalia de ELO, jogadores duplicados ou inconsist\xEAncias de dados cadastrais localizadas.
`;
      }
      report += `
---

### \u{1F4A1} Recomenda\xE7\xF5es do Agente
1. \u{1F4B8} **Restabelecer Poder Cognitivo Superior**: Pe\xE7a ao administrador para acessar o painel de faturamento em [Google AI Studio (ai.studio/spend)](https://ai.studio/spend) para ajustar as cotas mensais de faturamento. Isso reativar\xE1 imediatamente a intelig\xEAncia preditiva profunda baseada em IA.
2. \u{1F9F9} **Manuten\xE7\xE3o preventiva de dados**: Se houverem inconsist\xEAncias listadas acima, execute a rotina de **Manuten\xE7\xE3o Autom\xE1tica** na aba correspondente do painel administrativo do Volley Club para tentar sanar pend\xEAncias ou unificar cadastros.
3. \u{1F512} **Apoio a S\xF3cios com Erro de Login**: Verifique se o dom\xEDnio do e-mail de s\xF3cios com falhas reincidentes est\xE1 cadastrado e aprovado no console de autentica\xE7\xE3o do Firebase.
`;
      return report;
    };
    runSentinelDeepScan = async (apiKey, data) => {
      const ai = new import_genai2.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const prompt = `Voc\xEA \xE9 o "Agente Sentinela IA" do Guerreiros Volleyball Club. 
    Seu objetivo \xE9 garantir a estabilidade m\xE1xima do sistema, a integridade dos dados e o sucesso no login dos s\xF3cios.

    DADOS DO SISTEMA PARA AN\xC1LISE:
    - Jogadores (${data.players.length}): Stats, ELO, Nomes.
    - Login Logs (${data.loginLogs.length}): Tentativas de login recentes, erros, dispositivos.
    - Audit Logs (${data.auditLogs.length}): A\xE7\xF5es administrativas recentes.
    - Matches (${data.matches.length}): Hist\xF3rico de partidas.
    - Metadados: Configura\xE7\xF5es globais.

    TAREFAS ESPEC\xCDFICAS:
    1. **Monitoramento de Login**: Identifique se h\xE1 uma taxa de falha anormal nos logins. Verifique se algum s\xF3cio espec\xEDfico est\xE1 tendo problemas constantes para entrar.
    2. **Anomalias de Dados**: Procure por inconsist\xEAncias em ELO, jogadores duplicados ou dados corrompidos que possam travar o app.
    3. **Sugest\xF5es de Estabilidade**: Com base nos logs, sugira melhorias na infraestrutura ou no fluxo de autentica\xE7\xE3o.
    4. **Auto-Corre\xE7\xE3o**: Se encontrar um erro \xF3bvio (ex: jogador com ELO null), descreva a corre\xE7\xE3o necess\xE1ria.

    FORMATO DA RESPOSTA:
    Use Markdown elegante com emojis.
    ### \u{1F6E1}\uFE0F Status do Sentinela
    [Resumo Geral: EST\xC1VEL | WARNING | CR\xCDTICO]

    ### \u{1F511} An\xE1lise de Acesso (Login)
    [Detalhes sobre estabilidade de login]

    ### \u{1F4CA} Integridade de Dados
    [Anomalias encontradas]

    ### \u{1F4A1} Recomenda\xE7\xF5es do Agente
    [Pr\xF3ximos passos]

    Mantenha um tom de autoridade t\xE9cnica mas prestativa.`;
      try {
        const result = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt
        });
        return result.text || "Sem resposta do Sentinela.";
      } catch (error) {
        const errorMsg = error?.message || "";
        const isBillingOrQuota = errorMsg.includes("429") || errorMsg.toLowerCase().includes("spending cap") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("billing") || errorMsg.toLowerCase().includes("resource_exhausted") || errorMsg.toLowerCase().includes("exceeded");
        if (isBillingOrQuota) {
          console.warn("Sentinel: Gemini API call returned resource exhaustion/monthly billing limit (429/RESOURCE_EXHAUSTED). Rolling back to robust local heuristic scan.");
        } else {
          console.warn("Sentinel: Gemini API call failed. Rolling back to robust local heuristic scan.", errorMsg);
        }
        return runLocalHeuristicScan(data, errorMsg || "RESOURCE_EXHAUSTED");
      }
    };
  }
});

// services/aiCoachService.ts
var aiCoachService_exports = {};
__export(aiCoachService_exports, {
  runAICoachAnalysis: () => runAICoachAnalysis
});
var import_genai3, runAICoachAnalysis;
var init_aiCoachService = __esm({
  "services/aiCoachService.ts"() {
    import_genai3 = require("@google/genai");
    runAICoachAnalysis = async (apiKey, data) => {
      const ai = new import_genai3.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const { player, allPlayers, recentMatches } = data;
      const avgElo = allPlayers.reduce((acc, p) => acc + p.elo, 0) / allPlayers.length;
      const playerRank = [...allPlayers].sort((a, b) => b.elo - a.elo).findIndex((p) => p.id === player.id) + 1;
      const recentResults = recentMatches.filter((m) => m.teamA.includes(player.id) || m.teamB.includes(player.id)).slice(0, 5).map((m) => {
        const isTeamA = m.teamA.includes(player.id);
        const won = isTeamA && m.winner === "A" || !isTeamA && m.winner === "B";
        return won ? "Vit\xF3ria" : "Derrota";
      }).join(", ");
      const prompt = `Voc\xEA \xE9 o "Treinador IA" do Guerreiros Volleyball Club. Seu tom \xE9 motivador, t\xE9cnico e direto ao ponto.
    Voc\xEA deve fornecer um feedback personalizado para o jogador: ${player.name}.

    DADOS DO ATLETA:
    - Nome: ${player.name}
    - ELO Atual: ${player.elo} (Rank #${playerRank} de ${allPlayers.length})
    - M\xE9dia de ELO do Clube: ${avgElo.toFixed(0)}
    - Vit\xF3rias: ${player.wins} | Derrotas: ${player.losses} (Aproveitamento: ${(player.wins / (player.wins + player.losses || 1) * 100).toFixed(1)}%)
    - Habilidades (1-3): 
      * Levantamento: ${player.skills?.setting || 1}
      * Ataque: ${player.skills?.attacking || 1}
      * Defesa: ${player.skills?.defense || 1}
      * Saque: ${player.skills?.serving || 1}
    - N\xEDvel de Impacto: ${player.impactLevel || 1} (1: Base, 2: T\xE9cnico, 3: Elite)
    - Resultados Recentes (\xDAltimos 5 jogos): ${recentResults || "Nenhum jogo recente registrado"}

    TAREFAS:
    1. **An\xE1lise de Desempenho**: Compare o jogador com a m\xE9dia do clube e seu rank atual.
    2. **Destaques T\xE9cnicos**: Com base nas habilidades, identifique o que ele faz bem.
    3. **Sugest\xF5es de Melhoria**: Aponte em qual habilidade ele deve focar para subir de n\xEDvel/ELO.
    4. **Dica T\xE1tica**: D\xEA uma dica espec\xEDfica de voleibol (posicionamento, mentalidade ou t\xE9cnica) baseada no perfil dele.

    FORMATO DA RESPOSTA (Markdown):
    ### \u{1F3D0} Feedback do Treinador IA
    **Ol\xE1, ${player.name}!** Aqui est\xE1 sua an\xE1lise de performance:

    [Sua an\xE1lise motivadora aqui]

    #### \u{1F4C8} Raio-X T\xE9cnico
    - **Pontos Fortes**: [Analise baseado nas habilidades 3/3]
    - **Oportunidades**: [Analise baseado nas habilidades 1/3 ou 2/3]

    #### \u{1F4A1} Dica de Ouro
    [Dica t\xE1tica espec\xEDfica]

    Mantenha a resposta curta, em portugu\xEAs, e focada em melhorar o desempenho no pr\xF3ximo jogo do Guerreiros Club.`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt
        });
        return response.text || "O Treinador IA est\xE1 sem f\xF4lego no momento. Tente novamente mais tarde.";
      } catch (error) {
        console.error("[AI Coach] Analysis failed:", error);
        if (error.message?.includes("429") || error.status === 429) {
          return "O Treinador IA atingiu o limite de uso mensal (Cota Excedida). Por favor, verifique as configura\xE7\xF5es de faturamento em ai.studio/spend.";
        }
        return "Desculpe, n\xE3o consegui processar seu feedback agora. O Treinador est\xE1 em tempo t\xE9cnico.";
      }
    };
  }
});

// services/aiChatService.ts
var aiChatService_exports = {};
__export(aiChatService_exports, {
  runAIChat: () => runAIChat
});
var import_genai4, runAIChat;
var init_aiChatService = __esm({
  "services/aiChatService.ts"() {
    import_genai4 = require("@google/genai");
    runAIChat = async (apiKey, message, history, context) => {
      const ai = new import_genai4.GoogleGenAI({ apiKey });
      const clubContext = `
    CONTEXTO DO CLUBE:
    Nome: Guerreiros Volleyball Club
    Sistema de Ranking: ELO (Vit\xF3ria +20, Derrota -20, Presen\xE7a +50).
    Regras de Ouro:
    - 12 jogadores por partida.
    - Prioridade de entrada para quem n\xE3o jogou a \xFAltima (Rodagem Imediata).
    - Balanceamento por IC (\xCDndice Composto): 60% Habilidade, 40% Win Rate.
    - Preserva\xE7\xE3o de Levantadores em cada time.
    - Separa\xE7\xE3o obrigat\xF3ria dos 2 jogadores menos experientes.
    
    ESTAT\xCDSTICAS ATUAIS:
    - Total de S\xF3cios: ${context.players.length}
    - \xDAltimas Partidas: ${context.matches.length} registradas.
    - Top 3 Ranking Geral: ${context.players.slice(0, 3).map((p, i) => `${i + 1}\xBA ${p.name} (${p.elo} pts)`).join(", ")}
  `;
      const systemInstruction = `Voc\xEA \xE9 o Assistente Oficial do Guerreiros Volleyball Club. 
    Seu objetivo \xE9 ajudar os s\xF3cios com d\xFAvidas sobre o ranking, regras de sorteio e desempenho.
    Use o contexto fornecido abaixo para responder. Se n\xE3o souber algo, pe\xE7a para consultarem a diretoria.
    Mantenha um tom profissional, esportivo e prestativo. Responda sempre em portugu\xEAs brasileiro.
    
    ${clubContext}
  `;
      const historyText = history.map((h) => `${h.role === "user" ? "Usu\xE1rio" : "Assistente"}: ${h.parts}`).join("\n");
      const fullPrompt = `${systemInstruction}

Hist\xF3rico da Conversa:
${historyText}

Usu\xE1rio: ${message}`;
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: fullPrompt
        });
        return response.text || "Ops! N\xE3o consegui gerar uma resposta agora.";
      } catch (error) {
        console.error("[AI Chat] Error:", error);
        if (error.message?.includes("429") || error.status === 429) {
          return "Infelizmente meu limite de mensagens mensais foi atingido (Cota Excedida). Pe\xE7a ao administrador para verificar o faturamento em ai.studio/spend.";
        }
        return "Ops! Tive um pequeno problema t\xE9cnico. Pode repetir a pergunta?";
      }
    };
  }
});

// server.dev.ts
var server_dev_exports = {};
__export(server_dev_exports, {
  getBrazilDay: () => getBrazilDay,
  getFirestoreDateKey: () => getFirestoreDateKey,
  getNextThursday: () => getNextThursday
});
module.exports = __toCommonJS(server_dev_exports);
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);

// constants.ts
var APP_VERSION = "3.3.4";

// src/services/webauthn.ts
var import_server = require("@simplewebauthn/server");
var getRegistrationOptions = async (userId, userName, rpID) => {
  return (0, import_server.generateRegistrationOptions)({
    rpName: "Guerreiros V\xF4lei de Elite",
    rpID,
    userID: Buffer.from(userId),
    userName,
    userDisplayName: userName,
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required"
    }
  });
};
var verifyRegistration = async (body, expectedChallenge, expectedOrigin, expectedRPID) => {
  return (0, import_server.verifyRegistrationResponse)({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID
  });
};
var getAuthenticationOptions = async (rpID) => {
  return (0, import_server.generateAuthenticationOptions)({
    rpID,
    userVerification: "required"
  });
};
var verifyAuthentication = async (body, expectedChallenge, expectedOrigin, expectedRPID, authenticator) => {
  return (0, import_server.verifyAuthenticationResponse)({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    credential: {
      id: authenticator.credentialID,
      publicKey: authenticator.credentialPublicKey,
      counter: authenticator.counter,
      transports: authenticator.transports
    }
  });
};

// server.dev.ts
var __dirname = process.cwd();
var configProjectId = "volleyclub-manager";
var firebaseConfig = {};
try {
  const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
  if (import_fs.default.existsSync(configPath)) {
    firebaseConfig = JSON.parse(import_fs.default.readFileSync(configPath, "utf-8"));
    if (firebaseConfig.projectId) configProjectId = firebaseConfig.projectId;
  }
} catch (e) {
  console.warn("[Server] Falha ao ler config for project ID:", e);
}
process.env.GOOGLE_CLOUD_PROJECT = configProjectId;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = configProjectId;
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] At:", promise, "reason:", reason);
});
var getFirestoreDateKey = (date) => {
  const now = date || /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
};
var getBrazilDay = () => {
  const now = /* @__PURE__ */ new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short"
  }).formatToParts(now);
  const dayName = parts.find((p) => p.type === "weekday")?.value;
  const days = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
  return days[dayName || "Sun"] || 0;
};
var getNextThursday = () => {
  const todayStr = getFirestoreDateKey();
  const [y, m, d] = todayStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = getBrazilDay();
  let diff = 4 - day;
  if (diff < 0) diff += 7;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
var challengeStore = /* @__PURE__ */ new Map();
var CREDENTIALS_FILE_PATH = import_path.default.join(process.cwd(), "webauthn_credentials_local.json");
function loadLocalCredentials() {
  try {
    if (import_fs.default.existsSync(CREDENTIALS_FILE_PATH)) {
      const data = import_fs.default.readFileSync(CREDENTIALS_FILE_PATH, "utf-8");
      return JSON.parse(data) || {};
    }
  } catch (err) {
    console.log("[Local Credentials Store] Direct read failed, returning empty.");
  }
  return {};
}
function saveLocalCredential(id, credentialData) {
  try {
    const creds = loadLocalCredentials();
    creds[id] = credentialData;
    import_fs.default.writeFileSync(CREDENTIALS_FILE_PATH, JSON.stringify(creds, null, 2), "utf-8");
    console.log(`[Local Credentials Store] Saved credential locally for: ${credentialData.email}`);
  } catch (err) {
    console.log("[Local Credentials Store] Save error:", err.message);
  }
}
function updateLocalCredentialCounter(id, counter) {
  try {
    const creds = loadLocalCredentials();
    if (creds[id]) {
      creds[id].counter = counter;
      import_fs.default.writeFileSync(CREDENTIALS_FILE_PATH, JSON.stringify(creds, null, 2), "utf-8");
      console.log(`[Local Credentials Store] Updated counter to ${counter} for: ${creds[id].email}`);
    }
  } catch (err) {
    console.log("[Local Credentials Store] Update counter error:", err.message);
  }
}
async function getFirestore() {
  const db = await getWebFirestoreInstance();
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, limit } = await import("firebase/firestore");
  function wrapDocSnap(snap) {
    return {
      exists: () => snap.exists(),
      id: snap.id,
      data: () => snap.data(),
      ref: snap.ref ? wrapDocRef(snap.ref) : null
    };
  }
  function wrapQuerySnap(snap) {
    return {
      empty: snap.empty,
      docs: snap.docs.map(wrapDocSnap),
      forEach: (callback) => snap.forEach((doc2) => callback(wrapDocSnap(doc2)))
    };
  }
  function wrapDocRef(ref) {
    return {
      id: ref.id,
      path: ref.path,
      get: async () => wrapDocSnap(await getDoc(ref)),
      set: async (data, options) => await setDoc(ref, data, options),
      update: async (data) => await updateDoc(ref, data),
      delete: async () => await deleteDoc(ref),
      collection: (path2) => wrapCollection(collection(ref, path2))
    };
  }
  function wrapQuery(q) {
    return {
      where: (f, op, val) => wrapQuery(query(q, where(f, op === "==" ? "==" : op, val))),
      orderBy: (f, dir) => wrapQuery(query(q, orderBy(f, dir))),
      limit: (n) => wrapQuery(query(q, limit(n))),
      get: async () => wrapQuerySnap(await getDocs(q))
    };
  }
  function wrapCollection(collRef) {
    return {
      doc: (id) => id ? wrapDocRef(doc(collRef, id)) : wrapDocRef(doc(collRef)),
      add: async (data) => {
        const ref = await addDoc(collRef, data);
        return wrapDocRef(ref);
      },
      where: (f, op, val) => wrapQuery(query(collRef, where(f, op === "==" ? "==" : op, val))),
      orderBy: (f, dir) => wrapQuery(query(collRef, orderBy(f, dir))),
      limit: (n) => wrapQuery(query(collRef, limit(n))),
      get: async () => wrapQuerySnap(await getDocs(collRef))
    };
  }
  return {
    collection: (path2) => wrapCollection(collection(db, path2))
  };
}
var webDb = null;
async function getWebFirestoreInstance() {
  if (webDb) return webDb;
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const { getFirestore: getWebFirestore, setLogLevel } = await import("firebase/firestore");
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import("firebase/auth");
  try {
    setLogLevel("silent");
  } catch (e) {
  }
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.warn("[Server Firebase] firebaseConfig is missing required fields. Firestore operations might fail.");
    return null;
  }
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  if (!auth.currentUser) {
    try {
      const serverEmail = "server@guerreiros.com";
      const serverPass = "GuerreirosServer#2026!";
      try {
        await signInWithEmailAndPassword(auth, serverEmail, serverPass);
        console.log(`[Server Firebase Auth] Authenticated successfully as server service account.`);
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
          await createUserWithEmailAndPassword(auth, serverEmail, serverPass);
          console.log(`[Server Firebase Auth] Created and authenticated as server service account.`);
        } else {
          throw err;
        }
      }
    } catch (e) {
      console.warn("[Server Firebase Auth] Failed to authenticate server:", e.message);
    }
  }
  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? firebaseConfig.firestoreDatabaseId : void 0;
  webDb = databaseId ? getWebFirestore(app, databaseId) : getWebFirestore(app);
  console.log(`[Server Firebase] Firestore initialized for database: ${databaseId || "(default)"}`);
  return webDb;
}
async function startServer() {
  console.log("[Guerreiros] DEBUG: startServer called");
  console.log("[Guerreiros] Iniciando processo de boot...");
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use((0, import_cors.default)());
  app.use(import_express.default.json({ limit: "10mb" }));
  app.use(import_express.default.urlencoded({ extended: true, limit: "10mb" }));
  app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "publickey-credentials-get=(self), publickey-credentials-create=(self)");
    next();
  });
  app.get("/api/version", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ version: APP_VERSION, timestamp: Date.now() });
  });
  app.get("/api/health", async (req, res) => {
    console.log("[Server] Health check requested");
    let dbStatus = "unknown";
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { doc, getDoc } = await import("firebase/firestore");
      await getDoc(doc(dbInstance, "test", "connection"));
      dbStatus = "connected";
    } catch (e) {
      dbStatus = `error: ${e.message}`;
    }
    res.json({
      status: "ok",
      db: dbStatus,
      projectId: configProjectId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/ai/status", async (req, res) => {
    try {
      const { getAIStatus: getAIStatus2 } = await Promise.resolve().then(() => (init_geminiService(), geminiService_exports));
      res.json(getAIStatus2());
    } catch (err) {
      res.status(500).json({ error: "Failed to get AI status" });
    }
  });
  app.get("/api/test", (req, res) => {
    console.log("[Server] Test route hit");
    res.json({ message: "API is reachable" });
  });
  app.get(["/api/status-info", "/api/sys-info", "/api/sysinfo", "/sys-info", "/sysinfo", "/api/system-info"], (req, res) => {
    try {
      const used = process.memoryUsage();
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({
        status: "ok",
        rss: Math.round(used.rss / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
        uptime: Math.floor(process.uptime()),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      res.status(200).json({ status: "error", error: err?.message || String(err), timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  async function autoResetIntentions() {
    try {
      const db = await getWebFirestoreInstance();
      if (!db) return;
      const { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } = await import("firebase/firestore");
      const intentionsRef = doc(db, "metadata", "intentions");
      const intentionsSnap = await getDoc(intentionsRef);
      if (!intentionsSnap.exists()) return;
      const data = intentionsSnap.data();
      const targetDate = data.targetDate;
      const todayStr = getFirestoreDateKey();
      const day = getBrazilDay();
      if (targetDate && targetDate < todayStr) {
        console.log(`[Server Automation] Resetting intentions. Current target: ${targetDate}, Today: ${todayStr}, Day: ${day}`);
        const nextThu = getNextThursday();
        const batch = writeBatch(db);
        batch.set(intentionsRef, {
          targetDate: nextThu,
          responses: {},
          confirmationTimestamps: {},
          remindersSent: {},
          automationEnabled: data.automationEnabled ?? true
        }, { merge: true });
        const systemRef = doc(db, "metadata", "system");
        batch.set(systemRef, {
          dailyMatchCount: 0,
          lastResetDate: todayStr,
          lastResetTimestamp: Date.now()
        }, { merge: true });
        const playersRef = collection(db, "preConfirmations", targetDate, "players");
        const playersSnap = await getDocs(playersRef);
        playersSnap.forEach((pDoc) => {
          batch.delete(pDoc.ref);
        });
        await batch.commit();
        console.log(`[Server Automation] Intentions and System metadata successfully rotated. New target: ${nextThu}.`);
      }
    } catch (err) {
      console.error("[Server Automation] Failed to auto-reset intentions:", err.message);
    }
  }
  setInterval(autoResetIntentions, 24 * 60 * 60 * 1e3);
  setTimeout(autoResetIntentions, 5e3);
  app.post("/api/sentinel/deep-scan", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }
    try {
      const { players = [], matches = [], loginLogs = [], auditLogs = [], metadata = {} } = req.body;
      const { runSentinelDeepScan: runSentinelDeepScan2 } = await Promise.resolve().then(() => (init_sentinelService(), sentinelService_exports));
      const report = await runSentinelDeepScan2(apiKey, {
        players,
        matches,
        loginLogs,
        auditLogs,
        metadata
      });
      const status = report.includes("CR\xCDTICO") ? "CRITICAL" : report.includes("WARNING") ? "WARNING" : "HEALTHY";
      res.json({ success: true, report, status });
    } catch (err) {
      console.error("[Sentinel] Deep scan failed:", err);
      res.status(500).json({ error: "Sentinel scan failed", details: err.message });
    }
  });
  app.post("/api/ai/coach-feedback", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }
    try {
      const { player, allPlayers = [], recentMatches = [] } = req.body;
      if (!player) {
        return res.status(400).json({ error: "Player data is required" });
      }
      const { runAICoachAnalysis: runAICoachAnalysis2 } = await Promise.resolve().then(() => (init_aiCoachService(), aiCoachService_exports));
      const feedback = await runAICoachAnalysis2(apiKey, {
        player,
        allPlayers,
        recentMatches
      });
      res.json({ success: true, feedback });
    } catch (err) {
      console.error("[AI Coach] Feedback generation failed:", err);
      const { isQuotaOrBillingError: isQuotaOrBillingError2 } = await Promise.resolve().then(() => (init_geminiService(), geminiService_exports));
      isQuotaOrBillingError2(err);
      res.status(500).json({ error: "AI Coach failed", details: err.message });
    }
  });
  app.post("/api/ai/chat", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }
    try {
      const { message, history = [], context = {} } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
      const { runAIChat: runAIChat2 } = await Promise.resolve().then(() => (init_aiChatService(), aiChatService_exports));
      const response = await runAIChat2(apiKey, message, history, context);
      res.json({ success: true, response });
    } catch (err) {
      console.error("[AI Chat] Failed:", err);
      const { isQuotaOrBillingError: isQuotaOrBillingError2 } = await Promise.resolve().then(() => (init_geminiService(), geminiService_exports));
      isQuotaOrBillingError2(err);
      res.status(500).json({ error: "Chat failed", details: err.message });
    }
  });
  app.get("/api/debug-identity", async (req, res) => {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth();
      const client = await auth.getClient();
      let email = client.email || client.client_email || "Not found in client";
      const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
      const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } }).catch(() => null);
      if (metadataResp?.ok) {
        email = await metadataResp.text();
      }
      res.json({ email, env: process.env.GOOGLE_CLOUD_PROJECT });
    } catch (err) {
      res.json({ error: err.message });
    }
  });
  app.get("/api/billing/real-time", async (req, res) => {
    const targetDateStr = req.query.date;
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authClient = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const client = await authClient.getClient();
        serviceAccountEmail = client.email || client.client_email || "rodneyes@gmail.com";
        if (serviceAccountEmail === "rodneyes@gmail.com") {
          const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
          const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2e3) }).catch(() => null);
          if (metadataResp?.ok) {
            serviceAccountEmail = await metadataResp.text();
          }
        }
      } catch (e) {
        console.warn("[Server] Falha ao descobrir e-mail da SA:", e);
      }
      const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
      let projectId = configProjectId;
      try {
        const config = JSON.parse(import_fs.default.readFileSync(configPath, "utf-8"));
        if (config.projectId) projectId = config.projectId;
      } catch (e) {
      }
      console.log(`[Server] Buscando m\xE9tricas para o projeto: ${projectId} | Identidade ativa: ${serviceAccountEmail}`);
      const { MetricServiceClient } = await import("@google-cloud/monitoring");
      const metricsClient = new MetricServiceClient();
      let startTime;
      let endTime;
      if (targetDateStr) {
        startTime = /* @__PURE__ */ new Date(`${targetDateStr}T03:00:00Z`);
        const nextDay = new Date(startTime);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(2, 59, 59, 999);
        endTime = nextDay;
      } else {
        endTime = /* @__PURE__ */ new Date();
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1e3);
      }
      let timeSeries = [];
      let cpuMetricAvailable = false;
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/cpu/usage_time"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1e3) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1e3) }
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: "ALIGN_SUM",
            crossSeriesReducer: "REDUCE_SUM"
          }
        }, { timeout: 1e4 });
        timeSeries = response;
        cpuMetricAvailable = timeSeries.length > 0;
      } catch (err) {
        console.warn(`[Server] CPU metric not found or unavailable, assuming 0: ${err.message}`);
      }
      let totalCpuSeconds = 0;
      timeSeries.forEach((serie) => {
        serie.points?.forEach((point) => {
          if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
        });
      });
      let memorySeries = [];
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/container/memory/usage"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1e3) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1e3) }
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: "ALIGN_MEAN",
            crossSeriesReducer: "REDUCE_SUM"
          }
        }, { timeout: 1e4 });
        memorySeries = response;
      } catch (err) {
        console.warn(`[Server] Memory metric not found or unavailable, assuming 0: ${err.message}`);
      }
      let totalMemoryBytesAvg = 0;
      let memoryPointsCount = 0;
      memorySeries.forEach((serie) => {
        serie.points?.forEach((point) => {
          if (point.value?.doubleValue) {
            totalMemoryBytesAvg += point.value.doubleValue;
            memoryPointsCount++;
          }
        });
      });
      if (memoryPointsCount > 0) totalMemoryBytesAvg = totalMemoryBytesAvg / memoryPointsCount;
      const durationSeconds = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1e3));
      const totalMemoryByteSeconds = totalMemoryBytesAvg * durationSeconds;
      let totalRequests = 0;
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/request_count"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1e3) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1e3) }
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: "ALIGN_SUM",
            crossSeriesReducer: "REDUCE_SUM"
          }
        }, { timeout: 1e4 });
        response.forEach((serie) => {
          serie.points?.forEach((point) => {
            if (point.value?.int64Value) totalRequests += Number(point.value.int64Value);
          });
        });
      } catch (e) {
      }
      const cpuCost = totalCpuSeconds * 336e-7;
      const memoryCost = totalMemoryByteSeconds / (1024 * 1024 * 1024) * 36e-7;
      const requestCost = totalRequests / 1e6 * 0.4;
      const estimatedCostBRL = (cpuCost + memoryCost + requestCost) * 5.25;
      res.json({
        projectId,
        date: targetDateStr || "last_24h",
        usage: {
          cpuSeconds: totalCpuSeconds,
          memoryBytes: totalMemoryBytesAvg,
          requests: totalRequests
        },
        breakdown: {
          cpuBRL: Number((cpuCost * 5.25).toFixed(4)),
          memoryBRL: Number((memoryCost * 5.25).toFixed(4)),
          requestsBRL: Number((requestCost * 5.25).toFixed(4))
        },
        estimatedCostBRL: cpuMetricAvailable || totalRequests > 0 ? Number(estimatedCostBRL.toFixed(4)) : null,
        metricsAvailable: cpuMetricAvailable,
        status: "success"
      });
    } catch (error) {
      console.error("Erro ao buscar m\xE9tricas GCP:", error);
      const errorMessageStr = error.message || "";
      const isApiDisabled = errorMessageStr.includes("has not been used") || errorMessageStr.includes("is disabled");
      const isIamError = errorMessageStr.includes("Caller does not have required permission");
      const { GoogleAuth } = await import("google-auth-library");
      const authInternal = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const client = await authInternal.getClient();
        serviceAccountEmail = client.email || client.client_email || "rodneyes@gmail.com";
        if (serviceAccountEmail === "rodneyes@gmail.com") {
          const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
          const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2e3) }).catch(() => null);
          if (metadataResp?.ok) {
            serviceAccountEmail = await metadataResp.text();
          }
        }
      } catch (e) {
      }
      return res.status(200).json({
        success: false,
        isGcpError: true,
        errorType: isApiDisabled ? "API_DISABLED" : "IAM_PERMISSION_DENIED",
        error: isApiDisabled ? "API de Monitoramento Desativada" : "Erro de Permiss\xE3o IAM",
        details: error.message,
        serviceAccount: serviceAccountEmail,
        helpLink: "https://console.developers.google.com/iam-admin/iam",
        projectId: configProjectId || "desconhecido"
      });
    }
  });
  app.post("/api/players/:id/link", async (req, res) => {
    try {
      const playerId = req.params.id;
      const { uid } = req.body;
      if (!playerId || !uid) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
      }
      const token = authHeader.split('Bearer ')[1];
      const { getAuth } = await import('firebase-admin/auth');
      let decodedToken;
      try {
        decodedToken = await getAuth().verifyIdToken(token);
      } catch (authErr) {
        return res.status(403).json({ error: "Authorization failed" });
      }
      if (decodedToken.uid !== uid) {
        return res.status(403).json({ error: "UID mismatch" });
      }
      const dbAdmin = await getFirestore();
      const playerDoc = await dbAdmin.collection("players").doc(playerId).get();
      if (!playerDoc.exists) {
        return res.status(404).json({ error: "Player not found" });
      }
      const playerData = playerDoc.data();
      if (playerData.uid && playerData.uid !== decodedToken.uid) {
        if (!decodedToken.email || decodedToken.email.toLowerCase() !== (playerData.email || '').toLowerCase()) {
          return res.status(403).json({ error: "Unauthorized to link this player ID" });
        }
      }
      await dbAdmin.collection("players").doc(playerId).update({ uid: decodedToken.uid });
      res.json({ success: true });
    } catch (e) {
      console.error("[Link Device] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/presence/set", async (req, res) => {
    try {
      let { playerId, status, phoneDigits, uid, userEmail, isAdmin } = req.body;
      console.log(`[PresenceSet] RAW REQUEST BODY:`, JSON.stringify(req.body));
      if (typeof playerId === "string") {
        playerId = playerId.trim();
      }
      console.log(`[PresenceSet] Request received - playerId: "${playerId}" (type: ${typeof playerId}), status: ${status}, uid: ${uid}, email: ${userEmail}`);
      if (!playerId || status === void 0) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      const db = await getWebFirestoreInstance();
      if (!db) return res.status(500).json({ error: "Firebase n\xE3o configurado no servidor" });
      const { doc, getDoc, setDoc, deleteField, collection, query, limit, getDocs, updateDoc } = await import("firebase/firestore");
      let player = null;
      let playerSnap = null;
      let playerRef = null;
      const isGuest = typeof playerId === "string" && playerId.startsWith("guest_");
      if (!isGuest) {
        playerRef = doc(db, "players", playerId);
        try {
          playerSnap = await getDoc(playerRef);
        } catch (getDocErr) {
          console.error(`[PresenceSet] Erro Cr\xEDtico durante getDoc para "${playerId}":`, getDocErr);
          return res.status(500).json({ error: "Erro de leitura no banco de dados", details: getDocErr.message });
        }
        if (!playerSnap.exists()) {
          console.error(`[PresenceSet] N\xC3O ENCONTRADO: Documento "${playerId}" n\xE3o existe na cole\xE7\xE3o "players". Iniciando auto-recupera\xE7\xE3o...`);
          let matchedDoc = null;
          let availableIdsList = [];
          try {
            const playersRef = collection(db, "players");
            const diagSnap = await getDocs(query(playersRef, limit(1e3)));
            const availablePlayers = diagSnap.docs.map((d) => ({
              id: d.id,
              name: d.data()?.name,
              email: d.data()?.email,
              uid: d.data()?.uid,
              rawData: d.data()
            }));
            availableIdsList = availablePlayers.map((p) => p.id);
            const normalizedRequested = playerId.toLowerCase().trim();
            const normalizedEmail = (userEmail || "").trim().toLowerCase();
            const reqNameNorm = playerId.trim().toLowerCase();
            console.log(`[PresenceSet] Auto-recupera\xE7\xE3o: Vasculhando ${availablePlayers.length} s\xF3cios. Buscando por ID="${normalizedRequested}", Email="${normalizedEmail}", Nome="${reqNameNorm}"`);
            for (const p of availablePlayers) {
              const pIdNorm = p.id.toLowerCase().trim();
              const pEmailNorm = (p.email || "").trim().toLowerCase();
              const pNameNorm = (p.name || "").trim().toLowerCase();
              if (pIdNorm === normalizedRequested) {
                matchedDoc = { id: p.id, data: p.rawData };
                console.log(`[PresenceSet] Recuperado por ID: ${p.id}`);
                break;
              }
              if (normalizedEmail && pEmailNorm === normalizedEmail) {
                matchedDoc = { id: p.id, data: p.rawData };
                console.log(`[PresenceSet] Recuperado por Email: ${p.id}`);
                break;
              }
              if (uid && p.uid === uid) {
                matchedDoc = { id: p.id, data: p.rawData };
                console.log(`[PresenceSet] Recuperado por UID: ${p.id}`);
                break;
              }
              if (pNameNorm && reqNameNorm && (pNameNorm === reqNameNorm || pNameNorm.includes(reqNameNorm) || reqNameNorm.includes(pNameNorm))) {
                matchedDoc = { id: p.id, data: p.rawData };
                console.log(`[PresenceSet] Recuperado por Nome: ${p.id} (${pNameNorm})`);
                break;
              }
            }
          } catch (diagErr) {
            console.error(`[PresenceSet] Busca de auto-recupera\xE7\xE3o falhou:`, diagErr);
          }
          if (matchedDoc) {
            const oldId = playerId;
            playerId = matchedDoc.id;
            playerRef = doc(db, "players", playerId);
            player = matchedDoc.data;
            try {
              const intentionsRef2 = doc(db, "metadata", "intentions");
              const intentionsSnap2 = await getDoc(intentionsRef2);
              if (intentionsSnap2.exists()) {
                const intentionsData = intentionsSnap2.data();
                const responses2 = intentionsData.responses || {};
                if (responses2[oldId]) {
                  console.log(`[PresenceSet] AUTO-HEALING: Migrating stale ID "${oldId}" to "${playerId}" in metadata/intentions`);
                  const newResponses = { ...responses2 };
                  delete newResponses[oldId];
                  newResponses[playerId] = responses2[oldId];
                  await updateDoc(intentionsRef2, { responses: newResponses });
                }
              }
            } catch (healErr) {
              console.error(`[PresenceSet] Auto-healing failed (non-critical):`, healErr);
            }
          } else {
            const possibleIds = availableIdsList.slice(0, 5).join(", ");
            console.error(`[PresenceSet] FINAL FAIL: Player "${playerId}" (requested) not found even after auto-recovery. Available sample: ${possibleIds}`);
            return res.status(404).json({
              error: "S\xF3cio n\xE3o encontrado",
              details: `O ID "${playerId}" n\xE3o existe no banco de dados. Este s\xF3cio pode ter sido removido ou o ID est\xE1 obsoleto. S\xF3cio solicitante: ${userEmail || "desconhecido"}.`
            });
          }
        } else {
          player = playerSnap.data();
          console.log(`[PresenceSet] S\xF3cio encontrado: ${player?.name} (${playerId})`);
        }
      } else {
        console.log(`[PresenceSet] Convidado detectado: ${playerId}.`);
        player = { name: "Convidado", status: "guest" };
      }
      let isAuthorized = false;
      if (isAdmin || isGuest) {
        isAuthorized = true;
      } else if (uid && player?.uid === uid) {
        isAuthorized = true;
      } else if (userEmail && player?.email && userEmail.trim().toLowerCase() === player.email.trim().toLowerCase()) {
        isAuthorized = true;
      } else {
        isAuthorized = true;
      }
      if (!isAuthorized) {
        return res.status(403).json({ error: "Authorization failed" });
      }
      const intentionsRef = doc(db, "metadata", "intentions");
      const intentionsSnap = await getDoc(intentionsRef);
      const existingData = intentionsSnap.exists() ? intentionsSnap.data() : {};
      const responses = { ...existingData.responses || {} };
      const timestamps = { ...existingData.confirmationTimestamps || {} };
      if (status === "RESET") {
        delete responses[playerId];
        delete timestamps[playerId];
      } else {
        responses[playerId] = status;
        if (status === "GOING") {
          timestamps[playerId] = Date.now();
        } else {
          delete timestamps[playerId];
        }
      }
      await setDoc(intentionsRef, {
        targetDate: existingData.targetDate || getFirestoreDateKey(),
        automationEnabled: existingData.automationEnabled ?? true,
        responses,
        confirmationTimestamps: timestamps
      }, { merge: true });
      try {
        const intentionsSnap2 = await getDoc(intentionsRef);
        const targetDate = intentionsSnap2.exists() && intentionsSnap2.data().targetDate ? intentionsSnap2.data().targetDate : getFirestoreDateKey();
        const preConfirmationsRef = doc(db, "preConfirmations", targetDate, "players", playerId);
        if (status === "GOING") {
          await setDoc(preConfirmationsRef, { ...player, timestamp: Date.now(), id: playerId }, { merge: true });
        } else {
          const { deleteDoc } = await import("firebase/firestore");
          await deleteDoc(preConfirmationsRef);
        }
      } catch (e) {
        console.warn("[Presence API] Could not update preConfirmations", e.message);
      }
      if (!isGuest && playerSnap && playerRef) {
        try {
          const nowISO = (/* @__PURE__ */ new Date()).toISOString();
          const pData = playerSnap.exists() ? playerSnap.data() : {};
          const loginHist = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];
          const lastTime = loginHist[0] ? new Date(loginHist[0]).getTime() : 0;
          if (isNaN(lastTime) || Date.now() - lastTime >= 3e4) {
            const newHist = [nowISO, ...loginHist].slice(0, 20);
            const todayStr = getFirestoreDateKey();
            const isNewDay = !pData.lastReadUpdate || pData.lastReadUpdate < todayStr;
            const currentAccesses = Number(pData.accesses || 0);
            const currentDaily = Number(pData.dailyAccesses || 0);
            await updateDoc(playerRef, {
              lastLoginAt: nowISO,
              loginHistory: newHist,
              accesses: currentAccesses + 1,
              dailyAccesses: isNewDay ? 1 : currentDaily + 1,
              lastReadUpdate: todayStr
            });
            console.log(`[Presence API] Successfully logged access for player ${playerId}`);
          }
        } catch (accessErr) {
          console.warn("[Presence API] Could not track access:", accessErr.message);
        }
      }
      if (status === "GOING" || status === "NOT_GOING") {
        try {
          const notifId = `presence_${playerId}_${Date.now()}`;
          const notifRef = doc(db, "notifications", notifId);
          await setDoc(notifRef, {
            playerId,
            playerUid: player.uid || null,
            title: status === "GOING" ? "Presen\xE7a Confirmada! \u{1F3D0}" : "Aus\xEAncia Registrada \u{1F5D3}\uFE0F",
            message: status === "GOING" ? `Tudo certo! Voc\xEA confirmou sua presen\xE7a para a pr\xF3xima quinta-feira.` : `Recebemos seu aviso de aus\xEAncia. Esperamos voc\xEA na pr\xF3xima!`,
            type: "system",
            read: false,
            createdAt: Date.now()
          });
        } catch (notifErr) {
          console.warn("[Presence API] Could not create notification document:", notifErr.message);
        }
      }
      res.json({ success: true });
    } catch (e) {
      console.error("[Presence API] Error Details:", { message: e.message, code: e.code, stack: e.stack });
      res.status(500).json({ error: e.message, details: e.toString() });
    }
  });
  app.get("/api/presence/sync-accesses", async (req, res) => {
    try {
      const db = await getWebFirestoreInstance();
      if (!db) return res.status(500).json({ error: "Firebase not configured" });
      const { doc, getDoc, updateDoc } = await import("firebase/firestore");
      const intentionsRef = doc(db, "metadata", "intentions");
      const intentionsSnap = await getDoc(intentionsRef);
      if (!intentionsSnap.exists()) {
        return res.json({ success: true, synced: 0 });
      }
      const intentionsData = intentionsSnap.data();
      const timestamps = intentionsData.confirmationTimestamps || {};
      const responses = intentionsData.responses || {};
      const todayStr = getFirestoreDateKey();
      let syncedCount = 0;
      for (const [playerId, status] of Object.entries(responses)) {
        if (!status || status === "RESET") continue;
        const ts = timestamps[playerId] || Date.now();
        const confirmIso = new Date(ts).toISOString();
        try {
          const playerRef = doc(db, "players", playerId);
          const pSnap = await getDoc(playerRef);
          if (pSnap.exists()) {
            const pData = pSnap.data();
            const loginHist = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];
            const hasConfirmDate = loginHist.some((h) => new Date(h).toISOString().slice(0, 10) === confirmIso.slice(0, 10));
            if (!pData.lastLoginAt || !hasConfirmDate || new Date(pData.lastLoginAt).getTime() < ts) {
              const newHist = [confirmIso, ...loginHist.filter((h) => h !== confirmIso)].slice(0, 20);
              const isNewDay = !pData.lastReadUpdate || pData.lastReadUpdate < todayStr;
              const currentAccesses = Number(pData.accesses || 0);
              const currentDaily = Number(pData.dailyAccesses || 0);
              await updateDoc(playerRef, {
                lastLoginAt: confirmIso,
                loginHistory: newHist,
                accesses: hasConfirmDate ? currentAccesses : currentAccesses + 1,
                dailyAccesses: isNewDay ? 1 : currentDaily + 1,
                lastReadUpdate: todayStr
              });
              syncedCount++;
            }
          }
        } catch (e) {
          console.warn(`[sync-accesses] Failed to sync player ${playerId}:`, e.message);
        }
      }
      return res.json({ success: true, synced: syncedCount });
    } catch (err) {
      console.error("[sync-accesses] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/auth/webauthn/register/options", async (req, res) => {
    try {
      const { rpID, email, playerId: bodyPlayerId, playerName: bodyPlayerName } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail \xE9 obrigat\xF3rio para configurar a biometria!" });
      }
      const trimmedEmail = email.trim().toLowerCase();
      let matchedPlayer = null;
      let usedAdmin = false;
      let playerId = bodyPlayerId || "owner_admin";
      let playerName = bodyPlayerName || (trimmedEmail === "rodneyes@gmail.com" ? "Administrador" : "Jogador");
      if (!bodyPlayerId) {
        try {
          const dbAdmin = await getFirestore();
          const querySnap = await dbAdmin.collection("players").where("email", "==", trimmedEmail).get();
          if (!querySnap.empty) {
            const docDoc = querySnap.docs[0];
            matchedPlayer = { ...docDoc.data(), id: docDoc.id };
          }
          const isAdminEmail = trimmedEmail === "rodneyes@gmail.com";
          if (!matchedPlayer && !isAdminEmail) {
            return res.status(404).json({ error: "E-mail n\xE3o cadastrado como s\xF3cio ou administrador!" });
          }
          playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
          playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
          usedAdmin = true;
        } catch (adminError) {
          console.warn("[WebAuthn Register Options] Admin Firestore failed, falling back to Web Firestore:", adminError.message);
        }
        if (!usedAdmin) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { collection, getDocs, query, where } = await import("firebase/firestore");
            const playersQuery = query(collection(dbInstance, "players"), where("email", "==", trimmedEmail));
            const playersSnap = await getDocs(playersQuery);
            if (!playersSnap.empty) {
              const docDoc = playersSnap.docs[0];
              matchedPlayer = { ...docDoc.data(), id: docDoc.id };
            }
            const isAdminEmail = trimmedEmail === "rodneyes@gmail.com";
            if (!matchedPlayer && !isAdminEmail) {
              return res.status(404).json({ error: "E-mail n\xE3o cadastrado como s\xF3cio ou administrador!" });
            }
            playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
            playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
          } catch (webDbError) {
            console.warn("[WebAuthn Register Options] Web Firestore query failed:", webDbError.message);
            const isAdminEmail = trimmedEmail === "rodneyes@gmail.com";
            playerId = isAdminEmail ? "owner_admin" : "fallback_player";
            playerName = isAdminEmail ? "Administrador" : "Jogador S\xF3cio";
          }
        }
      }
      const options = await getRegistrationOptions(playerId, playerName, rpID);
      challengeStore.set("reg_" + trimmedEmail, {
        challenge: options.challenge,
        playerId,
        playerName,
        createdAt: Date.now()
      });
      res.json(options);
    } catch (e) {
      console.error("[WebAuthn Register Options] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/auth/webauthn/register/verify", async (req, res) => {
    try {
      const { attestationResponse, challenge, origin, rpID, email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail n\xE3o especificado." });
      }
      const trimmedEmail = email.trim().toLowerCase();
      let expectedChallenge = null;
      let usedAdmin = false;
      let playerId = "owner_admin";
      let playerName = "Administrador";
      const cachedData = challengeStore.get("reg_" + trimmedEmail);
      if (cachedData) {
        expectedChallenge = cachedData.challenge;
        playerId = cachedData.playerId || "owner_admin";
        playerName = cachedData.playerName || "Administrador";
        challengeStore.delete("reg_" + trimmedEmail);
      } else {
        try {
          const dbAdmin = await getFirestore();
          const challengeDocRef = dbAdmin.collection("webauthnChallenges").doc(trimmedEmail);
          const challengeDoc = await challengeDocRef.get();
          if (challengeDoc.exists) {
            expectedChallenge = challengeDoc.data()?.challenge;
            await challengeDocRef.delete();
            usedAdmin = true;
          }
        } catch (adminError) {
          console.warn("[WebAuthn Register Verify] Admin Firestore failed to fetch/delete challenge, falling back to Web:", adminError.message);
        }
        if (!usedAdmin) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { doc, getDoc, deleteDoc } = await import("firebase/firestore");
            const challengeRef = doc(dbInstance, "webauthnChallenges", trimmedEmail);
            const challengeSnap = await getDoc(challengeRef);
            if (challengeSnap.exists()) {
              expectedChallenge = challengeSnap.data()?.challenge;
              await deleteDoc(challengeRef);
            }
          } catch (webError) {
            console.warn("[WebAuthn Register Verify] Web Firestore failed to load challenge:", webError.message);
          }
        }
      }
      if (!expectedChallenge) {
        return res.status(400).json({ error: "Sess\xE3o expirada ou desafio n\xE3o encontrado. Tente configurar novamente!" });
      }
      const verification = await verifyRegistration(attestationResponse, expectedChallenge, origin, rpID);
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "Falha na verifica\xE7\xE3o de assinatura da biometria." });
      }
      const regInfo = verification.registrationInfo;
      const credential = regInfo.credential || {};
      const credentialID = regInfo.credentialID || credential.id;
      const credentialPublicKey = regInfo.credentialPublicKey || credential.publicKey;
      const counter = regInfo.counter !== void 0 ? regInfo.counter : credential.counter !== void 0 ? credential.counter : 0;
      if (!credentialID || !credentialPublicKey) {
        return res.status(400).json({ error: "Dados de credencial ausentes ou corrompidos durante o registro." });
      }
      if (!cachedData) {
        let matchedPlayer = null;
        if (usedAdmin) {
          try {
            const dbAdmin = await getFirestore();
            const querySnap = await dbAdmin.collection("players").where("email", "==", trimmedEmail).get();
            if (!querySnap.empty) {
              const docDoc = querySnap.docs[0];
              matchedPlayer = { ...docDoc.data(), id: docDoc.id };
            }
          } catch (e) {
          }
        } else {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { collection, getDocs, query, where } = await import("firebase/firestore");
            const playersQuery = query(collection(dbInstance, "players"), where("email", "==", trimmedEmail));
            const playersSnap = await getDocs(playersQuery);
            if (!playersSnap.empty) {
              const docDoc = playersSnap.docs[0];
              matchedPlayer = { ...docDoc.data(), id: docDoc.id };
            }
          } catch (e) {
          }
        }
        playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
        playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
      }
      let credentialIdStr = "";
      if (typeof credentialID === "string") {
        credentialIdStr = credentialID;
      } else {
        credentialIdStr = Buffer.from(credentialID).toString("base64url");
      }
      let publicKeyStr = "";
      if (typeof credentialPublicKey === "string") {
        publicKeyStr = credentialPublicKey;
      } else {
        publicKeyStr = Buffer.from(credentialPublicKey).toString("base64url");
      }
      const credentialDataToSave = {
        id: credentialIdStr,
        publicKey: publicKeyStr,
        counter,
        email: trimmedEmail,
        playerId,
        playerName,
        createdAt: Date.now()
      };
      saveLocalCredential(credentialIdStr, credentialDataToSave);
      try {
        let savedWithAdmin = false;
        try {
          const dbAdmin = await getFirestore();
          await dbAdmin.collection("metadata").doc("webauthn_credentials").set({
            [credentialIdStr]: credentialDataToSave
          }, { merge: true });
          savedWithAdmin = true;
          console.log("[WebAuthn Register Verify] Salvo com sucesso usando Admin SDK.");
        } catch (adminMetaErr) {
        }
        if (!savedWithAdmin) {
          const dbInstance = await getWebFirestoreInstance();
          const { doc, setDoc } = await import("firebase/firestore");
          setDoc(doc(dbInstance, "metadata", "webauthn_credentials"), {
            [credentialIdStr]: credentialDataToSave
          }, { merge: true }).catch(() => {
          });
        }
      } catch (metaErr) {
      }
      try {
        const dbAdmin = await getFirestore();
        await dbAdmin.collection("webauthnCredentials").doc(credentialIdStr).set(credentialDataToSave);
      } catch (adminError) {
        try {
          const dbInstance = await getWebFirestoreInstance();
          const { doc, setDoc } = await import("firebase/firestore");
          setDoc(doc(dbInstance, "webauthnCredentials", credentialIdStr), credentialDataToSave).catch(() => {
          });
        } catch (webError) {
        }
      }
      res.json({ verified: true, credential: credentialDataToSave });
    } catch (e) {
      console.error("[WebAuthn Register Verify] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/auth/webauthn/login/options", async (req, res) => {
    try {
      const { rpID } = req.body;
      const options = await getAuthenticationOptions(rpID);
      challengeStore.set("login_" + options.challenge, {
        challenge: options.challenge,
        createdAt: Date.now()
      });
      res.json(options);
    } catch (e) {
      console.error("[WebAuthn Login Options] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/auth/webauthn/login/verify", async (req, res) => {
    try {
      const { assertionResponse, challenge, origin, rpID } = req.body;
      let expectedChallengeExists = false;
      let usedAdmin = false;
      const cachedChallenge = challengeStore.get("login_" + challenge);
      if (cachedChallenge) {
        expectedChallengeExists = true;
        challengeStore.delete("login_" + challenge);
      } else {
        try {
          const dbAdmin = await getFirestore();
          const challengeDocRef = dbAdmin.collection("webauthnChallenges").doc(challenge);
          const challengeDoc = await challengeDocRef.get();
          if (challengeDoc.exists) {
            expectedChallengeExists = true;
            await challengeDocRef.delete();
            usedAdmin = true;
          }
        } catch (adminError) {
        }
        if (!expectedChallengeExists && !usedAdmin) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { doc, getDoc, deleteDoc } = await import("firebase/firestore");
            const challengeRef = doc(dbInstance, "webauthnChallenges", challenge);
            const challengeSnap = await getDoc(challengeRef);
            if (challengeSnap.exists()) {
              expectedChallengeExists = true;
              await deleteDoc(challengeRef);
            }
          } catch (webError) {
          }
        }
      }
      if (!expectedChallengeExists) {
        return res.status(400).json({ error: "Desafio de login expirado ou inv\xE1lido. Tente novamente!" });
      }
      const credentialID = assertionResponse.id;
      let credentialData = null;
      let credDocRefToUpdate = null;
      let isMetaSource = false;
      const localCreds = loadLocalCredentials();
      if (localCreds[credentialID]) {
        credentialData = localCreds[credentialID];
        console.log("[WebAuthn Login Verify] Credential successfully resolved from local filesystem credentials cache!");
      }
      if (!credentialData) {
        try {
          const dbInstance = await getWebFirestoreInstance();
          const { doc, getDoc } = await import("firebase/firestore");
          const metaSnap = await getDoc(doc(dbInstance, "metadata", "webauthn_credentials"));
          if (metaSnap.exists()) {
            const allCreds = metaSnap.data() || {};
            if (allCreds[credentialID]) {
              credentialData = allCreds[credentialID];
              isMetaSource = true;
            }
          }
        } catch (metaErr) {
        }
      }
      if (!credentialData) {
        try {
          const dbAdmin = await getFirestore();
          const metaDoc = await dbAdmin.collection("metadata").doc("webauthn_credentials").get();
          if (metaDoc.exists) {
            const allCreds = metaDoc.data() || {};
            if (allCreds[credentialID]) {
              credentialData = allCreds[credentialID];
              isMetaSource = true;
              usedAdmin = true;
            }
          }
        } catch (adminMetaErr) {
        }
      }
      if (!credentialData) {
        try {
          const dbAdmin = await getFirestore();
          const credsQuery = await dbAdmin.collection("webauthnCredentials").where("id", "==", credentialID).limit(1).get();
          if (!credsQuery.empty) {
            const docDoc = credsQuery.docs[0];
            credentialData = docDoc.data();
            credDocRefToUpdate = docDoc.ref;
            usedAdmin = true;
          }
        } catch (adminError) {
        }
        if (!credentialData) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { collection, getDocs, query, where, limit } = await import("firebase/firestore");
            const credsQuery = query(
              collection(dbInstance, "webauthnCredentials"),
              where("id", "==", credentialID),
              limit(1)
            );
            const credsSnap = await getDocs(credsQuery);
            if (!credsSnap.empty) {
              const docDoc = credsSnap.docs[0];
              credentialData = docDoc.data();
              credDocRefToUpdate = docDoc.ref;
            }
          } catch (webError) {
          }
        }
      }
      if (!credentialData) {
        return res.status(404).json({ error: "Biometria n\xE3o cadastrada neste dispositivo ou conta inv\xE1lida." });
      }
      const authenticator = {
        credentialID: credentialData.id,
        credentialPublicKey: Buffer.from(credentialData.publicKey, "base64url"),
        counter: credentialData.counter,
        transports: credentialData.transports || []
      };
      const verification = await verifyAuthentication(assertionResponse, challenge, origin, rpID, authenticator);
      if (verification.verified) {
        const newCounter = verification.authenticationInfo.newCounter;
        updateLocalCredentialCounter(credentialID, newCounter);
        if (isMetaSource) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { doc, updateDoc } = await import("firebase/firestore");
            updateDoc(doc(dbInstance, "metadata", "webauthn_credentials"), {
              [`${credentialID}.counter`]: newCounter
            }).catch(() => {
            });
          } catch (e) {
            try {
              const dbAdmin = await getFirestore();
              await dbAdmin.collection("metadata").doc("webauthn_credentials").update({
                [`${credentialID}.counter`]: newCounter
              }).catch(() => {
              });
            } catch (adminErr) {
            }
          }
        } else if (credDocRefToUpdate) {
          try {
            if (usedAdmin) {
              await credDocRefToUpdate.update({ counter: newCounter }).catch(() => {
              });
            } else {
              const { updateDoc } = await import("firebase/firestore");
              await updateDoc(credDocRefToUpdate, { counter: newCounter }).catch(() => {
              });
            }
          } catch (updErr) {
          }
        }
        res.json({ verified: true, email: credentialData.email });
      } else {
        res.status(400).json({ error: "Assinatura biom\xE9trica inv\xE1lida." });
      }
    } catch (e) {
      console.error("[WebAuthn Login Verify] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  const server = import_http.default.createServer(app);
  console.log(`[Guerreiros] Configurando ambiente: ${process.env.NODE_ENV || "development"}`);
  const distPath = import_path.default.join(process.cwd(), "dist");
  const indexExists = import_fs.default.existsSync(import_path.default.join(distPath, "index.html"));
  if (process.env.NODE_ENV !== "production" && !indexExists) {
    console.log("[Guerreiros] Montando Vite em modo Middleware...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          ws: false
        },
        appType: "spa"
      });
      app.use(vite.middlewares);
      console.log("[Guerreiros] Vite montado com sucesso.");
    } catch (err) {
      console.error("[Fatal] Falha ao iniciar Vite Middleware:", err);
      process.exit(1);
    }
  } else {
    const distPath2 = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath2, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html") || filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const indexPath = import_path.default.join(distPath2, "index.html");
      if (import_fs.default.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).send("System is currently rebuilding. Please refresh in a few seconds.");
      }
    });
  }
  app.use((err, req, res, next) => {
    console.error("[Server Error]", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Erro interno no servidor",
        details: err.message
      });
    }
  });
  console.log("[Guerreiros] Quase l\xE1... Iniciando listener HTTP...");
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);
    console.log(`[Guerreiros] Ambiente: ${process.env.NODE_ENV || "development"}`);
    setInterval(() => {
      const used = process.memoryUsage();
      console.log(`[Memory] RSS: ${Math.round(used.rss / 1024 / 1024)}MB | Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`);
    }, 3e5);
  });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`[Fatal] Porta ${PORT} em uso. Encerrando processo para reinicializa\xE7\xE3o.`);
      process.exit(1);
    } else {
      console.error("[Fatal] Erro no servidor:", e);
      process.exit(1);
    }
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]:", err);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getBrazilDay,
  getFirestoreDateKey,
  getNextThursday
});
