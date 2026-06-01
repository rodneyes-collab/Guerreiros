import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Match, Player } from '../types';
import { formatTime } from '../utils/helpers';
import { WinLossChart } from '../src/components/WinLossChart';
import { getFirestoreDateKey } from '../firebase';
import { 
  Trophy, 
  Clock, 
  Calendar, 
  Users, 
  ChevronRight, 
  Search,
  History,
  ArrowLeft,
  Swords,
  Hash,
  User,
  ShieldCheck,
  Trash2,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';

import { HelpTooltip } from '../src/components/HelpTooltip';

interface HistoryViewProps {
  onDeleteMatch?: (matchId: string) => void;
  onDeleteMatchesByDate?: (date: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onDeleteMatch, onDeleteMatchesByDate }) => {
  const { matches, players: allPlayers, userRole, currentPlayer, attendance: allAttendance } = useStore();
  const players = React.useMemo(() => allPlayers.filter(p => p.status !== 'inactive'), [allPlayers]);
  const attendance = React.useMemo(() => allAttendance.filter(p => p.status !== 'inactive'), [allAttendance]);
  
  const [performanceDate, setPerformanceDate] = useState(getFirestoreDateKey());
  const displayMatches = React.useMemo(() => {
    const targetDate = performanceDate === 'Hoje' ? getFirestoreDateKey() : performanceDate;
    return matches.filter(m => {
      return m.date === targetDate;
    }).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [matches, performanceDate]);

  const participants = useMemo(() => {
    const participantData: Record<string, { matches: number, wins: number, losses: number }> = {};
    
    displayMatches.forEach(match => {
      const allPlayersInMatch = [...(match.teamA || []), ...(match.teamB || [])];
      
      allPlayersInMatch.forEach(id => {
        if (!participantData[id]) {
          participantData[id] = { matches: 0, wins: 0, losses: 0 };
        }
        
        participantData[id].matches += 1;
        
        const isTeamA = (match.teamA || []).includes(id);
        const isTeamB = (match.teamB || []).includes(id);
        const won = (isTeamA && match.winner === 'A') || (isTeamB && match.winner === 'B');
        
        if (won) {
          participantData[id].wins += 1;
        } else {
          participantData[id].losses += 1;
        }
      });
    });
    
    return allPlayers.filter(p => participantData[p.id]).map(p => ({
      ...p,
      sessionMatches: participantData[p.id].matches,
      sessionWins: participantData[p.id].wins,
      sessionLosses: participantData[p.id].losses
    })).sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0));
  }, [displayMatches, allPlayers]);

  const availableDates = useMemo(() => {
    const today = getFirestoreDateKey();
    const dates = new Set(matches.map(m => m.date));
    // Remove a data de hoje do set para não duplicar com o rótulo "Hoje"
    dates.delete(today);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return ['Hoje', ...sortedDates];
  }, [matches]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlayerId, setFilterPlayerId] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterMatchId, setFilterMatchId] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const getPlayerName = (id: string) => {
    return players.find(p => p.id === id)?.name || 'Jogador Desconhecido';
  };

  const formatHour = (timestamp?: number) => {
    if (!timestamp) return '--:--';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderScore = (match: Match, team: 'A' | 'B') => {
    // Se a partida tem placares registrados (pelo menos um diferente de 0 ou modo não é QUICK)
    const hasScores = match.scoreA > 0 || match.scoreB > 0;
    
    if (hasScores) {
      return (
        <span className={`text-lg font-black ${match.winner === team ? 'text-brand-primary' : 'text-white'}`}>
          {team === 'A' ? match.scoreA : match.scoreB}
        </span>
      );
    }
    
    // Fallback para partidas antigas sem placar
    return (
      <span className={`text-sm font-black italic ${match.winner === team ? 'text-brand-primary' : 'text-white/40'}`}>
        {match.winner === team ? '15' : '--'}
      </span>
    );
  };

  const normalize = (str: string) => 
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filteredMatches = matches
    .filter(m => {
      // Filter by Player
      if (filterPlayerId && !m.teamA.includes(filterPlayerId) && !m.teamB.includes(filterPlayerId)) {
        return false;
      }

      // Filter by Date
      if (filterDate) {
        // filterDate is usually YYYY-MM-DD from the input type="date"
        // Let's format the m.timestamp to match the same timezone output that input expects
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const matchDateStr = formatter.format(new Date(m.timestamp));
        if (matchDateStr !== filterDate) return false;
      }

      // Filter by Match ID
      if (filterMatchId) {
        const shortId = m.id.split('_')[1]?.slice(-3) || '';
        if (!shortId.includes(filterMatchId)) return false;
      }

      // General Search Term
      if (!searchTerm) return true;
      const searchNormalized = normalize(searchTerm);
      const searchWords = searchNormalized.split(' ').filter(w => w.length > 0);
      
      const teamANames = (m.teamA || []).map(id => normalize(getPlayerName(id)));
      const teamBNames = (m.teamB || []).map(id => normalize(getPlayerName(id)));
      const allNames = [...teamANames, ...teamBNames].join(' ');
      const matchDate = normalize(m.date || '');
      const matchId = normalize(m.id || '');

      return searchWords.every(word => 
        allNames.includes(word) || 
        matchDate.includes(word) || 
        matchId.includes(word)
      );
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  if (selectedMatch) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setSelectedMatch(null)}
            className="flex items-center gap-2 text-white/60 hover:text-brand-primary transition-colors font-black uppercase text-[10px] tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Lista
          </button>
          
          {userRole === 'ADMIN' && onDeleteMatch && (
            <button
              onClick={() => {
                onDeleteMatch(selectedMatch.id);
                setSelectedMatch(null);
              }}
              className="flex items-center gap-2 text-rose-500 hover:text-rose-600 transition-colors font-black uppercase text-[10px] tracking-widest"
            >
              <Trash2 className="w-4 h-4" /> Excluir Partida
            </button>
          )}
        </div>

        <div className="bg-brand-light backdrop-blur-xl rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-xl overflow-hidden">
          <div className="bg-white/5 p-8 text-white relative overflow-hidden border-b border-brand-primary/40">
            <div className="absolute top-0 right-0 p-12 opacity-10">
              <Trophy className="w-32 h-32" />
            </div>
            
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <div className="bg-brand-primary/20 p-2 rounded-xl border border-brand-primary/30">
                    <History className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Detalhes da Partida</h2>
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <div className="flex items-center gap-2 text-white/60 text-[10px] font-black uppercase tracking-widest">
                    <Calendar className="w-3.5 h-3.5" /> {new Date(selectedMatch.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-[10px] font-black uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" /> {formatHour(selectedMatch.startTime)} - {formatHour(selectedMatch.endTime)} ({formatTime(selectedMatch.duration)})
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-[10px] font-black uppercase tracking-widest">
                    <Hash className="w-3.5 h-3.5" /> {selectedMatch.mode}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Equipe A</p>
                  <div className="flex flex-col items-center gap-2">
                    {selectedMatch.scoreA > 0 || selectedMatch.scoreB > 0 ? (
                      <p className="text-5xl font-black tracking-tighter">{selectedMatch.scoreA}</p>
                    ) : (
                      <p className="text-5xl font-black tracking-tighter text-white/20">{selectedMatch.winner === 'A' ? '15' : '--'}</p>
                    )}
                    {selectedMatch.winner === 'A' && <Trophy className="w-12 h-12 text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.4)] fill-brand-primary" />}
                  </div>
                </div>
                <div className="text-2xl font-black text-white/20">VS</div>
                <div className="text-center">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Equipe B</p>
                  <div className="flex flex-col items-center gap-2">
                    {selectedMatch.scoreA > 0 || selectedMatch.scoreB > 0 ? (
                      <p className="text-5xl font-black tracking-tighter">{selectedMatch.scoreB}</p>
                    ) : (
                      <p className="text-5xl font-black tracking-tighter text-white/20">{selectedMatch.winner === 'B' ? '15' : '--'}</p>
                    )}
                    {selectedMatch.winner === 'B' && <Trophy className="w-12 h-12 text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.4)] fill-brand-primary" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Equipe A */}
            <div className={`rounded-[2rem] border p-6 ${selectedMatch.winner === 'A' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-brand-primary/40'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-brand-primary/40">
                    <Users className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Equipe A</h3>
                </div>
                {selectedMatch.winner === 'A' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamA || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-brand-primary/40 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white/60">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-brand-primary" /> : idx + 1}
                      </div>
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-500' : 'text-white'}`}
                      >
                        {getPlayerName(id)}
                      </motion.span>
                    </div>
                    {idx === 0 && <span className="text-[8px] font-black text-brand-primary bg-brand-primary/10 border border-brand-primary/40 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Equipe B */}
            <div className={`rounded-[2rem] border p-6 ${selectedMatch.winner === 'B' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-brand-primary/40'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-brand-primary/40">
                    <Users className="w-5 h-5 text-rose-500" />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Equipe B</h3>
                </div>
                {selectedMatch.winner === 'B' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamB || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-brand-primary/40 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white/60">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-rose-500" /> : idx + 1}
                      </div>
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-500' : 'text-white'}`}
                      >
                        {getPlayerName(id)}
                      </motion.span>
                    </div>
                    {idx === 0 && <span className="text-[8px] font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6">

        <div className="bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-brand-primary p-10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-brand-secondary rounded-2xl border border-brand-primary/40">
                <BarChart3 className="w-6 h-6 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Performance da Sessão</h3>
                <div className="flex items-center gap-4 mt-1">
                  <select 
                    value={performanceDate}
                    onChange={(e) => setPerformanceDate(e.target.value)}
                    className="bg-transparent text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] cursor-pointer outline-none"
                  >
                    {availableDates.map(date => (
                      <option key={date} value={date} className="bg-brand-secondary text-white">
                        {date === 'Hoje' ? date : date.split('-').reverse().join('/')}
                      </option>
                    ))}
                  </select>

                  {userRole === 'ADMIN' && onDeleteMatchesByDate && displayMatches.length > 0 && (
                    <button
                      onClick={() => {
                        const targetDate = performanceDate === 'Hoje' ? getFirestoreDateKey() : performanceDate;
                        onDeleteMatchesByDate(targetDate);
                      }}
                      className="flex items-center gap-1.5 text-[9px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
                      title="Excluir todas as partidas deste dia"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir Dia
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-x-auto pb-6 -mx-10 px-10">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className="text-left py-4 px-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] sticky left-0 bg-black z-20">Guerreiro</th>
                    {displayMatches.map((_, i) => (
                      <th key={i} className="py-4 px-2 text-center min-w-[60px]">
                        <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
                          B{i + 1}
                        </div>
                      </th>
                    ))}
                    {displayMatches.length === 0 && (
                      <th className="py-4 px-2 text-center min-w-[60px]">
                        <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
                          B1
                        </div>
                      </th>
                    )}
                    <th className="py-4 px-6 text-center text-[10px] font-black text-white/40 uppercase tracking-[0.2em] min-w-[100px]">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((player, idx) => {
                    const displayName = player.name || "Sócio sem nome";
                    const arrivalOrder = player.arrivalOrder || 0;

                    return (
                      <tr key={player.id || `participant-row-${idx}`} className="group">
                        <td className="py-4 px-6 sticky left-0 bg-black z-10 border-y border-l border-brand-primary/40 rounded-l-2xl group-hover:bg-brand-secondary transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg">
                              {arrivalOrder || '?'}
                            </div>
                            <div>
                              <p className={`text-xs font-black uppercase tracking-tight ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>{displayName}</p>
                              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-0.5">Nível Pro</p>
                            </div>
                          </div>
                        </td>
                        {displayMatches.map((match, mIdx) => {
                          const isTeamA = (match.teamA || []).includes(player.id);
                          const isTeamB = (match.teamB || []).includes(player.id);
                          const played = isTeamA || isTeamB;
                          const won = (isTeamA && match.winner === 'A') || (isTeamB && match.winner === 'B');
                          
                          return (
                            <td 
                              key={match.id || `match-cell-${mIdx}`} 
                              className="py-4 px-2 text-center border-y border-brand-primary/40 group-hover:bg-brand-secondary transition-colors"
                              title={match.scoreA > 0 || match.scoreB > 0 ? `Placar: ${match.scoreA} x ${match.scoreB}` : 'Placar não registrado'}
                            >
                              {played ? (
                                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-black text-xs shadow-lg transition-all group-hover:scale-110 border ${won ? 'bg-brand-primary border-brand-primary/30 text-black' : 'bg-white border-white/30 text-black'}`}>
                                  {won ? 'V' : 'D'}
                                </div>
                              ) : (
                                <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/40 flex items-center justify-center">
                                  <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {displayMatches.length === 0 && (
                          <td className="py-4 px-2 text-center border-y border-brand-primary/40 group-hover:bg-brand-secondary transition-colors">
                            <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/40 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                            </div>
                          </td>
                        )}
                        <td className="py-4 px-6 text-center border-y border-r border-brand-primary/40 rounded-r-2xl group-hover:bg-brand-secondary transition-colors">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-black text-white uppercase tracking-tight">{player.sessionMatches} Jogos</span>
                            <div className="flex gap-2 mt-1.5">
                              <span className="text-[9px] font-black text-black bg-brand-primary px-2 py-0.5 rounded-lg border border-brand-primary/40">{player.sessionWins}V</span>
                              <span className="text-[9px] font-black text-black bg-white px-2 py-0.5 rounded-lg border border-brand-primary/40">{player.sessionLosses}D</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ); })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <History className="w-8 h-8 text-brand-primary" /> 
            <span className="flex items-center">
              Histórico de Partidas
              <HelpTooltip 
                title="Histórico" 
                content="Registro das últimas partidas finalizadas. Mostra os times, o placar final e permite buscar por jogador ou data."
              />
            </span>
          </h2>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input 
                type="text" 
                placeholder="Busca rápida..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-brand-primary/40 rounded-2xl text-xs font-bold text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all shadow-sm placeholder:text-white/40"
              />
            </div>
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`p-3 rounded-2xl border transition-all ${isFilterExpanded ? 'bg-brand-primary border-brand-primary text-brand-secondary' : 'bg-white/5 border-brand-primary/40 text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-brand-light backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary animate-in slide-in-from-top duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Filtrar por Jogador</label>
              <select 
                value={filterPlayerId}
                onChange={(e) => setFilterPlayerId(e.target.value)}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="" className="bg-brand-secondary text-white">Todos os Jogadores</option>
                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id} className="bg-brand-secondary text-white">{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Filtrar por Data</label>
              <input 
                type="date" 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Número da Partida</label>
              <input 
                type="text" 
                placeholder="Ex: 001"
                value={filterMatchId}
                onChange={(e) => setFilterMatchId(e.target.value)}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary placeholder:text-white/20"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button 
                onClick={() => {
                  setFilterPlayerId('');
                  setFilterDate('');
                  setFilterMatchId('');
                  setSearchTerm('');
                }}
                className="text-[10px] font-black text-brand-primary uppercase tracking-widest hover:underline"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredMatches.length > 0 ? (
          filteredMatches.map((match) => (
            <button
              key={match.id}
              onClick={() => setSelectedMatch(match)}
              className="group bg-brand-light p-6 rounded-[2.5rem] border border-white/5 border-l-[6px] border-l-brand-primary hover:border-brand-primary/50 hover:shadow-xl hover:shadow-brand-primary/5 transition-all text-left flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex flex-col items-center justify-center border border-brand-primary/40 group-hover:bg-brand-primary/10 group-hover:border-brand-primary/40 transition-colors">
                  <span className="text-[10px] font-black text-white/60 uppercase group-hover:text-brand-primary/60">Partida</span>
                  <span className="text-lg font-black text-white group-hover:text-brand-primary">
                    {match.dailyNumber || match.id.split('_')[1]?.slice(-3).toUpperCase() || '---'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-white/60" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{new Date(match.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'A' ? 'bg-brand-primary/10 border-2 border-brand-primary/30 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {match.winner === 'A' && <Trophy className="w-5 h-5 text-brand-primary fill-brand-primary" />}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'A' ? 'text-brand-primary' : 'text-white/60'}`}>Equipe A</span>
                      {renderScore(match, 'A')}
                    </div>
                    <div className="text-xs font-black text-white/20 italic">VS</div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'B' ? 'bg-brand-primary/10 border-2 border-brand-primary/30 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {renderScore(match, 'B')}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'B' ? 'text-brand-primary' : 'text-white/60'}`}>Equipe B</span>
                      {match.winner === 'B' && <Trophy className="w-5 h-5 text-brand-primary fill-brand-primary" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-white/60" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                      {formatHour(match.startTime)} - {formatHour(match.endTime)} ({formatTime(match.duration)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-white/60" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{(match.teamA || []).length + (match.teamB || []).length} Atletas</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 border border-brand-primary/40 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-brand-secondary transition-all">
                  <ChevronRight className="w-5 h-5 text-white" />
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-brand-light backdrop-blur-xl rounded-[3rem] border-4 border-dashed border-brand-primary/40">
            <div className="bg-white/5 border border-brand-primary/40 p-6 rounded-full">
              <History className="w-12 h-12 text-white/20" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-white uppercase tracking-tight">Nenhuma partida encontrada</p>
              <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">O histórico aparecerá assim que as partidas forem finalizadas.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
