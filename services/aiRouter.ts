import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type AllowedTextModel = "gemini-3.1-flash-lite" | "gemini-4-hydrogen";
export type AllowedAudioModel = "gemini-3.5-transcribe" | AllowedTextModel;
export type AllowedTtsModel = "gemini-3.8-flash-lite-tts";
export type AllowedGeminiModel = AllowedTextModel | AllowedAudioModel | AllowedTtsModel;

export type AITier =
  | "ULTRA_LIGHT"
  | "BALANCED"
  | "DEEP_AUDIT"
  | "AUDIO_TRANSCRIBE"
  | "TTS";

export type AITaskType =
  | "daily_pill"
  | "curiosity"
  | "motivation"
  | "birthday_message"
  | "daily_summary"
  | "match_analysis"
  | "intent_extraction"
  | "simple_chat"
  | "verify_rules"
  | "ai_coach"
  | "complex_chat"
  | "whatsapp_deep"
  | "stream_text"
  | "sentinel_scan"
  | "detect_anomalies"
  | "billing_analysis"
  | "audio_transcribe"
  | "tts";

export interface TierPolicyConfig {
  primary: AllowedGeminiModel;
  fallbacks: AllowedGeminiModel[];
  thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  description: string;
}

export type AIRouterPolicy = Record<AITier, TierPolicyConfig>;

export interface ModelHealthState {
  model: AllowedGeminiModel;
  healthy: boolean;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastError?: string;
  totalCalls: number;
  totalErrors: number;
  lastUsedAt?: number;
}

export interface ReallocationEvent {
  timestamp: string;
  task: AITaskType;
  tier: AITier;
  fromModel: AllowedGeminiModel;
  toModel: AllowedGeminiModel;
  reason: string;
}

export interface RoutedGenerateOptions {
  task: AITaskType;
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  overrideTier?: AITier;
  cacheKey?: string;
  cacheTtlMs?: number;
}

export interface RoutedGenerateResult {
  text: string;
  modelUsed: AllowedGeminiModel;
  tierUsed: AITier;
  fromCache: boolean;
  reallocated: boolean;
}

export const ALLOWED_TEXT_MODELS: readonly AllowedTextModel[] = [
  "gemini-3.1-flash-lite",
  "gemini-4-hydrogen"
];

export const ALLOWED_AUDIO_MODELS: readonly AllowedAudioModel[] = [
  "gemini-3.5-transcribe",
  "gemini-3.1-flash-lite",
  "gemini-4-hydrogen"
];

export const ALLOWED_TTS_MODELS: readonly AllowedTtsModel[] = [
  "gemini-3.8-flash-lite-tts"
];

export const ALL_ALLOWED_MODELS: readonly AllowedGeminiModel[] = [
  "gemini-3.1-flash-lite",
  "gemini-4-hydrogen",
  "gemini-3.5-transcribe",
  "gemini-3.8-flash-lite-tts"
];

const TASK_TO_DEFAULT_TIER: Record<AITaskType, AITier> = {
  daily_pill: "ULTRA_LIGHT",
  curiosity: "ULTRA_LIGHT",
  motivation: "ULTRA_LIGHT",
  birthday_message: "ULTRA_LIGHT",
  daily_summary: "ULTRA_LIGHT",
  match_analysis: "ULTRA_LIGHT",
  intent_extraction: "ULTRA_LIGHT",
  simple_chat: "ULTRA_LIGHT",
  verify_rules: "BALANCED",
  ai_coach: "BALANCED",
  complex_chat: "BALANCED",
  whatsapp_deep: "BALANCED",
  stream_text: "BALANCED",
  sentinel_scan: "DEEP_AUDIT",
  detect_anomalies: "DEEP_AUDIT",
  billing_analysis: "DEEP_AUDIT",
  audio_transcribe: "AUDIO_TRANSCRIBE",
  tts: "TTS"
};

