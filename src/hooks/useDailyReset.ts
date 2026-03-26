
import { useEffect, useRef } from 'react';
import { 
  db, 
  doc, 
  writeBatch, 
  OperationType, 
  handleFirestoreError,
  trackUsage
} from '../../firebase';
import { useStore } from '../../store';
import { Player } from '../../types';

export const useDailyReset = () => {
  const { 
    user, 
    players, 
    systemMetadata, 
    isInitialLoading, 
    setPlayers, 
    setAttendance, 
    showNotification 
  } = useStore();

  const isResettingRef = useRef(false);
  const lastFailedResetRef = useRef<string | null>(null);

  useEffect(() => {
    if (isInitialLoading || !user || players.length === 0 || isResettingRef.current) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Prevent retrying if it failed today already
    if (lastFailedResetRef.current === today) return;

    if (systemMetadata.lastResetDate && systemMetadata.lastResetDate !== today) {
      const performReset = async () => {
        isResettingRef.current = true;
        console.log("Novo dia detectado. Zerando estatísticas...");
        const reset = (p: Player) => ({ ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [], playedLastMatch: false });
        
        try {
          const batch = writeBatch(db);
          let writeCount = 0;
          
          players.forEach(p => {
            if (!p.id) return;
            // Só atualiza se houver estatísticas para zerar
            if (p.dailyMatches > 0 || p.dailyWins > 0 || p.dailyLosses > 0 || p.dailyEloGain !== 0 || (p.dailyResults && p.dailyResults.length > 0) || p.playedLastMatch) {
              const playerRef = doc(db, 'players', p.id);
              batch.set(playerRef, { 
                dailyMatches: 0, 
                dailyWins: 0, 
                dailyLosses: 0,
                dailyEloGain: 0,
                dailyResults: [],
                playedLastMatch: false
              }, { merge: true });
              writeCount++;
            }
          });
          
          const systemRef = doc(db, 'metadata', 'system');
          batch.set(systemRef, { 
            lastResetDate: today,
            dailyMatchCount: 0,
            matchStartTime: null
          }, { merge: true });
          writeCount++;
          
          // Resetar partida atual e estatísticas de uso
          batch.delete(doc(db, 'metadata', 'currentMatch'));
          batch.set(doc(db, 'metadata', 'usage'), { reads: 0, writes: 0, lastUpdate: today });
          writeCount += 2;
          
          await batch.commit();
          await trackUsage(0, writeCount);
          
          setPlayers(players.map(reset));
          setAttendance(prev => prev.map(reset));
          
          showNotification("Novo dia! Estatísticas diárias foram zeradas.", "info");
          lastFailedResetRef.current = null;
        } catch (error: any) {
          console.error("Erro no reset diário:", error);
          if (error?.code === 'resource-exhausted') {
            showNotification("Limite de uso do banco de dados atingido. Algumas funções podem estar limitadas.", "error");
          }
          lastFailedResetRef.current = today;
        } finally {
          isResettingRef.current = false;
        }
      };
      
      performReset();
    }
  }, [systemMetadata.lastResetDate, isInitialLoading, user, players, setPlayers, setAttendance, showNotification]);
};
