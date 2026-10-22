import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { translateGender, capitalizeName } from '../utils/helpers';
import { 
  ClipboardCheck, 
  Trash2, 
  RotateCcw, 
  Users, 
  X, 
  Plus,
  MapPin,
  CheckCircle2,
  Calendar,
  Zap,
  Star,
  Shield,
  BarChart3,
  Clock,
  LogOut,
  SmartphoneNfc,
  QrCode,
  UserCheck
} from 'lucide-react';

import { getPriorityQueue, calculateEffectiveElo, calculatePredictedMatches, calculateCompositePerformanceRating, calculatePracticalSkillsSum } from '../utils/teamLogic';
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
  isIntentionPhase,
  isGameDay,
  onToggleIntention,
  userRole,
  setViewMode
}) => {
  const { attendance: allAttendance, preConfirmations: allPreConfirmations, isSyncing, matches, players: allPlayers } = useStore(useShallow(state => ({attendance: state.attendance, preConfirmations: state.preConfirmations, isSyncing: state.isSyncing, matches: state.matches, players: state.players})));

  const { avgMatchDuration, todayMatchesCount, firstMatchStartTimeStr } = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayMatches = matches.filter(m => m.date === today && m.duration > 60);
    const count = todayMatches.length;
    
    let firstStartTime: string | undefined = undefined;
    if (count > 0) {
      const sortedMatches = [...todayMatches].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const firstMatch = sortedMatches[0];
      if (firstMatch.startTime) {
        const d = new Date(firstMatch.startTime);
        firstStartTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } else if (firstMatch.timestamp) {
        const d = new Date(firstMatch.timestamp);
        firstStartTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      const activeGen = useStore.getState().generationResult;
      if (activeGen?.timestamp) {
        const d = new Date(activeGen.timestamp);
        firstStartTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    if (count === 0 && !firstStartTime) return { avgMatchDuration: AVG_MATCH_DURATION_MINS, todayMatchesCount: 0, firstMatchStartTimeStr: undefined };
    
    const totalDurationSecs = todayMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
    const avgMins = count > 0 ? Math.round(totalDurationSecs / count / 60) : AVG_MATCH_DURATION_MINS;
    
    return { 
      avgMatchDuration: avgMins >= 8 ? avgMins : AVG_MATCH_DURATION_MINS,
      todayMatchesCount: count,
      firstMatchStartTimeStr: firstStartTime
    };
  }, [matches]);

  const attendance = React.useMemo(() => allAttendance.filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm'), [allAttendance]);

  const displayedAttendance = React.useMemo(() => {
    return [...attendance].sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return (a.arrivalOrder ?? 999) - (b.arrivalOrder ?? 999);
    });
  }, [attendance]);

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-4 h-4 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-4 h-4 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-4 h-4 text-white/20" />;
    }
  };

  const preConfirmations = React.useMemo(() => allPreConfirmations.filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm'), [allPreConfirmations]);
  const [editingDeparture, setEditingDeparture] = React.useState<string | null>(null);
  const [editingArrival, setEditingArrival] = React.useState<string | null>(null);
  const [tempDepartureTime, setTempDepartureTime] = React.useState("");
  const [tempArrivalTime, setTempArrivalTime] = React.useState("");
  const [startY, setStartY] = React.useState(0);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isPulling, setIsPulling] = React.useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].pageY;
    const distance = currentY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10) {
        if (e.cancelable) e.preventDefault();
      }
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

  // Cálculo dos LEDs Duplos para a Lista de Presença:
  // LED 1: IC (Índice Composto) com 5 níveis de cores
  // LED 2: Tier Técnico / Habilidades Puras (TOP 2, TOP 4, BOTTOM 4, BOTTOM 2)
  const attendanceStats = React.useMemo(() => {
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
        icMap[item.id] = { color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)] animate-pulse', title: `LED IC: Top IC (Rank #${rank + 1} | IC ${item.ic})` };
      } else if (rank <= Math.floor(total * 0.35) || item.ic >= 42) {
        icMap[item.id] = { color: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.9)] animate-pulse', title: `LED IC: Alto IC (Rank #${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 2 || item.ic < 18) {
        icMap[item.id] = { color: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse', title: `LED IC: Bottom 2 IC (Rank #${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 4 || item.ic < 30) {
        icMap[item.id] = { color: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.9)] animate-pulse', title: `LED IC: IC Baixo (Rank #${rank + 1} | IC ${item.ic})` };
      } else {
        icMap[item.id] = { color: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] animate-pulse', title: `LED IC: IC Médio (Rank #${rank + 1} | IC ${item.ic})` };
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

  // Strictly filter active members for convocation list (excluding inactive, dm, and waiting list)
  const activeAvailablePlayers = React.useMemo(() => {
    return (availablePlayers || []).filter(p => p.status === 'active' || (!p.status && p.status !== 'inactive' && p.status !== 'dm' && p.status !== 'waiting' && p.status !== 'lista_espera'));
  }, [availablePlayers]);

  return (
    <div 
      className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10 animate-in fade-in slide-in-from-bottom-6 duration-700"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
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

      {/* PHASE: GAME DAY (Thu) or ADMIN OVERRIDE */}
      {(isGameDay || userRole === 'ADMIN') && (
        <>
          {/* Admin Override Badge */}
          {userRole === 'ADMIN' && !isGameDay && (
            <div className="lg:col-span-12 bg-brand-primary text-brand-secondary px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.3em] inline-block text-center mb-6 shadow-2xl shadow-brand-primary/20 border border-brand-primary/30">
              Modo Administrador: Gestão de Presença (Fora do Ciclo)
            </div>
          )}

          <div className="lg:col-span-4 space-y-8">
            <section className="bg-brand-light rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl overflow-hidden group">
              <div className="p-8 bg-white/5 border-b border-brand-primary/40 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-white uppercase text-lg tracking-tighter flex items-center gap-3">
                    <ClipboardCheck className="w-7 h-7 text-brand-primary" />
                    Lista de Presença
                    <HelpTooltip 
                      title="Lista de Presença" 
                      content="Jogadores que estão na quadra para o jogo. Apenas administradores podem adicionar ou remover jogadores manualmente aqui."
                    />
                  </h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1.5">{attendance.length} Guerreiros Escalados</p>
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip content="Ver Relatório de Presença">
                    <button 
                      onClick={() => setViewMode('attendance_report')} 
                      className="p-3 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all group/btn"
                    >
                      <BarChart3 className="w-6 h-6 group-hover/btn:scale-110 transition-transform"/>
                    </button>
                  </Tooltip>
                  {userRole === 'ADMIN' && (
                    <>
                      <Tooltip content="Limpar lista" position="left">
                        <button 
                          onClick={clearAttendance} 
                          disabled={isSyncing}
                          className={`p-3 rounded-xl transition-all group/btn ${isSyncing ? 'text-white/10' : 'text-white/40 hover:text-red-400 hover:bg-red-500/10'}`}
                        >
                          <Trash2 className="w-6 h-6 group-hover/btn:scale-110 transition-transform"/>
                        </button>
                      </Tooltip>
                      <Tooltip content="Finalizar dia" position="left">
                        <button 
                          onClick={resetDailyMatches} 
                          disabled={isSyncing}
                          className={`p-3 rounded-xl transition-all group/btn ${isSyncing ? 'text-white/10' : 'text-white/40 hover:text-brand-primary hover:bg-brand-primary/10'}`}
                        >
                          <RotateCcw className="w-6 h-6 group-hover/btn:rotate-180 transition-transform duration-500"/>
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] lg:max-h-[600px] overflow-y-auto scrollbar-hide">
                {attendance.length === 0 ? (
                  <div className="col-span-full text-center py-24 space-y-6">
                    <div className="relative inline-block">
                      <div className="absolute inset-0 bg-brand-primary/10 blur-2xl rounded-full"></div>
                      <Users className="w-24 h-24 text-white/20 relative z-10 mx-auto opacity-40" />
                    </div>
                    <p className="text-white/40 text-lg font-black uppercase tracking-widest italic">Aguardando convocações...</p>
                  </div>
                ) : (
                  displayedAttendance
                    .map((player, idx) => {
                      const fullPlayer = availablePlayers.find(p => p.id === player.id);
                      const displayName = player.name || fullPlayer?.name || "Sócio sem nome";
                      
                      const generationResult = useStore.getState().generationResult;
                      const isCurrentlyBenched = generationResult?.remainingPlayers?.some(rp => rp.id === player.id);
                      const displayBenchedCount = (player.consecutiveBenched || 0) + (isCurrentlyBenched ? 1 : 0);
                      
                      const now = new Date();
                      const currentTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
                      
                      console.log(`Debug: Player ${player.name}, totalPlayers: ${attendance.length}, predicted: ${predicted}`);

                      const hasSpecialSchedule = player.departureTime || player.arrivalTime;

                      return (
                        <div key={player.id || `attendance-${idx}`} className={`flex flex-col p-2 rounded-xl border transition-all group shadow-sm hover:shadow-xl bg-brand-light ${hasSpecialSchedule ? 'border-brand-primary/60 bg-brand-primary/5' : 'border-brand-primary/20'} hover:border-brand-primary/50 gap-1.5 relative`}>
                          {hasSpecialSchedule && (
                            <div className="absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 bg-brand-primary/5 rounded-full blur-xl group-hover:bg-brand-primary/10 transition-all"></div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="text-[8px] font-black italic text-brand-primary/40">
                              #{(player.arrivalOrder && player.arrivalOrder < 999) ? player.arrivalOrder : idx + 1}
                            </div>
                            <div className="flex items-center gap-1">
                              {(userRole === 'ADMIN' || currentPlayer?.id === player.id) && (
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingArrival(player.id);
                                      setTempArrivalTime(player.arrivalTime || SESSION_START_TIME);
                                      setEditingDeparture(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all z-20 ${player.arrivalTime ? 'text-brand-primary bg-brand-primary/10' : 'text-white/20 hover:text-brand-primary hover:bg-brand-primary/10'}`}
                                    title="Definir Horário de Chegada"
                                  >
                                    <Clock className="w-3 h-3 rotate-180 text-white" strokeWidth={3} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingDeparture(player.id);
                                      setTempDepartureTime(player.departureTime || SESSION_END_TIME);
                                      setEditingArrival(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all z-20 ${player.departureTime ? 'text-brand-primary bg-brand-primary/10' : 'text-white/20 hover:text-brand-primary hover:bg-brand-primary/10'}`}
                                    title="Definir Horário de Saída"
                                  >
                                    <Clock className="w-3 h-3 text-white" strokeWidth={3} />
                                  </button>
                                </div>
                              )}
                              {userRole === 'ADMIN' && (
                                <button 
                                  onClick={() => removeAttendance(player.id)} 
                                  disabled={isSyncing}
                                  className={`p-1 rounded-lg transition-all ${isSyncing ? 'text-white/5' : 'text-white/20 hover:text-red-400 hover:bg-red-500/10'}`}
                                >
                                  <X className="w-4 h-4 text-white" strokeWidth={3} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div className="min-w-0">
                             <div className={`text-[12px] font-black uppercase leading-none tracking-tighter flex items-center flex-wrap gap-1 justify-end ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                               {capitalizeName(displayName)}
                               {/* LED 1: IC (Índice Composto) */}
                               {attendanceStats.icMap[player.id] && (
                                 <div 
                                   className="inline-flex items-center ml-0.5" 
                                   title={attendanceStats.icMap[player.id].title}
                                 >
                                   <div className={`w-2 h-2 rounded-full ${attendanceStats.icMap[player.id].color}`} />
                                 </div>
                               )}
                               {/* LED 2: Tier Técnico / Habilidades Puras (TOP 2, TOP 4, BOT 4, BOT 2) */}
                               {attendanceStats.techTierMap[player.id] === 'TOP2' && (
                                 <div 
                                   className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/40 text-[7.5px] font-black uppercase shadow-sm shrink-0"
                                   title="LED Técnico: Top 2 (Maior nível de Habilidades Puras da presença)"
                                 >
                                   <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                   <div className="ml-0.5">TOP 2</div>
                                 </div>
                               )}
                               {attendanceStats.techTierMap[player.id] === 'TOP4' && (
                                 <div 
                                   className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[7.5px] font-black uppercase shadow-sm shrink-0"
                                   title="LED Técnico: Top 4 (Destaque de Habilidades Puras da presença)"
                                 >
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                   <div className="ml-0.5">TOP 4</div>
                                 </div>
                               )}
                               {attendanceStats.techTierMap[player.id] === 'BOTTOM4' && (
                                 <div 
                                   className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/40 text-[7.5px] font-black uppercase shadow-sm shrink-0"
                                   title="LED Técnico: Bottom 4 (Menor nível de Habilidades Puras)"
                                 >
                                   <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                   <div className="ml-0.5">BOT 4</div>
                                 </div>
                               )}
                               {attendanceStats.techTierMap[player.id] === 'BOTTOM2' && (
                                 <div 
                                   className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 text-[7.5px] font-black uppercase shadow-sm shrink-0"
                                   title="LED Técnico: Bottom 2 (Menor nível técnico de Habilidades Puras)"
                                 >
                                   <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                   <div className="ml-0.5">BOT 2</div>
                                 </div>
                               )}
                               {player.checkInMethod === 'NFC' && (
                                 <div className="text-[7px] bg-white text-emerald-600 border border-emerald-500 px-1.5 py-0.5 rounded flex items-center gap-1 font-black tracking-widest shadow-lg shadow-emerald-500/20" title="Check-in via Tag NFC">
                                   <SmartphoneNfc className="w-2.5 h-2.5 text-emerald-600" /> NFC
                                 </div>
                               )}
                               {player.checkInMethod === 'QR' && (
                                 <div className="text-[7px] bg-white text-blue-600 border border-blue-500 px-1.5 py-0.5 rounded flex items-center gap-1 font-black tracking-widest shadow-lg shadow-blue-500/20" title="Check-in via QR Code">
                                   <QrCode className="w-2.5 h-2.5 text-blue-600" /> QR
                                 </div>
                               )}
                               {(!player.checkInMethod || player.checkInMethod === 'MANUAL') && (
                                 <div className="text-[7px] bg-white text-zinc-900 border border-zinc-300 px-1.5 py-0.5 rounded flex items-center gap-1 font-black tracking-widest shadow-lg" title="Check-in Manual">
                                   <UserCheck className="w-2.5 h-2.5 text-zinc-900 opacity-90" /> MANUAL
                                 </div>
                               )}
                             </div>
                             
                             {editingDeparture === player.id || editingArrival === player.id ? (
                               <div className="flex items-center gap-1 my-1 animate-in fade-in slide-in-from-top-1 z-30 bg-black/95 p-1.5 rounded-lg border border-brand-primary/40 shadow-2xl">
                                 <input 
                                   type="time"
                                   value={editingDeparture === player.id ? tempDepartureTime : tempArrivalTime}
                                   onChange={(e) => editingDeparture === player.id ? setTempDepartureTime(e.target.value) : setTempArrivalTime(e.target.value)}
                                   className="bg-black border border-brand-primary/40 rounded px-1 py-0.5 text-[10px] text-brand-primary font-black w-20 focus:outline-none focus:border-brand-primary"
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
                                   className="p-1 bg-brand-primary text-black rounded hover:bg-white transition-colors"
                                 >
                                   <CheckCircle2 className="w-3 h-3" />
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setEditingDeparture(null);
                                     setEditingArrival(null);
                                   }}
                                   className="p-1 bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
                                 >
                                   <X className="w-3 h-3 text-white" strokeWidth={3} />
                                 </button>
                               </div>
                             ) : (
                               <div className="flex items-center gap-1 mt-1 flex-wrap">
                                 <div className="text-[8px] font-black text-brand-primary/60 italic tracking-tighter uppercase shrink-0">
                                   IC {Math.round(calculateEffectiveElo(fullPlayer || player))}
                                 </div>
                                 {displayBenchedCount > 0 && (
                                   <div className="px-1.5 py-0.5 rounded-full bg-brand-primary text-black text-[8px] font-black shrink-0">{displayBenchedCount}B</div>
                                 )}
                                                      {player.arrivalTime && (
                                   <div className="flex items-center gap-1 bg-brand-primary/40 px-2 py-1 rounded border border-brand-primary/60 shadow-md">
                                     <Zap className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                     <div className="text-[12px] font-black text-white uppercase tracking-tight">In: {player.arrivalTime}</div>
                                   </div>
                                 )}
 
                                 {player.departureTime && (
                                   <div className="flex items-center gap-1 bg-brand-primary/40 px-2 py-1 rounded border border-brand-primary/60 shadow-md">
                                     <LogOut className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                     <div className="text-[12px] font-black text-white uppercase tracking-tight">Out: {player.departureTime}</div>
                                   </div>
                                 )}
                                 
                                 {predicted !== 99 && (
                                   <div className="flex items-center gap-0.5 bg-white/5 px-1 py-0.5 rounded border border-white/10">
                                     <BarChart3 className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                     <div className="text-[7px] font-black text-white uppercase">Prev: {predicted}j</div>
                                   </div>
                                 )}
                               </div>
                             )}
                          </div>
                        </div>
                      );
                    })
                )}
                </div>
              <div className="p-8 bg-brand-primary/5 border-t border-brand-primary/40">
                <p className="text-xs text-white/40 font-black uppercase text-center italic leading-relaxed tracking-widest">
                  {attendance.length < 12 
                    ? `Mínimo de 12 guerreiros para escalar (Faltam ${12 - attendance.length})` 
                    : "Elite convocada. Vá para a aba Partida para escalar."}
                </p>
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-8">
            <div className="bg-brand-light backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Guerreiros Disponíveis</h3>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em]">
                    {userRole === 'ADMIN' ? 'Selecione para convocar ao campo' : 'Visualização restrita para o comando'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-black text-brand-primary uppercase tracking-widest bg-brand-primary/10 px-5 py-3 rounded-2xl border border-brand-primary/40">
                  <div className="w-3 h-3 rounded-full bg-brand-primary animate-pulse shadow-[0_0_12px_rgba(245,196,41,0.8)]"></div>
                  {activeAvailablePlayers.length} Sócios Ativos
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {userRole !== 'ADMIN' ? (
                  <span className="col-span-full py-32 text-center bg-white/5 rounded-[2.5rem] border-2 border-dashed border-brand-primary/40 space-y-6">
                    <Users className="w-20 h-20 text-white/20 mx-auto" />
                    <p className="text-white/40 text-sm font-black uppercase tracking-[0.3em] max-w-md mx-auto leading-relaxed">Apenas o comando administrativo pode realizar convocações diretas.</p>
                  </span>
                ) : activeAvailablePlayers.length === 0 ? (
                  <span className="col-span-full py-32 text-center space-y-4">
                    <span className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto"></span>
                    <p className="text-white/60 text-lg font-black uppercase tracking-tighter italic">Carregando sócios...</p>
                  </span>
                ) : activeAvailablePlayers
                  .filter(p => !attendance.some(a => a.id === p.id))
                  .length === 0 ? (
                  <span className="col-span-full py-32 text-center space-y-4">
                    <CheckCircle2 className="w-20 h-20 text-brand-primary/20 mx-auto" />
                    <p className="text-white/60 text-xl font-black uppercase tracking-tighter italic">Todos os guerreiros já estão em campo!</p>
                  </span>
                ) : (
                    activeAvailablePlayers
                    .filter(p => !attendance.some(a => a.id === p.id))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((player, idx) => (
                      <button 
                        key={player.id || `available-${idx}`} 
                        onClick={() => registerAttendance(player)} 
                        disabled={isSyncing}
                        className={`flex items-center justify-between p-2 rounded-xl border hover:shadow-xl transition-all text-left group bg-brand-light border-brand-primary/40 hover:border-brand-primary/50 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="min-w-0">
                          <p className={`text-[12px] font-black uppercase flex items-center gap-1.5 leading-tight tracking-tighter ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                            {capitalizeName(player.name || "Sócio")}
                            {player.isOfficialSetter && <span className="text-[7px] font-black uppercase bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded-full border border-brand-primary/40 leading-none">L</span>}
                          </p>
                        </span>
                        <span className="p-1 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-brand-secondary rounded-lg shadow-lg transition-all border border-brand-primary/40 shrink-0"><Plus className="w-4 h-4" /></span>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* PHASE: OFF-CYCLE (Fri-Wed) - Hidden for Admin */}
      {!isGameDay && userRole !== 'ADMIN' && (
        <span className="lg:col-span-12 py-40 text-center space-y-10 animate-in zoom-in duration-1000">
          <span className="relative inline-block">
            <span className="absolute inset-0 bg-brand-primary/30 blur-[100px] rounded-full animate-pulse"></span>
            <Calendar className="w-40 h-40 text-brand-primary relative z-10 mx-auto drop-shadow-2xl" />
          </span>
          <span className="space-y-6">
            <h2 className="text-7xl font-black text-white tracking-tighter uppercase leading-none">Descanso dos Guerreiros</h2>
            <p className="text-2xl text-white/60 font-black uppercase tracking-[0.4em] max-w-3xl mx-auto leading-relaxed">
              As batalhas acontecem às <span className="text-brand-primary">quintas-feiras</span>. 
              <br />
              Prepare-se para a próxima convocação.
            </p>
          </span>
          <span className="flex justify-center gap-6">
            <span className="px-12 py-6 bg-brand-light backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/5 border-l-[6px] border-l-brand-primary">
              <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mb-2">Próxima Partida</p>
              <p className="text-2xl font-black text-white uppercase tracking-tighter">Quinta-feira</p>
            </span>
          </span>
        </span>
      )}
    </div>
  );
};