const DEFAULT_ROUTER_POLICY: AIRouterPolicy = {
  ULTRA_LIGHT: {
    primary: "gemini-3.1-flash-lite",
    fallbacks: ["gemini-4-hydrogen"],
    thinkingLevel: "MINIMAL",
    description: "Tarefas rápidas e econômicas (pílulas, motivação, aniversários, resumos, extração JSON, chat simples)."
  },
  BALANCED: {
    primary: "gemini-4-hydrogen",
    fallbacks: ["gemini-3.1-flash-lite"],
    thinkingLevel: "LOW",
    description: "Análises táticas, Treinador IA, auditoria de escalação e conversas analíticas."
  },
  DEEP_AUDIT: {
    primary: "gemini-4-hydrogen",
    fallbacks: ["gemini-3.1-flash-lite"],
    thinkingLevel: "MEDIUM",
    description: "Varredura Sentinela, integridade de banco de dados e consultoria FinOps."
  },
  AUDIO_TRANSCRIBE: {
    primary: "gemini-3.5-transcribe",
    fallbacks: ["gemini-3.1-flash-lite", "gemini-4-hydrogen"],
    description: "Transcrição otimizada de notas de voz enviadas no WhatsApp."
  },
  TTS: {
    primary: "gemini-3.8-flash-lite-tts",
    fallbacks: [],
    description: "Locução esportiva em áudio (Text-to-Speech)."
  }
};

let activePolicy: AIRouterPolicy = clonePolicy(DEFAULT_ROUTER_POLICY);
let policyUpdatedAt = new Date().toISOString();
let policySource: "default" | "firestore" | "runtime_api" = "default";

const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MAX_REALLOCATION_HISTORY = 25;

const modelHealthMap = new Map<AllowedGeminiModel, ModelHealthState>();
const responseCache = new Map<string, { text: string; modelUsed: AllowedGeminiModel; tierUsed: AITier; expiresAt: number }>();
const reallocationHistory: ReallocationEvent[] = [];

let cacheHits = 0;
let cacheMisses = 0;
const tierCallCounts: Record<AITier, number> = {
  ULTRA_LIGHT: 0,
  BALANCED: 0,
  DEEP_AUDIT: 0,
  AUDIO_TRANSCRIBE: 0,
  TTS: 0
};

function clonePolicy(p: AIRouterPolicy): AIRouterPolicy {
  return {
    ULTRA_LIGHT: { ...p.ULTRA_LIGHT, fallbacks: [...p.ULTRA_LIGHT.fallbacks] },
    BALANCED: { ...p.BALANCED, fallbacks: [...p.BALANCED.fallbacks] },
    DEEP_AUDIT: { ...p.DEEP_AUDIT, fallbacks: [...p.DEEP_AUDIT.fallbacks] },
    AUDIO_TRANSCRIBE: { ...p.AUDIO_TRANSCRIBE, fallbacks: [...p.AUDIO_TRANSCRIBE.fallbacks] },
    TTS: { ...p.TTS, fallbacks: [...p.TTS.fallbacks] }
  };
}

function getOrCreateHealth(model: AllowedGeminiModel): ModelHealthState {
  let state = modelHealthMap.get(model);
  if (!state) {
    state = {
      model,
      healthy: true,
      cooldownUntil: 0,
      consecutiveFailures: 0,
      totalCalls: 0,
      totalErrors: 0
    };
    modelHealthMap.set(model, state);
  }
  if (!state.healthy && Date.now() >= state.cooldownUntil) {
    state.healthy = true;
    state.cooldownUntil = 0;
  }
  return state;
}

function isModelHealthy(model: AllowedGeminiModel): boolean {
  return getOrCreateHealth(model).healthy;
}

function isRecoverableModelError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("500") ||
    msg.includes("deadline_exceeded") ||
    msg.includes("timeout")
  );
}

