import { useShallow } from 'zustand/react/shallow';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Player } from '../types';
import { fetchAttendanceHistory, calculateAttendanceStats, clearAttendanceHistory } from '../src/services/attendanceService';
import { getFirestoreDateKey } from '../firebase';
import { 
  Calendar, 
  Filter, 
  Users, 
  TrendingUp, 
  Search, 
  Clock, 
  ChevronRight,
  Download,
  BarChart3,
  X,
  Trash2,
  PieChart as PieChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell
} from 'recharts';

export const AttendanceReportView: React.FC<{ setViewMode?: (mode: any) => void }> = ({ setViewMode }) => {
  const { players: allPlayers, userRole, showConfirmModal, showNotification, matches } = useStore(useShallow(state => ({players: state.players, userRole: state.userRole, showConfirmModal: state.showConfirmModal, showNotification: state.showNotification, matches: state.matches})));
  const players = useMemo(() => allPlayers.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM), [allPlayers]);
  const [history, setHistory] = useState<Record<string, Player[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getFirestoreDateKey().slice(0, 7));
  const [filterDate, setFilterDate] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'PLAYERS' | 'SESSIONS' | 'VISUAL'>('PLAYERS');
  const [isClearing, setIsClearing] = useState(false);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAttendanceHistory(filterMonth);
      setHistory(data);
    } catch (error) {
      console.error("Failed to load attendance history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [filterMonth]);

  // Filter history to only include dates that have matches played on them (dias de jogo)
  const validHistory = useMemo(() => {
    const matchDates = new Set(matches.map(m => m.date));
    const result: Record<string, Player[]> = {};
    Object.entries(history).forEach(([date, dayPlayers]) => {
      if (matchDates.has(date)) {
        result[date] = dayPlayers;
      }
    });
    return result;
  }, [history, matches]);

  const stats = useMemo(() => {
    // If filterDate is set, we only show stats for that specific day
    let filteredHistory = filterDate && validHistory[filterDate] 
      ? { [filterDate]: validHistory[filterDate] } 
      : validHistory;
    
    // If selectedPlayerId is set, we only care about that player's presence
    const baseStats = calculateAttendanceStats(filteredHistory, players);
    
    if (selectedPlayerId) {
      return baseStats.filter(s => s.playerId === selectedPlayerId);
    }
    
    return baseStats;
  }, [validHistory, players, filterDate, selectedPlayerId]);

  const filteredStats = useMemo(() => {
    return stats.filter(s => s.playerName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [stats, searchTerm]);

  const sessionSummary = useMemo(() => {
    return Object.entries(validHistory)
      .map(([date, dayPlayers]) => ({
        date,
        count: dayPlayers.length,
        hasSelectedPlayer: selectedPlayerId ? dayPlayers.some(p => p.id === selectedPlayerId) : true,
        percentage: dayPlayers.length > 0 ? (dayPlayers.length / (dayPlayers.length + 12)) * 100 : 0 // Mock total for context
      }))
      .filter(s => s.hasSelectedPlayer)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [validHistory, selectedPlayerId]);

  const uniqueMonths = useMemo(() => {
    // Generate last 12 months
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    return months;
  }, []);

  const performanceStats = useMemo(() => {
    const playerStats: Record<string, { wins: number; losses: number; draws: number; totalMatches: number }> = {};
    
    // Filter matches for the current month if filterMonth is set
    const filteredMatches = matches.filter(m => !filterMonth || m.date.startsWith(filterMonth));

    filteredMatches.forEach(match => {
      if (!match.winner || !match.teamA || !match.teamB) return;
      
      const allMatchPlayerIds = [...match.teamA, ...match.teamB];
      
      allMatchPlayerIds.forEach(playerId => {
        if (!playerStats[playerId]) {
          playerStats[playerId] = { wins: 0, losses: 0, draws: 0, totalMatches: 0 };
        }
        
        playerStats[playerId].totalMatches++;
        const isInTeamA = match.teamA.includes(playerId);
        
        if ((isInTeamA && match.winner === 'A') || (!isInTeamA && match.winner === 'B')) {
          playerStats[playerId].wins++;
        } else {
          playerStats[playerId].losses++;
        }
      });
    });

    return players
      .map(p => {
        const pStat = playerStats[p.id] || { wins: 0, losses: 0, draws: 0, totalMatches: 0 };
        const attendance = stats.find(s => s.playerId === p.id);
        return {
          id: p.id,
          name: p.name,
          winRate: pStat.totalMatches > 0 ? (pStat.wins / pStat.totalMatches) * 100 : 0,
          elo: p.elo || 1200,
          attendance: attendance?.percentage || 0,
          totalMatches: pStat.totalMatches
        };
      })
      .filter(s => s.totalMatches > 0 || s.attendance > 0)
      .sort((a, b) => b.winRate - a.winRate);
  }, [matches, players, stats, filterMonth]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/95 border border-brand-primary/40 p-4 rounded-2xl shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
          <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-3 border-b border-brand-primary/20 pb-2">{label}</p>
          <div className="space-y-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: entry.color }} />
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-tight">{entry.name}</p>
                </div>
                <p className="text-xs font-black text-white">
                  {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
                  {entry.unit || ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleClearHistory = async () => {
    showConfirmModal(
      "Zerar Histórico de Presença",
      "Tem certeza que deseja apagar TODO o histórico de presença? Esta ação não pode ser desfeita.",
      async () => {
        setIsClearing(true);
        try {
          await clearAttendanceHistory();
          await loadHistory();
          showNotification("Histórico apagado com sucesso!", "success");
        } catch (error) {
          console.error("Failed to clear history", error);
          showNotification("Erro ao apagar histórico.", "error");
        } finally {
          setIsClearing(false);
        }
      }
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Filters */}
      <div className="bg-black p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            {setViewMode && (
              <button 
                onClick={() => setViewMode('presence')}
                className="p-3 bg-white/5 hover:bg-brand-primary/10 text-white/60 hover:text-brand-primary rounded-2xl transition-all border border-brand-primary/40"
              >
                <ChevronRight className="w-6 h-6 rotate-180" />
              </button>
            )}
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-brand-primary" />
                Relatório de Presença
              </h2>
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">Análise de frequência dos sócios ao longo do tempo</p>
            </div>
          </div>

          {userRole === 'ADMIN' && (
            <button
              onClick={handleClearHistory}
              disabled={isClearing}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-rose-500/20 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isClearing ? 'Apagando...' : 'Zerar Histórico'}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-brand-primary/40 flex-1 md:flex-none">
              <Users className="w-4 h-4 text-white/20" />
              <select 
                value={selectedPlayerId} 
                onChange={e => setSelectedPlayerId(e.target.value)}
                className="bg-transparent border-none text-sm font-black text-white outline-none cursor-pointer w-full min-w-[150px]"
              >
                <option value="" className="bg-brand-secondary text-white">Todos os Sócios</option>
                {players.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id} className="bg-brand-secondary text-white">{p.name}</option>
                ))}
              </select>
              {selectedPlayerId && (
                <button onClick={() => setSelectedPlayerId('')} className="text-white/20 hover:text-rose-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-brand-primary/40 flex-1 md:flex-none">
              <Filter className="w-4 h-4 text-white/20" />
              <select 
                value={filterMonth} 
                onChange={e => setFilterMonth(e.target.value)}
                className="bg-transparent border-none text-sm font-black text-white outline-none cursor-pointer w-full"
              >
                <option value="" className="bg-brand-secondary text-white">Todos os Meses</option>
                {uniqueMonths.map(m => {
                  const [year, month] = m.split('-');
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('pt-BR', { month: 'long' });
                  return (
                    <option key={m} value={m} className="bg-brand-secondary text-white">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}/{year}</option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-brand-primary/40 flex-1 md:flex-none">
              <Calendar className="w-4 h-4 text-white/20" />
              <input 
                type="date"
                value={filterDate} 
                onChange={e => setFilterDate(e.target.value)}
                className="bg-transparent border-none text-sm font-black text-white outline-none cursor-pointer w-full [color-scheme:dark]"
              />
              {filterDate && (
                <button onClick={() => setFilterDate('')} className="text-white/20 hover:text-rose-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {(filterMonth !== new Date().toISOString().slice(0, 7) || filterDate || selectedPlayerId || searchTerm) && (
              <button 
                onClick={() => {
                  setFilterMonth(new Date().toISOString().slice(0, 7));
                  setFilterDate('');
                  setSelectedPlayerId('');
                  setSearchTerm('');
                }}
                className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-6 border-t border-brand-primary/40">
          <div className="flex gap-2 p-1.5 bg-white/5 rounded-[1.5rem] w-full md:w-fit border border-brand-primary/40">
            <button
              onClick={() => setActiveTab('PLAYERS')}
              className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                activeTab === 'PLAYERS' 
                  ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Por Sócio
            </button>
            <button
              onClick={() => setActiveTab('SESSIONS')}
              className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                activeTab === 'SESSIONS' 
                  ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Por Dia
            </button>
            <button
              onClick={() => setActiveTab('VISUAL')}
              className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                activeTab === 'VISUAL' 
                  ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Análise Visual
            </button>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              placeholder="Buscar sócio..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-brand-primary/40 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-white placeholder:text-white/20 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black text-brand-accent uppercase tracking-widest animate-pulse">Carregando histórico...</p>
        </div>
      ) : activeTab === 'PLAYERS' ? (
        <div className="bg-black rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 border-b border-brand-primary/40">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Sócio</th>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Dias Presente</th>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Dias Total</th>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Frequência (%)</th>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStats.map((stat, idx) => (
                  <tr key={stat.playerId} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center font-black text-white/40 text-xs border border-brand-primary/40">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-black text-white">{stat.playerName}</p>
                          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Sócio Ativo</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-sm font-black text-white">{stat.attendedSessions}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-sm font-bold text-white/40">{stat.totalSessions}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden border border-brand-primary/40">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              stat.percentage >= 75 ? 'bg-emerald-500' : 
                              stat.percentage >= 50 ? 'bg-brand-primary' : 
                              'bg-rose-500'
                            }`}
                            style={{ width: `${stat.percentage}%` }}
                          />
                        </div>
                        <span className={`text-sm font-black font-mono ${
                          stat.percentage >= 75 ? 'text-emerald-500' : 
                          stat.percentage >= 50 ? 'text-brand-primary' : 
                          'text-rose-500'
                        }`}>
                          {stat.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        stat.percentage >= 75 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                        stat.percentage >= 50 ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary' : 
                        'bg-white/5 border-brand-primary/40 text-white/40'
                      }`}>
                        {stat.percentage >= 75 ? 'Assíduo' : stat.percentage >= 50 ? 'Regular' : 'Ocasional'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredStats.length === 0 && (
            <div className="p-20 text-center">
              <Users className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      ) : activeTab === 'VISUAL' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          {/* Main Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Win Rate & Attendance Chart */}
            <div className="bg-black p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Top 10 Performance</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Taxa de Vitória vs Assiduidade</p>
                </div>
                <TrendingUp className="w-6 h-6 text-brand-primary" />
              </div>
              
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={performanceStats.slice(0, 10)} 
                    margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.4)' }}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.4)' }}
                      unit="%"
                    />
                    <Tooltip 
                      content={<CustomTooltip />} 
                      cursor={{ fill: 'rgba(212,175,55,0.05)' }} 
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right" 
                      wrapperStyle={{ paddingBottom: 20, fontSize: 10, fontWeight: 'black', textTransform: 'uppercase' }}
                    />
                    <Bar 
                      name="Vitórias" 
                      dataKey="winRate" 
                      fill="#D4AF37" 
                      radius={[4, 4, 0, 0]} 
                      unit="%" 
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-in-out"
                    />
                    <Bar 
                      name="Presença" 
                      dataKey="attendance" 
                      fill="rgba(255,255,255,0.2)" 
                      radius={[4, 4, 0, 0]} 
                      unit="%" 
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-in-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ELO Trend / Distribution Chart */}
            <div className="bg-black p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Nível Técnico (ELO)</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Distribuição de Rating entre os Atletas</p>
                </div>
                <PieChartIcon className="w-6 h-6 text-brand-primary" />
              </div>
              
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={performanceStats.sort((a, b) => b.elo - a.elo)} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.4)' }}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.4)' }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      name="ELO Rating"
                      dataKey="elo" 
                      stroke="#D4AF37" 
                      strokeWidth={4}
                      dot={{ fill: '#D4AF37', r: 4, strokeWidth: 2, stroke: '#000' }}
                      activeDot={{ r: 8, stroke: '#D4AF37', strokeWidth: 2, fill: '#000' }}
                      isAnimationActive={true}
                      animationDuration={2000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Média Win Rate', value: `${(performanceStats.reduce((acc, curr) => acc + curr.winRate, 0) / (performanceStats.length || 1)).toFixed(1)}%`, icon: TrendingUp },
              { label: 'Média ELO', value: Math.round(performanceStats.reduce((acc, curr) => acc + curr.elo, 0) / (performanceStats.length || 1)), icon: BarChart3 },
              { label: 'Média Presença', value: `${(performanceStats.reduce((acc, curr) => acc + curr.attendance, 0) / (performanceStats.length || 1)).toFixed(1)}%`, icon: Users },
              { label: 'Total Partidas', value: matches.filter(m => !filterMonth || m.date.startsWith(filterMonth)).length, icon: Calendar },
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 p-6 rounded-3xl border border-white/5 shadow-xl">
                <stat.icon className="w-5 h-5 text-brand-primary mb-3" />
                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-xl font-black text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessionSummary.map(session => (
            <div key={session.date} className="bg-black p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl hover:shadow-brand-primary/5 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
                  <Calendar className="w-6 h-6 text-brand-primary" />
                </div>
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-brand-primary/40">
                  {new Date(session.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                </span>
              </div>
              
              <h4 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">
                {new Date(session.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </h4>
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Dia de Jogo</p>
              
              <div className="flex items-center justify-between pt-6 border-t border-brand-primary/40">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-primary" />
                  <span className="text-sm font-black text-white">{session.count} Sócios</span>
                </div>
                <button 
                  onClick={() => {
                    setFilterDate(session.date);
                    setActiveTab('PLAYERS');
                  }}
                  className="text-brand-primary hover:text-brand-primary/80 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all"
                >
                  Ver Detalhes <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {sessionSummary.length === 0 && (
            <div className="col-span-full py-20 text-center bg-black rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl">
              <Calendar className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhum dia registrado neste período</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
