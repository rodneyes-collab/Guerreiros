import { useEffect } from 'react';

export const useDailyReset = () => {
  useEffect(() => {
    // O Reset Diário agora é feito 100% pelo backend via Cloud Scheduler.
    // Isso economiza custos significativos ao evitar que abas abertas de admins
    // executem lógica de escrita e limpeza de estatísticas no Firestore.
  }, []);
};

