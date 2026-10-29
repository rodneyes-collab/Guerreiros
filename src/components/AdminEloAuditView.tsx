import React, { useState, useMemo } from 'react';
import { Player, Match } from '../../types';
import { ShieldCheck, Search, Award, TrendingUp, Calendar, User, History, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';

interface AdminEloAuditViewProps {
  players: Player[];
  matches: Match[];
  dailyBonus: number;
}

export const AdminEloAuditView: React.FC<AdminEloAuditViewProps> = ({
  players,
  matches,
  dailyBonus
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'MATCH' | 'FIDELITY'>('ALL');

  // Filtrar apenas sócios estritamente ativos conforme regras do clube
  const activePlayers = useMemo(() => {
    return players
      .filter(p => p.status === 'active')
      .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return activePlayers;
    const term = searchTerm.toLowerCase();
    return activePlayers.filter(p => p.name.toLowerCase().includes(term));
  }, [activePlayers, searchTerm]);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return activePlayers[0] || null;
    return activePlayers.find(p => p.id === selectedPlayerId) || activePlayers[0] || null;
  }, [activePlayers, selectedPlayerId]);

  // Histórico ordenado cronologicamente para o jogador selecionado
  const playerAuditHistory = useMemo(() => {
    if (!selectedPlayer || !selectedPlayer.eloHistory) return [];
    return [...selectedPlayer.eloHistory].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [selectedPlayer]);

  const filteredHistory = useMemo(() => {
    if (filterType === 'ALL') return playerAuditHistory;
    if (filterType === 'FIDELITY') return playerAuditHistory.filter(h => h.fidelityBonus || h.result === 'P');
    return playerAuditHistory.filter(h => !h.fidelityBonus && h.result !== 'P');
  }, [playerAuditHistory, filterType]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6 text-white">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-amber-950/40 p-6 rounded-3xl border border-amber-500/20 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest mb-1">
            <ShieldCheck className="w-4 h-4" /> Auditoria Oficial de ELO & Processamento
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Log Detalhado de Variações Cumulativas
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Inspeção cronológica de pontuação, partidas e bônus de fidelidade (Bônus Diário: <span className="text-amber-400 font-bold">+{dailyBonus} pts</span> a partir de 2 jogos/dia).
          </p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-950/60 px-4 py-3 rounded-2xl border border-zinc-800">
          <div className="text-right">
            <div className="text-xs text-zinc-400 font-medium">Sócios Ativos Auditados</div>
            <div className="text-lg font-black text-amber-400">{activePlayers.length} / 30</div>
          </div>
          <Award className="w-8 h-8 text-amber-500/80" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista Lateral de Atletas Ativos */}
        <div className="lg:col-span-4 bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800 p-4 flex flex-col h-[700px]">
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar sócio ativo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredPlayers.map((player, idx) => {
              const isSelected = selectedPlayer?.id === player.id;
              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-lg shadow-amber-500/5'
                      : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/50 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                      idx === 0 ? 'bg-amber-500 text-black' : idx === 1 ? 'bg-zinc-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white line-clamp-1">{player.name}</div>
                      <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                        <span>{player.matchesPlayed || 0} jogos</span>
                        <span>•</span>
                        <span className="text-emerald-400">{player.wins || 0}V</span>
                        <span className="text-rose-400">{player.losses || 0}D</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-amber-400">{player.elo || 1200}</div>
                    <div className="text-[10px] text-zinc-500 font-semibold uppercase">ELO Global</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhes e Log Cronológico do Atleta Selecionado */}
        <div className="lg:col-span-8 bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800 p-6 flex flex-col h-[700px]">
          {selectedPlayer ? (
            <>
              {/* Resumo do Atleta */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-amber-500/20">
                    {selectedPlayer.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">{selectedPlayer.name}</h2>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
                      <span>Status: <strong className="text-emerald-400 uppercase">Ativo</strong></span>
                      <span>•</span>
                      <span>Cadastrado em: {new Date(selectedPlayer.createdAt || Date.now()).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-zinc-950 px-4 py-2.5 rounded-2xl border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase">ELO Inicial</div>
                    <div className="text-sm font-black text-zinc-300">1200</div>
                  </div>
                  <div className="bg-amber-500/10 px-4 py-2.5 rounded-2xl border border-amber-500/30 text-center">
                    <div className="text-[10px] text-amber-400 font-semibold uppercase">ELO Atual</div>
                    <div className="text-sm font-black text-amber-400">{selectedPlayer.elo || 1200}</div>
                  </div>
                </div>
              </div>

              {/* Filtros de Histórico */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Linha do Tempo de Processamento</span>
                </div>
                <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs font-semibold">
                  <button
                    onClick={() => setFilterType('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'ALL' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterType('MATCH')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'MATCH' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Partidas
                  </button>
                  <button
                    onClick={() => setFilterType('FIDELITY')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'FIDELITY' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Bônus Diário
                  </button>
                </div>
              </div>

              {/* Tabela de Eventos e Variações */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((item, idx) => {
                    const isFidelity = item.fidelityBonus || item.result === 'P';
                    const isWin = item.result === 'V';
                    const change = item.change || 0;

                    return (
                      <div
                        key={idx}
                        className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-3.5 flex items-center justify-between hover:border-zinc-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isFidelity
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : isWin
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {isFidelity ? <Award className="w-5 h-5" /> : isWin ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">
                                {isFidelity ? 'Bônus Diário de Presença' : isWin ? 'Vitória em Partida Oficial' : 'Derrota em Partida Oficial'}
                              </span>
                              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md font-mono">
                                {item.date}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>ID Ref: <code className="text-zinc-500">{item.matchId || 'N/A'}</code></span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`text-sm font-black flex items-center justify-end gap-1 ${
                            change > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {change > 0 ? `+${change}` : change} pts
                          </div>
                          <div className="text-xs font-bold text-amber-400 mt-0.5">
                            ELO: {item.elo}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                    <CheckCircle2 className="w-12 h-12 mb-3 text-zinc-700" />
                    <p className="text-sm">Nenhum registro encontrado para este filtro.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500">
              Selecione um sócio para inspecionar o log de ELO.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
