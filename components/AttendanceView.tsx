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
  Calendar
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
  userRole
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
      className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
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
        <div className="bg-white p-2 rounded-full shadow-lg border border-slate-200">
          <RotateCcw className={`w-6 h-6 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* PHASE: GAME DAY (Thu) or ADMIN OVERRIDE */}
      {(isGameDay || userRole === 'ADMIN') && (
        <>
          {/* Admin Override Badge */}
          {userRole === 'ADMIN' && !isGameDay && (
            <div className="lg:col-span-12 bg-emerald-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest inline-block text-center mb-4">
              Modo Administrador: Gestão de Presença (Fora do Ciclo)
            </div>
          )}

          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-800 uppercase text-base tracking-widest flex items-center gap-2">
                    <ClipboardCheck className="w-6 h-6 text-emerald-600" />
                    Presença
                  </h2>
                  <p className="text-xs text-slate-500 font-bold uppercase mt-1">{attendance.length} confirmados</p>
                </div>
                <div className="flex items-center gap-1">
                  {userRole === 'ADMIN' && (
                    <>
                      <button onClick={clearAttendance} title="Limpar lista" className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-6 h-6"/></button>
                      <button onClick={resetDailyMatches} title="Finalizar dia" className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><RotateCcw className="w-6 h-6"/></button>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-4 max-h-[60vh] lg:max-h-[500px] overflow-y-auto">
                {attendance.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-20 h-20 text-slate-100 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg italic">Ninguém confirmou ainda...</p>
                  </div>
                ) : (
                  [...attendance]
                    .sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0))
                    .map((player, idx) => {
                      const fullPlayer = availablePlayers.find(p => p.id === player.id);
                      const displayName = player.name || fullPlayer?.name || "Sócio sem nome";
                      
                      return (
                        <div key={player.id || `attendance-${idx}`} className={`flex items-center justify-between p-4 sm:p-6 rounded-2xl border transition-all group shadow-sm hover:shadow-md ${player.gender === Gender.FEMALE ? 'bg-pink-50/30 border-pink-100 hover:border-pink-200' : 'bg-white border-slate-100 hover:border-emerald-200'}`}>
                          <div className="flex items-center gap-3 sm:gap-5">
                            <span className="text-sm sm:text-lg font-black text-emerald-500 w-6 sm:w-8">#{player.arrivalOrder}</span>
                            <div>
                              <p className={`text-lg sm:text-2xl font-black flex items-center gap-2 leading-tight ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'}`}>
                                {displayName}
                                {player.isOfficialSetter && <span className="text-[10px] sm:text-[12px] font-black uppercase bg-rose-100 text-rose-600 px-2.5 py-1 rounded-full border border-rose-200">Levantador</span>}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1.5 sm:mt-3">
                                <span className="text-xs sm:text-base font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                  {player.dailyWins}V - {player.dailyLosses}D
                                </span>
                                <span className="text-xs sm:text-base text-slate-600 font-black uppercase tracking-wider">ELO {player.elo}</span>
                                {player.playedLastMatch && <span className="text-[10px] sm:text-[12px] font-black uppercase bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100">Jogou Última</span>}
                                {(player.consecutiveBenched || 0) > 0 && <span className="text-[10px] sm:text-[12px] font-black uppercase bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-100">Banco: {player.consecutiveBenched}</span>}
                              </div>
                            </div>
                          </div>
                          {userRole === 'ADMIN' && (
                            <button onClick={() => removeAttendance(player.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><X className="w-7 h-7" /></button>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <p className="text-sm text-slate-500 font-bold uppercase text-center italic leading-relaxed">
                  {attendance.length < 12 
                    ? `Mínimo de 12 jogadores para escalar (Faltam ${12 - attendance.length})` 
                    : "Vá para a aba Partida para escalar o jogo"}
                </p>
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-black text-slate-500 uppercase tracking-[0.2em]">Sócios Disponíveis</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                    {userRole === 'ADMIN' ? 'Todos os sócios ativos' : 'Visualização restrita para administradores'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  {(availablePlayers || []).length} Sócios
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userRole !== 'ADMIN' ? (
                  <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Apenas administradores podem realizar check-in.</p>
                  </div>
                ) : (availablePlayers || [])
                  .filter(p => !attendance.some(a => a.id === p.id))
                  .length === 0 ? (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-slate-400 text-lg italic">Nenhum sócio disponível para check-in no momento.</p>
                  </div>
                ) : (
                  (availablePlayers || [])
                    .filter(p => !attendance.some(a => a.id === p.id))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((player, idx) => (
                      <button 
                        key={player.id || `available-${idx}`} 
                        onClick={() => registerAttendance(player)} 
                        className={`flex items-center justify-between p-6 rounded-2xl border hover:shadow-lg transition-all text-left group ${player.gender === Gender.FEMALE ? 'bg-pink-50/30 border-pink-100 hover:border-pink-300 hover:bg-pink-50' : 'bg-slate-50/50 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/50'}`}
                      >
                        <div>
                          <p className={`text-xl font-black flex items-center gap-2 ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'}`}>
                            {player.name || "Sócio sem nome"}
                            {player.isOfficialSetter && <span className="text-[11px] font-black uppercase bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full border border-rose-200">Levantador</span>}
                          </p>
                          <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mt-2">Jogos Hoje: <span className="text-indigo-600">{player.dailyMatches}</span> • <span className="text-emerald-600 font-black">{player.elo} ELO</span></p>
                        </div>
                        <div className="p-3 bg-white text-slate-300 group-hover:bg-emerald-600 group-hover:text-white rounded-xl shadow-sm transition-all border border-slate-100"><Plus className="w-7 h-7" /></div>
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
        <div className="lg:col-span-12 py-32 text-center space-y-8 animate-in zoom-in duration-700">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"></div>
            <Calendar className="w-32 h-32 text-slate-200 relative z-10 mx-auto" />
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase">Fim de Ciclo</h2>
            <p className="text-xl text-slate-500 font-bold uppercase tracking-widest max-w-2xl mx-auto leading-relaxed">
              As partidas acontecem às quintas-feiras. 
              <br />
              A lista de presença abre na <span className="text-indigo-600">Quinta-feira</span>.
            </p>
          </div>
          <div className="flex justify-center gap-4">
            <div className="px-8 py-4 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200">
              <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Próximo Jogo</p>
              <p className="text-lg font-black text-white uppercase">Quinta-feira</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
