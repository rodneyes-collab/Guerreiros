import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Match } from '../types';

interface MatchOutcomesChartProps {
  matches: Match[];
}

export const MatchOutcomesChart: React.FC<MatchOutcomesChartProps> = ({ matches }) => {
  const data = matches.map((match, index) => ({
    match: `Partida ${index + 1}`,
    teamA: match.winner === 'A' ? 1 : 0,
    teamB: match.winner === 'B' ? 1 : 0,
  }));

  return (
    <div className="h-64 w-full bg-brand-secondary/20 p-5 rounded-3xl border border-white/10 mt-6">
      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white mb-4">
        Distribuição de Vitórias da Noite
      </h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="match" tick={{ fill: '#fff', fontSize: 10 }} />
          <YAxis tick={{ fill: '#fff', fontSize: 10 }} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#000', border: '1px solid #F5C429', borderRadius: '1rem' }} 
            itemStyle={{ color: '#fff' }}
          />
          <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
          <Bar dataKey="teamA" name="Vitórias Time A" fill="#F5C429" radius={[4, 4, 0, 0]} />
          <Bar dataKey="teamB" name="Vitórias Time B" fill="#ffffff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
