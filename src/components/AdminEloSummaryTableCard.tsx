import React, { useMemo, useState } from 'react';
import { Player } from '../../types';
import { Award, Download, Search } from 'lucide-react';

interface AdminEloSummaryTableCardProps {
  players: Player[];
}

export const AdminEloSummaryTableCard: React.FC<AdminEloSummaryTableCardProps> = ({ players }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar apenas sócios estritamente ativos conforme regras do clube
  const activePlayers = useMemo(() => {
    return players
      .filter(p => p.status === 'active')
      .map(player => {
        const wins = player.wins || 0;
        const losses = player.losses || 0;
        const matchBalance = wins - losses;
        const matchPoints = matchBalance * 20;

        // Bônus acumulado de fidelidade (presença)
        const fidelityBonusSum = typeof player.fidelityPoints === 'number'
          ? player.fidelityPoints
          : (player.eloHistory || [])
              .filter(h => h.fidelityBonus || h.result === 'P')
              .reduce((sum, h) => sum + (h.change || 0), 0);

        // ELO Quadra: Base 1200 + Saldo em pontos das partidas
        const eloQuadra = 1200 + matchPoints;
        // ELO Global Oficial: ELO Quadra + Bônus Acumulado
        const eloGlobal = eloQuadra + fidelityBonusSum;

        return {
          ...player,
          wins,
          losses,
          matchBalance,
          matchPoints,
          eloQuadra,
          fidelityBonusSum,
          eloGlobal
        };
      })
      .sort((a, b) => b.eloGlobal - a.eloGlobal);
  }, [players]);

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return activePlayers;
    const term = searchTerm.toLowerCase();
    return activePlayers.filter(p => p.name.toLowerCase().includes(term));
  }, [activePlayers, searchTerm]);

  // Função para exportar dados para CSV
  const handleExportCSV = () => {
    const headers = [
      'Nome',
      'Vitorias',
      'Derrotas',
      'Saldo de Jogos',
      'Pontos de Partidas',
      'ELO Quadra (Base 1200 + Saldo)',
      'Bonus Presenca Acumulado',
      'ELO Global (Soma Final)'
    ];
    const rows = activePlayers.map(p => [
      `"${p.name}"`,
      p.wins,
      p.losses,
      p.matchBalance,
      p.matchPoints,
      p.eloQuadra,
      p.fidelityBonusSum,
      p.eloGlobal
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `guerreiros_auditoria_elo_consolidado_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="bg-black backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-amber-500/20 shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Award className="w-6 h-6 text-amber-400" /> Tabela Consolidada de Atletas (ELO & Bônus)
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Relatório oficial de auditoria para os {activePlayers.length} sócios ativos do clube.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Filtrar por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/10 shrink-0"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/60">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <th className="px-5 py-4">#</th>
              <th className="px-6 py-4">Nome do Sócio</th>
              <th className="px-6 py-4 text-center">Vitórias / Derrotas</th>
              <th className="px-6 py-4 text-center">Saldo de Partidas</th>
              <th className="px-6 py-4 text-center">ELO Quadra (Partidas)</th>
              <th className="px-6 py-4 text-center">Bônus Acumulado</th>
              <th className="px-6 py-4 text-right">ELO Global (Oficial)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 text-xs font-semibold">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player, idx) => (
                <tr key={player.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-5 py-4 font-mono text-zinc-500">#{idx + 1}</td>
                  <td className="px-6 py-4 text-white font-bold">{player.name}</td>
                  <td className="px-6 py-4 text-center text-zinc-300">
                    <span className="text-emerald-400 font-bold">{player.wins}V</span> / <span className="text-rose-400 font-bold">{player.losses}D</span>
                  </td>
                  <td className={`px-6 py-4 text-center font-mono font-bold ${player.matchBalance > 0 ? 'text-emerald-400' : player.matchBalance < 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                    <span>{player.matchBalance > 0 ? `+${player.matchBalance}` : player.matchBalance}</span>
                    <span className="text-[10px] ml-1.5 opacity-80">
                      ({player.matchPoints > 0 ? `+${player.matchPoints}` : player.matchPoints} pts)
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-emerald-400 font-bold">
                    {player.eloQuadra}
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-amber-400 font-bold">
                    +{player.fidelityBonusSum}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-amber-300 font-black text-sm">
                    {player.eloGlobal} pts
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                  Nenhum sócio ativo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
