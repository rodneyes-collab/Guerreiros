import { useShallow } from 'zustand/react/shallow';
import { SynergyAnalysis } from './SynergyAnalysis';
import { AICoach } from './AICoach';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { useNarration } from '../src/hooks/useNarration';
import { useAIStatus } from '../src/hooks/useAIStatus';
import { Player } from '../types';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { getFirestoreDateKey } from '../firebase';
import { getPlayerTier, getEfficiencyTier } from '../utils/tierUtils';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Users, 
  Calendar,
  CalendarCheck,
  ChevronRight,
  Activity,
  ArrowUpRight,
  Minus,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  Swords,
  Star,
  History,
  X,
  Info,
  Share2,
  Copy,
  BarChart3,
  Volume2,
  Clock,
  Timer,
  BrainCircuit
} from 'lucide-react';
import { 
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
  Legend,
  ReferenceLine
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { WinLossChart } from '../src/components/WinLossChart';
import { IcEvolutionChart } from '../src/components/IcEvolutionChart';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { LiquidGlassCardsStudio } from '../src/components/LiquidGlassCardsStudio';
import { translateGender, capitalizeName } from '../utils/helpers';
import { detectAnomalies } from '../services/geminiService';
import { calculateCompositePerformanceRating } from '../utils/teamLogic';
import { calculateMvpEfficiencyScore, calculateDailyAvgPointDiff } from '../utils/statsLogic';
import { calculateSetterStats, calculateSetterScore } from '../utils/setterStats';

import { GlobalStats } from './DashboardView';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';

interface RankingViewProps {
  userRole: 'ADMIN' | 'MEMBER';
  refreshPlayers: () => Promise<void>;
  handleAnnounceSummary: (data?: any) => void;
  isNarratingSummary: boolean;
  resetDailyMatches: () => Promise<void>;
  fixDatabaseAnomalies: () => Promise<void>;
  isDark?: boolean;
}

export const RankingView: React.FC<RankingViewProps> = ({
  userRole,
  refreshPlayers,
  handleAnnounceSummary,
  isNarratingSummary,
  resetDailyMatches,
  fixDatabaseAnomalies,
  isDark = false
}) => {
  const { status: aiStatus } = useAIStatus();
  const { 
    players: allPlayers, 
    matches, 
    attendance, 
    isSyncing, 
    currentPlayer, 
    setNarrationAudio, 
    narrationAudio, 
    isNarrating: isNarratingFromStore,
    isNarratingSummary: isNarratingSummaryFromStore,
    showNotification, 
    selectedRankingPlayerId, 
    setSelectedRankingPlayerId, 
    systemMetadata 
  } = useStore(useShallow(state => ({
    players: state.players,
    matches: state.matches,
    attendance: state.attendance,
    isSyncing: state.isSyncing,
    currentPlayer: state.currentPlayer,
    setNarrationAudio: state.setNarrationAudio,
    narrationAudio: state.narrationAudio,
    isNarrating: state.isNarrating,
    isNarratingSummary: state.isNarratingSummary,
    showNotification: state.showNotification,
    selectedRankingPlayerId: state.selectedRankingPlayerId,
    setSelectedRankingPlayerId: state.setSelectedRankingPlayerId,
    systemMetadata: state.systemMetadata
  })));
  
  const { handleAnnounce, playAudioContent } = useNarration();
  const activeIsNarrating = isNarratingSummaryFromStore || isNarratingFromStore || isNarratingSummary;

  const players = useMemo(() => allPlayers.filter(p => 
    (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && 
    !p.isDM && 
    p.name?.toLowerCase() !== 'financeiro'
  ), [allPlayers]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'individual' | 'global' | 'synergy' | 'coach' | 'cards'>('daily');
  const [rankingPeriod, setRankingPeriod] = useState<'session' | 'career'>('session');
  const [rankingSortMetric, setRankingSortMetric] = useState<'elo' | 'efficiency' | 'fidelity' | 'efficiency_mvp'>('elo');
  
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterSocioId, setFilterSocioId] = useState<string>('all');
  
  const today = useMemo(() => getFirestoreDateKey(), []);
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(today);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const handleAuditData = async () => {
    setIsAuditing(true);
    setAuditReport(null);
    setShowAuditModal(true);
    
    try {
      const dataToAnalyze = {
        players,
        matches,
        metadata: {
          sessionDate: selectedDailyDate,
          totalMatches: matches.length,
          activePlayersCount: players.length
        }
      };
      const report = await detectAnomalies(dataToAnalyze);
      setAuditReport(report);
    } catch (error) {
      setAuditReport("Falha ao realizar a auditoria de dados.");
    } finally {
      setIsAuditing(false);
    }
  };

  // Cache de formatação de data em Brasília para performance O(1)
  const brDateFormatter = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }), []);

  const getMatchDate = useCallback((m: { date?: string; timestamp?: number }): string => {
    if (m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) {
      return m.date;
    }
    if (m.timestamp) {
      return brDateFormatter.format(new Date(m.timestamp));
    }
    return m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
  }, [brDateFormatter]);

  const matchesDate = useCallback((m: { date?: string; timestamp?: number }, targetDate: string): boolean => {
    if (!targetDate) return false;
    const directDate = m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
    if (directDate === targetDate) return true;
    return getMatchDate(m) === targetDate;
  }, [getMatchDate]);

  const sessionMatches = useMemo(() => {
    return selectedDailyDate === 'global' ? matches : matches.filter(m => matchesDate(m, selectedDailyDate));
  }, [matches, selectedDailyDate, matchesDate]);

  const effectiveMatches = useMemo(() => {
    let ms = rankingPeriod === 'session' ? sessionMatches : matches;
    if (rankingPeriod === 'career') {
      if (filterStartDate) {
        ms = ms.filter(m => (m.date || getMatchDate(m)) >= filterStartDate);
      }
      if (filterEndDate) {
        ms = ms.filter(m => (m.date || getMatchDate(m)) <= filterEndDate);
      }
    }
    return ms;
  }, [sessionMatches, matches, rankingPeriod, filterStartDate, filterEndDate, getMatchDate]);

  useEffect(() => {
    if (selectedRankingPlayerId) {
      setSelectedPlayerId(selectedRankingPlayerId);
      setActiveTab('individual');
      setRankingPeriod('career');
      setSelectedRankingPlayerId(null);
    }
  }, [selectedRankingPlayerId, setSelectedRankingPlayerId]);

  useEffect(() => {
    if (userRole === 'MEMBER' && currentPlayer && !selectedPlayerId) {
      setSelectedPlayerId(currentPlayer.id);
    }
  }, [userRole, currentPlayer, selectedPlayerId]);

  const [rankingSearchQuery, setRankingSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'all'>('all');
  const [comparisonPlayerId, setComparisonPlayerId] = useState<string | null>(null);
  const [showEloStatement, setShowEloStatement] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<'selected' | 'comparison'>('selected');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  
  const formatBrazilianDate = useCallback((dateString: string | number) => {
    try {
      if (typeof dateString === 'string' && !dateString.includes('T')) {
        const [, month, day] = dateString.split('-');
        if (day && month) return `${day}/${month}`;
      }
      const dateObj = new Date(dateString);
      return new Intl.DateTimeFormat('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        day: '2-digit', 
        month: '2-digit' 
      }).format(dateObj);
    } catch {
      return 'Data';
    }
  }, []);

  const calculateWilsonScore = (wins: number, total: number, z: number = 1.96) => {
    if (total === 0) return 0;
    const p = wins / total;
    const denominator = 1 + (z * z) / total;
    const center = p + (z * z) / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.max(0, (center - spread) / denominator);
  };

  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

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
      if (distance > 10 && e.cancelable) {
        e.preventDefault();
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

  // Durações totais de carreira pré-calculadas em O(N)
  const careerTotalDurations = useMemo(() => {
    const totals: Record<string, number> = {};
    matches.forEach(m => {
      const dur = m.duration || 720;
      (m.teamA || []).forEach(id => { totals[id] = (totals[id] || 0) + dur; });
      (m.teamB || []).forEach(id => { totals[id] = (totals[id] || 0) + dur; });
    });
    return totals;
  }, [matches]);

  const topPlayer = useMemo(() => {
    if (!players || players.length === 0) return null;
    const sorted = [...players].sort((a, b) => {
      const eloB = b.elo || 1200;
      const eloA = a.elo || 1200;
      if (eloB !== eloA) return eloB - eloA;
      
      const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.33);
      const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.33);
      if (Math.abs(effB - effA) > 0.0001) return effB - effA;
      
      return (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0);
    });
    return sorted[0];
  }, [players, careerTotalDurations]);

  const selectedPlayer = useMemo(() => {
    if (!players) return null;
    return players.find(p => p.id === (selectedPlayerId || topPlayer?.id));
  }, [players, selectedPlayerId, topPlayer]);

  const comprehensiveHistory = useMemo(() => {
    if (!selectedPlayer) return [];
    const historyArr = [...(selectedPlayer.eloHistory || [])];
    const playerMatches = matches
      .filter(m => m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    const matchesByDate: Record<string, typeof playerMatches> = {};
    playerMatches.forEach(m => {
      const d = getMatchDate(m) || m.date;
      if (!matchesByDate[d]) matchesByDate[d] = [];
      matchesByDate[d].push(m);
    });

    const finalHistory: any[] = [];
    const processedMatchIds = new Set<string>();
    const processedHistoryIndices = new Set<number>();

    historyArr.forEach((hEntry, hIdx) => {
      if (hEntry.matchId) {
        const match = playerMatches.find(m => m.id === hEntry.matchId);
        if (match) {
          finalHistory.push({ ...hEntry, matchDetails: match });
          processedMatchIds.add(match.id);
          processedHistoryIndices.add(hIdx);
        }
      }
    });

    historyArr.forEach((hEntry, hIdx) => {
      if (processedHistoryIndices.has(hIdx)) return;
      const isInitial = hIdx === 0 && historyArr.length > 1;
      const dayMatches = matchesByDate[hEntry.date] || [];
      const match = !isInitial ? dayMatches.find(m => !processedMatchIds.has(m.id)) : null;

      if (match) {
        finalHistory.push({ ...hEntry, matchDetails: match });
        processedMatchIds.add(match.id);
      } else {
        finalHistory.push({ ...hEntry });
      }
      processedHistoryIndices.add(hIdx);
    });

    playerMatches.forEach(m => {
      if (!processedMatchIds.has(m.id)) {
        const isTeamA = m.teamA.includes(selectedPlayer.id);
        const won = (m.winner === 'A' && isTeamA) || (m.winner === 'B' && !isTeamA);
        const change = (m.winner as string) === 'Draw' ? 0 : (won ? 20 : -20);
        finalHistory.push({
          date: getMatchDate(m) || m.date,
          matchId: m.id,
          timestamp: m.timestamp,
          result: (won ? 'V' : 'D') as 'V' | 'D',
          change,
          matchDetails: m
        });
      }
    });

    finalHistory.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
      return timeA - timeB; 
    });

    let nextElo = selectedPlayer.elo || 1200;
    for (let i = finalHistory.length - 1; i >= 0; i--) {
      const entry = finalHistory[i];
      if (entry.change === undefined && i > 0 && entry.elo !== undefined) {
        const prevEntry = finalHistory[i - 1];
        if (prevEntry.elo !== undefined) {
          entry.change = entry.elo - prevEntry.elo;
        }
      }
      if (entry.elo !== undefined) {
        nextElo = entry.elo;
      } else {
        entry.elo = nextElo;
      }
      const change = entry.change !== undefined ? entry.change : 0;
      nextElo = nextElo - change;
    }

    return finalHistory.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
      return timeB - timeA;
    });
  }, [selectedPlayer, matches, getMatchDate]);

  const comparisonPlayer = useMemo(() => {
    if (!players) return null;
    return players.find(p => p.id === comparisonPlayerId);
  }, [players, comparisonPlayerId]);

  const playerRelationships = useMemo(() => {
    if (!selectedPlayer) return { synergy: null, negativeSynergy: null, rivalry: null };

    let bestSynergy = { name: 'Nenhum', wins: 0 };
    let worstNegativeSynergy = { name: 'Nenhum', losses: 0 };
    let worstRival = { name: 'Nenhum', losses: 0 };

    const syn: Record<string, number> = {};
    const nSyn: Record<string, number> = {};
    const riv: Record<string, number> = {};

    const sourceMatches = rankingPeriod === 'session' ? effectiveMatches : matches;

    sourceMatches.forEach(m => {
      if (!m.winner) return;
      const winners = m.winner === 'A' ? m.teamA : m.teamB;
      const losers = m.winner === 'A' ? m.teamB : m.teamA;

      if (winners && winners.includes(selectedPlayer.id)) {
        winners.forEach(id => {
          if (id !== selectedPlayer.id) syn[id] = (syn[id] || 0) + 1;
        });
      }
      if (losers && losers.includes(selectedPlayer.id)) {
        losers.forEach(id => {
          if (id !== selectedPlayer.id) nSyn[id] = (nSyn[id] || 0) + 1;
        });
        if (winners) {
          winners.forEach(id => {
            riv[id] = (riv[id] || 0) + 1;
          });
        }
      }
    });

    Object.entries(syn).forEach(([id, wins]) => {
      const p = players.find(pl => pl.id === id);
      if (p && wins > bestSynergy.wins) bestSynergy = { name: p.name || 'Sócio', wins };
    });
    Object.entries(nSyn).forEach(([id, losses]) => {
      const p = players.find(pl => pl.id === id);
      if (p && losses > worstNegativeSynergy.losses) worstNegativeSynergy = { name: p.name || 'Sócio', losses };
    });
    Object.entries(riv).forEach(([id, losses]) => {
      const p = players.find(pl => pl.id === id);
      if (p && losses > worstRival.losses) worstRival = { name: p.name || 'Sócio', losses };
    });

    return { 
      synergy: bestSynergy.wins > 0 ? bestSynergy : null, 
      negativeSynergy: worstNegativeSynergy.losses > 0 ? worstNegativeSynergy : null,
      rivalry: worstRival.losses > 0 ? worstRival : null 
    };
  }, [selectedPlayer, players, rankingPeriod, effectiveMatches, matches]);

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

  const eloChartData = useMemo(() => {
    if (!selectedPlayer?.eloHistory) return [];
    let history = [...selectedPlayer.eloHistory];
    
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      history = history.filter(h => h.date >= cutoffStr);
    }
    
    return history.map(h => {
      const dateStr = h.date;
      const groupElosAtDate = players.map(p => {
        if (!p.eloHistory || p.eloHistory.length === 0) return p.elo || 1200;
        const historyBefore = p.eloHistory
          .filter(entry => entry.date <= dateStr)
          .sort((a, b) => b.date.localeCompare(a.date));
        return historyBefore.length > 0 ? historyBefore[0].elo : 1200;
      });
      const avgAtDate = Math.round(groupElosAtDate.reduce((a, b) => a + b, 0) / (players.length || 1));

      return {
        date: formatBrazilianDate(dateStr),
        fullDate: dateStr,
        elo: h.elo,
        groupAverage: avgAtDate
      };
    });
  }, [selectedPlayer, players, timeRange, formatBrazilianDate]);

  const winRateHistory = useMemo(() => {
    if (!selectedPlayer || !effectiveMatches || effectiveMatches.length === 0) return [];
    const playerMatches = effectiveMatches
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
    }).slice(-15);
  }, [selectedPlayer, effectiveMatches, formatBrazilianDate]);

  const stabilityData = useMemo(() => {
    if (!selectedPlayer || !effectiveMatches) return [];
    const playerMatches = effectiveMatches.filter(m => 
      (m.teamA?.includes(selectedPlayer.id) || m.teamB?.includes(selectedPlayer.id)) &&
      (m.winner === 'A' || m.winner === 'B')
    );
    if (playerMatches.length === 0) return [];

    const buckets: Record<number, { wins: number, total: number }> = {};
    playerMatches.forEach(m => {
      const durationSeconds = m.duration || (m.startTime && m.endTime ? Math.round((m.endTime - m.startTime) / 1000) : 720);
      const durationMinutes = Math.max(6, Math.round(durationSeconds / 60));
      const bucket = Math.round(durationMinutes / 2) * 2;
      if (!buckets[bucket]) buckets[bucket] = { wins: 0, total: 0 };
      
      buckets[bucket].total++;
      const isTeamA = m.teamA?.includes(selectedPlayer.id);
      const isWinner = (m.winner === 'A' && isTeamA) || (m.winner === 'B' && !isTeamA);
      if (isWinner) buckets[bucket].wins++;
    });
    
    return Object.entries(buckets)
      .map(([duration, stats]) => ({
        duration: parseInt(duration),
        winRate: Math.round((stats.wins / stats.total) * 100),
        total: stats.total
      }))
      .sort((a, b) => a.duration - b.duration);
  }, [selectedPlayer, effectiveMatches]);

  const playerConsistency = useMemo(() => {
    if (!selectedPlayer || !effectiveMatches) return { label: 'Em Evolução', color: 'text-brand-primary' };
    const playerMatches = effectiveMatches
      .filter(m => m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
    if (playerMatches.length === 0) return { label: 'Sem Jogos', color: 'text-white/60' };
    
    const recentMatches = playerMatches.slice(0, 10);
    const wins = recentMatches.reduce((acc, m) => {
      const isWinner = (m.winner === 'A' && m.teamA.includes(selectedPlayer.id)) || 
                       (m.winner === 'B' && m.teamB.includes(selectedPlayer.id));
      return acc + (isWinner ? 1 : 0);
    }, 0);
    
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
  }, [selectedPlayer, effectiveMatches]);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach(m => {
      const d = getMatchDate(m);
      if (d) dates.add(d);
      else if (m.date) dates.add(m.date.includes('T') ? m.date.split('T')[0] : m.date);
    });
    dates.add(today);
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [matches, getMatchDate, today]);

  useEffect(() => {
    if (selectedDailyDate === today) return;
    if (availableDates.length > 0) {
      if (!selectedDailyDate || (!availableDates.includes(selectedDailyDate) && selectedDailyDate !== 'global')) {
        setSelectedDailyDate(availableDates[0]);
      }
    }
  }, [availableDates, selectedDailyDate, today]);

  const leaderboardMovements = useMemo(() => {
    if (!players || players.length === 0 || availableDates.length === 0) return {};

    let prevRefDate: string | null = null;
    if (rankingPeriod === 'career') {
      const latestSessionInHistory = availableDates[0];
      prevRefDate = latestSessionInHistory === today ? (availableDates[1] || null) : latestSessionInHistory;
    } else {
      const idx = availableDates.indexOf(selectedDailyDate);
      prevRefDate = idx !== -1 ? (availableDates[idx + 1] || null) : (availableDates[0] || null);
    }

    if (!prevRefDate) return {};

    const getEloAtDate = (player: any, date: string) => {
      const entry = player.eloHistory?.find((h: any) => h.date === date);
      if (entry && entry.elo !== undefined) return entry.elo;
      
      const historyBefore = (player.eloHistory || [])
        .filter((h: any) => h.date < date)
        .sort((a: any, b: any) => b.date.localeCompare(a.date));
      if (historyBefore.length > 0 && historyBefore[0].elo !== undefined) {
        return historyBefore[0].elo;
      }

      const matchesAfter = matches.filter(m => (getMatchDate(m) || m.date) > date && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
      let gainAfter = 0;
      matchesAfter.forEach(m => {
        const isWinner = (m.winner === 'A' && m.teamA.includes(player.id)) || (m.winner === 'B' && m.teamB.includes(player.id));
        gainAfter += isWinner ? 20 : -20;
      });
      return (player.elo || 1200) - gainAfter;
    };

    if (rankingPeriod === 'career') {
      const currentRankings = [...players]
        .filter(p => (p.matchesPlayed || 0) > 0)
        .map(p => ({
          id: p.id,
          elo: p.elo || 1200,
          eff: (p.trueSkill?.mu || 25) - 3 * (p.trueSkill?.sigma || 8.333),
          duration: careerTotalDurations[p.id] || 0
        }))
        .sort((a, b) => {
          if (b.elo !== a.elo) return b.elo - a.elo;
          if (Math.abs(b.eff - a.eff) > 0.0001) return b.eff - a.eff;
          return a.duration - b.duration;
        });

      const prevRankings = [...players]
        .filter(p => matches.some(m => (getMatchDate(m) || m.date) <= prevRefDate! && (m.teamA.includes(p.id) || m.teamB.includes(p.id))))
        .map(p => ({
          id: p.id,
          elo: getEloAtDate(p, prevRefDate!),
          eff: (p.trueSkill?.mu || 25) - 3 * (p.trueSkill?.sigma || 8.333),
          duration: careerTotalDurations[p.id] || 0
        }))
        .sort((a, b) => {
          if (b.elo !== a.elo) return b.elo - a.elo;
          if (Math.abs(b.eff - a.eff) > 0.0001) return b.eff - a.eff;
          return a.duration - b.duration;
        });

      const movements: Record<string, { diff: number; type: 'up' | 'down' | 'neutral' }> = {};
      currentRankings.forEach((p, currentIdx) => {
        const prevIdx = prevRankings.findIndex(prevP => prevP.id === p.id);
        if (prevIdx !== -1) {
          const diff = prevIdx - currentIdx;
          movements[p.id] = {
            diff: Math.abs(diff),
            type: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
          };
        } else {
          movements[p.id] = { diff: 0, type: 'neutral' };
        }
      });
      return movements;
    } else {
      const currMatches = matches.filter(m => matchesDate(m, selectedDailyDate));
      const prevMatches = prevRefDate ? matches.filter(m => matchesDate(m, prevRefDate)) : [];

      const getSessionStats = (pList: any[], sessionM: any[]) => {
        return pList
          .filter(p => sessionM.some(m => m.teamA.includes(p.id) || m.teamB.includes(p.id)))
          .map(p => {
            const pMatches = sessionM.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id));
            const gain = pMatches.reduce((acc, m) => {
              const isWinner = (m.winner === 'A' && m.teamA.includes(p.id)) || (m.winner === 'B' && m.teamB.includes(p.id));
              return acc + (isWinner ? 20 : -20);
            }, 0);
            const eff = (p.trueSkill?.mu || 25) - 3 * (p.trueSkill?.sigma || 8.333);
            const duration = pMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
            return { id: p.id, gain, eff, duration };
          })
          .sort((a, b) => {
            if (b.gain !== a.gain) return b.gain - a.gain;
            if (Math.abs(b.eff - a.eff) > 0.0001) return b.eff - a.eff;
            return a.duration - b.duration;
          });
      };

      const currRanked = getSessionStats(players, currMatches);
      const prevRanked = getSessionStats(players, prevMatches);

      const movements: Record<string, { diff: number; type: 'up' | 'down' | 'neutral' }> = {};
      currRanked.forEach((p, currentIdx) => {
        const prevIdx = prevRanked.findIndex(prevP => prevP.id === p.id);
        if (prevIdx !== -1) {
          const diff = prevIdx - currentIdx;
          movements[p.id] = {
            diff: Math.abs(diff),
            type: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
          };
        } else {
          movements[p.id] = { diff: 0, type: 'neutral' };
        }
      });
      return movements;
    }
  }, [players, availableDates, selectedDailyDate, today, rankingPeriod, matches, careerTotalDurations, getMatchDate, matchesDate]);

  const efficiencyRankings = useMemo(() => {
    const sorted = [...players]
      .filter(p => p.matchesPlayed > 0)
      .sort((a, b) => {
        const winRateA = (a.matchesPlayed || 0) > 0 ? (a.wins || 0) / a.matchesPlayed : 0;
        const winRateB = (b.matchesPlayed || 0) > 0 ? (b.wins || 0) / b.matchesPlayed : 0;
        if (Math.abs(winRateB - winRateA) > 0.0001) return winRateB - winRateA;
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        const saldoA = (a.pointsFor || 0) - (a.pointsAgainst || 0);
        const saldoB = (b.pointsFor || 0) - (b.pointsAgainst || 0);
        return saldoB - saldoA;
      });
    
    const ranks: Record<string, number> = {};
    sorted.forEach((p, idx) => {
      ranks[p.id] = idx + 1;
    });
    return ranks;
  }, [players]);

  /**
   * Cálculo Otimizado em Passada Única O(N) para Destaques e Estatísticas da Tabela
   */
  const topStats = useMemo(() => {
    if (!players || players.length === 0) return { 
      mvp: null, 
      bestSetter: null, 
      topElo: null, 
      dailyKing: null, 
      topImpact: null, 
      dailyMvp: null, 
      dailyBestSetter: null, 
      dailyMatchesCount: 0, 
      dailyEfficient: null, 
      mostEfficient: null,
      mostEfficientTechnical: null,
      dailyEfficientTechnical: null,
      totalDurations: careerTotalDurations,
      dailyStats: {} as Record<string, any>,
      getDailyAvgPointDiff: (_p: any) => 0
    };
    
    const MIN_MATCHES = 12;
    const resolvedDate = selectedDailyDate;
    const isCareerMode = rankingPeriod === 'career' || (rankingPeriod === 'session' && resolvedDate === 'global');
    const targetMatches = isCareerMode ? effectiveMatches : matches.filter(m => matchesDate(m, resolvedDate));
    const dailyMatchesCount = targetMatches.length;

    // Acumulação em Passada Única O(N) sobre targetMatches
    const dailyStats: Record<string, {
      matches: number;
      wins: number;
      eloGain: number;
      matchEloGain: number;
      fidelityGain: number;
      duration: number;
      pointsFor: number;
      pointsAgainst: number;
    }> = {};

    players.forEach(p => {
      dailyStats[p.id] = {
        matches: 0,
        wins: 0,
        eloGain: isCareerMode ? (p.elo || 1200) - 1200 : 0,
        matchEloGain: isCareerMode ? (p.elo || 1200) - 1200 - (p.fidelityPoints || 0) : 0,
        fidelityGain: isCareerMode ? (p.fidelityPoints || 0) : 0,
        duration: 0,
        pointsFor: 0,
        pointsAgainst: 0
      };
    });

    targetMatches.forEach(m => {
      const dur = m.duration || 720;
      const sA = m.scoreA || 0;
      const sB = m.scoreB || 0;
      const winA = m.winner === 'A';
      const winB = m.winner === 'B';

      (m.teamA || []).forEach(pId => {
        const st = dailyStats[pId];
        if (!st) return;
        st.matches += 1;
        if (winA) st.wins += 1;
        st.duration += dur;
        st.pointsFor += sA;
        st.pointsAgainst += sB;
      });

      (m.teamB || []).forEach(pId => {
        const st = dailyStats[pId];
        if (!st) return;
        st.matches += 1;
        if (winB) st.wins += 1;
        st.duration += dur;
        st.pointsFor += sB;
        st.pointsAgainst += sA;
      });
    });

    if (!isCareerMode) {
      const bonusAmount = systemMetadata?.dailyAttendanceBonus ?? 20;
      const minMatchesBonus = systemMetadata?.minMatchesForDailyBonus ?? 2;
      players.forEach(p => {
        const st = dailyStats[p.id];
        if (!st) return;
        const losses = st.matches - st.wins;
        st.matchEloGain = st.matches > 0 ? (st.wins * 20 - losses * 20) : 0;
        const hasFidelityBonus =
          (p.eloHistory || []).some(h => h.date === resolvedDate && h.fidelityBonus) ||
          st.matches >= minMatchesBonus;
        st.fidelityGain = st.matches > 0 && hasFidelityBonus ? bonusAmount : 0;
        st.eloGain = st.matchEloGain + st.fidelityGain;
      });
    }

    const maxDailyMatches = Math.max(0, ...Object.values(dailyStats).map(s => s.matches));
    const minReqDailyMatches = Math.max(1, Math.min(maxDailyMatches, systemMetadata?.minMatchesForDailyBonus ?? 2));

    const getDailyWinRate = (pId: string) => {
      const stats = dailyStats[pId];
      return (stats?.matches || 0) > 0 ? (stats.wins || 0) / stats.matches : 0;
    };

    const getDailyAvgPointDiff = (p: any) => {
      if (!p) return 0;
      const stats = dailyStats[p.id];
      return calculateDailyAvgPointDiff(stats?.pointsFor || 0, stats?.pointsAgainst || 0, stats?.matches || 0);
    };

    const getDailyMvpEfficiency = (p: any) => {
      if (!p) return 0;
      const stats = dailyStats[p.id];
      const wr = getDailyWinRate(p.id);
      const mCount = stats?.matches || 0;
      const eloGain = stats?.matchEloGain ?? stats?.eloGain ?? 0;
      return calculateMvpEfficiencyScore(p, wr, mCount, eloGain, stats?.pointsFor || 0, stats?.pointsAgainst || 0, true);
    };

    const getCareerMvpEfficiency = (p: any) => {
      if (!p) return 0;
      const stats = dailyStats[p.id];
      const mCount = stats && stats.matches > 0 ? stats.matches : (p.matchesPlayed || 0);
      const wins = stats && stats.matches > 0 ? stats.wins : (p.wins || 0);
      const wr = mCount > 0 ? wins / mCount : 0;
      const eloGain = (p.elo || 1200) - 1200;
      const pFor = stats && stats.matches > 0 ? stats.pointsFor : (p.pointsFor || 0);
      const pAgainst = stats && stats.matches > 0 ? stats.pointsAgainst : (p.pointsAgainst || 0);
      return calculateMvpEfficiencyScore(p, wr, mCount, eloGain, pFor, pAgainst, false);
    };

    const playersMap = players.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, Player>);

    const dailyMatchesForSetter = matches.filter(m => matchesDate(m, selectedDailyDate));
    const careerSetterStats = calculateSetterStats(matches, playersMap);
    const dailySetterStats = calculateSetterStats(dailyMatchesForSetter, playersMap);

    const mvp = [...players]
      .filter(p => (dailyStats[p.id]?.matches ?? p.matchesPlayed ?? 0) >= MIN_MATCHES)
      .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a) || (b.elo || 0) - (a.elo || 0) || (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0))[0] || 
      [...players]
        .filter(p => (dailyStats[p.id]?.matches ?? p.matchesPlayed ?? 0) > 0)
        .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a) || (b.elo || 0) - (a.elo || 0) || (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0))[0];

    const activePlayers = players.filter(p => (p.status || 'active') === 'active');
    const MIN_SETTER_CAREER_MATCHES = 20;

    let bestSetter = activePlayers
      .filter(p => (careerSetterStats[p.id]?.matches || 0) >= MIN_SETTER_CAREER_MATCHES)
      .sort((a, b) => 
        calculateSetterScore(careerSetterStats[b.id]?.wins || 0, careerSetterStats[b.id]?.matches || 0, false) - 
        calculateSetterScore(careerSetterStats[a.id]?.wins || 0, careerSetterStats[a.id]?.matches || 0, false) || 
        (careerSetterStats[b.id]?.wins || 0) - (careerSetterStats[a.id]?.wins || 0) || 
        (b.elo || 0) - (a.elo || 0)
      )[0] ||
      activePlayers
        .filter(p => p.isOfficialSetter && (careerSetterStats[p.id]?.matches || 0) > 0)
        .sort((a, b) => 
          calculateSetterScore(careerSetterStats[b.id]?.wins || 0, careerSetterStats[b.id]?.matches || 0, false) - 
          calculateSetterScore(careerSetterStats[a.id]?.wins || 0, careerSetterStats[a.id]?.matches || 0, false) || 
          (careerSetterStats[b.id]?.wins || 0) - (careerSetterStats[a.id]?.wins || 0) || 
          (b.elo || 0) - (a.elo || 0)
        )[0] ||
      activePlayers
        .filter(p => (careerSetterStats[p.id]?.matches || 0) > 0)
        .sort((a, b) => 
          calculateSetterScore(careerSetterStats[b.id]?.wins || 0, careerSetterStats[b.id]?.matches || 0, false) - 
          calculateSetterScore(careerSetterStats[a.id]?.wins || 0, careerSetterStats[a.id]?.matches || 0, false) || 
          (careerSetterStats[b.id]?.wins || 0) - (careerSetterStats[a.id]?.wins || 0) || 
          (b.elo || 0) - (a.elo || 0)
        )[0];

    if (!bestSetter) {
      const played = activePlayers.filter(p => (p.matchesPlayed || 0) > 0);
      if (played.length > 0) {
        const maxSetting = Math.max(...played.map(p => p.skills?.setting || 1));
        bestSetter = played.filter(p => (p.skills?.setting || 1) === maxSetting)
          .sort((a, b) => calculateWilsonScore(b.wins, b.matchesPlayed) - calculateWilsonScore(a.wins, a.matchesPlayed) || (b.elo || 0) - (a.elo || 0))[0];
      }
    }

    // =========================================================================
    // DESTAQUES DIÁRIOS — ORDEM B (4 VENCEDORES DISTINTOS, SEM REPETIÇÃO):
    // 1º Levantador do Dia -> 2º MVP do Dia (100% mérito da noite) ->
    // 3º Rei do Dia (ELO quadra) -> 4º Mais Eficiente (Saldo Médio pts/jogo)
    // =========================================================================
    const usedDailyAwardIds = new Set<string>();

    // 1º Levantador(a) do Dia
    let dailyBestSetter = activePlayers
      .filter(p => (dailySetterStats[p.id]?.matches || 0) >= Math.max(1, Math.min(minReqDailyMatches, 2)))
      .sort((a, b) => 
        calculateSetterScore(dailySetterStats[b.id]?.wins || 0, dailySetterStats[b.id]?.matches || 0, true) - 
        calculateSetterScore(dailySetterStats[a.id]?.wins || 0, dailySetterStats[a.id]?.matches || 0, true) || 
        (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0)
      )[0] ||
      activePlayers
        .filter(p => (dailySetterStats[p.id]?.matches || 0) > 0)
        .sort((a, b) => 
          calculateSetterScore(dailySetterStats[b.id]?.wins || 0, dailySetterStats[b.id]?.matches || 0, true) - 
          calculateSetterScore(dailySetterStats[a.id]?.wins || 0, dailySetterStats[a.id]?.matches || 0, true) || 
          (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0)
        )[0];

    if (!dailyBestSetter) {
      const played = activePlayers.filter(p => (dailyStats[p.id]?.matches || 0) > 0);
      if (played.length > 0) {
        const maxSetting = Math.max(...played.map(p => p.skills?.setting || 1));
        dailyBestSetter = played.filter(p => (p.skills?.setting || 1) === maxSetting)
          .sort((a, b) => 
            calculateWilsonScore(dailyStats[b.id]?.wins || 0, dailyStats[b.id]?.matches || 0) - calculateWilsonScore(dailyStats[a.id]?.wins || 0, dailyStats[a.id]?.matches || 0) || 
            (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0)
          )[0];
      }
    }
    if (dailyBestSetter?.id) usedDailyAwardIds.add(dailyBestSetter.id);

    // 2º MVP do Dia (100% desempenho em quadra da noite — sem peso fixo de skills, excluindo Levantador do Dia)
    const sortDailyMvp = (a: Player, b: Player) =>
      getDailyMvpEfficiency(b) - getDailyMvpEfficiency(a) ||
      (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0) ||
      (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0);

    const dailyMvp =
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches && !usedDailyAwardIds.has(p.id)).sort(sortDailyMvp)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0 && !usedDailyAwardIds.has(p.id)).sort(sortDailyMvp)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0).sort(sortDailyMvp)[0];
    if (dailyMvp?.id) usedDailyAwardIds.add(dailyMvp.id);

    const topEloCandidates = [...players]
      .filter(p => p.id !== mvp?.id)
      .sort((a, b) => (b.elo || 0) - (a.elo || 0) || (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0));
    const topElo = topEloCandidates.length > 0 ? topEloCandidates[0] : [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0) || (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0))[0];

    // 3º Rei / Rainha do Dia (maior ganho de ELO em quadra, excluindo Levantador e MVP)
    const sortDailyKing = (a: Player, b: Player) =>
      (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0) ||
      (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0) ||
      (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0);

    const dailyKing =
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches && !usedDailyAwardIds.has(p.id)).sort(sortDailyKing)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0 && !usedDailyAwardIds.has(p.id)).sort(sortDailyKing)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0 && p.id !== dailyMvp?.id).sort(sortDailyKing)[0] ||
      dailyMvp;
    if (dailyKing?.id) usedDailyAwardIds.add(dailyKing.id);

    const mostEfficientTechnical = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES && (p.elo || 1200) > 1200 && p.id !== mvp?.id && p.id !== topElo?.id)
      .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a))[0] ||
      [...players]
        .filter(p => (p.matchesPlayed || 0) > 0 && p.id !== mvp?.id)
        .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a))[0] ||
      mvp;

    // 4º Mais Eficiente do Dia (melhor Saldo Médio de Pontos por Jogo com desempate em % Vitórias, excluindo os 3 anteriores)
    const sortDailyEfficient = (a: Player, b: Player) =>
      getDailyAvgPointDiff(b) - getDailyAvgPointDiff(a) ||
      getDailyWinRate(b.id) - getDailyWinRate(a.id) ||
      (dailyStats[b.id]?.matches || 0) - (dailyStats[a.id]?.matches || 0) ||
      (dailyStats[b.id]?.matchEloGain || 0) - (dailyStats[a.id]?.matchEloGain || 0);

    const dailyEfficientTechnical =
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches && !usedDailyAwardIds.has(p.id)).sort(sortDailyEfficient)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0 && !usedDailyAwardIds.has(p.id)).sort(sortDailyEfficient)[0] ||
      [...players].filter(p => (dailyStats[p.id]?.matches || 0) > 0 && p.id !== dailyMvp?.id).sort(sortDailyEfficient)[0] ||
      dailyMvp;

    const averageMatchDuration = effectiveMatches.length > 0
      ? Math.round((effectiveMatches.reduce((acc, m) => acc + (m.duration || 0), 0) / effectiveMatches.length) / 60)
      : 0;

    const sessionLeaderboard = players
      .filter(p => dailyStats[p.id]?.matches > 0)
      .sort((a, b) => {
        const statsA = dailyStats[a.id];
        const statsB = dailyStats[b.id];
        const eloB = statsB?.matchEloGain || 0;
        const eloA = statsA?.matchEloGain || 0;
        if (eloB !== eloA) return eloB - eloA;
        const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.333);
        const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.333);
        if (Math.abs(effB - effA) > 0.0001) return effB - effA;
        return (statsA?.duration || 0) - (statsB?.duration || 0);
      });
    
    return { 
      mvp, 
      bestSetter, 
      topElo, 
      dailyKing, 
      topImpact: mvp, 
      dailyMvp, 
      dailyBestSetter,
      dailyMatchesCount,
      dailyStats,
      careerSetterStats,
      dailySetterStats,
      dailyEfficient: dailyEfficientTechnical,
      mostEfficient: mostEfficientTechnical,
      mostEfficientTechnical,
      dailyEfficientTechnical,
      totalDurations: careerTotalDurations,
      getDailyMvpEfficiency,
      getDailyAvgPointDiff,
      getCareerMvpEfficiency,
      avgMatchTime: averageMatchDuration,
      sessionLeaderboard,
      date: resolvedDate,
      summaryType: rankingPeriod
    };
  }, [players, effectiveMatches, matches, selectedDailyDate, rankingPeriod, systemMetadata, careerTotalDurations, matchesDate]);

  const unifiedMetrics = useMemo(() => {
    const targetMatches = effectiveMatches;
    if (targetMatches.length === 0) return { avgMatchDur: '0 min', avgRest: '0 min', participation: '0%', avgPlaying: '0 min' };

    const matchesByDate: Record<string, any[]> = {};
    targetMatches.forEach(m => {
      const d = getMatchDate(m) || m.date;
      if (!matchesByDate[d]) matchesByDate[d] = [];
      matchesByDate[d].push(m);
    });

    const sessions = Object.values(matchesByDate);
    let totalRestSum = 0;
    let totalPlayingSum = 0;
    let totalMatchDurationSum = 0;
    const sessionsCount = sessions.length;

    sessions.forEach(sMatches => {
      const sorted = [...sMatches].sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const DEFAULT_DUR_MS = 12 * 60 * 1000;
      const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
      const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
      const sessionMinutes = (endTime - startTime) / (1000 * 60);

      const playersInThisSession = players.filter(player =>
        sMatches.some(m => (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id))
      );

      if (playersInThisSession.length > 0) {
        let sessionTotalRest = 0;
        let sessionTotalPlaying = 0;
        playersInThisSession.forEach(player => {
          const playerTimePlayed = sMatches.reduce((acc, m) => {
            const played = (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id);
            return acc + (played ? (m.duration || 720) / 60 : 0);
          }, 0);
          sessionTotalRest += Math.max(0, sessionMinutes - playerTimePlayed);
          sessionTotalPlaying += playerTimePlayed;
        });
        totalRestSum += sessionTotalRest / playersInThisSession.length;
        totalPlayingSum += sessionTotalPlaying / playersInThisSession.length;
      }
      totalMatchDurationSum += sMatches.reduce((s, m) => s + (m.duration || 720), 0) / 60;
    });

    const avgPlaying = totalPlayingSum / (sessionsCount || 1);
    const avgSessionMatchDurSum = totalMatchDurationSum / (sessionsCount || 1);

    return {
      avgMatchDur: Math.round(targetMatches.reduce((s, m) => s + (m.duration || 720), 0) / (targetMatches.length * 60)) + ' min',
      avgRest: Math.round(totalRestSum / (sessionsCount || 1)) + ' min',
      participation: (avgSessionMatchDurSum > 0 ? Math.round((avgPlaying / avgSessionMatchDurSum) * 100) : 0) + '%',
      avgPlaying: Math.round(avgPlaying) + ' min'
    };
  }, [effectiveMatches, players, getMatchDate]);

  const playerIndividualMetrics = useMemo(() => {
    if (!selectedPlayer) return { avgRest: '0 min', totalRest: '0 min', participation: '0%', totalMatchesDuration: '0 min', totalPlaying: '0 min' };
    
    const targetMatches = effectiveMatches;
    const playerMatches = targetMatches.filter(m => m.teamA?.includes(selectedPlayer.id) || m.teamB?.includes(selectedPlayer.id));
    if (playerMatches.length === 0) return { avgRest: '0 min', totalRest: '0 min', participation: '0%', totalMatchesDuration: '0 min', totalPlaying: '0 min' };

    const matchesByDate: Record<string, any[]> = {};
    targetMatches.forEach(m => {
      const d = getMatchDate(m) || m.date;
      if (!matchesByDate[d]) matchesByDate[d] = [];
      matchesByDate[d].push(m);
    });
    
    const sessions = Object.values(matchesByDate);
    let totalRest = 0;
    let totalPlaying = 0;
    let totalEngagement = 0;
    let totalSessionMatchesDuration = 0;
    let sessionsParticipated = 0;

    sessions.forEach(sMatches => {
      const pMatches = sMatches.filter(m => (m.teamA || []).includes(selectedPlayer.id) || (m.teamB || []).includes(selectedPlayer.id));
      if (pMatches.length === 0) return;
      
      const sorted = [...sMatches].sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const DEFAULT_DUR_MS = 12 * 60 * 1000;
      const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
      const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
      const sessionMinutes = (endTime - startTime) / (1000 * 60);

      const playerTimePlayed = pMatches.reduce((acc, m) => acc + (m.duration || 720) / 60, 0);
      const sumMatchDurations = sMatches.reduce((s, m) => s + (m.duration || 720), 0) / 60;

      totalRest += Math.max(0, sessionMinutes - playerTimePlayed);
      totalPlaying += playerTimePlayed;
      totalSessionMatchesDuration += sumMatchDurations;
      if (sumMatchDurations > 0) totalEngagement += (playerTimePlayed / sumMatchDurations) * 100;
      sessionsParticipated++;
    });

    return {
      avgRest: Math.round(totalRest / (sessionsParticipated || 1)) + ' min',
      totalRest: Math.round(totalRest) + ' min',
      participation: Math.round(totalEngagement / (sessionsParticipated || 1)) + '%',
      totalMatchesDuration: Math.round(totalSessionMatchesDuration) + ' min',
      totalPlaying: Math.round(totalPlaying) + ' min'
    };
  }, [selectedPlayer, effectiveMatches, getMatchDate]);

  // Parcerias, Menores Taxas de Sucesso e Rivalidades com Suavização Bayesiana Ponderal
  const globalRelationships = useMemo(() => {
    if (!players || players.length === 0) return { synergies: [], lowestSynergies: [], rivalries: [] };

    const synergyWins: Record<string, number> = {};
    const synergyMatches: Record<string, number> = {};
    const rivalryWins: Record<string, number> = {};
    const rivalryAgainst: Record<string, number> = {};

    const sourceMatches = rankingPeriod === 'session' ? effectiveMatches : matches;

    sourceMatches.forEach(m => {
      if (!m.winner) return;
      const winners = m.winner === 'A' ? m.teamA : m.teamB;
      const losers = m.winner === 'A' ? m.teamB : m.teamA;

      if (winners && winners.length >= 2) {
        for (let i = 0; i < winners.length; i++) {
          for (let j = i + 1; j < winners.length; j++) {
            const pair = [winners[i], winners[j]].sort().join('_');
            synergyWins[pair] = (synergyWins[pair] || 0) + 1;
            synergyMatches[pair] = (synergyMatches[pair] || 0) + 1;
          }
        }
      }
      if (losers && losers.length >= 2) {
        for (let i = 0; i < losers.length; i++) {
          for (let j = i + 1; j < losers.length; j++) {
            const pair = [losers[i], losers[j]].sort().join('_');
            synergyMatches[pair] = (synergyMatches[pair] || 0) + 1;
          }
        }
      }

      if (winners && losers) {
        winners.forEach(w => {
          losers.forEach(l => {
            const pair = [w, l].sort().join('_');
            rivalryAgainst[pair] = (rivalryAgainst[pair] || 0) + 1;
            const matchKey = `${l}_${w}`;
            rivalryWins[matchKey] = (rivalryWins[matchKey] || 0) + 1;
          });
        });
      }
    });

    const isSession = rankingPeriod === 'session';
    const minMatchesForSynergy = isSession ? 1 : 3;
    const minMatchesForRivalry = isSession ? 1 : 2;
    const minMatchesForLowest = isSession ? 1 : 2;

    const synergies = Object.entries(synergyMatches)
      .map(([pair, matchesCount]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        const wins = synergyWins[pair] || 0;
        const winRate = matchesCount > 0 ? Math.round((wins / matchesCount) * 100) : 0;
        const score = (wins + 1.5) / (matchesCount + 3);
        return { p1, p2, wins, matches: matchesCount, winRate, score };
      })
      .filter((s): s is typeof s & { p1: any, p2: any } => !!s.p1 && !!s.p2 && s.matches >= minMatchesForSynergy && s.wins > 0)
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .slice(0, 5);

    const lowestSynergies = Object.entries(synergyMatches)
      .map(([pair, matchesCount]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        const wins = synergyWins[pair] || 0;
        const losses = matchesCount - wins;
        const winRate = matchesCount > 0 ? Math.round((wins / matchesCount) * 100) : 0;
        // Bayesian Loss Score: prioriza duplas que realmente perderam mais partidas juntas
        const lossBayesianScore = (losses + 1.5) / (matchesCount + 3);
        return { p1, p2, wins, losses, matches: matchesCount, winRate, lossBayesianScore };
      })
      .filter((s): s is typeof s & { p1: any, p2: any } => !!s.p1 && !!s.p2 && s.matches >= minMatchesForLowest && s.losses > 0)
      .sort((a, b) => b.lossBayesianScore - a.lossBayesianScore || b.losses - a.losses || a.winRate - b.winRate)
      .slice(0, 5);

    const rivalries = Object.entries(rivalryAgainst)
      .map(([pair, totalAcross]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        if (!p1 || !p2) return null;

        const wins_1_over_2 = rivalryWins[`${id2}_${id1}`] || 0;
        const wins_2_over_1 = rivalryWins[`${id1}_${id2}`] || 0;

        const is_1_dominant = wins_1_over_2 >= wins_2_over_1;
        const winner = is_1_dominant ? p1 : p2;
        const loser = is_1_dominant ? p2 : p1;
        const wins = is_1_dominant ? wins_1_over_2 : wins_2_over_1;
        const winRate = totalAcross > 0 ? Math.round((wins / totalAcross) * 100) : 0;
        const score = (wins + 1.5) / (totalAcross + 3);

        return { winner, loser, wins, total: totalAcross, winRate, score };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && !!r.winner && !!r.loser && r.total >= minMatchesForRivalry)
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .slice(0, 5);

    return { synergies, lowestSynergies, rivalries };
  }, [players, rankingPeriod, effectiveMatches, matches]);

  const handleCopyTextSummary = () => {
    if (!topStats.dailyStats) return;

    const resolvedDate = topStats.date;
    const isAccumulated = rankingPeriod === 'career' || topStats.date === 'Geral' || topStats.date === 'global';
    
    let text = isAccumulated
      ? `🏆 *RESUMO DO RANKING ACUMULADO - GUERREIROS VOLLEYBALL* 🏆\n📅 Data: ${formatBrazilianDate(today)}\n\n`
      : `🏆 *RESUMO DO RANKING DIÁRIO - GUERREIROS VOLLEYBALL* 🏆\n📅 Data: ${formatBrazilianDate(resolvedDate)}\n\n`;

    const matchesToUse = isAccumulated ? effectiveMatches : sessionMatches;
    const totalSecs = matchesToUse.reduce((acc, m) => acc + (m.duration || 0), 0);
    const totalMins = Math.floor(totalSecs / 60);
    const totalMatchesCount = matchesToUse.length;

    const formattedTotalTime = totalMins >= 60 
      ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` 
      : `${totalMins}m`;
    const avgTimeVal = totalMatchesCount > 0 ? Math.round(totalMins / totalMatchesCount) : 0;

    text += `🏐 Total de partidas: ${totalMatchesCount}\n`;
    text += `⏱️ *Tempo Total:* ${formattedTotalTime} | *Média:* ${avgTimeVal} min\n\n`;

    if (isAccumulated) {
      const mvpScore = topStats.mvp && topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(topStats.mvp).toFixed(1) : '0.0';
      text += `🌟 *DESTAQUES ACUMULADOS:*\n`;
      text += `• *MVP (B-1):* ${topStats.mvp?.name || 'N/A'} (${mvpScore} pts)\n`;
      text += `• *Melhor Levantador:* ${topStats.bestSetter?.name || 'N/A'}\n`;
      text += `• *Rei do ELO:* ${topStats.topElo?.name || 'N/A'}\n`;
      text += `• *Sócio Mais Eficiente:* ${topStats.mostEfficientTechnical?.name || 'N/A'}\n\n`;
    } else {
      const mvpScore = topStats.dailyMvp && topStats.getDailyMvpEfficiency ? topStats.getDailyMvpEfficiency(topStats.dailyMvp).toFixed(1) : '0.0';
      const effAvgDiff = topStats.dailyEfficientTechnical && topStats.getDailyAvgPointDiff ? topStats.getDailyAvgPointDiff(topStats.dailyEfficientTechnical) : 0;
      const effTag = topStats.dailyEfficientTechnical ? ` (Saldo ${effAvgDiff >= 0 ? '+' : ''}${effAvgDiff.toFixed(1)} pts/j)` : '';
      text += `🌟 *DESTAQUES DO DIA:*\n`;
      text += `• *Melhor Levantador:* ${topStats.dailyBestSetter?.name || 'N/A'}\n`;
      text += `• *MVP do Dia:* ${topStats.dailyMvp?.name || 'N/A'} (${mvpScore} pts)\n`;
      text += `• *Rei do Dia:* ${topStats.dailyKing?.name || 'N/A'}\n`;
      text += `• *Mais Eficiente do Dia:* ${topStats.dailyEfficientTechnical?.name || 'N/A'}${effTag}\n\n`;
    }

    if (globalRelationships.synergies.length > 0) {
      text += `🤝 *Melhores Parcerias (Sinergias):*\n`;
      globalRelationships.synergies.forEach((s, idx) => {
        text += `  ${idx + 1}. ${s.p1?.name} + ${s.p2?.name}: ${s.wins}V (${s.winRate}% em ${s.matches}J)\n`;
      });
    }

    if (globalRelationships.lowestSynergies.length > 0) {
      text += `\n⚠️ *Menores Taxas de Sucesso (Em Dupla):*\n`;
      globalRelationships.lowestSynergies.forEach((s, idx) => {
        text += `  ${idx + 1}. ${s.p1?.name} + ${s.p2?.name}: ${s.wins}V - ${s.losses}D (${s.winRate}% em ${s.matches}J)\n`;
      });
    }

    if (globalRelationships.rivalries.length > 0) {
      text += `\n⚔️ *Maiores Rivalidades (Confronto Direto):*\n`;
      globalRelationships.rivalries.forEach((r, idx) => {
        text += `  ${idx + 1}. ${r.winner?.name} vs ${r.loser?.name}: ${r.wins}V de ${r.winner?.name} (${r.winRate}% em ${r.total}J)\n`;
      });
    }
    text += `\n📊 *CLASSIFICAÇÃO:*\n\n`;

    const activePlayersList = players
      .filter(p => {
        const stats = topStats.dailyStats[p.id];
        return isAccumulated ? (p.matchesPlayed > 0) : (stats && stats.matches > 0);
      })
      .sort((a, b) => {
        if (isAccumulated) {
          return (b.elo || 1200) - (a.elo || 1200) || (careerTotalDurations[a.id] || 0) - (careerTotalDurations[b.id] || 0);
        } else {
          const statsA = topStats.dailyStats[a.id];
          const statsB = topStats.dailyStats[b.id];
          return (statsB?.eloGain || 0) - (statsA?.eloGain || 0) || (statsA?.duration || 0) - (statsB?.duration || 0);
        }
      });

    activePlayersList.forEach((p, idx) => {
      const stats = topStats.dailyStats[p.id];
      const wins = isAccumulated ? (p.wins || 0) : (stats?.wins || 0);
      const playedMatches = isAccumulated ? (p.matchesPlayed || 0) : (stats?.matches || 0);
      const losses = playedMatches - wins;
      const winRate = playedMatches > 0 ? Math.round((wins / playedMatches) * 100) : 0;
      const formattedRank = (idx + 1).toString().padStart(2, '0');

      const eloText = isAccumulated
        ? `${Math.round(p.elo || 1200)} pts`
        : `${(stats?.eloGain || 0) >= 0 ? '+' : ''}${stats?.eloGain || 0} pts`;

      const mv = leaderboardMovements[p.id];
      let movementText = ' ⚪ ➖0';
      if (mv) {
        if (mv.type === 'up' && mv.diff > 0) movementText = ` 🟢 ⬆️${mv.diff}`;
        else if (mv.type === 'down' && mv.diff > 0) movementText = ` 🔴 ⬇️${mv.diff}`;
      }

      text += `${formattedRank}. *${p.name}* — ${winRate}% (${eloText}) | (${wins}V-${losses}D)${movementText}\n`;
    });

    text += `\n_Gerado por Guerreiros Intelligence_ 🏐`;
    navigator.clipboard.writeText(text);
    showNotification('Resumo copiado para o WhatsApp!', 'success');
  };

  const handleShareAudio = async () => {
    if (!narrationAudio) return;
    try {
      showNotification('Preparando áudio para compartilhar...', 'info');
      const response = await fetch(narrationAudio);
      const blob = await response.blob();
      const fileName = `resumo_guerreiros_${selectedDailyDate.replace(/\//g, '-')}.wav`;
      const file = new File([blob], fileName, { type: 'audio/wav' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Resumo do Dia - Guerreiros Volleyball',
          text: 'Confira os destaques do jogo de hoje!'
        });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification('Áudio baixado!', 'success');
      }
    } catch (e) {
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('cancel'))) return;
      showNotification('Erro ao compartilhar áudio.', 'error');
    }
  };

  const globalStatsPlayers = useMemo(() => {
    if (rankingPeriod === 'career') return players;
    const playersInEffective = new Set<string>();
    effectiveMatches.forEach(m => {
      (m.teamA || []).forEach(id => playersInEffective.add(id));
      (m.teamB || []).forEach(id => playersInEffective.add(id));
    });
    return players.filter(p => playersInEffective.has(p.id));
  }, [players, rankingPeriod, effectiveMatches]);

  return (
    <div 
      className="relative space-y-8 pb-12"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence>
        {showAuditModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-brand-secondary border border-brand-primary/40 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-brand-primary/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-primary/20 rounded-xl">
                    <Zap className="w-5 h-5 text-brand-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Agente IA: Auditor de Dados</h2>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Escaneando integridade do ranking</p>
                  </div>
                </div>
                <button onClick={() => setShowAuditModal(false)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-6 h-6 text-white/40" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                {isAuditing ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-white font-black uppercase tracking-widest text-sm animate-pulse">Analisando Rankings e Partidas...</p>
                  </div>
                ) : auditReport ? (
                  <div className="space-y-6">
                    <div className="prose prose-invert max-w-none prose-p:text-white/80 prose-headings:text-white prose-strong:text-brand-primary">
                      <ReactMarkdown>{auditReport}</ReactMarkdown>
                    </div>
                    {userRole === 'ADMIN' && (
                      <div className="pt-6 border-t border-white/10">
                        <button
                          onClick={async () => {
                            await fixDatabaseAnomalies();
                            setShowAuditModal(false);
                          }}
                          className="w-full flex items-center justify-center gap-3 bg-brand-primary text-brand-secondary py-4 rounded-2xl font-black uppercase tracking-widest"
                        >
                          <Zap className="w-5 h-5 fill-current" />
                          Aplicar Reparo Autônomo AGORA
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & AI Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter text-white">
            Ranking <span className="text-brand-primary">Pro</span>
          </h2>
          <p className="text-sm font-bold uppercase tracking-widest mt-2 text-brand-accent">Inteligência e Performance</p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          {userRole === 'ADMIN' && (
            <div className="flex gap-2 w-full md:w-auto">
              {narrationAudio ? (
                <button 
                  onClick={() => playAudioContent(narrationAudio, 'ranking')}
                  disabled={activeIsNarrating}
                  className="flex-1 md:flex-none bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl transition-all disabled:opacity-50"
                >
                  <Volume2 className={`w-5 h-5 ${activeIsNarrating ? 'animate-pulse' : ''}`} />
                  {activeIsNarrating ? 'Ouvindo...' : 'Ouvir Resumo'}
                </button>
              ) : (
                <button 
                  onClick={() => {
                    const displayDate = topStats.date === 'Geral' || topStats.date === 'global' ? 'Geral' : formatBrazilianDate(topStats.date);
                    handleAnnounceSummary({ ...topStats, date: displayDate });
                  }}
                  disabled={activeIsNarrating}
                  className={`flex-1 md:flex-none bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl transition-all disabled:opacity-50 ${!aiStatus.isAvailable ? 'grayscale opacity-70' : ''}`}
                >
                  <Sparkles className={`w-5 h-5 ${activeIsNarrating ? 'animate-spin' : ''}`} />
                  {activeIsNarrating ? 'Gerando...' : !aiStatus.isAvailable ? 'IA Limitada' : 'Resumo IA'}
                </button>
              )}

              {narrationAudio && (
                <button 
                  onClick={() => {
                    const displayDate = topStats.date === 'Geral' || topStats.date === 'global' ? 'Geral' : formatBrazilianDate(topStats.date);
                    handleAnnounce('ranking', { ...topStats, date: displayDate }, true);
                  }}
                  disabled={activeIsNarrating}
                  className="bg-black text-brand-primary p-4 rounded-2xl border border-brand-primary/40 flex items-center justify-center"
                  title="Regerar Resumo"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
              
              <button 
                onClick={handleShareAudio}
                disabled={!narrationAudio}
                className={`bg-black text-brand-primary p-4 rounded-2xl border border-brand-primary/40 flex items-center justify-center ${
                  !narrationAudio ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-brand-primary/10'
                }`}
                title="Compartilhar Áudio"
              >
                <Share2 className="w-5 h-5" />
              </button>

              <button 
                onClick={handleCopyTextSummary}
                className="bg-white/10 text-white p-4 rounded-2xl hover:bg-white/20 border border-white/10 transition-all flex items-center justify-center"
                title="Copiar resumo para o WhatsApp"
              >
                <Copy className="w-5 h-5" />
              </button>

              <button 
                onClick={handleAuditData}
                disabled={isAuditing}
                className="p-4 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-brand-secondary transition-all flex items-center justify-center"
                title="IA Auditor de Ranking"
              >
                <Zap className={`w-5 h-5 ${isAuditing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="bg-white/5 p-1.5 rounded-2xl flex flex-wrap sm:flex-nowrap gap-1 border border-brand-primary/40">
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'daily' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4 hidden sm:block" />
          Destaques
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'individual' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 hidden sm:block" />
          Individual
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'global' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4 hidden sm:block" />
          Global
        </button>
        <button
          onClick={() => setActiveTab('synergy')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'synergy' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <BrainCircuit className="w-4 h-4 hidden sm:block" />
          Sinergia
        </button>
        <button
          onClick={() => setActiveTab('coach')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'coach' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4 hidden sm:block" />
          IA Coach
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'cards'
              ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/20'
              : 'text-cyan-300/75 hover:text-cyan-200'
          }`}
        >
          <Share2 className="w-4 h-4 hidden sm:block" />
          Cards Glass
        </button>
      </div>

      {/* Ranking Period Switcher */}
      {activeTab !== 'cards' && (
      <div className="bg-white/5 p-1 rounded-2xl flex gap-1 border border-brand-primary/40">
        <button
          onClick={() => setRankingPeriod('session')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            rankingPeriod === 'session' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          Dia
        </button>
        <button
          onClick={() => setRankingPeriod('career')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            rankingPeriod === 'career' ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Acumulado
        </button>
      </div>
      )}

      {/* Session Date Selector */}
      {activeTab !== 'cards' && rankingPeriod === 'session' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-3xl border border-brand-primary/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Calendar className="w-5 h-5 text-brand-primary" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Selecionar Dia</p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
            {availableDates.slice(0, 5).map(date => (
              <button
                key={date}
                onClick={() => setSelectedDailyDate(date)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                  selectedDailyDate === date 
                    ? 'bg-brand-primary border-brand-primary text-brand-secondary shadow-lg' 
                    : 'bg-white/5 border-brand-primary/40 text-white/60 hover:text-white'
                }`}
              >
                {formatBrazilianDate(date)}
              </button>
            ))}
            {availableDates.length > 5 && (
              <select
                value={availableDates.includes(selectedDailyDate) && availableDates.indexOf(selectedDailyDate) >= 5 ? selectedDailyDate : ""}
                onChange={(e) => e.target.value && setSelectedDailyDate(e.target.value)}
                className="bg-white/5 border border-brand-primary/40 text-white/60 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl outline-none"
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
        {activeTab === 'cards' ? (
          <motion.div key="cards" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <LiquidGlassCardsStudio
              players={players}
              availableDates={availableDates}
              initialDate={selectedDailyDate}
              initialPlayerId={selectedPlayer?.id || currentPlayer?.id || null}
              userRole={userRole}
              showNotification={showNotification}
            />
          </motion.div>
        ) : activeTab === 'global' ? (
          <motion.div key="global" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GlobalStats 
              players={globalStatsPlayers} 
              matches={effectiveMatches} 
              attendance={attendance} 
              rankingPeriod={rankingPeriod} 
              selectedDailyDate={selectedDailyDate}
            />
          </motion.div>
        ) : activeTab === 'synergy' ? (
          <motion.div key="synergy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SynergyAnalysis players={allPlayers} matches={effectiveMatches} />
          </motion.div>
        ) : activeTab === 'coach' ? (
          <motion.div key="coach" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {selectedPlayer ? (
              <AICoach player={selectedPlayer} allPlayers={players} recentMatches={matches} />
            ) : (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-brand-primary/20">
                <Users className="w-12 h-12 text-brand-primary/20 mx-auto mb-4" />
                <p className="text-white/60 font-black uppercase tracking-widest text-sm">
                  Selecione um jogador na aba "Individual" para ver o feedback da IA
                </p>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'daily' ? (
          <motion.div key="daily" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-primary/10 rounded-xl">
                    <Sparkles className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {rankingPeriod === 'session' ? 'Destaques do Dia' : 'Destaques Acumulados'}
                  </h3>
                </div>
                {userRole === 'ADMIN' && rankingPeriod === 'session' && selectedDailyDate === today && (
                  <button onClick={resetDailyMatches} className="p-2 bg-white/5 hover:bg-brand-primary/10 rounded-xl text-brand-accent" title="Sincronizar Dia">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
                {(rankingPeriod === 'session' ? topStats.dailyMatchesCount > 0 : players.length > 0) ? (
                  <>
                    {/* MVP */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Trophy className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'MVP do Dia' : 'MVP Histórico'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session' ? (topStats.dailyMvp?.name || "Nenhum") : (topStats.mvp?.name || "Nenhum")}
                      </h4>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {rankingPeriod === 'session'
                            ? (topStats.dailyMvp ? `${Math.round((topStats.dailyStats[topStats.dailyMvp.id]?.wins / (topStats.dailyStats[topStats.dailyMvp.id]?.matches || 1)) * 100)}% Vitórias` : "Sem jogos")
                            : (topStats.mvp ? `${Math.round(((topStats.dailyStats[topStats.mvp.id]?.wins ?? topStats.mvp.wins) / ((topStats.dailyStats[topStats.mvp.id]?.matches || topStats.mvp.matchesPlayed) || 1)) * 100)}% Vitórias` : "Sem jogos")}
                        </span>
                        {((rankingPeriod === 'session' && topStats.dailyMvp) || (rankingPeriod !== 'session' && topStats.mvp)) && (
                          <span className="bg-brand-primary/10 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                            {rankingPeriod === 'session'
                              ? `Score Dia: ${topStats.getDailyMvpEfficiency(topStats.dailyMvp).toFixed(1)}`
                              : `Score B-1: ${topStats.getCareerMvpEfficiency(topStats.mvp).toFixed(1)}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Levantador */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Target className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'Levantador do Dia' : 'Melhor Levantador'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session' ? (topStats.dailyBestSetter?.name || "Nenhum") : (topStats.bestSetter?.name || "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {rankingPeriod === 'session'
                            ? (topStats.dailyBestSetter && topStats.dailySetterStats?.[topStats.dailyBestSetter.id]?.matches
                                ? `${topStats.dailySetterStats[topStats.dailyBestSetter.id].wins}V (${topStats.dailySetterStats[topStats.dailyBestSetter.id].matches}J) • ${Math.round((topStats.dailySetterStats[topStats.dailyBestSetter.id].wins / topStats.dailySetterStats[topStats.dailyBestSetter.id].matches) * 100)}%`
                                : "Sem partidas")
                            : (topStats.bestSetter && topStats.careerSetterStats?.[topStats.bestSetter.id]?.matches
                                ? `${topStats.careerSetterStats[topStats.bestSetter.id].wins}V (${topStats.careerSetterStats[topStats.bestSetter.id].matches}J) • ${Math.round((topStats.careerSetterStats[topStats.bestSetter.id].wins / topStats.careerSetterStats[topStats.bestSetter.id].matches) * 100)}%`
                                : "Sem partidas")}
                        </span>
                      </div>
                    </div>

                    {/* Rei */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Zap className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'Rei do Dia' : 'Rei do ELO'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session' ? (topStats.dailyKing?.name || "Nenhum") : (topStats.topElo?.name || "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {rankingPeriod === 'session'
                            ? (topStats.dailyKing ? `${topStats.dailyStats[topStats.dailyKing.id]?.matchEloGain >= 0 ? '+' : ''}${topStats.dailyStats[topStats.dailyKing.id]?.matchEloGain || 0} ELO Quadra` : "Sem partidas")
                            : (topStats.topElo ? `${Math.round(topStats.topElo.elo)} Pontos` : "0 Pontos")}
                        </span>
                      </div>
                    </div>

                    {/* Mais Eficiente */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Sparkles className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Mais Eficiente Dia' : 'Mais Eficiente Geral'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session' ? (topStats.dailyEfficientTechnical?.name || "Nenhum") : (topStats.mostEfficientTechnical?.name || "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {rankingPeriod === 'session'
                            ? (topStats.dailyEfficientTechnical
                                ? (() => {
                                    const avgDiff = topStats.getDailyAvgPointDiff ? topStats.getDailyAvgPointDiff(topStats.dailyEfficientTechnical) : 0;
                                    const dStats = topStats.dailyStats[topStats.dailyEfficientTechnical.id];
                                    const wrPct = dStats?.matches ? Math.round((dStats.wins / dStats.matches) * 100) : 0;
                                    return `Saldo ${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)} pts/j • ${wrPct}% V`;
                                  })()
                                : "Sem partidas")
                            : (topStats.mostEfficientTechnical ? `Score B-1: ${topStats.getCareerMvpEfficiency(topStats.mostEfficientTechnical).toFixed(1)}` : "Sem partidas")}
                        </span>
                      </div>
                    </div>

                    {/* Melhor Sinergia */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Users className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Sinergia do Dia' : 'Melhor Sinergia'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {globalRelationships.synergies.length > 0
                          ? `${globalRelationships.synergies[0].p1?.name.split(' ')[0]} + ${globalRelationships.synergies[0].p2?.name.split(' ')[0]}`
                          : "Dupla Ideal"}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {globalRelationships.synergies.length > 0
                            ? `${globalRelationships.synergies[0].wins}V (${globalRelationships.synergies[0].winRate}%)`
                            : "Sem dados"}
                        </span>
                      </div>
                    </div>

                    {/* Maior Rivalidade */}
                    <div className="bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
                      <div className="absolute top-0 right-0 p-4 opacity-25">
                        <Swords className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Rivalidade do Dia' : 'Maior Rivalidade'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {globalRelationships.rivalries.length > 0
                          ? `${globalRelationships.rivalries[0].winner?.name.split(' ')[0]} vs ${globalRelationships.rivalries[0].loser?.name.split(' ')[0]}`
                          : "Confronto Direto"}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border">
                          {globalRelationships.rivalries.length > 0
                            ? `${globalRelationships.rivalries[0].wins}V (${globalRelationships.rivalries[0].winRate}%)`
                            : "Sem histórico"}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-full py-12 text-center bg-white/5 rounded-[2.5rem] border border-white/5">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center justify-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Nenhuma partida registrada nesta data
                    </p>
                  </div>
                )}
              </div>

              {/* Métricas de Tempo */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                  { label: 'Tempo Médio das Partidas', val: unifiedMetrics.avgMatchDur, icon: Clock },
                  { label: 'Tempo Médio Fora da Quadra', val: unifiedMetrics.avgRest, icon: Timer },
                  { label: 'Aproveitamento de Quadra', val: unifiedMetrics.participation, icon: Timer },
                  { label: 'Tempo Médio em Quadra', val: unifiedMetrics.avgPlaying, icon: Activity },
                ].map((stat, i) => (
                  <div key={i} className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem]">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                      <stat.icon className="w-4 h-4 text-brand-primary/40" />
                    </div>
                    <h3 className="text-2xl font-black text-white tracking-widest leading-none">{stat.val}</h3>
                  </div>
                ))}
              </div>
            </section>

            {/* Duplas, Rivalidades e Menores Taxas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-brand-primary/10 rounded-xl"><Users className="w-5 h-5 text-brand-primary" /></div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">
                    Melhores Duplas {rankingPeriod === 'session' ? 'do Dia' : '(Sinergia Geral)'}
                  </h4>
                </div>
                <div className="space-y-4">
                  {globalRelationships.synergies.length > 0 ? globalRelationships.synergies.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-brand-primary/40">
                      <p className="text-xs font-black text-white">{s.p1?.name} + {s.p2?.name}</p>
                      <div className="text-right">
                        <p className="text-xs font-black text-brand-primary">{s.wins}V ({s.winRate}%)</p>
                        <p className="text-[9px] font-black text-white/40 uppercase">{s.matches} {s.matches === 1 ? 'jogo' : 'jogos'}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center py-8 text-white/40 text-xs font-bold uppercase">Sem dados de sinergia</p>
                  )}
                </div>
              </div>

              <div className="bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-brand-primary p-8 rounded-[2.5rem] shadow-2xl border">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-brand-primary/10 rounded-xl"><Swords className="w-5 h-5 text-brand-primary" /></div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">Maiores Rivalidades</h4>
                </div>
                <div className="space-y-4">
                  {globalRelationships.rivalries.length > 0 ? globalRelationships.rivalries.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-brand-primary/40">
                      <p className="text-xs font-black text-white">{r.winner?.name} <span className="text-white/40">vs</span> {r.loser?.name}</p>
                      <div className="text-right">
                        <p className="text-xs font-black text-brand-primary">{r.wins}V de {r.winner?.name} ({r.winRate}%)</p>
                        <p className="text-[9px] font-black text-white/40 uppercase">de {r.total} confrontos</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center py-8 text-white/40 text-xs font-bold uppercase">Sem dados de rivalidade</p>
                  )}
                </div>
              </div>

              <div className="bg-black backdrop-blur-xl border-white/5 border-l-[6px] border-l-rose-500/80 p-8 rounded-[2.5rem] shadow-2xl border">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-rose-500/10 rounded-xl"><TrendingDown className="w-5 h-5 text-rose-400" /></div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-rose-400">
                    Menores Taxas de Sucesso {rankingPeriod === 'session' ? 'do Dia' : '(Menor Aproveitamento)'}
                  </h4>
                </div>
                <div className="space-y-4">
                  {globalRelationships.lowestSynergies.length > 0 ? globalRelationships.lowestSynergies.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-rose-500/20">
                      <p className="text-xs font-black text-white">{s.p1?.name} + {s.p2?.name}</p>
                      <div className="text-right">
                        <p className="text-xs font-black text-rose-400">{s.wins}V - {s.losses}D ({s.winRate}%)</p>
                        <p className="text-[9px] font-black text-white/40 uppercase">{s.matches} {s.matches === 1 ? 'jogo' : 'jogos'}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center py-8 text-white/40 text-xs font-bold uppercase">Sem dados de atrito</p>
                  )}
                </div>
              </div>
            </div>

            {/* Tabela Principal de Ranking */}
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5 border border-brand-primary/20">
                    <Filter className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {rankingPeriod === 'session' ? `Ranking de ${formatBrazilianDate(selectedDailyDate)}` : 'Ranking Geral Acumulado'}
                  </h3>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Buscar sócio..."
                    value={rankingSearchQuery}
                    onChange={(e) => setRankingSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-[10px] font-bold outline-none bg-white/5 border border-brand-primary/40 text-white"
                  />
                </div>
              </div>

              {/* Cockpit de Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-brand-secondary/40 p-5 rounded-[2rem] border border-brand-primary/20">
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">Filtrar Sócio</label>
                  <select
                    value={filterSocioId}
                    onChange={(e) => setFilterSocioId(e.target.value)}
                    className="w-full bg-black text-white text-[10px] font-black uppercase px-3.5 py-3 rounded-xl border border-white/10 outline-none"
                  >
                    <option value="all">Todos os Guerreiros</option>
                    {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name.toUpperCase()} {p.isOfficialSetter ? '• LEVANTADOR' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">Período de Datas</label>
                  {rankingPeriod === 'career' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="w-full bg-black text-white text-[10px] font-mono px-2 py-2.5 rounded-xl border border-white/10 outline-none"
                      />
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="w-full bg-black text-white text-[10px] font-mono px-2 py-2.5 rounded-xl border border-white/10 outline-none"
                      />
                    </div>
                  ) : (
                    <div className="text-[9px] font-bold text-white/40 uppercase bg-black/40 p-3 rounded-xl border border-white/5 flex items-center h-10">
                      Filtro de Dia ativo no cabeçalho.
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">Métrica de Classificação</label>
                  <div className="bg-black/40 p-1 rounded-xl flex gap-1 border border-white/10 h-10 items-center">
                    <button
                      type="button"
                      onClick={() => setRankingSortMetric('elo')}
                      className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase ${rankingSortMetric === 'elo' ? 'bg-brand-primary text-black' : 'text-white/40'}`}
                    >
                      ELO
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingSortMetric('efficiency_mvp')}
                      className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase ${rankingSortMetric === 'efficiency_mvp' ? 'bg-brand-primary text-black' : 'text-white/40'}`}
                    >
                      MVP (B-1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingSortMetric('efficiency')}
                      className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase ${rankingSortMetric === 'efficiency' ? 'bg-brand-primary text-black' : 'text-white/40'}`}
                    >
                      % VITÓRIAS
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabela */}
              <div className="bg-brand-light backdrop-blur-xl border-white/5 border-l-[8px] border-l-brand-primary rounded-[2.5rem] shadow-2xl overflow-hidden border">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-brand-primary/40">
                        <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Partidas</th>
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">V</th>
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">D</th>
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Saldo</th>
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">%</th>
                        {rankingPeriod === 'session' && (
                          <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center whitespace-nowrap">Tempo (Q/F/%)</th>
                        )}
                        <th className="px-4 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                          {rankingSortMetric === 'efficiency_mvp' ? 'Score B-1' : 'Eficiência'}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">ELO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(() => {
                        const sMatches = (rankingPeriod === 'session' 
                          ? (selectedDailyDate === 'global' ? matches : matches.filter(m => matchesDate(m, selectedDailyDate)))
                          : effectiveMatches).sort((a, b) => a.timestamp - b.timestamp);

                        return [...players]
                          .filter(p => {
                            const stats = topStats.dailyStats[p.id];
                            const hasPlayed = rankingPeriod === 'session' ? (stats && stats.matches > 0) : ((stats?.matches || 0) > 0 || (p.matchesPlayed || 0) > 0);
                            const matchesSearch = p.name.toLowerCase().includes(rankingSearchQuery.toLowerCase());
                            const matchesSocio = filterSocioId === 'all' || p.id === filterSocioId;
                            return hasPlayed && matchesSearch && matchesSocio;
                          })
                          .sort((a, b) => {
                            const statsA = topStats.dailyStats[a.id];
                            const statsB = topStats.dailyStats[b.id];

                            if (rankingSortMetric === 'efficiency') {
                              const matchesA = rankingPeriod === 'session' ? (statsA?.matches || 0) : (statsA?.matches || a.matchesPlayed || 0);
                              const matchesB = rankingPeriod === 'session' ? (statsB?.matches || 0) : (statsB?.matches || b.matchesPlayed || 0);
                              const winsA = rankingPeriod === 'session' ? (statsA?.wins || 0) : (statsA?.wins || a.wins || 0);
                              const winsB = rankingPeriod === 'session' ? (statsB?.wins || 0) : (statsB?.wins || b.wins || 0);
                              const winRateA = matchesA > 0 ? winsA / matchesA : 0;
                              const winRateB = matchesB > 0 ? winsB / matchesB : 0;
                              if (Math.abs(winRateB - winRateA) > 0.0001) return winRateB - winRateA;
                              if (winsB !== winsA) return winsB - winsA;
                              const saldoA = (statsA?.pointsFor || 0) - (statsA?.pointsAgainst || 0);
                              const saldoB = (statsB?.pointsFor || 0) - (statsB?.pointsAgainst || 0);
                              if (saldoB !== saldoA) return saldoB - saldoA;
                            }

                            if (rankingSortMetric === 'efficiency_mvp') {
                              const scoreA = rankingPeriod === 'session'
                                ? (topStats.getDailyMvpEfficiency ? topStats.getDailyMvpEfficiency(a) : 0)
                                : (topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(a) : 0);
                              const scoreB = rankingPeriod === 'session'
                                ? (topStats.getDailyMvpEfficiency ? topStats.getDailyMvpEfficiency(b) : 0)
                                : (topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(b) : 0);
                              if (scoreB !== scoreA) return scoreB - scoreA;
                            }

                            const eloB = rankingPeriod === 'session' ? (statsB?.eloGain || 0) : (b.elo || 0);
                            const eloA = rankingPeriod === 'session' ? (statsA?.eloGain || 0) : (a.elo || 0);
                            if (eloB !== eloA) return eloB - eloA;

                            const timeA = rankingPeriod === 'session' ? (statsA?.duration || 0) : (topStats.totalDurations[a.id] || 0);
                            const timeB = rankingPeriod === 'session' ? (statsB?.duration || 0) : (topStats.totalDurations[b.id] || 0);
                            return timeA - timeB;
                          })
                          .map((player, idx) => {
                            const stats = topStats.dailyStats[player.id];
                            const matchesPlayed = rankingPeriod === 'session' ? (stats?.matches || 0) : (stats?.matches || player.matchesPlayed || 0);
                            const wins = rankingPeriod === 'session' ? (stats?.wins || 0) : (stats?.wins || player.wins || 0);
                            const winRate = Math.round((wins / (matchesPlayed || 1)) * 100);
                            const saldoPts = rankingPeriod === 'session'
                              ? (stats?.pointsFor || 0) - (stats?.pointsAgainst || 0)
                              : (stats?.pointsFor ?? player.pointsFor ?? 0) - (stats?.pointsAgainst ?? player.pointsAgainst ?? 0);

                            return (
                              <tr key={player.id} className="hover:bg-white/5 transition-colors">
                                {/* Coluna 1: Sócio */}
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[12px] font-black text-white/40 font-mono w-6">
                                      {(idx + 1).toString().padStart(2, '0')}
                                    </span>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black bg-white/5 text-white">
                                      {player.name.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-white">{capitalizeName(player.name)}</p>
                                        <EvasionIcon level={calculateEvasionLevel(player, winRate)} />
                                        {(() => {
                                          const mv = leaderboardMovements[player.id];
                                          if (!mv) return null;
                                          if (mv.type === 'up' && mv.diff > 0) {
                                            return (
                                              <span className="flex items-center gap-0.5 text-[10px] font-black text-emerald-500">
                                                <TrendingUp className="w-3 h-3" />{mv.diff}
                                              </span>
                                            );
                                          }
                                          if (mv.type === 'down' && mv.diff > 0) {
                                            return (
                                              <span className="flex items-center gap-0.5 text-[10px] font-black text-rose-500">
                                                <TrendingDown className="w-3 h-3" />{mv.diff}
                                              </span>
                                            );
                                          }
                                          return (
                                            <span className="flex items-center gap-0.5 text-[10px] font-black text-white/30">
                                              <Minus className="w-3 h-3" />0
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[8px] font-black uppercase ${getPlayerTier(player).color}`}>
                                          {getPlayerTier(player).label}
                                        </span>
                                        {player.isOfficialSetter && (
                                          <span className="text-[8px] font-black text-brand-primary uppercase">• Levantador</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Coluna 2: Partidas */}
                                <td className="px-4 py-4 text-center text-xs font-bold text-white/80 font-mono">{matchesPlayed}</td>

                                {/* Coluna 3: V */}
                                <td className="px-4 py-4 text-center text-xs font-bold text-brand-primary font-mono">{wins}</td>

                                {/* Coluna 4: D */}
                                <td className="px-4 py-4 text-center text-xs font-bold text-white/40 font-mono">{matchesPlayed - wins}</td>

                                {/* Coluna 5: Saldo */}
                                <td className={`px-4 py-4 text-center text-xs font-black font-mono ${saldoPts > 0 ? 'text-emerald-500' : saldoPts < 0 ? 'text-rose-500' : 'text-white/40'}`}>
                                  {saldoPts > 0 ? `+${saldoPts}` : saldoPts}
                                </td>

                                {/* Coluna 6: % */}
                                <td className="px-4 py-4 text-center font-mono">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${winRate >= 50 ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/10 text-white/40'}`}>
                                    <CalendarCheck className="w-3 h-3" />
                                    {winRate}%
                                  </span>
                                </td>

                                {/* Coluna 7 (Apenas no Modo Dia): Tempo (Q/F/%) */}
                                {rankingPeriod === 'session' && (
                                  <td className="px-4 py-4 text-center">
                                    {(() => {
                                      const pDuration = stats?.duration || 0;
                                      const attendanceRecord = attendance.find(a => a.id === player.id);
                                      const playerMatches = sMatches.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
                                      let arrivalBound = attendanceRecord?.timestamp || 0;
                                      let departureBound = attendanceRecord?.status === 'left' ? (attendanceRecord.leftAt || Date.now()) : (Date.now() + 86400000);
                                      
                                      if (playerMatches.length > 0) {
                                        const earliestMatchTime = Math.min(...playerMatches.map(m => m.timestamp - (m.duration || 0) * 1000));
                                        const latestMatchTime = Math.max(...playerMatches.map(m => m.timestamp));
                                        if (!attendanceRecord) {
                                          arrivalBound = earliestMatchTime - 300000;
                                          departureBound = latestMatchTime + 60000;
                                        } else {
                                          if (arrivalBound === 0 || earliestMatchTime < arrivalBound) arrivalBound = earliestMatchTime - 60000;
                                          if (latestMatchTime > departureBound) departureBound = latestMatchTime + 60000;
                                        }
                                      }
                                      
                                      const pBaseDuration = sMatches
                                        .filter(m => m.timestamp >= (arrivalBound - 60000) && m.timestamp <= (departureBound + 60000))
                                        .reduce((acc, m) => acc + (m.duration || 0), 0);
                                      
                                      const pMinutes = Math.floor(pDuration / 60);
                                      const fMinutes = Math.max(0, Math.floor((pBaseDuration - pDuration) / 60));
                                      const pPercent = Math.round((pDuration / (pBaseDuration || 1)) * 100);
                                      return (
                                        <div className="flex flex-col items-center">
                                          <span className="text-[10px] font-black text-white">Q:{pMinutes}m / F:{fMinutes}m</span>
                                          <span className="text-[9px] font-black text-brand-primary">{pPercent}%</span>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                )}

                                {/* Coluna 8: Score B-1 ou Eficiência (Única e Alinhada!) */}
                                <td className="px-4 py-4 text-center">
                                  <div className="flex flex-col items-center">
                                    {(() => {
                                      const mvpScore = rankingPeriod === 'session'
                                        ? (topStats.getDailyMvpEfficiency ? topStats.getDailyMvpEfficiency(player) : 0)
                                        : (topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(player) : 0);
                                      return (
                                        <>
                                          <span className="text-xs font-black text-brand-primary font-mono">
                                            {mvpScore.toFixed(1)}
                                          </span>
                                          <span className="text-[7px] font-black text-white/40 uppercase">
                                            SCORE B-1
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </td>

                                {/* Coluna 9: ELO */}
                                <td className="px-6 py-4 text-right">
                                  <div className="flex flex-col items-end">
                                    {rankingPeriod === 'session' ? (
                                      <>
                                        <span className={`text-xs font-black ${(stats?.eloGain || 0) >= 0 ? 'text-brand-primary' : 'text-white/40'}`}>
                                          {(stats?.eloGain || 0) >= 0 ? '+' : ''}{stats?.eloGain || 0}
                                        </span>
                                        <span className="text-[8px] font-bold text-white/40 uppercase">ELO Dia</span>
                                        <div className="flex flex-col items-end gap-0.5 mt-1 text-[8px] font-semibold text-white/50">
                                          <span className="font-mono">Partidas: <strong className="text-white/80">{(stats?.matchEloGain || 0) >= 0 ? '+' : ''}{stats?.matchEloGain || 0}</strong></span>
                                          <span className="font-mono">Bônus: <strong className="text-amber-500">+{stats?.fidelityGain || 0}</strong></span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-xs font-black text-brand-primary">{Math.round(player.elo || 1200)}</span>
                                        <span className="text-[8px] font-bold text-white/40 uppercase">ELO Global</span>
                                        <div className="flex flex-col items-end gap-0.5 mt-1 text-[8px] font-semibold text-white/50">
                                          <span className="font-mono">Partidas: <strong className="text-white/80">{Math.round((player.elo || 1200) - (player.fidelityPoints || 0))}</strong></span>
                                          <span className="font-mono">Bônus: <strong className="text-amber-500">+{player.fidelityPoints || 0}</strong></span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </motion.div>
        ) : (
          /* ABA INDIVIDUAL */
          <motion.div key="individual" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            <div 
              role="button"
              tabIndex={0}
              onClick={() => {
                setModalTarget('selected');
                setIsListModalOpen(true);
              }}
              className="w-full px-6 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-between gap-3 bg-brand-light border border-brand-primary/40 text-white cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-brand-primary" />
                <span>{selectedPlayer ? `Analisando: ${selectedPlayer.name}` : 'Selecionar Sócio para Análise'}</span>
              </div>
              <ChevronRight className="w-5 h-5 opacity-40" />
            </div>

            {selectedPlayer && (
              <div className="space-y-8">
                <div className="bg-brand-light backdrop-blur-xl rounded-[3rem] p-8 text-white shadow-2xl relative overflow-hidden border border-white/5 border-l-[8px] border-l-brand-primary">
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-5">
                      <PlayerAvatar player={selectedPlayer} size="xl" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                            {selectedPlayer.name}
                          </h3>
                          {selectedPlayer.isOfficialSetter && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                              Levantador Oficial
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/5 border border-white/10 ${getPlayerTier(selectedPlayer).color}`}>
                            {getPlayerTier(selectedPlayer).label}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
                            IC {calculateCompositePerformanceRating(selectedPlayer).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="bg-white/5 px-6 py-4 rounded-3xl border border-brand-primary/40 text-center">
                        <p className="text-4xl font-black font-mono text-brand-primary">{Math.round(selectedPlayer.elo || 1200)}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">ELO Global</p>
                      </div>
                      <div className="bg-white/5 px-6 py-4 rounded-3xl border border-amber-500/40 text-center">
                        <p className="text-4xl font-black font-mono text-amber-500">+{selectedPlayer.fidelityPoints || 0}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Bônus Presença</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <button
                      onClick={() => setShowEloStatement(true)}
                      className="px-6 py-3 bg-brand-primary text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                    >
                      <History className="w-4 h-4" />
                      Extrato de Pontos ELO
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                    <div className="bg-brand-secondary/30 border border-white/5 p-5 rounded-[2rem]">
                      <p className="text-[10px] font-black text-white/40 uppercase mb-2">Tempo Total das Partidas</p>
                      <p className="text-2xl font-black text-brand-primary">{playerIndividualMetrics.totalMatchesDuration}</p>
                    </div>
                    <div className="bg-brand-secondary/30 border border-white/5 p-5 rounded-[2rem]">
                      <p className="text-[10px] font-black text-white/40 uppercase mb-2">Aproveitamento Quadra</p>
                      <p className="text-2xl font-black text-brand-primary">{playerIndividualMetrics.participation}</p>
                    </div>
                    <div className="bg-brand-secondary/30 border border-white/5 p-5 rounded-[2rem]">
                      <p className="text-[10px] font-black text-white/40 uppercase mb-2">Total em Quadra</p>
                      <p className="text-2xl font-black text-brand-primary">{playerIndividualMetrics.totalPlaying}</p>
                    </div>
                    <div className="bg-brand-secondary/30 border border-white/5 p-5 rounded-[2rem]">
                      <p className="text-[10px] font-black text-white/40 uppercase mb-2">Score MVP (B-1)</p>
                      <p className="text-2xl font-black text-brand-primary">
                        {topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(selectedPlayer).toFixed(1) : '0.0'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Gráficos Individuais */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-black backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl border">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-xs font-black uppercase tracking-widest text-white">Evolução de ELO</h4>
                      <div className="flex bg-white/5 p-1 rounded-xl">
                        {(['7', '30', 'all'] as const).map(range => (
                          <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${timeRange === range ? 'bg-brand-primary text-black' : 'text-white/40'}`}
                          >
                            {range === 'all' ? 'Tudo' : `${range}D`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={eloChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#fff' }} />
                          <YAxis width={40} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#fff' }} domain={['dataMin - 50', 'dataMax + 50']} />
                          <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: '#1E232D', border: 'none', color: '#fff' }} />
                          <Area name={selectedPlayer.name} type="monotone" dataKey="elo" stroke="#F5C429" strokeWidth={3} fillOpacity={0.2} fill="#F5C429" />
                          <Line name="Média do Grupo" type="monotone" dataKey="groupAverage" stroke="#ffffff" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <IcEvolutionChart player={selectedPlayer} matches={matches} isDark={true} />
                </div>

                {/* Sinergia Individual */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 rounded-[2rem] border bg-black border-white/5">
                    <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-3">Sinergia Positiva</h4>
                    <p className="font-black uppercase text-sm text-white">{playerRelationships.synergy?.name || 'Parceiro Ideal'}</p>
                    <p className="text-[10px] font-bold text-brand-primary">{playerRelationships.synergy ? `${playerRelationships.synergy.wins} vitórias juntos` : 'Sem dados'}</p>
                  </div>
                  <div className="p-6 rounded-[2rem] border bg-black border-white/5">
                    <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-3">Sinergia Negativa</h4>
                    <p className="font-black uppercase text-sm text-white">{playerRelationships.negativeSynergy?.name || 'Parceiro Difícil'}</p>
                    <p className="text-[10px] font-bold text-brand-primary">{playerRelationships.negativeSynergy ? `${playerRelationships.negativeSynergy.losses} derrotas juntos` : 'Sem dados'}</p>
                  </div>
                  <div className="p-6 rounded-[2rem] border bg-black border-white/5">
                    <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-3">Maior Rival</h4>
                    <p className="font-black uppercase text-sm text-white">{playerRelationships.rivalry?.name || 'Nenhum Rival'}</p>
                    <p className="text-[10px] font-bold text-brand-primary">{playerRelationships.rivalry ? `${playerRelationships.rivalry.losses} derrotas contra` : 'Sem histórico'}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Seleção de Sócio */}
      <AnimatePresence>
        {isListModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsListModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl rounded-[3rem] bg-black border border-white/10 overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-black uppercase text-white">Selecionar Sócio</h3>
                <button onClick={() => setIsListModalOpen(false)} className="p-2 bg-white/5 rounded-xl text-white/60"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 border-b border-white/5">
                <input
                  type="text"
                  placeholder="Buscar sócio..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-brand-primary/40 text-white text-sm font-bold outline-none"
                />
              </div>
              <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...players]
                  .filter(p => p.name.toLowerCase().includes(modalSearchQuery.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(player => (
                    <button
                      key={player.id}
                      onClick={() => {
                        if (modalTarget === 'selected') setSelectedPlayerId(player.id);
                        else setComparisonPlayerId(player.id);
                        setIsListModalOpen(false);
                        setModalSearchQuery('');
                      }}
                      className="flex items-center gap-3 p-4 rounded-2xl border bg-white/5 border-white/10 hover:border-brand-primary text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-brand-primary text-black flex items-center justify-center font-black">
                        {player.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">{capitalizeName(player.name)}</p>
                        <p className="text-[10px] font-bold text-white/40 uppercase">ELO: {Math.round(player.elo || 1200)} • {player.wins || 0}V</p>
                      </div>
                    </button>
                  ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Extrato de ELO */}
      <AnimatePresence>
        {showEloStatement && selectedPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEloStatement(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-brand-secondary border border-brand-primary/40 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white uppercase">Extrato de Pontos ELO</h3>
                  <p className="text-xs font-black text-brand-primary uppercase">{selectedPlayer.name}</p>
                </div>
                <button onClick={() => setShowEloStatement(false)} className="p-2 rounded-xl bg-white/5 text-white/60"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {comprehensiveHistory.map((entry, idx) => {
                  const change = entry.change;
                  const result = entry.result || (change > 0 ? 'V' : change < 0 ? 'D' : '-');
                  return (
                    <div key={idx} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                          result === 'V' ? 'bg-brand-primary text-black' : result === 'D' ? 'bg-white text-black' : 'bg-emerald-500 text-white'
                        }`}>
                          {result === 'P' ? 'BÔNUS' : result}
                        </span>
                        <div>
                          <p className="text-xs font-black text-white">{formatBrazilianDate(entry.date)}</p>
                          {entry.matchDetails?.dailyNumber && (
                            <p className="text-[10px] text-white/40 font-bold">
                              Partida #{entry.matchDetails.dailyNumber} ({entry.matchDetails.scoreA}x{entry.matchDetails.scoreB})
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <p className={`text-sm font-black ${change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-white/40'}`}>
                          {change !== undefined ? (change > 0 ? `+${change}` : change) : '-'}
                        </p>
                        <p className="text-[10px] text-white/40 font-bold">Saldo: {entry.elo ?? '-'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};