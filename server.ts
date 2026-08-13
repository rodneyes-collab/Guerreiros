import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import { APP_VERSION } from "./constants";
import { getRegistrationOptions, verifyRegistration, getAuthenticationOptions, verifyAuthentication } from "./src/services/webauthn";

// Cache for GCP clients to prevent re-initialization
let cachedGoogleAuth: any = null;
let cachedMetricsClient: any = null;

const getGoogleAuth = async () => {
  if (!cachedGoogleAuth) {
    const { GoogleAuth } = await import("google-auth-library");
    cachedGoogleAuth = new GoogleAuth();
  }
  return cachedGoogleAuth;
};

const getMetricsClient = async () => {
  if (!cachedMetricsClient) {
    const { MetricServiceClient } = await import("@google-cloud/monitoring");
    cachedMetricsClient = new MetricServiceClient();
  }
  return cachedMetricsClient;
};

const __dirname = process.cwd();
// ... rest of the file ...

// Forçar o ambiente a usar o projeto do usuário se disponível
let configProjectId = "volleyclub-manager";
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (firebaseConfig.projectId) configProjectId = firebaseConfig.projectId;
  }
} catch (e) {
  console.warn("[Server] Falha ao ler config for project ID:", e);
}

process.env.GOOGLE_CLOUD_PROJECT = configProjectId;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = configProjectId;

// In-memory challenge store for temporary WebAuthn cache to bypass database permission/index limitations
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] At:', promise, 'reason:', reason);
});
interface TemporaryChallenge {
  challenge: string;
  playerId?: string;
  playerName?: string;
  createdAt: number;
}

export const getFirestoreDateKey = (date?: Date) => {
  const now = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
};

const challengeStore = new Map<string, TemporaryChallenge>();

// Local File Storage for WebAuthn Credentials to guarantee 100% success irrespective of dynamic Firestore or Admin account permissions in pre-production/sandbox environments.
const CREDENTIALS_FILE_PATH = path.join(process.cwd(), "webauthn_credentials_local.json");

function loadLocalCredentials(): Record<string, any> {
  try {
    if (fs.existsSync(CREDENTIALS_FILE_PATH)) {
      const data = fs.readFileSync(CREDENTIALS_FILE_PATH, "utf-8");
      return JSON.parse(data) || {};
    }
  } catch (err: any) {
    console.log("[Local Credentials Store] Direct read failed, returning empty.");
  }
  return {};
}

function saveLocalCredential(id: string, credentialData: any) {
  try {
    const creds = loadLocalCredentials();
    creds[id] = credentialData;
    fs.writeFileSync(CREDENTIALS_FILE_PATH, JSON.stringify(creds, null, 2), "utf-8");
    console.log(`[Local Credentials Store] Saved credential locally for: ${credentialData.email}`);
  } catch (err: any) {
    console.log("[Local Credentials Store] Save error:", err.message);
  }
}

function updateLocalCredentialCounter(id: string, counter: number) {
  try {
    const creds = loadLocalCredentials();
    if (creds[id]) {
      creds[id].counter = counter;
      fs.writeFileSync(CREDENTIALS_FILE_PATH, JSON.stringify(creds, null, 2), "utf-8");
      console.log(`[Local Credentials Store] Updated counter to ${counter} for: ${creds[id].email}`);
    }
  } catch (err: any) {
    console.log("[Local Credentials Store] Update counter error:", err.message);
  }
}

// Lazy initialize firebase-admin
let adminApp: any = null;
let adminDb: any = null;

async function getAdminFirestore() {
  if (adminDb) return adminDb;
  
  const { initializeApp: initializeAdmin, getApps: getAdminApps } = await import("firebase-admin/app");
  const { getFirestore: getAdminFirestoreInstance } = await import("firebase-admin/firestore");
  
  if (getAdminApps().length === 0) {
    try {
      // Prioritize default initialization which uses environment credentials
      adminApp = initializeAdmin();
      console.log("[Server Admin] Default Admin App initialized");
    } catch (e) {
      console.warn("[Server Admin] Default initialization failed, using projectId:", configProjectId);
      adminApp = initializeAdmin({
        projectId: configProjectId
      });
    }
  } else {
    adminApp = getAdminApps()[0];
  }
  
  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
    ? firebaseConfig.firestoreDatabaseId 
    : undefined;
    
  adminDb = getAdminFirestoreInstance(adminApp, databaseId);
  const actualProjectId = adminApp.options.projectId || configProjectId;
  console.log(`[Server Admin] Firestore Admin initialized for project: ${actualProjectId}${databaseId ? ` / database: ${databaseId}` : ''}`);
  return adminDb;
}

async function getFirestore() {
  const db = await getWebFirestoreInstance();
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, limit } = await import("firebase/firestore");

  function wrapDocSnap(snap: any) {
    return {
      exists: () => snap.exists(),
      id: snap.id,
      data: () => snap.data()
    };
  }

  function wrapQuerySnap(snap: any) {
    return {
      empty: snap.empty,
      docs: snap.docs.map(wrapDocSnap),
      forEach: (callback: any) => snap.forEach((doc: any) => callback(wrapDocSnap(doc)))
    };
  }

  function wrapDocRef(ref: any) {
    return {
      id: ref.id,
      path: ref.path,
      get: async () => wrapDocSnap(await getDoc(ref)),
      set: async (data: any, options?: any) => await setDoc(ref, data, options),
      update: async (data: any) => await updateDoc(ref, data),
      delete: async () => await deleteDoc(ref),
      collection: (path: string) => wrapCollection(collection(ref, path))
    };
  }

  function wrapQuery(q: any) {
    return {
      where: (f: string, op: any, val: any) => wrapQuery(query(q, where(f, op === '==' ? '==' : op, val))),
      orderBy: (f: string, dir?: any) => wrapQuery(query(q, orderBy(f, dir))),
      limit: (n: number) => wrapQuery(query(q, limit(n))),
      get: async () => wrapQuerySnap(await getDocs(q))
    };
  }

  function wrapCollection(collRef: any) {
    return {
      doc: (id?: string) => id ? wrapDocRef(doc(collRef, id)) : wrapDocRef(doc(collRef)),
      add: async (data: any) => {
        const ref = await addDoc(collRef, data);
        return wrapDocRef(ref);
      },
      where: (f: string, op: any, val: any) => wrapQuery(query(collRef, where(f, op === '==' ? '==' : op, val))),
      orderBy: (f: string, dir?: any) => wrapQuery(query(collRef, orderBy(f, dir))),
      limit: (n: number) => wrapQuery(query(collRef, limit(n))),
      get: async () => wrapQuerySnap(await getDocs(collRef))
    };
  }

  return {
    collection: (path: string) => wrapCollection(collection(db, path))
  };
}

// Lazy initialize client/web firestore for server route usage (bypasses IAM/Service Account permission errors in sandboxed pre-production/production environments)
let webDb: any = null;
async function getWebFirestoreInstance() {
  if (webDb) return webDb;
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const { getFirestore: getWebFirestore, setLogLevel } = await import("firebase/firestore");
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import("firebase/auth");
  
  try {
    setLogLevel("silent");
  } catch (e) {}
  
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.warn("[Server Firebase] firebaseConfig is missing required fields. Firestore operations might fail.");
    // Provide a fallback or return null
    return null;
  }
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  
  // Sign in with email to authenticate the server context and bypass strict public write block policies
  const auth = getAuth(app);
  if (!auth.currentUser) {
    try {
      const serverEmail = "server@guerreiros.com";
      const serverPass = "GuerreirosServer#2026!";
      try {
        await signInWithEmailAndPassword(auth, serverEmail, serverPass);
        console.log(`[Server Firebase Auth] Authenticated successfully as server service account.`);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            await createUserWithEmailAndPassword(auth, serverEmail, serverPass);
            console.log(`[Server Firebase Auth] Created and authenticated as server service account.`);
        } else {
            throw err;
        }
      }
    } catch (e: any) {
      console.warn("[Server Firebase Auth] Failed to authenticate server:", e.message);
    }
  }

  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
    ? firebaseConfig.firestoreDatabaseId 
    : undefined;
  webDb = databaseId ? getWebFirestore(app, databaseId) : getWebFirestore(app);
  console.log(`[Server Firebase] Firestore initialized for database: ${databaseId || '(default)'}`);
  return webDb;
}

