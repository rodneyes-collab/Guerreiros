import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { Player } from '../../types';
import {
  db,
  doc,
  getDoc,
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

export const parseBirthMonthDay = (birthDate?: string | null): BirthdayMonthDay | null => {
  if (!birthDate || typeof birthDate !== 'string') return null;
  const clean = birthDate.trim().split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length !== 3) return null;

  let day: number;
  let month: number;

  if (parts[0].length === 4) {
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
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

export const useBirthdayAutomation = () => {
  const players = useStore(state => state.players);
  const currentPlayer = useStore(state => state.currentPlayer);
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const systemMetadata = useStore(state => state.systemMetadata);
  const isInitialLoading = useStore(state => state.isInitialLoading);

  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessedToday, setHasProcessedToday] = useState(false);
  const isRunningRef = useRef(false);
  const lastCheckedDateRef = useRef<string | null>(null);

  const todayStr = getFirestoreDateKey();

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

  const checkAndNotifyBirthdays = useCallback(
    async (force = false) => {
      if (isRunningRef.current || isQuotaExceeded || !db) return;
      if (isInitialLoading || !currentPlayer || !players || players.length === 0) return;
      if (!isNotificationsEnabled || todayBirthdays.length === 0) return;

      if (!force) {
        if (lastCheckedDateRef.current === todayStr) return;
        try {
          if (localStorage.getItem(LOCAL_LOCK_KEY) === todayStr) {
            lastCheckedDateRef.current = todayStr;
            setHasProcessedToday(true);
            return;
          }
        } catch {}
      }

      isRunningRef.current = true;
      setIsProcessing(true);

      try {
        const currentYearStr = todayStr.split('-')[0];
        const automationRef = doc(db, 'metadata', 'automation_birthdays');
        const snap = await getDoc(automationRef);
        const existingData: any = snap.exists() ? snap.data() : {};
        const sentLog = existingData?.sentBirthdayLog || {};

        const anyUnsent = todayBirthdays.some(
          p =>
            String(p.lastBirthdaySentYear || '') !== currentYearStr &&
            !sentLog[`${p.id}_${currentYearStr}`]
        );

        // Se ainda houver aniversariante pendente no dia e um Admin abrir o app, aciona a rota de WhatsApp do servidor
        if ((anyUnsent || force) && isAdmin) {
          await fetch('/api/whatsapp/send-birthday', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }).catch(() => {});
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
      } finally {
        isRunningRef.current = false;
        setIsProcessing(false);
      }
    },
    [isInitialLoading, currentPlayer, players, isNotificationsEnabled, todayBirthdays, todayStr, isAdmin]
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
