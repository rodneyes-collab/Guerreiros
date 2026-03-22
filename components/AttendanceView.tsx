import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
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
  isNearCourt: boolean;
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
  isNearCourt,
  currentPlayer,
  preConfirmations,
  isIntentionPhase,
  isGameDay,
  onToggleIntention,
  userRole
}) => {
  const { attendance, isSyncing } = useStore();
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

      {/* PHASE: INTENTION (Tue/Wed) or ADMIN OVERRIDE */}
      {(isIntentionPhase || userRole === 'ADMIN') && (
        <div className="lg:col-span-12 space-y-8">
          {/* Admin Override Badge */}
          {userRole === 'ADMIN' && !isIntentionPhase && (
            <div className="bg-indigo-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest inline-block mx-auto">
              Modo Administrador: Gestão de Intenções (Fora do Ciclo)
            </div>
          )}
          {/* Intention Toggle Card */}
          {currentPlayer && (
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <ClipboardCheck className="w-48 h-48" />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-4 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase tracking-widest">
                    <Calendar className="w-4 h-4" />
                    Planejamento Semanal
                  </div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
                    Você vai jogar nesta Quinta?
                  </h2>
                  <p className="text-slate-500 font-bold uppercase text-sm max-w-lg">
                    Confirme sua intenção de jogo para ajudar na organização. 
                    Você pode desmarcar a qualquer momento se surgir um imprevisto.
                  </p>
                </div>

                <button
                  onClick={() => onToggleIntention(currentPlayer)}
                  className={`group relative flex items-center gap-4 px-12 py-6 rounded-3xl font-black uppercase tracking-widest transition-all transform active:scale-95 shadow-2xl ${
                    preConfirmations.some(p => p.id === currentPlayer.id)
                      ? 'bg-rose-50 text-rose-600 border-2 border-rose-200 hover:bg-rose-100'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-200'
                  }`}
                >
                  {preConfirmations.some(p => p.id === currentPlayer.id) ? (
                    <>
                      <X className="w-6 h-6" />
                      Desmarcar Intenção
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      Confirmar Intenção
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Public Intention List */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                  <Users className="w-7 h-7 text-indigo-600" />
                  Lista de Intenção
                </h3>
                <p className="text-xs text-slate-500 font-bold uppercase mt-2">
                  {preConfirmations.length} sócios confirmaram interesse para Quinta
                </p>
              </div>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {preConfirmations.length === 0 ? (
                <div className="col-span-full py-20 text-center">
                  <Users className="w-24 h-24 text-slate-100 mx-auto mb-6" />
                  <p className="text-slate-400 text-xl italic font-medium">Ninguém confirmou intenção ainda...</p>
                </div>
              ) : (
                preConfirmations.map((player) => (
                  <div 
                    key={player.id} 
                    className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-md group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 font-black text-lg shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      {player.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 uppercase tracking-tight">{player.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sócio Ativo</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* PHASE: GAME DAY (Thu) or ADMIN OVERRIDE */}
      {(isGameDay || userRole === 'ADMIN') && (
        <>
          {/* Admin Override Badge */}
          {userRole === 'ADMIN' && !isGameDay && (
            <div className="lg:col-span-12 bg-emerald-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest inline-block text-center">
              Modo Administrador: Gestão de Presença (Fora do Ciclo)
            </div>
          )}
          {/* Quick Check-in / GPS Alert */}
          {currentPlayer && !attendance.some(p => p.id === currentPlayer.id) && (
            <div className="lg:col-span-12 mb-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className={`relative overflow-hidden rounded-[2.5rem] p-6 md:p-8 border-2 transition-all ${isNearCourt ? 'bg-emerald-600 border-emerald-400 shadow-xl shadow-emerald-200' : 'bg-white border-slate-100 shadow-lg shadow-slate-200/50'}`}>
                {isNearCourt && (
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <MapPin className="w-32 h-32 text-white" />
                  </div>
                )}
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl ${isNearCourt ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                        <MapPin className="w-5 h-5" />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isNearCourt ? 'text-emerald-100' : 'text-emerald-600'}`}>
                        {isNearCourt ? 'Você chegou na quadra!' : 'Check-in Rápido'}
                      </span>
                    </div>
                    <h3 className={`text-3xl font-black tracking-tighter ${isNearCourt ? 'text-white' : 'text-slate-900'}`}>
                      Olá, {currentPlayer.name}!
                    </h3>
                    <p className={`text-sm font-bold ${isNearCourt ? 'text-emerald-50' : 'text-slate-500'} max-w-md`}>
                      {isNearCourt 
                        ? 'Detectamos que você está próximo à quadra. Deseja confirmar sua presença agora?' 
                        : 'Confirme sua presença para participar das partidas de hoje.'}
                    </p>
                    {!preConfirmations.some(p => p.id === currentPlayer.id) && (
                      <p className="text-xs font-black text-rose-500 uppercase bg-rose-50 px-3 py-1 rounded-lg inline-block">
                        Atenção: Você não pré-confirmou na terça/quarta.
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
                      registerAttendance(currentPlayer);
                    }}
                    disabled={!preConfirmations.some(p => p.id === currentPlayer.id) && userRole !== 'ADMIN'}
                    className={`flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-black uppercase tracking-widest transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isNearCourt ? 'bg-white text-emerald-600 hover:bg-emerald-50 shadow-xl' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-200'}`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Confirmar Presença
                  </button>
                </div>
              </div>
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
                      <button onClick={resetDailyMatches} title="Zerar dia" className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><RotateCcw className="w-6 h-6"/></button>
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
                  attendance.map((player) => (
                    <div key={player.id} className={`flex items-center justify-between p-5 rounded-2xl border transition-all group shadow-sm hover:shadow-md ${player.gender === Gender.FEMALE ? 'bg-pink-50/30 border-pink-100 hover:border-pink-200' : 'bg-white border-slate-100 hover:border-emerald-200'}`}>
                      <div className="flex items-center gap-4">
                        <span className="text-base font-black text-emerald-500 w-6">#{player.arrivalOrder}</span>
                        <div>
                          <p className={`text-xl font-black flex items-center gap-2 ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'}`}>
                            {player.name}
                            {player.isOfficialSetter && <span className="text-[11px] font-black uppercase bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full border border-rose-200">Levantador</span>}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                              {player.dailyWins}V - {player.dailyLosses}D
                            </span>
                            <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">ELO {player.elo}</span>
                            {player.playedLastMatch && <span className="text-[11px] font-black uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full border border-blue-100">Jogou Última</span>}
                          </div>
                        </div>
                      </div>
                      {userRole === 'ADMIN' && (
                        <button onClick={() => removeAttendance(player.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><X className="w-7 h-7" /></button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <p className="text-sm text-slate-500 font-bold uppercase text-center italic leading-relaxed">
                  {attendance.length < 10 
                    ? `Mínimo de 10 jogadores para escalar (Faltam ${10 - attendance.length})` 
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
                    {userRole === 'ADMIN' ? 'Todos os sócios (Admin)' : 'Apenas quem pré-confirmou'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  {availablePlayers.filter(p => userRole === 'ADMIN' || preConfirmations.some(pc => pc.id === p.id)).length} Sócios
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availablePlayers.filter(p => userRole === 'ADMIN' || preConfirmations.some(pc => pc.id === p.id)).length === 0 ? (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-slate-400 text-lg italic">Nenhum sócio disponível para check-in no momento.</p>
                  </div>
                ) : (
                  availablePlayers
                    .filter(p => userRole === 'ADMIN' || preConfirmations.some(pc => pc.id === p.id))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(player => (
                      <button 
                        key={player.id} 
                        onClick={() => registerAttendance(player)} 
                        className={`flex items-center justify-between p-6 rounded-2xl border hover:shadow-lg transition-all text-left group ${player.gender === Gender.FEMALE ? 'bg-pink-50/30 border-pink-100 hover:border-pink-300 hover:bg-pink-50' : 'bg-slate-50/50 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/50'}`}
                      >
                        <div>
                          <p className={`text-xl font-black flex items-center gap-2 ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'}`}>
                            {player.name}
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

      {/* PHASE: OFF-CYCLE (Fri-Mon) - Hidden for Admin */}
      {!isIntentionPhase && !isGameDay && userRole !== 'ADMIN' && (
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
              A lista de intenção abre na <span className="text-indigo-600">Terça-feira</span>.
            </p>
          </div>
          <div className="flex justify-center gap-4">
            <div className="px-8 py-4 bg-slate-100 rounded-2xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Próxima Intenção</p>
              <p className="text-lg font-black text-slate-800 uppercase">Terça-feira</p>
            </div>
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