function markModelFailure(model: AllowedGeminiModel, err: any) {
  const state = getOrCreateHealth(model);
  state.totalErrors += 1;
  state.consecutiveFailures += 1;
  state.lastError = String(err?.message || err || "Unknown error").slice(0, 180);
  if (isRecoverableModelError(err)) {
    state.healthy = false;
    state.cooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
  }
}

function markModelSuccess(model: AllowedGeminiModel) {
  const state = getOrCreateHealth(model);
  state.healthy = true;
  state.cooldownUntil = 0;
  state.consecutiveFailures = 0;
  state.lastError = undefined;
  state.totalCalls += 1;
  state.lastUsedAt = Date.now();
}

function recordReallocation(event: ReallocationEvent) {
  reallocationHistory.unshift(event);
  if (reallocationHistory.length > MAX_REALLOCATION_HISTORY) {
    reallocationHistory.length = MAX_REALLOCATION_HISTORY;
  }
}

export function createRouterAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server. Please verify your API key in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

function mapThinkingLevelForModel(
  model: AllowedGeminiModel,
  requested?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"
): ThinkingLevel | undefined {
  // Dedicated audio/TTS models must not receive thinkingConfig
  if (model === "gemini-3.5-transcribe" || model === "gemini-3.8-flash-lite-tts") {
    return undefined;
  }
  if (!requested) return undefined;

  if (model === "gemini-4-hydrogen") {
    // gemini-4-hydrogen does NOT accept ThinkingLevel.MINIMAL (HTTP 400)
    if (requested === "MINIMAL" || requested === "LOW") return ThinkingLevel.LOW;
    if (requested === "MEDIUM") return ThinkingLevel.MEDIUM;
    return ThinkingLevel.HIGH;
  }

  // gemini-3.1-flash-lite supports MINIMAL and LOW
  if (model === "gemini-3.1-flash-lite") {
    if (requested === "MINIMAL") return ThinkingLevel.MINIMAL;
    return ThinkingLevel.LOW;
  }

  return undefined;
}

function buildSafeModelConfig(
  model: AllowedGeminiModel,
  tierConfig: TierPolicyConfig,
  opts: {
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
  }
): Record<string, any> | undefined {
  const config: Record<string, any> = {};

  if (opts.systemInstruction) {
    config.systemInstruction = opts.systemInstruction;
  }
  if (opts.responseMimeType) {
    config.responseMimeType = opts.responseMimeType;
  }
  if (opts.responseSchema) {
    config.responseSchema = opts.responseSchema;
  }

  const thinkingLevel = mapThinkingLevelForModel(model, tierConfig.thinkingLevel);
  if (thinkingLevel) {
    config.thinkingConfig = { thinkingLevel };
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Zero-cost deterministic classifier that keeps simple Q&A on ULTRA_LIGHT
 * and escalates only multi-turn or analytical/comparative queries to BALANCED.
 */
export function classifyChatTier(message: string, historyLength = 0): "ULTRA_LIGHT" | "BALANCED" {
  const clean = String(message || "").trim().toLowerCase();
  if (!clean) return "ULTRA_LIGHT";
  if (clean.length > 180 || historyLength >= 6) return "BALANCED";

  const complexKeywords = [
    "comparar",
    "compare",
    "comparativo",
    "versus",
    " vs ",
    "análise",
    "analise",
    "estratégia",
    "estrategia",
    "auditoria",
    "anomalia",
    "sinergia",
    "carrasco",
    "freguês",
    "fregues",
    "evolução",
    "evolucao",
    "tática",
    "tatica",
    "estatística",
    "estatistica",
    "por que",
    "explique",
    "detalh",
    "melhorar meu",
    "como subir",
    "balanceamento"
  ];

  if (complexKeywords.some((kw) => clean.includes(kw))) {
    return "BALANCED";
  }
  return "ULTRA_LIGHT";
}

function getOrderedCandidates(tier: AITier): AllowedGeminiModel[] {
  const cfg = activePolicy[tier];
  const fullChain: AllowedGeminiModel[] = Array.from(new Set([cfg.primary, ...cfg.fallbacks]));
  const healthy = fullChain.filter((m) => isModelHealthy(m));
  const coolingDown = fullChain.filter((m) => !isModelHealthy(m));
  // Try healthy models first; if all are in cooldown, still attempt them in priority order as last resort
  return [...healthy, ...coolingDown];
}

function setCacheEntry(
  key: string,
  value: { text: string; modelUsed: AllowedGeminiModel; tierUsed: AITier; expiresAt: number }
) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, value);
}

