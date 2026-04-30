const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const { MetricServiceClient } = require("@google-cloud/monitoring");
const { GoogleAuth } = require("google-auth-library");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- API EXPRESS APP ---
const api = express();
api.use(cors({ origin: true }));
api.use(express.json());

// Helpers e Config
const configProjectId = process.env.GCLOUD_PROJECT || "volleyclub-manager";

// Rotas da API
api.get("/health", async (req, res) => {
  res.json({ 
    status: "ok", 
    projectId: configProjectId,
    timestamp: new Date().toISOString() 
  });
});

const { GoogleGenAI, Modality, ThinkingLevel } = require("@google/genai");

// Rota para debug de identidade
api.get("/debug-identity", async (req, res) => {
  try {
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    let email = client.email || client.client_email || "Not found";
    res.json({ email, env: configProjectId });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Proxy para Gemini (Migrado de geminiService.ts para rodar no servidor)
api.post("/gemini", async (req, res) => {
  const { tool, prompt, config, isTTS } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = isTTS ? "gemini-3.1-flash-tts-preview" : (req.body.model || "gemini-3-flash-preview");
    
    if (isTTS) {
      // Regra específica para TTS (Audio Mode)
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
            },
          },
        },
      });
      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      const data = part?.inlineData?.data;
      return res.json({ audio: data });
    } else {
      // Texto normal
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: config || { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      });
      return res.json({ text: response.text });
    }
  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Rota de Billing (Real-time) - Versão Robusta migrada do server.ts
let globalAuth = null;
let globalMetricsClient = null;

api.get("/billing/real-time", async (req, res) => {
  const targetDateStr = req.query.date;
  try {
    if (!globalAuth) globalAuth = new GoogleAuth();
    if (!globalMetricsClient) globalMetricsClient = new MetricServiceClient();
    
    const projectId = configProjectId;
    const metricsClient = globalMetricsClient;
    
    let startTime, endTime;
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

    const interval = {
      startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
      endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
    };

    // 1. CPU Usage
    let totalCpuSeconds = 0;
    try {
      const [cpuResponse] = await metricsClient.listTimeSeries({
        name: metricsClient.projectPath(projectId),
        filter: 'metric.type = "run.googleapis.com/cpu/usage_time"',
        interval,
        aggregation: {
          alignmentPeriod: { seconds: 60 },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_SUM',
        }
      });
      cpuResponse.forEach(serie => {
        serie.points?.forEach(point => {
          if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
        });
      });
    } catch (e) {}

    // 2. Memory Usage (Average)
    let totalMemoryByteSeconds = 0;
    try {
      const [memResponse] = await metricsClient.listTimeSeries({
        name: metricsClient.projectPath(projectId),
        filter: 'metric.type = "run.googleapis.com/container/memory/usage"',
        interval,
        aggregation: {
          alignmentPeriod: { seconds: 60 },
          perSeriesAligner: 'ALIGN_MEAN',
          crossSeriesReducer: 'REDUCE_SUM',
        }
      });
      let memAvg = 0;
      let memPoints = 0;
      memResponse.forEach(serie => {
        serie.points?.forEach(point => {
          if (point.value?.doubleValue) {
            memAvg += point.value.doubleValue;
            memPoints++;
          }
        });
      });
      if (memPoints > 0) {
        const duration = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
        totalMemoryByteSeconds = (memAvg / memPoints) * duration;
      }
    } catch (e) {}

    // 3. Request Count
    let totalRequests = 0;
    try {
      const [reqResponse] = await metricsClient.listTimeSeries({
        name: metricsClient.projectPath(projectId),
        filter: 'metric.type = "run.googleapis.com/request_count"',
        interval,
        aggregation: {
          alignmentPeriod: { seconds: 60 },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_SUM',
        }
      });
      reqResponse.forEach(serie => {
        serie.points?.forEach(point => {
          if (point.value?.int64Value) totalRequests += Number(point.value.int64Value);
        });
      });
    } catch (e) {}

    // Cálculos Financeiros
    const cpuCost = totalCpuSeconds * 0.00003360; 
    const memCost = (totalMemoryByteSeconds / (1024 * 1024 * 1024)) * 0.00000360;
    const reqCost = (totalRequests / 1000000) * 0.40;
    
    const totalUSD = cpuCost + memCost + reqCost;
    const estimatedCostBRL = totalUSD * 5.25;

    res.json({ 
      projectId,
      date: targetDateStr || "last_24h",
      usage: {
        cpuSeconds: totalCpuSeconds,
        requests: totalRequests
      },
      breakdown: {
        cpuBRL: Number((cpuCost * 5.25).toFixed(4)),
        memoryBRL: Number((memCost * 5.25).toFixed(4)),
        requestsBRL: Number((reqCost * 5.25).toFixed(4))
      },
      estimatedCostBRL: Number(estimatedCostBRL.toFixed(4)),
      status: "success"
    });
  } catch (error) {
    res.status(200).json({ success: false, error: error.message });
  }
});

