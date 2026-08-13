import { useState, useEffect, useCallback, useRef } from 'react';
import { db, doc, onSnapshot, setDoc, updateDoc, writeBatch, collection, serverTimestamp, handleFirestoreError, OperationType, getDocs, query, where, deleteDoc, getFirestoreDateKey, getBrazilDay, trackAccess } from '../../firebase';
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
    }, (err) => {
      console.error('useIntentions: Error in intentions snapshot:', err);
      handleFirestoreError(err, OperationType.GET, 'metadata/intentions');
      setIsLoaded(true);
    });
    return () => unsub();
  }, []);

  // Reset list for the new week
  const resetIntentionsIfNeeded = useCallback(async () => {
    if (!isLoaded) return;
    const nextThu = getNextThursday();
    
    // Only reset if we have a target date and it's strictly in the past (before today's Brazil date)
    const todayStr = getFirestoreDateKey();
    const day = getBrazilDay();
    const isPast = intentions.targetDate && intentions.targetDate < todayStr;
    const isThursday = day === 4;
    const isWednesday = day === 3;

    // Only reset if we have a target date and it's different from the next Thursday
    // AND today is NOT Thursday or Wednesday (to avoid resetting during the game preparation/day)
    // AND the target date is strictly in the past
    if (intentions.targetDate && intentions.targetDate !== nextThu && userRole === 'ADMIN' && isPast && !isThursday && !isWednesday) {
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

  // Sync intention confirmations into player access records
  useEffect(() => {
    if (!isLoaded || !intentions.responses) return;
    const timestamps = intentions.confirmationTimestamps || {};
    const responses = intentions.responses;

    Object.entries(responses).forEach(([pId, status]) => {
      if (status) {
        const ts = timestamps[pId];
        const p = players.find(player => player.id === pId);
        if (p) {
          const confirmDate = ts ? new Date(ts).toISOString().slice(0, 10) : getFirestoreDateKey();
          const hasConfirmDate = p.loginHistory?.some(h => new Date(h).toISOString().slice(0, 10) === confirmDate);
          if (!p.lastLoginAt || !hasConfirmDate) {
            trackAccess(pId);
          }
        }
      }
    });
  }, [isLoaded, intentions.responses, intentions.confirmationTimestamps, players]);

  const clearRemindersForPlayer = async (playerId: string, playerUid?: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('playerUid', '==', playerUid || ''),
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

  const setIntent = async (playerId: string, status: 'GOING' | 'NOT_GOING' | 'RESET') => {
    try {
      const currentStore = useStore.getState();
      const currentAuthUser = currentStore.user;
      const currentPlayerProfile = currentStore.currentPlayer;

      const res = await fetch('/api/presence/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          playerId, 
          status, 
          uid: currentAuthUser?.uid || currentPlayerProfile?.uid || null,
          userEmail: currentAuthUser?.email || currentPlayerProfile?.email || null,
          isAdmin: currentStore.userRole === 'ADMIN'
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        const errorMessage = errorData.error || 'Falha ao registrar presença';
        const errorDetails = errorData.details ? ` (${errorData.details})` : '';
        throw new Error(errorMessage + errorDetails);
      }
      
      if (status !== 'RESET') {
        trackAccess(playerId).catch(console.warn);
      }
      
    } catch (err: any) {
      console.error('Erro ao definir intenção:', err);
      throw err;
    }
  };

  const resetIntent = async (playerId: string) => {
    try {
      // Use the API to reset intent to bypass permission issues
      await setIntent(playerId, 'RESET');
    } catch (err) {
      console.error('Erro ao resetar intenção:', err);
    }
  };

  const toggleAutomation = async (enabled: boolean) => {
    try {
      await setDoc(doc(db, 'metadata', 'intentions'), {
        automationEnabled: enabled
      }, { merge: true });
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

      // Prepare unread counts for non-responded players
      const notificationData = await Promise.all(players.map(async (p) => {
        const isAlreadyInAttendance = currentAttendance.some(a => a.id === p.id);
        const hasResponded = currentIntentions.responses[p.id] === 'GOING' || currentIntentions.responses[p.id] === 'NOT_GOING';
        
        if (p.status === 'active' && !hasResponded && !isAlreadyInAttendance && p.fcmToken) {
          try {
            const q = query(collection(db, 'notifications'), where('playerUid', '==', p.uid), where('read', '==', false));
            const snap = await getDocs(q);
            return { id: p.id, unreadCount: snap.size + 1 };
          } catch (e) {
            return { id: p.id, unreadCount: 1 };
          }
        }
        return { id: p.id, unreadCount: 1 };
      }));

      players.forEach(player => {
        // Don't send reminder if player has already responded or is already in attendance
        const isAlreadyInAttendance = currentAttendance.some(a => a.id === player.id);
        const hasResponded = currentIntentions.responses[player.id] === 'GOING' || currentIntentions.responses[player.id] === 'NOT_GOING';
        
        if (player.status === 'active' && !hasResponded && !isAlreadyInAttendance) {
          const appLink = `${getAppUrl()}?tab=intentions`;
          const unreadCount = notificationData.find(d => d.id === player.id)?.unreadCount || 1;
          
          // Save to in-app notifications
          const appNotifRef = doc(collection(db, 'notifications'));
          const tDate = currentIntentions.targetDate;
          let dateStr = 'xx/xx';
          if (tDate) {
            const [y, m, d] = tDate.split('-').map(Number);
            dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
          }
          
          batch.set(appNotifRef, {
            playerId: player.id,
            playerUid: player.uid || null,
            title: 'Aviso de Presença',
            message: customMessage || `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n[Clique aqui para confirmar](${appLink}) ou no grupo de WhatsApp.`,
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
                body: customMessage || `Bora pra lista mais esperada da semana !!! Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa... Confirme no app: ${appLink}`,
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

    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [y, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }

    let text = `Bora pra lista mais esperada da semana !!!\n\n`;
    text += `Guerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\n`;
    text += `*Guerreiros confirmados*\n\n`;
    
    if (goingPlayers.length === 0) {
      text += "Nenhum sócio confirmado ainda.";
    } else {
      goingPlayers.forEach((p, index) => {
        const isGuest = p.status === 'guest';
        text += `${index + 1} . ${p.name}${isGuest ? ' ( Convidado)' : ''}\n`;
      });
      text += `\nTotal: ${goingPlayers.length} confirmados`;
    }

    text += `\n\nConfirme sua presença no app: ${getAppUrl()}?tab=intentions ou no grupo do WhatsApp!`;

    navigator.clipboard.writeText(text);
    return true;
  };

  const copyReminder = () => {
    const appLink = `${getAppUrl()}?tab=intentions`;
    const tDate = intentions.targetDate;
    let dateStr = 'xx/xx';
    if (tDate) {
      const [y, m, d] = tDate.split('-').map(Number);
      dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    }
    const text = `Bora pra lista mais esperada da semana !!!\n\nGuerreiro(a) vamos jogar quinta-feira dia ${dateStr} ? Não perca vai ser massa...\n\nConfirme a sua presença direto no app: ${appLink} ou no grupo de WhatsApp.`;
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
