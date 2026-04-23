import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { getFirestoreDateKey } from '../firebase';
import { getPlayerTier } from '../utils/tierUtils';
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
  History,
  X,
  Info,
  Download,
  Share2,
  Copy
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
  Legend,
  ReferenceLine,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { WinLossChart } from '../src/components/WinLossChart';
import { translateGender } from '../utils/helpers';

import { generateDailySummaryAudio } from '../services/geminiService';

interface RankingViewProps {
  userRole: 'ADMIN' | 'MEMBER';
  refreshPlayers: () => Promise<void>;
  handleAnnounceSummary: (data?: any) => void;
  isNarratingSummary: boolean;
  resetDailyMatches: () => Promise<void>;
  isDark?: boolean;
}

export const RankingView: React.FC<RankingViewProps> = ({
  userRole,
  refreshPlayers,
  handleAnnounceSummary,
  isNarratingSummary,
  resetDailyMatches,
  isDark = false
}) => {
  const { synergy, negativeSynergy, rivalry, players: allPlayers, matches, isSyncing, currentPlayer, setNarrationAudio, narrationAudio, showNotification } = useStore();
  const players = useMemo(() => allPlayers.filter(p => p.status !== 'inactive'), [allPlayers]);
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
  const [rankingPeriod, setRankingPeriod] = useState<'session' | 'career'>('session');
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>('Hoje');
  const [rankingSearchQuery, setRankingSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'all'>('all');
  const [chartMetric, setChartMetric] = useState<'elo' | 'winrate' | 'matches'>('elo');

  const [comparisonPlayerId, setComparisonPlayerId] = useState<string | null>(null);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<'selected' | 'comparison'>('selected');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  
  // Helper format function to eliminate local timezone interference across the whole component
  const formatBrazilianDate = (dateString: string | number) => {
    try {
      // If it's a date-only string like YYYY-MM-DD, parsing it as `new Date("YYYY-MM-DD")` in JS
      // gets treated as UTC. But here we want to format it explicitly.
      // If it's a full ISO string '2026-04-17T02:00:00Z', new Date() will parse it correctly
      // and Intl.DateTimeFormat will convert it to Brazil time (which would be 23:00 on the 16th).
      
      let dateObj: Date;
      if (typeof dateString === 'string') {
        if (dateString.includes('T')) {
          dateObj = new Date(dateString); // Full timezone-aware string
        } else {
          // Just "YYYY-MM-DD", let's safely split to avoid UTC midnight shifts giving wrong days locally
          const [year, month, day] = dateString.split('-');
          return `${day}/${month}`;
        }
      } else {
        dateObj = new Date(dateString); // Timestamp number
      }

      return new Intl.DateTimeFormat('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        day: '2-digit', 
        month: '2-digit' 
      }).format(dateObj);
    } catch {
      return 'Data';
    }
  };
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  // Limpar áudio de narração quando a data muda para evitar compartilhar áudio antigo
  useEffect(() => {
    setNarrationAudio(null);
  }, [selectedDailyDate, setNarrationAudio]);

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
          bestSynergy = { name: otherPlayer.name || "Sócio sem nome", wins: wins as number };
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
          worstNegativeSynergy = { name: otherPlayer.name || "Sócio sem nome", losses: losses as number };
        }
      }
    });

    // Rivalry (Losses against)
    Object.entries(rivalry || {}).forEach(([pair, losses]) => {
      const [loserId, winnerId] = pair.split('_');
      if (loserId === selectedPlayer.id) {
        const otherPlayer = players.find(p => p.id === winnerId);
        if (otherPlayer && (losses as number) > worstRival.losses) {
          worstRival = { name: otherPlayer.name || "Sócio sem nome", losses: losses as number };
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
    
    let history = [...selectedPlayer.eloHistory];
    
    // Apply time range filter
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      history = history.filter(h => h.date >= cutoffStr);
    }
    
    return history.map(h => {
      const dateStr = h.date;
      // Extract only the date part if it's a full ISO string
      const cleanDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const dateObj = new Date(cleanDateStr + 'T00:00:00');
      
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
        date: formatBrazilianDate(dateStr),
        fullDate: dateStr,
        elo: h.elo,
        groupAverage: avgAtDate
      };
    });
  }, [selectedPlayer, players]);

  // New Chart Data: Daily Performance (ELO Variation)
  const dailyPerformanceData = useMemo(() => {
    if (!selectedPlayer?.eloHistory || selectedPlayer.eloHistory.length < 2) return [];
    
    let history = [...selectedPlayer.eloHistory];
    
    // Apply time range filter
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      history = history.filter(h => h.date >= cutoffStr);
    }
    
    if (history.length < 2) return [];
    
    const variations: Record<string, { variation: number, wins: number, matches: number }> = {};
    
    // Calculate daily variations
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1];
      const curr = history[i];
      const diff = curr.elo - prev.elo;
      
      const dateStr = curr.date;
      const cleanDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      
      if (!variations[cleanDateStr]) {
        variations[cleanDateStr] = { variation: 0, wins: 0, matches: 0 };
      }
      variations[cleanDateStr].variation += diff;
    }
    
    // Add wins and matches per day from matches history
    const playerMatches = matches.filter(m => 
      m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id)
    );
    
    playerMatches.forEach(m => {
      const dateStr = m.date;
      if (!variations[dateStr]) {
        variations[dateStr] = { variation: 0, wins: 0, matches: 0 };
      }
      variations[dateStr].matches += 1;
      const isWinner = (m.winner === 'A' && m.teamA.includes(selectedPlayer.id)) || 
                       (m.winner === 'B' && m.teamB.includes(selectedPlayer.id));
      if (isWinner) {
        variations[dateStr].wins += 1;
      }
    });
    
      return Object.entries(variations)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([dateStr, stats]) => {
        return {
          date: formatBrazilianDate(dateStr),
          fullDate: dateStr,
          variation: stats.variation,
          wins: stats.wins,
          matches: stats.matches,
          winRate: stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0
        };
      });
  }, [selectedPlayer, matches, timeRange]);

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
      ? (selectedPlayer.elo - 1200) / selectedPlayer.matchesPlayed 
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
        date: formatBrazilianDate(m.timestamp)
      };
    }).slice(-15); // Show last 15 matches for clarity
  }, [selectedPlayer, matches]);

  const stabilityData = useMemo(() => {
    if (!selectedPlayer || !matches) return [];
    
    const playerMatches = matches.filter(m => 
      m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id)
    );
    
    const buckets: Record<number, { wins: number, total: number }> = {};
    
    playerMatches.forEach(m => {
      const duration = m.duration || 0;
      if (duration === 0) return;
      
      const bucket = Math.round(duration / 5) * 5;
      if (!buckets[bucket]) buckets[bucket] = { wins: 0, total: 0 };
      
      buckets[bucket].total++;
      const isWinner = (m.winner === 'A' && m.teamA.includes(selectedPlayer.id)) || 
                       (m.winner === 'B' && m.teamB.includes(selectedPlayer.id));
      if (isWinner) buckets[bucket].wins++;
    });
    
    return Object.entries(buckets)
      .map(([duration, stats]) => ({
        duration: parseInt(duration),
        winRate: Math.round((stats.wins / stats.total) * 100),
        total: stats.total
      }))
      .sort((a, b) => a.duration - b.duration);
  }, [selectedPlayer, matches]);

  const playerConsistency = useMemo(() => {
    if (!selectedPlayer || !matches) return { label: 'Em Evolução', color: 'text-brand-primary' };
    
    const playerMatches = matches
      .filter(m => m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Descending by date
      
    if (playerMatches.length === 0) return { label: 'Sem Jogos', color: 'text-white/60' };
    
    const recentMatches = playerMatches.slice(0, 10);
    const wins = recentMatches.reduce((acc, m) => {
      const isWinner = (m.winner === 'A' && m.teamA.includes(selectedPlayer.id)) || 
                       (m.winner === 'B' && m.teamB.includes(selectedPlayer.id));
      return acc + (isWinner ? 1 : 0);
    }, 0);
    
    // Variance analysis and streaks pattern in recent games
    const recentWinRate = wins / recentMatches.length;
    
    if (recentWinRate >= 0.8) {
      return { label: 'Implacável', color: 'text-emerald-500 flex items-center gap-1 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]' };
    } else if (recentWinRate >= 0.6) {
      return { label: 'Casca Grossa', color: 'text-brand-primary drop-shadow-[0_0_5px_rgba(245,196,41,0.5)]' };
    } else if (recentWinRate >= 0.4) {
      return { label: 'Balanceado', color: 'text-white/80' };
    } else if (recentWinRate >= 0.2) {
      return { label: 'Oscilante', color: 'text-orange-400' };
    } else {
      return { label: 'Em Queda', color: 'text-rose-500 font-bold' };
    }
  }, [selectedPlayer, matches]);

  const getTrend = (player: any) => {
    if (!player.eloHistory || player.eloHistory.length < 2) return 'neutral';
    const last = player.eloHistory[player.eloHistory.length - 1].elo;
    const prev = player.eloHistory[player.eloHistory.length - 2].elo;
    if (last > prev) return 'up';
    if (last < prev) return 'down';
    return 'neutral';
  };

  // Get unique dates from matches for filtering
  const availableDates = useMemo(() => {
    const today = getFirestoreDateKey();
    const dates = new Set(matches.map(m => m.date));
    // Remove a data de hoje do set para não duplicar com o rótulo "Hoje"
    dates.delete(today);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return ['Hoje', ...sortedDates];
  }, [matches]);

  // Top Stats
  const topStats = useMemo(() => {
    if (!players || players.length === 0) return { mvp: null, bestSetter: null, topElo: null, dailyKing: null, topImpact: null, dailyMvp: null, dailyBestSetter: null, dailyMatchesCount: 0, dailyEfficient: null, mostEfficient: null };
    
    // Minimum matches to qualify for MVP/Best Setter to avoid 1-match outliers
    const MIN_MATCHES = 3;

    const getWinRate = (p: any) => (p.matchesPlayed || 0) > 0 ? (p.wins || 0) / p.matchesPlayed : 0;

    // Calculate daily stats based on selected date
    let dailyStats: Record<string, { matches: number, wins: number, eloGain: number, duration: number }> = {};
    let dailyMatchesCount = 0;

    if (selectedDailyDate === 'Hoje') {
      const today = getFirestoreDateKey();
      const todayMatches = matches.filter(m => m.date === today);
      players.forEach(p => {
        const playerTodayMatches = todayMatches.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id));
        const duration = playerTodayMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
        dailyStats[p.id] = {
          matches: p.dailyMatches || 0,
          wins: p.dailyWins || 0,
          eloGain: p.dailyEloGain || 0,
          duration: duration
        };
      });
      dailyMatchesCount = todayMatches.length;
    } else {
      const dateMatches = matches.filter(m => m.date === selectedDailyDate);
      dailyMatchesCount = dateMatches.length;
      
      players.forEach(p => {
        const playerMatches = dateMatches.filter(m => 
          m.teamA.includes(p.id) || m.teamB.includes(p.id)
        );
        const playerWins = playerMatches.filter(m => 
          (m.winner === 'A' && m.teamA.includes(p.id)) || 
          (m.winner === 'B' && m.teamB.includes(p.id))
        ).length;
        const duration = playerMatches.reduce((acc, m) => acc + (m.duration || 0), 0);

        let eloGain = 0;
        if (p.eloHistory) {
          const entry = p.eloHistory.find(h => h.date === selectedDailyDate);
          if (entry) {
            const sortedHistory = [...p.eloHistory].sort((a, b) => a.date.localeCompare(b.date));
            const index = sortedHistory.findIndex(h => h.date === selectedDailyDate);
            if (index > 0) {
              eloGain = entry.elo - sortedHistory[index - 1].elo;
            } else {
              eloGain = entry.elo - 1200;
            }
          }
        }

        dailyStats[p.id] = {
          matches: playerMatches.length,
          wins: playerWins,
          eloGain: eloGain,
          duration: duration
        };
      });
    }

    const getDailyWinRate = (pId: string) => {
      const stats = dailyStats[pId];
      return (stats?.matches || 0) > 0 ? (stats.wins || 0) / stats.matches : 0;
    };

    const mvp = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES)
      .sort((a, b) => getWinRate(b) - getWinRate(a))[0] || 
      [...players]
        .filter(p => (p.matchesPlayed || 0) > 0)
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];

    const bestSetter = [...players]
      .filter(p => p.isOfficialSetter && (p.matchesPlayed || 0) >= MIN_MATCHES)
      .sort((a, b) => getWinRate(b) - getWinRate(a))[0] ||
      [...players]
        .filter(p => p.isOfficialSetter && (p.matchesPlayed || 0) > 0)
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];

    const dailyMvp = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) > 0)
      .sort((a, b) => getDailyWinRate(b.id) - getDailyWinRate(a.id) || (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0))[0];

    const dailyBestSetter = [...players]
      .filter(p => p.isOfficialSetter && (dailyStats[p.id]?.matches || 0) > 0)
      .sort((a, b) => getDailyWinRate(b.id) - getDailyWinRate(a.id) || (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0))[0];

    const topElo = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0))[0];
    
    const dailyKingCandidates = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) > 0 && p.id !== dailyMvp?.id)
      .sort((a, b) => 
        (dailyStats[b.id]?.eloGain || 0) - (dailyStats[a.id]?.eloGain || 0) || 
        (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0) ||
        (dailyStats[a.id]?.matches || 0) - (dailyStats[b.id]?.matches || 0)
      );
    const dailyKing = dailyKingCandidates.length > 0 ? dailyKingCandidates[0] : dailyMvp;

    const topImpactCandidates = [...players]
      .filter(p => (p.matchesPlayed || 0) > 0 && p.id !== mvp?.id)
      .sort((a, b) => {
        const impactA = ((a.elo || 1200) - 1200) / (a.matchesPlayed || 1);
        const impactB = ((b.elo || 1200) - 1200) / (b.matchesPlayed || 1);
        return impactB - impactA || (b.matchesPlayed || 0) - (a.matchesPlayed || 0);
      });
    const topImpact = topImpactCandidates.length > 0 ? topImpactCandidates[0] : mvp;

    const dailyEfficient = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) > 0 && (dailyStats[p.id]?.duration || 0) > 0)
      .sort((a, b) => {
        const effA = dailyStats[a.id].eloGain / dailyStats[a.id].duration;
        const effB = dailyStats[b.id].eloGain / dailyStats[b.id].duration;
        return effB - effA;
      })[0];

    const totalDurations: Record<string, number> = {};
    matches.forEach(m => {
      [...m.teamA, ...m.teamB].forEach(pId => {
        totalDurations[pId] = (totalDurations[pId] || 0) + (m.duration || 0);
      });
    });

    const mostEfficient = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES && (totalDurations[p.id] || 0) > 0)
      .sort((a, b) => {
        const effA = (a.elo - 1200) / totalDurations[a.id];
        const effB = (b.elo - 1200) / totalDurations[b.id];
        return effB - effA;
      })[0];
    
    return { 
      mvp, 
      bestSetter, 
      topElo, 
      dailyKing, 
      topImpact, 
      dailyMvp, 
      dailyBestSetter,
      dailyMatchesCount,
      dailyStats,
      dailyEfficient,
      mostEfficient,
      rankingChanges: (() => {
        // Calcular mudanças no ranking acumulado (ELO)
        const currentRanking = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0));
        const changes: string[] = [];
        
        currentRanking.slice(0, 10).forEach((player, index) => {
          const eloGain = dailyStats[player.id]?.eloGain || 0;
          if (eloGain !== 0) {
            const previousElo = player.elo - eloGain;
            const previousRanking = [...players]
              .map(p => ({ id: p.id, elo: p.id === player.id ? previousElo : (p.elo - (dailyStats[p.id]?.eloGain || 0)) }))
              .sort((a, b) => b.elo - a.elo);
            
            const prevIndex = previousRanking.findIndex(p => p.id === player.id);
            if (prevIndex > index) {
              const wins = dailyStats[player.id]?.wins || 0;
              const matchesPlayed = dailyStats[player.id]?.matches || 0;
              const losses = matchesPlayed - wins;
              changes.push(`${player.name} subiu ${prevIndex - index} posição(ões) no ranking geral com ${wins} vitória(s) e ${losses} derrota(s) hoje`);
            }
          }
        });
        return changes;
      })()
    };
  }, [players, matches, selectedDailyDate]);

  // Pre-generate summary audio when stats are ready
  useEffect(() => {
    const preGenerate = async () => {
      if (userRole === 'ADMIN' && topStats.dailyMatchesCount > 0) {
        try {
          const audio = await generateDailySummaryAudio({
            mvp: topStats.dailyMvp?.name,
            bestSetter: topStats.dailyBestSetter?.name,
            dailyKing: topStats.dailyKing?.name,
            matchesCount: topStats.dailyMatchesCount,
            rankingChanges: topStats.rankingChanges
          });
          if (audio) setNarrationAudio(audio);
        } catch (e) {
          console.error("Pre-generation error:", e);
        }
      }
    };
    
    // Debounce to avoid multiple calls during data sync
    const timer = setTimeout(preGenerate, 2000);
    return () => clearTimeout(timer);
  }, [topStats.dailyMvp, topStats.dailyBestSetter, topStats.dailyKing, topStats.dailyMatchesCount, userRole, setNarrationAudio]);

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

  const handleCopyTextSummary = () => {
    if (!topStats.dailyStats) return;

    const today = selectedDailyDate === 'Hoje' ? getFirestoreDateKey() : selectedDailyDate;
    
    let text = `🏆 *RESUMO DO DIA - GUERREIROS VOLLEYBALL* 🏆\n`;
    text += `📅 Data: ${today}\n\n`;

    text += `🌟 *DESTAQUES:*\n`;
    text += `• *MVP:* ${topStats.dailyMvp?.name || 'N/A'}\n`;
    text += `• *Melhor Levantador:* ${topStats.dailyBestSetter?.name || 'N/A'}\n`;
    text += `• *Rei do Dia:* ${topStats.dailyKing?.name || 'N/A'}\n\n`;

    if (topStats.rankingChanges && topStats.rankingChanges.length > 0) {
      text += `📈 *SUBIRAM NO RANKING:*\n`;
      topStats.rankingChanges.forEach((change: string) => {
        text += `• ${change}\n`;
      });
      text += `\n`;
    }

    text += `📊 *RANKING DE HOJE (ELO e CAMPANHA):*\n`;
    
    // Get all players who played today
    const activeToday = players
      .filter(p => (topStats.dailyStats[p.id]?.matches || 0) > 0)
      .sort((a, b) => (b.elo || 0) - (a.elo || 0));

    activeToday.forEach((p, idx) => {
      const stats = topStats.dailyStats[p.id];
      const wins = stats?.wins || 0;
      const losses = (stats?.matches || 0) - wins;
      text += `${idx + 1}. *${p.name}* - ${p.elo} pts (${wins}V - ${losses}D)\n`;
    });

    text += `\nTotal de partidas hoje: ${topStats.dailyMatchesCount}\n`;
    text += `_Gerado por Guerreiros Intelligence_ 🏐`;

    navigator.clipboard.writeText(text);
    showNotification('Resumo em texto copiado para a área de transferência!', 'success');
  };

  const handleShareAudio = async () => {
    if (!narrationAudio) return;
    
    try {
      showNotification('Preparando áudio para compartilhar...', 'info');
      const response = await fetch(narrationAudio);
      const blob = await response.blob();
      const fileName = `resumo_guerreiros_${selectedDailyDate === 'Hoje' ? getFirestoreDateKey() : selectedDailyDate.replace(/\//g, '-')}.wav`;
      const file = new File([blob], fileName, { type: 'audio/wav' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Resumo do Dia - Guerreiros Volleyball',
          text: 'Confira os destaques do racha de hoje!'
        });
      } else {
        // Fallback to download
        const link = document.createElement('a');
        link.href = narrationAudio;
        link.download = fileName;
        link.click();
        showNotification('Áudio baixado! Agora você pode enviar para o grupo.', 'success');
      }
    } catch (e) {
      // Ignore AbortError which happens when the user cancels the share sheet
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('canceled') || e.message.includes('cancelled'))) {
        console.log("Share action was cancelled by the user");
        return;
      }
      console.error("Share error:", e);
      showNotification('Erro ao compartilhar áudio.', 'error');
    }
  };

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
        <div className="bg-brand-secondary/80 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* Header & AI Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`text-4xl font-black uppercase tracking-tighter text-white`}
          >
            Ranking <span className="text-white">Pro</span>
          </motion.h2>
          <p className={`text-sm font-bold uppercase tracking-widest mt-2 text-brand-accent`}>Inteligência e Performance</p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          {userRole === 'ADMIN' && (
            <div className="flex gap-2 w-full md:w-auto">
              <button 
                onClick={() => handleAnnounceSummary(topStats)}
                disabled={isNarratingSummary}
                className="flex-1 md:flex-none bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50 border border-brand-primary/40"
              >
                <Sparkles className={`w-5 h-5 ${isNarratingSummary ? 'animate-spin' : ''}`} />
                {isNarratingSummary ? 'Narrando...' : 'Resumo IA'}
              </button>
              
              <button 
                onClick={async () => {
                  if (narrationAudio) {
                    handleShareAudio();
                  } else if (topStats.dailyMatchesCount > 0) {
                    showNotification('Gerando áudio para compartilhar...', 'info');
                    handleAnnounceSummary(topStats);
                  } else {
                    showNotification('Não há partidas para resumir nesta data.', 'info');
                  }
                }}
                disabled={isNarratingSummary}
                className={`p-4 rounded-2xl transition-all flex items-center justify-center group border ${
                  narrationAudio 
                    ? 'bg-white/10 text-white border-white/10 hover:bg-white/20' 
                    : 'bg-white/5 text-white/40 border-white/5 cursor-wait'
                }`}
                title="Compartilhar áudio no WhatsApp"
              >
                {isNarratingSummary ? (
                  <Sparkles className="w-5 h-5 animate-spin" />
                ) : (
                  <Share2 className={`w-5 h-5 ${narrationAudio ? 'group-hover:scale-110' : ''} transition-transform`} />
                )}
              </button>

              <button 
                onClick={handleCopyTextSummary}
                className="bg-white/10 text-white p-4 rounded-2xl hover:bg-white/20 border border-white/10 transition-all flex items-center justify-center group"
                title="Copiar resumo em texto"
              >
                <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className={`bg-white/5 p-1.5 rounded-2xl flex gap-1 border border-brand-primary/40`}>
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'daily' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Calendar className="w-4 h-4" />
          Destaques do Dia
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'individual' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Users className="w-4 h-4" />
          Análise de Sócio
        </button>
      </div>

      {/* Ranking Period Switcher */}
      <div className={`bg-white/5 p-1 rounded-2xl flex gap-1 border border-brand-primary/40`}>
        <button
          onClick={() => setRankingPeriod('session')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            rankingPeriod === 'session' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <History className="w-4 h-4" />
          Sessão
        </button>
        <button
          onClick={() => setRankingPeriod('career')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            rankingPeriod === 'career' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Trophy className="w-4 h-4" />
          Acumulado
        </button>
      </div>

      {/* Global Session Date Selector */}
      {rankingPeriod === 'session' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-3xl border border-brand-primary/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Calendar className="w-5 h-5 text-brand-primary" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Selecionar Sessão</p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
            {availableDates.slice(0, 5).map(date => (
              <button
                key={date}
                onClick={() => setSelectedDailyDate(date)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                  selectedDailyDate === date 
                    ? 'bg-brand-primary border-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
                    : `bg-white/5 border-brand-primary/40 text-white/60 hover:text-white`
                }`}
              >
                {date === 'Hoje' ? 'Hoje' : formatBrazilianDate(date)}
              </button>
            ))}
            {availableDates.length > 5 && (
              <select
                value={availableDates.includes(selectedDailyDate) && availableDates.indexOf(selectedDailyDate) >= 5 ? selectedDailyDate : ""}
                onChange={(e) => e.target.value && setSelectedDailyDate(e.target.value)}
                className="bg-white/5 border border-brand-primary/40 text-white/60 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl outline-none focus:border-brand-primary transition-all"
              >
                <option value="" disabled>Mais sessões...</option>
                {availableDates.slice(5).map(date => (
                  <option key={date} value={date} className="bg-brand-secondary text-white">
                    {formatBrazilianDate(date)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'daily' ? (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Results Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-primary/10 rounded-xl">
                    <Sparkles className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className={`text-xl font-black uppercase tracking-tight text-white`}>
                    {rankingPeriod === 'session' ? 'Destaques da Sessão' : 'Destaques Acumulados'}
                  </h3>
                </div>
                {userRole === 'ADMIN' && rankingPeriod === 'session' && selectedDailyDate === 'Hoje' && (
                  <button 
                    onClick={resetDailyMatches}
                    className="p-2 bg-white/5 hover:bg-brand-primary/10 hover:text-brand-primary rounded-xl text-brand-accent transition-all"
                    title="Finalizar Dia"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}
                >
                  <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:scale-110 transition-transform">
                    <Trophy className="w-12 h-12 text-yellow-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-2">
                    {rankingPeriod === 'session' ? 'MVP da Sessão' : 'MVP Histórico'}
                  </p>
                  <h4 className="text-xl font-black text-white truncate">
                    {rankingPeriod === 'session' 
                      ? (topStats.dailyMvp ? (topStats.dailyMvp.name || "Sócio sem nome") : "Nenhum")
                      : (topStats.mvp ? (topStats.mvp.name || "Sócio sem nome") : "Nenhum")}
                  </h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border`}>
                      {rankingPeriod === 'session'
                        ? (topStats.dailyMvp ? `${Math.round((topStats.dailyStats[topStats.dailyMvp.id].wins / (topStats.dailyStats[topStats.dailyMvp.id].matches || 1)) * 100)}% Win Rate` : "Sem partidas")
                        : (topStats.mvp ? `${Math.round((topStats.mvp.wins / (topStats.mvp.matchesPlayed || 1)) * 100)}% Win Rate` : "Sem partidas")}
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}
                >
                  <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:scale-110 transition-transform">
                    <Target className="w-12 h-12 text-yellow-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-2">
                    {rankingPeriod === 'session' ? 'Levantador Sessão' : 'Melhor Levantador'}
                  </p>
                  <h4 className="text-xl font-black text-white truncate">
                    {rankingPeriod === 'session'
                      ? (topStats.dailyBestSetter ? (topStats.dailyBestSetter.name || "Sócio sem nome") : "Nenhum")
                      : (topStats.bestSetter ? (topStats.bestSetter.name || "Sócio sem nome") : "Nenhum")}
                  </h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border`}>
                      {rankingPeriod === 'session'
                        ? (topStats.dailyBestSetter ? `${Math.round((topStats.dailyStats[topStats.dailyBestSetter.id].wins / (topStats.dailyStats[topStats.dailyBestSetter.id].matches || 1)) * 100)}% Win Rate` : "Sem partidas")
                        : (topStats.bestSetter ? `${Math.round((topStats.bestSetter.wins / (topStats.bestSetter.matchesPlayed || 1)) * 100)}% Win Rate` : "Sem partidas")}
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}
                >
                  <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:scale-110 transition-transform">
                    <Zap className="w-12 h-12 text-yellow-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-2">
                    {rankingPeriod === 'session' ? 'Rei da Sessão' : 'Rei do ELO'}
                  </p>
                  <h4 className="text-xl font-black text-white truncate">
                    {rankingPeriod === 'session'
                      ? (topStats.dailyKing ? (topStats.dailyKing.name || "Sócio sem nome") : "Nenhum")
                      : (topStats.topElo?.name || "Nenhum")}
                  </h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border`}>
                      {rankingPeriod === 'session'
                        ? (topStats.dailyKing ? `${topStats.dailyStats[topStats.dailyKing.id].eloGain >= 0 ? '+' : ''}${topStats.dailyStats[topStats.dailyKing.id].eloGain || 0} ELO` : "Sem partidas")
                        : (topStats.topElo ? `${topStats.topElo.elo} Pontos` : "0 Pontos")}
                    </span>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}
                >
                  <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:scale-110 transition-transform">
                    <Activity className="w-12 h-12 text-yellow-400" />
                  </div>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-2">
                    {rankingPeriod === 'session' ? 'Mais Eficiente Sessão' : 'Sócio Mais Eficiente'}
                  </p>
                  <h4 className="text-xl font-black text-white truncate">
                    {rankingPeriod === 'session'
                      ? (topStats.dailyEfficient ? (topStats.dailyEfficient.name || "Sócio sem nome") : "Nenhum")
                      : (topStats.mostEfficient ? (topStats.mostEfficient.name || "Sócio sem nome") : "Nenhum")}
                  </h4>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border`}>
                      {rankingPeriod === 'session'
                        ? (topStats.dailyEfficient ? `${(topStats.dailyStats[topStats.dailyEfficient.id].eloGain / (topStats.dailyStats[topStats.dailyEfficient.id].duration || 1)).toFixed(2)} ELO/Min` : "Sem partidas")
                        : (topStats.mostEfficient ? "Líder em ELO/Minuto" : "Sem partidas")}
                    </span>
                  </div>
                </motion.div>
              </div>
            </section>

      {/* Global Synergies & Rivalries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Users className="w-5 h-5 text-brand-primary" />
            </div>
            <h4 className={`text-xs font-black uppercase tracking-widest text-brand-primary`}>
              Melhores Duplas {rankingPeriod === 'session' ? 'da Sessão' : '(Sinergia Geral)'}
            </h4>
          </div>
          <div className="space-y-4">
            {globalRelationships.synergies.length > 0 ? globalRelationships.synergies.map((s, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-brand-primary/40`}>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-brand-secondary border-2 border-white/20 flex items-center justify-center text-[10px] font-black text-brand-primary">
                      {s.p1?.name.charAt(0)}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-brand-primary border-2 border-white/20 flex items-center justify-center text-[10px] font-black text-brand-secondary">
                      {s.p2?.name.charAt(0)}
                    </div>
                  </div>
                  <p className={`text-xs font-black text-white`}>{s.p1?.name} + {s.p2?.name}</p>
                </div>
                <p className="text-xs font-black text-brand-primary drop-shadow-sm">{s.wins} Vitórias</p>
              </div>
            )) : (
              <p className="text-center py-8 text-white/40 text-xs font-bold uppercase tracking-widest">Sem dados de sinergia</p>
            )}
          </div>
        </div>

        <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Swords className="w-5 h-5 text-brand-primary" />
            </div>
            <h4 className={`text-xs font-black uppercase tracking-widest text-brand-primary`}>Maiores Rivalidades</h4>
          </div>
          <div className="space-y-4">
            {globalRelationships.rivalries.length > 0 ? globalRelationships.rivalries.map((r, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-brand-primary/40`}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black text-white`}>{r.winner?.name}</span>
                    <span className="text-[10px] font-black text-white/40">vs</span>
                    <span className={`text-xs font-black text-white`}>{r.loser?.name}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-brand-primary drop-shadow-sm">{r.wins} Vitórias</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-8 text-white/40 text-xs font-bold uppercase tracking-widest">Sem dados de rivalidade</p>
            )}
          </div>
        </div>
      </div>

      {/* Ranking for Selected Period */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-white/5`}>
              <Filter className="w-5 h-5 text-brand-primary" />
            </div>
            <h3 className={`text-xl font-black uppercase tracking-tight text-white`}>
              {rankingPeriod === 'session' 
                ? (selectedDailyDate === 'Hoje' ? 'Ranking de Hoje' : `Ranking de ${formatBrazilianDate(selectedDailyDate)}`)
                : 'Ranking Geral Acumulado'}
              <HelpTooltip 
                title={rankingPeriod === 'session' ? "Ranking da Sessão" : "Ranking Geral"} 
                content={rankingPeriod === 'session' 
                  ? "Este ranking mostra o desempenho apenas na sessão selecionada, focando no ganho de ELO imediato." 
                  : "Este é o ranking histórico acumulado de todos os tempos, baseado no ELO atual de cada sócio."}
              />
            </h3>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
            <input 
              type="text" 
              placeholder="Buscar sócio..."
              value={rankingSearchQuery}
              onChange={(e) => setRankingSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-[10px] font-bold transition-all outline-none bg-white/5 border-brand-primary/40 text-white placeholder:text-white/20 focus:ring-2 focus:ring-brand-primary border`}
            />
          </div>
        </div>

        <div className={`bg-brand-light backdrop-blur-xl border-white/5 border-l-[8px] border-l-brand-primary rounded-[2.5rem] shadow-2xl overflow-hidden border`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`bg-white/5 border-b border-brand-primary/40`}>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">J</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">V</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">D</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">%</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Eficiência</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">ELO</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-white/5`}>
                {[...players]
                  .filter(p => {
                    const stats = topStats.dailyStats[p.id];
                    const hasPlayed = rankingPeriod === 'session' ? (stats && stats.matches > 0) : (p.matchesPlayed > 0);
                    const matchesSearch = p.name.toLowerCase().includes(rankingSearchQuery.toLowerCase());
                    return hasPlayed && matchesSearch;
                  })
                  .sort((a, b) => {
                    if (rankingPeriod === 'session') {
                      const statsA = topStats.dailyStats[a.id];
                      const statsB = topStats.dailyStats[b.id];
                      return (statsB.eloGain || 0) - (statsA.eloGain || 0) || (statsB.wins || 0) - (statsA.wins || 0);
                    }
                    return (b.elo || 0) - (a.elo || 0);
                  })
                  .map((player, idx) => {
                    const stats = topStats.dailyStats[player.id];
                    const matchesPlayed = rankingPeriod === 'session' ? stats.matches : player.matchesPlayed;
                    const wins = rankingPeriod === 'session' ? stats.wins : player.wins;
                    const eloValue = rankingPeriod === 'session' ? stats.eloGain : Math.round(player.elo);
                    const winRate = Math.round((wins / (matchesPlayed || 1)) * 100);
                    
                    return (
                      <tr key={player.id} className={`transition-colors group hover:bg-white/5`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-white/40 w-4">{idx + 1}</span>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-colors bg-white/5 text-white group-hover:bg-brand-primary/20 group-hover:text-brand-primary`}>
                              {player.name.charAt(0)}
                            </div>
                            <div>
                              <p className={`text-xs font-black uppercase tracking-tight text-white`}>{player.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[8px] font-black uppercase tracking-widest ${getPlayerTier(player).color}`}>
                                  {getPlayerTier(player).label}
                                </span>
                                {player.isOfficialSetter && (
                                  <>
                                    <span className="text-[8px] text-white/20">•</span>
                                    <span className="text-[8px] font-black text-brand-primary uppercase tracking-widest">Levantador</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-center text-xs font-bold text-white/80`}>{matchesPlayed}</td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-brand-primary">{wins}</td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-white/40">{matchesPlayed - wins}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${winRate >= 50 ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/10 text-white/40'}`}>
                            {winRate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-white/60">
                              {rankingPeriod === 'session' 
                                ? (stats.eloGain / (stats.matches || 1)).toFixed(1)
                                : ((player.wins || 0) / (player.matchesPlayed || 1) * 100).toFixed(0) + "%"
                              }
                            </span>
                            <span className="text-[8px] font-bold text-white/20 uppercase">
                              {rankingPeriod === 'session' ? 'ELO/J' : 'APROV.'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black ${rankingPeriod === 'career' || eloValue >= 0 ? 'text-brand-primary' : 'text-white/40'}`}>
                              {rankingPeriod === 'session' && eloValue >= 0 ? '+' : ''}{eloValue}
                            </span>
                            <span className="text-[8px] font-bold text-white/40 uppercase">
                              {rankingPeriod === 'session' ? 'Pontos' : 'RANK ELO'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {[...players].filter(p => topStats.dailyStats[p.id]?.matches > 0).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Nenhuma partida registrada para este dia</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
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
        <div 
          role="button"
          tabIndex={0}
          onClick={() => {
            setModalTarget('selected');
            setIsListModalOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setModalTarget('selected');
              setIsListModalOpen(true);
            }
          }}
          className={`w-full px-6 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-between gap-3 shadow-sm transition-all border cursor-pointer ${
            isDark 
              ? 'bg-brand-secondary border-brand-primary/40 text-white hover:bg-white/5' 
              : 'bg-brand-light border border-brand-primary/40 text-brand-secondary dark:text-white hover:bg-brand-secondary'
          }`}
        >
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-brand-primary" />
            <span className="flex items-center">
              {selectedPlayer ? `Analisando: ${selectedPlayer.name || "Sócio sem nome"}` : 'Selecionar Sócio para Análise'}
              <HelpTooltip 
                title="Análise Individual" 
                content="Veja estatísticas detalhadas de um jogador específico. Compare o desempenho com outros jogadores e descubra sinergias (com quem joga melhor) e rivalidades (contra quem mais perde)."
              />
            </span>
          </div>
          <ChevronRight className="w-5 h-5 opacity-40" />
        </div>

          {selectedPlayer ? (
            <motion.div 
              key={selectedPlayer.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Profile Card - DAILY PERFORMANCE */}
              <div className="bg-brand-light backdrop-blur-xl rounded-[3rem] p-8 text-brand-secondary dark:text-white shadow-2xl relative overflow-hidden border border-white/5 border-l-[8px] border-l-brand-primary">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                  <Activity className="w-32 h-32 rotate-12 text-brand-primary" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-3xl font-black border border-brand-primary/40 text-white">
                      {(selectedPlayer.name || "S").charAt(0)}
                    </div>
                    <div>
                      <h3 className={`text-3xl font-black uppercase tracking-tighter ${selectedPlayer.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>{selectedPlayer.name || "Sócio sem nome"}</h3>
                      <p className={`text-xs font-black uppercase tracking-[0.2em] mt-1 ${getPlayerTier(selectedPlayer).color}`}>
                        {getPlayerTier(selectedPlayer).label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-white/5 px-6 py-4 rounded-3xl border border-brand-primary/40 text-center">
                      <p className="text-4xl font-black font-mono text-brand-primary">
                        {topStats.dailyStats[selectedPlayer.id]?.eloGain >= 0 ? '+' : ''}{topStats.dailyStats[selectedPlayer.id]?.eloGain || 0}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Saldo ELO {selectedDailyDate === 'Hoje' ? 'Hoje' : 'na Data'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white mb-1">Vitórias (Sessão)</p>
                    <p className="text-xl font-black text-brand-primary">{topStats.dailyStats[selectedPlayer.id]?.wins || 0}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white mb-1">Partidas (Sessão)</p>
                    <p className="text-xl font-black text-brand-primary">{topStats.dailyStats[selectedPlayer.id]?.matches || 0}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white mb-1">Aproveitamento (Sessão)</p>
                    <p className="text-xl font-black text-brand-primary">
                      {topStats.dailyStats[selectedPlayer.id]?.matches > 0 ? Math.round((topStats.dailyStats[selectedPlayer.id].wins / topStats.dailyStats[selectedPlayer.id].matches) * 100) : 0}%
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white mb-1">Eficiência (Sessão)</p>
                    <p className="text-xl font-black text-brand-primary">
                      {topStats.dailyStats[selectedPlayer.id]?.matches > 0 ? (topStats.dailyStats[selectedPlayer.id].eloGain / topStats.dailyStats[selectedPlayer.id].matches).toFixed(1) : "0.0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Accumulated Results Card - CAREER */}
              <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-white/5`}>
                      <History className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Resultados Acumulados (Carreira)</h4>
                  </div>
                  <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{selectedPlayer.elo} ELO Global</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className={`p-6 rounded-[2rem] border bg-white/5 border-white/5 border-l-[6px] border-l-brand-primary`}>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Total Vitórias</p>
                    <p className="text-3xl font-black text-brand-primary">{selectedPlayer.wins || 0}</p>
                  </div>
                  <div className={`p-6 rounded-[2rem] border bg-white/5 border-white/5 border-l-[6px] border-l-brand-primary`}>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Total Derrotas</p>
                    <p className="text-3xl font-black text-white/40">{selectedPlayer.losses || 0}</p>
                  </div>
                  <div className={`p-6 rounded-[2rem] border bg-white/5 border-white/5 border-l-[6px] border-l-brand-primary`}>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Total Partidas</p>
                    <p className={`text-3xl font-black text-white/80`}>{selectedPlayer.matchesPlayed || 0}</p>
                  </div>
                  <div className={`p-6 rounded-[2rem] border bg-white/5 border-white/5 border-l-[6px] border-l-brand-primary`}>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Aproveitamento Final</p>
                    <p className={`text-3xl font-black text-brand-primary`}>
                      {selectedPlayer.matchesPlayed > 0 ? Math.round((selectedPlayer.wins / selectedPlayer.matchesPlayed) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ELO Evolution Chart */}
                <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-primary/10 rounded-xl">
                        <Activity className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Evolução de ELO</h4>
                    </div>
                    
                    {/* Chart Menu: Time Range */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                      {(['7', '30', 'all'] as const).map((range) => (
                        <button
                          key={range}
                          onClick={() => setTimeRange(range)}
                          className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                            timeRange === range 
                              ? 'bg-brand-primary text-brand-secondary shadow-sm' 
                              : 'text-white/40 hover:text-brand-primary'
                          }`}
                        >
                          {range === 'all' ? 'Tudo' : `${range}D`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={eloChartData}>
                        <defs>
                          <linearGradient id="colorElo" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F5C429" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#F5C429" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                          dy={10}
                        />
                        <YAxis 
                          width={40}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                          domain={['dataMin - 50', 'dataMax + 50']}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: '#1E232D',
                            color: '#fff'
                          }}
                          itemStyle={{ color: '#F5C429' }}
                          labelStyle={{ color: '#fff', marginBottom: '4px' }}
                        />
                        <Legend 
                          verticalAlign="top" 
                          align="right" 
                          height={36}
                          iconType="circle"
                          wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fff' }}
                        />
                        <Area 
                          name={selectedPlayer.name}
                          type="monotone" 
                          dataKey="elo" 
                          stroke="#F5C429" 
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#colorElo)" 
                          animationDuration={1500}
                        />
                        <Line 
                          name="Média do Grupo"
                          type="monotone" 
                          dataKey="groupAverage" 
                          stroke="#ffffff" 
                          strokeWidth={2} 
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Daily Performance Chart */}
                <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-primary/10 rounded-xl">
                        <TrendingUp className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>
                        {chartMetric === 'elo' ? 'Variação de ELO' : chartMetric === 'winrate' ? 'Aproveitamento Diário' : 'Partidas por Dia'}
                      </h4>
                    </div>
                    
                    {/* Chart Menu: Metric */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                      {(['elo', 'winrate', 'matches'] as const).map((metric) => (
                        <button
                          key={metric}
                          onClick={() => setChartMetric(metric)}
                          className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                            chartMetric === metric 
                              ? 'bg-brand-primary text-brand-secondary shadow-sm' 
                              : 'text-white/40 hover:text-brand-primary'
                          }`}
                        >
                          {metric === 'elo' ? 'ELO' : metric === 'winrate' ? 'Win%' : 'Jogos'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                          dy={10}
                        />
                        <YAxis 
                          width={40}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: '#1E232D',
                            color: '#fff'
                          }}
                          itemStyle={{ color: '#F5C429' }}
                          labelStyle={{ color: '#fff', marginBottom: '4px' }}
                          formatter={(value: number) => {
                            if (chartMetric === 'elo') return [`${value >= 0 ? '+' : ''}${value} Pontos`, 'Variação'];
                            if (chartMetric === 'winrate') return [`${value}%`, 'Aproveitamento'];
                            return [`${value}`, 'Partidas'];
                          }}
                        />
                        <Bar dataKey={chartMetric === 'elo' ? 'variation' : chartMetric === 'winrate' ? 'winRate' : 'matches'} radius={[8, 8, 0, 0]}>
                          {dailyPerformanceData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={
                                chartMetric === 'elo' 
                                  ? (entry.variation >= 0 ? '#F5C429' : '#ffffff')
                                  : '#F5C429'
                              } 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Win/Loss Evolution Chart */}
                <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-brand-primary/10 rounded-xl">
                      <History className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Evolução de Vitórias e Derrotas</h4>
                  </div>
                  <WinLossChart matches={matches} playerId={selectedPlayer.id} isDark={true} />
                </div>

                {/* Performance Trends Line Charts */}
                <div className={`bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border flex flex-col`}>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-primary/10 rounded-xl">
                        <TrendingUp className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Tendência de Aproveitamento</h4>
                    </div>
                    <div className="px-3 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-[10px] font-black uppercase">
                      Últimas 15 Partidas
                    </div>
                  </div>
                  
                  <div className="flex-1 min-h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={winRateHistory}>
                        <defs>
                          <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F5C429" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#F5C429" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                          dataKey="match" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                          label={{ value: 'Partida', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 800, fill: '#ffffff' }}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#ffffff' }}
                          tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                            fontSize: '12px', 
                            fontWeight: 'bold',
                            backgroundColor: '#1E232D',
                            color: '#fff'
                          }}
                          itemStyle={{ color: '#F5C429' }}
                          labelStyle={{ color: '#fff', marginBottom: '4px' }}
                          formatter={(value) => [`${value}%`, 'Aproveitamento']}
                          labelFormatter={(label) => `Partida ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="winRate" 
                          stroke="#F5C429" 
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#colorWinRate)"
                          dot={false}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          animationDuration={1500}
                        />
                        <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: 'Equilíbrio', position: 'right', fill: '#94a3b8', fontSize: 8, fontWeight: 800 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className={`mt-8 pt-6 border-t grid grid-cols-2 gap-4 border-white/5`}>
                    <div className={`p-4 rounded-2xl border bg-white/5 border-brand-primary/40`}>
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Pico de Aproveitamento</p>
                      <p className="text-xl font-black text-brand-primary">
                        {winRateHistory.length > 0 ? Math.max(...winRateHistory.map(h => h.winRate)) : 0}%
                      </p>
                    </div>
                    <div className={`p-4 rounded-2xl border bg-white/5 border-brand-primary/40`}>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                        Consistência (Até 10 Jogos)
                        <HelpTooltip 
                          title="Análise de Consistência"
                          content="Analisa a variância de vitórias e derrotas com base nas suas últimas partidas (limite de 10 jogos)."
                        />
                      </span>
                      <p className={`text-xl font-black ${playerConsistency.color}`}>
                        {playerConsistency.label}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Stats: Performance Stability */}
              <div className="grid grid-cols-1 gap-8">
                <div className={`p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group flex flex-col border bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary`}>
                  <div className="relative z-10">
                    <div className="absolute top-0 right-0 p-8 flex gap-2">
                      <div className="group/info relative">
                        <Info className="w-5 h-5 text-white/20 hover:text-brand-primary transition-colors cursor-help" />
                        <div className="absolute right-0 top-full mt-2 w-64 p-4 bg-brand-secondary border border-brand-primary/40 rounded-2xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                          <p className="text-[10px] font-black text-brand-primary uppercase mb-2">Estabilidade de Performance</p>
                          <p className="text-[10px] leading-relaxed text-white/60 font-bold">
                            Este gráfico relaciona o seu aproveitamento (Win Rate) com a duração das partidas. 
                            Uma linha estável indica que você mantém o mesmo nível de jogo independente se a partida é curta ou longa.
                          </p>
                        </div>
                      </div>
                      <Activity className="w-12 h-12 text-brand-primary opacity-10 group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-4">Estabilidade de Performance (Win Rate por Duração)</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black text-brand-primary">
                        {stabilityData.length > 0 ? Math.round(stabilityData.reduce((acc, d) => acc + d.winRate, 0) / stabilityData.length) : 0}%
                      </h3>
                      <span className="text-xs font-bold text-white/40 uppercase">Aproveitamento Médio</span>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 mt-2">Consistência técnica em diferentes tempos de jogo</p>
                  </div>
                  
                  <div className="h-48 mt-8 -mx-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stabilityData}>
                        <defs>
                          <linearGradient id="colorStability" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F5C429" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#F5C429" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis 
                          dataKey="duration" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#ffffff', fontSize: 10, fontWeight: 800 }}
                          tickFormatter={(val) => `${val}m`}
                          label={{ value: 'Duração (Minutos)', position: 'insideBottom', offset: -5, fill: 'rgba(255,255,255,0.6)', fontSize: 8, fontWeight: 800 }}
                        />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-brand-secondary border border-brand-primary/40 p-3 rounded-xl shadow-2xl">
                                  <p className="text-[10px] font-black text-white uppercase mb-1">Partidas de {data.duration} min</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-brand-primary">
                                      {data.winRate}% Win Rate
                                    </span>
                                    <span className="text-[10px] font-black text-white/40">
                                      ({data.total} jogos)
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="winRate" 
                          stroke="#F5C429"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorStability)"
                          dot={false}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                        <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Synergy & Rivalry */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`p-6 rounded-[2rem] border bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl`}>
                  <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-4">Sinergia Positiva</h4>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-white/5 border border-brand-primary/40`}>
                      <ArrowUpRight className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <p className={`font-black uppercase tracking-tight text-sm text-white`}>
                        {playerRelationships.synergy?.name || 'Parceiro Ideal'}
                      </p>
                      <p className="text-[10px] font-bold text-brand-primary">
                        {playerRelationships.synergy ? `${playerRelationships.synergy.wins} vitórias juntos` : 'Sem dados'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-[2rem] border bg-brand-secondary/30 backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl`}>
                  <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-4">Sinergia Negativa</h4>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-white/5 border border-brand-primary/40`}>
                      <TrendingDown className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <p className={`font-black uppercase tracking-tight text-sm text-white`}>
                        {playerRelationships.negativeSynergy?.name || 'Parceiro Difícil'}
                      </p>
                      <p className="text-[10px] font-bold text-brand-primary">
                        {playerRelationships.negativeSynergy ? `${playerRelationships.negativeSynergy.losses} derrotas juntos` : 'Sem dados'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-[2rem] border bg-brand-secondary/30 backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl`}>
                  <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-4">Maior Rival</h4>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-white/5 border border-brand-primary/40`}>
                      <Swords className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <p className={`font-black uppercase tracking-tight text-sm text-white`}>
                        {playerRelationships.rivalry?.name || 'Nenhum Rival'}
                      </p>
                      <p className="text-[10px] font-bold text-brand-primary">
                        {playerRelationships.rivalry ? `${playerRelationships.rivalry.losses} derrotas contra` : 'Sem histórico de confrontos'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Comparison Section */}
              <div className={`bg-brand-secondary/30 backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-white/5 border border-brand-primary/40`}>
                      <Activity className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Comparativo de Performance</h4>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setModalTarget('comparison');
                        setIsListModalOpen(true);
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/60 border border-brand-primary/40`}
                    >
                      <Users className="w-3 h-3" />
                      {comparisonPlayer ? `Comparar com: ${comparisonPlayer.name}` : 'Comparar com Sócio'}
                    </button>
                    {comparisonPlayer && (
                      <button 
                        onClick={() => setComparisonPlayerId(null)}
                        className={`p-2 rounded-xl transition-all bg-white/5 hover:bg-red-500/20 text-red-500 border border-brand-primary/40`}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.05)" : "#E9ECEF"} />
                      <XAxis 
                        dataKey="subject" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#ffffff' : '#4A4F5A' }}
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : '#E9ECEF' }}
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: '#1E232D',
                          color: '#fff'
                        }}
                        itemStyle={{ color: '#F5C429' }}
                        labelStyle={{ color: '#fff', marginBottom: '4px' }}
                      />
                      <Bar name={selectedPlayer.name} dataKey="A" fill="#F5C429" radius={[6, 6, 0, 0]} barSize={30} />
                      <Bar name={comparisonPlayer?.name || 'Média Grupo'} dataKey="B" fill={isDark ? '#ffffff' : '#4A4F5A'} radius={[6, 6, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-8">
                  {comparisonData.map((d, i) => (
                    <div key={i} className={`text-center p-4 rounded-2xl border ${isDark ? 'bg-white/5 border-brand-primary/40' : 'bg-brand-secondary border-brand-primary/40'}`}>
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-2">{d.subject}</p>
                      <div className="flex justify-center items-center gap-2">
                        <span className="text-sm font-black text-brand-primary">{Math.round(d.A)}</span>
                        <span className="text-[10px] font-bold text-white/40">vs</span>
                        <span className={`text-sm font-black ${isDark ? 'text-white/60' : 'text-white'}`}>{Math.round(d.B)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-brand-secondary/30 backdrop-blur-xl rounded-[3rem] border border-dashed border-white/5 border-l-[8px] border-l-brand-primary">
              <div className="w-20 h-20 bg-brand-secondary rounded-full flex items-center justify-center shadow-2xl mb-6 border border-brand-primary/40">
                <Users className="w-10 h-10 text-white/40" />
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Selecione um Sócio</h3>
              <p className="text-sm font-bold text-white/40 mt-2">Clique em um jogador na lista para ver sua análise detalhada.</p>
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
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border bg-black backdrop-blur-2xl border-white/5 border-l-[8px] border-l-brand-primary`}
            >
              <div className={`p-8 border-b bg-white/5 border-brand-primary/40`}>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className={`text-2xl font-black uppercase tracking-tighter text-white`}>Lista de Sócios</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{(players?.length || 0)} Atletas Registrados</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsListModalOpen(false);
                      setModalSearchQuery('');
                    }}
                    className={`p-3 rounded-2xl transition-colors shadow-sm bg-white/5 hover:bg-white/10 text-white/60`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nome..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className={`w-full pl-12 pr-6 py-4 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none bg-white/5 border-brand-primary/40 text-white placeholder:text-white/20`}
                  />
                  {modalSearchQuery && (
                    <button 
                      onClick={() => setModalSearchQuery('')}
                      className={`absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors hover:bg-white/10`}
                    >
                      <RotateCcw className="w-3 h-3 text-white/40" />
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
                          className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                            isSelected 
                              ? 'bg-brand-primary border-brand-primary text-black shadow-lg shadow-brand-primary/20' 
                              : `bg-white/5 border-brand-primary/40 hover:border-brand-primary/50 text-white`
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${
                            isSelected ? 'bg-black/20 text-black' : `bg-white/5 text-white`
                          }`}>
                            {player.name.charAt(0)}
                          </div>
                          <div>
                            <p className={`font-black uppercase tracking-tight text-sm ${!isSelected && player.isOfficialSetter ? 'text-brand-primary' : ''}`}>{player.name}</p>
                            <p className={`text-[9px] font-bold uppercase ${isSelected ? 'text-black/80' : 'text-white/40'}`}>
                              {translateGender(player.gender)} • ELO: {player.elo} • {player.wins}V • Impacto: {((player.elo - 1000) / (player.matchesPlayed || 1)).toFixed(1)}
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
