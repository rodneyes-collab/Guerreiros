import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Sparkles, Award, Zap } from 'lucide-react';
import { Player, Match } from '../../types';
import { calculatePracticalSkillsSum, calculateCompositePerformanceRating } from '../../utils/teamLogic';

interface IcEvolutionChartProps {
  player: Player | null;
  matches: Match[];
  isDark?: boolean;
}

export const IcEvolutionChart: React.FC<IcEvolutionChartProps> = ({
  player,
  matches,
  isDark = true
}) => {
  const evolutionData = useMemo(() => {
    if (!player) return [];

    // Filtra e ordena partidas cronologicamente
    const playerMatches = (matches || [])
      .filter(m => 
        (m.teamA?.includes(player.id) || m.teamB?.includes(player.id)) && 
        (m.winner === 'A' || m.winner === 'B')
      )
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const hasSkills = Boolean(player.skills && Object.keys(player.skills).length > 0);
    const skillsSum = Number(calculatePracticalSkillsSum(player)) || 4;
    const techScore = hasSkills ? Math.max(0, Math.min(100, ((skillsSum - 4) / 16) * 100)) : 0;

    const s = player.skills;
    const sArr = [
      s?.attacking || 1, 
      s?.defense || 1, 
      s?.setting || 1, 
      s?.serving || 1
    ];
    const versatilityScore = Math.max(0, 1 - ((Math.max(...sArr) - Math.min(...sArr)) / 4));

    let cumWins = 0;
    let cumLosses = 0;

    const points = playerMatches.map((m, idx) => {
      const isTeamA = m.teamA?.includes(player.id);
      const isWin = (m.winner === 'A' && isTeamA) || (m.winner === 'B' && !isTeamA);
      
      if (isWin) cumWins++;
      else cumLosses++;

      const totalMatches = cumWins + cumLosses;
      const winRate = totalMatches > 0 ? cumWins / totalMatches : 0.5;
      const winRateScore = winRate * 100;

      let ic = 0;
      let versatilityBonus = 0;

      if (!hasSkills) {
        ic = Math.round(Math.min(30, winRateScore * 0.4) * 10) / 10;
      } else {
        const compositeRating = (techScore * 0.80) + (winRateScore * 0.20);
        const volumeFactor = Math.min(1.0, totalMatches / 50);
        versatilityBonus = Number((versatilityScore * volumeFactor * 4.0).toFixed(1));
        ic = Math.round((compositeRating + versatilityBonus) * 10) / 10;
      }

      return {
        matchNumber: idx + 1,
        matchLabel: `J#${idx + 1}`,
        date: m.date || 'Data',
        isWin,
        result: isWin ? 'V' : 'D',
        score: `${m.scoreA || 0} x ${m.scoreB || 0}`,
        winRate: Number(winRateScore.toFixed(1)),
        cumWins,
        cumLosses,
        versatilityBonus,
        ic: Math.max(0, ic)
      };
    });

    return points;
  }, [player, matches]);

  const stats = useMemo(() => {
    if (!player) return { initial: 0, current: 0, peak: 0, diff: 0 };
    const currentIc = calculateCompositePerformanceRating(player);
    
    if (evolutionData.length === 0) {
      return {
        initial: currentIc,
        current: currentIc,
        peak: currentIc,
        diff: 0
      };
    }

    const initial = evolutionData[0].ic;
    const current = evolutionData[evolutionData.length - 1].ic;
    const peak = Math.max(...evolutionData.map(d => d.ic));
    const diff = Number((current - initial).toFixed(1));

    return { initial, current, peak, diff };
  }, [player, evolutionData]);

  if (!player) return null;

  return (
    <div className="bg-black backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
      
      {/* Header do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-primary/10 rounded-2xl border border-brand-primary/30">
            <Activity className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white">
                Evolução Histórica do IC
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Soberano
              </span>
            </div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
              Trajetória do Índice Composto (80% Skills + 20% Win Rate + Volume)
            </p>
          </div>
        </div>

        <div className="px-3 py-1 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-full text-[10px] font-black uppercase tracking-wider self-start sm:self-auto">
          {evolutionData.length} Partidas Registradas
        </div>
      </div>

      {/* Mini Cards de Métricas de Evolução */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
            IC Inicial
          </span>
          <span className="text-lg font-black font-mono text-white">
            {stats.initial.toFixed(1)}
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
            Pico Histórico
          </span>
          <span className="text-lg font-black font-mono text-emerald-400 flex items-center gap-1">
            <Award className="w-4 h-4 text-emerald-400 inline" />
            {stats.peak.toFixed(1)}
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
            IC Atual
          </span>
          <span className="text-lg font-black font-mono text-brand-primary">
            {stats.current.toFixed(1)}
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <span className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">
            Variação (Δ)
          </span>
          <span className={`text-lg font-black font-mono flex items-center gap-1 ${
            stats.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {stats.diff >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {stats.diff >= 0 ? `+${stats.diff}` : stats.diff} pts
          </span>
        </div>
      </div>

      {/* Gráfico */}
      {evolutionData.length > 0 ? (
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorIcEvolution" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C429" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#F5C429" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
              <XAxis 
                dataKey="matchNumber" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                tickFormatter={(val) => `J#${val}`}
              />
              <YAxis 
                domain={['dataMin - 5', 'dataMax + 5']}
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-900 border border-white/10 p-3.5 rounded-2xl shadow-2xl text-xs space-y-1.5 min-w-[180px]">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                          <span className="font-black text-white uppercase tracking-wider text-[11px]">
                            Jogo #{data.matchNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            data.isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {data.isWin ? 'Vitória' : 'Derrota'} ({data.score})
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/60">Data:</span>
                          <span className="font-mono text-white font-bold">{data.date}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-brand-primary font-bold">IC no Momento:</span>
                          <span className="font-mono font-black text-brand-primary text-sm">{data.ic}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/50">
                          <span>Aproveitamento:</span>
                          <span className="font-mono font-bold text-white/80">{data.winRate}% ({data.cumWins}V/{data.cumLosses}D)</span>
                        </div>
                        {data.versatilityBonus > 0 && (
                          <div className="flex items-center justify-between text-[10px] text-emerald-400/80">
                            <span>Bônus Volume:</span>
                            <span className="font-mono font-bold">+{data.versatilityBonus} pts</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine 
                y={stats.current} 
                stroke="#10B981" 
                strokeDasharray="4 4" 
                strokeWidth={1.5}
                label={{ value: 'IC Atual', fill: '#10B981', fontSize: 9, position: 'right', fontWeight: 800 }}
              />
              <Area 
                type="monotone" 
                dataKey="ic" 
                stroke="#F5C429" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorIcEvolution)" 
                activeDot={{ r: 6, fill: '#F5C429', stroke: '#000', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-48 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5">
          <Activity className="w-8 h-8 text-white/20 mb-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">
            Nenhuma partida finalizada registrada para calcular a evolução do IC
          </p>
        </div>
      )}
    </div>
  );
};
