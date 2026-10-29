import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, doc, updateDoc, getFirestoreDateKey, getBrazilDay } from '../../firebase';
import { Player } from '../../types';
import { getIntentionReminderText, sendIntentionReminderPush } from '../utils/pushNotificationHelper';

const hourFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: 'numeric',
  hour12: false
});

export interface UseIntentionsReminderScheduleProps {
  players: Player[];
  attendance?: Player[];
  intentions: {
    responses: Record<string, 'GOING' | 'NOT_GOING'>;
    targetDate?: string;
    autoPushSent?: {
      morningDate?: string;
      afternoonDate?: string;
      wednesdayDate?: string;
    };
  };
  sendReminders: (customMessage?: string) => Promise<number>;
  userRole: 'ADMIN' | 'MEMBER' | null;
  currentPlayer: Player | null;
  showNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const useIntentionsReminderSchedule = ({
  players,
  attendance = [],
  intentions,
  sendReminders,
  userRole,
  currentPlayer,
  showNotification
}: UseIntentionsReminderScheduleProps) => {
  const [isSending, setIsSending] = useState(false);
  const [lastSentPeriod, setLastSentPeriod] = useState<'morning' | 'afternoon' | 'wednesday' | null>(null);
  const isExecutingRef = useRef(false);

  // REGRA DE OURO: Apenas sócios ativos que ainda não responderam e não estão na presença
  const undecidedActivePlayers = useMemo(() => {
    return (players || []).filter(p => {
      if (p.status !== 'active') return false;
      const resp = intentions.responses?.[p.id];
      const isAlreadyInAttendance = (attendance || []).some(a => a.id === p.id);
      return !resp && !isAlreadyInAttendance;
    });
  }, [players, intentions.responses, attendance]);

  const getBrazilHour = useCallback(() => {
    try {
      const now = new Date();
      const str = hourFormatter.format(now);
      return parseInt(str, 10);
    } catch {
      return new Date().getHours();
    }
  }, []);

  const todayKey = getFirestoreDateKey();
  const brazilDay = getBrazilDay();
  
  // Quinta-feira (4) ou data-alvo coincidente com a data de hoje
  const isGameDay = brazilDay === 4 || (intentions.targetDate && intentions.targetDate === todayKey);

  // Quarta-feira (3) ou véspera exata da data-alvo
  const isDayBeforeGame = useMemo(() => {
    if (brazilDay === 3) return true;
    if (!intentions.targetDate) return false;
    try {
      const [tYear, tMonth, tDay] = intentions.targetDate.split('-').map(Number);
      const target = new Date(tYear, tMonth - 1, tDay);
      target.setDate(target.getDate() - 1);
      const targetEveKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
      return todayKey === targetEveKey;
    } catch {
      return false;
    }
  }, [brazilDay, intentions.targetDate, todayKey]);

  const hour = getBrazilHour();
  const isMorningWindow = hour >= 9 && hour < 12;
  const isAfternoonWindow = hour >= 15 && hour < 19;
  const isWednesdayWindow = hour >= 10 && hour < 20;

  const morningSentToday = intentions.autoPushSent?.morningDate === todayKey || 
    (typeof window !== 'undefined' && localStorage.getItem(`guerreiros_auto_push_${todayKey}_morning`) === 'true');

  const afternoonSentToday = intentions.autoPushSent?.afternoonDate === todayKey || 
    (typeof window !== 'undefined' && localStorage.getItem(`guerreiros_auto_push_${todayKey}_afternoon`) === 'true');

  const wednesdaySentToday = intentions.autoPushSent?.wednesdayDate === todayKey ||
    (typeof window !== 'undefined' && localStorage.getItem(`guerreiros_auto_push_${todayKey}_wednesday`) === 'true');

  // Disparo manual ou automatizado de lembrete
  const dispatchReminder = useCallback(async (period: 'morning' | 'afternoon' | 'wednesday', isAuto: boolean = false) => {
    if (isExecutingRef.current || undecidedActivePlayers.length === 0) return 0;
    isExecutingRef.current = true;
    setIsSending(true);

    let targetDateFormatted = '';
    if (intentions.targetDate) {
      const parts = intentions.targetDate.split('-');
      if (parts.length === 3) {
        targetDateFormatted = `${parts[2]}/${parts[1]}`;
      }
    }

    const template = getIntentionReminderText(period, targetDateFormatted);

    try {
      // 1. Dispara FCM e notificações internas para todos os sócios ativos indecisos
      const count = await sendReminders(template.body);

      // 2. Registra o disparo em Firestore e LocalStorage
      const updatePayload: any = {};
      if (period === 'morning') {
        updatePayload['autoPushSent.morningDate'] = todayKey;
        if (typeof window !== 'undefined') {
          localStorage.setItem(`guerreiros_auto_push_${todayKey}_morning`, 'true');
        }
      } else if (period === 'afternoon') {
        updatePayload['autoPushSent.afternoonDate'] = todayKey;
        if (typeof window !== 'undefined') {
          localStorage.setItem(`guerreiros_auto_push_${todayKey}_afternoon`, 'true');
        }
      } else if (period === 'wednesday') {
        updatePayload['autoPushSent.wednesdayDate'] = todayKey;
        if (typeof window !== 'undefined') {
          localStorage.setItem(`guerreiros_auto_push_${todayKey}_wednesday`, 'true');
        }
      }

      try {
        await updateDoc(doc(db, 'metadata', 'intentions'), updatePayload);
      } catch (docErr) {
        console.warn('Aviso ao registrar data de envio automático em metadata/intentions:', docErr);
      }

      // 3. Se o usuário atual logado for um dos indecisos, emite push local imediatamente
      if (currentPlayer && undecidedActivePlayers.some(p => p.id === currentPlayer.id)) {
        await sendIntentionReminderPush({
          period,
          customMessage: template.body,
          totalUndecided: undecidedActivePlayers.length
        });
      }

      setLastSentPeriod(period);

      if (showNotification) {
        let label = 'Lembrete';
        if (period === 'morning') label = 'Lembrete da Manhã';
        else if (period === 'afternoon') label = 'Última Chamada';
        else if (period === 'wednesday') label = 'Lembrete da Véspera (Quarta)';

        showNotification(
          `${label} enviado para ${count || undecidedActivePlayers.length} sócio(s) indeciso(s)! 🏐`,
          'success'
        );
      }

      return count;
    } catch (err: any) {
      console.error(`Erro ao disparar lembrete de ${period}:`, err);
      if (!isAuto && showNotification) {
        showNotification('Erro ao disparar lembrete. Tente novamente.', 'error');
      }
      return 0;
    } finally {
      setIsSending(false);
      isExecutingRef.current = false;
    }
  }, [undecidedActivePlayers, todayKey, sendReminders, currentPlayer, showNotification, intentions.targetDate]);

  // Rotina de verificação automática nos turnos da manhã, tarde e véspera (quarta-feira)
  useEffect(() => {
    // Apenas admin executa a rotina automática para evitar concorrência de escritas
    if (userRole !== 'ADMIN') return;
    if (undecidedActivePlayers.length === 0) return;

    const currentHour = getBrazilHour();

    // 1. Verificação Véspera do Jogo (Quarta-feira, 10h - 20h)
    if (isDayBeforeGame && currentHour >= 10 && currentHour < 20 && !wednesdaySentToday) {
      dispatchReminder('wednesday', true);
      return;
    }

    // 2. Verificação Dia do Jogo (Quinta-feira)
    if (isGameDay) {
      // Verificação Manhã (09h - 12h)
      if (currentHour >= 9 && currentHour < 12 && !morningSentToday) {
        dispatchReminder('morning', true);
        return;
      }

      // Verificação Tarde (15h - 19h)
      if (currentHour >= 15 && currentHour < 19 && !afternoonSentToday) {
        dispatchReminder('afternoon', true);
        return;
      }
    }
  }, [userRole, isDayBeforeGame, isGameDay, undecidedActivePlayers.length, wednesdaySentToday, morningSentToday, afternoonSentToday, getBrazilHour, dispatchReminder]);

  return {
    isGameDay,
    isDayBeforeGame,
    isMorningWindow,
    isAfternoonWindow,
    isWednesdayWindow,
    morningSentToday,
    afternoonSentToday,
    wednesdaySentToday,
    undecidedActiveCount: undecidedActivePlayers.length,
    isSending,
    lastSentPeriod,
    triggerManualReminder: (period: 'morning' | 'afternoon' | 'wednesday') => dispatchReminder(period, false)
  };
};
