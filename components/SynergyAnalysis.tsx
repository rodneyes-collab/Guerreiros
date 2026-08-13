import React, { useState, useMemo } from 'react';
import { Player, Match } from '../types';
import { calculateNegativeSynergyPenalty } from '../utils/teamLogic';
import { Search, BrainCircuit, Trophy, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SynergyGraph } from './SynergyGraph';

interface SynergyAnalysisProps {
  players: Player[];
  matches: Match[];
}

export const SynergyAnalysis: React.FC<SynergyAnalysisProps> = ({ players, matches }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const activePlayers = useMemo(() => players.filter(p => !p.isDM), [players]);

  const allMatchHistory = useMemo(() => {
    return matches.map(m => ({
      teamA: m.teamA,
      teamB: m.teamB,
      winner: m.winner,
      timestamp: m.timestamp
    }));
  }, [matches]);

  const synergyData = useMemo(() => {
    if (!selectedPlayerId) return [];
    
    const targetPlayer = activePlayers.find(p => p.id === selectedPlayerId);
    if (!targetPlayer) return [];

    return activePlayers
      .filter(p => p.id !== selectedPlayerId)
      .map(partner => {
        let gamesTogether = 0;
        let winsTogether = 0;
        let lossesTogether = 0;

        for (const m of allMatchHistory) {
          const inTeamA = m.teamA.includes(targetPlayer.id) && m.teamA.includes(partner.id);
          const inTeamB = m.teamB.includes(targetPlayer.id) && m.teamB.includes(partner.id);
          
          if (inTeamA || inTeamB) {
            gamesTogether++;
            if ((inTeamA && m.winner === 'A') || (inTeamB && m.winner === 'B')) {
              winsTogether++;
            } else {
              lossesTogether++;
            }
          }
        }

        // Calculate AI penalty score just like in teamLogic
        // The penalty is negative for positive synergy (bonus) and positive for negative synergy
        const penaltyScore = calculateNegativeSynergyPenalty(null, [targetPlayer, partner], allMatchHistory);

        return {
          partner,
          gamesTogether,
          winsTogether,
          lossesTogether,
          winRate: gamesTogether > 0 ? winsTogether / gamesTogether : 0,
          penaltyScore
        };
      })
      .filter(d => d.gamesTogether > 0)
      .sort((a, b) => a.penaltyScore - b.penaltyScore); // Menor penalty (mais negativo) = melhor sinergia
  }, [selectedPlayerId, activePlayers, allMatchHistory]);

  const clubEliteSynergies = useMemo(() => {
    const pairMap: Record<string, { p1: Player; p2: Player; wins: number; games: number }> = {};

    for (const m of allMatchHistory) {
      const checkTeam = (team: string[], isWinner: boolean) => {
        if (!team || team.length < 2) return;
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const id1 = team[i];
            const id2 = team[j];
            const p1 = activePlayers.find(p => p.id === id1);
            const p2 = activePlayers.find(p => p.id === id2);
            if (!p1 || !p2) continue;
            const pairKey = [id1, id2].sort().join('_');
            if (!pairMap[pairKey]) {
              pairMap[pairKey] = { p1, p2, wins: 0, games: 0 };
            }
            pairMap[pairKey].games++;
            if (isWinner) {
              pairMap[pairKey].wins++;
            }
          }
        }
      };

      checkTeam(m.teamA, m.winner === 'A');
      checkTeam(m.teamB, m.winner === 'B');
    }

    const list = Object.values(pairMap)
      .filter(d => d.games >= 2)
      .map(d => ({
        ...d,
        winRate: d.wins / d.games
      }));

    const topBest = [...list].sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 4);
    const topWorst = [...list].sort((a, b) => a.winRate - b.winRate || b.games - a.games).slice(0, 4);

    return { topBest, topWorst };
  }, [allMatchHistory, activePlayers]);

  const filteredSynergy = useMemo(() => {
    if (!searchQuery) return synergyData;
    return synergyData.filter(d => d.partner.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [synergyData, searchQuery]);

  return (
    <div className="space-y-8">
      {/* Centralized Club Elite Synergies Panel */}
      <div className="bg-black/40 p-6 sm:p-8 rounded-3xl border border-white/5 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Sinergias de Elite do Clube</h2>
            <p className="text-xs text-white/50 font-bold tracking-widest uppercase">Pares com Maiores e Menores Taxas de Sucesso Históricas</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Positive Synergies */}
          <div className="bg-black/60 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <ArrowUp className="w-4 h-4" /> Maiores Taxas de Sucesso (Duplas de Ouro)
              </span>
              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">Top Duplas</span>
            </div>
            {clubEliteSynergies.topBest.length > 0 ? (
              <div className="space-y-2.5">
                {clubEliteSynergies.topBest.map((item, idx) => (
                  <div key={`best-${idx}`} className="bg-white/[0.02] border border-white/5 p-3.5 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-emerald-400 w-5">#{idx + 1}</span>
                      <span className="text-sm font-black text-white uppercase tracking-tight">
                        {item.p1.name} & {item.p2.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white/40">{item.games} jogos</span>
                      <span className="text-xs font-black bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg">
                        {Math.round(item.winRate * 100)}% ({item.wins}V)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest py-6 text-center">Dados insuficientes (mín. 2 jogos)</p>
            )}
          </div>

          {/* Top Negative / Struggle Synergies */}
          <div className="bg-black/60 border border-rose-500/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                <ArrowDown className="w-4 h-4" /> Menores Taxas de Sucesso (Alerta de Parceria)
              </span>
              <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md">Alerta</span>
            </div>
            {clubEliteSynergies.topWorst.length > 0 ? (
              <div className="space-y-2.5">
                {clubEliteSynergies.topWorst.map((item, idx) => (
                  <div key={`worst-${idx}`} className="bg-white/[0.02] border border-white/5 p-3.5 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-rose-400 w-5">#{idx + 1}</span>
                      <span className="text-sm font-black text-white uppercase tracking-tight">
                        {item.p1.name} & {item.p2.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white/40">{item.games} jogos</span>
                      <span className="text-xs font-black bg-rose-500/20 text-rose-300 px-2 py-1 rounded-lg">
                        {Math.round(item.winRate * 100)}% ({item.wins}V)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest py-6 text-center">Dados insuficientes (mín. 2 jogos)</p>
            )}
          </div>
        </div>
      </div>

      {/* D3 Interactive Synergy Network Graph */}
      <SynergyGraph players={players} matches={matches} />

      {/* Individual Player Synergy Search Module */}
      <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Sinergia de ML</h2>
            <p className="text-xs text-white/50 font-bold tracking-widest uppercase">Análise Preditiva de Parcerias</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-white/40 uppercase tracking-widest">Selecione o Jogador Alfa</label>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-brand-primary/50 transition-colors"
            >
              <option value="">Selecione um jogador...</option>
              {activePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-white/40 uppercase tracking-widest">Filtrar Parcerias</label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                type="text"
                placeholder="Buscar parceiro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-white/20 font-bold outline-none focus:border-brand-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {selectedPlayerId ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid gap-3"
          >
            {filteredSynergy.length > 0 ? (
              filteredSynergy.map((data, index) => {
                const isPositive = data.penaltyScore < 0;
                const isNeutral = data.penaltyScore === 0;
                
                return (
                  <div key={data.partner.id} className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black text-white/40">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight truncate max-w-[200px]">
                          {data.partner.name}
                        </h3>
                        <div className="flex items-center gap-3 text-xs font-bold mt-1">
                          <span className="text-white/40">{data.gamesTogether} Jogos Juntos</span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-brand-primary">{Math.round(data.winRate * 100)}% Vitórias</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg">
                        <span className="text-brand-primary font-black">{data.winsTogether}V</span>
                        <span className="text-white/20">/</span>
                        <span className="text-white font-black">{data.lossesTogether}D</span>
                      </div>

                      <div className={`flex flex-col items-end min-w-[80px]`}>
                        <div className={`flex items-center gap-1 font-black ${isPositive ? 'text-emerald-400' : isNeutral ? 'text-white/40' : 'text-rose-400'}`}>
                          {isPositive ? <ArrowUp className="w-4 h-4" /> : isNeutral ? <Activity className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                          {Math.abs(Math.round(data.penaltyScore))} pts
                        </div>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                          {isPositive ? 'Sinergia+' : isNeutral ? 'Neutro' : 'Sinergia-'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-white/40 font-bold text-sm uppercase tracking-widest">
                Nenhuma partida registrada com parceiros.
              </div>
            )}
          </motion.div>
        ) : (
          <div className="bg-black/20 rounded-3xl border border-white/5 p-12 flex flex-col items-center justify-center text-center">
            <BrainCircuit className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-white/40 font-bold uppercase tracking-widest text-sm">
              Selecione um jogador acima para visualizar<br/>as análises de sinergia
            </p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
