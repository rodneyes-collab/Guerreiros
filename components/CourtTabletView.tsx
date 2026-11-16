import React, { useState, useEffect, useMemo } from 'react';
import { 
  Tv, 
  Maximize2, 
  Minimize2, 
  Swords, 
  Clock, 
  Users, 
  Sparkles, 
  ShieldCheck, 
  Flame,
  AlertTriangle,
  Check,
  ArrowLeftRight,
  Lock,
  Unlock,
  Columns2,
  Rows2,
  LogOut,
  Sun
} from 'lucide-react';
import { useStore } from '../store';
import { db, doc, setDoc, deleteDoc, getFirestoreDateKey } from '../firebase';
import { Player } from '../types';
import {
  calculateCompositePerformanceRating,
  calculateTeamTotalIC,
  verifyClubGenerationRules,
  isFemalePlayer,
  getPriorityQueue,
  enrichPlayerImmutably,
  generateTeams
} from '../utils/teamLogic';
import { formatTime, getAttendanceArrivalPosition, cleanObject } from '../utils/helpers';
import { MatchQuickSwapModal } from '../src/components/MatchQuickSwapModal';
import { triggerHaptic } from '../src/utils/feedback';
import { useWakeLock } from '../src/hooks/useWakeLock';

interface CourtTabletViewProps {
  onBack?: () => void;
}

const brDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Componente isolado para Relógio, Cronômetro e Monitoramento de Horário de Saída (departureTime)
 */
const LiveClockAndMatchTimer: React.FC<{
  matchStartTime?: number | null;
  mode: 'header-clock' | 'match-timer';
  onMinuteTick?: (hhmm: string) => void;
}> = ({ matchStartTime, mode, onMinuteTick }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (onMinuteTick && new Date(current).getSeconds() === 0) {
        const hhmm = new Date(current).toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit'
        });
        onMinuteTick(hhmm);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [onMinuteTick]);

  if (mode === 'header-clock') {
    const timeStr = new Date(now).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return (
      <div className="hidden sm:flex flex-col items-end px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
        <span className="text-lg font-black font-mono text-brand-primary tracking-widest">
          {timeStr}
        </span>
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Hora Local</span>
      </div>
    );
  }

  const elapsed = matchStartTime ? Math.max(0, Math.floor((now - matchStartTime) / 1000)) : 0;
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-brand-primary uppercase tracking-wider font-mono">
        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span>{formatTime(elapsed)}</span>
      </div>
      <span className="text-[8px] sm:text-[9px] font-bold text-white/40 uppercase tracking-widest">Tempo</span>
    </div>
  );
};

