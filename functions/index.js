const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

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

exports.dailyResetAutomation = functions.pubsub.schedule('0 0 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  console.log('[Automation] Iniciando reset diário...');
  const db = admin.firestore();
  
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const systemRef = db.doc('metadata/system');
  const systemSnap = await systemRef.get();
  
  if (systemSnap.exists && systemSnap.data()?.lastResetDate === todayKey) {
    console.log('[Automation] Já resetado hoje');
    return null;
  }

  const playersSnap = await db.collection('players').get();
  const batch = db.batch();
  let writeCount = 0;

  playersSnap.docs.forEach(doc => {
    const p = doc.data();
    
    // Calcula nível de evasão antes do reset
    const participationScore = (p.dailyMatches > 0) ? 100 : 0;
    const totalMatches = (p.dailyWins || 0) + (p.dailyLosses || 0);
    const winRate = (totalMatches > 0) ? ((p.dailyWins || 0) / totalMatches) * 100 : 50;
    const score = (0.75 * participationScore) + (0.25 * winRate);
    const riskScore = 100 - score;
    
    let evasionLevel = 'low';
    if (riskScore >= 75) evasionLevel = 'critical';
    else if (riskScore >= 50) evasionLevel = 'high';
    else if (riskScore >= 25) evasionLevel = 'medium';
    else evasionLevel = 'low';

    if (p.dailyMatches > 0 || p.dailyWins > 0 || p.dailyLosses > 0 || p.dailyEloGain !== 0 || (p.dailyResults && p.dailyResults.length > 0) || p.playedLastMatch) {
      batch.update(doc.ref, {
        dailyMatches: 0,
        dailyWins: 0,
        dailyLosses: 0,
        dailyEloGain: 0,
        dailyResults: [],
        playedLastMatch: false,
        reads: 0,
        writes: 0,
        evasionLevel: evasionLevel
      });
      writeCount++;
    } else {
      // Atualiza evasionLevel mesmo se não tiver jogado (recalcula risco pela inatividade)
      batch.update(doc.ref, {
        evasionLevel: evasionLevel
      });
      writeCount++;
    }
  });

  batch.update(systemRef, {
    lastResetDate: todayKey,
    lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    dailyMatchCount: 0,
    matchStartTime: null
  });
  
  batch.set(db.doc('metadata/usage'), { reads: 0, writes: 0, lastUpdate: todayKey });
  
  batch.delete(db.doc('metadata/currentMatch'));
  
  writeCount += 3;

  if (writeCount > 0) {
    await batch.commit();
  }

  console.log(`[Automation] Reset diário concluído (${todayKey}). ${writeCount} documentos afetados.`);
  return null;
});

exports.cleanupAutomation = functions.pubsub.schedule('0 3 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  console.log('[Automation] Iniciando limpeza de notificações antigas...');
  const db = admin.firestore();
  
  const now = Date.now();
  const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

  const notificationsRef = db.collection('notifications');
  
  const oldSnap = await notificationsRef
    .where('createdAt', '<', threeDaysAgo)
    .limit(500)
    .get();

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

  if (deleteCount > 0) {
    await batch.commit();
    console.log(`[Automation] Limpeza concluída: ${deleteCount} notificações removidas.`);
  } else {
    console.log('[Automation] Nenhuma notificação antiga para remover.');
  }
  return null;
});

exports.intentionsAutomation = functions.pubsub.schedule('0 * * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  console.log('[Automation] Verificando se é hora de enviar lembretes...');
  const db = admin.firestore();
  
  const now = new Date();
  
  const day = now.getUTCDay();
  const hour = now.getUTCHours() - 3; // Ajuste temporário simplificado
      
  let reminderKey = '';
  if (day === 3) { // Quarta
    if (hour === 10) reminderKey = 'wed_1';
    else if (hour === 19) reminderKey = 'wed_2';
  } else if (day === 4) { // Quinta
    if (hour === 9) reminderKey = 'thu_1';
    else if (hour === 13) reminderKey = 'thu_2';
    else if (hour === 16) reminderKey = 'thu_3';
  }

  if (!reminderKey) return null;

  const intentionsRef = db.doc('metadata/intentions');
  const intentionsSnap = await intentionsRef.get();
  if (!intentionsSnap.exists) return null;

  const intentions = intentionsSnap.data() || {};
  if (!intentions.automationEnabled) return null;

  if (intentions.remindersSent && intentions.remindersSent[reminderKey]) return null;

  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  await intentionsRef.update({
    [`remindersSent.${reminderKey}`]: true
  });

  const playersSnap = await db.collection('players').where('status', '==', 'active').get();
  const attendanceSnap = await db.collection('attendance').doc(dateKey).collection('players').get();
  
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attendanceIds = new Set(attendanceSnap.docs.map(d => d.id));
  const responses = intentions.responses || {};

  const batch = db.batch();

  for (const player of players) {
    const hasResponded = responses[player.id] === 'GOING' || responses[player.id] === 'NOT_GOING';
    const isInAttendance = attendanceIds.has(player.id);

    if (!hasResponded && !isInAttendance) {
      const appLink = "https://volleyclub-manager.web.app?tab=intentions";
      const message = `E aí Guerreiro(a), vai jogar nesta Quinta? Confirme no app: ${appLink} ou no grupo do WhatsApp.`;

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        playerId: player.id,
        title: 'Aviso de Presença',
        message: message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        type: 'reminder'
      });
    }
  }

  await batch.commit();
  return null;
});

exports.birthdayAutomation = functions.pubsub.schedule('0 9 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
  const db = admin.firestore();
  const now = new Date();
  const currentMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getUTCDate()).padStart(2, '0');
  const todayKey = `${currentMonth}-${currentDay}`;

  const metadataDoc = await db.collection('metadata').doc('system').get();
  const metadata = metadataDoc.data();
  if (metadata?.enableAutoBirthdays === false) return null;
  const activeBirthdaysIndex = metadata?.activeBirthdaysIndex || [];
  if (!activeBirthdaysIndex.includes(todayKey)) return null;

  const playersSnap = await db.collection('players').where('status', '==', 'active').get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const birthdayBoys = players.filter(p => {
    if (!p.birthDate) return false;
    const parts = p.birthDate.split('-');
    return parts[1] === currentMonth && parts[2] === currentDay;
  });

  if (birthdayBoys.length > 0) {
    const names = birthdayBoys.map(p => p.name).join(', e ');
    const message = birthdayBoys.length === 1 
      ? `Hoje é o aniversário do(a) guerreiro(a) ${names}! 🎂 Vamos todos desejar muitas felicidades e saúde! 🎉`
      : `Hoje é dia de festa! Nossos guerreiros(as) ${names} estão de aniversário! 🎂 Vamos desejar muitas felicidades e saúde a todos! 🎉`;

    const batch = db.batch();
    players.forEach(player => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        playerId: player.id,
        title: '🎉 Felizes Aniversários no Clube!',
        message: message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        type: 'system'
      });
    });
    await batch.commit();
  }
  return null;
});
