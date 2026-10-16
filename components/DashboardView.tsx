import React, { useMemo } from 'react';
import { getFirestoreDateKey } from '../firebase';
import { useBirthdays } from '../src/hooks/useBirthdays';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
// No active local types from types.ts needed here now
import { 
  Users,
  Activity,
  BarChart3,
  Swords,
  Clock,
  Timer,
  Flame,
  ArrowRight,
  Star
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  BarChart,
  Bar,
  Cell
} from 'recharts';

interface DashboardViewProps {
  players: any[];
  matches: any[];
  attendance: any[];
  rankingPeriod: 'session' | 'career';
  selectedDailyDate: string;
}

export const GlobalStats: React.FC<DashboardViewProps> = ({
  players: allPlayers,
  matches,
  attendance,
  rankingPeriod,
  selectedDailyDate
}) => {
  // Debug log for data arrival
  React.useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile || process.env.NODE_ENV === 'development') {
      console.log('[DASHBOARD DATA DEBUG]', {
        allPlayersReceived: allPlayers?.length || 0,
        hasBirthDates: allPlayers?.filter(p => !!p.birthDate).length || 0,
        matchesCount: matches?.length || 0,
        timestamp: new Date().toISOString()
      });
    }
  }, [allPlayers?.length, matches?.length]);

  // Use allPlayers from props to stay in sync with parent filtering/loading state
  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(allPlayers);
  const [selectedMonth, setSelectedMonth] = React.useState<number>(0);

  // Sync selectedMonth with the recommended month from the hook
  React.useEffect(() => {
    if (monthBirthdays.month && selectedMonth === 0) {
      setSelectedMonth(monthBirthdays.month);
    }
  }, [monthBirthdays.month, selectedMonth]);

  const activeMonthBirthdays = useMemo(() => {
    const m = selectedMonth || monthBirthdays.month;
    return getBirthdaysByMonth(m);
  }, [selectedMonth, monthBirthdays.month, getBirthdaysByMonth]);

  const players = useMemo(() => 
    allPlayers.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM),
    [allPlayers]
  );

  const todaysMatches = useMemo(() => {
    return matches;
  }, [matches]);

  const playersInSession = useMemo(() => {
    return players.filter(player => {
      return todaysMatches.some(m => (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id));
    });
  }, [players, todaysMatches]);

  const activePlayers = useMemo(() => {
    const playerIds = new Set<string>();
    todaysMatches.forEach(m => {
      (m.teamA || []).forEach((id: string) => playerIds.add(id));
      (m.teamB || []).forEach((id: string) => playerIds.add(id));
    });
    return Array.from(playerIds);
  }, [todaysMatches]);

  const activePlayersCount = activePlayers.length;
  const totalMatches = todaysMatches.length;

  const globalWinRate = useMemo(() => {
    // Should this be daily? The request says "os resultados... estao com valores acumulados".
    // I will keep the winRate as career if it's supposed to be historical, 
    // but the user wants "valores do dia". Let me use daily win rate.
    
    // Actually, I will follow the user's request for "valores do dia".
    
    const totalMatchesPlayed = playersInSession.reduce((s, p) => {
        // Need to calculate matches played by this player in TODAY's matches
        return s + todaysMatches.reduce((mCount, m) => mCount + ((m.teamA || []).includes(p.id) || (m.teamB || []).includes(p.id) ? 1 : 0), 0);
    }, 0);
    
    const totalWins = playersInSession.reduce((s, p) => {
        return s + todaysMatches.reduce((wCount, m) => wCount + (
            ((m.teamA || []).includes(p.id) || (m.teamB || []).includes(p.id)) && ((m.winner === 'A' && (m.teamA || []).includes(p.id)) || (m.winner === 'B' && (m.teamB || []).includes(p.id))) ? 1 : 0
        ), 0);
    }, 0);

    return totalMatchesPlayed > 0 ? ((totalWins / totalMatchesPlayed) * 100).toFixed(1) : '0';
  }, [playersInSession, todaysMatches]);

  const totalSessionTime = useMemo(() => {
    if (todaysMatches.length === 0) return '0 min';
    
    // Calculate session span: min(startTime) to max(endTime)
    const sorted = [...todaysMatches].sort((a, b) => {
      const aTime = a.startTime || a.timestamp;
      const bTime = b.startTime || b.timestamp;
      return (aTime || 0) - (bTime || 0);
    });
    
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    const DEFAULT_DUR_MS = 720 * 1000;
    
    const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
    const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
    
    return `${Math.round((endTime - startTime) / (1000 * 60))} min`;
  }, [todaysMatches]);

  const avgMatchDuration = useMemo(() => {
    if (todaysMatches.length === 0) return '0 min';
    const totalSeconds = todaysMatches.reduce((s, m) => s + (m.duration || 720), 0);
    return `${Math.round((totalSeconds / todaysMatches.length) / 60)} min`;
  }, [todaysMatches]);

  const playerRestStats = useMemo(() => {
    if (todaysMatches.length === 0 || players.length === 0) return '0 min';

    // Group matches by date to calculate per-session rest
    const matchesByDate: Record<string, any[]> = {};
    todaysMatches.forEach(m => {
      if (!matchesByDate[m.date]) matchesByDate[m.date] = [];
      matchesByDate[m.date].push(m);
    });

    const sessions = Object.values(matchesByDate);
    let totalAvgRest = 0;
    let sessionsCount = 0;

    sessions.forEach(sessionMatches => {
      const sorted = [...sessionMatches].sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const DEFAULT_DUR_MS = 12 * 60 * 1000; // 12 min default
      const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
      const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
      const totalSessionMinutes = (endTime - startTime) / (1000 * 60);

      const playersInThisSession = players.filter(player => {
        return sessionMatches.some(m => (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id));
      });

      if (playersInThisSession.length > 0) {
        let sessionTotalRest = 0;
        playersInThisSession.forEach(player => {
          const playerTimePlayed = sessionMatches.reduce((acc, m) => {
            const playedInThisMatch = (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id);
            return acc + (playedInThisMatch ? (m.duration || 720) / 60 : 0);
          }, 0);
          sessionTotalRest += Math.max(0, totalSessionMinutes - playerTimePlayed);
        });
        totalAvgRest += sessionTotalRest / playersInThisSession.length;
        sessionsCount++;
      }
    });

    if (sessionsCount === 0) return '0 min';
    return `${Math.round(totalAvgRest / sessionsCount)} min`;
  }, [todaysMatches, players]);

  const totalSumMatchDurations = useMemo(() => {
    if (todaysMatches.length === 0) return 0;
    return todaysMatches.reduce((s, m) => s + (m.duration || 720), 0) / 60; // in minutes
  }, [todaysMatches]);

  const participationPercentage = useMemo(() => {
    if (activePlayersCount === 0 || todaysMatches.length === 0 || totalSumMatchDurations === 0) return '0%';
    
    // Calculation: average time in court / sum of match durations
    const totalPlayerMinutes = players.reduce((acc, p) => acc + (todaysMatches.reduce((mCount, m) => {
      const played = (m.teamA || []).includes(p.id) || (m.teamB || []).includes(p.id);
      return mCount + (played ? (m.duration || 720) / 60 : 0);
    }, 0)), 0);
    
    const avgPlayingTime = totalPlayerMinutes / activePlayersCount;
    // The user said: "tempo total que o jogador esteve em quadra dividido pelo tempo total de jogos no dia"
    const participation = (avgPlayingTime / totalSumMatchDurations) * 100;
    
    return `${Math.min(100, Math.round(participation))}%`;
  }, [todaysMatches, activePlayersCount, players, totalSumMatchDurations]);

  const totalPlayingTimePerPlayer = useMemo(() => {
    if (activePlayersCount === 0 || todaysMatches.length === 0) return '0 min';
    
    const totalPlayerMinutes = todaysMatches.reduce((acc, m) => {
      const pCount = (m.teamA?.length || 0) + (m.teamB?.length || 0);
      return acc + (((m.duration || 720) / 60) * pCount);
    }, 0);
    
    const avgTotal = totalPlayerMinutes / activePlayersCount;
    return `${Math.round(avgTotal)} min`;
  }, [todaysMatches, activePlayersCount]);

  const totalSessionTimeVal = useMemo(() => {
    return avgMatchDuration;
  }, [avgMatchDuration]);

  const playerRestStatsVal = useMemo(() => {
    return playerRestStats;
  }, [playerRestStats]);

  const totalPlayingTimeVal = useMemo(() => {
    return totalPlayingTimePerPlayer;
  }, [totalPlayingTimePerPlayer]);

  // 1. Matches per Day (Activity Trend)
  const activityData = useMemo(() => {
    const dates: Record<string, number> = {};
    matches.sort((a,b) => a.date.localeCompare(b.date)).slice(-30).forEach(m => {
      const d = m.date;
      dates[d] = (dates[d] || 0) + 1;
    });
    return Object.entries(dates)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [matches]);

  // 2. ELO Distribution (Histogram) with names
  const eloDistribution = useMemo(() => {
    const categories: Record<string, { count: number, names: string[] }> = {
      '800-1150': { count: 0, names: [] },
      '1150-1250': { count: 0, names: [] },
      '1250-1350': { count: 0, names: [] },
      '1350-1500': { count: 0, names: [] },
      '1500-1700': { count: 0, names: [] },
      '1700+': { count: 0, names: [] }
    };

    players.forEach(p => {
      const elo = p.elo || 1200;
      let key = '1700+';
      if (elo < 1150) key = '800-1150';
      else if (elo < 1250) key = '1150-1250';
      else if (elo < 1350) key = '1250-1350';
      else if (elo < 1500) key = '1350-1500';
      else if (elo < 1700) key = '1500-1700';
      
      categories[key].count++;
      categories[key].names.push(p.name);
    });

    return Object.entries(categories).map(([range, data]) => ({ 
      range, 
      count: data.count, 
      names: data.names.join(', ') 
    }));
  }, [players]);

  // Custom Tooltip component for ELO
  const CustomEloTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 border border-brand-primary/40 p-4 rounded-xl shadow-2xl max-w-[250px]">
          <p className="text-[10px] font-black text-brand-primary uppercase mb-2 tracking-widest">{payload[0].payload.range}</p>
          <p className="text-[10px] font-bold text-white/80 leading-relaxed">
            {payload[0].payload.names || 'Ninguém nesta faixa'}
          </p>
          <p className="text-[9px] font-black text-white/40 mt-2 uppercase">{payload[0].value} Atletas</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-6">
        {[
          { label: 'Atletas Ativos', val: activePlayersCount, icon: Users },
          { label: 'Partidas', val: totalMatches, icon: Swords },
          { label: 'Tempo Médio das Partidas', val: totalSessionTimeVal, icon: Clock },
          { label: 'Tempo Médio Fora da Quadra', val: playerRestStatsVal, icon: Timer },
          { label: 'Aproveitamento', val: participationPercentage, icon: Timer },
          { label: 'Tempo Médio em Quadra', val: totalPlayingTimeVal, icon: Activity },
        ].map((stat, i) => (
          <div key={i} className="bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-5 sm:p-8 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">{stat.label}</p>
              <stat.icon className="w-5 h-5 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
            </div>
            <h3 className="text-2xl sm:text-4xl font-black text-white tracking-widest leading-none drop-shadow-md">
              {stat.val}
            </h3>
          </div>
        ))}
      </div>

      {/* Main Stats Layout */}
      <div className="grid grid-cols-1 gap-8">
        {/* Monthly Birthdays Celebration Card (Dashboard View) */}
        <div className="bg-brand-secondary/30 backdrop-blur-xl border-2 border-brand-primary/20 rounded-[3rem] p-6 sm:p-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-primary/10 transition-all duration-700"></div>
          
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <Flame className="w-8 h-8 text-amber-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-[0.2em] mb-1">
                  Aniversariantes
                </h3>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em] flex items-center gap-2">
                  <Star className="w-3 h-3 text-amber-500/40" />
                  Celebrando os Guerreiros
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none min-w-[180px]">
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-5 py-3 text-white text-xs font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all appearance-none cursor-pointer hover:bg-black/80"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2024, i))}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary/60">
                  <ArrowRight className="w-4 h-4 rotate-90" />
                </div>
              </div>
              
              <div className="hidden lg:flex items-center gap-2 px-4 py-3 bg-brand-primary/10 rounded-xl border border-brand-primary/20">
                <span className="text-[11px] font-black text-brand-primary uppercase tracking-widest">
                  {activeMonthBirthdays.length} Sócios
                </span>
              </div>
            </div>
          </div>

          {activeMonthBirthdays.length > 0 ? (
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5 sm:gap-6">
              {activeMonthBirthdays.map(player => {
                if (!player || !player.id) return null;
                const bDate = player.birthDate ? new Date(player.birthDate) : null;
                const day = bDate ? bDate.getUTCDate() : '??';
                
                return (
                  <div 
                    key={player.id} 
                    className="group/card relative bg-black/40 border border-white/5 rounded-[2.5rem] p-5 flex flex-col items-center text-center transition-all hover:border-brand-primary/40 hover:bg-brand-primary/[0.03] hover:-translate-y-1 duration-300"
                  >
                    {/* Date Badge */}
                    <div className="absolute -top-3 -right-1 z-10 bg-brand-primary text-black px-3 py-1.5 rounded-xl text-[10px] font-black shadow-xl transform rotate-6 group-hover/card:rotate-0 transition-all duration-500 border-2 border-black">
                      {day} / {String(selectedMonth).padStart(2, '0')}
                    </div>

                    <div className="relative mb-4 group-hover/card:scale-105 transition-transform duration-500">
                      <PlayerAvatar player={player} size="lg" />
                      <div className="absolute -bottom-2 -right-2 bg-black rounded-full p-1.5 shadow-2xl border border-white/10 group-hover/card:rotate-12 transition-transform duration-500">
                        <div className="w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center text-[11px] text-black">
                          🎂
                        </div>
                      </div>
                    </div>

                    <h4 className="text-[11px] font-black text-white uppercase tracking-wider line-clamp-1 w-full mb-1">
                      {player.name.split(' ')[0]}
                    </h4>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                      Guerreiro
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="relative z-10 py-12 flex flex-col items-center justify-center gap-4 bg-black/20 rounded-[2rem] border border-dashed border-white/5">
              <Star className="w-10 h-10 text-white/10" />
              <p className="text-xs font-black text-white/20 uppercase tracking-[0.3em]">Nenhum aniversariante neste mês</p>
            </div>
          )}
        </div>

        {/* ELO Distribution */}
        <div className="bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          <div className="flex items-center gap-3 mb-8">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <h4 className="text-sm font-black text-white uppercase tracking-widest">Distribuição de Ouro (ELO)</h4>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eloDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="range" stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} />
                <Tooltip 
                  content={<CustomEloTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="count" fill="#F5C429" radius={[8, 8, 0, 0]}>
                  {eloDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index > 3 ? '#F5C429' : 'rgba(245,196,41,0.4)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
