import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, messaging } from '../../firebase';
import { useStore } from '../../store';

const VAPID_KEY = 'BNriUQFnNL96aWZWNt1hElYBCaX0rZUIbVGA3S5nndH8cOwhzIPpObuHwGOpgkb0onvSm59rBeEjgX-FMYcLozQ';

export const usePushNotifications = () => {
  const currentPlayer = useStore(state => state.currentPlayer);
  const showNotification = useStore(state => state.showNotification);

  useEffect(() => {
    const requestPermission = async () => {
      if (!messaging || !currentPlayer) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, { vapidKey: VAPID_KEY });
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
    // If pushEnabled is undefined, we assume it's okay to try for first-time or legacy users
    if (currentPlayer && currentPlayer.pushEnabled !== false && !currentPlayer.fcmToken) {
      requestPermission();
    }
  }, [currentPlayer, showNotification]);
};
