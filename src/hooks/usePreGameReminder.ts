import { useState, useEffect, useCallback, useMemo } from 'react';
import { getFirestoreDateKey, getBrazilDay } from '../../firebase';
import { Player } from '../../types';

export interface UsePreGameReminderProps {
  intentions: {
    responses: Record<string, 'GOING' | 'NOT_GOING'>;
    targetDate?: string;
  };
  isLoaded?: boolean;
  players: Player[];
  attendance?: Player[];
  preConfirmations?: Player[];
  idToCanonicalId?: Record<string, string>;
  currentPlayer: Player | null;
  userRole?: 'ADMIN' | 'MEMBER' | null;
  setIntent: (playerId: string, status: 'GOING' | 'NOT_GOING') => Promise<void>;
  showNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
  sendReminders?: (customMessage?: string) => Promise<number>;
}

export const usePreGameReminder = ({
  intentions,
  isLoaded = true,
  players,
  attendance = [],
  preConfirmations = [],
  idToCanonicalId,
  currentPlayer,
  userRole,
  setIntent,
  showNotification,
  sendReminders
}: UsePreGameReminderProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingPush, setIsSendingPush] = useState(false);

  const todayKey = getFirestoreDateKey();
  const brazilDay = getBrazilDay();

  // Helper robusto para verificar se um atleta já confirmou ou respondeu para a data da partida
  // Cruza chaves por ID, UID, Email, Apelidos Canônicos, Pré-Confirmações e Presença
  const isPlayerConfirmedOrResponded = useCallback((player: Player): boolean => {
    if (!player) return false;

    const candidateKeys = new Set<string>();
    if (player.id) candidateKeys.add(player.id);
    if (player.uid) candidateKeys.add(player.uid);
    if (player.email) candidateKeys.add(player.email.trim().toLowerCase());

    if (idToCanonicalId) {
      if (idToCanonicalId[player.id]) candidateKeys.add(idToCanonicalId[player.id]);
      Object.entries(idToCanonicalId).forEach(([k, v]) => {
        if (candidateKeys.has(k) || candidateKeys.has(v)) {
          candidateKeys.add(k);
          candidateKeys.add(v);
        }
      });
    }

    const normName = player.name ? player.name.trim().toLowerCase() : '';

    // 1. Respostas registradas em intentions (GOING ou NOT_GOING)
    const responses = intentions.responses || {};
    for (const key of candidateKeys) {
      if (responses[key] === 'GOING' || responses[key] === 'NOT_GOING') {
        return true;
      }
    }

    // 2. Pré-confirmações para a partida (qualquer atleta em preConfirmations tem status de presença confirmada)
    const isPreConfirmed = (preConfirmations || []).some(pc => {
      if (candidateKeys.has(pc.id)) return true;
      if (pc.uid && candidateKeys.has(pc.uid)) return true;
      if (pc.email && candidateKeys.has(pc.email.trim().toLowerCase())) return true;
      if (normName && pc.name && pc.name.trim().toLowerCase() === normName) return true;
      return false;
    });
    if (isPreConfirmed) return true;

    // 3. Lista de Presença da Sessão
    const isInAttendance = (attendance || []).some(att => {
      if (candidateKeys.has(att.id)) return true;
      if (att.uid && candidateKeys.has(att.uid)) return true;
      if (att.email && candidateKeys.has(att.email.trim().toLowerCase())) return true;
      if (normName && att.name && att.name.trim().toLowerCase() === normName) return true;
      return false;
    });
    if (isInAttendance) return true;

    return false;
  }, [intentions.responses, idToCanonicalId, preConfirmations, attendance]);

  // ZONA DE NÃO INTERFERÊNCIA: Filtro estrito de sócios ativos
  const activePlayers = useMemo(() => {
    return (players || []).filter(p => p.status === 'active');
  }, [players]);

  // Lista de sócios ativos indecisos
  const undecidedActivePlayers = useMemo(() => {
    if (!isLoaded) return [];
    return activePlayers.filter(p => !isPlayerConfirmedOrResponded(p));
  }, [activePlayers, isLoaded, isPlayerConfirmedOrResponded]);

  // Checagem se hoje é quarta-feira (3) ou véspera da data-alvo
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

  // Identificação se o atleta logado é ativo e está indeciso
  const isCurrentPlayerUndecided = useMemo(() => {
    if (!isLoaded) return false;
    if (!currentPlayer || currentPlayer.status !== 'active') return false;
    return !isPlayerConfirmedOrResponded(currentPlayer);
  }, [isLoaded, currentPlayer, isPlayerConfirmedOrResponded]);

  // Storage key para evitar insistência na mesma data
  const storageDismissKey = useMemo(() => {
    const pId = currentPlayer?.id || 'anon';
    const dateKey = intentions.targetDate || todayKey;
    return `guerreiros_pregame_modal_dismissed_${dateKey}_${pId}`;
  }, [currentPlayer?.id, intentions.targetDate, todayKey]);

  // Auto-dismiss em localStorage se o atleta já estiver confirmado
  useEffect(() => {
    if (isLoaded && currentPlayer && !isCurrentPlayerUndecided && typeof window !== 'undefined') {
      localStorage.setItem(storageDismissKey, 'true');
    }
  }, [isLoaded, currentPlayer, isCurrentPlayerUndecided, storageDismissKey]);

  // Trava de Segurança Reativa: se a modal estiver aberta mas o atleta já confirmou (ou carregou confirmação), fecha imediatamente
  useEffect(() => {
    if (isOpen && (!isCurrentPlayerUndecided || !isLoaded)) {
      setIsOpen(false);
    }
  }, [isOpen, isCurrentPlayerUndecided, isLoaded]);

  // Auto-abertura da modal caso seja véspera do jogo, dados já carregados e o atleta não tenha respondido
  useEffect(() => {
    if (!isLoaded) return;
    if (!isDayBeforeGame) return;
    if (!isCurrentPlayerUndecided) return;

    // Verificar se já dispensou hoje
    if (typeof window !== 'undefined') {
      const isDismissed = localStorage.getItem(storageDismissKey) === 'true';
      if (isDismissed) return;
    }

    // Delay suave para não conflitar com inicialização do app
    const timer = setTimeout(() => {
      if (isCurrentPlayerUndecided) {
        setIsOpen(true);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isLoaded, isDayBeforeGame, isCurrentPlayerUndecided, storageDismissKey]);

  // Confirmação de presença via pop-up
  const handleConfirmPresence = useCallback(async () => {
    if (!currentPlayer || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await setIntent(currentPlayer.id, 'GOING');
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageDismissKey, 'true');
      }
      setIsOpen(false);
      if (showNotification) {
        showNotification('Presença confirmada para o jogo! 🏐 Boa partida, Guerreiro(a)!', 'success');
      }
    } catch (err) {
      console.error('Erro ao confirmar presença pelo lembrete:', err);
      if (showNotification) {
        showNotification('Erro ao confirmar presença. Tente novamente.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPlayer, isSubmitting, setIntent, storageDismissKey, showNotification]);

  // Recusa de presença via pop-up
  const handleDeclinePresence = useCallback(async () => {
    if (!currentPlayer || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await setIntent(currentPlayer.id, 'NOT_GOING');
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageDismissKey, 'true');
      }
      setIsOpen(false);
      if (showNotification) {
        showNotification('Ausência registrada com sucesso. Até a próxima rodada!', 'info');
      }
    } catch (err) {
      console.error('Erro ao recusar presença pelo lembrete:', err);
      if (showNotification) {
        showNotification('Erro ao registrar resposta. Tente novamente.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPlayer, isSubmitting, setIntent, storageDismissKey, showNotification]);

  // Dispensar lembrete para depois
  const handleDismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageDismissKey, 'true');
    }
    setIsOpen(false);
  }, [storageDismissKey]);

  // Disparo de notificação push pelo administrador para todos os indecisos
  const handleBroadcastPushToUndecided = useCallback(async () => {
    if (!sendReminders || isSendingPush || undecidedActivePlayers.length === 0) return;
    setIsSendingPush(true);
    try {
      let dateStr = 'quinta-feira';
      if (intentions.targetDate) {
        const parts = intentions.targetDate.split('-');
        if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}`;
      }
      const customMessage = `🏐 Véspera de Jogo! Confirme sua vaga para amanhã (${dateStr}) na lista de intenções.`;
      const count = await sendReminders(customMessage);
      if (showNotification) {
        showNotification(`Lembrete disparado para ${count || undecidedActivePlayers.length} sócio(s) indeciso(s)! 🏐`, 'success');
      }
    } catch (err) {
      console.error('Erro ao disparar push coletivo:', err);
      if (showNotification) {
        showNotification('Erro ao disparar notificações push.', 'error');
      }
    } finally {
      setIsSendingPush(false);
    }
  }, [sendReminders, isSendingPush, undecidedActivePlayers.length, intentions.targetDate, showNotification]);

  return {
    isOpen,
    setIsOpen,
    isDayBeforeGame,
    isCurrentPlayerUndecided,
    undecidedCount: undecidedActivePlayers.length,
    undecidedActivePlayers,
    isSubmitting,
    isSendingPush,
    targetDate: intentions.targetDate,
    handleConfirmPresence,
    handleDeclinePresence,
    handleDismiss,
    handleBroadcastPushToUndecided,
    openReminderManually: () => setIsOpen(true)
  };
};
