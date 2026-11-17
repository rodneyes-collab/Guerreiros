import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { Player } from '../../types';
import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  getFirestoreDateKey,
  isQuotaExceeded,
  isFirestoreQuotaError,
  markQuotaExceeded
} from '../../firebase';

const LOCAL_LOCK_KEY = 'guerreiros_birthday_automation_date';
const MASTER_ADMIN_EMAIL = 'rodneyes@gmail.com';

export interface BirthdayMonthDay {
  month: number;
  day: number;
}

/**
 * Extrai mês e dia de formatos YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY ou ISO timestamp.
 */
export const parseBirthMonthDay = (birthDate?: string | null): BirthdayMonthDay | null => {
  if (!birthDate || typeof birthDate !== 'string') return null;
  const clean = birthDate.trim().split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length !== 3) return null;

  let day: number;
  let month: number;

  if (parts[0].length === 4) {
    // YYYY-MM-DD
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    // DD/MM/YYYY ou DD-MM-YYYY
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  }

  if (
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { month, day };
};

const formatNamesList = (list: Player[]): string => {
  const names = list.map(p => p.name.trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
};

interface AutomationBirthdayDoc {
  lastRun?: string;
  adminNotifiedDate?: string;
  birthdayPlayerIds?: string[];
  birthdayNames?: string[];
  pushSentCount?: number;
  inAppSentCount?: number;
  updatedAt?: number;
}

/**
 * Hook de automação diária de aniversariantes:
 * - Verifica diariamente (fuso de Brasília) usando os jogadores já carregados na store (0 leituras extras em dias sem aniversariante).
 * - Deduplica a execução diária via localStorage + documento metadata/automation_birthdays.
 * - Quando há aniversariantes:
 *   - Admin: envia notificação push (FCM) e notificação in-app para o grupo, felicita o(s) aniversariante(s) e avisa o admin caso não haja tokens ativos.
 *   - Membro comum: se o grupo ainda não foi notificado no dia, envia um alerta ao(s) admin(s) para que o grupo seja avisado.
 */
export const useBirthdayAutomation = () => {
  const players = useStore(state => state.players);
  const currentPlayer = useStore(state => state.currentPlayer);
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const systemMetadata = useStore(state => state.systemMetadata);
  const isInitialLoading = useStore(state => state.isInitialLoading);
  const showNotification = useStore(state => state.showNotification);

  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessedToday, setHasProcessedToday] = useState(false);
  const isRunningRef = useRef(false);
  const lastCheckedDateRef = useRef<string | null>(null);

  const todayStr = getFirestoreDateKey(); // YYYY-MM-DD (America/Sao_Paulo)

  const todayBirthdays = useMemo(() => {
    if (!players || players.length === 0) return [];
    const [, mStr, dStr] = todayStr.split('-');
    const currentMonth = parseInt(mStr, 10);
    const currentDay = parseInt(dStr, 10);

    return players.filter(p => {
      if (!p || p.status === 'inactive') return false;
      const parsed = parseBirthMonthDay(p.birthDate);
      return parsed !== null && parsed.month === currentMonth && parsed.day === currentDay;
    });
  }, [players, todayStr]);

  const isNotificationsEnabled =
    systemMetadata?.birthdayNotificationsEnabled !== false &&
    systemMetadata?.enableAutoBirthdays !== false;

  const isAdmin =
    userRole === 'ADMIN' ||
    Boolean(currentPlayer?.isAdmin) ||
    user?.email?.trim().toLowerCase() === MASTER_ADMIN_EMAIL;

  const commitWriteOps = useCallback(
    async (ops: Array<(batch: ReturnType<typeof writeBatch>) => void>) => {
      for (let i = 0; i < ops.length; i += 400) {
        const chunk = ops.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(applyOp => applyOp(batch));
        await batch.commit();
      }
    },
    []
  );

  const checkAndNotifyBirthdays = useCallback(
    async (force = false) => {
      if (isRunningRef.current || isQuotaExceeded || !db) return;
      if (isInitialLoading || !currentPlayer || !players || players.length === 0) return;
      if (!isNotificationsEnabled) return;

      if (todayBirthdays.length === 0) {
        return;
      }

      if (!force) {
        if (lastCheckedDateRef.current === todayStr) return;
        try {
          if (localStorage.getItem(LOCAL_LOCK_KEY) === todayStr) {
            lastCheckedDateRef.current = todayStr;
            setHasProcessedToday(true);
            return;
          }
        } catch {
          // Ignore storage access errors in restricted environments
        }
      }

      isRunningRef.current = true;
      setIsProcessing(true);

      try {
        const automationRef = doc(db, 'metadata', 'automation_birthdays');
        const snap = await getDoc(automationRef);
        const existingData: AutomationBirthdayDoc = snap.exists()
          ? (snap.data() as AutomationBirthdayDoc)
          : {};

        const alreadySentGroupToday = existingData.lastRun === todayStr;
        const alreadyAlertedAdminToday = existingData.adminNotifiedDate === todayStr;

        if (!force && alreadySentGroupToday) {
          lastCheckedDateRef.current = todayStr;
          setHasProcessedToday(true);
          try {
            localStorage.setItem(LOCAL_LOCK_KEY, todayStr);
          } catch {}
          return;
        }

        const namesText = formatNamesList(todayBirthdays);
        const birthdayIds = new Set(todayBirthdays.map(p => p.id));

        const activeEligiblePlayers = players.filter(
          p => p && p.status !== 'inactive' && p.pushEnabled !== false
        );

        const adminPlayers = players.filter(
          p =>
            p &&
            p.status !== 'inactive' &&
            (Boolean(p.isAdmin) || p.email?.trim().toLowerCase() === MASTER_ADMIN_EMAIL)
        );

        const writeOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
        let pushSentCount = 0;
        let inAppSentCount = 0;

        if (isAdmin) {
          const groupRecipients = activeEligiblePlayers.filter(p => !birthdayIds.has(p.id));
          const groupTitle = '🎂 Aniversariante do Dia!';
          const groupBody = `Hoje é aniversário de ${namesText}! Vamos dar os parabéns no grupo! 🏐🎉`;

          // Notifica membros do grupo (in-app + FCM push se tiver token)
          for (const recipient of groupRecipients) {
            if (recipient.uid) {
              const notifRef = doc(collection(db, 'notifications'));
              writeOps.push(batch =>
                batch.set(notifRef, {
                  playerId: recipient.id,
                  playerUid: recipient.uid,
                  title: groupTitle,
                  message: groupBody,
                  createdAt: Date.now(),
                  read: false,
                  type: 'system'
                })
              );
              inAppSentCount++;
            }

            if (recipient.fcmToken) {
              const fcmRef = doc(collection(db, 'fcm_messages'));
              writeOps.push(batch =>
                batch.set(fcmRef, {
                  token: recipient.fcmToken,
                  notification: {
                    title: groupTitle,
                    body: groupBody,
                    sound: 'default'
                  },
                  createdAt: serverTimestamp()
                })
              );
              pushSentCount++;
            }
          }

          // Felicita os próprios aniversariantes
          for (const celebrant of todayBirthdays) {
            const firstName = celebrant.name.trim().split(' ')[0] || celebrant.name;
            const personalTitle = `🥳 Feliz Aniversário, ${firstName}!`;
            const personalBody =
              'O Guerreiros Volleyball Club deseja muita saúde, alegria e grandes vitórias dentro e fora de quadra! 🎂🏐';

            if (celebrant.uid) {
              const notifRef = doc(collection(db, 'notifications'));
              writeOps.push(batch =>
                batch.set(notifRef, {
                  playerId: celebrant.id,
                  playerUid: celebrant.uid,
                  title: personalTitle,
                  message: personalBody,
                  createdAt: Date.now(),
                  read: false,
                  type: 'system'
                })
              );
              inAppSentCount++;
            }

            if (celebrant.fcmToken && celebrant.pushEnabled !== false) {
              const fcmRef = doc(collection(db, 'fcm_messages'));
              writeOps.push(batch =>
                batch.set(fcmRef, {
                  token: celebrant.fcmToken,
                  notification: {
                    title: personalTitle,
                    body: personalBody,
                    sound: 'default'
                  },
                  createdAt: serverTimestamp()
                })
              );
              pushSentCount++;
            }
          }

          // Se ninguém no grupo tem push token ativo, avisa explicitamente o admin in-app também
          if (pushSentCount === 0 && currentPlayer?.uid) {
            const adminAlertRef = doc(collection(db, 'notifications'));
            writeOps.push(batch =>
              batch.set(adminAlertRef, {
                playerId: currentPlayer.id,
                playerUid: currentPlayer.uid,
                title: '📢 Aviso ao Admin: Aniversário Hoje',
                message: `Hoje é aniversário de ${namesText}, mas nenhum membro está com Push ativo no navegador. Envie os parabéns no grupo do WhatsApp! 🎂`,
                createdAt: Date.now(),
                read: false,
                type: 'reminder'
              })
            );
            inAppSentCount++;
          }

          if (writeOps.length > 0) {
            await commitWriteOps(writeOps);
          }

          await setDoc(
            automationRef,
            {
              lastRun: todayStr,
              adminNotifiedDate: todayStr,
              birthdayPlayerIds: todayBirthdays.map(p => p.id),
              birthdayNames: todayBirthdays.map(p => p.name),
              pushSentCount,
              inAppSentCount,
              updatedAt: Date.now()
            },
            { merge: true }
          );

          if (pushSentCount > 0) {
            showNotification(
              `🎂 Aniversariante(s) de hoje (${namesText}): Push enviado para ${pushSentCount} dispositivo(s) do grupo!`,
              'success'
            );
          } else {
            showNotification(
              `🎂 Aviso ao Admin: Hoje é aniversário de ${namesText}! Nenhum push ativo no grupo — parabéns registrados no app.`,
              'info'
            );
          }
        } else {
          // Membro comum acessando antes de qualquer Admin: apenas avisa o(s) Admin(s) 1x no dia
          if (!alreadyAlertedAdminToday) {
            const adminTitle = '🎂 Lembrete ao Admin: Aniversariante do Dia';
            const adminBody = `Hoje é aniversário de ${namesText}! Lembrete automático para parabenizar no grupo. 🏐🎉`;

            for (const admin of adminPlayers) {
              if (admin.uid) {
                const notifRef = doc(collection(db, 'notifications'));
                writeOps.push(batch =>
                  batch.set(notifRef, {
                    playerId: admin.id,
                    playerUid: admin.uid,
                    title: adminTitle,
                    message: adminBody,
                    createdAt: Date.now(),
                    read: false,
                    type: 'reminder'
                  })
                );
                inAppSentCount++;
              }

              if (admin.fcmToken && admin.pushEnabled !== false) {
                const fcmRef = doc(collection(db, 'fcm_messages'));
                writeOps.push(batch =>
                  batch.set(fcmRef, {
                    token: admin.fcmToken,
                    notification: {
                      title: adminTitle,
                      body: adminBody,
                      sound: 'default'
                    },
                    createdAt: serverTimestamp()
                  })
                );
                pushSentCount++;
              }
            }

            if (writeOps.length > 0) {
              await commitWriteOps(writeOps);
            }

            await setDoc(
              automationRef,
              {
                adminNotifiedDate: todayStr,
                birthdayPlayerIds: todayBirthdays.map(p => p.id),
                birthdayNames: todayBirthdays.map(p => p.name),
                updatedAt: Date.now()
              },
              { merge: true }
            );
          }
        }

        lastCheckedDateRef.current = todayStr;
        setHasProcessedToday(true);
        try {
          localStorage.setItem(LOCAL_LOCK_KEY, todayStr);
        } catch {}
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markQuotaExceeded();
          return;
        }
        console.warn('[useBirthdayAutomation] Erro ao processar automação de aniversário:', err);
      } finally {
        isRunningRef.current = false;
        setIsProcessing(false);
      }
    },
    [
      isInitialLoading,
      currentPlayer,
      players,
      isNotificationsEnabled,
      todayBirthdays,
      todayStr,
      isAdmin,
      commitWriteOps,
      showNotification
    ]
  );

  useEffect(() => {
    checkAndNotifyBirthdays(false);
  }, [checkAndNotifyBirthdays]);

  return {
    todayBirthdays,
    hasProcessedToday,
    isProcessing,
    checkAndNotifyBirthdays
  };
};
