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
      className="relative space-y-10 animate-in fade-in duration-700"
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
        <div className="bg-brand-secondary/30 backdrop-blur-xl p-2 rounded-full shadow-lg border border-white/10">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h2 className="text-5xl font-black text-brand-primary uppercase tracking-tighter leading-none">Painel de Elite</h2>
          <p className="text-sm font-bold text-white/40 uppercase tracking-[0.3em]">Visão geral da temporada atual</p>
        </div>
        {userRole === 'ADMIN' && (
          <button 
            onClick={generateDailySummary}
            disabled={isNarratingSummary}
            className="w-full md:w-auto bg-brand-primary text-brand-secondary px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-105 shadow-2xl shadow-brand-primary/20 transition-all disabled:opacity-50 group"
          >
            <Sparkles className={`w-5 h-5 group-hover:rotate-12 transition-transform ${isNarratingSummary ? 'animate-spin' : ''}`} />
            {isNarratingSummary ? 'Gerando Resumo...' : 'Resumo IA do Dia'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-brand-secondary/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden group hover:border-brand-primary/30 transition-all">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
            <Trophy className="w-20 h-20 text-brand-primary" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">MVP da Temporada</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">{mvp?.name || '-'}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-brand-primary font-black text-lg">{mvp?.wins || 0}</span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Vitórias</span>
          </div>
        </div>

        <div className="bg-brand-secondary/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden group hover:border-brand-primary/30 transition-all">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
            <Target className="w-20 h-20 text-brand-primary" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Melhor Levantador</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">{bestSetter?.name || '-'}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-brand-primary font-black text-lg">{bestSetter?.wins || 0}</span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Vitórias</span>
          </div>
        </div>

        <div className="bg-brand-secondary/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden group hover:border-brand-primary/30 transition-all">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
            <Zap className="w-20 h-20 text-brand-primary" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Líder do Ranking</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">{topElo?.name || '-'}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-brand-primary font-black text-lg">{Math.round(topElo?.elo || 0)}</span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">ELO</span>
          </div>
        </div>

        <div className="bg-brand-secondary/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden group hover:border-brand-primary/30 transition-all">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
            <Users className="w-20 h-20 text-brand-primary" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Sócios Ativos</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">{activePlayers}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-brand-primary font-black text-lg">{(players?.length || 0)}</span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cadastrados</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tighter">Top 5 Guerreiros</h3>
            <button className="text-[10px] font-black text-brand-secondary bg-brand-primary px-6 py-3 rounded-xl uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-brand-primary/20">
              Ranking <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-brand-secondary/30 backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
            {[...players].sort((a, b) => b.elo - a.elo).slice(0, 5).map((player, idx) => (
              <div key={player.id} className="flex items-center justify-between p-8 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all group">
                <div className="flex items-center gap-8">
                  <span className="text-4xl font-black text-white/5 w-12 italic group-hover:text-brand-primary/20 transition-colors">#{idx + 1}</span>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand-secondary flex items-center justify-center text-brand-primary font-black text-lg border-2 border-brand-primary/20">
                      {player.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-white text-lg uppercase tracking-tight">{player.name}</p>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{player.wins}V - {player.losses}D • {player.matchesPlayed} Partidas</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-brand-primary tracking-tighter leading-none">{Math.round(player.elo)}</p>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">ELO</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tighter">Histórico Recente</h3>
          <div className="space-y-4">
            {matches.slice(0, 4).map(match => (
              <div key={match.id} className="bg-brand-secondary/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-xl space-y-6 hover:border-brand-primary/20 transition-all group">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  <div className="flex items-center gap-2">
                    <span className="text-white">{new Date(match.timestamp).toLocaleDateString('pt-BR')}</span>
                    {match.startTime && (
                      <span className="opacity-40">• {formatHour(match.startTime)}</span>
                    )}
                  </div>
                  <span className="px-2 py-1 bg-white/5 rounded-lg text-brand-primary border border-white/10">
                    {match.mode === 'QUICK' ? 'Rápida' : match.mode === 'SCORE' ? 'Pontuada' : 'Sequencial'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between gap-6">
                  <div className="flex-1 text-center space-y-2">
                    <div className={`py-4 rounded-2xl transition-all ${match.winner === 'A' ? 'bg-brand-primary/10 border border-brand-primary/20 scale-110 shadow-lg shadow-brand-primary/5' : 'bg-white/5 border border-transparent opacity-40'}`}>
                      {match.mode !== 'QUICK' ? (
                        <p className={`text-3xl font-black ${match.winner === 'A' ? 'text-brand-primary' : 'text-white'}`}>{match.scoreA}</p>
                      ) : (
                        <div className="h-9 flex items-center justify-center">
                          {match.winner === 'A' && <Trophy className="w-6 h-6 text-brand-primary animate-bounce" />}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Time A</p>
                  </div>
                  
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-white/10 font-black italic text-sm">VS</span>
                  </div>
                  
                  <div className="flex-1 text-center space-y-2">
                    <div className={`py-4 rounded-2xl transition-all ${match.winner === 'B' ? 'bg-brand-primary/10 border border-brand-primary/20 scale-110 shadow-lg shadow-brand-primary/5' : 'bg-white/5 border border-transparent opacity-40'}`}>
                      {match.mode !== 'QUICK' ? (
                        <p className={`text-3xl font-black ${match.winner === 'B' ? 'text-brand-primary' : 'text-white'}`}>{match.scoreB}</p>
                      ) : (
                        <div className="h-9 flex items-center justify-center">
                          {match.winner === 'B' && <Trophy className="w-6 h-6 text-brand-primary animate-bounce" />}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Time B</p>
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
