import express from "express";
import http from "http";
import cors from "cors";
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
import { runDeepAnalyticsChat } from "./serverDeepAnalysis.ts";

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
  return {
    dateKey,
    yearMonth: `${yearStr}-${monthStr}`,
    monthDay: `${monthStr}-${dayStr}`,
    dayOfMonth: Number(dayStr),
    dayOfWeek,
    hour: Number(hourStr),
    minute: Number(minStr),
    totalMinutes: Number(hourStr) * 60 + Number(minStr)
  };
};

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

async function getFirestore() {
  if (adminDb) return adminDb;
  const app = await getAdminApp();
  const { getFirestore: getAdminFirestoreInstance } = await import("firebase-admin/firestore");
  const lockedDbId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId;
  if (lockedDbId && lockedDbId !== "(default)") {
    console.log(`[Firestore] Conectando ao banco nomeado: ${lockedDbId}`);
    adminDb = getAdminFirestoreInstance(app, lockedDbId);
  } else {
    console.log(`[Firestore] Conectando ao banco (default)`);
    adminDb = getAdminFirestoreInstance(app);
  }
  return adminDb;
}

async function getAdminAuth() {
  if (adminAuth) return adminAuth;
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  adminAuth = getAuth(app);
  return adminAuth;
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

  try {
    const db = await getFirestore();
    if (uid) {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists && userDoc.data()?.role === "ADMIN") {
        return { uid, email, isAdmin: true };
      }
    }
    if (email) {
      const pSnap = await db.collection("players").where("email", "==", email).limit(1).get();
      if (!pSnap.empty && pSnap.docs[0].data()?.isAdmin) {
        return { uid, email, isAdmin: true };
      }
    }
  } catch (e) {}

  return { uid, email, isAdmin: Boolean(req.body?.isAdmin && email) };
}

async function syncCredentialsFromFirestore() {
  try {
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
  } catch (err: any) {
    console.warn("[WebAuthn] Aviso ao sincronizar credenciais:", err.message);
  }
}

async function ensureFreshIntentionsDocument() {
  const db = await getFirestore();
  const nextThu = getNextThursday();
  const todayStr = getFirestoreDateKey();
  const intentionsRef = db.collection("metadata").doc("intentions");
  const snap = await intentionsRef.get();

  if (!snap.exists) {
    const freshDoc = {
      targetDate: nextThu,
      automationEnabled: true,
      responses: {},
      confirmationTimestamps: {},
      remindersSent: {},
      lastUpdated: Date.now()
    };
    await intentionsRef.set(freshDoc);
    return freshDoc;
  }

  const unpacked = unpackIntentionsDoc(snap.data(), nextThu);
  const storedTarget = unpacked.targetDate;

  if (storedTarget && storedTarget < todayStr) {
    const rotatedDoc = {
      targetDate: nextThu,
      automationEnabled: unpacked.automationEnabled ?? true,
      responses: {},
      confirmationTimestamps: {},
      remindersSent: {},
      lastUpdated: Date.now()
    };
    await intentionsRef.set(rotatedDoc);
    return rotatedDoc;
  }

  if (unpacked.targetDate !== nextThu) {
    unpacked.targetDate = nextThu;
    await intentionsRef.set(unpacked);
  }

  return unpacked;
}

async function syncPlayerPreConfirmationDoc(
  db: any,
  targetDate: string,
  player: any,
  status: "GOING" | "NOT_GOING" | "RESET",
  timestamp: number
) {
  try {
    if (!player || !player.id || !targetDate) return;
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
      await preConfRef.delete().catch(() => {});
    }
  } catch (err: any) {
    console.warn("[PreConfirmations Sync] Aviso:", err.message);
  }
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