// CRONS LOGIC
async function runIntentionsCron() {
  console.log('[Cron] Verificando lembretes de intenção...');
  const now = new Date();
  const brTime = new Date(now.getTime() - 3 * 3600 * 1000);
  const day = brTime.getUTCDay();
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

  if (!reminderKey) return { status: "skipped", reason: "Fora do horário" };

  const intentionsRef = db.doc('metadata/intentions');
  const intentionsSnap = await intentionsRef.get();
  if (!intentionsSnap.exists) return { status: "skipped", reason: "Sem metadados" };

  const intentions = intentionsSnap.data();
  if (!intentions.automationEnabled) return { status: "skipped", reason: "Automation disabled" };
  if (intentions.remindersSent && intentions.remindersSent[reminderKey]) return { status: "skipped", reason: "Já enviado" };

  const dateKey = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
  await intentionsRef.update({ [`remindersSent.${reminderKey}`]: true });

  const playersSnap = await db.collection('players').where('status', '==', 'active').get();
  const attendanceSnap = await db.collection('attendance').doc(dateKey).collection('players').get();
  
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attendanceIds = new Set(attendanceSnap.docs.map(d => d.id));
  const responses = intentions.responses || {};

  let sentCount = 0;
  const batch = db.batch();

  for (const player of players) {
    const hasResponded = responses[player.id] === 'GOING' || responses[player.id] === 'NOT_GOING';
    const isInAttendance = attendanceIds.has(player.id);

    if (!hasResponded && !isInAttendance) {
      const appLink = "https://volleyclub-manager.web.app?tab=intentions";
      const message = `E aí Guerreiro(a), vai jogar nesta Quinta? Confirme no app: ${appLink}`;
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        playerId: player.id,
        title: 'Aviso de Presença',
        message,
        createdAt: Date.now(),
        read: false,
        type: 'reminder'
      });

      if (player.fcmToken && player.pushEnabled !== false) {
        const fcmRef = db.collection('fcm_messages').doc();
        batch.set(fcmRef, {
          token: player.fcmToken,
          notification: { title: 'Aviso de Presença', body: message, sound: 'default' },
          data: { type: 'reminder' },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      sentCount++;
    }
  }
  if (sentCount > 0) await batch.commit();
  return { status: "success", sentCount };
}

async function runBirthdaysCron() {
  console.log('[Cron] Verificando aniversariantes...');
  const now = new Date();
  const brTime = new Date(now.getTime() - 3 * 3600 * 1000);
  const m = String(brTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brTime.getUTCDate()).padStart(2, '0');
  const todayKey = `${m}-${d}`;

  const systemSnap = await db.doc('metadata/system').get();
  const systemMeta = systemSnap.data() || {};
  
  if (systemMeta.enableAutoBirthdays === false) return { status: "skipped", reason: "Disabled" };
  if (!systemMeta.activeBirthdaysIndex?.includes(todayKey)) return { status: "skipped", reason: "No birthdays today" };

  const playersSnap = await db.collection('players').where('status', '==', 'active').get();
  const players = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const birthdayBoys = players.filter(p => p.birthDate && p.birthDate.substring(5, 10) === todayKey);

  if (birthdayBoys.length > 0) {
    const names = birthdayBoys.map(p => p.name).join(', e ');
    const message = `Hoje é o aniversário de ${names}! 🎂 Parabéns e muitas felicidades! 🎉`;
    const batch = db.batch();

    players.forEach(player => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        playerId: player.id,
        title: '🎉 Aniversário!',
        message,
        createdAt: Date.now(),
        read: false,
        type: 'system'
      });
      if (player.fcmToken && player.pushEnabled !== false) {
        const fcmRef = db.collection('fcm_messages').doc();
        batch.set(fcmRef, {
          token: player.fcmToken,
          notification: { title: '🎉 Aniversário!', body: message, sound: 'default' },
          data: { type: 'birthday' },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    await batch.commit();
    return { status: "success", count: players.length };
  }
  return { status: "skipped", reason: "Filter mismatch" };
}

async function runDailyResetCron() {
  console.log('[Cron] Iniciando reset diário...');
  const now = new Date();
  const todayKey = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];

  const systemRef = db.doc('metadata/system');
  const systemSnap = await systemRef.get();
  
  if (systemSnap.exists && systemSnap.data()?.lastResetDate === todayKey) {
    return { status: "skipped", reason: "Já resetado hoje" };
  }

  const playersSnap = await db.collection('players').get();
  const batch = db.batch();
  let writeCount = 0;

  playersSnap.docs.forEach(doc => {
    const p = doc.data();
    if (p.dailyMatches > 0 || p.playedLastMatch) {
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

  batch.update(systemRef, {
    lastResetDate: todayKey,
    lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    dailyMatchCount: 0
  });
  
  await batch.commit();
  return { status: "success", writeCount };
}

async function runCleanupCron() {
  console.log('[Cron] Limpando notificações antigas...');
  const now = Date.now();
  const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

  const notificationsRef = db.collection('notifications');
  const oldSnap = await notificationsRef.where('createdAt', '<', threeDaysAgo).limit(500).get();

  const batch = db.batch();
  let deleteCount = 0;

  oldSnap.docs.forEach(doc => {
    const data = doc.data();
    const read = data.read === true;
    const createdAt = data.createdAt || 0;
    if (read || (!read && createdAt < tenDaysAgo)) {
      batch.delete(doc.ref);
      deleteCount++;
    }
  });

  if (deleteCount > 0) await batch.commit();
  return { status: "success", removed: deleteCount };
}

// Map Crons to API for manual triggers
api.all('/crons/intentions', async (req, res) => res.json(await runIntentionsCron()));
api.all('/crons/birthdays', async (req, res) => res.json(await runBirthdaysCron()));
api.all('/crons/daily-reset', async (req, res) => res.json(await runDailyResetCron()));
api.all('/crons/cleanup', async (req, res) => res.json(await runCleanupCron()));

// Exporta o app Express como uma função chamada 'api'
exports.api = functions.https.onRequest(api);

// --- SCHEDULED FUNCTIONS (NATIVE CRONS) ---
// Rodar a cada hora (a lógica interna de runIntentionsCron filtra os dias/horas específicos)
exports.scheduledIntentions = functions.pubsub.schedule('0 * * * *').timeZone('America/Sao_Paulo').onRun(runIntentionsCron);

// Rodar diariamente às 09:00 AM
exports.scheduledBirthdays = functions.pubsub.schedule('0 9 * * *').timeZone('America/Sao_Paulo').onRun(runBirthdaysCron);

// Rodar diariamente às 00:00 AM
exports.scheduledDailyReset = functions.pubsub.schedule('0 0 * * *').timeZone('America/Sao_Paulo').onRun(runDailyResetCron);

// Rodar diariamente às 03:00 AM
exports.scheduledCleanup = functions.pubsub.schedule('0 3 * * *').timeZone('America/Sao_Paulo').onRun(runCleanupCron);

// --- TRIGGER FUNCTIONS ---
exports.processFcmMessages = functions.firestore
  .document('fcm_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data.token) return null;
    const payload = {
      token: data.token,
      notification: data.notification || {},
      data: data.data || {},
      android: data.android || {},
      apns: data.apns || {}
    };
    try {
      const response = await admin.messaging().send(payload);
      console.log('Mensagem FCM enviada com sucesso:', response);
      await snap.ref.delete();
    } catch (error) {
      console.error('Erro ao enviar mensagem FCM:', error);
    }
    return null;
  });

exports.sendPushNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    const systemSnap = await admin.firestore().doc('metadata/system').get();
    const systemMeta = systemSnap.data() || {};
    
    if (systemMeta.pushNotificationsGlobalEnabled === false) return null;
    if (notification.type === 'match' && systemMeta.matchNotificationsGlobalEnabled === false) return null;

    const playerDoc = await admin.firestore().collection('players').doc(notification.playerId).get();
    const player = playerDoc.data();
    
    if (!player || !player.fcmToken) return null;

    const payload = {
      notification: { title: notification.title, body: notification.message },
      token: player.fcmToken
    };

    try {
      await admin.messaging().send(payload);
    } catch (error) {
      console.log('Erro ao enviar mensagem:', error);
    }
    return null;
  });