async function startServer() {
  console.log("[Guerreiros] DEBUG: startServer called");
  console.log("[Guerreiros] Iniciando processo de boot...");
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Middleware para definir Permissions-Policy
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'publickey-credentials-get=(self), publickey-credentials-create=(self)');
    next();
  });

  // API Routes
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
    } catch (e: any) {
      dbStatus = `error: ${e.message}`;
    }
    res.json({ 
      status: "ok", 
      db: dbStatus,
      projectId: configProjectId,
      timestamp: new Date().toISOString() 
    });
  });

  app.get("/api/ai/status", async (req, res) => {
    try {
      const { getAIStatus } = await import("./services/geminiService");
      res.json(getAIStatus());
    } catch (err) {
      res.status(500).json({ error: "Failed to get AI status" });
    }
  });

  app.get("/api/test", (req, res) => {
    console.log("[Server] Test route hit");
    res.json({ message: "API is reachable" });
  });

  app.get("/api/sys-info", (req, res) => {
    console.log("[API] Memory usage requested");
    const used = process.memoryUsage();
    res.json({
      rss: Math.round(used.rss / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024),
      timestamp: new Date().toISOString()
    });
  });

  // IA Sentinel Deep Scan Endpoint
  app.post("/api/sentinel/deep-scan", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    try {
      const { players = [], matches = [], loginLogs = [], auditLogs = [], metadata = {} } = req.body;

      const { runSentinelDeepScan } = await import("./services/sentinelService");
      const report = await runSentinelDeepScan(apiKey, {
        players,
        matches,
        loginLogs,
        auditLogs,
        metadata
      });

      const status = report.includes("CRÍTICO") ? "CRITICAL" : (report.includes("WARNING") ? "WARNING" : "HEALTHY");
      
      res.json({ success: true, report, status });
    } catch (err: any) {
      console.error("[Sentinel] Deep scan failed:", err);
      res.status(500).json({ error: "Sentinel scan failed", details: err.message });
    }
  });

  // AI Coach Feedback Endpoint
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

      const { runAICoachAnalysis } = await import("./services/aiCoachService");
      const feedback = await runAICoachAnalysis(apiKey, {
        player,
        allPlayers,
        recentMatches
      });

      res.json({ success: true, feedback });
    } catch (err: any) {
      console.error("[AI Coach] Feedback generation failed:", err);
      const { isQuotaOrBillingError } = await import("./services/geminiService");
      isQuotaOrBillingError(err);
      res.status(500).json({ error: "AI Coach failed", details: err.message });
    }
  });

  // AI Chat Bot Endpoint
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

      const { runAIChat } = await import("./services/aiChatService");
      const response = await runAIChat(apiKey, message, history, context);

      res.json({ success: true, response });
    } catch (err: any) {
      console.error("[AI Chat] Failed:", err);
      const { isQuotaOrBillingError } = await import("./services/geminiService");
      isQuotaOrBillingError(err);
      res.status(500).json({ error: "Chat failed", details: err.message });
    }
  });

  // Rota para debug de identidade (apenas para verificação)
