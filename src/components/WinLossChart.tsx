import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Match } from '../../types';

interface WinLossChartProps {
  matches: Match[];
  playerId: string;
  isDark?: boolean;
}

export const WinLossChart: React.FC<WinLossChartProps> = ({ matches, playerId, isDark = false }) => {
  // Filtrar partidas que o jogador participou e ordenar por data
  const playerMatches = matches
    .filter(m => m.teamA.includes(playerId) || m.teamB.includes(playerId))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (playerMatches.length === 0) {
    return (
      <div className={`h-48 flex items-center justify-center rounded-2xl border border-dashed ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-brand-light/30 border-brand-accent/20'
      }`}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sem histórico de partidas disponível</p>
      </div>
    );
  }

  // Calcular evolução cumulativa de vitórias e derrotas
  let wins = 0;
  let losses = 0;
  
  // Agrupar por data para o gráfico (eixo X)
  const dailyStats: { [date: string]: { wins: number; losses: number } } = {};

  playerMatches.forEach(m => {
    const isTeamA = m.teamA.includes(playerId);
    const won = (isTeamA && m.winner === 'A') || (!isTeamA && m.winner === 'B');
    
    if (won) wins++;
    else losses++;

    // Usar a data da partida (YYYY-MM-DD)
    const date = m.date;
    dailyStats[date] = { wins, losses };
  });

  const data = Object.entries(dailyStats).map(([date, stats]) => ({
    date,
    ...stats
  }));

  // Se houver apenas um registro, duplicamos para mostrar uma linha horizontal
  const chartData = data.length === 1 
    ? [{ ...data[0], date: 'Início' }, data[0]] 
    : data;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(74, 79, 90, 0.1)"} 
            vertical={false} 
          />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ 
              fill: isDark ? '#64748b' : '#4A4F5A', 
              fontSize: 10, 
              fontWeight: 'bold' 
            }}
            tickFormatter={(val) => {
              if (val === 'Início') return val;
              try {
                return new Date(val + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              } catch (e) {
                return val;
              }
            }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ 
              fill: isDark ? '#64748b' : '#4A4F5A', 
              fontSize: 10, 
              fontWeight: 'bold' 
            }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              borderRadius: '1rem', 
              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(245, 196, 41, 0.2)',
              boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)',
              fontSize: '12px',
              fontWeight: 'bold',
              color: isDark ? '#fff' : '#1e293b'
            }}
            labelFormatter={(val) => {
              if (val === 'Início') return val;
              return new Date(val + 'T00:00:00').toLocaleDateString('pt-BR');
            }}
          />
          <Legend 
            verticalAlign="top" 
            height={36}
            wrapperStyle={{
              fontSize: '10px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: isDark ? '#cbd5e1' : '#4A4F5A'
            }}
          />
          <Line 
            name="Vitórias"
            type="monotone" 
            dataKey="wins" 
            stroke="#F5C429" 
            strokeWidth={3} 
            dot={{ 
              r: 3, 
              fill: '#F5C429', 
              strokeWidth: 2, 
              stroke: isDark ? '#0f172a' : '#fff' 
            }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
          <Line 
            name="Derrotas"
            type="monotone" 
            dataKey="losses" 
            stroke={isDark ? '#64748b' : '#cbd5e1'} 
            strokeWidth={3} 
            dot={{ 
              r: 3, 
              fill: isDark ? '#64748b' : '#cbd5e1', 
              strokeWidth: 2, 
              stroke: isDark ? '#0f172a' : '#fff' 
            }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};