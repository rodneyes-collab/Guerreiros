import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { translateGender, capitalizeName } from '../utils/helpers';
import { getPlayerTier } from '../utils/tierUtils';
import { 
  Trash2, 
  UserPlus, 
  Edit2,
  RotateCcw,
  Cake,
  Zap,
  Star,
  Shield,
  UserCheck,
  UserX,
  Target,
  Search,
  TrendingDown,
  TrendingUp,
  Minus,
  Trophy
} from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { calculateTrueSkillUpdate } from '../src/utils/trueSkill';
import { getFirestoreDateKey } from '../firebase';

interface MembersViewProps {
  clearAllPlayers: () => void;
  deletePlayer: (id: string) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  refreshPlayers: () => Promise<void>;
  repairDatabase?: () => void;
  savePlayer: (player: any) => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  clearAllPlayers,
  deletePlayer,
  setEditingPlayer,
  setIsFormOpen,
  refreshPlayers,
  repairDatabase,
  savePlayer
}) => {
  const { players, userRole, isSyncing, showConfirmModal, matches } = useStore();
  
  const traditionalEloRankings = React.useMemo(() => {
    if (!matches || matches.length === 0 || !players) return {};

    const availableDates = Array.from(new Set(matches.map(m => m.date))).sort((a, b) => b.localeCompare(a));
    if (availableDates.length === 0) return {};

    const today = getFirestoreDateKey();
    let currentRefDate = today;
    let prevRefDate: string | null = null;

    const latestSessionInHistory = availableDates[0];
    if (latestSessionInHistory === today) {
      prevRefDate = availableDates[1] || null;
    } else {
      prevRefDate = latestSessionInHistory;
    }

    if (!prevRefDate) return {};

    const getEloAtDate = (player: any, date: string, isNow: boolean = false) => {
      if (isNow) return player.elo || 1200;
      
      const entry = player.eloHistory?.find((h: any) => h.date === date);
      if (entry) return entry.elo;
      
      const historyBefore = (player.eloHistory || [])
        .filter((h: any) => h.date < date)
        .sort((a: any, b: any) => b.date.localeCompare(a.date));
      return historyBefore.length > 0 ? historyBefore[0].elo : 1200;
    };

    const currentRankings = [...players]
      .map(p => ({ id: p.id, elo: getEloAtDate(p, currentRefDate, true) }))
      .sort((a, b) => b.elo - a.elo);

    const prevRankings = [...players]
      .map(p => ({ id: p.id, elo: getEloAtDate(p, prevRefDate!) }))
      .sort((a, b) => b.elo - a.elo);

    const result: Record<string, { rank: number; diff: number; type: 'up' | 'down' | 'neutral' }> = {};

    currentRankings.forEach((p, currentIdx) => {
      const prevIdx = prevRankings.findIndex(prevP => prevP.id === p.id);
      let diff = 0;
      let type: 'up' | 'down' | 'neutral' = 'neutral';

      if (prevIdx !== -1) {
        diff = prevIdx - currentIdx; 
        type = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
      }
      
      result[p.id] = {
        rank: currentIdx + 1,
        diff: Math.abs(diff),
        type
      };
    });

    return result;
  }, [matches, players]);

  const trueSkillRankings = React.useMemo(() => {
    if (!matches || matches.length === 0 || !players) return {};

    const tsMap = new Map<string, { mu: number, sigma: number }>();
    let prevTsMap = new Map<string, { mu: number, sigma: number }>();

    const sortedMatches = [...matches].sort((a, b) => a.timestamp - b.timestamp);
    
    const availableDates = Array.from(new Set(sortedMatches.map(m => m.date))).sort((a, b) => b.localeCompare(a));
    const currentRefDate = availableDates[0];

    sortedMatches.forEach(m => {
      if (!m.teamA || !m.teamB || !m.winner) return;
      
      const teamAWithTS = m.teamA.map(pid => ({ id: pid, trueSkill: tsMap.get(pid) }));
      const teamBWithTS = m.teamB.map(pid => ({ id: pid, trueSkill: tsMap.get(pid) }));

      const updates = calculateTrueSkillUpdate(teamAWithTS as any, teamBWithTS as any, m.winner);
      updates.forEach(u => tsMap.set(u.playerId, u.newTrueSkill));

      if (m.date !== currentRefDate) {
        prevTsMap = new Map(tsMap);
      }
    });

    const getScore = (ts?: { mu: number, sigma: number }) => ts ? ts.mu - 3 * ts.sigma : 0;

    const currentList = players.map(p => ({
      id: p.id,
      score: getScore(tsMap.get(p.id))
    })).sort((a, b) => b.score - a.score);

    const prevList = players.map(p => ({
      id: p.id,
      score: getScore(prevTsMap.get(p.id) || tsMap.get(p.id))
    })).sort((a, b) => b.score - a.score);

    const result: Record<string, { score: number, rank: number, diff: number, type: 'up' | 'down' | 'neutral' }> = {};
    
    currentList.forEach((p, idx) => {
      const prevIdx = prevList.findIndex(pr => pr.id === p.id);
      const diff = prevIdx !== -1 ? (prevIdx - idx) : 0;
      
      result[p.id] = {
        score: p.score,
        rank: idx + 1,
        diff: Math.abs(diff),
        type: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
      };
    });

    return result;
  }, [matches, players]);

  const [searchTerm, setSearchTerm] = React.useState('');
  const [startY, setStartY] = React.useState(0);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isPulling, setIsPulling] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof Player; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });

  const handleSort = (key: keyof Player) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const isBirthdayMonth = (birthDate?: string) => {
    if (!birthDate) return false;
    const parts = birthDate.split('-');
    if (parts.length < 2) return false;
    const birthMonth = parts[1];
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    return birthMonth === currentMonth;
  };

  const formatBirthday = (birthDate?: string) => {
    if (!birthDate) return '-';
    const parts = birthDate.split('-');
    if (parts.length < 3) return birthDate;
    return `${parts[2]}/${parts[1]}`;
  };

  const { setViewMode } = useStore();

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-3 h-3 text-white/40" />;
    }
  };

  const activePlayers = React.useMemo(() => {
    return players.filter(p => (p.status === 'active' || !p.status || p.status === '') && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [players, searchTerm]);

  const waitlistPlayers = React.useMemo(() => {
    return players.filter(p => p.status === 'waitlist' && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [players, searchTerm]);

  const inactivePlayers = React.useMemo(() => {
    return players.filter(p => (p.status === 'inactive' || !!p.isDM) && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [players, searchTerm]);

  const sortedList = (list: Player[]) => {
    return [...list].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      if (aValue === bValue) return 0;
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;
      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  };

  const renderTable = (list: Player[], title: string, subtitle: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-6 ${color} rounded-full`}></div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">{title}</h3>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className={`bg-brand-secondary/30 backdrop-blur-xl rounded-[1.5rem] border border-white/5 border-l-[4px] ${color.replace('bg-', 'border-')} shadow-xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-black/40 border-b border-white/5">
              <tr>
                <th onClick={() => handleSort('name')} className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex items-center gap-2">
                    Sócio {sortConfig.key === 'name' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                {userRole === 'ADMIN' && <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest">Email</th>}
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nascimento</th>
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Performance</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Gênero</th>
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nível</th>
                {userRole === 'ADMIN' && <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Habilidades</th>}
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Posição</th>
                <th onClick={() => handleSort('elo')} className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      ELO {sortConfig.key === 'elo' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                    <span className="text-[7px] text-white/40">(Posição / Pts)</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex flex-col items-center">
                    <span>Eficiência</span>
                    <span className="text-[7px] text-white/40">(Posição / Pts)</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                {userRole === 'ADMIN' && <th className="px-3 py-3 text-[9px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {sortedList(list).map(player => (
                <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {userRole === 'ADMIN' && <div className="shrink-0">{getImpactIcon(player.impactLevel)}</div>}
                        <div className={`font-bold text-xs truncate ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                          {capitalizeName(player.name) || "Sócio sem nome"}
                          {player.isDM && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-rose-500 text-white">DM</span>}
                          <span className="ml-2">
                             <EvasionIcon 
                                level={player.evasionLevel || calculateEvasionLevel(player)} 
                                customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                             />
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  {userRole === 'ADMIN' && <td className="px-3 py-2 text-[9px] font-bold text-white/50">{player.email || '-'}</td>}
                  <td className="px-3 py-2 text-center text-[10px]">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-white/60">{formatBirthday(player.birthDate)}</span>
                      {isBirthdayMonth(player.birthDate) && (
                        <Cake className="w-3.5 h-3.5 text-brand-primary animate-[pulse_1s_infinite]" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-primary text-black text-[8px] font-black" title="Vitórias">
                          <TrendingUp className="w-3 h-3" />
                          {player.wins || 0}
                        </span>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black" title="Derrotas">
                          <TrendingDown className="w-3 h-3" />
                          {player.losses || 0}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] text-white/60">{translateGender(player.gender)}</td>
                  <td className="px-3 py-2 text-center flex flex-col items-center gap-0.5">
                    <span className={`text-[9px] font-black uppercase tracking-tight ${getPlayerTier(player).color}`}>
                      {getPlayerTier(player).label}
                    </span>
                  </td>
                  {userRole === 'ADMIN' && (
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <span className="text-[8px] font-black px-1 rounded bg-white/5 text-white/40" title="Levantamento">L:{player.skills?.setting || 1}</span>
                        <span className="text-[8px] font-black px-1 rounded bg-white/5 text-white/40" title="Ataque">A:{player.skills?.attacking || 1}</span>
                        <span className="text-[8px] font-black px-1 rounded bg-white/5 text-white/40" title="Defesa">D:{player.skills?.defense || 1}</span>
                        <span className="text-[8px] font-black px-1 rounded bg-white/5 text-white/40" title="Saque">S:{player.skills?.serving || 1}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {player.isOfficialSetter ? <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-brand-primary/20 text-brand-primary border border-brand-primary/40">Levantador</span> : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const tr = traditionalEloRankings[player.id];
                      if (!tr) return <span className="font-black text-white text-xs">{Math.round(player.elo)}</span>;
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-white">#{tr.rank}</span>
                            {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{tr.diff}</span></div>}
                            {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{tr.diff}</span></div>}
                            {tr.type === 'neutral' && <Minus className="w-3 h-3 text-white/40" />}
                          </div>
                          <span className="text-[8px] font-black text-white/40">{Math.round(player.elo)} pts</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const ts = trueSkillRankings[player.id];
                      if (!ts) return <span className="text-white/20">-</span>;
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-white">#{ts.rank}</span>
                            {ts.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{ts.diff}</span></div>}
                            {ts.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{ts.diff}</span></div>}
                            {ts.type === 'neutral' && <Minus className="w-3 h-3 text-white/40" />}
                          </div>
                          <span className="text-[8px] font-black text-white/40">{Math.round(ts.score)} pts</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      player.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : player.status === 'inactive' ? 'Inativo' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setViewMode('dashboard')}
                      className="p-2 text-white/40 hover:text-brand-primary transition-all"
                      title="Ver no Ranking"
                    >
                      <Target className="w-4 h-4" />
                    </button>
                    {userRole === 'ADMIN' ? (
                      <>
                        <button 
                          onClick={() => {
                            const newStatus = player.status === 'active' ? 'inactive' : 'active';
                            savePlayer({ ...player, status: newStatus });
                          }}
                          className={`p-2 rounded-xl transition-all ${player.status === 'inactive' ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-amber-500 hover:bg-amber-500/10'}`}
                        >
                          {player.status === 'inactive' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="p-2 text-white/40 hover:text-brand-primary"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deletePlayer(player.id)} className="p-2 text-white/40 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      </>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCards = (list: Player[], title: string, subtitle: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-2">
        <div className={`w-1 h-6 ${color} rounded-full`}></div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">{title}</h3>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {list.map(player => (
          <div key={player.id} className={`bg-brand-secondary/30 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 border-l-[6px] ${color.replace('bg-', 'border-l-')} shadow-xl space-y-4 relative overflow-hidden group`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                <div className="w-12 h-12 rounded-full bg-brand-secondary flex items-center justify-center text-brand-primary font-black text-lg border-2 border-brand-primary/40 shrink-0">
                  {player.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-base font-bold tracking-tight truncate ${player.status === 'inactive' ? 'text-white/40' : 'text-white'}`}>
                      {capitalizeName(player.name)} {player.isDM && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white font-sans">DM</span>}
                      <span className="ml-2">
                        <EvasionIcon 
                          level={player.evasionLevel || calculateEvasionLevel(player)} 
                          customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                        />
                      </span>
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      'bg-white/5 text-white/60 border-white/10'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : translateGender(player.gender)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10 flex items-center gap-1">
                      <Cake className={`w-4 h-4 ${isBirthdayMonth(player.birthDate) ? 'text-brand-primary animate-pulse' : 'text-white/40'}`} />
                      {formatBirthday(player.birthDate)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 ${getPlayerTier(player).color} border border-white/10`}>
                      {getPlayerTier(player).label}
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="px-1.5 py-0.5 rounded bg-brand-primary text-black text-[8px] font-black">{player.wins || 0}V</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black">{player.losses || 0}D</span>
                      <button 
                        onClick={() => setViewMode('dashboard')}
                        className="ml-2 p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg"
                      >
                        <Target className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="flex gap-2 mt-3">
                      <div className="flex-1 bg-white/5 p-2 rounded-xl border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase mb-1">Habilidades</p>
                        <div className="flex justify-between gap-1">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-brand-primary uppercase">Lev</span>
                            <span className="text-[10px] font-black text-white">{player.skills?.setting || 1}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-brand-primary uppercase">Atq</span>
                            <span className="text-[10px] font-black text-white">{player.skills?.attacking || 1}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-brand-primary uppercase">Def</span>
                            <span className="text-[10px] font-black text-white">{player.skills?.defense || 1}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-brand-primary uppercase">Saq</span>
                            <span className="text-[10px] font-black text-white">{player.skills?.serving || 1}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const tr = traditionalEloRankings[player.id];
                  if (!tr) return (
                    <>
                      <p className="text-2xl font-black text-brand-primary tracking-tighter leading-none">{Math.round(player.elo)}</p>
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">ELO</p>
                    </>
                  );
                  return (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white">#{tr.rank}</span>
                        {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-emerald-500" /></div>}
                        {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-rose-500" /></div>}
                        {tr.type === 'neutral' && <Minus className="w-3 h-3 text-white/40" />}
                      </div>
                      <span className="text-[10px] font-black text-brand-primary">{Math.round(player.elo)} pts</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            {userRole === 'ADMIN' && (
              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="flex-1 py-3 bg-white/5 text-white/60 rounded-2xl font-black text-[9px] uppercase hover:bg-brand-primary/10 transition-all flex items-center justify-center gap-2">
                  <Edit2 className="w-3 h-3" /> Editar
                </button>
                <button onClick={() => deletePlayer(player.id)} className="flex-1 py-3 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[9px] uppercase hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2">
                  <Trash2 className="w-3 h-3" /> Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].pageY;
    const distance = currentY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10) {
        if (e.cancelable) e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    if (pullDistance > 60) {
      if (navigator.vibrate) navigator.vibrate(10);
      await refreshPlayers();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  return (
    <div 
      className="relative space-y-8 animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ 
          transform: `translateY(${pullDistance - 40}px)`,
          opacity: pullDistance / 60,
          transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div className="bg-brand-secondary/30 backdrop-blur-xl p-2 rounded-full shadow-lg border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestão de Sócios</h2>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
            {activePlayers.length} sócios ativos {userRole !== 'ADMIN' && '(Visualização de Sócio)'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Buscar sócio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-brand-secondary/30 text-white placeholder:text-white/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-bold focus:outline-none focus:border-brand-primary transition-all"
            />
          </div>
          {userRole === 'ADMIN' && repairDatabase && (
            <button 
              onClick={repairDatabase} 
              className="md:flex-none bg-white/5 text-white px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-brand-primary/40 shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reparar
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }} className="md:flex-none bg-brand-primary text-brand-secondary px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-105 shadow-xl shadow-brand-primary/20 transition-all"><UserPlus className="w-4 h-4" />Novo Sócio</button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block space-y-12">
        {renderTable(activePlayers, "Sócios Ativos", `${activePlayers.length} / 30 sócios`, "bg-brand-primary")}
        
        {userRole === 'ADMIN' && waitlistPlayers.length > 0 && (
          renderTable(waitlistPlayers, "Fila de Espera (Visão Admin)", `${waitlistPlayers.length} aguardando`, "bg-amber-500")
        )}

        {userRole === 'ADMIN' && inactivePlayers.length > 0 && (
          renderTable(inactivePlayers, "Sócios Inativos (Visão Admin)", `${inactivePlayers.length} no departamento médico ou desligados`, "bg-white/40")
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-12">
        {renderCards(activePlayers, "Sócios Ativos", `${activePlayers.length} / 30`, "bg-brand-primary")}
        
        {userRole === 'ADMIN' && waitlistPlayers.length > 0 && (
          renderCards(waitlistPlayers, "Fila de Espera (Visão Admin)", `${waitlistPlayers.length} aguardando`, "bg-amber-500")
        )}

        {userRole === 'ADMIN' && inactivePlayers.length > 0 && (
          renderCards(inactivePlayers, "Sócios Inativos (Visão Admin)", `${inactivePlayers.length} inativos`, "bg-white/40")
        )}
      </div>
    </div>
  );
};
