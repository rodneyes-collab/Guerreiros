import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Match, Player } from '../types';
import { getMatchSetters } from '../utils/setterStats';
import { formatTime } from '../utils/helpers';
import { WinLossChart } from '../src/components/WinLossChart';
import { getFirestoreDateKey } from '../firebase';
import { toStandardDateKey } from '../src/utils/dateUtils';
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
  Edit3,
  RefreshCw,
  BarChart3,
  Copy,
  Check,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'motion/react';

import { HelpTooltip } from '../src/components/HelpTooltip';
import { HistoryCalendar } from './HistoryCalendar';
import { EditMatchModal } from '../src/components/EditMatchModal';

interface HistoryViewProps {
  onDeleteMatch?: (matchId: string) => void;
  onDeleteMatchesByDate?: (date: string) => void;
  onUpdateMatchResult?: (matchId: string, newWinner: 'A' | 'B', newScoreA: number, newScoreB: number, newTeamA?: string[], newTeamB?: string[]) => Promise<void>;
  onReprocessAllMatches?: () => Promise<void>;
}

const brDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export const HistoryView: React.FC<HistoryViewProps> = ({ onDeleteMatch, onDeleteMatchesByDate, onUpdateMatchResult, onReprocessAllMatches }) => {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const { matches, players: allPlayers, userRole, currentPlayer, attendance: allAttendance, tournaments } = useStore();
  const players = React.useMemo(() => allPlayers.filter(p => p.status !== 'inactive'), [allPlayers]);
  const attendance = React.useMemo(() => allAttendance.filter(p => p.status !== 'inactive'), [allAttendance]);
  
  const getMatchStandardDate = (m: { date?: string; timestamp?: number }): string => {
    if (m.timestamp) {
      return brDateFormatter.format(new Date(m.timestamp));
    }
    return m.date ? toStandardDateKey(m.date) : '';
  };

  const filterSessionDates = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach(m => {
      const d = getMatchStandardDate(m);
      if (d) {
        dates.add(d);
      }
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const [performanceDate, setPerformanceDate] = useState(() => {
    const today = getFirestoreDateKey();
    const hasToday = matches.some(m => {
      const matchDate = getMatchStandardDate(m);
      const directDate = m.date ? toStandardDateKey(m.date) : '';
      return matchDate === today || directDate === today;
    });
    if (hasToday) return 'Hoje';
    const dates = new Set<string>();
    matches.forEach(m => {
      const d = getMatchStandardDate(m);
      if (d) dates.add(d);
    });
    const sorted = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return sorted[0] || 'Hoje';
  });

  // Sincronizar performanceDate caso hoje não tenha partidas e matches carreguem depois
  React.useEffect(() => {
    const today = getFirestoreDateKey();
    const hasToday = matches.some(m => {
      const matchDate = getMatchStandardDate(m);
      const directDate = m.date ? toStandardDateKey(m.date) : '';
      return matchDate === today || directDate === today;
    });
    if (!hasToday && filterSessionDates.length > 0) {
      if (performanceDate === 'Hoje' || performanceDate === today || !performanceDate) {
        setPerformanceDate(filterSessionDates[0]);
      }
    }
  }, [matches, filterSessionDates, performanceDate]);

  const displayMatches = React.useMemo(() => {
    const targetDate = performanceDate === 'Hoje' ? getFirestoreDateKey() : performanceDate;
    const targetDateStd = toStandardDateKey(targetDate);
    return matches.filter(m => {
      const matchDate = getMatchStandardDate(m);
      const directDate = m.date ? toStandardDateKey(m.date) : '';
      return matchDate === targetDateStd || directDate === targetDateStd;
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
    const dates = new Set<string>();
    matches.forEach(m => {
      const d = getMatchStandardDate(m);
      if (d) {
        dates.add(d);
      }
    });
    const hasToday = dates.has(today);
    // Remove a data de hoje do set para não duplicar com o rótulo "Hoje"
    dates.delete(today);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return hasToday ? ['Hoje', ...sortedDates] : sortedDates;
  }, [matches]);

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const std = toStandardDateKey(dateStr);
    const parts = std.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // formatting DD/MM/YYYY
    }
    return dateStr;
  };

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlayerId, setFilterPlayerId] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterMatchId, setFilterMatchId] = useState<string>('');
  const [filterPlayerResult, setFilterPlayerResult] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const getPlayerName = (id: string) => {
    return allPlayers.find(p => p.id === id)?.name || 'Jogador Desconhecido';
  };

  const getPlayerEloChangeForMatch = (playerId: string, matchId: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player || !player.eloHistory) return null;
    const entry = player.eloHistory.find(h => h.matchId === matchId);
    return entry && entry.change !== undefined ? entry.change : null;
  };

  const getTeamEloChange = (teamPlayerIds: string[], matchId: string) => {
    if (!teamPlayerIds || teamPlayerIds.length === 0) return null;
    for (const id of teamPlayerIds) {
      const change = getPlayerEloChangeForMatch(id, matchId);
      if (change !== null) return change;
    }
    return null;
  };

  const handleCopyReport = () => {
    if (filteredMatches.length === 0) return;

    let reportText = `🏆 *GUERREIROS PLAYA - HISTÓRICO DE PARTIDAS* 🏆\n`;
    
    // Filtros aplicados no cabeçalho se existirem
    const appliedFilters: string[] = [];
    if (filterPlayerId) {
      const pName = getPlayerName(filterPlayerId);
      appliedFilters.push(`👤 *Sócio:* ${pName}`);
    }
    if (filterDate) {
      const formattedDate = filterDate.split('-').reverse().join('/');
      appliedFilters.push(`📅 *Data:* ${formattedDate}`);
    }
    if (filterMatchId) {
      appliedFilters.push(`🔢 *Filtro Partida:* #${filterMatchId}`);
    }
    if (searchTerm) {
      appliedFilters.push(`🔍 *Busca:* "${searchTerm}"`);
    }

    if (appliedFilters.length > 0) {
      reportText += `⚙️ *Filtros Aplicados:*\n${appliedFilters.join('\n')}\n`;
    }
    reportText += `⚡ *Partidas Encontradas:* ${filteredMatches.length}\n`;
    reportText += `==================================\n\n`;

    filteredMatches.forEach((m, index) => {
      const matchNum = m.dailyNumber || m.id.split('_')[1]?.slice(-3).toUpperCase() || `---`;
      
      const mDateObj = new Date(m.timestamp);
      const mDate = mDateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      const startTimeText = formatHour(m.startTime);
      const endTimeText = formatHour(m.endTime);
      const durationText = formatTime(m.duration);

      const teamANames = (m.teamA || []).map(id => {
        const name = getPlayerName(id);
        const change = getPlayerEloChangeForMatch(id, m.id);
        return change !== null ? `${name} (${change > 0 ? '+' : ''}${change} ELO)` : name;
      }).join(', ');
      const teamBNames = (m.teamB || []).map(id => {
        const name = getPlayerName(id);
        const change = getPlayerEloChangeForMatch(id, m.id);
        return change !== null ? `${name} (${change > 0 ? '+' : ''}${change} ELO)` : name;
      }).join(', ');

      reportText += `🎾 *PARTIDA #${matchNum}* (${mDate})\n`;
      reportText += `🕒 *Início:* ${startTimeText} | *Fim:* ${endTimeText} (Duração: ${durationText})\n`;
      reportText += `📊 *Placar:* Equipe A *${m.scoreA}* x *${m.scoreB}* Equipe B\n`;
      
      const winnerTeamName = m.winner === 'A' ? 'Equipe A' : 'Equipe B';
      reportText += `🏆 *Vencedor:* ${winnerTeamName}\n`;

      if (filterPlayerId) {
        const isTeamA = (m.teamA || []).includes(filterPlayerId);
        const isTeamB = (m.teamB || []).includes(filterPlayerId);
        const won = (isTeamA && m.winner === 'A') || (isTeamB && m.winner === 'B');
        reportText += `🎯 *Desempenho do Sócio:* ${won ? '✅ VITÓRIA' : '❌ DERROTA'}\n`;
      }

      reportText += `👥 *Participantes Equipe A:* ${teamANames}\n`;
      reportText += `👥 *Participantes Equipe B:* ${teamBNames}\n`;
      reportText += `----------------------------------\n\n`;
    });

    reportText += `_Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} por Guerreiros Intelligence ⚡_`;

    navigator.clipboard.writeText(reportText).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(err => {
      console.error('Erro ao copiar relatório:', err);
    });
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
        const filterDateStd = toStandardDateKey(filterDate);
        const matchDateStr = getMatchStandardDate(m);
        const directDate = m.date ? toStandardDateKey(m.date) : '';
        if (matchDateStr !== filterDateStd && directDate !== filterDateStd) return false;
      }

      // Filter by Match ID
      if (filterMatchId) {
        const shortId = m.id.split('_')[1]?.slice(-3) || '';
        if (!shortId.includes(filterMatchId)) return false;
      }

      // Filter by Result / Winner
      if (filterPlayerResult) {
        if (filterPlayerId) {
          const played = (m.teamA || []).includes(filterPlayerId) || (m.teamB || []).includes(filterPlayerId);
          if (!played) return false;
          const won = (
            ((m.teamA || []).includes(filterPlayerId) && m.winner === 'A') ||
            ((m.teamB || []).includes(filterPlayerId) && m.winner === 'B')
          );
          if (filterPlayerResult === 'win' && !won) return false;
          if (filterPlayerResult === 'loss' && won) return false;
        } else {
          if (filterPlayerResult === 'win_A' && m.winner !== 'A') return false;
          if (filterPlayerResult === 'win_B' && m.winner !== 'B') return false;
        }
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
          
          <div className="flex items-center gap-3">
            {userRole === 'ADMIN' && onUpdateMatchResult && (
              <button
                onClick={() => setEditingMatch(selectedMatch)}
                className="flex items-center gap-2 text-brand-primary hover:text-white transition-colors font-black uppercase text-[10px] tracking-widest bg-brand-primary/10 border border-brand-primary/30 px-3 py-1.5 rounded-xl hover:bg-brand-primary/20"
              >
                <Edit3 className="w-4 h-4" /> Editar Resultado
              </button>
            )}
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
            <div className={`rounded-[2rem] border p-6 ${selectedMatch.winner === 'A' ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-white/5 border-brand-primary/40'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-brand-primary/40">
                    <Users className="w-5 h-5 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1">Equipe A</h3>
                    {(() => {
                      const change = getTeamEloChange(selectedMatch.teamA || [], selectedMatch.id);
                      if (change === null) return null;
                      const isPositive = change > 0;
                      return (
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isPositive ? 'text-brand-primary' : 'text-white/60'}`}>
                          {isPositive ? `+${change}` : change} ELO Grupo
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {selectedMatch.winner === 'A' && (
                  <div className="bg-brand-primary text-black text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3 animate-bounce" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const playersMap = players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Player>);
                  const { setterAId } = getMatchSetters(selectedMatch, playersMap);
                  
                  return (selectedMatch.teamA || []).map((id, idx) => {
                    const isSetter = id === setterAId;
                    
                    return (
                      <div key={id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-brand-primary/40 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white/60">
                            {isSetter ? <ShieldCheck className="w-4 h-4 text-brand-primary" /> : idx + 1}
                          </div>
                          <motion.span 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className={`text-xs font-black uppercase tracking-tight ${isSetter ? 'text-rose-500' : 'text-white'}`}
                          >
                            {getPlayerName(id)}
                          </motion.span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSetter && <span className="text-[8px] font-black text-brand-primary bg-brand-primary/10 border border-brand-primary/40 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                          {(() => {
                            const change = getPlayerEloChangeForMatch(id, selectedMatch.id);
                            if (change === null) return null;
                            const isPositive = change > 0;
                            const isNegative = change < 0;
                            return (
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border ${
                                isPositive 
                                  ? 'bg-brand-primary border-brand-primary text-black' 
                                  : isNegative 
                                    ? 'bg-white border-white text-black' 
                                    : 'bg-white/10 border-white/20 text-white/60'
                              }`}>
                                {isPositive ? `+${change}` : change} ELO
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Equipe B */}
            <div className={`rounded-[2rem] border p-6 ${selectedMatch.winner === 'B' ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-white/5 border-brand-primary/40'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-brand-primary/40">
                    <Users className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1">Equipe B</h3>
                    {(() => {
                      const change = getTeamEloChange(selectedMatch.teamB || [], selectedMatch.id);
                      if (change === null) return null;
                      const isPositive = change > 0;
                      return (
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isPositive ? 'text-brand-primary' : 'text-white/60'}`}>
                          {isPositive ? `+${change}` : change} ELO Grupo
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {selectedMatch.winner === 'B' && (
                  <div className="bg-brand-primary text-black text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3 animate-bounce" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const playersMap = players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Player>);
                  const { setterBId } = getMatchSetters(selectedMatch, playersMap);
                  
                  return (selectedMatch.teamB || []).map((id, idx) => {
                    const isSetter = id === setterBId;
                    
                    return (
                      <div key={id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-brand-primary/40 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white/60">
                            {isSetter ? <ShieldCheck className="w-4 h-4 text-rose-500" /> : idx + 1}
                          </div>
                          <motion.span 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className={`text-xs font-black uppercase tracking-tight ${isSetter ? 'text-rose-500' : 'text-white'}`}
                          >
                            {getPlayerName(id)}
                          </motion.span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSetter && <span className="text-[8px] font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                          {(() => {
                            const change = getPlayerEloChangeForMatch(id, selectedMatch.id);
                            if (change === null) return null;
                            const isPositive = change > 0;
                            const isNegative = change < 0;
                            return (
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border ${
                                isPositive 
                                  ? 'bg-brand-primary border-brand-primary text-black' 
                                  : isNegative 
                                    ? 'bg-white border-white text-black' 
                                    : 'bg-white/10 border-white/20 text-white/60'
                              }`}>
                                {isPositive ? `+${change}` : change} ELO
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Lances/Estatísticas Detalhadas Ponto a Ponto */}
            {selectedMatch.stats && selectedMatch.stats.length > 0 && (
              <div className="col-span-1 md:col-span-2 bg-black/60 p-6 rounded-[2rem] border border-brand-primary/35 shadow-xl">
                <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-3">
                  <div className="p-2 bg-brand-primary/10 rounded-xl border border-brand-primary/45">
                    <BarChart3 className="w-5 h-5 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Linha do Tempo Tática</h3>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">Estatísticas Ponto a Ponto</p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedMatch.stats.map((event: any, sIdx: number) => {
                    const isPoint = event.type === 'point';
                    const isError = event.type === 'error';
                    return (
                      <div 
                        key={event.id || sIdx} 
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                          isPoint 
                            ? 'bg-brand-primary/5 border-brand-primary/20' 
                            : isError 
                              ? 'bg-white/5 border-white/20'
                              : 'bg-zinc-900/60 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-black text-[9px] ${
                            isPoint 
                              ? 'bg-brand-primary text-black' 
                              : isError 
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-white'
                          }`}>
                            {isPoint ? 'V' : isError ? 'D' : '-'}
                          </span>
                          <div>
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">
                              {event.playerName || 'Guerreiro'} • <span className="text-brand-primary">{event.action || 'Lance'}</span>
                            </p>
                            <p className="text-[10px] text-white/50 font-semibold mt-0.5">{event.description}</p>
                          </div>
                        </div>

                        {event.scoreA !== undefined && event.scoreB !== undefined && (
                          <span className="text-[10px] font-black text-brand-primary font-mono bg-brand-primary/15 px-2.5 py-1 rounded-lg border border-brand-primary/30">
                            {event.scoreA} x {event.scoreB}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <HistoryCalendar
        matches={matches}
        tournaments={tournaments || []}
        selectedDate={filterDate || (performanceDate !== 'Hoje' ? performanceDate : '')}
        onSelectDate={(date) => {
          setFilterDate(date);
          const today = getFirestoreDateKey();
          if (date === today) {
            setPerformanceDate('Hoje');
          } else if (filterSessionDates.includes(date)) {
            setPerformanceDate(date);
          }
        }}
      />
      <div className="flex flex-col gap-6">

        <div className="bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-brand-primary p-10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-brand-secondary rounded-2xl border border-brand-primary/40">
                <BarChart3 className="w-6 h-6 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Performance do Dia</h3>
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
            {displayMatches.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs font-black text-white/40 uppercase tracking-widest">Nenhuma partida registrada nesta data</p>
              </div>
            ) : (
              <div className="overflow-x-auto pb-6 -mx-10 px-10">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className="text-left py-4 px-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] sticky left-0 bg-black z-20">Guerreiro</th>
                      {displayMatches.map((match, i) => (
                        <th key={match.id || i} className="py-4 px-2 text-center min-w-[64px]">
                          <div 
                            className="mx-auto px-2 h-10 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex flex-col items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-wider"
                            title={`Partida #${match.dailyNumber || (i + 1)}`}
                          >
                            <span className="text-[7.5px] text-white/50 leading-tight">PARTIDA</span>
                            <span className="leading-tight text-brand-primary">#{match.dailyNumber || (i + 1)}</span>
                          </div>
                        </th>
                      ))}
                      <th className="py-4 px-6 text-center text-[10px] font-black text-white/40 uppercase tracking-[0.2em] min-w-[100px]">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((player, idx) => {
                      const displayName = player.name || "Sócio sem nome";
                      const rawArrivalOrder = player.arrivalOrder || 0;
                      const displayArrivalOrder = (rawArrivalOrder && rawArrivalOrder < 999) ? rawArrivalOrder : (idx + 1);

                      return (
                        <tr key={player.id || `participant-row-${idx}`} className="group">
                          <td className="py-4 px-6 sticky left-0 bg-black z-10 border-y border-l border-brand-primary/40 rounded-l-2xl group-hover:bg-brand-secondary transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg">
                                {displayArrivalOrder}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
              onClick={handleCopyReport}
              disabled={filteredMatches.length === 0}
              className={`p-3 rounded-2xl border transition-all ${
                filteredMatches.length === 0 
                ? 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed' 
                : copyFeedback 
                  ? 'bg-white border-white text-black scale-105' 
                  : 'bg-brand-primary border-brand-primary text-black hover:bg-brand-primary/80 active:scale-95 hover:scale-105'
              }`}
              title="Copiar Relatório p/ WhatsApp"
            >
              {copyFeedback ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`p-3 rounded-2xl border transition-all ${isFilterExpanded ? 'bg-brand-primary border-brand-primary text-brand-secondary' : 'bg-white/5 border-brand-primary/40 text-white/60 hover:bg-white/10 hover:text-white'}`}
              title="Filtros Avançados"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-6 bg-brand-light backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary animate-in slide-in-from-top duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Filtrar por Jogador</label>
              <select 
                value={filterPlayerId}
                onChange={(e) => {
                  setFilterPlayerId(e.target.value);
                  setFilterPlayerResult(''); // Reset result filter when player changes to ensure compatibility
                }}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="" className="bg-brand-secondary text-white">Todos os Jogadores</option>
                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id} className="bg-brand-secondary text-white">{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Filtrar por Dia / Data</label>
              <select 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="" className="bg-brand-secondary text-white">Todas as Datas</option>
                {filterSessionDates.map(date => (
                  <option key={date} value={date} className="bg-brand-secondary text-white">
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
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
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                {filterPlayerId ? 'Resultado do Sócio' : 'Time Vencedor'}
              </label>
              <select 
                value={filterPlayerResult}
                onChange={(e) => setFilterPlayerResult(e.target.value)}
                className="w-full p-3 bg-white/5 border border-brand-primary/40 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {filterPlayerId ? (
                  <>
                    <option value="" className="bg-brand-secondary text-white">Todos os Resultados</option>
                    <option value="win" className="bg-brand-secondary text-white">Vitórias do Sócio</option>
                    <option value="loss" className="bg-brand-secondary text-white">Derrotas do Sócio</option>
                  </>
                ) : (
                  <>
                    <option value="" className="bg-brand-secondary text-white">Qualquer Vencedor</option>
                    <option value="win_A" className="bg-brand-secondary text-white">Vitória do Time A</option>
                    <option value="win_B" className="bg-brand-secondary text-white">Vitória do Time B</option>
                  </>
                )}
              </select>
            </div>
            <div className="sm:col-span-4 flex flex-col sm:flex-row justify-between items-center gap-4 mt-2 border-t border-white/5 pt-4">
              <button
                onClick={handleCopyReport}
                disabled={filteredMatches.length === 0}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  filteredMatches.length === 0 
                  ? 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed' 
                  : copyFeedback 
                    ? 'bg-white text-black border border-white' 
                    : 'bg-brand-primary text-black border border-brand-primary hover:bg-brand-primary/80 active:scale-95 shadow-lg shadow-brand-primary/10'
                }`}
              >
                {copyFeedback ? (
                  <>
                    <Check className="w-4 h-4" />
                    Relatório Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar WhatsApp ({filteredMatches.length})
                  </>
                )}
              </button>
              
              <button 
                onClick={() => {
                  setFilterPlayerId('');
                  setFilterDate('');
                  setFilterMatchId('');
                  setFilterPlayerResult('');
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
            <div
              key={match.id}
              onClick={() => setSelectedMatch(match)}
              className="group bg-brand-light p-6 rounded-[2.5rem] border border-white/5 border-l-[6px] border-l-brand-primary hover:border-brand-primary/50 hover:shadow-xl hover:shadow-brand-primary/5 transition-all text-left flex flex-col md:flex-row items-center justify-between gap-6 cursor-pointer"
            >
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex flex-col items-center justify-center border border-brand-primary/40 group-hover:bg-brand-primary/10 group-hover:border-brand-primary/40 transition-colors">
                  <span className="text-[10px] font-black text-white/60 uppercase group-hover:text-brand-primary/60">Partida</span>
                  <span className="text-lg font-black text-white group-hover:text-brand-primary">
                    {match.dailyNumber || match.id.split('_')[1]?.slice(-3).toUpperCase() || '---'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <Calendar className="w-3 h-3 text-white/60" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                      {new Date(match.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </span>
                    {filterPlayerId && (
                      (() => {
                        const played = (match.teamA || []).includes(filterPlayerId) || (match.teamB || []).includes(filterPlayerId);
                        if (!played) return null;
                        const won = (
                          ((match.teamA || []).includes(filterPlayerId) && match.winner === 'A') ||
                          ((match.teamB || []).includes(filterPlayerId) && match.winner === 'B')
                        );
                        return won ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-brand-primary text-black font-mono">
                            🟢 VITÓRIA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-white text-black font-mono">
                            🔴 DERROTA
                          </span>
                        );
                      })()
                    )}
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
                <div className="flex items-center gap-2">
                  {userRole === 'ADMIN' && onUpdateMatchResult && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMatch(match);
                      }}
                      className="p-2 rounded-xl bg-white/5 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-black transition-all"
                      title="Editar Resultado"
                    >
                      <Edit3 className="w-4 h-4" />
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-brand-primary/40 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-brand-secondary transition-all">
                    <ChevronRight className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </div>
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

      {/* Modal de Edição de Resultado de Partida */}
      <EditMatchModal
        isOpen={Boolean(editingMatch)}
        match={editingMatch}
        players={players}
        onClose={() => setEditingMatch(null)}
        onSave={async (matchId, newWinner, newScoreA, newScoreB, newTeamA, newTeamB) => {
          if (userRole !== 'ADMIN') {
            console.error('[ERROR - HistoryView] Apenas administradores podem editar resultados de partidas.');
            return;
          }
          if (onUpdateMatchResult) {
            await onUpdateMatchResult(matchId, newWinner, newScoreA, newScoreB, newTeamA, newTeamB);
            if (selectedMatch && selectedMatch.id === matchId) {
              setSelectedMatch({
                ...selectedMatch,
                winner: newWinner,
                scoreA: newScoreA,
                scoreB: newScoreB,
                ...(newTeamA ? { teamA: newTeamA } : {}),
                ...(newTeamB ? { teamB: newTeamB } : {}),
              });
            }
          }
        }}
      />
    </div>
  );
};
