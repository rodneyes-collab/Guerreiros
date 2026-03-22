import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Match } from '../../types';

interface WinLossChartProps {
  matches: Match[];
  playerId: string;
}

export const WinLossChart: React.FC<WinLossChartProps> = ({ matches, playerId }) => {
  // Filtrar partidas que o jogador participou e ordenar por data
  const playerMatches = matches
    .filter(m => m.teamA.includes(playerId) || m.teamB.includes(playerId))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (playerMatches.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
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
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#fff', 
              borderRadius: '1rem', 
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              fontSize: '12px',
              fontWeight: 'bold'
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
              letterSpacing: '0.05em'
            }}
          />
          <Line 
            name="Vitórias"
            type="monotone" 
            dataKey="wins" 
            stroke="#10b981" 
            strokeWidth={3} 
            dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
          <Line 
            name="Derrotas"
            type="monotone" 
            dataKey="losses" 
            stroke="#f43f5e" 
            strokeWidth={3} 
            dot={{ r: 3, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
