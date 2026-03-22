import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface EloChartProps {
  history: { date: string; elo: number; groupAverage?: number }[];
  averageElo?: number;
}

export const EloChart: React.FC<EloChartProps> = ({ history, averageElo }) => {
  if (!history || history.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sem histórico de ELO disponível</p>
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
            domain={['auto', 'auto']} 
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
          {averageElo && (
            <ReferenceLine 
              y={averageElo} 
              stroke="#94a3b8" 
              strokeDasharray="3 3" 
              label={{ 
                value: `Média: ${averageElo}`, 
                position: 'right', 
                fill: '#94a3b8', 
                fontSize: 10, 
                fontWeight: 'bold' 
              }} 
            />
          )}
          <Line 
            name="Sócio"
            type="monotone" 
            dataKey="elo" 
            stroke="#4f46e5" 
            strokeWidth={4} 
            dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
          <Line 
            name="Média Grupo"
            type="monotone" 
            dataKey="groupAverage" 
            stroke="#94a3b8" 
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
