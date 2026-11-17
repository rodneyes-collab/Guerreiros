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
import { runDeepAnalyticsChat, buildPlayerDeepStatsReport } from "./serverDeepAnalysis.ts";

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

async function buildGroupBirthdayMessage(birthdayPlayers: any[]): Promise<string> {
  const names = birthdayPlayers.map((p) => String(p.name || "Sócio").trim()).filter(Boolean);
  const formattedNames =
    names.length <= 1
      ? names[0] || "Guerreiro(a)"
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

  let aiGreeting = "";
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (apiKey) {
    try {
      const { serverGenerateBirthdayMessage } = await import("./services/serverGemini.ts");
      aiGreeting = (await serverGenerateBirthdayMessage(formattedNames)).trim();
    } catch (e) {
      console.warn("[Birthday Cron] Fallback de mensagem usado:", e);
    }
  }

  const fallbackGreeting =
    names.length === 1
      ? `Parabéns, ${formattedNames}! Que seu novo ciclo seja repleto de saúde, energia boa, muitos aces e vitórias dentro e fora das quadras! 🏐🎉`
      : `Parabéns em dose dupla para ${formattedNames}! Que o novo ciclo de vocês seja repleto de saúde, muitos aces, defesas impossíveis e grandes vitórias dentro e fora das quadras! 🏐🎉`;

  const body = aiGreeting || fallbackGreeting;
  const header =
    names.length === 1
      ? `🎂🎉 *FELIZ ANIVERSÁRIO, ${formattedNames.toUpperCase()}!* 🏐🥳`
      : `🎂🎉 *ANIVERSARIANTES DO DIA: ${formattedNames.toUpperCase()}!* 🏐🥳`;

  return (
    `${header}\n\n` +
    `${body}\n\n` +
    `Toda a família *Guerreiros VC* deseja felicidades e grandes rachões pela frente! 💛🖤\n\n` +
    `— Guerreirinho, o robô do clube 🤖`
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

async function getClientFirestoreAdapter() {
  if (clientFirestoreDb) return clientFirestoreDb;
  const { initializeApp: initClientApp, getApps: getClientApps } = await import("firebase/app");
  const {
    getFirestore: getClientFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc
  } = await import("firebase/firestore");

  const clientApp =
    getClientApps().length > 0 ? getClientApps()[0] : initClientApp(firebaseConfig);
  const lockedDbId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId;
  const rawDb =
    lockedDbId && lockedDbId !== "(default)"
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
  const lockedDbId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId;
  if (lockedDbId && lockedDbId !== "(default)") {
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
  return err?.code === 7 || msg.includes("PERMISSION_DENIED") || msg.includes("insufficient permissions");
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
  if (!forceRefresh && cachedPlayers.length > 0 && now - cachedPlayersLastFetch < PLAYERS_CACHE_TTL_MS) {
    return cachedPlayers;
  }

  return withFirestoreGuard(
    async () => {
      const db = await getFirestore();
      const playersSnap = await db.collection("players").get();
      const list: any[] = [];
      playersSnap.forEach((d: any) => list.push({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        cachedPlayers = list;
        cachedPlayersLastFetch = now;
      }
      return cachedPlayers;
    },
    cachedPlayers
  );
}

async function getCachedMatches(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
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
    now - cachedIntentionsLastFetch < INTENTIONS_CACHE_TTL_MS
  ) {
    return cachedIntentions;
  }

  const fallbackDoc = cachedIntentions || {
    targetDate: nextThu,
    automationEnabled: true,
    responses: {},
    confirmationTimestamps: {},
    remindersSent: {},
    lastUpdated: now
  };

  return withFirestoreGuard(async () => {
    const db = await getFirestore();
    const intentionsRef = db.collection("metadata").doc("intentions");
    const snap = await intentionsRef.get();

    if (!snap.exists) {
      const freshDoc = {
        targetDate: nextThu,
        automationEnabled: true,
        responses: {},
        confirmationTimestamps: {},
        remindersSent: {},
        lastUpdated: now
      };
      await intentionsRef.set(freshDoc);
      cachedIntentions = freshDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(freshDoc);
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
        lastUpdated: now
      };
      await intentionsRef.set(rotatedDoc);
      cachedIntentions = rotatedDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(rotatedDoc);
      return rotatedDoc;
    }

    if (unpacked.targetDate !== nextThu) {
      unpacked.targetDate = nextThu;
      await intentionsRef.set(unpacked);
    }

    cachedIntentions = unpacked;
    cachedIntentionsLastFetch = now;
    saveLocalIntentionsBackup(unpacked);
    return unpacked;
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
  if (existingIdx === -1 && player.name) {
    cachedPlayers.push({
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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
    res.json({ version: APP_VERSION, timestamp: Date.now() });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      circuitBreakerActive: Date.now() < firestoreCircuitOpenUntil,
      cachedPlayersCount: cachedPlayers.length,
      cachedMatchesCount: cachedMatches.length,
      projectId: configProjectId,
      databaseId: firebaseConfig?.firestoreDatabaseId || "(default)",
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

      cachedIntentions = updatedDoc;
      cachedIntentionsLastFetch = now;
      saveLocalIntentionsBackup(updatedDoc);

      await withFirestoreGuard(
        () => db.collection("metadata").doc("intentions").set(updatedDoc),
        undefined
      );
      await syncPlayerPreConfirmationDoc(db, targetDate, player, status, effectiveTs);

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
  // ⏰ MOTOR DE AGENDAMENTO AUTOMÁTICO (Aniversários, Indecisos, Lista, Resgate e Pílula Diária)
  // ============================================================================
  app.post("/api/whatsapp/cron-tasks", async (req, res) => {
    try {
      const groupJid = req.body?.groupJid || "120363401268459791@g.us";
      const dryRun = req.body?.dryRun === true;
      const br = getBrazilTimeParts();

      if (br.totalMinutes < 8 * 60 || br.totalMinutes > 23 * 60 + 35) {
        return res.json({ success: true, messages: [] });
      }

      const db = await getFirestore();
      const schedRef = db.collection("metadata").doc("whatsapp_scheduler");

      if (!cachedScheduler) {
        cachedScheduler = await withFirestoreGuard(async () => {
          const schedSnap = await schedRef.get();
          return schedSnap.exists ? schedSnap.data() || {} : {};
        }, {});
      }

      const schedData = cachedScheduler || {};
      const updates: Record<string, any> = {};
      const messagesToSend: Array<{ to: string; text: string; delayMs?: number }> = [];

      const [allPlayers, systemConfig] = await Promise.all([
        getCachedPlayers(cachedPlayers.length === 0),
        getCachedSystemConfig()
      ]);
      const activePlayers = allPlayers.filter((p) => p.status === "active" && !p.isDM);

      // 🎂 MENSAGEM AUTOMÁTICA DE ANIVERSÁRIO PARA O GRUPO (1x por dia a partir das 08:00 BRT)
      const autoBirthdaysEnabled =
        systemConfig?.birthdayNotificationsEnabled !== false &&
        systemConfig?.enableAutoBirthdays !== false;

      if (autoBirthdaysEnabled && schedData.lastBirthdayMessageDate !== br.dateKey) {
        const birthdayPlayers = getTodayBirthdayPlayers(allPlayers, br.dateKey);
        if (birthdayPlayers.length > 0) {
          updates.lastBirthdayMessageDate = br.dateKey;
          updates.lastBirthdayPlayers = birthdayPlayers.map((p) => p.name);
          const birthdayText = await buildGroupBirthdayMessage(birthdayPlayers);
          messagesToSend.push({ to: groupJid, text: birthdayText });
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
        const currentInt = await ensureFreshIntentionsDocument();
        const targetDate = currentInt.targetDate || getNextThursday();
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");
        const responses = currentInt.responses || {};

        const undecided = activePlayers.filter((p) => {
          const resp =
            responses[p.id] ||
            (p.uid ? responses[p.uid] : null) ||
            (p.email ? responses[p.email.trim().toLowerCase()] : null);
          return !resp;
        });

        undecided.forEach((p, idx) => {
          const jid = normalizePhoneToJid(p.phone);
          if (!jid) return;
          const firstName = p.name.split(" ")[0];

          let textMessage = `Fala, *${firstName}*! 🏐🔥\nAinda não vimos sua confirmação na *Lista de Quinta (${formattedDate})* dos Guerreiros!\n\nToque em uma das opções abaixo ou me mande um áudio para registrar sua resposta:\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`;

          if (isThu16h) {
            textMessage = `Fala, *${firstName}*! ⏰🏐\nFechamento da *Lista de Quinta (${formattedDate})* logo mais à noite!\n\nVocê ainda não confirmou presença. Vai jogar hoje?\n\n🟢 *[ ✅ CONFIRMAR PRESENÇA ]*\nhttps://wa.me/558197330924?text=gv%20vou\n\n🔴 *[ ❌ INFORMAR AUSÊNCIA ]*\nhttps://wa.me/558197330924?text=gv%20naovou\n\n— Guerreirinho, o robô do clube 🤖`;
          }

          messagesToSend.push({
            to: jid,
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

          const absentPlayers = activePlayers.filter((p) => (attendanceMap.get(p.id) || 0) === 0 && p.phone);

          absentPlayers.forEach((p, idx) => {
            const jid = normalizePhoneToJid(p.phone);
            if (!jid) return;
            const firstName = p.name.split(" ")[0];

            messagesToSend.push({
              to: jid,
              delayMs: idx * 15000,
              text: `Fala, *${firstName}*! 🏐👀\n\nO Guerreirinho aqui estava olhando as súmulas dos últimos rachões e percebi que a sua presença tem feito falta na nossa resenha! A rede está armada, o ELO está guardado e o time está sentindo falta do seu braço em quadra.\n\nTá tudo bem por aí? Quando puder colar com a gente de novo, é só mandar uma mensagem ou áudio dizendo que vai!\n\nUm abraço dos Guerreiros! 👊\n\n— Guerreirinho, o robô do clube 🤖`
            });
          });
        } catch {}
      }

      const dateSeed = br.dateKey.split("-").reduce((acc, val) => acc * 31 + Number(val), 7);
      const randomTargetMinute = 600 + (Math.abs(dateSeed * 16807) % 481);

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

      const isMondayToThursday = br.dayOfWeek >= 1 && br.dayOfWeek <= 4;
      if (isMondayToThursday && br.totalMinutes >= 8 * 60 && br.totalMinutes <= 19 * 60 + 30) {
        const halfHourBucket = Math.floor(br.minute / 30);
        const slotKey = `${br.dateKey}_${br.hour}_${halfHourBucket}`;
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
                `✅ *Confirmados:* ${goingList.length}/29 (${settersCount} Levantadores)\n` +
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

      if (!dryRun && Object.keys(updates).length > 0) {
        cachedScheduler = { ...schedData, ...updates };
        await withFirestoreGuard(() => schedRef.set(updates, { merge: true }), undefined);
      }

      res.json({ success: true, messages: messagesToSend, ...(dryRun ? { dryRun: true } : {}) });
    } catch (err: any) {
      res.status(200).json({ success: false, messages: [], error: err.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const payload = body.payload || body.data || body;

      let rawText: string =
        payload.body ||
        payload?.message?.conversation ||
        payload?.message?.extendedTextMessage?.text ||
        "";

      const audioMessage = payload?.message?.audioMessage || payload?.audioMessage;
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
      if (!text && !audioBuffer) {
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

      if (isBotGeneratedOutput && !audioBuffer) {
        return res.status(200).json({ ignored: true, reason: "bot_output" });
      }

      const isFromMe = Boolean(payload.fromMe || payload?.key?.fromMe);
      const chatId: string = payload.from || payload?.key?.remoteJid || "";
      const isGroup = chatId.endsWith("@g.us");
      const lower = text.toLowerCase().trim();

      const isAliasTrigger = /^@?(gv|bot|botgv|guerreirinho)($|[\s,!?:])/i.test(lower);

      if (isFromMe && !isAliasTrigger && !audioBuffer) {
        return res.status(200).json({ ignored: true, reason: "fromMe_non_command" });
      }

      const isPrivateChat = !isGroup && (payload.toMe || chatId.endsWith("@s.whatsapp.net"));
      const isTrigger =
        isPrivateChat ||
        Boolean(audioBuffer && !isGroup) ||
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
      const isLidSender = String(senderJid).endsWith("@lid");
      const senderLid: string =
        payload.participantLid || (isLidSender ? String(senderJid) : "");
      const pushName: string = String(payload.pushName || "").trim();
      const senderPhone = isLidSender
        ? ""
        : String(senderJid).split("@")[0].replace(/\D/g, "");

      const db = await getFirestore();
      // Força o carregamento se o cache estiver vazio no momento da mensagem
      const allPlayers = await getCachedPlayers(cachedPlayers.length === 0);

      const normStr = (s: string) =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      const matchingPlayers = allPlayers.filter((p) => {
        if (senderLid && p.whatsappLid && p.whatsappLid === senderLid) return true;
        if (!isLidSender && senderPhone.length >= 8) {
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

      // Ordena pelo maior número de partidas jogadas para sempre pegar o perfil principal
      matchingPlayers.sort((a, b) => (Number(b.matchesPlayed) || 0) - (Number(a.matchesPlayed) || 0));
      let senderPlayer = matchingPlayers[0];

      if (!senderPlayer && pushName.length >= 2) {
        const cleanPush = normStr(pushName);
        const pushTokens = cleanPush.split(/[^a-z0-9]+/).filter(Boolean);

        const scoredCandidates = allPlayers
          .filter((p) => p.status === "active" && p.name)
          .map((p) => {
            const cleanName = normStr(p.name);
            const nameTokens = cleanName.split(/[^a-z0-9]+/).filter(Boolean);
            let score = 0;

            if (cleanName === cleanPush) {
              score = 100;
            } else if (
              nameTokens.length === 1 &&
              pushTokens.length > 0 &&
              pushTokens[0] === nameTokens[0] &&
              nameTokens[0].length >= 3
            ) {
              // Ex: pushName "Alê Hermanos" -> primeiro nome exato "ale" === "ale"
              score = 90;
            } else if (
              nameTokens.length > 1 &&
              nameTokens.every((t) => pushTokens.includes(t))
            ) {
              score = 85;
            } else if (
              pushTokens.length === 1 &&
              pushTokens[0].length >= 3 &&
              nameTokens[0] === pushTokens[0]
            ) {
              score = 80;
            } else if (
              nameTokens.length === 1 &&
              nameTokens[0].length >= 4 &&
              pushTokens.includes(nameTokens[0])
            ) {
              score = 70;
            }
            return { player: p, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (Number(b.player.matchesPlayed) || 0) - (Number(a.player.matchesPlayed) || 0);
          });

        senderPlayer = scoredCandidates[0]?.player;

        if (senderPlayer) {
          if (isLidSender && senderLid && !senderPlayer.whatsappLid) {
            senderPlayer.whatsappLid = senderLid;
            withFirestoreGuard(async () => {
              await db.collection("players").doc(senderPlayer.id).update({
                whatsappLid: senderLid,
                autoLinkedAt: Date.now()
              });
            }, undefined).catch(() => {});
          } else if (
            !isLidSender &&
            (!senderPlayer.phone || senderPlayer.phone.trim() === "")
          ) {
            const cleanCurrentPhone = senderPhone.replace(/\D/g, "");
            if (cleanCurrentPhone.length >= 10 && cleanCurrentPhone.length <= 13) {
              senderPlayer.phone = cleanCurrentPhone;
              withFirestoreGuard(async () => {
                await db.collection("players").doc(senderPlayer.id).update({
                  phone: cleanCurrentPhone,
                  autoLinkedAt: Date.now()
                });
              }, undefined).catch(() => {});
            }
          }
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
        const currentInt = await ensureFreshIntentionsDocument();
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses: Record<string, string> = { ...(currentInt.responses || {}) };
        const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };

        const now = Date.now();
        const cutoffTs = getCycleFridayCutoffTimestamp(targetDate);
        const prevTs = Number(timestamps[senderPlayer.id] || 0);
        const alreadyConfirmed = responses[senderPlayer.id] === "GOING" && prevTs >= cutoffTs;
        const effectiveTs = alreadyConfirmed ? prevTs : now;

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

        const pool = allPlayers.length > 0 ? allPlayers : [senderPlayer];
        const activeGoing = pool
          .filter(
            (p) =>
              p.status === "active" &&
              !p.isDM &&
              (responses[p.id] === "GOING" ||
                (p.uid && responses[p.uid] === "GOING") ||
                (p.email && responses[p.email.trim().toLowerCase()] === "GOING"))
          )
          .sort((a, b) => (timestamps[a.id] || 0) - (timestamps[b.id] || 0));

        const pos = Math.max(1, activeGoing.findIndex((p) => p.id === senderPlayer.id) + 1);
        const totalGoing = Math.max(1, activeGoing.length);
        const formattedDate = targetDate.split("-").reverse().slice(0, 2).join("/");

        return alreadyConfirmed
          ? `✅ *${senderPlayer.name}*, você já estava confirmado(a) para Quinta (${formattedDate})! Sua posição na lista é *#${pos}* de *${totalGoing}* / 29.`
          : `🏐🔥 *Bora pra cima, ${senderPlayer.name}!*\nPresença confirmada para Quinta (${formattedDate})!\n📍 Você é o *#${pos}* de *${totalGoing}* / 29 confirmados.\n\n_Caso precise cancelar depois, toque aqui:_\nhttps://wa.me/558197330924?text=gv%20naovou`;
      };

      const executeDeclineAttendance = async (): Promise<string> => {
        const currentInt = await ensureFreshIntentionsDocument();
        const targetDate = currentInt.targetDate || getNextThursday();
        const responses: Record<string, string> = { ...(currentInt.responses || {}) };
        const timestamps: Record<string, number> = { ...(currentInt.confirmationTimestamps || {}) };
        const now = Date.now();

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

        return `📝 Registrado, *${senderPlayer.name}*. Sua ausência foi atualizada na lista. Fica para a próxima!\n\n_Mudei de ideia, quero ir:_ 👉 https://wa.me/558197330924?text=gv%20vou`;
      };

      const executeGetAttendanceList = async (): Promise<string> => {
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

        return (
          `📋 *ATUALIZAÇÃO DA LISTA DE QUINTA (${formattedDate})* 🏐\n` +
          `✅ *Confirmados:* ${goingList.length}/29 (${settersCount} Levantadores)\n` +
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

      if (["1", "vou", "eu vou", "confirmar", "presenca"].includes(cleanAfterAlias)) {
        replyBody = await executeConfirmAttendance();
      } else if (["2", "naovou", "nao vou", "ausente"].includes(cleanAfterAlias)) {
        replyBody = await executeDeclineAttendance();
      } else if (["lista", "confirmados", "quem vai"].includes(cleanAfterAlias)) {
        replyBody = await executeGetAttendanceList();
      } else if (cleanAfterAlias === "ranking") {
        replyBody = await executeGetRanking();
      } else if (["pix", "mensalidade", "financeiro", "tesouraria"].includes(cleanAfterAlias)) {
        replyBody = await executeGetPixInfo();
      } else if (
        ["aniversario", "aniversarios", "aniversariante", "aniversariantes", "niver"].includes(
          cleanAfterAlias
        )
      ) {
        replyBody = await executeGetBirthdays();
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
        const cleanSenderPhone = senderPlayer?.phone
          ? normalizePhoneToJid(senderPlayer.phone)
          : null;

        if (cleanSenderPhone) {
          targetReplyChatId = cleanSenderPhone;
        } else if (senderJid && !senderJid.endsWith("@g.us")) {
          targetReplyChatId = senderJid;
        } else if (senderLid && !senderLid.endsWith("@g.us")) {
          targetReplyChatId = senderLid;
        }
      }

      return res.status(200).json({
        success: true,
        chatId: targetReplyChatId,
        groupChatId: isGroup ? chatId : null,
        text: replyText
      });
    } catch (err: any) {
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

  const server = http.createServer(app);

  // 🚀 Abre a porta 3000 imediatamente para passar no Health Check do Cloud Run
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);

    import("./services/serverLiveApi.ts")
      .then(({ setupGeminiLiveWebSocket }) => {
        setupGeminiLiveWebSocket(server);
      })
      .catch((e) => console.warn("[LiveAPI] Aviso ao inicializar WebSocket:", e));

    setTimeout(() => {
      ensureFreshIntentionsDocument().catch(() => {});
      getCachedPlayers(true).catch(() => {});
      getCachedMatches(true).catch(() => {});
    }, 1500);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});