export async function routedGenerateContent(opts: RoutedGenerateOptions): Promise<RoutedGenerateResult> {
  const tier: AITier = opts.overrideTier || TASK_TO_DEFAULT_TIER[opts.task] || "ULTRA_LIGHT";

  if (opts.cacheKey && opts.cacheTtlMs && opts.cacheTtlMs > 0) {
    const cached = responseCache.get(opts.cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      cacheHits += 1;
      return {
        text: cached.text,
        modelUsed: cached.modelUsed,
        tierUsed: cached.tierUsed,
        fromCache: true,
        reallocated: false
      };
    }
    cacheMisses += 1;
  }

  const ai = createRouterAI();
  const tierConfig = activePolicy[tier];
  const candidates = getOrderedCandidates(tier);
  tierCallCounts[tier] += 1;

  let lastError: any = null;
  let initialModel: AllowedGeminiModel = tierConfig.primary;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const reallocated = model !== initialModel;
    const config = buildSafeModelConfig(model, tierConfig, {
      systemInstruction: opts.systemInstruction,
      responseMimeType: opts.responseMimeType,
      responseSchema: opts.responseSchema
    });

    try {
      const response = await ai.models.generateContent({
        model,
        contents: opts.contents,
        ...(config ? { config } : {})
      });

      markModelSuccess(model);
      const text = (response.text || "").trim();

      if (reallocated && i > 0) {
        recordReallocation({
          timestamp: new Date().toISOString(),
          task: opts.task,
          tier,
          fromModel: candidates[i - 1],
          toModel: model,
          reason: String(lastError?.message || "Failover automático").slice(0, 120)
        });
      }

      if (opts.cacheKey && opts.cacheTtlMs && opts.cacheTtlMs > 0 && text) {
        setCacheEntry(opts.cacheKey, {
          text,
          modelUsed: model,
          tierUsed: tier,
          expiresAt: Date.now() + opts.cacheTtlMs
        });
      }

      return {
        text,
        modelUsed: model,
        tierUsed: tier,
        fromCache: false,
        reallocated
      };
    } catch (err: any) {
      lastError = err;
      markModelFailure(model, err);
      const hasNext = i < candidates.length - 1;
      if (hasNext && isRecoverableModelError(err)) {
        console.warn(
          `[AIRouter] Reallocating task=${opts.task} (${tier}) from ${model} -> ${candidates[i + 1]}: ${err?.message || err}`
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`AIRouter: no healthy models available for tier ${tier}`);
}

export async function routedGenerateContentStream(opts: {
  task?: AITaskType;
  contents: any;
  systemInstruction?: string;
  overrideTier?: AITier;
}) {
  const task: AITaskType = opts.task || "stream_text";
  const tier: AITier = opts.overrideTier || TASK_TO_DEFAULT_TIER[task] || "BALANCED";
  const ai = createRouterAI();
  const tierConfig = activePolicy[tier];
  const candidates = getOrderedCandidates(tier);
  tierCallCounts[tier] += 1;

  let lastError: any = null;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const config = buildSafeModelConfig(model, tierConfig, {
      systemInstruction: opts.systemInstruction
    });
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: opts.contents,
        ...(config ? { config } : {})
      });
      markModelSuccess(model);
      return stream;
    } catch (err: any) {
      lastError = err;
      markModelFailure(model, err);
      if (i < candidates.length - 1 && isRecoverableModelError(err)) {
        recordReallocation({
          timestamp: new Date().toISOString(),
          task,
          tier,
          fromModel: model,
          toModel: candidates[i + 1],
          reason: String(err?.message || "Stream failover").slice(0, 120)
        });
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`AIRouter: stream failed for tier ${tier}`);
}

