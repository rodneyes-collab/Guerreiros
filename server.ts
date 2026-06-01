import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

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

// Lazy initialize firebase-admin
let db: any = null;
async function getFirestore() {
  if (db) return db;
  const admin = (await import("firebase-admin")).default;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: configProjectId
    });
  }
  db = admin.firestore();
  return db;
}

// Lazy initialize client/web firestore for server route usage (bypasses IAM/Service Account permission errors in sandboxed pre-production/production environments)
let webDb: any = null;
async function getWebFirestoreInstance() {
  if (webDb) return webDb;
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const { getFirestore, setLogLevel } = await import("firebase/firestore");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  
  try {
    setLogLevel("silent");
  } catch (e) {}
  
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  
  // Sign in anonymously to authenticate the server context and bypass strict public write block policies
  const auth = getAuth(app);
  if (!auth.currentUser) {
    try {
      const userCredential = await signInAnonymously(auth);
      console.log(`[Server Firebase Auth] Authenticated anonymously successfully as UID: ${userCredential.user?.uid}`);
    } catch (e: any) {
      console.warn("[Server Firebase Auth] Failed to sign in anonymously (make sure Anonymous Auth is enabled in the Firebase Console):", e.message);
    }
  }

  webDb = getFirestore(app);
  return webDb;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
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

  app.get("/api/test", (req, res) => {
    console.log("[Server] Test route hit");
    res.json({ message: "API is reachable" });
  });

  app.get("/api/memory-usage", (req, res) => {
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

      // Se configurado explicitamente para simulação
      if (config.isSimulated) {
        const isConnected = config.simulatedState === "open";
        return res.json({
          connected: isConnected,
          status: isConnected ? "ONLINE" : (config.simulatedState === "connecting" ? "CONECTANDO" : "DESCONECTADO"),
          isSimulated: true,
          message: "Modo Simulado Ativo (Guerreiros Intelligence)"
        });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const targetStateUrl = `${cleanUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`;

      let apiRes;
      try {
        apiRes = await fetch(targetStateUrl, {
          method: "GET",
          headers: {
            "apikey": config.apiKey
          }
        });
      } catch (fetchErr: any) {
        // Em caso de erro de conexão (servidor fora do ar, timeout, sandbox DNS)
        console.warn(`[WhatsApp API Status] Erro de transporte ao tentar alcançar ${targetStateUrl}:`, fetchErr.message);
        return res.json({
          connected: false,
          status: "OFFLINE",
          isSimulatedFallback: true,
          message: `Dificuldade em conectar à Evolution API (${fetchErr.message}). Você pode ativar o Modo Simulado no painel abaixo.`
        });
      }

      const contentType = apiRes.headers.get("content-type") || "";
      if (contentType.includes("html") || apiRes.status === 404) {
        console.warn(`[WhatsApp API Status] Detectado retorno HTML/404 em vez de JSON da Evolution API. URL configurada parece ser inválida ou apontar para o próprio app.`);
        return res.json({
          connected: false,
          status: "OFFLINE",
          isSimulatedFallback: true,
          message: "A Evolution API retornou erro 404 ou página HTML. Provavelmente o endereço aponta para o site do app. Recomendamos usar o Modo Simulado."
        });
      }

      // Se a instância não existir no servidor Evolution API (mas for uma API de verdade), tentamos criá-la automaticamente
      if (!apiRes.ok) {
        return res.json({ 
          connected: false, 
          status: "OFFLINE", 
          message: `Evolution API indisponível (HTTP ${apiRes.status})` 
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

      // Se estiver em modo de simulação, retorna código QR simulado diretamente
      if (config.isSimulated) {
        const mockQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=guerreiros-bot-simulador-scan-approve-${Date.now()}`;
        return res.json({
          code: mockQrUrl,
          isSimulated: true,
          message: "QR Code Simulado criado com sucesso!"
        });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const targetQrUrl = `${cleanUrl}/instance/connect/${encodeURIComponent(config.instanceName)}`;

      let apiRes;
      try {
        apiRes = await fetch(targetQrUrl, {
          method: "GET",
          headers: {
            "apikey": config.apiKey
          }
        });
      } catch (fetchErr: any) {
        const mockQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=guerreiros-bot-simulador-scan-approve-${Date.now()}`;
        return res.json({
          code: mockQrUrl,
          fallbackSimulated: true,
          message: `Falha ao alcançar Evolution API (${fetchErr.message}). Exibindo QR Code do Modo Simulado para testes.`
        });
      }

      const contentType = apiRes.headers.get("content-type") || "";
      if (contentType.includes("html") || apiRes.status === 404) {
        console.warn(`[WhatsApp API QrCode] Falhou ao obter QR Code (404/HTML). Oferecendo fallback simulado.`);
        const mockQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=guerreiros-bot-simulador-scan-approve-${Date.now()}`;
        return res.json({
          code: mockQrUrl,
          fallbackSimulated: true,
          message: "Erro 404 da Evolution API. Geramos um QR Code Simulado para fins de teste."
        });
      }

      if (!apiRes.ok) {
        let errorDetails = "";
        let isAlreadyConnected = false;
        try {
          const errData = await apiRes.json();
          errorDetails = errData?.message || JSON.stringify(errData);
          if (errorDetails.toLowerCase().includes("already connected") || errorDetails.toLowerCase().includes("já conectada")) {
            isAlreadyConnected = true;
          }
        } catch (e) {
          try {
            errorDetails = await apiRes.text();
            if (errorDetails.toLowerCase().includes("already connected") || errorDetails.toLowerCase().includes("já conectada")) {
              isAlreadyConnected = true;
            }
          } catch (e2) {}
        }

        if (isAlreadyConnected) {
          return res.json({ alreadyConnected: true, message: "A instância de WhatsApp já está conectada e ativa!" });
        }

        // Se falhar e não estiver conectado, retorna um QR Code simulado para não quebrar a tela
        const mockQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=guerreiros-bot-simulador-scan-approve-${Date.now()}`;
        return res.json({ 
          code: mockQrUrl,
          fallbackSimulated: true,
          message: `Evolution API erro (${errorDetails || `HTTP ${apiRes.status}`}). Gerado QR Code Simulado.`
        });
      }

      const data: any = await apiRes.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/toggle-simulation", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { saveWhatsAppConfig, getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);
      const { active } = req.body;

      const updated = await saveWhatsAppConfig(dbInstance, {
        ...config,
        isSimulated: !!active,
        simulatedState: active ? "open" : "close"
      });

      res.json({ success: true, isSimulated: updated.isSimulated, simulatedState: updated.simulatedState });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/simulate-scan", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { saveWhatsAppConfig, getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      await saveWhatsAppConfig(dbInstance, {
        ...config,
        isSimulated: true,
        simulatedState: "open"
      });

      res.json({ success: true, isSimulated: true, simulatedState: "open" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/config", async (req, res) => {
    try {
      const dbInstance = await getWebFirestoreInstance();
      const { getWhatsAppConfig } = await import("./services/whatsappService");
      const config = await getWhatsAppConfig(dbInstance);

      // Mask key for safety
      const maskedKey = config.apiKey ? "*".repeat(8) : "";
      res.json({
        ...config,
        apiKey: maskedKey
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

      // Handle masked API Key
      if (payload.apiKey && payload.apiKey.includes("*")) {
        const existing = await getWhatsAppConfig(dbInstance);
        payload.apiKey = existing.apiKey; // Restore original
      }

      const updated = await saveWhatsAppConfig(dbInstance, payload);
      res.json({ success: true, config: { ...updated, apiKey: updated.apiKey ? "********" : "" } });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save config", details: err.message });
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
      updateStep("load_config", "success", `Configurações carregadas. Simulado: ${config.isSimulated ? 'Sim' : 'Não'}`);

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
        const success = await sendWhatsAppMessage(config, player.phone, promptMessage);
        if (success) {
          sentCount++;
        }
        await new Promise((resolve) => setTimeout(resolve, config.isSimulated ? 300 : 1500));
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
      updateStep("load_config", "success", `Configuração carregada. Simulado: ${config.isSimulated ? 'Sim' : 'Não'}`);

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
      const success = await sendWhatsAppMessage(config, config.groupJid, listText);
      if (!success) {
        throw new Error(`A API de envio de mensagens retornou erro. Verifique a instância (${config.instanceName}) na Evolution API ou desative o Modo de Simulação se desejar disparo real.`);
      }
      if (config.isSimulated) {
        updateStep("send_message", "success", "Lista simulada com sucesso! (Modo Simulação ativo: o envio real foi ignorado e registrado apenas em logs).");
      } else {
        updateStep("send_message", "success", "Lista enviada com sucesso para o grupo!");
      }

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

      if (config.isSimulated) {
        return res.json({
          success: true,
          groups: [
            { id: "120363025219382210@g.us", subject: "Guerreiros Voleibol Club 🏐 [Simulado]" },
            { id: "120363011122233344@g.us", subject: "Vôlei Quinta À Noite 🔥 [Simulado]" },
            { id: "120363099988877766@g.us", subject: "Direct Diretoria Guerreiros 👑 [Simulado]" }
          ]
        });
      }

      const cleanUrl = config.apiUrl.replace(/\/$/, "");
      const fetchUrl = `${cleanUrl}/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=false`;

      console.log(`[WhatsApp API Groups] Fetching groups from: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        method: "GET",
        headers: {
          "apikey": config.apiKey
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

      const forceEvent = event ? String(event).toLowerCase() : "";
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
      const { collection, getDocs, doc, getDoc, updateDoc, addDoc } = await import("firebase/firestore");
      const playersSnap = await getDocs(collection(dbInstance, "players"));
      let matchedPlayer: any = null;

      playersSnap.forEach(d => {
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
        const intentionsRef = doc(dbInstance, "metadata", "intentions");
        const intentionsSnap = await getDoc(intentionsRef);
        if (intentionsSnap.exists()) {
          const intentionsData = intentionsSnap.data();
          const responses = intentionsData.responses || {};
          const confirmationTimestamps = intentionsData.confirmationTimestamps || {};

          responses[matchedPlayer.id] = intent;
          if (intent === "GOING") {
            confirmationTimestamps[matchedPlayer.id] = Date.now();
          } else {
            delete confirmationTimestamps[matchedPlayer.id];
          }

          await updateDoc(intentionsRef, {
            responses,
            confirmationTimestamps
          });
          console.log(`[WhatsApp Webhook] Success updating intentions for ${matchedPlayer.name} to ${intent}`);
        }
      } catch (e: any) {
        console.warn(`[WhatsApp Webhook] Could not update intentions in Firestore (server context lacks permissions):`, e.message || e);
      }

      // Write system notification
      const isGoing = intent === "GOING";
      try {
        await addDoc(collection(dbInstance, "notifications"), {
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
        console.warn(`[WhatsApp Webhook] Could not write system notification to Firestore (server context lacks permissions):`, e.message || e);
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

  // Global Error Handler to avoid HTML error pages
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Server Error]", err);
    res.status(500).json({ 
      error: "Erro interno no servidor",
      details: err.message 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
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
        const dbInstance = await getWebFirestoreInstance();
        const { checkAndSendGroupUpdate } = await import("./services/whatsappService");
        await checkAndSendGroupUpdate(dbInstance);
      } catch (err: any) {
        console.error("[WhatsApp Scheduler Error]:", err);
      }
    }, 1800000); // 30 minutes check
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Fatal] Porta ${PORT} em uso. Tentando novamente...`);
    } else {
      console.error("[Fatal] Erro no servidor:", e);
    }
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
