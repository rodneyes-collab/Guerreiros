import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface EloChartProps {
  history: { date: string; elo: number; groupAverage?: number }[];
  averageElo?: number;
  isDark?: boolean;
}

export const EloChart: React.FC<EloChartProps> = ({ history, averageElo, isDark = false }) => {
  if (!history || history.length === 0) {
    return (
      <div className={`h-48 flex items-center justify-center rounded-2xl border border-dashed ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
        <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Sem histórico de ELO disponível</p>
      </div>
    );
  }

  // Se houver apenas um registro, duplicamos para mostrar uma linha horizontal
  const data = history.length === 1 
    ? [{ ...history[0], date: 'Início' }, history[0]] 
    : history;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(74, 79, 90, 0.1)"} vertical={false} />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: isDark ? '#ffffff' : '#4A4F5A', fontSize: 10, fontWeight: 'bold' }}
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
            domain={['auto', 'auto']} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: isDark ? '#ffffff' : '#4A4F5A', fontSize: 10, fontWeight: 'bold' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1E232D', 
              borderRadius: '1rem', 
              border: 'none',
              boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3)',
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#fff'
            }}
            itemStyle={{ color: '#F5C429' }}
            labelStyle={{ color: '#fff', marginBottom: '4px' }}
            labelFormatter={(val) => {
              if (val === 'Início') return val;
              return new Date(val + 'T00:00:00').toLocaleDateString('pt-BR');
            }}
          />
          {averageElo && (
            <ReferenceLine 
              y={averageElo} 
              stroke={isDark ? '#ffffff' : '#4A4F5A'} 
              strokeDasharray="3 3" 
              label={{ 
                value: `Média: ${averageElo}`, 
                position: 'right', 
                fill: isDark ? '#ffffff' : '#4A4F5A', 
                fontSize: 10, 
                fontWeight: 'bold' 
              }} 
            />
          )}
          <Line 
            name="Sócio"
            type="monotone" 
            dataKey="elo" 
            stroke="#F5C429" 
            strokeWidth={4} 
            dot={{ r: 4, fill: '#F5C429', strokeWidth: 2, stroke: isDark ? '#1E232D' : '#fff' }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
          <Line 
            name="Média Grupo"
            type="monotone" 
            dataKey="groupAverage" 
            stroke={isDark ? '#ffffff' : '#4A4F5A'} 
            strokeWidth={2} 
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
