import React, { useMemo, useState } from 'react';
import { Player, Match } from '../../types';
import { Clock, ShieldCheck, Download, Search, CheckCircle2, AlertTriangle, Users, Calendar, Filter } from 'lucide-react';
import { formatBrazilianDate } from '../../utils/helpers';

interface AthleteTimeAuditReportProps {
  players: Player[];
  matches: Match[];
  attendance?: Player[];
}

export const AthleteTimeAuditReport: React.FC<AthleteTimeAuditReportProps> = ({
  players,
  matches,
  attendance = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');

  // Obter datas únicas com partidas realizadas
  const uniqueSessionDates = useMemo(() => {
    const datesSet = new Set<string>();
    matches.forEach(m => {
      const d = m.date || (m.timestamp ? new Date(m.timestamp).toISOString().split('T')[0] : '');
      if (d) datesSet.add(d);
    });
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [matches]);

  // Processar auditoria individualizada de tempo cruzando partidas e presença
  const auditData = useMemo(() => {
    const activePlayers = players.filter(p => p.status === 'active' || !p.status);

    return activePlayers.map(player => {
      // Filtrar partidas do atleta
      const relevantMatches = matches.filter(m => {
        const matchDate = m.date || (m.timestamp ? new Date(m.timestamp).toISOString().split('T')[0] : '');
        if (selectedDateFilter !== 'ALL' && matchDate !== selectedDateFilter) return false;
        return (m.teamA && m.teamA.includes(player.id)) || (m.teamB && m.teamB.includes(player.id));
      });

      // Partidas totais das sessões selecionadas
      const sessionMatches = matches.filter(m => {
        const matchDate = m.date || (m.timestamp ? new Date(m.timestamp).toISOString().split('T')[0] : '');
        if (selectedDateFilter !== 'ALL') return matchDate === selectedDateFilter;
        // Se todas as datas, considerar apenas datas onde o atleta esteve presente em ao menos 1 jogo
        const athleteDates = new Set(relevantMatches.map(rm => rm.date));
        return athleteDates.has(matchDate);
      });

      // Duração em quadra (segundos para minutos) - usa duração real ou padrão de 12 min (720s)
      const totalCourtSeconds = relevantMatches.reduce((acc, m) => acc + (m.duration || 720), 0);
      const courtMinutes = Math.round(totalCourtSeconds / 60);

      // Duração total das partidas da sessão
      const totalSessionSeconds = sessionMatches.reduce((acc, m) => acc + (m.duration || 720), 0);
      const sessionMinutes = Math.round(totalSessionSeconds / 60);

      // Tempo fora de quadra (banco)
      const benchMinutes = Math.max(0, sessionMinutes - courtMinutes);

      // Porcentagem de engajamento em quadra
      const engagementPercent = sessionMinutes > 0 ? Math.min(100, Math.round((courtMinutes / sessionMinutes) * 100)) : (relevantMatches.length > 0 ? 100 : 0);

      // Razão Quadra/Banco
      const courtBenchRatio = benchMinutes > 0 ? (courtMinutes / benchMinutes).toFixed(1) : (courtMinutes > 0 ? '∞' : '0.0');

      // Status da validação individual
      const isValidated = relevantMatches.length > 0 && courtMinutes > 0;

      return {
        id: player.id,
        name: player.name,
        matchesPlayed: relevantMatches.length,
        totalSessionMatches: sessionMatches.length,
        courtMinutes,
        benchMinutes,
        sessionMinutes,
        engagementPercent,
        courtBenchRatio,
        isValidated
      };
    }).sort((a, b) => b.courtMinutes - a.courtMinutes);
  }, [players, matches, selectedDateFilter]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return auditData;
    const term = searchTerm.toLowerCase();
    return auditData.filter(item => item.name.toLowerCase().includes(term));
  }, [auditData, searchTerm]);

  // Exportar relatório em CSV
  const handleExportCSV = () => {
    const headers = [
      'Atleta',
      'Jogos Disputados',
      'Jogos Totais da Sessão',
      'Tempo em Quadra (min)',
      'Tempo em Banco (min)',
      'Tempo Total Sessão (min)',
      'Engajamento (%)',
      'Razão Quadra/Banco',
      'Status de Validação'
    ];

    const rows = filteredData.map(d => [
      `"${d.name}"`,
      d.matchesPlayed,
      d.totalSessionMatches,
      d.courtMinutes,
      d.benchMinutes,
      d.sessionMinutes,
      `${d.engagementPercent}%`,
      d.courtBenchRatio,
      d.isValidated ? 'VALIDADO (Individual)' : 'SEM JOGOS NO PERÍODO'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_tempo_atletas_${selectedDateFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="bg-black backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-amber-500/30 shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest mb-1">
            <ShieldCheck className="w-4 h-4" /> Relatório de Auditoria de Tempo Individual
          </div>
          <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Clock className="w-6 h-6 text-amber-400" /> Validação de Tempo em Quadra & Banco
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Cruzamento do histórico de partidas para garantir que nenhum atleta fique com minutagem ou eficiência zerada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Filtro de Data */}
          <div className="relative flex-1 md:w-48">
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full bg-zinc-950 text-white text-xs font-bold uppercase tracking-wider px-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer"
            >
              <option value="ALL">Todas as Sessões</option>
              {uniqueSessionDates.map(d => (
                <option key={d} value={d}>{formatBrazilianDate(d)}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-95"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Campo de Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar atleta pelo nome..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Tabela de Auditoria */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/50">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-900 border-b border-zinc-800 text-amber-400 font-black uppercase tracking-widest text-[10px]">
              <th className="px-4 py-3.5">Atleta</th>
              <th className="px-4 py-3.5 text-center">Jogos (Quadra / Total)</th>
              <th className="px-4 py-3.5 text-center">Tempo Quadra</th>
              <th className="px-4 py-3.5 text-center">Tempo Banco</th>
              <th className="px-4 py-3.5 text-center">Total Sessão</th>
              <th className="px-4 py-3.5 text-center">Engajamento</th>
              <th className="px-4 py-3.5 text-center">Status Validação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
            {filteredData.map(item => (
              <tr key={item.id} className="hover:bg-zinc-900/50 transition-colors">
                <td className="px-4 py-3 font-sans font-bold text-white text-sm">
                  {item.name}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold text-amber-400">{item.matchesPlayed}</span> / {item.totalSessionMatches} J
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold text-emerald-400">{item.courtMinutes} min</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold text-zinc-400">{item.benchMinutes} min</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {item.sessionMinutes} min
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    item.engagementPercent >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {item.engagementPercent}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-sans">
                  {item.isValidated ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Computado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-400">
                      <AlertTriangle className="w-3.5 h-3.5" /> Sem Jogos
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