export const CourtTabletView: React.FC<CourtTabletViewProps> = ({ onBack }) => {
  const generationResult = useStore(state => state.generationResult);
  const nextMatchPreview = useStore(state => state.nextMatchPreview);
  const attendance = useStore(state => state.attendance);
  const setAttendance = useStore(state => state.setAttendance);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const systemMetadata = useStore(state => state.systemMetadata);
  const setViewMode = useStore(state => state.setViewMode);
  const showNotification = useStore(state => state.showNotification);
  const userRole = useStore(state => state.userRole);

  // 1. Mantém a tela do celular/tablet sempre acesa na quadra
  const { isWakeLockActive } = useWakeLock(true);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isQuickSwapModalOpen, setIsQuickSwapModalOpen] = useState(false);
  const [isCompactSideBySide, setIsCompactSideBySide] = useState(true);
  const [isCourtLocked, setIsCourtLocked] = useState(false);
  const [selectedSwapId, setSelectedSwapId] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<'CURRENT' | 'NEXT' | 'BOTH'>('BOTH');
  const [currentHHMM, setCurrentHHMM] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const rules = useMemo(() => {
    if (!generationResult) return null;
    return verifyClubGenerationRules(generationResult);
  }, [generationResult]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Partidas concluídas hoje (Fonte da Verdade)
  const todayMatches = useMemo(() => {
    const todayKey = getFirestoreDateKey();
    return (matches || []).filter(m => {
      if (!m) return false;
      const mDate = m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
      if (mDate === todayKey) return true;
      if (m.timestamp) {
        return brDateFormatter.format(new Date(m.timestamp)) === todayKey;
      }
      return false;
    });
  }, [matches]);

  const todayCompletedCount = todayMatches.length;
  const maxDailyNumber = todayMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
  const currentMatchNumber = generationResult
    ? Math.max(todayCompletedCount + 1, maxDailyNumber + 1)
    : Math.max(todayCompletedCount, maxDailyNumber);

  const getPlayerData = (id: string) => players.find(p => p.id === id);

  const activeInCurrentMatchIds = useMemo(() => {
    const set = new Set<string>();
    if (generationResult) {
      if (generationResult.teamA?.setter) set.add(generationResult.teamA.setter.id);
      (generationResult.teamA?.players || []).forEach((p: Player) => p?.id && set.add(p.id));
      if (generationResult.teamB?.setter) set.add(generationResult.teamB.setter.id);
      (generationResult.teamB?.players || []).forEach((p: Player) => p?.id && set.add(p.id));
    }
    return set;
  }, [generationResult]);

  // Fila de Espera ordenada pela Fila Inteligente
  const waitingPlayers = useMemo(() => {
    const benchRaw = (attendance || [])
      .filter(p => p && p.id && p.status !== 'left' && !p.isDM && !activeInCurrentMatchIds.has(p.id))
      .map(p => enrichPlayerImmutably(p, players, attendance));

    const { topPlayers, remainingPlayers } = getPriorityQueue(benchRaw, benchRaw.length, 2);
    return [...topPlayers, ...remainingPlayers];
  }, [attendance, players, activeInCurrentMatchIds]);

  /**
   * 2. Alerta Inteligente de Horário de Saída (departureTime):
   * Identifica atletas presentes cujo horário agendado de saída já chegou ou está a <= 10 minutos
   */
  const playersNearDeparture = useMemo(() => {
    const toMinutes = (hhmm: string) => {
      const [h, m] = (hhmm || '').split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };
    const nowMins = toMinutes(currentHHMM);
    if (nowMins === null) return [];

    return (attendance || []).filter(p => {
      if (!p || !p.departureTime || p.status === 'left' || p.isDM) return false;
      const depMins = toMinutes(p.departureTime);
      if (depMins === null) return false;
      // Alerta quando faltam 10 minutos ou quando o horário já passou
      return nowMins >= depMins - 10;
    });
  }, [attendance, currentHHMM]);

  const handleConfirmPlayerDeparture = async (player: Player) => {
    try {
      const dateKey = getFirestoreDateKey();
      setAttendance(attendance.filter(a => a.id !== player.id));
      await deleteDoc(doc(db, 'attendance', dateKey, 'players', player.id));
      showNotification(`Saída de ${player.name} confirmada! Fila atualizada.`, 'info');
    } catch {
      showNotification('Erro ao registrar saída.', 'error');
    }
  };

  /**
   * 3. Projeção Automática Silenciosa da Próxima Partida (effectiveNextMatchPreview):
   * Se nextMatchPreview não foi salvo manualmente, projeta em memória como ficará a próxima partida
   * assim que a partida atual terminar (simulando os 12 em quadra como playedLastMatch = true
   * e os que estão no banco como playedLastMatch = false).
   */
  const effectiveNextMatchPreview = useMemo(() => {
    if (nextMatchPreview) return nextMatchPreview;
    const activeAttendance = (attendance || []).filter(
      p => p && p.id && p.status !== 'left' && !p.isDM
    );
    if (!generationResult || activeAttendance.length < 12) return null;

    try {
      const simulatedPoolForNextMatch = activeAttendance.map(p => {
        const enriched = enrichPlayerImmutably(p, players, attendance);
        const isPlayingNow = activeInCurrentMatchIds.has(p.id);
        return {
          ...enriched,
          playedLastMatch: isPlayingNow,
          dailyMatches: (enriched.dailyMatches || 0) + (isPlayingNow ? 1 : 0),
          consecutivePlayed: isPlayingNow ? (enriched.consecutivePlayed || 0) + 1 : 0,
          consecutiveBenched: isPlayingNow ? 0 : (enriched.consecutiveBenched || 0) + 1
        };
      });

      return generateTeams(simulatedPoolForNextMatch);
    } catch {
      return null;
    }
  }, [nextMatchPreview, generationResult, attendance, players, activeInCurrentMatchIds]);

  const nextRules = useMemo(() => {
    if (!effectiveNextMatchPreview) return null;
    return verifyClubGenerationRules(effectiveNextMatchPreview);
  }, [effectiveNextMatchPreview]);

  const persistUpdatedGenerationResult = async (newRes: any) => {
    useStore.getState().setGenerationResult(newRes);
    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(newRes));
    } catch {}
  };

  const handlePlayerTapForSwap = (tappedPlayer: Player) => {
    if (isCourtLocked || !generationResult || userRole !== 'ADMIN') return;
    triggerHaptic('light');

    if (!selectedSwapId) {
      setSelectedSwapId(tappedPlayer.id);
      return;
    }

    if (selectedSwapId === tappedPlayer.id) {
      setSelectedSwapId(null);
      return;
    }

    const allPool = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || []),
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || []),
      ...waitingPlayers
    ].filter(Boolean) as Player[];

    const p1 = allPool.find(p => p.id === selectedSwapId);
    const p2 = allPool.find(p => p.id === tappedPlayer.id);
    if (!p1 || !p2) {
      setSelectedSwapId(null);
      return;
    }

    const swapInItem = (item: Player | null | undefined) => {
      if (!item) return null;
      if (item.id === selectedSwapId) return p2;
      if (item.id === tappedPlayer.id) return p1;
      return item;
    };

    const nextTeamA = {
      ...generationResult.teamA,
      setter: swapInItem(generationResult.teamA?.setter),
      players: (generationResult.teamA?.players || []).map(swapInItem).filter(Boolean) as Player[]
    };
    const nextTeamB = {
      ...generationResult.teamB,
      setter: swapInItem(generationResult.teamB?.setter),
      players: (generationResult.teamB?.players || []).map(swapInItem).filter(Boolean) as Player[]
    };
    const nextRemaining = (generationResult.remainingPlayers || waitingPlayers).map(swapInItem).filter(Boolean) as Player[];

    nextTeamA.totalIC = calculateTeamTotalIC(nextTeamA);
    nextTeamB.totalIC = calculateTeamTotalIC(nextTeamB);

    const updated = {
      ...generationResult,
      teamA: nextTeamA,
      teamB: nextTeamB,
      remainingPlayers: nextRemaining
    };

    persistUpdatedGenerationResult(updated);
    triggerHaptic('success');
    setSelectedSwapId(null);
  };

  const renderPlayerMetricBadge = (player: Player) => {
    const fullData = getPlayerData(player.id) || player;
    const ic = Math.round(calculateCompositePerformanceRating(fullData));
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="px-1.5 py-0.5 bg-brand-primary/15 border border-brand-primary/30 rounded text-[8px] sm:text-[9px] font-black font-mono text-brand-primary">
          {ic}
        </span>
        {!isCompactSideBySide && (
          <div className="flex items-center gap-0.5">
            <span className="text-[8px] font-bold text-emerald-400">V{fullData.dailyWins || 0}</span>
            <span className="text-[8px] font-bold text-rose-400">D{fullData.dailyLosses || 0}</span>
          </div>
        )}
      </div>
    );
  };

  const formatCompactName = (name: string) => {
    if (!isCompactSideBySide) return name;
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  };

  const totalIcA = generationResult?.teamA ? calculateTeamTotalIC(generationResult.teamA) : 0;
  const totalIcB = generationResult?.teamB ? calculateTeamTotalIC(generationResult.teamB) : 0;
  const deltaIc = Math.abs(totalIcA - totalIcB);

  return (
    <div className="min-h-screen bg-black text-white p-3 sm:p-6 md:p-8 flex flex-col font-sans relative overflow-hidden select-none">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-primary/20 border border-brand-primary/40 rounded-2xl text-brand-primary">
            <Tv className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
              <h1 className="text-base sm:text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                Quadra <span className="text-brand-primary">• Partida #{currentMatchNumber}</span>
              </h1>
              {isWakeLockActive && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase flex items-center gap-1" title="Tela mantida acesa automaticamente durante o jogo">
                  <Sun className="w-2.5 h-2.5" /> Tela Acesa
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-xs font-bold text-white/50 uppercase tracking-widest">
              Cockpit em tempo real ({todayCompletedCount} {todayCompletedCount === 1 ? 'jogo concluído' : 'jogos concluídos'} hoje)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LiveClockAndMatchTimer mode="header-clock" onMinuteTick={setCurrentHHMM} />

          <button
            type="button"
            onClick={() => setIsCompactSideBySide(!isCompactSideBySide)}
            className="p-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1"
            title="Alternar Quadra Lado a Lado ou Lista"
          >
            {isCompactSideBySide ? <Columns2 className="w-4 h-4 text-brand-primary" /> : <Rows2 className="w-4 h-4 text-brand-primary" />}
            <span className="hidden xs:inline">{isCompactSideBySide ? '2 Col' : '1 Col'}</span>
          </button>

          {userRole === 'ADMIN' && generationResult && (
            <button
              type="button"
              onClick={() => {
                setIsCourtLocked(!isCourtLocked);
                setSelectedSwapId(null);
              }}
              className={`p-2.5 rounded-xl border text-[9px] font-black uppercase flex items-center gap-1 transition-all ${
                isCourtLocked ? 'bg-amber-500 text-black border-amber-400' : 'bg-white/5 text-white border-white/10'
              }`}
              title="Travar escalação contra toques acidentais"
            >
              {isCourtLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 text-brand-primary" />}
              <span className="hidden sm:inline">{isCourtLocked ? 'Travado' : 'Travar'}</span>
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-white/5 hover:bg-brand-primary/20 border border-white/10 text-white rounded-xl transition-all"
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onBack ? onBack : () => setViewMode('generation')}
            className="px-3.5 py-2.5 bg-brand-primary text-black hover:bg-brand-primary/90 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg"
          >
            Voltar
          </button>
        </div>
      </header>

      {/* Banner de Alerta de Horário de Saída (departureTime) */}
      {playersNearDeparture.length > 0 && (
        <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2 text-amber-300 text-xs font-black uppercase">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <span>
              Horário de saída atingido/próximo:{' '}
              {playersNearDeparture.map(p => `${p.name.split(' ')[0]} (${p.departureTime})`).join(', ')}
            </span>
          </div>
          {userRole === 'ADMIN' && (
            <div className="flex flex-wrap gap-1.5">
              {playersNearDeparture.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleConfirmPlayerDeparture(p)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-amber-400 transition-all"
                >
                  <LogOut className="w-3 h-3" /> Confirmar Saída de {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Seletor Rápido Mobile */}
      <div className="flex lg:hidden gap-1.5 mt-3 bg-zinc-900/90 p-1 rounded-2xl border border-white/10">
        {[
          { id: 'BOTH' as const, label: 'Tudo' },
          { id: 'CURRENT' as const, label: `Em Quadra (#${currentMatchNumber})` },
          { id: 'NEXT' as const, label: `Próxima & Fila (${waitingPlayers.length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileSection(tab.id)}
            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
              mobileSection === tab.id ? 'bg-brand-primary text-black' : 'text-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 flex-1 relative z-10">
        
        {/* SEÇÃO 1: PARTIDA EM ANDAMENTO */}
        <div className={`lg:col-span-7 flex flex-col gap-5 ${mobileSection === 'NEXT' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="bg-zinc-900/90 p-4 sm:p-6 rounded-[2rem] border border-white/15 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-brand-primary text-black text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1 animate-pulse">
                  <Flame className="w-3.5 h-3.5 fill-black" />
                  EM QUADRA
                </span>
                <h2 className="text-base sm:text-xl font-black uppercase tracking-tight text-white">
                  Partida #{currentMatchNumber}
                </h2>
              </div>
              
              <div className="flex items-center gap-2.5">
                {generationResult && userRole === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setIsQuickSwapModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-brand-primary hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider transition-all shadow-md"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-black" />
                    <span>Trocar</span>
                  </button>
                )}

                <LiveClockAndMatchTimer matchStartTime={systemMetadata.matchStartTime} mode="match-timer" />
              </div>
            </div>

            {generationResult ? (
              <>
                {rules && (
                  <div className="grid grid-cols-4 gap-1.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-black/60 p-2 rounded-xl border border-white/10 mt-3 text-center">
                    <span className={`px-1.5 py-1 rounded-lg border ${deltaIc <= 3 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                      Δ IC: <strong className="text-white font-mono">{deltaIc.toFixed(1)}</strong>
                    </span>
                    <span className={`px-1.5 py-1 rounded-lg border flex items-center justify-center gap-1 ${
                      rules.setter.fulfilled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {rules.setter.fulfilled ? <Check className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                      Lev: <span className="text-white">{rules.setter.badgeLabel}</span>
                    </span>
                    <span className={`px-1.5 py-1 rounded-lg border flex items-center justify-center gap-1 ${
                      rules.gender.fulfilled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {rules.gender.fulfilled ? <Check className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                      Gên: <span className="text-white">{rules.gender.badgeLabel}</span>
                    </span>
                    <span className={`px-1.5 py-1 rounded-lg border flex items-center justify-center gap-1 ${
                      rules.topBottom.fulfilled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {rules.topBottom.fulfilled ? <Check className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                      Top: <span className="text-white">{rules.topBottom.fulfilled ? 'OK' : 'Ajuste'}</span>
                    </span>
                  </div>
                )}

                {selectedSwapId && (
                  <div className="mt-2 px-3 py-1.5 rounded-xl bg-brand-primary text-black text-[9px] font-black uppercase flex items-center justify-between animate-pulse">
                    <span>Toque em outro atleta (da quadra ou da fila) para concluir a troca</span>
                    <button onClick={() => setSelectedSwapId(null)} className="px-2 py-0.5 bg-black text-brand-primary rounded">Cancelar</button>
                  </div>
                )}

                <div className={`my-3 grid gap-2.5 sm:gap-4 relative z-10 ${isCompactSideBySide ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  {/* TIME A */}
                  <div className="bg-black/80 border-2 border-brand-primary/60 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xl">
                    <div>
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
                        <h3 className="text-xs sm:text-base font-black text-brand-primary uppercase flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4" /> TIME A
                        </h3>
                        <span className="text-[9px] font-mono font-black bg-brand-primary text-black px-1.5 py-0.5 rounded">
                          IC {totalIcA.toFixed(0)}
                        </span>
                      </div>

                      {generationResult.teamA.setter && (
                        <div
                          onClick={() => handlePlayerTapForSwap(generationResult.teamA.setter!)}
                          className={`mb-2 p-2 rounded-xl flex items-center justify-between border transition-all ${
                            selectedSwapId === generationResult.teamA.setter.id
                              ? 'bg-brand-primary/30 border-brand-primary ring-2 ring-brand-primary'
                              : 'bg-brand-primary/10 border-brand-primary/30'
                          } ${!isCourtLocked && userRole === 'ADMIN' ? 'cursor-pointer active:scale-95' : ''}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-1 py-0.5 bg-brand-primary text-black text-[8px] font-black uppercase rounded shrink-0">
                              L
                            </span>
                            <span className="text-[11px] sm:text-xs font-black text-white uppercase truncate">
                              {formatCompactName(generationResult.teamA.setter.name)}
                            </span>
                          </div>
                          {renderPlayerMetricBadge(generationResult.teamA.setter)}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {generationResult.teamA.players.map((player: Player) => (
                          <div
                            key={player.id}
                            onClick={() => handlePlayerTapForSwap(player)}
                            className={`p-2 rounded-xl flex items-center justify-between border transition-all ${
                              selectedSwapId === player.id
                                ? 'bg-brand-primary/30 border-brand-primary ring-2 ring-brand-primary'
                                : 'bg-white/5 border-white/10 hover:border-brand-primary/30'
                            } ${!isCourtLocked && userRole === 'ADMIN' ? 'cursor-pointer active:scale-95' : ''}`}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[11px] sm:text-xs font-bold text-white/90 uppercase truncate">
                                {formatCompactName(player.name)}
                              </span>
                              <span className={`text-[7px] font-black px-1 rounded shrink-0 ${isFemalePlayer(player) ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                {isFemalePlayer(player) ? 'F' : 'M'}
                              </span>
                            </div>
                            {renderPlayerMetricBadge(player)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* TIME B */}
                  <div className="bg-black/80 border-2 border-white/20 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xl">
                    <div>
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
                        <h3 className="text-xs sm:text-base font-black text-white uppercase flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4 text-white/60" /> TIME B
                        </h3>
                        <span className="text-[9px] font-mono font-black bg-white/20 text-white px-1.5 py-0.5 rounded">
                          IC {totalIcB.toFixed(0)}
                        </span>
                      </div>

                      {generationResult.teamB.setter && (
                        <div
                          onClick={() => handlePlayerTapForSwap(generationResult.teamB.setter!)}
                          className={`mb-2 p-2 rounded-xl flex items-center justify-between border transition-all ${
                            selectedSwapId === generationResult.teamB.setter.id
                              ? 'bg-brand-primary/30 border-brand-primary ring-2 ring-brand-primary'
                              : 'bg-white/10 border-white/20'
                          } ${!isCourtLocked && userRole === 'ADMIN' ? 'cursor-pointer active:scale-95' : ''}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-1 py-0.5 bg-white text-black text-[8px] font-black uppercase rounded shrink-0">
                              L
                            </span>
                            <span className="text-[11px] sm:text-xs font-black text-white uppercase truncate">
                              {formatCompactName(generationResult.teamB.setter.name)}
                            </span>
                          </div>
                          {renderPlayerMetricBadge(generationResult.teamB.setter)}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {generationResult.teamB.players.map((player: Player) => (
                          <div
                            key={player.id}
                            onClick={() => handlePlayerTapForSwap(player)}
                            className={`p-2 rounded-xl flex items-center justify-between border transition-all ${
                              selectedSwapId === player.id
                                ? 'bg-brand-primary/30 border-brand-primary ring-2 ring-brand-primary'
                                : 'bg-white/5 border-white/10 hover:border-white/30'
                            } ${!isCourtLocked && userRole === 'ADMIN' ? 'cursor-pointer active:scale-95' : ''}`}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[11px] sm:text-xs font-bold text-white/90 uppercase truncate">
                                {formatCompactName(player.name)}
                              </span>
                              <span className={`text-[7px] font-black px-1 rounded shrink-0 ${isFemalePlayer(player) ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                {isFemalePlayer(player) ? 'F' : 'M'}
                              </span>
                            </div>
                            {renderPlayerMetricBadge(player)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="my-auto py-12 flex flex-col items-center justify-center text-center gap-3">
                <Swords className="w-12 h-12 text-white/20 animate-bounce" />
                <h3 className="text-base font-black uppercase text-white/80">
                  Nenhuma partida em andamento
                </h3>
              </div>
            )}
          </div>
        </div>

        {/* SEÇÃO 2: FILA DE ESPERA & PRÓXIMA PARTIDA */}
        <div className={`lg:col-span-5 flex flex-col gap-5 ${mobileSection === 'CURRENT' ? 'hidden lg:flex' : 'flex'}`}>
          
          {/* FILA DE ESPERA DA RODAGEM */}
          <div className="bg-zinc-900/90 p-4 sm:p-6 rounded-[2rem] border border-white/15 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Fila de Próximos a Entrar <span className="text-brand-primary">({waitingPlayers.length})</span>
                  </h3>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full border border-brand-primary/30">
                  Ordem Oficial
                </span>
              </div>

              {waitingPlayers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                  {waitingPlayers.map((player, idx) => {
                    const isSelected = selectedSwapId === player.id;
                    const arrivalPos = getAttendanceArrivalPosition(player.id, attendance);
                    return (
                      <div
                        key={player.id}
                        onClick={() => handlePlayerTapForSwap(player)}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'bg-brand-primary text-black border-brand-primary font-black'
                            : 'bg-black/60 border-white/10 hover:border-brand-primary/30'
                        } ${!isCourtLocked && userRole === 'ADMIN' ? 'cursor-pointer active:scale-95' : ''}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-brand-primary text-black font-mono text-[9px] font-black flex items-center justify-center shrink-0">
                          {idx + 1}º
                        </span>
                        <div className="truncate flex-1">
                          <p className="text-[11px] font-black text-white truncate uppercase">
                            {formatCompactName(player.name)}
                          </p>
                          <div className="flex items-center gap-1 text-[8px] text-white/50 font-mono">
                            {player.isOfficialSetter && <span className="text-brand-primary font-black">(L)</span>}
                            <span>{player.dailyMatches || 0}J</span>
                            {player.departureTime && <span className="text-amber-400">⏰{player.departureTime}</span>}
                            {!player.departureTime && arrivalPos !== '?' && <span>• #{arrivalPos}º</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-white/40 italic py-4 text-center">
                  Todos os sócios presentes estão atualmente em quadra!
                </p>
              )}
            </div>
          </div>

          {/* PRÓXIMA PARTIDA PREVIEW (Automática ou Manual) */}
          <div className="bg-zinc-900/90 p-4 sm:p-6 rounded-[2rem] border border-white/15 shadow-2xl relative overflow-hidden flex flex-col justify-between flex-1">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-brand-primary text-black text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 fill-black" />
                  PRÓXIMA (#{currentMatchNumber + 1})
                </span>
                <h2 className="text-sm sm:text-base font-black uppercase text-white">
                  Projeção Automática
                </h2>
              </div>
              {nextRules && (
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {nextRules.allFulfilled ? '100% Equilibrada' : 'Prévia'}
                </span>
              )}
            </div>

            {effectiveNextMatchPreview ? (
              <div className={`my-3 grid gap-2.5 relative z-10 ${isCompactSideBySide ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {/* TIME A PREVIEW */}
                <div className="bg-black/80 border border-brand-primary/40 rounded-2xl p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black text-brand-primary uppercase">Time A</h4>
                    <span className="text-[8px] font-mono font-black text-brand-primary">
                      IC {calculateTeamTotalIC(effectiveNextMatchPreview.teamA).toFixed(0)}
                    </span>
                  </div>
                  {effectiveNextMatchPreview.teamA.setter && (
                    <div className="mb-1.5 p-1.5 bg-brand-primary/10 border border-brand-primary/30 rounded-lg flex items-center justify-between">
                      <span className="text-[10px] font-black text-white uppercase truncate">
                        [L] {formatCompactName(effectiveNextMatchPreview.teamA.setter.name)}
                      </span>
                      <span className={`text-[7px] px-1 rounded font-black uppercase ${activeInCurrentMatchIds.has(effectiveNextMatchPreview.teamA.setter.id) ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {activeInCurrentMatchIds.has(effectiveNextMatchPreview.teamA.setter.id) ? 'Quadra' : 'Fila'}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {effectiveNextMatchPreview.teamA.players.map((p: Player) => (
                      <div key={p.id} className="p-1.5 bg-white/5 rounded-lg flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/90 uppercase truncate">
                          {formatCompactName(p.name)}
                        </span>
                        <span className={`text-[7px] px-1 rounded font-black uppercase ${activeInCurrentMatchIds.has(p.id) ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {activeInCurrentMatchIds.has(p.id) ? 'Quadra' : 'Fila'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TIME B PREVIEW */}
                <div className="bg-black/80 border border-white/20 rounded-2xl p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black text-white uppercase">Time B</h4>
                    <span className="text-[8px] font-mono font-black text-white/70">
                      IC {calculateTeamTotalIC(effectiveNextMatchPreview.teamB).toFixed(0)}
                    </span>
                  </div>
                  {effectiveNextMatchPreview.teamB.setter && (
                    <div className="mb-1.5 p-1.5 bg-white/10 border border-white/20 rounded-lg flex items-center justify-between">
                      <span className="text-[10px] font-black text-white uppercase truncate">
                        [L] {formatCompactName(effectiveNextMatchPreview.teamB.setter.name)}
                      </span>
                      <span className={`text-[7px] px-1 rounded font-black uppercase ${activeInCurrentMatchIds.has(effectiveNextMatchPreview.teamB.setter.id) ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {activeInCurrentMatchIds.has(effectiveNextMatchPreview.teamB.setter.id) ? 'Quadra' : 'Fila'}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {effectiveNextMatchPreview.teamB.players.map((p: Player) => (
                      <div key={p.id} className="p-1.5 bg-white/5 rounded-lg flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/90 uppercase truncate">
                          {formatCompactName(p.name)}
                        </span>
                        <span className={`text-[7px] px-1 rounded font-black uppercase ${activeInCurrentMatchIds.has(p.id) ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {activeInCurrentMatchIds.has(p.id) ? 'Quadra' : 'Fila'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="my-auto py-8 text-center">
                <p className="text-xs font-black uppercase text-white/50">
                  {attendance.length < 12
                    ? `Aguardando mais ${12 - attendance.length} atleta(s) para fechar 12`
                    : 'Inicie a partida atual para visualizar a projeção automática da próxima'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <MatchQuickSwapModal
        isOpen={isQuickSwapModalOpen}
        onClose={() => setIsQuickSwapModalOpen(false)}
        generationResult={generationResult}
        onUpdateResult={persistUpdatedGenerationResult}
      />
    </div>
  );
};