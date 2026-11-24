import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import confetti from 'canvas-confetti';
import { AnimatePresence } from 'motion/react';
import { useIntentions } from '../src/hooks/useIntentions';
import { useBirthdays } from '../src/hooks/useBirthdays';
import { useStore } from '../store';
import { Logo } from '../src/components/Logo';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { ConfirmedPlayerItem, UndecidedPlayerItem, NotGoingPlayerItem } from '../src/components/IntentionPlayerItem';
import {
  CalendarCheck,
  Copy,
  Send,
  BellRing,
  Settings,
  UserCheck,
  UserX,
  Clock,
  ArrowRight,
  Star,
  Trash2,
  Flame,
  RefreshCw,
  MessageSquare,
  X
} from 'lucide-react';
import { Player } from '../types';
import { getFirestoreDateKey, getBrazilDay } from '../firebase';
import { capitalizeName } from '../utils/helpers';

import { HelpTooltip } from '../src/components/HelpTooltip';
import { playFeedbackSound, triggerHaptic } from '../src/utils/feedback';
import { sendIntentionConfirmationPush } from '../src/utils/pushNotificationHelper';
import { useIntentionsReminderSchedule } from '../src/hooks/useIntentionsReminderSchedule';

interface IntentionsViewProps {
  userRole: 'ADMIN' | 'MEMBER' | null;
  currentPlayer: Player | null;
  onMoveToAttendance: (playerId: string) => void;
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const IntentionsView: React.FC<IntentionsViewProps> = ({
  userRole,
  currentPlayer,
  onMoveToAttendance,
  showNotification
}) => {
  const {
    intentions,
    isLoaded,
    setIntent,
    resetIntent,
    clearIntentions,
    toggleAutomation,
    sendReminders,
    copyToWhatsApp,
    sendListToWhatsAppGroup,
    copyReminder,
    getPlayerConfirmationTime,
    refreshIntentions
  } = useIntentions();

  const { players, attendance, idToCanonicalId, showConfirmModal, isInitialLoading, user } = useStore(
    useShallow(state => ({
      players: state.players,
      attendance: state.attendance,
      idToCanonicalId: state.idToCanonicalId,
      showConfirmModal: state.showConfirmModal,
      isInitialLoading: state.isInitialLoading,
      user: state.user
    }))
  );
  
  const simpleEmail = typeof window !== 'undefined' ? window.localStorage.getItem('simpleLoginEmail')?.trim().toLowerCase() : null;
  const isAdmin =
    userRole === 'ADMIN' ||
    !!currentPlayer?.isAdmin ||
    user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com' ||
    simpleEmail === 'rodneyes@gmail.com' ||
    useStore.getState().userRole === 'ADMIN';

  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(players);
  const [selectedMonth, setSelectedMonth] = React.useState<number>(() => new Date().getMonth() + 1);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSendingGroupList, setIsSendingGroupList] = React.useState(false);
  const [showCommLogsModal, setShowCommLogsModal] = React.useState(false);
  const [commLogs, setCommLogs] = React.useState<Array<{
    id: string;
    timestamp: number;
    type: string;
    recipient: string;
    status: string;
    summary: string;
    messagePreview: string;
    errorDetail?: string;
  }>>([]);
  const [isLoadingCommLogs, setIsLoadingCommLogs] = React.useState(false);
  const [pullStartY, setPullStartY] = React.useState(0);
  const [pullDist, setPullDist] = React.useState(0);

