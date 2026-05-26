
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
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AttendanceReportView: React.FC<{ setViewMode?: (mode: any) => void }> = ({ setViewMode }) => {
  const { players: allPlayers, userRole, showConfirmModal, showNotification } = useStore();
  const players = useMemo(() => allPlayers.filter(p => (p.status === 'active' || !p.status || p.status === '') && !p.isDM), [allPlayers]);
  const [history, setHistory] = useState<Record<string, Player[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getFirestoreDateKey().slice(0, 7));
  const [filterDate, setFilterDate] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'PLAYERS' | 'SESSIONS'>('PLAYERS');
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

  const stats = useMemo(() => {
    // If filterDate is set, we only show stats for that specific day
    let filteredHistory = filterDate && history[filterDate] 
      ? { [filterDate]: history[filterDate] } 
      : history;
    
    // If selectedPlayerId is set, we only care about that player's presence
    const baseStats = calculateAttendanceStats(filteredHistory, players);
    
    if (selectedPlayerId) {
      return baseStats.filter(s => s.playerId === selectedPlayerId);
    }
    
    return baseStats;
  }, [history, players, filterDate, selectedPlayerId]);

  const filteredStats = useMemo(() => {
    return stats.filter(s => s.playerName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [stats, searchTerm]);

  const sessionSummary = useMemo(() => {
    return Object.entries(history)
      .map(([date, dayPlayers]) => ({
        date,
        count: dayPlayers.length,
        hasSelectedPlayer: selectedPlayerId ? dayPlayers.some(p => p.id === selectedPlayerId) : true,
        percentage: dayPlayers.length > 0 ? (dayPlayers.length / (dayPlayers.length + 12)) * 100 : 0 // Mock total for context
      }))
      .filter(s => s.hasSelectedPlayer)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [history, selectedPlayerId]);

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
              Por Sessão
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
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Presenças</th>
                  <th className="px-8 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Total Sessões</th>
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
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Sessão de Jogo</p>
              
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
              <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhuma sessão registrada neste período</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
