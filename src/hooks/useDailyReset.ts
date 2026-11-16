import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { db, doc, writeBatch, getFirestoreDateKey } from '../../firebase';

/**
 * Automação Inteligente de Reset Diário (Zero Leituras Extras):
 * Verifica os dados já em memória na Store quando um Admin acessa o app.
 * Se não houver nenhuma partida registrada na data de hoje (horário de Brasília),
 * mas ainda existirem atletas com estatísticas diárias residuais da sessão anterior
 * (dailyMatches > 0, playedLastMatch, consecutivePlayed), limpa tudo automaticamente.
 */
export const useDailyReset = () => {
  const userRole = useStore(state => state.userRole);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const isInitialLoading = useStore(state => state.isInitialLoading);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (isInitialLoading || hasCheckedRef.current) return;
    if (userRole !== 'ADMIN' || !players || players.length === 0) return;

    const todayStr = getFirestoreDateKey();
    const lastResetCheck = localStorage.getItem('guerreiros_auto_daily_reset_date');
    if (lastResetCheck === todayStr) {
      hasCheckedRef.current = true;
      return;
    }

    // Verifica se já houve alguma partida hoje
    const hasMatchesToday = (matches || []).some(m => m.date === todayStr);
    if (hasMatchesToday) {
      localStorage.setItem('guerreiros_auto_daily_reset_date', todayStr);
      hasCheckedRef.current = true;
      return;
    }

    // Filtra apenas atletas que ficaram com sujeira residual de dias anteriores
    const dirtyPlayers = players.filter(
      p =>
        (p.dailyMatches || 0) > 0 ||
        (p.dailyWins || 0) > 0 ||
        (p.dailyLosses || 0) > 0 ||
        (p.dailyEloGain || 0) !== 0 ||
        (p.dailyResults && p.dailyResults.length > 0) ||
        Boolean(p.playedLastMatch) ||
        (p.consecutivePlayed || 0) > 0 ||
        (p.consecutiveBenched || 0) > 0
    );

    hasCheckedRef.current = true;

    if (dirtyPlayers.length === 0) {
      localStorage.setItem('guerreiros_auto_daily_reset_date', todayStr);
      return;
    }

    const runSilentReset = async () => {
      try {
        const batch = writeBatch(db);
        dirtyPlayers.forEach(p => {
          batch.update(doc(db, 'players', p.id), {
            dailyMatches: 0,
            dailyWins: 0,
            dailyLosses: 0,
            dailyEloGain: 0,
            dailyResults: [],
            playedLastMatch: false,
            consecutivePlayed: 0,
            consecutiveBenched: 0
          });
        });

        batch.set(
          doc(db, 'metadata', 'system'),
          {
            dailyMatchCount: 0,
            lastResetDate: todayStr,
            lastResetTimestamp: Date.now()
          },
          { merge: true }
        );

        await batch.commit();
        localStorage.setItem('guerreiros_auto_daily_reset_date', todayStr);
        console.info(
          `[AutoDailyReset] Estatísticas diárias residuais zeradas automaticamente para ${dirtyPlayers.length} sócio(s).`
        );
      } catch (err) {
        console.warn('[AutoDailyReset] Aviso não impeditivo ao zerar contadores diários:', err);
      }
    };

    runSilentReset();
  }, [userRole, players, matches, isInitialLoading]);
};