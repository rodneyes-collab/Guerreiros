import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import { useIntentions } from '../src/hooks/useIntentions';
import { useBirthdays } from '../src/hooks/useBirthdays';
import { useStore } from '../store';
import { Logo } from '../src/components/Logo';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { ConfirmedPlayerItem, UndecidedPlayerItem, NotGoingPlayerItem } from '../src/components/IntentionPlayerItem';
import { CalendarCheck, Copy, BellRing, Settings, UserCheck, UserX, Clock, ArrowRight, RotateCcw, Zap, Star, Shield, Trash2, CheckCircle2, AlertTriangle, Flame, AlertCircle, MessageCircle, LogOut, RefreshCw } from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { Player } from '../types';
import { getFirestoreDateKey, getBrazilDay } from '../firebase';
import { capitalizeName } from '../utils/helpers';
import { fetchAttendanceHistory, calculateAttendanceStats } from '../src/services/attendanceService';

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

export const IntentionsView: React.FC<IntentionsViewProps> = ({ userRole, currentPlayer, onMoveToAttendance, showNotification }) => {
  const { intentions, isLoaded, setIntent, resetIntent, clearIntentions, toggleAutomation, sendReminders, copyToWhatsApp, copyReminder, getPlayerConfirmationTime, refreshIntentions } = useIntentions();
  const { players, attendance, preConfirmations, idToCanonicalId, showConfirmModal, isInitialLoading } = useStore(useShallow(state => ({players: state.players, attendance: state.attendance, preConfirmations: state.preConfirmations, idToCanonicalId: state.idToCanonicalId, showConfirmModal: state.showConfirmModal, isInitialLoading: state.isInitialLoading})));
  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(players);
  const [selectedMonth, setSelectedMonth] = React.useState<number>(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [pullStartY, setPullStartY] = React.useState(0);
  const [pullDist, setPullDist] = React.useState(0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshIntentions();
      showNotification('Lista de intenções atualizada com sucesso!', 'success');
    } catch (err) {
      showNotification('Erro ao atualizar intenções.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY > 0 && window.scrollY === 0) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - pullStartY;
      if (diff > 0) {
        setPullDist(Math.min(diff * 0.5, 100));
      }
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
    const list = getBirthdaysByMonth(m);
    return list.filter(p => !p.status || p.status === 'active');
  }, [selectedMonth, monthBirthdays.month, getBirthdaysByMonth]);

  const {
    isGameDay,
    morningSentToday,
    afternoonSentToday,
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

  const getWhatsAppLink = (player: Player) => {
    let clean = (player.phone || '').replace(/\D/g, '');
    if (!clean) return '';
    if (clean.length === 10 || clean.length === 11) {
      clean = '55' + clean;
    }
    const msg = `Olá, *${capitalizeName(player.name)}*! 🏐 Passando para lembrar de confirmar sua presença ou ausência para a próxima partida no Guerreiros App!\n\nConfirme em 5 segundos no link:\n${window.location.origin}/?public=true\n\nValeu!`;
    return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
  };

  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeclining, setIsDeclining] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  // Create confetti instance
  const fireConfetti = React.useMemo(() => confetti.create(undefined, { useWorker: false, resize: true }), []);

  const celebratePresence = () => {
    const end = Date.now() + 2 * 1000;
    const colors = ['#F5C429', '#FFFFFF'];

    (function frame() {
      fireConfetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      fireConfetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-3 h-3 text-white/20" />;
    }
  };

  const [showSuccessOverlay, setShowSuccessOverlay] = React.useState(false);

  const getConfirmationPosition = (playerId: string) => {
    const existingIndex = goingPlayers.findIndex(gp => gp.id === playerId);
    if (existingIndex >= 0) {
      return {
        positionNumber: existingIndex + 1,
        totalConfirmed: goingPlayers.length
      };
    }
    return {
      positionNumber: goingPlayers.length + 1,
      totalConfirmed: goingPlayers.length + 1
    };
  };

  const handleConfirm = async () => {
    if (currentPlayer && !isConfirming && !isDeclining) {
      setIsConfirming(true);
      setProcessingId(currentPlayer.id);
      try {
        await setIntent(currentPlayer.id, 'GOING');
        
        // Feedback sensorial
        triggerHaptic('success');
        playFeedbackSound('success');
        
        const firstName = currentPlayer.name.split(' ')[0];
        showNotification(`Bora pra cima, ${firstName}! Sua presença foi confirmada com sucesso! 🏐🔥`, 'success');
        celebratePresence();

        // Dispara notificação push nativa com a posição ordinal e o total da lista
        const { positionNumber, totalConfirmed } = getConfirmationPosition(currentPlayer.id);
        sendIntentionConfirmationPush({
          playerName: capitalizeName(currentPlayer.name),
          positionNumber,
          totalConfirmed,
          isSelf: true
        });

        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 3500);
      } catch (err: any) {
        triggerHaptic('error');
        playFeedbackSound('error');
        showNotification(err.message || 'Erro ao confirmar presença. Tente novamente.', 'error');
      } finally {
        setIsConfirming(false);
        setProcessingId(null);
      }
    }
  };

  const handleConfirmPlayer = async (p: Player) => {
    if (isConfirming || isDeclining || processingId) return;
    
    // Validação de segurança: se o sócio já estiver confirmado, não prossegue
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
      
      showNotification(`Presença de ${capitalizeName(p.name)} confirmada com sucesso! 🏐🔥`, 'success');
      celebratePresence();

      // Dispara notificação push nativa com a posição ordinal e o total da lista
      const { positionNumber, totalConfirmed } = getConfirmationPosition(p.id);
      sendIntentionConfirmationPush({
        playerName: capitalizeName(p.name),
        positionNumber,
        totalConfirmed,
        isSelf: currentPlayer?.id === p.id
      });

      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 3500);
    } catch (err: any) {
      triggerHaptic('error');
      playFeedbackSound('error');
      console.error(err);
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
      if (status === 'GOING') {
        celebratePresence();
        const player = (players || []).find(p => p.id === pId);
        if (player) {
          const { positionNumber, totalConfirmed } = getConfirmationPosition(pId);
          sendIntentionConfirmationPush({
            playerName: capitalizeName(player.name),
            positionNumber,
            totalConfirmed,
            isSelf: currentPlayer?.id === pId
          });
        }
      }
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
    if (currentPlayer && !isConfirming && !isDeclining) {
      setIsDeclining(true);
      setProcessingId(currentPlayer.id);
      try {
        await setIntent(currentPlayer.id, 'NOT_GOING');
        
        // Feedback sensorial
        triggerHaptic('light');
        playFeedbackSound('success');
        
        showNotification('Entendido. Sentiremos sua falta nessa quinta!', 'info');
        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 3500);
      } catch (err: any) {
        triggerHaptic('error');
        playFeedbackSound('error');
        showNotification(err.message || 'Erro ao informar ausência. Tente novamente.', 'error');
      } finally {
        setIsDeclining(false);
        setProcessingId(null);
      }
    }
  };

  const handleResetIntent = async (playerId: string) => {
    if (processingId) return;
    setProcessingId(playerId);
    try {
      await resetIntent(playerId);
      showNotification('Ação processada com sucesso.', 'info');
    } catch (err: any) {
      showNotification('Erro ao processar alteração.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const [attendancePercent, setAttendancePercent] = React.useState<Record<string, number>>({});
  
  React.useEffect(() => {
    let active = true;
    const loadStats = async () => {
      try {
        const history = await fetchAttendanceHistory();
        if (!active) return;
        const stats = calculateAttendanceStats(history, players);
        const mapping: Record<string, number> = {};
        stats.forEach(s => {
          mapping[s.playerId] = s.percentage;
        });
        setAttendancePercent(mapping);
      } catch (err) {
        console.error("Erro ao carregar estatísticas de assiduidade na lista de intenção", err);
      }
    };
    if (players.length > 0) {
      loadStats();
    }
    return () => {
      active = false;
    };
  }, [players]);

  const getPlayerAttendance = (playerId: string) => {
    const pct = attendancePercent[playerId];
    if (pct === undefined || isNaN(pct)) {
      const p = players.find(x => x.id === playerId);
      if (p) {
        const mp = p.matchesPlayed || 0;
        if (mp > 10) return 90;
        if (mp > 5) return 75;
        if (mp > 0) return 50;
      }
      return 0;
    }
    return Math.round(pct);
  };

  const getEvasionBadge = (player: Player) => {
    const pct = getPlayerAttendance(player.id);
    const level = calculateEvasionLevel(player, pct);
    
    const config = {
      low: { icon: Shield, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20', label: 'Risco de Sair: Baixo', tooltip: 'Membro ativo com excelente assiduidade' },
      medium: { icon: AlertTriangle, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20', label: 'Risco de Sair: Moderado', tooltip: 'Presença regular, risco moderado de evasão' },
      high: { icon: Flame, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20', label: 'Risco de Sair: Alto', tooltip: 'Atenção: frequência reduzindo ou instável' },
      critical: { icon: AlertCircle, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20', label: 'Risco de Sair: Crítico', tooltip: 'Urgente: risco de abandono ou saída iminente do clube' },
    };

    const { icon: Icon, color, label, tooltip } = config[level];

    return (
      <span 
        className={`group inline-flex items-center justify-center p-1.5 rounded-full border ${color} cursor-help transition-all relative select-none`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        
        {/* Custom Tooltip */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
          <span className="text-brand-primary font-black uppercase tracking-wider block mb-1">{label}</span>
          <span>{tooltip}</span>
          {/* Tooltip arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
        </span>
      </span>
    );
  };

  const getAttendanceBadge = (playerId: string) => {
    const pct = getPlayerAttendance(playerId);
    let colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20";
    let desc = "Assiduidade Excelente";
    if (pct < 50) {
      colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20";
      desc = "Assiduidade Baixa";
    } else if (pct < 75) {
      colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20";
      desc = "Assiduidade Regular";
    }

    return (
      <span 
        className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${colorClass} text-[10px] font-bold cursor-help transition-all relative select-none`}
      >
        <CalendarCheck className="w-3.5 h-3.5 shrink-0 text-brand-primary" />
        <span className="font-mono text-[9px] font-black">{pct}%</span>
        
        {/* Custom Tooltip */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
          {desc}: {pct}% de presença no clube
          {/* Tooltip arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
        </span>
      </span>
    );
  };

  const [searchTerm, setSearchTerm] = React.useState('');

  const isActiveStatus = (p: Player) => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM && p.status !== 'dm';

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
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekDay = weekdays[date.getDay()];
    return `${weekDay}, ${day}/${month} às ${hours}:${minutes}`;
  }, []);

  const goingPlayers = React.useMemo(() => {
    const confirmed: Player[] = [];
    const addedIds = new Set<string>();

    // 1. Check known active players
    (players || []).filter(p => p.status === 'active' || (!p.status && p.status !== 'inactive')).forEach(p => {
      const intent = checkPlayerIntent(p);
      if (intent === 'GOING' && !addedIds.has(p.id)) {
        addedIds.add(p.id);
        confirmed.push(p);
      }
    });

    // 2. Include any responses where GOING is recorded for IDs not yet matching known players (e.g. guests / newly added mobile users)
    Object.entries(intentions.responses || {}).forEach(([respId, status]) => {
      if (status === 'GOING' && !addedIds.has(respId)) {
        const canonical = idToCanonicalId?.[respId];
        if (canonical && addedIds.has(canonical)) return;

        // Check if player exists in preConfirmations
        const prePlayer = (preConfirmations || []).find(pc => pc.id === respId);
        if (prePlayer) {
          addedIds.add(respId);
          confirmed.push(prePlayer);
          return;
        }

        // Synthesize guest or member
        const guestName = respId.startsWith('guest_') ? respId.replace('guest_', 'Convidado ') : respId;
        addedIds.add(respId);
        confirmed.push({
          id: respId,
          name: guestName,
          status: 'guest',
          elo: 1200,
          matchesPlayed: 0
        } as Player);
      }
    });

    return confirmed.sort((a, b) => {
      const timeA = getPlayerConfirmationTime(a) || 0;
      const timeB = getPlayerConfirmationTime(b) || 0;
      return timeA - timeB;
    });
  }, [players, intentions.responses, idToCanonicalId, preConfirmations, checkPlayerIntent, getPlayerConfirmationTime]);

  const notGoingPlayers = React.useMemo(() => {
    return (players || []).filter(p => checkPlayerIntent(p) === 'NOT_GOING');
  }, [players, checkPlayerIntent]);

  const undecidedPlayers = React.useMemo(() => {
    const goingSet = new Set(goingPlayers.map(p => {
      // Usar o ID canônico se disponível para garantir que sócios confirmados via alias sumam da lista
      return idToCanonicalId?.[p.id] || p.id;
    }));
    const notGoingSet = new Set(notGoingPlayers.map(p => idToCanonicalId?.[p.id] || p.id));
    
    return (players || []).filter(p => {
      const canonicalId = idToCanonicalId?.[p.id] || p.id;
      return !goingSet.has(canonicalId) && !notGoingSet.has(canonicalId) && isActiveStatus(p);
    });
  }, [players, goingPlayers, notGoingPlayers, idToCanonicalId]);

  const waitlistPlayers = players
    .filter(p => p.status === 'waitlist')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const searchNorm = norm(searchTerm);

  const filteredUndecided = undecidedPlayers.filter(p => 
    norm(p.name).includes(searchNorm) || (p.email && norm(p.email).includes(searchNorm))
  );

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

  if (!isLoaded || isInitialLoading || (players.length === 0 && Object.keys(intentions?.responses || {}).length > 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Carregando Lista de Sócios...</p>
      </div>
    );
  }

  return (
    <div 
      className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative"
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
          {isRefreshing ? 'Atualizando...' : 'Atualizar / Sincronizar Intenções'}
        </button>
      </div>
      
      {/* Success Animation Overlay */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-brand-primary p-8 sm:p-12 rounded-[3rem] border-8 border-black shadow-[0_0_100px_rgba(245,196,41,0.5)] text-center animate-in zoom-in duration-500 max-w-sm w-full">
            <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
              {isGoing ? (
                <UserCheck className="w-12 h-12 text-brand-primary" />
              ) : (
                <UserX className="w-12 h-12 text-red-500" />
              )}
            </div>
            <h3 className="text-3xl font-black uppercase tracking-tighter text-black mb-2">
              {isGoing ? 'Confirmado!' : 'Registrado!'}
            </h3>
            <p className="text-black/80 font-black uppercase tracking-widest text-[10px]">
              {isGoing ? 'Bora pro jogo, Guerreiro!' : 'Até a próxima partida!'}
            </p>
          </div>
        </div>
      )}

      {/* Header - Accent Border */}
      <div className="bg-black rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col items-stretch sm:items-center sm:flex-row justify-between gap-8">
          <div className="text-left flex-1">
            {currentPlayer && (
              <div className="mb-6">
                {(isGoing || isNotGoing) ? (
                  <div className={`flex items-center gap-4 p-5 rounded-3xl border-2 animate-in zoom-in duration-500 ${
                    isGoing 
                      ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary' 
                      : 'bg-red-500/10 border-red-500/40 text-red-500'
                  }`}>
                    <div className={`p-3 rounded-2xl ${isGoing ? 'bg-brand-primary text-black' : 'bg-red-500 text-white'}`}>
                      {isGoing ? <UserCheck className="w-6 h-6" /> : <UserX className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-0.5">Status da sua Presença</p>
                      <p className="text-xl font-black uppercase tracking-tight text-white">
                        {isGoing ? 'Confirmado para o Jogo!' : 'Ausente nesta Quinta'}
                      </p>
                      <button 
                        onClick={() => handleResetIntent(currentPlayer.id)}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest underline opacity-60 hover:opacity-100 transition-opacity"
                      >
                        Clique aqui para alterar sua resposta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                      Boas Vindas, {capitalizeName(currentPlayer.name)}!
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <CalendarCheck className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary" />
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                Lista de Quinta
                <HelpTooltip 
                  title="Lista de Presença" 
                  content="Confirme sua participação. A ordem de chegada e o tempo de espera definem a prioridade para entrar em quadra. Jogadores que confirmam primeiro têm prioridade na montagem dos times."
                />
              </h2>
            </div>
            <p className="text-white/70 text-sm sm:text-lg font-medium max-w-md">
              Prepare o uniforme! Confirme sua presença para o jogo na Próxima Quinta dia <span className="text-brand-primary font-bold">
                {formattedDate}
              </span>.
            </p>
          </div>
          
          {/* Player Actions */}
          {currentPlayer && !isGoing && !isNotGoing && (
              <div className="flex flex-col sm:flex-row items-stretch gap-4 bg-brand-secondary/30 p-4 sm:p-6 rounded-[2rem] border border-brand-primary/20 w-full lg:w-auto">
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming || isDeclining}
                  className={`flex-1 lg:flex-none flex flex-col items-center justify-center gap-1.5 px-8 py-6 rounded-3xl font-black uppercase tracking-[0.15em] text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black ${
                    isGoing 
                      ? 'bg-brand-primary text-black ring-4 ring-brand-primary/20' 
                      : 'bg-brand-primary text-black hover:bg-brand-primary/90 shadow-[0_0_30px_rgba(245,196,41,0.2)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isConfirming ? (
                      <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserCheck className="w-7 h-7" />
                    )}
                    <span className="text-xl">Vou Jogar!</span>
                  </div>
                  <span className="text-[9px] opacity-70 font-bold">Confirmar Presença</span>
                </button>
                <button
                  onClick={handleDecline}
                  disabled={isConfirming || isDeclining}
                  className={`flex-1 lg:flex-none flex flex-col items-center justify-center gap-1.5 px-8 py-6 rounded-3xl font-black uppercase tracking-[0.15em] text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black ${
                    isNotGoing 
                      ? 'bg-white text-black ring-4 ring-white/20' 
                      : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isDeclining ? (
                      <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserX className="w-7 h-7 text-red-600" />
                    )}
                    <span className="text-xl">Não Vou</span>
                  </div>
                  <span className="text-[9px] opacity-70 font-bold">Informar Ausência</span>
                </button>
              </div>
          )}
        </div>
      </div>

      {/* Club Logo Display */}
      <div className="flex justify-center -mt-6 sm:-mt-10 relative z-20">
        <Logo size="lg" className="border-4 border-black ring-8 ring-black" />
      </div>
      <div className="bg-zinc-900 border-2 border-brand-primary/20 rounded-[2.5rem] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Flame className="w-7 h-7 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">
                Aniversariantes
              </h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Celebrando os Guerreiros</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-[160px]">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all appearance-none cursor-pointer"
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
            
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
              <Star className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                {activeMonthBirthdays.length} Sócios
              </span>
            </div>
          </div>
        </div>

        {activeMonthBirthdays.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {activeMonthBirthdays.map(player => {
              if (!player || !player.id) return null;
              return (
                <div 
                  key={player.id} 
                  className="group relative bg-black/40 border border-white/5 rounded-[2rem] p-4 flex flex-col items-center text-center transition-all hover:border-amber-500/30 hover:bg-amber-500/[0.02]"
                >
                  {/* Date Badge */}
                  <div className="absolute -top-2 -right-1 z-10 bg-amber-500 text-black px-2.5 py-1 rounded-xl text-[10px] font-black shadow-lg transform rotate-3 group-hover:rotate-0 transition-transform">
                    {player.birthDate ? (
                      player.birthDate.split(/[-/]/)[0].length === 4 
                        ? player.birthDate.split(/[-/]/)[2]?.substring(0, 2) 
                        : player.birthDate.split(/[-/]/)[0]
                    ) : '??'} / {String(selectedMonth).padStart(2, '0')}
                  </div>

                  <div className="relative mb-3">
                    <PlayerAvatar player={player} size="lg" />
                    <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-1.5 shadow-xl">
                      <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-[10px] text-black">
                        🎂
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-amber-500 transition-colors">
                    {player.name ? player.name.split(' ')[0] : 'Sócio'}
                  </span>
                  <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">
                    Guerreiro
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center bg-black/20 rounded-3xl border border-dashed border-white/5">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <UserX className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-xs font-black text-white/30 uppercase tracking-widest">Nenhum aniversariante neste mês</p>
          </div>
        )}
      </div>


      {/* WhatsApp / Evolution API Action Buttons */}
      {userRole === 'ADMIN' && (
            <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Painel do Administrador</h3>
            </div>
            <span className="text-[10px] font-black text-brand-primary/50 uppercase tracking-widest">Acesso Restrito</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Search Box for Quick Confirmation */}
            <div className="sm:col-span-4 bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 mb-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Buscar sócio para confirmar manualmente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-brand-secondary/50 border border-brand-primary/40 rounded-2xl px-6 py-4 text-white text-base focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all placeholder:text-white/20"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Piloto Automático</p>
                <p className="text-[10px] text-slate-500">Envia lembretes automáticos na quarta e quinta-feira.</p>
              </div>
              <button
                onClick={() => toggleAutomation(!intentions.automationEnabled)}
                className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                  intentions.automationEnabled
                    ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30'
                    : 'bg-white/5 text-slate-400 border border-brand-primary/40 hover:bg-white/10'
                }`}
              >
                {intentions.automationEnabled ? 'Ligado' : 'Desligado'}
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Push Automático (Dia de Jogo)</p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                    {undecidedActiveCount} indeciso(s)
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">
                  Disparo automático pela manhã (10h) e à tarde (16h - última chamada).
                </p>
                <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
                  <span className="flex items-center gap-1">
                    {morningSentToday ? '🟢 Manhã enviada' : '⚪ Manhã pendente'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    {afternoonSentToday ? '🟢 Tarde enviada' : '⚪ Tarde pendente'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isReminderSending || undecidedActiveCount === 0}
                  onClick={() => triggerManualReminder('morning')}
                  className="py-2.5 px-2 rounded-xl font-black uppercase tracking-wider text-[9px] bg-white/5 text-white border border-brand-primary/40 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <BellRing className="w-3 h-3" />
                  Push Manhã
                </button>
                <button
                  disabled={isReminderSending || undecidedActiveCount === 0}
                  onClick={() => triggerManualReminder('afternoon')}
                  className="py-2.5 px-2 rounded-xl font-black uppercase tracking-wider text-[9px] bg-brand-primary/20 text-brand-primary border border-brand-primary/40 hover:bg-brand-primary hover:text-black transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Clock className="w-3 h-3" />
                  Push Tarde
                </button>
              </div>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Copiar Lembrete</p>
                <p className="text-[10px] text-slate-500">Copia o texto de cobrança para o WhatsApp.</p>
              </div>
              <button
                onClick={() => {
                  copyReminder();
                  showNotification('Lembrete copiado para o WhatsApp!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 text-white border border-brand-primary/40 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Lembrete
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Exportar Lista</p>
                <p className="text-[10px] text-slate-500">Copia a lista formatada para colar no WhatsApp.</p>
              </div>
              <button
                onClick={() => {
                  copyToWhatsApp();
                  showNotification('Lista copiada para a área de transferência!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500 hover:text-black transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Lista
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Link de Presença</p>
                <p className="text-[10px] text-slate-500">Copia o link público de confirmação sem login para o grupo.</p>
              </div>
              <button
                onClick={() => {
                  const link = `${window.location.origin}/?public=true`;
                  navigator.clipboard.writeText(link)
                    .then(() => showNotification('Link público copiado com sucesso!', 'success'))
                    .catch(() => showNotification('Erro ao copiar o link. Tente copiar manualmente.', 'error'));
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-brand-primary text-black hover:scale-105 transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Link Público
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Zerar Lista</p>
                <p className="text-[10px] text-slate-500">Apaga todas as respostas da lista atual.</p>
              </div>
              <button
                onClick={() => {
                  showConfirmModal(
                    'Zerar Lista de Intenção',
                    'Tem certeza que deseja apagar todas as respostas e zerar a lista atual? Esta ação não pode ser desfeita.',
                    () => {
                      clearIntentions();
                      showNotification('Lista zerada com sucesso!', 'success');
                    }
                  );
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                Zerar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Going - EFEITO 4: Accent Border (Borda de Destaque Sólida) */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Confirmados</h3>
            </div>
            <span className="bg-brand-primary text-black text-xs font-black px-3 py-1 rounded-full">{goingPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 pr-1">
            <AnimatePresence mode="popLayout">
              {goingPlayers.map((p, i) => {
                const isCheckedIn = (attendance || []).some(a => a.id === p.id);
                const canReset = !isCheckedIn && (currentPlayer?.id === p.id || userRole === 'ADMIN');
                const timeStr = formatConfirmationTime(getPlayerConfirmationTime(p));
                return (
                  <ConfirmedPlayerItem
                    key={p.id}
                    player={p}
                    index={i}
                    isCheckedIn={isCheckedIn}
                    canReset={canReset}
                    isCurrentPlayer={currentPlayer?.id === p.id}
                    userRole={userRole}
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

        {/* Undecided */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-slate-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Não Confirmados</h3>
            </div>
            <span className="bg-white/10 text-slate-400 text-xs font-black px-3 py-1 rounded-full">{undecidedPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredUndecided.map((p, i) => {
                const canConfirm = userRole === 'ADMIN' || currentPlayer?.id === p.id || !currentPlayer;
                const reminderSent = Boolean(intentions.remindersSent?.[p.id]);
                const hasPushToken = Boolean(p.fcmToken);
                const isAlreadyConfirmed = checkPlayerIntent(p) === 'GOING';
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

        {/* Not Going */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-red-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Ausentes</h3>
            </div>
            <span className="bg-red-500/20 text-red-500 text-xs font-black px-3 py-1 rounded-full">{notGoingPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            {notGoingPlayers.length === 0 ? (
              <div className="col-span-full py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-slate-500 text-sm font-medium italic">Nenhuma ausência registrada.</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {notGoingPlayers.map((p, i) => {
                  const canReset = currentPlayer?.id === p.id || userRole === 'ADMIN';
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

      {/* Waitlist Section */}
      {waitlistPlayers.length > 0 && (
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-amber-500 p-8 sm:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-500" />
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Fila de Espera do Clube</h3>
            </div>
            <span className="bg-amber-500 text-black text-xs font-black px-4 py-1.5 rounded-full">{waitlistPlayers.length} / 5</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {waitlistPlayers.map((p, i) => (
              <div key={p.id} className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 flex items-center justify-between group hover:border-amber-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-secondary flex items-center justify-center text-amber-500 font-black text-xs border border-amber-500/30">
                    {i + 1}
                  </div>
                  <span className="text-white text-sm font-black uppercase tracking-tight">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500/60 uppercase">Em Espera</span>
                </div>
              </div>
            ))}
          </div>
          
          <p className="mt-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
            A lista de espera segue a ordem de cadastro. Quando um sócio ativo sair, o primeiro da lista entra automaticamente.
          </p>
        </div>
      )}

    </div>
  );
};
