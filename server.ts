import express from "express";
import http from "http";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
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
  computeDailyRankingData,
  computeAccumulatedRankingData,
  computePlayerEloCurve,
  renderIndividualNightCardPng,
  renderDailyRankingCardPng,
  renderAccumulatedRankingCardPng
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

function loadLocalPlayersBackup(): any[] {
  try {
    if (fs.existsSync(LOCAL_PLAYERS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_PLAYERS_PATH, "utf-8"));
      if (Array.isArray(parsed) && parsed.length >= 10) return parsed;
    }
  } catch {}
  return SEED_CLUB_PLAYERS;
}

function saveLocalPlayersBackup(list: any[]) {
  try {
    if (Array.isArray(list) && list.length >= 10) {
      fs.writeFileSync(LOCAL_PLAYERS_PATH, JSON.stringify(list, null, 2), "utf-8");
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
      fs.writeFileSync(LOCAL_MATCHES_PATH, JSON.stringify(list, null, 2), "utf-8");
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

async function withFirestoreGuard<T>(fn: () => Promise<T>, fallbackValue: T, timeoutMs = 8000): Promise<T> {
  if (Date.now() < firestoreCircuitOpenUntil) {
    return fallbackValue;
  }
  try {
    const result = await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), timeoutMs)
      )
    ]);
    return result;
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    // Só abre o disjuntor se for erro explícito de Quota Excedida (RESOURCE_EXHAUSTED), nunca por timeout de cold start
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota")) {
      firestoreCircuitOpenUntil = Date.now() + 5 * 60 * 1000;
      console.warn("[Firestore Circuit Breaker] Ativado por 5 min (Quota):", msg.slice(0, 120));
    } else {
      console.warn("[Firestore Guard] Aviso de leitura:", msg.slice(0, 120));
    }
    return fallbackValue;
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
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

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

      const aiResp = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
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
    deleteDoc
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
      if (options) {
        await setDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), data, options);
      } else {
        await setDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), data);
      }
    },
    async update(data: any) {
      await updateDoc(doc(rawDb, ...(pathSegments as [string, ...string[]])), data);
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
        return options ? await adminDocRef.set(data, options) : await adminDocRef.set(data);
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
        return await adminDocRef.update(data);
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
      playersSnap.forEach((d: any) => list.push({ id: d.id, ...d.data() }));
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
      matchesSnap.forEach((d: any) => list.push({ id: d.id, ...d.data() }));
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
    !forceRefresh &&
    cachedSystemConfig &&
    now - cachedSystemConfigLastFetch < SYSTEM_CONFIG_CACHE_TTL_MS
  ) {
    return cachedSystemConfig;
  }

  return withFirestoreGuard(
    async () => {
      const db = await getFirestore();
      const sysSnap = await db.collection("metadata").doc("system").get();
      cachedSystemConfig = sysSnap.exists ? sysSnap.data() || {} : {};
      cachedSystemConfigLastFetch = now;
      return cachedSystemConfig;
    },
    cachedSystemConfig || {}
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
        const decoded = await auth.verifyIdToken(token);
        uid = decoded.uid || uid;
        if (decoded.email) {
          email = decoded.email.trim().toLowerCase();
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
// 📍 CHECK-IN PRESENCIAL NA QUADRA VIA LOCALIZAÇÃO WHATSAPP (-8.131531, -34.907323)
// ============================================================================
const DEFAULT_COURT_LAT = -8.131531;
const DEFAULT_COURT_LNG = -34.907323;
const DEFAULT_GEOFENCE_RADIUS_METERS = 300; // 300m para compensar telhado metálico/cobertura da quadra

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
  const isAdminUser =
    Boolean(player?.isAdmin) ||
    String(player?.email || "").trim().toLowerCase() === "rodneyes@gmail.com" ||
    String(player?.phone || "").includes("97330924");

  // Janela permitida na quinta-feira: das 17:30 às 23:30 (ou liberado em qualquer dia para Admin testar o GPS)
  const isThursdayWindow =
    isAdminUser ||
    (br.dayOfWeek === 4 && br.totalMinutes >= 17 * 60 + 30 && br.totalMinutes <= 23 * 60 + 30);
  if (!isThursdayWindow) {
    return (
      `⏰ Olá, *${player.name.split(" ")[0]}*!\n\n` +
      `O check-in presencial na quadra via localização fica liberado nas *Quintas-feiras a partir das 17h30*.\n\n` +
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
      `🍎 *No iPhone:* Toque no *+* → *Localização* → *Enviar sua localização atual*.\n` +
      `🤖 *No Android:* Toque no *clipe (📎)* → *Localização* → *Enviar sua localização atual*.`
    );
  }

  const sysConfig = await getCachedSystemConfig();
  const courtLat = Number(sysConfig?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
  const courtLng = Number(sysConfig?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
  const maxRadius = Math.max(
    DEFAULT_GEOFENCE_RADIUS_METERS,
    Number(sysConfig?.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_METERS)
  );

  const distanceMeters = calculateDistanceMeters(
    locationPayload.lat,
    locationPayload.lng,
    courtLat,
    courtLng
  );

  if (distanceMeters > maxRadius) {
    return (
      `📍 *Você ainda está longe da quadra, ${player.name.split(" ")[0]}!*\n\n` +
      `📏 *Distância medida:* ~${distanceMeters} metros (limite da quadra: ${maxRadius}m).\n\n` +
      `Assim que chegar na quadra dos Guerreiros, envie novamente sua *Localização Atual* aqui no privado para entrar na fila do jogo! 🏐🏃‍♂️`
    );
  }

  const dateKey = br.dateKey;
  const now = Date.now();
  let arrivalOrder = 1;
  let alreadyPresent = false;

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

  // Também garante que o sócio conste como GOING na lista de intenção do dia
  await syncPlayerPreConfirmationDoc(db, dateKey, player, "GOING", now);

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
  mediaType?: "image";
  fileName?: string;
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

function loadLocalWhatsAppOutbox(): OutboxWhatsAppMessage[] {
  try {
    if (fs.existsSync(WHATSAPP_OUTBOX_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(WHATSAPP_OUTBOX_PATH, "utf-8"));
      if (Array.isArray(parsed)) return parsed;
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
      const parsed = JSON.parse(fs.readFileSync(WHATSAPP_COMM_LOGS_PATH, "utf-8"));
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 100).map((entry: any) => ({
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
    const db = await getFirestore();
    await withFirestoreGuard(
      () =>
        db.collection("metadata").doc("whatsapp_outbox").set({
          items: items.slice(-100),
          updatedAt: Date.now()
        }),
      undefined
    );
  } catch {}
}

async function hydrateOutboxFromFirestore(): Promise<void> {
  try {
    const db = await getFirestore();
    const remoteItems = await withFirestoreGuard(async () => {
      const snap = await db.collection("metadata").doc("whatsapp_outbox").get();
      if (!snap.exists) return [];
      const data = snap.data() || {};
      return Array.isArray(data.items) ? (data.items as OutboxWhatsAppMessage[]) : [];
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

let memoryBotActiveOverride: boolean | null = null;

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
} {
  let localCfg: any = {};
  try {
    if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
      localCfg = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {
    apiUrl: String(process.env.WHATSAPP_API_URL || localCfg.apiUrl || "http://34.133.253.248:8080").replace(/\/$/, ""),
    apiKey: String(process.env.WHATSAPP_API_KEY || localCfg.apiKey || "esperanca"),
    instanceName: String(process.env.WHATSAPP_INSTANCE || localCfg.instanceName || "Guerreiros"),
    groupJid: String(process.env.WHATSAPP_GROUP_JID || localCfg.groupJid || "120363401268459791@g.us"),
    botActive: isWhatsAppBotEnabled()
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
      const timer = setTimeout(() => controller.abort(), 8000);
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

      const rawRespText = await resp.text().catch(() => "");
      let parsedResp: any = null;
      try {
        parsedResp = rawRespText ? JSON.parse(rawRespText) : null;
      } catch {}

      const apiRejected =
        !resp.ok ||
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
    const payloads = [
      {
        number: targetJid,
        mediatype: "image",
        mimetype: "image/png",
        caption,
        media: cleanBase64,
        fileName
      },
      {
        number: targetJid,
        options: { delay: 1000, presence: "composing" },
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

        const rawRespText = await resp.text().catch(() => "");
        let parsedResp: any = null;
        try {
          parsedResp = rawRespText ? JSON.parse(rawRespText) : null;
        } catch {}

        const apiRejected =
          !resp.ok ||
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
        if (resp.status !== 400) break;
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

export async function downloadImageAsDataUri(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (imageUrl.startsWith("data:image/")) return imageUrl;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    // Garante que é uma imagem válida e menor que 750KB para caber com folga no documento Firestore
    if (buf.length < 100 || buf.length > 750 * 1024) return null;
    return `data:${contentType.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function fetchWhatsAppProfilePictureFromApi(
  phoneOrJid?: string | null,
  whatsappLid?: string | null
): Promise<string | null> {
  const cfg = getWhatsAppConfig();
  const candidates: string[] = [];

  if (phoneOrJid) {
    const cleanDigits = String(phoneOrJid).replace(/\D/g, "");
    if (cleanDigits.length >= 10) {
      const with55 = cleanDigits.startsWith("55") ? cleanDigits : `55${cleanDigits}`;
      candidates.push(with55);
      candidates.push(`${with55}@s.whatsapp.net`);
      // Caso o número tenha ou não o 9º dígito após o DDD
      if (with55.length === 13 && with55[4] === "9") {
        const without9 = with55.slice(0, 4) + with55.slice(5);
        candidates.push(without9);
      } else if (with55.length === 12) {
        const with9 = with55.slice(0, 4) + "9" + with55.slice(4);
        candidates.push(with9);
      }
    }
  }
  if (whatsappLid) {
    candidates.push(String(whatsappLid).trim());
  }

  const endpoints = [
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(cfg.instanceName)}`,
    `/chat/fetchProfile/${encodeURIComponent(cfg.instanceName)}`
  ];

  for (const num of candidates) {
    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
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
        if (!resp.ok) continue;
        const data: any = await resp.json();
        const rawPicUrl =
          data?.profilePictureUrl ||
          data?.picture ||
          data?.imgUrl ||
          data?.url ||
          data?.wuid?.profilePictureUrl ||
          data?.data?.profilePictureUrl ||
          null;

        if (rawPicUrl && typeof rawPicUrl === "string" && rawPicUrl.startsWith("http")) {
          const dataUri = await downloadImageAsDataUri(rawPicUrl);
          return dataUri || rawPicUrl;
        }
      } catch {}
    }
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

  if (finalPhoto) {
    player.photoUrl = finalPhoto;
    player.whatsappPhotoUrl = finalPhoto;
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
        { photoUrl: finalPhoto, whatsappPhotoUrl: finalPhoto, photoUpdatedAt: Date.now() },
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

  // 1) Busca participantes do grupo oficial dos Guerreiros na Evolution API
  const groupEndpoints = [
    `/group/participants/${encodeURIComponent(cfg.instanceName)}?groupJid=${encodeURIComponent(cfg.groupJid)}`,
    `/group/findGroupInfos/${encodeURIComponent(cfg.instanceName)}?groupJid=${encodeURIComponent(cfg.groupJid)}`
  ];
  for (const ep of groupEndpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(`${cfg.apiUrl}${ep}`, {
        method: "GET",
        headers: { apikey: cfg.apiKey },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data: any = await resp.json();
        const participants = Array.isArray(data)
          ? data
          : Array.isArray(data?.participants)
          ? data.participants
          : [];
        participants.forEach(extractContactEntry);
      }
    } catch {}
  }

  // 2) Busca agenda de contatos salvos e conversas da instância Evolution API
  for (const chatEp of ["/chat/findContacts", "/chat/findChats"]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
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
        const data: any = await resp.json();
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
  }

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
      res.json(getServerAIStatus());
    } catch (err) {
      res.status(500).json({ error: "Failed to get AI status" });
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
      if (typeof lat !== "number" || typeof lng !== "number") {
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
        lat: Number(lat),
        lng: Number(lng),
        isLive: true
      });

      const jid = normalizePhoneToJid(player.phone || phone);
      if (jid) {
        dispatchWhatsAppMessage(jid, `${replyMessage}\n\n— Guerreirinho, o robô do clube 🤖`).catch(() => {});
      }

      const withinRange = replyMessage.includes("CHECK-IN NA QUADRA CONFIRMADO") || replyMessage.includes("já está na lista");
      res.json({ success: true, withinRange, message: replyMessage });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
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
        cachedSystemConfig = clientSys;
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

  app.get("/api/whatsapp/photo-directory", async (req, res) => {
    try {
      const dir = { ...loadLocalWhatsAppPhotoDir() };
      const allPlayers = await getCachedPlayers(false);
      let latestUpdatedAt = 0;
      allPlayers.forEach((p: any) => {
        const photo = !isMissingOrDefaultAvatar(p.whatsappPhotoUrl)
          ? p.whatsappPhotoUrl
          : !isMissingOrDefaultAvatar(p.photoUrl)
          ? p.photoUrl
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
        const updateFields: Record<string, any> = {
          phone: normalizedPhone,
          whatsappLinkedAt: now
        };
        if (resolvedPhoto) {
          updateFields.photoUrl = resolvedPhoto;
          updateFields.whatsappPhotoUrl = resolvedPhoto;
          updateFields.photoUpdatedAt = now;
        }
        if (target) {
          Object.assign(target, updateFields);
          saveLocalPlayersBackup(allPlayers);
        }
        await withFirestoreGuard(
          () => db.collection("players").doc(playerId).set(updateFields, { merge: true }),
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
          const maxSide = 320;
          let w = img.width, h = img.height;
          if (w > h) { if (w > maxSide) { h = Math.round(h * maxSide / w); w = maxSide; } }
          else { if (h > maxSide) { w = Math.round(w * maxSide / h); h = maxSide; } }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          compressedDataUri = canvas.toDataURL('image/jpeg', 0.82);
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
      const { playerId, playerName, phone, photoUrl, base64, mimeType = "image/jpeg", source = "baileys_vm" } = req.body || {};
      const db = await getFirestore();
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);

      const norm = (s: string) =>
        String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

      let targetPlayer = allPlayers.find(
        (p) =>
          (playerId && p.id === playerId) ||
          (phone && matchBrazilianPhone(String(phone), p.phone)) ||
          (playerName && norm(p.name) === norm(playerName))
      );

      let resolvedPhoto: string | null = null;
      if (base64 && typeof base64 === "string") {
        resolvedPhoto = base64.startsWith("data:") ? base64 : `data:${mimeType};base64,${base64}`;
      } else if (photoUrl && typeof photoUrl === "string") {
        resolvedPhoto = photoUrl.startsWith("http")
          ? (await downloadImageAsDataUri(photoUrl)) || photoUrl
          : photoUrl;
      }

      if (!resolvedPhoto || isMissingOrDefaultAvatar(resolvedPhoto)) {
        return res.status(400).json({ success: false, error: "Imagem inválida ou ausente." });
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

      const targetId = targetPlayer?.id || playerId;
      if (targetId) {
        const updateFields: Record<string, any> = {
          photoUrl: resolvedPhoto,
          whatsappPhotoUrl: resolvedPhoto,
          photoUpdatedAt: now
        };
        if (effectivePhone) updateFields.phone = effectivePhone;
        if (targetPlayer) {
          Object.assign(targetPlayer, updateFields);
          saveLocalPlayersBackup(allPlayers);
        }
        await withFirestoreGuard(
          () => db.collection("players").doc(targetId).set(updateFields, { merge: true }),
          undefined
        );
        await withFirestoreGuard(
          () => db.collection("metadata").doc("system").set({ lastUpdate: now }, { merge: true }),
          undefined
        );
      }

      res.json({
        success: true,
        playerId: targetId || null,
        playerName: targetPlayer?.name || playerName || null,
        photoUrl: resolvedPhoto
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message });
    }
  });

  // 6. Sincronização Automática e Manual de Telefones, LIDs e Fotos de Perfil do WhatsApp dos Sócios
  app.post("/api/whatsapp/sync-photos", async (req, res) => {
    try {
      const {
        playerId,
        forceAll = false,
        players: clientPlayers,
        matches: clientMatches,
        intentions: clientIntentions
      } = req.body || {};
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

      // Passo 1: Varre o grupo do WhatsApp, os contatos da instância e o diretório do clube para preencher telefones ausentes
      const contactStats = await syncWhatsAppGroupContactsAndPhones(db, allPlayers);

      // Passo 2: Baixa e converte para Base64 permanente as fotos de perfil em lotes paralelos (com teto de 12s para nunca dar 504 Timeout)
      const targets = playerId
        ? allPlayers.filter((p) => p.id === playerId)
        : allPlayers.filter(
            (p) =>
              p.status !== "inactive" &&
              (Boolean(p.phone) || Boolean(p.whatsappLid)) &&
              (forceAll || isMissingOrDefaultAvatar(p.photoUrl))
          );

      let updatedCount = contactStats.photosFromContacts;
      const updatedPlayers: Array<{ id: string; name: string }> = [];
      const startTime = Date.now();

      for (let i = 0; i < targets.length; i += 6) {
        if (Date.now() - startTime > 12000) {
          // Continua o restante em background sem travar a requisição HTTP do navegador
          const remaining = targets.slice(i);
          setTimeout(async () => {
            for (const remPlayer of remaining) {
              await syncSinglePlayerWhatsAppPhoto(db, remPlayer, null, Boolean(forceAll || playerId)).catch(() => {});
            }
            saveLocalPlayersBackup(cachedPlayers);
          }, 100);
          break;
        }
        const batch = targets.slice(i, i + 6);
        await Promise.all(
          batch.map(async (p) => {
            const newPhoto = await syncSinglePlayerWhatsAppPhoto(
              db,
              p,
              null,
              Boolean(forceAll || playerId)
            ).catch(() => null);
            if (newPhoto) {
              updatedCount++;
              updatedPlayers.push({ id: p.id, name: p.name });
            }
          })
        );
      }

      saveLocalPlayersBackup(allPlayers);

      if (updatedCount > 0 || contactStats.phonesUpdated > 0 || contactStats.lidsUpdated > 0) {
        cachedPlayersLastFetch = Date.now();
        await withFirestoreGuard(
          () => db.collection("metadata").doc("system").set({ lastUpdate: Date.now() }, { merge: true }),
          undefined
        );
      }

      res.json({
        success: true,
        checked: targets.length,
        updatedCount,
        phonesUpdated: contactStats.phonesUpdated,
        lidsUpdated: contactStats.lidsUpdated,
        updatedPlayers,
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
      const groupJid = req.body?.groupJid || "120363401268459791@g.us";
      const dryRun = req.body?.dryRun === true;
      const br = getBrazilTimeParts();

      // Drena a fila pendente (mensagens privadas/grupo que falharam no envio direto) ANTES da janela de silêncio
      await hydrateOutboxFromFirestore();
      const drainedOutbox: Array<{
        to: string;
        fallbackTargets?: string[];
        text: string;
        mediaBase64?: string;
        mediaType?: "image";
        fileName?: string;
        delayMs?: number;
        outboxId?: string;
        isOutbox?: boolean;
      }> = [];
      if (!dryRun && pendingWhatsAppOutbox.length > 0) {
        const drained = pendingWhatsAppOutbox.splice(0, pendingWhatsAppOutbox.length);
        saveLocalWhatsAppOutbox(pendingWhatsAppOutbox);
        persistOutboxToFirestore(pendingWhatsAppOutbox).catch(() => {});
        drained.forEach((item, idx) => {
          drainedOutbox.push({
            to: item.to,
            fallbackTargets: item.fallbackTargets,
            text: item.text,
            ...(item.mediaBase64 ? { mediaBase64: item.mediaBase64, mediaType: item.mediaType || "image", fileName: item.fileName } : {}),
            delayMs: typeof item.delayMs === "number" ? item.delayMs : idx * 1500,
            outboxId: item.outboxId,
            isOutbox: true
          });
        });
      }

      const isLatePostGameWindow =
        (br.dayOfWeek === 4 && br.totalMinutes > 23 * 60 + 35) ||
        (br.dayOfWeek === 5 && br.totalMinutes <= 60);
      if (!isLatePostGameWindow && (br.totalMinutes < 8 * 60 || br.totalMinutes > 23 * 60 + 35)) {
        return res.json({ success: true, messages: drainedOutbox });
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
        mediaType?: "image";
        fileName?: string;
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
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  "User-Agent": "aistudio-build"
                }
              }
            });
            const prompt = `Você é o Guerreirinho, o mascote digital e Agente de IA oficial do clube de vôlei "Guerreiros VC".
Escreva uma pílula diária curta, envolvente e muito bem formatada para o WhatsApp (use *negrito* e emojis de vôlei/saúde) para enviar hoje (${br.dateKey}) no grupo dos sócios.

TEMA DO DIA: ${chosenTheme}

TEMAS JÁ ENVIADOS NOS ÚLTIMOS DIAS (PROIBIDO REPETIR O MESMO ASSUNTO):
${recentTopics.length > 0 ? recentTopics.join(" | ") : "Nenhum ainda"}

REGRAS DE FORMATO:
1. Na primeira linha, escreva APENAS: RESUMO_TEMA: <resumo de 4 palavras do assunto específico escolhido>
2. A partir da segunda linha, escreva a mensagem pronta para o WhatsApp (máximo de 2 parágrafos curtos + 1 frase final convidando os sócios a conversarem com o Guerreirinho no privado por texto ou áudio, ou digitarem *gv meusjogos* para ver seu histórico completo).`;

            const aiResp = await ai.models.generateContent({
              model: "gemini-4-hydrogen",
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
                  const ai = new GoogleGenAI({
                    apiKey,
                    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
                  });
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

                  const aiResp = await ai.models.generateContent({
                    model: "gemini-4-hydrogen",
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

              let dailyCardB64: string | undefined;
              try {
                const dailyCardData = computeDailyRankingData(matchesToday, freshPlayers, todayOrYesterdayKey);
                if (dailyCardData) {
                  dailyCardB64 = renderDailyRankingCardPng(dailyCardData).toString("base64");
                }
              } catch (cardErr) {
                console.warn("[Cron] Falha ao renderizar PNG do Ranking do Dia:", cardErr);
              }

              messagesToSend.push({
                to: groupJid,
                text: dayRankingMsg,
                ...(dailyCardB64
                  ? {
                      mediaBase64: dailyCardB64,
                      mediaType: "image" as const,
                      fileName: `ranking_dia_${todayOrYesterdayKey}.png`
                    }
                  : {})
              });

              if (allActiveSorted.length > 0) {
                let accCardB64: string | undefined;
                try {
                  const accCardData = computeAccumulatedRankingData(allMatchesNow, freshPlayers);
                  accCardB64 = renderAccumulatedRankingCardPng(accCardData).toString("base64");
                } catch (cardErr) {
                  console.warn("[Cron] Falha ao renderizar PNG do Ranking Acumulado:", cardErr);
                }

                messagesToSend.push({
                  to: groupJid,
                  delayMs: 5000,
                  text: generalRankingMsg,
                  ...(accCardB64
                    ? {
                        mediaBase64: accCardB64,
                        mediaType: "image" as const,
                        fileName: `ranking_acumulado_${todayOrYesterdayKey}.png`
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

              let personalCardB64: string | undefined;
              try {
                const indData = computeIndividualNightData(p, matchesToday, freshPlayers, todayOrYesterdayKey);
                if (indData) {
                  personalCardB64 = renderIndividualNightCardPng(indData).toString("base64");
                }
              } catch (cardErr) {
                console.warn(`[Cron 22:10] Falha ao renderizar PNG individual de ${p.name}:`, cardErr);
              }

              messagesToSend.push({
                to: targets[0],
                fallbackTargets: targets.slice(1),
                delayMs: scheduledPrivateCount * 3500,
                text: finalPersonalText,
                ...(personalCardB64
                  ? {
                      mediaBase64: personalCardB64,
                      mediaType: "image" as const,
                      fileName: `guerreiros_noite_${todayOrYesterdayKey}_${p.id}.png`
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

        const cleanHeader = String(m.text || "").trim().slice(0, 120);
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

      if (!dryRun) {
        // Dispara também os cards PNG diretamente via Evolution API (para garantir entrega de imagem mesmo se a ponte VM só ler m.text)
        deduplicatedMessages.forEach((m, idx) => {
          if (m.mediaBase64 && !m.isOutbox) {
            const wait = typeof m.delayMs === "number" ? m.delayMs : idx * 2500;
            setTimeout(() => {
              dispatchWhatsAppMedia(m.to, m.mediaBase64!, `🏐 Card Liquid Glass V3 • Guerreiros VC`, {
                type: "CRON_CARD_IMAGE",
                recipientLabel: m.to,
                fallbackTargets: m.fallbackTargets,
                fileName: m.fileName,
                skipOutboxOnFail: true
              }).catch(() => {});
            }, wait);
          }
        });
      }

      // Economia de tráfego Cloud Run: só inclui mediaBase64 (~600KB) no JSON do cron se a ponte VM pedir explicitamente
      const includeMediaBase64 = req.body?.includeMediaBase64 === true;
      const responseMessages = includeMediaBase64
        ? deduplicatedMessages
        : deduplicatedMessages.map(({ mediaBase64: _strip, ...rest }) => rest);

      res.json({ success: true, messages: responseMessages, ...(dryRun ? { dryRun: true } : {}) });
    } catch (err: any) {
      res.status(200).json({ success: false, messages: [], error: err.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      if (!isWhatsAppBotEnabled()) {
        return res.status(200).json({ ignored: true, reason: "bot_disabled" });
      }

      const body = req.body || {};
      const payload = body.payload || body.data || body;

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
        text.startsWith("🤖");

      if (isBotGeneratedOutput && !audioBuffer && !incomingLocation) {
        return res.status(200).json({ ignored: true, reason: "bot_output" });
      }

      const isFromMe = Boolean(payload.fromMe || payload?.key?.fromMe);
      const chatId: string =
        payload.from ||
        payload?.key?.remoteJid ||
        payload.chatId ||
        payload.remoteJid ||
        body.from ||
        "";
      const isGroup = chatId.endsWith("@g.us");
      const lower = text.toLowerCase().trim();

      const isAliasTrigger = /^@?(gv|bot|botgv|guerreirinho)($|[\s,!?:])/i.test(lower);

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

      const senderJid: string =
        payload.participant ||
        payload.author ||
        payload?.key?.participant ||
        chatId;
      const isLidSender = String(senderJid).endsWith("@lid");
      const senderLid: string =
        payload.participantLid || (isLidSender ? String(senderJid) : "");
      const pushName: string = String(payload.pushName || payload?.verifiedBizName || "").trim();

      // Extrai o número real de telefone mesmo quando o WhatsApp envia @lid
      const altPhoneRaw: string =
        payload.senderPn ||
        payload?.key?.senderPn ||
        payload?.key?.participantAlt ||
        payload?.key?.remoteJidAlt ||
        payload.participantAlt ||
        (!isLidSender ? String(senderJid).split("@")[0] : "");
      const senderPhone = String(altPhoneRaw || "").split("@")[0].replace(/\D/g, "");

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
      const verifiedSenderPnDigits = String(verifiedSenderPnRaw || "").split("@")[0].replace(/\D/g, "");
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
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build"
              }
            }
          });
          const audioPart = {
            inlineData: {
              data: audioBuffer.toString("base64"),
              mimeType: audioMimeType
            }
          };
          const transcriptionResp = await ai.models.generateContent({
            model: "gemini-4-hydrogen",
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

        // Regra do clube: NÃO dispara nem atualiza a lista no grupo quando o sócio informa ausência (NOT_GOING)
        return `📝 Registrado, *${senderPlayer.name}*. Sua ausência foi atualizada na lista. Fica para a próxima!\n\n_Mudei de ideia, quero ir:_ 👉 https://wa.me/558197330924?text=gv%20vou`;
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
        .replace(/^(@?gv|@?bot|@?botgv|@?guerreirinho|@guerreiros|guerreiros|!|\/)[,:\s]*/i, "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      let replyBody = "";
      let replyMedia: {
        mediaType: "image";
        mediaBase64: string;
        fileName: string;
        mediaUrl?: string;
        caption?: string;
      } | null = null;
      const reqHost = String(req.headers.host || "").trim();
      const publicBaseUrl =
        reqHost && !reqHost.includes("localhost") && !reqHost.startsWith("127.")
          ? `https://${reqHost}`
          : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app";
      let attendanceMutatedInWebhook = false;
      const textCoordMatch = cleanAfterAlias.match(/(-?\d{1,2}\.\d{4,})\s*[,;\s]\s*(-?\d{1,3}\.\d{4,})/);

      if (imageMessage && (!isGroup || isPhotoCaptionTrigger)) {
        let uploadedDataUri: string | null = null;
        try {
          if (imageMessage.base64) {
            const mime = imageMessage.mimetype || "image/jpeg";
            uploadedDataUri = String(imageMessage.base64).startsWith("data:")
              ? String(imageMessage.base64)
              : `data:${mime};base64,${imageMessage.base64}`;
          } else if (imageMessage.url) {
            uploadedDataUri = await downloadImageAsDataUri(imageMessage.url);
          }
        } catch {}

        if (uploadedDataUri && senderPlayer && !String(senderPlayer.id).startsWith("wa_")) {
          const nowTs = Date.now();
          senderPlayer.photoUrl = uploadedDataUri;
          senderPlayer.whatsappPhotoUrl = uploadedDataUri;
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
                  whatsappPhotoUrl: uploadedDataUri,
                  photoUpdatedAt: nowTs
                },
                { merge: true }
              ),
            undefined
          );
          replyBody = `📸✅ *Foto de perfil atualizada com sucesso, ${senderPlayer.name.split(" ")[0]}!*\n\nSua foto já foi salva permanentemente no cadastro oficial do *Guerreiros VC*! 🏐🔥`;
        } else {
          const firstName = String(senderPlayer?.name || "Guerreiro").split(" ")[0];
          const hostUrl =
            req.headers.origin ||
            (req.headers.host ? `https://${req.headers.host}` : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app");
          const fotoUrl = `${hostUrl}/foto?pid=${encodeURIComponent(senderPlayer?.id || "")}&phone=${encodeURIComponent(senderPlayer?.phone || senderPhone || "")}&name=${encodeURIComponent(firstName)}`;
          replyBody = `📸 *Para atualizar sua foto no cadastro, ${firstName}:*\n\nToque no link abaixo e selecione uma foto da sua galeria:\n👉 ${fotoUrl}`;
        }
      } else if (incomingLocation) {
        replyBody = await executeCourtLocationCheckIn(db, senderPlayer, incomingLocation);
      } else if (textCoordMatch) {
        replyBody = await executeCourtLocationCheckIn(db, senderPlayer, {
          lat: Number(textCoordMatch[1]),
          lng: Number(textCoordMatch[2]),
          isLive: true
        });
      } else if (
        ["cheguei", "estou na quadra", "to na quadra", "checkin", "check-in", "presente na quadra"].includes(
          cleanAfterAlias
        )
      ) {
        const firstName = String(senderPlayer.name || "Guerreiro").split(" ")[0];
        const hostUrl =
          req.headers.origin ||
          (req.headers.host ? `https://${req.headers.host}` : "https://guerreiros-volleyball-club-238897290870.us-west1.run.app");
        const checkInUrl = `${hostUrl}/checkin?pid=${encodeURIComponent(senderPlayer.id || "")}&phone=${encodeURIComponent(senderPlayer.phone || senderPhone || "")}&name=${encodeURIComponent(firstName)}`;

        replyBody =
          `📍🏐 *Bora fazer seu Check-in na Quadra, ${firstName}!*\n\n` +
          `🟢 *OPÇÃO 1 (Mais rápida — 1 Toque):*\n` +
          `Toque no link abaixo para validar seu GPS automaticamente e já receber a resposta aqui no WhatsApp:\n` +
          `👉 ${checkInUrl}\n\n` +
          `📍 *OPÇÃO 2 (Pelo Mapa do WhatsApp):*\n` +
          `Envie sua *Localização Atual* aqui na conversa (ou digite *gv cheguei lat, lng*).`;
      } else if (["1", "vou", "eu vou", "confirmar", "presenca"].includes(cleanAfterAlias)) {
        replyBody = await executeConfirmAttendance();
        attendanceMutatedInWebhook = true;
      } else if (["2", "naovou", "nao vou", "ausente"].includes(cleanAfterAlias)) {
        replyBody = await executeDeclineAttendance();
        // NÃO aciona atualização/envio da lista no grupo quando o sócio informa que não vai
        attendanceMutatedInWebhook = false;
      } else if (["lista", "confirmados", "quem vai"].includes(cleanAfterAlias)) {
        replyBody = await executeGetAttendanceList();
      } else if (cleanAfterAlias === "ranking") {
        replyBody = await executeGetRanking();
        try {
          const allMatches = await getCachedMatches(cachedMatches.length === 0);
          const accData = computeAccumulatedRankingData(allMatches, allPlayers);
          const cardUrl = `${publicBaseUrl}/api/cards/accumulated-ranking.png`;
          replyMedia = {
            mediaType: "image",
            mediaBase64: renderAccumulatedRankingCardPng(accData).toString("base64"),
            fileName: `guerreiros_ranking_acumulado.png`,
            mediaUrl: cardUrl,
            caption: `🏆 *RANKING GERAL ACUMULADO* (Atualizado em ${accData.referenceDateLabel}) — Liquid Glass V3`
          };
          replyBody += `\n\n🎨 *Card Visual Liquid Glass V3 (HD):*\n${cardUrl}`;
        } catch (cardErr) {
          console.warn("[Webhook] Falha ao renderizar PNG do gv ranking:", cardErr);
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
          "linha do tempo"
        ].includes(cleanAfterAlias) ||
        /(como\s+(foi|foram)\s+(as\s+)?minhas\s+partidas|minhas\s+partidas\s+(da\s+noite|de\s+hoje|do\s+dia|ontem)|ganhei\s+ou\s+perdi\s+hoje)/i.test(
          cleanAfterAlias
        )
      ) {
        const shouldRefreshMatches = cachedMatches.length === 0 || Date.now() - cachedMatchesLastFetch > 60 * 1000;
        const allMatches = shouldRefreshMatches
          ? await Promise.race([
              getCachedMatches(true),
              new Promise<any[]>((resolve) => setTimeout(() => resolve(cachedMatches), 3500))
            ])
          : cachedMatches;
        replyBody = buildPlayerNightTimelineReport(senderPlayer, allMatches, allPlayers);
        try {
          const indData = computeIndividualNightData(senderPlayer, allMatches, allPlayers);
          if (indData) {
            const cardUrl = `${publicBaseUrl}/api/cards/individual.png?playerId=${encodeURIComponent(senderPlayer.id)}&date=${encodeURIComponent(indData.dateKey)}`;
            replyMedia = {
              mediaType: "image",
              mediaBase64: renderIndividualNightCardPng(indData).toString("base64"),
              fileName: `guerreiros_noite_${indData.dateKey}.png`,
              mediaUrl: cardUrl,
              caption: `🏐 *RESUMO INDIVIDUAL — ${indData.firstName}* (${indData.dateLabel}) • ${indData.wins}V/${indData.losses}D (${indData.winRate}%) • ${indData.eloDelta >= 0 ? "+" : ""}${indData.eloDelta} ELO`
            };
            replyBody += `\n\n🎨 *Card Visual Liquid Glass V3 (Linha do Tempo Horizontal):*\n${cardUrl}`;
          }
        } catch (cardErr) {
          console.warn("[Webhook] Falha ao renderizar PNG do gv dia:", cardErr);
        }
      } else if (
        ["ranking do dia", "ranking da noite", "resumo", "resumo da noite", "sumula", "placares"].includes(
          cleanAfterAlias
        )
      ) {
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
        replyBody =
          buildPostGameSummaryAndDayRanking(matchesOfLastNight, allPlayers, lastDate) ||
          "⚠️ Nenhuma partida encontrada na última sessão.";
        try {
          const dailyData = computeDailyRankingData(matchesOfLastNight, allPlayers, lastDate);
          if (dailyData) {
            const cardUrl = `${publicBaseUrl}/api/cards/daily-ranking.png?date=${encodeURIComponent(lastDate)}`;
            replyMedia = {
              mediaType: "image",
              mediaBase64: renderDailyRankingCardPng(dailyData).toString("base64"),
              fileName: `guerreiros_ranking_dia_${lastDate}.png`,
              mediaUrl: cardUrl,
              caption: `🔥 *RANKING DO DIA — ${dailyData.dateLabel}* • MVP: *${dailyData.mvp?.firstName || "-"}* • Levantador: *${dailyData.bestSetter?.firstName || "-"}* • Eficiente: *${dailyData.mostEfficient?.firstName || "-"}*`
            };
            replyBody += `\n\n🎨 *Card Visual Liquid Glass V3 (Ranking do Dia):*\n${cardUrl}`;
          }
        } catch (cardErr) {
          console.warn("[Webhook] Falha ao renderizar PNG do gv resumo:", cardErr);
        }
      } else if (
        ["meusjogos", "meus jogos", "historico", "meu historico", "estatisticas", "minhas estatisticas", "raiox", "raio-x"].includes(
          cleanAfterAlias
        )
      ) {
        const allMatches = await getCachedMatches(cachedMatches.length === 0);
        const report = buildPlayerDeepStatsReport(senderPlayer, allPlayers, allMatches, "geral");
        replyBody = `${report}\n\n💬 _Quer que eu filtre essa análise apenas pelos seus últimos 15 jogos ou confirme sua presença para quinta-feira?_`;
      } else {
        const allMatches = await getCachedMatches(cachedMatches.length === 0);
        if (!apiKey) {
          const report = buildPlayerDeepStatsReport(senderPlayer, allPlayers, allMatches, "geral");
          replyBody = `${report}\n\n🤖 _Atalhos rápidos: *gv vou*, *gv lista*, *gv ranking*, *gv meusjogos* ou *gv pix*._`;
        } else {
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
            }
          );
        }
      }

      const replyText = `${replyBody}\n\n— Guerreirinho, o robô do clube 🤖`;

      let targetReplyChatId = chatId;
      if (isGroup) {
        // PRIORIDADE MÁXIMA: JID real verificado vindo diretamente do evento do WhatsApp
        // (evita enviar para telefone com 9º dígito divergente no cadastro, garantindo entrega no privado de sócios @lid como Caluca e Flavinha)
        if (verifiedSenderPnJid) {
          targetReplyChatId = verifiedSenderPnJid;
        } else if (senderJid && !senderJid.endsWith("@g.us")) {
          targetReplyChatId = senderJid;
        } else if (senderLid && !senderLid.endsWith("@g.us")) {
          targetReplyChatId = senderLid;
        } else if (senderPlayer?.whatsappJid && !String(senderPlayer.whatsappJid).endsWith("@g.us")) {
          targetReplyChatId = String(senderPlayer.whatsappJid);
        } else if (senderPlayer?.whatsappLid && !String(senderPlayer.whatsappLid).endsWith("@g.us")) {
          targetReplyChatId = String(senderPlayer.whatsappLid);
        } else if (senderPlayer?.phone) {
          const fallbackJid = normalizePhoneToJid(senderPlayer.phone);
          if (fallbackJid) targetReplyChatId = fallbackJid;
        }
      } else if (chatId.endsWith("@lid")) {
        // No privado via @lid, prefere o JID @s.whatsapp.net real (remoteJidAlt/senderPn) quando disponível,
        // mantendo o @lid original como fallback garantido para o conector da VM.
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

      // Dispara o card PNG diretamente via Evolution API (em paralelo) para que a imagem chegue no WhatsApp mesmo que a ponte VM só leia `text`
      if (replyMedia && targetReplyChatId && req.body?.skipDirectMedia !== true) {
        const mediaFallbackTargets = resolvePlayerWhatsAppTargets(senderPlayer);
        dispatchWhatsAppMedia(
          targetReplyChatId,
          replyMedia.mediaBase64,
          replyMedia.caption || "🏐 Card Liquid Glass V3 • Guerreiros VC",
          {
            type: "WEBHOOK_CARD_IMAGE",
            recipientLabel: senderPlayer?.name || targetReplyChatId,
            fallbackTargets: mediaFallbackTargets,
            fileName: replyMedia.fileName,
            skipOutboxOnFail: true
          }
        ).catch(() => {});
      }

      const includeMediaBase64 = req.body?.includeMediaBase64 === true;
      const responseMedia = replyMedia
        ? includeMediaBase64
          ? replyMedia
          : {
              mediaType: replyMedia.mediaType,
              fileName: replyMedia.fileName,
              ...(replyMedia.mediaUrl ? { mediaUrl: replyMedia.mediaUrl } : {})
            }
        : null;

      return res.status(200).json({
        success: true,
        chatId: targetReplyChatId,
        groupChatId: isGroup ? chatId : null,
        text: replyText,
        ...(responseMedia ? responseMedia : {}),
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

      const individual = targetPlayer
        ? computeIndividualNightData(targetPlayer, allMatches, allPlayers, requestedDate)
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

      const data = computeIndividualNightData(targetPlayer, allMatches, allPlayers, requestedDate);
      if (!data) {
        return res.status(404).json({ error: "Nenhuma sessão encontrada para gerar o card" });
      }

      const png = renderIndividualNightCardPng(data);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
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
      const { cardType, playerId, date, target = "group" } = req.body || {};
      const [allPlayers, allMatches] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedMatches(cachedMatches.length === 0)
      ]);
      const cfg = getWhatsAppConfig();

      let pngBuffer: Buffer | null = null;
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
        pngBuffer = renderIndividualNightCardPng(indData);
        caption = `🏐 *RESUMO INDIVIDUAL — ${indData.firstName}* (${indData.dateLabel})\n${indData.wins}V/${indData.losses}D (${indData.winRate}%) • ${indData.eloDelta >= 0 ? "+" : ""}${indData.eloDelta} ELO • #${indData.nightRank} na Noite\n\n— Guerreirinho, o robô do clube 🤖`;
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
        pngBuffer = renderDailyRankingCardPng(dailyData);
        caption = `🔥 *RANKING DO DIA — ${dailyData.dateLabel}* (${dailyData.totalMatches} partidas • ${dailyData.totalAthletes} atletas)\n🏆 MVP: *${dailyData.mvp?.firstName || "-"}* • 🎯 Levantador: *${dailyData.bestSetter?.firstName || "-"}* • ⚡ Eficiente: *${dailyData.mostEfficient?.firstName || "-"}*\n\n— Guerreirinho, o robô do clube 🤖`;
        fileName = `guerreiros_ranking_dia_${dailyData.dateKey}.png`;
      } else if (cardType === "accumulated") {
        const accData = computeAccumulatedRankingData(allMatches, allPlayers);
        pngBuffer = renderAccumulatedRankingCardPng(accData);
        caption = `🏆 *RANKING GERAL ACUMULADO* (Atualizado em ${accData.referenceDateLabel})\nLíder: *${accData.topRows[0]?.firstName || "-"}* (${accData.topRows[0]?.elo || 1200} ELO)\n\n— Guerreirinho, o robô do clube 🤖`;
        fileName = `guerreiros_ranking_acumulado.png`;
      } else {
        return res.status(400).json({ success: false, error: "Tipo de card inválido." });
      }

      const delivered = await dispatchWhatsAppMedia(
        destination,
        pngBuffer.toString("base64"),
        caption,
        {
          type: `MANUAL_CARD_${String(cardType).toUpperCase()}`,
          recipientLabel,
          fallbackTargets,
          fileName
        }
      );

      return res.json({
        success: true,
        deliveredDirectly: delivered,
        queuedForBridge: !delivered,
        recipientLabel
      });
    } catch (err: any) {
      console.error("[Cards API] Erro em /api/whatsapp/send-card:", err);
      return res.status(500).json({ success: false, error: err?.message || "Erro ao enviar card" });
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

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, ws: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
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
  }

  const server = http.createServer(app);

  // 🚀 Abre a porta 3000 imediatamente para passar no Health Check do Cloud Run
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);

    import("./services/serverLiveApi.ts")
      .then(({ setupGeminiLiveWebSocket }) => {
        setupGeminiLiveWebSocket(server);
      })
      .catch((e) => console.warn("[LiveAPI] Aviso ao inicializar WebSocket:", e));

    setTimeout(async () => {
      try {
        await ensureFreshIntentionsDocument();
        const players = await getCachedPlayers(true);
        await getCachedMatches(true);
        const db = await getFirestore();
        await syncWhatsAppGroupContactsAndPhones(db, players || []).catch(() => {});
        const missingPhotoPlayers = (players || []).filter(
          (p) =>
            p.status !== "inactive" &&
            (Boolean(p.phone) || Boolean(p.whatsappLid)) &&
            isMissingOrDefaultAvatar(p.photoUrl)
        );
        for (const p of missingPhotoPlayers) {
          await syncSinglePlayerWhatsAppPhoto(db, p, null, false).catch(() => {});
        }
      } catch {}
    }, 1500);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});