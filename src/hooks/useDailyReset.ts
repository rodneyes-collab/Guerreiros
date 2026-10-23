
import { useEffect, useRef } from 'react';
import { 
  db, 
  doc, 
  setDoc,
  writeBatch, 
  OperationType, 
  handleFirestoreError,
  trackUsage,
  getFirestoreDateKey
} from '../../firebase';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
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
  } = useStore(useShallow(state => ({
      user: state.user,
      players: state.players,
      systemMetadata: state.systemMetadata,
      isInitialLoading: state.isInitialLoading,
      setPlayers: state.setPlayers,
      setAttendance: state.setAttendance,
      showNotification: state.showNotification
    })));

  const isResettingRef = useRef(false);
  const lastFailedResetRef = useRef<string | null>(null);

  useEffect(() => {
    // O Reset Diário agora é feito 100% pelo backend via Cloud Scheduler.
    // Isso economiza custos significativos ao evitar que abas abertas de admins
    // executem lógica de escrita e limpeza de estatísticas no Firestore.
  }, []);
};
