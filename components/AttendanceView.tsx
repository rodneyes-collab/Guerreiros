import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { translateGender } from '../utils/helpers';
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
  BarChart3
} from 'lucide-react';

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
  const { attendance, preConfirmations, isSyncing } = useStore();
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
        <div className="bg-brand-secondary/80 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-brand-primary/20">
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
            <section className="bg-brand-secondary/30 backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden group">
              <div className="p-8 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-white uppercase text-lg tracking-tighter flex items-center gap-3">
                    <ClipboardCheck className="w-7 h-7 text-brand-primary" />
                    Lista de Elite
                  </h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1.5">{attendance.length} Guerreiros Confirmados</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setViewMode('attendance_report')} 
                    title="Ver Relatório de Presença" 
                    className="p-3 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all group/btn"
                  >
                    <BarChart3 className="w-6 h-6 group-hover/btn:scale-110 transition-transform"/>
                  </button>
                  {userRole === 'ADMIN' && (
                    <>
                      <button 
                        onClick={clearAttendance} 
                        title="Limpar lista" 
                        className="p-3 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all group/btn"
                      >
                        <Trash2 className="w-6 h-6 group-hover/btn:scale-110 transition-transform"/>
                      </button>
                      <button 
                        onClick={resetDailyMatches} 
                        title="Finalizar dia" 
                        className="p-3 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all group/btn"
                      >
                        <RotateCcw className="w-6 h-6 group-hover/btn:rotate-180 transition-transform duration-500"/>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="p-6 space-y-5 max-h-[60vh] lg:max-h-[600px] overflow-y-auto scrollbar-hide">
                {attendance.length === 0 ? (
                  <div className="text-center py-24 space-y-6">
                    <div className="relative inline-block">
                      <div className="absolute inset-0 bg-brand-primary/10 blur-2xl rounded-full"></div>
                      <Users className="w-24 h-24 text-white/20 relative z-10 mx-auto opacity-40" />
                    </div>
                    <p className="text-white/40 text-lg font-black uppercase tracking-widest italic">Aguardando convocações...</p>
                  </div>
                ) : (
                  [...attendance]
                    .sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0))
                    .map((player, idx) => {
                      const fullPlayer = availablePlayers.find(p => p.id === player.id);
                      const displayName = player.name || fullPlayer?.name || "Sócio sem nome";
                      
                      return (
                        <div key={player.id || `attendance-${idx}`} className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all group shadow-sm hover:shadow-xl hover:-translate-y-1 bg-white/5 border-white/10 hover:border-brand-primary/50`}>
                          <div className="flex items-center gap-5">
                            <span className="text-2xl font-black text-brand-primary/40 w-10 italic group-hover:text-brand-primary transition-colors">#{player.arrivalOrder}</span>
                            <div>
                              <p className={`text-2xl font-black flex items-center gap-3 leading-none uppercase tracking-tight ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                                {displayName}
                                {player.isOfficialSetter && <span className="text-[10px] font-black uppercase bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full border border-brand-primary/20">Levantador</span>}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 mt-3">
                                <span className="text-xs font-black text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-lg border border-brand-primary/20">
                                  {translateGender(player.gender)}
                                </span>
                                <span className="text-xs font-black text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-lg border border-brand-primary/20">
                                  {player.dailyWins}V - {player.dailyLosses}D
                                </span>
                                <span className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em]">ELO {Math.round(player.elo)}</span>
                                {player.playedLastMatch && <span className="text-[10px] font-black uppercase bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full border border-brand-primary/20">Jogou Última</span>}
                                {(player.consecutiveBenched || 0) > 0 && <span className="text-[10px] font-black uppercase bg-white/10 text-white/80 px-3 py-1 rounded-full border border-white/20">Banco: {player.consecutiveBenched}</span>}
                              </div>
                            </div>
                          </div>
                          {userRole === 'ADMIN' && (
                            <button 
                              onClick={() => removeAttendance(player.id)} 
                              className="p-3 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                            >
                              <X className="w-8 h-8" />
                            </button>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
              <div className="p-8 bg-black/20 border-t border-white/10">
                <p className="text-xs text-white/40 font-black uppercase text-center italic leading-relaxed tracking-widest">
                  {attendance.length < 12 
                    ? `Mínimo de 12 guerreiros para escalar (Faltam ${12 - attendance.length})` 
                    : "Elite convocada. Vá para a aba Partida para escalar."}
                </p>
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-8">
            <div className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Guerreiros Disponíveis</h3>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em]">
                    {userRole === 'ADMIN' ? 'Selecione para convocar ao campo' : 'Visualização restrita para o comando'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-black text-brand-primary uppercase tracking-widest bg-brand-primary/10 px-5 py-3 rounded-2xl border border-brand-primary/20">
                  <div className="w-3 h-3 rounded-full bg-brand-primary animate-pulse shadow-[0_0_12px_rgba(245,196,41,0.8)]"></div>
                  {(availablePlayers || []).length} Sócios Ativos
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userRole !== 'ADMIN' ? (
                  <div className="col-span-full py-32 text-center bg-white/5 rounded-[2.5rem] border-2 border-dashed border-white/10 space-y-6">
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
                        className={`flex items-center justify-between p-8 rounded-[2rem] border hover:shadow-2xl transition-all text-left group hover:-translate-y-1 bg-white/5 border-white/10 hover:border-brand-primary/50`}
                      >
                        <div className="space-y-3">
                          <p className={`text-2xl font-black flex items-center gap-3 leading-none uppercase tracking-tight ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                            {player.name || "Sócio sem nome"}
                            {player.isOfficialSetter && <span className="text-[10px] font-black uppercase bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full border border-brand-primary/20">Levantador</span>}
                          </p>
                          <p className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em]">
                            {translateGender(player.gender)} • Jogos Hoje: <span className="text-brand-primary">{player.dailyMatches}</span> • <span className="text-white font-black">{Math.round(player.elo)} ELO</span>
                          </p>
                        </div>
                        <div className="p-4 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-brand-secondary rounded-2xl shadow-xl transition-all border border-brand-primary/20 group-hover:scale-110"><Plus className="w-8 h-8" /></div>
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
            <div className="px-12 py-6 bg-brand-secondary/30 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10">
              <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mb-2">Próxima Batalha</p>
              <p className="text-2xl font-black text-white uppercase tracking-tighter">Quinta-feira</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
