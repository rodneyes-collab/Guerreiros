import { useMemo, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { Player } from '../../types';
import confetti from 'canvas-confetti';
import { db, collection, doc, writeBatch, serverTimestamp } from '../../firebase';

// Create a custom confetti instance with worker disabled to prevent getBoundingClientRect error in hidden iframes
const fireConfetti = confetti.create(undefined, { useWorker: false, resize: true });

export const useBirthdays = (providedPlayers?: Player[]) => {
  const storePlayers = useStore(state => state.players);
  const currentPlayer = useStore(state => state.currentPlayer);
  const showNotification = useStore(state => state.showNotification);
  const players = providedPlayers || storePlayers;
  const [hasCelebrated, setHasCelebrated] = useState(false);

  // Debug Log for mobile troubleshooting
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile || process.env.NODE_ENV === 'development') {
      const state = useStore.getState();
      console.log('[BIRTHDAYS DEBUG]', {
        playersCount: players?.length || 0,
        storePlayersCount: storePlayers?.length || 0,
        source: providedPlayers ? 'props' : 'store',
        timestamp: new Date().toISOString(),
        hasBirthDate: players?.filter(p => !!p.birthDate).length || 0,
        currentPlayer: currentPlayer?.name || 'Guest',
        isInitialLoading: state.isInitialLoading,
        isSyncing: state.isSyncing,
        viewMode: state.viewMode,
        userAgent: navigator.userAgent
      });
    }
  }, [players?.length, !!providedPlayers, storePlayers?.length, currentPlayer?.id]);

  // Helper to get Brasilia date components
  const getBrDate = useCallback(() => {
    const now = new Date();
    try {
      // Use a more robust way to get Brasilia time if Intl fails
      const brTime = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const brDate = new Date(brTime);
      
      const day = brDate.getDate();
      const month = brDate.getMonth() + 1;
      const year = brDate.getFullYear();

      if (process.env.NODE_ENV === 'development' || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        console.log('[BIRTHDAYS DEBUG] getBrDate (Robust):', { day, month, year, brTime });
      }

      return { day, month, year };
    } catch (err) {
      console.error('[BIRTHDAYS DEBUG] getBrDate Error:', err);
      // Fallback to local time
      return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
    }
  }, []);

  const todayBirthdays = useMemo(() => {
    const { day, month } = getBrDate();

    return players.filter(player => {
      if (!player.birthDate) return false;
      
      // Handle both YYYY-MM-DD and DD/MM/YYYY or other separators
      const parts = player.birthDate.split(/[-/]/);
      if (parts.length !== 3) return false;
      
      let bDay, bMonth;
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        bMonth = parseInt(parts[1], 10);
        bDay = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY or DD/MM/YYYY
        bDay = parseInt(parts[0], 10);
        bMonth = parseInt(parts[1], 10);
      }
      
      return bMonth === month && bDay === day;
    });
  }, [players, getBrDate]);

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
      const resp = await fetch('/api/whatsapp/send-birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id })
      });
      if (!resp.ok) throw new Error('Falha no envio via WhatsApp');
      showNotification(`Parabéns de ${player.name} enviado no grupo do WhatsApp! 🎂🏐`, 'success');
    } catch (error) {
      console.error("Error sending birthday via WhatsApp:", error);
      showNotification('Erro ao enviar parabéns no WhatsApp.', 'error');
    }
  };

  const getBirthdaysByMonth = useCallback((m: number) => {
    if (!players || players.length === 0) {
      console.log(`[BIRTHDAYS DEBUG] getBirthdaysByMonth(${m}) - No players in list`);
      return [];
    }
    
    const filtered = players.filter(player => {
      if (!player || !player.birthDate) return false;
      const parts = player.birthDate.split(/[-/]/);
      if (parts.length !== 3) return false;
      
      let bMonth;
      if (parts[0].length === 4) {
        bMonth = parseInt(parts[1], 10);
      } else {
        bMonth = parseInt(parts[1], 10);
      }
      return bMonth === m;
    });

    console.log(`[BIRTHDAYS DEBUG] getBirthdaysByMonth(${m}) - Found ${filtered.length} players out of ${players.length}`);

    return filtered.sort((a, b) => {
      const partsA = a.birthDate!.split(/[-/]/);
      const partsB = b.birthDate!.split(/[-/]/);
      const d1 = parseInt(partsA[0].length === 4 ? partsA[2] : partsA[0], 10);
      const d2 = parseInt(partsB[0].length === 4 ? partsB[2] : partsB[0], 10);
      return d1 - d2;
    });
  }, [players]);

  const monthBirthdays = useMemo(() => {
    const { day, month, year } = getBrDate();

    // Find first Thursday of current month in Brasilia time
    // We create a date at 12:00 to avoid midnight edge cases
    const firstDayOfMonth = new Date(year, month - 1, 1, 12, 0, 0);
    const firstDayWeekday = firstDayOfMonth.getDay(); // 0-6 (Sun-Sat)
    let firstThursday = 1 + (11 - firstDayWeekday) % 7;
    
    let targetMonth = month;
    // Celebration rule: if we are before first Thursday + 2 days, show previous month
    if (day <= firstThursday + 2) {
      targetMonth = month - 1;
      if (targetMonth === 0) targetMonth = 12;
    }

    return {
      month: targetMonth,
      players: getBirthdaysByMonth(targetMonth)
    };
  }, [getBrDate, getBirthdaysByMonth]);

  return {
    todayBirthdays,
    monthBirthdays,
    getBirthdaysByMonth,
    isMyBirthday,
    sendBirthdayPush
  };
};
