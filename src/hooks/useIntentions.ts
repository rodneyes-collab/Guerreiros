import { useState, useEffect, useCallback, useRef } from 'react';
import { db, doc, onSnapshot, setDoc, updateDoc, writeBatch, collection, serverTimestamp, handleFirestoreError, OperationType, getDocs, query, where, deleteDoc, getFirestoreDateKey, getBrazilDay } from '../../firebase';
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
  const [isLoaded, setIsLoaded] = useState(false);
  const { players, userRole } = useStore();
  const sendingRef = useRef<Record<string, boolean>>({});

  // Helper to get the correct app URL (Shared vs Dev)
  const getAppUrl = useCallback(() => {
    // 1. Check for explicit env variable
    const envUrl = import.meta.env.VITE_APP_URL;
    if (envUrl) return envUrl.replace(/\/$/, '');
    
    // 2. Official Production URL provided by user
    const PROD_URL = 'https://guerreiros-volleyball-club-238897290870.us-west1.run.app';
    
    const origin = window.location.origin;
    
    // If we are in production, use the current origin
    if (origin.includes('guerreiros-volleyball-club')) {
      return origin;
    }

    // Default to the official PROD_URL for sharing, unless it's a dev environment where we might want to test
    // but the user specifically asked to fix the dev URL in messages.
    return PROD_URL;
  }, []);

  // Helper to get next Thursday
  const getNextThursday = () => {
    const todayStr = getFirestoreDateKey();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = getBrazilDay();
    
    let diff = 4 - day;
    if (diff < 0) diff += 7;
    
    date.setDate(date.getDate() + diff);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Listen to intentions data
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'intentions'), (docSnap) => {
      if (docSnap.exists()) {
        setIntentions(docSnap.data() as IntentionsData);
      } else {
        // Initialize if not exists
        setDoc(doc(db, 'metadata', 'intentions'), {
          ...DEFAULT_INTENTIONS,
          targetDate: getNextThursday()
        });
      }
      setIsLoaded(true);
    });
    return () => unsub();
  }, []);

  // Reset list for the new week
  const resetIntentionsIfNeeded = useCallback(async () => {
    if (!isLoaded) return;
    const nextThu = getNextThursday();
    
    // Only reset if we have a target date and it's different from the next Thursday
    // AND today is NOT Thursday (to avoid resetting on the day of the game)
    // Or if the target date is strictly in the past
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const isPast = intentions.targetDate && intentions.targetDate < todayStr;
    const isThursday = today.getDay() === 4;
    const isWednesday = today.getDay() === 3;

    // Only reset if we have a target date and it's different from the next Thursday
    // AND today is NOT Thursday or Wednesday (to avoid resetting during the game preparation/day)
    // Or if the target date is strictly in the past
    if (intentions.targetDate && intentions.targetDate !== nextThu && userRole === 'ADMIN' && (isPast || (!isThursday && !isWednesday))) {
      try {
        sendingRef.current = {}; // Reset sending ref for new week
        await setDoc(doc(db, 'metadata', 'intentions'), {
          ...DEFAULT_INTENTIONS,
          targetDate: nextThu,
          responses: {},
          confirmationTimestamps: {},
          automationEnabled: intentions.automationEnabled // preserve automation setting
        });
        console.log('Lista de intenções resetada para a nova semana:', nextThu);
      } catch (err) {
        console.error('Erro ao resetar intenções:', err);
        handleFirestoreError(err, OperationType.WRITE, 'metadata/intentions');
      }
    }
  }, [intentions.targetDate, intentions.automationEnabled, userRole, isLoaded]);

  useEffect(() => {
    resetIntentionsIfNeeded();
  }, [intentions.targetDate, resetIntentionsIfNeeded]);

  const clearRemindersForPlayer = async (playerId: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('playerId', '==', playerId),
        where('type', '==', 'reminder')
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.warn('Erro ao limpar lembretes antigos:', err);
    }
  };

  const setIntent = async (playerId: string, status: 'GOING' | 'NOT_GOING') => {
    try {
      const previousStatus = intentions.responses[playerId];
      const newResponses = { ...intentions.responses, [playerId]: status };
      
      const updates: any = {
        responses: newResponses
      };

      if (status === 'GOING' && previousStatus !== 'GOING') {
        updates[`confirmationTimestamps.${playerId}`] = Date.now();
        // Clear old reminders if confirming
        await clearRemindersForPlayer(playerId);
      } else if (status === 'NOT_GOING') {
        updates[`confirmationTimestamps.${playerId}`] = null;
      }

      await updateDoc(doc(db, 'metadata', 'intentions'), updates);

      // Notify admins silently
      const player = players.find(p => p.id === playerId);
      if (player) {
        const batch = writeBatch(db);
        const admins = players.filter(p => p.isAdmin);
        
        if (status === 'GOING') {
          admins.forEach(admin => {
            if (admin.id !== playerId) {
              // In-app notification
              const appNotifRef = doc(collection(db, 'notifications'));
              batch.set(appNotifRef, {
                playerId: admin.id,
                title: 'Confirmação na Lista',
                message: `${player.name} confirmou presença para quinta-feira!`,
                createdAt: Date.now(),
                read: false,
                type: 'system'
              });

              // FCM notification
              if (admin.fcmToken) {
                const notifRef = doc(collection(db, 'fcm_messages'));
                batch.set(notifRef, {
                  token: admin.fcmToken,
                  notification: {
                    title: 'Confirmação na Lista',
                    body: `${player.name} confirmou presença para quinta-feira!`,
                    sound: 'default'
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
                  createdAt: serverTimestamp()
                });
              }
            }
          });
          await batch.commit();
        } else if (status === 'NOT_GOING' && previousStatus === 'GOING') {
          admins.forEach(admin => {
            if (admin.id !== playerId) {
              // In-app notification
              const appNotifRef = doc(collection(db, 'notifications'));
              batch.set(appNotifRef, {
                playerId: admin.id,
                title: 'Desistência na Lista',
                message: `${player.name} desistiu de ir na quinta-feira. Atualize a lista!`,
                createdAt: Date.now(),
                read: false,
                type: 'system'
              });

              // FCM notification
              if (admin.fcmToken) {
                const notifRef = doc(collection(db, 'fcm_messages'));
                batch.set(notifRef, {
                  token: admin.fcmToken,
                  notification: {
                    title: 'Desistência na Lista',
                    body: `${player.name} desistiu de ir na quinta-feira. Atualize a lista!`,
                    sound: 'default'
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
                  createdAt: serverTimestamp()
                });
              }
            }
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.error('Erro ao definir intenção:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'metadata/intentions');
    }
  };

  const resetIntent = async (playerId: string) => {
    try {
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
                  body: `${player.name} removeu a confirmação de quinta-feira.`,
                  sound: 'default'
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
                createdAt: serverTimestamp()
              });
            }
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.error('Erro ao resetar intenção:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'metadata/intentions');
    }
  };

  const toggleAutomation = async (enabled: boolean) => {
    try {
      await updateDoc(doc(db, 'metadata', 'intentions'), {
        automationEnabled: enabled
      });
    } catch (err) {
      console.error('Erro ao alternar automação:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'metadata/intentions');
    }
  };

  const clearIntentions = async () => {
    try {
      await setDoc(doc(db, 'metadata', 'intentions'), {
        ...DEFAULT_INTENTIONS,
        targetDate: getNextThursday()
      });
    } catch (err) {
      console.error('Erro ao limpar intenções:', err);
      handleFirestoreError(err, OperationType.WRITE, 'metadata/intentions');
    }
  };

  const sendReminders = useCallback(async (customMessage?: string) => {
    try {
      const batch = writeBatch(db);
      let count = 0;

      // Get attendance from store directly to ensure latest data
      const currentStore = useStore.getState();
      const currentAttendance = currentStore.attendance;
      const currentIntentions = intentions; // Use current intentions from state

      players.forEach(player => {
        // Don't send reminder if player has already responded or is already in attendance
        const isAlreadyInAttendance = currentAttendance.some(a => a.id === player.id);
        const hasResponded = currentIntentions.responses[player.id] === 'GOING' || currentIntentions.responses[player.id] === 'NOT_GOING';
        
        if (player.status === 'active' && !hasResponded && !isAlreadyInAttendance) {
          const appLink = `${getAppUrl()}?tab=intentions`;
          
          // Save to in-app notifications
          const appNotifRef = doc(collection(db, 'notifications'));
          batch.set(appNotifRef, {
            playerId: player.id,
            title: 'Aviso de Presença',
            message: customMessage || `E aí Guerreiro(a), vai jogar nesta Quinta? [Clique aqui para confirmar](${appLink}) ou no grupo de WhatsApp.`,
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
                body: customMessage || `E aí Guerreiro(a), vai jogar nesta Quinta? Confirme no app: ${appLink}`
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
    } catch (err) {
      console.error('Erro ao enviar lembretes:', err);
      handleFirestoreError(err, OperationType.WRITE, 'notifications/fcm_messages');
      return 0;
    }
  }, [players, intentions.responses]);

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

    text += `\n\nConfirme sua presença no app: ${getAppUrl()}?tab=intentions ou no grupo do WhatsApp!`;

    navigator.clipboard.writeText(text);
    return true;
  };

  const copyReminder = () => {
    const appLink = `${getAppUrl()}?tab=intentions`;
    const text = `E aí Guerreiro(a), vai jogar nesta Quinta?\nConfirme a sua presença direto no app: ${appLink} ou no grupo de WhatsApp.`;
    navigator.clipboard.writeText(text);
    return true;
  };

  // Automatic Reminders Logic
  useEffect(() => {
    // A automação agora é feita 100% pelo backend via Cloud Scheduler.
    // O setInterval(checkAndSend, 60000) foi removido
    // para evitar que abas esquecidas abertas pelos admins causem leituras excessivas
    // e picos de custo no Cloud Run/Firestore.
  }, []);

  return {
    intentions,
    isLoaded,
    setIntent,
    resetIntent,
    clearIntentions,
    toggleAutomation,
    sendReminders,
    copyToWhatsApp,
    copyReminder
  };
};
