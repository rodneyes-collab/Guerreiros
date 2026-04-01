import React, { useState } from 'react';
import { useStore } from '../store';
import { Match, Player } from '../types';
import { formatTime } from '../utils/helpers';
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
  Trash2
} from 'lucide-react';

interface HistoryViewProps {
  onDeleteMatch?: (matchId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onDeleteMatch }) => {
  const { matches, players, userRole } = useStore();
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
        const d = new Date(m.timestamp);
        const matchDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-black uppercase text-[10px] tracking-widest"
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

        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-10">
              <Trophy className="w-32 h-32" />
            </div>
            
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/30">
                    <History className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Detalhes da Partida</h2>
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <Calendar className="w-3.5 h-3.5" /> {new Date(selectedMatch.timestamp).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" /> {formatHour(selectedMatch.startTime)} - {formatHour(selectedMatch.endTime)} ({formatTime(selectedMatch.duration)})
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <Hash className="w-3.5 h-3.5" /> {selectedMatch.mode}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Time A</p>
                  {selectedMatch.mode !== 'QUICK' ? (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-5xl font-black tracking-tighter">{selectedMatch.scoreA}</p>
                      {selectedMatch.winner === 'A' && <Trophy className="w-12 h-12 text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] fill-yellow-500" />}
                    </div>
                  ) : (
                    <div className="h-[3.75rem] flex items-center justify-center">
                      {selectedMatch.winner === 'A' && <Trophy className="w-20 h-20 text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] fill-yellow-500" />}
                    </div>
                  )}
                </div>
                <div className="text-2xl font-black text-slate-700">VS</div>
                <div className="text-center">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Time B</p>
                  {selectedMatch.winner === 'B' ? (
                    <div className="h-[3.75rem] flex items-center justify-center">
                      <Trophy className="w-20 h-20 text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] fill-yellow-500" />
                    </div>
                  ) : (
                    selectedMatch.mode !== 'QUICK' && (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-5xl font-black tracking-tighter">{selectedMatch.scoreB}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Time A */}
            <div className={`rounded-[2rem] border-2 p-6 ${selectedMatch.winner === 'A' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50/30 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-xl">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Time A</h3>
                </div>
                {selectedMatch.winner === 'A' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamA || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-indigo-500" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-600' : 'text-slate-700'}`}>{getPlayerName(id)}</span>
                    </div>
                    {idx === 0 && <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Time B */}
            <div className={`rounded-[2rem] border-2 p-6 ${selectedMatch.winner === 'B' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50/30 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-100 rounded-xl">
                    <Users className="w-5 h-5 text-rose-600" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Time B</h3>
                </div>
                {selectedMatch.winner === 'B' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamB || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-rose-500" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-600' : 'text-slate-700'}`}>{getPlayerName(id)}</span>
                    </div>
                    {idx === 0 && <span className="text-[8px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
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
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <History className="w-8 h-8 text-indigo-600" /> Histórico de Partidas
          </h2>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Busca rápida..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
              />
            </div>
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`p-3 rounded-2xl border transition-all ${isFilterExpanded ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-200 animate-in slide-in-from-top duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Filtrar por Jogador</label>
              <select 
                value={filterPlayerId}
                onChange={(e) => setFilterPlayerId(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todos os Jogadores</option>
                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Filtrar por Data</label>
              <input 
                type="date" 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Número da Partida (#)</label>
              <input 
                type="text" 
                placeholder="Ex: 001"
                value={filterMatchId}
                onChange={(e) => setFilterMatchId(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
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
              className="group bg-white p-6 rounded-[2rem] border border-slate-200 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-50/50 transition-all text-left flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                  <span className="text-[10px] font-black text-slate-400 uppercase group-hover:text-indigo-400">Partida</span>
                  <span className="text-lg font-black text-slate-700 group-hover:text-indigo-600">
                    #{match.dailyNumber || match.id.split('_')[1]?.slice(-3).toUpperCase() || '---'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(match.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'A' ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {match.winner === 'A' && <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'A' ? 'text-emerald-700' : 'text-slate-400'}`}>Time A</span>
                      {match.mode !== 'QUICK' && (
                        <span className={`text-lg font-black ${match.winner === 'A' ? 'text-emerald-700' : 'text-slate-400'}`}>{match.scoreA}</span>
                      )}
                    </div>
                    <div className="text-xs font-black text-slate-200 italic">VS</div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'B' ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {match.mode !== 'QUICK' && (
                        <span className={`text-lg font-black ${match.winner === 'B' ? 'text-emerald-700' : 'text-slate-400'}`}>{match.scoreB}</span>
                      )}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'B' ? 'text-emerald-700' : 'text-slate-400'}`}>Time B</span>
                      {match.winner === 'B' && <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {formatHour(match.startTime)} - {formatHour(match.endTime)} ({formatTime(match.duration)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{(match.teamA || []).length + (match.teamB || []).length} Atletas</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[3rem] border-4 border-dashed border-slate-100">
            <div className="bg-slate-50 p-6 rounded-full">
              <History className="w-12 h-12 text-slate-200" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-slate-800 uppercase tracking-tight">Nenhuma partida encontrada</p>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">O histórico aparecerá assim que as partidas forem finalizadas.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
