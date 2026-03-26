import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Users, 
  Calendar,
  ChevronRight,
  Medal,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  Swords,
  History
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ReferenceLine,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { WinLossChart } from '../src/components/WinLossChart';

interface RankingViewProps {
  userRole: 'ADMIN' | 'MEMBER';
  refreshPlayers: () => Promise<void>;
  handleAnnounceSummary: () => void;
  isNarratingSummary: boolean;
  resetDailyMatches: () => Promise<void>;
}

export const RankingView: React.FC<RankingViewProps> = ({
  userRole,
  refreshPlayers,
  handleAnnounceSummary,
  isNarratingSummary,
  resetDailyMatches
}) => {
  const { synergy, negativeSynergy, rivalry, players, matches, isSyncing, currentPlayer } = useStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    console.log('RankingView: Players in store:', players?.length);
    console.log('RankingView: Current Player:', currentPlayer?.name);
    console.log('RankingView: User Role:', userRole);
  }, [players, currentPlayer, userRole]);

  // Set default player for members
  useEffect(() => {
    if (userRole === 'MEMBER' && currentPlayer && !selectedPlayerId) {
      console.log('RankingView: Setting default player for member:', currentPlayer.name);
      setSelectedPlayerId(currentPlayer.id);
    }
  }, [userRole, currentPlayer, selectedPlayerId]);
  const [activeTab, setActiveTab] = useState<'daily' | 'individual'>('daily');

  const [comparisonPlayerId, setComparisonPlayerId] = useState<string | null>(null);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<'selected' | 'comparison'>('selected');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

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

  // Default top player
  const topPlayer = useMemo(() => {
    if (!players || players.length === 0) return null;
    return [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0))[0];
  }, [players]);

  const selectedPlayer = useMemo(() => {
    if (!players) return null;
    return players.find(p => p.id === (selectedPlayerId || topPlayer?.id));
  }, [players, selectedPlayerId, topPlayer]);

  const comparisonPlayer = useMemo(() => {
    if (!players) return null;
    return players.find(p => p.id === comparisonPlayerId);
  }, [players, comparisonPlayerId]);

  // Relationship Data for Selected Player
  const playerRelationships = useMemo(() => {
    if (!selectedPlayer) return { synergy: null, negativeSynergy: null, rivalry: null };

    let bestSynergy = { name: 'Nenhum', wins: 0 };
    let worstNegativeSynergy = { name: 'Nenhum', losses: 0 };
    let worstRival = { name: 'Nenhum', losses: 0 };

    // Synergy (Wins together)
    Object.entries(synergy || {}).forEach(([pair, wins]) => {
      const ids = pair.split('_');
      if (ids.includes(selectedPlayer.id)) {
        const otherId = ids.find(id => id !== selectedPlayer.id);
        const otherPlayer = players.find(p => p.id === otherId);
        if (otherPlayer && (wins as number) > bestSynergy.wins) {
          bestSynergy = { name: otherPlayer.name, wins: wins as number };
        }
      }
    });

    // Negative Synergy (Losses together)
    Object.entries(negativeSynergy || {}).forEach(([pair, losses]) => {
      const ids = pair.split('_');
      if (ids.includes(selectedPlayer.id)) {
        const otherId = ids.find(id => id !== selectedPlayer.id);
        const otherPlayer = players.find(p => p.id === otherId);
        if (otherPlayer && (losses as number) > worstNegativeSynergy.losses) {
          worstNegativeSynergy = { name: otherPlayer.name, losses: losses as number };
        }
      }
    });

    // Rivalry (Losses against)
    Object.entries(rivalry || {}).forEach(([pair, losses]) => {
      const [loserId, winnerId] = pair.split('_');
      if (loserId === selectedPlayer.id) {
        const otherPlayer = players.find(p => p.id === winnerId);
        if (otherPlayer && (losses as number) > worstRival.losses) {
          worstRival = { name: otherPlayer.name, losses: losses as number };
        }
      }
    });

    return { 
      synergy: bestSynergy.wins > 0 ? bestSynergy : null, 
      negativeSynergy: worstNegativeSynergy.losses > 0 ? worstNegativeSynergy : null,
      rivalry: worstRival.losses > 0 ? worstRival : null 
    };
  }, [selectedPlayer, synergy, negativeSynergy, rivalry, players]);

  // Comparison Data
  const comparisonData = useMemo(() => {
    if (!selectedPlayer || !players) return [];
    
    const target = comparisonPlayer || {
      name: 'Média Grupo',
      elo: players.reduce((acc, p) => acc + (p.elo || 0), 0) / (players.length || 1),
      winRate: players.reduce((acc, p) => acc + ((p.matchesPlayed || 0) > 0 ? ((p.wins || 0) / p.matchesPlayed) * 100 : 0), 0) / (players.length || 1),
      matchesPlayed: players.reduce((acc, p) => acc + (p.matchesPlayed || 0), 0) / (players.length || 1)
    };

    const selectedWinRate = (selectedPlayer.matchesPlayed || 0) > 0 ? ((selectedPlayer.wins || 0) / selectedPlayer.matchesPlayed) * 100 : 0;
    const targetWinRate = 'winRate' in target ? (target as any).winRate : ((target.matchesPlayed || 0) > 0 ? ((target.wins || 0) / target.matchesPlayed) * 100 : 0);

    return [
      { subject: 'ELO', A: selectedPlayer.elo || 0, B: target.elo || 0 },
      { subject: 'Vitórias %', A: selectedWinRate, B: targetWinRate },
      { subject: 'Partidas', A: selectedPlayer.matchesPlayed || 0, B: target.matchesPlayed || 0 },
    ];
  }, [selectedPlayer, comparisonPlayer, players]);

  // Chart Data: ELO History
  const eloChartData = useMemo(() => {
    if (!selectedPlayer?.eloHistory) return [];
    
    return selectedPlayer.eloHistory.map(h => {
      const dateStr = h.date;
      const dateObj = new Date(dateStr + 'T00:00:00');
      
      // Calculate average ELO of all players at this specific date
      const groupElosAtDate = players.map(p => {
        if (!p.eloHistory || p.eloHistory.length === 0) return p.elo;
        
        // Find the latest history entry <= dateStr
        const historyBefore = p.eloHistory
          .filter(entry => entry.date <= dateStr)
          .sort((a, b) => b.date.localeCompare(a.date));
          
        return historyBefore.length > 0 ? historyBefore[0].elo : 1200; // Default starting ELO
      });
      
      const avgAtDate = Math.round(groupElosAtDate.reduce((a, b) => a + b, 0) / (players.length || 1));

      return {
        date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        fullDate: dateStr,
        elo: h.elo,
        groupAverage: avgAtDate
      };
    });
  }, [selectedPlayer, players]);

  // Chart Data: Radar Skills
  const groupAverages = useMemo(() => {
    if (!players || players.length === 0) return null;
    const maxElo = Math.max(...players.map(p => p.elo || 0), 1);
    const maxMatches = Math.max(...players.map(p => p.matchesPlayed || 0), 1);
    const maxDaily = Math.max(...players.map(p => Math.abs(p.dailyEloGain || 0)), 1);
    
    const avgElo = players.reduce((acc, p) => acc + (p.elo || 0), 0) / players.length;
    const avgWinRate = players.reduce((acc, p) => acc + ((p.matchesPlayed || 0) > 0 ? ((p.wins || 0) / p.matchesPlayed) * 100 : 0), 0) / players.length;
    const avgMatches = players.reduce((acc, p) => acc + (p.matchesPlayed || 0), 0) / players.length;
    const avgDaily = players.reduce((acc, p) => acc + (p.dailyEloGain || 0), 0) / players.length;

    return {
      elo: (avgElo / maxElo) * 100,
      winRate: avgWinRate,
      matches: (avgMatches / maxMatches) * 100,
      daily: (avgDaily / maxDaily) * 100,
      resilience: 65
    };
  }, [players]);

  const radarData = useMemo(() => {
    if (!selectedPlayer || !groupAverages || !players) return [];
    
    const maxElo = Math.max(...players.map(p => p.elo || 0), 1);
    const maxMatches = Math.max(...players.map(p => p.matchesPlayed || 0), 1);
    const maxDaily = Math.max(...players.map(p => Math.abs(p.dailyEloGain || 0)), 1);
    
    const winRate = (selectedPlayer.matchesPlayed || 0) > 0 
      ? ((selectedPlayer.wins || 0) / selectedPlayer.matchesPlayed) * 100 
      : 0;

    // Simulação de Sinergia (poderia ser real se tivéssemos os dados aqui)
    const synergyScore = 70 + ((selectedPlayer.elo || 0) % 25); 

    return [
      { subject: 'Poder', A: ((selectedPlayer.elo || 0) / maxElo) * 100, B: groupAverages.elo, fullMark: 100 },
      { subject: 'Vitórias', A: winRate, B: groupAverages.winRate, fullMark: 100 },
      { subject: 'Volume', A: ((selectedPlayer.matchesPlayed || 0) / maxMatches) * 100, B: groupAverages.matches, fullMark: 100 },
      { subject: 'Momento', A: maxDaily > 0 ? (((selectedPlayer.dailyEloGain || 0) / maxDaily) * 50 + 50) : 50, B: groupAverages.daily, fullMark: 100 },
      { subject: 'Sinergia', A: synergyScore, B: groupAverages.resilience, fullMark: 100 },
    ];
  }, [selectedPlayer, players, groupAverages]);

  // Advanced Stats Calculations
  const advancedStats = useMemo(() => {
    if (!selectedPlayer || !matches) return null;

    const winLossData = [
      { name: 'Vitórias', value: selectedPlayer.wins || 0, color: '#10b981' },
      { name: 'Derrotas', value: selectedPlayer.losses || 0, color: '#f43f5e' }
    ];

    // Calculate current streak from matches
    const playerMatches = matches
      .filter(m => (m.teamA && m.teamA.includes(selectedPlayer.id)) || (m.teamB && m.teamB.includes(selectedPlayer.id)))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let streak = 0;
    let streakType: 'win' | 'loss' | 'none' = 'none';

    for (const match of playerMatches) {
      const isTeamA = match.teamA.includes(selectedPlayer.id);
      const won = match.winner 
        ? (isTeamA ? match.winner === 'A' : match.winner === 'B')
        : (isTeamA ? match.scoreA > match.scoreB : match.scoreB > match.scoreA);
      
      if (streak === 0) {
        streak = 1;
        streakType = won ? 'win' : 'loss';
      } else if ((won && streakType === 'win') || (!won && streakType === 'loss')) {
        streak++;
      } else {
        break;
      }
    }

    const avgEloChange = selectedPlayer.matchesPlayed > 0 
      ? (selectedPlayer.elo - 1000) / selectedPlayer.matchesPlayed 
      : 0;

    // Impact History for Chart
    const impactHistory = playerMatches.slice(0, 10).reverse().map((m, idx) => {
      const isTeamA = m.teamA.includes(selectedPlayer.id);
      const won = m.winner 
        ? (isTeamA ? m.winner === 'A' : m.winner === 'B')
        : (isTeamA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA);
      return {
        match: idx + 1,
        impact: won ? 25 : -20,
        result: won ? 'V' : 'D'
      };
    });

    return { winLossData, streak, streakType, avgEloChange, impactHistory };
  }, [selectedPlayer, matches]);

  const winRateHistory = useMemo(() => {
    if (!selectedPlayer || !matches || matches.length === 0) return [];
    
    const playerMatches = matches
      .filter(m => (m.teamA && m.teamA.includes(selectedPlayer.id)) || (m.teamB && m.teamB.includes(selectedPlayer.id)))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    let wins = 0;
    let total = 0;
    
    return playerMatches.map((m, idx) => {
      total++;
      const isTeamA = m.teamA && m.teamA.includes(selectedPlayer.id);
      const won = (isTeamA && m.winner === 'A') || (!isTeamA && m.winner === 'B');
      if (won) wins++;
      
      return {
        match: idx + 1,
        winRate: Math.round((wins / total) * 100),
        totalMatches: total,
        date: new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      };
    }).slice(-15); // Show last 15 matches for clarity
  }, [selectedPlayer, matches]);

  const getTrend = (player: any) => {
    if (!player.eloHistory || player.eloHistory.length < 2) return 'neutral';
    const last = player.eloHistory[player.eloHistory.length - 1].elo;
    const prev = player.eloHistory[player.eloHistory.length - 2].elo;
    if (last > prev) return 'up';
    if (last < prev) return 'down';
    return 'neutral';
  };

  // Top Stats
  const topStats = useMemo(() => {
    if (!players || players.length === 0) return { mvp: null, bestSetter: null, topElo: null, dailyKing: null, topImpact: null, dailyMvp: null, dailyBestSetter: null };
    
    // Minimum matches to qualify for MVP/Best Setter to avoid 1-match outliers
    const MIN_MATCHES = 3;

    const getWinRate = (p: any) => (p.matchesPlayed || 0) > 0 ? (p.wins || 0) / p.matchesPlayed : 0;
    const getDailyWinRate = (p: any) => (p.dailyMatches || 0) > 0 ? (p.dailyWins || 0) / p.dailyMatches : 0;

    const mvp = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES)
      .sort((a, b) => getWinRate(b) - getWinRate(a))[0] || 
      [...players].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];

    const bestSetter = [...players]
      .filter(p => p.isOfficialSetter && (p.matchesPlayed || 0) >= MIN_MATCHES)
      .sort((a, b) => getWinRate(b) - getWinRate(a))[0] ||
      [...players].filter(p => p.isOfficialSetter).sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];

    const dailyMvp = [...players]
      .filter(p => (p.dailyMatches || 0) > 0)
      .sort((a, b) => getDailyWinRate(b) - getDailyWinRate(a) || (b.dailyWins || 0) - (a.dailyWins || 0))[0];

    const dailyBestSetter = [...players]
      .filter(p => p.isOfficialSetter && (p.dailyMatches || 0) > 0)
      .sort((a, b) => getDailyWinRate(b) - getDailyWinRate(a) || (b.dailyWins || 0) - (a.dailyWins || 0))[0];

    const topElo = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0))[0];
    const dailyKing = [...players].sort((a, b) => (b.dailyEloGain || 0) - (a.dailyEloGain || 0))[0];
    const topImpact = [...players].sort((a, b) => {
      const impactA = ((a.elo || 1000) - 1000) / (a.matchesPlayed || 1);
      const impactB = ((b.elo || 1000) - 1000) / (b.matchesPlayed || 1);
      return impactB - impactA;
    })[0];
    
    return { mvp, bestSetter, topElo, dailyKing, topImpact, dailyMvp, dailyBestSetter };
  }, [players]);

  // Global Top Synergies & Rivalries
  const globalRelationships = useMemo(() => {
    if (!players || players.length === 0) return { synergies: [], rivalries: [] };

    const synergies = Object.entries(synergy || {})
      .map(([pair, wins]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        return { p1, p2, wins: wins as number };
      })
      .filter(s => s.p1 && s.p2)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 3);

    const rivalries = Object.entries(rivalry || {})
      .map(([pair, wins]) => {
        const [loserId, winnerId] = pair.split('_');
        const loser = players.find(p => p.id === loserId);
        const winner = players.find(p => p.id === winnerId);
        return { loser, winner, wins: wins as number };
      })
      .filter(r => r.loser && r.winner)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 3);

    return { synergies, rivalries };
  }, [synergy, rivalry, players]);

  const averageElo = useMemo(() => {
    if (!players || players.length === 0) return 0;
    const sum = players.reduce((acc, p) => acc + (p.elo || 0), 0);
    return Math.round(sum / players.length);
  }, [players]);

  return (
    <div 
      className="relative space-y-8 pb-12"
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
        <div className="bg-white p-2 rounded-full shadow-lg border border-slate-200">
          <RotateCcw className={`w-6 h-6 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* Header & AI Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-black text-slate-900 uppercase tracking-tighter"
          >
            Ranking <span className="text-indigo-600">Pro</span>
          </motion.h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Inteligência e Performance</p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          {userRole === 'ADMIN' && (
            <button 
              onClick={handleAnnounceSummary}
              disabled={isNarratingSummary}
              className="flex-1 md:flex-none bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
            >
              <Sparkles className={`w-5 h-5 ${isNarratingSummary ? 'animate-spin' : ''}`} />
              {isNarratingSummary ? 'Narrando...' : 'Resumo IA'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="bg-slate-200/50 p-1.5 rounded-2xl flex gap-1">
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'daily' 
              ? 'bg-white text-indigo-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Destaques do Dia
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'individual' 
              ? 'bg-white text-indigo-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Análise de Sócio
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'daily' ? (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Daily Results Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-xl">
                    <Sparkles className="w-5 h-5 text-amber-600" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Destaques de Hoje</h3>
                </div>
                {userRole === 'ADMIN' && (
                  <button 
                    onClick={resetDailyMatches}
                    className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-slate-400 transition-all"
                    title="Resetar Dia"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-amber-200 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                    <Trophy className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">MVP do Dia</p>
                  <h4 className="text-xl font-black truncate">{topStats.dailyMvp?.name || '-'}</h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {topStats.dailyMvp ? Math.round((topStats.dailyMvp.dailyWins / (topStats.dailyMvp.dailyMatches || 1)) * 100) : 0}% Win Rate
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-indigo-200 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                    <Target className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Levantador do Dia</p>
                  <h4 className="text-xl font-black truncate">{topStats.dailyBestSetter?.name || '-'}</h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {topStats.dailyBestSetter ? Math.round((topStats.dailyBestSetter.dailyWins / (topStats.dailyBestSetter.dailyMatches || 1)) * 100) : 0}% Win Rate
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-emerald-200 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                    <Zap className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Rei do Dia</p>
                  <h4 className="text-xl font-black truncate">{topStats.dailyKing?.name || '-'}</h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      +{topStats.dailyKing?.dailyEloGain || 0} ELO
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <Activity className="w-12 h-12 text-slate-400" />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Partidas Hoje</p>
                  <h4 className="text-3xl font-black text-slate-800">{matches.filter(m => m.date === new Date().toISOString().split('T')[0]).length}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Registradas</p>
                </motion.div>
              </div>
            </section>

            {/* Global Top Stats Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <Trophy className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ranking Histórico</h3>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-4 md:p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <Trophy className="w-12 h-12 md:w-16 md:h-16 text-indigo-600" />
                  </div>
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 md:mb-4">MVP Eficiência</p>
                  <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate">{topStats.mvp?.name || '-'}</h3>
                  <p className="text-indigo-600 font-black text-xs md:text-sm mt-1 uppercase tracking-widest">
                    {topStats.mvp ? Math.round((topStats.mvp.wins / (topStats.mvp.matchesPlayed || 1)) * 100) : 0}% Aproveitamento
                  </p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-4 md:p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <Target className="w-12 h-12 md:w-16 md:h-16 text-amber-600" />
                  </div>
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 md:mb-4">Melhor Levantador</p>
                  <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate">{topStats.bestSetter?.name || '-'}</h3>
                  <p className="text-amber-600 font-black text-xs md:text-sm mt-1 uppercase tracking-widest">
                    {topStats.bestSetter ? Math.round((topStats.bestSetter.wins / (topStats.bestSetter.matchesPlayed || 1)) * 100) : 0}% Aproveitamento
                  </p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-4 md:p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <Zap className="w-12 h-12 md:w-16 md:h-16 text-emerald-600" />
                  </div>
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 md:mb-4">Rei do ELO</p>
                  <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate">{topStats.topElo?.name || '-'}</h3>
                  <p className="text-emerald-600 font-black text-xs md:text-sm mt-1 uppercase tracking-widest">{topStats.topElo?.elo || 0} Pontos</p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-4 md:p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <Activity className="w-12 h-12 md:w-16 md:h-16 text-rose-600" />
                  </div>
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 md:mb-4">Maior Impacto</p>
                  <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate">{topStats.topImpact?.name || '-'}</h3>
                  <p className="text-rose-600 font-black text-xs md:text-sm mt-1 uppercase tracking-widest">
                    {topStats.topImpact ? ((topStats.topImpact.elo - 1000) / (topStats.topImpact.matchesPlayed || 1)).toFixed(1) : '0.0'} ELO/Jogo
                  </p>
                </motion.div>
              </div>
            </section>

      {/* Global Synergies & Rivalries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Melhores Duplas (Sinergia)</h4>
          </div>
          <div className="space-y-4">
            {globalRelationships.synergies.length > 0 ? globalRelationships.synergies.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-indigo-600">
                      {s.p1?.name.charAt(0)}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-emerald-600">
                      {s.p2?.name.charAt(0)}
                    </div>
                  </div>
                  <p className="text-xs font-black text-slate-700">{s.p1?.name} + {s.p2?.name}</p>
                </div>
                <p className="text-xs font-black text-emerald-600">{s.wins} Vitórias</p>
              </div>
            )) : (
              <p className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-widest">Sem dados de sinergia</p>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-50 rounded-xl">
              <Swords className="w-5 h-5 text-rose-600" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Maiores Rivalidades</h4>
          </div>
          <div className="space-y-4">
            {globalRelationships.rivalries.length > 0 ? globalRelationships.rivalries.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-700">{r.winner?.name}</span>
                    <span className="text-[10px] font-black text-slate-400">vs</span>
                    <span className="text-xs font-black text-slate-700">{r.loser?.name}</span>
                  </div>
                </div>
                <p className="text-xs font-black text-rose-600">{r.wins} Vitórias</p>
              </div>
            )) : (
              <p className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-widest">Sem dados de rivalidade</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  ) : (
    <motion.div
      key="individual"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-6">
        <button 
          onClick={() => {
            setModalTarget('selected');
            setIsListModalOpen(true);
          }}
          className="w-full bg-white border border-slate-200 text-slate-600 px-6 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-between gap-3 hover:bg-slate-50 shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-600" />
            {selectedPlayer ? `Analisando: ${selectedPlayer.name}` : 'Selecionar Sócio para Análise'}
          </div>
          <ChevronRight className="w-5 h-5 opacity-40" />
        </button>

        {selectedPlayer ? (
            <motion.div 
              key={selectedPlayer.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Profile Card */}
              <div className="bg-indigo-600 rounded-[3rem] p-8 text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                  <Trophy className="w-32 h-32 rotate-12" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black border-2 border-white/30">
                      {selectedPlayer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className={`text-3xl font-black uppercase tracking-tighter ${selectedPlayer.isOfficialSetter ? 'text-rose-400' : ''}`}>{selectedPlayer.name}</h3>
                      <p className="text-indigo-200 text-xs font-bold uppercase tracking-[0.2em] mt-1">Sócio Nível Pro</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20 text-center">
                      <p className="text-4xl font-black font-mono">{selectedPlayer.elo}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Ranking Global</p>
                    </div>
                    {userRole === 'ADMIN' && (
                      <button 
                        onClick={() => {
                          if (confirm('Deseja zerar os ganhos diários de todos os jogadores?')) {
                            resetDailyMatches();
                          }
                        }}
                        className="p-4 bg-white/10 backdrop-blur-md text-white hover:bg-white/20 rounded-2xl transition-all border border-white/20"
                        title="Zerar Ganhos Diários"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-10">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">Vitórias</p>
                    <p className="text-xl font-black">{selectedPlayer.wins}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">Partidas</p>
                    <p className="text-xl font-black">{selectedPlayer.matchesPlayed}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">Aproveitamento</p>
                    <p className="text-xl font-black">
                      {selectedPlayer.matchesPlayed > 0 ? Math.round((selectedPlayer.wins / selectedPlayer.matchesPlayed) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Accumulated Results Card */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <History className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Resultados Acumulados</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Vitórias</p>
                    <p className="text-3xl font-black text-emerald-600">{selectedPlayer.wins || 0}</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Derrotas</p>
                    <p className="text-3xl font-black text-rose-600">{selectedPlayer.losses || 0}</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Partidas</p>
                    <p className="text-3xl font-black text-slate-800">{selectedPlayer.matchesPlayed || 0}</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo Vitórias</p>
                    <p className={`text-3xl font-black ${(selectedPlayer.wins || 0) - (selectedPlayer.losses || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {(selectedPlayer.wins || 0) - (selectedPlayer.losses || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ELO Evolution Chart */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-emerald-50 rounded-xl">
                      <Activity className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Evolução de ELO</h4>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={eloChartData}>
                        <defs>
                          <linearGradient id="colorElo" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                          dy={10}
                        />
                        <YAxis 
                          hide 
                          domain={['dataMin - 50', 'dataMax + 50']}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        />
                        <Area 
                          name={selectedPlayer.name}
                          type="monotone" 
                          dataKey="elo" 
                          stroke="#4f46e5" 
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#colorElo)" 
                          animationDuration={1500}
                        />
                        <Line 
                          name="Média do Grupo"
                          type="monotone" 
                          dataKey="groupAverage" 
                          stroke="#94a3b8" 
                          strokeWidth={2} 
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Win/Loss Evolution Chart */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-emerald-50 rounded-xl">
                      <History className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Evolução de Vitórias e Derrotas</h4>
                  </div>
                  <WinLossChart matches={matches} playerId={selectedPlayer.id} />
                </div>

                {/* Performance Trends Line Charts */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 rounded-xl">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                      </div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Tendência de Aproveitamento</h4>
                    </div>
                    <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase">
                      Últimas 15 Partidas
                    </div>
                  </div>
                  
                  <div className="flex-1 min-h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={winRateHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="match" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                          label={{ value: 'Partida', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 800, fill: '#cbd5e1' }}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                          tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                          formatter={(value) => [`${value}%`, 'Aproveitamento']}
                          labelFormatter={(label) => `Partida #${label}`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="winRate" 
                          stroke="#4f46e5" 
                          strokeWidth={4}
                          dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          animationDuration={1500}
                        />
                        <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Equilíbrio', position: 'right', fill: '#cbd5e1', fontSize: 8, fontWeight: 800 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="mt-8 pt-6 border-t border-slate-50 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Pico de Aproveitamento</p>
                      <p className="text-xl font-black text-indigo-600">
                        {winRateHistory.length > 0 ? Math.max(...winRateHistory.map(h => h.winRate)) : 0}%
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Consistência</p>
                      <p className="text-xl font-black text-emerald-600">
                        {selectedPlayer.matchesPlayed > 10 ? 'Alta' : 'Em Evolução'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Stats & Win/Loss Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Win/Loss Donut */}
                <div className="md:col-span-1 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 w-full text-center">Distribuição de Resultados</h4>
                  <div className="h-[180px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={advancedStats?.winLossData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {advancedStats?.winLossData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', fontWeight: 'bold' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-2xl font-black text-slate-800">{selectedPlayer.matchesPlayed}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase">Partidas</p>
                    </div>
                  </div>
                  <div className="flex gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-600">{selectedPlayer.wins}V</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="text-[10px] font-bold text-slate-600">{selectedPlayer.losses}D</span>
                    </div>
                  </div>
                </div>

                {/* Efficiency Cards */}
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group flex flex-col">
                    <div className="relative z-10">
                      <div className="absolute top-0 right-0 opacity-10 group-hover:scale-110 transition-transform text-indigo-600">
                        <Activity className="w-16 h-16" />
                      </div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Impacto por Jogo</p>
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-slate-800">{advancedStats?.avgEloChange.toFixed(1)}</h3>
                        <span className="text-xs font-bold text-slate-400 uppercase">ELO / Partida</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 mt-2">Média de crescimento histórico</p>
                    </div>
                    
                    <div className="h-24 mt-6 -mx-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={advancedStats?.impactHistory}>
                          <Bar 
                            dataKey="impact" 
                            radius={[4, 4, 0, 0]}
                          >
                            {advancedStats?.impactHistory.map((entry: any, index: number) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.impact > 0 ? '#6366f1' : '#f43f5e'} 
                                fillOpacity={0.4}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className={`p-8 rounded-[2.5rem] relative overflow-hidden group border ${
                    advancedStats?.streakType === 'win' 
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-900' 
                      : advancedStats?.streakType === 'loss'
                      ? 'bg-rose-50 border-rose-100 text-rose-900'
                      : 'bg-slate-50 border-slate-100 text-slate-900'
                  }`}>
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                      {advancedStats?.streakType === 'win' ? <Sparkles className="w-16 h-16" /> : <RotateCcw className="w-16 h-16" />}
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-4 opacity-60">Sequência Atual</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black">{advancedStats?.streak}</h3>
                      <span className="text-xs font-bold uppercase">
                        {advancedStats?.streakType === 'win' ? 'Vitórias' : 'Derrotas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-2 h-2 rounded-full ${advancedStats?.streakType === 'win' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <p className="text-[10px] font-bold opacity-70">Ritmo de jogo atual</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Synergy & Rivalry */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100">
                  <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-4">Sinergia Positiva</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 uppercase tracking-tight text-sm">
                        {playerRelationships.synergy?.name || 'Parceiro Ideal'}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-600">
                        {playerRelationships.synergy ? `${playerRelationships.synergy.wins} vitórias juntos` : 'Sem dados'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-rose-50/50 p-6 rounded-[2rem] border border-rose-100">
                  <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-4">Sinergia Negativa</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <TrendingDown className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 uppercase tracking-tight text-sm">
                        {playerRelationships.negativeSynergy?.name || 'Parceiro Difícil'}
                      </p>
                      <p className="text-[10px] font-bold text-rose-600">
                        {playerRelationships.negativeSynergy ? `${playerRelationships.negativeSynergy.losses} derrotas juntos` : 'Sem dados'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100">
                  <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-4">Maior Rival</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <Swords className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 uppercase tracking-tight text-sm">
                        {playerRelationships.rivalry?.name || 'Nenhum Rival'}
                      </p>
                      <p className="text-[10px] font-bold text-amber-600">
                        {playerRelationships.rivalry ? `${playerRelationships.rivalry.losses} derrotas contra` : 'Sem histórico de confrontos'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Comparison Section */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                      <Activity className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Comparativo de Performance</h4>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setModalTarget('comparison');
                        setIsListModalOpen(true);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all flex items-center gap-2"
                    >
                      <Users className="w-3 h-3" />
                      {comparisonPlayer ? `Comparar com: ${comparisonPlayer.name}` : 'Comparar com Sócio'}
                    </button>
                    {comparisonPlayer && (
                      <button 
                        onClick={() => setComparisonPlayerId(null)}
                        className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-slate-400 transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="subject" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      />
                      <Bar name={selectedPlayer.name} dataKey="A" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={30} />
                      <Bar name={comparisonPlayer?.name || 'Média Grupo'} dataKey="B" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-8">
                  {comparisonData.map((d, i) => (
                    <div key={i} className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">{d.subject}</p>
                      <div className="flex justify-center items-center gap-2">
                        <span className="text-sm font-black text-indigo-600">{Math.round(d.A)}</span>
                        <span className="text-[10px] font-bold text-slate-300">vs</span>
                        <span className="text-sm font-black text-slate-400">{Math.round(d.B)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                <Users className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Selecione um Sócio</h3>
              <p className="text-sm font-bold text-slate-400 mt-2">Clique em um jogador na lista para ver sua análise detalhada.</p>
            </div>
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>

      {/* Player Listing Modal */}
      <AnimatePresence>
        {isListModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsListModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Lista de Sócios</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{(players?.length || 0)} Atletas Registrados</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsListModalOpen(false);
                      setModalSearchQuery('');
                    }}
                    className="p-3 hover:bg-white rounded-2xl transition-colors shadow-sm"
                  >
                    <RotateCcw className="w-5 h-5 text-slate-400 rotate-45" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nome..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  />
                  {modalSearchQuery && (
                    <button 
                      onClick={() => setModalSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[...players]
                    .filter(p => p.name.toLowerCase().includes(modalSearchQuery.toLowerCase()))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(player => {
                      const isSelected = modalTarget === 'selected' 
                        ? selectedPlayerId === player.id || (!selectedPlayerId && player.id === topPlayer?.id)
                        : comparisonPlayerId === player.id;

                      return (
                        <button
                          key={player.id}
                          onClick={() => {
                            if (modalTarget === 'selected') {
                              setSelectedPlayerId(player.id);
                            } else {
                              setComparisonPlayerId(player.id);
                            }
                            setIsListModalOpen(false);
                            setModalSearchQuery('');
                            // Scroll to top of analytics on mobile
                            if (window.innerWidth < 1024) {
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }
                          }}
                          className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border-slate-100 hover:border-indigo-200 text-slate-700'}`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${isSelected ? 'bg-white/20' : 'bg-slate-100'}`}>
                            {player.name.charAt(0)}
                          </div>
                          <div>
                            <p className={`font-black uppercase tracking-tight text-sm ${!isSelected && player.isOfficialSetter ? 'text-rose-600' : ''}`}>{player.name}</p>
                            <p className={`text-[9px] font-bold uppercase ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                              ELO: {player.elo} • {player.wins}V • Impacto: {((player.elo - 1000) / (player.matchesPlayed || 1)).toFixed(1)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
