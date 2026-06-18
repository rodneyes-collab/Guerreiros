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
  BarChart3
} from 'lucide-react';

import { getPriorityQueue, calculateEffectiveElo } from '../utils/teamLogic';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { Tooltip } from '../src/components/Tooltip';

interface AttendanceViewProps {
  clearAttendance: () => void;
  resetDailyMatches: () => void;
  removeAttendance: (id: string) => void;
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
  const { attendance: allAttendance, preConfirmations: allPreConfirmations, isSyncing } = useStore();

  const attendance = React.useMemo(() => allAttendance.filter(p => (!p.status || p.status === 'active') && !p.isDM), [allAttendance]);

  const displayedAttendance = React.useMemo(() => {
    return [...attendance].sort((a, b) => {
      if (a.arrivalOrder !== b.arrivalOrder) {
        return (a.arrivalOrder ?? 999) - (b.arrivalOrder ?? 999);
      }
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
  }, [attendance]);

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-4 h-4 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-4 h-4 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-4 h-4 text-white/20" />;
    }
  };

  const preConfirmations = React.useMemo(() => allPreConfirmations.filter(p => (!p.status || p.status === 'active') && !p.isDM), [allPreConfirmations]);
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
                      content="Jogadores que confirmaram presença no dia do jogo. Apenas administradores podem adicionar ou remover jogadores manualmente aqui."
                    />
                  </h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1.5">{attendance.length} Guerreiros Confirmados</p>
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
                      
                      return (
                        <div key={player.id || `attendance-${idx}`} className="flex flex-col p-2 rounded-xl border transition-all group shadow-sm hover:shadow-xl bg-brand-light border-brand-primary/20 hover:border-brand-primary/50 gap-1.5 relative overflow-hidden">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black italic text-brand-primary/40">
                              #{(player.arrivalOrder && player.arrivalOrder < 999) ? player.arrivalOrder : idx + 1}
                            </span>
                            {userRole === 'ADMIN' && (
                              <button 
                                onClick={() => removeAttendance(player.id)} 
                                disabled={isSyncing}
                                className={`p-1 rounded-lg transition-all ${isSyncing ? 'text-white/5' : 'text-white/20 hover:text-red-400 hover:bg-red-500/10'}`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          
                          <div className="min-w-0">
                             <p className={`text-[12px] font-black uppercase leading-none tracking-tighter ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                               {capitalizeName(displayName)}
                             </p>
                             <div className="flex items-center gap-1 mt-1 flex-wrap">
                               <span className="text-[8px] font-black text-brand-primary/60 italic tracking-tighter uppercase shrink-0">
                                 ELO {Math.round(calculateEffectiveElo(fullPlayer || player))}
                               </span>
                               {displayBenchedCount > 0 && (
                                 <div className="px-1.5 py-0.5 rounded-full bg-brand-primary text-black text-[8px] font-black shrink-0">{displayBenchedCount}B</div>
                               )}
                             </div>
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
                  {(availablePlayers || []).length} Sócios Ativos
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {userRole !== 'ADMIN' ? (
                  <div className="col-span-full py-32 text-center bg-white/5 rounded-[2.5rem] border-2 border-dashed border-brand-primary/40 space-y-6">
                    <Users className="w-20 h-20 text-white/20 mx-auto" />
                    <p className="text-white/40 text-sm font-black uppercase tracking-[0.3em] max-w-md mx-auto leading-relaxed">Apenas o comando administrativo pode realizar convocações diretas.</p>
                  </div>
                ) : (availablePlayers || [])
                  .filter(p => !attendance.some(a => a.id === p.id))
                  .length === 0 ? (
                  <div className="col-span-full py-32 text-center space-y-4">
                    <CheckCircle2 className="w-20 h-20 text-brand-primary/20 mx-auto" />
                    <p className="text-white/60 text-xl font-black uppercase tracking-tighter italic">Todos os guerreiros já estão em campo!</p>
                  </div>
                ) : (
                    (availablePlayers || [])
                    .filter(p => !attendance.some(a => a.id === p.id))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((player, idx) => (
                      <button 
                        key={player.id || `available-${idx}`} 
                        onClick={() => registerAttendance(player)} 
                        disabled={isSyncing}
                        className={`flex items-center justify-between p-2 rounded-xl border hover:shadow-xl transition-all text-left group bg-brand-light border-brand-primary/40 hover:border-brand-primary/50 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className={`text-[12px] font-black uppercase flex items-center gap-1.5 leading-tight tracking-tighter ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                            {capitalizeName(player.name || "Sócio")}
                            {player.isOfficialSetter && <span className="text-[7px] font-black uppercase bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded-full border border-brand-primary/40 leading-none">L</span>}
                          </p>
                        </div>
                        <div className="p-1 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-brand-secondary rounded-lg shadow-lg transition-all border border-brand-primary/40 shrink-0"><Plus className="w-4 h-4" /></div>
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
        <div className="lg:col-span-12 py-40 text-center space-y-10 animate-in zoom-in duration-1000">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-brand-primary/30 blur-[100px] rounded-full animate-pulse"></div>
            <Calendar className="w-40 h-40 text-brand-primary relative z-10 mx-auto drop-shadow-2xl" />
          </div>
          <div className="space-y-6">
            <h2 className="text-7xl font-black text-white tracking-tighter uppercase leading-none">Descanso dos Guerreiros</h2>
            <p className="text-2xl text-white/60 font-black uppercase tracking-[0.4em] max-w-3xl mx-auto leading-relaxed">
              As batalhas acontecem às <span className="text-brand-primary">quintas-feiras</span>. 
              <br />
              Prepare-se para a próxima convocação.
            </p>
          </div>
          <div className="flex justify-center gap-6">
            <div className="px-12 py-6 bg-brand-light backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/5 border-l-[6px] border-l-brand-primary">
              <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mb-2">Próxima Partida</p>
              <p className="text-2xl font-black text-white uppercase tracking-tighter">Quinta-feira</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
