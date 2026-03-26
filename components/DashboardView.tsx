import React from 'react';
import { useStore } from '../store';
import { 
  Trophy, 
  Target, 
  Zap, 
  Users,
  Sparkles,
  ArrowRight,
  RotateCcw
} from 'lucide-react';

interface DashboardViewProps {
  generateDailySummary: () => void;
  isGeneratingSummary: boolean;
  refreshPlayers: () => Promise<void>;
  userRole?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  generateDailySummary,
  refreshPlayers,
  userRole
}) => {
  const { players, matches, isNarratingSummary, isSyncing } = useStore();
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

  const mvp = [...players].sort((a, b) => b.wins - a.wins)[0];
  const bestSetter = [...players].filter(p => p.isOfficialSetter).sort((a, b) => b.wins - a.wins)[0];
  const topElo = [...players].sort((a, b) => b.elo - a.elo)[0];
  const activePlayers = players.filter(p => p.matchesPlayed > 0).length;

  const formatHour = (timestamp?: number) => {
    if (!timestamp) return '--:--';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div 
      className="relative space-y-8 animate-in fade-in duration-500"
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Painel</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Visão geral da temporada</p>
        </div>
        {userRole === 'ADMIN' && (
          <button 
            onClick={generateDailySummary}
            disabled={isNarratingSummary}
            className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-5 h-5 ${isNarratingSummary ? 'animate-spin' : ''}`} />
            {isNarratingSummary ? 'Gerando Resumo...' : 'Resumo IA do Dia'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
            <Trophy className="w-16 h-16 text-indigo-600" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">MVP da Temporada</p>
          <h3 className="text-2xl font-black text-slate-800">{mvp?.name || '-'}</h3>
          <p className="text-indigo-600 font-black text-sm mt-1 uppercase tracking-widest">{mvp?.wins || 0} Vitórias</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
            <Target className="w-16 h-16 text-amber-600" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Melhor Levantador</p>
          <h3 className="text-2xl font-black text-slate-800">{bestSetter?.name || '-'}</h3>
          <p className="text-amber-600 font-black text-sm mt-1 uppercase tracking-widest">{bestSetter?.wins || 0} Vitórias</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
            <Zap className="w-16 h-16 text-emerald-600" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Melhor do Ranking ELO</p>
          <h3 className="text-2xl font-black text-slate-800">{topElo?.name || '-'}</h3>
          <p className="text-emerald-600 font-black text-sm mt-1 uppercase tracking-widest">{topElo?.elo || 0} Pontos</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
            <Users className="w-16 h-16 text-slate-600" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Sócios Ativos</p>
          <h3 className="text-2xl font-black text-slate-800">{activePlayers}</h3>
          <p className="text-slate-600 font-black text-sm mt-1 uppercase tracking-widest">Em Quadra</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Líderes de ELO</h3>
            <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 hover:gap-3 transition-all">Ver Ranking Completo <ArrowRight className="w-3 h-3" /></button>
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            {[...players].sort((a, b) => b.elo - a.elo).slice(0, 5).map((player, idx) => (
              <div key={player.id} className="flex items-center justify-between p-6 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-6">
                  <span className="text-2xl font-black text-slate-200 w-8 italic">#{idx + 1}</span>
                  <div>
                    <p className="font-black text-slate-800">{player.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{player.wins}V - {player.losses}D</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-indigo-600 font-mono">{player.elo}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ELO</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Últimas Partidas</h3>
          <div className="space-y-4">
            {matches.slice(0, 5).map(match => (
              <div key={match.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{new Date(match.timestamp).toLocaleDateString('pt-BR')}</span>
                    {match.startTime && (
                      <span className="text-slate-300">• {formatHour(match.startTime)} - {formatHour(match.endTime)}</span>
                    )}
                  </div>
                  <span className="text-indigo-600">
                    {match.mode === 'QUICK' ? 'Rápida' : match.mode === 'SCORE' ? 'Pontuada' : 'Sequencial'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className={`flex-1 text-center p-2 rounded-xl ${match.winner === 'A' ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                    <p className={`text-lg font-black ${match.winner === 'A' ? 'text-indigo-600' : 'text-slate-400'}`}>{match.scoreA}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Time A</p>
                  </div>
                  <span className="text-slate-300 font-black italic">VS</span>
                  <div className={`flex-1 text-center p-2 rounded-xl ${match.winner === 'B' ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                    <p className={`text-lg font-black ${match.winner === 'B' ? 'text-indigo-600' : 'text-slate-400'}`}>{match.scoreB}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Time B</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
