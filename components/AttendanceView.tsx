import { useShallow } from 'zustand/react/shallow';
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { Player } from '../types';
import { capitalizeName } from '../utils/helpers';
import { getFirestoreDateKey } from '../firebase';
import { useIntentions } from '../src/hooks/useIntentions';
import { 
  ClipboardCheck, 
  Trash2, 
  RotateCcw, 
  Users, 
  X, 
  Plus,
  CheckCircle2,
  Calendar,
  Zap,
  BarChart3,
  Clock,
  LogOut,
  SmartphoneNfc,
  QrCode,
  UserCheck,
  Search,
  Sparkles
} from 'lucide-react';

import {
  calculatePredictedMatches,
  calculateCompositePerformanceRating,
  calculatePracticalSkillsSum
} from '../utils/teamLogic';
import { SESSION_START_TIME, SESSION_END_TIME, AVG_MATCH_DURATION_MINS } from '../constants';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { Tooltip } from '../src/components/Tooltip';

interface AttendanceViewProps {
  clearAttendance: () => void;
  resetDailyMatches: () => void;
  removeAttendance: (id: string) => void;
  updateDepartureTime?: (id: string, time: string | null) => Promise<void>;
  updateArrivalTime?: (id: string, time: string | null) => Promise<void>;
  registerAttendance: (player: Player) => void;
  availablePlayers: Player[];
  refreshPlayers: () => Promise<void>;
  currentPlayer: Player | null;
  preConfirmations: Player[];
  isIntentionPhase: boolean;
  isGameDay: boolean;
  onToggleIntention: (player: Player) => Promise<void>;
  userRole: 'ADMIN' | 'MEMBER' | null;
  setViewMode: (mode: any) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  clearAttendance,
  resetDailyMatches,
  removeAttendance,
  updateDepartureTime,
  updateArrivalTime,
  registerAttendance,
  availablePlayers,
  refreshPlayers,
  currentPlayer,
  isGameDay,
  userRole,
  setViewMode
}) => {
  const {
    attendance: allAttendance,
    isSyncing,
    matches,
    players: allPlayers,
    idToCanonicalId,
    user
  } = useStore(
    useShallow(state => ({
      attendance: state.attendance,
      isSyncing: state.isSyncing,
      matches: state.matches,
      players: state.players,
      idToCanonicalId: state.idToCanonicalId,
      user: state.user
    }))
  );

  const { intentions, getPlayerConfirmationTime } = useIntentions();

  const isAdmin =
    userRole === 'ADMIN' ||
    !!currentPlayer?.isAdmin ||
    user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com';

  // Usa estritamente a data de Brasília (evita virada UTC às 21h00 BRT!)
  const { avgMatchDuration, todayMatchesCount, firstMatchStartTimeStr } = useMemo(() => {
    const today = getFirestoreDateKey();
    const todayMatches = (matches || []).filter(m => m.date === today && (m.duration || 0) > 60);
    const count = todayMatches.length;
    
    let firstStartTime: string | undefined = undefined;
    if (count > 0) {
      const sortedMatches = [...todayMatches].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const firstMatch = sortedMatches[0];
      const refTs = firstMatch.startTime || firstMatch.timestamp;
      if (refTs) {
        firstStartTime = new Date(refTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      const activeGen = useStore.getState().generationResult;
      if (activeGen?.timestamp) {
        firstStartTime = new Date(activeGen.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    if (count === 0 && !firstStartTime) {
      return { avgMatchDuration: AVG_MATCH_DURATION_MINS, todayMatchesCount: 0, firstMatchStartTimeStr: undefined };
    }
    
    const totalDurationSecs = todayMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
    const avgMins = count > 0 ? Math.round(totalDurationSecs / count / 60) : AVG_MATCH_DURATION_MINS;
    
    return { 
      avgMatchDuration: avgMins >= 8 ? avgMins : AVG_MATCH_DURATION_MINS,
      todayMatchesCount: count,
      firstMatchStartTimeStr: firstStartTime
    };
  }, [matches]);

  // Filtro estrito: apenas sócios ativos e fora do DM
  const attendance = useMemo(() => {
    return (allAttendance || []).filter(p => {
      const master = allPlayers.find(m => m.id === p.id || (m.uid && m.uid === p.uid));
      const status = master?.status || p.status || 'active';
      const isDM = Boolean(master?.isDM || p.isDM || status === 'dm');
      return status === 'active' && !isDM;
    });
  }, [allAttendance, allPlayers]);

  const displayedAttendance = useMemo(() => {
    return [...attendance].sort((a, b) => {
      const orderA = a.arrivalOrder && a.arrivalOrder < 999 ? a.arrivalOrder : 999;
      const orderB = b.arrivalOrder && b.arrivalOrder < 999 ? b.arrivalOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
  }, [attendance]);

  const [editingDeparture, setEditingDeparture] = useState<string | null>(null);
  const [editingArrival, setEditingArrival] = useState<string | null>(null);
  const [tempDepartureTime, setTempDepartureTime] = useState("");
  const [tempArrivalTime, setTempArrivalTime] = useState("");
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [isBatchCheckingIn, setIsBatchCheckingIn] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState("");
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const handleRegisterPlayer = async (player: Player) => {
    if (addingPlayerId === player.id) return;
    setAddingPlayerId(player.id);
    try {
      await registerAttendance(player);
    } catch (e) {
      console.error('[AttendanceView] Erro ao registrar presença:', e);
    } finally {
      setTimeout(() => setAddingPlayerId(null), 350);
    }
  };

  // Sócios ativos disponíveis que ainda não estão na lista de presença
  const activeAvailablePlayers = useMemo(() => {
    return (availablePlayers || []).filter(p => p.status === 'active' && !p.isDM);
  }, [availablePlayers]);

  const notYetPresentPlayers = useMemo(() => {
    const presentIds = new Set(attendance.map(a => a.id));
    return activeAvailablePlayers.filter(p => !presentIds.has(p.id));
  }, [activeAvailablePlayers, attendance]);

  /**
   * Ponte Intenção -> Presença:
   * Lista os sócios que confirmaram "VAI" (GOING) na Lista de Quinta mas ainda não deram check-in na quadra,
   * ordenados rigorosamente pelo horário de confirmação na lista de intenção!
   */
  const confirmedPendingCheckIn = useMemo(() => {
    const responses = intentions?.responses || {};
    const checkIsGoing = (p: Player) => {
      if (responses[p.id] === 'GOING') return true;
      if (p.uid && responses[p.uid] === 'GOING') return true;
      if (p.email && responses[p.email.toLowerCase()] === 'GOING') return true;
      const canon = idToCanonicalId?.[p.id];
      if (canon && responses[canon] === 'GOING') return true;
      return false;
    };

    return notYetPresentPlayers
      .filter(checkIsGoing)
      .sort((a, b) => {
        const tA = getPlayerConfirmationTime(a) || 0;
        const tB = getPlayerConfirmationTime(b) || 0;
        return tA - tB;
      });
  }, [notYetPresentPlayers, intentions?.responses, idToCanonicalId, getPlayerConfirmationTime]);

  const handleBatchCheckInConfirmed = async () => {
    if (confirmedPendingCheckIn.length === 0 || isBatchCheckingIn) return;
    setIsBatchCheckingIn(true);
    try {
      for (const p of confirmedPendingCheckIn) {
        await registerAttendance(p);
      }
    } finally {
      setIsBatchCheckingIn(false);
    }
  };

  const filteredRemainingAvailable = useMemo(() => {
    const q = searchAvailable.trim().toLowerCase();
    return notYetPresentPlayers
      .filter(p => !q || (p.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [notYetPresentPlayers, searchAvailable]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const distance = e.touches[0].pageY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10 && e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    if (pullDistance > 60) {
      if (navigator.vibrate) navigator.vibrate(10);
      await refreshPlayers();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  // Cálculo dos LEDs de IC e Tier Técnico para a Lista de Presença
  const attendanceStats = useMemo(() => {
    const enrichedList = (attendance || []).map(p => {
      const full = availablePlayers.find(ap => ap.id === p.id) || p;
      return { 
        id: p.id, 
        ic: calculateCompositePerformanceRating(full), 
        skills: calculatePracticalSkillsSum(full) 
      };
    });

    const sortedByIc = [...enrichedList].sort((a, b) => b.ic - a.ic);
    const sortedBySkills = [...enrichedList].sort((a, b) => b.skills - a.skills);

    const icMap: Record<string, { color: string; title: string }> = {};
    const techTierMap: Record<string, 'TOP2' | 'TOP4' | 'BOTTOM4' | 'BOTTOM2' | undefined> = {};

    const total = sortedByIc.length;
    sortedByIc.forEach((item, rank) => {
      if (rank <= 1 || item.ic >= 55) {
        icMap[item.id] = { color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]', title: `Top IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank <= Math.floor(total * 0.35) || item.ic >= 42) {
        icMap[item.id] = { color: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.9)]', title: `Alto IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 2 || item.ic < 18) {
        icMap[item.id] = { color: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]', title: `Bottom 2 IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 4 || item.ic < 30) {
        icMap[item.id] = { color: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.9)]', title: `IC Baixo (#${rank + 1} | IC ${item.ic})` };
      } else {
        icMap[item.id] = { color: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]', title: `IC Médio (#${rank + 1} | IC ${item.ic})` };
      }
    });

    if (total >= 4) {
      sortedBySkills.forEach((item, rank) => {
        if (rank === 0 || rank === 1) techTierMap[item.id] = 'TOP2';
        else if (rank === 2 || rank === 3) techTierMap[item.id] = 'TOP4';
        else if (rank === total - 1 || rank === total - 2) techTierMap[item.id] = 'BOTTOM2';
        else if (rank === total - 3 || rank === total - 4) techTierMap[item.id] = 'BOTTOM4';
      });
    }

    return { icMap, techTierMap };
  }, [attendance, availablePlayers]);

  return (
    <div 
      className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ 
          transform: `translateY(${pullDistance - 40}px)`,
          opacity: pullDistance / 60,
          transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div className="bg-brand-secondary/80 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {(isGameDay || isAdmin) && (
        <>
          {isAdmin && !isGameDay && (
            <div className="lg:col-span-12 bg-brand-primary text-brand-secondary px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-center shadow-xl">
              Modo Administrador: Gestão de Presença (Fora do Ciclo)
            </div>
          )}

          {/* COLUNA ESQUERDA: PRESENTES EM QUADRA */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-brand-light rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl overflow-hidden">
              <div className="p-6 bg-white/5 border-b border-brand-primary/40 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-white uppercase text-lg tracking-tighter flex items-center gap-2.5">
                    <ClipboardCheck className="w-6 h-6 text-brand-primary" />
                    Na Quadra Agora
                    <HelpTooltip 
                      title="Lista de Presença Oficial" 
                      content="Atletas que já confirmaram presença física na quadra hoje. A ordem #1, #2, #3 define a prioridade na fila."
                    />
                  </h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1">
                    {attendance.length} Guerreiros Escalados {attendance.length >= 12 ? '• Quorum OK!' : `• Faltam ${12 - attendance.length} p/ 12`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Tooltip content="Sincronizar">
                    <button 
                      onClick={async () => {
                        if (refreshPlayers) await refreshPlayers();
                      }} 
                      className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                    >
                      <RotateCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-brand-primary' : ''}`} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Relatório de Presença">
                    <button 
                      onClick={() => setViewMode('attendance_report')} 
                      className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                    >
                      <BarChart3 className="w-5 h-5" />
                    </button>
                  </Tooltip>
                  {isAdmin && (
                    <>
                      <Tooltip content="Limpar lista" position="left">
                        <button 
                          onClick={clearAttendance} 
                          disabled={isSyncing}
                          className="p-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Finalizar dia" position="left">
                        <button 
                          onClick={resetDailyMatches} 
                          disabled={isSyncing}
                          className="p-2.5 rounded-xl text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              <div className="p-3.5 grid grid-cols-2 gap-2.5 max-h-[60vh] lg:max-h-[620px] overflow-y-auto scrollbar-hide">
                {attendance.length === 0 ? (
                  <div className="col-span-full text-center py-20 space-y-4">
                    <Users className="w-16 h-16 text-white/15 mx-auto" />
                    <p className="text-white/40 text-sm font-black uppercase tracking-widest">
                      Nenhum atleta em quadra ainda
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {displayedAttendance.map((player, idx) => {
                      const fullPlayer = availablePlayers.find(p => p.id === player.id) || player;
                      const displayName = player.name || fullPlayer?.name || "Sócio";
                      const realIC = Math.round(calculateCompositePerformanceRating(fullPlayer));
                      const generationResult = useStore.getState().generationResult;
                      const isCurrentlyBenched = generationResult?.remainingPlayers?.some((rp: Player) => rp.id === player.id);
                      const displayBenchedCount = (player.consecutiveBenched || 0) + (isCurrentlyBenched ? 1 : 0);
                      
                      const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      const predicted = calculatePredictedMatches(
                        currentTimeStr,
                        SESSION_END_TIME,
                        avgMatchDuration,
                        attendance.length,
                        player.departureTime || undefined,
                        todayMatchesCount,
                        player.arrivalTime || undefined,
                        firstMatchStartTimeStr || SESSION_START_TIME,
                        player.dailyMatches || 0
                      );

                      const hasSpecialSchedule = player.departureTime || player.arrivalTime;

                      return (
                        <motion.div 
                          key={player.id || `attendance-${idx}`} 
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          className={`flex flex-col p-2.5 rounded-xl border transition-all bg-black/60 ${
                            hasSpecialSchedule ? 'border-brand-primary/60 bg-brand-primary/5' : 'border-white/10'
                          } gap-1.5 relative`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black font-mono text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded">
                              #{(player.arrivalOrder && player.arrivalOrder < 999) ? player.arrivalOrder : idx + 1}º
                            </span>
                            <div className="flex items-center gap-1">
                              {(isAdmin || currentPlayer?.id === player.id) && (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingArrival(player.id);
                                      setTempArrivalTime(player.arrivalTime || SESSION_START_TIME);
                                      setEditingDeparture(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all ${player.arrivalTime ? 'text-brand-primary bg-brand-primary/15' : 'text-white/30 hover:text-brand-primary'}`}
                                    title="Horário de Chegada"
                                  >
                                    <Clock className="w-3 h-3 rotate-180" />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingDeparture(player.id);
                                      setTempDepartureTime(player.departureTime || SESSION_END_TIME);
                                      setEditingArrival(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all ${player.departureTime ? 'text-amber-400 bg-amber-500/15' : 'text-white/30 hover:text-brand-primary'}`}
                                    title="Horário de Saída"
                                  >
                                    <LogOut className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {isAdmin && (
                                <button 
                                  onClick={() => removeAttendance(player.id)} 
                                  disabled={isSyncing}
                                  className="p-1 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div className="min-w-0">
                            <div className={`text-xs font-black uppercase leading-tight flex items-center flex-wrap gap-1 ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                              <span className="truncate">{capitalizeName(displayName)}</span>
                              {attendanceStats.icMap[player.id] && (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${attendanceStats.icMap[player.id].color}`} title={attendanceStats.icMap[player.id].title} />
                              )}
                              {attendanceStats.techTierMap[player.id] && (
                                <span className="px-1 py-0.2 rounded bg-white/10 text-brand-primary text-[7px] font-black uppercase">
                                  {attendanceStats.techTierMap[player.id]}
                                </span>
                              )}
                            </div>
                            
                            {editingDeparture === player.id || editingArrival === player.id ? (
                              <div className="flex items-center gap-1 mt-1.5 bg-black p-1.5 rounded-lg border border-brand-primary/40">
                                <input 
                                  type="time"
                                  value={editingDeparture === player.id ? tempDepartureTime : tempArrivalTime}
                                  onChange={(e) => editingDeparture === player.id ? setTempDepartureTime(e.target.value) : setTempArrivalTime(e.target.value)}
                                  className="bg-black border border-brand-primary/40 rounded px-1 py-0.5 text-[10px] text-brand-primary font-black w-20 outline-none"
                                  autoFocus
                                />
                                <button 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (editingDeparture === player.id && updateDepartureTime) {
                                      await updateDepartureTime(player.id, tempDepartureTime || null);
                                    } else if (editingArrival === player.id && updateArrivalTime) {
                                      await updateArrivalTime(player.id, tempArrivalTime || null);
                                    }
                                    setEditingDeparture(null);
                                    setEditingArrival(null);
                                  }}
                                  className="p-1 bg-brand-primary text-black rounded"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDeparture(null);
                                    setEditingArrival(null);
                                  }}
                                  className="p-1 bg-white/10 text-white rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1 mt-1.5 flex-wrap">
                                <span className="text-[8px] font-black font-mono text-brand-primary/80 uppercase">
                                  IC {realIC} • {player.dailyMatches || 0}J
                                </span>
                                <div className="flex items-center gap-1">
                                  {displayBenchedCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-brand-primary text-black text-[7px] font-black">
                                      {displayBenchedCount}B
                                    </span>
                                  )}
                                  {player.departureTime && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[8px] font-black">
                                      ⏰ {player.departureTime}
                                    </span>
                                  )}
                                  {player.checkInMethod === 'NFC' && (
                                    <SmartphoneNfc className="w-3 h-3 text-emerald-400" title="NFC" />
                                  )}
                                  {player.checkInMethod === 'QR' && (
                                    <QrCode className="w-3 h-3 text-blue-400" title="QR Code" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </section>
          </div>

          {/* COLUNA DIREITA: PONTE 1-TOQUE DOS CONFIRMADOS + DISPONÍVEIS */}
          <div className="lg:col-span-7 space-y-6">
            {/* FAIXA DESTACADA: CONFIRMADOS NA LISTA DE QUINTA (FALTAM CHEGAR) */}
            {isAdmin && confirmedPendingCheckIn.length > 0 && (
              <div className="bg-zinc-900/95 p-6 rounded-[2.5rem] border-2 border-emerald-500/40 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/20 rounded-2xl border border-emerald-500/40 text-emerald-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                        Confirmados na Lista de Quinta
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black">
                          {confirmedPendingCheckIn.length} faltam chegar
                        </span>
                      </h3>
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        Ordenados pelo horário de confirmação • Toque em 1 clique conforme chegarem na quadra
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBatchCheckInConfirmed}
                    disabled={isBatchCheckingIn}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    {isBatchCheckingIn ? 'Convocando...' : `Convocar Todos (${confirmedPendingCheckIn.length})`}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {confirmedPendingCheckIn.map((player, idx) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => handleRegisterPlayer(player)}
                      disabled={addingPlayerId === player.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/70 border border-emerald-500/30 hover:border-emerald-400 text-left transition-all active:scale-95 group cursor-pointer"
                    >
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-mono font-black text-emerald-400">
                            {idx + 1}º
                          </span>
                          <p className="text-xs font-black text-white uppercase truncate">
                            {capitalizeName(player.name)}
                          </p>
                        </div>
                        <span className="text-[8px] font-bold text-white/40 uppercase">
                          {player.isOfficialSetter ? 'Levantador (L)' : `IC ${Math.round(calculateCompositePerformanceRating(player))}`}
                        </span>
                      </div>
                      <span className="p-1.5 bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black rounded-lg transition-all shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TODOS OS GUERREIROS DISPONÍVEIS */}
            <div className="bg-brand-light backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Todos os Sócios Disponíveis
                  </h3>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                    {notYetPresentPlayers.length} sócios ativos fora de quadra
                  </p>
                </div>

                {isAdmin && (
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar sócio..."
                      value={searchAvailable}
                      onChange={(e) => setSearchAvailable(e.target.value)}
                      className="w-full bg-black/50 border border-brand-primary/40 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-primary"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
                {!isAdmin ? (
                  <div className="col-span-full py-16 text-center bg-white/5 rounded-3xl border border-dashed border-brand-primary/40 space-y-3">
                    <Users className="w-12 h-12 text-white/20 mx-auto" />
                    <p className="text-white/50 text-xs font-black uppercase tracking-widest">
                      Use o QR Code ou Tag NFC da quadra para registrar presença
                    </p>
                  </div>
                ) : filteredRemainingAvailable.length === 0 ? (
                  <div className="col-span-full py-16 text-center space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-brand-primary/30 mx-auto" />
                    <p className="text-white/50 text-sm font-black uppercase">
                      {searchAvailable ? 'Nenhum sócio encontrado na busca' : 'Todos os guerreiros ativos já estão em quadra!'}
                    </p>
                  </div>
                ) : (
                  filteredRemainingAvailable.map((player) => (
                    <button 
                      key={player.id} 
                      onClick={() => handleRegisterPlayer(player)} 
                      disabled={addingPlayerId === player.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left group bg-black/50 border-white/10 hover:border-brand-primary/50 cursor-pointer active:scale-95 ${
                        addingPlayerId === player.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <p className={`text-xs font-black uppercase truncate ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                          {capitalizeName(player.name || "Sócio")}
                        </p>
                        <span className="text-[8px] font-bold text-white/40 uppercase">
                          {player.isOfficialSetter ? 'Levantador (L)' : `IC ${Math.round(calculateCompositePerformanceRating(player))}`}
                        </span>
                      </div>
                      <span className="p-1.5 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-black rounded-lg transition-all border border-brand-primary/30 shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!isGameDay && !isAdmin && (
        <div className="lg:col-span-12 py-32 text-center space-y-8">
          <Calendar className="w-28 h-28 text-brand-primary mx-auto" />
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase">
              Descanso dos Guerreiros
            </h2>
            <p className="text-sm sm:text-lg text-white/60 font-black uppercase tracking-widest max-w-xl mx-auto">
              As partidas acontecem às <span className="text-brand-primary">quintas-feiras</span>. Confirme seu nome na aba Lista de Quinta!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
