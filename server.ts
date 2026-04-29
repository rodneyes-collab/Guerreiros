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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Forçar o ambiente a usar o projeto do usuário se disponível
let configProjectId = "volleyclub-manager";
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.projectId) configProjectId = config.projectId;
  }
} catch (e) {
  console.warn("[Server] Falha ao ler config for project ID:", e);
}

process.env.GOOGLE_CLOUD_PROJECT = configProjectId;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = configProjectId;

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: configProjectId
  });
}
const db = admin.firestore();

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
      await db.collection("test").doc("connection").get();
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
let globalAuth: GoogleAuth | null = null;
let globalMetricsClient: MetricServiceClient | null = null;

app.get("/api/billing/real-time", async (req, res) => {
  const targetDateStr = req.query.date as string;
  
  try {
    if (!globalAuth) globalAuth = new GoogleAuth();
    let serviceAccountEmail = "rodneyes@gmail.com";
    try {
      // Tenta obter o e-mail real da conta de serviço via servidor de metadados (Cloud Run)
      const client = await globalAuth.getClient();
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

    if (!globalMetricsClient) globalMetricsClient = new MetricServiceClient();
    const metricsClient = globalMetricsClient;
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
      if (!globalAuth) globalAuth = new GoogleAuth();
      let serviceAccountEmail = "rodneyes@gmail.com";
      try {
        const authClient = await globalAuth.getClient();
        serviceAccountEmail = (authClient as any).email || (authClient as any).client_email || "rodneyes@gmail.com";
        
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

  // --- CRON ENDPOINTS PARA CLOUD SCHEDULER ---
  // Rota para Lembretes de Intenção (Agendar no Scheduler para: 0 * * * *)
  app.all('/api/crons/intentions', async (req, res) => {
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

      if (!reminderKey) {
        return res.json({ status: "skipped", reason: "Fora do horário de lembrete" });
      }

      const intentionsRef = db.doc('metadata/intentions');
      const intentionsSnap = await intentionsRef.get();
      if (!intentionsSnap.exists) {
        return res.json({ status: "skipped", reason: "Sem metadados" });
      }

      const intentions = intentionsSnap.data() as any;
      if (!intentions.automationEnabled) {
        console.log('[Automation] Automação desativada pelo usuário.');
        return res.json({ status: "skipped", reason: "Automação desativada" });
      }

      // Evita duplicidade se já foi enviado naquela janela
      if (intentions.remindersSent && intentions.remindersSent[reminderKey]) {
        console.log(`[Automation] Lembrete '${reminderKey}' já foi enviado hoje.`);
        return res.json({ status: "skipped", reason: "Já enviado" });
      }

      console.log(`[Automation] Iniciando envio do lembrete: ${reminderKey}`);
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(now);

      // 1. Marcar como enviado imediatamente para evitar race condition
      await intentionsRef.update({
        [`remindersSent.${reminderKey}`]: true
      });

      // 2. Coletar dados necessários
      console.log('[Automation] Buscando jogadores ativos...');
      const playersSnap = await db.collection('players').where('status', '==', 'active').get();
      
      console.log(`[Automation] Buscando presença para hoje (${dateKey})...`);
      const attendanceSnap = await db.collection('attendance').doc(dateKey).collection('players').get();
      
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const attendanceIds = new Set(attendanceSnap.docs.map(d => d.id));
      const responses = intentions.responses || {};

      let sentCount = 0;
      const batch = db.batch();

      for (const player of players) {
        const hasResponded = responses[player.id] === 'GOING' || responses[player.id] === 'NOT_GOING';
        const isInAttendance = attendanceIds.has(player.id);

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
          if (player.fcmToken && player.pushEnabled !== false) {
            // Count unread (including the one we just added)
            let unreadCount = 1;
            try {
              const unreadSnap = await db.collection('notifications')
                .where('playerId', '==', player.id)
                .where('read', '==', false)
                .get();
              unreadCount = unreadSnap.size + 1;
            } catch (pErr) {
              console.error(`Erro ao contar unread para ${player.id}:`, pErr);
            }

            const fcmRef = db.collection('fcm_messages').doc();
            batch.set(fcmRef, {
              token: player.fcmToken,
              notification: {
                title: 'Aviso de Presença',
                body: message,
                sound: 'default'
              },
              data: {
                unreadCount: String(unreadCount),
                type: 'reminder'
              },
              android: {
                notification: {
                  sound: 'default'
                }
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'default'
                  }
                }
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
      
      return res.json({ status: "success", sentCount });

    } catch (err) {
      console.error('[Automation] Erro na rotina automática:', err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Rota para Aniversários (Agendar no Scheduler para: 0 9 * * *)
  app.all('/api/crons/birthdays', async (req, res) => {
    console.log('[Automation] Verificando aniversariantes do dia...');
    try {
      const now = new Date();
      const brOffset = -3;
      const brTime = new Date(now.getTime() + brOffset * 3600 * 1000);
      const currentMonth = String(brTime.getUTCMonth() + 1).padStart(2, '0');
      const currentDay = String(brTime.getUTCDate()).padStart(2, '0');
      const todayKey = `${currentMonth}-${currentDay}`;

      // Otimização de Custo (Leitura Indexada): ler apenas o documento metadata/system antes de ler 30-50 players
      const metadataDoc = await db.collection('metadata').doc('system').get();
      const metadata = metadataDoc.data();
      
      if (metadata?.enableAutoBirthdays === false) {
        console.log('[Automation] Mensagens automáticas de aniversário estão desabilitadas pelo administrador.');
        return res.json({ status: "skipped", reason: "Disabled" });
      }

      const activeBirthdaysIndex: string[] = metadata?.activeBirthdaysIndex || [];

      if (!activeBirthdaysIndex.includes(todayKey)) {
        console.log(`[Automation] Nenhum sócio faz aniversário hoje (${todayKey}). Leitura de usuários poupada.`);
        return res.json({ status: "skipped", reason: "No birthdays" });
      }

      console.log(`[Automation] Aniversário(s) detectado(s) para (${todayKey}) no índice. Processando leitura dos sócios.`);

      const playersSnap = await db.collection('players').where('status', '==', 'active').get();
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      const birthdayBoys = players.filter(p => {
        if (!p.birthDate) return false;
        const parts = p.birthDate.split('-');
        if (parts.length >= 3) {
          const m = parts[1];
          const d = parts[2];
          return m === currentMonth && d === currentDay;
        }
        return false;
      });

      if (birthdayBoys.length > 0) {
        const names = birthdayBoys.map(p => p.name).join(', e ');
        let message = '';
        if (birthdayBoys.length === 1) {
          message = `Hoje é o aniversário do(a) guerreiro(a) ${names}! 🎂 Vamos todos desejar muitas felicidades e saúde! 🎉`;
        } else {
          message = `Hoje é dia de festa! Nossos guerreiros(as) ${names} estão de aniversário! 🎂 Vamos desejar muitas felicidades e saúde a todos! 🎉`;
        }

        console.log(`[Automation] Encontrado(s) aniversariante(s) hoje: ${names}`);

        const chunkSize = 200;
        let sentCount = 0;

        for (let i = 0; i < players.length; i += chunkSize) {
          const chunk = players.slice(i, i + chunkSize);
          const batch = db.batch();
          
          for (const player of chunk) {
            // Notificação interna do app (In-app)
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
              playerId: player.id,
              title: '🎉 Felizes Aniversários no Clube!',
              message: message,
              createdAt: Date.now(),
              read: false,
              type: 'system'
            });

            // Notificação Push pelo celular com Bip Sonoro (FCM)
            if (player.fcmToken && player.pushEnabled !== false) {
              // Count unread (including the one we just added)
              let unreadCount = 1;
              try {
                const unreadSnap = await db.collection('notifications')
                  .where('playerId', '==', player.id)
                  .where('read', '==', false)
                  .get();
                unreadCount = unreadSnap.size + 1;
              } catch (pErr) {
                console.error(`Erro ao contar unread para ${player.id}:`, pErr);
              }

              const fcmRef = db.collection('fcm_messages').doc();
              batch.set(fcmRef, {
                token: player.fcmToken,
                notification: {
                  title: '🎉 Aniversário no Clube!',
                  body: message,
                  sound: 'default'
                },
                data: {
                  unreadCount: String(unreadCount),
                  type: 'birthday'
                },
                android: {
                  notification: {
                    sound: 'default'
                  }
                },
                apns: {
                  payload: {
                    aps: {
                      sound: 'default'
                    }
                  }
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
            sentCount++;
          }
          await batch.commit();
        }
        console.log(`[Automation] Mensagens de aniversário enviadas com som para ${sentCount} sócios ativos.`);
        return res.json({ status: "success", count: sentCount });
      } else {
        console.log('[Automation] Nenhum sócio faz aniversário hoje.');
        return res.json({ status: "skipped", reason: "No birthdays matching filter" });
      }
    } catch (err) {
      console.error('[Automation] Erro na rotina de aniversários:', err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Rota para Reset Diário (Agendar no Scheduler para: 0 0 * * *)
  // Zera estatísticas diárias de jogadores às 00:00 AM (Horário de Brasília)
  app.all('/api/crons/daily-reset', async (req, res) => {
    console.log('[Automation] Iniciando reset diário...');
    try {
      const now = new Date();
      const brOffset = -3;
      const brTime = new Date(now.getTime() + brOffset * 3600 * 1000);
      const todayKey = `${brTime.getFullYear()}-${String(brTime.getMonth() + 1).padStart(2, '0')}-${String(brTime.getDate()).padStart(2, '0')}`;

      const systemRef = db.doc('metadata/system');
      const systemSnap = await systemRef.get();
      
      if (systemSnap.exists && systemSnap.data()?.lastResetDate === todayKey) {
        return res.json({ status: "skipped", reason: "Já resetado hoje" });
      }

      const playersSnap = await db.collection('players').get();
      const batch = db.batch();
      let writeCount = 0;

      // Reset de cada jogador
      playersSnap.docs.forEach(doc => {
        const p = doc.data();
        if (p.dailyMatches > 0 || p.dailyWins > 0 || p.dailyLosses > 0 || p.dailyEloGain !== 0 || (p.dailyResults && p.dailyResults.length > 0) || p.playedLastMatch) {
          batch.update(doc.ref, {
            dailyMatches: 0,
            dailyWins: 0,
            dailyLosses: 0,
            dailyEloGain: 0,
            dailyResults: [],
            playedLastMatch: false,
            reads: 0,
            writes: 0
          });
          writeCount++;
        }
      });

      // Atualiza metadados do sistema
      batch.update(systemRef, {
        lastResetDate: todayKey,
        lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        dailyMatchCount: 0,
        matchStartTime: null
      });
      
      // Zera estatísticas globais de uso
      batch.set(db.doc('metadata/usage'), { reads: 0, writes: 0, lastUpdate: todayKey });
      
      // Remove partida atual se houver
      batch.delete(db.doc('metadata/currentMatch'));
      
      writeCount += 3;

      if (writeCount > 0) {
        await batch.commit();
      }

      console.log(`[Automation] Reset diário concluído (${todayKey}). ${writeCount} documentos afetados.`);
      return res.json({ status: "success", todayKey, writeCount });
    } catch (err) {
      console.error('[Automation] Erro no reset diário:', err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Rota para Limpeza de Notificacoes (Agendar no Scheduler para: 0 3 * * *)
  app.all('/api/crons/cleanup', async (req, res) => {
    console.log('[Automation] Iniciando limpeza de notificações antigas...');
    try {
      const now = Date.now();
      const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

      const notificationsRef = db.collection('notifications');
      
      // Para evitar erro de índice composto no Firestore (requires composite index for read + createdAt),
      // fazemos a busca por um único campo (createdAt) e filtramos na memória.
      const oldSnap = await notificationsRef
        .where('createdAt', '<', threeDaysAgo)
        .limit(500) // Limite de segurança para o batch do Firestore (max 500)
        .get();

      const batch = db.batch();
      let deleteCount = 0;

      oldSnap.docs.forEach(doc => {
        const data = doc.data();
        const read = data.read === true;
        const createdAt = data.createdAt || 0;

        // Se lida (antiga +3 dias) ou Não Lida (muito antiga +10 dias)
        if (read || (!read && createdAt < tenDaysAgo)) {
          batch.delete(doc.ref);
          deleteCount++;
        }
      });

      if (deleteCount > 0) {
        await batch.commit();
        console.log(`[Automation] Limpeza concluída: ${deleteCount} notificações removidas.`);
      } else {
        console.log('[Automation] Nenhuma notificação antiga para remover.');
      }
      return res.json({ status: "success", removed: deleteCount });
    } catch (err) {
      console.error('[Automation] Erro na limpeza de notificações:', err);
      return res.status(500).json({ error: String(err) });
    }
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