async function buildThursdayPostGameReport(db: any, allPlayers: any[], dateKey: string): Promise<string> {
  const matchesSnap = await db.collection("matches").where("date", "==", dateKey).get();
  const todayMatches: any[] = [];
  matchesSnap.forEach((d: any) => todayMatches.push({ id: d.id, ...d.data() }));

  const perfMap = new Map<
    string,
    { name: string; wins: number; losses: number; matches: number; ptsBalance: number; eloGain: number }
  >();

  todayMatches.forEach((m) => {
    const teamA: string[] = Array.isArray(m.teamA) ? m.teamA : [];
    const teamB: string[] = Array.isArray(m.teamB) ? m.teamB : [];
    const scoreA = Number(m.scoreA || 0);
    const scoreB = Number(m.scoreB || 0);
    const winA = m.winner === "A";

    const processParticipant = (pid: string, inA: boolean) => {
      const pObj = allPlayers.find((p) => p.id === pid);
      const name = pObj?.name || "Sócio";
      const prev = perfMap.get(pid) || { name, wins: 0, losses: 0, matches: 0, ptsBalance: 0, eloGain: 0 };
      const won = (inA && winA) || (!inA && !winA);
      const diff = inA ? scoreA - scoreB : scoreB - scoreA;
      prev.matches += 1;
      if (won) {
        prev.wins += 1;
        prev.eloGain += 20;
      } else {
        prev.losses += 1;
        prev.eloGain -= 20;
      }
      prev.ptsBalance += diff;
      perfMap.set(pid, prev);
    };

    teamA.forEach((pid) => processParticipant(pid, true));
    teamB.forEach((pid) => processParticipant(pid, false));
  });

  const dailyRanking = Array.from(perfMap.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.eloGain !== a.eloGain) return b.eloGain - a.eloGain;
    return b.ptsBalance - a.ptsBalance;
  });

  const formattedDate = dateKey.split("-").reverse().slice(0, 2).join("/");

  let dailySection = "";
  if (todayMatches.length === 0) {
    dailySection = `_Nenhuma partida oficial registrada hoje (${formattedDate})._\n`;
  } else {
    dailySection =
      `🔥 *RANKING DO DIA (${formattedDate} • ${todayMatches.length} Partidas)*\n` +
      dailyRanking
        .map((r, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${String(i + 1).padStart(2, "0")}.`;
          const sign = r.eloGain >= 0 ? "+" : "";
          const balSign = r.ptsBalance >= 0 ? "+" : "";
          return `${medal} *${r.name}* — ${r.wins}V/${r.losses}D (${sign}${r.eloGain} ELO | Saldo ${balSign}${r.ptsBalance})`;
        })
        .join("\n") +
      "\n";
  }

  const topOverall = allPlayers
    .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
    .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

  const overallSection =
    `🏆 *RANKING GERAL ACUMULADO (TODOS OS SÓCIOS)*\n` +
    topOverall
      .map((p, i) => {
        const wr = p.matchesPlayed > 0 ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0;
        return `${String(i + 1).padStart(2, "0")}. *${p.name}* — *${Math.round(p.elo || 1200)} pts* (${p.wins || 0}V/${p.losses || 0}D • ${wr}%)`;
      })
      .join("\n");

  return (
    `🏐 *FECHAMENTO DA RODADA — GUERREIROS VC* 🏐\n\n` +
    dailySection +
    `\n` +
    overallSection +
    `\n\n👏 _Parabéns a todos pelo jogão! Até a próxima quinta!_`
  );
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  syncCredentialsFromFirestore().catch(() => {});
  ensureFreshIntentionsDocument().catch(() => {});

  app.use(cors());
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
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ version: APP_VERSION, timestamp: Date.now() });
  });

  app.get("/api/health", async (_req, res) => {
    let dbStatus = "unknown";
    try {
      const db = await getFirestore();
      await db.collection("metadata").doc("system").get();
      dbStatus = "connected";
    } catch (e: any) {
      dbStatus = `error: ${e.message}`;
    }
    res.json({
      status: "ok",
      db: dbStatus,
      projectId: configProjectId,
      databaseId: firebaseConfig?.firestoreDatabaseId || "(default)",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/ai/status", async (_req, res) => {
    try {
      const { getAIStatus } = await import("./services/geminiService.ts");
      res.json(getAIStatus());
    } catch (err) {
      res.status(500).json({ error: "Failed to get AI status" });
    }
  });

  app.get(
    ["/api/status-info", "/api/sys-info", "/api/sysinfo", "/sys-info", "/sysinfo", "/api/system-info"],
    (_req, res) => {
      try {
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
      } catch (err: any) {
        res.status(200).json({ status: "error", error: err?.message || String(err) });
      }
    }
  );

  app.get("/api/presence/state", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const data = await ensureFreshIntentionsDocument();
      res.json({ success: true, data });
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

      if (!isGuest) {
        let playerSnap = await db.collection("players").doc(playerId).get();
        if (!playerSnap.exists) {
          const allSnap = await db.collection("players").get();
          const normReq = playerId.toLowerCase();
          for (const d of allSnap.docs) {
            const pData = d.data() || {};
            if (
              d.id.toLowerCase() === normReq ||
              (pData.name && pData.name.trim().toLowerCase() === normReq) ||
              (pData.uid && pData.uid === playerId) ||
              (caller.email && (pData.email || "").trim().toLowerCase() === caller.email)
            ) {
              playerId = d.id;
              player = { id: d.id, ...pData };
              break;
            }
          }
          if (!player) {
            return res.status(404).json({ error: "Sócio não encontrado" });
          }
        } else {
          player = { id: playerSnap.id, ...playerSnap.data() };
        }
      } else {
        player = { id: playerId, name: playerId.replace("guest_", "Convidado "), status: "guest" };
      }

      const currentInt = await ensureFreshIntentionsDocument();
      const targetDate = currentInt.targetDate || getNextThursday();
      const responses: Record<string, string> = { ...(currentInt.responses || {}) };
      const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

      const aliasSet = new Set<string>([playerId]);
      if (player) {
        if (player.id) aliasSet.add(player.id);
        if (player.uid) aliasSet.add(player.uid);
        if (player.email) aliasSet.add(player.email.trim().toLowerCase());
      }

      const now = Date.now();
      const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
      let effectiveTs = now;

      if (status === "RESET") {
        aliasSet.forEach((alias) => {
          delete responses[alias];
          delete timestamps[alias];
        });
      } else {
        const prevTs = Number(timestamps[playerId] || 0);
        const alreadyConfirmedInCycle = responses[playerId] === "GOING" && prevTs >= cutoffTs;
        effectiveTs = status === "GOING" && alreadyConfirmedInCycle ? prevTs : now;

        aliasSet.forEach((alias) => {
          responses[alias] = status;
          timestamps[alias] = effectiveTs;
        });
      }

      const updatedDoc = {
        targetDate,
        automationEnabled: currentInt.automationEnabled ?? true,
        responses,
        confirmationTimestamps: timestamps,
        remindersSent: currentInt.remindersSent || {},
        lastUpdated: now
      };

      await db.collection("metadata").doc("intentions").set(updatedDoc);
      await syncPlayerPreConfirmationDoc(db, targetDate, player, status, effectiveTs);

      res.json({ success: true, data: updatedDoc });
    } catch (e: any) {
      console.error("[Presence API] Error:", e);
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

      await db.collection("metadata").doc("intentions").set(clearedDoc);

      try {
        const preSnap = await db.collection("preConfirmations").doc(nextThu).collection("players").get();
        const batch = db.batch();
        preSnap.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
      } catch (e) {}

      res.json({ success: true, data: clearedDoc });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/presence/sync-accesses", async (_req, res) => {
    res.json({ success: true, synced: 0 });
  });

  app.post("/api/players/:id/link", async (req, res) => {
    try {
      const playerId = req.params.id;
      const { uid } = req.body;
      if (!playerId || !uid) return res.status(400).json({ error: "Missing parameters" });
      const db = await getFirestore();
      await db.collection("players").doc(playerId).update({ uid });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================================
  // ⏰ MOTOR DE AGENDAMENTO AUTOMÁTICO DO BOT WHATSAPP (/api/whatsapp/cron-tasks)
  // ============================================================================
  app.post("/api/whatsapp/cron-tasks", async (req, res) => {
    try {
      const groupJid = req.body?.groupJid || "120363401268459791@g.us";
      const db = await getFirestore();
      const br = getBrazilTimeParts();

      const schedRef = db.collection("metadata").doc("whatsapp_scheduler");
      const schedSnap = await schedRef.get();
      const schedData = schedSnap.exists ? schedSnap.data() || {} : {};
      const updates: Record<string, any> = {};
      const messagesToSend: Array<{ to: string; text: string; delayMs?: number }> = [];

      const playersSnap = await db.collection("players").get();
      const allPlayers: any[] = [];
      playersSnap.forEach((d: any) => allPlayers.push({ id: d.id, ...d.data() }));
      const activePlayers = allPlayers.filter((p) => p.status === "active" && !p.isDM);

      // 1. ANIVERSARIANTE DO DIA (08:30 BRT)
      if (br.totalMinutes >= 8 * 60 + 30 && br.totalMinutes <= 11 * 60 && schedData.lastBirthdayDate !== br.dateKey) {
        updates.lastBirthdayDate = br.dateKey;
        const birthdayPlayers = activePlayers.filter((p) => {
          if (!p.birthDate) return false;
          const parts = String(p.birthDate).split("-");
          return parts.length >= 3 && `${parts[1]}-${parts[2]}` === br.monthDay;
        });

        for (const bp of birthdayPlayers) {
          let bdayMsg = `🎂🏐 *PARABÉNS, ${bp.name.toUpperCase()}!* 🎉🔥\n\nHoje é dia de festa nos Guerreiros! Desejamos muita saúde, vitórias na quadra e que não falte aquele bloqueio monstro na quinta-feira! Parabéns, Guerreiro(a)! 👏🥳`;
          try {
            const { serverGenerateBirthdayMessage } = await import("./services/serverGemini.ts");
            const aiMsg = await serverGenerateBirthdayMessage(bp.name);
            if (aiMsg) {
              bdayMsg = `🎂🏐 *FELIZ ANIVERSÁRIO, ${bp.name.toUpperCase()}!* 🎉\n\n${aiMsg}`;
            }
          } catch {}
          messagesToSend.push({ to: groupJid, text: bdayMsg });
        }
      }

      // 2. GIRO DIÁRIO DINÂMICO COM IA (Horário aleatório entre 10:00 e 18:00 BRT — Sem repetição)
      const dateSeed = br.dateKey.split("-").reduce((acc, val) => acc * 31 + Number(val), 7);
      const randomTargetMinute = 600 + (Math.abs(dateSeed * 16807) % 481); // 600 (10h00) até 1080 (18h00)

      if (
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
          1: "Bastidores, história, grandes clubes ou destaques da Superliga Brasileira de Vôlei (Masculina ou Feminina).",
          2: "Dica técnica e prática de quadra para vôlei (manchete, levantamento, tempo de bloqueio, cobertura de ataque, saque flutuante, defesa ou leitura de jogo).",
          3: "História, conquistas marcantes, grandes ídolos, técnicos lendários (Bernardinho, Zé Roberto) ou curiosidades da Seleção Brasileira de Vôlei.",
          4: "Mensagem vibrante de aquecimento para o jogo de HOJE (quinta-feira) dos Guerreiros VC + 1 dica rápida de foco tático e comunicação em quadra.",
          5: "Curiosidade histórica do vôlei mundial/olímpico, evolução de regras (líbero, rally point, desafio) ou recordes impressionantes do esporte.",
          6: "Dica de preparo físico, prevenção de lesões (ombro, joelho, tornozelo) ou recuperação muscular para quem joga vôlei toda semana.",
          0: "Resenha de domingo: grandes rivalidades históricas do vôlei brasileiro ou jogos inesquecíveis que pararam o Brasil."
        };

        const chosenTheme = themeByDay[dayOfWeek] || themeByDay[2];
        let dailyContent = "";

        if (apiKey) {
          try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `Você é o Bot Oficial do clube de vôlei "Guerreiros VC".
Escreva uma pílula diária curta, envolvente e bem formatada para o WhatsApp (use *negrito* e emojis de vôlei) para enviar hoje (${br.dateKey}) no grupo dos sócios.

TEMA DO DIA: ${chosenTheme}

TEMAS JÁ ENVIADOS NOS ÚLTIMOS DIAS (PROIBIDO REPETIR O MESMO ASSUNTO):
${recentTopics.length > 0 ? recentTopics.join(" | ") : "Nenhum ainda"}

REGRAS DE FORMATO:
1. Na primeira linha, escreva APENAS: RESUMO_TEMA: <resumo de 4 palavras do assunto específico escolhido>
2. A partir da segunda linha, escreva a mensagem pronta para o WhatsApp (máximo de 2 parágrafos curtos + 1 frase final convidando os sócios a digitarem *gv* para receber ranking/estatísticas no privado ou *gv vou* para confirmar presença na quinta).`;

            const aiResp = await ai.models.generateContent({
              model: "gemini-2.5-flash",
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
          } catch (err) {
            console.warn("[WhatsApp Cron] Fallback no Giro Diário IA:", err);
          }
        }

        if (!dailyContent) {
          dailyContent =
            `🏐 *PÍLULA DO VÔLEI — GUERREIROS VC* 🔥\n\n` +
            `💡 *Dica de Quadra:* A comunicação antes do saque adversário evita 70% das bolas que caem entre dois jogadores. Chame a bola alto ("MINHA!" / "SUA!") e mantenha a base baixa na recepção!\n\n` +
            `👉 _Digite *gv ranking* ou *gv lista* aqui mesmo para receber os dados no seu privado!_`;
        }

        messagesToSend.push({ to: groupJid, text: dailyContent });
      }

      // 3. DIA 02 DO MÊS ÀS 09:00 — COMUNICADO DE MENSALIDADE NO GRUPO
      if (
        br.dayOfMonth === 2 &&
        br.totalMinutes >= 9 * 60 &&
        br.totalMinutes <= 12 * 60 &&
        schedData.lastDay02NoticeMonth !== br.yearMonth
      ) {
        updates.lastDay02NoticeMonth = br.yearMonth;
        const sysSnap = await db.collection("metadata").doc("system").get();
        const sysData = sysSnap.exists ? sysSnap.data() || {} : {};
        const pixKey = sysData.pixKey || "elizabeth.santos.pe@gmail.com";
        const fee = Number(sysData.monthlyFee || 0).toFixed(2).replace(".", ",");

        messagesToSend.push({
          to: groupJid,
          text:
            `💰 *ABERTURA DO MÊS FINANCEIRO (${br.yearMonth}) — GUERREIROS VC* 🏐\n\n` +
            `Fala, Guerreiros! Lembrando que a mensalidade deste mês já está aberta para pagamento até o *dia 10*.\n\n` +
            `💵 *Valor Mensal:* R$ ${fee}\n` +
            `🔑 *Chave PIX:* ${pixKey}\n` +
            `👤 *Favorecido:* Elizabeth de Souza Santos (Nubank)\n\n` +
            `💡 _Digite *gv pix* para consultar seu status no privado!_`
        });
      }

      // 4. DIA 10 DO MÊS ÀS 10:00 — LEMBRETE INDIVIDUAL NO PRIVADO DOS PENDENTES
      if (
        br.dayOfMonth === 10 &&
        br.totalMinutes >= 10 * 60 &&
        br.totalMinutes <= 13 * 60 &&
        schedData.lastDay10PrivateMonth !== br.yearMonth
      ) {
        updates.lastDay10PrivateMonth = br.yearMonth;
        const sysSnap = await db.collection("metadata").doc("system").get();
        const sysData = sysSnap.exists ? sysSnap.data() || {} : {};
        const pixKey = sysData.pixKey || "elizabeth.santos.pe@gmail.com";
        const fee = Number(sysData.monthlyFee || 0).toFixed(2).replace(".", ",");

        const paySnap = await db.collection("payments").where("month", "==", br.yearMonth).get();
        const paidIds = new Set<string>();
        paySnap.forEach((d: any) => {
          const pData = d.data();
          if (pData?.status === "PAID" && pData?.playerId) paidIds.add(pData.playerId);
        });

        const unpaidMembers = activePlayers.filter((p) => !p.isExempt && !paidIds.has(p.id));
        unpaidMembers.forEach((p, idx) => {
          const jid = normalizePhoneToJid(p.phone);
          if (!jid) return;
          const firstName = p.name.split(" ")[0];
          messagesToSend.push({
            to: jid,
            delayMs: idx * 12000,
            text:
              `Olá, *${firstName}*! Tudo bem? 🏐\n\n` +
              `Passando para lembrar que hoje (*dia 10*) é o vencimento da mensalidade dos *Guerreiros VC* referente a *${br.yearMonth}*.\n\n` +
              `💵 *Valor:* R$ ${fee}\n` +
              `🔑 *Chave PIX:* ${pixKey}\n` +
              `👤 *Favorecido:* Elizabeth de Souza Santos (Nubank)\n\n` +
              `_Caso já tenha realizado o pagamento, basta desconsiderar esta mensagem!_`
          });
        });
      }

      // 5. QUARTA (10:00) E QUINTA (10:00) — COBRANÇA NO PRIVADO DOS INDECISOS DA LISTA
      const isWedOrThu = br.dayOfWeek === 3 || br.dayOfWeek === 4;
      if (
        isWedOrThu &&
        br.totalMinutes >= 10 * 60 &&
        br.totalMinutes <= 12 * 60 &&
        schedData.lastPrivateInviteDate !== br.dateKey
      ) {
        updates.lastPrivateInviteDate = br.dateKey;
        const currentInt = await ensureFreshIntentionsDocument();
        const targetDate = currentInt.targetDate || getNextThursday();
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
        const responses = currentInt.responses || {};

        const undecided = activePlayers.filter((p) => !responses[p.id]);
        undecided.forEach((p, idx) => {
          const jid = normalizePhoneToJid(p.phone);
          if (!jid) return;
          const firstName = p.name.split(" ")[0];
          messagesToSend.push({
            to: jid,
            delayMs: idx * 12000,
            text:
              `Fala, *${firstName}*! 🏐🔥\n\n` +
              `Ainda não vimos sua confirmação na *Lista de Quinta (${formattedDate})* dos Guerreiros!\n\n` +
              `Responda aqui mesmo com apenas um número:\n` +
              `*1* — Vou Jogar! ✅\n` +
              `*2* — Não Vou 😢`
          });
        });
      }

      // 6. BOLETIM A CADA 30 MINUTOS NO GRUPO (Se houve novo confirmado na lista)
      if (isWedOrThu && br.totalMinutes >= 8 * 60 && br.totalMinutes <= 19 * 60 + 30 && br.minute % 30 === 0) {
        const slotKey = `${br.dateKey}_${br.hour}:${br.minute}`;
        if (schedData.last30MinCheckSlot !== slotKey) {
          updates.last30MinCheckSlot = slotKey;
          const currentInt = await ensureFreshIntentionsDocument();
          const targetDate = currentInt.targetDate || getNextThursday();
          const responses = currentInt.responses || {};
          const timestamps = currentInt.confirmationTimestamps || {};

          const goingList = activePlayers
            .filter(
              (p) =>
                responses[p.id] === "GOING" ||
                (p.uid && responses[p.uid] === "GOING") ||
                (p.email && responses[p.email.trim().toLowerCase()] === "GOING")
            )
            .sort((a, b) => (timestamps[a.id] || 0) - (timestamps[b.id] || 0));

          const currentSignature = goingList.map((p) => p.id).join(",");

          if (goingList.length > 0 && currentSignature !== (schedData.lastBroadcastSignature || "")) {
            updates.lastBroadcastSignature = currentSignature;
            const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
            const settersCount = goingList.filter((p) => p.isOfficialSetter).length;

            messagesToSend.push({
              to: groupJid,
              text:
                `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
                `✅ *Confirmados:* ${goingList.length} (${settersCount} Levantadores)\n\n` +
                goingList
                  .map((p, i) => `${String(i + 1).padStart(2, "0")}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
                  .join("\n") +
                `\n\n💡 _Digite *gv vou* para confirmar presença ou *gv naovou* para informar ausência._`
            });
          }
        }
      }

      // 7. QUINTA-FEIRA ÀS 22:25 — RANKING DO DIA + RANKING ACUMULADO NO GRUPO
      if (
        br.dayOfWeek === 4 &&
        br.totalMinutes >= 22 * 60 + 25 &&
        br.totalMinutes <= 23 * 60 + 30 &&
        schedData.lastThuPostGameDate !== br.dateKey
      ) {
        updates.lastThuPostGameDate = br.dateKey;
        const postGameReport = await buildThursdayPostGameReport(db, allPlayers, br.dateKey);
        messagesToSend.push({
          to: groupJid,
          text: postGameReport
        });
      }

      if (Object.keys(updates).length > 0) {
        await schedRef.set(updates, { merge: true });
      }

      res.json({ success: true, messages: messagesToSend });
    } catch (err: any) {
      console.error("[WhatsApp Cron] Erro:", err);
      res.status(200).json({ success: false, messages: [], error: err.message });
    }
  });

  // ============================================================================
  // 🤖 WEBHOOK DO BOT DE WHATSAPP (Auto-Delete no Grupo + Resposta no Privado)
  // ============================================================================
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const payload = body.payload || body.data || body;

      const rawText: string =
        payload.body ||
        payload?.message?.conversation ||
        payload?.message?.extendedTextMessage?.text ||
        "";

      const text = String(rawText).trim();
      if (!text) {
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
        text.startsWith("🤖");

      if (isBotGeneratedOutput) {
        return res.status(200).json({ ignored: true, reason: "bot_output" });
      }

      const isFromMe = Boolean(payload.fromMe || payload?.key?.fromMe);
      const chatId: string = payload.from || payload?.key?.remoteJid || "";
      const isGroup = chatId.endsWith("@g.us");
      const lower = text.toLowerCase().trim();

      const isAliasTrigger = /^@?(gv|bot|botgv)($|[\s,!?:])/i.test(lower);

      if (isFromMe && !isAliasTrigger) {
        return res.status(200).json({ ignored: true, reason: "fromMe_non_command" });
      }

      const isPrivateQuickReply =
        !isGroup &&
        !isFromMe &&
        ["1", "2"].includes(lower) &&
        (payload.toMe || chatId.endsWith("@s.whatsapp.net"));

      const isTrigger =
        isPrivateQuickReply ||
        isAliasTrigger ||
        lower.startsWith("!") ||
        lower.startsWith("/") ||
        lower.startsWith("@guerreiros") ||
        lower.startsWith("guerreiros,");

      if (!isTrigger) {
        return res.status(200).json({ ignored: true, reason: "not_a_command" });
      }

      const senderJid: string =
        payload.participant ||
        payload.author ||
        payload?.key?.participant ||
        chatId;
      const senderLid: string = payload.participantLid || senderJid || "";
      const pushName: string = String(payload.pushName || "").trim();
      const senderPhone = String(senderJid).split("@")[0].replace(/\D/g, "");

      const db = await getFirestore();
      const playersSnap = await db.collection("players").get();
      const allPlayers: any[] = [];
      playersSnap.forEach((d: any) => allPlayers.push({ id: d.id, ...d.data() }));

      const normStr = (s: string) =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      let senderPlayer = allPlayers.find(
        (p) =>
          (p.whatsappLid && p.whatsappLid === senderLid) ||
          (!senderJid.endsWith("@lid") && matchBrazilianPhone(senderPhone, p.phone))
      );

      if (!senderPlayer && pushName.length >= 3) {
        const cleanPush = normStr(pushName);
        const pushFirst = cleanPush.split(/\s+/)[0];
        senderPlayer = allPlayers.find((p) => {
          if (p.status !== "active" || !p.name) return false;
          const cleanName = normStr(p.name);
          const nameFirst = cleanName.split(/\s+/)[0];
          return (
            cleanName === cleanPush ||
            cleanName.includes(cleanPush) ||
            (pushFirst.length >= 4 && nameFirst === pushFirst)
          );
        });

        if (senderPlayer && senderLid.endsWith("@lid")) {
          db.collection("players")
            .doc(senderPlayer.id)
            .set({ whatsappLid: senderLid }, { merge: true })
            .catch(() => {});
        }
      }

      if (!senderPlayer && isFromMe) {
        senderPlayer = allPlayers.find(
          (p) => p.email && p.email.trim().toLowerCase() === "rodneyes@gmail.com"
        );
      }

      // --- CLASSIFICAÇÃO INTELIGENTE DE INTENÇÃO POR LINGUAGEM NATURAL (NLP) ---
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      let intent = "DEEP_ANALYTICS_CHAT";

      const cleanAfterAlias = lower.replace(/^(@?gv|@?bot|@?botgv|@guerreiros|guerreiros|!|\/)[,:\s]*/i, "").trim();

      if (isPrivateQuickReply) {
        intent = lower === "1" ? "CONFIRM_ATTENDANCE" : "DECLINE_ATTENDANCE";
      } else if (["vou", "eu vou", "confirmar", "sim", "presenca", "presença"].includes(cleanAfterAlias)) {
        intent = "CONFIRM_ATTENDANCE";
      } else if (["naovou", "nao vou", "não vou", "ausente", "nao", "não"].includes(cleanAfterAlias)) {
        intent = "DECLINE_ATTENDANCE";
      } else if (["lista", "confirmados", "quem vai"].includes(cleanAfterAlias)) {
        intent = "VIEW_LIST";
      } else if (cleanAfterAlias.startsWith("ranking")) {
        intent = "VIEW_RANKING";
      } else if (["pix", "mensalidade", "financeiro"].includes(cleanAfterAlias)) {
        intent = "CHECK_PIX";
      } else if (cleanAfterAlias.startsWith("meusjogos") || cleanAfterAlias.startsWith("meus jogos")) {
        intent = "RAW_STATS_LIST";
      } else if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const classificationResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Classifique a frase de um sócio do clube de vôlei no WhatsApp em exatamente UMA destas intenções:
- CONFIRM_ATTENDANCE (ex: confirmar presença, vai jogar, vou, eu vou, sim)
- DECLINE_ATTENDANCE (ex: não vai, ausente, não vou)
- VIEW_LIST (ex: ver lista, confirmados)
- VIEW_RANKING (ex: ranking, top 10, elo, ranking diário, ranking acumulado, ver todos os sócios)
- CHECK_PIX (ex: pix, mensalidade)
- RAW_STATS_LIST (ex: ver tabela dos meus últimos 20 jogos, meus jogos)
- DEEP_ANALYTICS_CHAT (ex: perguntas complexas, quem é meu rival, estatísticas, Superliga, Seleção Brasileira, técnicas, dúvidas)

Frase: "${cleanAfterAlias}"
Retorne apenas a intenção em maiúsculo, sem mais nada.`
          });

          const classified = classificationResponse.text?.trim().toUpperCase();
          if (
            classified &&
            [
              "CONFIRM_ATTENDANCE",
              "DECLINE_ATTENDANCE",
              "VIEW_LIST",
              "VIEW_RANKING",
              "CHECK_PIX",
              "RAW_STATS_LIST",
              "DEEP_ANALYTICS_CHAT"
            ].includes(classified)
          ) {
            intent = classified;
          }
        } catch (e) {
          console.warn("[NLP Intent Classification Warning]:", e);
        }
      }

      let replyText = "";

      // 1. CONFIRMAR PRESENÇA
      if (intent === "CONFIRM_ATTENDANCE") {
        if (!senderPlayer) {
          replyText = `⚠️ Não consegui vincular seu WhatsApp (*${pushName || senderPhone}*) ao cadastro de sócios. Peça ao Admin para atualizar seu telefone no perfil!`;
        } else if (senderPlayer.status !== "active" || senderPlayer.isDM) {
          replyText = `⚠️ Olá, *${senderPlayer.name}*! Apenas sócios com status Ativo e fora do DM podem confirmar presença.`;
        } else {
          const matchingDocs = allPlayers.filter(
            (p) =>
              p.id === senderPlayer.id ||
              (senderPlayer.email && p.email && p.email.trim().toLowerCase() === senderPlayer.email.trim().toLowerCase()) ||
              (senderPlayer.uid && p.uid && p.uid === senderPlayer.uid)
          );

          const currentInt = await ensureFreshIntentionsDocument();
          const targetDate = currentInt.targetDate || getNextThursday();
          const responses: Record<string, string> = { ...(currentInt.responses || {}) };
          const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

          const now = Date.now();
          const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
          const prevTs = Number(timestamps[senderPlayer.id] || 0);
          const alreadyConfirmed = responses[senderPlayer.id] === "GOING" && prevTs >= cutoffTs;
          const effectiveTs = alreadyConfirmed ? prevTs : now;

          const aliases = new Set<string>([senderPlayer.id]);
          matchingDocs.forEach((mp) => {
            if (mp.id) aliases.add(mp.id);
            if (mp.uid) aliases.add(mp.uid);
            if (mp.email) aliases.add(mp.email.trim().toLowerCase());
          });

          aliases.forEach((alias) => {
            responses[alias] = "GOING";
            timestamps[alias] = effectiveTs;
          });

          const updatedDoc = {
            targetDate,
            automationEnabled: currentInt.automationEnabled ?? true,
            responses,
            confirmationTimestamps: timestamps,
            remindersSent: currentInt.remindersSent || {},
            lastUpdated: now
          };

          await db.collection("metadata").doc("intentions").set(updatedDoc);
          for (const mp of matchingDocs) {
            await syncPlayerPreConfirmationDoc(db, targetDate, mp, "GOING", effectiveTs);
          }

          const activeGoing = allPlayers
            .filter(
              (p) =>
                p.status === "active" &&
                !p.isDM &&
                (responses[p.id] === "GOING" ||
                  (p.uid && responses[p.uid] === "GOING") ||
                  (p.email && responses[p.email.trim().toLowerCase()] === "GOING"))
            )
            .sort((a, b) => (timestamps[a.id] || 0) - (timestamps[b.id] || 0));

          const pos = activeGoing.findIndex((p) => p.id === senderPlayer.id) + 1;
          const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");

          replyText = alreadyConfirmed
            ? `✅ *${senderPlayer.name}*, você já estava confirmado(a) para Quinta (${formattedDate})! Sua posição na lista é *#${pos}* de *${activeGoing.length}*.`
            : `🏐🔥 *Bora pra cima, ${senderPlayer.name}!*\nPresença confirmada para Quinta (${formattedDate})!\n📍 Você é o *#${pos}* de *${activeGoing.length}* confirmados.`;
        }
      }

      // 2. RECUSAR PRESENÇA
      else if (intent === "DECLINE_ATTENDANCE") {
        if (!senderPlayer) {
          replyText = `⚠️ Perfil (*${pushName || senderPhone}*) não localizado no cadastro de sócios.`;
        } else {
          const matchingDocs = allPlayers.filter(
            (p) =>
              p.id === senderPlayer.id ||
              (senderPlayer.email && p.email && p.email.trim().toLowerCase() === senderPlayer.email.trim().toLowerCase()) ||
              (senderPlayer.uid && p.uid && p.uid === senderPlayer.uid)
          );

          const currentInt = await ensureFreshIntentionsDocument();
          const targetDate = currentInt.targetDate || getNextThursday();
          const responses: Record<string, string> = { ...(currentInt.responses || {}) };
          const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };
          const now = Date.now();

          const aliases = new Set<string>([senderPlayer.id]);
          matchingDocs.forEach((mp) => {
            if (mp.id) aliases.add(mp.id);
            if (mp.uid) aliases.add(mp.uid);
            if (mp.email) aliases.add(mp.email.trim().toLowerCase());
          });

          aliases.forEach((alias) => {
            responses[alias] = "NOT_GOING";
            timestamps[alias] = now;
          });

          const updatedDoc = {
            targetDate,
            automationEnabled: currentInt.automationEnabled ?? true,
            responses,
            confirmationTimestamps: timestamps,
            remindersSent: currentInt.remindersSent || {},
            lastUpdated: now
          };

          await db.collection("metadata").doc("intentions").set(updatedDoc);
          for (const mp of matchingDocs) {
            await syncPlayerPreConfirmationDoc(db, targetDate, mp, "NOT_GOING", now);
          }

          replyText = `📝 Registrado, *${senderPlayer.name}*. Informamos sua ausência para esta quinta-feira. Até a próxima!`;
        }
      }

      // 3. VER LISTA
      else if (intent === "VIEW_LIST") {
        const currentInt = await ensureFreshIntentionsDocument();
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses = currentInt.responses || {};
        const timestamps = currentInt.confirmationTimestamps || {};

        const goingList = allPlayers
          .filter(
            (p) =>
              p.status === "active" &&
              !p.isDM &&
              (responses[p.id] === "GOING" ||
                (p.uid && responses[p.uid] === "GOING") ||
                (p.email && responses[p.email.trim().toLowerCase()] === "GOING"))
          )
          .sort((a, b) => (timestamps[a.id] || 0) - (timestamps[b.id] || 0));

        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
        const settersCount = goingList.filter((p) => p.isOfficialSetter).length;

        replyText =
          `📋 *LISTA DE QUINTA (${formattedDate}) — GUERREIROS VC*\n` +
          `✅ *Confirmados:* ${goingList.length} (${settersCount} Levantadores)\n\n` +
          (goingList.length > 0
            ? goingList
                .map((p, i) => `${String(i + 1).padStart(2, "0")}. ${p.name}${p.isOfficialSetter ? " *(L)*" : ""}`)
                .join("\n")
            : "_Ninguém confirmou ainda. Digite gv vou para estrear a lista!_") +
          `\n\n💡 _Digite *gv vou* para confirmar ou *gv naovou* para informar ausência._`;
      }

      // 4. VER RANKING
      else if (intent === "VIEW_RANKING") {
        const textLower = text.toLowerCase();
        const isDaily =
          textLower.includes("diario") ||
          textLower.includes("diário") ||
          textLower.includes("hoje") ||
          textLower.includes("dia");

        if (isDaily) {
          const todayKey = getFirestoreDateKey();
          const matchesSnap = await db.collection("matches").where("date", "==", todayKey).get();
          const todayMatches: any[] = [];
          matchesSnap.forEach((d: any) => todayMatches.push(d.data()));

          const perfMap = new Map<
            string,
            { name: string; wins: number; losses: number; ptsBalance: number; eloGain: number }
          >();

          todayMatches.forEach((m) => {
            const teamA: string[] = Array.isArray(m.teamA) ? m.teamA : [];
            const teamB: string[] = Array.isArray(m.teamB) ? m.teamB : [];
            const scoreA = Number(m.scoreA || 0);
            const scoreB = Number(m.scoreB || 0);
            const winA = m.winner === "A";

            const processParticipant = (pid: string, inA: boolean) => {
              const pObj = allPlayers.find((p) => p.id === pid);
              const name = pObj?.name || "Sócio";
              const prev = perfMap.get(pid) || { name, wins: 0, losses: 0, ptsBalance: 0, eloGain: 0 };
              const won = (inA && winA) || (!inA && !winA);
              const diff = inA ? scoreA - scoreB : scoreB - scoreA;
              if (won) {
                prev.wins += 1;
                prev.eloGain += 20;
              } else {
                prev.losses += 1;
                prev.eloGain -= 20;
              }
              prev.ptsBalance += diff;
              perfMap.set(pid, prev);
            };

            teamA.forEach((pid) => processParticipant(pid, true));
            teamB.forEach((pid) => processParticipant(pid, false));
          });

          const dailyRanking = Array.from(perfMap.values()).sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.eloGain !== a.eloGain) return b.eloGain - a.eloGain;
            return b.ptsBalance - a.ptsBalance;
          });

          if (dailyRanking.length === 0) {
            replyText = `📊 *RANKING DIÁRIO — GUERREIROS VC*\n\n_Nenhuma partida oficial registrada hoje (${todayKey.split("-").reverse().slice(0, 2).join("/")})._`;
          } else {
            replyText =
              `🔥 *RANKING DIÁRIO (${todayKey.split("-").reverse().slice(0, 2).join("/")})* 🔥\n\n` +
              dailyRanking
                .map((r, i) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${String(i + 1).padStart(2, "0")}.`;
                  const sign = r.eloGain >= 0 ? "+" : "";
                  const balSign = r.ptsBalance >= 0 ? "+" : "";
                  return `${medal} *${r.name}* — ${r.wins}V/${r.losses}D (${sign}${r.eloGain} ELO | Saldo ${balSign}${r.ptsBalance})`;
                })
                .join("\n");
          }
        } else {
          const allActiveSorted = allPlayers
            .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
            .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

          replyText =
            `🏆 *RANKING GERAL ACUMULADO (TODOS OS ${allActiveSorted.length} SÓCIOS)* 🏆\n\n` +
            allActiveSorted
              .map((p, i) => {
                const wr = p.matchesPlayed > 0 ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0;
                return `${String(i + 1).padStart(2, "0")}. *${p.name}* — *${Math.round(p.elo || 1200)} pts* (${p.wins || 0}V/${p.losses || 0}D • ${wr}%)`;
              })
              .join("\n");
        }
      }

      // 5. CONSULTAR PIX
      else if (intent === "CHECK_PIX") {
        const sysSnap = await db.collection("metadata").doc("system").get();
        const sysData = sysSnap.exists ? sysSnap.data() || {} : {};
        const pixKey = sysData.pixKey || "elizabeth.santos.pe@gmail.com";
        const fee = Number(sysData.monthlyFee || 0).toFixed(2).replace(".", ",");
        const currentMonth = getFirestoreDateKey().slice(0, 7);

        let statusLine = "";
        if (senderPlayer) {
          if (senderPlayer.isExempt) {
            statusLine = `✅ *${senderPlayer.name}*, seu cadastro é *Isento* de mensalidade.\n\n`;
          } else {
            const paySnap = await db
              .collection("payments")
              .where("playerId", "==", senderPlayer.id)
              .where("month", "==", currentMonth)
              .limit(1)
              .get();
            const isPaid = !paySnap.empty && paySnap.docs[0].data()?.status === "PAID";
            statusLine = isPaid
              ? `✅ *${senderPlayer.name}*, sua mensalidade de *${currentMonth}* já consta como *PAGA*!\n\n`
              : `⏳ *${senderPlayer.name}*, sua mensalidade de *${currentMonth}* consta como *PENDENTE*.\n\n`;
          }
        }

        replyText =
          `💰 *TESOURARIA GUERREIROS VC*\n\n` +
          statusLine +
          `💵 *Valor Mensal:* R$ ${fee}\n` +
          `🔑 *Chave PIX:* ${pixKey}\n` +
          `👤 *Favorecido:* Elizabeth de Souza Santos (Nubank)`;
      }

      // 6. EXTRATO SECO DE PARTIDAS
      else if (intent === "RAW_STATS_LIST") {
        const numMatch = lower.match(/(\d+)/);
        const limitGames = numMatch ? Math.min(100, Math.max(1, parseInt(numMatch[1], 10))) : 20;

        const matchesSnap = await db.collection("matches").get();
        const playerMatches: any[] = [];
        matchesSnap.forEach((d: any) => {
          const m = d.data();
          if (
            senderPlayer &&
            ((Array.isArray(m.teamA) && m.teamA.includes(senderPlayer.id)) ||
              (Array.isArray(m.teamB) && m.teamB.includes(senderPlayer.id)))
          ) {
            playerMatches.push({ id: d.id, ...m });
          }
        });

        playerMatches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const recentSlice = playerMatches.slice(0, limitGames);

        if (!senderPlayer) {
          replyText = `⚠️ Cadastro não localizado para exibir histórico.`;
        } else if (recentSlice.length === 0) {
          replyText = `🏐 *${senderPlayer.name}* ainda não possui partidas registradas no histórico oficial.`;
        } else {
          let wins = 0;
          let losses = 0;
          let ptsFor = 0;
          let ptsAgainst = 0;
          const formSeq: string[] = [];

          recentSlice.forEach((m, idx) => {
            const inA = Array.isArray(m.teamA) && m.teamA.includes(senderPlayer.id);
            const won = (inA && m.winner === "A") || (!inA && m.winner === "B");
            if (won) wins++;
            else losses++;

            ptsFor += inA ? (m.scoreA || 0) : (m.scoreB || 0);
            ptsAgainst += inA ? (m.scoreB || 0) : (m.scoreA || 0);
            if (idx < 5) formSeq.push(won ? "✅V" : "❌D");
          });

          const wr = Math.round((wins / recentSlice.length) * 100);
          const eloDelta = wins * 20 - losses * 20;
          const ptsBalance = ptsFor - ptsAgainst;

          replyText =
            `📊 *RAIO-X DE ${senderPlayer.name.toUpperCase()}*\n` +
            `_(Últimos ${recentSlice.length} jogos oficiais disputados)_\n\n` +
            `✅ *Vitórias:* ${wins} | ❌ *Derrotas:* ${losses} (*${wr}%*)\n` +
            `🔥 *Últimos ${formSeq.length}:* ${formSeq.join(" • ")}\n` +
            `📈 *Saldo ELO no período:* ${eloDelta >= 0 ? "+" : ""}${eloDelta} pts (ELO Atual: *${Math.round(senderPlayer.elo || 1200)}*)\n` +
            `🎯 *Saldo de Pontos:* ${ptsBalance >= 0 ? "+" : ""}${ptsBalance} (${ptsFor} pró / ${ptsAgainst} contra)\n` +
            `🏅 *Carreira Total:* ${senderPlayer.matchesPlayed || playerMatches.length} jogos (${senderPlayer.wins || 0}V / ${senderPlayer.losses || 0}D)`;
        }
      }

      // 7. ANÁLISE PROFUNDA, TÉCNICAS, SUPERLIGA E IA (DEEP_ANALYTICS_CHAT)
      else {
        if (!apiKey) {
          replyText = `🤖 Digite *gv vou* para confirmar presença ou *gv ranking* para ver o topo do ELO.`;
        } else {
          const cleanQuestion = text.replace(/^(@?gv|@?bot|@?botgv|@guerreiros|guerreiros)[,:\s]*/i, "");

          const matchesSnap = await db.collection("matches").get();
          const allMatches: any[] = [];
          matchesSnap.forEach((d: any) => allMatches.push(d.data()));

          const aiReply = await runDeepAnalyticsChat(
            apiKey,
            cleanQuestion,
            senderPlayer,
            allPlayers,
            allMatches
          );

          replyText =
            aiReply ||
            `🤖 Desculpe, Guerreiro(a), não tenho dados suficientes para responder a essa pergunta. Foco total no vôlei! 🏐`;
        }
      }

      // Define o destino da resposta: PROÍBE responder no grupo (@g.us), redirecionando SEMPRE ao privado
      let targetReplyChatId = chatId;
      let deleteMessageKey: any = null;

      if (isGroup) {
        const cleanSenderPhone = senderPlayer?.phone
          ? normalizePhoneToJid(senderPlayer.phone)
          : null;

        if (cleanSenderPhone) {
          targetReplyChatId = cleanSenderPhone;
        } else if (senderJid && !senderJid.endsWith("@g.us")) {
          // Suporta tanto @s.whatsapp.net quanto @lid diretamente no Baileys
          targetReplyChatId = senderJid;
        } else if (senderLid && !senderLid.endsWith("@g.us")) {
          targetReplyChatId = senderLid;
        }

        if (payload?.key) {
          deleteMessageKey = payload.key;
        }
      }

      return res.status(200).json({
        success: true,
        chatId: targetReplyChatId,
        groupChatId: isGroup ? chatId : null,
        text: replyText,
        deleteMessageKey
      });
    } catch (err: any) {
      console.error("[WhatsApp Webhook] Erro:", err);
      return res.status(200).json({ success: false, error: err.message });
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
      const { playerName } = req.body;
      const { serverGenerateBirthdayMessage } = await import("./services/serverGemini.ts");
      const message = await serverGenerateBirthdayMessage(playerName);
      res.json({ success: true, message });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate birthday message", details: err.message });
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
        try {
          const db = await getFirestore();
          const querySnap = await db
            .collection("players")
            .where("email", "==", trimmedEmail)
            .limit(1)
            .get();
          if (!querySnap.empty) {
            const docDoc = querySnap.docs[0];
            playerId = docDoc.id;
            playerName = docDoc.data()?.name || "Jogador";
          }
        } catch (e) {}
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
      await db
        .collection("metadata")
        .doc("webauthn_credentials")
        .set({ [credentialIdStr]: credentialDataToSave }, { merge: true });

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

  const server = http.createServer(app);
  const { setupGeminiLiveWebSocket } = await import("./services/serverLiveApi.ts");
  setupGeminiLiveWebSocket(server);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, ws: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});