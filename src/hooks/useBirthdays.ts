import { useMemo, useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Player } from '../../types';
import confetti from 'canvas-confetti';
import { db, collection, doc, writeBatch, serverTimestamp } from '../../firebase';

// Create a custom confetti instance with worker disabled to prevent getBoundingClientRect error in hidden iframes
const fireConfetti = confetti.create(undefined, { useWorker: false, resize: true });

export const useBirthdays = () => {
  const { players, currentPlayer, showNotification } = useStore();
  const [hasCelebrated, setHasCelebrated] = useState(false);

  const todayBirthdays = useMemo(() => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    return players.filter(player => {
      if (!player.birthDate) return false;
      const bDate = new Date(player.birthDate);
      // Adjust for timezone if needed, but usually birthDate is stored as YYYY-MM-DD
      // If it's ISO, we extract month and day
      return (bDate.getUTCMonth() + 1) === month && bDate.getUTCDate() === day;
    });
  }, [players]);

  const isMyBirthday = useMemo(() => {
    if (!currentPlayer) return false;
    return todayBirthdays.some(p => p.id === currentPlayer.id);
  }, [todayBirthdays, currentPlayer]);

  useEffect(() => {
    if (isMyBirthday && !hasCelebrated) {
      fireConfetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F5C429', '#FFFFFF', '#000000']
      });
      setHasCelebrated(true);
    }
  }, [isMyBirthday, hasCelebrated]);

  const sendBirthdayPush = async (player: Player) => {
    try {
      const batch = writeBatch(db);
      
      // Send to everyone except the birthday person? 
      // Or just a general broadcast. 
      // For now, let's send to all players who have a token
      const playersWithToken = players.filter(p => p.fcmToken && p.id !== player.id);
      
      playersWithToken.forEach(p => {
        // In-app notification
        const appNotifRef = doc(collection(db, 'notifications'));
        batch.set(appNotifRef, {
          playerId: p.id,
          playerUid: p.uid || null,
          title: '🎉 Aniversariante do Dia!',
          message: `Hoje é aniversário de ${player.name}! Vamos dar os parabéns no grupo! 🎂🏐`,
          createdAt: Date.now(),
          read: false,
          type: 'system'
        });

        // FCM notification
        const notifRef = doc(collection(db, 'fcm_messages'));
        batch.set(notifRef, {
          token: p.fcmToken,
          notification: {
            title: '🎉 Aniversariante do Dia!',
            body: `Hoje é aniversário de ${player.name}! Vamos dar os parabéns no grupo! 🎂🏐`,
            sound: 'default'
          },
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      showNotification(`Notificações de aniversário enviadas para o grupo!`, 'success');
    } catch (error) {
      console.error("Error sending birthday push:", error);
      showNotification('Erro ao enviar notificações de aniversário.', 'error');
    }
  };

  return {
    todayBirthdays,
    isMyBirthday,
    sendBirthdayPush
  };
};
