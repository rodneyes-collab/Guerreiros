import React, { useMemo } from 'react';
import { getFirestoreDateKey } from '../firebase';
// No active local types from types.ts needed here now
import { 
  Users,
  Activity,
  BarChart3,
  Swords,
  Clock,
  Timer
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
  const players = useMemo(() => 
    allPlayers.filter(p => (p.status === 'active' || !p.status || p.status === '') && !p.isDM),
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
