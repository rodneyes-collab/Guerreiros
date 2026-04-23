import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MetricServiceClient } from "@google-cloud/monitoring";
import { CloudBillingClient } from "@google-cloud/billing";
import { GoogleAuth } from "google-auth-library";
import admin from "firebase-admin";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FORÇAR O AMBIENTE A USAR O PROJETO DO USUÁRIO
// Isso evita que o Google tente usar o projeto interno da infraestrutura
process.env.GOOGLE_CLOUD_PROJECT = "volleyclub-manager";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "volleyclub-manager";

// Inicializar Firebase Admin
// No Cloud Run, ele usará as credenciais padrão automaticamente
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "volleyclub-manager"
  });
}
const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    console.log("[Server] Health check requested");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/test", (req, res) => {
    console.log("[Server] Test route hit");
    res.json({ message: "API is reachable" });
  });

// Rota para debug de identidade (apenas para verificação)
app.get("/api/debug-identity", async (req, res) => {
  try {
    const { GoogleAuth } = require("google-auth-library");
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
  const projectId = "volleyclub-manager";
  const targetDateStr = req.query.date as string;
  
  try {
    const auth = new GoogleAuth();
    let serviceAccountEmail = "rodneyes@gmail.com";
    try {
      // Tenta obter o e-mail real da conta de serviço via servidor de metadados (Cloud Run)
      const client = await auth.getClient();
      serviceAccountEmail = (client as any).email || (client as any).client_email || "rodneyes@gmail.com";
      
      // Fallback para metadados se não encontrado no cliente
      if (serviceAccountEmail === "rodneyes@gmail.com") {
        const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
        const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } }).catch(() => null);
        if (metadataResp?.ok) {
          serviceAccountEmail = await metadataResp.text();
        }
      }
    } catch (e) {
      console.warn("[Server] Falha ao descobrir e-mail da SA:", e);
    }
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let projectId = "volleyclub-manager";
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.projectId) projectId = config.projectId;
    } catch (e) {}

    console.log(`[Server] Buscando métricas para o projeto: ${projectId} | Identidade ativa: ${serviceAccountEmail}`);

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
        });
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
        });
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
        });
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
      const auth = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const authClient = await auth.getClient();
        serviceAccountEmail = (authClient as any).email || (authClient as any).client_email || "rodneyes@gmail.com";
        
        if (serviceAccountEmail === "rodneyes@gmail.com") {
          const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
          const metadataResp = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } }).catch(() => null);
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
        projectId: projectId || "desconhecido"
      });
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Guerreiros] Servidor Ativado na porta ${PORT}`);
    console.log(`[Guerreiros] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Fatal] Porta ${PORT} em uso. Tentando novamente...`);
    } else {
      console.error("[Fatal] Erro no servidor:", e);
    }
  });

  // --- AUTOMATION: LEMBRETES DE INTENÇÃO 100% AUTOMÁTICOS ---
  // Executa de hora em hora (no minuto 0)
  cron.schedule('0 * * * *', async () => {
    console.log('[Automation] Verificando se é hora de enviar lembretes...');
    
    try {
      // Ajuste para Fuso de Brasília (UTC-3)
      const now = new Date();
      const brOffset = -3;
      const brTime = new Date(now.getTime() + brOffset * 3600 * 1000);
      
      const day = brTime.getUTCDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui
      const hour = brTime.getUTCHours();
      
      let reminderKey = '';
      if (day === 3) { // Quarta
        if (hour === 10) reminderKey = 'wed_1';
        else if (hour === 19) reminderKey = 'wed_2';
      } else if (day === 4) { // Quinta
        if (hour === 9) reminderKey = 'thu_1';
        else if (hour === 13) reminderKey = 'thu_2';
        else if (hour === 16) reminderKey = 'thu_3';
      }

      if (!reminderKey) return;

      const intentionsRef = db.doc('metadata/intentions');
      const intentionsSnap = await intentionsRef.get();
      if (!intentionsSnap.exists) return;

      const intentions = intentionsSnap.data() as any;
      if (!intentions.automationEnabled) {
        console.log('[Automation] Automação desativada pelo usuário.');
        return;
      }

      // Evita duplicidade se já foi enviado naquela janela
      if (intentions.remindersSent && intentions.remindersSent[reminderKey]) {
        console.log(`[Automation] Lembrete '${reminderKey}' já foi enviado hoje.`);
        return;
      }

      console.log(`[Automation] Iniciando envio do lembrete: ${reminderKey}`);

      // 1. Marcar como enviado imediatamente para evitar race condition
      await intentionsRef.update({
        [`remindersSent.${reminderKey}`]: true
      });

      // 2. Coletar dados necessários
      const playersSnap = await db.collection('players').where('status', '==', 'active').get();
      const attendanceSnap = await db.collection('attendance').get();
      
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const attendanceIds = attendanceSnap.docs.map(d => d.id);
      const responses = intentions.responses || {};

      let sentCount = 0;
      const batch = db.batch();

      for (const player of players) {
        const hasResponded = responses[player.id] === 'GOING' || responses[player.id] === 'NOT_GOING';
        const isInAttendance = attendanceIds.includes(player.id);

        if (!hasResponded && !isInAttendance) {
          const appLink = "https://volleyclub-manager.web.app?tab=intentions";
          const message = `E aí Guerreiro(a), vai jogar nesta Quinta? Confirme no app: ${appLink} ou no grupo do WhatsApp.`;

          // In-app Notification
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, {
            playerId: player.id,
            title: 'Aviso de Presença',
            message: message,
            createdAt: Date.now(),
            read: false,
            type: 'reminder'
          });

          // FCM (Push)
          if (player.fcmToken) {
            const fcmRef = db.collection('fcm_messages').doc();
            batch.set(fcmRef, {
              token: player.fcmToken,
              notification: {
                title: 'Aviso de Presença',
                body: message
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
          sentCount++;
        }
      }

      if (sentCount > 0) {
        await batch.commit();
        console.log(`[Automation] ${sentCount} lembretes enviados com sucesso.`);
      } else {
        console.log('[Automation] Nenhum jogador pendente de confirmação.');
      }

    } catch (err) {
      console.error('[Automation] Erro na rotina automática:', err);
    }
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
