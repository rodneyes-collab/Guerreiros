import React, { useState } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { ShieldCheck, Scale, Zap, BarChart2, Activity, Info, Trophy } from 'lucide-react';
import { GenerationResult, Player } from '../../types';
import { calculateCompositePerformanceRating } from '../../utils/teamLogic';

interface MatchBalanceChartsProps {
  generationResult: GenerationResult;
}

export const MatchBalanceCharts: React.FC<MatchBalanceChartsProps> = ({ generationResult }) => {
  const [activeTab, setActiveTab] = useState<'radar' | 'bar' | 'dual'>('dual');
  const [barMode, setBarMode] = useState<'players' | 'metrics'>('players');

  const teamAPlayers = React.useMemo(() => {
    if (!generationResult?.teamA) return [];
    return [generationResult.teamA.setter, ...(generationResult.teamA.players || [])].filter(Boolean) as Player[];
  }, [generationResult]);

  const teamBPlayers = React.useMemo(() => {
    if (!generationResult?.teamB) return [];
    return [generationResult.teamB.setter, ...(generationResult.teamB.players || [])].filter(Boolean) as Player[];
  }, [generationResult]);

  // Skill Averages
  const getSkillAvg = (players: Player[], skillKey: 'attacking' | 'defense' | 'serving' | 'setting') => {
    if (players.length === 0) return 1;
    const sum = players.reduce((acc, p) => acc + (p.skills?.[skillKey] || 1), 0);
    return sum / players.length;
  };

  const avgAttackA = getSkillAvg(teamAPlayers, 'attacking');
  const avgAttackB = getSkillAvg(teamBPlayers, 'attacking');
  const avgDefenseA = getSkillAvg(teamAPlayers, 'defense');
  const avgDefenseB = getSkillAvg(teamBPlayers, 'defense');
  const avgServeA = getSkillAvg(teamAPlayers, 'serving');
  const avgServeB = getSkillAvg(teamBPlayers, 'serving');
  const avgSettingA = getSkillAvg(teamAPlayers, 'setting');
  const avgSettingB = getSkillAvg(teamBPlayers, 'setting');

  // IC Averages
  const sumIcA = teamAPlayers.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
  const sumIcB = teamBPlayers.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
  const avgIcA = teamAPlayers.length > 0 ? sumIcA / teamAPlayers.length : 50;
  const avgIcB = teamBPlayers.length > 0 ? sumIcB / teamBPlayers.length : 50;

  const maxIcA = teamAPlayers.length > 0 ? Math.max(...teamAPlayers.map(p => calculateCompositePerformanceRating(p))) : 50;
  const maxIcB = teamBPlayers.length > 0 ? Math.max(...teamBPlayers.map(p => calculateCompositePerformanceRating(p))) : 50;
  const minIcA = teamAPlayers.length > 0 ? Math.min(...teamAPlayers.map(p => calculateCompositePerformanceRating(p))) : 50;
  const minIcB = teamBPlayers.length > 0 ? Math.min(...teamBPlayers.map(p => calculateCompositePerformanceRating(p))) : 50;

  const icDiff = Math.abs(avgIcA - avgIcB);
  
  // Balance Quality metric
  const percentDiff = Math.max(0.1, Math.round((icDiff / Math.max(1, Math.min(avgIcA, avgIcB))) * 1000) / 10);
  const balanceQuality = Math.max(0, 100 - Math.round(percentDiff * 4));

  // 1. Radar Chart Data
  const radarData = [
    {
      subject: 'Ataque',
      TeamA: Math.round((avgAttackA / 3) * 100),
      TeamB: Math.round((avgAttackB / 3) * 100),
      labelA: `${avgAttackA.toFixed(1)}/3.0`,
      labelB: `${avgAttackB.toFixed(1)}/3.0`,
    },
    {
      subject: 'Defesa',
      TeamA: Math.round((avgDefenseA / 3) * 100),
      TeamB: Math.round((avgDefenseB / 3) * 100),
      labelA: `${avgDefenseA.toFixed(1)}/3.0`,
      labelB: `${avgDefenseB.toFixed(1)}/3.0`,
    },
    {
      subject: 'Saque',
      TeamA: Math.round((avgServeA / 3) * 100),
      TeamB: Math.round((avgServeB / 3) * 100),
      labelA: `${avgServeA.toFixed(1)}/3.0`,
      labelB: `${avgServeB.toFixed(1)}/3.0`,
    },
    {
      subject: 'Levantamento',
      TeamA: Math.round((avgSettingA / 3) * 100),
      TeamB: Math.round((avgSettingB / 3) * 100),
      labelA: `${avgSettingA.toFixed(1)}/3.0`,
      labelB: `${avgSettingB.toFixed(1)}/3.0`,
    },
    {
      subject: 'Índice IC',
      TeamA: Math.round(avgIcA),
      TeamB: Math.round(avgIcB),
      labelA: `${avgIcA.toFixed(1)} pts`,
      labelB: `${avgIcB.toFixed(1)} pts`,
    },
    {
      subject: 'Consistência',
      TeamA: Math.round(Math.min(100, (avgIcA / 80) * 100)),
      TeamB: Math.round(Math.min(100, (avgIcB / 80) * 100)),
      labelA: `${avgIcA.toFixed(1)} pts`,
      labelB: `${avgIcB.toFixed(1)} pts`,
    },
  ];

  // 2. Player-by-Player Sorted Bar Chart Data
  const sortedA = [...teamAPlayers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  const sortedB = [...teamBPlayers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
  const maxPlayersCount = Math.max(sortedA.length, sortedB.length, 6);

  const playerComparisonData = Array.from({ length: maxPlayersCount }).map((_, idx) => {
    const pA = sortedA[idx];
    const pB = sortedB[idx];
    const icA = pA ? calculateCompositePerformanceRating(pA) : 0;
    const icB = pB ? calculateCompositePerformanceRating(pB) : 0;
    return {
      rank: `#${idx + 1}`,
      'Equipe A': icA,
      'Equipe B': icB,
      nameA: pA ? pA.name.split(' ')[0] : '-',
      nameB: pB ? pB.name.split(' ')[0] : '-',
      icA: icA.toFixed(1),
      icB: icB.toFixed(1),
    };
  });

  // 3. Team Aggregated Metrics Bar Chart Data
  const teamMetricsData = [
    {
      metric: 'Média IC',
      'Equipe A': Math.round(avgIcA),
      'Equipe B': Math.round(avgIcB),
    },
    {
      metric: 'Maior IC',
      'Equipe A': Math.round(maxIcA),
      'Equipe B': Math.round(maxIcB),
    },
    {
      metric: 'Menor IC',
      'Equipe A': Math.round(minIcA),
      'Equipe B': Math.round(minIcB),
    },
    {
      metric: 'Soma Total IC',
      'Equipe A': Math.round(sumIcA),
      'Equipe B': Math.round(sumIcB),
    },
  ];

  // Custom Tooltip for Radar Chart
  const CustomRadarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataItem = payload[0].payload;
      return (
        <div className="bg-black/95 border border-brand-primary/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md">
          <p className="text-xs font-black uppercase text-brand-primary tracking-wider mb-2 border-b border-white/10 pb-1">
            {dataItem.subject}
          </p>
          <div className="space-y-1 text-xs font-bold">
            <div className="flex items-center justify-between gap-4">
              <span className="text-brand-primary font-black uppercase flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-primary inline-block" />
                Equipe A:
              </span>
              <span className="text-white font-mono">{dataItem.labelA} ({dataItem.TeamA}%)</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white font-black uppercase flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white inline-block" />
                Equipe B:
              </span>
              <span className="text-white font-mono">{dataItem.labelB} ({dataItem.TeamB}%)</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Bar Chart (Player Comparison)
  const CustomBarPlayerTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataItem = payload[0].payload;
      return (
        <div className="bg-black/95 border border-brand-primary/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md min-w-[200px]">
          <p className="text-xs font-black uppercase text-brand-primary tracking-wider mb-2 border-b border-white/10 pb-1">
            Rank {label} por IC
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-2 rounded-xl bg-brand-primary/10 border border-brand-primary/20">
              <p className="text-[10px] font-black uppercase text-brand-primary">Equipe A • {dataItem.nameA}</p>
              <div className="flex justify-between items-center text-white font-mono text-xs font-bold mt-0.5">
                <span>IC: <strong className="text-brand-primary">{dataItem.icA}</strong></span>
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <p className="text-[10px] font-black uppercase text-white/70">Equipe B • {dataItem.nameB}</p>
              <div className="flex justify-between items-center text-white font-mono text-xs font-bold mt-0.5">
                <span>IC: <strong>{dataItem.icB}</strong></span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="match_balance_charts_panel" className="bg-black rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 mb-8 border-2 border-brand-primary/40 shadow-[0_0_35px_rgba(245,196,41,0.15)] relative overflow-hidden animate-in fade-in duration-500">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 rounded-2xl border border-brand-primary/35 shadow-[0_0_15px_rgba(245,196,41,0.2)]">
            <BarChart2 className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] text-white">
                RADAR & BALANÇO DE PODER
              </h4>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-brand-primary text-black font-mono">
                ADMIN ANALYTICS
              </span>
            </div>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-0.5">
              Visualização gráfica de simetria técnica e matriz de competências
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-brand-secondary/40 p-1.5 rounded-2xl border border-white/10 self-start md:self-center">
          <button
            onClick={() => setActiveTab('dual')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              activeTab === 'dual'
                ? 'bg-brand-primary text-black shadow-[0_0_12px_rgba(245,196,41,0.5)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            ⚡ Visão Dupla
          </button>
          <button
            onClick={() => setActiveTab('radar')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              activeTab === 'radar'
                ? 'bg-brand-primary text-black shadow-[0_0_12px_rgba(245,196,41,0.5)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🎯 Radar
          </button>
          <button
            onClick={() => setActiveTab('bar')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              activeTab === 'bar'
                ? 'bg-brand-primary text-black shadow-[0_0_12px_rgba(245,196,41,0.5)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            📊 IC Barchart
          </button>
        </div>
      </div>

      {/* Quick Comparison Bar Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="bg-brand-secondary/30 p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Média IC Equipe A</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-black text-brand-primary font-mono">{Math.round(avgIcA)}</span>
          <span className="text-[9px] text-white/40 font-mono">Total: {Math.round(sumIcA)}</span>
        </div>
      </div>

      <div className="bg-brand-secondary/30 p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Média IC Equipe B</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-black text-white font-mono">{Math.round(avgIcB)}</span>
          <span className="text-[9px] text-white/40 font-mono">Total: {Math.round(sumIcB)}</span>
        </div>
      </div>

      <div className="bg-brand-secondary/30 p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Diferença IC (Delta)</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-black text-brand-primary font-mono">{icDiff.toFixed(1)} pts</span>
          <span className="text-[9px] text-brand-primary font-bold uppercase">{percentDiff}% desvio</span>
        </div>
      </div>

        <div className="bg-brand-secondary/30 p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Índice de Simetria</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-brand-primary font-mono">{balanceQuality}%</span>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
              {balanceQuality >= 90 ? 'Excelente' : balanceQuality >= 75 ? 'Equilibrado' : 'Revisar'}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Body Container */}
      <div className={`grid gap-6 ${activeTab === 'dual' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        
        {/* RADAR CHART PANEL */}
        {(activeTab === 'radar' || activeTab === 'dual') && (
          <div className="bg-brand-secondary/20 p-5 rounded-3xl border border-white/10 flex flex-col justify-between relative min-h-[360px]">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]" />
                  RADAR DE COMPETÊNCIAS E HABILIDADES
                </h5>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                  Ataque, Defesa, Saque, Levantamento e IC
                </p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-black uppercase font-mono">
                <span className="flex items-center gap-1.5 text-brand-primary">
                  <span className="w-3 h-3 rounded-full bg-brand-primary/30 border border-brand-primary inline-block" />
                  Equipe A
                </span>
                <span className="flex items-center gap-1.5 text-white">
                  <span className="w-3 h-3 rounded-full bg-white/30 border border-white inline-block" />
                  Equipe B
                </span>
              </div>
            </div>

            <div className="h-[300px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="rgba(255, 255, 255, 0.12)" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#FFFFFF', fontSize: 11, fontWeight: 'bold' }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(255, 255, 255, 0.3)', fontSize: 8 }}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomRadarTooltip />} />
                  <Radar
                    name="Equipe A"
                    dataKey="TeamA"
                    stroke="#F5C429"
                    fill="#F5C429"
                    fillOpacity={0.45}
                    strokeWidth={2.5}
                  />
                  <Radar
                    name="Equipe B"
                    dataKey="TeamB"
                    stroke="#FFFFFF"
                    fill="#FFFFFF"
                    fillOpacity={0.25}
                    strokeWidth={2.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider text-center mt-2 pt-2 border-t border-white/5">
              Passe o mouse ou toque nos vértices para ver valores absolutos de cada fundamento.
            </div>
          </div>
        )}

        {/* BAR CHART PANEL */}
        {(activeTab === 'bar' || activeTab === 'dual') && (
          <div className="bg-brand-secondary/20 p-5 rounded-3xl border border-white/10 flex flex-col justify-between relative min-h-[360px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]" />
                  DISTRIBUIÇÃO DE ÍNDICE COMPOSTO (IC)
                </h5>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                  Comparativo de nível técnico atleta a atleta (60% Hab + 40% WR)
                </p>
              </div>

              {/* Sub-mode switcher */}
              <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setBarMode('players')}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                    barMode === 'players'
                      ? 'bg-brand-primary text-black'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  Por Atleta
                </button>
                <button
                  onClick={() => setBarMode('metrics')}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                    barMode === 'metrics'
                      ? 'bg-brand-primary text-black'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  Métricas Gerais
                </button>
              </div>
            </div>

            <div className="h-[300px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                {barMode === 'players' ? (
                  <BarChart
                    data={playerComparisonData}
                    margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="rank"
                      tick={{ fill: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomBarPlayerTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                    />
                    <Bar name="Equipe A (IC)" dataKey="Equipe A" fill="#F5C429" radius={[6, 6, 0, 0]} />
                    <Bar name="Equipe B (IC)" dataKey="Equipe B" fill="#FFFFFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart
                    data={teamMetricsData}
                    margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="metric"
                      tick={{ fill: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 'auto']}
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#121212',
                        borderRadius: '1rem',
                        border: '1px solid rgba(245, 196, 41, 0.4)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                    />
                    <Bar name="Equipe A" dataKey="Equipe A" fill="#F5C429" radius={[6, 6, 0, 0]} />
                    <Bar name="Equipe B" dataKey="Equipe B" fill="#FFFFFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider text-center mt-2 pt-2 border-t border-white/5">
              {barMode === 'players'
                ? 'Os atletas estão organizados por rank de IC (Maior pro menor) para comparar os confrontos diretos em quadra.'
                : 'Métricas consolidadas do Índice Composto (IC) para ambas as equipes.'}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