  const fetchCommLogs = React.useCallback(async () => {
    setIsLoadingCommLogs(true);
    try {
      const resp = await fetch(`/api/whatsapp/logs?t=${Date.now()}`);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.logs)) {
          setCommLogs(data.logs);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingCommLogs(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshIntentions();
      showNotification('Lista de intenções sincronizada!', 'success');
    } catch {
      showNotification('Erro ao atualizar intenções.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) setPullStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY > 0 && window.scrollY === 0) {
      const diff = e.touches[0].clientY - pullStartY;
      if (diff > 0) setPullDist(Math.min(diff * 0.5, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDist > 60 && !isRefreshing) {
      await handleRefresh();
    }
    setPullStartY(0);
    setPullDist(0);
  };

  React.useEffect(() => {
    if (monthBirthdays.month && selectedMonth === 0) {
      setSelectedMonth(monthBirthdays.month);
    }
  }, [monthBirthdays.month, selectedMonth]);

  const activeMonthBirthdays = React.useMemo(() => {
    const m = selectedMonth || monthBirthdays.month;
    return getBirthdaysByMonth(m).filter(p => !p.status || p.status === 'active');
  }, [selectedMonth, monthBirthdays.month, getBirthdaysByMonth]);

  const {
    morningSentToday,
    afternoonSentToday,
    wednesdaySentToday,
    undecidedActiveCount,
    isSending: isReminderSending,
    triggerManualReminder
  } = useIntentionsReminderSchedule({
    players,
    attendance,
    intentions,
    sendReminders,
    userRole,
    currentPlayer,
    showNotification
  });

  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeclining, setIsDeclining] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  React.useEffect(() => {
    if (!processingId && !isConfirming && !isDeclining) return;
    const watchdog = setTimeout(() => {
      setProcessingId(null);
      setIsConfirming(false);
      setIsDeclining(false);
    }, 3200);
    return () => clearTimeout(watchdog);
  }, [processingId, isConfirming, isDeclining]);

  const fireConfetti = React.useMemo(() => confetti.create(undefined, { useWorker: false, resize: true }), []);

  const celebratePresence = () => {
    const end = Date.now() + 1500;
    const colors = ['#F5C429', '#FFFFFF'];
    (function frame() {
      fireConfetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors });
      fireConfetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const isActiveStatus = (p: Player) => {
    const status = p.status || 'active';
    const isDM = Boolean(p.isDM || status === 'dm');
    return status === 'active' && !isDM;
  };

  const checkPlayerIntent = React.useCallback((p: Player) => {
    if (!intentions.responses) return null;
    if (intentions.responses[p.id]) return intentions.responses[p.id];
    if (p.uid && intentions.responses[p.uid]) return intentions.responses[p.uid];
    if (p.email && intentions.responses[p.email.toLowerCase()]) return intentions.responses[p.email.toLowerCase()];
    if (idToCanonicalId?.[p.id] && intentions.responses[idToCanonicalId[p.id]]) return intentions.responses[idToCanonicalId[p.id]];
    return null;
  }, [intentions.responses, idToCanonicalId]);

  const formatConfirmationTime = React.useCallback((timestamp?: number | null) => {
    if (!timestamp || isNaN(timestamp) || timestamp <= 0) return null;
    try {
      const date = new Date(timestamp);
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(date);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
      let weekDay = getPart('weekday').replace('.', '');
      if (weekDay) weekDay = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);
      return `${weekDay}, ${getPart('day')}/${getPart('month')} às ${getPart('hour')}:${getPart('minute')}`;
    } catch {
      return null;
    }
  }, []);

  // Lista de Confirmados (Unicidade Estrita de Sócios Ativos)
  const goingPlayers = React.useMemo(() => {
    const confirmed: Player[] = [];
    const addedIds = new Set<string>();

    const markPlayerAdded = (p: Player) => {
      addedIds.add(p.id);
      if (p.uid) {
        addedIds.add(p.uid);
        addedIds.add(p.uid.toLowerCase());
      }
      if (p.email) addedIds.add(p.email.toLowerCase());
      const canonical = idToCanonicalId?.[p.id];
      if (canonical) addedIds.add(canonical);
    };

    (players || []).filter(p => isActiveStatus(p)).forEach(p => {
      if (checkPlayerIntent(p) === 'GOING' && !addedIds.has(p.id)) {
        markPlayerAdded(p);
        confirmed.push(p);
      }
    });

    return confirmed.sort((a, b) => {
      const timeA = getPlayerConfirmationTime(a) || 0;
      const timeB = getPlayerConfirmationTime(b) || 0;
      return timeA - timeB;
    });
  }, [players, checkPlayerIntent, idToCanonicalId, getPlayerConfirmationTime]);

  const notGoingPlayers = React.useMemo(() => {
    return (players || []).filter(p => checkPlayerIntent(p) === 'NOT_GOING' && isActiveStatus(p));
  }, [players, checkPlayerIntent]);

  const undecidedPlayers = React.useMemo(() => {
    const goingSet = new Set(goingPlayers.map(p => idToCanonicalId?.[p.id] || p.id));
    const notGoingSet = new Set(notGoingPlayers.map(p => idToCanonicalId?.[p.id] || p.id));
    return (players || []).filter(p => {
      const canonicalId = idToCanonicalId?.[p.id] || p.id;
      return !goingSet.has(canonicalId) && !notGoingSet.has(canonicalId) && isActiveStatus(p);
    });
  }, [players, goingPlayers, notGoingPlayers, idToCanonicalId]);

  const getConfirmationPosition = (playerId: string) => {
    const existingIndex = goingPlayers.findIndex(gp => gp.id === playerId);
    if (existingIndex >= 0) {
      return { positionNumber: existingIndex + 1, totalConfirmed: goingPlayers.length };
    }
    return { positionNumber: goingPlayers.length + 1, totalConfirmed: goingPlayers.length + 1 };
  };

  const handleConfirm = async () => {
    if (!currentPlayer || isConfirming || isDeclining) return;
    setIsConfirming(true);
    setProcessingId(currentPlayer.id);
    try {
      await setIntent(currentPlayer.id, 'GOING');
      triggerHaptic('success');
      playFeedbackSound('success');
      const firstName = currentPlayer.name.split(' ')[0];
      showNotification(`Bora pra cima, ${firstName}! Presença confirmada! 🏐🔥`, 'success');
      celebratePresence();

      const { positionNumber, totalConfirmed } = getConfirmationPosition(currentPlayer.id);
      sendIntentionConfirmationPush({
        playerName: capitalizeName(currentPlayer.name),
        positionNumber,
        totalConfirmed,
        isSelf: true
      });

      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 3000);
    } catch (err: any) {
      triggerHaptic('error');
      showNotification(err.message || 'Erro ao confirmar presença.', 'error');
    } finally {
      setIsConfirming(false);
      setProcessingId(null);
    }
  };

  const handleConfirmPlayer = async (p: Player) => {
    if (isConfirming || isDeclining || processingId) return;
    if (checkPlayerIntent(p) === 'GOING') {
      showNotification(`${capitalizeName(p.name)} já está confirmado(a)! 🏐`, 'info');
      return;
    }

    setProcessingId(p.id);
    try {
      setIsConfirming(true);
      await setIntent(p.id, 'GOING');
      triggerHaptic('success');
      playFeedbackSound('success');
      showNotification(`Presença de ${capitalizeName(p.name)} confirmada! 🏐🔥`, 'success');
      celebratePresence();

      const { positionNumber, totalConfirmed } = getConfirmationPosition(p.id);
      sendIntentionConfirmationPush({
        playerName: capitalizeName(p.name),
        positionNumber,
        totalConfirmed,
        isSelf: currentPlayer?.id === p.id
      });
    } catch (err: any) {
      showNotification(err.message || 'Erro ao registrar presença.', 'error');
    } finally {
      setIsConfirming(false);
      setProcessingId(null);
    }
  };

  const handleConfirmIntent = async (pId: string, status: 'GOING' | 'NOT_GOING') => {
    if (processingId) return;
    setProcessingId(pId);
    try {
      await setIntent(pId, status);
      showNotification(status === 'GOING' ? 'Presença confirmada!' : 'Ausência registrada.', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao atualizar.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclinePlayer = React.useCallback((playerId: string) => {
    handleConfirmIntent(playerId, 'NOT_GOING');
  }, []);

  const handleDecline = async () => {
    if (!currentPlayer || isConfirming || isDeclining) return;
    setIsDeclining(true);
    setProcessingId(currentPlayer.id);
    try {
      await setIntent(currentPlayer.id, 'NOT_GOING');
      triggerHaptic('light');
      showNotification('Entendido. Sentiremos sua falta nessa quinta!', 'info');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao informar ausência.', 'error');
    } finally {
      setIsDeclining(false);
      setProcessingId(null);
    }
  };

  const handleResetIntent = async (playerId: string) => {
    if (processingId) return;
    setProcessingId(playerId);
    try {
      await resetIntent(playerId);
      showNotification('Resposta removida.', 'info');
    } catch {
      showNotification('Erro ao processar alteração.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const waitlistPlayers = (players || [])
    .filter(p => p.status === 'waitlist')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const searchNorm = norm(searchTerm);

  const filteredUndecided = undecidedPlayers.filter(
    p => norm(p.name).includes(searchNorm) || (p.email && norm(p.email).includes(searchNorm))
  );

  const quickSearchResults = React.useMemo(() => {
    if (!searchNorm) return [];
    return (players || [])
      .filter(p => p.status === 'active' && !p.isDM)
      .filter(p => norm(p.name).includes(searchNorm) || (p.email && norm(p.email).includes(searchNorm)))
      .slice(0, 10);
  }, [searchNorm, players]);

  const isGoing = currentPlayer ? checkPlayerIntent(currentPlayer) === 'GOING' : false;
  const isNotGoing = currentPlayer ? checkPlayerIntent(currentPlayer) === 'NOT_GOING' : false;

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

  const displayDate = intentions.targetDate || getNextThursday();
  const formattedDate = displayDate.split('-').reverse().slice(0, 2).join('/');

  const checkedInCountAmongGoing = React.useMemo(() => {
    const presentIds = new Set((attendance || []).map(a => a.id));
    return goingPlayers.filter(gp => presentIds.has(gp.id)).length;
  }, [goingPlayers, attendance]);

  const [forceLoad, setForceLoad] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setForceLoad(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!forceLoad && (!isLoaded || isInitialLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Carregando Lista de Quinta...</p>
      </div>
    );
  }

  return (
    <div 
      className="space-y-8 animate-in fade-in duration-500 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullDist > 0 || isRefreshing) && (
        <div className="flex items-center justify-center py-3 text-xs font-black uppercase text-amber-400 bg-zinc-900 border-b border-zinc-800 transition-all rounded-2xl">
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Sincronizando intenções...' : pullDist > 60 ? 'Solte para atualizar!' : 'Puxe para baixo para atualizar...'}
        </div>
      )}
      
      <div className="flex justify-end mb-2">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary/10 border border-brand-primary/30 rounded-2xl text-brand-primary text-xs font-black uppercase tracking-widest hover:bg-brand-primary hover:text-black transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Atualizando...' : 'Sincronizar Lista'}
        </button>
      </div>
      
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-primary p-8 sm:p-12 rounded-[3rem] border-8 border-black shadow-2xl text-center max-w-sm w-full">
            <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-5">
              <UserCheck className="w-10 h-10 text-brand-primary" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter text-black mb-1">Confirmado!</h3>
            <p className="text-black/80 font-black uppercase tracking-widest text-[10px]">Bora pro jogo, Guerreiro!</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-black rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-6 sm:p-10 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-stretch sm:items-center sm:flex-row justify-between gap-6">
          <div className="text-left flex-1">
            {currentPlayer && (
              <div className="mb-5">
                {(isGoing || isNotGoing) ? (
                  <div className={`flex items-center gap-4 p-4 rounded-3xl border-2 ${
                    isGoing ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary' : 'bg-red-500/10 border-red-500/40 text-red-500'
                  }`}>
                    <div className={`p-3 rounded-2xl ${isGoing ? 'bg-brand-primary text-black' : 'bg-red-500 text-white'}`}>
                      {isGoing ? <UserCheck className="w-6 h-6" /> : <UserX className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest">Status da sua Presença</p>
                      <p className="text-lg font-black uppercase text-white">
                        {isGoing ? 'Confirmado para o Jogo!' : 'Ausente nesta Quinta'}
                      </p>
                      <button 
                        onClick={() => handleResetIntent(currentPlayer.id)}
                        className="mt-1 text-[10px] font-black uppercase tracking-widest underline opacity-70 hover:opacity-100"
                      >
                        Alterar minha resposta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                      Olá, {capitalizeName(currentPlayer.name)}!
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 mb-2">
              <CalendarCheck className="w-8 h-8 text-brand-primary" />
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                Lista de Quinta
                <HelpTooltip 
                  title="Lista de Intenção da Quinta" 
                  content="Confirme sua participação. O horário original de confirmação fica protegido e garante sua ordem na lista."
                />
              </h2>
            </div>
            <p className="text-white/70 text-sm sm:text-base font-medium max-w-md">
              Confirme sua presença para o jogo de Quinta-feira, dia <span className="text-brand-primary font-bold">{formattedDate}</span>.
            </p>
          </div>
          
          {currentPlayer && !isGoing && !isNotGoing && (
            <div className="flex flex-col sm:flex-row items-stretch gap-3 bg-brand-secondary/30 p-4 rounded-[2rem] border border-brand-primary/20 w-full lg:w-auto">
              <button
                onClick={handleConfirm}
                disabled={isConfirming || isDeclining}
                className="flex-1 lg:flex-none flex flex-col items-center justify-center gap-1 px-8 py-5 rounded-3xl font-black uppercase tracking-wider text-sm bg-brand-primary text-black hover:bg-brand-primary/90 shadow-xl active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-6 h-6" />
                  <span className="text-lg">Vou Jogar!</span>
                </div>
                <span className="text-[9px] opacity-70 font-bold">Confirmar Presença</span>
              </button>
              <button
                onClick={handleDecline}
                disabled={isConfirming || isDeclining}
                className="flex-1 lg:flex-none flex flex-col items-center justify-center gap-1 px-8 py-5 rounded-3xl font-black uppercase tracking-wider text-sm bg-white text-black hover:bg-gray-100 shadow-xl active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <UserX className="w-6 h-6 text-red-600" />
                  <span className="text-lg">Não Vou</span>
                </div>
                <span className="text-[9px] opacity-70 font-bold">Informar Ausência</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logo */}
      <div className="flex justify-center -mt-6 sm:-mt-8 relative z-20">
        <Logo size="lg" className="border-4 border-black ring-8 ring-black" />
      </div>

      {/* Aniversariantes do Mês */}
      <div className="bg-zinc-900 border-2 border-brand-primary/20 rounded-[2.5rem] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Aniversariantes</h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Celebrando os Guerreiros</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-[150px]">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-xs font-black uppercase tracking-widest outline-none appearance-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2024, i))}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <ArrowRight className="w-3 h-3 rotate-90" />
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
              <Star className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-black text-white/60 uppercase">{activeMonthBirthdays.length}</span>
            </div>
          </div>
        </div>

        {activeMonthBirthdays.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {activeMonthBirthdays.map(player => (
              <div key={player.id} className="relative bg-black/40 border border-white/5 rounded-[1.75rem] p-3.5 flex flex-col items-center text-center">
                <div className="absolute -top-2 -right-1 z-10 bg-amber-500 text-black px-2 py-0.5 rounded-lg text-[9px] font-black">
                  {player.birthDate ? (
                    player.birthDate.split(/[-/]/)[0].length === 4 
                      ? player.birthDate.split(/[-/]/)[2]?.substring(0, 2) 
                      : player.birthDate.split(/[-/]/)[0]
                  ) : '??'}/{String(selectedMonth).padStart(2, '0')}
                </div>
                <div className="relative mb-2">
                  <PlayerAvatar player={player} size="md" />
                </div>
                <span className="text-xs font-black text-white uppercase truncate max-w-full">
                  {player.name ? player.name.split(' ')[0] : 'Sócio'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
            <p className="text-xs font-black text-white/30 uppercase tracking-widest">Nenhum aniversariante neste mês</p>
          </div>
        )}
      </div>

      {/* Painel do Administrador */}
      {isAdmin && (
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <Settings className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Comando Rápido da Lista</h3>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-4 bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/40">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar sócio para confirmar manualmente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-brand-secondary/50 border border-brand-primary/40 rounded-xl px-5 py-3 text-white text-sm outline-none"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    <UserX className="w-4 h-4" />
                  </button>
                )}
              </div>

              {searchTerm.trim().length > 0 && (
                <div className="mt-3 bg-brand-secondary border border-brand-primary/40 rounded-2xl overflow-hidden divide-y divide-white/5">
                  {quickSearchResults.map(p => {
                    const isPlayerGoing = checkPlayerIntent(p) === 'GOING';
                    return (
                      <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar player={p} size="sm" />
                          <p className="text-xs font-black text-white uppercase truncate">{capitalizeName(p.name)}</p>
                        </div>
                        {isPlayerGoing ? (
                          <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400">Confirmado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              handleConfirmPlayer(p);
                              setSearchTerm('');
                            }}
                            className="px-4 py-2 bg-brand-primary text-black rounded-xl font-black text-[10px] uppercase"
                          >
                            Confirmar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase">Piloto Automático</p>
                <p className="text-[10px] text-slate-500">Lembretes quarta e quinta ({undecidedActiveCount} indecisos)</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  disabled={isReminderSending || undecidedActiveCount === 0}
                  onClick={() => triggerManualReminder('wednesday')}
                  className="py-2 rounded-lg font-black uppercase text-[8px] bg-amber-500/20 text-amber-400 border border-amber-500/30 disabled:opacity-40"
                >
                  {wednesdaySentToday ? '✓ Quarta' : 'Quarta'}
                </button>
                <button
                  disabled={isReminderSending || undecidedActiveCount === 0}
                  onClick={() => triggerManualReminder('morning')}
                  className="py-2 rounded-lg font-black uppercase text-[8px] bg-white/5 text-white border border-white/10 disabled:opacity-40"
                >
                  {morningSentToday ? '✓ Manhã' : 'Manhã'}
                </button>
                <button
                  disabled={isReminderSending || undecidedActiveCount === 0}
                  onClick={() => triggerManualReminder('afternoon')}
                  className="py-2 rounded-lg font-black uppercase text-[8px] bg-brand-primary/20 text-brand-primary border border-brand-primary/30 disabled:opacity-40"
                >
                  {afternoonSentToday ? '✓ Tarde' : 'Tarde'}
                </button>
              </div>
            </div>

            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-300 uppercase">WhatsApp do Clube</p>
                  <p className="text-[10px] text-slate-500">Copia, envia ao grupo ou vê logs.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCommLogsModal(true);
                    fetchCommLogs();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase flex items-center gap-1 border border-white/10 transition-all shrink-0"
                  title="Abrir Central de Comunicações do WhatsApp"
                >
                  <MessageSquare className="w-3 h-3 text-emerald-400" />
                  Central
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    copyToWhatsApp(goingPlayers);
                    showNotification('Lista copiada para o WhatsApp!', 'success');
                  }}
                  className="py-2.5 px-2 rounded-xl font-black uppercase text-[9px] bg-emerald-500 text-black flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all active:scale-95"
                  title="Copiar Lista para área de transferência"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" /> Copiar ({goingPlayers.length})
                </button>
                <button
                  disabled={isSendingGroupList}
                  onClick={async () => {
                    setIsSendingGroupList(true);
                    try {
                      const ok = await sendListToWhatsAppGroup(goingPlayers);
                      if (ok) {
                        showNotification('Lista enviada para o grupo do WhatsApp!', 'success');
                      } else {
                        showNotification('Falha ao enviar para o grupo do WhatsApp.', 'error');
                      }
                    } catch {
                      showNotification('Erro ao enviar lista para o grupo.', 'error');
                    } finally {
                      setIsSendingGroupList(false);
                    }
                  }}
                  className="py-2.5 px-2 rounded-xl font-black uppercase text-[9px] bg-brand-primary text-black flex items-center justify-center gap-1.5 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-50"
                  title="Enviar Lista de Intenção agora para o grupo do WhatsApp do clube"
                >
                  <Send className={`w-3.5 h-3.5 shrink-0 ${isSendingGroupList ? 'animate-pulse' : ''}`} />
                  {isSendingGroupList ? 'Enviando...' : 'Enviar Grupo'}
                </button>
              </div>
            </div>

            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase">Cobrar Indecisos</p>
                <p className="text-[10px] text-slate-500">Copia o lembrete ou link público.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    copyReminder();
                    showNotification('Lembrete copiado!', 'success');
                  }}
                  className="py-2.5 rounded-xl font-black uppercase text-[9px] bg-white/10 text-white flex items-center justify-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Texto
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/?public=true`);
                    showNotification('Link público copiado!', 'success');
                  }}
                  className="py-2.5 rounded-xl font-black uppercase text-[9px] bg-brand-primary text-black flex items-center justify-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Link
                </button>
              </div>
            </div>

            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase">Zerar Ciclo</p>
                <p className="text-[10px] text-slate-500">Limpa todas as respostas atuais.</p>
              </div>
              <button
                onClick={() => {
                  showConfirmModal(
                    'Zerar Lista de Intenção',
                    'Tem certeza que deseja apagar todas as respostas da lista atual?',
                    async () => {
                      await clearIntentions();
                      showNotification('Lista zerada com sucesso!', 'success');
                    }
                  );
                }}
                className="w-full py-2.5 rounded-xl font-black uppercase text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Zerar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Colunas: Confirmados | Não Confirmados | Ausentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Confirmados */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-primary" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Confirmados</h3>
                <p className="text-[9px] font-bold text-emerald-400 uppercase">
                  {checkedInCountAmongGoing} na quadra • {Math.max(0, goingPlayers.length - checkedInCountAmongGoing)} faltam chegar
                </p>
              </div>
            </div>
            <span className="bg-brand-primary text-black text-xs font-black px-3 py-1 rounded-full">
              {goingPlayers.length}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-2 pr-1">
            <AnimatePresence mode="popLayout">
              {goingPlayers.map((p, i) => {
                const isCheckedIn = (attendance || []).some(a => a.id === p.id);
                const canReset = isAdmin || (!isCheckedIn && currentPlayer?.id === p.id);
                const timeStr = formatConfirmationTime(getPlayerConfirmationTime(p));
                return (
                  <ConfirmedPlayerItem
                    key={p.id}
                    player={p}
                    index={i}
                    isCheckedIn={isCheckedIn}
                    canReset={canReset}
                    isCurrentPlayer={currentPlayer?.id === p.id}
                    userRole={isAdmin ? 'ADMIN' : userRole}
                    isProcessing={processingId === p.id}
                    isOtherProcessing={Boolean(processingId && processingId !== p.id)}
                    confirmationTimeStr={timeStr}
                    onReset={handleResetIntent}
                    onMoveToAttendance={onMoveToAttendance}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Não Confirmados */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-slate-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Não Confirmados</h3>
            </div>
            <span className="bg-white/10 text-slate-400 text-xs font-black px-3 py-1 rounded-full">
              {undecidedPlayers.length}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-2 overflow-y-auto max-h-[520px] pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredUndecided.map((p, i) => {
                const canConfirm = isAdmin || currentPlayer?.id === p.id || !currentPlayer;
                const reminderSent = Boolean(intentions.remindersSent?.[p.id]);
                const hasPushToken = Boolean(p.fcmToken);
                const isAlreadyConfirmed = !isAdmin && checkPlayerIntent(p) === 'GOING';
                return (
                  <UndecidedPlayerItem
                    key={p.id}
                    player={p}
                    index={i}
                    canConfirm={canConfirm}
                    isProcessing={processingId === p.id}
                    isOtherProcessing={Boolean(processingId && processingId !== p.id)}
                    onConfirm={handleConfirmPlayer}
                    onDecline={handleDeclinePlayer}
                    reminderSent={reminderSent}
                    hasPushToken={hasPushToken}
                    isAlreadyConfirmed={isAlreadyConfirmed}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Ausentes */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-red-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Ausentes</h3>
            </div>
            <span className="bg-red-500/20 text-red-500 text-xs font-black px-3 py-1 rounded-full">
              {notGoingPlayers.length}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-2 overflow-y-auto max-h-[520px] pr-1 custom-scrollbar">
            {notGoingPlayers.length === 0 ? (
              <div className="py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-slate-500 text-xs font-bold uppercase">Nenhuma ausência registrada</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {notGoingPlayers.map((p, i) => {
                  const canReset = isAdmin || currentPlayer?.id === p.id;
                  return (
                    <NotGoingPlayerItem
                      key={p.id}
                      player={p}
                      index={i}
                      canReset={canReset}
                      isCurrentPlayer={currentPlayer?.id === p.id}
                      isProcessing={processingId === p.id}
                      isOtherProcessing={Boolean(processingId && processingId !== p.id)}
                      onReset={handleResetIntent}
                    />
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Fila de Espera de Novos Sócios */}
      {waitlistPlayers.length > 0 && (
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-amber-500 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-black text-white uppercase tracking-tighter">Fila de Espera do Clube</h3>
            </div>
            <span className="bg-amber-500 text-black text-xs font-black px-3.5 py-1 rounded-full">{waitlistPlayers.length} / 5</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {waitlistPlayers.map((p, i) => (
              <div key={p.id} className="bg-amber-500/5 p-3.5 rounded-2xl border border-amber-500/20 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-brand-secondary flex items-center justify-center text-amber-500 font-black text-xs border border-amber-500/30 shrink-0">
                    {i + 1}
                  </div>
                  <PlayerAvatar player={p} size="xs" />
                  <span className="text-white text-xs font-black uppercase truncate">{p.name}</span>
                </div>
                <span className="text-[9px] font-bold text-amber-500/70 uppercase shrink-0">Em Espera</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal da Central de Comunicações do WhatsApp */}
      {showCommLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                    Central de Comunicações WhatsApp
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Registros de envios da lista ao grupo, boas-vindas, lembretes e webhook do Guerreirinho
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchCommLogs}
                  disabled={isLoadingCommLogs}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase flex items-center gap-1.5 border border-white/10"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCommLogs ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => setShowCommLogsModal(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
              {isLoadingCommLogs && commLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase">
                  Carregando registros de comunicação...
                </div>
              ) : commLogs.length === 0 ? (
                <div className="py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <p className="text-slate-400 text-xs font-black uppercase">
                    Nenhum registro de comunicação encontrado
                  </p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Os envios de lista para o grupo, boas-vindas e confirmações via bot aparecerão aqui.
                  </p>
                </div>
              ) : (
                commLogs.map(log => {
                  const isSuccess = log.status === 'SUCCESS';
                  const dateFormatted = new Date(log.timestamp).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });
                  return (
                    <div
                      key={log.id}
                      className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                              isSuccess
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {isSuccess ? 'Enviado / Recebido' : 'Falha'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                            {log.type}
                          </span>
                          <span className="text-xs font-black text-white">{log.recipient}</span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">{dateFormatted}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-200">{log.summary}</p>
                      {log.errorDetail && (
                        <p className="text-[11px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                          Detalhe: {log.errorDetail}
                        </p>
                      )}
                      {log.messagePreview && (
                        <pre className="text-[11px] text-slate-400 bg-black/60 p-3 rounded-xl border border-white/5 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                          {log.messagePreview}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-white/10 bg-black/60 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                Total de registros: <strong className="text-white">{commLogs.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSendingGroupList}
                  onClick={async () => {
                    setIsSendingGroupList(true);
                    try {
                      const ok = await sendListToWhatsAppGroup(goingPlayers);
                      await fetchCommLogs();
                      if (ok) {
                        showNotification('Lista enviada para o grupo do WhatsApp!', 'success');
                      } else {
                        showNotification('Falha ao enviar para o grupo do WhatsApp.', 'error');
                      }
                    } finally {
                      setIsSendingGroupList(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-black font-black text-[10px] uppercase flex items-center gap-1.5 hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSendingGroupList ? 'Enviando...' : 'Enviar Lista Agora ao Grupo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCommLogsModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white font-black text-[10px] uppercase hover:bg-white/20"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};