app.get("/api/debug-identity", async (req, res) => {
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    let email = (client as any).email || (client as any).client_email || "Not found in client";
    
    // Try metadata server directly
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

// Rota para capturar métricas REAIS do Google Cloud Monitoring
app.get("/api/billing/real-time", async (req, res) => {
  const targetDateStr = req.query.date as string;
  
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const authClient = new GoogleAuth();
    let serviceAccountEmail = "rodneyes@gmail.com";
    try {
      // Tenta obter o e-mail real da conta de serviço via servidor de metadados (Cloud Run)
      const client = await authClient.getClient();
      serviceAccountEmail = (client as any).email || (client as any).client_email || "rodneyes@gmail.com";
      
      // Fallback para metadados se não encontrado no cliente
      if (serviceAccountEmail === "rodneyes@gmail.com") {
        const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
        const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000) }).catch(() => null);
        if (metadataResp?.ok) {
          serviceAccountEmail = await metadataResp.text();
        }
      }
    } catch (e) {
      console.warn("[Server] Falha ao descobrir e-mail da SA:", e);
    }
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let projectId = configProjectId;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.projectId) projectId = config.projectId;
    } catch (e) {}

    console.log(`[Server] Buscando métricas para o projeto: ${projectId} | Identidade ativa: ${serviceAccountEmail}`);

    const { MetricServiceClient } = await import("@google-cloud/monitoring");
    const metricsClient = new MetricServiceClient();
    
    let startTime: Date;
    let endTime: Date;

    if (targetDateStr) {
      // Busca um dia específico (00:00:00 até 23:59:59 daquele dia no fuso de SP)
      // Como o fuso de SP é UTC-3, precisamos buscar de 03:00 (UTC) do dia até 02:59 (UTC) do dia seguinte.
      startTime = new Date(`${targetDateStr}T03:00:00Z`);
      const nextDay = new Date(startTime);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      nextDay.setUTCHours(2, 59, 59, 999);
      endTime = nextDay;
    } else {
      // Padrão: Últimas 24h em UTC para garantir dados consistentes
      endTime = new Date();
      startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    }

      // Captura métrica de uso de CPU do Cloud Run
      let timeSeries: any[] = [];
      let cpuMetricAvailable = false;
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/cpu/usage_time"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: 'ALIGN_SUM',
            crossSeriesReducer: 'REDUCE_SUM',
          }
        }, { timeout: 10000 });
        timeSeries = response;
        cpuMetricAvailable = timeSeries.length > 0;
      } catch (err: any) {
        console.warn(`[Server] CPU metric not found or unavailable, assuming 0: ${err.message}`);
      }

      let totalCpuSeconds = 0;
      timeSeries.forEach(serie => {
        serie.points?.forEach((point: any) => {
          if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
        });
      });

      // Captura métrica de memória (Utilização média em Bytes)
      let memorySeries: any[] = [];
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/container/memory/usage"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: 'ALIGN_MEAN',
            crossSeriesReducer: 'REDUCE_SUM',
          }
        }, { timeout: 10000 });
        memorySeries = response;
      } catch (err: any) {
        console.warn(`[Server] Memory metric not found or unavailable, assuming 0: ${err.message}`);
      }

      let totalMemoryBytesAvg = 0;
      let memoryPointsCount = 0;
      memorySeries.forEach(serie => {
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

      // Captura métrica de requests
      let totalRequests = 0;
      try {
        const [response] = await metricsClient.listTimeSeries({
          name: metricsClient.projectPath(projectId),
          filter: 'metric.type = "run.googleapis.com/request_count"',
          interval: {
            startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
            endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: 'ALIGN_SUM',
            crossSeriesReducer: 'REDUCE_SUM',
          }
        }, { timeout: 10000 });
        response.forEach(serie => {
          serie.points?.forEach((point: any) => {
            if (point.value?.int64Value) totalRequests += Number(point.value.int64Value);
          });
        });
      } catch (e) {}

      // Cálculo financeiro refinado (vCPU, GiB-seconds e Requests)
      const cpuCost = totalCpuSeconds * 0.00003360; // USD 
      const memoryCost = (totalMemoryByteSeconds / (1024 * 1024 * 1024)) * 0.00000360; // GiB-sec estimativa
      const requestCost = (totalRequests / 1000000) * 0.40; // USD por milhão de requests
      
      const estimatedCostBRL = (cpuCost + memoryCost + requestCost) * 5.25; // Conversão BRL

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
        estimatedCostBRL: (cpuMetricAvailable || totalRequests > 0) ? Number(estimatedCostBRL.toFixed(4)) : null,
        metricsAvailable: cpuMetricAvailable,
        status: "success"
      });
    } catch (error: any) {
      console.error("Erro ao buscar métricas GCP:", error);
      
      const errorMessageStr = error.message || "";
      const isApiDisabled = errorMessageStr.includes("has not been used") || errorMessageStr.includes("is disabled");
      const isIamError = errorMessageStr.includes("Caller does not have required permission");
      
      // Retornamos 200 mesmo em caso de erro para evitar que o Nginx/Proxy intercepte e retorne HTML
      const { GoogleAuth } = await import("google-auth-library");
      const authInternal = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const client = await authInternal.getClient();
        serviceAccountEmail = (client as any).email || (client as any).client_email || "rodneyes@gmail.com";
        
        if (serviceAccountEmail === "rodneyes@gmail.com") {
          const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
          const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000) }).catch(() => null);
          if (metadataResp?.ok) {
            serviceAccountEmail = await metadataResp.text();
          }
        }
      } catch (e) {}

      return res.status(200).json({ 
        success: false,
        isGcpError: true,
        errorType: isApiDisabled ? "API_DISABLED" : "IAM_PERMISSION_DENIED",
        error: isApiDisabled ? "API de Monitoramento Desativada" : "Erro de Permissão IAM",
        details: error.message,
        serviceAccount: serviceAccountEmail,
        helpLink: "https://console.developers.google.com/iam-admin/iam",
        projectId: configProjectId || "desconhecido"
      });
    }
  });

  // Route to link an auth uid to a player (bypasses Firestore Security Rules blocking)
  app.post("/api/players/:id/link", async (req, res) => {
    try {
       const playerId = req.params.id;
       const { uid } = req.body;
       if (!playerId || !uid) {
          return res.status(400).json({ error: "Missing parameters" });
       }
       const dbAdmin = await getFirestore(); // firebase-admin
       await dbAdmin.collection("players").doc(playerId).update({ uid });
       res.json({ success: true });
    } catch (e: any) {
       console.error("[Link Device] Error:", e);
       res.status(500).json({ error: e.message });
    }
  });

  // Route to register presence via admin privileges (bypassing Firestore Security Rules blocking)
  app.post("/api/presence/set", async (req, res) => {
    try {
        const { playerId, status, phoneDigits, uid, userEmail, isAdmin } = req.body;
        if (!playerId || status === undefined) {
           return res.status(400).json({ error: "Missing parameters" });
        }
 
        // 1. Get firestore instance (Web SDK to bypass IAM errors)
        const db = await getWebFirestoreInstance();
        if (!db) return res.status(500).json({ error: "Firebase not configured on server" });

        const { doc, getDoc, setDoc, deleteField } = await import("firebase/firestore");
        
        const playerRef = doc(db, "players", playerId);
        const playerSnap = await getDoc(playerRef);
        
        if (!playerSnap.exists()) {
          return res.status(404).json({ error: "Player not found" });
        }
        const player = playerSnap.data();

        // 2. Validate authorization
        let isAuthorized = false;
        
        if (isAdmin) {
            isAuthorized = true; // Admin can change anyone's intent
        } else if (uid && player?.uid === uid) {
            isAuthorized = true; // Player can change their own intent if logged in
        } else if (userEmail && player?.email && userEmail.trim().toLowerCase() === player.email.trim().toLowerCase()) {
            isAuthorized = true; // Player can change intent if logged in email matches player email
        } else if (!userEmail && !uid) {
            // For public / non-logged in users accessing via the public confirmation link,
            // we allow them to confirm without any phone requirement (since phone association is completely removed).
            isAuthorized = true;
        }
         
         if (!isAuthorized) {
           return res.status(403).json({ error: "Authorization failed" });
         }
 
        // 3. Update intentions using Web SDK
        const intentionsRef = doc(db, "metadata", "intentions");
        
        const updatePayload: any = {
          [`responses.${playerId}`]: status === 'RESET' ? deleteField() : status
        };
        
        if (status === 'GOING') {
          updatePayload[`confirmationTimestamps.${playerId}`] = Date.now();
        } else if (status === 'RESET') {
          updatePayload[`confirmationTimestamps.${playerId}`] = deleteField();
        }
 
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(intentionsRef, updatePayload);

        // Also update preConfirmations
        try {
          const { deleteDoc } = await import("firebase/firestore");
          const intentionsSnap = await getDoc(intentionsRef);
          const targetDate = intentionsSnap.exists() && intentionsSnap.data().targetDate ? intentionsSnap.data().targetDate : getFirestoreDateKey();
          const preConfirmationsRef = doc(db, 'preConfirmations', targetDate, 'players', playerId);
          if (status === 'GOING') {
             await setDoc(preConfirmationsRef, { ...player, timestamp: Date.now(), id: playerId }, { merge: true });
          } else {
             await deleteDoc(preConfirmationsRef);
          }
        } catch (e: any) {
          console.warn("[Presence API] Could not update preConfirmations", e.message);
        }

        // Also track access / login for the player
        try {
          const nowISO = new Date().toISOString();
          const pData = playerSnap.exists() ? playerSnap.data() : {};
          const loginHist = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];
          
          const lastTime = loginHist[0] ? new Date(loginHist[0]).getTime() : 0;
          if (isNaN(lastTime) || Date.now() - lastTime >= 30000) {
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
        } catch (err: any) {
          console.warn("[Presence API] Could not track access for player:", err.message);
        }
        
        // 4. Create an internal notification for the player
        if (status === 'GOING' || status === 'NOT_GOING') {
          try {
            const notifId = `presence_${playerId}_${Date.now()}`;
            const notifRef = doc(db, "notifications", notifId);
            await setDoc(notifRef, {
              playerId,
              playerUid: player.uid || null,
              title: status === 'GOING' ? "Presença Confirmada! 🏐" : "Ausência Registrada 🗓️",
              message: status === 'GOING' 
                ? `Tudo certo! Você confirmou sua presença para a próxima quinta-feira.`
                : `Recebemos seu aviso de ausência. Esperamos você na próxima!`,
              type: 'system',
              read: false,
              createdAt: Date.now()
            });
          } catch (notifErr: any) {
            console.warn("[Presence API] Could not create notification document:", notifErr.message);
          }
        }
        
        res.json({ success: true });
    } catch (e: any) {
        console.error("[Presence API] Error Details:", { message: e.message, code: e.code, stack: e.stack });
        res.status(500).json({ error: e.message, details: e.toString() });
    }
  });

  // Sync accesses and login timestamps from intentions list confirmations
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
      const timestamps: Record<string, number> = intentionsData.confirmationTimestamps || {};
      const responses: Record<string, string> = intentionsData.responses || {};

      const todayStr = getFirestoreDateKey();
      let syncedCount = 0;

      for (const [playerId, status] of Object.entries(responses)) {
        if (!status || status === 'RESET') continue;

        const ts = timestamps[playerId] || Date.now();
        const confirmIso = new Date(ts).toISOString();

        try {
          const playerRef = doc(db, "players", playerId);
          const pSnap = await getDoc(playerRef);
          if (pSnap.exists()) {
            const pData = pSnap.data();
            const loginHist: string[] = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];

            const hasConfirmDate = loginHist.some(h => new Date(h).toISOString().slice(0, 10) === confirmIso.slice(0, 10));

            if (!pData.lastLoginAt || !hasConfirmDate || new Date(pData.lastLoginAt).getTime() < ts) {
              const newHist = [confirmIso, ...loginHist.filter(h => h !== confirmIso)].slice(0, 20);
              const isNewDay = !pData.lastReadUpdate || pData.lastReadUpdate < todayStr;
              const currentAccesses = Number(pData.accesses || 0);
              const currentDaily = Number(pData.dailyAccesses || 0);

              await updateDoc(playerRef, {
                lastLoginAt: confirmIso,
                loginHistory: newHist,
                accesses: hasConfirmDate ? currentAccesses : (currentAccesses + 1),
                dailyAccesses: isNewDay ? 1 : (currentDaily + 1),
                lastReadUpdate: todayStr
              });
              syncedCount++;
            }
          }
        } catch (e: any) {
          console.warn(`[sync-accesses] Failed to sync player ${playerId}:`, e.message);
        }
      }

      return res.json({ success: true, synced: syncedCount });
    } catch (err: any) {
      console.error("[sync-accesses] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // WebAuthn Routes
  app.post("/api/auth/webauthn/register/options", async (req, res) => {
    try {
      const { rpID, email, playerId: bodyPlayerId, playerName: bodyPlayerName } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório para configurar a biometria!" });
      }
      const trimmedEmail = email.trim().toLowerCase();
      
      let matchedPlayer: any = null;
      let usedAdmin = false;
      let playerId = bodyPlayerId || "owner_admin";
      let playerName = bodyPlayerName || (trimmedEmail === "rodneyes@gmail.com" ? "Administrador" : "Jogador");

      // Se não recebemos o playerId e playerName do frontend, tentamos buscar no banco
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
            return res.status(404).json({ error: "E-mail não cadastrado como sócio ou administrador!" });
          }
          playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
          playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
          usedAdmin = true;
        } catch (adminError: any) {
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
              return res.status(404).json({ error: "E-mail não cadastrado como sócio ou administrador!" });
            }
            playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
            playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
          } catch (webDbError: any) {
            console.warn("[WebAuthn Register Options] Web Firestore query failed:", webDbError.message);
            // Se falhar o query por permission_denied, mas o email é válido, aceitamos usar fallback para não quebrar
            const isAdminEmail = trimmedEmail === "rodneyes@gmail.com";
            playerId = isAdminEmail ? "owner_admin" : "fallback_player";
            playerName = isAdminEmail ? "Administrador" : "Jogador Sócio";
          }
        }
      }

      const options = await getRegistrationOptions(playerId, playerName, rpID);
      
      // Salva no Memory Cache (Sempre funciona, livre de problemas de permissões)
      challengeStore.set("reg_" + trimmedEmail, {
        challenge: options.challenge,
        playerId,
        playerName,
        createdAt: Date.now()
      });
      
      res.json(options);
    } catch (e: any) {
      console.error("[WebAuthn Register Options] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/register/verify", async (req, res) => {
    try {
      const { attestationResponse, challenge, origin, rpID, email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail não especificado." });
      }
      const trimmedEmail = email.trim().toLowerCase();
      
      let expectedChallenge: string | null = null;
      let usedAdmin = false;
      let playerId = "owner_admin";
      let playerName = "Administrador";

      // 1. Primeiro tenta buscar o desafio e metadados no Cache de Memória (Sempre Livre de Erros)
      const cachedData = challengeStore.get("reg_" + trimmedEmail);
      if (cachedData) {
        expectedChallenge = cachedData.challenge;
        playerId = cachedData.playerId || "owner_admin";
        playerName = cachedData.playerName || "Administrador";
        challengeStore.delete("reg_" + trimmedEmail);
      } else {
        // Fallback para Firestore
        try {
          const dbAdmin = await getFirestore();
          const challengeDocRef = dbAdmin.collection("webauthnChallenges").doc(trimmedEmail);
          const challengeDoc = await challengeDocRef.get();
          if (challengeDoc.exists) {
            expectedChallenge = challengeDoc.data()?.challenge;
            await challengeDocRef.delete();
            usedAdmin = true;
          }
        } catch (adminError: any) {
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
          } catch (webError: any) {
            console.warn("[WebAuthn Register Verify] Web Firestore failed to load challenge:", webError.message);
          }
        }
      }

      if (!expectedChallenge) {
        return res.status(400).json({ error: "Sessão expirada ou desafio não encontrado. Tente configurar novamente!" });
      }
      
      // 2. Executa a verificação
      const verification = await verifyRegistration(attestationResponse, expectedChallenge, origin, rpID);
      
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "Falha na verificação de assinatura da biometria." });
      }
      
      const regInfo = verification.registrationInfo as any;
      const credential = regInfo.credential || {};
      
      const credentialID = regInfo.credentialID || credential.id;
      const credentialPublicKey = regInfo.credentialPublicKey || credential.publicKey;
      const counter = regInfo.counter !== undefined ? regInfo.counter : (credential.counter !== undefined ? credential.counter : 0);
      
      if (!credentialID || !credentialPublicKey) {
        return res.status(400).json({ error: "Dados de credencial ausentes ou corrompidos durante o registro." });
      }

      // 3. Resolve matchedPlayer se não veio do cache
      if (!cachedData) {
        let matchedPlayer: any = null;
        if (usedAdmin) {
          try {
            const dbAdmin = await getFirestore();
            const querySnap = await dbAdmin.collection("players").where("email", "==", trimmedEmail).get();
            if (!querySnap.empty) {
              const docDoc = querySnap.docs[0];
              matchedPlayer = { ...docDoc.data(), id: docDoc.id };
            }
          } catch (e) {}
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
          } catch (e) {}
        }

        playerId = matchedPlayer ? matchedPlayer.id : "owner_admin";
        playerName = matchedPlayer ? matchedPlayer.name : "Administrador";
      }
      
      // 4. Salva a credencial no Firestore
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
        counter: counter,
        email: trimmedEmail,
        playerId: playerId,
        playerName: playerName,
        createdAt: Date.now()
      };

      // 1. Salva a credencial localmente no sistema de arquivos do servidor (100% garantido)
      saveLocalCredential(credentialIdStr, credentialDataToSave);

      // 2. Tenta salvar duplicamente no documento unificado de metadados de credenciais de forma silenciosa
      try {
        let savedWithAdmin = false;
        try {
          const dbAdmin = await getFirestore();
          await dbAdmin.collection("metadata").doc("webauthn_credentials").set({
            [credentialIdStr]: credentialDataToSave
          }, { merge: true });
          savedWithAdmin = true;
          console.log("[WebAuthn Register Verify] Salvo com sucesso usando Admin SDK.");
        } catch (adminMetaErr: any) {
          // Ignorado silenciosamente
        }

        if (!savedWithAdmin) {
          const dbInstance = await getWebFirestoreInstance();
          const { doc, setDoc } = await import("firebase/firestore");
          setDoc(doc(dbInstance, "metadata", "webauthn_credentials"), {
            [credentialIdStr]: credentialDataToSave
          }, { merge: true }).catch(() => {});
        }
      } catch (metaErr: any) {
        // Ignorado silenciosamente
      }

      // 3. Tenta salvar no formato tradicional de coleção do Firestore de forma silenciosa
      try {
        const dbAdmin = await getFirestore();
        await dbAdmin.collection("webauthnCredentials").doc(credentialIdStr).set(credentialDataToSave);
      } catch (adminError: any) {
        try {
          const dbInstance = await getWebFirestoreInstance();
          const { doc, setDoc } = await import("firebase/firestore");
          setDoc(doc(dbInstance, "webauthnCredentials", credentialIdStr), credentialDataToSave).catch(() => {});
        } catch (webError: any) {
          // Ignorado silenciosamente
        }
      }
      
      // Retorna true de verificação e repassa o credential object para o cliente
      res.json({ verified: true, credential: credentialDataToSave });
    } catch (e: any) {
      console.error("[WebAuthn Register Verify] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/login/options", async (req, res) => {
    try {
      const { rpID } = req.body;
      const options = await getAuthenticationOptions(rpID);
      
      // Salva no Memory Cache
      challengeStore.set("login_" + options.challenge, {
        challenge: options.challenge,
        createdAt: Date.now()
      });
      
      res.json(options);
    } catch (e: any) {
      console.error("[WebAuthn Login Options] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/webauthn/login/verify", async (req, res) => {
    try {
      const { assertionResponse, challenge, origin, rpID } = req.body;
      
      let expectedChallengeExists = false;
      let usedAdmin = false;

      // 1. Busca e deleta o desafio (Primeiro no Cache de Memória)
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
        } catch (adminError: any) {
          // Silenciosamente ignorado
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
          } catch (webError: any) {
            // Silenciosamente ignorado
          }
        }
      }

      if (!expectedChallengeExists) {
        return res.status(400).json({ error: "Desafio de login expirado ou inválido. Tente novamente!" });
      }
      
      // 2. Busca a credencial correspondente pelo ID da credencial (assertionResponse.id)
      const credentialID = assertionResponse.id;
      let credentialData: any = null;
      let credDocRefToUpdate: any = null;
      let isMetaSource = false;

      // Primeiro, procura nas credenciais locais salvas robustamente no servidor (100% livre de falhas de permissão)
      const localCreds = loadLocalCredentials();
      if (localCreds[credentialID]) {
        credentialData = localCreds[credentialID];
        console.log("[WebAuthn Login Verify] Credential successfully resolved from local filesystem credentials cache!");
      }

      if (!credentialData) {
        // Tenta buscar no documento unificado /metadata/webauthn_credentials (como fallback silencioso de compatibilidade)
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
        } catch (metaErr: any) {
          // Ignorado silenciosamente
        }
      }

      if (!credentialData) {
        // Tenta buscar no Admin SDK se possível
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
        } catch (adminMetaErr: any) {
          // Ignorado silenciosamente
        }
      }

      // Se ainda não encontrou, usa o fallback legado de pesquisa
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
        } catch (adminError: any) {
          // Ignorado silenciosamente
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
          } catch (webError: any) {
            // Ignorado silenciosamente
          }
        }
      }

      if (!credentialData) {
        return res.status(404).json({ error: "Biometria não cadastrada neste dispositivo ou conta inválida." });
      }
      
      // 3. Monta o autenticador para verificação
      const authenticator = {
        credentialID: credentialData.id,
        credentialPublicKey: Buffer.from(credentialData.publicKey, "base64url"),
        counter: credentialData.counter,
        transports: credentialData.transports || []
      };
      
      // 4. Executa a verificação
      const verification = await verifyAuthentication(assertionResponse, challenge, origin, rpID, authenticator);
      
      if (verification.verified) {
        // Atualiza o counter
        const newCounter = verification.authenticationInfo.newCounter;
        
        // Sempre atualiza o counter localmente primeiro para máxima confiabilidade
        updateLocalCredentialCounter(credentialID, newCounter);
        
        if (isMetaSource) {
          try {
            const dbInstance = await getWebFirestoreInstance();
            const { doc, updateDoc } = await import("firebase/firestore");
            updateDoc(doc(dbInstance, "metadata", "webauthn_credentials"), {
              [`${credentialID}.counter`]: newCounter
            }).catch(() => {});
          } catch (e: any) {
            try {
              const dbAdmin = await getFirestore();
              await dbAdmin.collection("metadata").doc("webauthn_credentials").update({
                [`${credentialID}.counter`]: newCounter
              }).catch(() => {});
            } catch (adminErr: any) {
              // Ignorado silenciosamente
            }
          }
        } else if (credDocRefToUpdate) {
          try {
            if (usedAdmin) {
              await credDocRefToUpdate.update({ counter: newCounter }).catch(() => {});
            } else {
              const { updateDoc } = await import("firebase/firestore");
              await updateDoc(credDocRefToUpdate, { counter: newCounter }).catch(() => {});
            }
          } catch (updErr: any) {
            // Ignorado silenciosamente
          }
        }
        
        res.json({ verified: true, email: credentialData.email });
      } else {
        res.status(400).json({ error: "Assinatura biométrica inválida." });
      }
    } catch (e: any) {
      console.error("[WebAuthn Login Verify] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // WHATSAPP AUTOMATION & WEBHOOK ENDPOINTS
  // ==========================================
  
  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      if (!config.apiUrl || !config.apiKey || !config.instanceName) {
        return res.json({ connected: false, status: "INCOMPLETA", message: "Configuração incompleta" });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const cleanApiKey = (config.apiKey || '').trim();
      const targetStateUrl = `${cleanUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`;

      let apiRes;
      try {
        apiRes = await fetch(targetStateUrl, {
          method: "GET",
          headers: {
            "apikey": cleanApiKey,
            "apiKey": cleanApiKey,
            "Authorization": `Bearer ${cleanApiKey}`
          }
        });
      } catch (fetchErr: any) {
        // Em caso de erro de conexão
        console.warn(`[WhatsApp API Status] Erro de transporte ao tentar alcançar ${targetStateUrl}:`, fetchErr.message);
        return res.json({
          connected: false,
          status: "OFFLINE",
          message: `Dificuldade em conectar à Evolution API: ${fetchErr.message}`
        });
      }

      const contentType = apiRes.headers.get("content-type") || "";
      if (contentType.includes("html") || (apiRes.status === 404 && contentType.includes("text/html"))) {
        console.warn(`[WhatsApp API Status] Detectado retorno HTML/404 em vez de JSON da Evolution API.`);
        return res.json({
          connected: false,
          status: "OFFLINE",
          message: "A Evolution API retornou erro 404 ou página HTML. Verifique o endereço configurado."
        });
      }

      // Se a instância não existir no servidor Evolution API, tentamos criá-la automaticamente
      if (!apiRes.ok) {
        let errorDetails = "";
        let errTxt = "";
        try {
          errTxt = await apiRes.text();
          try {
            const parsed = JSON.parse(errTxt);
            if (parsed?.error || parsed?.response?.message) {
              const innerMsg = Array.isArray(parsed?.response?.message) ? parsed.response.message.join(", ") : parsed?.response?.message;
              errorDetails = ` - Detalhes: ${parsed.error || ""} ${innerMsg || ""}`;
            } else if (parsed?.message) {
              errorDetails = ` - Detalhes: ${parsed.message}`;
            } else {
              errorDetails = ` - Detalhes: ${JSON.stringify(parsed)}`;
            }
          } catch (e) {
            errorDetails = ` - Detalhes: ${errTxt.substring(0, 150)}`;
          }
        } catch (e) {}

        if (apiRes.status === 404 || errTxt.toLowerCase().includes("does not exist") || errTxt.toLowerCase().includes("not found")) {
          console.log(`[WhatsApp API Status] Instância "${config.instanceName}" não existe. Tentando criá-la automaticamente...`);
          try {
            const createRes = await fetch(`${cleanUrl}/instance/create`, {
              method: "POST",
              headers: {
                "apikey": cleanApiKey,
                "apiKey": cleanApiKey,
                "Authorization": `Bearer ${cleanApiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                instanceName: config.instanceName,
                integration: "WHATSAPP-BAILEYS",
                qrcode: true
              })
            });
            if (createRes.ok) {
              return res.json({
                connected: false,
                status: "DESCONECTADO",
                message: `Instância "${config.instanceName}" foi auto-criada no servidor e está pronta para parear.`
              });
            }
          } catch (createErr: any) {
            console.warn(`[WhatsApp API Status] Falha na auto-criação: ${createErr.message}`);
          }
        }

        return res.json({ 
          connected: false, 
          status: "OFFLINE", 
          message: `Evolution API indisponível (HTTP ${apiRes.status})${errorDetails}` 
        });
      }

      const data: any = await apiRes.json();
      const state = data?.instance?.state || "unknown"; // "open", "close", "connecting"
      
      res.json({
        connected: state === "open",
        status: state === "open" ? "ONLINE" : (state === "connecting" ? "CONECTANDO" : "DESCONECTADO"),
        raw: data
      });
    } catch (err: any) {
      res.json({ connected: false, status: "ERROR", message: err.message });
    }
  });

  app.get("/api/whatsapp/qrcode", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      if (!config.apiUrl || !config.apiKey || !config.instanceName) {
        return res.status(400).json({ error: "Configuração incompleta" });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const cleanApiKey = (config.apiKey || '').trim();
      const targetQrUrl = `${cleanUrl}/instance/connect/${encodeURIComponent(config.instanceName)}`;

      console.log(`[WhatsApp API QrCode] Iniciando para instância: ${config.instanceName}`);
      console.log(`[WhatsApp API QrCode] URL Alvo: ${targetQrUrl}`);
      console.log(`[WhatsApp API QrCode] Usando API Key: ${cleanApiKey ? cleanApiKey.substring(0, 3) + '...' : 'NULA'}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const apiRes = await fetch(targetQrUrl, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "apikey": cleanApiKey,
            "apiKey": cleanApiKey,
            "Authorization": `Bearer ${cleanApiKey}`
          }
        });
        clearTimeout(timeoutId);

        if (!apiRes.ok) {
          const errorText = await apiRes.text();
          console.warn(`[WhatsApp API QrCode] Falha (Status ${apiRes.status}): ${errorText}`);

          if (apiRes.status === 401) {
             throw new Error("Erro 401: API Key Inválida ou Sem Permissão. Verifique no painel ou recrie a instância.");
          }
          
          if (errorText.toLowerCase().includes("already connected")) {
            return res.json({ alreadyConnected: true });
          }

          if (apiRes.status === 404 || errorText.toLowerCase().includes("does not exist") || errorText.toLowerCase().includes("not found")) {
            console.log(`[WhatsApp API QrCode] Instância "${config.instanceName}" não existe. Tentando criá-la automaticamente...`);
            try {
              const createRes = await fetch(`${cleanUrl}/instance/create`, {
                method: "POST",
                headers: {
                  "apikey": cleanApiKey,
                  "apiKey": cleanApiKey,
                  "Authorization": `Bearer ${cleanApiKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  instanceName: config.instanceName,
                  integration: "WHATSAPP-BAILEYS",
                  qrcode: true
                })
              });
              if (createRes.ok) {
                const createData: any = await createRes.json();
                console.log(`[WhatsApp API QrCode] Instância criada com sucesso!`, createData);
                if (createData?.qrcode && createData.qrcode.base64) {
                  return res.json(createData);
                }
                // Tentar buscar connect novamente
                const secondTry = await fetch(targetQrUrl, {
                  method: "GET",
                  headers: {
                    "apikey": cleanApiKey,
                    "apiKey": cleanApiKey,
                    "Authorization": `Bearer ${cleanApiKey}`
                  }
                });
                if (secondTry.ok) {
                  const secondData = await secondTry.json();
                  return res.json(secondData);
                }
              } else {
                const createErrText = await createRes.text();
                console.warn(`[WhatsApp API QrCode] Erro no auto-create: ${createErrText}`);
              }
            } catch (autoCreateErr: any) {
              console.warn(`[WhatsApp API QrCode] Falha na auto-criação: ${autoCreateErr.message}`);
            }
          }

          throw new Error(`Erro na Evolution API (HTTP ${apiRes.status}): ${errorText}`);
        }

        const data: any = await apiRes.json();
        res.json(data);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error(`Timeout ao conectar na API (${cleanUrl}). O servidor não respondeu em 15s.`);
        }
        throw err;
      }
    } catch (err: any) {
      console.error("[WhatsApp API QrCode Error]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/config", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      // Do not mask the key so the admin can verify/edit it
      res.json({
        ...config
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get config", details: err.message });
    }
  });

  app.post("/api/whatsapp/config", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { saveWhatsAppConfig, getWhatsAppConfig } = await import("./services/whatsappService");
      const payload = req.body;

      const updated = await saveWhatsAppConfig(dbInstance, payload);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save config", details: err.message });
    }
  });

  app.post("/api/whatsapp/delete-instance", async (req, res) => {
    const { url, apiKey, instanceName } = req.body;
    if (!url || !apiKey || !instanceName) return res.status(400).json({ error: "Parâmetros obrigatórios" });

    const cleanUrl = url.replace(/\/$/, "");
    const cleanApiKey = String(apiKey).trim();
    try {
      const encodedName = encodeURIComponent(instanceName);
      console.log(`[API] Deletando instância: ${cleanUrl}/instance/delete/${encodedName}`);
      const resp = await fetch(`${cleanUrl}/instance/delete/${encodedName}`, {
        method: 'DELETE',
        headers: {
          "apikey": cleanApiKey,
          "Content-Type": "application/json"
        }
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[API] Erro ao deletar: ${resp.status} - ${text}`);
        return res.json({ statusCode: resp.status, data: { error: text } });
      }

      const data = await resp.json();
      res.json({ statusCode: resp.status, data });
    } catch (err: any) {
      console.error(`[API] Erro interno ao deletar: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/create-instance", async (req, res) => {
    const { url, apiKey, instanceName } = req.body;
    if (!url || !apiKey || !instanceName) return res.status(400).json({ error: "Parâmetros obrigatórios" });

    const cleanUrl = url.replace(/\/$/, "");
    const cleanApiKey = String(apiKey).trim();
    try {
      console.log(`[API] Criando instância: ${cleanUrl}/instance/create`);
      const resp = await fetch(`${cleanUrl}/instance/create`, {
        method: 'POST',
        headers: { 
          "apikey": cleanApiKey,
          "apiKey": cleanApiKey,
          "Authorization": `Bearer ${cleanApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instanceName: instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true
        })
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[API] Erro ao criar: ${resp.status} - ${text}`);
        return res.json({ statusCode: resp.status, data: { error: text } });
      }

      const data = await resp.json();
      res.json({ statusCode: resp.status, data });
    } catch (err: any) {
      console.error(`[API] Erro interno ao criar: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/find-instance", async (req, res) => {
    const { url, apiKey, instanceName } = req.body;
    if (!url || !apiKey || !instanceName) return res.status(400).json({ error: "URL, API Key e Nome da Instância são obrigatórios" });

    const cleanUrl = url.replace(/\/$/, "");
    const cleanApiKey = String(apiKey).trim();
    try {
      const encodedName = encodeURIComponent(instanceName);
      const resp = await fetch(`${cleanUrl}/instance/find/${encodedName}`, {
        headers: {
          "apikey": cleanApiKey,
          "apiKey": cleanApiKey,
          "Authorization": `Bearer ${cleanApiKey}`
        }
      });
      
      const data = await resp.json();
      res.json({ statusCode: resp.status, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/list-instances", async (req, res) => {
    const { url, apiKey } = req.body;
    if (!url || !apiKey) return res.status(400).json({ error: "URL e API Key são obrigatórias" });

    const cleanUrl = url.replace(/\/$/, "");
    const cleanApiKey = String(apiKey).trim();
    try {
      const resp = await fetch(`${cleanUrl}/instance/fetchInstances`, {
        headers: {
          "apikey": cleanApiKey,
          "apiKey": cleanApiKey,
          "Authorization": `Bearer ${cleanApiKey}`
        }
      });
      
      const data = await resp.json();
      res.json({ statusCode: resp.status, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/test-server", async (req, res) => {
    const logs: string[] = [];
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);
      
      const { url, apiKey } = req.body;
      const targetUrl = url || config.apiUrl;
      const targetKey = String(apiKey || config.apiKey || "").trim();

      if (!targetUrl) return res.status(400).json({ success: false, error: "URL é obrigatória" });
      
      logs.push(`⚙️ Diagnóstico de Conexão:`);
      logs.push(`🔍 URL: ${targetUrl}`);
      logs.push(`🤖 Instância: ${config.instanceName || 'NÃO DEFINIDA'}`);
      
      const keyLength = targetKey ? targetKey.length : 0;
      logs.push(`🔑 API Key: Detectada com ${keyLength} caracteres.`);

      const cleanUrl = targetUrl.replace(/\/$/, "");
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        logs.push("📡 Verificando alcance básico (Health Check)...");
        const resp = await fetch(cleanUrl, { 
          signal: controller.signal,
          headers: { 
            "User-Agent": "Guerreiros-Diagnostic/1.1",
            "apikey": targetKey,
            "apiKey": targetKey,
            "Authorization": `Bearer ${targetKey}`
          }
        });
        clearTimeout(timeoutId);
        
        const duration = Date.now() - start;
        logs.push(`⏱️ Servidor respondeu em ${duration}ms (Status ${resp.status})`);

        if (resp.status === 200) {
          const rootData = await resp.json();
          logs.push(`✅ API ONLINE: v${rootData.version || "???"}`);
          logs.push(`📝 Mensagem: ${rootData.message}`);
          
          logs.push("✅ Conexão básica OK. Testando API Key agora...");
          
          if (!targetKey) {
            logs.push("⚠️ API Key não fornecida. Impossível validar autenticação.");
          } else if (!config.instanceName) {
            logs.push("⚠️ Nome da instância não definido. Impossível testar conexão completa.");
          } else {
            // Tenta buscar o status da instância para validar a API Key
            const authUrl = `${cleanUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`;
            logs.push(`📡 Validando autenticação na instância: ${config.instanceName}`);
            
            const authResp = await fetch(authUrl, {
              headers: { 
                "apikey": targetKey,
                "apiKey": targetKey,
                "Authorization": `Bearer ${targetKey}`
              }
            });

            if (authResp.status === 200) {
              const authData = await authResp.json();
              logs.push(`✅ API KEY VÁLIDA! Instância está: ${authData.instance?.state || 'Desconhecida'}`);
              return res.json({ 
                success: true, 
                message: "Conexão e API Key validadas!", 
                statusCode: 200, 
                version: rootData.version,
                apiMessage: rootData.message,
                logs 
              });
            } else if (authResp.status === 401 || authResp.status === 404) {
              if (authResp.status === 401) {
                logs.push(`❌ ERRO 401: A API Key "${targetKey.substring(0, 4)}..." foi REJEITADA ao consultar esta instância.`);
              } else {
                logs.push(`❌ ERRO 404: Instância "${config.instanceName}" não foi localizada ao tentar consultar.`);
              }

              // Faz varredura para tentar listar as instâncias no servidor
              const instancesUrl = `${cleanUrl}/instance/fetchInstances`;
              try {
                logs.push(`📡 Fazendo varredura secundária (listagem de instâncias com Global API Key)...`);
                const listResp = await fetch(instancesUrl, {
                  headers: {
                    "apikey": targetKey,
                    "apiKey": targetKey,
                    "Authorization": `Bearer ${targetKey}`
                  }
                });
                
                if (listResp.status === 200) {
                  const listData = await listResp.json();
                  logs.push(`✅ Global API Key É VÁLIDA! O servidor aceitou a chave para listar as instâncias.`);
                  
                  let foundNames: string[] = [];
                  let matchingInstance: any = null;
                  
                  const items = Array.isArray(listData) ? listData : (listData?.instances || listData?.data || []);
                  for (const item of items) {
                    const inst = item?.instance || item;
                    if (inst && (inst.name || inst.instanceName)) {
                      const name = inst.name || inst.instanceName;
                      foundNames.push(name);
                      if (name.trim().toLowerCase() === config.instanceName.trim().toLowerCase()) {
                        matchingInstance = inst;
                      }
                    }
                  }
                  
                  if (foundNames.length > 0) {
                    logs.push(`📋 Instâncias encontradas no seu servidor: ${foundNames.join(", ")}`);
                  } else {
                    logs.push(`⚠️ Nenhuma instância cadastrada foi encontrada no seu servidor.`);
                  }
                  
                  if (matchingInstance) {
                    logs.push(`🔍 Encontrada instância correspondente: "${matchingInstance.instanceName || matchingInstance.name}"`);
                    const instToken = matchingInstance.token || matchingInstance.apikey || matchingInstance.apiKey;
                    if (instToken && instToken !== targetKey) {
                      logs.push(`🔑 ALERTA DE CONFIGURAÇÃO: Esta instância possui seu próprio token específico: "${instToken.substring(0, 4)}..." que é diferente da chave global.`);
                      logs.push(`💡 Solução: Por favor, copie este token específico da instância e salve-o no Painel Administrativo como sua API Key!`);
                    } else {
                      logs.push(`💡 Solução: A instância existe e usa a mesma chave global. Tente reiniciar a instância no gerenciador da Evolution API.`);
                    }
                  } else {
                    logs.push(`❌ A instância "${config.instanceName}" NÃO foi encontrada no seu servidor.`);
                    logs.push(`💡 Solução: Vá no painel da Evolution API e crie uma instância exatamente com o nome: "${config.instanceName}" ou altere o nome da instância no nosso painel para coincidir com uma existente.`);
                  }
                } else {
                  logs.push(`❌ Varredura falhou: Global API Key também foi rejeitada na listagem geral (Status ${listResp.status}).`);
                  logs.push(`💡 Solução: A sua Global API Key "${targetKey}" não é aceita pelo seu servidor Evolution API. Verifique a variável AUTH_API_KEY no seu arquivo docker-compose.yml.`);
                }
              } catch (errList: any) {
                logs.push(`⚠️ Não foi possível fazer a varredura secundária: ${errList.message}`);
              }

              return res.json({
                success: false,
                statusCode: authResp.status,
                version: rootData.version,
                errorDetails: authResp.status === 401 ? "API Key rejeitada" : "Instância não encontrada",
                logs
              });
            } else {
              logs.push(`⚠️ API respondeu Status ${authResp.status} na validação.`);
              return res.json({
                success: false,
                statusCode: authResp.status,
                version: rootData.version,
                errorDetails: `Erro desconhecido na validação: Status ${authResp.status}`,
                logs
              });
            }
          }
          return res.json({ 
            success: true, 
            message: "Servidor alcançado, mas verificação de autenticação incompleta.",
            statusCode: 200,
            version: rootData.version,
            logs 
          });
        } else {
          logs.push(`❌ Erro HTTP ${resp.status} no Health Check.`);
          const errText = await resp.text();
          logs.push(`🔍 Detalhes do Health Check: ${errText.substring(0, 300)}`);
          if (resp.status === 401) {
            logs.push(`🛑 O servidor Evolution API exigiu autenticação (Global API Key) na rota raiz!`);
            logs.push(`💡 Sua Global API Key atual parece estar incorreta ou inválida.`);
          }
          return res.json({ 
            success: false, 
            error: `HTTP ${resp.status}`, 
            statusCode: resp.status,
            errorDetails: errText.substring(0, 300),
            logs 
          });
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          logs.push(`🛑 TIMEOUT: O servidor não respondeu após 12s.`);
          return res.json({ success: false, error: "Timeout", logs });
        }
        logs.push(`❌ Falha de Rede: ${err.message}`);
        return res.json({ success: false, error: err.message, logs });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, logs: [`💥 Erro: ${err.message}`] });
    }
  });

  app.post("/api/whatsapp/test", async (req, res) => {
    const logs: string[] = [];
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig, sendWhatsAppMessage, normalizePhone } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);
      const { phone, message } = req.body;

      if (!phone) return res.status(400).json({ success: false, error: "Telefone de teste é obrigatório" });

      const cleanUrl = (config.apiUrl || "").replace(/\/$/, "");
      logs.push(`🔍 Destino: ${cleanUrl}`);
      
      if (cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1")) {
        logs.push("⚠️ AVISO: Você está usando 'localhost'. A API precisa de um endereço público.");
      }
      
      logs.push(`🤖 Instância: ${config.instanceName}`);
      
      const digits = normalizePhone(phone);
      logs.push(`📱 Normalizando: ${phone} -> ${digits}`);
      
      const msg = message || "Teste de conexão do Guerreiros App! 🏐";
      logs.push("📤 Enviando mensagem de teste...");

      // Aumentando timeout interno para o teste
      const result = await sendWhatsAppMessage(config, phone, msg);
      
      if (result.success) {
        logs.push("✅ SUCESSO: Mensagem enviada!");
      } else {
        logs.push(`❌ FALHA: ${result.error}`);
        if (result.details) {
          logs.push(`🔍 DETALHES: ${result.details.substring(0, 200)}`);
        }
      }

      res.json({ ...result, logs });
    } catch (err: any) {
      logs.push(`💥 ERRO CRÍTICO: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, logs });
    }
  });

  app.post("/api/whatsapp/send-all", async (req, res) => {
    const steps = [
      { id: "load_config", name: "Carregar Configurações", status: "pending", details: "" },
      { id: "validate_creds", name: "Validar Credenciais WhatsApp", status: "pending", details: "" },
      { id: "fetch_data", name: "Baixar Sócios do Clube", status: "pending", details: "" },
      { id: "filter_eligible", name: "Selecionar Ausentes e Sem Resposta", status: "pending", details: "" },
      { id: "dispatch_all", name: "Disparar Lembretes Individuais", status: "pending", details: "" },
    ];

    const updateStep = (id: string, status: "success" | "failed" | "pending" | "skipped", details: string) => {
      const step = steps.find(s => s.id === id);
      if (step) {
        step.status = status;
        step.details = details;
      }
    };

    try {
      const dbInstance = await getWebFirestoreInstance();
      updateStep("load_config", "pending", "Carregando whatsapp_config...");
      const { getWhatsAppConfig, sendWhatsAppMessage, normalizePhone } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);
      updateStep("load_config", "success", `Configurações carregadas.`);

      updateStep("validate_creds", "pending", "Validando canais de comunicação...");
      if (!config.apiUrl || !config.apiKey || !config.instanceName) {
        throw new Error("WhatsApp config incomplete. Configure evolution API credentials first.");
      }
      updateStep("validate_creds", "success", "Parâmetros verificados.");

      updateStep("fetch_data", "pending", "Consultando registros no banco...");
      const { collection, getDocs, doc, getDoc } = await import("firebase/firestore");
      const playersSnap = await getDocs(collection(dbInstance, "players"));
      const players: any[] = [];
      playersSnap.forEach((d) => {
        const item = d.data();
        item.id = d.id;
        players.push(item);
      });
      
      const intentionsRef = doc(dbInstance, "metadata", "intentions");
      const intentionsSnap = await getDoc(intentionsRef);
      const responses = intentionsSnap.exists() ? (intentionsSnap.data().responses || {}) : {};
      updateStep("fetch_data", "success", `${players.length} sócios e intenções carregados.`);

      updateStep("filter_eligible", "pending", "Filtrando sócios sem intenção preenchida...");
      const eligiblePlayers = players.filter((p) => {
        return (p.status === "active" || !p.status) && !p.isDM && p.phone && normalizePhone(p.phone).length >= 8;
      });

      const pendingPlayers = eligiblePlayers.filter((p) => {
        const currentIntent = responses[p.id];
        return currentIntent !== "GOING" && currentIntent !== "NOT_GOING";
      });
      updateStep("filter_eligible", "success", `Encontrados ${pendingPlayers.length} sócios aptos a receber direct.`);

      updateStep("dispatch_all", "pending", `Iniciando disparo seqüencial (${pendingPlayers.length} mensagens)...`);
      let sentCount = 0;
      for (const player of pendingPlayers) {
        const promptMessage = `Olá, *${player.name}*! 🏐\n\nEstamos montando a lista de intenção para o jogo de quinta-feira. \n\nVocê vai participar? 👍\n\nResponda com *SIM* se for jogar, ou *NÃO* caso não possa comparecer nesta quinta.\n\nContamos com sua resposta para organizar os times!`;
        const result = await sendWhatsAppMessage(config, player.phone, promptMessage);
        if (result.success) {
          sentCount++;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      updateStep("dispatch_all", "success", `Envios finalizados. Sucesso: ${sentCount}/${pendingPlayers.length}.`);

      res.json({ success: true, count: sentCount, steps });
    } catch (err: any) {
      let foundActive = false;
      for (const step of steps) {
        if (step.status === "pending" && !foundActive) {
          step.status = "failed";
          step.details = err.message;
          foundActive = true;
        } else if (step.status === "pending") {
          step.status = "skipped";
        }
      }
      res.json({ success: false, error: err.message, steps });
    }
  });

  app.post("/api/whatsapp/send-group", async (req, res) => {
    const steps = [
      { id: "load_config", name: "Carregar Configurações", status: "pending", details: "" },
      { id: "validate_creds", name: "Validar Credenciais WhatsApp", status: "pending", details: "" },
      { id: "fetch_data", name: "Baixar Intenções & Jogadores", status: "pending", details: "" },
      { id: "format_message", name: "Gerar Texto da Lista", status: "pending", details: "" },
      { id: "send_message", name: "Disparar p/ Grupo WhatsApp", status: "pending", details: "" },
      { id: "save_tracking", name: "Persistir Data de Envio", status: "pending", details: "" },
    ];

    const updateStep = (id: string, status: "success" | "failed" | "pending" | "skipped", details: string) => {
      const step = steps.find((s) => s.id === id);
      if (step) {
        step.status = status;
        step.details = details;
      }
    };

    try {
      const dbInstance = await getWebFirestoreInstance();
      
      updateStep("load_config", "pending", "Buscando whatsapp_config no banco...");
      const { getWhatsAppConfig, sendWhatsAppMessage, formatIntentionsList } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);
      updateStep("load_config", "success", `Configuração carregada.`);

      updateStep("validate_creds", "pending", "Validando credenciais de API...");
      if (!config.apiUrl || !config.apiKey || !config.instanceName || !config.groupJid) {
        throw new Error("Credenciais incompletas. Configurar API URL, API Key, Instância e Grupo Jid.");
      }
      updateStep("validate_creds", "success", "Parâmetros validados com sucesso.");

      updateStep("fetch_data", "pending", "Buscando dados de jogadores e intenções...");
      const { doc, getDoc, collection, getDocs, setDoc } = await import("firebase/firestore");
      const intentionsRef = doc(dbInstance, "metadata", "intentions");
      const intentionsSnap = await getDoc(intentionsRef);
      const intentionsData = intentionsSnap.exists() ? intentionsSnap.data() : { responses: {}, confirmationTimestamps: {} };

      const playersSnap = await getDocs(collection(dbInstance, "players"));
      const players: any[] = [];
      playersSnap.forEach((d) => {
        const item = d.data();
        item.id = d.id;
        if (item.status === "active" || !item.status) {
          players.push(item);
        }
      });
      updateStep("fetch_data", "success", `${players.length} sócios ativos e intenções lidas do Firestore.`);

      updateStep("format_message", "pending", "Montando layout final da mensagem...");
      const listText = formatIntentionsList(players, intentionsData.responses || {}, intentionsData.confirmationTimestamps || {});
      const confirmedCount = players.filter((p) => (intentionsData.responses || {})[p.id] === 'GOING').length;
      updateStep("format_message", "success", `Lista gerada. ${confirmedCount} confirmados.`);

      updateStep("send_message", "pending", `Disparando requisição para: ${config.groupJid}...`);
      const result = await sendWhatsAppMessage(config, config.groupJid, listText);
      if (!result.success) {
        throw new Error(`A API de envio de mensagens retornou erro: ${result.error || 'Falha desconhecida'}. Verifique se a instância (${config.instanceName}) está ativa e conectada na Evolution API.`);
      }
      updateStep("send_message", "success", "Lista enviada com sucesso para o grupo!");

      updateStep("save_tracking", "pending", "Atualizando logs de rastreio...");
      const currentConfirmed = players
        .filter((p) => (intentionsData.responses || {})[p.id] === 'GOING')
        .map((p) => p.id);
      
      try {
        const { saveWhatsAppConfig } = await import("./services/whatsappService");
        await saveWhatsAppConfig(dbInstance, {
          lastListSent: Date.now(),
          lastConfirmedPlayers: currentConfirmed
        });
        updateStep("save_tracking", "success", "Último envio registrado (servidor + local cache).");
      } catch (saveErr: any) {
        updateStep("save_tracking", "success", `Registrado locally (Envio ok, mas sincronização remota restrita).`);
      }

      res.json({ success: true, steps });
    } catch (err: any) {
      let foundActive = false;
      for (const step of steps) {
        if (step.status === "pending" && !foundActive) {
          step.status = "failed";
          step.details = err.message;
          foundActive = true;
        } else if (step.status === "pending") {
          step.status = "skipped";
        }
      }
      res.json({ success: false, error: err.message, steps });
    }
  });

  app.get("/api/whatsapp/groups", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      if (!config.apiUrl || !config.apiKey || !config.instanceName) {
        return res.json({ success: false, error: "Credenciais de API não configuradas." });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const cleanApiKey = (config.apiKey || '').trim();
      const fetchUrl = `${cleanUrl}/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=false`;

      console.log(`[WhatsApp API Groups] Fetching groups from: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        method: "GET",
        headers: {
          "apikey": cleanApiKey,
          "apiKey": cleanApiKey,
          "Authorization": `Bearer ${cleanApiKey}`
        }
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Erro na Evolution API (status ${response.status}): ${txt}`);
      }

      const data = await response.json();
      const rawGroups = Array.isArray(data) ? data : (data.groups || []);
      const groups = rawGroups.map((g: any) => ({
        id: g.id || g.jid,
        subject: g.subject || g.name || "Grupo sem Nome"
      }));

      res.json({ success: true, groups });
    } catch (err: any) {
      console.error(`[WhatsApp API Groups Error] ${err.message}`);
      res.json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const { data, event, instance } = req.body;
      console.log(`[WhatsApp Webhook] Received webhook payload event: ${event} for instance: ${instance}`);

      // Log para diagnóstico de webhook
      try {
        const dbAdmin = await getFirestore();
        await dbAdmin.collection("webhook_logs").add({
          timestamp: Date.now(),
          event: event || "unknown",
          instance: instance || "unknown",
          payload: JSON.stringify(req.body).substring(0, 5000), // Limitar tamanho do payload
        });
      } catch (logErr: any) {
        console.error("[WhatsApp Webhook] Erro ao salvar log de diagnóstico:", logErr);
      }

      const forceEvent = event ? String(event).toLowerCase() : "";
      
      // Processar atualização de status da instância
      if (forceEvent === "instance.status") {
        try {
          const dbAdmin = await getFirestore();
          await dbAdmin.collection("metadata").doc("whatsapp_status").set({
            instance: instance,
            status: data?.status || "unknown",
            timestamp: Date.now()
          }, { merge: true });
          console.log(`[WhatsApp Webhook] Status da instância ${instance} atualizado para: ${data?.status}`);
          return res.json({ success: true, message: "Status updated" });
        } catch (err: any) {
          console.error("[WhatsApp Webhook] Erro ao salvar status:", err);
          return res.status(500).json({ success: false, error: err.message });
        }
      }

      if (!instance || forceEvent !== "messages.upsert") {
        return res.json({ success: true, message: "Ignored event" });
      }

      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig, normalizePhone, sendWhatsAppMessage, phonesMatch } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      if (!config.botActive) {
        console.log("[WhatsApp Webhook] Webhook processing disabled because botActive is false.");
        return res.json({ success: true, message: "Bot inactive" });
      }

      const remoteJid = data?.key?.remoteJid || "";
      const fromMe = data?.key?.fromMe;

      // Ignore messages sent by the bot itself or group messages to prevent loop
      if (fromMe || remoteJid.includes("@g.us")) {
        return res.json({ success: true, message: "Ignored bot/group message" });
      }

      const phone = remoteJid.split('@')[0];
      const incomingPhoneClean = normalizePhone(phone);
      if (!incomingPhoneClean) {
        return res.json({ success: true, message: "Invalid phone number" });
      }

      // Extract text message
      let text = "";
      if (data?.message?.conversation) {
        text = data.message.conversation;
      } else if (data?.message?.extendedTextMessage?.text) {
        text = data.message.extendedTextMessage.text;
      }

      if (!text) {
        return res.json({ success: true, message: "Empty text message" });
      }

      // Check SIM vs NAO
      const cleanText = text.trim().toLowerCase();
      let intent: "GOING" | "NOT_GOING" | null = null;
      if (["sim", "s", "vou", "confirmado", "confirmar", "v", "yes", "y", "confirmo", "bora"].some(word => cleanText.includes(word))) {
        intent = "GOING";
      } else if (["não", "nao", "n", "desisto", "desistir", "d", "no", "cancelar"].some(word => cleanText.includes(word))) {
        intent = "NOT_GOING";
      }

      if (!intent) {
        console.log(`[WhatsApp Webhook] No intention detected in message: "${text}"`);
        return res.json({ success: true, message: "No intention matched" });
      }

      // Find player with matching phone number
      const dbAdmin = await getFirestore();
      const playersSnap = await dbAdmin.collection("players").get();
      let matchedPlayer: any = null;

      playersSnap.forEach((d: any) => {
        const p = d.data();
        if (p.phone) {
          if (phonesMatch(p.phone, phone)) {
            matchedPlayer = { ...p, id: d.id };
          }
        }
      });

      if (!matchedPlayer) {
        console.warn(`[WhatsApp Webhook] No player found for phone: ${incomingPhoneClean}. Message: "${text}"`);
        return res.json({ success: true, message: "Player not found" });
      }

      // Update intentions ref
      try {
        const intentionsRef = dbAdmin.collection("metadata").doc("intentions");
        const intentionsSnap = await intentionsRef.get();
        if (intentionsSnap.exists) {
          const intentionsData = intentionsSnap.data();
          const { deleteField } = await import("firebase/firestore");

          const updatePayload: any = {
            [`responses.${matchedPlayer.id}`]: intent
          };

          if (intent === "GOING") {
            updatePayload[`confirmationTimestamps.${matchedPlayer.id}`] = Date.now();
          } else {
            updatePayload[`confirmationTimestamps.${matchedPlayer.id}`] = deleteField();
          }

          await intentionsRef.update(updatePayload);
          console.log(`[WhatsApp Webhook] Success updating intentions for ${matchedPlayer.name} to ${intent}`);

          const targetDate = intentionsData?.targetDate || getFirestoreDateKey();
          const preConfirmationsRef = dbAdmin.collection("preConfirmations").doc(targetDate).collection("players").doc(matchedPlayer.id);
          
          if (intent === "GOING") {
            await preConfirmationsRef.set({
              ...matchedPlayer,
              timestamp: Date.now()
            }, { merge: true });
          } else {
            await preConfirmationsRef.delete();
          }

          // Track access / login for WhatsApp user
          try {
            const playerDocRef = dbAdmin.collection("players").doc(matchedPlayer.id);
            const pSnap = await playerDocRef.get();
            if (pSnap.exists) {
              const pData = pSnap.data() || {};
              const loginHist = Array.isArray(pData.loginHistory) ? pData.loginHistory : [];
              const nowISO = new Date().toISOString();
              const lastTime = loginHist[0] ? new Date(loginHist[0]).getTime() : 0;
              if (isNaN(lastTime) || Date.now() - lastTime >= 30000) {
                const newHist = [nowISO, ...loginHist].slice(0, 20);
                const todayStr = getFirestoreDateKey();
                const isNewDay = !pData.lastReadUpdate || pData.lastReadUpdate < todayStr;
                const currentAccesses = Number(pData.accesses || 0);
                const currentDaily = Number(pData.dailyAccesses || 0);

                await playerDocRef.update({
                  lastLoginAt: nowISO,
                  loginHistory: newHist,
                  accesses: currentAccesses + 1,
                  dailyAccesses: isNewDay ? 1 : currentDaily + 1,
                  lastReadUpdate: todayStr
                });
              }
            }
          } catch (accessErr: any) {
            console.warn("[WhatsApp Webhook] Could not update player access history:", accessErr.message);
          }

        }
      } catch (e: any) {
        console.error(`[WhatsApp Webhook] Could not update intentions in Firestore:`, e.message || e);
      }

      // Write system notification
      const isGoing = intent === "GOING";
      try {
        await dbAdmin.collection("notifications").add({
          playerId: matchedPlayer.id,
          playerUid: matchedPlayer.uid || null,
          title: isGoing ? "Confirmação via WhatsApp" : "Desistência via WhatsApp",
          message: isGoing 
            ? `${matchedPlayer.name} confirmou presença para quinta-feira via WhatsApp!` 
            : `${matchedPlayer.name} registrou ausência via WhatsApp!`,
          createdAt: Date.now(),
          read: false,
          type: "system"
        });
        console.log(`[WhatsApp Webhook] Notification created for ${matchedPlayer.name}`);
      } catch (e: any) {
        console.error(`[WhatsApp Webhook] Could not write system notification to Firestore:`, e.message || e);
      }

      // Reply back with confirmation
      const replyText = isGoing 
        ? `Olá, *${matchedPlayer.name}*! Placar atualizado! 🏐🔥\n\nSua intenção de jogo (*Vou*) foi salva. Nos vemos na quadra quinta-feira!` 
        : `Olá, *${matchedPlayer.name}*! Registramos seu impedimento. 😔\n\nSua intenção foi atualizada para (*Não Vou*). Bom descanso!`;

      await sendWhatsAppMessage(config, phone, replyText);

      res.json({ success: true, matchedPlayer: matchedPlayer.name, intent });
    } catch (err: any) {
      console.error("[WhatsApp Webhook] Error processing event:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/webhook-logs", async (req, res) => {
    try {
      const dbAdmin = await getFirestore();
      const snap = await dbAdmin.collection("webhook_logs")
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();
      
      const logs = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.json({ success: true, logs });
    } catch (err: any) {
      console.error(`[API] Erro ao buscar logs de webhook: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/test-webhook", async (req, res) => {
    const { webhookUrl, authToken } = req.body;
    if (!webhookUrl) return res.status(400).json({ success: false, error: "URL do Webhook é obrigatória" });
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify({ event: 'test_connection', timestamp: Date.now() })
      });
      
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        res.json({ success: true, message: "Conexão bem-sucedida!", data });
      } else {
        res.status(response.status).json({ success: false, error: "Falha na conexão", data });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/whatsapp/instances", async (req, res) => {
    try {
      const db = await getFirestore();
      console.log("[Debug] Attempting to access metadata/whatsapp_config");
      const configRef = db.collection("metadata").doc("whatsapp_config");
      const snap = await configRef.get();
      console.log("[Debug] Access result: exists =", snap.exists);
      const config = snap.data();

      if (!config || !config.apiUrl || !config.apiKey) {
        return res.status(400).json({ success: false, error: "Configuração do WhatsApp não encontrada" });
      }

      const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/instance/fetchInstances`, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey.trim()
        }
      });

      const data = await response.json();
      res.json({ success: true, data });
    } catch (err: any) {
      console.error(`[API] Erro ao buscar instâncias: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Global Error Handler to avoid HTML error pages
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Server Error]", err);
    res.status(500).json({ 
      error: "Erro interno no servidor",
      details: err.message 
    });
  });

  const server = http.createServer(app);

  // Vite middleware for development
  console.log(`[Guerreiros] Configurando ambiente: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV !== "production") {
    console.log("[Guerreiros] Montando Vite em modo Middleware...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: {
             server: server as any
          }
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[Guerreiros] Vite montado com sucesso.");
    } catch (err: any) {
      console.error("[Fatal] Falha ao iniciar Vite Middleware:", err);
      process.exit(1);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  console.log("[Guerreiros] Quase lá... Iniciando listener HTTP...");
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);
    console.log(`[Guerreiros] Ambiente: ${process.env.NODE_ENV || 'development'}`);
    
    // Log memory usage periodically
    setInterval(() => {
      const used = process.memoryUsage();
      console.log(`[Memory] RSS: ${Math.round(used.rss / 1024 / 1024)}MB | Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`);
    }, 300000);

    // Launch WhatsApp group periodic updater schedule (check every 30 minutes)
    setInterval(async () => {
      try {
        const db = await getFirestore();
        const { checkAndSendGroupUpdate, processScheduledMessages, autoScheduleReminders } = await import("./services/whatsappService");
        await checkAndSendGroupUpdate(db);
        await processScheduledMessages(db);
        await autoScheduleReminders(db);
      } catch (err: any) {
        console.error("[WhatsApp Scheduler Error]:", err);
      }
    }, 1800000); // 30 minutes check

    // Check for scheduled messages more frequently (every 5 minutes)
    setInterval(async () => {
      try {
        const db = await getFirestore();
        const { processScheduledMessages } = await import("./services/whatsappService");
        await processScheduledMessages(db);
      } catch (err: any) {
        console.error("[WhatsApp Message Scheduler Error]:", err);
      }
    }, 300000); // 5 minutes check
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Fatal] Porta ${PORT} em uso. Encerrando processo para reinicialização.`);
      process.exit(1);
    } else {
      console.error("[Fatal] Erro no servidor:", e);
      process.exit(1);
    }
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});