function isModelAllowedForTier(tier: AITier, model: string): model is AllowedGeminiModel {
  if (tier === "TTS") return (ALLOWED_TTS_MODELS as readonly string[]).includes(model);
  if (tier === "AUDIO_TRANSCRIBE") return (ALLOWED_AUDIO_MODELS as readonly string[]).includes(model);
  return (ALLOWED_TEXT_MODELS as readonly string[]).includes(model);
}

export function getAIRouterPolicy(): AIRouterPolicy {
  return clonePolicy(activePolicy);
}

export function setAIRouterPolicy(
  partial: Partial<Record<AITier, { primary?: string; fallbacks?: string[]; thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" }>>,
  source: "firestore" | "runtime_api" = "runtime_api"
): { policy: AIRouterPolicy; errors: string[] } {
  const next = clonePolicy(activePolicy);
  const errors: string[] = [];

  (Object.keys(partial || {}) as AITier[]).forEach((tier) => {
    if (!(tier in next)) {
      errors.push(`Tier inválido: ${tier}`);
      return;
    }
    const patch = partial[tier];
    if (!patch || typeof patch !== "object") return;

    if (patch.primary) {
      if (isModelAllowedForTier(tier, patch.primary)) {
        next[tier].primary = patch.primary;
      } else {
        errors.push(`Modelo "${patch.primary}" não permitido para o tier ${tier}.`);
      }
    }

    if (Array.isArray(patch.fallbacks)) {
      const validFallbacks: AllowedGeminiModel[] = [];
      for (const fb of patch.fallbacks) {
        if (isModelAllowedForTier(tier, fb)) {
          if (fb !== next[tier].primary && !validFallbacks.includes(fb)) {
            validFallbacks.push(fb);
          }
        } else {
          errors.push(`Fallback "${fb}" não permitido para o tier ${tier}.`);
        }
      }
      next[tier].fallbacks = validFallbacks;
    }

    if (patch.thinkingLevel && ["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(patch.thinkingLevel)) {
      next[tier].thinkingLevel = patch.thinkingLevel;
    }
  });

  if (errors.length === 0) {
    activePolicy = next;
    policyUpdatedAt = new Date().toISOString();
    policySource = source;
  }

  return { policy: clonePolicy(activePolicy), errors };
}

export function resetAIRouterPolicy(): AIRouterPolicy {
  activePolicy = clonePolicy(DEFAULT_ROUTER_POLICY);
  policyUpdatedAt = new Date().toISOString();
  policySource = "default";
  return clonePolicy(activePolicy);
}

export function clearAIRouterCache(): number {
  const cleared = responseCache.size;
  responseCache.clear();
  return cleared;
}

export function getAIRouterStatus() {
  const health = ALL_ALLOWED_MODELS.map((m) => {
    const h = getOrCreateHealth(m);
    return {
      ...h,
      cooldownRemainingSec: h.healthy ? 0 : Math.max(0, Math.ceil((h.cooldownUntil - Date.now()) / 1000))
    };
  });

  return {
    architecture: "deterministic-tier-router + circuit-breaker-failover + runtime-policy",
    policySource,
    policyUpdatedAt,
    allowedModels: {
      text: ALLOWED_TEXT_MODELS,
      audio: ALLOWED_AUDIO_MODELS,
      tts: ALLOWED_TTS_MODELS
    },
    policy: clonePolicy(activePolicy),
    taskMapping: TASK_TO_DEFAULT_TIER,
    modelHealth: health,
    metrics: {
      tierCallCounts: { ...tierCallCounts },
      cache: {
        entries: responseCache.size,
        hits: cacheHits,
        misses: cacheMisses
      }
    },
    recentReallocations: [...reallocationHistory]
  };
}
