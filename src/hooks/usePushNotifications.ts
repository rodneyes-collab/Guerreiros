import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, messaging } from '../../firebase';
import { useStore } from '../../store';

const VAPID_KEY = 'BNriUQFnNL96aWZWNt1hElYBCaX0rZUIbVGA3S5nndH8cOwhzIPpObuHwGOpgkb0onvSm59rBeEjgX-FMYcLozQ';

export const usePushNotifications = () => {
  const currentPlayer = useStore(state => state.currentPlayer);
  const showNotification = useStore(state => state.showNotification);

  useEffect(() => {
    if (!messaging) return;

    // Listen for foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Mensagem recebida em primeiro plano:', payload);
      if (payload.notification) {
        showNotification(
          payload.notification.body || payload.notification.title || 'Nova mensagem recebida',
          'info'
        );
      }
    });

    const requestPermission = async () => {
      if (!currentPlayer) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // Register Service Worker explicitly for FCM
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/firebase-cloud-messaging-push-scope',
          });

          const token = await getToken(messaging, { 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
          });
          
          if (token) {
            // Only update if the token is different
            if (currentPlayer.fcmToken !== token) {
              await updateDoc(doc(db, 'players', currentPlayer.id), {
                fcmToken: token,
                pushEnabled: true
              });
              console.log('FCM Token atualizado com sucesso');
            }
          }
        } else {
          console.warn('Permissão de notificação negada pelo usuário');
        }
      } catch (error) {
        console.error('Erro ao configurar notificações push:', error);
      }
    };

    // Only request if the user is logged in and hasn't explicitly disabled it
    if (currentPlayer && currentPlayer.pushEnabled !== false && !currentPlayer.fcmToken) {
      requestPermission();
    }

    return () => unsubscribe();
  }, [currentPlayer, showNotification]);
};
