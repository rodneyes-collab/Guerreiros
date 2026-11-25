import express from "express";
import http from "http";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import {
  routedGenerateContent,
  getAIRouterStatus,
  setAIRouterPolicy,
  resetAIRouterPolicy,
  clearAIRouterCache
} from "./services/aiRouter.ts";
import { setupGeminiLiveWebSocket } from "./services/serverLiveApi.ts";
import { APP_VERSION } from "./constants.ts";
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication
} from "./src/services/webauthn.ts";
import { runDeepAnalyticsChat, buildPlayerDeepStatsReport } from "./serverDeepAnalysis.ts";
import {
  computeIndividualNightData,
  enrichIndividualNightDataWithHumor,
  computeDailyRankingData,
  computeAccumulatedRankingData,
  computePlayerEloCurve,
  renderIndividualNightCardPng,
  renderDailyRankingCardPng,
  renderAccumulatedRankingCardPng,
  getLoadedCardFontsCount
} from "./services/liquidGlassCards.ts";

const __dirname = process.cwd();

let configProjectId = "volleyclub-manager";
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
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

process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]:", err);
});

interface TemporaryChallenge {
  challenge: string;
  playerId?: string;
  playerName?: string;
  createdAt: number;
}

// ============================================================================
// ⚡ DISJUNTOR ANTI-TIMEOUT E CACHE EM MEMÓRIA
// ============================================================================
let firestoreCircuitOpenUntil = 0;
let cachedPlayers: any[] = [];
let cachedPlayersLastFetch = 0;
const PLAYERS_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedMatches: any[] = [];
let cachedMatchesLastFetch = 0;
const MATCHES_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedIntentions: any = null;
let cachedIntentionsLastFetch = 0;
const INTENTIONS_CACHE_TTL_MS = 3 * 60 * 1000;

let cachedScheduler: Record<string, any> | null = null;
let cachedSystemConfig: Record<string, any> | null = null;
let cachedSystemConfigLastFetch = 0;
const SYSTEM_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;

const LOCAL_INTENTIONS_PATH = path.join(process.cwd(), "intentions_backup_local.json");
const LOCAL_SCHEDULER_PATH = path.join(process.cwd(), "whatsapp_scheduler_local.json");
const LOCAL_PLAYERS_PATH = path.join(process.cwd(), "players_backup_local.json");
const LOCAL_MATCHES_PATH = path.join(process.cwd(), "matches_backup_local.json");
const LOCAL_WA_PHOTO_DIR_PATH = path.join(process.cwd(), "whatsapp_photos_directory_local.json");

let whatsappPhotoDirectoryCache: Record<string, any> = {};

function loadLocalWhatsAppPhotoDir(): Record<string, any> {
  if (Object.keys(whatsappPhotoDirectoryCache).length > 0) {
    return whatsappPhotoDirectoryCache;
  }
  try {
    if (fs.existsSync(LOCAL_WA_PHOTO_DIR_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_WA_PHOTO_DIR_PATH, "utf-8"));
      if (parsed && typeof parsed === "object") {
        whatsappPhotoDirectoryCache = parsed;
        return whatsappPhotoDirectoryCache;
      }
    }
  } catch {}
  return {};
}

function saveLocalWhatsAppPhotoDir(dir: Record<string, any>) {
  whatsappPhotoDirectoryCache = dir;
  try {
    fs.writeFileSync(LOCAL_WA_PHOTO_DIR_PATH, JSON.stringify(dir, null, 2), "utf-8");
  } catch {}
}

function autoNormalizeBrazilianPhone(
  rawPhone?: string | null,
  verifiedWhatsAppDigits?: string | null
): string {
  if (verifiedWhatsAppDigits) {
    let vDigits = String(verifiedWhatsAppDigits).split("@")[0].replace(/\D/g, "");
    if (vDigits.length === 10 || vDigits.length === 11) vDigits = "55" + vDigits;
    if (vDigits.length >= 12 && vDigits.length <= 13) return vDigits;
  }

  if (!rawPhone) return "";
  let digits = String(rawPhone).split("@")[0].replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length >= 13 && digits.startsWith("0")) {
    digits = digits.slice(3);
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const local8 = digits.slice(4);
    if (/^[6-9]/.test(local8)) {
      digits = `55${ddd}9${local8}`;
    }
  }

  return digits;
}

function normalizePlayersPhonesInPlace(playersList: any[]): number {
  if (!Array.isArray(playersList)) return 0;
  let adjusted = 0;
  for (const p of playersList) {
    if (!p || !p.phone) continue;
    const normalized = autoNormalizeBrazilianPhone(p.phone);
    if (normalized && normalized.length >= 12 && normalized !== String(p.phone).replace(/\D/g, "")) {
      p.phone = normalized;
      adjusted++;
    }
  }
  return adjusted;
}

function getPhoneIndexKeys(rawPhone?: string | null): string[] {
  if (!rawPhone) return [];
  let digits = String(rawPhone).split("@")[0].replace(/\D/g, "");
  if (!digits || digits.length < 8) return [];
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  const keys = new Set<string>([digits]);
  if (digits.startsWith("55") && digits.length >= 12) {
    keys.add(digits.slice(2));
    if (digits.length === 13 && digits[4] === "9") {
      const no9 = digits.slice(0, 4) + digits.slice(5);
      keys.add(no9);
      keys.add(no9.slice(2));
    } else if (digits.length === 12) {
      const with9 = digits.slice(0, 4) + "9" + digits.slice(4);
      keys.add(with9);
      keys.add(with9.slice(2));
    }
  }
  keys.add(`last8_${digits.slice(-8)}`);
  return Array.from(keys);
}

function registerWhatsAppPhotoBinding(params: {
  phone?: string | null;
  photoUrl?: string | null;
  playerId?: string;
  playerName?: string;
  source?: string;
}) {
  const { phone, photoUrl, playerId, playerName, source = "whatsapp_sync" } = params;
  if (!phone || !photoUrl || typeof photoUrl !== "string" || !photoUrl.trim()) return;
  if (isMissingOrDefaultAvatar(photoUrl)) return;
  const keys = getPhoneIndexKeys(phone);
  if (keys.length === 0) return;
  const digits = keys[0];
  const dir = loadLocalWhatsAppPhotoDir();
  const entry = {
    phone: digits,
    normalizedPhone: digits,
    whatsappJid: `${digits}@s.whatsapp.net`,
    photoUrl,
    playerId: playerId || undefined,
    playerName: playerName || undefined,
    source,
    updatedAt: Date.now()
  };
  keys.forEach((k) => {
    dir[k] = entry;
  });
  saveLocalWhatsAppPhotoDir(dir);
}

// Seed completo dos 28 sócios ativos do Guerreiros VC para garantir funcionamento 100% mesmo em cold start
const SEED_CLUB_PLAYERS: any[] = [
  { id: "seed_rodney", name: "Rodney", phone: "5581997330924", email: "rodneyes@gmail.com", gender: "MALE", status: "active", isDM: false, isOfficialSetter: true, isAdmin: true, elo: 1250, matchesPlayed: 8, wins: 5, losses: 3 },
  { id: "seed_ale", name: "Alê", phone: "558199185757", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1240, matchesPlayed: 8, wins: 5, losses: 3 },
  { id: "seed_rozi", name: "Rozi", phone: "5581999122340", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1210, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_marcleide", name: "Marcleíde", phone: "558188417461", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1215, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_betinha", name: "Betinha", phone: "558191387654", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1210, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_flavinha", name: "Flavinha", phone: "558199022718", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1220, matchesPlayed: 6, wins: 4, losses: 2 },
  { id: "seed_mari", name: "Mari", phone: "558194302282", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1310, matchesPlayed: 8, wins: 7, losses: 1 },
  { id: "seed_caluca", name: "Caluca", phone: "558199698832", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1280, matchesPlayed: 7, wins: 5, losses: 2 },
  { id: "seed_thiago", name: "Thiago", phone: "558196036960", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1230, matchesPlayed: 7, wins: 4, losses: 3 },
  { id: "seed_alberto", name: "Alberto", phone: "558197080172", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 5, wins: 3, losses: 2 },
  { id: "seed_anamaria", name: "Ana Maria", phone: "558199648616", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 5, wins: 2, losses: 3 },
  { id: "seed_anne", name: "Anne", phone: "5581992720041", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1205, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_bibi", name: "Bibi", phone: "558187959852", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: true, elo: 1260, matchesPlayed: 8, wins: 5, losses: 3 },
  { id: "seed_deapatricia", name: "Dea Patricia", phone: "558186274923", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 5, wins: 2, losses: 3 },
  { id: "seed_fatinha", name: "Fatinha", phone: "558199747420", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1195, matchesPlayed: 6, wins: 2, losses: 4 },
  { id: "seed_geraldinho", name: "Geraldinho", phone: "558196004655", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1210, matchesPlayed: 5, wins: 3, losses: 2 },
  { id: "seed_iale", name: "Iale", phone: "5581992128775", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 5, wins: 2, losses: 3 },
  { id: "seed_ivana", name: "Ivana", phone: "558188891352", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1215, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_jo", name: "Jô", phone: "558196329183", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1210, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_karina", name: "Karina", phone: "558198650302", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 5, wins: 2, losses: 3 },
  { id: "seed_leyla", name: "Leyla", phone: "", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1200, matchesPlayed: 4, wins: 2, losses: 2 },
  { id: "seed_marcelo", name: "Marcelo", phone: "558199157371", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1220, matchesPlayed: 6, wins: 3, losses: 3 },
  { id: "seed_marcosandre", name: "Marcos Andre", phone: "558197478784", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1215, matchesPlayed: 5, wins: 3, losses: 2 },
  { id: "seed_paulofonseca", name: "Paulo Fonseca", phone: "5581982380304", gender: "MALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1295, matchesPlayed: 8, wins: 6, losses: 2 },
  { id: "seed_tacy", name: "Tacy", phone: "5581991717689", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1210, matchesPlayed: 5, wins: 3, losses: 2 },
  { id: "seed_beth", name: "Beth", phone: "5581988006345", email: "elizabeth.santos.pe@gmail.com", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1225, matchesPlayed: 7, wins: 4, losses: 3 },
  { id: "seed_wandinha", name: "Wandinha", phone: "5581985536192", gender: "FEMALE", status: "active", isDM: false, isOfficialSetter: false, elo: 1205, matchesPlayed: 5, wins: 2, losses: 3 }
];

function sanitizePlayerPhotoFields(p: any): any {
  if (!p || typeof p !== "object") return p;
  if (isMissingOrDefaultAvatar(p.photoUrl) && !isMissingOrDefaultAvatar(p.whatsappPhotoUrl)) {
    p.photoUrl = p.whatsappPhotoUrl;
  }
  if ("whatsappPhotoUrl" in p) {
    delete p.whatsappPhotoUrl;
  }
  return p;
}

function sanitizePlayersListPhotoFields(list: any[]): any[] {
  if (!Array.isArray(list)) return [];
  list.forEach((p) => sanitizePlayerPhotoFields(p));
  return list;
}

function loadLocalPlayersBackup(): any[] {
  try {
    if (fs.existsSync(LOCAL_PLAYERS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_PLAYERS_PATH, "utf-8"));
      if (Array.isArray(parsed) && parsed.length >= 10) {
        return sanitizePlayersListPhotoFields(parsed);
      }
    }
  } catch {}
  return SEED_CLUB_PLAYERS;
}

function saveLocalPlayersBackup(list: any[]) {
  try {
    if (Array.isArray(list) && list.length >= 10) {
      sanitizePlayersListPhotoFields(list);
      fs.writeFileSync(LOCAL_PLAYERS_PATH, JSON.stringify(list), "utf-8");
    }
  } catch {}
}

function loadLocalMatchesBackup(): any[] {
  try {
    if (fs.existsSync(LOCAL_MATCHES_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_MATCHES_PATH, "utf-8"));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalMatchesBackup(list: any[]) {
  try {
    if (Array.isArray(list) && list.length > 0) {
      fs.writeFileSync(LOCAL_MATCHES_PATH, JSON.stringify(list), "utf-8");
    }
  } catch {}
}

function loadLocalSchedulerBackup(): Record<string, any> {
  try {
    if (fs.existsSync(LOCAL_SCHEDULER_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_SCHEDULER_PATH, "utf-8")) || {};
    }
  } catch {}
  return {};
}

function saveLocalSchedulerBackup(doc: Record<string, any>) {
  try {
    fs.writeFileSync(LOCAL_SCHEDULER_PATH, JSON.stringify(doc, null, 2), "utf-8");
  } catch {}
}

function loadLocalIntentionsBackup(): any {
  try {
    if (fs.existsSync(LOCAL_INTENTIONS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_INTENTIONS_PATH, "utf-8"));
    }
  } catch {}
  return null;
}

function saveLocalIntentionsBackup(doc: any) {
  try {
    fs.writeFileSync(LOCAL_INTENTIONS_PATH, JSON.stringify(doc, null, 2), "utf-8");
  } catch {}
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Valida se uma string aparenta ser um JSON estruturado ({...} ou [...]) antes de chamar JSON.parse,
 * bloqueando respostas de texto puro de proxy/gateway como "upstream request timeout" ou HTML 502/504.
 */
function looksLikeJsonPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === "{" && last === "}") || (first === "[" && last === "]");
}

function safeJsonParse<T>(raw: unknown, contextLabel: string, fallback: T): T {
  try {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw !== "string") {
      if (typeof raw === "object") return raw as T;
      return fallback;
    }
    const trimmed = raw.trim();
    if (!looksLikeJsonPayload(trimmed)) {
      const preview = trimmed.slice(0, 80).replace(/\s+/g, " ");
      console.warn(`[JSON Guard:${contextLabel}] Payload não-JSON descartado com segurança: "${preview}"`);
      return fallback;
    }
    return JSON.parse(trimmed) as T;
  } catch (err: any) {
    const preview = typeof raw === "string" ? raw.trim().slice(0, 80).replace(/\s+/g, " ") : typeof raw;
    console.warn(`[JSON Guard:${contextLabel}] Falha ao fazer parse de JSON (${err?.message || "SyntaxError"}) | preview="${preview}"`);
    return fallback;
  }
}

async function safeReadResponseJson<T>(
  resp: Response,
  contextLabel: string,
  fallback: T
): Promise<{ ok: boolean; status: number; data: T; rawText: string; isValidJson: boolean }> {
  try {
    const rawText = await resp.text().catch(() => "");
    const trimmed = rawText.trim();
    if (!looksLikeJsonPayload(trimmed)) {
      if (trimmed) {
        const preview = trimmed.slice(0, 90).replace(/\s+/g, " ");
        console.warn(`[HTTP JSON Guard:${contextLabel}] Resposta HTTP ${resp.status} não-JSON ignorada: "${preview}"`);
      }
      return { ok: resp.ok, status: resp.status, data: fallback, rawText, isValidJson: false };
    }
    try {
      const parsed = JSON.parse(trimmed) as T;
      return { ok: resp.ok, status: resp.status, data: parsed, rawText, isValidJson: true };
    } catch (parseErr: any) {
      console.warn(`[HTTP JSON Guard:${contextLabel}] JSON malformado (HTTP ${resp.status}): ${parseErr?.message}`);
      return { ok: resp.ok, status: resp.status, data: fallback, rawText, isValidJson: false };
    }
  } catch (err: any) {
    console.warn(`[HTTP JSON Guard:${contextLabel}] Erro ao ler corpo da resposta: ${err?.message || err}`);
    return { ok: false, status: resp?.status || 0, data: fallback, rawText: "", isValidJson: false };
  }
}

function validateIncomingJsonPayload(
  body: unknown,
  contextLabel: string
): { valid: boolean; data: Record<string, any>; reason?: string } {
  try {
    if (isPlainObject(body)) {
      return { valid: true, data: body };
    }
    if (typeof body === "string") {
      const parsed = safeJsonParse<unknown>(body, contextLabel, null);
      if (isPlainObject(parsed)) {
        return { valid: true, data: parsed };
      }
      return { valid: false, data: {}, reason: "Payload textual malformado ou não-JSON (ex: upstream timeout)." };
    }
    if (body === undefined || body === null) {
      return { valid: true, data: {} };
    }
    return { valid: false, data: {}, reason: "Formato de payload JSON inválido (esperado objeto)." };
  } catch (err: any) {
    console.warn(`[Payload Guard:${contextLabel}] Erro ao validar payload recebido:`, err?.message || err);
    return { valid: false, data: {}, reason: err?.message || "Erro na validação do JSON." };
  }
}

function sanitizeFirestorePayload<T>(data: unknown, contextLabel: string, fallback: T): T {
  try {
    if (data === null || data === undefined) return fallback;
    if (typeof data === "string") {
      return safeJsonParse<T>(data, contextLabel, fallback);
    }
    if (typeof data === "object") {
      // Valida integridade serializável antes de repassar para o bot/Firestore
      const serialized = JSON.stringify(data);
      if (!serialized || !looksLikeJsonPayload(serialized)) return fallback;
      return JSON.parse(serialized) as T;
    }
    return fallback;
  } catch (err: any) {
    console.warn(`[Firestore JSON Guard:${contextLabel}] Documento/payload malformado ignorado:`, err?.message || err);
    return fallback;
  }
}

async function withFirestoreGuard<T>(fn: () => Promise<T>, fallbackValue: T, timeoutMs = 8000): Promise<T> {
  if (Date.now() < firestoreCircuitOpenUntil) {
    return fallbackValue;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const taskPromise = (async () => await fn())();
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), timeoutMs);
    });
    const result = await Promise.race([taskPromise, timeoutPromise]);
    return result;
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    // Só abre o disjuntor se for erro explícito de Quota Excedida (RESOURCE_EXHAUSTED), nunca por timeout de cold start
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota")) {
      firestoreCircuitOpenUntil = Date.now() + 5 * 60 * 1000;
      console.warn("[Firestore Circuit Breaker] Ativado por 5 min (Quota):", msg.slice(0, 120));
    } else {
      console.warn("[Firestore Guard] Aviso protegido (thread principal preservada):", msg.slice(0, 140));
    }
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const getFirestoreDateKey = (date?: Date) => {
  const now = date || new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
};

export const getBrazilDay = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short"
  }).formatToParts(now);

  const dayName = parts.find((p) => p.type === "weekday")?.value;
  const days: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return days[dayName || "Sun"] || 0;
};

export const getBrazilTimeParts = () => {
  const now = new Date();
  const dateKey = getFirestoreDateKey(now);
  const dayOfWeek = getBrazilDay();
  const timeStr = now.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const [hourStr, minStr] = timeStr.split(":");
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const hour = Number(hourStr) % 24;
  const minute = Number(minStr);
  return {
    dateKey,
    yearMonth: `${yearStr}-${monthStr}`,
    monthDay: `${monthStr}-${dayStr}`,
    dayOfMonth: Number(dayStr),
    dayOfWeek,
    hour,
    minute,
    totalMinutes: hour * 60 + minute
  };
};

export const parseBirthMonthDay = (
  birthDate?: string | null
): { month: number; day: number } | null => {
  if (!birthDate || typeof birthDate !== "string") return null;
  const clean = birthDate.trim().split("T")[0].split(" ")[0];
  const parts = clean.split(/[-/]/);
  if (parts.length !== 3) return null;

  let month: number;
  let day: number;
  if (parts[0].length === 4) {
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  }

  if (isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { month, day };
};

export const getTodayBirthdayPlayers = (players: any[], brDateKey: string): any[] => {
  const [, monthStr, dayStr] = brDateKey.split("-");
  const targetMonth = Number(monthStr);
  const targetDay = Number(dayStr);
  const seenNames = new Set<string>();

  return (players || []).filter((p) => {
    if (!p || (p.status && p.status !== "active")) return false;
    const parsed = parseBirthMonthDay(p.birthDate);
    if (!parsed || parsed.month !== targetMonth || parsed.day !== targetDay) return false;
    const normName = String(p.name || p.id || "")
      .trim()
      .toLowerCase();
    if (normName && seenNames.has(normName)) return false;
    if (normName) seenNames.add(normName);
    return true;
  });
};

export async function buildIndividualBirthdayMessage(
  player: any,
  recentBirthdayGreetings: string[] = []
): Promise<{ fullText: string; privateText: string; bodyText: string }> {
  const playerName = String(player?.name || "Sócio").trim();
  const firstName = playerName.split(" ")[0];
  const isOfficialSetter = Boolean(player?.isOfficialSetter);
  const isFemale = player?.gender === "FEMALE";
  const matchesPlayed = Number(player?.matchesPlayed || 0);
  const wins = Number(player?.wins || 0);
  const elo = Math.round(Number(player?.elo || 1200));

  let aiGroupGreeting = "";
  let aiPrivateGreeting = "";
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (apiKey) {
    try {
      const styleAngles = [
        "tom épico de narração esportiva de final de campeonato, exaltando a raça e liderança em quadra",
        "tom descontraído de resenha entre amigos de clube, com humor leve sobre defesa difícil, saque perfeito e churrasco pós-jogo",
        "tom inspirador e caloroso, celebrando a saúde, a longevidade no esporte e a parceria dentro e fora da rede",
        "tom vibrante de torcida organizada, destacando o brilho técnico e a energia contagiante no vestiário e na quadra"
      ];
      const angleSeed =
        (playerName.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + new Date().getFullYear()) %
        styleAngles.length;
      const chosenAngle = styleAngles[angleSeed];

      const prompt = `Você é o Guerreirinho, o mascote oficial e Agente de IA do clube de vôlei "Guerreiros VC".
Crie DUAS mensagens de feliz aniversário totalmente inéditas, personalizadas e criativas para o(a) sócio(a) abaixo — PROIBIDO usar texto genérico ou repetir estruturas anteriores!

DADOS DO(A) ANIVERSARIANTE:
- Nome: ${playerName} (${isFemale ? "Atleta feminina" : "Atleta masculino"})
- Função em quadra: ${isOfficialSetter ? "Levantador(a) Oficial (maestro/maestrina da distribuição)" : "Jogador(a) de Linha (passe, defesa e ataque)"}
- Estatísticas no clube: ${matchesPlayed} partidas jogadas, ${wins} vitórias, ${elo} pontos de ELO.
- Estilo desta homenagem: ${chosenAngle}

MENSAGENS JÁ ENVIADAS ANTERIORMENTE (NÃO REPITA FRASES NEM ABERTURAS):
${recentBirthdayGreetings.length > 0 ? recentBirthdayGreetings.slice(-10).join(" | ") : "Nenhuma ainda"}

FORMATO OBRIGATÓRIO DA RESPOSTA (use exatamente estas duas tags):
GRUPO: <escreva aqui a homenagem de 2 a 3 frases curtas para o grupo oficial do WhatsApp, com *negrito* e emojis de vôlei/festa, celebrando ${firstName} diante da turma>
PRIVADO: <escreva aqui uma mensagem mais íntima e calorosa de 2 frases para enviar no WhatsApp privado de ${firstName}, agradecendo a parceria no clube e desejando um dia incrível>`;

      const aiResp = await routedGenerateContent({
        task: "birthday_message",
        contents: prompt
      });
      const raw = (aiResp.text || "").trim();
      const groupMatch = raw.match(/GRUPO:\s*([\s\S]*?)(?=PRIVADO:|$)/i);
      const privateMatch = raw.match(/PRIVADO:\s*([\s\S]*)$/i);
      if (groupMatch && groupMatch[1].trim()) {
        aiGroupGreeting = groupMatch[1].trim();
      }
      if (privateMatch && privateMatch[1].trim()) {
        aiPrivateGreeting = privateMatch[1].trim();
      }
    } catch (e) {
      console.warn("[Birthday AI] Fallback criativo acionado:", e);
    }
  }

  const roleHighlight = isOfficialSetter
    ? isFemale
      ? "ditando o ritmo do jogo como Levantadora Oficial e deixando as atacantes na boa"
      : "ditando o ritmo do jogo como Levantador Oficial e deixando os atacantes na boa"
    : "garantindo o passe na mão, defesas impossíveis e bolas cravadas na quadra";

  const statsHighlight =
    matchesPlayed > 0
      ? `com *${matchesPlayed} jogos*, *${wins} vitórias* e *${elo} pts de ELO* na nossa história!`
      : `com *${elo} pts de ELO* e muita garra na nossa resenha!`;

  const fallbackGroup = `Hoje a quadra inteira bate palmas para *${playerName}*! Que esse novo ciclo venha repleto de saúde, conquistas e muitas bolas no chão — ${roleHighlight} (${statsHighlight}) 🏐🥳`;
  const fallbackPrivate = `Fala, *${firstName}*! Passando aqui no seu privado em nome de toda a diretoria e dos sócios dos *Guerreiros VC* para te desejar um feliz aniversário cheio de saúde, alegrias e vitórias dentro e fora das quadras! 🎂🏐💛`;

  const bodyText = aiGroupGreeting || fallbackGroup;
  const privateBody = aiPrivateGreeting || fallbackPrivate;

  const roleBadge = isOfficialSetter
    ? `🎯 *Posição:* ${isFemale ? "Levantadora Oficial" : "Levantador Oficial"}`
    : "⚡ *Posição:* Linha de Passe / Defesa / Ataque";
  const statsBadge =
    matchesPlayed > 0
      ? `📊 *Histórico no Clube:* ${matchesPlayed} jogos • ${wins} vitórias • *${elo} ELO*`
      : `📊 *Pontuação ELO:* *${elo} pts*`;

  const fullText =
    `🎂🎉 *FELIZ ANIVERSÁRIO, ${playerName.toUpperCase()}!* 🏐🥳
` +
    `${roleBadge} | ${statsBadge}

` +
    `${bodyText}

` +
    `Toda a família *Guerreiros VC* deseja felicidades e grandes rachões pela frente! 💛🖤

` +
    `— Guerreirinho, o robô do clube 🤖`;

  const privateText =
    `🎂🥳 *PARABÉNS PELO SEU DIA, ${firstName.toUpperCase()}!* 🏐💛

` +
    `${privateBody}

` +
    `Conte sempre com a família *Guerreiros VC*! Nos vemos na quadra! 🔥

` +
    `— Guerreirinho, o robô do clube 🤖`;

  return { fullText, privateText, bodyText };
}

// Formata duração real da partida em minutos/segundos (trata duration em segundos e evita inflar registros manuais de 4s/5s como minutos)
function resolveMatchDurationInfo(
  match: any,
  prevMatchTimestamp?: number
): { label: string; seconds: number; isEstimated: boolean } {
  const rawDur = Number(
    match.duration || match.durationSeconds || match.matchDuration || match.elapsedTime || 0
  );
  const rawSec = rawDur > 36000 ? Math.round(rawDur / 1000) : Math.round(rawDur);

  // 1) Cronômetro válido registrado na partida (entre 2 min e 90 min)
  if (rawSec >= 120 && rawSec <= 5400) {
    const mins = Math.floor(rawSec / 60);
    const secs = rawSec % 60;
    return {
      label: secs > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${mins} min`,
      seconds: rawSec,
      isEstimated: false
    };
  }

  // 2) Diferença real entre startTime e endTime (se o cronômetro da UI travou mas o relógio rodou)
  if (match.startTime && match.endTime) {
    const spanSec = Math.round((Number(match.endTime) - Number(match.startTime)) / 1000);
    if (spanSec >= 120 && spanSec <= 5400) {
      const mins = Math.floor(spanSec / 60);
      const secs = spanSec % 60;
      return {
        label: secs > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${mins} min`,
        seconds: spanSec,
        isEstimated: false
      };
    }
  }

  // 3) Quando o placar foi lançado sem cronômetro (ex: 4s/5s), estima pela diferença real até a partida anterior descontando ~90s de rodízio
  const curTs = Number(match.endTime || match.timestamp || match.createdAt || 0);
  if (prevMatchTimestamp && curTs > prevMatchTimestamp) {
    const deltaSec = Math.round((curTs - prevMatchTimestamp) / 1000);
    if (deltaSec >= 180 && deltaSec <= 3000) {
      const estSec = Math.max(240, deltaSec - 90);
      const estMin = Math.round(estSec / 60);
      return {
        label: `~${estMin} min`,
        seconds: estSec,
        isEstimated: true
      };
    }
  }

  return { label: "N/D", seconds: 0, isEstimated: true };
}

function formatMatchDuration(match: any, prevMatchTimestamp?: number): string {
  return resolveMatchDurationInfo(match, prevMatchTimestamp).label;
}

function extractTeamIds(team: any[]): string[] {
  if (!Array.isArray(team)) return [];
  return team.map((item) => (typeof item === "string" ? item : item?.id || "")).filter(Boolean);
}

export function buildPostGameSummaryAndDayRanking(
  matchesOfDay: any[],
  allPlayers: any[],
  targetDateStr: string
): string | null {
  if (!matchesOfDay || matchesOfDay.length === 0) return null;

  const playerMap = new Map<string, any>();
  allPlayers.forEach((p) => playerMap.set(p.id, p));

  const getShortName = (id: string) => {
    const p = playerMap.get(id);
    if (!p || !p.name) return "Guerreiro";
    const parts = String(p.name).trim().split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
  };

  const stats = new Map<
    string,
    { wins: number; losses: number; games: number; pointsDiff: number; eloDelta: number }
  >();
  const pairWins = new Map<string, number>();

  const sortedMatches = [...matchesOfDay].sort(
    (a, b) =>
      Number(a.timestamp || a.createdAt || 0) - Number(b.timestamp || b.createdAt || 0)
  );

  const matchLines: string[] = [];

  sortedMatches.forEach((m, idx) => {
    const scoreA = Number(m.scoreA ?? m.teamAScore ?? 0);
    const scoreB = Number(m.scoreB ?? m.teamBScore ?? 0);
    const teamA = extractTeamIds(m.teamA);
    const teamB = extractTeamIds(m.teamB);
    const aWon = scoreA > scoreB;
    const bWon = scoreB > scoreA;

    const prevTs =
      idx > 0
        ? Number(sortedMatches[idx - 1].timestamp || sortedMatches[idx - 1].createdAt || 0)
        : undefined;
    const durStr = formatMatchDuration(m, prevTs);

    matchLines.push(
      `🏐 *Jogo ${String(idx + 1).padStart(2, "0")}:* ${scoreA} x ${scoreB} _(⏱️ ${durStr})_`
    );

    const processTeam = (team: string[], won: boolean, diff: number) => {
      team.forEach((pid) => {
        const cur = stats.get(pid) || { wins: 0, losses: 0, games: 0, pointsDiff: 0, eloDelta: 0 };
        cur.games += 1;
        if (won) cur.wins += 1;
        else cur.losses += 1;
        cur.pointsDiff += diff;
        const exactDelta = m.eloChanges?.[pid] ?? (won ? 12 : -10);
        cur.eloDelta += Number(exactDelta);
        stats.set(pid, cur);
      });

      if (won && team.length >= 2) {
        const sortedIds = [...team].sort();
        for (let i = 0; i < sortedIds.length; i++) {
          for (let j = i + 1; j < sortedIds.length; j++) {
            const key = `${sortedIds[i]}|${sortedIds[j]}`;
            pairWins.set(key, (pairWins.get(key) || 0) + 1);
          }
        }
      }
    };

    if (aWon || bWon) {
      processTeam(teamA, aWon, scoreA - scoreB);
      processTeam(teamB, bWon, scoreB - scoreA);
    }
  });

  if (stats.size === 0) return null;

  const rankedTonight = Array.from(stats.entries())
    .map(([pid, st]) => ({
      pid,
      name: playerMap.get(pid)?.name || "Guerreiro",
      ...st,
      winRate: st.games > 0 ? Math.round((st.wins / st.games) * 100) : 0
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
      return b.winRate - a.winRate;
    });

  const mvp = rankedTonight[0];
  let bestPairKey = "";
  let bestPairWins = 0;
  pairWins.forEach((w, key) => {
    if (w > bestPairWins) {
      bestPairWins = w;
      bestPairKey = key;
    }
  });

  let synergySection = "";
  if (bestPairKey && bestPairWins >= 2) {
    const [p1, p2] = bestPairKey.split("|");
    synergySection = `\n🤝 *DUPLA DE OURO DA NOITE:*\n🔥 *${getShortName(p1)} & ${getShortName(p2)}* (${bestPairWins} vitórias juntos!)\n`;
  }

  const formattedDate = targetDateStr.split("-").reverse().slice(0, 2).join("/");

  return (
    `🏆 *RANKING DO DIA & RESUMO (${formattedDate}) — GUERREIROS VC* 🏐🔥\n\n` +
    `📊 *Total:* ${sortedMatches.length} partidas | ${stats.size} guerreiros em quadra\n` +
    `👑 *MVP DA NOITE:* *${mvp.name}* (${mvp.wins}V/${mvp.losses}D • ${mvp.winRate}% • Saldo ${mvp.pointsDiff > 0 ? "+" : ""}${mvp.pointsDiff})\n` +
    synergySection +
    `\n📈 *RANKING COMPLETO DA NOITE:*\n` +
    rankedTonight
      .map((p, i) => {
        const medal =
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${String(i + 1).padStart(2, "0")}.`;
        const diffStr = p.pointsDiff > 0 ? `+${p.pointsDiff}` : `${p.pointsDiff}`;
        return `${medal} *${p.name}* — *${p.wins}V/${p.losses}D* (${p.winRate}% | Saldo: ${diffStr})`;
      })
      .join("\n") +
    `\n\n⏱️ *LINHA DO TEMPO DOS JOGOS DA NOITE:*\n` +
    matchLines.join("\n") +
    `\n\n💡 _Digite *gv minhanoite* ou pergunte "como foram minhas partidas hoje?" para ver sua matriz individual jogo a jogo!_\n\n` +
    `— Guerreirinho, o robô do clube 🤖`
  );
}

export function buildPlayerNightTimelineReport(
  player: any,
  allMatches: any[],
  allPlayers: any[],
  requestedDateStr?: string
): string {
  const playerMap = new Map<string, any>();
  allPlayers.forEach((p) => playerMap.set(p.id, p));

  const getShortName = (id: string) => {
    const p = playerMap.get(id);
    if (!p || !p.name) return "Sócio";
    return String(p.name).trim().split(" ")[0];
  };

  const sortedAll = [...allMatches].sort(
    (a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0)
  );

  const targetDate =
    requestedDateStr ||
    sortedAll[0]?.date ||
    (sortedAll[0]?.timestamp
      ? getFirestoreDateKey(new Date(Number(sortedAll[0].timestamp)))
      : getFirestoreDateKey());

  const matchesOfNight = allMatches
    .filter((m) => {
      const mDate =
        m.date || (m.timestamp ? getFirestoreDateKey(new Date(Number(m.timestamp))) : "");
      return mDate === targetDate;
    })
    .sort(
      (a, b) => Number(a.timestamp || a.createdAt || 0) - Number(b.timestamp || b.createdAt || 0)
    );

  const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");

  if (matchesOfNight.length === 0) {
    return `🏐 *MATRIZ & LINHA DO TEMPO DA NOITE (${formattedDate})*\n\nAinda não há partidas registradas no sistema para a data ${formattedDate}.`;
  }

  let wins = 0;
  let losses = 0;
  let pointsDiff = 0;
  let totalPlayedSeconds = 0;
  let timedGamesCount = 0;
  let hasEstimatedTime = false;
  let currentStreak = 0;
  let bestWinStreak = 0;
  const matrixLines: string[] = [];
  const timelineDetails: string[] = [];

  const partnerStats = new Map<string, { wins: number; losses: number; games: number; diff: number }>();
  const opponentStats = new Map<string, { wins: number; losses: number; games: number; diff: number }>();
  const nightRankingMap = new Map<string, { wins: number; losses: number; games: number; diff: number }>();

  const canonicalIdOf = (rawId: string): string => {
    const found = allPlayers.find((p) => p.id === rawId || (p.uid && p.uid === rawId));
    return found?.id || rawId;
  };

  const playerIdsToMatch = new Set([player.id, player.uid].filter(Boolean));

  matchesOfNight.forEach((m, idx) => {
    const gameNum = String(idx + 1).padStart(2, "0");
    const scoreA = Number(m.scoreA ?? m.teamAScore ?? 0);
    const scoreB = Number(m.scoreB ?? m.teamBScore ?? 0);
    const teamA = extractTeamIds(m.teamA);
    const teamB = extractTeamIds(m.teamB);
    const aWon = scoreA > scoreB;
    const bWon = scoreB > scoreA;

    // Alimenta o ranking geral da noite para calcular a posição exata do atleta
    const trackNightPlayer = (pid: string, wonGame: boolean, ptsDiff: number) => {
      const cid = canonicalIdOf(pid);
      const cur = nightRankingMap.get(cid) || { wins: 0, losses: 0, games: 0, diff: 0 };
      cur.games++;
      if (wonGame) cur.wins++;
      else cur.losses++;
      cur.diff += ptsDiff;
      nightRankingMap.set(cid, cur);
    };
    teamA.forEach((id) => trackNightPlayer(id, aWon, scoreA - scoreB));
    teamB.forEach((id) => trackNightPlayer(id, bWon, scoreB - scoreA));

    const prevTs =
      idx > 0
        ? Number(
            matchesOfNight[idx - 1].endTime ||
              matchesOfNight[idx - 1].timestamp ||
              matchesOfNight[idx - 1].createdAt ||
              0
          )
        : undefined;
    const durInfo = resolveMatchDurationInfo(m, prevTs);
    const durStr = durInfo.label;

    const inA = teamA.some((id) => playerIdsToMatch.has(id));
    const inB = teamB.some((id) => playerIdsToMatch.has(id));

    if (!inA && !inB) {
      matrixLines.push(
        `J${gameNum} │ ⚪ FORA    │ ${String(scoreA).padStart(2, "0")}x${String(scoreB).padStart(2, "0")} │ ⏱️ ${durStr}`
      );
      timelineDetails.push(
        `⚪ *Partida ${gameNum}:* Ficou no rodízio _(Placar da quadra: ${scoreA}x${scoreB} • ⏱️ ${durStr})_`
      );
      return;
    }

    const myScore = inA ? scoreA : scoreB;
    const oppScore = inA ? scoreB : scoreA;
    const won = myScore > oppScore;
    const diff = myScore - oppScore;

    if (won) {
      wins++;
      currentStreak++;
      if (currentStreak > bestWinStreak) bestWinStreak = currentStreak;
    } else {
      losses++;
      currentStreak = 0;
    }
    pointsDiff += diff;
    if (durInfo.seconds > 0) {
      totalPlayedSeconds += durInfo.seconds;
      timedGamesCount++;
      if (durInfo.isEstimated) hasEstimatedTime = true;
    }

    const myTeamIds = (inA ? teamA : teamB).filter((id) => !playerIdsToMatch.has(id));
    const oppTeamIds = (inA ? teamB : teamA).filter((id) => !playerIdsToMatch.has(id));

    myTeamIds.forEach((pid) => {
      const cid = canonicalIdOf(pid);
      const st = partnerStats.get(cid) || { wins: 0, losses: 0, games: 0, diff: 0 };
      st.games++;
      if (won) st.wins++;
      else st.losses++;
      st.diff += diff;
      partnerStats.set(cid, st);
    });

    oppTeamIds.forEach((pid) => {
      const cid = canonicalIdOf(pid);
      const st = opponentStats.get(cid) || { wins: 0, losses: 0, games: 0, diff: 0 };
      st.games++;
      if (won) st.wins++;
      else st.losses++;
      st.diff += diff;
      opponentStats.set(cid, st);
    });

    const partners = myTeamIds.map(getShortName).join(", ");
    const scoreFormatted = `${String(myScore).padStart(2, "0")}x${String(oppScore).padStart(2, "0")}`;

    matrixLines.push(
      `J${gameNum} │ ${won ? "✅ GANHOU " : "❌ PERDEU "} │ *${scoreFormatted}* │ ⏱️ ${durStr}`
    );

    timelineDetails.push(
      `${won ? "🟢" : "🔴"} *Partida ${gameNum}:* *${won ? "VITÓRIA" : "DERROTA"} (${myScore}x${oppScore})* — ⏱️ *${durStr}*\n` +
        `   └ 🤝 _Seu Time:_ ${partners || "Time"}`
    );
  });

  const totalGamesPlayed = wins + losses;
  const wr = totalGamesPlayed > 0 ? Math.round((wins / totalGamesPlayed) * 100) : 0;

  // Posição no ranking da noite
  const rankedTonight = Array.from(nightRankingMap.entries())
    .map(([id, st]) => ({
      id,
      wins: st.wins,
      losses: st.losses,
      games: st.games,
      diff: st.diff,
      wr: st.games > 0 ? st.wins / st.games : 0
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.wr !== a.wr) return b.wr - a.wr;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.games - a.games;
    });
  const myCanonicalId = canonicalIdOf(player.id);
  const nightPosIdx = rankedTonight.findIndex((r) => r.id === myCanonicalId);
  const nightRankLine =
    nightPosIdx >= 0
      ? `• *Posição no Ranking da Noite:* *#${nightPosIdx + 1}* de ${rankedTonight.length} atletas\n`
      : "";

  const eloDelta = wins * 20 - losses * 20 + (totalGamesPlayed >= 2 ? 20 : 0);
  const eloLine =
    totalGamesPlayed > 0
      ? `• *Variação ELO na Noite:* *${eloDelta >= 0 ? `+${eloDelta}` : eloDelta} pts*${totalGamesPlayed >= 2 ? " _(inclui +20 bônus presença)_" : ""}\n`
      : "";

  const streakLine =
    bestWinStreak >= 2 ? `• *Maior Sequência:* 🔥 *${bestWinStreak} vitórias seguidas*\n` : "";

  const totalPlayedMinutes = Math.round(totalPlayedSeconds / 60);
  let courtTimeLine = "";
  if (totalGamesPlayed > 0) {
    if (totalPlayedMinutes > 0) {
      const partialNote =
        timedGamesCount < totalGamesPlayed
          ? ` _(${timedGamesCount} de ${totalGamesPlayed} jogos com tempo)_`
          : hasEstimatedTime
          ? " _(estimado)_"
          : "";
      courtTimeLine = `• *Tempo em Quadra:* ~${totalPlayedMinutes} min${partialNote}`;
    } else {
      courtTimeLine = `• *Tempo em Quadra:* N/D _(cronômetro não iniciado)_`;
    }
  }

  // Sinergia & Confrontos da Noite
  const partnerEntries = Array.from(partnerStats.entries()).map(([id, st]) => ({
    id,
    name: getShortName(id),
    ...st,
    wr: st.games > 0 ? Math.round((st.wins / st.games) * 100) : 0
  }));

  const bestPartners = [...partnerEntries]
    .filter((p) => p.wins > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.wr !== a.wr) return b.wr - a.wr;
      return b.diff - a.diff;
    });

  const worstPartners = [...partnerEntries]
    .filter((p) => p.losses > 0)
    .sort((a, b) => {
      if (a.wr !== b.wr) return a.wr - b.wr;
      if (b.losses !== a.losses) return b.losses - a.losses;
      return a.diff - b.diff;
    });

  const oppEntries = Array.from(opponentStats.entries()).map(([id, st]) => ({
    id,
    name: getShortName(id),
    ...st
  }));

  const topVictims = [...oppEntries]
    .filter((o) => o.wins > 0)
    .sort((a, b) => (b.wins !== a.wins ? b.wins - a.wins : b.diff - a.diff));

  const topNemesis = [...oppEntries]
    .filter((o) => o.losses > 0)
    .sort((a, b) => (b.losses !== a.losses ? b.losses - a.losses : a.diff - b.diff));

  const formatTopGroup = (
    items: Array<{ name: string; wins: number; losses: number; diff: number; wr?: number }>,
    mode: "partner_best" | "partner_worst" | "opp_win" | "opp_loss"
  ): string => {
    if (items.length === 0) return "";
    const top = items[0];
    const tied = items
      .filter((x) => {
        if (mode === "partner_best") return x.wins === top.wins && x.losses === top.losses && x.diff === top.diff;
        if (mode === "partner_worst") return x.wr === top.wr && x.losses === top.losses && x.diff === top.diff;
        if (mode === "opp_win") return x.wins === top.wins && x.losses === top.losses;
        return x.losses === top.losses && x.wins === top.wins;
      })
      .slice(0, 3);
    const names = tied.map((x) => `*${x.name}*`).join(", ");
    if (mode === "partner_best" || mode === "partner_worst") {
      const diffStr = top.diff > 0 ? `+${top.diff}` : `${top.diff}`;
      return `${names} (${top.wins}V/${top.losses}D • ${top.wr}% • ${diffStr} pts)`;
    }
    if (mode === "opp_win") {
      return `${names} (${top.wins} vitória${top.wins > 1 ? "s" : ""} contra)`;
    }
    return `${names} (${top.losses} derrota${top.losses > 1 ? "s" : ""} contra)`;
  };

  const synergyLines: string[] = [];
  if (bestPartners.length > 0) {
    synergyLines.push(`• 🔥 *Maior Sinergia:* ${formatTopGroup(bestPartners, "partner_best")}`);
  }
  if (worstPartners.length > 0) {
    const filteredWorst = worstPartners.filter((p) => !bestPartners.slice(0, 1).some((b) => b.id === p.id && b.losses === 0));
    if (filteredWorst.length > 0) {
      synergyLines.push(`• ❄️ *Menor Sinergia:* ${formatTopGroup(filteredWorst, "partner_worst")}`);
    }
  }
  if (topVictims.length > 0 && topVictims[0].wins >= 2) {
    synergyLines.push(`• 🎯 *Freguês da Noite:* ${formatTopGroup(topVictims, "opp_win")}`);
  }
  if (topNemesis.length > 0 && topNemesis[0].losses >= 2) {
    synergyLines.push(`• ⚔️ *Carrasco da Noite:* ${formatTopGroup(topNemesis, "opp_loss")}`);
  }

  const synergyBlock =
    synergyLines.length > 0
      ? `\n\n🤝 *SINERGIA & CONFRONTOS DA NOITE:*\n${synergyLines.join("\n")}`
      : "";

  return (
    `📊 *MATRIZ & LINHA DO TEMPO DA NOITE (${formattedDate})*\n` +
    `👤 *Atleta:* ${player.name}\n\n` +
    `🧭 *MATRIZ DAS PARTIDAS (JOGO │ STATUS │ PLACAR │ TEMPO):*\n` +
    matrixLines.map((line) => `• ${line}`).join("\n") +
    `\n\n⏱️ *DETALHAMENTO COM SEUS PARCEIROS DE QUADRA:*\n` +
    timelineDetails.join("\n\n") +
    synergyBlock +
    `\n\n───────────────────\n` +
    `📈 *SEU SALDO NA NOITE:*\n` +
    `• *Partidas Jogadas:* ${totalGamesPlayed} de ${matchesOfNight.length}\n` +
    `• *Resultado:* *${wins} Vitórias* e *${losses} Derrotas* (${wr}%)\n` +
    `• *Saldo de Pontos:* ${pointsDiff > 0 ? `+${pointsDiff}` : pointsDiff} pts\n` +
    nightRankLine +
    eloLine +
    streakLine +
    courtTimeLine
  );
}

export const getNextThursday = () => {
  const todayStr = getFirestoreDateKey();
  const [y, m, d] = todayStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = getBrazilDay();

  let diff = 4 - day;
  if (diff < 0) diff += 7;

  date.setUTCDate(date.getUTCDate() + diff);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export const getCycleFridayCutoffTimestamp = (targetThursdayStr?: string): number => {
  const thursdayStr =
    targetThursdayStr && /^\d{4}-\d{2}-\d{2}$/.test(targetThursdayStr)
      ? targetThursdayStr
      : getNextThursday();
  const thursdayMidnightBRT = new Date(`${thursdayStr}T00:00:00-03:00`).getTime();
  return thursdayMidnightBRT - 6 * 24 * 60 * 60 * 1000;
};


function getPlayerIntentAliases(player: any, existingKeys?: string[]): string[] {
  if (!player) return [];
  const norm = (s: string) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const pName = norm(player.name);
  const compactName = pName.replace(/[^a-z0-9]+/g, "");
  const firstToken = pName.split(/[^a-z0-9]+/)[0];
  const cleanPhone = String(player.phone || "").replace(/\D/g, "");

  const keys = new Set<string>();
  const add = (k?: string | null) => {
    if (k && typeof k === "string" && k.trim()) keys.add(k.trim());
  };

  add(player.id);
  add(player.uid);
  if (player.email) add(player.email.trim().toLowerCase());
  add(pName);
  add(compactName);
  add(firstToken);
  if (firstToken) add(`seed_${firstToken}`);
  if (compactName) add(`seed_${compactName}`);
  if (cleanPhone.length >= 8) {
    add(`wa_${cleanPhone}`);
    if (cleanPhone.length >= 10 && !cleanPhone.startsWith("55")) {
      add(`wa_55${cleanPhone}`);
    }
    if (Array.isArray(existingKeys) && existingKeys.length > 0) {
      const last8 = cleanPhone.slice(-8);
      for (const rk of existingKeys) {
        if (rk.startsWith("wa_") && rk.slice(-8) === last8) {
          keys.add(rk);
        }
      }
    }
  }
  return Array.from(keys);
}

function resolvePlayerIntentEntry(
  player: any,
  responses: Record<string, string>,
  timestamps: Record<string, number>,
  cutoffTs = 0
): { status: string | null; ts: number } {
  if (!player || !responses) return { status: null, ts: 0 };

  const keys = getPlayerIntentAliases(player, Object.keys(responses));

  let bestStatus: string | null = null;
  let latestTsForDecision = 0;
  let earliestGoingTs = Infinity;
  let earliestNotGoingTs = Infinity;

  for (const k of keys) {
    const st = responses[k];
    if (st === "GOING" || st === "NOT_GOING") {
      const kTs = Number(timestamps?.[k] || 0);
      if (cutoffTs > 0 && kTs > 0 && kTs < cutoffTs) continue;
      const effectiveKTs = kTs > 0 ? kTs : 1;
      if (st === "GOING" && effectiveKTs < earliestGoingTs) {
        earliestGoingTs = effectiveKTs;
      } else if (st === "NOT_GOING" && effectiveKTs < earliestNotGoingTs) {
        earliestNotGoingTs = effectiveKTs;
      }
      if (!bestStatus || effectiveKTs > latestTsForDecision) {
        bestStatus = st;
        latestTsForDecision = effectiveKTs;
      }
    }
  }

  if (!bestStatus) return { status: null, ts: 0 };
  const resolvedTs =
    bestStatus === "GOING" && earliestGoingTs < Infinity
      ? earliestGoingTs
      : bestStatus === "NOT_GOING" && earliestNotGoingTs < Infinity
      ? latestTsForDecision
      : latestTsForDecision;

  return { status: bestStatus, ts: resolvedTs };
}

export const unpackIntentionsDoc = (raw: any, fallbackTargetDate: string) => {
  const data = raw || {};
  const responses: Record<string, string> = { ...(data.responses || {}) };
  const confirmationTimestamps: Record<string, number> = { ...(data.confirmationTimestamps || {}) };
  const remindersSent: Record<string, boolean> = { ...(data.remindersSent || {}) };

  Object.keys(data).forEach((k) => {
    if (k.startsWith("responses.")) {
      const id = k.substring("responses.".length).trim();
      if (data[k] === "GOING" || data[k] === "NOT_GOING") {
        responses[id] = data[k];
      }
    } else if (k.startsWith("confirmationTimestamps.")) {
      const id = k.substring("confirmationTimestamps.".length).trim();
      const ts = Number(data[k]);
      if (!isNaN(ts) && ts > 0) {
        confirmationTimestamps[id] = ts;
      }
    } else if (k.startsWith("remindersSent.")) {
      const id = k.substring("remindersSent.".length).trim();
      remindersSent[id] = Boolean(data[k]);
    }
  });

  return {
    targetDate: data.targetDate || fallbackTargetDate,
    automationEnabled: data.automationEnabled ?? true,
    responses,
    confirmationTimestamps,
    remindersSent,
    lastUpdated: data.lastUpdated || Date.now()
  };
};

const challengeStore = new Map<string, TemporaryChallenge>();

const CREDENTIALS_FILE_PATH = path.join(process.cwd(), "webauthn_credentials_local.json");
let memoryCredentialsCache: Record<string, any> = {};

function loadLocalCredentials(): Record<string, any> {
  if (Object.keys(memoryCredentialsCache).length > 0) {
    return memoryCredentialsCache;
  }
  try {
    if (fs.existsSync(CREDENTIALS_FILE_PATH)) {
      const data = fs.readFileSync(CREDENTIALS_FILE_PATH, "utf-8");
      memoryCredentialsCache = JSON.parse(data) || {};
      return memoryCredentialsCache;
    }
  } catch (err) {}
  return {};
}

function saveLocalCredential(id: string, credentialData: any) {
  memoryCredentialsCache[id] = credentialData;
  try {
    fs.writeFileSync(
      CREDENTIALS_FILE_PATH,
      JSON.stringify(memoryCredentialsCache, null, 2),
      "utf-8"
    );
  } catch (err) {}
}

function updateLocalCredentialCounter(id: string, counter: number) {
  if (memoryCredentialsCache[id]) {
    memoryCredentialsCache[id].counter = counter;
    try {
      fs.writeFileSync(
        CREDENTIALS_FILE_PATH,
        JSON.stringify(memoryCredentialsCache, null, 2),
        "utf-8"
      );
    } catch (err) {}
  }
}

let adminApp: any = null;
let adminDb: any = null;
let adminAuth: any = null;
let clientFirestoreDb: any = null;
let useClientFirestoreFallback = false;

async function getAdminApp() {
  if (adminApp) return adminApp;
  const { initializeApp: initializeAdmin, getApps: getAdminApps } = await import(
    "firebase-admin/app"
  );
  if (getAdminApps().length === 0) {
    try {
      adminApp = initializeAdmin({ projectId: configProjectId });
    } catch (e) {
      adminApp = initializeAdmin();
    }
  } else {
    adminApp = getAdminApps()[0];
  }
  return adminApp;
}

function resolveActiveFirestoreDatabaseId(): string | undefined {
  const rawId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId;
  if (rawId && rawId !== "(default)" && !String(rawId).startsWith("ai-studio-")) {
    return rawId;
  }
  return undefined;
}

async function getClientFirestoreAdapter() {
  if (clientFirestoreDb) return clientFirestoreDb;
  const { initializeApp: initClientApp, getApps: getClientApps } = await import("firebase/app");
  const {
    getFirestore: getClientFirestore,
    setLogLevel,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    deleteField: clientDeleteField
  } = await import("firebase/firestore");

  try {
    setLogLevel("silent");
  } catch {}

  const clientApp =
    getClientApps().length > 0 ? getClientApps()[0] : initClientApp(firebaseConfig);
  try {
    const { getAuth: getClientAuth, signInAnonymously } = await import("firebase/auth");
    const clientAuth = getClientAuth(clientApp);
    if (!clientAuth.currentUser) {
      await signInAnonymously(clientAuth).catch(() => {});
    }
  } catch {}
  const lockedDbId = resolveActiveFirestoreDatabaseId();
  const rawDb = lockedDbId
    ? getClientFirestore(clientApp, lockedDbId)
    : getClientFirestore(clientApp);

  const replaceClientSentinels = (payload: any): any => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      out[k] = v === "__FIREBASE_DELETE_FIELD__" ? clientDeleteField() : v;
    }
    return out;
  };

  const makeDocRef = (pathSegments: string[]): any => ({
    id: pathSegments[pathSegments.length - 1],
    async get() {
      const snap = await getDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])));
      return {
        id: snap.id,
        exists: snap.exists(),
        data: () => snap.data()
      };
    },
    async set(data: any, options?: any) {
      const cleanData = replaceClientSentinels(data);
      if (options) {
        await setDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), cleanData, options);
      } else {
        await setDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), cleanData);
      }
    },
    async update(data: any) {
      const cleanData = replaceClientSentinels(data);
      await updateDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), cleanData);
    },
    async delete() {
      await deleteDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])));
    },
    collection(subCol: string) {
      return makeColRef([...pathSegments, subCol]);
    }
  });

  const makeColRef = (pathSegments: string[]): any => ({
    doc(docId: string) {
      return makeDocRef([...pathSegments, docId]);
    },
    async get() {
      const snap = await getDocs(collection(rawDb, ...(pathSegments as [string, ...string[]])));
      return {
        empty: snap.empty,
        size: snap.size,
        docs: snap.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data() })),
        forEach(cb: (d: any) => void) {
          snap.forEach((d) => cb({ id: d.id, exists: true, data: () => d.data() }));
        }
      };
    }
  });

  clientFirestoreDb = {
    collection(colName: string) {
      return makeColRef([colName]);
    }
  };
  return clientFirestoreDb;
}

async function getRawAdminFirestore() {
  if (adminDb) return adminDb;
  const app = await getAdminApp();
  const { getFirestore: getAdminFirestoreInstance } = await import("firebase-admin/firestore");
  const lockedDbId = resolveActiveFirestoreDatabaseId();
  if (lockedDbId) {
    adminDb = getAdminFirestoreInstance(app, lockedDbId);
  } else {
    adminDb = getAdminFirestoreInstance(app);
  }
  try {
    adminDb.settings({ maxIdleChannels: 1 });
  } catch {}
  return adminDb;
}

function isPermissionDeniedError(err: any): boolean {
  const msg = String(err?.message || err || "");
  return (
    Boolean(err) ||
    err?.code === 7 ||
    err?.code === 16 ||
    err?.code === 4 ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("UNAUTHENTICATED") ||
    msg.includes("DEADLINE_EXCEEDED") ||
    msg.includes("FIRESTORE_TIMEOUT") ||
    msg.includes("credentials") ||
    msg.includes("insufficient permissions")
  );
}

async function getFirestore() {
  if (useClientFirestoreFallback && firebaseConfig?.apiKey) {
    return getClientFirestoreAdapter();
  }

  const rawAdmin = await getRawAdminFirestore();
  const { FieldValue: AdminFieldValue } = await import("firebase-admin/firestore");
  const replaceAdminSentinels = (payload: any): any => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      out[k] = v === "__FIREBASE_DELETE_FIELD__" ? AdminFieldValue.delete() : v;
    }
    return out;
  };

  if (!firebaseConfig?.apiKey) {
    return rawAdmin;
  }

  const wrapDocRef = (pathSegments: string[], adminDocRef: any): any => ({
    id: pathSegments[pathSegments.length - 1],
    async get() {
      if (useClientFirestoreFallback) {
        const client = await getClientFirestoreAdapter();
        let ref: any = client;
        for (let i = 0; i < pathSegments.length; i += 2) {
          ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
        }
        return ref.get();
      }
      try {
        return await adminDocRef.get();
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          useClientFirestoreFallback = true;
          const client = await getClientFirestoreAdapter();
          let ref: any = client;
          for (let i = 0; i < pathSegments.length; i += 2) {
            ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
          }
          return ref.get();
        }
        throw err;
      }
    },
    async set(data: any, options?: any) {
      if (useClientFirestoreFallback) {
        const client = await getClientFirestoreAdapter();
        let ref: any = client;
        for (let i = 0; i < pathSegments.length; i += 2) {
          ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
        }
        return ref.set(data, options);
      }
      try {
        const adminData = replaceAdminSentinels(data);
        return options ? await adminDocRef.set(adminData, options) : await adminDocRef.set(adminData);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          useClientFirestoreFallback = true;
          const client = await getClientFirestoreAdapter();
          let ref: any = client;
          for (let i = 0; i < pathSegments.length; i += 2) {
            ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
          }
          return ref.set(data, options);
        }
        throw err;
      }
    },
    async update(data: any) {
      if (useClientFirestoreFallback) {
        const client = await getClientFirestoreAdapter();
        let ref: any = client;
        for (let i = 0; i < pathSegments.length; i += 2) {
          ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
        }
        return ref.update(data);
      }
      try {
        const adminData = replaceAdminSentinels(data);
        return await adminDocRef.update(adminData);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          useClientFirestoreFallback = true;
          const client = await getClientFirestoreAdapter();
          let ref: any = client;
          for (let i = 0; i < pathSegments.length; i += 2) {
            ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
          }
          return ref.update(data);
        }
        throw err;
      }
    },
    async delete() {
      if (useClientFirestoreFallback) {
        const client = await getClientFirestoreAdapter();
        let ref: any = client;
        for (let i = 0; i < pathSegments.length; i += 2) {
          ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
        }
        return ref.delete();
      }
      try {
        return await adminDocRef.delete();
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          useClientFirestoreFallback = true;
          const client = await getClientFirestoreAdapter();
          let ref: any = client;
          for (let i = 0; i < pathSegments.length; i += 2) {
            ref = ref.collection(pathSegments[i]).doc(pathSegments[i + 1]);
          }
          return ref.delete();
        }
        throw err;
      }
    },
    collection(subCol: string) {
      return wrapColRef([...pathSegments, subCol], adminDocRef.collection(subCol));
    }
  });

  const wrapColRef = (pathSegments: string[], adminColRef: any): any => ({
    doc(docId: string) {
      return wrapDocRef([...pathSegments, docId], adminColRef.doc(docId));
    },
    async get() {
      if (useClientFirestoreFallback) {
        const client = await getClientFirestoreAdapter();
        let ref: any = client.collection(pathSegments[0]);
        for (let i = 1; i < pathSegments.length; i += 2) {
          ref = ref.doc(pathSegments[i]).collection(pathSegments[i + 1]);
        }
        return ref.get();
      }
      try {
        return await adminColRef.get();
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          useClientFirestoreFallback = true;
          const client = await getClientFirestoreAdapter();
          let ref: any = client.collection(pathSegments[0]);
          for (let i = 1; i < pathSegments.length; i += 2) {
            ref = ref.doc(pathSegments[i]).collection(pathSegments[i + 1]);
          }
          return ref.get();
        }
        throw err;
      }
    }
  });

  return {
    collection(colName: string) {
      return wrapColRef([colName], rawAdmin.collection(colName));
    }
  };
}

async function getAdminAuth() {
  if (adminAuth) return adminAuth;
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  adminAuth = getAuth(app);
  return adminAuth;
}

async function getCachedPlayers(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (cachedPlayers.length < 10) {
    cachedPlayers = loadLocalPlayersBackup();
  }
  const hasRealFirestoreIds = cachedPlayers.some((p) => !String(p.id || "").startsWith("seed_"));
  if (!forceRefresh && hasRealFirestoreIds && cachedPlayers.length >= 10 && now - cachedPlayersLastFetch < PLAYERS_CACHE_TTL_MS) {
    return cachedPlayers;
  }

  return withFirestoreGuard(
    async () => {
      const db = await getFirestore();
      const playersSnap = await db.collection("players").get();
      const list: any[] = [];
      playersSnap.forEach((d: any) => {
        try {
          const rawDoc = d.data();
          if (isPlainObject(rawDoc)) {
            list.push(sanitizePlayerPhotoFields({ id: d.id, ...rawDoc }));
          }
        } catch (docErr: any) {
          console.warn(`[Firestore Players] Documento ${d?.id} ignorado por formato inválido:`, docErr?.message);
        }
      });
      if (list.length >= 5) {
        cachedPlayers = list;
        cachedPlayersLastFetch = now;
        saveLocalPlayersBackup(list);
      }
      return cachedPlayers.length > 0 ? cachedPlayers : SEED_CLUB_PLAYERS;
    },
    cachedPlayers.length > 0 ? cachedPlayers : SEED_CLUB_PLAYERS
  );
}

async function getCachedMatches(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (cachedMatches.length === 0) {
    cachedMatches = loadLocalMatchesBackup();
  }
  if (!forceRefresh && cachedMatches.length > 0 && now - cachedMatchesLastFetch < MATCHES_CACHE_TTL_MS) {
    return cachedMatches;
  }

  return withFirestoreGuard(
    async () => {
      const db = await getFirestore();
      const matchesSnap = await db.collection("matches").get();
      const list: any[] = [];
      matchesSnap.forEach((d: any) => {
        try {
          const rawDoc = d.data();
          if (isPlainObject(rawDoc)) {
            list.push({ id: d.id, ...rawDoc });
          }
        } catch (docErr: any) {
          console.warn(`[Firestore Matches] Documento ${d?.id} ignorado por formato inválido:`, docErr?.message);
        }
      });
      if (list.length > 0) {
        cachedMatches = list;
        cachedMatchesLastFetch = now;
        saveLocalMatchesBackup(list);
      }
      return cachedMatches;
    },
    cachedMatches
  );
}

async function getCachedSystemConfig(forceRefresh = false): Promise<Record<string, any>> {
  const now = Date.now();
  if (
    cachedSystemConfig &&
    ((!forceRefresh && now - cachedSystemConfigLastFetch < SYSTEM_CONFIG_CACHE_TTL_MS) ||
      (forceRefresh && now - cachedSystemConfigLastFetch < 2500))
  ) {
    return cachedSystemConfig;
  }

  return withFirestoreGuard(
    async () => {
      const db = await getFirestore();
      const sysSnap = await db.collection("metadata").doc("system").get();
      const rawData = sysSnap.exists ? sysSnap.data() : {};
      cachedSystemConfig = sanitizeFirestorePayload<Record<string, any>>(rawData, "metadata/system", {});
      cachedSystemConfigLastFetch = Date.now();
      return cachedSystemConfig;
    },
    cachedSystemConfig || {},
    4500
  );
}

async function verifyCallerIdentity(req: express.Request): Promise<{
  uid: string | null;
  email: string | null;
  isAdmin: boolean;
}> {
  let uid: string | null = req.body?.uid || null;
  let email: string | null = req.body?.userEmail
    ? String(req.body.userEmail).trim().toLowerCase()
    : null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token && token !== "null" && token !== "undefined") {
      try {
        const auth = await getAdminAuth();
        const decoded = await Promise.race([
          auth.verifyIdToken(token),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
        ]);
        if (decoded) {
          uid = decoded.uid || uid;
          if (decoded.email) {
            email = decoded.email.trim().toLowerCase();
          }
        }
      } catch (e) {}
    }
  }

  if (email === "rodneyes@gmail.com") {
    return { uid, email, isAdmin: true };
  }

  const allPlayers = await getCachedPlayers();
  if (email) {
    const found = allPlayers.find((p) => p.email && p.email.trim().toLowerCase() === email);
    if (found?.isAdmin) return { uid, email, isAdmin: true };
  }

  return { uid, email, isAdmin: Boolean(req.body?.isAdmin && email) };
}

async function syncCredentialsFromFirestore() {
  await withFirestoreGuard(async () => {
    const db = await getFirestore();
    const metaSnap = await db.collection("metadata").doc("webauthn_credentials").get();
    if (metaSnap.exists) {
      const data = metaSnap.data() || {};
      for (const [k, v] of Object.entries(data)) {
        memoryCredentialsCache[k] = v;
      }
      saveLocalCredential(
        Object.keys(data)[0] || "init",
        memoryCredentialsCache[Object.keys(data)[0]] || {}
      );
      delete memoryCredentialsCache["init"];
    }
  }, undefined);
}

async function ensureFreshIntentionsDocument(forceRefresh = false) {
  const nextThu = getNextThursday();
  const todayStr = getFirestoreDateKey();
  const now = Date.now();
  const cutoffTs = getCycleFridayCutoffTimestamp(nextThu);

  if (!cachedIntentions) {
    const diskBackup = loadLocalIntentionsBackup();
    if (diskBackup && diskBackup.targetDate === nextThu) {
      cachedIntentions = diskBackup;
    }
  }

  if (
    !forceRefresh &&
    cachedIntentions &&
    cachedIntentions.targetDate === nextThu &&
    Object.keys(cachedIntentions.responses || {}).length > 0 &&
    now - cachedIntentionsLastFetch < INTENTIONS_CACHE_TTL_MS
  ) {
    return cachedIntentions;
  }

  if (!cachedIntentions || Object.keys(cachedIntentions.responses || {}).length === 0) {
    const seedPlayers = cachedPlayers.length >= 10 ? cachedPlayers : loadLocalPlayersBackup();
    const seedResponses: Record<string, string> = {};
    const seedTimestamps: Record<string, number> = {};
    const norm = (s: string) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    if (nextThu.endsWith("-11-19")) {
      const seedOrder: Array<{ aliases: string[]; status: "GOING" | "NOT_GOING"; ts: number }> = [
        { aliases: ["rodney"], status: "GOING", ts: new Date("2026-11-16T13:45:00-03:00").getTime() },
        { aliases: ["ale", "alexandre"], status: "GOING", ts: new Date("2026-11-17T09:22:00-03:00").getTime() },
        { aliases: ["rozi", "rosangela"], status: "GOING", ts: new Date("2026-11-17T17:28:00-03:00").getTime() },
        { aliases: ["marcleide"], status: "GOING", ts: new Date("2026-11-17T17:33:00-03:00").getTime() },
        { aliases: ["betinha", "elisabete"], status: "GOING", ts: new Date("2026-11-17T17:35:00-03:00").getTime() },
        { aliases: ["flavinha", "flavia"], status: "GOING", ts: new Date("2026-11-17T23:15:00-03:00").getTime() },
        { aliases: ["mari", "mariana"], status: "GOING", ts: new Date("2026-11-18T06:49:00-03:00").getTime() },
        { aliases: ["caluca"], status: "GOING", ts: new Date("2026-11-18T08:49:00-03:00").getTime() },
        { aliases: ["thiago"], status: "GOING", ts: new Date("2026-11-18T17:39:00-03:00").getTime() },
        { aliases: ["beth"], status: "NOT_GOING", ts: new Date("2026-11-17T12:00:00-03:00").getTime() },
        { aliases: ["wandinha"], status: "NOT_GOING", ts: new Date("2026-11-17T12:05:00-03:00").getTime() }
      ];
      seedOrder.forEach(({ aliases, status, ts }) => {
        const fp = seedPlayers.find((p) => {
          const pName = norm(p.name);
          const first = pName.split(/[^a-z0-9]+/)[0];
          return aliases.includes(pName) || aliases.includes(first);
        });
        if (fp) {
          seedResponses[fp.id] = status;
          seedTimestamps[fp.id] = ts;
        }
      });
    }
    cachedIntentions = {
      targetDate: nextThu,
      automationEnabled: true,
      responses: seedResponses,
      confirmationTimestamps: seedTimestamps,
      remindersSent: {},
      lastUpdated: now
    };
  }
  const fallbackDoc = cachedIntentions;

  return withFirestoreGuard(async () => {
    const db = await getFirestore();
    const intentionsRef = db.collection("metadata").doc("intentions");
    const [snap, preConfSnap, allPlayers] = await Promise.all([
      intentionsRef.get(),
      db.collection("preConfirmations").doc(nextThu).collection("players").get().catch(() => null),
      getCachedPlayers(cachedPlayers.length === 0)
    ]);

    const unpacked = snap.exists
      ? unpackIntentionsDoc(snap.data(), nextThu)
      : {
          targetDate: nextThu,
          automationEnabled: true,
          responses: {},
          confirmationTimestamps: {},
          remindersSent: {},
          lastUpdated: now
        };

    const storedTarget = unpacked.targetDate;
    if (storedTarget && storedTarget < todayStr) {
      const rotatedDoc = {
        targetDate: nextThu,
        automationEnabled: unpacked.automationEnabled ?? true,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {},
        lastUpdated: now
      };
      await intentionsRef.set(rotatedDoc);
      cachedIntentions = rotatedDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(rotatedDoc);
      return rotatedDoc;
    }

    const localMem =
      cachedIntentions && cachedIntentions.targetDate === nextThu ? cachedIntentions : null;
    const remoteHasData = snap.exists && unpacked.targetDate === nextThu;
    const remoteIsNewerOrEqual =
      remoteHasData && Number(unpacked.lastUpdated || 0) >= Number(localMem?.lastUpdated || 0);

    const mergedResponses: Record<string, string> = {};
    const mergedTimestamps: Record<string, number> = {};

    // Quando o Firestore possui documento mais recente ou igual, ele é a Fonte Única da Verdade
    // (impede que memória obsoleta ressuscite sócios resetados/removidos)
    const primarySource = remoteIsNewerOrEqual ? unpacked : localMem || unpacked;
    Object.entries(primarySource.responses || {}).forEach(([k, val]) => {
      if (val !== "GOING" && val !== "NOT_GOING") return;
      const ts = Number((primarySource.confirmationTimestamps || {})[k] || primarySource.lastUpdated || 0);
      if (ts >= cutoffTs) {
        mergedResponses[k] = val as string;
        mergedTimestamps[k] = ts;
      }
    });

    // Espelhamento de preConfirmations apenas para sócios sem resposta explícita no documento principal
    if (preConfSnap && typeof preConfSnap.forEach === "function") {
      preConfSnap.forEach((d: any) => {
        const pData = d.data();
        const pid = d.id;
        const pcTs = Number(pData?.timestamp || 0);
        if (!pid || pcTs < cutoffTs) return;
        const matchedPlayer = Array.isArray(allPlayers)
          ? allPlayers.find((p) => p.id === pid || p.uid === pid)
          : null;
        const existingEntry = matchedPlayer
          ? resolvePlayerIntentEntry(matchedPlayer, mergedResponses, mergedTimestamps, cutoffTs)
          : { status: mergedResponses[pid] || null, ts: mergedTimestamps[pid] || 0 };
        if (!existingEntry.status) {
          mergedResponses[pid] = "GOING";
          mergedTimestamps[pid] = pcTs;
        }
      });
    }

    const finalDoc = {
      targetDate: nextThu,
      automationEnabled: unpacked.automationEnabled ?? true,
      responses: mergedResponses,
      confirmationTimestamps: mergedTimestamps,
      remindersSent: {
        ...(unpacked.remindersSent || {}),
        ...(localMem?.remindersSent || {})
      },
      lastUpdated: Math.max(unpacked.lastUpdated || 0, localMem?.lastUpdated || 0, now)
    };

    if (!snap.exists || unpacked.targetDate !== nextThu) {
      await intentionsRef.set(finalDoc);
    }

    cachedIntentions = finalDoc;
    cachedIntentionsLastFetch = now;
    saveLocalIntentionsBackup(finalDoc);
    return finalDoc;
  }, fallbackDoc);
}

async function syncPlayerPreConfirmationDoc(
  db: any,
  targetDate: string,
  player: any,
  status: "GOING" | "NOT_GOING" | "RESET",
  timestamp: number
) {
  if (!player || !player.id || !targetDate) return;

  const existingIdx = cachedPlayers.findIndex((p) => p.id === player.id);
  if (existingIdx === -1 && player.name && cachedPlayers.length >= 10) {
    cachedPlayers.push({
      ...player,
      id: player.id,
      name: player.name,
      email: player.email || null,
      phone: player.phone || null,
      status: "active",
      isDM: false,
      isOfficialSetter: Boolean(player.isOfficialSetter)
    });
  }

  await withFirestoreGuard(async () => {
    const preConfRef = db
      .collection("preConfirmations")
      .doc(targetDate)
      .collection("players")
      .doc(player.id);

    if (status === "GOING") {
      await preConfRef.set(
        {
          id: player.id,
          name: player.name || "Sócio",
          email: player.email ? player.email.trim().toLowerCase() : null,
          uid: player.uid || null,
          gender: player.gender || "MALE",
          elo: typeof player.elo === "number" ? player.elo : 1200,
          isOfficialSetter: Boolean(player.isOfficialSetter),
          status: player.status || "active",
          timestamp
        },
        { merge: true }
      );
    } else {
      await preConfRef.delete();
    }
  }, undefined);
}

// ============================================================================
// 📍 CHECK-IN PRESENCIAL NA QUADRA VIA LOCALIZAÇÃO WHATSAPP (-8.131550, -34.907333)
// R. Barão de Souza Leão, s/n - Boa Viagem, Recife - PE
// ============================================================================
const DEFAULT_COURT_LAT = -8.131550;
const DEFAULT_COURT_LNG = -34.907333;
const DEFAULT_GEOFENCE_RADIUS_METERS = 150; // 150m para compensar cobertura/telhado metálico e área externa da quadra
const COURT_CHECKIN_END_MINUTES = 22 * 60; // Limite de check-in na quadra até às 22h00

interface PendingCourtGeoWatcher {
  playerId: string;
  name: string;
  sharedAt: number;
  lastUpdatedAt: number;
  lastDistanceMeters: number;
  lastLat?: number;
  lastLng?: number;
  arrivalOrder?: number;
  source: string;
  optedOut?: boolean;
  arrived?: boolean;
  remindedAt2045?: boolean;
  lastOutOfRangeReplyAt?: number;
}

// Mutex serializado em memória: garante posições #1, #2, #3... 100% únicas mesmo se vários sócios cruzarem os 150m no mesmo milissegundo
let attendanceCheckInQueue: Promise<any> = Promise.resolve();
function withAttendanceCheckInLock<T>(task: () => Promise<T>): Promise<T> {
  const next = attendanceCheckInQueue.then(task, task);
  attendanceCheckInQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// Cache leve em memória de quem já confirmou chegada hoje (evita leituras extras no Firestore para liveLocation residual)
let presentIdsCacheDateKey = "";
const presentIdsCacheSet = new Set<string>();

function markPresentInMemoryCache(dateKey: string, playerId: string) {
  if (presentIdsCacheDateKey !== dateKey) {
    presentIdsCacheDateKey = dateKey;
    presentIdsCacheSet.clear();
  }
  presentIdsCacheSet.add(playerId);
}

function isPresentInMemoryCache(dateKey: string, playerId: string): boolean {
  return presentIdsCacheDateKey === dateKey && presentIdsCacheSet.has(playerId);
}

// Anti-spoofing (anti-teletransporte): detecta saltos irreais de GPS (>2km em <10s = >720 km/h)
const lastGeoPointByPlayer = new Map<string, { lat: number; lng: number; ts: number }>();

function checkImpossibleGpsJump(playerId: string, lat: number, lng: number): { suspicious: boolean; jumpMeters: number; elapsedSec: number } {
  const now = Date.now();
  const prev = lastGeoPointByPlayer.get(playerId);
  lastGeoPointByPlayer.set(playerId, { lat, lng, ts: now });
  if (!prev) return { suspicious: false, jumpMeters: 0, elapsedSec: 0 };
  const elapsedMs = now - prev.ts;
  if (elapsedMs <= 0 || elapsedMs > 12000) return { suspicious: false, jumpMeters: 0, elapsedSec: Math.round(elapsedMs / 1000) };
  const jumpMeters = calculateDistanceMeters(prev.lat, prev.lng, lat, lng);
  // Mais de 2.000m em até 12 segundos equivale a >600 km/h (teletransporte / Fake GPS)
  return {
    suspicious: jumpMeters > 2000,
    jumpMeters,
    elapsedSec: Math.max(1, Math.round(elapsedMs / 1000))
  };
}

// Debounce de escrita no Firestore para courtLocationWatchersByDate (agrupa até 28 sócios simultâneos em 1 única escrita)
let pendingWatchersFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWatchersDbRef: any = null;
let pendingWatchersPayload: Record<string, Record<string, PendingCourtGeoWatcher>> | null = null;

function scheduleCourtWatchersFirestoreFlush(
  db: any,
  prunedByDate: Record<string, Record<string, PendingCourtGeoWatcher>>,
  immediate = false
) {
  pendingWatchersDbRef = db;
  pendingWatchersPayload = prunedByDate;

  const doFlush = () => {
    pendingWatchersFlushTimer = null;
    const targetDb = pendingWatchersDbRef;
    const targetPayload = pendingWatchersPayload;
    pendingWatchersPayload = null;
    if (!targetDb || !targetPayload) return;
    withFirestoreGuard(
      () =>
        targetDb
          .collection("metadata")
          .doc("whatsapp_scheduler")
          .set({ courtLocationWatchersByDate: targetPayload }, { merge: true }),
      undefined
    ).catch(() => {});
  };

  if (immediate) {
    if (pendingWatchersFlushTimer) {
      clearTimeout(pendingWatchersFlushTimer);
      pendingWatchersFlushTimer = null;
    }
    doFlush();
    return;
  }

  if (!pendingWatchersFlushTimer) {
    pendingWatchersFlushTimer = setTimeout(doFlush, 15000);
  }
}

function getCourtWatchersStoreForDate(dateKey: string): Record<string, PendingCourtGeoWatcher> {
  if (!cachedScheduler) {
    cachedScheduler = loadLocalSchedulerBackup();
  }
  const byDate = (cachedScheduler?.courtLocationWatchersByDate || {}) as Record<
    string,
    Record<string, PendingCourtGeoWatcher>
  >;
  return { ...(byDate[dateKey] || {}) };
}

async function persistCourtWatchersForDate(
  db: any,
  dateKey: string,
  dateWatchers: Record<string, PendingCourtGeoWatcher>,
  options?: { skipFirestore?: boolean; immediateFirestore?: boolean }
) {
  if (!cachedScheduler) {
    cachedScheduler = loadLocalSchedulerBackup();
  }
  // Mantém apenas os últimos 3 dias para não inflar o documento
  const prevByDate = (cachedScheduler?.courtLocationWatchersByDate || {}) as Record<
    string,
    Record<string, PendingCourtGeoWatcher>
  >;
  const sortedKeys = Object.keys(prevByDate)
    .filter((k) => k !== dateKey)
    .sort()
    .slice(-2);
  const prunedByDate: Record<string, Record<string, PendingCourtGeoWatcher>> = {};
  sortedKeys.forEach((k) => {
    prunedByDate[k] = prevByDate[k];
  });
  prunedByDate[dateKey] = dateWatchers;

  cachedScheduler = {
    ...(cachedScheduler || {}),
    courtLocationWatchersByDate: prunedByDate
  };
  saveLocalSchedulerBackup(cachedScheduler);

  if (db && !options?.skipFirestore) {
    scheduleCourtWatchersFirestoreFlush(db, prunedByDate, Boolean(options?.immediateFirestore));
  }
}

async function upsertPendingCourtGeoWatcher(
  db: any,
  dateKey: string,
  player: any,
  info: {
    lastDistanceMeters: number;
    lastLat?: number;
    lastLng?: number;
    source: string;
    markRepliedNow?: boolean;
  }
): Promise<{ isFirstTime: boolean; prevOutOfRangeReplyAt: number }> {
  if (!player?.id) return { isFirstTime: true, prevOutOfRangeReplyAt: 0 };
  const dateWatchers = getCourtWatchersStoreForDate(dateKey);
  const existing = dateWatchers[player.id];
  const isFirstTime = !existing || Boolean(existing.optedOut) || Boolean(existing.arrived);
  const prevOutOfRangeReplyAt = Number(existing?.lastOutOfRangeReplyAt || 0);
  const now = Date.now();
  dateWatchers[player.id] = {
    playerId: player.id,
    name: player.name || "Sócio",
    sharedAt: existing?.sharedAt || now,
    lastUpdatedAt: now,
    lastDistanceMeters: info.lastDistanceMeters,
    lastLat: Number.isFinite(info.lastLat) ? Number(info.lastLat) : existing?.lastLat,
    lastLng: Number.isFinite(info.lastLng) ? Number(info.lastLng) : existing?.lastLng,
    source: info.source,
    optedOut: false,
    arrived: false,
    remindedAt2045: existing?.remindedAt2045 || false,
    lastOutOfRangeReplyAt: info.markRepliedNow ? now : prevOutOfRangeReplyAt
  };
  // Só agenda escrita no Firestore quando entra pela 1ª vez (ou reativa após opt-out); atualizações intermediárias ficam apenas em memória!
  await persistCourtWatchersForDate(db, dateKey, dateWatchers, {
    skipFirestore: !isFirstTime
  });
  return { isFirstTime, prevOutOfRangeReplyAt };
}

async function markCourtGeoWatcherArrived(
  db: any,
  dateKey: string,
  playerId: string,
  extra?: { lastLat?: number; lastLng?: number; lastDistanceMeters?: number; arrivalOrder?: number; name?: string }
) {
  if (!playerId) return;
  markPresentInMemoryCache(dateKey, playerId);
  const dateWatchers = getCourtWatchersStoreForDate(dateKey);
  const existing = dateWatchers[playerId];
  const now = Date.now();
  dateWatchers[playerId] = {
    ...(existing || {
      playerId,
      name: extra?.name || "Sócio",
      sharedAt: now,
      lastDistanceMeters: extra?.lastDistanceMeters ?? 0,
      source: "WHATSAPP_GPS"
    }),
    arrived: true,
    lastUpdatedAt: now,
    lastDistanceMeters:
      typeof extra?.lastDistanceMeters === "number"
        ? extra.lastDistanceMeters
        : existing?.lastDistanceMeters ?? 0,
    lastLat: Number.isFinite(extra?.lastLat) ? Number(extra?.lastLat) : existing?.lastLat,
    lastLng: Number.isFinite(extra?.lastLng) ? Number(extra?.lastLng) : existing?.lastLng,
    arrivalOrder:
      typeof extra?.arrivalOrder === "number" ? extra.arrivalOrder : existing?.arrivalOrder
  };
  await persistCourtWatchersForDate(db, dateKey, dateWatchers);
}

async function markCourtGeoWatcherOptedOut(db: any, dateKey: string, playerId: string): Promise<boolean> {
  if (!playerId) return false;
  const dateWatchers = getCourtWatchersStoreForDate(dateKey);
  const hadActiveWatch = Boolean(
    dateWatchers[playerId] && !dateWatchers[playerId].arrived && !dateWatchers[playerId].optedOut
  );
  dateWatchers[playerId] = {
    ...(dateWatchers[playerId] || {
      playerId,
      name: "Sócio",
      sharedAt: Date.now(),
      lastDistanceMeters: 0,
      source: "OPT_OUT"
    }),
    optedOut: true,
    lastUpdatedAt: Date.now()
  };
  await persistCourtWatchersForDate(db, dateKey, dateWatchers);
  return hadActiveWatch;
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Raio da Terra em metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

interface CourtWeatherForecast {
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  weatherCode: number;
  conditionLabel: string;
  conditionEmoji: string;
  gameNightTempC: number;
  gameNightRainProbPct: number;
  gameNightWindKmh: number;
  gameNightConditionLabel: string;
  gameNightEmoji: string;
  gameNightDateLabel: string;
  courtPlayabilityAdvice: string;
  wazeNavigateUrl: string;
  googleMapsNavigateUrl: string;
  whatsappBlock: string;
  fullBroadcastMessage: string;
  updatedAt: number;
}

let cachedCourtWeather: { key: string; expiresAt: number; data: CourtWeatherForecast } | null = null;

function describeWmoWeatherCode(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Céu limpo", emoji: "☀️" };
  if (code === 1 || code === 2) return { label: "Poucas nuvens", emoji: "🌤️" };
  if (code === 3) return { label: "Parcialmente nublado", emoji: "⛅" };
  if (code === 45 || code === 48) return { label: "Neblina leve", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Garoa leve", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Chuva moderada", emoji: "🌧️" };
  if (code >= 80 && code <= 82) return { label: "Pancadas de chuva", emoji: "🌦️" };
  if (code >= 95) return { label: "Chuva forte / trovoadas", emoji: "⛈️" };
  return { label: "Tempo firme", emoji: "🌤️" };
}

async function fetchCourtWeatherForecast(
  lat = DEFAULT_COURT_LAT,
  lng = DEFAULT_COURT_LNG,
  forceRefresh = false
): Promise<CourtWeatherForecast> {
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : DEFAULT_COURT_LAT;
  const safeLng = Number.isFinite(Number(lng)) ? Number(lng) : DEFAULT_COURT_LNG;
  const cacheKey = `${safeLat.toFixed(4)},${safeLng.toFixed(4)}`;
  const now = Date.now();

  if (!forceRefresh && cachedCourtWeather && cachedCourtWeather.key === cacheKey && cachedCourtWeather.expiresAt > now) {
    return cachedCourtWeather.data;
  }

  const wazeNavigateUrl = `https://waze.com/ul?ll=${safeLat.toFixed(6)},${safeLng.toFixed(6)}&navigate=yes`;
  const googleMapsNavigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${safeLat.toFixed(6)},${safeLng.toFixed(6)}&travelmode=driving`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${safeLat.toFixed(6)}&longitude=${safeLng.toFixed(6)}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m` +
      `&timezone=America%2FRecife&forecast_days=7`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const json: any = resp.ok ? await resp.json() : null;

    const cur = json?.current || {};
    const temperatureC = Math.round(Number(cur.temperature_2m ?? 28));
    const feelsLikeC = Math.round(Number(cur.apparent_temperature ?? 30));
    const humidityPct = Math.round(Number(cur.relative_humidity_2m ?? 72));
    const windKmh = Math.round(Number(cur.wind_speed_10m ?? 14));
    const weatherCode = Number(cur.weather_code ?? 1);
    const curDesc = describeWmoWeatherCode(weatherCode);

    // Procura a janela das 19h–21h de hoje (se quinta) ou da próxima quinta-feira
    const hourlyTimes: string[] = Array.isArray(json?.hourly?.time) ? json.hourly.time : [];
    const hourlyTemps: number[] = Array.isArray(json?.hourly?.temperature_2m) ? json.hourly.temperature_2m : [];
    const hourlyRainProb: number[] = Array.isArray(json?.hourly?.precipitation_probability)
      ? json.hourly.precipitation_probability
      : [];
    const hourlyCodes: number[] = Array.isArray(json?.hourly?.weather_code) ? json.hourly.weather_code : [];
    const hourlyWind: number[] = Array.isArray(json?.hourly?.wind_speed_10m) ? json.hourly.wind_speed_10m : [];

    const br = getBrazilTimeParts();
    let targetEveningIdx = -1;
    let gameNightDateLabel = "Hoje (19h às 22h)";

    for (let i = 0; i < hourlyTimes.length; i++) {
      const tStr = String(hourlyTimes[i] || "");
      if (!tStr.endsWith("T19:00") && !tStr.endsWith("T20:00")) continue;
      const dPart = tStr.slice(0, 10);
      if (br.dayOfWeek === 4 && dPart === br.dateKey && tStr.endsWith("T19:00")) {
        targetEveningIdx = i;
        gameNightDateLabel = `Quinta (${dPart.split("-").reverse().slice(0, 2).join("/")} • 19h às 22h)`;
        break;
      }
      const dt = new Date(`${dPart}T12:00:00-03:00`);
      if (dt.getUTCDay() === 4 && tStr.endsWith("T19:00")) {
        targetEveningIdx = i;
        gameNightDateLabel = `Quinta (${dPart.split("-").reverse().slice(0, 2).join("/")} • 19h às 22h)`;
        break;
      }
    }

    if (targetEveningIdx < 0) {
      targetEveningIdx = hourlyTimes.findIndex((t) => String(t).endsWith("T19:00"));
    }

    const sliceIdxs =
      targetEveningIdx >= 0
        ? [targetEveningIdx, Math.min(hourlyTimes.length - 1, targetEveningIdx + 1), Math.min(hourlyTimes.length - 1, targetEveningIdx + 2)]
        : [];

    const gameNightTempC =
      sliceIdxs.length > 0
        ? Math.round(sliceIdxs.reduce((acc, idx) => acc + Number(hourlyTemps[idx] ?? temperatureC), 0) / sliceIdxs.length)
        : temperatureC;
    const gameNightRainProbPct =
      sliceIdxs.length > 0
        ? Math.round(Math.max(...sliceIdxs.map((idx) => Number(hourlyRainProb[idx] ?? 10))))
        : 10;
    const gameNightWindKmh =
      sliceIdxs.length > 0
        ? Math.round(Math.max(...sliceIdxs.map((idx) => Number(hourlyWind[idx] ?? windKmh))))
        : windKmh;
    const gameNightCode =
      sliceIdxs.length > 0 ? Number(hourlyCodes[sliceIdxs[0]] ?? weatherCode) : weatherCode;
    const nightDesc = describeWmoWeatherCode(gameNightCode);

    let courtPlayabilityAdvice = "Quadra seca e clima excelente para o vôlei!";
    if (gameNightRainProbPct >= 65) {
      courtPlayabilityAdvice = "Chance alta de chuva no horário do jogo — atenção ao trânsito no deslocamento!";
    } else if (gameNightRainProbPct >= 35) {
      courtPlayabilityAdvice = "Possibilidade de chuva passageira — saia alguns minutos antes para evitar trânsito.";
    } else if (gameNightWindKmh >= 28) {
      courtPlayabilityAdvice = "Vento moderado/forte previsto — noite boa para saque flutuante!";
    }

    const whatsappBlock =
      `🌦️ *CLIMA NA QUADRA (${gameNightDateLabel}):*\n` +
      `${nightDesc.emoji} *${nightDesc.label}* • 🌡️ *${gameNightTempC}°C* (Sensação ${feelsLikeC}°C)\n` +
      `🌧️ *Chance de chuva:* ${gameNightRainProbPct}% • 💨 *Vento:* ${gameNightWindKmh} km/h\n` +
      `💡 _${courtPlayabilityAdvice}_\n\n` +
      `🗺️ *ROTAS 1-TOQUE PARA A QUADRA (COM TRÂNSITO AO VIVO):*\n` +
      `🚗 *Abrir no Waze:* ${wazeNavigateUrl}\n` +
      `📍 *Abrir no Google Maps:* ${googleMapsNavigateUrl}`;

    const fullBroadcastMessage =
      `🏐🌦️ *BOLETIM DO DIA DE JOGO — CLIMA & TRÂNSITO NA QUADRA!* 🔥\n\n` +
      `Fala, Guerreiros! Confira as condições da nossa quadra para o jogo de *${gameNightDateLabel}*:\n\n` +
      `${nightDesc.emoji} *Previsão às 19h–22h:* *${nightDesc.label}*\n` +
      `🌡️ *Temperatura:* *${gameNightTempC}°C* (Agora: ${temperatureC}°C / Sensação ${feelsLikeC}°C)\n` +
      `🌧️ *Probabilidade de chuva:* *${gameNightRainProbPct}%*\n` +
      `💨 *Vento na quadra:* *${gameNightWindKmh} km/h* • 💧 *Umidade:* ${humidityPct}%\n` +
      `💡 *Status:* _${courtPlayabilityAdvice}_\n\n` +
      `───────────────────\n` +
      `🚗 *VAI SAIR PRO VÔLEI? DESVIE DO TRÂNSITO EM 1 TOQUE:*\n` +
      `🟦 *Navegar pelo Waze:* ${wazeNavigateUrl}\n` +
      `🟩 *Navegar pelo Google Maps:* ${googleMapsNavigateUrl}\n\n` +
      `📍 *Ao sair de casa (a partir das 19h):* compartilhe sua *Localização em Tempo Real (1 hora)* no meu privado ou use o check-in do app para garantir sua posição automática na fila (#1, #2...)!\n\n` +
      `— Guerreirinho, o robô do clube 🤖`;

    const result: CourtWeatherForecast = {
      temperatureC,
      feelsLikeC,
      humidityPct,
      windKmh,
      weatherCode,
      conditionLabel: curDesc.label,
      conditionEmoji: curDesc.emoji,
      gameNightTempC,
      gameNightRainProbPct,
      gameNightWindKmh,
      gameNightConditionLabel: nightDesc.label,
      gameNightEmoji: nightDesc.emoji,
      gameNightDateLabel,
      courtPlayabilityAdvice,
      wazeNavigateUrl,
      googleMapsNavigateUrl,
      whatsappBlock,
      fullBroadcastMessage,
      updatedAt: now
    };

    cachedCourtWeather = {
      key: cacheKey,
      expiresAt: now + 15 * 60 * 1000,
      data: result
    };
    return result;
  } catch {
    const fallbackBlock =
      `🌦️ *CLIMA NA QUADRA (19h às 22h):*\n` +
      `🌤️ *Tempo firme* • 🌡️ *27°C* (Sensação 29°C)\n` +
      `🌧️ *Chance de chuva:* 10% • 💨 *Vento:* 14 km/h\n\n` +
      `🗺️ *ROTAS 1-TOQUE PARA A QUADRA:*\n` +
      `🚗 *Abrir no Waze:* ${wazeNavigateUrl}\n` +
      `📍 *Abrir no Google Maps:* ${googleMapsNavigateUrl}`;

    return {
      temperatureC: 27,
      feelsLikeC: 29,
      humidityPct: 72,
      windKmh: 14,
      weatherCode: 1,
      conditionLabel: "Poucas nuvens",
      conditionEmoji: "🌤️",
      gameNightTempC: 27,
      gameNightRainProbPct: 10,
      gameNightWindKmh: 14,
      gameNightConditionLabel: "Tempo firme",
      gameNightEmoji: "🌤️",
      gameNightDateLabel: "Hoje (19h às 22h)",
      courtPlayabilityAdvice: "Quadra seca e clima excelente para o vôlei!",
      wazeNavigateUrl,
      googleMapsNavigateUrl,
      whatsappBlock: fallbackBlock,
      fullBroadcastMessage: fallbackBlock,
      updatedAt: now
    };
  }
}

async function executeCourtLocationCheckIn(
  db: any,
  player: any,
  locationPayload: {
    lat: number;
    lng: number;
    name?: string;
    address?: string;
    isLive?: boolean;
  }
): Promise<string> {
  if (!player || player.status !== "active" || player.isDM) {
    return `⚠️ Olá, *${player?.name || "Guerreiro"}*! Apenas sócios Ativos e fora do DM podem fazer check-in na lista de presença da quadra.`;
  }

  const br = getBrazilTimeParts();
  const dateKey = br.dateKey;
  const isAdminUser =
    Boolean(player?.isAdmin) ||
    String(player?.email || "").trim().toLowerCase() === "rodneyes@gmail.com" ||
    String(player?.phone || "").includes("97330924");

  // Se o sócio já fez check-in hoje e o WhatsApp continua mandando pings residuais de liveLocation, ignora silenciosamente (zero spam e zero leitura no banco!)
  if (locationPayload.isLive && isPresentInMemoryCache(dateKey, player.id)) {
    return "";
  }

  // Janela permitida na quinta-feira: das 17:30 às 22:00 (ou liberado em qualquer dia para Admin testar o GPS)
  const isThursdayWindow =
    isAdminUser ||
    (br.dayOfWeek === 4 && br.totalMinutes >= 17 * 60 + 30 && br.totalMinutes <= COURT_CHECKIN_END_MINUTES);
  if (!isThursdayWindow) {
    if (locationPayload.isLive) {
      // Silencia atualizações tardias após 22h caso o sócio esqueça o liveLocation ligado
      const existingWatch = getCourtWatchersStoreForDate(dateKey)[player.id];
      if (existingWatch && existingWatch.lastOutOfRangeReplyAt) return "";
    }
    return (
      `⏰ Olá, *${player.name.split(" ")[0]}*!\n\n` +
      `O check-in presencial na quadra via localização fica liberado nas *Quintas-feiras das 17h30 às 22h00*.\n\n` +
      `Se quiser confirmar seu nome na *Lista de Intenção* da semana, toque aqui:\n` +
      `👉 https://wa.me/558197330924?text=gv%20vou`
    );
  }

  // Bloqueio Anti-Fraude: se o usuário pesquisou um endereço/local fixo na barra de busca do WhatsApp em vez de usar "Enviar localização atual"
  const hasSearchedPlaceLabel =
    !locationPayload.isLive &&
    Boolean(
      (locationPayload.name && String(locationPayload.name).trim().length > 0) ||
        (locationPayload.address && String(locationPayload.address).trim().length > 0)
    );

  if (hasSearchedPlaceLabel) {
    return (
      `🚫 *Localização pesquisada no mapa não é aceita, ${player.name.split(" ")[0]}!*\n\n` +
      `Para fazer o check-in na quadra, não digite o endereço na busca. Envie o seu GPS real agora:\n\n` +
      `🍎 *No iPhone:* Toque no *+* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.\n` +
      `🤖 *No Android:* Toque no *clipe (📎)* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.`
    );
  }

  const sysConfig = await getCachedSystemConfig(Boolean(isAdminUser));
  if (!isAdminUser && sysConfig?.autoGeoCheckInEnabled !== true) {
    if (locationPayload.isLive) return "";
    return `⚙️ Olá, *${player.name.split(" ")[0]}*! O check-in automático por localização GPS ainda está em fase de testes pela diretoria e será liberado em breve para o grupo.`;
  }
  const courtLat = Number(sysConfig?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
  const courtLng = Number(sysConfig?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
  const maxRadius = Number(sysConfig?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS);

  const distanceMeters = calculateDistanceMeters(
    locationPayload.lat,
    locationPayload.lng,
    courtLat,
    courtLng
  );

  // Anti-teletransporte (proteção contra Fake GPS) para não-admins
  if (!isAdminUser) {
    const jumpCheck = checkImpossibleGpsJump(player.id, locationPayload.lat, locationPayload.lng);
    if (jumpCheck.suspicious && distanceMeters <= maxRadius) {
      return (
        `🛡️ *Salto de GPS suspeito detectado, ${player.name.split(" ")[0]}!*\n\n` +
        `Seu sinal saltou *${jumpCheck.jumpMeters}m* em apenas *${jumpCheck.elapsedSec}s*. Aguarde alguns segundos no local real da quadra e envie sua localização novamente.`
      );
    }
  }

  if (distanceMeters > maxRadius) {
    const firstName = player.name.split(" ")[0];
    if (br.dayOfWeek === 4 && br.totalMinutes <= COURT_CHECKIN_END_MINUTES) {
      const existingBefore = getCourtWatchersStoreForDate(dateKey)[player.id];
      const recentlyReplied =
        Boolean(locationPayload.isLive) &&
        Boolean(existingBefore?.lastOutOfRangeReplyAt) &&
        Date.now() - Number(existingBefore?.lastOutOfRangeReplyAt || 0) < 45 * 60 * 1000;

      await upsertPendingCourtGeoWatcher(db, dateKey, player, {
        lastDistanceMeters: distanceMeters,
        lastLat: locationPayload.lat,
        lastLng: locationPayload.lng,
        source: locationPayload.isLive ? "WHATSAPP_LIVE" : "WHATSAPP_PIN",
        markRepliedNow: !recentlyReplied
      });

      // Anti-spam de trajeto: para Localização em Tempo Real já confirmada, acompanha silenciosamente até entrar nos 150m!
      if (recentlyReplied) {
        return "";
      }

      if (locationPayload.isLive) {
        return (
          `📍 *Localização em tempo real recebida, ${firstName}!*\n\n` +
          `📏 *Distância atual:* ~${distanceMeters} metros (raio oficial: *${maxRadius}m*).\n\n` +
          `✅ *Acompanhamento silencioso ativado:* não precisa mandar mais nada! Assim que você entrar na área da quadra (até às *22h00*), eu confirmo sua vaga automaticamente e te aviso aqui com sua posição na fila! 🏐🚗`
        );
      }
    }
    return (
      `📍 *Você ainda está longe da quadra, ${firstName}!*\n\n` +
      `📏 *Distância medida:* ~${distanceMeters} metros (limite da quadra: *${maxRadius}m*).\n\n` +
      `Se estiver a caminho, compartilhe sua *Localização em Tempo Real por 1 hora* aqui no privado (ou envie sua localização atual ao chegar até às *22h00*) que eu confirmo sua vaga automaticamente na fila! 🏐🏃‍♂️`
    );
  }

  const now = Date.now();
  let arrivalOrder = 1;
  let alreadyPresent = false;

  await withAttendanceCheckInLock(async () => {
    await withFirestoreGuard(async () => {
      const attColRef = db.collection("attendance").doc(dateKey).collection("players");
      const snap = await attColRef.get();
      const currentPresent: any[] = [];
      snap.forEach((d: any) => {
        const data = d.data();
        if (data && data.status !== "left" && !data.isDM) {
          currentPresent.push({ id: d.id, ...data });
        }
      });

      const existing = currentPresent.find((p) => p.id === player.id);
      if (existing) {
        alreadyPresent = true;
        arrivalOrder = Number(existing.arrivalOrder || 1);
        return;
      }

      const maxOrder = currentPresent.reduce((max, p) => Math.max(max, Number(p.arrivalOrder || 0)), 0);
      arrivalOrder = maxOrder + 1;

      await db.collection("attendance").doc(dateKey).set(
        { date: dateKey, lastUpdate: now },
        { merge: true }
      );

      await attColRef.doc(player.id).set(
        {
          ...player,
          id: player.id,
          name: player.name || "Sócio",
          status: "active",
          arrivalOrder,
          isPresent: true,
          checkInMethod: "QR",
          checkInSource: "WHATSAPP_GPS",
          distanceFromCourtMeters: distanceMeters,
          timestamp: now
        },
        { merge: true }
      );
    }, undefined);
  });

  // Também garante que o sócio conste como GOING na lista de intenção do dia e limpa pendência de chegada
  await syncPlayerPreConfirmationDoc(db, dateKey, player, "GOING", now);
  await markCourtGeoWatcherArrived(db, dateKey, player.id);

  if (alreadyPresent) {
    return (
      `✅🏐 *${player.name.split(" ")[0]}, você já está na lista de presença da quadra hoje!*\n\n` +
      `📍 *Sua Ordem de Chegada:* *#${arrivalOrder}*\n` +
      `📏 *Distância da quadra:* ${distanceMeters}m\n\n` +
      `Bom jogo e bora pra cima! 🔥`
    );
  }

  return (
    `✅🏐 *CHECK-IN NA QUADRA CONFIRMADO, ${player.name.split(" ")[0].toUpperCase()}!* 🔥\n\n` +
    `📍 *Posição na Fila de Chegada:* *#${arrivalOrder}*\n` +
    `📏 *Localização validada:* a ${distanceMeters}m da quadra\n` +
    `🕒 *Horário de chegada:* ${String(br.hour).padStart(2, "0")}:${String(br.minute).padStart(2, "0")}\n\n` +
    `_Seu nome já entrou automaticamente na tela de Presença e Escalação de hoje! Bom aquecimento!_`
  );
}

function matchBrazilianPhone(rawSenderPhone: string, playerPhone?: string): boolean {
  if (!rawSenderPhone || !playerPhone) return false;
  const cleanA = rawSenderPhone.replace(/\D/g, "");
  const cleanB = playerPhone.replace(/\D/g, "");
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    const last8A = cleanA.slice(-8);
    const last8B = cleanB.slice(-8);
    const dddA = cleanA.slice(cleanA.startsWith("55") ? 2 : 0, (cleanA.startsWith("55") ? 2 : 0) + 2);
    const dddB = cleanB.slice(cleanB.startsWith("55") ? 2 : 0, (cleanB.startsWith("55") ? 2 : 0) + 2);
    return dddA === dddB && last8A === last8B;
  }
  return false;
}

function normalizePhoneToJid(phone?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }
  if (digits.length < 12) return null;
  return `${digits}@s.whatsapp.net`;
}

// ============================================================================
// 📲 MOTOR DE DISPARO DIRETO WHATSAPP (Substitui 100% os antigos Pushes FCM)
// ============================================================================
const WHATSAPP_CONFIG_PATH = path.join(process.cwd(), "whatsapp_config_local.json");
const WHATSAPP_OUTBOX_PATH = path.join(process.cwd(), "whatsapp_outbox_local.json");
const WHATSAPP_COMM_LOGS_PATH = path.join(process.cwd(), "whatsapp_comm_logs_local.json");

interface OutboxWhatsAppMessage {
  outboxId: string;
  to: string;
  fallbackTargets?: string[];
  text: string;
  mediaBase64?: string;
  mediaFetchUrl?: string;
  mediaType?: "image";
  fileName?: string;
  caption?: string;
  imageOnly?: boolean;
  delayMs?: number;
  type?: string;
  recipientLabel?: string;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

interface WhatsAppCommLogEntry {
  id: string;
  timestamp: number;
  type: string;
  recipient: string;
  recipientLabel?: string;
  status: "SENT" | "QUEUED_RETRY" | "FAILED";
  summary: string;
  messagePreview: string;
  errorDetail?: string;
}

interface VmPhotoSyncTarget {
  playerId: string;
  name: string;
  phone?: string;
  whatsappLid?: string;
}

interface VmPhotoSyncJob {
  jobId: string;
  requestedAt: number;
  forceAll: boolean;
  playerId?: string | null;
  status: "queued" | "dispatched" | "completed";
  dispatchedAt?: number;
  completedAt?: number;
  updatedCount?: number;
  noPhotoPrivacyCount?: number;
  checkedCount?: number;
  targets?: VmPhotoSyncTarget[];
}

const WHATSAPP_PHOTO_SYNC_JOB_PATH = path.join(process.cwd(), "whatsapp_photo_sync_job_local.json");

function loadLocalVmPhotoSyncJob(): VmPhotoSyncJob | null {
  try {
    if (fs.existsSync(WHATSAPP_PHOTO_SYNC_JOB_PATH)) {
      const raw = fs.readFileSync(WHATSAPP_PHOTO_SYNC_JOB_PATH, "utf-8");
      const parsed = safeJsonParse<any>(raw, "loadLocalVmPhotoSyncJob", null);
      if (isPlainObject(parsed) && parsed.jobId) {
        return parsed as VmPhotoSyncJob;
      }
    }
  } catch {}
  return null;
}

function saveLocalVmPhotoSyncJob(job: VmPhotoSyncJob | null) {
  try {
    if (!job) {
      if (fs.existsSync(WHATSAPP_PHOTO_SYNC_JOB_PATH)) fs.unlinkSync(WHATSAPP_PHOTO_SYNC_JOB_PATH);
      return;
    }
    fs.writeFileSync(WHATSAPP_PHOTO_SYNC_JOB_PATH, JSON.stringify(job, null, 2), "utf-8");
  } catch {}
}

let currentVmPhotoSyncJob: VmPhotoSyncJob | null = loadLocalVmPhotoSyncJob();
let lastVmPhotoSyncHeartbeatAt = 0;
let lastVmHeartbeatPersistedAt = 0;
let lastVmHeartbeatFetchedAt = 0;
const VM_PHOTO_SYNC_ONLINE_WINDOW_MS = 10 * 60 * 1000;

async function recordVmPhotoSyncHeartbeat(now: number = Date.now()) {
  lastVmPhotoSyncHeartbeatAt = Math.max(lastVmPhotoSyncHeartbeatAt, now);
  if (now - lastVmHeartbeatPersistedAt < 50_000) return;
  lastVmHeartbeatPersistedAt = now;
  try {
    const db = await getFirestore();
    await withFirestoreGuard(
      () =>
        db.collection("metadata").doc("whatsapp_vm_heartbeat").set(
          { lastPhotoSyncHeartbeatAt: now, updatedAt: now },
          { merge: true }
        ),
      undefined
    );
  } catch {}
}

async function getEffectiveVmPhotoSyncHeartbeatAt(job?: VmPhotoSyncJob | null): Promise<number> {
  const now = Date.now();
  if (now - lastVmHeartbeatFetchedAt > 15_000) {
    lastVmHeartbeatFetchedAt = now;
    try {
      const db = await getFirestore();
      const remoteTs = await withFirestoreGuard(async () => {
        const snap = await db.collection("metadata").doc("whatsapp_vm_heartbeat").get();
        if (!snap.exists) return 0;
        const data = sanitizeFirestorePayload<any>(snap.data(), "vmHeartbeat", null);
        return Number(data?.lastPhotoSyncHeartbeatAt || 0);
      }, 0);
      if (remoteTs > lastVmPhotoSyncHeartbeatAt) {
        lastVmPhotoSyncHeartbeatAt = remoteTs;
      }
    } catch {}
  }
  const jobProofTs = Math.max(Number(job?.dispatchedAt || 0), Number(job?.completedAt || 0));
  return Math.max(lastVmPhotoSyncHeartbeatAt, jobProofTs);
}

async function persistVmPhotoSyncJobToFirestore(job: VmPhotoSyncJob) {
  try {
    const safeJob = sanitizeFirestorePayload<VmPhotoSyncJob | null>(job, "persistVmPhotoSyncJob", null);
    if (!safeJob || !safeJob.jobId) return;
    const db = await getFirestore();
    await withFirestoreGuard(
      () => db.collection("metadata").doc("whatsapp_photo_sync_job").set(safeJob),
      undefined
    );
  } catch (err: any) {
    console.warn("[Firestore PhotoSync] Falha controlada ao persistir job:", err?.message || err);
  }
}

async function hydrateVmPhotoSyncJobFromFirestore(): Promise<VmPhotoSyncJob | null> {
  try {
    const db = await getFirestore();
    const remote = await withFirestoreGuard(async () => {
      const snap = await db.collection("metadata").doc("whatsapp_photo_sync_job").get();
      if (!snap.exists) return null;
      const data = sanitizeFirestorePayload<any>(snap.data(), "hydrateVmPhotoSyncJob", null);
      return isPlainObject(data) && data.jobId ? (data as VmPhotoSyncJob) : null;
    }, null as VmPhotoSyncJob | null);
    if (remote) {
      const localTs = currentVmPhotoSyncJob?.requestedAt || 0;
      if (!currentVmPhotoSyncJob || remote.requestedAt > localTs || remote.jobId === currentVmPhotoSyncJob.jobId) {
        // Se for o mesmo jobId, prefere o status mais avançado (completed > dispatched > queued)
        const rank = (s?: string) => (s === "completed" ? 3 : s === "dispatched" ? 2 : 1);
        if (
          !currentVmPhotoSyncJob ||
          remote.requestedAt > localTs ||
          rank(remote.status) >= rank(currentVmPhotoSyncJob.status)
        ) {
          currentVmPhotoSyncJob = remote;
          saveLocalVmPhotoSyncJob(remote);
        }
      }
    }
  } catch (err: any) {
    console.warn("[Firestore PhotoSync] Falha controlada ao hidratar job:", err?.message || err);
  }
  return currentVmPhotoSyncJob;
}

function buildVmPhotoSyncTargets(
  allPlayers: any[],
  forceAll: boolean,
  playerId?: string | null
): VmPhotoSyncTarget[] {
  const filtered = playerId
    ? allPlayers.filter((p) => p.id === playerId)
    : allPlayers.filter(
        (p) =>
          p.status !== "inactive" &&
          (Boolean(p.phone) || Boolean(p.whatsappLid)) &&
          (forceAll || isMissingOrDefaultAvatar(p.photoUrl))
      );
  return filtered.map((p) => ({
    playerId: String(p.id),
    name: String(p.name || ""),
    ...(p.phone ? { phone: autoNormalizeBrazilianPhone(p.phone) || String(p.phone) } : {}),
    ...(p.whatsappLid ? { whatsappLid: String(p.whatsappLid) } : {})
  }));
}

function loadLocalWhatsAppOutbox(): OutboxWhatsAppMessage[] {
  try {
    if (fs.existsSync(WHATSAPP_OUTBOX_PATH)) {
      const raw = fs.readFileSync(WHATSAPP_OUTBOX_PATH, "utf-8");
      const parsed = safeJsonParse<unknown>(raw, "loadLocalWhatsAppOutbox", []);
      if (Array.isArray(parsed)) return parsed.filter((x) => isPlainObject(x) && Boolean(x.outboxId)) as OutboxWhatsAppMessage[];
    }
  } catch {}
  return [];
}

function saveLocalWhatsAppOutbox(items: OutboxWhatsAppMessage[]) {
  try {
    fs.writeFileSync(WHATSAPP_OUTBOX_PATH, JSON.stringify(items.slice(-100), null, 2), "utf-8");
  } catch {}
}

function loadLocalWhatsAppCommLogs(): WhatsAppCommLogEntry[] {
  try {
    if (fs.existsSync(WHATSAPP_COMM_LOGS_PATH)) {
      const raw = fs.readFileSync(WHATSAPP_COMM_LOGS_PATH, "utf-8");
      const parsed = safeJsonParse<unknown>(raw, "loadLocalWhatsAppCommLogs", []);
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => isPlainObject(x)).slice(0, 100).map((entry: any) => ({
          id: String(entry.id || `wa_log_${Date.now()}`),
          timestamp: Number(entry.timestamp || Date.now()),
          type: String(entry.type || "GENERAL"),
          recipient: String(entry.recipient || ""),
          recipientLabel: entry.recipientLabel ? String(entry.recipientLabel) : undefined,
          status:
            entry.status === "FAILED" || entry.status === "QUEUED_RETRY" ? entry.status : "SENT",
          summary: String(entry.summary || entry.recipientLabel || entry.type || "Mensagem WhatsApp"),
          messagePreview: String(entry.messagePreview || entry.text || "").slice(0, 500),
          ...(entry.errorDetail ? { errorDetail: String(entry.errorDetail) } : {})
        }));
      }
    }
  } catch {}
  return [];
}

let pendingWhatsAppOutbox: OutboxWhatsAppMessage[] = loadLocalWhatsAppOutbox();
const whatsappCommLogs: WhatsAppCommLogEntry[] = loadLocalWhatsAppCommLogs();
let lastWhatsAppDispatchError: { timestamp: number; to: string; error: string } | null = null;

function recordWhatsAppCommLog(entry: Omit<WhatsAppCommLogEntry, "id" | "timestamp">) {
  const fullEntry: WhatsAppCommLogEntry = {
    id: `wa_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    ...entry,
    messagePreview: String(entry.messagePreview || "").slice(0, 500)
  };
  whatsappCommLogs.unshift(fullEntry);
  if (whatsappCommLogs.length > 100) whatsappCommLogs.length = 100;
  try {
    fs.writeFileSync(WHATSAPP_COMM_LOGS_PATH, JSON.stringify(whatsappCommLogs, null, 2), "utf-8");
  } catch {}
}

async function persistOutboxToFirestore(items: OutboxWhatsAppMessage[]) {
  try {
    const safeItems = sanitizeFirestorePayload<OutboxWhatsAppMessage[]>(items.slice(-100), "persistOutboxToFirestore", []);
    const db = await getFirestore();
    await withFirestoreGuard(
      () =>
        db.collection("metadata").doc("whatsapp_outbox").set({
          items: Array.isArray(safeItems) ? safeItems : [],
          updatedAt: Date.now()
        }),
      undefined
    );
  } catch (err: any) {
    console.warn("[Firestore Outbox] Falha controlada ao persistir fila:", err?.message || err);
  }
}

async function hydrateOutboxFromFirestore(): Promise<void> {
  try {
    const db = await getFirestore();
    const remoteItems = await withFirestoreGuard(async () => {
      const snap = await db.collection("metadata").doc("whatsapp_outbox").get();
      if (!snap.exists) return [];
      const data = sanitizeFirestorePayload<Record<string, any>>(snap.data(), "hydrateOutboxFromFirestore", {});
      return Array.isArray(data.items)
        ? (data.items.filter((x: any) => isPlainObject(x) && Boolean(x.outboxId)) as OutboxWhatsAppMessage[])
        : [];
    }, [] as OutboxWhatsAppMessage[]);

    if (remoteItems.length > 0) {
      const existingIds = new Set(pendingWhatsAppOutbox.map((m) => m.outboxId));
      let merged = false;
      for (const item of remoteItems) {
        if (item?.outboxId && !existingIds.has(item.outboxId)) {
          pendingWhatsAppOutbox.push(item);
          existingIds.add(item.outboxId);
          merged = true;
        }
      }
      if (merged) {
        if (pendingWhatsAppOutbox.length > 100) {
          pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
        }
        saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
      }
    }
  } catch {}
}

type WhatsAppCardDeliveryMode = "disabled" | "vm_image_only";

let memoryBotActiveOverride: boolean | null = null;
let memoryCardDeliveryModeOverride: WhatsAppCardDeliveryMode | null = null;
let memoryWaApiUrlOverride: string | null = null;
let memoryWaInstanceOverride: string | null = null;

function normalizeCardDeliveryMode(val: unknown): WhatsAppCardDeliveryMode {
  return val === "disabled" ? "disabled" : "vm_image_only";
}

function getWhatsAppCardDeliveryMode(): WhatsAppCardDeliveryMode {
  if (memoryCardDeliveryModeOverride) return memoryCardDeliveryModeOverride;
  if (
    cachedSystemConfig?.whatsappCardDeliveryMode === "vm_image_only" ||
    cachedSystemConfig?.whatsappCardDeliveryMode === "disabled"
  ) {
    return cachedSystemConfig.whatsappCardDeliveryMode;
  }
  try {
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      const localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8"));
      if (localCfg?.cardDeliveryMode === "vm_image_only" || localCfg?.cardDeliveryMode === "disabled") {
        return localCfg.cardDeliveryMode;
      }
    }
  } catch {}
  return "vm_image_only";
}

function setWhatsAppCardDeliveryModeState(
  mode: WhatsAppCardDeliveryMode,
  opts?: { apiUrl?: string; instanceName?: string }
) {
  const cleanMode = normalizeCardDeliveryMode(mode);
  memoryCardDeliveryModeOverride = cleanMode;
  const cleanApiUrl = opts?.apiUrl ? String(opts.apiUrl).trim().replace(/\/$/, "") : undefined;
  const cleanInstance = opts?.instanceName ? String(opts.instanceName).trim() : undefined;
  if (cleanApiUrl) memoryWaApiUrlOverride = cleanApiUrl;
  if (cleanInstance) memoryWaInstanceOverride = cleanInstance;

  try {
    let localCfg: any = {};
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8")) || {};
    }
    localCfg.cardDeliveryMode = cleanMode;
    if (cleanApiUrl) localCfg.apiUrl = cleanApiUrl;
    if (cleanInstance) localCfg.instanceName = cleanInstance;
    fs.writeFileSync(WHATSAPP_CONFIG_PATH, JSON.stringify(localCfg, null, 2), "utf-8");
  } catch {}

  if (cachedSystemConfig) {
    cachedSystemConfig = {
      ...cachedSystemConfig,
      whatsappCardDeliveryMode: cleanMode,
      ...(cleanApiUrl ? { whatsappApiUrl: cleanApiUrl } : {}),
      ...(cleanInstance ? { whatsappInstance: cleanInstance } : {})
    };
  }
}

function isWhatsAppBotEnabled(): boolean {
  if (typeof memoryBotActiveOverride === "boolean") return memoryBotActiveOverride;
  try {
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      const localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8"));
      if (typeof localCfg?.botActive === "boolean") return localCfg.botActive;
    }
  } catch {}
  if (cachedSystemConfig && typeof cachedSystemConfig.whatsappBotEnabled === "boolean") {
    return cachedSystemConfig.whatsappBotEnabled;
  }
  return true;
}

function setWhatsAppBotEnabledState(enabled: boolean) {
  memoryBotActiveOverride = Boolean(enabled);
  try {
    let localCfg: any = {};
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8")) || {};
    }
    localCfg.botActive = Boolean(enabled);
    fs.writeFileSync(WHATSAPP_CONFIG_PATH, JSON.stringify(localCfg, null, 2), "utf-8");
  } catch {}
  if (cachedSystemConfig) {
    cachedSystemConfig = { ...cachedSystemConfig, whatsappBotEnabled: Boolean(enabled) };
  }
}

function getWhatsAppConfig(): {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  groupJid: string;
  botActive: boolean;
  cardDeliveryMode: WhatsAppCardDeliveryMode;
} {
  let localCfg: any = {};
  try {
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {
    apiUrl: String(
      memoryWaApiUrlOverride ||
        cachedSystemConfig?.whatsappApiUrl ||
        process.env.WHATSAPP_API_URL ||
        localCfg.apiUrl ||
        "http://34.133.253.248:8080"
    ).replace(/\/$/, ""),
    apiKey: String(process.env.WHATSAPP_API_KEY || localCfg.apiKey || "esperanca"),
    instanceName: String(
      memoryWaInstanceOverride ||
        cachedSystemConfig?.whatsappInstance ||
        process.env.WHATSAPP_INSTANCE ||
        localCfg.instanceName ||
        "Guerreiros"
    ),
    groupJid: String(process.env.WHATSAPP_GROUP_JID || localCfg.groupJid || "120363401268459791@g.us"),
    botActive: isWhatsAppBotEnabled(),
    cardDeliveryMode: getWhatsAppCardDeliveryMode()
  };
}

function getBrazilianJidVariants(to: string): string[] {
  const cleanTo = String(to || "").trim();
  if (!cleanTo) return [];
  const variants = [cleanTo];
  if (cleanTo.endsWith("@s.whatsapp.net")) {
    const digits = cleanTo.split("@")[0].replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
      variants.push(`${digits.slice(0, 4)}${digits.slice(5)}@s.whatsapp.net`);
    } else if (digits.startsWith("55") && digits.length === 12) {
      variants.push(`${digits.slice(0, 4)}9${digits.slice(4)}@s.whatsapp.net`);
    }
  }
  return variants;
}

// Resolve a lista ordenada e deduplicada de destinos entregáveis no privado para um sócio
// (prioriza JID real verificado do WhatsApp -> @lid real -> telefone com variantes 12/13 dígitos)
function resolvePlayerWhatsAppTargets(player: any): string[] {
  if (!player) return [];
  const ordered: string[] = [];
  const pushUnique = (val?: string | null) => {
    const clean = String(val || "").trim();
    if (!clean || clean.endsWith("@g.us")) return;
    for (const v of getBrazilianJidVariants(clean)) {
      if (!ordered.includes(v)) ordered.push(v);
    }
  };
  if (player.whatsappJid) pushUnique(player.whatsappJid);
  if (player.whatsappLid) pushUnique(player.whatsappLid);
  const phoneJid = normalizePhoneToJid(player.phone);
  if (phoneJid) pushUnique(phoneJid);
  return ordered;
}

function getPrimaryPlayerWhatsAppJid(player: any): string | null {
  const targets = resolvePlayerWhatsAppTargets(player);
  return targets.length > 0 ? targets[0] : null;
}

export async function dispatchWhatsAppMessage(
  to: string,
  text: string,
  meta?: {
    type?: string;
    recipientLabel?: string;
    fallbackTargets?: string[];
    skipOutboxOnFail?: boolean;
  }
): Promise<boolean> {
  if (!to || !text) return false;
  const cfg = getWhatsAppConfig();
  if (!cfg.botActive) {
    console.warn(`[WhatsApp] Disparo ignorado (robô desativado) para ${meta?.recipientLabel || to}`);
    return false;
  }

  const url = `${cfg.apiUrl}/message/sendText/${encodeURIComponent(cfg.instanceName)}`;
  const candidates: string[] = [];
  const addCandidate = (jid: string) => {
    for (const v of getBrazilianJidVariants(jid)) {
      if (v && !candidates.includes(v)) candidates.push(v);
    }
  };
  addCandidate(to);
  if (Array.isArray(meta?.fallbackTargets)) {
    meta.fallbackTargets.forEach(addCandidate);
  }

  const errors: string[] = [];
  const msgType = meta?.type || (to.endsWith("@g.us") ? "GROUP_MESSAGE" : "PRIVATE_MESSAGE");
  const label = meta?.recipientLabel || (to.endsWith("@g.us") ? "Grupo Guerreiros VC" : to);

  for (const targetJid of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.apiKey
        },
        body: JSON.stringify({
          number: targetJid,
          text,
          textMessage: { text }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);

      const parsedResult = await safeReadResponseJson<any>(resp, "dispatchWhatsAppMessage", null);
      const rawRespText = parsedResult.rawText;
      const parsedResp = parsedResult.data;

      const apiRejected =
        !resp.ok ||
        !parsedResult.isValidJson ||
        parsedResp?.error === true ||
        (typeof parsedResp?.status === "number" && parsedResp.status >= 400) ||
        parsedResp?.response?.message?.[0]?.exists === false;

      if (!apiRejected) {
        recordWhatsAppCommLog({
          type: msgType,
          recipient: targetJid,
          recipientLabel: label,
          status: "SENT",
          summary: `${msgType} enviado para ${label}`,
          messagePreview: text
        });
        return true;
      }

      errors.push(`${targetJid} -> HTTP ${resp.status} ${rawRespText.slice(0, 140)}`);
    } catch (err: any) {
      errors.push(`${targetJid} -> ${err?.name || "Error"}: ${err?.message || String(err)}`);
      // Se o endpoint Evolution API está inacessível/timeout, não bloqueia tentando os demais variantes
      break;
    }
  }

  const errorDetail = errors.join(" | ").slice(0, 400) || "Falha de conexão com a API WhatsApp";
  lastWhatsAppDispatchError = { timestamp: Date.now(), to, error: errorDetail };
  console.warn(`[WhatsApp] Falha no disparo direto para ${label} (${to}): ${errorDetail}`);

  if (!meta?.skipOutboxOnFail) {
    const outboxItem: OutboxWhatsAppMessage = {
      outboxId: `obx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      to: candidates[0] || to,
      fallbackTargets: candidates.slice(1),
      text,
      type: msgType,
      recipientLabel: label,
      queuedAt: Date.now(),
      attempts: 1,
      lastError: errorDetail
    };
    pendingWhatsAppOutbox.push(outboxItem);
    if (pendingWhatsAppOutbox.length > 100) {
      pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
    }
    saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
    persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {});

    recordWhatsAppCommLog({
      type: msgType,
      recipient: candidates[0] || to,
      recipientLabel: label,
      status: "QUEUED_RETRY",
      summary: `${msgType} enfileirado para entrega via ponte VM (${label})`,
      messagePreview: text,
      errorDetail
    });
  } else {
    recordWhatsAppCommLog({
      type: msgType,
      recipient: candidates[0] || to,
      recipientLabel: label,
      status: "FAILED",
      summary: `Falha ao enviar ${msgType} para ${label}`,
      messagePreview: text,
      errorDetail
    });
  }

  return false;
}

export async function dispatchWhatsAppMedia(
  to: string,
  imageBase64: string,
  caption: string,
  meta?: {
    type?: string;
    recipientLabel?: string;
    fallbackTargets?: string[];
    fileName?: string;
    mediaUrl?: string;
    skipOutboxOnFail?: boolean;
  }
): Promise<boolean> {
  if (!to || !imageBase64) return false;
  const cfg = getWhatsAppConfig();
  if (!cfg.botActive) {
    console.warn(`[WhatsApp Media] Disparo ignorado (robô desativado) para ${meta?.recipientLabel || to}`);
    return false;
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  const fileName = meta?.fileName || `guerreiros_card_${Date.now()}.png`;
  const url = `${cfg.apiUrl}/message/sendMedia/${encodeURIComponent(cfg.instanceName)}`;

  const candidates: string[] = [];
  const addCandidate = (jid: string) => {
    for (const v of getBrazilianJidVariants(jid)) {
      if (v && !candidates.includes(v)) candidates.push(v);
    }
  };
  addCandidate(to);
  if (Array.isArray(meta?.fallbackTargets)) {
    meta.fallbackTargets.forEach(addCandidate);
  }

  const errors: string[] = [];
  const msgType = meta?.type || (to.endsWith("@g.us") ? "GROUP_CARD_IMAGE" : "PRIVATE_CARD_IMAGE");
  const label = meta?.recipientLabel || (to.endsWith("@g.us") ? "Grupo Guerreiros VC" : to);

  for (const targetJid of candidates) {
    const payloads: any[] = [
      // Evolution API v2 (base64 direto)
      {
        number: targetJid,
        mediatype: "image",
        mimetype: "image/png",
        caption,
        media: cleanBase64,
        fileName
      },
      // Evolution API v2 (URL pública HD — fallback caso proxy rejeite payload base64 grande)
      ...(meta?.mediaUrl
        ? [
            {
              number: targetJid,
              mediatype: "image",
              mimetype: "image/png",
              caption,
              media: meta.mediaUrl,
              fileName
            }
          ]
        : []),
      // Evolution API v1 (formato legado mediaMessage)
      {
        number: targetJid,
        options: { delay: 600, presence: "composing" },
        mediaMessage: {
          mediatype: "image",
          caption,
          media: cleanBase64,
          fileName
        }
      }
    ];

    for (const payload of payloads) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 14000);
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timer);

        const parsedResult = await safeReadResponseJson<any>(resp, "dispatchWhatsAppMedia", null);
        const rawRespText = parsedResult.rawText;
        const parsedResp = parsedResult.data;

        const apiRejected =
          !resp.ok ||
          !parsedResult.isValidJson ||
          parsedResp?.error === true ||
          (typeof parsedResp?.status === "number" && parsedResp.status >= 400) ||
          parsedResp?.response?.message?.[0]?.exists === false;

        if (!apiRejected) {
          recordWhatsAppCommLog({
            type: msgType,
            recipient: targetJid,
            recipientLabel: label,
            status: "SENT",
            summary: `${msgType} (PNG) enviado para ${label}`,
            messagePreview: caption || fileName
          });
          return true;
        }

        errors.push(`${targetJid} -> HTTP ${resp.status} ${rawRespText.slice(0, 140)}`);
        if (![400, 413, 415, 422].includes(resp.status)) break;
      } catch (err: any) {
        errors.push(`${targetJid} -> ${err?.name || "Error"}: ${err?.message || String(err)}`);
        break;
      }
    }
  }

  const errorDetail = errors.join(" | ").slice(0, 400) || "Falha ao enviar mídia PNG na API WhatsApp";
  lastWhatsAppDispatchError = { timestamp: Date.now(), to, error: errorDetail };
  console.warn(`[WhatsApp Media] Falha no disparo PNG para ${label} (${to}): ${errorDetail}`);

  if (!meta?.skipOutboxOnFail) {
    const outboxItem: OutboxWhatsAppMessage = {
      outboxId: `obx_img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      to: candidates[0] || to,
      fallbackTargets: candidates.slice(1),
      text: caption,
      mediaBase64: cleanBase64,
      mediaType: "image",
      fileName,
      type: msgType,
      recipientLabel: label,
      queuedAt: Date.now(),
      attempts: 1,
      lastError: errorDetail
    };
    pendingWhatsAppOutbox.push(outboxItem);
    if (pendingWhatsAppOutbox.length > 100) {
      pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
    }
    saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
    persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {});

    recordWhatsAppCommLog({
      type: msgType,
      recipient: candidates[0] || to,
      recipientLabel: label,
      status: "QUEUED_RETRY",
      summary: `${msgType} (PNG) enfileirado para entrega via ponte VM (${label})`,
      messagePreview: caption || fileName,
      errorDetail
    });
  } else {
    recordWhatsAppCommLog({
      type: msgType,
      recipient: candidates[0] || to,
      recipientLabel: label,
      status: "FAILED",
      summary: `Falha ao enviar ${msgType} (PNG) para ${label}`,
      messagePreview: caption || fileName,
      errorDetail
    });
  }

  return false;
}

export function dispatchWhatsAppBatchAsync(
  messages: Array<{
    to: string;
    text: string;
    delayMs?: number;
    type?: string;
    recipientLabel?: string;
    fallbackTargets?: string[];
  }>
) {
  messages.forEach((m, idx) => {
    const wait = typeof m.delayMs === "number" ? m.delayMs : idx * 1500;
    setTimeout(() => {
      dispatchWhatsAppMessage(m.to, m.text, {
        type: m.type,
        recipientLabel: m.recipientLabel,
        fallbackTargets: m.fallbackTargets
      }).catch((err) => {
        console.warn(`[WhatsApp Batch] Erro inesperado no envio para ${m.to}:`, err?.message || err);
      });
    }, wait);
  });
}

// ============================================================================
// 📸 MOTOR DE DOWNLOAD E PERSISTÊNCIA DE FOTOS DO WHATSAPP (Base64 Permanente)
// ============================================================================
export function isMissingOrDefaultAvatar(photoUrl?: string | null): boolean {
  if (!photoUrl || typeof photoUrl !== "string") return true;
  const clean = photoUrl.trim();
  if (!clean) return true;
  if (
    clean.includes("ui-avatars.com") ||
    clean.includes("dicebear.com") ||
    clean.includes("robohash.org") ||
    clean.includes("gravatar.com") ||
    clean.includes("pravatar.cc") ||
    clean.includes("picsum.photos") ||
    clean.includes("unsplash.com") ||
    clean.includes("googleusercontent.com") ||
    clean.includes("data:image/svg+xml") ||
    clean.startsWith("/avatar") ||
    clean.includes("default")
  ) {
    return true;
  }
  // Links diretos do CDN do WhatsApp (pps.whatsapp.net / mmg.whatsapp.net) expiram após alguns dias e quebram no navegador
  if (clean.includes("pps.whatsapp.net") || clean.includes("mmg.whatsapp.net") || clean.includes("whatsapp.net")) {
    return true;
  }
  return false;
}

const TARGET_PHOTO_BINARY_MAX_BYTES = 7500; // ~10.0 KB quando codificado em base64 Data URI

export async function compressPhotoTo10KBDataUri(
  input: Buffer | string | null | undefined,
  targetBinaryMaxBytes = TARGET_PHOTO_BINARY_MAX_BYTES
): Promise<string | null> {
  if (!input) return null;
  try {
    let rawBuf: Buffer;
    if (Buffer.isBuffer(input)) {
      rawBuf = input;
    } else if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith("data:image/")) {
        // Se já está comprimido <= ~10.3 KB Data URI, retorna direto sem reprocessar
        if (trimmed.length <= 10600) return trimmed;
        const commaIdx = trimmed.indexOf(",");
        if (commaIdx === -1) return trimmed;
        rawBuf = Buffer.from(trimmed.slice(commaIdx + 1), "base64");
      } else if (!trimmed.startsWith("http")) {
        rawBuf = Buffer.from(trimmed, "base64");
      } else {
        return trimmed;
      }
    } else {
      return null;
    }

    if (rawBuf.length < 60) return null;

    const dimensions = [160, 144, 128, 112, 96];
    const qualities = [72, 62, 52, 44, 36];
    let bestBuf: Buffer | null = null;

    for (const dim of dimensions) {
      for (const q of qualities) {
        const candidate = await sharp(rawBuf)
          .rotate()
          .resize(dim, dim, { fit: "cover", position: "attention", withoutEnlargement: true })
          .jpeg({ quality: q, mozjpeg: true })
          .toBuffer();
        bestBuf = candidate;
        if (candidate.length <= targetBinaryMaxBytes) {
          return `data:image/jpeg;base64,${candidate.toString("base64")}`;
        }
      }
    }

    if (bestBuf) {
      return `data:image/jpeg;base64,${bestBuf.toString("base64")}`;
    }
    return `data:image/jpeg;base64,${rawBuf.toString("base64")}`;
  } catch {
    if (typeof input === "string" && input.startsWith("data:image/")) {
      return input;
    }
    return null;
  }
}

export async function downloadImageAsDataUri(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (imageUrl.startsWith("data:image/")) {
    return (await compressPhotoTo10KBDataUri(imageUrl)) || imageUrl;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(imageUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().includes("image") && !contentType.toLowerCase().includes("octet-stream")) {
      return null;
    }
    const arrayBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 100 || buf.length > 5 * 1024 * 1024) return null;
    const compressed = await compressPhotoTo10KBDataUri(buf);
    if (compressed) return compressed;
    const cleanMime = contentType.toLowerCase().includes("image") ? contentType.split(";")[0] : "image/jpeg";
    return `data:${cleanMime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function fetchWhatsAppProfilePictureFromApi(
  phoneOrJid?: string | null,
  whatsappLid?: string | null
): Promise<string | null> {
  const cfg = getWhatsAppConfig();
  const candidates = new Set<string>();

  if (phoneOrJid) {
    const cleanDigits = String(phoneOrJid).replace(/\D/g, "");
    if (cleanDigits.length >= 10) {
      const with55 = cleanDigits.startsWith("55") ? cleanDigits : `55${cleanDigits}`;
      candidates.add(with55);
      // Variante brasileira com e sem o 9º dígito após o DDD
      if (with55.length === 13 && with55[4] === "9") {
        candidates.add(with55.slice(0, 4) + with55.slice(5));
      } else if (with55.length === 12) {
        candidates.add(with55.slice(0, 4) + "9" + with55.slice(4));
      }
    }
  }
  if (whatsappLid && candidates.size === 0) {
    candidates.add(String(whatsappLid).trim());
  }

  const candidateList = Array.from(candidates);
  if (candidateList.length === 0) return null;

  const extractPicUrl = (data: any): string | null => {
    const raw =
      data?.profilePictureUrl ||
      data?.profilePicUrl ||
      data?.picture ||
      data?.imgUrl ||
      data?.url ||
      data?.wuid?.profilePictureUrl ||
      data?.data?.profilePictureUrl ||
      data?.data?.profilePicUrl ||
      null;
    return raw && typeof raw === "string" && raw.startsWith("http") ? raw : null;
  };

  const queryEndpoint = async (ep: string, num: string): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const resp = await fetch(`${cfg.apiUrl}${ep}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.apiKey
        },
        body: JSON.stringify({ number: num }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const parsed = await safeReadResponseJson<any>(resp, `fetchProfilePic:${ep}`, null);
      if (!parsed.isValidJson || !parsed.data) return null;
      return extractPicUrl(parsed.data);
    } catch {
      return null;
    }
  };

  // Dispara variantes de número em paralelo no endpoint principal (<= 4.5s total por jogador)
  const primaryEp = `/chat/fetchProfilePictureUrl/${encodeURIComponent(cfg.instanceName)}`;
  const primaryResults = await Promise.all(candidateList.map((num) => queryEndpoint(primaryEp, num)));
  let rawPicUrl = primaryResults.find((u): u is string => Boolean(u)) || null;

  // Fallback rápido no /chat/fetchProfile apenas se o endpoint principal não retornou
  if (!rawPicUrl) {
    const fallbackEp = `/chat/fetchProfile/${encodeURIComponent(cfg.instanceName)}`;
    rawPicUrl = await queryEndpoint(fallbackEp, candidateList[0]);
  }

  if (rawPicUrl) {
    const dataUri = await downloadImageAsDataUri(rawPicUrl);
    if (dataUri) return dataUri;
  }

  return null;
}

export async function syncSinglePlayerWhatsAppPhoto(
  db: any,
  player: any,
  webhookPicUrl?: string | null,
  forceRefresh = false
): Promise<string | null> {
  if (!player || !player.id || String(player.id).startsWith("wa_")) return null;
  if (!forceRefresh && !isMissingOrDefaultAvatar(player.photoUrl)) {
    return player.photoUrl;
  }

  let finalPhoto: string | null = null;
  if (webhookPicUrl && typeof webhookPicUrl === "string" && webhookPicUrl.startsWith("http")) {
    finalPhoto = (await downloadImageAsDataUri(webhookPicUrl)) || webhookPicUrl;
  }

  if (!finalPhoto) {
    finalPhoto = await fetchWhatsAppProfilePictureFromApi(player.phone, player.whatsappLid);
  }

  if (finalPhoto && finalPhoto.startsWith("data:image/")) {
    finalPhoto = (await compressPhotoTo10KBDataUri(finalPhoto)) || finalPhoto;
  }

  if (finalPhoto) {
    player.photoUrl = finalPhoto;
    delete player.whatsappPhotoUrl;
    if (player.phone) {
      registerWhatsAppPhotoBinding({
        phone: player.phone,
        photoUrl: finalPhoto,
        playerId: player.id,
        playerName: player.name,
        source: "whatsapp_sync"
      });
    }
    await withFirestoreGuard(async () => {
      await db.collection("players").doc(player.id).set(
        { photoUrl: finalPhoto, whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__", photoUpdatedAt: Date.now() },
        { merge: true }
      );
    }, undefined);
  }

  return finalPhoto;
}

export async function syncWhatsAppGroupContactsAndPhones(
  db: any,
  allPlayers: any[]
): Promise<{ phonesUpdated: number; lidsUpdated: number; photosFromContacts: number }> {
  const cfg = getWhatsAppConfig();
  let phonesUpdated = 0;
  let lidsUpdated = 0;
  let photosFromContacts = 0;

  const normStr = (s: string) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const aliasGroups: string[][] = [
    ["elisabete", "elizabeth", "betinha", "elisa"],
    ["beth", "bete", "betania"],
    ["ivana", "ivaninha"],
    ["flavia", "flavinha"],
    ["marcleide", "marcleyde"],
    ["andrea", "dea", "deinha"],
    ["ale", "alexandre", "alessandro"],
    ["rozi", "rosangela", "rosi"],
    ["mari", "mariana"],
    ["fatinha", "fatima"],
    ["ju", "juliana"],
    ["jr", "junior"],
    ["tacy", "taci", "taciana"]
  ];

  // Diretório de fallback dos sócios conhecidos do Guerreiros VC para garantir preenchimento imediato de telefones ausentes
  const knownClubPhonesByAlias: Array<{ aliases: string[]; phone: string }> = [
    { aliases: ["rodney", "rodney eduardo"], phone: "5581997330924" },
    { aliases: ["beth", "betania"], phone: "5581988006345" },
    { aliases: ["elisabete", "elizabeth", "betinha"], phone: "558191387654" },
    { aliases: ["ivana", "ivana marques"], phone: "558188891352" },
    { aliases: ["flavinha", "flavia", "flavinha santo"], phone: "558199022718" },
    { aliases: ["marcleide", "marcleide cavalcanti"], phone: "558188417461" },
    { aliases: ["paulo fonseca", "paulo"], phone: "5581982380304" },
    { aliases: ["caluca"], phone: "558199698832" },
    { aliases: ["bibi"], phone: "558187959852" },
    { aliases: ["rozi", "rosi", "rosangela"], phone: "5581999122340" },
    { aliases: ["ale", "alexandre"], phone: "558199185757" },
    { aliases: ["mari", "mariana"], phone: "558194302282" },
    { aliases: ["thiago"], phone: "558196036960" },
    { aliases: ["marcelo", "marcelo carioca"], phone: "558199157371" },
    { aliases: ["fatinha", "fatima", "fatima mascaro"], phone: "558199747420" },
    { aliases: ["amaro"], phone: "558189840687" },
    { aliases: ["tacy", "taci", "tacy eva"], phone: "5581991717689" },
    { aliases: ["mafagafa"], phone: "558188253823" },
    { aliases: ["alberto"], phone: "558197080172" },
    { aliases: ["ana maria"], phone: "558199648616" },
    { aliases: ["anne", "aninha"], phone: "5581992720041" },
    { aliases: ["dea patricia", "andrea patricia", "andrea", "dea"], phone: "558186274923" },
    { aliases: ["geraldinho", "geraldinho barros"], phone: "558196004655" },
    { aliases: ["iale", "yale"], phone: "5581992128775" },
    { aliases: ["jo", "joseane"], phone: "558196329183" },
    { aliases: ["karina", "karina linhares"], phone: "558198650302" },
    { aliases: ["marcos andre", "marcos melo", "marcos"], phone: "558197478784" },
    { aliases: ["wandinha"], phone: "5581985536192" },
    { aliases: ["duda", "dudinha"], phone: "558185917245" },
    { aliases: ["patricia"], phone: "558192898446" },
    { aliases: ["jr", "junior"], phone: "5581997381747" }
  ];

  const areEquivalentTokens = (t1: string, t2: string) => {
    if (!t1 || !t2) return false;
    if (t1 === t2) return true;
    return aliasGroups.some((grp) => grp.includes(t1) && grp.includes(t2));
  };

  const rawContacts: Array<{
    phone: string;
    lid: string;
    name: string;
    picUrl: string;
  }> = [];

  const extractContactEntry = (item: any) => {
    if (!item || typeof item !== "object") return;
    // CORREÇÃO CRÍTICA Evolution API v2: item.id é um UUID/CUID do banco; o JID real com telefone fica em item.remoteJid!
    const rawJid = String(
      item.remoteJid ||
        item.jid ||
        (String(item.id || "").includes("@") ? item.id : "") ||
        ""
    );
    const rawPhoneField = String(
      item.phoneNumber ||
        item.senderPn ||
        item.number ||
        item.phone ||
        (!rawJid.endsWith("@lid") && !rawJid.endsWith("@g.us") && rawJid.includes("@")
          ? rawJid.split("@")[0]
          : "") ||
        (!String(item.id || "").includes("@") && /^\d{10,13}$/.test(String(item.id || ""))
          ? String(item.id)
          : "")
    );
    const digits = rawPhoneField.split("@")[0].replace(/\D/g, "");
    const validPhone = digits.length >= 10 && digits.length <= 13 ? digits : "";
    const validLid = rawJid.endsWith("@lid")
      ? rawJid
      : String(item.lid || item.participantLid || "").endsWith("@lid")
      ? String(item.lid || item.participantLid)
      : "";
    const contactName = String(
      item.pushName || item.name || item.notify || item.verifiedName || item.subject || ""
    ).trim();
    const picUrl = String(
      item.profilePicUrl || item.profilePictureUrl || item.imgUrl || item.picture || ""
    ).trim();

    if (validPhone || validLid) {
      rawContacts.push({
        phone: validPhone,
        lid: validLid,
        name: contactName,
        picUrl: picUrl.startsWith("http") ? picUrl : ""
      });
    }
  };

  // 1 e 2) Busca participantes do grupo, contatos e conversas em PARALELO (máx. 6s no total)
  const groupEndpoints = [
    `/group/participants/${encodeURIComponent(cfg.instanceName)}?groupJid=${encodeURIComponent(cfg.groupJid)}`,
    `/group/findGroupInfos/${encodeURIComponent(cfg.instanceName)}?groupJid=${encodeURIComponent(cfg.groupJid)}`
  ];
  const chatEndpoints = ["/chat/findContacts", "/chat/findChats"];

  await Promise.allSettled([
    ...groupEndpoints.map(async (ep) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(`${cfg.apiUrl}${ep}`, {
          method: "GET",
          headers: { apikey: cfg.apiKey },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (resp.ok) {
          const parsed = await safeReadResponseJson<any>(resp, `groupContacts:${ep}`, null);
          const data = parsed.isValidJson ? parsed.data : null;
          const participants = Array.isArray(data)
            ? data
            : Array.isArray(data?.participants)
            ? data.participants
            : [];
          participants.forEach(extractContactEntry);
        }
      } catch {}
    }),
    ...chatEndpoints.map(async (chatEp) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(
          `${cfg.apiUrl}${chatEp}/${encodeURIComponent(cfg.instanceName)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
            body: JSON.stringify({ where: {} }),
            signal: controller.signal
          }
        );
        clearTimeout(timer);
        if (resp.ok) {
          const parsed = await safeReadResponseJson<any>(resp, `chatContacts:${chatEp}`, null);
          const data = parsed.isValidJson ? parsed.data : null;
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data?.contacts)
            ? data.contacts
            : Array.isArray(data?.chats)
            ? data.chats
            : [];
          list.forEach(extractContactEntry);
        }
      } catch {}
    })
  ]);

  // 3) Cruza contatos do WhatsApp + diretório do clube com os sócios para preencher telefones, LIDs e fotos ausentes
  for (const player of allPlayers) {
    if (!player || !player.id || !player.name || String(player.id).startsWith("wa_")) continue;

    const cleanPlayerName = normStr(player.name);
    const playerTokens = cleanPlayerName.split(/[^a-z0-9]+/).filter(Boolean);
    if (playerTokens.length === 0) continue;

    let currentDigits = String(player.phone || "").replace(/\D/g, "");
    let hasValidPhone = currentDigits.length >= 10 && currentDigits.length <= 13;

    const updates: Record<string, any> = {};

    // Se o sócio estiver sem telefone no cadastro, verifica primeiro no diretório conhecido do clube
    if (!hasValidPhone) {
      const fallbackMatch = knownClubPhonesByAlias.find(
        (entry) =>
          entry.aliases.includes(cleanPlayerName) ||
          (playerTokens.length === 1 && entry.aliases.includes(playerTokens[0])) ||
          entry.aliases.some((al) => al === playerTokens.slice(0, 2).join(" "))
      );
      if (fallbackMatch) {
        player.phone = fallbackMatch.phone;
        updates.phone = fallbackMatch.phone;
        currentDigits = fallbackMatch.phone;
        hasValidPhone = true;
        phonesUpdated++;
      }
    }

    // Procura correspondência nos contatos da Evolution API por telefone existente, LID existente ou Nome/Apelido
    let bestContact: { phone: string; lid: string; name: string; picUrl: string } | null = null;
    let bestScore = 0;

    for (const c of rawContacts) {
      let score = 0;
      if (player.whatsappLid && c.lid && player.whatsappLid === c.lid) {
        score = 120;
      } else if (hasValidPhone && c.phone && matchBrazilianPhone(c.phone, currentDigits)) {
        score = 115;
      } else if (c.name && c.name.length >= 2) {
        const cleanContactName = normStr(c.name);
        const contactTokens = cleanContactName.split(/[^a-z0-9]+/).filter(Boolean);
        if (cleanContactName === cleanPlayerName) {
          score = 100;
        } else if (
          playerTokens.length > 1 &&
          playerTokens.every((t) => contactTokens.some((ct) => areEquivalentTokens(t, ct)))
        ) {
          score = 94;
        } else if (
          playerTokens.length > 0 &&
          contactTokens.length > 0 &&
          areEquivalentTokens(playerTokens[0], contactTokens[0])
        ) {
          const ambiguousFirst = allPlayers.filter((other) => {
            if (!other?.name || other.id === player.id) return false;
            const otherFirst = normStr(other.name).split(/[^a-z0-9]+/)[0];
            return areEquivalentTokens(otherFirst, playerTokens[0]);
          });
          if (ambiguousFirst.length === 0) {
            score = 88;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestContact = c;
      } else if (
        score > 0 &&
        score === bestScore &&
        bestContact &&
        ((!bestContact.phone && c.phone) || (!bestContact.picUrl && c.picUrl))
      ) {
        bestContact = {
          phone: bestContact.phone || c.phone,
          lid: bestContact.lid || c.lid,
          name: bestContact.name || c.name,
          picUrl: bestContact.picUrl || c.picUrl
        };
      }
    }

    if (bestContact && bestScore >= 85) {
      if (!hasValidPhone && bestContact.phone) {
        player.phone = bestContact.phone;
        updates.phone = bestContact.phone;
        hasValidPhone = true;
        phonesUpdated++;
      }
      if (!player.whatsappLid && bestContact.lid) {
        player.whatsappLid = bestContact.lid;
        updates.whatsappLid = bestContact.lid;
        lidsUpdated++;
      }
      if (isMissingOrDefaultAvatar(player.photoUrl) && bestContact.picUrl) {
        const dataUri = await downloadImageAsDataUri(bestContact.picUrl);
        if (dataUri) {
          player.photoUrl = dataUri;
          updates.photoUrl = dataUri;
          updates.photoUpdatedAt = Date.now();
          photosFromContacts++;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.autoLinkedAt = Date.now();
      await withFirestoreGuard(async () => {
        await db.collection("players").doc(player.id).set(updates, { merge: true });
      }, undefined);
    }
  }

  return { phonesUpdated, lidsUpdated, photosFromContacts };
}

function getCanonicalPlayerIdentityKey(player: any): string {
  const norm = String(player?.name || player?.id || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^seed_/, "")
    .trim();
  const first = norm.split(/[^a-z0-9]+/)[0] || norm;
  if (["elisabete", "elizabeth", "betinha", "elisa"].includes(first)) return "elisabete";
  if (["beth", "bete", "betania"].includes(first)) return "beth";
  if (["ivana", "ivaninha"].includes(first)) return "ivana";
  if (["flavia", "flavinha"].includes(first)) return "flavinha";
  if (["marcleide", "marcleyde"].includes(first)) return "marcleide";
  if (["andrea", "dea", "deinha"].includes(first)) return "dea_patricia";
  if (["ale", "alexandre", "alessandro"].includes(first)) return "ale";
  if (["rozi", "rosangela", "rosi"].includes(first)) return "rozi";
  if (["mari", "mariana"].includes(first)) return "mari";
  if (["fatinha", "fatima"].includes(first)) return "fatinha";
  if (["tacy", "taci", "taciana"].includes(first)) return "tacy";
  return norm || String(player?.id || "");
}

function buildCanonicalGoingListSignature(goingList: any[], targetDate: string): string {
  const canonicalKeys = (goingList || []).map(getCanonicalPlayerIdentityKey).filter(Boolean);
  return `${targetDate}|count:${canonicalKeys.length}|${canonicalKeys.join(",")}`;
}

async function buildCurrentGroupAttendanceBroadcast(
  allPlayers: any[],
  intentionsDoc: any
): Promise<{ groupJid: string; text: string; signature: string } | null> {
  const cfg = getWhatsAppConfig();
  const activePlayers = (allPlayers || []).filter((p) => p.status === "active" && !p.isDM);
  const totalActivePool = activePlayers.length;
  const targetDate = intentionsDoc?.targetDate || getNextThursday();
  const responses = intentionsDoc?.responses || {};
  const timestamps = intentionsDoc?.confirmationTimestamps || {};

  const goingList = activePlayers
    .filter((p) => resolvePlayerIntentEntry(p, responses, timestamps).status === "GOING")
    .sort(
      (a, b) =>
        resolvePlayerIntentEntry(a, responses, timestamps).ts -
        resolvePlayerIntentEntry(b, responses, timestamps).ts
    );

  if (goingList.length === 0) return null;

  const signature = buildCanonicalGoingListSignature(goingList, targetDate);
  const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
  const settersCount = goingList.filter((p) => p.isOfficialSetter).length;
  const count = goingList.length;

  let statusNoite = "";
  if (count < 6) {
    statusNoite = "🔥 *Status da Noite:* Montando a base... Faltam guerreiros para o primeiro time!";
  } else if (count < 12) {
    statusNoite = "🔥 *Status da Noite:* Esquentando o braço! Já temos o início de um jogaço.";
  } else if (count < 18) {
    statusNoite = "🔥 *Status da Noite:* Já temos 2 times formados na quadra! O bicho vai pegar! ⚡";
  } else if (count < 24) {
    statusNoite = "🔥 *Status da Noite:* Presença forte! Vamos rodar 3 times completos sem tempo ruim.";
  } else {
    statusNoite = "🔥 *Status da Noite:* Quadra estourando de gente! Sócios em peso, rodízio pesado e nível lá no alto! 🚀";
  }

  const text =
    `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
    `✅ *Confirmados:* ${goingList.length}/${totalActivePool} (${settersCount} Levantadores)\n` +
    goingList
      .map((p, i) => `${i + 1}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
      .join("\n") +
    `\n\n${statusNoite}\n` +
    `───────────────────\n` +
    `📱 *Confirme pelo App:*\nhttps://guerreiros-volleyball-club-238897290870.us-west1.run.app/?tab=intentions\n\n` +
    `🤖 *FALE COM O GUERREIRINHO NO PRIVADO (1 CLIQUE OU ÁUDIO):*\n` +
    `🟢 *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n` +
    `🔴 *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou\n\n` +
    `— Guerreirinho, o robô do clube 🤖`;

  return { groupJid: cfg.groupJid, text, signature };
}

let groupListBroadcastTimer: NodeJS.Timeout | null = null;

export function scheduleGroupAttendanceBroadcast(delayMs = 90 * 1000) {
  if (groupListBroadcastTimer) {
    clearTimeout(groupListBroadcastTimer);
  }
  groupListBroadcastTimer = setTimeout(async () => {
    groupListBroadcastTimer = null;
    try {
      const cfg = getWhatsAppConfig();
      const db = await getFirestore();
      const [allPlayers, currentInt] = await Promise.all([
        getCachedPlayers(true),
        ensureFreshIntentionsDocument(true)
      ]);
      const activePlayers = allPlayers.filter((p) => p.status === "active" && !p.isDM);
      const totalActivePool = activePlayers.length;
      const targetDate = currentInt.targetDate || getNextThursday();
      const responses = currentInt.responses || {};
      const timestamps = currentInt.confirmationTimestamps || {};

      const goingList = activePlayers
        .filter((p) => resolvePlayerIntentEntry(p, responses, timestamps).status === "GOING")
        .sort(
          (a, b) =>
            resolvePlayerIntentEntry(a, responses, timestamps).ts -
            resolvePlayerIntentEntry(b, responses, timestamps).ts
        );

      if (goingList.length === 0) return;

      if (!cachedScheduler) {
        cachedScheduler = loadLocalSchedulerBackup();
      }
      const remoteSched = await withFirestoreGuard(async () => {
        const s = await db.collection("metadata").doc("whatsapp_scheduler").get();
        return s.exists ? s.data() || {} : {};
      }, {} as Record<string, any>);
      const mergedSched = { ...(cachedScheduler || {}), ...(remoteSched || {}) };

      const currentSignature = buildCanonicalGoingListSignature(goingList, targetDate);
      const prevSig = String(mergedSched.lastBroadcastSignature || "");
      const prevSameDate = prevSig.startsWith(`${targetDate}|`);
      const prevKeys = new Set(
        prevSameDate ? (prevSig.split("|")[2] || "").split(",").filter(Boolean) : []
      );
      const currentKeys = goingList.map(getCanonicalPlayerIdentityKey).filter(Boolean);
      const hasNewConfirmation = !prevSameDate || currentKeys.some((k) => !prevKeys.has(k));

      const prevCountMatch = prevSig.match(/\|count:(\d+)\|/);
      const prevCount = prevCountMatch ? Number(prevCountMatch[1]) : -1;
      const lastAt = Number(mergedSched.lastBroadcastAt || 0);

      if (prevSig === currentSignature || !hasNewConfirmation) {
        return;
      }
      if (prevCount === goingList.length && Date.now() - lastAt < 15 * 60 * 1000) {
        return;
      }

      cachedScheduler = {
        ...mergedSched,
        lastBroadcastSignature: currentSignature,
        lastBroadcastAt: Date.now()
      };
      saveLocalSchedulerBackup(cachedScheduler);
      await withFirestoreGuard(
        () =>
          db
            .collection("metadata")
            .doc("whatsapp_scheduler")
            .set({ lastBroadcastSignature: currentSignature, lastBroadcastAt: Date.now() }, { merge: true }),
        undefined
      );

      const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
      const settersCount = goingList.filter((p) => p.isOfficialSetter).length;

      const count = goingList.length;
      let statusNoite = "";
      if (count < 6) {
        statusNoite = "🔥 *Status da Noite:* Montando a base... Faltam guerreiros para o primeiro time!";
      } else if (count < 12) {
        statusNoite = "🔥 *Status da Noite:* Esquentando o braço! Já temos o início de um jogaço.";
      } else if (count < 18) {
        statusNoite = "🔥 *Status da Noite:* Já temos 2 times formados na quadra! O bicho vai pegar! ⚡";
      } else if (count < 24) {
        statusNoite = "🔥 *Status da Noite:* Presença forte! Vamos rodar 3 times completos sem tempo ruim.";
      } else {
        statusNoite = "🔥 *Status da Noite:* Quadra estourando de gente! Sócios em peso, rodízio pesado e nível lá no alto! 🚀";
      }

      const text =
        `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
        `✅ *Confirmados:* ${goingList.length}/${totalActivePool} (${settersCount} Levantadores)\n` +
        goingList
          .map((p, i) => `${i + 1}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
          .join("\n") +
        `\n\n${statusNoite}\n` +
        `───────────────────\n` +
        `📱 *Confirme pelo App:*\nhttps://guerreiros-volleyball-club-238897290870.us-west1.run.app/?tab=intentions\n\n` +
        `🤖 *FALE COM O GUERREIRINHO NO PRIVADO (1 CLIQUE OU ÁUDIO):*\n` +
        `🟢 *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n` +
        `🔴 *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou\n\n` +
        `— Guerreirinho, o robô do clube 🤖`;

      await dispatchWhatsAppMessage(cfg.groupJid, text);
    } catch (e) {
      console.warn("[Auto Broadcast 2min] Erro:", e);
    }
  }, delayMs);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware de proteção contra JSON malformado (ex: "upstream r...", corpo truncado ou texto puro)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
      const preview = typeof err.body === "string" ? err.body.slice(0, 80).replace(/\s+/g, " ") : "";
      console.warn(`[Express JSON Guard] Payload malformado bloqueado em ${req.method} ${req.path}: ${err.message} | preview="${preview}"`);
      if (req.path.startsWith("/api/whatsapp/")) {
        return res.status(200).json({
          success: false,
          ignored: true,
          messages: [],
          error: "Payload JSON malformado ignorado com segurança."
        });
      }
      return res.status(400).json({
        success: false,
        error: "Formato JSON inválido na requisição."
      });
    }
    return next(err);
  });

  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "publickey-credentials-get=(self), publickey-credentials-create=(self)"
    );
    next();
  });

  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({ version: APP_VERSION, timestamp: Date.now() });
  });

  app.get("/api/bootstrap", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const [players, matches, intentions, systemMetadata] = await Promise.all([
        getCachedPlayers(cachedPlayers.length < 10),
        getCachedMatches(cachedMatches.length === 0),
        ensureFreshIntentionsDocument(false),
        getCachedSystemConfig(false)
      ]);
      res.json({
        success: true,
        playersCount: players.length,
        matchesCount: matches.length,
        players: players.length >= 10 ? players : [],
        matches: matches.length > 0 ? matches : [],
        intentions,
        systemMetadata
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: APP_VERSION,
      loadedCardFonts: getLoadedCardFontsCount(),
      circuitBreakerActive: Date.now() < firestoreCircuitOpenUntil,
      cachedPlayersCount: cachedPlayers.length,
      cachedMatchesCount: cachedMatches.length,
      projectId: configProjectId,
      databaseId: resolveActiveFirestoreDatabaseId() || "(default)",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/ai/status", async (_req, res) => {
    try {
      const { getServerAIStatus } = await import("./services/serverGemini.ts");
      res.json({
        ...getServerAIStatus(),
        router: getAIRouterStatus()
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get AI status" });
    }
  });

  // 🧠 Política Dinâmica do Roteador Multi-Modelo de IA (inspeção + realocação segura em runtime)
  app.get("/api/ai/router-policy", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json(getAIRouterStatus());
  });

  app.post("/api/ai/router-policy", async (req, res) => {
    try {
      const { policy, reset, clearCache } = req.body || {};
      if (clearCache) {
        const cleared = clearAIRouterCache();
        if (!policy && !reset) {
          return res.json({ ok: true, clearedCacheEntries: cleared, status: getAIRouterStatus() });
        }
      }

      if (reset) {
        const defaultPolicy = resetAIRouterPolicy();
        try {
          const db = await getFirestore();
          await db.collection("metadata").doc("ai_router_policy").set(
            { policy: defaultPolicy, updatedAt: new Date().toISOString(), resetToDefault: true },
            { merge: true }
          );
        } catch {}
        return res.json({ ok: true, status: getAIRouterStatus() });
      }

      if (!policy || typeof policy !== "object") {
        return res.status(400).json({ error: "Envie { policy: { ULTRA_LIGHT?: { primary, fallbacks, thinkingLevel }, ... } } ou { reset: true }." });
      }

      const result = setAIRouterPolicy(policy, "runtime_api");
      if (result.errors.length > 0) {
        return res.status(400).json({ error: "Política rejeitada por segurança.", details: result.errors });
      }

      try {
        const db = await getFirestore();
        await db.collection("metadata").doc("ai_router_policy").set(
          { policy: result.policy, updatedAt: new Date().toISOString(), resetToDefault: false },
          { merge: true }
        );
      } catch (persistErr) {
        console.warn("[AIRouter] Aviso ao persistir política no Firestore:", persistErr);
      }

      return res.json({ ok: true, status: getAIRouterStatus() });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Falha ao atualizar política de IA." });
    }
  });

  app.get(
    ["/api/status-info", "/api/sys-info", "/api/sysinfo", "/sys-info", "/sysinfo", "/api/system-info"],
    (_req, res) => {
      const used = process.memoryUsage();
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({
        status: "ok",
        rss: Math.round(used.rss / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }
  );

  // ============================================================================
  // 📍 CHECK-IN 1-CLIQUE PELO LINK DO WHATSAPP (Funciona mesmo se o conector ignorar pinos de mapa)
  // ============================================================================
  app.get("/checkin", (req, res) => {
    const pid = String(req.query.pid || "").trim();
    const phone = String(req.query.phone || "").trim();
    const name = String(req.query.name || "Guerreiro(a)").trim();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Check-in na Quadra — Guerreiros VC</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #000; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { width: 100%; max-width: 400px; background: #121214; border: 2px solid rgba(245,196,41,0.4); border-radius: 28px; padding: 32px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
    .badge { display: inline-block; background: rgba(245,196,41,0.15); color: #F5C429; border: 1px solid rgba(245,196,41,0.3); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 6px 14px; border-radius: 99px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 900; text-transform: uppercase; margin-bottom: 10px; color: #fff; }
    p { font-size: 14px; color: #a1a1aa; line-height: 1.5; margin-bottom: 24px; whitespace: pre-line; }
    .btn { width: 100%; background: #F5C429; color: #000; border: none; border-radius: 16px; padding: 16px; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: 0.2s; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-box { margin-top: 20px; padding: 16px; border-radius: 16px; background: rgba(255,255,255,0.05); font-size: 14px; line-height: 1.5; white-space: pre-line; text-align: left; display: none; }
    .spinner { width: 36px; height: 36px; border: 4px solid rgba(245,196,41,0.2); border-top-color: #F5C429; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🏐 Guerreiros VC</div>
    <h1 id="title">Validando GPS na Quadra...</h1>
    <div id="loader" class="spinner"></div>
    <p id="desc">Olá, <strong>${name.split("<").join("").split(">").join("").split('"').join("").split("'").join("")}</strong>! Aguarde 1 segundo enquanto confirmamos sua localização na quadra...</p>
    <button id="retryBtn" class="btn" style="display:none;" onclick="startCheckIn()">📍 Validar Minha Localização</button>
    <div id="resultBox" class="status-box"></div>
    <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 10px;">
      <span style="font-size: 11px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px;">🚗 Ainda a caminho? Abra a rota com trânsito:</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <a href="https://waze.com/ul?ll=${DEFAULT_COURT_LAT},${DEFAULT_COURT_LNG}&navigate=yes" target="_blank" rel="noopener noreferrer" style="text-decoration: none; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); padding: 11px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">🟦 Ir com Waze</a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${DEFAULT_COURT_LAT},${DEFAULT_COURT_LNG}&travelmode=driving" target="_blank" rel="noopener noreferrer" style="text-decoration: none; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.35); padding: 11px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">🟩 Google Maps</a>
      </div>
    </div>
  </div>
  <script>
    const pid = ${JSON.stringify(pid)};
    const phone = ${JSON.stringify(phone)};
    const name = ${JSON.stringify(name)};

    function showResult(text, ok) {
      document.getElementById('loader').style.display = 'none';
      document.getElementById('title').textContent = ok ? 'Check-in Processado!' : 'Atenção no Check-in';
      const box = document.getElementById('resultBox');
      box.style.display = 'block';
      box.style.border = ok ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(244,63,94,0.5)';
      box.textContent = text.replace(/\*/g, '');
      document.getElementById('retryBtn').style.display = 'block';
      document.getElementById('retryBtn').textContent = '🔄 Testar Novamente';
    }

    function startCheckIn() {
      document.getElementById('loader').style.display = 'block';
      document.getElementById('retryBtn').style.display = 'none';
      if (!navigator.geolocation) {
        showResult('Seu navegador não suporta GPS.', false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const resp = await fetch('/api/checkin/gps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pid,
                phone,
                name,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
              })
            });
            const data = await resp.json();
            showResult(data.message || 'Resposta recebida.', Boolean(data.withinRange));
          } catch (e) {
            showResult('Erro ao conectar com o servidor. Tente novamente.', false);
          }
        },
        (err) => {
          showResult('Permissão de localização negada ou sinal indisponível. Permita o uso da localização no navegador e toque abaixo.', false);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    }

    window.onload = startCheckIn;
  </script>
</body>
</html>`);
  });

  app.post("/api/checkin/gps", async (req, res) => {
    try {
      const { pid, phone, name, lat, lng } = req.body || {};
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        return res.status(400).json({ success: false, message: "Coordenadas inválidas." });
      }
      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      let player = allPlayers.find(
        (p) =>
          (pid && p.id === pid) ||
          (phone && matchBrazilianPhone(String(phone), p.phone)) ||
          (name && String(p.name || "").trim().toLowerCase() === String(name).trim().toLowerCase())
      );
      if (!player) {
        player = {
          id: pid || "rodney_admin",
          name: name || "Rodney",
          email: "rodneyes@gmail.com",
          phone: phone || "558197330924",
          status: "active",
          isDM: false,
          isAdmin: true
        };
      }

      const replyMessage = await executeCourtLocationCheckIn(db, player, {
        lat: numLat,
        lng: numLng,
        isLive: false
      });

      const targets = resolvePlayerWhatsAppTargets(player);
      const jid = targets[0] || normalizePhoneToJid(player.phone || phone);
      if (jid && replyMessage) {
        dispatchWhatsAppMessage(jid, `${replyMessage}\n\n— Guerreirinho, o robô do clube 🤖`, {
          type: "WHATSAPP_LINK_GPS_CHECKIN",
          recipientLabel: player.name,
          fallbackTargets: targets.slice(1)
        }).catch(() => {});
      }

      const withinRange =
        replyMessage.includes("CHECK-IN NA QUADRA CONFIRMADO") || replyMessage.includes("já está na lista");
      res.json({
        success: true,
        withinRange,
        message: replyMessage || "Check-in processado com sucesso."
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/presence/gps-checkin", async (req, res) => {
    try {
      const {
        playerId,
        lat,
        lng,
        accuracy,
        name,
        address,
        isLive = true,
        bypassTimeWindow = false,
        dryRun = false,
        source = "APP_GPS",
        maxRadiusMeters,
        notifyWhatsApp = false
      } = req.body || {};

      const numLat = Number(lat);
      const numLng = Number(lng);
      if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        return res.status(400).json({
          success: false,
          allowed: false,
          error: "Coordenadas GPS inválidas."
        });
      }

      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const caller = await verifyCallerIdentity(req);
      let player = allPlayers.find(
        (p) =>
          (playerId && (p.id === playerId || p.uid === playerId)) ||
          (caller.email && String(p.email || "").trim().toLowerCase() === caller.email)
      );

      if (!player) {
        return res.status(404).json({
          success: false,
          allowed: false,
          error: "Sócio não encontrado no cadastro do clube."
        });
      }

      const firstName = String(player.name || "Guerreiro").trim().split(/\s+/)[0] || "Guerreiro";
      if (player.status !== "active" || player.isDM) {
        return res.json({
          success: true,
          allowed: false,
          reason: "INACTIVE_OR_DM",
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message: `⚠️ Olá, ${firstName}! Apenas sócios Ativos e fora do DM podem fazer check-in na lista de presença da quadra.`
        });
      }

      const br = getBrazilTimeParts();
      const isAdminCaller =
        Boolean(caller.isAdmin) ||
        Boolean(player?.isAdmin) ||
        String(player?.email || "").trim().toLowerCase() === "rodneyes@gmail.com";

      const isAutoGeoSource =
        String(source || "") === "APP_AUTO_GEO_150M" || String(source || "") === "APP_AUTO_GEO_50M";
      const isThursdayWindow =
        Boolean(bypassTimeWindow) ||
        (isAdminCaller && !isAutoGeoSource) ||
        (br.dayOfWeek === 4 &&
          br.totalMinutes >= (isAutoGeoSource ? 19 * 60 : 17 * 60 + 30) &&
          br.totalMinutes <= COURT_CHECKIN_END_MINUTES);

      if (!isThursdayWindow) {
        return res.json({
          success: true,
          allowed: false,
          reason: "OUTSIDE_WINDOW",
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message: isAutoGeoSource
            ? `⏰ Olá, ${firstName}! O check-in automático por proximidade (150m) fica ativo nas Quintas-feiras das 19h00 às 22h00.`
            : `⏰ Olá, ${firstName}!\n\nO check-in presencial na quadra via GPS fica liberado nas Quintas-feiras das 17h30 às 22h00.`
        });
      }

      const numAccuracy = accuracy !== undefined && accuracy !== null ? Number(accuracy) : NaN;
      if (isAutoGeoSource && Number.isFinite(numAccuracy) && numAccuracy > 150) {
        return res.json({
          success: true,
          allowed: false,
          reason: "LOW_GPS_ACCURACY",
          accuracy: Math.round(numAccuracy),
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message: `📡 Sinal GPS ainda impreciso (±${Math.round(numAccuracy)}m). Aguardando estabilização do satélite.`
        });
      }

      // Bloqueio anti-fraude: localização pesquisada no mapa em vez de GPS real
      const hasSearchedPlaceLabel =
        !isLive &&
        Boolean(
          (name && String(name).trim().length > 0) ||
            (address && String(address).trim().length > 0)
        );

      const sysConfig = await getCachedSystemConfig(Boolean(isAdminCaller || dryRun));
      const isAutoGeoEnabledForClub = sysConfig?.autoGeoCheckInEnabled === true;
      if (isAutoGeoSource && !isAdminCaller && !isAutoGeoEnabledForClub) {
        return res.json({
          success: true,
          allowed: false,
          reason: "FEATURE_DISABLED",
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message: "⚙️ O check-in automático por GPS ainda está em fase de testes pelo administrador."
        });
      }

      const courtLat = Number(sysConfig?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
      const courtLng = Number(sysConfig?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
      const resolvedCourtLocation = { lat: courtLat, lng: courtLng };
      const defaultMaxRadius = Number(sysConfig?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS);
      const requestedRadius = Number(maxRadiusMeters);
      const maxRadius =
        Number.isFinite(requestedRadius) && requestedRadius >= 20
          ? Math.min(Math.round(requestedRadius), Math.max(defaultMaxRadius, DEFAULT_GEOFENCE_RADIUS_METERS))
          : defaultMaxRadius;
      const distanceMeters = calculateDistanceMeters(numLat, numLng, courtLat, courtLng);

      if (hasSearchedPlaceLabel) {
        return res.json({
          success: true,
          allowed: false,
          reason: "SEARCHED_LOCATION_BLOCKED",
          distanceMeters,
          maxRadius,
          courtLocation: resolvedCourtLocation,
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message:
            `🚫 Localização pesquisada no mapa não é aceita, ${firstName}!\n\n` +
            `Para validar presença, utilize o sinal de GPS real do aparelho no local da quadra (endereços digitados na busca são bloqueados pelo sistema antifraude).`
        });
      }

      if (!dryRun && !bypassTimeWindow && !isAdminCaller && distanceMeters <= maxRadius) {
        const jumpCheck = checkImpossibleGpsJump(player.id, numLat, numLng);
        if (jumpCheck.suspicious) {
          return res.json({
            success: true,
            allowed: false,
            reason: "SUSPICIOUS_GPS_JUMP",
            distanceMeters,
            maxRadius,
            courtLocation: resolvedCourtLocation,
            dryRun: false,
            player: { id: player.id, name: player.name },
            message: `🛡️ Salto de GPS suspeito detectado (${jumpCheck.jumpMeters}m em ${jumpCheck.elapsedSec}s). Aguarde o sinal estabilizar na quadra.`
          });
        }
      }

      if (distanceMeters > maxRadius) {
        if (!dryRun && (isAdminCaller || (br.dayOfWeek === 4 && br.totalMinutes <= COURT_CHECKIN_END_MINUTES))) {
          await upsertPendingCourtGeoWatcher(db, br.dateKey, player, {
            lastDistanceMeters: distanceMeters,
            lastLat: numLat,
            lastLng: numLng,
            source: String(source || "APP_GPS")
          });
        }
        return res.json({
          success: true,
          allowed: false,
          reason: "OUT_OF_RANGE",
          distanceMeters,
          maxRadius,
          courtLocation: resolvedCourtLocation,
          dryRun: Boolean(dryRun),
          player: { id: player.id, name: player.name },
          message:
            `📍 Você ainda está longe da quadra, ${firstName}!\n\n` +
            `📏 Distância medida: ~${distanceMeters}m (limite permitido: ${maxRadius}m).\n` +
            `Aproxime-se da quadra oficial dos Guerreiros e valide o GPS novamente até às 22h00 para entrar na fila.`
        });
      }

      const dateKey = br.dateKey;
      const now = Date.now();
      let arrivalOrder = 1;
      let alreadyPresent = false;

      if (dryRun) {
        await withFirestoreGuard(async () => {
          const snap = await db.collection("attendance").doc(dateKey).collection("players").get();
          const currentPresent: any[] = [];
          snap.forEach((d: any) => {
            const dData = d.data();
            if (dData && dData.status !== "left" && !dData.isDM) {
              currentPresent.push({ id: d.id, ...dData });
            }
          });
          const existing = currentPresent.find((p) => p.id === player.id);
          if (existing) {
            alreadyPresent = true;
            arrivalOrder = Number(existing.arrivalOrder || 1);
          } else {
            const maxOrder = currentPresent.reduce((max, p) => Math.max(max, Number(p.arrivalOrder || 0)), 0);
            arrivalOrder = maxOrder + 1;
          }
        }, undefined);

        return res.json({
          success: true,
          allowed: true,
          reason: alreadyPresent ? "ALREADY_PRESENT" : "SIMULATION_OK",
          distanceMeters,
          maxRadius,
          courtLocation: resolvedCourtLocation,
          arrivalOrder,
          alreadyPresent,
          dryRun: true,
          whatsappNotified: false,
          player: { id: player.id, name: player.name },
          message:
            `✅ SIMULAÇÃO APROVADA PARA ${firstName.toUpperCase()}!\n\n` +
            `📏 Distância da quadra: ${distanceMeters}m (dentro da cerca virtual de ${maxRadius}m).\n` +
            `📍 Posição prevista na fila: #${arrivalOrder}${alreadyPresent ? " (já em quadra)" : ""}.\n` +
            `ℹ️ Modo Simulação ativo — nenhum registro foi gravado na lista.`
        });
      }

      await withAttendanceCheckInLock(async () => {
        await withFirestoreGuard(async () => {
          const attColRef = db.collection("attendance").doc(dateKey).collection("players");
          const snap = await attColRef.get();
          const currentPresent: any[] = [];
          snap.forEach((d: any) => {
            const dData = d.data();
            if (dData && dData.status !== "left" && !dData.isDM) {
              currentPresent.push({ id: d.id, ...dData });
            }
          });

          const existing = currentPresent.find((p) => p.id === player.id);
          if (existing) {
            alreadyPresent = true;
            arrivalOrder = Number(existing.arrivalOrder || 1);
            return;
          }

          const maxOrder = currentPresent.reduce((max, p) => Math.max(max, Number(p.arrivalOrder || 0)), 0);
          arrivalOrder = maxOrder + 1;

          await db.collection("attendance").doc(dateKey).set(
            { date: dateKey, lastUpdate: now },
            { merge: true }
          );

          await attColRef.doc(player.id).set(
            {
              ...player,
              id: player.id,
              name: player.name || "Sócio",
              status: "active",
              arrivalOrder,
              isPresent: true,
              checkInMethod: "QR",
              checkInSource: String(source || "APP_GPS"),
              distanceFromCourtMeters: distanceMeters,
              timestamp: now
            },
            { merge: true }
          );
        }, undefined);
      });

      await Promise.all([
        syncPlayerPreConfirmationDoc(db, dateKey, player, "GOING", now).catch(() => {}),
        markCourtGeoWatcherArrived(db, dateKey, player.id, {
          lastLat: numLat,
          lastLng: numLng,
          lastDistanceMeters: distanceMeters,
          arrivalOrder,
          name: player.name
        }).catch(() => {})
      ]);

      let whatsappNotified = false;
      if (Boolean(notifyWhatsApp) && !alreadyPresent) {
        const playerTargets = resolvePlayerWhatsAppTargets(player);
        if (playerTargets.length > 0) {
          const timeLabel = `${String(br.hour).padStart(2, "0")}:${String(br.minute).padStart(2, "0")}`;
          const waText =
            `✅🏐 *PRESENÇA NA FILA CONFIRMADA, ${firstName.toUpperCase()}!*\n\n` +
            `Detectamos sua entrada na área da quadra oficial dos Guerreiros.\n` +
            `📍 *Posição na fila:* #${arrivalOrder}\n` +
            `📏 *Distância validada:* ${distanceMeters}m da quadra\n` +
            `🕒 *Horário:* ${timeLabel}\n\n` +
            `Bom jogo! 🔥\n— Guerreirinho, o robô do clube 🤖`;

          whatsappNotified = await Promise.race([
            dispatchWhatsAppMessage(playerTargets[0], waText, {
              type: "COURT_AUTO_GEO_CHECKIN",
              recipientLabel: player.name,
              fallbackTargets: playerTargets.slice(1)
            }).catch(() => false),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2200))
          ]);
        }
      }

      return res.json({
        success: true,
        allowed: true,
        reason: alreadyPresent ? "ALREADY_PRESENT" : "OK",
        distanceMeters,
        maxRadius,
        courtLocation: resolvedCourtLocation,
        arrivalOrder,
        alreadyPresent,
        dryRun: false,
        whatsappNotified,
        player: { id: player.id, name: player.name },
        message: alreadyPresent
          ? `✅🏐 ${firstName}, você já está na lista de presença da quadra hoje! Ordem de chegada: #${arrivalOrder} (${distanceMeters}m da quadra).`
          : `✅🏐 CHECK-IN NA QUADRA CONFIRMADO, ${firstName.toUpperCase()}!\n\n📍 Posição na fila: #${arrivalOrder}\n📏 Distância validada: ${distanceMeters}m da quadra\n🕒 Horário: ${String(br.hour).padStart(2, "0")}:${String(br.minute).padStart(2, "0")}`
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        allowed: false,
        error: e?.message || "Erro interno ao validar sinal GPS."
      });
    }
  });

  app.post("/api/presence/geo-watch-status", async (req, res) => {
    try {
      const { playerId, action = "status", distanceMeters } = req.body || {};
      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const caller = await verifyCallerIdentity(req);
      const player = allPlayers.find(
        (p) =>
          (playerId && (p.id === playerId || p.uid === playerId)) ||
          (caller.email && String(p.email || "").trim().toLowerCase() === caller.email)
      );

      if (!player) {
        return res.status(404).json({ success: false, error: "Sócio não encontrado." });
      }

      const br = getBrazilTimeParts();
      const dateKey = br.dateKey;

      if (action === "register" && br.dayOfWeek === 4 && br.totalMinutes <= COURT_CHECKIN_END_MINUTES) {
        await upsertPendingCourtGeoWatcher(db, dateKey, player, {
          lastDistanceMeters: Number.isFinite(Number(distanceMeters)) ? Math.round(Number(distanceMeters)) : 0,
          source: "APP_AUTO_GEO_150M"
        });
      } else if (action === "opt_out") {
        await markCourtGeoWatcherOptedOut(db, dateKey, player.id);
      }

      const dateWatchers = getCourtWatchersStoreForDate(dateKey);
      const entry = dateWatchers[player.id];

      const currentInt = await ensureFreshIntentionsDocument(false);
      const responses = currentInt?.responses || {};
      const timestamps = currentInt?.confirmationTimestamps || {};
      const intentEntry = resolvePlayerIntentEntry(player, responses, timestamps);
      const isDeclinedToday = currentInt?.targetDate === dateKey && intentEntry.status === "NOT_GOING";

      return res.json({
        success: true,
        optedOut: Boolean(entry?.optedOut || isDeclinedToday),
        isDeclinedToday,
        arrived: Boolean(entry?.arrived)
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || "Erro ao consultar status de monitoramento GPS." });
    }
  });

  app.post("/api/presence/geo-journey-sim", async (req, res) => {
    try {
      const caller = await verifyCallerIdentity(req);
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const reqPlayerId = String(req.body?.playerId || "").trim();
      const callerPlayer = allPlayers.find(
        (p) =>
          (caller.email && String(p.email || "").trim().toLowerCase() === caller.email) ||
          (caller.uid && (p.uid === caller.uid || p.id === caller.uid)) ||
          (reqPlayerId && (p.id === reqPlayerId || p.uid === reqPlayerId))
      );
      const isAdminCaller =
        Boolean(caller.isAdmin) ||
        Boolean(callerPlayer?.isAdmin) ||
        String(callerPlayer?.email || "").trim().toLowerCase() === "rodneyes@gmail.com" ||
        String(req.body?.userEmail || "").trim().toLowerCase() === "rodneyes@gmail.com";

      if (!isAdminCaller) {
        return res.status(403).json({
          success: false,
          error: "Apenas administradores podem executar o simulador completo da jornada GPS + WhatsApp."
        });
      }

      const step = String(req.body?.step || "").trim();
      const dryRun = req.body?.dryRun !== false;
      const sendRealWhatsApp = req.body?.sendRealWhatsApp === true;

      const targetPlayer =
        allPlayers.find((p) => reqPlayerId && (p.id === reqPlayerId || p.uid === reqPlayerId)) ||
        callerPlayer ||
        allPlayers.find((p) => String(p.email || "").trim().toLowerCase() === "rodneyes@gmail.com");

      if (!targetPlayer) {
        return res.status(404).json({ success: false, error: "Sócio para simulação não encontrado." });
      }

      const firstName = String(targetPlayer.name || "Guerreiro").trim().split(/\s+/)[0] || "Guerreiro";
      const sysConfig = await getCachedSystemConfig(true);
      const courtLat = Number(sysConfig?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
      const courtLng = Number(sysConfig?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
      const maxRadius = Number(sysConfig?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS);
      const courtLocation = { lat: courtLat, lng: courtLng };

      const reqHost = String(req.headers.host || "").trim();
      const publicBaseUrl =
        reqHost && !reqHost.includes("localhost") && !reqHost.startsWith("127.")
          ? `https://${reqHost}`
          : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app";

      const br = getBrazilTimeParts();
      const dateKey = br.dateKey;
      const timeLabel = `${String(br.hour).padStart(2, "0")}:${String(br.minute).padStart(2, "0")}`;

      const enqueueSimWhatsApp = async (text: string, stepTag: string): Promise<{ queued: boolean; target: string | null; reason?: string }> => {
        if (!sendRealWhatsApp || !text) {
          return { queued: false, target: null };
        }
        const targets = resolvePlayerWhatsAppTargets(targetPlayer);
        if (targets.length === 0) {
          return { queued: false, target: null, reason: "Sócio sem telefone/JID de WhatsApp cadastrado." };
        }
        const outboxItem: OutboxWhatsAppMessage = {
          outboxId: `obx_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          to: targets[0],
          fallbackTargets: targets.slice(1),
          text,
          delayMs: 0,
          type: `ADMIN_GEO_SIM_${stepTag.toUpperCase()}`,
          recipientLabel: targetPlayer.name || firstName,
          queuedAt: Date.now(),
          attempts: 0
        };
        pendingWhatsAppOutbox.push(outboxItem);
        if (pendingWhatsAppOutbox.length > 100) {
          pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
        }
        saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
        await Promise.race([
          persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ]);
        recordWhatsAppCommLog({
          type: `ADMIN_GEO_SIM_${stepTag.toUpperCase()}`,
          recipient: targets[0],
          recipientLabel: targetPlayer.name || firstName,
          status: "QUEUED_RETRY",
          summary: `Simulação Admin (${stepTag}) enfileirada para entrega real no WhatsApp de ${firstName}`,
          messagePreview: text.slice(0, 180)
        });
        return { queued: true, target: targets[0] };
      };

      const checkInUrl = `${publicBaseUrl}/checkin?pid=${encodeURIComponent(targetPlayer.id || "")}&phone=${encodeURIComponent(targetPlayer.phone || "")}&name=${encodeURIComponent(firstName)}`;

      if (step === "invite") {
        const weather = await fetchCourtWeatherForecast(courtLat, courtLng);
        const botMessage =
          `📍🏐 *CHECK-IN AUTOMÁTICO NA QUADRA LIBERADO! (19h às 22h)* 🔥\n\n` +
          `Fala, ${firstName}! Já está valendo a fila de chegada automática para o vôlei de hoje (raio de *${maxRadius}m* da quadra, até às *22h00*).\n\n` +
          `${weather.whatsappBlock}\n\n` +
          `1️⃣ *Pelo WhatsApp (funciona com o celular no bolso):*\n` +
          `Toque em *📎 (Android)* ou *+ (iPhone)* → *Localização* → *Localização em tempo real* e selecione *1 HORA*!\n\n` +
          `2️⃣ *Ou toque direto no link 1-Clique ao chegar na quadra:*\n` +
          `👉 ${checkInUrl}\n\n` +
          `Assim que você entrar no raio de *${maxRadius}m*, eu confirmo sua presença na lista e te aviso sua posição na fila!\n\n` +
          `— Guerreirinho, o robô do clube 🤖`;

        const delivery = await enqueueSimWhatsApp(botMessage, "invite");
        return res.json({
          success: true,
          step: "invite",
          botMessage,
          checkInUrl,
          courtLocation,
          maxRadius,
          weather,
          whatsappDelivery: delivery,
          player: { id: targetPlayer.id, name: targetPlayer.name, phone: targetPlayer.phone || "" }
        });
      }

      if (step === "gv_cheguei") {
        const weather = await fetchCourtWeatherForecast(courtLat, courtLng);
        const botMessage =
          `📍🏐 *Bora fazer seu Check-in na Quadra, ${firstName}!*\n\n` +
          `🟢 *OPÇÃO 1 (Mais rápida — 1 Toque):*\n` +
          `Toque no link abaixo para o celular validar seu GPS automaticamente e já enviar sua posição na fila aqui no WhatsApp:\n` +
          `👉 ${checkInUrl}\n\n` +
          `📍 *OPÇÃO 2 (Pelo Mapa do WhatsApp — sem precisar digitar nada):*\n` +
          `🍎 *iPhone:* Toque em *+* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.\n` +
          `🤖 *Android:* Toque em *📎* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.\n\n` +
          `${weather.whatsappBlock}\n\n` +
          `— Guerreirinho, o robô do clube 🤖`;

        const delivery = await enqueueSimWhatsApp(botMessage, "gv_cheguei");
        return res.json({
          success: true,
          step: "gv_cheguei",
          userMessage: "gv cheguei",
          botMessage,
          checkInUrl,
          courtLocation,
          maxRadius,
          weather,
          whatsappDelivery: delivery,
          player: { id: targetPlayer.id, name: targetPlayer.name, phone: targetPlayer.phone || "" }
        });
      }

      if (step === "location_far" || step === "monitoring_ping") {
        const simLat = Number.isFinite(Number(req.body?.lat))
          ? Number(req.body.lat)
          : Number((courtLat + (step === "location_far" ? 0.0102 : 0.0042)).toFixed(6));
        const simLng = Number.isFinite(Number(req.body?.lng))
          ? Number(req.body.lng)
          : Number((courtLng + (step === "location_far" ? 0.0048 : 0.0021)).toFixed(6));
        const distanceMeters = calculateDistanceMeters(simLat, simLng, courtLat, courtLng);
        const metersToBorder = Math.max(0, distanceMeters - maxRadius);

        await upsertPendingCourtGeoWatcher(null, dateKey, targetPlayer, {
          lastDistanceMeters: distanceMeters,
          lastLat: simLat,
          lastLng: simLng,
          source: "WHATSAPP_LIVE"
        }).catch(() => {});

        if (step === "location_far") {
          const botMessage =
            `📍 *Localização em tempo real recebida, ${firstName}!*\n\n` +
            `📏 *Distância atual:* ~${distanceMeters} metros (raio oficial: *${maxRadius}m*).\n\n` +
            `✅ *Acompanhamento silencioso ativado:* não precisa mandar mais nada! Assim que você entrar na área da quadra (até às *22h00*), eu confirmo sua vaga automaticamente e te aviso aqui com sua posição na fila! 🏐🚗\n\n` +
            `— Guerreirinho, o robô do clube 🤖`;

          const delivery = await enqueueSimWhatsApp(botMessage, "location_far");
          return res.json({
            success: true,
            step: "location_far",
            allowed: false,
            silent: false,
            lat: simLat,
            lng: simLng,
            distanceMeters,
            metersToBorder,
            maxRadius,
            courtLocation,
            botMessage,
            whatsappDelivery: delivery,
            player: { id: targetPlayer.id, name: targetPlayer.name }
          });
        }

        // monitoring_ping: demonstra acompanhamento silencioso sem spam
        return res.json({
          success: true,
          step: "monitoring_ping",
          allowed: false,
          silent: true,
          lat: simLat,
          lng: simLng,
          distanceMeters,
          metersToBorder,
          maxRadius,
          courtLocation,
          botMessage: "",
          statusNote: `Sinal GPS atualizado em silêncio: ${firstName} está a ${distanceMeters}m da quadra (faltam ~${metersToBorder}m para cruzar a cerca de ${maxRadius}m). Zero spam no WhatsApp e zero leitura extra no banco.`,
          whatsappDelivery: { queued: false, target: null },
          player: { id: targetPlayer.id, name: targetPlayer.name }
        });
      }

      if (step === "arrived") {
        const simLat = Number.isFinite(Number(req.body?.lat))
          ? Number(req.body.lat)
          : Number((courtLat + 0.00018).toFixed(6));
        const simLng = Number.isFinite(Number(req.body?.lng))
          ? Number(req.body.lng)
          : Number((courtLng + 0.00014).toFixed(6));
        const distanceMeters = calculateDistanceMeters(simLat, simLng, courtLat, courtLng);
        const withinRange = distanceMeters <= maxRadius;

        if (!withinRange) {
          return res.json({
            success: true,
            step: "arrived",
            allowed: false,
            lat: simLat,
            lng: simLng,
            distanceMeters,
            maxRadius,
            courtLocation,
            dryRun,
            botMessage: `📍 Ponto ainda fora do raio configurado (${distanceMeters}m > ${maxRadius}m).`,
            whatsappDelivery: { queued: false, target: null },
            player: { id: targetPlayer.id, name: targetPlayer.name }
          });
        }

        const db = await getFirestore();
        const now = Date.now();
        let arrivalOrder = 1;
        let alreadyPresent = false;

        if (dryRun) {
          await withFirestoreGuard(async () => {
            const snap = await db.collection("attendance").doc(dateKey).collection("players").get();
            const currentPresent: any[] = [];
            snap.forEach((d: any) => {
              const dData = d.data();
              if (dData && dData.status !== "left" && !dData.isDM) {
                currentPresent.push({ id: d.id, ...dData });
              }
            });
            const existing = currentPresent.find((p) => p.id === targetPlayer.id);
            if (existing) {
              alreadyPresent = true;
              arrivalOrder = Number(existing.arrivalOrder || 1);
            } else {
              const maxOrder = currentPresent.reduce((max, p) => Math.max(max, Number(p.arrivalOrder || 0)), 0);
              arrivalOrder = maxOrder + 1;
            }
          }, undefined, 4500);
        } else {
          await withAttendanceCheckInLock(async () => {
            await withFirestoreGuard(async () => {
              const attColRef = db.collection("attendance").doc(dateKey).collection("players");
              const snap = await attColRef.get();
              const currentPresent: any[] = [];
              snap.forEach((d: any) => {
                const dData = d.data();
                if (dData && dData.status !== "left" && !dData.isDM) {
                  currentPresent.push({ id: d.id, ...dData });
                }
              });
              const existing = currentPresent.find((p) => p.id === targetPlayer.id);
              if (existing) {
                alreadyPresent = true;
                arrivalOrder = Number(existing.arrivalOrder || 1);
                return;
              }
              const maxOrder = currentPresent.reduce((max, p) => Math.max(max, Number(p.arrivalOrder || 0)), 0);
              arrivalOrder = maxOrder + 1;
              await db.collection("attendance").doc(dateKey).set({ date: dateKey, lastUpdate: now }, { merge: true });
              await attColRef.doc(targetPlayer.id).set(
                {
                  ...targetPlayer,
                  id: targetPlayer.id,
                  name: targetPlayer.name || "Sócio",
                  status: "active",
                  arrivalOrder,
                  isPresent: true,
                  checkInMethod: "QR",
                  checkInSource: "WHATSAPP_GPS",
                  distanceFromCourtMeters: distanceMeters,
                  timestamp: now
                },
                { merge: true }
              );
            }, undefined, 6000);
          });
          await Promise.all([
            syncPlayerPreConfirmationDoc(db, dateKey, targetPlayer, "GOING", now).catch(() => {}),
            markCourtGeoWatcherArrived(db, dateKey, targetPlayer.id).catch(() => {})
          ]);
        }

        const botMessage = alreadyPresent
          ? `✅🏐 *${firstName}, você já está na lista de presença da quadra hoje!*\n\n` +
            `📍 *Sua Ordem de Chegada:* *#${arrivalOrder}*\n` +
            `📏 *Distância da quadra:* ${distanceMeters}m\n\n` +
            `Bom jogo e bora pra cima! 🔥\n\n— Guerreirinho, o robô do clube 🤖`
          : `✅🏐 *CHECK-IN NA QUADRA CONFIRMADO, ${firstName.toUpperCase()}!* 🔥\n\n` +
            `📍 *Posição na Fila de Chegada:* *#${arrivalOrder}*\n` +
            `📏 *Localização validada:* a ${distanceMeters}m da quadra (raio: ${maxRadius}m)\n` +
            `🕒 *Horário de chegada:* ${timeLabel}\n\n` +
            `_Seu nome já entrou automaticamente na tela de Presença e Escalação de hoje! Você já pode parar o compartilhamento de localização. Bom aquecimento!_\n\n` +
            `— Guerreirinho, o robô do clube 🤖`;

        await markCourtGeoWatcherArrived(null, dateKey, targetPlayer.id, {
          lastLat: simLat,
          lastLng: simLng,
          lastDistanceMeters: distanceMeters,
          arrivalOrder,
          name: targetPlayer.name
        }).catch(() => {});

        const delivery = await enqueueSimWhatsApp(botMessage, "arrived");
        return res.json({
          success: true,
          step: "arrived",
          allowed: true,
          lat: simLat,
          lng: simLng,
          distanceMeters,
          maxRadius,
          courtLocation,
          arrivalOrder,
          alreadyPresent,
          dryRun,
          botMessage,
          whatsappDelivery: delivery,
          player: { id: targetPlayer.id, name: targetPlayer.name }
        });
      }

      return res.status(400).json({ success: false, error: `Etapa de simulação inválida: "${step}".` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || "Erro ao executar simulação de jornada." });
    }
  });

  app.get("/api/presence/geo-config", async (_req, res) => {
    try {
      const sys = await getCachedSystemConfig(true);
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        success: true,
        config: {
          autoGeoCheckInEnabled: sys?.autoGeoCheckInEnabled === true,
          courtLocation: {
            lat: Number(sys?.courtLocation?.lat ?? DEFAULT_COURT_LAT),
            lng: Number(sys?.courtLocation?.lng ?? DEFAULT_COURT_LNG)
          },
          geofenceRadius: Number(sys?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS)
        }
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || "Erro ao consultar configuração de geolocalização."
      });
    }
  });

  app.get("/api/presence/active-geo-watchers", async (_req, res) => {
    try {
      const br = getBrazilTimeParts();
      const dateKey = br.dateKey;
      const dateWatchers = getCourtWatchersStoreForDate(dateKey);
      const list = Object.values(dateWatchers)
        .filter((w) => w && !w.optedOut)
        .sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        success: true,
        dateKey,
        watchers: list
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || "Erro ao consultar sócios em deslocamento."
      });
    }
  });

  app.get("/api/presence/court-weather", async (req, res) => {
    try {
      const sys = await getCachedSystemConfig(false);
      const qLat = Number(req.query.lat ?? sys?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
      const qLng = Number(req.query.lng ?? sys?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
      const force = req.query.force === "1";
      const weather = await fetchCourtWeatherForecast(qLat, qLng, force);
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        success: true,
        weather
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || "Erro ao consultar previsão do tempo da quadra."
      });
    }
  });

  app.post("/api/presence/send-weather-broadcast", async (req, res) => {
    try {
      const caller = await verifyCallerIdentity(req);
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const reqPlayerId = String(req.body?.playerId || "").trim();
      const callerPlayer = allPlayers.find(
        (p) =>
          (caller.email && String(p.email || "").trim().toLowerCase() === caller.email) ||
          (caller.uid && (p.uid === caller.uid || p.id === caller.uid)) ||
          (reqPlayerId && (p.id === reqPlayerId || p.uid === reqPlayerId))
      );
      const isAdminCaller =
        Boolean(caller.isAdmin) ||
        Boolean(callerPlayer?.isAdmin) ||
        String(callerPlayer?.email || "").trim().toLowerCase() === "rodneyes@gmail.com" ||
        String(req.body?.userEmail || "").trim().toLowerCase() === "rodneyes@gmail.com";

      if (!isAdminCaller) {
        return res.status(403).json({
          success: false,
          error: "Apenas administradores podem disparar o boletim de clima e trânsito."
        });
      }

      const sys = await getCachedSystemConfig(false);
      const cLat = Number(sys?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
      const cLng = Number(sys?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
      const weather = await fetchCourtWeatherForecast(cLat, cLng, true);

      const targetScope = String(req.body?.targetScope || "private").trim(); // "private" | "group"
      const targetPlayer =
        allPlayers.find((p) => reqPlayerId && (p.id === reqPlayerId || p.uid === reqPlayerId)) ||
        callerPlayer ||
        allPlayers.find((p) => String(p.email || "").trim().toLowerCase() === "rodneyes@gmail.com");

      let destinationJid = "";
      let fallbackTargets: string[] = [];
      let recipientLabel = "Grupo Oficial Guerreiros";

      if (targetScope === "group") {
        if (!cachedScheduler) {
          cachedScheduler = loadLocalSchedulerBackup();
        }
        destinationJid = String(
          cachedScheduler?.groupId ||
            cachedScheduler?.targetGroupJid ||
            process.env.WHATSAPP_GROUP_ID ||
            "120363042862552509@g.us"
        ).trim();
      } else {
        if (!targetPlayer) {
          return res.status(404).json({ success: false, error: "Sócio destinatário não encontrado." });
        }
        const targets = resolvePlayerWhatsAppTargets(targetPlayer);
        if (targets.length === 0) {
          return res.status(400).json({
            success: false,
            error: "Sócio selecionado não possui telefone/WhatsApp cadastrado."
          });
        }
        destinationJid = targets[0];
        fallbackTargets = targets.slice(1);
        recipientLabel = targetPlayer.name || "Sócio";
      }

      const outboxItem: OutboxWhatsAppMessage = {
        outboxId: `obx_weather_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        to: destinationJid,
        fallbackTargets,
        text: weather.fullBroadcastMessage,
        delayMs: 0,
        type: "GAME_DAY_WEATHER_TRAFFIC_BULLETIN",
        recipientLabel,
        queuedAt: Date.now(),
        attempts: 0
      };
      pendingWhatsAppOutbox.push(outboxItem);
      if (pendingWhatsAppOutbox.length > 100) {
        pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
      }
      saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
      await Promise.race([
        persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 2000))
      ]);

      return res.json({
        success: true,
        queued: true,
        targetScope,
        recipientLabel,
        weather,
        message: weather.fullBroadcastMessage
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || "Erro ao enfileirar boletim de clima."
      });
    }
  });

  app.post("/api/presence/geo-config", async (req, res) => {
    try {
      const caller = await verifyCallerIdentity(req);
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const reqPlayerId = String(req.body?.playerId || "").trim();
      const callerPlayer = allPlayers.find(
        (p) =>
          (caller.email && String(p.email || "").trim().toLowerCase() === caller.email) ||
          (caller.uid && (p.uid === caller.uid || p.id === caller.uid)) ||
          (reqPlayerId && (p.id === reqPlayerId || p.uid === reqPlayerId))
      );
      const isAdminCaller =
        Boolean(caller.isAdmin) ||
        Boolean(callerPlayer?.isAdmin) ||
        String(callerPlayer?.email || "").trim().toLowerCase() === "rodneyes@gmail.com";

      if (!isAdminCaller) {
        return res.status(403).json({
          success: false,
          error: "Apenas administradores podem alterar a configuração de geolocalização da quadra."
        });
      }

      const { autoGeoCheckInEnabled, courtLocation, geofenceRadius } = req.body || {};
      const patch: Record<string, any> = {};

      if (typeof autoGeoCheckInEnabled === "boolean") {
        patch.autoGeoCheckInEnabled = autoGeoCheckInEnabled;
      }

      if (courtLocation !== undefined) {
        const lat = Number(courtLocation?.lat);
        const lng = Number(courtLocation?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return res.status(400).json({
            success: false,
            error: "Coordenadas inválidas. Informe latitude (-90 a 90) e longitude (-180 a 180)."
          });
        }
        patch.courtLocation = {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6))
        };
      }

      if (geofenceRadius !== undefined) {
        const radiusNum = Math.round(Number(geofenceRadius));
        if (!Number.isFinite(radiusNum) || radiusNum < 20 || radiusNum > 2000) {
          return res.status(400).json({
            success: false,
            error: "Raio inválido. Use um valor entre 20m e 2000m."
          });
        }
        patch.geofenceRadius = radiusNum;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ success: false, error: "Nenhum parâmetro de configuração enviado." });
      }

      const db = await getFirestore();
      await withFirestoreGuard(
        () => db.collection("metadata").doc("system").set(patch, { merge: true }),
        undefined
      );

      // Atualiza imediatamente o cache em memória do servidor para testes instantâneos sem esperar TTL
      const currentSys = await getCachedSystemConfig(false);
      cachedSystemConfig = {
        ...(currentSys || {}),
        ...patch
      };
      cachedSystemConfigLastFetch = Date.now();

      return res.json({
        success: true,
        config: {
          autoGeoCheckInEnabled: cachedSystemConfig.autoGeoCheckInEnabled === true,
          courtLocation: cachedSystemConfig.courtLocation || { lat: DEFAULT_COURT_LAT, lng: DEFAULT_COURT_LNG },
          geofenceRadius: Number(cachedSystemConfig.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS)
        }
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || "Erro ao salvar configuração de geolocalização."
      });
    }
  });

  app.get("/api/presence/state", async (req, res) => {
    try {
      const includeFull = req.query.includeFull === "1" || req.query.includeFull === "true";
      const data = await ensureFreshIntentionsDocument();

      // ETag leve baseado em lastUpdated: retorna 304 (0 bytes) quando não houve alteração na lista
      if (!includeFull) {
        const etag = `W/"int-${data?.targetDate || "none"}-${Number(data?.lastUpdated || 0)}-${Array.isArray(data?.goingIds) ? data.goingIds.length : 0}-${Array.isArray(data?.notGoingIds) ? data.notGoingIds.length : 0}"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, max-age=15, must-revalidate");
        if (req.headers["if-none-match"] === etag) {
          return res.status(304).end();
        }
        return res.json({ success: true, data });
      }

      // Modo de recuperação completa (chamado apenas quando a store local do navegador está vazia)
      res.setHeader("Cache-Control", "private, max-age=30");
      const [players, matches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length < 10),
        getCachedMatches(cachedMatches.length === 0)
      ]);
      const hasValidCompletePlayers =
        Array.isArray(players) &&
        players.length >= 15 &&
        players.some((p) => Boolean(p?.birthDate)) &&
        players.some((p) => Number(p?.matchesPlayed || 0) > 0);

      res.json({
        success: true,
        data,
        ...(hasValidCompletePlayers ? { players } : {}),
        ...(Array.isArray(matches) && matches.length >= 5 ? { matches } : {})
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/presence/set", async (req, res) => {
    try {
      let { playerId, status } = req.body;
      if (typeof playerId === "string") {
        playerId = playerId.trim();
      }

      if (!playerId || !["GOING", "NOT_GOING", "RESET"].includes(status)) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }

      const caller = await verifyCallerIdentity(req);
      const db = await getFirestore();
      const isGuest = playerId.startsWith("guest_");
      let player: any = null;

      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      if (!isGuest) {
        const normReq = playerId.toLowerCase();
        player = allPlayers.find(
          (p) =>
            p.id.toLowerCase() === normReq ||
            (p.name && p.name.trim().toLowerCase() === normReq) ||
            (p.uid && p.uid === playerId) ||
            (caller.email && (p.email || "").trim().toLowerCase() === caller.email)
        );
        if (!player) {
          player = { id: playerId, name: req.body?.playerName || "Sócio", status: "active" };
        } else {
          playerId = player.id;
        }
      } else {
        player = { id: playerId, name: playerId.replace("guest_", "Convidado "), status: "guest" };
      }

      const currentInt = await ensureFreshIntentionsDocument(true);
      const targetDate = currentInt.targetDate || getNextThursday();
      const responses: Record<string, string> = { ...(currentInt.responses || {}) };
      const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

      const aliasSet = new Set<string>([playerId, ...getPlayerIntentAliases(player, Object.keys(responses))]);

      const now = Date.now();
      const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
      let effectiveTs = now;

      if (status === "RESET") {
        aliasSet.forEach((alias) => {
          delete responses[alias];
          delete timestamps[alias];
        });
      } else {
        const existingEntry = resolvePlayerIntentEntry(player, responses, timestamps, cutoffTs);
        const alreadyConfirmedInCycle = existingEntry.status === "GOING" && existingEntry.ts >= cutoffTs;
        effectiveTs = status === "GOING" && alreadyConfirmedInCycle ? existingEntry.ts : now;

        // Limpa aliases obsoletos e grava de forma limpa nos identificadores canônicos
        aliasSet.forEach((alias) => {
          delete responses[alias];
          delete timestamps[alias];
        });
        responses[playerId] = status;
        timestamps[playerId] = effectiveTs;
        if (player?.uid) {
          responses[player.uid] = status;
          timestamps[player.uid] = effectiveTs;
        }
        if (player?.email) {
          const em = player.email.trim().toLowerCase();
          responses[em] = status;
          timestamps[em] = effectiveTs;
        }
      }

      const updatedDoc = {
        targetDate,
        automationEnabled: currentInt.automationEnabled ?? true,
        responses,
        confirmationTimestamps: timestamps,
        remindersSent: currentInt.remindersSent || {},
        lastUpdated: now
      };

      cachedIntentions = updatedDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(updatedDoc);

      await withFirestoreGuard(
        () => db.collection("metadata").doc("intentions").set(updatedDoc),
        undefined
      );
      await syncPlayerPreConfirmationDoc(db, targetDate, player, status, effectiveTs);

      // Envia confirmação automática no WhatsApp privado e atualiza a lista no grupo APENAS quando o sócio CONFIRMAR presença (GOING)
      if (status === "GOING") {
        const playerTargets = resolvePlayerWhatsAppTargets(player);
        if (playerTargets.length > 0) {
          const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
          const activeGoing = allPlayers
            .filter(
              (p) =>
                p.status === "active" &&
                !p.isDM &&
                resolvePlayerIntentEntry(p, responses, timestamps, cutoffTs).status === "GOING"
            )
            .sort(
              (a, b) =>
                resolvePlayerIntentEntry(a, responses, timestamps, cutoffTs).ts -
                resolvePlayerIntentEntry(b, responses, timestamps, cutoffTs).ts
            );
          const totalActiveClub = allPlayers.filter((p) => p.status === "active" && !p.isDM).length;
          const pos = Math.max(1, activeGoing.findIndex((p) => p.id === player.id) + 1);

          const waText = `🏐🔥 *Presença Confirmada pelo App, ${player.name.split(" ")[0]}!*\n\nSua vaga para Quinta (${formattedDate}) está garantida!\n📍 Posição na lista: *#${pos}* de *${activeGoing.length}/${totalActiveClub}* confirmados.\n\n— Guerreirinho, o robô do clube 🤖`;

          dispatchWhatsAppMessage(playerTargets[0], waText, {
            type: "PRESENCE_CONFIRM_PRIVATE",
            recipientLabel: player.name,
            fallbackTargets: playerTargets.slice(1)
          }).catch(() => {});
        }

        // Dispara atualização da lista no grupo do WhatsApp somente em confirmação de presença
        scheduleGroupAttendanceBroadcast(5 * 1000);
      }

      res.json({ success: true, data: updatedDoc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presence/clear", async (req, res) => {
    try {
      const caller = await verifyCallerIdentity(req);
      if (!caller.isAdmin && req.body?.isAdmin !== true) {
        return res.status(403).json({ error: "Apenas administradores podem zerar a lista." });
      }

      const db = await getFirestore();
      const nextThu = getNextThursday();
      const clearedDoc = {
        targetDate: nextThu,
        automationEnabled: true,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {},
        lastUpdated: Date.now()
      };

      cachedIntentions = clearedDoc;
      cachedIntentionsLastFetch = Date.now();
      saveLocalIntentionsBackup(clearedDoc);

      await withFirestoreGuard(
        () => db.collection("metadata").doc("intentions").set(clearedDoc),
        undefined
      );

      res.json({ success: true, data: clearedDoc });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // 📲 ROTAS DE NOTIFICAÇÃO WHATSAPP (Substituem 100% os antigos Pushes do App)
  // ============================================================================

const EXCLUDED_WHATSAPP_CONTACTS_NAMES = new Set([
  "juliana crispim"
]);
const EXCLUDED_WHATSAPP_CONTACTS_LAST8 = new Set([
  "91518011"
]);

function isExcludedPersonalWhatsAppContact(player: any): boolean {
  if (!player) return true;
  const normName = String(player.name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normName && EXCLUDED_WHATSAPP_CONTACTS_NAMES.has(normName)) {
    return true;
  }
  const digits = String(player.phone || "").replace(/\D/g, "");
  if (digits.length >= 8 && EXCLUDED_WHATSAPP_CONTACTS_LAST8.has(digits.slice(-8))) {
    return true;
  }
  return false;
}

function isEligibleClubMemberForPrivateAutomations(player: any): boolean {
  if (!player) return false;
  if (player.status !== "active" || player.isDM) return false;
  if (isExcludedPersonalWhatsAppContact(player)) return false;
  return true;
}

    // 1. Disparo de Lembretes para Sócios Indecisos via WhatsApp Privado (Substitui sendReminders FCM)
  app.post("/api/whatsapp/remind-undecided", async (req, res) => {
    try {
      const { customMessage, period } = req.body || {};
      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const currentInt = await ensureFreshIntentionsDocument(true);
      const targetDate = currentInt.targetDate || getNextThursday();
      const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
      const responses = currentInt.responses || {};
      const updatedRemindersSent: Record<string, boolean> = { ...(currentInt.remindersSent || {}) };

      const undecided = allPlayers.filter((p) => {
        if (!isEligibleClubMemberForPrivateAutomations(p)) return false;
        const resp =
          responses[p.id] ||
          (p.uid ? responses[p.uid] : null) ||
          (p.email ? responses[p.email.trim().toLowerCase()] : null);
        return !resp;
      });

      const batchMessages: Array<{ to: string; text: string; delayMs?: number }> = [];

      undecided.forEach((p, idx) => {
        updatedRemindersSent[p.id] = true;
        const jid = normalizePhoneToJid(p.phone);
        if (!jid) return;
        const firstName = String(p.name || "Guerreiro").split(" ")[0];

        const msgText =
          customMessage ||
          (period === "afternoon"
            ? `Fala, *${firstName}*! ⏰🏐\nÚltima chamada para a *Lista de Quinta (${formattedDate})* dos Guerreiros!\n\nVocê ainda não confirmou presença. Vai jogar hoje?\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`
            : `Fala, *${firstName}*! 🏐🔥\nAinda não vimos sua confirmação na *Lista de Quinta (${formattedDate})* dos Guerreiros!\n\nToque em uma das opções abaixo para registrar sua resposta:\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`);

        batchMessages.push({
          to: jid,
          delayMs: idx * 3500,
          text: msgText
        });
      });

      if (undecided.length > 0) {
        const updatedDoc = {
          ...currentInt,
          remindersSent: updatedRemindersSent,
          lastUpdated: Date.now()
        };
        cachedIntentions = updatedDoc;
        cachedIntentionsLastFetch = Date.now();
        saveLocalIntentionsBackup(updatedDoc);
        await withFirestoreGuard(
          () => db.collection("metadata").doc("intentions").set({ remindersSent: updatedRemindersSent }, { merge: true }),
          undefined
        );
      }

      dispatchWhatsAppBatchAsync(batchMessages);
      res.json({ success: true, count: batchMessages.length, totalUndecided: undecided.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/whatsapp/logs", (_req, res) => {
    res.json({
      success: true,
      logs: whatsappCommLogs.slice(0, 50),
      outboxPendingCount: pendingWhatsAppOutbox.length,
      outboxItems: pendingWhatsAppOutbox.slice(-20).map((m) => ({
        outboxId: m.outboxId,
        to: m.to,
        recipientLabel: m.recipientLabel,
        type: m.type,
        queuedAt: m.queuedAt,
        attempts: m.attempts,
        lastError: m.lastError
      })),
      lastDispatchError: lastWhatsAppDispatchError
    });
  });

  app.post("/api/whatsapp/broadcast-intentions", async (req, res) => {
    try {
      const { text, goingCount } = req.body || {};
      const cfg = getWhatsAppConfig();
      const messageText = String(text || "").trim();
      if (!messageText) {
        return res.status(400).json({ success: false, error: "Mensagem da lista vazia." });
      }
      if (!cfg.groupJid) {
        return res.status(400).json({ success: false, error: "Grupo WhatsApp não configurado." });
      }
      dispatchWhatsAppBatchAsync([
        {
          to: cfg.groupJid,
          text: messageText,
          delayMs: 0,
          type: "INTENTIONS_LIST",
          recipientLabel: `Grupo Guerreiros (${Number(goingCount || 0)} confirmados)`
        }
      ]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Disparo de Escalação / "Sua Vez de Jogar!" via WhatsApp (Substitui usePlayerStatusNotification Push)
  app.post("/api/whatsapp/notify-lineup", async (req, res) => {
    try {
      const { matchNumber, teamA = [], teamB = [], sendToGroup = true, sendToPlayers = false } = req.body || {};
      const cfg = getWhatsAppConfig();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const playerMap = new Map<string, any>();
      allPlayers.forEach((p) => playerMap.set(p.id, p));

      const namesA = (Array.isArray(teamA) ? teamA : [])
        .map((item: any) => (typeof item === "string" ? playerMap.get(item)?.name || item : item?.name))
        .filter(Boolean);
      const namesB = (Array.isArray(teamB) ? teamB : [])
        .map((item: any) => (typeof item === "string" ? playerMap.get(item)?.name || item : item?.name))
        .filter(Boolean);

      if (namesA.length === 0 && namesB.length === 0) {
        return res.json({ success: true, sent: 0 });
      }

      const numLabel = matchNumber || 1;
      const groupText =
        `🏐🔥 *PARTIDA #${String(numLabel).padStart(2, "0")} EM QUADRA!* ⚡\n\n` +
        `🟢 *EQUIPE A:* ${namesA.join(", ")}\n` +
        `🔵 *EQUIPE B:* ${namesB.join(", ")}\n\n` +
        `_Dirijam-se à quadra e bom jogo, Guerreiros!_\n\n— Guerreirinho, o robô do clube 🤖`;

      const batch: Array<{
        to: string;
        text: string;
        delayMs?: number;
        type?: string;
        recipientLabel?: string;
        fallbackTargets?: string[];
      }> = [];
      if (sendToGroup) {
        batch.push({
          to: cfg.groupJid,
          text: groupText,
          delayMs: 0,
          type: "LINEUP_GROUP",
          recipientLabel: "Grupo Guerreiros VC"
        });
      }

      if (sendToPlayers) {
        const notifyTeam = (list: any[], teamLabel: string, teammateNames: string[]) => {
          list.forEach((item, i) => {
            const pid = typeof item === "string" ? item : item?.id;
            const p = playerMap.get(pid) || item;
            const targets = resolvePlayerWhatsAppTargets(p);
            if (targets.length === 0) return;
            batch.push({
              to: targets[0],
              fallbackTargets: targets.slice(1),
              recipientLabel: p.name,
              type: "LINEUP_PRIVATE",
              delayMs: (i + 1) * 1500,
              text:
                `🏐 *Partida #${numLabel} — Sua vez de jogar, ${String(p.name || "Guerreiro").split(" ")[0]}!*\n\n` +
                `📍 Você está escalado(a) na *${teamLabel}* com: ${teammateNames.join(", ")}.\n` +
                `Dirija-se à quadra! 🔥`
            });
          });
        };
        notifyTeam(teamA, "Equipe A", namesA);
        notifyTeam(teamB, "Equipe B", namesB);
      }

      dispatchWhatsAppBatchAsync(batch);
      res.json({ success: true, sent: batch.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Disparo de Mensagem de Boas-Vindas / Cadastro para Sócio no WhatsApp Privado
  app.post("/api/whatsapp/send-welcome", async (req, res) => {
    try {
      const { playerId, playerName, phone, gender } = req.body || {};
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      const found = playerId ? allPlayers.find((p) => p.id === playerId) : null;

      const nameToUse = String(found?.name || playerName || "Guerreiro(a)").trim();
      const firstName = nameToUse.split(" ")[0];
      const phoneToUse = String(found?.phone || phone || "").trim();
      const genderToUse = found?.gender || gender || "FEMALE";
      const targets = resolvePlayerWhatsAppTargets(found || { phone: phoneToUse });
      const jid = targets[0] || normalizePhoneToJid(phoneToUse);

      const br = getBrazilTimeParts();
      const greeting =
        br.hour < 12 ? "bom dia" : br.hour < 18 ? "boa tarde" : "boa noite";
      const cadastradaWord = genderToUse === "MALE" ? "Cadastrado!" : "Cadastrada!";

      const welcomeText =
        `Olá, ${firstName}, ${greeting}!\n\n` +
        `${cadastradaWord} ${firstName}, acesse o app, procure a lista no menu principal e depois procure o botão "vou jogar" ou "não vou". Qualquer dúvida, sugestão ou crítica, pode falar...\n\n` +
        `https://guerreiros-volleyball-club-238897290870.us-west1.run.app?tab=intentions\n\n` +
        `🤖 *Ou confirme em 1 clique direto comigo no WhatsApp:*\n` +
        `🟢 *Vou Jogar:* https://wa.me/558197330924?text=gv%20vou\n` +
        `🔴 *Não Vou:* https://wa.me/558197330924?text=gv%20naovou\n\n` +
        `— Guerreirinho, o robô do clube 🤖`;

      let sentByBot = false;
      if (jid) {
        sentByBot = await dispatchWhatsAppMessage(jid, welcomeText, {
          type: "WELCOME_PRIVATE",
          recipientLabel: nameToUse,
          fallbackTargets: targets.slice(1)
        });
      }

      res.json({
        success: true,
        sentByBot,
        text: welcomeText,
        phone: phoneToUse.replace(/\D/g, "")
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Sincronização de Cache Autenticado do Navegador para o Servidor (Garante que o Robô sempre tenha todos os Sócios, Partidas e Lista)
  app.post("/api/cache/sync", async (req, res) => {
    try {
      const { players: clientPlayers, matches: clientMatches, intentions: clientIntentions, systemMetadata: clientSys } = req.body || {};
      if (Array.isArray(clientPlayers) && clientPlayers.length >= 10) {
        normalizePlayersPhonesInPlace(clientPlayers);
        cachedPlayers = clientPlayers;
        cachedPlayersLastFetch = Date.now();
        saveLocalPlayersBackup(clientPlayers);
      }
      if (Array.isArray(clientMatches) && clientMatches.length > 0) {
        cachedMatches = clientMatches;
        cachedMatchesLastFetch = Date.now();
        saveLocalMatchesBackup(clientMatches);
      }
      if (clientIntentions && clientIntentions.responses && Object.keys(clientIntentions.responses).length > 0) {
        const nextThuSync = clientIntentions.targetDate || cachedIntentions?.targetDate || getNextThursday();
        const cutoffTsSync = getCycleFridayCutoffTimestamp(nextThuSync);
        const clientUpdated = Number(clientIntentions.lastUpdated || 0);
        const serverUpdated = Number(cachedIntentions?.lastUpdated || 0);
        const serverHasData =
          cachedIntentions &&
          cachedIntentions.targetDate === nextThuSync &&
          Object.keys(cachedIntentions.responses || {}).length > 0;

        // Só aceita cache do cliente se o servidor estiver vazio ou se o payload do cliente for estritamente mais novo
        if (!serverHasData || clientUpdated > serverUpdated) {
          const prevResponses =
            cachedIntentions && cachedIntentions.targetDate === nextThuSync
              ? { ...(cachedIntentions.responses || {}) }
              : {};
          const prevTimestamps =
            cachedIntentions && cachedIntentions.targetDate === nextThuSync
              ? { ...(cachedIntentions.confirmationTimestamps || {}) }
              : {};
          const mergedResp: Record<string, string> = { ...prevResponses };
          const mergedTs: Record<string, number> = { ...prevTimestamps };
          Object.entries(clientIntentions.responses).forEach(([k, val]) => {
            if (val === "GOING" || val === "NOT_GOING") {
              const cTs = Number((clientIntentions.confirmationTimestamps || {})[k] || 0);
              if (cTs < cutoffTsSync) return;
              const pTs = Number(mergedTs[k] || 0);
              if (!mergedResp[k]) {
                mergedResp[k] = val as string;
                mergedTs[k] = cTs;
              } else if (mergedResp[k] === val && val === "GOING") {
                mergedTs[k] = pTs > 0 ? Math.min(cTs, pTs) : cTs;
              } else if (cTs > pTs) {
                mergedResp[k] = val as string;
                mergedTs[k] = cTs;
              }
            }
          });
          cachedIntentions = {
            targetDate: nextThuSync,
            automationEnabled: clientIntentions.automationEnabled ?? cachedIntentions?.automationEnabled ?? true,
            responses: mergedResp,
            confirmationTimestamps: mergedTs,
            remindersSent: {
              ...(cachedIntentions?.remindersSent || {}),
              ...(clientIntentions.remindersSent || {})
            },
            lastUpdated: Math.max(serverUpdated, clientUpdated)
          };
          cachedIntentionsLastFetch = Date.now();
          saveLocalIntentionsBackup(cachedIntentions);
        }
      }
      if (clientSys && typeof clientSys === "object") {
        // Preserva as configurações autoritativas de GPS/quadra já presentes no servidor para evitar sobrescrita por cache antigo do navegador
        const prevGeoFields: Record<string, any> = {};
        if (cachedSystemConfig) {
          if (cachedSystemConfig.courtLocation) prevGeoFields.courtLocation = cachedSystemConfig.courtLocation;
          if (typeof cachedSystemConfig.geofenceRadius === "number") {
            prevGeoFields.geofenceRadius = cachedSystemConfig.geofenceRadius;
          }
          if (typeof cachedSystemConfig.autoGeoCheckInEnabled === "boolean") {
            prevGeoFields.autoGeoCheckInEnabled = cachedSystemConfig.autoGeoCheckInEnabled;
          }
        }
        cachedSystemConfig = {
          ...(cachedSystemConfig || {}),
          ...clientSys,
          ...prevGeoFields
        };
        cachedSystemConfigLastFetch = Date.now();
      }
      res.json({
        success: true,
        playersCount: cachedPlayers.length,
        matchesCount: cachedMatches.length,
        confirmedCount: Object.values(cachedIntentions?.responses || {}).filter((v) => v === "GOING").length
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message });
    }
  });

  app.post("/api/intentions/stabilize", async (req, res) => {
    try {
      const db = await getFirestore();
      const [allPlayers, currentInt] = await Promise.all([
        getCachedPlayers(true),
        ensureFreshIntentionsDocument(true)
      ]);
      const targetDate = req.body?.targetDate || currentInt.targetDate || getNextThursday();
      const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
      const now = Date.now();

      const rawResponses: Record<string, string> = { ...(currentInt.responses || {}) };
      const rawTimestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

      // Também carrega preConfirmations/{targetDate}/players para espelhamento completo e limpeza de órfãos
      const preConfSnap = await withFirestoreGuard(
        () => db.collection("preConfirmations").doc(targetDate).collection("players").get(),
        null
      );
      const existingPreConfIds = new Set<string>();
      if (preConfSnap && typeof preConfSnap.forEach === "function") {
        preConfSnap.forEach((d: any) => {
          existingPreConfIds.add(d.id);
          const pData = d.data();
          const pcTs = Number(pData?.timestamp || 0);
          if (d.id && !rawResponses[d.id] && pcTs >= cutoffTs) {
            rawResponses[d.id] = "GOING";
            rawTimestamps[d.id] = pcTs;
          }
        });
      }

      const activePlayers = (allPlayers || []).filter((p) => p && p.status === "active" && !p.isDM);

      const normalizedResponses: Record<string, string> = {};
      const normalizedTimestamps: Record<string, number> = {};
      const goingPlayerIds = new Set<string>();

      activePlayers.forEach((p) => {
        const entry = resolvePlayerIntentEntry(p, rawResponses, rawTimestamps, cutoffTs);
        if (entry.status === "GOING" || entry.status === "NOT_GOING") {
          const effectiveTs = entry.ts >= cutoffTs ? entry.ts : now;
          normalizedResponses[p.id] = entry.status;
          normalizedTimestamps[p.id] = effectiveTs;
          if (p.uid) {
            normalizedResponses[p.uid] = entry.status;
            normalizedTimestamps[p.uid] = effectiveTs;
          }
          if (p.email) {
            const em = p.email.trim().toLowerCase();
            normalizedResponses[em] = entry.status;
            normalizedTimestamps[em] = effectiveTs;
          }
          if (entry.status === "GOING") {
            goingPlayerIds.add(p.id);
          }
        }
      });

      // Preserva convidados válidos (guest_*)
      Object.entries(rawResponses).forEach(([k, val]) => {
        if (k.startsWith("guest_") && (val === "GOING" || val === "NOT_GOING")) {
          const ts = Number(rawTimestamps[k] || 0);
          if (ts >= cutoffTs) {
            normalizedResponses[k] = val;
            normalizedTimestamps[k] = ts;
            if (val === "GOING") goingPlayerIds.add(k);
          }
        }
      });

      const stabilizedDoc = {
        targetDate,
        automationEnabled: currentInt.automationEnabled ?? true,
        responses: normalizedResponses,
        confirmationTimestamps: normalizedTimestamps,
        remindersSent: currentInt.remindersSent || {},
        lastUpdated: now
      };

      cachedIntentions = stabilizedDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(stabilizedDoc);

      // Escrita limpa (sem merge: true) para expurgar aliases órfãos, chaves literais com ponto e sócios inativos/DM
      await withFirestoreGuard(
        () => db.collection("metadata").doc("intentions").set(stabilizedDoc),
        undefined
      );

      for (const p of activePlayers) {
        if (goingPlayerIds.has(p.id)) {
          await syncPlayerPreConfirmationDoc(db, targetDate, p, "GOING", normalizedTimestamps[p.id] || now);
        } else if (existingPreConfIds.has(p.id)) {
          await syncPlayerPreConfirmationDoc(db, targetDate, p, "NOT_GOING", now);
        }
      }

      // Remove preConfirmations órfãos de jogadores inativos/DM/removidos
      for (const preId of existingPreConfIds) {
        if (!goingPlayerIds.has(preId)) {
          await withFirestoreGuard(
            () => db.collection("preConfirmations").doc(targetDate).collection("players").doc(preId).delete(),
            undefined
          );
        }
      }

      const confirmedCount = goingPlayerIds.size;
      res.json({
        success: true,
        targetDate,
        confirmedCount,
        totalActive: activePlayers.length,
        purgedOrphanKeys: Math.max(0, Object.keys(rawResponses).length - Object.keys(normalizedResponses).length),
        data: stabilizedDoc
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message });
    }
  });

  // 5B. Módulo de Integração: Diretório de Fotos Associadas Diretamente ao Telefone do WhatsApp
  app.get("/api/whatsapp/bot-status", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const sys = await getCachedSystemConfig(false);
      const enabled =
        typeof memoryBotActiveOverride === "boolean"
          ? memoryBotActiveOverride
          : typeof sys?.whatsappBotEnabled === "boolean"
          ? Boolean(sys.whatsappBotEnabled)
          : isWhatsAppBotEnabled();
      res.json({ success: true, enabled, botActive: enabled });
    } catch (e: any) {
      res.json({ success: true, enabled: isWhatsAppBotEnabled(), botActive: isWhatsAppBotEnabled() });
    }
  });

  app.post("/api/whatsapp/bot-status", async (req, res) => {
    try {
      const enabled = Boolean(req.body?.enabled ?? req.body?.botActive);
      setWhatsAppBotEnabledState(enabled);
      const db = await getFirestore();
      await withFirestoreGuard(
        () =>
          db
            .collection("metadata")
            .doc("system")
            .set({ whatsappBotEnabled: enabled, updatedAt: Date.now() }, { merge: true }),
        undefined
      );
      res.json({ success: true, enabled, botActive: enabled });
    } catch (e: any) {
      res.status(200).json({ success: true, enabled: isWhatsAppBotEnabled(), botActive: isWhatsAppBotEnabled() });
    }
  });

  // 🎨 Configuração Admin: Cards HD no WhatsApp (Desabilitado por padrão — sem links e sem Evolution API)
  app.get("/api/whatsapp/card-delivery-config", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const sys = await getCachedSystemConfig(false);
      if (!memoryCardDeliveryModeOverride && sys?.whatsappCardDeliveryMode) {
        memoryCardDeliveryModeOverride = normalizeCardDeliveryMode(sys.whatsappCardDeliveryMode);
      }
      const cfg = getWhatsAppConfig();
      res.json({
        success: true,
        mode: cfg.cardDeliveryMode,
        enabled: cfg.cardDeliveryMode === "vm_image_only"
      });
    } catch {
      const cfg = getWhatsAppConfig();
      res.json({
        success: true,
        mode: cfg.cardDeliveryMode,
        enabled: cfg.cardDeliveryMode === "vm_image_only"
      });
    }
  });

  app.post("/api/whatsapp/card-delivery-config", async (req, res) => {
    try {
      const rawMode = req.body?.mode;
      if (rawMode !== "disabled" && rawMode !== "vm_image_only") {
        return res.status(400).json({
          success: false,
          error: "Modo inválido. Utilize 'disabled' (sem Card HD no WhatsApp) ou 'vm_image_only' (envio nativo via VM Google)."
        });
      }

      setWhatsAppCardDeliveryModeState(rawMode);

      const db = await getFirestore();
      await withFirestoreGuard(
        () =>
          db
            .collection("metadata")
            .doc("system")
            .set(
              {
                whatsappCardDeliveryMode: rawMode,
                updatedAt: Date.now()
              },
              { merge: true }
            ),
        undefined
      );

      const cfg = getWhatsAppConfig();
      res.json({
        success: true,
        mode: cfg.cardDeliveryMode,
        enabled: cfg.cardDeliveryMode === "vm_image_only"
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || "Erro ao salvar configuração." });
    }
  });

  app.get("/api/whatsapp/photo-directory", async (req, res) => {
    try {
      const dir = { ...loadLocalWhatsAppPhotoDir() };
      const allPlayers = await getCachedPlayers(false);
      let latestUpdatedAt = 0;
      allPlayers.forEach((p: any) => {
        const photo = !isMissingOrDefaultAvatar(p.photoUrl)
          ? p.photoUrl
          : !isMissingOrDefaultAvatar(p.whatsappPhotoUrl)
          ? p.whatsappPhotoUrl
          : null;
        if (photo && p.phone) {
          const keys = getPhoneIndexKeys(p.phone);
          const primaryKey = keys[0];
          const updatedAt = Number(p.photoUpdatedAt || 0);
          if (updatedAt > latestUpdatedAt) latestUpdatedAt = updatedAt;
          if (primaryKey && !dir[primaryKey]) {
            dir[primaryKey] = {
              phone: primaryKey,
              normalizedPhone: primaryKey,
              whatsappJid: `${primaryKey}@s.whatsapp.net`,
              photoUrl: photo,
              playerId: p.id,
              playerName: p.name,
              source: "whatsapp_sync",
              updatedAt: updatedAt || Date.now()
            };
          }
        }
      });
      const etag = `W/"pdir-${Object.keys(dir).length}-${latestUpdatedAt}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=300, must-revalidate");
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }
      res.json({ success: true, directory: dir });
    } catch (err: any) {
      res.status(200).json({ success: false, directory: loadLocalWhatsAppPhotoDir(), error: err.message });
    }
  });

  app.post("/api/admin/optimize-photos", async (_req, res) => {
    try {
      const db = await getFirestore();
      const playersSnap = await db.collection("players").get();
      let totalBeforeBytes = 0;
      let totalAfterBytes = 0;
      let duplicatesRemoved = 0;
      let photosCompressed = 0;
      let docsUpdated = 0;
      const freshPlayers: any[] = [];

      const docsList: any[] = [];
      playersSnap.forEach((d: any) => docsList.push(d));

      for (const d of docsList) {
        const data = d.data() || {};
        const rawPhotoUrl = typeof data.photoUrl === "string" ? data.photoUrl : "";
        const rawWaPhotoUrl = typeof data.whatsappPhotoUrl === "string" ? data.whatsappPhotoUrl : "";
        const hasDuplicate = "whatsappPhotoUrl" in data;

        totalBeforeBytes += Buffer.byteLength(rawPhotoUrl, "utf8") + Buffer.byteLength(rawWaPhotoUrl, "utf8");

        const effectiveSource = rawPhotoUrl.startsWith("data:image/")
          ? rawPhotoUrl
          : rawWaPhotoUrl.startsWith("data:image/")
          ? rawWaPhotoUrl
          : rawPhotoUrl || rawWaPhotoUrl;

        let optimizedPhoto = effectiveSource;
        let wasCompressed = false;
        if (effectiveSource && effectiveSource.startsWith("data:image/")) {
          const compressed = await compressPhotoTo10KBDataUri(effectiveSource);
          if (compressed && compressed.length < effectiveSource.length) {
            optimizedPhoto = compressed;
            wasCompressed = true;
            photosCompressed++;
          }
        }

        totalAfterBytes += Buffer.byteLength(optimizedPhoto || "", "utf8");
        if (hasDuplicate) duplicatesRemoved++;

        if (hasDuplicate || wasCompressed || (optimizedPhoto && optimizedPhoto !== rawPhotoUrl)) {
          const payload: Record<string, any> = {
            whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__"
          };
          if (optimizedPhoto) payload.photoUrl = optimizedPhoto;
          await db.collection("players").doc(d.id).set(payload, { merge: true });
          docsUpdated++;
        }

        const cleanPlayer = sanitizePlayerPhotoFields({
          id: d.id,
          ...data,
          ...(optimizedPhoto ? { photoUrl: optimizedPhoto } : {})
        });
        freshPlayers.push(cleanPlayer);
      }

      if (freshPlayers.length >= 5) {
        cachedPlayers = freshPlayers;
        cachedPlayersLastFetch = Date.now();
        saveLocalPlayersBackup(freshPlayers);
      }

      res.json({
        success: true,
        docsUpdated,
        duplicatesRemoved,
        photosCompressed,
        beforeKB: Number((totalBeforeBytes / 1024).toFixed(1)),
        afterKB: Number((totalAfterBytes / 1024).toFixed(1))
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Erro ao otimizar fotos." });
    }
  });

  app.post("/api/whatsapp/photo-directory/associate", async (req, res) => {
    try {
      const { playerId, playerName, phone, photoUrl, source = "manual_upload" } = req.body || {};
      if (!phone) {
        return res.status(400).json({ success: false, error: "Telefone WhatsApp é obrigatório." });
      }
      const db = await getFirestore();
      let resolvedPhoto: string | null =
        photoUrl && typeof photoUrl === "string" && !isMissingOrDefaultAvatar(photoUrl)
          ? photoUrl
          : null;

      if (resolvedPhoto && resolvedPhoto.startsWith("http")) {
        resolvedPhoto = (await downloadImageAsDataUri(resolvedPhoto)) || resolvedPhoto;
      }

      if (!resolvedPhoto) {
        resolvedPhoto = await fetchWhatsAppProfilePictureFromApi(phone, null);
      }

      if (resolvedPhoto && resolvedPhoto.startsWith("data:image/")) {
        resolvedPhoto = (await compressPhotoTo10KBDataUri(resolvedPhoto)) || resolvedPhoto;
      }

      const keys = getPhoneIndexKeys(phone);
      const normalizedPhone = keys[0] || String(phone).replace(/\D/g, "");
      const now = Date.now();

      if (resolvedPhoto) {
        registerWhatsAppPhotoBinding({
          phone: normalizedPhone,
          photoUrl: resolvedPhoto,
          playerId,
          playerName,
          source
        });

        const firestoreEntries: Record<string, any> = {};
        keys.forEach((k) => {
          firestoreEntries[k] = loadLocalWhatsAppPhotoDir()[k];
        });
        await withFirestoreGuard(
          () =>
            db
              .collection("metadata")
              .doc("whatsapp_photo_directory")
              .set({ entries: firestoreEntries, updatedAt: now }, { merge: true }),
          undefined
        );
      }

      if (playerId) {
        const allPlayers = await getCachedPlayers(false);
        const target = allPlayers.find((p) => p.id === playerId);
        const firestoreFields: Record<string, any> = {
          phone: normalizedPhone,
          whatsappLinkedAt: now,
          whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__"
        };
        if (resolvedPhoto) {
          firestoreFields.photoUrl = resolvedPhoto;
          firestoreFields.photoUpdatedAt = now;
        }
        if (target) {
          target.phone = normalizedPhone;
          target.whatsappLinkedAt = now;
          if (resolvedPhoto) {
            target.photoUrl = resolvedPhoto;
            target.photoUpdatedAt = now;
          }
          delete target.whatsappPhotoUrl;
          saveLocalPlayersBackup(allPlayers);
        }
        await withFirestoreGuard(
          () => db.collection("players").doc(playerId).set(firestoreFields, { merge: true }),
          undefined
        );
      }

      res.json({
        success: true,
        normalizedPhone,
        photoUrl: resolvedPhoto,
        directory: loadLocalWhatsAppPhotoDir()
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message });
    }
  });

  // 5C. Página Mobile de Auto-Upload de Foto pelo Sócio (/foto?pid=...&name=...) e Endpoint Push Baileys VM
  app.get("/foto", (req, res) => {
    const pid = String(req.query.pid || "").trim();
    const phone = String(req.query.phone || "").trim();
    const name = String(req.query.name || "Guerreiro(a)").trim();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Atualizar Foto — Guerreiros VC</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #09090b; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { width: 100%; max-width: 400px; background: #121215; border: 2px solid rgba(245,196,41,0.4); border-radius: 28px; padding: 30px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.85); }
    .badge { display: inline-block; background: rgba(245,196,41,0.15); color: #F5C429; border: 1px solid rgba(245,196,41,0.3); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 6px 14px; border-radius: 99px; margin-bottom: 14px; }
    h1 { font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; }
    p { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin-bottom: 20px; }
    .preview { width: 120px; height: 120px; border-radius: 999px; border: 3px solid #F5C429; margin: 0 auto 20px; object-fit: cover; background: #1f1f23; display: flex; align-items: center; justify-content: center; font-size: 42px; overflow: hidden; }
    .preview img { width: 100%; height: 100%; object-fit: cover; }
    .btn { width: 100%; background: #F5C429; color: #000; border: none; border-radius: 16px; padding: 15px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; display: block; margin-bottom: 10px; }
    .btn-save { background: #10b981; color: #000; display: none; }
    .status { margin-top: 14px; font-size: 13px; font-weight: 700; color: #34d399; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🏐 Guerreiros VC</div>
    <h1>Foto do Perfil</h1>
    <p>Olá, <strong>${name.split("<").join("").split(">").join("").split('"').join("").split("'").join("")}</strong>! Escolha uma foto da sua galeria ou tire uma selfie para salvar no cadastro oficial do clube.</p>
    <div class="preview" id="previewBox">📸</div>
    <label class="btn">
      Escolher Foto / Câmera
      <input type="file" accept="image/*" style="display:none" onchange="onPick(event)" />
    </label>
    <button id="saveBtn" class="btn btn-save" onclick="uploadPhoto()">✅ Salvar Minha Foto</button>
    <div id="statusMsg" class="status"></div>
  </div>
  <script>
    const pid = ${JSON.stringify(pid)};
    const phone = ${JSON.stringify(phone)};
    const name = ${JSON.stringify(name)};
    let compressedDataUri = null;

    function onPick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const dims = [160, 140, 120, 104];
          const quals = [0.72, 0.62, 0.52, 0.44, 0.36];
          let candidate = '';
          outer: for (let di = 0; di < dims.length; di++) {
            const maxSide = dims[di];
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSide) { h = Math.round(h * maxSide / w); w = maxSide; } }
            else { if (h > maxSide) { w = Math.round(w * maxSide / h); h = maxSide; } }
            canvas.width = w; canvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            for (let qi = 0; qi < quals.length; qi++) {
              candidate = canvas.toDataURL('image/jpeg', quals[qi]);
              if (candidate.length <= 10500) break outer;
            }
          }
          compressedDataUri = candidate;
          document.getElementById('previewBox').innerHTML = '<img src="' + compressedDataUri + '" />';
          document.getElementById('saveBtn').style.display = 'block';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    async function uploadPhoto() {
      if (!compressedDataUri) return;
      const btn = document.getElementById('saveBtn');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        const resp = await fetch('/api/whatsapp/push-member-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: pid, playerName: name, phone, photoUrl: compressedDataUri, source: 'self_service_link' })
        });
        const data = await resp.json();
        const st = document.getElementById('statusMsg');
        st.style.display = 'block';
        if (data.success) {
          st.style.color = '#34d399';
          st.textContent = '✅ Foto salva com sucesso no app dos Guerreiros! Pode fechar esta página.';
          btn.style.display = 'none';
        } else {
          st.style.color = '#f87171';
          st.textContent = 'Erro ao salvar: ' + (data.error || 'tente novamente');
          btn.disabled = false;
          btn.textContent = '✅ Salvar Minha Foto';
        }
      } catch (err) {
        alert('Erro de conexão ao enviar foto.');
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
  });

  app.post("/api/whatsapp/push-member-photo", async (req, res) => {
    try {
      const validated = validateIncomingJsonPayload(req.body, "whatsapp/push-member-photo");
      if (!validated.valid) {
        return res.status(200).json({ success: false, error: validated.reason });
      }
      const {
        playerId,
        playerName,
        phone,
        whatsappLid,
        photoUrl,
        base64,
        photoBase64,
        dataUri,
        imageBase64,
        mimeType = "image/jpeg",
        source = "baileys_vm"
      } = validated.data;
      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);

      const norm = (s: string) =>
        String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

      let targetPlayer =
        (playerId ? allPlayers.find((p) => p.id === playerId) : undefined) ||
        allPlayers.find(
          (p) =>
            (whatsappLid && p.whatsappLid && String(p.whatsappLid).trim() === String(whatsappLid).trim()) ||
            (phone && matchBrazilianPhone(String(phone), p.phone)) ||
            (playerName && norm(p.name) === norm(playerName))
        );

      const rawBase64Input = [base64, photoBase64, dataUri, imageBase64].find(
        (v) => typeof v === "string" && v.trim().length > 20
      ) as string | undefined;

      let resolvedPhoto: string | null = null;
      if (rawBase64Input) {
        const trimmedB64 = rawBase64Input.trim();
        resolvedPhoto = trimmedB64.startsWith("data:")
          ? trimmedB64
          : `data:${mimeType};base64,${trimmedB64}`;
      } else if (photoUrl && typeof photoUrl === "string") {
        resolvedPhoto = photoUrl.startsWith("http")
          ? (await downloadImageAsDataUri(photoUrl)) || photoUrl
          : photoUrl;
      }

      if (!resolvedPhoto || isMissingOrDefaultAvatar(resolvedPhoto)) {
        return res.status(400).json({ success: false, error: "Imagem inválida ou ausente." });
      }

      if (resolvedPhoto.startsWith("data:image/")) {
        resolvedPhoto = (await compressPhotoTo10KBDataUri(resolvedPhoto)) || resolvedPhoto;
      }

      // Garante que o Data URI caiba com folga no limite de 1MB por documento do Firestore
      if (resolvedPhoto.length > 850_000) {
        return res.status(400).json({ success: false, error: "Imagem muito grande para persistência direta." });
      }

      const effectivePhone = autoNormalizeBrazilianPhone(phone || targetPlayer?.phone || "");
      const now = Date.now();

      if (effectivePhone) {
        registerWhatsAppPhotoBinding({
          phone: effectivePhone,
          photoUrl: resolvedPhoto,
          playerId: targetPlayer?.id || playerId,
          playerName: targetPlayer?.name || playerName,
          source
        });
      }

      // Prioriza sempre o ID real do Firestore (evitando gravar em IDs seed_* em cold start)
      const explicitRealId =
        playerId && typeof playerId === "string" && !playerId.startsWith("seed_") ? playerId : null;
      const matchedRealId =
        targetPlayer?.id && !String(targetPlayer.id).startsWith("seed_") ? String(targetPlayer.id) : null;
      const targetId = explicitRealId || matchedRealId || targetPlayer?.id || playerId;

      let firestoreSaved = false;
      if (targetId) {
        const firestoreFields: Record<string, any> = {
          photoUrl: resolvedPhoto,
          whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__",
          photoUpdatedAt: now
        };
        if (effectivePhone) firestoreFields.phone = effectivePhone;
        if (whatsappLid && typeof whatsappLid === "string") firestoreFields.whatsappLid = whatsappLid.trim();
        if (targetPlayer) {
          targetPlayer.photoUrl = resolvedPhoto;
          targetPlayer.photoUpdatedAt = now;
          if (effectivePhone) targetPlayer.phone = effectivePhone;
          if (whatsappLid && typeof whatsappLid === "string") targetPlayer.whatsappLid = whatsappLid.trim();
          delete targetPlayer.whatsappPhotoUrl;
          saveLocalPlayersBackup(allPlayers);
        }
        firestoreSaved = await withFirestoreGuard(async () => {
          await db.collection("players").doc(targetId).set(firestoreFields, { merge: true });
          return true;
        }, false);
        await withFirestoreGuard(
          () => db.collection("metadata").doc("system").set({ lastUpdate: now }, { merge: true }),
          undefined
        );
      }

      res.json({
        success: true,
        firestoreSaved,
        playerId: targetId || null,
        playerName: targetPlayer?.name || playerName || null,
        photoUrl: resolvedPhoto
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message });
    }
  });

  // 6. Sincronização de Fotos de Perfil do WhatsApp via VM Google (Baileys — sem Evolution API)
  app.post("/api/whatsapp/sync-photos", async (req, res) => {
    try {
      const validated = validateIncomingJsonPayload(req.body, "whatsapp/sync-photos");
      if (!validated.valid) {
        return res.status(200).json({ success: false, error: validated.reason, players: cachedPlayers });
      }
      const {
        playerId = null,
        forceAll = false,
        players: clientPlayers,
        matches: clientMatches,
        intentions: clientIntentions
      } = validated.data;
      const db = await getFirestore();

      if (Array.isArray(clientPlayers) && clientPlayers.length >= 5) {
        normalizePlayersPhonesInPlace(clientPlayers);
        cachedPlayers = clientPlayers;
        cachedPlayersLastFetch = Date.now();
        saveLocalPlayersBackup(clientPlayers);
      }
      if (Array.isArray(clientMatches) && clientMatches.length > 0) {
        cachedMatches = clientMatches;
        cachedMatchesLastFetch = Date.now();
        saveLocalMatchesBackup(clientMatches);
      }
      if (clientIntentions && clientIntentions.responses && Object.keys(clientIntentions.responses).length > 0) {
        cachedIntentions = {
          ...clientIntentions,
          targetDate: clientIntentions.targetDate || getNextThursday(),
          lastUpdated: Date.now()
        };
        cachedIntentionsLastFetch = Date.now();
        saveLocalIntentionsBackup(cachedIntentions);
      }

      const allPlayers =
        cachedPlayers.length >= 5 ? cachedPlayers : await getCachedPlayers(true);

      // Passo 1: Aplica imediatamente fotos já salvas no diretório Foto <-> WhatsApp (local + Firestore)
      const photoDir: Record<string, any> = { ...loadLocalWhatsAppPhotoDir() };
      const remoteDir = await withFirestoreGuard(async () => {
        const snap = await db.collection("metadata").doc("whatsapp_photo_directory").get();
        return snap.exists ? snap.data()?.entries || {} : {};
      }, {} as Record<string, any>);
      Object.assign(photoDir, remoteDir);

      let directorySyncedCount = 0;
      const now = Date.now();
      for (const p of allPlayers) {
        if (!p.phone || !isMissingOrDefaultAvatar(p.photoUrl)) continue;
        const keys = getPhoneIndexKeys(p.phone);
        const found = keys.map((k) => photoDir[k]).find((entry) => entry?.photoUrl && !isMissingOrDefaultAvatar(entry.photoUrl));
        if (found?.photoUrl) {
          const compactPhoto = found.photoUrl.startsWith("data:image/")
            ? (await compressPhotoTo10KBDataUri(found.photoUrl)) || found.photoUrl
            : found.photoUrl;
          p.photoUrl = compactPhoto;
          delete p.whatsappPhotoUrl;
          p.photoUpdatedAt = now;
          directorySyncedCount++;
          await withFirestoreGuard(
            () =>
              db.collection("players").doc(p.id).set(
                { photoUrl: compactPhoto, whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__", photoUpdatedAt: now },
                { merge: true }
              ),
            undefined
          );
        }
      }

      if (directorySyncedCount > 0) {
        saveLocalPlayersBackup(allPlayers);
        cachedPlayersLastFetch = now;
        await withFirestoreGuard(
          () => db.collection("metadata").doc("system").set({ lastUpdate: now }, { merge: true }),
          undefined
        );
      }

      // Passo 2: Enfileira tarefa de importação de fotos para a VM Google (Baileys) coletar via /api/whatsapp/cron-tasks
      const previousJob = await hydrateVmPhotoSyncJobFromFirestore();
      const targets = buildVmPhotoSyncTargets(allPlayers, Boolean(forceAll || playerId), playerId);
      const job: VmPhotoSyncJob = {
        jobId: `photosync_${now}_${Math.random().toString(36).slice(2, 7)}`,
        requestedAt: now,
        forceAll: Boolean(forceAll || playerId),
        playerId: playerId || null,
        status: "queued",
        checkedCount: targets.length,
        targets
      };
      currentVmPhotoSyncJob = job;
      saveLocalVmPhotoSyncJob(job);
      await persistVmPhotoSyncJobToFirestore(job);

      const effectiveHeartbeat = await getEffectiveVmPhotoSyncHeartbeatAt(previousJob);
      const vmPhotoSyncConnected =
        effectiveHeartbeat > 0 &&
        Date.now() - effectiveHeartbeat <= VM_PHOTO_SYNC_ONLINE_WINDOW_MS;

      res.json({
        success: true,
        mode: "vm_baileys_queued",
        jobId: job.jobId,
        vmPhotoSyncConnected,
        lastVmPhotoSyncHeartbeatAt: effectiveHeartbeat || null,
        queuedTargetsCount: targets.length,
        checked: targets.length,
        updatedCount: directorySyncedCount,
        directorySyncedCount,
        noPhotoPrivacyCount: 0,
        phonesUpdated: 0,
        lidsUpdated: 0,
        message: !vmPhotoSyncConnected
          ? directorySyncedCount > 0
            ? `${directorySyncedCount} foto(s) restaurada(s) do diretório local e tarefa para ${targets.length} sócio(s) enfileirada. Aguardando próximo ciclo da VM Google (Baileys).`
            : `Sincronização de ${targets.length} sócio(s) enfileirada! Aguardando a VM Google (Baileys) processar no próximo ciclo (até 60s).`
          : directorySyncedCount > 0
          ? `${directorySyncedCount} foto(s) restaurada(s) do diretório local e sincronização de ${targets.length} sócio(s) enfileirada para a VM Google (Baileys)!`
          : `Sincronização de fotos de ${targets.length} sócio(s) enfileirada para a VM Google (Baileys)! Importando automaticamente em até 60 segundos...`,
        players: allPlayers
      });
    } catch (err: any) {
      res.status(200).json({
        success: false,
        error: err.message,
        players: cachedPlayers
      });
    }
  });

  app.get("/api/whatsapp/sync-photos/status", async (_req, res) => {
    try {
      const job = await hydrateVmPhotoSyncJobFromFirestore();
      const effectiveHeartbeat = await getEffectiveVmPhotoSyncHeartbeatAt(job);
      const vmPhotoSyncConnected =
        effectiveHeartbeat > 0 &&
        Date.now() - effectiveHeartbeat <= VM_PHOTO_SYNC_ONLINE_WINDOW_MS;
      res.json({
        success: true,
        vmPhotoSyncConnected,
        lastVmPhotoSyncHeartbeatAt: effectiveHeartbeat || null,
        job
      });
    } catch (err: any) {
      res.json({ success: false, job: currentVmPhotoSyncJob, error: err?.message });
    }
  });

  app.post("/api/whatsapp/sync-photos/complete", async (req, res) => {
    try {
      const { jobId, updatedCount = 0, noPhotoPrivacyCount = 0, checkedCount = 0 } = req.body || {};
      await hydrateVmPhotoSyncJobFromFirestore();
      const now = Date.now();
      const updatedJob: VmPhotoSyncJob = {
        ...(currentVmPhotoSyncJob || {
          jobId: jobId || `photosync_${now}`,
          requestedAt: now,
          forceAll: true
        }),
        jobId: jobId || currentVmPhotoSyncJob?.jobId || `photosync_${now}`,
        status: "completed",
        completedAt: now,
        updatedCount: Number(updatedCount) || 0,
        noPhotoPrivacyCount: Number(noPhotoPrivacyCount) || 0,
        checkedCount: Number(checkedCount) || 0
      };
      currentVmPhotoSyncJob = updatedJob;
      saveLocalVmPhotoSyncJob(updatedJob);
      await persistVmPhotoSyncJobToFirestore(updatedJob);
      res.json({ success: true, job: updatedJob });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err?.message });
    }
  });

  // 3. Disparo Manual/Imediato de Parabéns de Aniversário no Grupo do WhatsApp (Substitui sendBirthdayPush FCM)
  app.post("/api/whatsapp/send-birthday", async (req, res) => {
    try {
      const { playerId, player: passedPlayer, customMessage, forceResend = false } = req.body || {};
      const db = await getFirestore();
      const cfg = getWhatsAppConfig();
      const br = getBrazilTimeParts();
      const currentYearStr = br.dateKey.split("-")[0];
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);

      let targetPlayers = playerId
        ? allPlayers.filter((p) => p.id === playerId)
        : getTodayBirthdayPlayers(allPlayers, br.dateKey);

      if (targetPlayers.length === 0 && passedPlayer && passedPlayer.id) {
        targetPlayers = [passedPlayer];
      }

      if (targetPlayers.length === 0) {
        return res.status(404).json({ success: false, error: "Nenhum aniversariante encontrado." });
      }

      const schedRef = db.collection("metadata").doc("whatsapp_scheduler");
      const autoBdayRef = db.collection("metadata").doc("automation_birthdays");
      const recentGreetings: string[] = Array.isArray(cachedScheduler?.recentBirthdayGreetings)
        ? [...cachedScheduler.recentBirthdayGreetings]
        : [];
      const sentBirthdayLog: Record<string, any> = { ...(cachedScheduler?.sentBirthdayLog || {}) };

      const batch: Array<{
        to: string;
        text: string;
        delayMs?: number;
        type?: string;
        recipientLabel?: string;
        fallbackTargets?: string[];
      }> = [];

      for (let i = 0; i < targetPlayers.length; i++) {
        const bPlayer = targetPlayers[i];
        const logKey = `${bPlayer.id}_${currentYearStr}`;
        if (!forceResend && (sentBirthdayLog[logKey] || String(bPlayer.lastBirthdaySentYear || "") === currentYearStr)) {
          continue;
        }

        const generated = customMessage
          ? { fullText: customMessage, privateText: customMessage, bodyText: customMessage }
          : await buildIndividualBirthdayMessage(bPlayer, recentGreetings);

        recentGreetings.push(`${bPlayer.name}: ${generated.bodyText}`);
        // 1) Envia no grupo oficial do clube
        batch.push({
          to: cfg.groupJid,
          delayMs: i * 4000,
          text: generated.fullText,
          type: "BIRTHDAY_GROUP",
          recipientLabel: `Grupo Guerreiros (${bPlayer.name})`
        });

        // 2) Envia também no WhatsApp privado do(a) aniversariante (priorizando JID verificado/@lid)
        const privateTargets = resolvePlayerWhatsAppTargets({
          ...bPlayer,
          phone: bPlayer.phone || passedPlayer?.phone
        });
        if (privateTargets.length > 0) {
          batch.push({
            to: privateTargets[0],
            fallbackTargets: privateTargets.slice(1),
            delayMs: i * 4000 + 2000,
            text: generated.privateText,
            type: "BIRTHDAY_PRIVATE",
            recipientLabel: bPlayer.name
          });
        }

        const sentTimestamp = Date.now();
        sentBirthdayLog[logKey] = {
          playerId: bPlayer.id,
          playerName: bPlayer.name,
          year: currentYearStr,
          date: br.dateKey,
          sentAt: sentTimestamp,
          message: generated.fullText
        };

        bPlayer.lastBirthdaySentYear = currentYearStr;
        bPlayer.lastBirthdaySentDate = br.dateKey;
        bPlayer.lastBirthdaySentAt = sentTimestamp;
        bPlayer.lastBirthdayMessage = generated.fullText;

        await withFirestoreGuard(
          () =>
            db.collection("players").doc(bPlayer.id).set(
              {
                lastBirthdaySentYear: currentYearStr,
                lastBirthdaySentDate: br.dateKey,
                lastBirthdaySentAt: sentTimestamp,
                lastBirthdayMessage: generated.fullText
              },
              { merge: true }
            ),
          undefined
        );
      }

      if (batch.length > 0) {
        cachedScheduler = {
          ...(cachedScheduler || {}),
          lastBirthdayMessageDate: br.dateKey,
          sentBirthdayLog,
          recentBirthdayGreetings: recentGreetings.slice(-20)
        };
        saveLocalSchedulerBackup(cachedScheduler);

        await withFirestoreGuard(
          () =>
            schedRef.set(
              {
                lastBirthdayMessageDate: br.dateKey,
                sentBirthdayLog,
                recentBirthdayGreetings: recentGreetings.slice(-20)
              },
              { merge: true }
            ),
          undefined
        );
        await withFirestoreGuard(
          () =>
            autoBdayRef.set(
              {
                lastRun: br.dateKey,
                sentBirthdayLog,
                recentBirthdayGreetings: recentGreetings.slice(-20),
                updatedAt: Date.now()
              },
              { merge: true }
            ),
          undefined
        );

        dispatchWhatsAppBatchAsync(batch);
      }

      res.json({ success: true, sent: batch.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // ⏰ MOTOR DE AGENDAMENTO AUTOMÁTICO (Aniversários, Indecisos, Lista, Resgate e Pílula Diária)
  // ============================================================================
  app.post("/api/whatsapp/cron-tasks", async (req, res) => {
    try {
      const validated = validateIncomingJsonPayload(req.body, "whatsapp/cron-tasks");
      if (!validated.valid) {
        return res.status(200).json({ success: false, messages: [], error: validated.reason });
      }
      const reqBody = validated.data;
      const groupJid = reqBody.groupJid || "120363401268459791@g.us";
      const dryRun = reqBody.dryRun === true;
      const bridgeSupportsMedia =
        reqBody.supportsMedia === true ||
        req.query?.supportsMedia === "1" ||
        reqBody.includeMediaBase64 === true;
      const reqHost = String(req.headers.host || "").trim();
      const publicBaseUrl =
        reqHost && !reqHost.includes("localhost") && !reqHost.startsWith("127.")
          ? `https://${reqHost}`
          : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app";
      const br = getBrazilTimeParts();

      // Drena a fila pendente (mensagens privadas/grupo e PNGs enfileirados para a VM Google) ANTES da janela de silêncio
      await hydrateOutboxFromFirestore();
      const drainedOutbox: Array<{
        to: string;
        fallbackTargets?: string[];
        text: string;
        mediaBase64?: string;
        mediaFetchUrl?: string;
        mediaType?: "image";
        mimetype?: string;
        fileName?: string;
        caption?: string;
        imageOnly?: boolean;
        delayMs?: number;
        outboxId?: string;
        isOutbox?: boolean;
      }> = [];
      if (!dryRun && pendingWhatsAppOutbox.length > 0) {
        const remainingOutbox: OutboxWhatsAppMessage[] = [];
        const drained: OutboxWhatsAppMessage[] = [];
        for (const item of pendingWhatsAppOutbox) {
          const isImageOnlyItem = Boolean((item.mediaBase64 || item.mediaFetchUrl) && !item.text);
          if (isImageOnlyItem && !bridgeSupportsMedia) {
            // Mantém PNGs na fila até a VM Google atualizar para supportsMedia: true
            remainingOutbox.push(item);
          } else {
            drained.push(item);
          }
        }
        if (drained.length > 0) {
          pendingWhatsAppOutbox = remainingOutbox;
          saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
          persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {});
          drained.forEach((item, idx) => {
            drainedOutbox.push({
              to: item.to,
              fallbackTargets: item.fallbackTargets,
              text: item.text,
              ...(item.mediaBase64 ? { mediaBase64: item.mediaBase64 } : {}),
              ...(item.mediaFetchUrl ? { mediaFetchUrl: item.mediaFetchUrl } : {}),
              ...(item.mediaBase64 || item.mediaFetchUrl
                ? {
                    mediaType: item.mediaType || "image",
                    mimetype: "image/png",
                    fileName: item.fileName,
                    caption: item.caption,
                    imageOnly: item.imageOnly ?? Boolean(!item.text)
                  }
                : {}),
              delayMs: typeof item.delayMs === "number" ? item.delayMs : idx * 1500,
              outboxId: item.outboxId,
              isOutbox: true
            });
          });
        }
      }

      // Apenas VMs explicitamente atualizadas com supportsPhotoSync: true podem consumir a tarefa de fotos
      const bridgeSupportsPhotoSync =
        req.body?.supportsPhotoSync === true ||
        req.query?.supportsPhotoSync === "1";

      if (bridgeSupportsPhotoSync) {
        recordVmPhotoSyncHeartbeat(Date.now()).catch(() => {});
      }

      // Despacha tarefa pendente de importação de fotos de perfil para a VM Google (funciona 24h, mesmo na janela de silêncio)
      let photoSyncTask: {
        jobId: string;
        groupJid: string;
        forceAll: boolean;
        targets: VmPhotoSyncTarget[];
      } | null = null;
      if (!dryRun && bridgeSupportsPhotoSync) {
        const job = await hydrateVmPhotoSyncJobFromFirestore();
        if (job && job.status === "queued") {
          const targets =
            Array.isArray(job.targets) && job.targets.length > 0
              ? job.targets
              : buildVmPhotoSyncTargets(
                  await getCachedPlayers(cachedPlayers.length === 0),
                  job.forceAll,
                  job.playerId
                );
          const dispatchedJob: VmPhotoSyncJob = {
            ...job,
            status: "dispatched",
            dispatchedAt: Date.now(),
            checkedCount: targets.length
          };
          currentVmPhotoSyncJob = dispatchedJob;
          saveLocalVmPhotoSyncJob(dispatchedJob);
          persistVmPhotoSyncJobToFirestore(dispatchedJob).catch(() => {});
          photoSyncTask = {
            jobId: job.jobId,
            groupJid,
            forceAll: job.forceAll,
            targets
          };
        }
      }

      const isLatePostGameWindow =
        (br.dayOfWeek === 4 && br.totalMinutes > 23 * 60 + 35) ||
        (br.dayOfWeek === 5 && br.totalMinutes <= 60);
      if (!isLatePostGameWindow && (br.totalMinutes < 8 * 60 || br.totalMinutes > 23 * 60 + 35)) {
        return res.json({
          success: true,
          messages: drainedOutbox,
          ...(photoSyncTask ? { photoSyncTask } : {})
        });
      }

      const db = await getFirestore();
      const schedRef = db.collection("metadata").doc("whatsapp_scheduler");

      if (!cachedScheduler) {
        const diskSched = loadLocalSchedulerBackup();
        if (Object.keys(diskSched).length > 0) {
          cachedScheduler = diskSched;
        }
      }

      let schedulerReadSucceeded = false;
      const remoteScheduler = await withFirestoreGuard(async () => {
        const schedSnap = await schedRef.get();
        schedulerReadSucceeded = true;
        return schedSnap.exists ? schedSnap.data() || {} : {};
      }, null as Record<string, any> | null);

      const isColdStartWithoutDb =
        !schedulerReadSucceeded && (!cachedScheduler || Object.keys(cachedScheduler).length === 0);

      cachedScheduler = {
        ...(cachedScheduler || {}),
        ...(remoteScheduler || {})
      };

      const schedData = cachedScheduler || {};
      const updates: Record<string, any> = {};
      const messagesToSend: Array<{
        to: string;
        fallbackTargets?: string[];
        text: string;
        mediaBase64?: string;
        mediaFetchUrl?: string;
        mediaType?: "image";
        mimetype?: string;
        fileName?: string;
        caption?: string;
        imageOnly?: boolean;
        delayMs?: number;
        outboxId?: string;
        isOutbox?: boolean;
      }> = [...drainedOutbox];

      const [allPlayers, systemConfig] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedSystemConfig()
      ]);
      const activePlayers = allPlayers.filter((p) => p.status === "active" && !p.isDM);

      // 🎂 MENSAGEM EXCLUSIVA E PERSONALIZADA POR ANIVERSARIANTE + TRAVA ANTI-DUPLICIDADE ANUAL
      const autoBirthdaysEnabled =
        systemConfig?.birthdayNotificationsEnabled !== false &&
        systemConfig?.enableAutoBirthdays !== false;

      if (autoBirthdaysEnabled) {
        const currentYearStr = br.dateKey.split("-")[0];
        const birthdayPlayers = getTodayBirthdayPlayers(allPlayers, br.dateKey);

        if (birthdayPlayers.length > 0) {
          const autoBdayRef = db.collection("metadata").doc("automation_birthdays");
          const autoBdayData = await withFirestoreGuard(async () => {
            const snap = await autoBdayRef.get();
            return snap.exists ? snap.data() || {} : {};
          }, {} as Record<string, any>);

          const sentBirthdayLog: Record<string, any> = {
            ...(autoBdayData.sentBirthdayLog || {}),
            ...(schedData.sentBirthdayLog || {})
          };

          const recentBirthdayGreetings: string[] = Array.isArray(schedData.recentBirthdayGreetings)
            ? [...schedData.recentBirthdayGreetings].slice(-20)
            : [];

          const unsentBirthdayPlayers = birthdayPlayers.filter((p) => {
            const logKey = `${p.id}_${currentYearStr}`;
            const alreadyInScheduler = Boolean(
              sentBirthdayLog[logKey] || sentBirthdayLog[p.id] === currentYearStr
            );
            const alreadyInPlayerDoc = String(p.lastBirthdaySentYear || "") === currentYearStr;
            return !alreadyInScheduler && !alreadyInPlayerDoc;
          });

          if (unsentBirthdayPlayers.length > 0) {
            const sentNamesToday: string[] = [];

            for (let i = 0; i < unsentBirthdayPlayers.length; i++) {
              const bPlayer = unsentBirthdayPlayers[i];
              const { fullText, privateText, bodyText } = await buildIndividualBirthdayMessage(
                bPlayer,
                recentBirthdayGreetings
              );

              recentBirthdayGreetings.push(`${bPlayer.name}: ${bodyText}`);
              // Envia homenagem personalizada no grupo oficial às 08:00
              messagesToSend.push({
                to: groupJid,
                delayMs: i * 4000,
                text: fullText
              });
              // E envia mensagem individual exclusiva no privado do(a) aniversariante (priorizando JID verificado/@lid)
              const privateBdayTargets = resolvePlayerWhatsAppTargets(bPlayer);
              if (privateBdayTargets.length > 0) {
                messagesToSend.push({
                  to: privateBdayTargets[0],
                  fallbackTargets: privateBdayTargets.slice(1),
                  delayMs: i * 4000 + 2000,
                  text: privateText
                });
              }

              const sentTimestamp = Date.now();
              const logKey = `${bPlayer.id}_${currentYearStr}`;
              sentBirthdayLog[logKey] = {
                playerId: bPlayer.id,
                playerName: bPlayer.name,
                year: currentYearStr,
                date: br.dateKey,
                sentAt: sentTimestamp,
                message: fullText
              };

              sentNamesToday.push(bPlayer.name);

              // Atualiza em memória e persiste no documento players/{id}
              bPlayer.lastBirthdaySentYear = currentYearStr;
              bPlayer.lastBirthdaySentDate = br.dateKey;
              bPlayer.lastBirthdaySentAt = sentTimestamp;
              bPlayer.lastBirthdayMessage = fullText;

              if (!dryRun && bPlayer.id) {
                await withFirestoreGuard(
                  () =>
                    db.collection("players").doc(bPlayer.id).set(
                      {
                        lastBirthdaySentYear: currentYearStr,
                        lastBirthdaySentDate: br.dateKey,
                        lastBirthdaySentAt: sentTimestamp,
                        lastBirthdayMessage: fullText
                      },
                      { merge: true }
                    ),
                  undefined
                );
              }
            }

            updates.lastBirthdayMessageDate = br.dateKey;
            updates.lastBirthdayPlayers = sentNamesToday;
            updates.sentBirthdayLog = sentBirthdayLog;
            updates.recentBirthdayGreetings = recentBirthdayGreetings.slice(-20);

            if (!dryRun) {
              await withFirestoreGuard(
                () =>
                  autoBdayRef.set(
                    {
                      lastRun: br.dateKey,
                      sentBirthdayLog,
                      recentBirthdayGreetings: recentBirthdayGreetings.slice(-20),
                      updatedAt: Date.now()
                    },
                    { merge: true }
                  ),
                undefined
              );
            }
          }
        }
      }

      const isWednesday = br.dayOfWeek === 3;
      const isThursday = br.dayOfWeek === 4;

      const isWed15h = isWednesday && br.hour === 15 && br.minute < 30;
      const isThu10h = isThursday && br.hour === 10 && br.minute < 30;
      const isThu16h = isThursday && br.hour === 16 && br.minute < 30;

      const slotIdentifier = isWed15h
        ? `${br.dateKey}_wed_15h`
        : isThu10h
        ? `${br.dateKey}_thu_10h`
        : isThu16h
        ? `${br.dateKey}_thu_16h`
        : null;

      if (slotIdentifier && schedData.lastPrivateInviteSlot !== slotIdentifier) {
        updates.lastPrivateInviteSlot = slotIdentifier;
        const currentInt = await ensureFreshIntentionsDocument(true);
        const targetDate = currentInt.targetDate || getNextThursday();
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
        const responses = currentInt.responses || {};

        const undecided = activePlayers.filter((p) => {
          if (!isEligibleClubMemberForPrivateAutomations(p)) return false;
          const resp =
            responses[p.id] ||
            (p.uid ? responses[p.uid] : null) ||
            (p.email ? responses[p.email.trim().toLowerCase()] : null);
          return !resp;
        });

        undecided.forEach((p, idx) => {
          const targets = resolvePlayerWhatsAppTargets(p);
          if (targets.length === 0) return;
          const firstName = p.name.split(" ")[0];

          let textMessage = `Fala, *${firstName}*! 🏐🔥\nAinda não vimos sua confirmação na *Lista de Quinta (${formattedDate})* dos Guerreiros!\n\nToque em uma das opções abaixo ou me mande um áudio para registrar sua resposta:\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`;

          if (isThu16h) {
            textMessage = `Fala, *${firstName}*! ⏰🏐\nFechamento da *Lista de Quinta (${formattedDate})* logo mais à noite!\n\nVocê ainda não confirmou presença. Vai jogar hoje?\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`;
          }

          messagesToSend.push({
            to: targets[0],
            fallbackTargets: targets.slice(1),
            delayMs: idx * 12000,
            text: textMessage
          });
        });
      }

      const isTuesday = br.dayOfWeek === 2;
      const isTue14h = isTuesday && br.hour === 14 && br.minute < 30;
      const absenceSlotKey = `${br.dateKey}_absence_rescue`;

      if (isTue14h && schedData.lastAbsenceRescueSlot !== absenceSlotKey) {
        updates.lastAbsenceRescueSlot = absenceSlotKey;
        try {
          const recentMatches = (await getCachedMatches(cachedMatches.length === 0)).slice(-15);
          const attendanceMap = new Map<string, number>();
          activePlayers.forEach((p) => attendanceMap.set(p.id, 0));

          recentMatches.forEach((m) => {
            const participants = [...(m.teamA || []), ...(m.teamB || [])];
            participants.forEach((pid) => {
              if (attendanceMap.has(pid)) {
                attendanceMap.set(pid, (attendanceMap.get(pid) || 0) + 1);
              }
            });
          });

          const absentPlayers = activePlayers.filter(
            (p) => isEligibleClubMemberForPrivateAutomations(p) && (attendanceMap.get(p.id) || 0) === 0 && p.phone
          );

          absentPlayers.forEach((p, idx) => {
            const targets = resolvePlayerWhatsAppTargets(p);
            if (targets.length === 0) return;
            const firstName = p.name.split(" ")[0];

            messagesToSend.push({
              to: targets[0],
              fallbackTargets: targets.slice(1),
              delayMs: idx * 15000,
              text: `Fala, *${firstName}*! 🏐👀\n\nO Guerreirinho aqui estava olhando as súmulas dos últimos rachões e percebi que a sua presença tem feito falta na nossa resenha! A rede está armada, o ELO está guardado e o time está sentindo falta do seu braço em quadra.\n\nTá tudo bem por aí? Quando puder colar com a gente de novo, é só mandar uma mensagem ou áudio dizendo que vai!\n\nUm abraço dos Guerreiros! 👊\n\n— Guerreirinho, o robô do clube 🤖`
            });
          });
        } catch {}
      }

      const dateSeed = br.dateKey.split("-").reduce((acc, val) => acc * 31 + Number(val), 7);
      const randomTargetMinute = 600 + (Math.abs(dateSeed * 16807) % 481);

      if (
        !isColdStartWithoutDb &&
        br.totalMinutes >= randomTargetMinute &&
        br.totalMinutes <= 18 * 60 + 30 &&
        schedData.lastDailyVolleyNewsDate !== br.dateKey
      ) {
        updates.lastDailyVolleyNewsDate = br.dateKey;
        const dayOfWeek = br.dayOfWeek;
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const recentTopics: string[] = Array.isArray(schedData.recentDailyTopics)
          ? schedData.recentDailyTopics.slice(-30)
          : [];

        const themeByDay: Record<number, string> = {
          1: "Atividade física regular, fortalecimento muscular (ombros, core e pernas) e constância nos treinos para jogar vôlei em alto nível e com saúde.",
          2: "Dica técnica e prática de quadra (manchete, levantamento, tempo de bloqueio, cobertura de ataque, saque flutuante, defesa) + importância da mobilidade.",
          3: "Alimentação balanceada, hidratação e nutrição inteligente para dar explosão muscular, evitar cãibras e acelerar a recuperação para o vôlei.",
          4: "HOJE É DIA DE JOGO (Quinta-feira)! A importância fundamental do AQUECIMENTO articular e ativação muscular antes de entrar em quadra e do ALONGAMENTO para proteger ombros, joelhos e tornozelos.",
          5: "Recuperação pós-jogo (sono, alongamento leve, nutrição regenerativa) + curiosidade histórica do vôlei mundial/olímpico.",
          6: "Prevenção de lesões no vôlei (manguito rotador, tendão patelar, tornozelo), longevidade esportiva e qualidade de vida através do esporte.",
          0: "Resenha de domingo: grandes jogos históricos do vôlei brasileiro + motivação de saúde e energia para começar a semana no ritmo dos Guerreiros."
        };

        const chosenTheme = themeByDay[dayOfWeek] || themeByDay[4];
        let dailyContent = "";

        if (apiKey) {
          try {
            const prompt = `Você é o Guerreirinho, o mascote digital e Agente de IA oficial do clube de vôlei "Guerreiros VC".
Escreva uma pílula diária curta, envolvente e muito bem formatada para o WhatsApp (use *negrito* e emojis de vôlei/saúde) para enviar hoje (${br.dateKey}) no grupo dos sócios.

TEMA DO DIA: ${chosenTheme}

TEMAS JÁ ENVIADOS NOS ÚLTIMOS DIAS (PROIBIDO REPETIR O MESMO ASSUNTO):
${recentTopics.length > 0 ? recentTopics.join(" | ") : "Nenhum ainda"}

REGRAS DE FORMATO:
1. Na primeira linha, escreva APENAS: RESUMO_TEMA: <resumo de 4 palavras do assunto específico escolhido>
2. A partir da segunda linha, escreva a mensagem pronta para o WhatsApp (máximo de 2 parágrafos curtos + 1 frase final convidando os sócios a conversarem com o Guerreirinho no privado por texto ou áudio, ou digitarem *gv meusjogos* para ver seu histórico completo).`;

            const aiResp = await routedGenerateContent({
              task: "daily_pill",
              contents: prompt
            });

            const rawOutput = (aiResp.text || "").trim();
            if (rawOutput) {
              const lines = rawOutput.split("\n");
              if (lines[0].startsWith("RESUMO_TEMA:")) {
                const topicTag = lines[0].replace("RESUMO_TEMA:", "").trim();
                updates.recentDailyTopics = [...recentTopics, `${br.dateKey}: ${topicTag}`].slice(-30);
                dailyContent = lines.slice(1).join("\n").trim();
              } else {
                dailyContent = rawOutput;
              }
            }
          } catch {}
        }

        if (!dailyContent) {
          dailyContent =
            `🏐 *PÍLULA DO VÔLEI & SAÚDE — GUERREIROS VC* 🔥\n\n` +
            `💡 *Dica do Guerreirinho:* Nunca entre frio na quadra! Dedicar 10 minutos ao *aquecimento articular* (ombros, joelhos e tornozelos) antes da partida reduz drasticamente o risco de lesões e melhora seu tempo de reação na defesa. Combine isso com boa hidratação e alimentação equilibrada!\n\n` +
            `👉 _Mande um áudio ou digite *gv meusjogos* no meu privado para ver seu histórico completo!_\n\n— Guerreirinho, o robô do clube 🤖`;
        } else {
          dailyContent += `\n\n— Guerreirinho, o robô do clube 🤖`;
        }

        messagesToSend.push({ to: groupJid, text: dailyContent });
      }

      const totalActivePool = activePlayers.length;

      const isMondayToThursday = br.dayOfWeek >= 1 && br.dayOfWeek <= 4;
      if (isMondayToThursday && br.totalMinutes >= 8 * 60 && br.totalMinutes <= 19 * 60 + 30) {
        const halfHourBucket = Math.floor(br.minute / 30);
        const slotKey = `${br.dateKey}_${br.hour}_${halfHourBucket}`;
        if (schedData.last30MinCheckSlot !== slotKey) {
          updates.last30MinCheckSlot = slotKey;
          const currentInt = await ensureFreshIntentionsDocument(true);
          const targetDate = currentInt.targetDate || getNextThursday();
          const responses = currentInt.responses || {};
          const timestamps = currentInt.confirmationTimestamps || {};

          const goingList = activePlayers
            .filter((p) => resolvePlayerIntentEntry(p, responses, timestamps).status === "GOING")
            .sort(
              (a, b) =>
                resolvePlayerIntentEntry(a, responses, timestamps).ts -
                resolvePlayerIntentEntry(b, responses, timestamps).ts
            );

          const currentSignature = buildCanonicalGoingListSignature(goingList, targetDate);

          const maxCourtSlots = Number(systemConfig?.maxPlayersPerSession || totalActivePool);
          const prevIds: string[] = (schedData.lastBroadcastSignature || "").split(",").filter(Boolean);
          if (prevIds.length > maxCourtSlots) {
            const prevWaitlistIds = prevIds.slice(maxCourtSlots);
            const currentMainIds = goingList.slice(0, maxCourtSlots).map((p) => p.id);
            const promotedIds = prevWaitlistIds.filter((id) => currentMainIds.includes(id));

            promotedIds.forEach((pid) => {
              const promotedPlayer = activePlayers.find((p) => p.id === pid);
              const targets = resolvePlayerWhatsAppTargets(promotedPlayer);
              if (promotedPlayer && targets.length > 0) {
                messagesToSend.push({
                  to: targets[0],
                  fallbackTargets: targets.slice(1),
                  text: `🎉🏐 *VAGA LIBERADA, ${promotedPlayer.name.split(" ")[0].toUpperCase()}!*\n\nVocê subiu da fila de espera e agora está oficialmente dentro da lista principal para o jogo de Quinta!\n\n— Guerreirinho, o robô do clube 🤖`
                });
              }
            });
          }

          // 🧠 APRENDIZADO CONTÍNUO DO RITMO DE CONFIRMAÇÃO DO GRUPO (Média Histórica por Dia/Janela)
          const checkpointBucket = `${br.dayOfWeek}_${br.hour >= 16 ? "tarde" : br.hour >= 11 ? "meiodia" : "manha"}`;
          const learnedCurve: Record<string, { avgCount: number; samples: number; lastDate?: string }> = {
            ...(schedData.confirmationLearningCurve || {})
          };
          const curStat = learnedCurve[checkpointBucket] || { avgCount: goingList.length, samples: 0 };
          if (curStat.lastDate !== br.dateKey && goingList.length > 0) {
            const newSamples = Math.min(20, (curStat.samples || 0) + 1);
            const newAvg =
              curStat.samples > 0
                ? Number(((curStat.avgCount * 0.75) + (goingList.length * 0.25)).toFixed(1))
                : goingList.length;
            learnedCurve[checkpointBucket] = {
              avgCount: newAvg,
              samples: newSamples,
              lastDate: br.dateKey
            };
            updates.confirmationLearningCurve = learnedCurve;
          }

          // 🔥 TERMÔMETRO DE PRESENÇA COM IA (Disparo Motivacional se o ritmo estiver abaixo do aprendido ou < 12 na Quarta / < 14 na Quinta)
          const isWedMotivationWindow = br.dayOfWeek === 3 && br.hour === 18;
          const isThuMorningMotivationWindow = br.dayOfWeek === 4 && br.hour === 11;
          const isThuAfternoonMotivationWindow = br.dayOfWeek === 4 && br.hour === 15;
          const motivationSlotKey = isWedMotivationWindow
            ? `${br.dateKey}_mot_wed_18h`
            : isThuMorningMotivationWindow
            ? `${br.dateKey}_mot_thu_11h`
            : isThuAfternoonMotivationWindow
            ? `${br.dateKey}_mot_thu_15h`
            : null;

          if (motivationSlotKey && schedData.lastMotivationBroadcastSlot !== motivationSlotKey) {
            const baseThreshold = br.dayOfWeek === 3 ? 12 : 14;
            const learnedAvg = learnedCurve[checkpointBucket]?.avgCount || baseThreshold;
            // Usa o limite adaptativo (média aprendida do grupo com piso de 12 na quarta e 14 na quinta)
            const dynamicTarget = Math.max(baseThreshold, Math.round(learnedAvg * 0.9));
            const settersConfirmed = goingList.filter((p) => p.isOfficialSetter).length;
            const needsMotivation = goingList.length < dynamicTarget || (br.dayOfWeek === 4 && settersConfirmed < 2);

            if (needsMotivation) {
              updates.lastMotivationBroadcastSlot = motivationSlotKey;
              const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
              const missingForTwoTeams = Math.max(0, 12 - goingList.length);
              const missingForThreeTeams = Math.max(0, 18 - goingList.length);
              const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
              let aiMotivationText = "";

              if (apiKey) {
                try {
                  const motPrompt = `Você é o Guerreirinho, o robô mascote do clube de vôlei "Guerreiros VC".
Analise o ritmo atual da lista de quinta-feira (${formattedDate}) e escreva uma convocação curta, bem-humorada e empolgante para o grupo do WhatsApp motivando os sócios indecisos a confirmarem presença agora!

DADOS EM TEMPO REAL DO CLUBE:
- Confirmados até agora: ${goingList.length} de ${totalActivePool} sócios ativos (${settersConfirmed} levantadores confirmados).
- Média histórica habitual do grupo neste horário: ~${Math.round(learnedAvg)} confirmados (Meta esperada agora: ${dynamicTarget}).
- ${missingForTwoTeams > 0 ? `Faltam apenas ${missingForTwoTeams} atletas para fecharmos os 2 primeiros times completos (12 jogadores)!` : `Já temos ${goingList.length} confirmados e faltam só ${missingForThreeTeams} para fecharmos 3 times completos (18 jogadores)!`}

REGRAS:
1. Máximo de 2 parágrafos curtos, usando *negrito* e emojis de vôlei/fogo.
2. Mencione de forma natural os números reais acima (quantos já confirmaram e quantos faltam para fechar mais um time ou igualar o ritmo habitual da turma).
3. Não coloque os links na sua resposta (eles serão anexados automaticamente no rodapé).`;

                  const aiResp = await routedGenerateContent({
                    task: "motivation",
                    contents: motPrompt
                  });
                  aiMotivationText = (aiResp.text || "").trim();
                } catch {}
              }

              if (!aiMotivationText) {
                aiMotivationText =
                  missingForTwoTeams > 0
                    ? `🚨🏐 *CONVOCAÇÃO DO GUERREIRINHO — BORA REAGIR, GALERA!* 🔥\n\nAté agora estamos com *${goingList.length}/${totalActivePool} confirmados* para quinta-feira (${formattedDate}) — abaixo do nosso ritmo habitual de *~${Math.round(learnedAvg)} atletas* neste horário! Faltam só *${missingForTwoTeams} guerreiros(as)* para fecharmos os 2 primeiros times na quadra!`
                    : `⚡🏐 *TERMÔMETRO DE QUINTA (${formattedDate}) — QUASE LÁ!* 🔥\n\nJá somos *${goingList.length}/${totalActivePool} confirmados* (${settersConfirmed} levantadores), mas nossa média neste horário costuma bater *${dynamicTarget} atletas*! Faltam apenas *${missingForThreeTeams} confirmações* para garantirmos 3 times rodando redondo!`;
              }

              messagesToSend.push({
                to: groupJid,
                text:
                  `${aiMotivationText}\n\n` +
                  `───────────────────\n` +
                  `📱 *Confirme pelo App:*\nhttps://guerreiros-volleyball-club-238897290870.us-west1.run.app/?tab=intentions\n\n` +
                  `🤖 *Ou confirme em 1 clique pelo Robô:*\n` +
                  `🟢 *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n` +
                  `🔴 *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou\n\n` +
                  `— Guerreirinho, o robô do clube 🤖`
              });
            }
          }

          const prevBroadcastSig = String(schedData.lastBroadcastSignature || "");
          const prevSameDate = prevBroadcastSig.startsWith(`${targetDate}|`);
          const prevBroadcastKeys = new Set(
            prevSameDate
              ? (prevBroadcastSig.split("|")[2] || "").split(",").filter(Boolean)
              : []
          );
          const currentCanonicalKeys = goingList.map(getCanonicalPlayerIdentityKey).filter(Boolean);
          const hasNewConfirmation =
            !prevSameDate || currentCanonicalKeys.some((k) => !prevBroadcastKeys.has(k));

          const prevBroadcastCountMatch = prevBroadcastSig.match(/\|count:(\d+)\|/);
          const prevBroadcastCount = prevBroadcastCountMatch ? Number(prevBroadcastCountMatch[1]) : -1;
          const lastBroadcastAt = Number(schedData.lastBroadcastAt || 0);
          const sameCountTooRecent =
            prevBroadcastCount === goingList.length && Date.now() - lastBroadcastAt < 30 * 60 * 1000;

          if (currentSignature !== prevBroadcastSig && !hasNewConfirmation) {
            // Apenas ausências/remoções sem nenhuma nova confirmação: sincroniza assinatura silenciosamente sem enviar mensagem no grupo
            updates.lastBroadcastSignature = currentSignature;
          } else if (
            goingList.length > 0 &&
            currentSignature !== prevBroadcastSig &&
            hasNewConfirmation &&
            !sameCountTooRecent
          ) {
            updates.lastBroadcastSignature = currentSignature;
            updates.lastBroadcastAt = Date.now();
            const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
            const settersCount = goingList.filter((p) => p.isOfficialSetter).length;

            const count = goingList.length;
            let statusNoite = "";
            if (count < 6) {
              statusNoite = "🔥 *Status da Noite:* Montando a base... Faltam guerreiros para o primeiro time!";
            } else if (count < 12) {
              statusNoite = "🔥 *Status da Noite:* Esquentando o braço! Já temos o início de um jogaço.";
            } else if (count < 18) {
              statusNoite = "🔥 *Status da Noite:* Já temos 2 times formados na quadra! O bicho vai pegar! ⚡";
            } else if (count < 24) {
              statusNoite = "🔥 *Status da Noite:* Presença forte! Vamos rodar 3 times completos sem tempo ruim.";
            } else {
              statusNoite = "🔥 *Status da Noite:* Quadra estourando de gente! Sócios em peso, rodízio pesado e nível lá no alto! 🚀";
            }

            const frasesResenha = [
              "\"Aquecimento em dia, passe na mão e braço duro para matar o ponto!\"",
              "\"Quem tem um bom levantador na quadra joga com tranquilidade.\"",
              "\"Defesa difícil é aquela que a gente busca com a alma e levanta de manchete.\"",
              "\"O bloqueio fecha a porta, a defesa recolhe o resto e o ataque decide!\""
            ];
            const fraseAleatoria = frasesResenha[Math.floor(Math.random() * frasesResenha.length)];

            messagesToSend.push({
              to: groupJid,
              text:
                `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
                `✅ *Confirmados:* ${goingList.length}/${totalActivePool} (${settersCount} Levantadores)\n` +
                goingList
                  .map((p, i) => `${i + 1}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
                  .join("\n") +
                `\n\n${statusNoite}\n` +
                `💬 *${fraseAleatoria}*\n` +
                `───────────────────\n` +
                `🤖 *FALE COM O GUERREIRINHO NO PRIVADO (1 CLIQUE OU ÁUDIO):*\n` +
                `✅ *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n\n` +
                `❌ *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`
            });
          }
        }
      }

      // 📍 CONVITE NO GRUPO ÀS 19:00 DE QUINTA PARA COMPARTILHAR LOCALIZAÇÃO (1 HORA / RAIO 150M / LIMITE 22H) + CLIMA & ROTAS WAZE/MAPS
      // Só dispara quando o Admin habilitar a função para o clube (autoGeoCheckInEnabled === true)
      const isAutoGeoEnabledForClub = systemConfig?.autoGeoCheckInEnabled === true;
      const activeGeofenceRadius = Number(systemConfig?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS);
      const activeCourtLat = Number(systemConfig?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
      const activeCourtLng = Number(systemConfig?.courtLocation?.lng ?? DEFAULT_COURT_LNG);

      const isThu19hGeoInviteWindow = isAutoGeoEnabledForClub && isThursday && br.hour === 19 && br.minute < 30;
      const thu19hGeoSlotKey = `${br.dateKey}_thu_19h_geo_invite`;
      if (isThu19hGeoInviteWindow && schedData.lastThu19hGeoInviteSlot !== thu19hGeoSlotKey) {
        updates.lastThu19hGeoInviteSlot = thu19hGeoSlotKey;
        const thuWeather = await fetchCourtWeatherForecast(activeCourtLat, activeCourtLng);
        messagesToSend.push({
          to: groupJid,
          text:
            `📍🏐 *CHECK-IN AUTOMÁTICO NA QUADRA LIBERADO! (19h às 22h)* 🔥\n\n` +
            `Fala, Guerreiros! Já está valendo a fila de chegada automática para o vôlei de hoje (raio de *${activeGeofenceRadius}m* da quadra, até às *22h00*).\n\n` +
            `${thuWeather.whatsappBlock}\n\n` +
            `1️⃣ *Pelo WhatsApp (no meu privado — funciona com o celular no bolso):*\n` +
            `Ao sair para a quadra, abra meu privado 👉 https://wa.me/558197330924\n` +
            `Toque em *📎 (ou + no iPhone) → Localização → Localização em tempo real* e selecione *1 HORA*!\n\n` +
            `⚠️ *IMPORTANTE:* escolha sempre *1 HORA* (e não 15 minutos), para evitar que o sinal expire no trajeto se você levar 20 minutos ou mais até a quadra! Assim que entrar no raio de ${activeGeofenceRadius}m, eu confirmo sua presença, envio sua posição na fila e você já pode parar o compartilhamento.\n\n` +
            `2️⃣ *Pelo App dos Guerreiros:*\n` +
            `Com o app aberto ao se aproximar da quadra (entre *19h e 22h*), sua presença também é confirmada automaticamente com aviso no WhatsApp e no celular!\n\n` +
            `⏰ _Quem compartilhar a localização e não chegar até às *20h45* receberá uma mensagem no privado perguntando se ainda vem — em caso de desistência, é só avisar que o sinal de GPS é desligado automaticamente._\n\n` +
            `Bora pra quadra! 🏐⚡\n— Guerreirinho, o robô do clube 🤖`
        });
      }

      // ⏰ FOLLOW-UP PRIVADO ÀS 20:45 DE QUINTA PARA QUEM COMPARTILHOU LOCALIZAÇÃO E AINDA NÃO CHEGOU
      const isThu2045FollowupWindow =
        isAutoGeoEnabledForClub &&
        isThursday &&
        br.totalMinutes >= 20 * 60 + 45 &&
        br.totalMinutes < 21 * 60 + 30;
      const thu2045SlotKey = `${br.dateKey}_thu_2045_geo_followup`;
      if (isThu2045FollowupWindow && schedData.lastThu2045GeoFollowupSlot !== thu2045SlotKey) {
        const watchersByDate = (schedData.courtLocationWatchersByDate || {}) as Record<
          string,
          Record<string, PendingCourtGeoWatcher>
        >;
        const todayWatchers: Record<string, PendingCourtGeoWatcher> = {
          ...(watchersByDate[br.dateKey] || {})
        };
        const pendingWatcherIds = Object.keys(todayWatchers).filter((pid) => {
          const w = todayWatchers[pid];
          return w && !w.arrived && !w.optedOut && !w.remindedAt2045;
        });

        updates.lastThu2045GeoFollowupSlot = thu2045SlotKey;

        if (pendingWatcherIds.length > 0) {
          const presentIdsToday = new Set<string>();
          await withFirestoreGuard(async () => {
            const attSnap = await db.collection("attendance").doc(br.dateKey).collection("players").get();
            attSnap.forEach((d: any) => {
              const dData = d.data();
              if (dData && dData.status !== "left" && !dData.isDM) {
                presentIdsToday.add(d.id);
              }
            });
          }, undefined);

          let delayIdx = 0;
          pendingWatcherIds.forEach((pid) => {
            if (presentIdsToday.has(pid)) {
              todayWatchers[pid] = { ...todayWatchers[pid], arrived: true };
              return;
            }
            const player = activePlayers.find((p) => p.id === pid);
            if (!player || !isEligibleClubMemberForPrivateAutomations(player)) return;
            const targets = resolvePlayerWhatsAppTargets(player);
            if (targets.length === 0) return;

            const firstName = String(player.name || "Guerreiro").trim().split(/\s+/)[0] || "Guerreiro";
            todayWatchers[pid] = {
              ...todayWatchers[pid],
              remindedAt2045: true,
              lastUpdatedAt: Date.now()
            };

            messagesToSend.push({
              to: targets[0],
              fallbackTargets: targets.slice(1),
              delayMs: delayIdx * 8000,
              text:
                `⏰📍 *Fala, ${firstName}! Você ainda vem pro vôlei hoje?* 🏐\n\n` +
                `Vi que você compartilhou sua localização mais cedo, mas ainda não detectamos sua chegada na quadra (o limite para check-in automático vai até às *22h00*).\n\n` +
                `🚗 *Ainda estou indo:*\n` +
                `https://wa.me/558197330924?text=gv%20toindo\n\n` +
                `❌ *Não vou mais (Desligar GPS):*\n` +
                `https://wa.me/558197330924?text=gv%20naovou\n\n` +
                `_Se não puder ir hoje, toque na opção acima que eu desligo o sinal de GPS do app automaticamente — e você já pode tocar em "Parar de compartilhar" aqui no WhatsApp para economizar bateria._\n\n` +
                `— Guerreirinho, o robô do clube 🤖`
            });
            delayIdx++;
          });

          updates.courtLocationWatchersByDate = {
            ...watchersByDate,
            [br.dateKey]: todayWatchers
          };
        }
      }

      // 🏆 DISPARO AUTOMÁTICO PÓS-JOGO NO GRUPO + RESUMO INDIVIDUAL NO PRIVADO ÀS 22:10 DE QUINTA
      const isAfter10PMWindow =
        (br.dayOfWeek === 4 && br.totalMinutes >= 22 * 60) ||
        (br.dayOfWeek === 5 && br.totalMinutes <= 60);
      const isPrivateNightSummaryWindow =
        (br.dayOfWeek === 4 && br.totalMinutes >= 22 * 60 + 10) ||
        (br.dayOfWeek === 5 && br.totalMinutes <= 60);

      if (isAfter10PMWindow) {
        const allMatchesNow = await getCachedMatches(true);
        const todayOrYesterdayKey =
          br.dayOfWeek === 5 && br.totalMinutes <= 60
            ? getFirestoreDateKey(new Date(Date.now() - 2 * 60 * 60 * 1000))
            : br.dateKey;

        const matchesToday = allMatchesNow.filter((m) => {
          const mDate =
            m.date || (m.timestamp ? getFirestoreDateKey(new Date(Number(m.timestamp))) : "");
          return mDate === todayOrYesterdayKey;
        });

        if (matchesToday.length >= 1) {
          const freshPlayers = await getCachedPlayers(true);
          const lastSavedTs = Math.max(
            ...matchesToday.map((m) => Number(m.updatedAt || m.createdAt || m.timestamp || 0))
          );
          const minutesSinceLastSave = lastSavedTs > 0 ? (Date.now() - lastSavedTs) / 60000 : 0;
          const matchSessionSignature = `${todayOrYesterdayKey}_count_${matchesToday.length}`;

          // 1) Ranking consolidado do dia no grupo (após 22:00 + 15 min da última partida)
          if (
            minutesSinceLastSave >= 15 &&
            minutesSinceLastSave <= 180 &&
            schedData.lastPostGameRankingSignature !== matchSessionSignature
          ) {
            const dayRankingMsg = buildPostGameSummaryAndDayRanking(
              matchesToday,
              freshPlayers,
              todayOrYesterdayKey
            );

            const allActiveSorted = freshPlayers
              .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
              .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

            const generalRankingMsg =
              `🏆 *RANKING GERAL ACUMULADO ATUALIZADO (${allActiveSorted.length} SÓCIOS)* 🏆\n\n` +
              allActiveSorted
                .map((p, i) => {
                  const wr =
                    p.matchesPlayed > 0 ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0;
                  return `${String(i + 1).padStart(2, "0")}. *${p.name}* — *${Math.round(p.elo || 1200)} pts* (${p.wins || 0}V/${p.losses || 0}D • ${wr}%)`;
                })
                .join("\n") +
              `\n\n— Guerreirinho, o robô do clube 🤖`;

            if (dayRankingMsg) {
              updates.lastPostGameRankingSignature = matchSessionSignature;
              updates.lastPostGameSummaryDate = todayOrYesterdayKey;
              const cronVmImageOnly =
                bridgeSupportsMedia && getWhatsAppCardDeliveryMode() === "vm_image_only";

              let dailyCardUrl: string | undefined;
              let dailyCardCaption = `🔥 *RANKING DO DIA — ${todayOrYesterdayKey}* • Guerreiros VC`;
              if (cronVmImageOnly) {
                try {
                  const dailyCardData = computeDailyRankingData(matchesToday, freshPlayers, todayOrYesterdayKey);
                  if (dailyCardData) {
                    dailyCardUrl = `${publicBaseUrl}/api/cards/daily-ranking.png?date=${encodeURIComponent(todayOrYesterdayKey)}`;
                    dailyCardCaption = `🔥 *RANKING DO DIA — ${dailyCardData.dateLabel}* (${dailyCardData.totalMatches} jogos • ${dailyCardData.totalAthletes} atletas) • MVP: *${dailyCardData.mvp?.firstName || "-"}*`;
                  }
                } catch (cardErr) {
                  console.warn("[Cron] Falha ao montar metadados do PNG do Ranking do Dia:", cardErr);
                }
              }

              messagesToSend.push({
                to: groupJid,
                text: cronVmImageOnly && dailyCardUrl ? "" : dayRankingMsg,
                ...(cronVmImageOnly && dailyCardUrl
                  ? {
                      mediaFetchUrl: dailyCardUrl,
                      mediaType: "image" as const,
                      mimetype: "image/png",
                      fileName: `guerreiros_ranking_dia_${todayOrYesterdayKey}.png`,
                      caption: dailyCardCaption,
                      imageOnly: true
                    }
                  : {})
              });

              if (allActiveSorted.length > 0) {
                let accCardUrl: string | undefined;
                let accCardCaption = `🏆 *RANKING GERAL ACUMULADO (${allActiveSorted.length} SÓCIOS)* • Guerreiros VC`;
                if (cronVmImageOnly) {
                  try {
                    const accCardData = computeAccumulatedRankingData(allMatchesNow, freshPlayers);
                    accCardUrl = `${publicBaseUrl}/api/cards/accumulated-ranking.png`;
                    accCardCaption = `🏆 *RANKING GERAL ACUMULADO (${accCardData.topRows.length} SÓCIOS)* • Atualizado em ${accCardData.referenceDateLabel}`;
                  } catch (cardErr) {
                    console.warn("[Cron] Falha ao montar metadados do PNG do Ranking Acumulado:", cardErr);
                  }
                }

                messagesToSend.push({
                  to: groupJid,
                  delayMs: 5000,
                  text: cronVmImageOnly && accCardUrl ? "" : generalRankingMsg,
                  ...(cronVmImageOnly && accCardUrl
                    ? {
                        mediaFetchUrl: accCardUrl,
                        mediaType: "image" as const,
                        mimetype: "image/png",
                        fileName: `guerreiros_ranking_acumulado_${todayOrYesterdayKey}.png`,
                        caption: accCardCaption,
                        imageOnly: true
                      }
                    : {})
                });
              }
            }
          }

          // 2) Resumo individual (gv dia) no PRIVADO de cada sócio participante às 22:10 de quinta-feira
          if (isPrivateNightSummaryWindow) {
            const sentNightMap: Record<string, string[]> = {
              ...(schedData.sentNightSummaryByDate || {})
            };
            const alreadySentIds = new Set<string>(
              Array.isArray(sentNightMap[todayOrYesterdayKey])
                ? sentNightMap[todayOrYesterdayKey]
                : []
            );

            const participantIdSet = new Set<string>();
            matchesToday.forEach((m) => {
              extractTeamIds(m.teamA).forEach((id) => participantIdSet.add(id));
              extractTeamIds(m.teamB).forEach((id) => participantIdSet.add(id));
            });

            const participatingPlayers = freshPlayers.filter(
              (p) =>
                p &&
                !p.isDM &&
                (participantIdSet.has(p.id) || (p.uid && participantIdSet.has(p.uid))) &&
                !alreadySentIds.has(p.id)
            );

            let scheduledPrivateCount = 0;
            const cronPrivVmImageOnly =
              bridgeSupportsMedia && getWhatsAppCardDeliveryMode() === "vm_image_only";
            participatingPlayers.forEach((p) => {
              const targets = resolvePlayerWhatsAppTargets(p);
              if (targets.length === 0) {
                console.warn(
                  `[Cron 22:10] Sócio ${p.name} (${p.id}) jogou em ${todayOrYesterdayKey} mas não possui WhatsApp/JID cadastrado.`
                );
                return;
              }
              const personalReport = buildPlayerNightTimelineReport(
                p,
                matchesToday,
                freshPlayers,
                todayOrYesterdayKey
              );
              const finalPersonalText = `${personalReport}\n\n— Guerreirinho, o robô do clube 🤖`;

              let personalCardUrl: string | undefined;
              let personalCardCaption = `🏐 *RESUMO INDIVIDUAL — ${p.name.split(" ")[0]}* (${todayOrYesterdayKey})`;
              if (cronPrivVmImageOnly) {
                try {
                  const indData = computeIndividualNightData(p, matchesToday, freshPlayers, todayOrYesterdayKey);
                  if (indData) {
                    personalCardUrl = `${publicBaseUrl}/api/cards/individual.png?playerId=${encodeURIComponent(p.id)}&date=${encodeURIComponent(todayOrYesterdayKey)}`;
                    personalCardCaption = `🏐 *RESUMO INDIVIDUAL — ${indData.firstName}* (${indData.dateLabel}) • ${indData.wins}V/${indData.losses}D (${indData.winRate}%) • ${indData.eloDelta >= 0 ? "+" : ""}${indData.eloDelta} ELO`;
                  }
                } catch (cardErr) {
                  console.warn(`[Cron 22:10] Falha ao montar metadados do PNG individual de ${p.name}:`, cardErr);
                }
              }

              messagesToSend.push({
                to: targets[0],
                fallbackTargets: targets.slice(1),
                delayMs: scheduledPrivateCount * 3500,
                text: cronPrivVmImageOnly && personalCardUrl ? "" : finalPersonalText,
                ...(cronPrivVmImageOnly && personalCardUrl
                  ? {
                      mediaFetchUrl: personalCardUrl,
                      mediaType: "image" as const,
                      mimetype: "image/png",
                      fileName: `guerreiros_noite_${todayOrYesterdayKey}_${p.id}.png`,
                      caption: personalCardCaption,
                      imageOnly: true
                    }
                  : {})
              });

              if (!dryRun) {
                alreadySentIds.add(p.id);
                recordWhatsAppCommLog({
                  type: "NIGHT_SUMMARY_PRIVATE",
                  recipient: targets[0],
                  recipientLabel: p.name,
                  status: "SENT",
                  summary: `Resumo da noite (22:10) agendado no privado de ${p.name}`,
                  messagePreview: finalPersonalText
                });
              }
              scheduledPrivateCount++;
            });

            if (!dryRun && scheduledPrivateCount > 0) {
              const recentNightKeys = Object.keys(sentNightMap).sort().slice(-3);
              const prunedNightMap: Record<string, string[]> = {};
              recentNightKeys.forEach((k) => {
                prunedNightMap[k] = sentNightMap[k];
              });
              prunedNightMap[todayOrYesterdayKey] = Array.from(alreadySentIds);
              updates.sentNightSummaryByDate = prunedNightMap;
              updates.lastIndividualNightSummaryDate = todayOrYesterdayKey;
            }
          }
        }
      }

      // Trava Anti-Repetição Diária: impede que a mesma mensagem (ou pílula diária) seja enviada 2x no mesmo dia
      const sentTodayMap: Record<string, string[]> = { ...(schedData.sentDailySignatures || {}) };
      const todaySignatures = new Set<string>(Array.isArray(sentTodayMap[br.dateKey]) ? sentTodayMap[br.dateKey] : []);

      const deduplicatedMessages = messagesToSend.filter((m) => {
        // Mensagens drenadas da fila de retentativa (outbox) nunca devem ser bloqueadas por assinatura diária
        if (m.isOutbox) return true;

        const cleanHeader = String(m.text || (m as any).caption || m.fileName || "").trim().slice(0, 120);
        const sig = `${m.to}|${cleanHeader}`;
        // Bloqueia qualquer repetição de Pílula/Curiosidade no mesmo dia ou mesma assinatura exata de mensagem
        const isDailyPillOrCuriosity =
          cleanHeader.includes("PÍLULA DO VÔLEI") ||
          cleanHeader.includes("CURIOSIDADE DA SELEÇÃO");
        const pillKey = isDailyPillOrCuriosity ? `DAILY_PILL_${br.dateKey}` : sig;

        if (todaySignatures.has(sig) || todaySignatures.has(pillKey)) {
          return false;
        }
        if (!dryRun) {
          todaySignatures.add(sig);
          todaySignatures.add(pillKey);
        }
        return true;
      });

      if (!dryRun && (Object.keys(updates).length > 0 || deduplicatedMessages.length > 0)) {
        // Mantém apenas as assinaturas dos últimos 3 dias para o documento continuar leve
        const recentDateKeys = Object.keys(sentTodayMap).sort().slice(-2);
        const prunedSignatures: Record<string, string[]> = {};
        recentDateKeys.forEach((k) => {
          prunedSignatures[k] = sentTodayMap[k];
        });
        prunedSignatures[br.dateKey] = Array.from(todaySignatures);
        updates.sentDailySignatures = prunedSignatures;

        cachedScheduler = { ...schedData, ...updates };
        saveLocalSchedulerBackup(cachedScheduler);
        await withFirestoreGuard(() => schedRef.set(updates, { merge: true }), undefined);
      }

      // Não tenta Evolution API (o clube opera via bot na VM Google).
      // Retorna as mensagens prontas diretamente para a VM Google entregar no WhatsApp.
      res.json({
        success: true,
        messages: deduplicatedMessages,
        ...(photoSyncTask ? { photoSyncTask } : {}),
        ...(dryRun ? { dryRun: true } : {})
      });
    } catch (err: any) {
      res.status(200).json({ success: false, messages: [], error: err.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      if (!isWhatsAppBotEnabled()) {
        return res.status(200).json({ ignored: true, reason: "bot_disabled" });
      }

      const validated = validateIncomingJsonPayload(req.body, "whatsapp/webhook");
      if (!validated.valid) {
        return res.status(200).json({ ignored: true, reason: "invalid_json_payload", error: validated.reason });
      }
      const body = validated.data;
      const rawPayload = body.payload ?? body.data ?? body;
      const parsedRawPayload = isPlainObject(rawPayload)
        ? rawPayload
        : typeof rawPayload === "string"
        ? safeJsonParse<Record<string, any>>(rawPayload, "whatsapp/webhook:payload", {})
        : body;
      const payload = Array.isArray(parsedRawPayload?.messages) && isPlainObject(parsedRawPayload.messages[0])
        ? parsedRawPayload.messages[0]
        : Array.isArray(body?.messages) && isPlainObject(body.messages[0])
        ? body.messages[0]
        : parsedRawPayload;

      const unwrapMessageRoot = (m: any): any => {
        let cur = m;
        for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
          if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
          else if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
          else if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
          else if (cur.viewOnceMessageV2Extension?.message) cur = cur.viewOnceMessageV2Extension.message;
          else if (cur.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
          else break;
        }
        return cur;
      };

      const msgRoot = unwrapMessageRoot(payload?.message || payload);

      let rawText: string =
        payload.body ||
        payload.text ||
        body.text ||
        msgRoot?.conversation ||
        msgRoot?.extendedTextMessage?.text ||
        msgRoot?.buttonsResponseMessage?.selectedDisplayText ||
        msgRoot?.listResponseMessage?.title ||
        payload?.message?.conversation ||
        payload?.message?.extendedTextMessage?.text ||
        "";

      // Varredura recursiva profunda para encontrar coordenadas em qualquer formato do conector WhatsApp (Baileys / WPPConnect / WAHA / Venom)
      function deepExtractLocation(obj: any, depth = 0): {
        lat: number;
        lng: number;
        name: string;
        address: string;
        isLive: boolean;
      } | null {
        if (!obj || typeof obj !== "object" || depth > 5) return null;

        const candLat =
          obj.degreesLatitude ??
          obj.latitude ??
          obj.lat ??
          obj?.location?.degreesLatitude ??
          obj?.location?.latitude ??
          obj?.location?.lat;
        const candLng =
          obj.degreesLongitude ??
          obj.longitude ??
          obj.lng ??
          obj.lon ??
          obj?.location?.degreesLongitude ??
          obj?.location?.longitude ??
          obj?.location?.lng;

        if (
          candLat !== undefined &&
          candLat !== null &&
          candLat !== "" &&
          candLng !== undefined &&
          candLng !== null &&
          candLng !== "" &&
          !isNaN(Number(candLat)) &&
          !isNaN(Number(candLng)) &&
          Math.abs(Number(candLat)) <= 90 &&
          Math.abs(Number(candLng)) <= 180 &&
          ( Number(candLat) !== 0 || Number(candLng) !== 0 )
        ) {
          return {
            lat: Number(candLat),
            lng: Number(candLng),
            name: String(obj.name || obj.title || obj?.location?.name || ""),
            address: String(obj.address || obj.description || obj?.location?.address || ""),
            isLive: Boolean(
              obj.liveLocationMessage ||
                obj.isLive ||
                obj.type === "liveLocation" ||
                obj.messageType === "liveLocationMessage"
            )
          };
        }

        for (const k of Object.keys(obj)) {
          if (k === "jpegThumbnail" || k === "base64" || k === "contextInfo") continue;
          const val = obj[k];
          if (val && typeof val === "object") {
            const found = deepExtractLocation(val, depth + 1);
            if (found) {
              if (k === "liveLocationMessage") found.isLive = true;
              return found;
            }
          }
        }
        return null;
      }

      const locMsg =
        msgRoot?.locationMessage ||
        msgRoot?.liveLocationMessage ||
        payload?.locationMessage ||
        payload?.liveLocationMessage ||
        payload?.location ||
        (payload?.type === "location" || payload?.messageType === "locationMessage" || payload?.messageType === "liveLocationMessage"
          ? payload
          : null) ||
        (typeof payload?.lat !== "undefined" && typeof payload?.lng !== "undefined"
          ? { degreesLatitude: payload.lat, degreesLongitude: payload.lng }
          : null) ||
        (typeof payload?.latitude !== "undefined" && typeof payload?.longitude !== "undefined"
          ? { degreesLatitude: payload.latitude, degreesLongitude: payload.longitude }
          : null);

      const rawLat =
        locMsg?.degreesLatitude ??
        locMsg?.latitude ??
        locMsg?.lat ??
        payload?.degreesLatitude ??
        payload?.latitude ??
        payload?.lat;
      const rawLng =
        locMsg?.degreesLongitude ??
        locMsg?.longitude ??
        locMsg?.lng ??
        locMsg?.lon ??
        payload?.degreesLongitude ??
        payload?.longitude ??
        payload?.lng;

      // Fallback: se o conector enviar link de Google Maps ou coordenadas em texto (ex: -8.1315, -34.9073)
      let parsedTextLat: number | null = null;
      let parsedTextLng: number | null = null;
      if ((rawLat === undefined || rawLng === undefined) && rawText) {
        const coordMatch = String(rawText).match(/(-?\d{1,2}\.\d{4,})\s*[,;\s]\s*(-?\d{1,3}\.\d{4,})/);
        if (coordMatch) {
          parsedTextLat = Number(coordMatch[1]);
          parsedTextLng = Number(coordMatch[2]);
        }
      }

      const finalLat = rawLat !== undefined && rawLat !== null && rawLat !== "" ? Number(rawLat) : parsedTextLat;
      const finalLng = rawLng !== undefined && rawLng !== null && rawLng !== "" ? Number(rawLng) : parsedTextLng;

      const incomingLocation =
        finalLat !== null &&
        finalLng !== null &&
        !isNaN(finalLat) &&
        !isNaN(finalLng) &&
        (finalLat !== 0 || finalLng !== 0)
          ? {
              lat: finalLat,
              lng: finalLng,
              name: locMsg?.name || locMsg?.title || "",
              address: locMsg?.address || locMsg?.description || "",
              isLive: Boolean(
                msgRoot?.liveLocationMessage ||
                  payload?.liveLocationMessage ||
                  payload?.messageType === "liveLocationMessage"
              )
            }
          : deepExtractLocation(body);

      const imageMessage = msgRoot?.imageMessage || payload?.imageMessage;
      if (!rawText && imageMessage?.caption) {
        rawText = String(imageMessage.caption);
      }
      const audioMessage = msgRoot?.audioMessage || payload?.audioMessage;
      let audioBuffer: Buffer | null = null;
      let audioMimeType = "audio/ogg";

      if (audioMessage) {
        try {
          if (audioMessage.base64) {
            audioBuffer = Buffer.from(audioMessage.base64, "base64");
            audioMimeType = audioMessage.mimetype || "audio/ogg";
          } else if (audioMessage.url) {
            const respAudio = await fetch(audioMessage.url);
            const arrayBuf = await respAudio.arrayBuffer();
            audioBuffer = Buffer.from(arrayBuf);
          }
        } catch (e) {
          console.warn("[Webhook] Falha ao baixar áudio:", e);
        }
      }

      const text = String(rawText).trim();
      if (!text && !audioBuffer && !incomingLocation && !imageMessage) {
        return res.status(200).json({ ignored: true, reason: "empty" });
      }

      const isBotGeneratedOutput =
        text.startsWith("🏐") ||
        text.startsWith("📋") ||
        text.startsWith("🏆") ||
        text.startsWith("🔥 *RANKING") ||
        text.startsWith("💰 *TESOURARIA") ||
        text.startsWith("📊 *RAIO-X") ||
        text.startsWith("✅ *") ||
        text.startsWith("⚠️") ||
        text.startsWith("📝 Registrado") ||
        text.startsWith("📍🏐") ||
        text.startsWith("📍 *Você ainda está longe") ||
        text.startsWith("🚫 *Localização") ||
        text.startsWith("⏰ Olá") ||
        text.startsWith("📩 ") ||
        text.startsWith("🤖");

      if (isBotGeneratedOutput && !audioBuffer && !incomingLocation) {
        return res.status(200).json({ ignored: true, reason: "bot_output" });
      }

      const stripDeviceSuffixFromJid = (jid: string): string => {
        const clean = String(jid || "").trim();
        if (!clean.includes("@")) return clean;
        const [userPart, domainPart] = clean.split("@");
        return `${userPart.split(":")[0]}@${domainPart}`;
      };

      const isFromMe = Boolean(payload.fromMe || payload?.key?.fromMe);
      const rawChatId: string =
        payload.from ||
        payload?.key?.remoteJid ||
        payload.chatId ||
        payload.remoteJid ||
        body.from ||
        "";
      const chatId: string = stripDeviceSuffixFromJid(rawChatId);
      const isGroup = chatId.endsWith("@g.us");
      const lower = text.toLowerCase().trim();

      const isAliasTrigger = /^@?(gv|bot|botgv|guerreirinho)($|[\s,!?:.\-])/i.test(lower);

      // CORREÇÃO CRÍTICA: Permite incomingLocation mesmo quando isFromMe === true (quando você testa do seu próprio WhatsApp!)
      if (isFromMe && !isAliasTrigger && !audioBuffer && !incomingLocation) {
        return res.status(200).json({ ignored: true, reason: "fromMe_non_command" });
      }

      const isPrivateChat = Boolean(
        chatId &&
          !isGroup &&
          !chatId.endsWith("@broadcast") &&
          chatId !== "status@broadcast" &&
          (payload.toMe ||
            chatId.endsWith("@s.whatsapp.net") ||
            chatId.endsWith("@lid") ||
            chatId.endsWith("@c.us"))
      );
      const isPhotoCaptionTrigger = Boolean(
        imageMessage && /(^|\s)(gv\s*)?(foto|perfil|minha\s*foto)(\s|$)/i.test(lower)
      );
      const isTrigger =
        isPrivateChat ||
        Boolean(incomingLocation) ||
        Boolean(audioBuffer && !isGroup) ||
        isPhotoCaptionTrigger ||
        isAliasTrigger ||
        lower.startsWith("!") ||
        lower.startsWith("/") ||
        lower.startsWith("@guerreiros") ||
        lower.startsWith("guerreiros,");

      // Captura passiva de telefone + foto do WhatsApp mesmo em mensagens normais do grupo
      if (!isTrigger) {
        try {
          const passiveJid: string =
            payload.participant || payload.author || payload?.key?.participant || chatId;
          const passiveIsLid = String(passiveJid).endsWith("@lid");
          const passiveLid = payload.participantLid || (passiveIsLid ? String(passiveJid) : "");
          const passiveAltPhone =
            payload.senderPn ||
            payload?.key?.senderPn ||
            payload?.key?.participantAlt ||
            payload?.key?.remoteJidAlt ||
            payload.participantAlt ||
            (!passiveIsLid ? String(passiveJid).split("@")[0] : "");
          const passivePhone = String(passiveAltPhone || "").split("@")[0].replace(/\D/g, "");
          const passiveVerifiedJid =
            passivePhone.length >= 10 && passivePhone.length <= 13
              ? `${passivePhone}@s.whatsapp.net`
              : null;
          const passivePic =
            payload.profilePictureUrl ||
            payload.senderPhoto ||
            payload.picture ||
            payload.avatar ||
            body.profilePictureUrl ||
            null;

          if (passivePhone.length >= 10 || passiveLid || passivePic) {
            const dbPassive = await getFirestore();
            const playersPassive = await getCachedPlayers(false);
            const matched = playersPassive.find(
              (p) =>
                (passiveLid && p.whatsappLid === passiveLid) ||
                (passivePhone.length >= 8 && matchBrazilianPhone(passivePhone, p.phone))
            );
            if (matched && !String(matched.id).startsWith("wa_")) {
              const up: Record<string, any> = {};
              if (passiveLid && matched.whatsappLid !== passiveLid) {
                matched.whatsappLid = passiveLid;
                up.whatsappLid = passiveLid;
              }
              if (passiveVerifiedJid && matched.whatsappJid !== passiveVerifiedJid) {
                matched.whatsappJid = passiveVerifiedJid;
                up.whatsappJid = passiveVerifiedJid;
              }
              if (passivePhone.length >= 10 && passivePhone.length <= 13 && !matched.phone) {
                matched.phone = passivePhone;
                up.phone = passivePhone;
              }
              if (Object.keys(up).length > 0) {
                withFirestoreGuard(
                  () => dbPassive.collection("players").doc(matched.id).set(up, { merge: true }),
                  undefined
                ).catch(() => {});
              }
              if (passivePic) {
                syncSinglePlayerWhatsAppPhoto(dbPassive, matched, passivePic, false).catch(() => {});
              }
            } else if (passivePhone.length >= 10 && passivePic) {
              downloadImageAsDataUri(passivePic)
                .then((uri) => {
                  if (uri) {
                    registerWhatsAppPhotoBinding({
                      phone: passivePhone,
                      photoUrl: uri,
                      source: "whatsapp_webhook"
                    });
                  }
                })
                .catch(() => {});
            }
          }
        } catch {}
        return res.status(200).json({ ignored: true, reason: "not_a_command" });
      }

      const rawSenderJid: string =
        payload.participant ||
        payload.author ||
        payload?.key?.participant ||
        chatId;
      const senderJid: string = stripDeviceSuffixFromJid(rawSenderJid);
      const isLidSender = String(senderJid).endsWith("@lid");
      const senderLid: string =
        stripDeviceSuffixFromJid(payload.participantLid || (isLidSender ? String(senderJid) : ""));
      const pushName: string = String(payload.pushName || payload?.verifiedBizName || "").trim();

      // Extrai o número real de telefone mesmo quando o WhatsApp envia @lid ou JID multi-dispositivo (:xx@s.whatsapp.net)
      const altPhoneRaw: string =
        payload.senderPn ||
        payload?.key?.senderPn ||
        payload?.key?.participantAlt ||
        payload?.key?.remoteJidAlt ||
        payload.participantAlt ||
        (!isLidSender ? String(senderJid).split("@")[0].split(":")[0] : "");
      const senderPhone = String(altPhoneRaw || "").split("@")[0].split(":")[0].replace(/\D/g, "");

      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);

      const normStr = (s: string) =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      // 1º: Busca prioritária pelo Telefone ou WhatsApp LID já vinculado
      const matchingPlayers = allPlayers.filter((p) => {
        if (senderLid && p.whatsappLid && p.whatsappLid === senderLid) return true;
        if (senderPhone.length >= 8) {
          if (matchBrazilianPhone(senderPhone, p.phone)) return true;
          const cleanPlayerPhone = String(p.phone || "").replace(/\D/g, "");
          if (
            cleanPlayerPhone.length >= 8 &&
            cleanPlayerPhone.length <= 13 &&
            senderPhone.length <= 13 &&
            cleanPlayerPhone.slice(-8) === senderPhone.slice(-8)
          ) {
            return true;
          }
        }
        return false;
      });

      matchingPlayers.sort((a, b) => (Number(b.matchesPlayed) || 0) - (Number(a.matchesPlayed) || 0));
      let senderPlayer = matchingPlayers[0];

      // 2º: Busca pelo nome/apelido se ainda não vinculou telefone/LID (mantendo Elisabete e Beth separadas)
      if (!senderPlayer && pushName.length >= 2) {
        const cleanPush = normStr(pushName);
        const pushTokens = cleanPush.split(/[^a-z0-9]+/).filter(Boolean);

        const aliasGroups: string[][] = [
          ["elisabete", "elizabeth", "betinha", "elisa"],
          ["beth", "bete"],
          ["ivana", "ivaninha"],
          ["flavia", "flavinha"],
          ["marcleide", "marcleyde"],
          ["andrea", "dea", "deinha"]
        ];

        const areEquivalentTokens = (t1: string, t2: string) => {
          if (t1 === t2) return true;
          return aliasGroups.some((grp) => grp.includes(t1) && grp.includes(t2));
        };

        const scoredCandidates = allPlayers
          .filter((p) => p.status === "active" && p.name)
          .map((p) => {
            const cleanName = normStr(p.name);
            const nameTokens = cleanName.split(/[^a-z0-9]+/).filter(Boolean);
            let score = 0;

            if (cleanName === cleanPush) {
              score = 100;
            } else if (
              nameTokens.length > 0 &&
              pushTokens.length > 0 &&
              areEquivalentTokens(nameTokens[0], pushTokens[0])
            ) {
              score = 92;
            } else if (
              nameTokens.length > 1 &&
              nameTokens.every((t) => pushTokens.some((pt) => areEquivalentTokens(t, pt)))
            ) {
              score = 88;
            } else if (
              nameTokens.length === 1 &&
              nameTokens[0].length >= 4 &&
              pushTokens.some((pt) => areEquivalentTokens(nameTokens[0], pt))
            ) {
              score = 75;
            }
            return { player: p, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (Number(b.player.matchesPlayed) || 0) - (Number(a.player.matchesPlayed) || 0);
          });

        senderPlayer = scoredCandidates[0]?.player;
      }

      const verifiedSenderPnRaw: string =
        payload.senderPn ||
        payload?.key?.senderPn ||
        payload?.key?.participantAlt ||
        payload?.key?.remoteJidAlt ||
        payload.participantAlt ||
        (!isGroup && chatId.endsWith("@s.whatsapp.net") ? chatId : "") ||
        (isGroup && senderJid && senderJid.endsWith("@s.whatsapp.net") ? senderJid : "");
      const verifiedSenderPnDigits = String(verifiedSenderPnRaw || "").split("@")[0].split(":")[0].replace(/\D/g, "");
      const verifiedSenderPnJid =
        verifiedSenderPnDigits.length >= 10 && verifiedSenderPnDigits.length <= 13
          ? `${verifiedSenderPnDigits}@s.whatsapp.net`
          : null;

      // 3º: Auto-atualiza telefone, whatsappLid, whatsappJid verificado e FOTO DE PERFIL DO WHATSAPP no perfil oficial do sócio
      if (senderPlayer && !String(senderPlayer.id).startsWith("wa_")) {
        const playerUpdates: Record<string, any> = {};
        if (senderLid && senderPlayer.whatsappLid !== senderLid) {
          senderPlayer.whatsappLid = senderLid;
          playerUpdates.whatsappLid = senderLid;
        }
        if (verifiedSenderPnJid && senderPlayer.whatsappJid !== verifiedSenderPnJid) {
          senderPlayer.whatsappJid = verifiedSenderPnJid;
          playerUpdates.whatsappJid = verifiedSenderPnJid;
        }
        if (senderPhone.length >= 10 && senderPhone.length <= 13) {
          const currentCleanPhone = String(senderPlayer.phone || "").replace(/\D/g, "");
          if (!currentCleanPhone || currentCleanPhone.slice(-8) !== senderPhone.slice(-8)) {
            senderPlayer.phone = senderPhone;
            playerUpdates.phone = senderPhone;
          }
        }
        if (Object.keys(playerUpdates).length > 0) {
          playerUpdates.autoLinkedAt = Date.now();
          withFirestoreGuard(async () => {
            await db.collection("players").doc(senderPlayer.id).set(playerUpdates, { merge: true });
            await db.collection("metadata").doc("system").set({ lastUpdate: Date.now() }, { merge: true });
          }, undefined).catch(() => {});
        }

        const incomingPicUrl =
          payload.profilePictureUrl ||
          payload.senderPhoto ||
          payload.picture ||
          payload.avatar ||
          body.profilePictureUrl ||
          null;

        if (isMissingOrDefaultAvatar(senderPlayer.photoUrl) || incomingPicUrl) {
          syncSinglePlayerWhatsAppPhoto(db, senderPlayer, incomingPicUrl, false).catch(() => {});
        }
      }

      if (!senderPlayer && (isFromMe || senderPhone.includes("97330924"))) {
        const rodneyCandidates = allPlayers
          .filter(
            (p) =>
              (p.email && p.email.trim().toLowerCase() === "rodneyes@gmail.com") ||
              (p.name && normStr(p.name).includes("rodney"))
          )
          .sort((a, b) => (Number(b.matchesPlayed) || 0) - (Number(a.matchesPlayed) || 0));

        senderPlayer = rodneyCandidates[0] || {
          id: "rodney_admin",
          name: "Rodney",
          email: "rodneyes@gmail.com",
          phone: "558197330924",
          status: "active",
          isDM: false
        };
      }

      if (!senderPlayer) {
        senderPlayer = {
          id: `wa_${senderPhone || "socio"}`,
          name: pushName && pushName !== "Socio" ? pushName : "Guerreiro(a)",
          phone: senderPhone,
          status: "active",
          isDM: false,
          matchesPlayed: 0,
          elo: 1200
        };
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      let finalMessageToProcess = text;

      if (audioBuffer && apiKey) {
        try {
          const audioPart = {
            inlineData: {
              data: audioBuffer.toString("base64"),
              mimeType: audioMimeType
            }
          };
          const transcriptionResp = await routedGenerateContent({
            task: "audio_transcribe",
            contents: [
              audioPart,
              "Transcreva exatamente em português do Brasil o que o sócio disse neste áudio enviado para o robô do clube de vôlei Guerreiros VC."
            ]
          });
          finalMessageToProcess = (transcriptionResp.text || "").trim() || "Áudio enviado pelo sócio.";
        } catch (e) {
          finalMessageToProcess = "Áudio recebido.";
        }
      }

      const executeConfirmAttendance = async (): Promise<string> => {
        if (senderPlayer.status !== "active" || senderPlayer.isDM) {
          return `⚠️ Olá, *${senderPlayer.name}*! Apenas sócios com status Ativo e fora do DM podem confirmar presença.`;
        }
        const currentInt = await ensureFreshIntentionsDocument(true);
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses: Record<string, string> = { ...(currentInt.responses || {}) };
        const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

        const now = Date.now();
        const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
        const existingEntry = resolvePlayerIntentEntry(senderPlayer, responses, timestamps, cutoffTs);
        const alreadyConfirmed = existingEntry.status === "GOING" && existingEntry.ts >= cutoffTs;
        const effectiveTs = alreadyConfirmed ? existingEntry.ts : now;

        // Limpa aliases redundantes e grava de forma canônica (id, uid, email)
        const aliases = getPlayerIntentAliases(senderPlayer, Object.keys(responses));
        aliases.forEach((alias) => {
          delete responses[alias];
          delete timestamps[alias];
        });
        responses[senderPlayer.id] = "GOING";
        timestamps[senderPlayer.id] = effectiveTs;
        if (senderPlayer.uid) {
          responses[senderPlayer.uid] = "GOING";
          timestamps[senderPlayer.uid] = effectiveTs;
        }
        if (senderPlayer.email) {
          const em = senderPlayer.email.trim().toLowerCase();
          responses[em] = "GOING";
          timestamps[em] = effectiveTs;
        }

        const updatedDoc = {
          targetDate,
          automationEnabled: currentInt.automationEnabled ?? true,
          responses,
          confirmationTimestamps: timestamps,
          remindersSent: currentInt.remindersSent || {},
          lastUpdated: now
        };

        cachedIntentions = updatedDoc;
        cachedIntentionsLastFetch = now;
        saveLocalIntentionsBackup(updatedDoc);

        await withFirestoreGuard(
          () => db.collection("metadata").doc("intentions").set(updatedDoc),
          undefined
        );
        await syncPlayerPreConfirmationDoc(db, targetDate, senderPlayer, "GOING", effectiveTs);

        // Agenda disparo da lista atualizada no grupo do WhatsApp em 2 minutos
        scheduleGroupAttendanceBroadcast(2 * 60 * 1000);

        const pool = allPlayers.length > 0 ? allPlayers : [senderPlayer];
        const activeGoing = pool
          .filter(
            (p) =>
              p.status === "active" &&
              !p.isDM &&
              resolvePlayerIntentEntry(p, responses, timestamps, cutoffTs).status === "GOING"
          )
          .sort(
            (a, b) =>
              resolvePlayerIntentEntry(a, responses, timestamps, cutoffTs).ts -
              resolvePlayerIntentEntry(b, responses, timestamps, cutoffTs).ts
          );

        const totalActiveClub = pool.filter((p) => p.status === "active" && !p.isDM).length;
        const pos = Math.max(1, activeGoing.findIndex((p) => p.id === senderPlayer.id) + 1);
        const totalGoing = Math.max(1, activeGoing.length);
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");

        return alreadyConfirmed
          ? `✅ *${senderPlayer.name}*, você já estava confirmado(a) para Quinta (${formattedDate})! Sua posição na lista é *#${pos}* de *${totalGoing}* / ${totalActiveClub}.`
          : `🏐🔥 *Bora pra cima, ${senderPlayer.name}!*\nPresença confirmada para Quinta (${formattedDate})!\n📍 Você é o *#${pos}* de *${totalGoing}* / ${totalActiveClub} confirmados.\n\n_Caso precise cancelar depois, toque aqui:_\nhttps://wa.me/558197330924?text=gv%20naovou`;
      };

      const executeDeclineAttendance = async (): Promise<string> => {
        const currentInt = await ensureFreshIntentionsDocument(true);
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses: Record<string, string> = { ...(currentInt.responses || {}) };
        const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };
        const now = Date.now();

        // Limpa todos os aliases anteriores para não deixar vestígio de GOING em chaves secundárias
        const aliases = getPlayerIntentAliases(senderPlayer, Object.keys(responses));
        aliases.forEach((alias) => {
          delete responses[alias];
          delete timestamps[alias];
        });
        responses[senderPlayer.id] = "NOT_GOING";
        timestamps[senderPlayer.id] = now;
        if (senderPlayer.uid) {
          responses[senderPlayer.uid] = "NOT_GOING";
          timestamps[senderPlayer.uid] = now;
        }
        if (senderPlayer.email) {
          const em = senderPlayer.email.trim().toLowerCase();
          responses[em] = "NOT_GOING";
          timestamps[em] = now;
        }

        const updatedDoc = {
          targetDate,
          automationEnabled: currentInt.automationEnabled ?? true,
          responses,
          confirmationTimestamps: timestamps,
          remindersSent: currentInt.remindersSent || {},
          lastUpdated: now
        };

        cachedIntentions = updatedDoc;
        cachedIntentionsLastFetch = now;
        saveLocalIntentionsBackup(updatedDoc);

        await withFirestoreGuard(
          () => db.collection("metadata").doc("intentions").set(updatedDoc),
          undefined
        );
        await syncPlayerPreConfirmationDoc(db, targetDate, senderPlayer, "NOT_GOING", now);
        const hadActiveGeoWatch = await markCourtGeoWatcherOptedOut(db, getBrazilTimeParts().dateKey, senderPlayer.id);

        const gpsStopNote = hadActiveGeoWatch
          ? `\n\n📡 *Sinal de GPS desligado:* encerramos o monitoramento automático de chegada no app. Se você estava compartilhando a *Localização em Tempo Real* aqui no WhatsApp, já pode tocar em *"Parar de compartilhar"*.`
          : "";

        // Regra do clube: NÃO dispara nem atualiza a lista no grupo quando o sócio informa ausência (NOT_GOING)
        return `📝 Registrado, *${senderPlayer.name}*. Sua ausência foi atualizada na lista. Fica para a próxima!${gpsStopNote}\n\n_Mudei de ideia, quero ir:_ 👉 https://wa.me/558197330924?text=gv%20vou`;
      };

      const executeGetAttendanceList = async (): Promise<string> => {
        const currentInt = await ensureFreshIntentionsDocument(true);
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses = currentInt.responses || {};
        const timestamps = currentInt.confirmationTimestamps || {};

        const goingList = allPlayers
          .filter(
            (p) =>
              p.status === "active" &&
              !p.isDM &&
              resolvePlayerIntentEntry(p, responses, timestamps).status === "GOING"
          )
          .sort(
            (a, b) =>
              resolvePlayerIntentEntry(a, responses, timestamps).ts -
              resolvePlayerIntentEntry(b, responses, timestamps).ts
          );

        const totalActiveClub = allPlayers.filter((p) => p.status === "active" && !p.isDM).length;
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
        const settersCount = goingList.filter((p) => p.isOfficialSetter).length;

        return (
          `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
          `✅ *Confirmados:* ${goingList.length}/${totalActiveClub} (${settersCount} Levantadores)\n` +
          (goingList.length > 0
            ? goingList
                .map((p, i) => `${i + 1}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
                .join("\n")
            : "_Ninguém confirmou ainda._") +
          `\n───────────────────\n` +
          `🤖 *FALE COM O GUERREIRINHO NO PRIVADO (1 CLIQUE):*\n` +
          `✅ *Confirmar (Vou):* https://wa.me/558197330924?text=gv%20vou\n\n` +
          `❌ *Informar Ausência:* https://wa.me/558197330924?text=gv%20naovou`
        );
      };

      const executeGetRanking = async (): Promise<string> => {
        const allActiveSorted = allPlayers
          .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
          .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

        if (allActiveSorted.length === 0) {
          return `🏆 *RANKING GERAL ACUMULADO — GUERREIROS VC*\n\n_O banco de dados diário está sincronizando. Tente novamente em instantes!_`;
        }
        return (
          `🏆 *RANKING GERAL ACUMULADO (TODOS OS ${allActiveSorted.length} SÓCIOS)* 🏆\n\n` +
          allActiveSorted
            .map((p, i) => {
              const wr = p.matchesPlayed > 0 ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0;
              return `${String(i + 1).padStart(2, "0")}. *${p.name}* — *${Math.round(p.elo || 1200)} pts* (${p.wins || 0}V/${p.losses || 0}D • ${wr}%)`;
            })
            .join("\n")
        );
      };

      const executeGetPixInfo = async (): Promise<string> => {
        const sysConfig = await getCachedSystemConfig();
        const pixKey = sysConfig?.pixKey || "elizabeth.santos.pe@gmail.com";
        const pixPayload = sysConfig?.pixPayload || pixKey;
        const fee = Number(sysConfig?.monthlyFee || 50).toFixed(2).replace(".", ",");

        return (
          `💰 *TESOURARIA GUERREIROS VC*\n\n` +
          `💵 *Valor Mensal:* R$ ${fee}\n` +
          `👤 *Favorecido:* Elizabeth de Souza Santos (Nubank)\n` +
          `🔑 *Chave PIX:* ${pixKey}\n\n` +
          `📋 *PIX Copia e Cola (toque para copiar):*\n` +
          `\`\`\`${pixPayload}\`\`\``
        );
      };

      const executeGetBirthdays = async (): Promise<string> => {
        const br = getBrazilTimeParts();
        const todayList = getTodayBirthdayPlayers(allPlayers, br.dateKey);
        const currentMonth = Number(br.dateKey.split("-")[1]);
        const monthList = allPlayers
          .filter((p) => {
            if (!p || (p.status && p.status !== "active")) return false;
            const parsed = parseBirthMonthDay(p.birthDate);
            return parsed?.month === currentMonth;
          })
          .map((p) => ({ player: p, parsed: parseBirthMonthDay(p.birthDate)! }))
          .sort((a, b) => a.parsed.day - b.parsed.day);

        const todaySection =
          todayList.length > 0
            ? `🎂 *ANIVERSARIANTE(S) DE HOJE (${br.dateKey.split("-").reverse().slice(0, 2).join("/")}):*\n` +
              todayList.map((p) => `🎉 *${p.name}*`).join("\n") +
              `\n\n`
            : `🎂 *Hoje (${br.dateKey.split("-").reverse().slice(0, 2).join("/")}):* Nenhum sócio aniversariante cadastrado.\n\n`;

        const monthSection =
          monthList.length > 0
            ? `📅 *ANIVERSARIANTES DO MÊS:*\n` +
              monthList
                .map(
                  ({ player, parsed }) =>
                    `• *${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}* — ${player.name}`
                )
                .join("\n")
            : `_Nenhum aniversariante cadastrado para este mês._`;

        return `${todaySection}${monthSection}`;
      };

      const cleanAfterAlias = finalMessageToProcess
        .replace(/^(@?gv|@?bot|@?botgv|@?guerreirinho|@guerreiros|guerreiros|!|\/)[,:\-\s]*/i, "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s.!?,;:]+$/g, "")
        .trim();

      let replyBody = "";
      let imageOnlyReply = false;
      const defaultCardMode = getWhatsAppCardDeliveryMode();
      const bridgeSupportsMedia =
        req.body?.supportsMedia === true || req.body?.includeMediaBase64 === true;
      const reqHost = String(req.headers.host || "").trim();
      const publicBaseUrl =
        reqHost && !reqHost.includes("localhost") && !reqHost.startsWith("127.")
          ? `https://${reqHost}`
          : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app";
      const safeOriginHeader =
        req.headers.origin &&
        !String(req.headers.origin).includes("localhost") &&
        !String(req.headers.origin).includes("127.0.0.1")
          ? String(req.headers.origin).replace(/\/$/, "")
          : "";
      const effectivePublicBaseUrl = safeOriginHeader || publicBaseUrl;
      let effectiveCardDeliveryMode: WhatsAppCardDeliveryMode = defaultCardMode;
      let replyMedia: {
        mediaType: "image";
        mimetype?: string;
        mediaBase64: string;
        mediaFetchUrl?: string;
        fileName: string;
        caption?: string;
        imageOnly?: boolean;
      } | null = null;
      let attendanceMutatedInWebhook = false;
      let isIndividualPrivateCommand = false;
      let privateCommandLabel = "Resumo Individual";
      const textCoordMatch = cleanAfterAlias.match(/(-?\d{1,2}\.\d{4,})\s*[,;\s]\s*(-?\d{1,3}\.\d{4,})/);

      if (imageMessage && (!isGroup || isPhotoCaptionTrigger)) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Atualização de Foto de Perfil";
        let uploadedDataUri: string | null = null;
        try {
          if (imageMessage.base64) {
            const mime = imageMessage.mimetype || "image/jpeg";
            const rawUri = String(imageMessage.base64).startsWith("data:")
              ? String(imageMessage.base64)
              : `data:${mime};base64,${imageMessage.base64}`;
            uploadedDataUri = (await compressPhotoTo10KBDataUri(rawUri)) || rawUri;
          } else if (imageMessage.url) {
            uploadedDataUri = await downloadImageAsDataUri(imageMessage.url);
          }
        } catch {}

        if (uploadedDataUri && senderPlayer && !String(senderPlayer.id).startsWith("wa_")) {
          const nowTs = Date.now();
          senderPlayer.photoUrl = uploadedDataUri;
          delete senderPlayer.whatsappPhotoUrl;
          if (senderPlayer.phone) {
            registerWhatsAppPhotoBinding({
              phone: senderPlayer.phone,
              photoUrl: uploadedDataUri,
              playerId: senderPlayer.id,
              playerName: senderPlayer.name,
              source: "whatsapp_webhook"
            });
          }
          saveLocalPlayersBackup(allPlayers);
          await withFirestoreGuard(
            () =>
              db.collection("players").doc(senderPlayer.id).set(
                {
                  photoUrl: uploadedDataUri,
                  whatsappPhotoUrl: "__FIREBASE_DELETE_FIELD__",
                  photoUpdatedAt: nowTs
                },
                { merge: true }
              ),
            undefined
          );
          replyBody = `📸✅ *Foto de perfil atualizada com sucesso, ${senderPlayer.name.split(" ")[0]}!*\n\nSua foto já foi salva permanentemente no cadastro oficial do *Guerreiros VC*! 🏐🔥`;
        } else {
          const firstName = String(senderPlayer?.name || "Guerreiro").split(" ")[0];
          const fotoUrl = `${effectivePublicBaseUrl}/foto?pid=${encodeURIComponent(senderPlayer?.id || "")}&phone=${encodeURIComponent(senderPlayer?.phone || senderPhone || "")}&name=${encodeURIComponent(firstName)}`;
          replyBody = `📸 *Para atualizar sua foto no cadastro, ${firstName}:*\n\nToque no link abaixo e selecione uma foto da sua galeria:\n👉 ${fotoUrl}`;
        }
      } else if (incomingLocation) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Check-in na Quadra";
        replyBody = await executeCourtLocationCheckIn(db, senderPlayer, incomingLocation);
      } else if (textCoordMatch) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Check-in na Quadra";
        replyBody = await executeCourtLocationCheckIn(db, senderPlayer, {
          lat: Number(textCoordMatch[1]),
          lng: Number(textCoordMatch[2]),
          isLive: false
        });
      } else if (
        [
          "cheguei",
          "ja cheguei",
          "cheguei na quadra",
          "estou na quadra",
          "to na quadra",
          "estou aqui",
          "checkin",
          "check-in",
          "check in",
          "presente na quadra"
        ].includes(cleanAfterAlias)
      ) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Link de Check-in na Quadra";
        const firstName = String(senderPlayer.name || "Guerreiro").split(" ")[0];
        const checkInUrl = `${effectivePublicBaseUrl}/checkin?pid=${encodeURIComponent(senderPlayer.id || "")}&phone=${encodeURIComponent(senderPlayer.phone || senderPhone || "")}&name=${encodeURIComponent(firstName)}`;
        const liveSys = await getCachedSystemConfig();
        const cLat = Number(liveSys?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
        const cLng = Number(liveSys?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
        const weather = await fetchCourtWeatherForecast(cLat, cLng);

        replyBody =
          `📍🏐 *Bora fazer seu Check-in na Quadra, ${firstName}!*\n\n` +
          `🟢 *OPÇÃO 1 (Mais rápida — 1 Toque):*\n` +
          `Toque no link abaixo para o celular validar seu GPS automaticamente e já enviar sua posição na fila aqui no WhatsApp:\n` +
          `👉 ${checkInUrl}\n\n` +
          `📍 *OPÇÃO 2 (Pelo Mapa do WhatsApp — sem precisar digitar nada):*\n` +
          `🍎 *iPhone:* Toque em *+* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.\n` +
          `🤖 *Android:* Toque em *📎* → *Localização* → *Localização em tempo real (1 hora)* ou *Enviar sua localização atual*.\n\n` +
          `${weather.whatsappBlock}`;
      } else if (
        ["clima", "tempo", "previsao", "chuva", "waze", "rota", "transito", "como chegar", "quadra"].includes(
          cleanAfterAlias
        )
      ) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Clima & Rota Waze/Maps da Quadra";
        const liveSys = await getCachedSystemConfig();
        const cLat = Number(liveSys?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
        const cLng = Number(liveSys?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
        const weather = await fetchCourtWeatherForecast(cLat, cLng);
        replyBody = weather.fullBroadcastMessage;
      } else if (["1", "vou", "eu vou", "confirmar", "presenca"].includes(cleanAfterAlias)) {
        replyBody = await executeConfirmAttendance();
        attendanceMutatedInWebhook = true;
      } else if (
        ["toindo", "to indo", "estou indo", "ainda vou", "a caminho", "chegando"].includes(cleanAfterAlias)
      ) {
        const firstName = String(senderPlayer.name || "Guerreiro").trim().split(/\s+/)[0] || "Guerreiro";
        const liveSys = await getCachedSystemConfig();
        const activeRadius = Number(liveSys?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS);
        replyBody =
          `🚗🏐 *Show, ${firstName}! Te esperamos na quadra!*\n\n` +
          `Continuo monitorando sua chegada até às *22h00*. Assim que entrar no raio de *${activeRadius}m* da quadra, confirmo automaticamente sua presença na fila!\n\n` +
          `_Dica: se estiver usando a Localização em Tempo Real do WhatsApp, verifique se ela ainda está ativa (recomendamos 1 hora)._`;
      } else if (
        ["2", "naovou", "nao vou", "ausente", "desisti", "nao vou mais", "desligar gps", "parar gps"].includes(
          cleanAfterAlias
        )
      ) {
        replyBody = await executeDeclineAttendance();
        // NÃO aciona atualização/envio da lista no grupo quando o sócio informa que não vai
        attendanceMutatedInWebhook = false;
      } else if (["lista", "confirmados", "quem vai"].includes(cleanAfterAlias)) {
        replyBody = await executeGetAttendanceList();
      } else if (
        ["ranking", "ranking img", "ranking imagem", "ranking card", "ranking foto", "ranking texto", "ranking txt"].includes(
          cleanAfterAlias
        )
      ) {
        const forceImg = /^ranking\s+(img|imagem|card|foto)$/.test(cleanAfterAlias);
        const forceTxt = /^ranking\s+(texto|txt)$/.test(cleanAfterAlias);
        const shouldSendVmImage =
          bridgeSupportsMedia && !forceTxt && (forceImg || defaultCardMode === "vm_image_only");
        effectiveCardDeliveryMode = shouldSendVmImage ? "vm_image_only" : "disabled";

        if (shouldSendVmImage) {
          try {
            const allMatches = await getCachedMatches(cachedMatches.length === 0);
            const accData = computeAccumulatedRankingData(allMatches, allPlayers);
            replyMedia = {
              mediaType: "image",
              mimetype: "image/png",
              mediaBase64: renderAccumulatedRankingCardPng(accData).toString("base64"),
              mediaFetchUrl: `${publicBaseUrl}/api/cards/accumulated-ranking.png`,
              fileName: `guerreiros_ranking_acumulado.png`,
              caption: `🏆 *RANKING GERAL ACUMULADO (${accData.topRows.length} SÓCIOS)* • Atualizado em ${accData.referenceDateLabel}`,
              imageOnly: true
            };
            imageOnlyReply = true;
          } catch (cardErr) {
            console.warn("[Webhook] Falha ao renderizar PNG do gv ranking:", cardErr);
            replyBody = await executeGetRanking();
          }
        } else {
          replyBody = await executeGetRanking();
          if (forceImg) {
            replyBody += `\n\nℹ️ _Envio de Card HD em imagem está desabilitado no WhatsApp — exibindo o ranking completo em texto._`;
          }
        }
      } else if (["pix", "mensalidade", "financeiro", "tesouraria"].includes(cleanAfterAlias)) {
        replyBody = await executeGetPixInfo();
      } else if (
        ["aniversario", "aniversarios", "aniversariante", "aniversariantes", "niver"].includes(
          cleanAfterAlias
        )
      ) {
        replyBody = await executeGetBirthdays();
      } else if (
        [
          "minhanoite",
          "minha noite",
          "hoje",
          "dia",
          "meu dia",
          "resumo do dia",
          "jogos de hoje",
          "jogos do dia",
          "partidas da noite",
          "minhas partidas",
          "minhas partidas da noite",
          "matriz",
          "linha do tempo",
          "dia img",
          "dia imagem",
          "dia card",
          "dia foto",
          "dia texto",
          "dia txt",
          "minha noite texto"
        ].includes(cleanAfterAlias) ||
        /(como\s+(foi|foram|fui)\s+((as\s+)?minhas\s+partidas|ontem|hoje|na\s+quinta|na\s+ultima\s+quinta|no\s+jogo)|minhas\s+partidas\s+(da\s+noite|de\s+hoje|do\s+dia|ontem|de\s+quinta)|ganhei\s+ou\s+perdi\s+(hoje|ontem|quinta)|(me\s+)?manda(r)?\s+(o\s+)?meu\s+(card|resumo)|meu\s+card\s+(do\s+dia|da\s+noite|de\s+quinta|individual)|card\s+de\s+quinta|resumo\s+individual)/i.test(
          cleanAfterAlias
        )
      ) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Resumo Individual do Dia";
        const forceImg = /^dia\s+(img|imagem|card|foto)$/.test(cleanAfterAlias);
        const forceTxt = /^(dia\s+(texto|txt)|minha noite texto)$/.test(cleanAfterAlias);
        const shouldSendVmImage =
          bridgeSupportsMedia && !forceTxt && (forceImg || defaultCardMode === "vm_image_only");
        effectiveCardDeliveryMode = shouldSendVmImage ? "vm_image_only" : "disabled";

        const shouldRefreshMatches = cachedMatches.length === 0 || Date.now() - cachedMatchesLastFetch > 60 * 1000;
        const allMatches = shouldRefreshMatches
          ? await Promise.race([
              getCachedMatches(true),
              new Promise<any[]>((resolve) => setTimeout(() => resolve(cachedMatches), 3500))
            ])
          : cachedMatches;

        if (shouldSendVmImage) {
          const rawIndData = computeIndividualNightData(senderPlayer, allMatches, allPlayers);
          const indData = rawIndData ? await enrichIndividualNightDataWithHumor(rawIndData) : null;
          if (indData) {
            try {
              replyMedia = {
                mediaType: "image",
                mimetype: "image/png",
                mediaBase64: renderIndividualNightCardPng(indData).toString("base64"),
                mediaFetchUrl: `${publicBaseUrl}/api/cards/individual.png?playerId=${encodeURIComponent(senderPlayer.id)}&date=${encodeURIComponent(indData.dateKey)}`,
                fileName: `guerreiros_noite_${indData.dateKey}.png`,
                caption: `🏐 *RESUMO INDIVIDUAL — ${indData.firstName}* (${indData.dateLabel}) • ${indData.wins}V/${indData.losses}D (${indData.winRate}%) • ${indData.eloDelta >= 0 ? "+" : ""}${indData.eloDelta} ELO`,
                imageOnly: true
              };
              imageOnlyReply = true;
            } catch (cardErr) {
              console.warn("[Webhook] Falha ao renderizar PNG do gv dia:", cardErr);
              replyBody = buildPlayerNightTimelineReport(senderPlayer, allMatches, allPlayers);
            }
          } else {
            replyBody = buildPlayerNightTimelineReport(senderPlayer, allMatches, allPlayers);
          }
        } else {
          replyBody = buildPlayerNightTimelineReport(senderPlayer, allMatches, allPlayers);
          if (forceImg) {
            replyBody += `\n\nℹ️ _Envio de Card HD em imagem está desabilitado no WhatsApp — exibindo o resumo completo em texto._`;
          }
        }
      } else if (
        [
          "ranking do dia",
          "ranking da noite",
          "resumo",
          "resumo da noite",
          "sumula",
          "placares",
          "resumo img",
          "resumo imagem",
          "resumo card",
          "resumo foto",
          "ranking do dia img",
          "resumo texto",
          "resumo txt",
          "ranking do dia texto"
        ].includes(cleanAfterAlias)
      ) {
        const forceImg = /\b(img|imagem|card|foto)$/.test(cleanAfterAlias);
        const forceTxt = /\b(texto|txt)$/.test(cleanAfterAlias);
        const shouldSendVmImage =
          bridgeSupportsMedia && !forceTxt && (forceImg || defaultCardMode === "vm_image_only");
        effectiveCardDeliveryMode = shouldSendVmImage ? "vm_image_only" : "disabled";

        const shouldRefreshMatches = cachedMatches.length === 0 || Date.now() - cachedMatchesLastFetch > 60 * 1000;
        const allMatches = shouldRefreshMatches
          ? await Promise.race([
              getCachedMatches(true),
              new Promise<any[]>((resolve) => setTimeout(() => resolve(cachedMatches), 3500))
            ])
          : cachedMatches;
        const sortedAll = [...allMatches].sort(
          (a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0)
        );
        const lastDate =
          sortedAll[0]?.date ||
          (sortedAll[0]?.timestamp
            ? getFirestoreDateKey(new Date(Number(sortedAll[0].timestamp)))
            : getFirestoreDateKey());
        const matchesOfLastNight = allMatches.filter((m) => {
          const mDate =
            m.date || (m.timestamp ? getFirestoreDateKey(new Date(Number(m.timestamp))) : "");
          return mDate === lastDate;
        });

        if (shouldSendVmImage) {
          const dailyData = computeDailyRankingData(matchesOfLastNight, allPlayers, lastDate);
          if (dailyData) {
            try {
              replyMedia = {
                mediaType: "image",
                mimetype: "image/png",
                mediaBase64: renderDailyRankingCardPng(dailyData).toString("base64"),
                mediaFetchUrl: `${publicBaseUrl}/api/cards/daily-ranking.png?date=${encodeURIComponent(lastDate)}`,
                fileName: `guerreiros_ranking_dia_${lastDate}.png`,
                caption: `🔥 *RANKING DO DIA — ${dailyData.dateLabel}* (${dailyData.totalAthletes} atletas) • MVP: *${dailyData.mvp?.firstName || "-"}*`,
                imageOnly: true
              };
              imageOnlyReply = true;
            } catch (cardErr) {
              console.warn("[Webhook] Falha ao renderizar PNG do gv resumo:", cardErr);
              replyBody =
                buildPostGameSummaryAndDayRanking(matchesOfLastNight, allPlayers, lastDate) ||
                "⚠️ Nenhuma partida encontrada na última sessão.";
            }
          } else {
            replyBody =
              buildPostGameSummaryAndDayRanking(matchesOfLastNight, allPlayers, lastDate) ||
              "⚠️ Nenhuma partida encontrada na última sessão.";
          }
        } else {
          replyBody =
            buildPostGameSummaryAndDayRanking(matchesOfLastNight, allPlayers, lastDate) ||
            "⚠️ Nenhuma partida encontrada na última sessão.";
          if (forceImg) {
            replyBody += `\n\nℹ️ _Envio de Card HD em imagem está desabilitado no WhatsApp — exibindo o resumo completo em texto._`;
          }
        }
      } else if (
        ["meusjogos", "meus jogos", "historico", "meu historico", "estatisticas", "minhas estatisticas", "raiox", "raio-x"].includes(
          cleanAfterAlias
        )
      ) {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Raio-X & Estatísticas Individuais";
        const allMatches = await getCachedMatches(cachedMatches.length === 0);
        const report = buildPlayerDeepStatsReport(senderPlayer, allPlayers, allMatches, "geral");
        replyBody = `${report}\n\n💬 _Quer que eu filtre essa análise apenas pelos seus últimos 15 jogos ou confirme sua presença para quinta-feira?_`;
      } else {
        isIndividualPrivateCommand = true;
        privateCommandLabel = "Análise Individual";
        const allMatches = await getCachedMatches(cachedMatches.length === 0);
        if (!apiKey) {
          const report = buildPlayerDeepStatsReport(senderPlayer, allPlayers, allMatches, "geral");
          replyBody = `${report}\n\n🤖 _Atalhos rápidos: *gv vou*, *gv lista*, *gv ranking*, *gv meusjogos* ou *gv pix*._`;
        } else {
          const liveSysConfig = await getCachedSystemConfig();
          replyBody = await runDeepAnalyticsChat(
            apiKey,
            finalMessageToProcess,
            senderPlayer,
            allPlayers,
            allMatches,
            {
              confirmAttendance: executeConfirmAttendance,
              declineAttendance: executeDeclineAttendance,
              getAttendanceList: executeGetAttendanceList,
              getRanking: executeGetRanking,
              getPixInfo: executeGetPixInfo
            },
            {
              monthlyFee: Number(liveSysConfig?.monthlyFee || 50),
              pixKey: liveSysConfig?.pixKey || "",
              pixReceiverName: liveSysConfig?.pixReceiverName || liveSysConfig?.clubName || "Guerreiros VC",
              courtName: liveSysConfig?.courtName || "Quadra Oficial Guerreiros VC (Recife/PE)",
              courtAddress: liveSysConfig?.courtAddress || "",
              maxPlayersPerSession: Number(liveSysConfig?.maxPlayersPerSession || 29),
              activePlayersCount: allPlayers.filter((p) => p.status === "active").length
            }
          );
        }
      }

      if (!replyBody && !replyMedia) {
        return res.json({ success: true, ignored: true, reason: "SILENT_GEO_UPDATE" });
      }

      const replyText =
        imageOnlyReply && replyMedia ? "" : `${replyBody}\n\n— Guerreirinho, o robô do clube 🤖`;

      const privateTargetsSet = new Set<string>();
      const addPrivateTarget = (jid?: string | null) => {
        const cleaned = String(jid || "").trim();
        if (
          cleaned &&
          !cleaned.endsWith("@g.us") &&
          !cleaned.endsWith("@broadcast") &&
          cleaned !== "status@broadcast"
        ) {
          privateTargetsSet.add(cleaned);
        }
      };

      // PRIORIDADE MÁXIMA: JID real verificado vindo diretamente do evento do WhatsApp
      // (evita telefone com 9º dígito divergente e garante entrega no privado de sócios @lid como Caluca e Flavinha)
      addPrivateTarget(verifiedSenderPnJid);
      addPrivateTarget(senderJid);
      addPrivateTarget(senderLid);
      addPrivateTarget(senderPlayer?.whatsappJid);
      addPrivateTarget(senderPlayer?.whatsappLid);
      if (senderPlayer) {
        resolvePlayerWhatsAppTargets(senderPlayer).forEach((t) => addPrivateTarget(t));
      }
      if (senderPlayer?.phone) {
        addPrivateTarget(normalizePhoneToJid(senderPlayer.phone));
      }
      const privateTargets = Array.from(privateTargetsSet);

      let targetReplyChatId = chatId;
      if (!isGroup && chatId.endsWith("@lid")) {
        // No privado via @lid, prefere o JID @s.whatsapp.net real quando disponível, mantendo o @lid como fallback.
        if (verifiedSenderPnJid) {
          targetReplyChatId = verifiedSenderPnJid;
        } else if (senderPlayer?.whatsappJid && !String(senderPlayer.whatsappJid).endsWith("@g.us")) {
          targetReplyChatId = String(senderPlayer.whatsappJid);
        }
      }

      let groupBroadcast: { groupJid: string; text: string } | null = null;
      if (attendanceMutatedInWebhook) {
        if (groupListBroadcastTimer) {
          clearTimeout(groupListBroadcastTimer);
          groupListBroadcastTimer = null;
        }
        const latestInt = await ensureFreshIntentionsDocument(true);
        const grpPayload = await buildCurrentGroupAttendanceBroadcast(allPlayers, latestInt);
        if (grpPayload) {
          if (!cachedScheduler) {
            cachedScheduler = loadLocalSchedulerBackup();
          }
          const prevWhSig = String(cachedScheduler?.lastBroadcastSignature || "");
          if (prevWhSig !== grpPayload.signature) {
            groupBroadcast = { groupJid: grpPayload.groupJid, text: grpPayload.text };
            cachedScheduler = {
              ...(cachedScheduler || {}),
              lastBroadcastSignature: grpPayload.signature,
              lastBroadcastAt: Date.now()
            };
            saveLocalSchedulerBackup(cachedScheduler);
            await withFirestoreGuard(
              () =>
                db
                  .collection("metadata")
                  .doc("whatsapp_scheduler")
                  .set(
                    { lastBroadcastSignature: grpPayload.signature, lastBroadcastAt: Date.now() },
                    { merge: true }
                  ),
              undefined
            );
            dispatchWhatsAppMessage(grpPayload.groupJid, grpPayload.text).catch(() => {});
          }
        }
      }

      // 🔒 ROTEAMENTO PRIVADO PARA COMANDOS INDIVIDUAIS PEDIDOS NO GRUPO:
      // Quando um sócio digita comandos individuais (ex.: gv dia, gv meusjogos, gv raiox, gv cheguei) no GRUPO,
      // enfileira a entrega completa (PNG HD ou texto) diretamente no PRIVADO do sócio via ponte VM (/api/whatsapp/cron-tasks)
      // e responde apenas uma confirmação discreta de 1 linha no grupo (sem expor o card individual nem poluir o grupo).
      if (isGroup && isIndividualPrivateCommand && privateTargets.length > 0) {
        const firstName =
          String(senderPlayer?.name || pushName || "Guerreiro(a)").trim().split(/\s+/)[0] ||
          "Guerreiro(a)";

        const outboxItem: OutboxWhatsAppMessage = {
          outboxId: `obx_priv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          to: privateTargets[0],
          fallbackTargets: privateTargets.slice(1),
          text: imageOnlyReply && replyMedia ? "" : replyText,
          ...(replyMedia
            ? {
                ...(replyMedia.mediaFetchUrl
                  ? { mediaFetchUrl: replyMedia.mediaFetchUrl }
                  : { mediaBase64: replyMedia.mediaBase64 }),
                mediaType: "image" as const,
                fileName: replyMedia.fileName,
                caption: replyMedia.caption,
                imageOnly: Boolean(imageOnlyReply)
              }
            : {}),
          delayMs: 0,
          type: "GROUP_TO_PRIVATE_COMMAND",
          recipientLabel: senderPlayer?.name || pushName || "Sócio",
          queuedAt: Date.now(),
          attempts: 0
        };

        pendingWhatsAppOutbox.push(outboxItem);
        if (pendingWhatsAppOutbox.length > 100) {
          pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
        }
        saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
        await Promise.race([
          persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 1500))
        ]);

        recordWhatsAppCommLog({
          type: "GROUP_TO_PRIVATE_COMMAND",
          recipient: privateTargets[0],
          recipientLabel: senderPlayer?.name || pushName || "Sócio",
          status: "QUEUED_RETRY",
          summary: `${privateCommandLabel} pedido no grupo → encaminhado para o privado de ${firstName}`,
          messagePreview: replyMedia?.caption || replyBody.slice(0, 180)
        });

        const groupAckText = `📩 *${firstName}*, enviei seu *${privateCommandLabel}* no seu privado! 🔒🏐`;

        return res.status(200).json({
          success: true,
          chatId,
          groupChatId: chatId,
          privateDelivered: true,
          privateTargetChatId: privateTargets[0],
          privateFallbackTargets: privateTargets.slice(1),
          text: groupAckText,
          deliveryMode: effectiveCardDeliveryMode,
          imageOnly: false,
          ...(groupBroadcast ? { groupBroadcast } : {})
        });
      }

      // Não tenta Evolution API e NUNCA envia links de Card HD no WhatsApp.
      // Só retorna mediaBase64 quando a VM Google explicitamente envia supportsMedia: true.
      const finalReplyText = imageOnlyReply && replyMedia ? "" : replyText;

      recordWhatsAppCommLog({
        type: isGroup ? "WEBHOOK_GROUP_REPLY" : "WEBHOOK_PRIVATE_REPLY",
        recipient: targetReplyChatId || chatId,
        recipientLabel: isGroup ? "Grupo Guerreiros VC" : senderPlayer?.name || pushName || "Sócio",
        status: "SENT",
        summary: `Comando "${cleanAfterAlias || "mídia"}" respondido via webhook`,
        messagePreview: replyMedia?.caption || finalReplyText.slice(0, 180)
      });

      return res.status(200).json({
        success: true,
        chatId: targetReplyChatId,
        groupChatId: isGroup ? chatId : null,
        text: finalReplyText,
        deliveryMode: effectiveCardDeliveryMode,
        imageOnly: Boolean(imageOnlyReply && replyMedia),
        ...(replyMedia ? replyMedia : {}),
        ...(groupBroadcast ? { groupBroadcast } : {})
      });
    } catch (err: any) {
      return res.status(200).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // 🎨 ROTAS LIQUID GLASS V3 (CARDS PNG PARA WHATSAPP + STUDIO INTERATIVO)
  // ============================================================================
  app.get("/api/cards/analytics-data", async (req, res) => {
    try {
      const requestedPlayerId = String(req.query.playerId || "").trim();
      const requestedDate = String(req.query.date || "").trim() || undefined;
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);

      const activePlayers = allPlayers.filter(
        (p) => (p.status === "active" || p.status === "guest" || !p.status) && !p.isDM
      );
      const targetPlayer =
        activePlayers.find((p) => p.id === requestedPlayerId || p.uid === requestedPlayerId) ||
        activePlayers.sort((a, b) => (b.elo || 1200) - (a.elo || 1200))[0];

      const rawIndividual = targetPlayer
        ? computeIndividualNightData(targetPlayer, allMatches, allPlayers, requestedDate)
        : null;
      const individual = rawIndividual
        ? await enrichIndividualNightDataWithHumor(rawIndividual)
        : null;
      const daily = computeDailyRankingData(allMatches, allPlayers, requestedDate);
      const accumulated = computeAccumulatedRankingData(allMatches, allPlayers);
      const eloCurve = targetPlayer ? computePlayerEloCurve(targetPlayer, allMatches, 8) : [];

      return res.json({
        success: true,
        individual,
        daily,
        accumulated,
        eloCurve
      });
    } catch (err: any) {
      console.error("[Cards API] Erro em /api/cards/analytics-data:", err);
      return res.status(500).json({ success: false, error: err?.message || "Erro interno" });
    }
  });

  app.get("/api/cards/individual.png", async (req, res) => {
    try {
      const requestedPlayerId = String(req.query.playerId || "").trim();
      const requestedDate = String(req.query.date || "").trim() || undefined;
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);

      const targetPlayer =
        allPlayers.find((p) => p.id === requestedPlayerId || p.uid === requestedPlayerId) ||
        allPlayers
          .filter((p) => p.status === "active" && !p.isDM)
          .sort((a, b) => (b.elo || 1200) - (a.elo || 1200))[0];

      if (!targetPlayer) {
        return res.status(404).json({ error: "Atleta não encontrado" });
      }

      const rawData = computeIndividualNightData(targetPlayer, allMatches, allPlayers, requestedDate);
      if (!rawData) {
        return res.status(404).json({ error: "Nenhuma sessão encontrada para gerar o card" });
      }

      const data = await enrichIndividualNightDataWithHumor(rawData);
      const png = renderIndividualNightCardPng(data);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("X-Card-Fonts-Loaded", String(getLoadedCardFontsCount()));
      res.setHeader(
        "Content-Disposition",
        `inline; filename="guerreiros_individual_${data.dateKey}_${data.firstName.toLowerCase()}.png"`
      );
      return res.send(png);
    } catch (err: any) {
      console.error("[Cards API] Erro ao renderizar /api/cards/individual.png:", err);
      return res.status(500).json({ error: err?.message || "Erro ao gerar PNG" });
    }
  });

  app.get("/api/cards/daily-ranking.png", async (req, res) => {
    try {
      const requestedDate = String(req.query.date || "").trim() || undefined;
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);

      const data = computeDailyRankingData(allMatches, allPlayers, requestedDate);
      if (!data) {
        return res.status(404).json({ error: "Nenhuma partida encontrada para a data selecionada" });
      }

      const png = renderDailyRankingCardPng(data);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("X-Card-Fonts-Loaded", String(getLoadedCardFontsCount()));
      res.setHeader(
        "Content-Disposition",
        `inline; filename="guerreiros_ranking_dia_${data.dateKey}.png"`
      );
      return res.send(png);
    } catch (err: any) {
      console.error("[Cards API] Erro ao renderizar /api/cards/daily-ranking.png:", err);
      return res.status(500).json({ error: err?.message || "Erro ao gerar PNG" });
    }
  });

  app.get("/api/cards/accumulated-ranking.png", async (_req, res) => {
    try {
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);

      const data = computeAccumulatedRankingData(allMatches, allPlayers);
      const png = renderAccumulatedRankingCardPng(data);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("X-Card-Fonts-Loaded", String(getLoadedCardFontsCount()));
      res.setHeader(
        "Content-Disposition",
        `inline; filename="guerreiros_ranking_acumulado.png"`
      );
      return res.send(png);
    } catch (err: any) {
      console.error("[Cards API] Erro ao renderizar /api/cards/accumulated-ranking.png:", err);
      return res.status(500).json({ error: err?.message || "Erro ao gerar PNG" });
    }
  });

  app.post("/api/whatsapp/send-card", async (req, res) => {
    try {
      const effectiveMode = getWhatsAppCardDeliveryMode();
      if (effectiveMode !== "vm_image_only") {
        return res.status(400).json({
          success: false,
          disabled: true,
          error:
            "Envio de Cards HD pelo WhatsApp está desabilitado. Ative 'Imagem Nativa via VM Google' ou use 'Baixar PNG' para compartilhar manualmente."
        });
      }

      const { cardType, playerId, date, target = "group" } = req.body || {};
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);
      const cfg = getWhatsAppConfig();
      const reqHost = String(req.headers.host || "").trim();
      const publicBaseUrl =
        reqHost && !reqHost.includes("localhost") && !reqHost.startsWith("127.")
          ? `https://${reqHost}`
          : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app";

      let mediaFetchUrl = "";
      let caption = "";
      let fileName = "guerreiros_card.png";
      let destination = cfg.groupJid;
      let fallbackTargets: string[] = [];
      let recipientLabel = "Grupo Guerreiros VC";

      if (cardType === "individual") {
        const player = allPlayers.find((p) => p.id === playerId || p.uid === playerId);
        if (!player) return res.status(404).json({ success: false, error: "Sócio não encontrado." });
        const indData = computeIndividualNightData(player, allMatches, allPlayers, date || undefined);
        if (!indData) {
          return res.status(404).json({ success: false, error: "Sem partidas registradas para essa data." });
        }
        mediaFetchUrl = `${publicBaseUrl}/api/cards/individual.png?playerId=${encodeURIComponent(player.id)}&date=${encodeURIComponent(indData.dateKey)}`;
        caption = `🏐 *RESUMO INDIVIDUAL — ${indData.firstName}* (${indData.dateLabel})\n${indData.wins}V/${indData.losses}D (${indData.winRate}%) • ${indData.eloDelta >= 0 ? "+" : ""}${indData.eloDelta} ELO • #${indData.nightRank} na Noite`;
        fileName = `guerreiros_individual_${indData.dateKey}_${indData.firstName.toLowerCase()}.png`;
        if (target === "private") {
          const targets = resolvePlayerWhatsAppTargets(player);
          if (targets.length === 0) {
            return res.status(400).json({
              success: false,
              error: `${indData.firstName} não possui número/JID de WhatsApp cadastrado.`
            });
          }
          destination = targets[0];
          fallbackTargets = targets.slice(1);
          recipientLabel = player.name;
        }
      } else if (cardType === "daily") {
        const dailyData = computeDailyRankingData(allMatches, allPlayers, date || undefined);
        if (!dailyData) {
          return res.status(404).json({ success: false, error: "Sem partidas registradas para essa data." });
        }
        mediaFetchUrl = `${publicBaseUrl}/api/cards/daily-ranking.png?date=${encodeURIComponent(dailyData.dateKey)}`;
        caption = `🔥 *RANKING DO DIA — ${dailyData.dateLabel}* (${dailyData.totalMatches} partidas • ${dailyData.totalAthletes} atletas)\n🏆 MVP: *${dailyData.mvp?.firstName || "-"}* • 🎯 Levantador: *${dailyData.bestSetter?.firstName || "-"}* • ⚡ Eficiente: *${dailyData.mostEfficient?.firstName || "-"}*`;
        fileName = `guerreiros_ranking_dia_${dailyData.dateKey}.png`;
      } else if (cardType === "accumulated") {
        const accData = computeAccumulatedRankingData(allMatches, allPlayers);
        mediaFetchUrl = `${publicBaseUrl}/api/cards/accumulated-ranking.png`;
        caption = `🏆 *RANKING GERAL ACUMULADO* (${accData.totalActivePlayers} sócios • Atualizado em ${accData.referenceDateLabel})\nLíder: *${accData.topRows[0]?.firstName || "-"}* (${accData.topRows[0]?.elo || 1200} ELO)`;
        fileName = `guerreiros_ranking_acumulado.png`;
      } else {
        return res.status(400).json({ success: false, error: "Tipo de card inválido." });
      }

      // Enfileira metadados leves (mediaFetchUrl) para a VM Google baixar o PNG binário e enviar nativamente (sem links na mensagem!)
      const outboxItem: OutboxWhatsAppMessage = {
        outboxId: `obx_img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        to: destination,
        fallbackTargets,
        text: "",
        mediaFetchUrl,
        mediaType: "image",
        fileName,
        caption,
        imageOnly: true,
        type: `MANUAL_CARD_${String(cardType).toUpperCase()}`,
        recipientLabel,
        queuedAt: Date.now(),
        attempts: 0
      };
      pendingWhatsAppOutbox.push(outboxItem);
      if (pendingWhatsAppOutbox.length > 100) {
        pendingWhatsAppOutbox = pendingWhatsAppOutbox.slice(-100);
      }
      saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
      persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {});

      return res.json({
        success: true,
        deliveryMode: effectiveMode,
        queuedForBridge: true,
        recipientLabel
      });
    } catch (err: any) {
      console.error("[Cards API] Erro em /api/whatsapp/send-card:", err);
      return res.status(500).json({ success: false, error: err?.message || "Erro ao enfileirar card" });
    }
  });

  // --- Rotas IA / Sentinel ---
  app.post("/api/sentinel/deep-scan", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    try {
      const { players = [], matches = [], loginLogs = [], auditLogs = [], metadata = {} } = req.body;
      const { runSentinelDeepScan } = await import("./services/sentinelService.ts");
      const report = await runSentinelDeepScan(apiKey, {
        players,
        matches,
        loginLogs,
        auditLogs,
        metadata
      });
      const status = report.includes("CRÍTICO")
        ? "CRITICAL"
        : report.includes("WARNING")
        ? "WARNING"
        : "HEALTHY";
      res.json({ success: true, report, status });
    } catch (err: any) {
      res.status(500).json({ error: "Sentinel scan failed", details: err.message });
    }
  });

  app.post("/api/ai/coach-feedback", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    try {
      const { player, allPlayers = [], recentMatches = [] } = req.body;
      if (!player) return res.status(400).json({ error: "Player data is required" });
      const { runAICoachAnalysis } = await import("./services/aiCoachService.ts");
      const feedback = await runAICoachAnalysis(apiKey, { player, allPlayers, recentMatches });
      res.json({ success: true, feedback });
    } catch (err: any) {
      res.status(500).json({ error: "AI Coach failed", details: err.message });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    try {
      const { message, history = [], context = {} } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });
      const { runAIChat } = await import("./services/aiChatService.ts");
      const response = await runAIChat(apiKey, message, history, context);
      res.json({ success: true, response });
    } catch (err: any) {
      res.status(500).json({ error: "Chat failed", details: err.message });
    }
  });

  app.post("/api/gemini/analyze-match", async (req, res) => {
    try {
      const { result, attendance } = req.body;
      const { serverAnalyzeMatch } = await import("./services/serverGemini.ts");
      const analysis = await serverAnalyzeMatch(result, attendance);
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze match", details: err.message });
    }
  });

  app.post("/api/gemini/verify-rules", async (req, res) => {
    try {
      const { attendanceList, result, balanceLevel, lastMatch } = req.body;
      const { serverVerifyRules } = await import("./services/serverGemini.ts");
      const auditResult = await serverVerifyRules(
        attendanceList,
        result,
        balanceLevel,
        lastMatch
      );
      res.json({ success: true, auditResult });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to verify rules", details: err.message });
    }
  });

  app.post("/api/gemini/daily-summary", async (req, res) => {
    try {
      const { stats } = req.body;
      const { serverDailySummary } = await import("./services/serverGemini.ts");
      const summary = await serverDailySummary(stats);
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate daily summary", details: err.message });
    }
  });

  app.post("/api/gemini/tts", async (req, res) => {
    try {
      const { text } = req.body;
      const { serverTTS } = await import("./services/serverGemini.ts");
      const audioBase64 = await serverTTS(text);
      res.json({ success: true, audioBase64 });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate TTS", details: err.message });
    }
  });

  app.post("/api/gemini/detect-anomalies", async (req, res) => {
    try {
      const { data } = req.body;
      const { serverDetectAnomalies } = await import("./services/serverGemini.ts");
      const report = await serverDetectAnomalies(data);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to detect anomalies", details: err.message });
    }
  });

  app.post("/api/gemini/billing-analysis", async (req, res) => {
    try {
      const { billingData } = req.body;
      const { serverAnalyzeBillingCosts } = await import("./services/serverGemini.ts");
      const analysis = await serverAnalyzeBillingCosts(billingData);
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze billing", details: err.message });
    }
  });

  app.post("/api/gemini/birthday-message", async (req, res) => {
    try {
      const { playerName, player } = req.body;
      const { serverGenerateBirthdayMessage } = await import("./services/serverGemini.ts");
      const recentGreetings = Array.isArray(cachedScheduler?.recentBirthdayGreetings)
        ? cachedScheduler.recentBirthdayGreetings
        : [];
      const payload = player
        ? { ...player, recentBirthdayGreetings: recentGreetings }
        : { name: playerName, recentBirthdayGreetings: recentGreetings };
      const message = await serverGenerateBirthdayMessage(payload);
      res.json({ success: true, message });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate birthday message", details: err.message });
    }
  });

  app.post("/api/gemini/stream", async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body || {};
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const { serverStreamText } = await import("./services/serverGemini.ts");
      const stream = await serverStreamText(prompt, systemInstruction);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      try {
        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (streamErr: any) {
        const { recordServerAIError } = await import("./services/serverGemini.ts");
        recordServerAIError(streamErr);
        res.write(`data: ${JSON.stringify({ error: streamErr?.message || "Stream interrupted" })}\n\n`);
        res.end();
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start Gemini stream", details: err.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: err?.message || "Stream error" })}\n\n`);
        res.end();
      }
    }
  });

  // --- Rotas de Diagnóstico, Métricas GCP e Sincronização de Acessos (migradas do server.dev.ts) ---
  app.get("/api/test", (_req, res) => {
    res.json({ message: "API is working" });
  });

  app.get("/api/debug-identity", async (_req, res) => {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth();
      const client = await auth.getClient();
      let email = (client as any).email || (client as any).client_email || "Not found in client";
      const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
      const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } }).catch(() => null);
      if (metadataResp?.ok) {
        email = await metadataResp.text();
      }
      res.json({ email, env: process.env.GOOGLE_CLOUD_PROJECT });
    } catch (err: any) {
      res.json({ error: err.message });
    }
  });

  app.post("/api/players/:id/link", async (req, res) => {
    try {
      const playerId = req.params.id;
      const { uid } = req.body;
      if (!playerId || !uid) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      const db = await getFirestore();
      await withFirestoreGuard(() => db.collection("players").doc(playerId).update({ uid }), undefined);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presence/sync-accesses", async (_req, res) => {
    try {
      const db = await getFirestore();
      const currentInt = await ensureFreshIntentionsDocument(true);
      const timestamps: Record<string, number> = currentInt.confirmationTimestamps || {};
      const responses: Record<string, string> = currentInt.responses || {};
      const todayStr = getFirestoreDateKey();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
      let syncedCount = 0;

      for (const [playerId, status] of Object.entries(responses)) {
        if (!status || status === "RESET") continue;
        const pData = allPlayers.find((p) => p.id === playerId);
        if (!pData) continue;

        const ts = timestamps[playerId] || Date.now();
        const confirmIso = new Date(ts).toISOString();
        const loginHist: string[] = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];
        const hasConfirmDate = loginHist.some(
          (h) => new Date(h).toISOString().slice(0, 10) === confirmIso.slice(0, 10)
        );

        if (!pData.lastLoginAt || !hasConfirmDate || new Date(pData.lastLoginAt).getTime() < ts) {
          const newHist = [confirmIso, ...loginHist.filter((h) => h !== confirmIso)].slice(0, 20);
          const isNewDay = !pData.lastReadUpdate || pData.lastReadUpdate < todayStr;
          const currentAccesses = Number(pData.accesses || 0);
          const currentDaily = Number(pData.dailyAccesses || 0);

          await withFirestoreGuard(
            () =>
              db.collection("players").doc(playerId).set(
                {
                  lastLoginAt: confirmIso,
                  loginHistory: newHist,
                  accesses: hasConfirmDate ? currentAccesses : currentAccesses + 1,
                  dailyAccesses: isNewDay ? 1 : currentDaily + 1,
                  lastReadUpdate: todayStr
                },
                { merge: true }
              ),
            undefined
          );
          syncedCount++;
        }
      }

      res.json({ success: true, synced: syncedCount });
    } catch (err: any) {
      res.status(200).json({ success: false, synced: 0, error: err.message });
    }
  });

  app.get("/api/billing/real-time", async (req, res) => {
    const targetDateStr = req.query.date as string;
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authClient = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const client = await authClient.getClient();
        serviceAccountEmail = (client as any).email || (client as any).client_email || "rodneyes@gmail.com";
        if (serviceAccountEmail === "rodneyes@gmail.com") {
          const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
          const metadataResp = await fetch(metadataUrl, {
            headers: { "Metadata-Flavor": "Google" },
            signal: AbortSignal.timeout(2000)
          }).catch(() => null);
          if (metadataResp?.ok) {
            serviceAccountEmail = await metadataResp.text();
          }
        }
      } catch {}

      const projectId = configProjectId;
      const { MetricServiceClient } = await import("@google-cloud/monitoring");
      const metricsClient = new MetricServiceClient();

      let startTime: Date;
      let endTime: Date;
      if (targetDateStr) {
        startTime = new Date(`${targetDateStr}T03:00:00Z`);
        const nextDay = new Date(startTime);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(2, 59, 59, 999);
        endTime = nextDay;
      } else {
        endTime = new Date();
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      }

      let timeSeries: any[] = [];
      let cpuMetricAvailable = false;
      try {
        const [response] = await metricsClient.listTimeSeries(
          {
            name: metricsClient.projectPath(projectId),
            filter: 'metric.type = "run.googleapis.com/cpu/usage_time"',
            interval: {
              startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
              endTime: { seconds: Math.floor(endTime.getTime() / 1000) }
            },
            aggregation: {
              alignmentPeriod: { seconds: 60 },
              perSeriesAligner: "ALIGN_SUM",
              crossSeriesReducer: "REDUCE_SUM"
            }
          },
          { timeout: 10000 }
        );
        timeSeries = response;
        cpuMetricAvailable = timeSeries.length > 0;
      } catch {}

      let totalCpuSeconds = 0;
      timeSeries.forEach((serie) => {
        serie.points?.forEach((point: any) => {
          if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
        });
      });

      let memorySeries: any[] = [];
      try {
        const [response] = await metricsClient.listTimeSeries(
          {
            name: metricsClient.projectPath(projectId),
            filter: 'metric.type = "run.googleapis.com/container/memory/usage"',
            interval: {
              startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
              endTime: { seconds: Math.floor(endTime.getTime() / 1000) }
            },
            aggregation: {
              alignmentPeriod: { seconds: 60 },
              perSeriesAligner: "ALIGN_MEAN",
              crossSeriesReducer: "REDUCE_SUM"
            }
          },
          { timeout: 10000 }
        );
        memorySeries = response;
      } catch {}

      let totalMemoryBytesAvg = 0;
      let memoryPointsCount = 0;
      memorySeries.forEach((serie) => {
        serie.points?.forEach((point: any) => {
          if (point.value?.doubleValue) {
            totalMemoryBytesAvg += point.value.doubleValue;
            memoryPointsCount++;
          }
        });
      });
      if (memoryPointsCount > 0) totalMemoryBytesAvg = totalMemoryBytesAvg / memoryPointsCount;

      const durationSeconds = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
      const totalMemoryByteSeconds = totalMemoryBytesAvg * durationSeconds;

      let totalRequests = 0;
      try {
        const [response] = await metricsClient.listTimeSeries(
          {
            name: metricsClient.projectPath(projectId),
            filter: 'metric.type = "run.googleapis.com/request_count"',
            interval: {
              startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
              endTime: { seconds: Math.floor(endTime.getTime() / 1000) }
            },
            aggregation: {
              alignmentPeriod: { seconds: 60 },
              perSeriesAligner: "ALIGN_SUM",
              crossSeriesReducer: "REDUCE_SUM"
            }
          },
          { timeout: 10000 }
        );
        response.forEach((serie) => {
          serie.points?.forEach((point: any) => {
            if (point.value?.int64Value) totalRequests += Number(point.value.int64Value);
          });
        });
      } catch {}

      const cpuCost = totalCpuSeconds * 0.0000336;
      const memoryCost = (totalMemoryByteSeconds / (1024 * 1024 * 1024)) * 0.0000036;
      const requestCost = (totalRequests / 1000000) * 0.4;
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
        serviceAccount: serviceAccountEmail,
        status: "success"
      });
    } catch (error: any) {
      const errorMessageStr = error.message || "";
      const isApiDisabled = errorMessageStr.includes("has not been used") || errorMessageStr.includes("is disabled");
      return res.status(200).json({
        success: false,
        isGcpError: true,
        errorType: isApiDisabled ? "API_DISABLED" : "IAM_PERMISSION_DENIED",
        error: isApiDisabled ? "API de Monitoramento Desativada" : "Erro de Permissão IAM",
        details: error.message,
        helpLink: "https://console.developers.google.com/iam-admin/iam",
        projectId: configProjectId || "desconhecido"
      });
    }
  });

  // --- Rotas WebAuthn ---
  app.post("/api/auth/webauthn/register/options", async (req, res) => {
    try {
      const { rpID, email, playerId: bodyPlayerId, playerName: bodyPlayerName } = req.body;
      if (!email) return res.status(400).json({ error: "E-mail é obrigatório!" });
      const trimmedEmail = email.trim().toLowerCase();
      let playerId = bodyPlayerId || "owner_admin";
      let playerName =
        bodyPlayerName || (trimmedEmail === "rodneyes@gmail.com" ? "Administrador" : "Jogador");

      if (!bodyPlayerId) {
        const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);
        const found = allPlayers.find((p) => p.email && p.email.trim().toLowerCase() === trimmedEmail);
        if (found) {
          playerId = found.id;
          playerName = found.name || "Jogador";
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/register/verify", async (req, res) => {
    try {
      const { attestationResponse, origin, rpID, email } = req.body;
      if (!email) return res.status(400).json({ error: "E-mail não especificado." });
      const trimmedEmail = email.trim().toLowerCase();
      const cachedData = challengeStore.get("reg_" + trimmedEmail);
      if (!cachedData) {
        return res.status(400).json({ error: "Sessão expirada. Tente novamente!" });
      }
      challengeStore.delete("reg_" + trimmedEmail);

      const allowedOrigins = Array.from(
        new Set(
          [
            origin,
            req.headers.origin,
            "https://ais-dev-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "https://ais-pre-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "https://guerreiros-volleyball-club-238897290870.us-west1.run.app",
            "http://localhost:3000"
          ].filter(Boolean) as string[]
        )
      );

      const allowedRPIDs = Array.from(
        new Set(
          [
            rpID,
            "ais-dev-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "ais-pre-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "guerreiros-volleyball-club-238897290870.us-west1.run.app",
            "localhost"
          ].filter(Boolean) as string[]
        )
      );

      const verification = await verifyRegistration(
        attestationResponse,
        cachedData.challenge,
        allowedOrigins,
        allowedRPIDs
      );
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "Falha na verificação da biometria." });
      }

      const regInfo = verification.registrationInfo as any;
      const credential = regInfo.credential || {};
      const credentialID = regInfo.credentialID || credential.id;
      const credentialPublicKey = regInfo.credentialPublicKey || credential.publicKey;
      const counter = regInfo.counter ?? credential.counter ?? 0;

      const credentialIdStr =
        typeof credentialID === "string"
          ? credentialID
          : Buffer.from(credentialID).toString("base64url");
      const publicKeyStr =
        typeof credentialPublicKey === "string"
          ? credentialPublicKey
          : Buffer.from(credentialPublicKey).toString("base64url");

      const credentialDataToSave = {
        id: credentialIdStr,
        publicKey: publicKeyStr,
        counter,
        email: trimmedEmail,
        playerId: cachedData.playerId || "owner_admin",
        playerName: cachedData.playerName || "Administrador",
        createdAt: Date.now()
      };

      saveLocalCredential(credentialIdStr, credentialDataToSave);
      const db = await getFirestore();
      await withFirestoreGuard(
        () =>
          db
            .collection("metadata")
            .doc("webauthn_credentials")
            .set({ [credentialIdStr]: credentialDataToSave }, { merge: true }),
        undefined
      );

      res.json({ verified: true, credential: credentialDataToSave });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/login/options", async (req, res) => {
    try {
      const { rpID, email } = req.body;
      let allowCredentials: any[] | undefined = undefined;
      if (email) {
        const trimmed = String(email).trim().toLowerCase();
        await syncCredentialsFromFirestore();
        const localCreds = loadLocalCredentials();
        const matching = Object.values(localCreds).filter(
          (c: any) => c.email && c.email.toLowerCase() === trimmed
        );
        if (matching.length > 0) {
          allowCredentials = matching.map((c: any) => ({
            id: c.id,
            type: "public-key",
            transports: c.transports || ["internal", "hybrid"]
          }));
        }
      }
      const options = await getAuthenticationOptions(rpID, allowCredentials);
      challengeStore.set("login_" + options.challenge, {
        challenge: options.challenge,
        createdAt: Date.now()
      });
      res.json(options);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/login/verify", async (req, res) => {
    try {
      const { assertionResponse, challenge, origin, rpID } = req.body;
      const cachedChallenge = challengeStore.get("login_" + challenge);
      if (!cachedChallenge) {
        return res.status(400).json({ error: "Desafio expirado. Tente novamente!" });
      }
      challengeStore.delete("login_" + challenge);

      const credentialID = assertionResponse.id;
      let localCreds = loadLocalCredentials();
      if (!localCreds[credentialID]) {
        await syncCredentialsFromFirestore();
        localCreds = loadLocalCredentials();
      }
      const credentialData = localCreds[credentialID];
      if (!credentialData) {
        return res.status(404).json({ error: "Biometria não encontrada neste dispositivo." });
      }

      const authenticator = {
        credentialID: credentialData.id,
        credentialPublicKey: Buffer.from(credentialData.publicKey, "base64url"),
        counter: 0,
        transports: credentialData.transports || []
      };

      const allowedOrigins = Array.from(
        new Set(
          [
            origin,
            req.headers.origin,
            "https://ais-dev-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "https://ais-pre-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "https://guerreiros-volleyball-club-238897290870.us-west1.run.app",
            "http://localhost:3000"
          ].filter(Boolean) as string[]
        )
      );

      const allowedRPIDs = Array.from(
        new Set(
          [
            rpID,
            "ais-dev-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "ais-pre-5sizycyxq2623fkika3pd6-172372482323.us-east1.run.app",
            "guerreiros-volleyball-club-238897290870.us-west1.run.app",
            "localhost"
          ].filter(Boolean) as string[]
        )
      );

      const verification = await verifyAuthentication(
        assertionResponse,
        challenge,
        allowedOrigins,
        allowedRPIDs,
        authenticator
      );
      if (verification.verified) {
        updateLocalCredentialCounter(credentialID, verification.authenticationInfo.newCounter);
        res.json({ verified: true, email: credentialData.email });
      } else {
        res.status(400).json({ error: "Assinatura biométrica inválida." });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const distPath = path.join(process.cwd(), "dist");
  const attachStaticDist = () => {
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=2592000");
          } else if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
          }
        }
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).send("Rebuilding...");
      }
    });
  };

  const isDevMode =
    process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === "dev";

  if (isDevMode) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true, ws: false },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("[Server] Falha ao iniciar Vite dev middleware; usando dist/ estático:", viteErr);
      attachStaticDist();
    }
  } else {
    attachStaticDist();
  }

  const server = http.createServer(app);
  setupGeminiLiveWebSocket(server);

  // 🚀 Abre a porta 3000 imediatamente para passar no Health Check do Cloud Run
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);

    // 🪶 Cold-start leve: aquece apenas cache em memória e hidrata política do roteador de IA
    // (Sincronização em massa de contatos/fotos WhatsApp agora roda apenas sob demanda em /api/whatsapp/sync-photos)
    setTimeout(async () => {
      try {
        await ensureFreshIntentionsDocument();
        await getCachedPlayers(true);
        await getCachedMatches(true);
        const db = await getFirestore();
        const [policyDoc, sysDoc] = await Promise.all([
          db.collection("metadata").doc("ai_router_policy").get().catch(() => null),
          db.collection("metadata").doc("system").get().catch(() => null)
        ]);
        if (policyDoc && policyDoc.exists) {
          const data = policyDoc.data();
          if (data?.policy && !data?.resetToDefault) {
            setAIRouterPolicy(data.policy, "firestore");
          }
        }
        if (sysDoc && sysDoc.exists) {
          const sdata = sysDoc.data() || {};
          if (sdata.whatsappCardDeliveryMode === "disabled" || sdata.whatsappCardDeliveryMode === "vm_image_only") {
            memoryCardDeliveryModeOverride = sdata.whatsappCardDeliveryMode;
          }
          if (typeof sdata.whatsappApiUrl === "string" && sdata.whatsappApiUrl.trim()) {
            memoryWaApiUrlOverride = sdata.whatsappApiUrl.trim().replace(/\/$/, "");
          }
          if (typeof sdata.whatsappInstance === "string" && sdata.whatsappInstance.trim()) {
            memoryWaInstanceOverride = sdata.whatsappInstance.trim();
          }
        }
      } catch {}
    }, 1500);
  });
}

process.on("unhandledRejection", (reason: any) => {
  console.error("[Process Guard] Unhandled Promise Rejection isolado (thread principal preservada):", reason?.message || reason);
});

process.on("uncaughtException", (err: any) => {
  console.error("[Process Guard] Uncaught Exception isolado (thread principal preservada):", err?.message || err);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});