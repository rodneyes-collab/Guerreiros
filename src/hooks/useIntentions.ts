import { useState, useEffect, useCallback } from 'react';
import { db, doc, onSnapshot, setDoc, updateDoc, writeBatch, collection, serverTimestamp } from '../../firebase';
import { IntentionsData, Player } from '../../types';
import { useStore } from '../../store';

const DEFAULT_INTENTIONS: IntentionsData = {
  targetDate: '',
  automationEnabled: true,
  responses: {},
  confirmationTimestamps: {},
  remindersSent: {}
};

export const useIntentions = () => {
  const [intentions, setIntentions] = useState<IntentionsData>(DEFAULT_INTENTIONS);
  const { players, userRole } = useStore();

  // Listen to intentions data
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'intentions'), (docSnap) => {
      if (docSnap.exists()) {
        setIntentions(docSnap.data() as IntentionsData);
      } else {
        // Initialize if not exists
        setDoc(doc(db, 'metadata', 'intentions'), DEFAULT_INTENTIONS);
      }
    });
    return () => unsub();
  }, []);

  // Helper to get next Thursday
  const getNextThursday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((4 + 7 - d.getDay()) % 7 || 7));
    return d.toISOString().split('T')[0];
  };

  // Reset list for the new week
  const resetIntentionsIfNeeded = useCallback(async () => {
    const nextThu = getNextThursday();
    if (intentions.targetDate !== nextThu && userRole === 'ADMIN') {
      await setDoc(doc(db, 'metadata', 'intentions'), {
        ...DEFAULT_INTENTIONS,
        targetDate: nextThu,
        responses: {},
        confirmationTimestamps: {},
        automationEnabled: intentions.automationEnabled // preserve automation setting
      });
    }
  }, [intentions.targetDate, intentions.automationEnabled, userRole]);

  useEffect(() => {
    if (intentions.targetDate) {
      resetIntentionsIfNeeded();
    }
  }, [intentions.targetDate, resetIntentionsIfNeeded]);

  const setIntent = async (playerId: string, status: 'GOING' | 'NOT_GOING') => {
    const previousStatus = intentions.responses[playerId];
    const newResponses = { ...intentions.responses, [playerId]: status };
    
    const updates: any = {
      responses: newResponses
    };

    if (status === 'GOING' && previousStatus !== 'GOING') {
      updates[`confirmationTimestamps.${playerId}`] = Date.now();
    } else if (status === 'NOT_GOING') {
      updates[`confirmationTimestamps.${playerId}`] = null;
    }

    await updateDoc(doc(db, 'metadata', 'intentions'), updates);

    // Notify admins silently
    const player = players.find(p => p.id === playerId);
    if (player) {
      const batch = writeBatch(db);
      const admins = players.filter(p => p.isAdmin && p.fcmToken);
      
      if (status === 'GOING') {
        admins.forEach(admin => {
          if (admin.id !== playerId) {
            const notifRef = doc(collection(db, 'fcm_messages'));
            batch.set(notifRef, {
              token: admin.fcmToken,
              notification: {
                title: 'Confirmação na Lista',
                body: `${player.name} confirmou presença para quinta-feira!`
              },
              createdAt: serverTimestamp()
            });
          }
        });
        await batch.commit();
      } else if (status === 'NOT_GOING' && previousStatus === 'GOING') {
        admins.forEach(admin => {
          if (admin.id !== playerId) {
            const notifRef = doc(collection(db, 'fcm_messages'));
            batch.set(notifRef, {
              token: admin.fcmToken,
              notification: {
                title: 'Desistência na Lista',
                body: `${player.name} desistiu de ir na quinta-feira. Atualize a lista!`
              },
              createdAt: serverTimestamp()
            });
          }
        });
        await batch.commit();
      }
    }
  };

  const resetIntent = async (playerId: string) => {
    const previousStatus = intentions.responses[playerId];
    const newResponses = { ...intentions.responses };
    delete newResponses[playerId];
    
    await updateDoc(doc(db, 'metadata', 'intentions'), {
      responses: newResponses,
      [`confirmationTimestamps.${playerId}`]: null
    });

    // Notify admins if they were going
    if (previousStatus === 'GOING') {
      const player = players.find(p => p.id === playerId);
      if (player) {
        const batch = writeBatch(db);
        const admins = players.filter(p => p.isAdmin && p.fcmToken);
        admins.forEach(admin => {
          if (admin.id !== playerId) {
            const notifRef = doc(collection(db, 'fcm_messages'));
            batch.set(notifRef, {
              token: admin.fcmToken,
              notification: {
                title: 'Alteração na Lista',
                body: `${player.name} removeu a confirmação de quinta-feira.`
              },
              createdAt: serverTimestamp()
            });
          }
        });
        await batch.commit();
      }
    }
  };

  const toggleAutomation = async (enabled: boolean) => {
    await updateDoc(doc(db, 'metadata', 'intentions'), {
      automationEnabled: enabled
    });
  };

  const sendReminders = async (customMessage?: string) => {
    const batch = writeBatch(db);
    let count = 0;

    players.forEach(player => {
      if (player.status === 'active' && !intentions.responses[player.id]) {
        // Save to in-app notifications
        const appNotifRef = doc(collection(db, 'notifications'));
        batch.set(appNotifRef, {
          playerId: player.id,
          title: 'Aviso de Presença',
          message: customMessage || 'E aí Guerreiro(a), vai jogar nesta Quinta? Confirme a sua presença direto no app ou no grupo de WhatsApp.',
          createdAt: Date.now(),
          read: false,
          type: 'reminder'
        });

        // If player has FCM token, also send push notification via fcm_messages
        if (player.fcmToken) {
          const notifRef = doc(collection(db, 'fcm_messages'));
          batch.set(notifRef, {
            token: player.fcmToken,
            notification: {
              title: 'Aviso de Presença',
              body: customMessage || 'E aí Guerreiro(a), vai jogar nesta Quinta? Confirme a sua presença direto no app ou no grupo de WhatsApp.'
            },
            createdAt: serverTimestamp()
          });
        }
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
    return count;
  };

  const copyToWhatsApp = () => {
    const goingPlayers = players
      .filter(p => intentions.responses[p.id] === 'GOING')
      .sort((a, b) => {
        const timeA = intentions.confirmationTimestamps?.[a.id] || 0;
        const timeB = intentions.confirmationTimestamps?.[b.id] || 0;
        return timeA - timeB;
      });

    let text = `Boraaa pra lista mais esperada da semana! 🏐🔥\n`;
    text += `Vamos jogar vôlei com aquela turma massa?\n\n`;
    text += `*Guerreiros confirmados*\n\n`;
    
    if (goingPlayers.length === 0) {
      text += "Nenhum sócio confirmado ainda.";
    } else {
      goingPlayers.forEach((p, index) => {
        text += `${index + 1} . ${p.name}\n`;
      });
      text += `\nTotal: ${goingPlayers.length} confirmados`;
    }

    text += `\n\nConfirme sua presença no app: ${window.location.origin} ou no grupo do WhatsApp!`;

    navigator.clipboard.writeText(text);
    return true;
  };

  const copyReminder = () => {
    const text = `E aí Guerreiro(a), vai jogar nesta Quinta?\nConfirme a sua presença direto no app: ${window.location.origin} ou no grupo de WhatsApp.`;
    navigator.clipboard.writeText(text);
    return true;
  };

  // Automatic Reminders Logic
  useEffect(() => {
    if (!intentions.automationEnabled || userRole !== 'ADMIN') return;

    const checkAndSend = async () => {
      const now = new Date();
      const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu
      const hour = now.getHours();

      let reminderKey = '';

      if (day === 3) { // Wednesday
        if (hour >= 10 && hour < 14) reminderKey = 'wed_1';
        else if (hour >= 18) reminderKey = 'wed_2';
      } else if (day === 4) { // Thursday
        if (hour >= 9 && hour < 13) reminderKey = 'thu_1';
        else if (hour >= 13 && hour < 16) reminderKey = 'thu_2';
        else if (hour >= 16 && hour < 18) reminderKey = 'thu_3';
      }

      if (reminderKey && !intentions.remindersSent[reminderKey]) {
        // Mark as sent first to prevent race conditions with other admins
        await updateDoc(doc(db, 'metadata', 'intentions'), {
          [`remindersSent.${reminderKey}`]: true
        });
        await sendReminders();
        console.log(`Lembrete automático '${reminderKey}' enviado.`);
      }
    };

    // Check every minute
    const interval = setInterval(checkAndSend, 60000);
    checkAndSend(); // Check immediately on mount

    return () => clearInterval(interval);
  }, [intentions.automationEnabled, intentions.remindersSent, userRole, sendReminders]);

  return {
    intentions,
    setIntent,
    resetIntent,
    toggleAutomation,
    sendReminders,
    copyToWhatsApp,
    copyReminder
  };
};
