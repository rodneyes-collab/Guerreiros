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

// Rota de Billing (Real-time)
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

    const [cpuResponse] = await metricsClient.listTimeSeries({
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

    let totalCpuSeconds = 0;
    cpuResponse.forEach(serie => {
      serie.points?.forEach(point => {
        if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
      });
    });

    const cpuCost = totalCpuSeconds * 0.00003360; 
    const estimatedCostBRL = cpuCost * 5.25;

    res.json({ 
      projectId,
      usage: { cpuSeconds: totalCpuSeconds },
      estimatedCostBRL: Number(estimatedCostBRL.toFixed(4)),
      status: "success"
    });
  } catch (error) {
    res.status(200).json({ success: false, error: error.message });
  }
});

// CRONS (Mapeadas como rotas da API para flexibilidade)

// Rota para Lembretes de Intenção (Frequência sugerida: cada 1 hora, mas lógica interna filtra horários)
api.all('/crons/intentions', async (req, res) => {
  console.log('[Cron] Verificando lembretes de intenção...');
  try {
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

    if (!reminderKey) return res.json({ status: "skipped", reason: "Fora do horário" });

    const intentionsRef = db.doc('metadata/intentions');
    const intentionsSnap = await intentionsRef.get();
    if (!intentionsSnap.exists) return res.json({ status: "skipped", reason: "Sem metadados" });

    const intentions = intentionsSnap.data();
    if (!intentions.automationEnabled) return res.json({ status: "skipped", reason: "Automation disabled" });
    if (intentions.remindersSent && intentions.remindersSent[reminderKey]) return res.json({ status: "skipped", reason: "Já enviado" });

    const systemSnap = await db.doc('metadata/system').get();
    const systemMeta = systemSnap.data() || {};

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
        const message = `E aí Guerreiro(a), vai jogar hoje? Confirme no app ou no grupo do WhatsApp.`;
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          playerId: player.id,
          title: 'Aviso de Presença',
          message,
          createdAt: Date.now(),
          read: false,
          type: 'reminder'
        });

        // FCM via fcm_messages (respeitando toggle global)
        if (player.fcmToken && systemMeta.pushNotificationsGlobalEnabled !== false && player.pushEnabled !== false) {
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
    res.json({ status: "success", sentCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Rota para Aniversários
api.all('/crons/birthdays', async (req, res) => {
  console.log('[Cron] Verificando aniversariantes...');
  try {
    const now = new Date();
    const brTime = new Date(now.getTime() - 3 * 3600 * 1000);
    const m = String(brTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(brTime.getUTCDate()).padStart(2, '0');
    const todayKey = `${m}-${d}`;

    const systemSnap = await db.doc('metadata/system').get();
    const systemMeta = systemSnap.data() || {};
    
    if (systemMeta.enableAutoBirthdays === false) return res.json({ status: "skipped", reason: "Disabled" });
    if (!systemMeta.activeBirthdaysIndex?.includes(todayKey)) return res.json({ status: "skipped", reason: "No birthdays today" });

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

        if (player.fcmToken && systemMeta.pushNotificationsGlobalEnabled !== false && player.pushEnabled !== false) {
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
      res.json({ status: "success", count: players.length });
    } else {
      res.json({ status: "skipped", reason: "Filter mismatch" });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.all('/crons/daily-reset', async (req, res) => {
  console.log('[Cron] Iniciando reset diário...');
  try {
    const now = new Date();
    const todayKey = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];

    const systemRef = db.doc('metadata/system');
    const systemSnap = await systemRef.get();
    
    if (systemSnap.exists && systemSnap.data()?.lastResetDate === todayKey) {
      return res.json({ status: "skipped", reason: "Já resetado hoje" });
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
    res.json({ status: "success", writeCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Exporta o app Express como uma função chamada 'api'
exports.api = functions.https.onRequest(api);

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
      // Opcional: deletar a mensagem após o envio para manter o DB limpo
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
    
    // 1. Verificar toggle global ANTES de qualquer coisa
    const systemSnap = await admin.firestore().doc('metadata/system').get();
    const systemMeta = systemSnap.data() || {};
    
    if (systemMeta.pushNotificationsGlobalEnabled === false) {
      console.log('Notificações Push desativadas globalmente. Abortando envio.');
      return null;
    }

    // 2. Se for uma notificação de partida, verificar se o alerta de partida global está ativado
    if (notification.type === 'match' && systemMeta.matchNotificationsGlobalEnabled === false) {
      console.log('Notificações de partida desativadas globalmente. Abortando envio.');
      return null;
    }

    // Obter o token FCM do jogador
    const playerDoc = await admin.firestore().collection('players').doc(notification.playerId).get();
    const player = playerDoc.data();
    
    if (!player || !player.fcmToken) {
      console.log('Nenhum token FCM encontrado para o jogador:', notification.playerId);
      return null;
    }

    const payload = {
      notification: {
        title: notification.title,
        body: notification.message,
      },
      token: player.fcmToken
    };

    try {
      const response = await admin.messaging().send(payload);
      console.log('Mensagem enviada com sucesso:', response);
    } catch (error) {
      console.log('Erro ao enviar mensagem:', error);
    }
    return null;
  });
