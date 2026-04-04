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
            className="flex items-center gap-2 text-brand-accent hover:text-brand-primary transition-colors font-black uppercase text-[10px] tracking-widest"
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

        <div className="bg-white rounded-[2.5rem] border border-brand-accent/20 shadow-xl overflow-hidden">
          <div className="bg-brand-secondary p-8 text-white relative overflow-hidden">
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
                  <div className="flex items-center gap-2 text-brand-accent text-[10px] font-black uppercase tracking-widest">
                    <Calendar className="w-3.5 h-3.5" /> {new Date(selectedMatch.timestamp).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-brand-accent text-[10px] font-black uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" /> {formatHour(selectedMatch.startTime)} - {formatHour(selectedMatch.endTime)} ({formatTime(selectedMatch.duration)})
                  </div>
                  <div className="flex items-center gap-2 text-brand-accent text-[10px] font-black uppercase tracking-widest">
                    <Hash className="w-3.5 h-3.5" /> {selectedMatch.mode}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Time A</p>
                  {selectedMatch.mode !== 'QUICK' ? (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-5xl font-black tracking-tighter">{selectedMatch.scoreA}</p>
                      {selectedMatch.winner === 'A' && <Trophy className="w-12 h-12 text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.4)] fill-brand-primary" />}
                    </div>
                  ) : (
                    <div className="h-[3.75rem] flex items-center justify-center">
                      {selectedMatch.winner === 'A' && <Trophy className="w-20 h-20 text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.4)] fill-brand-primary" />}
                    </div>
                  )}
                </div>
                <div className="text-2xl font-black text-brand-accent">VS</div>
                <div className="text-center">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Time B</p>
                  {selectedMatch.winner === 'B' ? (
                    <div className="h-[3.75rem] flex items-center justify-center">
                      <Trophy className="w-20 h-20 text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.4)] fill-brand-primary" />
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
            <div className={`rounded-[2rem] border-2 p-6 ${selectedMatch.winner === 'A' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-brand-light/30 border-brand-light'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-light rounded-xl">
                    <Users className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Time A</h3>
                </div>
                {selectedMatch.winner === 'A' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamA || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-light shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-black text-brand-accent">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-brand-primary" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-600' : 'text-brand-secondary'}`}>{getPlayerName(id)}</span>
                    </div>
                    {idx === 0 && <span className="text-[8px] font-black text-brand-primary bg-brand-light px-2 py-0.5 rounded uppercase tracking-widest">Levantador</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Time B */}
            <div className={`rounded-[2rem] border-2 p-6 ${selectedMatch.winner === 'B' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-brand-light/30 border-brand-light'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-100 rounded-xl">
                    <Users className="w-5 h-5 text-rose-600" />
                  </div>
                  <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Time B</h3>
                </div>
                {selectedMatch.winner === 'B' && (
                  <div className="bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Vencedor
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(selectedMatch.teamB || []).map((id, idx) => (
                  <div key={id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-brand-light shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-black text-brand-accent">
                        {idx === 0 ? <ShieldCheck className="w-4 h-4 text-rose-500" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-tight ${players.find(p => p.id === id)?.isOfficialSetter ? 'text-rose-600' : 'text-brand-secondary'}`}>{getPlayerName(id)}</span>
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
          <h2 className="text-2xl font-black text-brand-secondary uppercase tracking-tighter flex items-center gap-3">
            <History className="w-8 h-8 text-brand-primary" /> Histórico de Partidas
          </h2>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-accent" />
              <input 
                type="text" 
                placeholder="Busca rápida..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-brand-accent/20 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-primary outline-none transition-all shadow-sm"
              />
            </div>
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`p-3 rounded-2xl border transition-all ${isFilterExpanded ? 'bg-brand-primary border-brand-primary text-brand-secondary' : 'bg-white border-brand-accent/20 text-brand-accent hover:bg-brand-light'}`}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-brand-light rounded-[2rem] border border-brand-accent/20 animate-in slide-in-from-top duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest px-1">Filtrar por Jogador</label>
              <select 
                value={filterPlayerId}
                onChange={(e) => setFilterPlayerId(e.target.value)}
                className="w-full p-3 bg-white border border-brand-accent/20 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Todos os Jogadores</option>
                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest px-1">Filtrar por Data</label>
              <input 
                type="date" 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full p-3 bg-white border border-brand-accent/20 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest px-1">Número da Partida (#)</label>
              <input 
                type="text" 
                placeholder="Ex: 001"
                value={filterMatchId}
                onChange={(e) => setFilterMatchId(e.target.value)}
                className="w-full p-3 bg-white border border-brand-accent/20 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-primary"
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
              className="group bg-white p-6 rounded-[2rem] border border-brand-accent/20 hover:border-brand-primary/50 hover:shadow-xl hover:shadow-brand-primary/5 transition-all text-left flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-2xl bg-brand-light flex flex-col items-center justify-center border border-brand-accent/10 group-hover:bg-brand-primary/10 group-hover:border-brand-primary/20 transition-colors">
                  <span className="text-[10px] font-black text-brand-accent uppercase group-hover:text-brand-primary/60">Partida</span>
                  <span className="text-lg font-black text-brand-secondary group-hover:text-brand-primary">
                    #{match.dailyNumber || match.id.split('_')[1]?.slice(-3).toUpperCase() || '---'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-brand-accent" />
                    <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">{new Date(match.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'A' ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {match.winner === 'A' && <Trophy className="w-5 h-5 text-brand-primary fill-brand-primary" />}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'A' ? 'text-emerald-700' : 'text-brand-accent'}`}>Time A</span>
                      {match.mode !== 'QUICK' && (
                        <span className={`text-lg font-black ${match.winner === 'A' ? 'text-emerald-700' : 'text-brand-accent'}`}>{match.scoreA}</span>
                      )}
                    </div>
                    <div className="text-xs font-black text-brand-accent/20 italic">VS</div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${match.winner === 'B' ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm scale-105' : 'border border-transparent'}`}>
                      {match.mode !== 'QUICK' && (
                        <span className={`text-lg font-black ${match.winner === 'B' ? 'text-emerald-700' : 'text-brand-accent'}`}>{match.scoreB}</span>
                      )}
                      <span className={`text-sm font-black uppercase tracking-tighter ${match.winner === 'B' ? 'text-emerald-700' : 'text-brand-accent'}`}>Time B</span>
                      {match.winner === 'B' && <Trophy className="w-5 h-5 text-brand-primary fill-brand-primary" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-brand-accent" />
                    <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">
                      {formatHour(match.startTime)} - {formatHour(match.endTime)} ({formatTime(match.duration)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-brand-accent" />
                    <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">{(match.teamA || []).length + (match.teamB || []).length} Atletas</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-brand-light flex items-center justify-center group-hover:bg-brand-primary group-hover:text-brand-secondary transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[3rem] border-4 border-dashed border-brand-light">
            <div className="bg-brand-light p-6 rounded-full">
              <History className="w-12 h-12 text-brand-accent/20" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-brand-secondary uppercase tracking-tight">Nenhuma partida encontrada</p>
              <p className="text-[10px] text-brand-accent font-black uppercase tracking-widest">O histórico aparecerá assim que as partidas forem finalizadas.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
