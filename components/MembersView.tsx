import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { translateGender, capitalizeName, formatPhoneNumber } from '../utils/helpers';
import { getPlayerTier } from '../utils/tierUtils';
import { Tooltip } from '../src/components/Tooltip';
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
  Trophy,
  AlertTriangle,
  Clock,
  Phone,
  X,
  History
} from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { calculateTrueSkillUpdate } from '../src/utils/trueSkill';
import { calculateCompositePerformanceRating } from '../utils/teamLogic';
import { getFirestoreDateKey } from '../firebase';
import { useIntentions } from '../src/hooks/useIntentions';
import { useBirthdays } from '../src/hooks/useBirthdays';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

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
  const { players, userRole, isSyncing, showConfirmModal, matches, attendance, systemMetadata } = useStore();
  const { intentions } = useIntentions();
  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(players);
  const [selectedMonth, setSelectedMonth] = React.useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));

  const monthBirthdaysList = React.useMemo(() => {
    return getBirthdaysByMonth(parseInt(selectedMonth, 10));
  }, [selectedMonth, getBirthdaysByMonth]);

  React.useEffect(() => {
    if (monthBirthdays.month && !selectedMonth) {
      setSelectedMonth(String(monthBirthdays.month).padStart(2, '0'));
    }
  }, [monthBirthdays.month]);

  const getPlayerHistoryList = React.useCallback((p: Player) => {
    const list: Array<{ time: string; label: string }> = [];
    const seenTimes = new Set<number>();

    const addTime = (rawTime: string | number, label: string) => {
      try {
        const dateObj = new Date(rawTime);
        const timeMs = dateObj.getTime();
        if (isNaN(timeMs)) return;

        // Deduplicate timestamps within 1 minute of each other
        const isDup = Array.from(seenTimes).some(ts => Math.abs(ts - timeMs) < 60000);
        if (!isDup) {
          seenTimes.add(timeMs);
          list.push({ time: dateObj.toISOString(), label });
        }
      } catch (e) {}
    };

    if (p.loginHistory && Array.isArray(p.loginHistory)) {
      p.loginHistory.forEach(h => {
        if (h) addTime(h, 'Acesso');
      });
    }

    if (p.lastLoginAt) {
      addTime(p.lastLoginAt, 'Último Login');
    }

    const intentionTs = intentions?.confirmationTimestamps?.[p.id];
    if (intentionTs) {
      const isGoing = intentions?.responses?.[p.id] === 'GOING';
      const label = isGoing ? 'Confirmou na Lista' : 'Lista de Intenções';
      addTime(intentionTs, label);
    }

    list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return list;
  }, [intentions]);

  React.useEffect(() => {
    fetch('/api/presence/sync-accesses')
      .then(r => r.json())
      .then(res => {
        if (res?.synced > 0) {
          refreshPlayers();
        }
      })
      .catch(console.warn);
  }, [refreshPlayers]);

  const gameDatesForEvasion = React.useMemo(() => {
    if (!matches) return [];
    const dates = Array.from(new Set(matches.map(m => m.date)));
    return dates.sort((a, b) => b.localeCompare(a)); // Newest to oldest
  }, [matches]);

  const evasionMap = React.useMemo(() => {
    const map = new Map<string, number>();
    const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
    if (!players || gameDatesForEvasion.length < limit) return map;

    const today = getFirestoreDateKey();
    const isPresentTodayMap = new Map();
    if (attendance) {
      attendance.forEach(p => {
        if (p.id) isPresentTodayMap.set(p.id, true);
      });
    }

    players.forEach(player => {
      // Track consecutive missed games for active players
      const isActive = (player.status === 'active' || !player.status || player.status === '') && !player.isDM;
      if (!isActive) return;

      let consecutiveMissed = 0;
      for (const date of gameDatesForEvasion) {
        // Did the player play on this date?
        const played = matches.some(m => m.date === date && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
        
        // Did they check in today (if date is today)?
        const present = (date === today && isPresentTodayMap.has(player.id)) || played;

        if (present) {
          break; // Streak broken!
        }
        consecutiveMissed++;
      }
      map.set(player.id, consecutiveMissed);
    });

    return map;
  }, [players, gameDatesForEvasion, matches, attendance, systemMetadata?.consecutiveAbsenceLimit]);
  
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
  const [showBirthdayModal, setShowBirthdayModal] = React.useState(false);
  const [selectedPlayerHistory, setSelectedPlayerHistory] = React.useState<Player | null>(null);

  const generateBirthdayList = () => {
    const activeMembers = players.filter(p => (p.status === 'active' || !p.status || p.status === ''));
    
    const birthdayMembers = activeMembers.filter(p => {
      if (!p.birthDate) return false;
      const parts = p.birthDate.split('-');
      if (parts.length < 2) return false;
      return parts[1] === selectedMonth;
    }).sort((a, b) => {
      const dayA = a.birthDate!.split('-')[2];
      const dayB = b.birthDate!.split('-')[2];
      return parseInt(dayA) - parseInt(dayB);
    });

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const monthName = monthNames[parseInt(selectedMonth) - 1];

    let text = `🎂 *ANIVERSARIANTES DE ${monthName.toUpperCase()}* 🎂\n\n`;
    
    if (birthdayMembers.length === 0) {
      text += "Nenhum aniversariante neste mês.\n";
    } else {
      birthdayMembers.forEach(p => {
        const parts = p.birthDate!.split('-');
        text += `• ${parts[2]}/${parts[1]} - ${capitalizeName(p.name)}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      alert("Lista copiada para a área de transferência!");
      setShowBirthdayModal(false);
    }).catch(err => {
      console.error('Falha ao copiar: ', err);
      alert("Erro ao copiar lista.");
    });
  };

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
    return players.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [players, searchTerm]);

  const waitlistPlayers = React.useMemo(() => {
    return players.filter(p => p.status === 'waitlist' && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [players, searchTerm]);

  const inactivePlayers = React.useMemo(() => {
    return players.filter(p => (p.status === 'inactive' || p.status === 'dm' || !!p.isDM) && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
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
                <th onClick={() => handleSort('name')} className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex items-center gap-1">
                    Sócio {sortConfig.key === 'name' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>Telefone</span>
                  </div>
                </th>
                {userRole === 'ADMIN' && <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest">Email</th>}
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nascimento</th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <Trophy className="w-3 h-3" />
                    <span>Performance</span>
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Gênero</th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nível</th>
                <th onClick={() => handleSort('elo')} className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex items-center justify-center gap-1">
                    ELO / IC {sortConfig.key === 'elo' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  Eficiência
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                {userRole === 'ADMIN' && (
                  <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                    Acessos
                  </th>
                )}
                {userRole === 'ADMIN' && <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {sortedList(list).map(player => (
                <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar player={player} size="sm" />
                      <div className="flex items-center gap-1 min-w-0">
                        {userRole === 'ADMIN' && <div className="shrink-0">{getImpactIcon(player.impactLevel)}</div>}
                        <div className={`font-bold text-xs break-words whitespace-normal ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                          {capitalizeName(player.name) || "Sócio sem nome"}
                          {player.isDM && <span className="ml-1 px-1 py-0.2 rounded-full text-[8px] font-black bg-rose-500 text-white">DM</span>}
                          <span className="ml-1">
                             <EvasionIcon 
                                level={player.evasionLevel || calculateEvasionLevel(player)} 
                                customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                             />
                          </span>
                          {(() => {
                            const missed = evasionMap.get(player.id);
                            const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                            if (missed && missed >= limit) {
                              return (
                                <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[8px] font-black animate-pulse" title={`Alerta: Ausente há ${missed} dias de jogos consecutivos!`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {missed}D
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-[10px] text-white/80 font-mono whitespace-nowrap">
                    {formatPhoneNumber(player.phone)}
                  </td>
                  {userRole === 'ADMIN' && <td className="px-2 py-1.5 text-[9px] font-bold text-white/50">{player.email || '-'}</td>}
                  <td className="px-2 py-1.5 text-center text-[10px]">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-white/60">{formatBirthday(player.birthDate)}</span>
                      {isBirthdayMonth(player.birthDate) && (
                        <Cake className="w-3.5 h-3.5 text-brand-primary animate-[pulse_1s_infinite]" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1">
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-brand-primary text-black text-[8px] font-black" title="Vitórias">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {player.wins || 0}
                        </span>
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-white text-black text-[8px] font-black" title="Derrotas">
                          <TrendingDown className="w-2.5 h-2.5" />
                          {player.losses || 0}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-[10px] text-white/60">{translateGender(player.gender)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-tight ${getPlayerTier(player).color}`}>
                      {getPlayerTier(player).label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(() => {
                      const tr = traditionalEloRankings[player.id];
                      const icValue = calculateCompositePerformanceRating(player);
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            {tr ? (
                              <>
                                <span className="text-[10px] font-black text-white">#{tr.rank}</span>
                                {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{tr.diff}</span></div>}
                                {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-2.5 h-2.5 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{tr.diff}</span></div>}
                                {tr.type === 'neutral' && <Minus className="w-2.5 h-2.5 text-white/40" />}
                              </>
                            ) : (
                              <span className="text-[10px] font-black text-white">#{traditionalEloRankings[player.id]?.rank || '-'}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-black text-white/70 font-mono whitespace-nowrap">{Math.round(player.elo)} pts</span>
                            <span className="px-1.5 py-0.5 rounded bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[9px] font-mono whitespace-nowrap shadow-sm" title="Índice Composto (IC) Soberano">
                              IC {icValue.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(() => {
                      const ts = trueSkillRankings[player.id];
                      if (!ts) return <span className="text-white/20">-</span>;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-white">#{ts.rank}</span>
                            {ts.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{ts.diff}</span></div>}
                            {ts.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-2.5 h-2.5 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{ts.diff}</span></div>}
                            {ts.type === 'neutral' && <Minus className="w-2.5 h-2.5 text-white/40" />}
                          </div>
                          <span className="text-[8px] font-black text-white/40">{Math.round(ts.score)} pts</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      player.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                      player.status === 'guest' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      (player.status === 'dm' || player.isDM) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : 
                       player.status === 'inactive' ? 'Inativo' : 
                       player.status === 'guest' ? 'Convidado' :
                       (player.status === 'dm' || player.isDM) ? 'DM' : 'Ativo'}
                    </span>
                  </td>
                  {userRole === 'ADMIN' && (
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        const historyList = getPlayerHistoryList(player);
                        const totalAccesses = Math.max(player.accesses || 0, historyList.length);
                        const lastAccess = historyList[0];

                        return (
                          <Tooltip content={
                            <div className="space-y-1">
                              <p className="font-black text-[10px] uppercase border-b border-white/10 pb-1 mb-1">Últimos Acessos (Clique para Ver Tudo)</p>
                              {historyList.length > 0 ? (
                                historyList.slice(0, 3).map((item, i) => (
                                  <p key={i} className="text-[9px] font-mono whitespace-nowrap flex items-center justify-between gap-2">
                                    <span>{new Date(item.time).toLocaleDateString('pt-BR')} {new Date(item.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="text-[7px] font-black uppercase text-brand-primary/80 bg-brand-primary/10 px-1 rounded">{item.label}</span>
                                  </p>
                                ))
                              ) : (
                                <p className="text-[9px] text-white/40 italic">Sem histórico</p>
                              )}
                              {historyList.length > 3 && (
                                <p className="text-[8px] text-brand-primary font-black uppercase text-center mt-1">+ Clique para ver mais ({historyList.length})</p>
                              )}
                            </div>
                          }>
                            <button 
                              onClick={() => setSelectedPlayerHistory(player)}
                              className="flex flex-col items-center cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-all group/access"
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-black text-white group-hover/access:text-brand-primary transition-colors">{totalAccesses}</span>
                                <History className="w-2.5 h-2.5 text-white/20 group-hover/access:text-brand-primary" />
                              </div>
                              {lastAccess ? (
                                <span className="text-[8px] text-white/40 font-mono">
                                  {new Date(lastAccess.time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(lastAccess.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-[8px] text-white/20">-</span>
                              )}
                            </button>
                          </Tooltip>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right flex items-center justify-end gap-1">
                    <Tooltip content="Ver no Ranking">
                      <button 
                        onClick={() => setViewMode('dashboard')}
                        className="p-1.5 text-white bg-white/10 hover:bg-brand-primary hover:text-black rounded-lg transition-all"
                      >
                        <Target className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    {userRole === 'ADMIN' ? (
                      <>
                        <Tooltip content={(player.status === 'inactive' || player.status === 'dm' || player.isDM) ? "Ativar Sócio" : "Inativar Sócio"}>
                          <button 
                            onClick={() => {
                              const isCurrentlyInactive = player.status === 'inactive' || player.status === 'dm' || player.isDM;
                              const newStatus = isCurrentlyInactive ? 'active' : 'inactive';
                              savePlayer({ ...player, status: newStatus, isDM: false });
                            }}
                            className={`p-1.5 rounded-lg transition-all ${
                              (player.status === 'inactive' || player.status === 'dm' || player.isDM) 
                                ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white' 
                                : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-white'
                            }`}
                          >
                            {(player.status === 'inactive' || player.status === 'dm' || player.isDM) ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          </button>
                        </Tooltip>
                        <Tooltip content="Editar Sócio">
                          <button 
                            onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} 
                            className="p-1.5 text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-brand-secondary rounded-lg transition-all font-bold border border-brand-primary/20"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Excluir Sócio" position="left">
                          <button 
                            onClick={() => deletePlayer(player.id)} 
                            className="p-1.5 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
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
                <PlayerAvatar player={player} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold tracking-tight break-words whitespace-normal leading-tight ${player.status === 'inactive' ? 'text-white/40' : 'text-white'}`}>
                      {capitalizeName(player.name)} {player.isDM && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white font-sans">DM</span>}
                      <span className="ml-2">
                        <EvasionIcon 
                          level={player.evasionLevel || calculateEvasionLevel(player)} 
                          customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                        />
                      </span>
                      {(() => {
                        const missed = evasionMap.get(player.id);
                        const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                        if (missed && missed >= limit) {
                          return (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[8px] font-black animate-pulse" title={`Alerta: Ausente há ${missed} dias de jogos consecutivos!`}>
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {missed}D AUSENTE
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      player.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                      player.status === 'guest' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      (player.status === 'dm' || player.isDM) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : 
                       player.status === 'inactive' ? 'Inativo' : 
                       player.status === 'guest' ? 'Convidado' :
                       (player.status === 'dm' || player.isDM) ? 'Dep. Médico (DM)' : 'Ativo'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10">
                      {translateGender(player.gender)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-brand-primary" />
                      {formatPhoneNumber(player.phone)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10 flex items-center gap-1">
                      <Cake className={`w-4 h-4 ${isBirthdayMonth(player.birthDate) ? 'text-brand-primary animate-pulse' : 'text-white/40'}`} />
                      {formatBirthday(player.birthDate)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 ${getPlayerTier(player).color} border border-white/10`}>
                      {getPlayerTier(player).label}
                    </span>
                    {userRole === 'ADMIN' && (
                      <button 
                        onClick={() => setSelectedPlayerHistory(player)}
                        className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <Clock className="w-3 h-3" />
                        {player.accesses || 0} Acessos
                        {player.lastLoginAt && (
                          <span className="text-white/40 ml-1 font-mono">
                            ({new Date(player.lastLoginAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </button>
                    )}
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
                </div>
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const tr = traditionalEloRankings[player.id];
                  const icValue = calculateCompositePerformanceRating(player);
                  if (!tr) return (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-2xl font-black text-brand-primary tracking-tighter leading-none">{Math.round(player.elo)}</p>
                        <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[10px] font-mono shadow-sm">
                          IC {icValue.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-0.5">ELO / IC</p>
                    </div>
                  );
                  return (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white">#{tr.rank}</span>
                        {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-emerald-500" /></div>}
                        {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-rose-500" /></div>}
                        {tr.type === 'neutral' && <Minus className="w-3 h-3 text-white/40" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-white/80 font-mono">{Math.round(player.elo)} pts</span>
                        <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[10px] font-mono shadow-sm" title="Índice Composto (IC) Soberano">
                          IC {icValue.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            {userRole === 'ADMIN' && (
              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="flex-1 py-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-2xl font-black text-[9px] uppercase hover:bg-brand-primary hover:text-brand-secondary transition-all flex items-center justify-center gap-2">
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
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-[15px] w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Buscar sócio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-brand-secondary/30 text-white placeholder:text-white/40 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-bold focus:outline-none focus:border-brand-primary transition-all"
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
            <button 
              onClick={() => setShowBirthdayModal(true)} 
              className="md:flex-none bg-brand-primary/10 text-brand-primary px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-primary hover:text-black transition-all border border-brand-primary/20"
            >
              <Cake className="w-4 h-4" />
              Aniversariantes
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }} className="md:flex-none bg-brand-primary text-brand-secondary px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-105 shadow-xl shadow-brand-primary/20 transition-all"><UserPlus className="w-4 h-4" />Novo Sócio</button>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border-2 border-brand-primary/20 rounded-[2.5rem] p-6 sm:p-8 mb-10 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-primary/10 transition-all duration-700"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
              <Cake className="w-7 h-7 text-amber-500 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">Aniversariantes</h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-2">
                <Star className="w-3 h-3 text-amber-500/40" />
                Guerreiros do Mês
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-[160px]">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all appearance-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  return (
                    <option key={m} value={m}>
                      {monthFormatter.format(new Date(2024, i))}
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <RotateCcw className="w-3 h-3 rotate-90" />
              </div>
            </div>
          </div>
        </div>

        {monthBirthdaysList.length > 0 ? (
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {monthBirthdaysList.map(player => (
              <div key={player.id} className="group relative bg-black/40 border border-white/5 rounded-3xl p-4 flex flex-col items-center text-center transition-all hover:border-brand-primary/40 hover:bg-brand-primary/[0.03]">
                <div className="absolute -top-2 -right-1 z-10 bg-brand-primary text-black px-2.5 py-1 rounded-xl text-[9px] font-black shadow-lg">
                  {player.birthDate ? (player.birthDate.split(/[-/]/)[0].length === 4 ? player.birthDate.split(/[-/]/)[2] : player.birthDate.split(/[-/]/)[0]) : '??'} / {selectedMonth}
                </div>
                <div className="relative mb-3">
                  <PlayerAvatar player={player} size="md" />
                  <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-1 shadow-lg border border-white/10">
                    <div className="w-4 h-4 bg-brand-primary rounded-full flex items-center justify-center text-[8px] text-black">🎂</div>
                  </div>
                </div>
                <span className="text-[10px] font-black text-white uppercase truncate w-full group-hover:text-brand-primary transition-colors">{player.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative z-10 py-10 flex flex-col items-center justify-center bg-black/20 rounded-3xl border border-dashed border-white/5">
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Nenhum aniversariante</p>
          </div>
        )}
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

      {/* Birthday Modal */}
      {showBirthdayModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-brand-primary/40 rounded-[2rem] w-full max-w-md p-6 relative">
            <h3 className="text-xl font-black text-white uppercase mb-6 flex items-center gap-2">
              <Cake className="w-6 h-6 text-brand-primary" />
              Aniversariantes
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-white/60 uppercase tracking-widest mb-2">Selecione o Mês</label>
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm focus:border-brand-primary focus:outline-none"
                >
                  <option value="01">Janeiro</option>
                  <option value="02">Fevereiro</option>
                  <option value="03">Março</option>
                  <option value="04">Abril</option>
                  <option value="05">Maio</option>
                  <option value="06">Junho</option>
                  <option value="07">Julho</option>
                  <option value="08">Agosto</option>
                  <option value="09">Setembro</option>
                  <option value="10">Outubro</option>
                  <option value="11">Novembro</option>
                  <option value="12">Dezembro</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowBirthdayModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={generateBirthdayList}
                  className="flex-1 py-3 px-4 rounded-xl bg-brand-primary text-black font-black uppercase hover:opacity-90 transition-all text-sm"
                >
                  Copiar Lista
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login History Modal */}
      {selectedPlayerHistory && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-brand-primary/40 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl shadow-brand-primary/10 animate-in zoom-in-95 duration-200">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center border border-brand-primary/40">
                  <History className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter leading-none">
                    Histórico de Acesso
                  </h3>
                  <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest mt-1">
                    {capitalizeName(selectedPlayerHistory.name)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPlayerHistory(null)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {(() => {
                const historyList = getPlayerHistoryList(selectedPlayerHistory);
                if (historyList.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Clock className="w-12 h-12 text-white/5 mb-4" />
                      <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
                        Nenhum registro encontrado
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {historyList.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-brand-primary/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_5px_rgba(245,196,41,0.5)]" />
                          <div>
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">
                              {new Date(item.time).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </p>
                            <p className="text-[9px] font-mono text-white/40">
                              {new Date(item.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[8px] font-black uppercase tracking-wider">
                            {item.label}
                          </span>
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                              Mais Recente
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="p-6 bg-black/40 border-t border-white/5">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                <span>Total de Acessos</span>
                <span className="text-white text-base font-black">
                  {Math.max(selectedPlayerHistory.accesses || 0, getPlayerHistoryList(selectedPlayerHistory).length)}
                </span>
              </div>
              <button 
                onClick={() => setSelectedPlayerHistory(null)}
                className="w-full mt-4 py-3 bg-brand-primary text-black font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-brand-primary/10 active:scale-95 transition-all"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
