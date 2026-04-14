const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

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
