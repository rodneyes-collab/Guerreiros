import { SynergyAnalysis } from './SynergyAnalysis';
import { AICoach } from './AICoach';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { useNarration } from '../src/hooks/useNarration';
import { useAIStatus } from '../src/hooks/useAIStatus';
import { Player, Match } from '../types';
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
  Star,
  History,
  X,
  Info,
  Download,
  Share2,
  Copy,
  BarChart3,
  Volume2,
  Clock,
  Timer
, BrainCircuit} from 'lucide-react';
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
import ReactMarkdown from 'react-markdown';
import { WinLossChart } from '../src/components/WinLossChart';
import { IcEvolutionChart } from '../src/components/IcEvolutionChart';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { translateGender, capitalizeName } from '../utils/helpers';
import { generateDailySummaryAudio, detectAnomalies } from '../services/geminiService';
import { calculateEffectiveElo, calculateCompositePerformanceRating } from '../utils/teamLogic';
import { calculateMvpEfficiencyScore } from '../utils/statsLogic';
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
    synergy, 
    negativeSynergy, 
    rivalry, 
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
    setViewMode, 
    payments, 
    expenses, 
    systemMetadata 
  } = useStore(useShallow(state => ({
    synergy: state.synergy,
    negativeSynergy: state.negativeSynergy,
    rivalry: state.rivalry,
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
    setViewMode: state.setViewMode,
    payments: state.payments,
    expenses: state.expenses,
    systemMetadata: state.systemMetadata
  })));
  
  const { handleAnnounce, playAudioContent } = useNarration();

  // Unified narrating state: disable buttons if ANY narration is happening (Team announcement or Summary)
  const activeIsNarrating = isNarratingSummaryFromStore || isNarratingFromStore || isNarratingSummary;

  const players = useMemo(() => allPlayers.filter(p => 
    (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && 
    !p.isDM && 
    p.name?.toLowerCase() !== 'financeiro'
  ), [allPlayers]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'individual' | 'global' | 'synergy' | 'coach'>('daily');
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
        players: players,
        matches: matches,
        metadata: {
          sessionDate: selectedDailyDate,
          totalMatches: matches.length,
          activePlayersCount: players.length
        }
      };
      
      const report = await detectAnomalies(dataToAnalyze);
      setAuditReport(report);
    } catch (error) {
      console.error("Erro na auditoria:", error);
      setAuditReport("Falha ao realizar a auditoria de dados.");
    } finally {
      setIsAuditing(false);
    }
  };

  // Helper to extract standard Brasília date from a match (resilient to UTC/local timezones)
  const getMatchDate = useCallback((m: { date?: string; timestamp?: number }): string => {
    if (m.timestamp) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(m.timestamp));
    }
    return m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
  }, []);

  const matchesDate = useCallback((m: { date?: string; timestamp?: number }, targetDate: string): boolean => {
    if (!targetDate) return false;
    const directDate = m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
    const tsDate = getMatchDate(m);
    return directDate === targetDate || tsDate === targetDate;
  }, [getMatchDate]);

  const sessionMatches = useMemo(() => {
    let ms = selectedDailyDate === 'global' ? matches : matches.filter(m => matchesDate(m, selectedDailyDate));
    return ms;
  }, [matches, selectedDailyDate, matchesDate]);

  const effectiveMatches = useMemo(() => {
    let ms = rankingPeriod === 'session' ? sessionMatches : matches;
    
    // Apply custom date boundaries for career metrics
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
      // Limpar o store após consumir para não ficar preso nesta visão
      setSelectedRankingPlayerId(null);
    }
  }, [selectedRankingPlayerId, setSelectedRankingPlayerId]);

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
  const [rankingSearchQuery, setRankingSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'all'>('all');
  const [chartMetric, setChartMetric] = useState<'elo' | 'winrate' | 'matches'>('elo');

  const [comparisonPlayerId, setComparisonPlayerId] = useState<string | null>(null);
  const [showEloStatement, setShowEloStatement] = useState(false);
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

  const calculateWilsonScore = (wins: number, total: number, z: number = 1.96) => {
    if (total === 0) return 0;
    const p = wins / total;
    const denominator = 1 + (z * z) / total;
    const center = p + (z * z) / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.max(0, (center - spread) / denominator);
  };

  const calculateCertaintyFloor = (mu: number = 25, sigma: number = 8.333) => {
    return mu - 3 * sigma;
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
    
    // Use the same sorting logic as the main table for consistency
    const sorted = [...players].sort((a, b) => {
      const eloB = b.elo || 1200;
      const eloA = a.elo || 1200;
      if (eloB !== eloA) return eloB - eloA;
      
      const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.33);
      const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.33);
      if (Math.abs(effB - effA) > 0.0001) return effB - effA;
      
      // Calculate career court times directly for tiebreaker
      const timeA = matches.reduce((acc, m) => acc + (m.teamA.includes(a.id) || m.teamB.includes(a.id) ? (m.duration || 0) : 0), 0);
      const timeB = matches.reduce((acc, m) => acc + (m.teamA.includes(b.id) || m.teamB.includes(b.id) ? (m.duration || 0) : 0), 0);
      return timeA - timeB;
    });
    
    return sorted[0];
  }, [players, matches]);

  const selectedPlayer = useMemo(() => {
    if (!players) return null;
    return players.find(p => p.id === (selectedPlayerId || topPlayer?.id));
  }, [players, selectedPlayerId, topPlayer]);

  const comprehensiveHistory = useMemo(() => {
    if (!selectedPlayer) return [];
    
    // 1. Get explicit ELO history
    const historyArr = [...(selectedPlayer.eloHistory || [])];
    
    // 2. Get all matches for this player from 60 days
    const playerMatches = matches.filter(m => 
      m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id)
    ).sort((a, b) => a.timestamp - b.timestamp); // Chronological
    
    // Group matches by date
    const matchesByDate: Record<string, typeof playerMatches> = {};
    playerMatches.forEach(m => {
      const d = getMatchDate(m) || m.date;
      if (!matchesByDate[d]) matchesByDate[d] = [];
      matchesByDate[d].push(m);
    });

    const finalHistory: any[] = [];
    const processedMatchIds = new Set<string>();
    const processedHistoryIndices = new Set<number>();

    // Step 2: Phase 1 - Match by explicit MatchId (Strongest Match)
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

    // Step 3: Phase 2 - Match by Date Sequence for remaining
    // We only try to match history entries that aren't the very FIRST one (often Initial ELO)
    // and that don't have a clear "adjustment" vibe.
    historyArr.forEach((hEntry, hIdx) => {
      if (processedHistoryIndices.has(hIdx)) return;

      // Skip matching for the very first entry if it's likely a starting balance
      const isInitial = hIdx === 0 && historyArr.length > 1;
      
      const dayMatches = matchesByDate[hEntry.date] || [];
      
      // Find the first match of that day that hasn't been claimed yet
      const match = !isInitial ? dayMatches.find(m => !processedMatchIds.has(m.id)) : null;

      if (match) {
        finalHistory.push({ ...hEntry, matchDetails: match });
        processedMatchIds.add(match.id);
      } else {
        finalHistory.push({ ...hEntry });
      }
      processedHistoryIndices.add(hIdx);
    });

    // Step 4: Phase 3 - Add matches that have NO ELO history record (Pending or purged)
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

    // Chronological Sort: Oldest First for backward pass calculation
    finalHistory.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
      return timeA - timeB; 
    });

    // Step 5: Phase 4 - Backward Fill to compute ELO and change accurately
    let nextElo = selectedPlayer.elo || 1200;
    
    for (let i = finalHistory.length - 1; i >= 0; i--) {
      const entry = finalHistory[i];
      
      // Compute missing change if older entry elo exists
      if (entry.change === undefined && i > 0 && entry.elo !== undefined) {
          const prevEntry = finalHistory[i - 1];
          if (prevEntry.elo !== undefined) {
             entry.change = entry.elo - prevEntry.elo;
          }
      }

      if (entry.elo !== undefined) {
        // If entry has explicit ELO, synchronize our backward tracker
        nextElo = entry.elo;
      } else {
        // Compute entry's ELO dynamically
        entry.elo = nextElo;
      }

      // Step backwards for the next older item
      const change = entry.change !== undefined ? entry.change : 0;
      nextElo = nextElo - change;
    }

    // Final Sort: Newest First
    return finalHistory.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
      return timeB - timeA;
    });
  }, [selectedPlayer, matches]);

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
       const p = players.find(p => p.id === id);
       if (p && wins > bestSynergy.wins) bestSynergy = { name: p.name || 'Sócio sem nome', wins };
    });
    Object.entries(nSyn).forEach(([id, losses]) => {
       const p = players.find(p => p.id === id);
       if (p && losses > worstNegativeSynergy.losses) worstNegativeSynergy = { name: p.name || 'Sócio sem nome', losses };
    });
    Object.entries(riv).forEach(([id, losses]) => {
       const p = players.find(p => p.id === id);
       if (p && losses > worstRival.losses) worstRival = { name: p.name || 'Sócio sem nome', losses };
    });

    return { 
      synergy: bestSynergy.wins > 0 ? bestSynergy : null, 
      negativeSynergy: worstNegativeSynergy.losses > 0 ? worstNegativeSynergy : null,
      rivalry: worstRival.losses > 0 ? worstRival : null 
    };
  }, [selectedPlayer, players, rankingPeriod, effectiveMatches, matches]);

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
    
    // Apply time range filter - ignore if in session mode
    if (timeRange !== 'all' && rankingPeriod !== 'session') {
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
    const playerMatches = effectiveMatches.filter(m => 
      m.teamA.includes(selectedPlayer.id) || m.teamB.includes(selectedPlayer.id)
    );
    
    playerMatches.forEach(m => {
      const dateStr = getMatchDate(m) || m.date;
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
      .filter(([dateStr]) => rankingPeriod !== 'session' || selectedDailyDate === 'global' || dateStr === selectedDailyDate)
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
  }, [selectedPlayer, effectiveMatches, timeRange, rankingPeriod, selectedDailyDate]);

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
    if (!selectedPlayer || !effectiveMatches) return null;

    const winLossData = [
      { name: 'Vitórias', value: selectedPlayer.wins || 0, color: '#10b981' },
      { name: 'Derrotas', value: selectedPlayer.losses || 0, color: '#f43f5e' }
    ];

    // Calculate current streak from matches
    const playerMatches = effectiveMatches
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
  }, [selectedPlayer, effectiveMatches]);

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
    }).slice(-15); // Show last 15 matches for clarity
  }, [selectedPlayer, effectiveMatches]);

  const stabilityData = useMemo(() => {
    if (!selectedPlayer || !effectiveMatches) return [];
    
    const playerMatches = effectiveMatches.filter(m => 
      (m.teamA?.includes(selectedPlayer.id) || m.teamB?.includes(selectedPlayer.id)) &&
      (m.winner === 'A' || m.winner === 'B')
    );
    
    if (playerMatches.length === 0) return [];

    const buckets: Record<number, { wins: number, total: number }> = {};
    
    playerMatches.forEach(m => {
      // Fallback para duração calculada ou padrão de 12 min
      const durationSeconds = m.duration || (m.startTime && m.endTime ? Math.round((m.endTime - m.startTime) / 1000) : 720);
      const durationMinutes = Math.max(6, Math.round(durationSeconds / 60));
      const bucket = Math.round(durationMinutes / 2) * 2; // Blocos de 2 min
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
  }, [selectedPlayer, effectiveMatches]);

  const getTrend = (player: any) => {
    if (!player.eloHistory || player.eloHistory.length < 2) return 'neutral';
    const last = player.eloHistory[player.eloHistory.length - 1].elo;
    const prev = player.eloHistory[player.eloHistory.length - 2].elo;
    if (last > prev) return 'up';
    if (last < prev) return 'down';
    return 'neutral';
  };

  // Get unique dates strictly from matches where actual matches occurred
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach(m => {
      const d = getMatchDate(m);
      if (d) dates.add(d);
      else if (m.date) dates.add(m.date.includes('T') ? m.date.split('T')[0] : m.date);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [matches, getMatchDate]);

  // Keep selectedDailyDate synchronized: if current selection has no matches, select the latest session with matches
  useEffect(() => {
    if (availableDates.length > 0) {
      if (!selectedDailyDate || (!availableDates.includes(selectedDailyDate) && selectedDailyDate !== 'global')) {
        setSelectedDailyDate(availableDates[0]);
      }
    }
  }, [availableDates, selectedDailyDate]);

  // Calculate rank movements compared to the previous game session
  const leaderboardMovements = useMemo(() => {
    if (!players || players.length === 0 || availableDates.length === 0) return {};

    const currentRefDate = rankingPeriod === 'career' ? today : selectedDailyDate;
    let prevRefDate: string | null = null;

    if (rankingPeriod === 'career') {
      const latestSessionInHistory = availableDates[0];
      if (latestSessionInHistory === today) {
        prevRefDate = availableDates[1] || null;
      } else {
        prevRefDate = latestSessionInHistory;
      }
    } else {
      const idx = availableDates.indexOf(selectedDailyDate);
      if (idx !== -1) {
        prevRefDate = availableDates[idx + 1] || null;
      } else if (availableDates.length > 0) {
        prevRefDate = availableDates[0];
      }
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

      // Fallback: calculate using matches after date
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
        .map(p => {
          const eff = (p.trueSkill?.mu || 25) - 3 * (p.trueSkill?.sigma || 8.333);
          const duration = matches
            .filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id))
            .reduce((acc, m) => acc + (m.duration || 0), 0);
          return { id: p.id, elo: p.elo || 1200, eff, duration };
        })
        .sort((a, b) => {
          if (b.elo !== a.elo) return b.elo - a.elo;
          if (Math.abs(b.eff - a.eff) > 0.0001) return b.eff - a.eff;
          return a.duration - b.duration;
        });

      const prevRankings = [...players]
        .filter(p => {
          const matchesBefore = matches.filter(m => (getMatchDate(m) || m.date) <= prevRefDate! && (m.teamA.includes(p.id) || m.teamB.includes(p.id)));
          return matchesBefore.length > 0;
        })
        .map(p => {
          const prevElo = getEloAtDate(p, prevRefDate!);
          const eff = (p.trueSkill?.mu || 25) - 3 * (p.trueSkill?.sigma || 8.333);
          const duration = matches
            .filter(m => (getMatchDate(m) || m.date) <= prevRefDate! && (m.teamA.includes(p.id) || m.teamB.includes(p.id)))
            .reduce((acc, m) => acc + (m.duration || 0), 0);
          return { id: p.id, elo: prevElo, eff, duration };
        })
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
      // Session mode
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
  }, [players, availableDates, selectedDailyDate, today, rankingPeriod, matches]);

  // Calculate Elo rankings for all players (Global)
  const eloRankings = useMemo(() => {
    const totalDurations: Record<string, number> = {};
    matches.forEach(m => {
      [...m.teamA, ...m.teamB].forEach(pId => {
        totalDurations[pId] = (totalDurations[pId] || 0) + (m.duration || 0);
      });
    });

    const sorted = [...players]
      .filter(p => p.matchesPlayed > 0)
      .sort((a, b) => {
        const eloB = b.elo || 1200;
        const eloA = a.elo || 1200;
        if (eloB !== eloA) return eloB - eloA;

        const timeA = totalDurations[a.id] || 0;
        const timeB = totalDurations[b.id] || 0;
        return timeA - timeB;
      });
    
    const ranks: Record<string, number> = {};
    sorted.forEach((p, idx) => {
      ranks[p.id] = idx + 1;
    });
    return ranks;
  }, [players, matches]);

  // Calculate Efficiency rankings for all players (Global) - Based on Win Rate % (Option 1)
  const efficiencyRankings = useMemo(() => {
    const sorted = [...players]
      .filter(p => p.matchesPlayed > 0)
      .sort((a, b) => {
        const winRateA = (a.matchesPlayed || 0) > 0 ? (a.wins || 0) / a.matchesPlayed : 0;
        const winRateB = (b.matchesPlayed || 0) > 0 ? (b.wins || 0) / b.matchesPlayed : 0;
        if (Math.abs(winRateB - winRateA) > 0.0001) return winRateB - winRateA;
        
        // Tie-breaker 1: Wins
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        
        // Tie-breaker 2: Saldo (Points difference)
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

  // Calculate Consolidated Ranking (Average of Elo rank and Efficiency rank)
  const consolidatedRankings = useMemo(() => {
    const consolidatedScores = players
      .filter(p => p.matchesPlayed > 0)
      .map(p => {
        const eloRank = eloRankings[p.id] || players.length;
        const effRank = efficiencyRankings[p.id] || players.length;
        return {
          id: p.id,
          avgRank: (eloRank + effRank) / 2
        };
      })
      .sort((a, b) => a.avgRank - b.avgRank);

    const ranks: Record<string, number> = {};
    consolidatedScores.forEach((item, idx) => {
      ranks[item.id] = idx + 1;
    });
    return ranks;
  }, [players, eloRankings, efficiencyRankings]);

  // Top Stats
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
      totalDurations: {},
      dailyStats: {}
    };
    
    // Minimum matches to qualify for MVP/Best Setter to avoid outliers
    const MIN_MATCHES = 12; // Increased to 12 for career to ensure a robust sample size

    const getWinRate = (p: any) => (p.matchesPlayed || 0) > 0 ? (p.wins || 0) / p.matchesPlayed : 0;

    const totalDurations: Record<string, number> = {};
    matches.forEach(m => {
      [...m.teamA, ...m.teamB].forEach(pId => {
        totalDurations[pId] = (totalDurations[pId] || 0) + (m.duration || 0);
      });
    });

    // Calculate stats based on rankingPeriod
    const resolvedDate = selectedDailyDate;

    let dailyStats: Record<string, { matches: number, wins: number, eloGain: number, matchEloGain?: number, fidelityGain?: number, duration: number, pointsFor: number, pointsAgainst: number }> = {};
    let dailyMatchesCount = 0;

    if (rankingPeriod === 'career' || (rankingPeriod === 'session' && resolvedDate === 'global')) {
      dailyMatchesCount = effectiveMatches.length;
      players.forEach(p => {
        const playerMatches = effectiveMatches.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id));
        const wins = playerMatches.filter(m => 
          (m.winner === 'A' && m.teamA.includes(p.id)) || 
          (m.winner === 'B' && m.teamB.includes(p.id))
        ).length;
        const duration = playerMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
        const pFor = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreA || 0) : (m.scoreB || 0));
        }, 0);
        const pAgainst = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreB || 0) : (m.scoreA || 0));
        }, 0);

        dailyStats[p.id] = { matches: playerMatches.length, wins, eloGain: (p.elo || 1200) - 1200, matchEloGain: (p.elo || 1200) - 1200 - (p.fidelityPoints || 0), fidelityGain: p.fidelityPoints || 0, duration, pointsFor: pFor, pointsAgainst: pAgainst };
      });
    } else {
      const dateKey = resolvedDate;
      const dateMatches = (dateKey === 'global') ? matches : matches.filter(m => matchesDate(m, dateKey));
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
        const pFor = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreA || 0) : (m.scoreB || 0));
        }, 0);
        const pAgainst = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreB || 0) : (m.scoreA || 0));
        }, 0);

        let totalMatches = playerMatches.length;
        let wins = playerWins;
        let eloGain = 0;
        let matchEloGain = 0;
        let fidelityGain = 0;

        if (dateMatches.length === 0 && p.eloHistory && p.eloHistory.length > 0) {
          const historyEntry = p.eloHistory.find(h => {
             const hDateStr = h.date.includes('T') ? h.date.split('T')[0] : h.date;
             return hDateStr === dateKey;
          });
          if (historyEntry && historyEntry.change) {
            eloGain = historyEntry.change;
            if (eloGain >= 50 || historyEntry.fidelityBonus) {
              fidelityGain = 50;
              matchEloGain = eloGain - 50;
            } else {
              matchEloGain = eloGain;
            }
            if (matchEloGain > 0) {
              totalMatches = Math.round(matchEloGain / 20) || 1;
              wins = totalMatches;
            } else if (matchEloGain < 0) {
              totalMatches = Math.round(Math.abs(matchEloGain) / 20) || 1;
              wins = 0;
            } else if (fidelityGain > 0) {
              totalMatches = 1;
              wins = 0;
            }
          }
        } else {
          const losses = totalMatches - wins;
          matchEloGain = totalMatches > 0 ? (wins * 20 + losses * -20) : 0;
          const hasFidelityBonus = (p.eloHistory || []).some(h => h.date === dateKey && h.fidelityBonus) || (totalMatches > 0);
          fidelityGain = hasFidelityBonus ? 50 : 0;
          eloGain = matchEloGain + fidelityGain;
        }

        dailyStats[p.id] = {
          matches: totalMatches,
          wins: wins,
          eloGain: eloGain,
          matchEloGain: matchEloGain,
          fidelityGain: fidelityGain,
          duration: duration,
          pointsFor: pFor,
          pointsAgainst: pAgainst
        };
      });
    }

    const maxDailyMatches = Math.max(0, ...Object.values(dailyStats).map(s => s.matches));
    const minReqDailyMatches = Math.max(1, Math.min(maxDailyMatches, 2));

    const getDailyWinRate = (pId: string) => {
      const stats = dailyStats[pId];
      return (stats?.matches || 0) > 0 ? (stats.wins || 0) / stats.matches : 0;
    };

    const getDailyMvpEfficiency = (p: any) => {
      const stats = dailyStats[p.id];
      const wr = getDailyWinRate(p.id);
      const matches = stats?.matches || 0;
      const eloGain = stats?.matchEloGain !== undefined ? stats.matchEloGain : (stats?.eloGain || 0);
      const pointsFor = stats?.pointsFor || 0;
      const pointsAgainst = stats?.pointsAgainst || 0;
      return calculateMvpEfficiencyScore(p, wr, matches, eloGain, pointsFor, pointsAgainst, true);
    };

    const getCareerMvpEfficiency = (p: any) => {
      const matches = p.matchesPlayed || 0;
      const wr = matches > 0 ? (p.wins || 0) / matches : 0;
      const eloGain = (p.elo || 1200) - 1200;
      const pointsFor = p.pointsFor || 0;
      const pointsAgainst = p.pointsAgainst || 0;
      return calculateMvpEfficiencyScore(p, wr, matches, eloGain, pointsFor, pointsAgainst, false);
    };

    // Pre-calculate playersMap for setter utility
    const playersMap = players.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, Player>);

    // Calculate actual setter stats (who really played as setter)
    const dailyMatches = matches.filter(m => m.date === selectedDailyDate);
    const careerSetterStats = calculateSetterStats(matches, playersMap);
    const dailySetterStats = calculateSetterStats(dailyMatches, playersMap);

    const mvp = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES)
      .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a) || (b.elo || 0) - (a.elo || 0) || (totalDurations[a.id] || 0) - (totalDurations[b.id] || 0))[0] || 
      [...players]
        .filter(p => (p.matchesPlayed || 0) > 0)
        .sort((a, b) => getCareerMvpEfficiency(b) - getCareerMvpEfficiency(a) || (b.elo || 0) - (a.elo || 0) || (totalDurations[a.id] || 0) - (totalDurations[b.id] || 0))[0];

    const activePlayers = players.filter(p => (p.status || 'active') === 'active');
    const MIN_SETTER_CAREER_MATCHES = 20;

    // MELHOR LEVANTADOR GERAL (Baseado em partidas REAIS como levantador com volume e status estritamente ativo)
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
      // Fallback para maior habilidade de levantamento se ninguém jogou como levantador ainda entre os ativos
      const played = activePlayers.filter(p => (p.matchesPlayed || 0) > 0);
      if (played.length > 0) {
        const maxSetting = Math.max(...played.map(p => p.skills?.setting || 1));
        bestSetter = played.filter(p => (p.skills?.setting || 1) === maxSetting)
          .sort((a, b) => calculateWilsonScore(b.wins, b.matchesPlayed) - calculateWilsonScore(a.wins, a.matchesPlayed) || (b.elo || 0) - (a.elo || 0))[0];
      }
    }

    const dailyMvp = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches)
      .sort((a, b) => 
        getDailyMvpEfficiency(b) - getDailyMvpEfficiency(a) || 
        ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0))) || 
        (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0)
      )[0] ||
      [...players]
        .filter(p => (dailyStats[p.id]?.matches || 0) > 0)
        .sort((a, b) => 
          getDailyMvpEfficiency(b) - getDailyMvpEfficiency(a) || 
          ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0))) || 
          (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0)
        )[0];

    // MELHOR LEVANTADOR DO DIA (Baseado em partidas REAIS como levantador hoje com status estritamente ativo)
    let dailyBestSetter = activePlayers
      .filter(p => (dailySetterStats[p.id]?.matches || 0) >= Math.max(1, Math.min(minReqDailyMatches, 2)))
      .sort((a, b) => 
        calculateSetterScore(dailySetterStats[b.id]?.wins || 0, dailySetterStats[b.id]?.matches || 0, true) - 
        calculateSetterScore(dailySetterStats[a.id]?.wins || 0, dailySetterStats[a.id]?.matches || 0, true) || 
        ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0)))
      )[0] ||
      activePlayers
        .filter(p => (dailySetterStats[p.id]?.matches || 0) > 0)
        .sort((a, b) => 
          calculateSetterScore(dailySetterStats[b.id]?.wins || 0, dailySetterStats[b.id]?.matches || 0, true) - 
          calculateSetterScore(dailySetterStats[a.id]?.wins || 0, dailySetterStats[a.id]?.matches || 0, true) || 
          ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0)))
        )[0];

    if (!dailyBestSetter) {
      // Fallback para quem tem maior habilidade de levantamento entre os ativos que jogaram hoje
      const played = activePlayers.filter(p => (dailyStats[p.id]?.matches || 0) > 0);
      if (played.length > 0) {
        const maxSetting = Math.max(...played.map(p => p.skills?.setting || 1));
        dailyBestSetter = played.filter(p => (p.skills?.setting || 1) === maxSetting)
          .sort((a, b) => 
            calculateWilsonScore(dailyStats[b.id]?.wins || 0, dailyStats[b.id]?.matches || 0) - calculateWilsonScore(dailyStats[a.id]?.wins || 0, dailyStats[a.id]?.matches || 0) || 
            ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0)))
          )[0];
      }
    }

    const topEloCandidates = [...players]
      .filter(p => p.id !== mvp?.id)
      .sort((a, b) => (b.elo || 0) - (a.elo || 0) || (totalDurations[a.id] || 0) - (totalDurations[b.id] || 0));
    const topElo = topEloCandidates.length > 0 ? topEloCandidates[0] : [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0) || (totalDurations[a.id] || 0) - (totalDurations[b.id] || 0))[0];
    
    
    const dailyKingCandidates = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches && p.id !== dailyMvp?.id)
      .sort((a, b) => 
        ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0))) || 
        (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0) ||
        (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0) ||
        (dailyStats[a.id]?.matches || 0) - (dailyStats[b.id]?.matches || 0)
      );
    const fallbackDailyKingCandidates = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) > 0 && p.id !== dailyMvp?.id)
      .sort((a, b) => 
        ((dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0)) - (dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0))) || 
        (dailyStats[a.id]?.duration || 0) - (dailyStats[b.id]?.duration || 0) ||
        (dailyStats[b.id]?.wins || 0) - (dailyStats[a.id]?.wins || 0) ||
        (dailyStats[a.id]?.matches || 0) - (dailyStats[b.id]?.matches || 0)
      );

    const dailyKing = dailyKingCandidates.length > 0 ? dailyKingCandidates[0] : (fallbackDailyKingCandidates.length > 0 ? fallbackDailyKingCandidates[0] : dailyMvp);

    const topImpactCandidates = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES && p.id !== mvp?.id)
      .sort((a, b) => {
        const impactA = ((a.elo || 1200) - 1200) / (a.matchesPlayed || 1);
        const impactB = ((b.elo || 1200) - 1200) / (b.matchesPlayed || 1);
        return impactB - impactA || (b.matchesPlayed || 0) - (a.matchesPlayed || 0);
      });
      
    const fallbackTopImpactCandidates = [...players]
      .filter(p => (p.matchesPlayed || 0) > 0 && p.id !== mvp?.id)
      .sort((a, b) => {
        const impactA = ((a.elo || 1200) - 1200) / (a.matchesPlayed || 1);
        const impactB = ((b.elo || 1200) - 1200) / (b.matchesPlayed || 1);
        return impactB - impactA || (b.matchesPlayed || 0) - (a.matchesPlayed || 0);
      });
    
    const topImpact = topImpactCandidates.length > 0 ? topImpactCandidates[0] : (fallbackTopImpactCandidates.length > 0 ? fallbackTopImpactCandidates[0] : mvp);

    const dailyEfficient = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) >= minReqDailyMatches && (dailyStats[p.id]?.duration || 0) > 0 && p.id !== dailyKing?.id && p.id !== dailyMvp?.id)
      .sort((a, b) => {
        const gainB = dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0);
        const gainA = dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0);
        const effA = gainA / dailyStats[a.id].duration;
        const effB = gainB / dailyStats[b.id].duration;
        const saldoA = (dailyStats[a.id]?.pointsFor || 0) - (dailyStats[a.id]?.pointsAgainst || 0);
        const saldoB = (dailyStats[b.id]?.pointsFor || 0) - (dailyStats[b.id]?.pointsAgainst || 0);
        return effB - effA || saldoB - saldoA;
      })[0] ||
      [...players]
        .filter(p => (dailyStats[p.id]?.matches || 0) > 0 && (dailyStats[p.id]?.duration || 0) > 0 && p.id !== dailyKing?.id && p.id !== dailyMvp?.id)
        .sort((a, b) => {
          const gainB = dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0);
          const gainA = dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0);
          const effA = gainA / dailyStats[a.id].duration;
          const effB = gainB / dailyStats[b.id].duration;
          const saldoA = (dailyStats[a.id]?.pointsFor || 0) - (dailyStats[a.id]?.pointsAgainst || 0);
          const saldoB = (dailyStats[b.id]?.pointsFor || 0) - (dailyStats[b.id]?.pointsAgainst || 0);
          return effB - effA || saldoB - saldoA;
        })[0] ||
      [...players]
        .filter(p => (dailyStats[p.id]?.matches || 0) > 0 && (dailyStats[p.id]?.duration || 0) > 0)
        .sort((a, b) => {
          const gainB = dailyStats[b.id]?.matchEloGain !== undefined ? dailyStats[b.id].matchEloGain : (dailyStats[b.id]?.eloGain || 0);
          const gainA = dailyStats[a.id]?.matchEloGain !== undefined ? dailyStats[a.id].matchEloGain : (dailyStats[a.id]?.eloGain || 0);
          const effA = gainA / dailyStats[a.id].duration;
          const effB = gainB / dailyStats[b.id].duration;
          const saldoA = (dailyStats[a.id]?.pointsFor || 0) - (dailyStats[a.id]?.pointsAgainst || 0);
          const saldoB = (dailyStats[b.id]?.pointsFor || 0) - (dailyStats[b.id]?.pointsAgainst || 0);
          return effB - effA || saldoB - saldoA;
        })[0];

    const mostEfficient = [...players]
      .filter(p => (p.matchesPlayed || 0) >= MIN_MATCHES && (totalDurations[p.id] || 0) > 0 && p.id !== topElo?.id && p.id !== mvp?.id)
      .sort((a, b) => {
        const effA = (a.elo - 1200) / totalDurations[a.id];
        const effB = (b.elo - 1200) / totalDurations[b.id];
        const saldoA = (a.pointsFor || 0) - (a.pointsAgainst || 0);
        const saldoB = (b.pointsFor || 0) - (b.pointsAgainst || 0);
        return effB - effA || saldoB - saldoA;
      })[0] ||
      [...players]
        .filter(p => (p.matchesPlayed || 0) > 0 && (totalDurations[p.id] || 0) > 0 && p.id !== topElo?.id && p.id !== mvp?.id)
        .sort((a, b) => {
          const effA = (a.elo - 1200) / totalDurations[a.id];
          const effB = (b.elo - 1200) / totalDurations[b.id];
          const saldoA = (a.pointsFor || 0) - (a.pointsAgainst || 0);
          const saldoB = (b.pointsFor || 0) - (b.pointsAgainst || 0);
          return effB - effA || saldoB - saldoA;
        })[0] ||
      [...players]
        .filter(p => (p.matchesPlayed || 0) > 0 && (totalDurations[p.id] || 0) > 0)
        .sort((a, b) => {
          const effA = (a.elo - 1200) / totalDurations[a.id];
          const effB = (b.elo - 1200) / totalDurations[b.id];
          const saldoA = (a.pointsFor || 0) - (a.pointsAgainst || 0);
          const saldoB = (b.pointsFor || 0) - (b.pointsAgainst || 0);
          return effB - effA || saldoB - saldoA;
        })[0];
    
    const mostEfficientTechnical = [...players]
      .filter(p => (p.matchesPlayed || 0) > 0)
      .sort((a, b) => calculateEffectiveElo(b) - calculateEffectiveElo(a))[0] || null;

    const dailyEfficientTechnical = [...players]
      .filter(p => (dailyStats[p.id]?.matches || 0) > 0)
      .sort((a, b) => calculateEffectiveElo(b) - calculateEffectiveElo(a))[0] || null;

    const averageMatchDuration = effectiveMatches.length > 0
      ? Math.round((effectiveMatches.reduce((acc, m) => acc + (m.duration || 0), 0) / effectiveMatches.length) / 60)
      : 0;

    // Classification Final do Dia (Session Leaderboard)
    const sessionLeaderboard = players
      .filter(p => dailyStats[p.id]?.matches > 0)
      .sort((a, b) => {
        const statsA = dailyStats[a.id];
        const statsB = dailyStats[b.id];
        
        // 1. Maior número de ELO (ganho de ELO de QUADRA no dia)
        const eloB = statsB?.matchEloGain || 0;
        const eloA = statsA?.matchEloGain || 0;
        if (eloB !== eloA) return eloB - eloA;
        
        // 2. Melhor eficiência (TrueSkill)
        const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.333);
        const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.333);
        if (Math.abs(effB - effA) > 0.0001) return effB - effA;
        
        // 3. Menor tempo em quadra (tempo no dia)
        const timeA = statsA?.duration || 0;
        const timeB = statsB?.duration || 0;
        return timeA - timeB;
      });
    
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
      careerSetterStats,
      dailySetterStats,
      dailyEfficient,
      mostEfficient,
      mostEfficientTechnical,
      dailyEfficientTechnical,
      totalDurations,
      getDailyMvpEfficiency,
      getCareerMvpEfficiency,
      avgMatchTime: averageMatchDuration,
      sessionLeaderboard,
      date: resolvedDate,
      summaryType: rankingPeriod, // 'session' or 'career'
      rankingChanges: (() => {
        // Determine ELOs at the end of the selected day and at the beginning
        const elosAfter = players.map(p => {
          let elo = p.elo || 1200;
          if (rankingPeriod === 'session' && resolvedDate !== today) {
            const entry = [...(p.eloHistory || [])].reverse().find(h => h.date === resolvedDate);
            if (entry) {
              elo = entry.elo;
            } else {
              // If no entry for this exact date, find the most recent one BEFORE this date
              const historyBefore = (p.eloHistory || [])
                .filter(h => h.date < resolvedDate)
                .sort((a, b) => b.date.localeCompare(a.date));
              elo = historyBefore.length > 0 ? historyBefore[0].elo : 1200;
            }
          }
          return { id: p.id, name: p.name, elo };
        });

        const elosBefore = elosAfter.map(e => ({
          id: e.id,
          name: e.name,
          elo: e.elo - (dailyStats[e.id]?.eloGain || 0)
        }));

        const rankingAfter = [...elosAfter].sort((a, b) => b.elo - a.elo);
        const rankingBefore = [...elosBefore].sort((a, b) => b.elo - a.elo);
        
        const changes: string[] = [];
        
        // 3. Compare for ALL players who played today
        players.forEach(player => {
          const stats = dailyStats[player.id];
          if (stats && stats.matches > 0) {
            const currentIndex = rankingAfter.findIndex(p => p.id === player.id);
            const prevIndex = rankingBefore.findIndex(p => p.id === player.id);
            
            const wins = stats.wins || 0;
            const losses = stats.matches - wins;
            const diff = Math.abs(prevIndex - currentIndex);
            
            let movement = '';
            if (currentIndex < prevIndex) {
              movement = `🔼 ${diff}`;
            } else if (currentIndex > prevIndex) {
              movement = `🔽 ${diff}`;
            } else {
              movement = `🟡 0`;
            }
            
            changes.push(`${player.name}: ${wins}V - ${losses}D ${movement}`);
          }
        });

        // Sort changes by current ranking position for cleaner output
        return changes.sort((a, b) => {
          const nameA = a.split(':')[0];
          const nameB = b.split(':')[0];
          const posA = rankingAfter.findIndex(p => p.name === nameA);
          const posB = rankingAfter.findIndex(p => p.name === nameB);
          return posA - posB;
        });
      })()
    };
  }, [players, effectiveMatches, selectedDailyDate, rankingPeriod, today, systemMetadata]);



  // Unified calculations for the 4 requested metrics (Adaptive to Ranking Period)
  const unifiedMetrics = useMemo(() => {
    const targetMatches = effectiveMatches;
    if (targetMatches.length === 0) return { avgMatchDur: '0', avgRest: '0', participation: '0', avgPlaying: '0' };

    // Grouping by date for accurate session calculations
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
    let sessionsCount = sessions.length;

    sessions.forEach(sessionMatches => {
      const sorted = [...sessionMatches].sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const DEFAULT_DUR_MS = 12 * 60 * 1000;
      const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
      const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
      const sessionMinutes = (endTime - startTime) / (1000 * 60);

      const playersInThisSession = players.filter(player => {
        return sessionMatches.some(m => (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id));
      });

      if (playersInThisSession.length > 0) {
        let sessionTotalRest = 0;
        let sessionTotalPlaying = 0;
        playersInThisSession.forEach(player => {
          const playerTimePlayed = sessionMatches.reduce((acc, m) => {
            const playedInThisMatch = (m.teamA || []).includes(player.id) || (m.teamB || []).includes(player.id);
            return acc + (playedInThisMatch ? (m.duration || 720) / 60 : 0);
          }, 0);
          sessionTotalRest += Math.max(0, sessionMinutes - playerTimePlayed);
          sessionTotalPlaying += playerTimePlayed;
        });
        totalRestSum += sessionTotalRest / playersInThisSession.length;
        totalPlayingSum += sessionTotalPlaying / playersInThisSession.length;
      }
      
      totalMatchDurationSum += sessionMatches.reduce((s, m) => s + (m.duration || 720), 0) / 60;
    });

    const avgPlaying = totalPlayingSum / (sessionsCount || 1);
    const avgSessionMatchDurSum = (totalMatchDurationSum / (sessionsCount || 1));

    return {
      avgMatchDur: Math.round(targetMatches.reduce((s, m) => s + (m.duration || 720), 0) / (targetMatches.length * 60)) + ' min',
      avgRest: Math.round(totalRestSum / (sessionsCount || 1)) + ' min',
      participation: (avgSessionMatchDurSum > 0 ? Math.round((avgPlaying / avgSessionMatchDurSum) * 100) : 0) + '%',
      avgPlaying: Math.round(avgPlaying) + ' min'
    };
  }, [effectiveMatches, players]);

  // Specific metrics for the selected individual player (Adaptive to Period)
  const playerIndividualMetrics = useMemo(() => {
    if (!selectedPlayer) return { avgRest: '0', participation: '0', avgPlaying: '0', totalPlaying: '0' };
    
    const targetMatches = effectiveMatches;
    const playerMatches = targetMatches.filter(m => (m.teamA?.includes(selectedPlayer.id) || m.teamB?.includes(selectedPlayer.id)));
    if (playerMatches.length === 0) return { avgRest: '0', participation: '0', avgPlaying: '0', totalPlaying: '0' };

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

    sessions.forEach(sessionMatches => {
      const pMatches = sessionMatches.filter(m => (m.teamA || []).includes(selectedPlayer.id) || (m.teamB || []).includes(selectedPlayer.id));
      if (pMatches.length === 0) return;
      
      const sorted = [...sessionMatches].sort((a,b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const DEFAULT_DUR_MS = 12 * 60 * 1000;
      const startTime = first.startTime || (first.timestamp - (first.duration ? first.duration * 1000 : DEFAULT_DUR_MS));
      const endTime = last.endTime || (last.startTime ? last.startTime + (last.duration ? last.duration * 1000 : DEFAULT_DUR_MS) : last.timestamp);
      const sessionMinutes = (endTime - startTime) / (1000 * 60);

      const playerTimePlayed = pMatches.reduce((acc, m) => acc + (m.duration || 720) / 60, 0);
      const sumMatchDurations = sessionMatches.reduce((s, m) => s + (m.duration || 720), 0) / 60;

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
  }, [selectedPlayer, effectiveMatches]);

  const rankingChangesStr = topStats.rankingChanges?.join(',');
  const leaderboardStr = topStats.sessionLeaderboard?.map(p => p.id).join(',');

  // Pre-generate summary audio when stats are ready
  useEffect(() => {
    const preGenerate = async () => {
      if (userRole === 'ADMIN' && topStats.dailyMatchesCount > 0) {
        try {
          const resolvedDate = rankingPeriod === 'session' ? selectedDailyDate : 'Geral';
          const audio = await generateDailySummaryAudio({
            mvp: topStats.dailyMvp?.name,
            bestSetter: topStats.dailyBestSetter?.name,
            dailyKing: topStats.dailyKing?.name,
            matchesCount: topStats.dailyMatchesCount,
            rankingChanges: topStats.rankingChanges,
            sessionLeaderboard: topStats.sessionLeaderboard,
            summaryType: rankingPeriod,
            date: resolvedDate,
            avgMatchTime: topStats.avgMatchTime
          });
          if (audio) setNarrationAudio(audio);
        } catch (e) {
          console.error("Pre-generation error:", e);
        }
      }
    };
    
    // Debounce to avoid multiple calls during data sync
    const timer = setTimeout(preGenerate, 3000);
    return () => clearTimeout(timer);
  }, [
    topStats.dailyMvp?.name, 
    topStats.dailyBestSetter?.name, 
    topStats.dailyKing?.name, 
    topStats.dailyMatchesCount, 
    rankingChangesStr,
    leaderboardStr,
    rankingPeriod,
    selectedDailyDate,
    userRole, 
    setNarrationAudio
  ]);

  // Global Top Synergies & Rivalries (Normalized with Laplace smoothing to balance setters)
  const globalRelationships = useMemo(() => {
    if (!players || players.length === 0) return { synergies: [], rivalries: [] };

    let synergyWins: Record<string, number> = {};
    let synergyMatches: Record<string, number> = {};
    let rivalryWins: Record<string, number> = {};
    let rivalryAgainst: Record<string, number> = {};

    const sourceMatches = rankingPeriod === 'session' ? effectiveMatches : matches;

    sourceMatches.forEach(m => {
      if (m.winner) {
        const winners = m.winner === 'A' ? m.teamA : m.teamB;
        const losers = m.winner === 'A' ? m.teamB : m.teamA;

        // Synergy
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

        // Rivalry
        if (winners && losers) {
          winners.forEach(w => {
            losers.forEach(l => {
              const pair = [w, l].sort().join('_');
              rivalryAgainst[pair] = (rivalryAgainst[pair] || 0) + 1;
              const matchKey = `${l}_${w}`; // l lost to w
              rivalryWins[matchKey] = (rivalryWins[matchKey] || 0) + 1;
            });
          });
        }
      }
    });

    const isSession = rankingPeriod === 'session';
    const minMatchesForSynergy = isSession ? 1 : 3;
    const minMatchesForRivalry = isSession ? 1 : 2;

    const synergies = Object.entries(synergyMatches)
      .map(([pair, matchesCount]) => {
        const [id1, id2] = pair.split('_');
        const p1 = players.find(p => p.id === id1);
        const p2 = players.find(p => p.id === id2);
        const wins = synergyWins[pair] || 0;
        const winRate = matchesCount > 0 ? Math.round((wins / matchesCount) * 100) : 0;
        
        // Bayesian/Laplace smoothing (wins + 1) / (matches + 2) to balance setters
        const score = (wins + 1) / (matchesCount + 2);

        return { p1, p2, wins, matches: matchesCount, winRate, score };
      })
      .filter((s): s is typeof s & { p1: any, p2: any } => !!s.p1 && !!s.p2 && s.matches >= minMatchesForSynergy)
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
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

        // Laplace smoothing (wins + 1) / (total + 2) to balance setters
        const score = (wins + 1) / (totalAcross + 2);

        return { winner, loser, wins, total: totalAcross, winRate, score };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && !!r.winner && !!r.loser && r.total >= minMatchesForRivalry)
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .slice(0, 5);

    return { synergies, rivalries };
  }, [players, rankingPeriod, effectiveMatches, matches]);

  const averageElo = useMemo(() => {
    if (!players || players.length === 0) return 0;
    const sum = players.reduce((acc, p) => acc + (p.elo || 0), 0);
    return Math.round(sum / players.length);
  }, [players]);

  const handleCopyTextSummary = () => {
    if (!topStats.dailyStats) return;

    const resolvedDate = topStats.date;
    const isAccumulated = (rankingPeriod as string) === 'geral' || (rankingPeriod as string) === 'global' || (rankingPeriod as string) === 'career' || topStats.date === 'Geral' || topStats.date === 'global';
    
    let text = '';
    
    // Header
    if (isAccumulated) {
      text += `🏆 *RESUMO DO RANKING ACUMULADO  - GUERREIROS VOLLEYBALL* 🏆\n`;
      text += `📅 Data: ${formatBrazilianDate(today)}\n\n`;
    } else {
      text += `🏆 *RESUMO DO RANKING DIARIO  - GUERREIROS VOLLEYBALL* 🏆\n`;
      text += `📅 Data: ${resolvedDate === 'global' ? formatBrazilianDate(today) : formatBrazilianDate(resolvedDate)}\n\n`;
    }

    const sessionMatches = (rankingPeriod === 'session' 
      ? (resolvedDate === 'global' ? matches : matches.filter(m => matchesDate(m, resolvedDate)))
      : matches).sort((a, b) => a.timestamp - b.timestamp);
    
    const matchesToUse = isAccumulated ? effectiveMatches : sessionMatches;
    const totalSecs = matchesToUse.reduce((acc, m) => acc + (m.duration || 0), 0);
    const totalMins = Math.floor(totalSecs / 60);
    const totalMatchesCount = matchesToUse.length;

    const formattedTotalTime = totalMins >= 60 
      ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` 
      : `${totalMins}m`;
    const avgTimeVal = totalMatchesCount > 0 
      ? Math.round(totalMins / totalMatchesCount)
      : 0;

    text += `  Total de partidas : ${totalMatchesCount}\n`;
    text += `  *Tempo Total:* ${formattedTotalTime} | *Média:* ${avgTimeVal} min\n\n`;

    // Highlights (Destaques)
    if (isAccumulated) {
      text += `🌟 *DESTAQUES ACUMULADOS:*\n\n\n`;
      text += `• *MVP:* ${topStats.mvp?.name || 'N/A'}\n`;
      text += `• *Melhor Levantador:* ${topStats.bestSetter?.name || 'N/A'}\n`;
      text += `• *Rei do ELO:* ${topStats.topElo?.name || 'N/A'}\n`;
      text += ` *Sócio Mais Eficiente:* ${topStats.mostEfficientTechnical?.name || 'N/A'}\n\n`;
    } else {
      text += `🌟 *DESTAQUES DO DIA:*\n\n\n`;
      text += `• *MVP:* ${topStats.dailyMvp?.name || 'N/A'}\n`;
      text += `• *Melhor Levantador:* ${topStats.dailyBestSetter?.name || 'N/A'}\n`;
      text += `• *Rei do Dia:* ${topStats.dailyKing?.name || 'N/A'}\n`;
      text += ` *Mais Eficiente do Dia:* ${topStats.dailyEfficientTechnical?.name || 'N/A'}\n\n`;
    }

    // Synergies (Melhores Parcerias)
    if (globalRelationships.synergies && globalRelationships.synergies.length > 0) {
      text += `• *Melhores Parcerias  (Sinergias):*\n`;
      globalRelationships.synergies.forEach((s, idx) => {
        text += `  ${idx + 1}. ${s.p1?.name} + ${s.p2?.name}: ${s.wins} ${s.wins === 1 ? 'Vitória' : 'Vitórias'} (${s.winRate}% de ${s.matches} ${s.matches === 1 ? 'jogo' : 'jogos'})\n`;
      });
    } else {
      text += `• *Melhores Parcerias  (Sinergias):*\n  Sem dados de parcerias\n`;
    }

    // Rivalries (Maiores Rivalidades)
    text += `•\n *Maiores Rivalidades  (Confronto Direto):*\n`;
    if (globalRelationships.rivalries && globalRelationships.rivalries.length > 0) {
      globalRelationships.rivalries.forEach((r, idx) => {
        text += `  ${idx + 1}. ${r.winner?.name} vs ${r.loser?.name}: ${r.wins} ${r.wins === 1 ? 'Vitória' : 'Vitórias'} do vencedor (${r.winRate}% de ${r.total} ${r.total === 1 ? 'confronto' : 'confrontos'})\n`;
      });
    } else {
      text += `  Sem histórico de rivalidades\n`;
    }
    text += `\n`;

    // Ranking Header
    text += `📊 *RANKING (Pontos ELO [Partidas | Bônus] | (V-D) | Quadra / Fora):*\n\n`;

    // Calculate career presence and court times dynamically for accumulated view
    const careerStatsList: Record<string, { duration: number, baseDuration: number }> = {};
    players.forEach(p => {
      careerStatsList[p.id] = { duration: 0, baseDuration: 0 };
    });

    const matchesByDate: Record<string, typeof matches> = {};
    matches.forEach(m => {
      const d = getMatchDate(m) || m.date;
      if (!matchesByDate[d]) {
        matchesByDate[d] = [];
      }
      matchesByDate[d].push(m);
    });

    Object.entries(matchesByDate).forEach(([dateVal, dateMatches]) => {
      players.forEach(p => {
        const playerMatches = dateMatches.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id));
        if (playerMatches.length === 0) return;
        
        const duration = playerMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
        
        const earliestMatchTime = Math.min(...playerMatches.map(m => m.timestamp - (m.duration || 0) * 1000));
        const latestMatchTime = Math.max(...playerMatches.map(m => m.timestamp));
        
        const pBaseDuration = dateMatches
          .filter(m => m.timestamp >= (earliestMatchTime - 300000) && m.timestamp <= (latestMatchTime + 60000))
          .reduce((acc, m) => acc + (m.duration || 0), 0);
          
        const finalBase = pBaseDuration < duration ? duration : pBaseDuration;
        
        careerStatsList[p.id].duration += duration;
        careerStatsList[p.id].baseDuration += finalBase;
      });
    });

    // Ranking Player List
    const activePlayers = players
      .filter(p => {
        const stats = topStats.dailyStats[p.id];
        const hasPlayed = isAccumulated ? (p.matchesPlayed > 0) : (stats && stats.matches > 0);
        return hasPlayed;
      })
      .sort((a, b) => {
        if (isAccumulated) {
          if ((b.elo || 1200) !== (a.elo || 1200)) return (b.elo || 1200) - (a.elo || 1200);
          const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.333);
          const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.333);
          if (Math.abs(effB - effA) > 0.0001) return effB - effA;
          const timeA = topStats.totalDurations[a.id] || 0;
          const timeB = topStats.totalDurations[b.id] || 0;
          return timeA - timeB;
        } else {
          const statsA = topStats.dailyStats[a.id];
          const statsB = topStats.dailyStats[b.id];
          const eloGainB = statsB?.matchEloGain || 0;
          const eloGainA = statsA?.matchEloGain || 0;
          if (eloGainB !== eloGainA) return eloGainB - eloGainA;
          const effA = (a.trueSkill?.mu || 25) - 3 * (a.trueSkill?.sigma || 8.333);
          const effB = (b.trueSkill?.mu || 25) - 3 * (b.trueSkill?.sigma || 8.333);
          if (Math.abs(effB - effA) > 0.0001) return effB - effA;
          const timeA = statsA?.duration || 0;
          const timeB = statsB?.duration || 0;
          return timeA - timeB;
        }
      });

    activePlayers.forEach((p, idx) => {
      let wins = 0;
      let playedMatches = 0;
      let pDuration = 0;
      let pBaseDuration = 0;
      let eloText = '';

      if (isAccumulated) {
        wins = p.wins || 0;
        playedMatches = p.matchesPlayed || 0;
        pDuration = careerStatsList[p.id]?.duration || 0;
        pBaseDuration = careerStatsList[p.id]?.baseDuration || 0;
        const totalElo = Math.round(p.elo || 1200);
        const fidelityPoints = p.fidelityPoints || 0;
        const matchElo = Math.round(totalElo - fidelityPoints);
        eloText = `${totalElo} pts [Partidas: ${matchElo} | Bônus: +${fidelityPoints}]`;
      } else {
        const stats = topStats.dailyStats[p.id];
        wins = stats?.wins || 0;
        playedMatches = stats?.matches || 0;
        pDuration = stats?.duration || 0;
        
        const attendanceRecord = attendance.find(a => a.id === p.id);
        let arrivalBound = attendanceRecord?.timestamp || 0;
        let departureBound = (attendanceRecord?.status === 'left') ? (attendanceRecord.leftAt || Date.now()) : (Date.now() + 86400000);
        
        const playerMatches = sessionMatches.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id));
        if (playerMatches.length > 0) {
          const earliestMatchTime = Math.min(...playerMatches.map(m => m.timestamp - (m.duration || 0) * 1000));
          const latestMatchTime = Math.max(...playerMatches.map(m => m.timestamp));
          
          if (!attendanceRecord) {
            arrivalBound = earliestMatchTime - 300000;
            departureBound = latestMatchTime + 60000;
          } else {
            if (arrivalBound === 0 || earliestMatchTime < arrivalBound) {
              arrivalBound = earliestMatchTime - 60000;
            }
            if (latestMatchTime > departureBound) {
              departureBound = latestMatchTime + 60000;
            }
          }
        }
        
        pBaseDuration = sessionMatches
          .filter(m => m.timestamp >= (arrivalBound - 60000) && m.timestamp <= (departureBound + 60000))
          .reduce((acc, m) => acc + (m.duration || 0), 0);
          
        if (pBaseDuration < pDuration) pBaseDuration = pDuration;

        const matchElo = stats?.matchEloGain !== undefined ? stats.matchEloGain : 0;
        const fidelityGain = stats?.fidelityGain !== undefined ? stats.fidelityGain : 0;
        const totalGain = matchElo + fidelityGain;
        eloText = `${totalGain > 0 ? '+' : ''}${totalGain} pts [Partidas: ${matchElo > 0 ? '+' : ''}${matchElo} | Bônus: +${fidelityGain}]`;
      }

      const losses = playedMatches - wins;
      const winRate = playedMatches > 0 ? Math.round((wins / playedMatches) * 100) : 0;

      const pMinutes = Math.floor(pDuration / 60);
      const fMinutes = Math.max(0, Math.floor((pBaseDuration - pDuration) / 60));
      const pPercent = pBaseDuration > 0 ? Math.round((pDuration / pBaseDuration) * 100) : 0;

      const rankNum = idx + 1;
      const formattedRank = rankNum < 10 ? `0${rankNum}` : `${rankNum}`;

      const mv = leaderboardMovements[p.id];
      let movementText = ' ⚪ ➖0';
      if (mv) {
        if (mv.type === 'up' && mv.diff > 0) {
          movementText = ` 🟢 ⬆️${mv.diff}`;
        } else if (mv.type === 'down' && mv.diff > 0) {
          movementText = ` 🔴 ⬇️${mv.diff}`;
        } else if (mv.type === 'neutral' || mv.diff === 0) {
          movementText = ` ⚪ ➖0`;
        }
      }

      text += `${formattedRank}. *${p.name}* - ${winRate}% (${eloText}) | (${wins}V - ${losses}D) | Quadra: ${pMinutes} min / Fora: ${fMinutes} min (${pPercent}%)${movementText}\n`;
    });

    text += `\n_Gerado por Guerreiros Intelligence_ 🏐`;

    navigator.clipboard.writeText(text);
    showNotification('Resumo em texto copiado para a área de transferência!', 'success');
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
          text: 'Confira os destaques do racha de hoje!'
        });
      } else {
        // Fallback to download using Object URL from the fetched blob
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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

  const globalStatsMatches = useMemo(() => {
    return effectiveMatches;
  }, [effectiveMatches]);

  const globalStatsPlayers = useMemo(() => {
    if (rankingPeriod === 'career') return players;
    
    // In session mode, we only want the players who participated in the effective matches
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
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Escaneando integridade do racha</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAuditModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-white/40" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                {isAuditing ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="relative w-20 h-20">
                      <div className="absolute inset-0 border-4 border-brand-primary/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Search className="w-8 h-8 text-brand-primary animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-black uppercase tracking-widest text-sm animate-pulse">Analisando Rankings e Partidas...</p>
                      <p className="text-white/40 text-[10px] mt-2 uppercase tracking-tight">O Agente está varrendo inconsistências no banco de dados</p>
                    </div>
                  </div>
                ) : auditReport ? (
                  <div className="space-y-6">
                    <div className="prose prose-invert max-w-none prose-p:text-white/80 prose-headings:text-white prose-strong:text-brand-primary prose-ul:text-white/60">
                      <div className="markdown-body">
                        <ReactMarkdown>{auditReport}</ReactMarkdown>
                      </div>
                    </div>

                    {userRole === 'ADMIN' && (
                      <div className="pt-6 border-t border-white/10">
                        <button
                          onClick={async () => {
                            await fixDatabaseAnomalies();
                            setShowAuditModal(false);
                          }}
                          className="w-full flex items-center justify-center gap-3 bg-brand-primary text-brand-secondary py-4 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-brand-primary/20"
                        >
                          <Zap className="w-5 h-5 fill-current" />
                          Aplicar Reparo Autônomo AGORA
                        </button>
                        <p className="text-center text-[10px] text-white/40 uppercase font-bold mt-3 tracking-widest">
                          Esta ação irá corrigir datas, ids e gaps no banco de dados automaticamente.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => setShowAuditModal(false)}
                  className="px-8 py-3 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
              {narrationAudio ? (
                <button 
                  onClick={() => playAudioContent(narrationAudio, 'ranking')}
                  disabled={activeIsNarrating}
                  className="flex-1 md:flex-none bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50 border border-brand-primary/40"
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
                  className={`flex-1 md:flex-none bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50 border border-brand-primary/40 ${!aiStatus.isAvailable ? 'grayscale opacity-70' : ''}`}
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
                  className="bg-black text-brand-primary p-4 rounded-2xl border border-brand-primary/40 flex items-center justify-center transition-all hover:bg-brand-primary/10 disabled:opacity-50"
                  title="Regerar Resumo"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
              
              {/* Botão de Compartilhamento de Áudio */}
              <button 
                onClick={handleShareAudio}
                disabled={!narrationAudio}
                className={`bg-black text-brand-primary p-4 rounded-2xl border border-brand-primary/40 flex items-center justify-center transition-all shadow-xl shadow-brand-primary/5 ${
                  !narrationAudio ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-brand-primary/10 active:scale-95'
                }`}
                title={narrationAudio ? "Compartilhar Áudio" : "Gere o resumo para compartilhar"}
              >
                <Share2 className="w-5 h-5" />
              </button>

              <button 
                onClick={handleCopyTextSummary}
                className="bg-white/10 text-white p-4 rounded-2xl hover:bg-white/20 border border-white/10 transition-all flex items-center justify-center group"
                title="Copiar resumo em texto"
              >
                <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>

              <button 
                onClick={handleAuditData}
                disabled={isAuditing}
                className={`p-4 rounded-2xl border border-brand-primary/40 transition-all flex items-center justify-center group ${
                  isAuditing ? 'bg-brand-primary/20 animate-pulse cursor-not-allowed' : 'bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-brand-secondary'
                }`}
                title="IA Auditor de Ranking"
              >
                <Zap className={`w-5 h-5 ${isAuditing ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className={`bg-white/5 p-1.5 rounded-2xl flex flex-wrap sm:flex-nowrap gap-1 border border-brand-primary/40`}>
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'daily' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Calendar className="w-4 h-4 hidden sm:block" />
          Destaques
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'individual' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Users className="w-4 h-4 hidden sm:block" />
          Individual
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'global' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <BarChart3 className="w-4 h-4 hidden sm:block" />
          Global
        </button>
        <button
          onClick={() => setActiveTab('synergy')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'synergy' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <BrainCircuit className="w-4 h-4 hidden sm:block" />
          Sinergia
        </button>
        <button
          onClick={() => setActiveTab('coach')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'coach' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : `text-white/40 hover:text-white`
          }`}
        >
          <Sparkles className="w-4 h-4 hidden sm:block" />
          IA Coach
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
          Dia
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
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Selecionar Dia</p>
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
                {formatBrazilianDate(date)}
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
        {activeTab === 'global' ? (
          <motion.div
            key="global"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <GlobalStats 
              players={globalStatsPlayers} 
              matches={globalStatsMatches} 
              attendance={attendance} 
              rankingPeriod={rankingPeriod} 
              selectedDailyDate={selectedDailyDate}
            />
          </motion.div>
        ) : activeTab === 'synergy' ? (
          <motion.div
            key="synergy"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <SynergyAnalysis players={allPlayers} matches={effectiveMatches} />
          </motion.div>
        ) : activeTab === 'coach' ? (
          <motion.div
            key="coach"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {selectedPlayer ? (
              <AICoach 
                player={selectedPlayer} 
                allPlayers={players} 
                recentMatches={matches} 
              />
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
                    {rankingPeriod === 'session' ? 'Destaques do Dia' : 'Destaques Acumulados'}
                  </h3>
                </div>
                {userRole === 'ADMIN' && rankingPeriod === 'session' && selectedDailyDate === today && (
                  <button 
                    onClick={resetDailyMatches}
                    className="p-2 bg-white/5 hover:bg-brand-primary/10 hover:text-brand-primary rounded-xl text-brand-accent transition-all"
                    title="Finalizar Dia"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
                {(rankingPeriod === 'session' ? topStats.dailyMatchesCount > 0 : players.length > 0) ? (
                  <>
                    {/* MVP */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Trophy className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'MVP do Dia' : 'MVP Histórico'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session' 
                          ? (topStats.dailyMvp ? (topStats.dailyMvp.name || "Sócio sem nome") : "Nenhum")
                          : (topStats.mvp ? (topStats.mvp.name || "Sócio sem nome") : "Nenhum")}
                      </h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {rankingPeriod === 'session'
                            ? (topStats.dailyMvp ? `${Math.round((topStats.dailyStats[topStats.dailyMvp.id]?.wins / (topStats.dailyStats[topStats.dailyMvp.id]?.matches || 1)) * 100)}% Vitórias` : "Sem partidas")
                            : (topStats.mvp ? `${Math.round((topStats.mvp.wins / (topStats.mvp.matchesPlayed || 1)) * 100)}% Vitórias` : "Sem partidas")}
                        </span>
                        {((rankingPeriod === 'session' && topStats.dailyMvp) || (rankingPeriod !== 'session' && topStats.mvp)) && (
                          <span className={`bg-brand-primary/10 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                            {rankingPeriod === 'session'
                              ? `Score B-1: ${topStats.getDailyMvpEfficiency(topStats.dailyMvp).toFixed(1)}`
                              : `Score B-1: ${topStats.getCareerMvpEfficiency(topStats.mvp).toFixed(1)}`}
                          </span>
                        )}
                      </div>
                    </motion.div>

                    {/* Levantador */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Target className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'Levantador do Dia' : 'Melhor Levantador'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session'
                          ? (topStats.dailyBestSetter ? (topStats.dailyBestSetter.name || "Sócio sem nome") : "Nenhum")
                          : (topStats.bestSetter ? (topStats.bestSetter.name || "Sócio sem nome") : "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {rankingPeriod === 'session'
                            ? (topStats.dailyBestSetter && topStats.dailySetterStats?.[topStats.dailyBestSetter.id]?.matches
                                ? `${topStats.dailySetterStats[topStats.dailyBestSetter.id].wins}V (${topStats.dailySetterStats[topStats.dailyBestSetter.id].matches}J) • ${Math.round((topStats.dailySetterStats[topStats.dailyBestSetter.id].wins / topStats.dailySetterStats[topStats.dailyBestSetter.id].matches) * 100)}%`
                                : "Sem partidas")
                            : (topStats.bestSetter && topStats.careerSetterStats?.[topStats.bestSetter.id]?.matches
                                ? `${topStats.careerSetterStats[topStats.bestSetter.id].wins}V (${topStats.careerSetterStats[topStats.bestSetter.id].matches}J) • ${Math.round((topStats.careerSetterStats[topStats.bestSetter.id].wins / topStats.careerSetterStats[topStats.bestSetter.id].matches) * 100)}%`
                                : "Sem partidas")}
                        </span>
                      </div>
                    </motion.div>

                    {/* Rei */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Zap className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
                        {rankingPeriod === 'session' ? 'Rei do Dia' : 'Rei do ELO'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session'
                          ? (topStats.dailyKing ? (topStats.dailyKing.name || "Sócio sem nome") : "Nenhum")
                          : (topStats.topElo?.name || "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {rankingPeriod === 'session'
                            ? (topStats.dailyKing ? `${topStats.dailyStats[topStats.dailyKing.id]?.matchEloGain >= 0 ? '+' : ''}${topStats.dailyStats[topStats.dailyKing.id]?.matchEloGain || 0} ELO Quadra` : "Sem partidas")
                            : (topStats.topElo ? `${Math.round(topStats.topElo.elo)} Pontos` : "0 Pontos")}
                        </span>
                      </div>
                    </motion.div>

                    {/* Mais Eficiente Técnico */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Sparkles className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Mais Eficiente Dia' : 'Mais Eficiente Geral'}
                      </p>
                      <h4 className="text-base font-black text-white truncate">
                        {rankingPeriod === 'session'
                          ? (topStats.dailyEfficientTechnical ? (topStats.dailyEfficientTechnical.name || "Sócio sem nome") : "Nenhum")
                          : (topStats.mostEfficientTechnical ? (topStats.mostEfficientTechnical.name || "Sócio sem nome") : "Nenhum")}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {rankingPeriod === 'session'
                            ? (topStats.dailyEfficientTechnical ? `${((topStats.dailyEfficientTechnical.trueSkill?.mu || 25) - 3 * (topStats.dailyEfficientTechnical.trueSkill?.sigma || 8.333)).toFixed(1)} Eficiência` : "Sem partidas")
                            : (topStats.mostEfficientTechnical ? `${((topStats.mostEfficientTechnical.trueSkill?.mu || 25) - 3 * (topStats.mostEfficientTechnical.trueSkill?.sigma || 8.333)).toFixed(1)} Eficiência` : "Sem partidas")}
                        </span>
                      </div>
                    </motion.div>

                    {/* Melhor Sinergia */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Users className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Sinergia do Dia' : 'Melhor Sinergia'}
                      </p>
                      <h4 className="text-base font-black text-white truncate leading-tight">
                        {globalRelationships.synergies && globalRelationships.synergies.length > 0 ? (
                          <span className="truncate block">
                            {globalRelationships.synergies[0].p1?.name.split(' ')[0]} + {globalRelationships.synergies[0].p2?.name.split(' ')[0]}
                          </span>
                        ) : (
                          "Dupla Ideal"
                        )}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {globalRelationships.synergies && globalRelationships.synergies.length > 0
                            ? `${globalRelationships.synergies[0].wins} Vitórias (${globalRelationships.synergies[0].winRate}%)`
                            : "Sem dados de parceria"}
                        </span>
                      </div>
                    </motion.div>

                    {/* Maior Rivalidade */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 }}
                      className={`bg-black backdrop-blur-xl border-white/5 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden group border`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="absolute top-0 right-0 p-4 opacity-25 group-hover:scale-110 transition-transform">
                        <Swords className="w-10 h-10 text-yellow-400" />
                      </div>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">
                        {rankingPeriod === 'session' ? 'Rivalidade do Dia' : 'Maior Rivalidade'}
                      </p>
                      <h4 className="text-base font-black text-white truncate leading-tight">
                        {globalRelationships.rivalries && globalRelationships.rivalries.length > 0 ? (
                          <span className="truncate block">
                            {globalRelationships.rivalries[0].winner?.name.split(' ')[0]} vs {globalRelationships.rivalries[0].loser?.name.split(' ')[0]}
                          </span>
                        ) : (
                          "Confronto Direto"
                        )}
                      </h4>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`bg-white/5 text-brand-primary border-brand-primary/40 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border`}>
                          {globalRelationships.rivalries && globalRelationships.rivalries.length > 0
                            ? `${globalRelationships.rivalries[0].wins} Vitórias (${globalRelationships.rivalries[0].winRate}%)`
                            : "Sem histórico"}
                        </span>
                      </div>
                    </motion.div>
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

              {/* New Metrics Row for Highlights */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                  { label: 'Tempo Médio das Partidas', val: unifiedMetrics.avgMatchDur, icon: Clock },
                  { label: 'Tempo Médio Fora da Quadra', val: unifiedMetrics.avgRest, icon: Timer },
                  { label: 'Aproveitamento', val: unifiedMetrics.participation, icon: Timer },
                  { label: 'Tempo Médio em Quadra', val: unifiedMetrics.avgPlaying, icon: Activity },
                ].map((stat, i) => (
                  <div key={i} className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                      <stat.icon className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <h3 className="text-2xl font-black text-white tracking-widest leading-none drop-shadow-md">
                      {stat.val}
                    </h3>
                  </div>
                ))}
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
              Melhores Duplas {rankingPeriod === 'session' ? 'do Dia' : '(Sinergia Geral)'}
            </h4>
          </div>
          <div className="space-y-4">
            {globalRelationships.synergies.length > 0 ? globalRelationships.synergies.map((s, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border bg-white/5 border-brand-primary/40`}>
                <div className="flex items-center gap-3 animate-fade-in">
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
                <div className="text-right">
                  <p className="text-xs font-black text-brand-primary drop-shadow-sm">{s.wins} {s.wins === 1 ? 'Vitória' : 'Vitórias'} ({s.winRate}%)</p>
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{s.matches} {s.matches === 1 ? 'jogo' : 'jogos'}</p>
                </div>
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
                <div className="flex items-center gap-3 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black text-white`}>{r.winner?.name}</span>
                    <span className="text-[10px] font-black text-white/40">vs</span>
                    <span className={`text-xs font-black text-white`}>{r.loser?.name}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-brand-primary drop-shadow-sm">{r.wins} {r.wins === 1 ? 'Vitória' : 'Vitórias'} ({r.winRate}%)</p>
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">de {r.total} confrontos</p>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-white/5 border border-brand-primary/20`}>
              <Filter className="w-5 h-5 text-brand-primary" />
            </div>
            <h3 className={`text-xl font-black uppercase tracking-tight text-white`}>
              {rankingPeriod === 'session' 
                ? `Ranking de ${formatBrazilianDate(selectedDailyDate)}`
                : 'Ranking Geral Acumulado'}
              <HelpTooltip 
                title={rankingPeriod === 'session' ? "Ranking do Dia" : "Ranking Geral"} 
                content={rankingPeriod === 'session' 
                  ? "Este ranking mostra o desempenho do dia, ordenado por pontos ELO ganhos, com desempate por eficiência técnica e menor tempo em quadra." 
                  : "Este ranking mostra o desempenho acumulado, ordenado por pontos ELO totais, com desempate por eficiência técnica e menor tempo em quadra."}
              />
            </h3>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
            <input 
              type="text" 
              placeholder="Buscar por texto..."
              value={rankingSearchQuery}
              onChange={(e) => setRankingSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-[10px] font-bold transition-all outline-none bg-white/5 border-brand-primary/40 text-white placeholder:text-white/20 focus:ring-2 focus:ring-brand-primary border`}
            />
          </div>
        </div>

        {/* PAINEL DE FILTROS INTELIGENTES COCKPIT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-brand-secondary/40 p-5 rounded-[2rem] border border-brand-primary/20">
          {/* Coluna 1: Filtro de Sócio */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">Filtrar Sócio</label>
            <div className="relative">
              <select
                value={filterSocioId}
                onChange={(e) => setFilterSocioId(e.target.value)}
                className="w-full bg-black text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-3 rounded-xl border border-white/10 outline-none focus:border-brand-primary transition-all appearance-none cursor-pointer"
              >
                <option value="all" className="bg-brand-secondary text-white font-bold">Todos os Guerreiros</option>
                {[...players]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(p => (
                    <option key={p.id} value={p.id} className="bg-brand-secondary text-white font-bold">
                      {p.name.toUpperCase()} {p.isOfficialSetter ? '• LEVANTADOR' : ''}
                    </option>
                  ))
                }
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/30 text-[8px] font-black">▼</div>
            </div>
          </div>

          {/* Coluna 2: Filtro de Período de Datas */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">
              Período de Datas
            </label>
            {rankingPeriod === 'career' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[7px] text-white/40 uppercase tracking-widest block mb-0.5">De</span>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-black text-white text-[10px] font-mono px-2 py-2 rounded-xl border border-white/10 outline-none focus:border-brand-primary transition-all cursor-pointer"
                  />
                </div>
                <div>
                  <span className="text-[7px] text-white/40 uppercase tracking-widest block mb-0.5">Até</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-black text-white text-[10px] font-mono px-2 py-2 rounded-xl border border-white/10 outline-none focus:border-brand-primary transition-all cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-wide bg-black/40 p-3 rounded-xl border border-white/5 flex items-center h-10">
                Filtro de Dia ativo no cabeçalho.
              </div>
            )}
          </div>

          {/* Coluna 3: Critério de Ordenação do Ranking */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="text-[8px] font-black uppercase tracking-widest text-brand-primary block">Métrica de Classificação</label>
            <div className="bg-black/40 p-1 rounded-xl flex gap-1 border border-white/10 h-10 items-center">
              <button
                type="button"
                onClick={() => setRankingSortMetric('elo')}
                className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all whitespace-nowrap ${
                  rankingSortMetric === 'elo' 
                    ? 'bg-brand-primary text-black' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                ELO
              </button>
              <button
                type="button"
                onClick={() => setRankingSortMetric('efficiency_mvp')}
                className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all whitespace-nowrap ${
                  rankingSortMetric === 'efficiency_mvp' 
                    ? 'bg-brand-primary text-black' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                MVP (B-1)
              </button>
              <button
                type="button"
                onClick={() => setRankingSortMetric('efficiency')}
                className={`flex-grow px-3 h-8 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all whitespace-nowrap ${
                  rankingSortMetric === 'efficiency' 
                    ? 'bg-brand-primary text-black' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                % VITÓRIAS
              </button>
            </div>
          </div>
        </div>

        {/* RELATÓRIO DO SÓCIO - DETALHADO */}
        {filterSocioId !== 'all' && (() => {
          const socio = players.find(p => p.id === filterSocioId);
          if (!socio) return null;

          const stats = topStats.dailyStats[socio.id] || { matches: 0, wins: 0, duration: 0, eloGain: 0, pointsFor: 0, pointsAgainst: 0 };
          
          const targetMatches = effectiveMatches.filter(m => m.teamA.includes(socio.id) || m.teamB.includes(socio.id));
          const winsCount = targetMatches.filter(m => 
            (m.winner === 'A' && m.teamA.includes(socio.id)) || 
            (m.winner === 'B' && m.teamB.includes(socio.id))
          ).length;
          
          const matchesCount = targetMatches.length;
          const lossesCount = matchesCount - winsCount;
          const winRate = matchesCount > 0 ? Math.round((winsCount / matchesCount) * 100) : 0;
          
          const uniqueDates = new Set(targetMatches.map(m => getMatchDate(m) || m.date)).size;
          const loyaltyReward = socio.fidelityPoints !== undefined ? socio.fidelityPoints : uniqueDates * 50;

          return (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-black border border-brand-primary/30 p-6 rounded-[2.5rem] relative overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-primary text-black rounded-2xl flex items-center justify-center font-black text-lg">
                    {socio.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-brand-primary">Ficha de Desempenho do Sócio</span>
                    <h4 className="text-base font-black text-white uppercase tracking-tight">{socio.name}</h4>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase bg-brand-primary text-black px-2 py-1 rounded-md">
                    {uniqueDates} DIAS PARTICIPADOS
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-brand-secondary/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Partidas do Período</p>
                  <p className="text-xl font-black text-white font-mono mt-1">{matchesCount} J</p>
                  <span className="text-[7px] text-white/30 uppercase tracking-wider block mt-0.5">{winsCount}V - {lossesCount}D</span>
                </div>

                <div className="bg-brand-secondary/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Aproveitamento</p>
                  <p className="text-xl font-black text-brand-primary font-mono mt-1">{winRate}%</p>
                  <span className="text-[7px] text-white/30 uppercase tracking-wider block mt-0.5">Taxa de Vitória</span>
                </div>

                <div className="bg-brand-secondary/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[7px] font-black text-white/40 uppercase tracking-widest font-bold">Eficiência Técnica</p>
                  <p className="text-xl font-black text-white font-mono mt-1">
                    {((socio.trueSkill?.mu || 25) - 3 * (socio.trueSkill?.sigma || 8.333)).toFixed(1)}
                  </p>
                  <span className="text-[7px] text-brand-primary/60 uppercase tracking-wider block mt-0.5 font-bold font-black">Consistência</span>
                </div>

                <div className="bg-brand-secondary/40 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">ELO Global</p>
                    <p className="text-xl font-black text-brand-primary font-mono mt-1">{Math.round(socio.elo)}</p>
                  </div>
                  <div className="flex flex-col items-start gap-0.5 mt-2 text-[8px] font-semibold text-white/50 leading-tight border-t border-white/5 pt-1.5">
                    <span className="whitespace-nowrap font-mono">
                      Partidas: <strong className="text-white/80">{Math.round(socio.elo - (socio.fidelityPoints || 0))}</strong>
                    </span>
                    <span className="whitespace-nowrap font-mono">
                      Bônus: <strong className="text-amber-500">+{socio.fidelityPoints || 0}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}

        <div className={`bg-brand-light backdrop-blur-xl border-white/5 border-l-[8px] border-l-brand-primary rounded-[2.5rem] shadow-2xl overflow-hidden border`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`bg-white/5 border-b border-brand-primary/40`}>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Partidas</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>V</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>D</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      <span>Saldo</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span>%</span>
                    </div>
                  </th>
                  {rankingPeriod === 'session' && (
                    <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center whitespace-nowrap">Tempo (Q/F/%)</th>
                  )}
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Star className="w-3.5 h-3.5" />
                      <span>{rankingSortMetric === 'efficiency_mvp' ? 'Score B-1' : 'Eficiência'}</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">ELO</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-white/5`}>
                <AnimatePresence>
                {(() => {
                  const sessionMatches = (rankingPeriod === 'session' 
                    ? (selectedDailyDate === 'global' ? matches : matches.filter(m => matchesDate(m, selectedDailyDate)))
                    : effectiveMatches).sort((a, b) => a.timestamp - b.timestamp);
                  
                  const totalSessionSeconds = sessionMatches.reduce((acc, m) => acc + (m.duration || 0), 0);

                  return [...players]
                    .filter(p => {
                      const stats = topStats.dailyStats[p.id];
                      const hasPlayed = rankingPeriod === 'session' ? (stats && stats.matches > 0) : (p.matchesPlayed > 0);
                      const matchesSearch = p.name.toLowerCase().includes(rankingSearchQuery.toLowerCase());
                      const matchesSocio = filterSocioId === 'all' || p.id === filterSocioId;
                      return hasPlayed && matchesSearch && matchesSocio;
                    })
                    .sort((a, b) => {
                      const statsA = topStats.dailyStats[a.id];
                      const statsB = topStats.dailyStats[b.id];
                      // 1. Sort by specified metric
                      if (rankingSortMetric === 'fidelity') {
                        const datesA = new Set(effectiveMatches.filter(m => m.teamA.includes(a.id) || m.teamB.includes(a.id)).map(m => getMatchDate(m) || m.date)).size;
                        const datesB = new Set(effectiveMatches.filter(m => m.teamA.includes(b.id) || m.teamB.includes(b.id)).map(m => getMatchDate(m) || m.date)).size;
                        const ptA = a.fidelityPoints !== undefined ? a.fidelityPoints : datesA * 50;
                        const ptB = b.fidelityPoints !== undefined ? b.fidelityPoints : datesB * 50;
                        if (ptB !== ptA) return ptB - ptA;
                      }

                      if (rankingSortMetric === 'efficiency') {
                        const matchesA = rankingPeriod === 'session' ? (statsA?.matches || 0) : (a.matchesPlayed || 0);
                        const matchesB = rankingPeriod === 'session' ? (statsB?.matches || 0) : (b.matchesPlayed || 0);
                        const winsA = rankingPeriod === 'session' ? (statsA?.wins || 0) : (a.wins || 0);
                        const winsB = rankingPeriod === 'session' ? (statsB?.wins || 0) : (b.wins || 0);
                        
                        const winRateA = matchesA > 0 ? (winsA / matchesA) : 0;
                        const winRateB = matchesB > 0 ? (winsB / matchesB) : 0;
                        
                        if (Math.abs(winRateB - winRateA) > 0.0001) {
                          return winRateB - winRateA;
                        }
                        
                        // Tie-breaker 1: More wins
                        if (winsB !== winsA) return winsB - winsA;
                        
                        // Tie-breaker 2: Point difference (Saldo)
                        const saldoA = rankingPeriod === 'session' 
                          ? ((statsA?.pointsFor || 0) - (statsA?.pointsAgainst || 0)) 
                          : ((a.pointsFor || 0) - (a.pointsAgainst || 0));
                        const saldoB = rankingPeriod === 'session' 
                          ? ((statsB?.pointsFor || 0) - (statsB?.pointsAgainst || 0)) 
                          : ((b.pointsFor || 0) - (b.pointsAgainst || 0));
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

                      // Default or fallback sort by ELO
                      const eloB = rankingPeriod === 'session' ? (statsB?.eloGain || 0) : (b.elo || 0);
                      const eloA = rankingPeriod === 'session' ? (statsA?.eloGain || 0) : (a.elo || 0);

                      if (eloB !== eloA) return eloB - eloA;

                      // Secondary fallback: session/total court time (Critério de Desempate Soberano)
                      const timeA = rankingPeriod === 'session' ? (statsA?.duration || 0) : (topStats.totalDurations[a.id] || 0);
                      const timeB = rankingPeriod === 'session' ? (statsB?.duration || 0) : (topStats.totalDurations[b.id] || 0);
                      return timeA - timeB;
                    })
                    .map((player, idx) => {
                      const stats = topStats.dailyStats[player.id];
                      const matchesPlayed = rankingPeriod === 'session' ? stats.matches : player.matchesPlayed;
                      const wins = rankingPeriod === 'session' ? stats.wins : player.wins;
                      const eloValue = rankingPeriod === 'session' ? stats?.matchEloGain : Math.round(player.elo);
                      const winRate = Math.round((wins / (matchesPlayed || 1)) * 100);
                      
                      const wilsonScore = calculateWilsonScore(wins, matchesPlayed);
                      const certaintyFloor = calculateCertaintyFloor(player.trueSkill?.mu, player.trueSkill?.sigma);

                      return (
                        <motion.tr 
                          key={player.id} 
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.3 }}
                          className={`transition-colors group hover:bg-white/5`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-center justify-center w-8 min-w-[32px] font-mono">
                                <span className="text-[12px] font-black text-white/40 font-mono">
                                  {(idx + 1).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-colors bg-white/5 text-white group-hover:bg-brand-primary/20 group-hover:text-brand-primary`}>
                                {player.name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className={`text-xs font-bold tracking-tight text-white`}>{capitalizeName(player.name)}</p>
                                  <div className="flex items-center gap-1">
                                    <EvasionIcon 
                                      level={calculateEvasionLevel(player, winRate)} 
                                    />
                                    {(() => {
                                      const mv = leaderboardMovements[player.id];
                                      if (!mv) return null;
                                      
                                      if (mv.type === 'up' && mv.diff > 0) {
                                        return (
                                          <div className="flex items-center gap-0.5 animate-bounce-subtle" title={`Subiu ${mv.diff} posição(ões)`}>
                                            <TrendingUp className="w-3 h-3 text-emerald-500" />
                                            <span className="text-[10px] font-black text-emerald-500">{mv.diff}</span>
                                          </div>
                                        );
                                      }
                                      if (mv.type === 'down' && mv.diff > 0) {
                                        return (
                                          <div className="flex items-center gap-0.5" title={`Caiu ${mv.diff} posição(ões)`}>
                                            <TrendingDown className="w-3 h-3 text-rose-500" />
                                            <span className="text-[10px] font-black text-rose-500">{mv.diff}</span>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="flex items-center gap-0.5" title="Mantém posição">
                                          <Minus className="w-3 h-3 text-white/40" />
                                          <span className="text-[10px] font-black text-white/40">0</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
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
                          <td className={`px-6 py-4 text-center text-xs font-bold text-white/80 font-mono`}>{matchesPlayed}</td>
                          <td className="px-6 py-4 text-center text-xs font-bold text-brand-primary font-mono">{wins}</td>
                          <td className="px-6 py-4 text-center text-xs font-bold text-white/40 font-mono">{matchesPlayed - wins}</td>
                          <td className={`px-6 py-4 text-center text-xs font-black font-mono ${
                            (rankingPeriod === 'session' ? (stats?.pointsFor || 0) - (stats?.pointsAgainst || 0) : (player.pointsFor || 0) - (player.pointsAgainst || 0)) > 0 ? 'text-emerald-500' : 
                            (rankingPeriod === 'session' ? (stats?.pointsFor || 0) - (stats?.pointsAgainst || 0) : (player.pointsFor || 0) - (player.pointsAgainst || 0)) < 0 ? 'text-rose-500' : 'text-white/40'
                          }`}>
                            {(rankingPeriod === 'session' ? (stats?.pointsFor || 0) - (stats?.pointsAgainst || 0) : (player.pointsFor || 0) - (player.pointsAgainst || 0)) > 0 ? '+' : ''}
                            {rankingPeriod === 'session' ? (stats?.pointsFor || 0) - (stats?.pointsAgainst || 0) : (player.pointsFor || 0) - (player.pointsAgainst || 0)}
                          </td>
                          <td className="px-6 py-4 text-center font-mono">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-lg font-mono ${winRate >= 50 ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/10 text-white/40'}`}>
                              <CalendarCheck className="w-3 h-3" />
                              {winRate}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center">
                              {(() => {
                                if (rankingSortMetric === 'efficiency_mvp') {
                                  const mvpScore = rankingPeriod === 'session'
                                    ? (topStats.getDailyMvpEfficiency ? topStats.getDailyMvpEfficiency(player) : 0)
                                    : (topStats.getCareerMvpEfficiency ? topStats.getCareerMvpEfficiency(player) : 0);
                                  return (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[11px] font-black text-brand-primary font-mono">
                                          {mvpScore.toFixed(1)}
                                        </span>
                                      </div>
                                      <span className="text-[7px] font-black text-white/40 uppercase tracking-tighter">
                                        SCORE B-1
                                      </span>
                                    </>
                                  );
                                }

                                const minMatches = rankingPeriod === 'session' ? 3 : 5;
                                const isQualified = matchesPlayed >= minMatches;
                                const K = rankingPeriod === 'session' ? 2 : 10;
                                const weight = matchesPlayed / (matchesPlayed + K);
                                
                                const effValueRaw = rankingPeriod === 'session' 
                                  ? ((stats?.matchEloGain !== undefined ? stats.matchEloGain : (stats?.eloGain || 0)) / ((stats?.duration || 1) / 60))
                                  : ((player.elo - 1200) / ((topStats.totalDurations[player.id] || 1) / 60));
                                
                                const weightedEff = effValueRaw * weight;
                                
                                if (isQualified) {
                                  return (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className={`text-[10px] font-black ${effValueRaw >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                          {effValueRaw.toFixed(2)}
                                        </span>
                                        {efficiencyRankings[player.id] && (
                                          <span className="text-[9px] font-black text-white/60">
                                            #{efficiencyRankings[player.id]}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <span className="text-[8px] font-bold text-white/20 uppercase whitespace-nowrap">
                                          ELO / Min
                                        </span>
                                        <span className={`text-[7px] font-black uppercase tracking-tighter ${getEfficiencyTier(weightedEff).color}`}>
                                          {getEfficiencyTier(weightedEff).label}
                                        </span>
                                      </div>
                                    </>
                                  );
                                } else {
                                  return (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className={`text-[10px] font-black ${winRate >= 50 ? 'text-brand-primary' : 'text-white/40'}`}>
                                          {winRate}%
                                        </span>
                                        {efficiencyRankings[player.id] && (
                                          <span className="text-[9px] font-black text-white/60">
                                            #{efficiencyRankings[player.id]}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[8px] font-bold text-white/20 uppercase whitespace-nowrap">
                                        Vitórias
                                      </span>
                                    </>
                                  );
                                }
                              })()}
                            </div>
                          </td>
                          {rankingPeriod === 'session' && (
                            <td className="px-6 py-4 text-center">
                              {(() => {
                                const pDuration = stats?.duration || 0;
                                const attendanceRecord = attendance.find(a => a.id === player.id);
                                
                                const playerMatches = sessionMatches.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
                                let arrivalBound = attendanceRecord?.timestamp || 0;
                                let departureBound = (attendanceRecord?.status === 'left') 
                                  ? (attendanceRecord.leftAt || Date.now()) 
                                  : (Date.now() + 86400000);
                                
                                if (playerMatches.length > 0) {
                                  const earliestMatchTime = Math.min(...playerMatches.map(m => m.timestamp - (m.duration || 0) * 1000));
                                  const latestMatchTime = Math.max(...playerMatches.map(m => m.timestamp));
                                  
                                  if (!attendanceRecord) {
                                    arrivalBound = earliestMatchTime - 300000; // 5 min margin
                                    departureBound = latestMatchTime + 60000; // 1 min margin
                                  } else {
                                    // Adjust bounds if check-in is missing or later than the first match they played
                                    if (arrivalBound === 0 || earliestMatchTime < arrivalBound) {
                                      arrivalBound = earliestMatchTime - 60000; // 1 min buffer before match start
                                    }
                                    // If they played a match that ended after departureBound
                                    if (latestMatchTime > departureBound) {
                                      departureBound = latestMatchTime + 60000; // 1 min buffer after match end
                                    }
                                  }
                                }
                                
                                const pBaseDuration = sessionMatches
                                  .filter(m => m.timestamp >= (arrivalBound - 60000) && m.timestamp <= (departureBound + 60000))
                                  .reduce((acc, m) => acc + (m.duration || 0), 0);
                                
                                const pMinutes = Math.floor(pDuration / 60);
                                const fMinutes = Math.max(0, Math.floor((pBaseDuration - pDuration) / 60));
                                const pPercent = Math.round((pDuration / (pBaseDuration || 1)) * 100);
                                const ratio = fMinutes > 0 ? (pMinutes / fMinutes).toFixed(1) : (pMinutes > 0 ? "∞" : "0.0");
                                return (
                                  <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-black text-white">Q:{pMinutes}m</span>
                                      <span className="text-[8px] text-white/20">/</span>
                                      <span className="text-[10px] font-black text-white/40">F:{fMinutes}m</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-black text-brand-primary">{pPercent}%</span>
                                      <span className="text-[8px] text-white/20">•</span>
                                      <span className="text-[9px] font-black text-white/60">R:{ratio}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                          )}

                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-brand-primary">
                                  {((player.trueSkill?.mu || 25) - 3 * (player.trueSkill?.sigma || 8.333)).toFixed(1)}
                                </span>
                                {efficiencyRankings[player.id] && (
                                  <span className="text-[9px] font-black text-white">
                                    #{efficiencyRankings[player.id]}
                                  </span>
                                )}
                              </div>
                              <span className="text-[8px] font-bold text-white/20 uppercase">
                                Eficiência
                              </span>
                            </div>
                          </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            {rankingPeriod === 'session' ? (
                              <>
                                <span className={`text-xs font-black ${(stats?.eloGain || 0) >= 0 ? 'text-brand-primary' : 'text-white/40'}`}>
                                  {(stats?.eloGain || 0) >= 0 ? '+' : ''}{stats?.eloGain || 0}
                                </span>
                                <span className="text-[8px] font-bold text-white/40 uppercase">
                                  ELO Dia
                                </span>
                                <div className="flex flex-col items-end gap-0.5 mt-1 text-[8px] font-semibold text-white/50 leading-tight">
                                  <span className="whitespace-nowrap font-mono">
                                    Partidas: <strong className="text-white/80">{(stats?.matchEloGain || 0) >= 0 ? '+' : ''}{stats?.matchEloGain || 0}</strong>
                                  </span>
                                  <span className="whitespace-nowrap font-mono">
                                    Bônus: <strong className="text-amber-500">+{stats?.fidelityGain || 0}</strong>
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="text-xs font-black text-brand-primary">
                                  {Math.round(player.elo)}
                                </span>
                                <span className="text-[8px] font-bold text-white/40 uppercase">
                                  ELO Global
                                </span>
                                <div className="flex flex-col items-end gap-0.5 mt-1 text-[8px] font-semibold text-white/50 leading-tight">
                                  <span className="whitespace-nowrap font-mono">
                                    Partidas: <strong className="text-white/80">{Math.round(player.elo - (player.fidelityPoints || 0))}</strong>
                                  </span>
                                  <span className="whitespace-nowrap font-mono">
                                    Bônus: <strong className="text-amber-500">+{player.fidelityPoints || 0}</strong>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                })()}
                </AnimatePresence>
                {(() => {
                  const filteredActive = [...players].filter(p => {
                    const stats = topStats.dailyStats[p.id];
                    return rankingPeriod === 'session' ? (stats && stats.matches > 0) : (p.matchesPlayed > 0);
                  });
                  return filteredActive.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center">
                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Nenhuma partida registrada para este dia</p>
                      </td>
                    </tr>
                  );
                })()}
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
                  <div className="flex items-center gap-5">
                    <PlayerAvatar player={selectedPlayer} size="xl" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-2xl sm:text-3xl font-black uppercase tracking-tight ${selectedPlayer.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                          {selectedPlayer.name || "Sócio sem nome"}
                        </h3>
                        {selectedPlayer.isOfficialSetter && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                            Levantador Oficial
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-white/5 text-white/70 border border-white/10">
                          {translateGender(selectedPlayer.gender)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                          selectedPlayer.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                          selectedPlayer.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                          selectedPlayer.status === 'guest' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          (selectedPlayer.status === 'dm' || selectedPlayer.isDM) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                          'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          {selectedPlayer.status === 'waitlist' ? 'Fila de Espera' : 
                           selectedPlayer.status === 'inactive' ? 'Inativo' : 
                           selectedPlayer.status === 'guest' ? 'Convidado' :
                           (selectedPlayer.status === 'dm' || selectedPlayer.isDM) ? 'Dep. Médico' : 'Sócio Ativo'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 border border-white/10 ${getPlayerTier(selectedPlayer).color}`}>
                          {getPlayerTier(selectedPlayer).label}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
                          IC {calculateCompositePerformanceRating(selectedPlayer).toFixed(1)}
                        </span>
                        {(() => {
                          const duration = topStats.totalDurations[selectedPlayer.id] || 0;
                          const eff = (selectedPlayer.elo - 1200) / (duration / 60 || 1);
                          const weight = selectedPlayer.matchesPlayed / (selectedPlayer.matchesPlayed + 10);
                          const weightedEff = eff * weight;
                          return (
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 border border-white/10 ${getEfficiencyTier(weightedEff).color}`}>
                              Patente: {getEfficiencyTier(weightedEff).label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {rankingPeriod === 'session' ? (
                      <>
                        <div className="bg-white/5 px-6 py-4 rounded-3xl border border-brand-primary/40 text-center">
                          <p className="text-4xl font-black font-mono text-brand-primary">
                            {(topStats.dailyStats[selectedPlayer.id]?.matchEloGain || 0) >= 0 ? '+' : ''}{topStats.dailyStats[selectedPlayer.id]?.matchEloGain || 0}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Saldo ELO Quadra</p>
                        </div>
                        <div className="bg-white/5 px-6 py-4 rounded-3xl border border-amber-500/40 text-center">
                          <p className="text-4xl font-black font-mono text-amber-500">
                            +{(topStats.dailyStats[selectedPlayer.id]?.fidelityGain || 0)}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Bônus Presença</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-white/5 px-6 py-4 rounded-3xl border border-brand-primary/40 text-center">
                          <p className="text-4xl font-black font-mono text-brand-primary">
                            {Math.round(selectedPlayer.elo || 1200)}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">ELO Global</p>
                        </div>
                        <div className="bg-white/5 px-6 py-4 rounded-3xl border border-emerald-500/40 text-center">
                          <p className="text-4xl font-black font-mono text-emerald-500">
                            {Math.round((selectedPlayer.elo || 1200) - (selectedPlayer.fidelityPoints || 0))}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">ELO Quadra (Partidas)</p>
                        </div>
                        <div className="bg-white/5 px-6 py-4 rounded-3xl border border-amber-500/40 text-center">
                          <p className="text-4xl font-black font-mono text-amber-500">
                            +{selectedPlayer.fidelityPoints || 0}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Bônus Presença</p>
                        </div>
                      </>
                    )}
                    {efficiencyRankings[selectedPlayer.id] && (
                      <div className="bg-white/5 px-6 py-4 rounded-3xl border border-brand-primary/40 text-center">
                        <p className="text-4xl font-black font-mono text-white">
                          #{efficiencyRankings[selectedPlayer.id]}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary mt-1">Rank Eficiência</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={() => setShowEloStatement(true)}
                    className="flex-1 md:flex-none px-6 py-3 bg-brand-primary text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white transition-all shadow-lg active:scale-95"
                  >
                    <History className="w-4 h-4" />
                    Extrato de Pontos ELO
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
                  <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Tempo Total das Partidas</p>
                      <Clock className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <p className="text-2xl font-black text-brand-primary tracking-widest">
                      {playerIndividualMetrics.totalMatchesDuration}
                    </p>
                  </div>

                  <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Aproveitamento</p>
                      <Timer className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <p className="text-2xl font-black text-brand-primary tracking-widest">
                      {playerIndividualMetrics.participation}
                    </p>
                  </div>

                  <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">
                        {rankingPeriod === 'career' ? 'Tempo Total Fora' : 'Tempo Médio Fora'}
                      </p>
                      <Timer className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <p className="text-2xl font-black text-brand-primary tracking-widest">
                      {rankingPeriod === 'career' ? playerIndividualMetrics.totalRest : playerIndividualMetrics.avgRest}
                    </p>
                  </div>

                  <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Total em Quadra</p>
                      <Activity className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <p className="text-2xl font-black text-brand-primary tracking-widest">
                      {playerIndividualMetrics.totalPlaying}
                    </p>
                  </div>

                  {(() => {
                    const isSession = rankingPeriod === 'session';
                    const daily = topStats.dailyStats[selectedPlayer.id];
                    
                    // Derive career points dynamically from matches
                    const playerAllMatches = effectiveMatches.filter(m => 
                      (m.teamA?.includes(selectedPlayer.id) || m.teamB?.includes(selectedPlayer.id)) && 
                      (m.winner === 'A' || m.winner === 'B')
                    );
                    
                    const calcCareerPointsFor = playerAllMatches.reduce((s, m) => {
                      const isA = m.teamA?.includes(selectedPlayer.id);
                      return s + (isA ? (m.scoreA || 0) : (m.scoreB || 0));
                    }, 0);

                    const calcCareerPointsAgainst = playerAllMatches.reduce((s, m) => {
                      const isA = m.teamA?.includes(selectedPlayer.id);
                      return s + (isA ? (m.scoreB || 0) : (m.scoreA || 0));
                    }, 0);

                    const careerPointsFor = selectedPlayer.pointsFor || calcCareerPointsFor;
                    const careerPointsAgainst = selectedPlayer.pointsAgainst || calcCareerPointsAgainst;
                    const totalMatchesCount = isSession ? (daily?.matches || 0) : (selectedPlayer.matchesPlayed || playerAllMatches.length || 0);

                    const ptsFor = isSession ? (daily?.pointsFor || 0) : careerPointsFor;
                    const ptsAgainst = isSession ? (daily?.pointsAgainst || 0) : careerPointsAgainst;
                    const avgFor = totalMatchesCount > 0 ? (ptsFor / totalMatchesCount).toFixed(1) : '0.0';
                    const avgAgainst = totalMatchesCount > 0 ? (ptsAgainst / totalMatchesCount).toFixed(1) : '0.0';
                    const saldo = ptsFor - ptsAgainst;

                    return (
                      <>
                        <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                          <div className="flex justify-between items-start mb-4">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Média Pontos Pró</p>
                            <Target className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                          </div>
                          <p className="text-2xl font-black text-emerald-500 tracking-widest">
                            {avgFor}
                          </p>
                        </div>

                        <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                          <div className="flex justify-between items-start mb-4">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Média Pontos Contra</p>
                            <Swords className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                          </div>
                          <p className="text-2xl font-black text-rose-500 tracking-widest">
                            {avgAgainst}
                          </p>
                        </div>
                        
                        <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                          <div className="flex justify-between items-start mb-4">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Saldo de Pontos</p>
                            <Target className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                          </div>
                          <p className={`text-2xl font-black tracking-widest ${
                            saldo > 0 ? 'text-emerald-500' : saldo < 0 ? 'text-rose-500' : 'text-white'
                          }`}>
                            {saldo > 0 ? `+${saldo}` : saldo}
                          </p>
                        </div>
                      </>
                    );
                  })()}

                      <div className="relative bg-brand-secondary/30 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] hover:border-brand-primary/30 transition-all group overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                        <div className="flex justify-between items-start mb-4">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-tight">Eficiência Técnica</p>
                          <div className="flex items-center gap-2">
                             {efficiencyRankings[selectedPlayer.id] && (
                               <span className="text-[10px] font-black text-white">
                                 #{efficiencyRankings[selectedPlayer.id]} RANK
                                </span>
                             )}
                             <Zap className="w-4 h-4 text-brand-primary/40 group-hover:text-brand-primary transition-colors" />
                          </div>
                        </div>
                        <p className="text-2xl font-black text-brand-primary tracking-widest">
                          {((selectedPlayer.trueSkill?.mu || 25) - 3 * (selectedPlayer.trueSkill?.sigma || 8.333)).toFixed(2)}
                        </p>
                      </div>
                </div>
              </div>

              {/* Accumulated Results Card - CAREER */}
              <div className={`bg-black backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}>
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-white/5`}>
                      <History className="w-5 h-5 text-brand-primary" />
                    </div>
                    <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Resultados Acumulados (Carreira)</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/30 rounded-xl font-black text-[10px] uppercase font-mono">
                      IC {calculateCompositePerformanceRating(selectedPlayer).toFixed(1)}
                    </span>
                    <span className="bg-white/5 px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black text-brand-primary uppercase tracking-widest font-mono">
                      {Math.round(selectedPlayer.elo || 1200)} ELO Global
                    </span>
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
                    <p className={`text-3xl font-black text-white/80`}>{selectedPlayer.matchesPlayed || ((selectedPlayer.wins || 0) + (selectedPlayer.losses || 0))}</p>
                  </div>
                  <div className={`p-6 rounded-[2rem] border bg-white/5 border-white/5 border-l-[6px] border-l-brand-primary`}>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">Aproveitamento Final</p>
                    <p className={`text-3xl font-black text-brand-primary`}>
                      {(selectedPlayer.matchesPlayed || ((selectedPlayer.wins || 0) + (selectedPlayer.losses || 0))) > 0 
                        ? Math.round(((selectedPlayer.wins || 0) / (selectedPlayer.matchesPlayed || ((selectedPlayer.wins || 0) + (selectedPlayer.losses || 0)))) * 100) 
                        : 0}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">ELO Total Acumulado</p>
                    <p className="text-xl font-mono font-black text-brand-primary">{Math.round(selectedPlayer.elo)} pts</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">ELO das Partidas (Quadra)</p>
                    <p className="text-xl font-mono font-black text-emerald-500">{Math.round(selectedPlayer.elo - (selectedPlayer.fidelityPoints || 0))} pts</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Bônus Diário Acumulado</p>
                    <p className="text-xl font-mono font-black text-amber-500">+{selectedPlayer.fidelityPoints || 0} pts</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ELO Evolution Chart */}
                <div className={`bg-black backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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

                {/* IC Evolution Chart (Soberano) */}
                <IcEvolutionChart player={selectedPlayer} matches={matches} isDark={true} />

                <div className={`bg-black backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border`}>
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-2 bg-brand-primary/10 rounded-xl">
                        <History className="w-5 h-5 text-brand-primary" />
                      </div>
                      <h4 className={`text-xs font-black uppercase tracking-widest text-white`}>Evolução de Vitórias e Derrotas</h4>
                    </div>
                    <WinLossChart matches={matches} playerId={selectedPlayer.id} isDark={true} />
                  </div>

                {/* Performance Trends Line Charts */}
                <div className={`bg-black backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border flex flex-col`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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
                    <div className={`p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group flex flex-col border bg-black backdrop-blur-xl border-white/5`}>
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
                      <div className="relative z-10">
                        <div className="absolute top-0 right-0 p-8 flex gap-2">
                          <div className="group relative">
                            <Info className="w-5 h-5 text-white/20 hover:text-brand-primary transition-colors cursor-help" />
                            <div className="absolute right-0 top-full mt-2 w-64 p-4 bg-brand-secondary border border-brand-primary/40 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                              <p className="text-[10px] font-black text-brand-primary uppercase mb-2">Estabilidade de Performance</p>
                              <p className="text-[10px] leading-relaxed text-white/60 font-bold">
                                Este gráfico relaciona o seu aproveitamento (Vitórias) com a duração das partidas. 
                                Uma linha estável indica que você mantém o mesmo nível de jogo independente se a partida é curta ou longa.
                              </p>
                            </div>
                          </div>
                          <Activity className="w-12 h-12 text-brand-primary opacity-10 group-hover:scale-110 transition-transform" />
                        </div>
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-4">Estabilidade de Performance (Vitórias por Duração)</p>
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
                                          {data.winRate}% Vitórias
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
                <div className={`p-6 rounded-[2rem] border bg-black backdrop-blur-xl border-white/5 shadow-2xl relative overflow-hidden group`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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

                <div className={`p-6 rounded-[2rem] border bg-brand-secondary/30 backdrop-blur-xl border-white/5 shadow-2xl relative overflow-hidden group`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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

                <div className={`p-6 rounded-[2rem] border bg-brand-secondary/30 backdrop-blur-xl border-white/5 shadow-2xl relative overflow-hidden group`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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
              <div className={`bg-brand-secondary/30 backdrop-blur-xl border-white/5 p-8 rounded-[2.5rem] shadow-2xl border relative overflow-hidden group`}>
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary shadow-[0_0_15px_rgba(245,196,41,0.5)]" />
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
                            <p className={`font-bold tracking-tight text-sm ${!isSelected && player.isOfficialSetter ? 'text-brand-primary' : ''}`}>{capitalizeName(player.name)}</p>
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

      <AnimatePresence>
        {showEloStatement && selectedPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEloStatement(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-brand-secondary border border-brand-primary/40 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-brand-light">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-primary/10 border border-brand-primary/40 flex items-center justify-center text-xl font-black text-brand-primary uppercase">
                    {selectedPlayer.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Extrato de Pontos ELO</h3>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest leading-none mt-1">{selectedPlayer.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowEloStatement(false)}
                  className="p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Desktop Table - Hidden on Mobile */}
                  <div className="hidden sm:block overflow-hidden rounded-3xl border border-white/5 bg-black/40">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Data</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Partida</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Resultado</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Saldo Pontos</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Elo (+/-)</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Elo Atual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(() => {
                          const history = comprehensiveHistory;
                          
                          if (history.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-xs font-bold text-white/20 uppercase tracking-widest">
                                  Nenhum registro de pontos encontrado
                                </td>
                              </tr>
                            );
                          }

                          return history.map((entry, idx) => {
                            const dailyNumber = entry.matchDetails?.dailyNumber || '-';
                            const matchTime = entry.matchDetails?.timestamp 
                              ? new Date(entry.matchDetails.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
                              : '';
                            const scoreA = entry.matchDetails?.scoreA;
                            const scoreB = entry.matchDetails?.scoreB;

                            // Calculate change properly from current list
                            const olderEntry = history[idx + 1];
                            const change = entry.change !== undefined 
                              ? entry.change 
                              : (olderEntry && entry.elo && olderEntry.elo ? entry.elo - olderEntry.elo : undefined);
                              
                            const result = entry.result || (change !== undefined ? (change > 0 ? 'V' : (change < 0 ? 'D' : '-')) : '-');
                            const displayTime = entry.timestamp 
                              ? new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
                              : (matchTime || '');

                            return (
                              <tr key={`${selectedPlayer.id}-history-${idx}`} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-white">{formatBrazilianDate(entry.date)}</span>
                                    {displayTime && (
                                      <span className="text-[8px] font-bold text-white/20 uppercase">
                                        {displayTime}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className="text-xs font-black text-white/60">#{dailyNumber}</span>
                                    {scoreA !== undefined && (
                                      <span className="text-[9px] font-black text-white/20 tabular-nums">
                                        {scoreA} × {scoreB}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                                    result === 'V' ? 'bg-brand-primary text-black' : 
                                    result === 'D' ? 'bg-white text-black' : 
                                    result === 'P' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/40'
                                  }`}>
                                    {result === 'P' ? 'PRES' : result}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {scoreA !== undefined && scoreB !== undefined ? (
                                    (() => {
                                      const isA = entry.matchDetails?.teamA.includes(selectedPlayer.id);
                                      const playerDiff = isA ? scoreA - scoreB : scoreB - scoreA;
                                      return (
                                        <span className={`text-xs font-black ${playerDiff > 0 ? 'text-emerald-500' : (playerDiff < 0 ? 'text-rose-500' : 'text-white/40')}`}>
                                          {playerDiff > 0 ? '+' : ''}{playerDiff}
                                        </span>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-xs font-black text-white/10">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className={`text-xs font-black ${change !== undefined ? (change > 0 ? 'text-emerald-500' : (change < 0 ? 'text-rose-500' : 'text-white/40')) : 'text-white/10'}`}>
                                    {change !== undefined ? (change > 0 ? '+' : '') + change : (entry.matchDetails ? '...' : '-')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className="text-xs font-black text-white/80">{entry.elo ?? '-'}</span>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile List View - Visible only on Mobile */}
                  <div className="sm:hidden space-y-3">
                    {(() => {
                      const history = comprehensiveHistory;
                      
                      if (history.length === 0) {
                        return (
                          <div className="px-6 py-12 text-center text-xs font-bold text-white/20 uppercase tracking-widest bg-black/20 rounded-3xl border border-white/5">
                            Nenhum registro de pontos encontrado
                          </div>
                        );
                      }

                      return history.map((entry, idx) => {
                        const olderEntry = history[idx + 1];
                        
                        const change = entry.change !== undefined 
                          ? entry.change 
                          : (olderEntry && entry.elo && olderEntry.elo ? entry.elo - olderEntry.elo : undefined);
                        
                        const result = entry.result || (change !== undefined ? (change > 0 ? 'V' : (change < 0 ? 'D' : '-')) : '-');
                        const dailyNumber = entry.matchDetails?.dailyNumber || '-';
                        const scoreA = entry.matchDetails?.scoreA;
                        const scoreB = entry.matchDetails?.scoreB;

                        return (
                          <div key={`mob-hist-${idx}`} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                result === 'V' ? 'bg-brand-primary text-black' : 
                                result === 'D' ? 'bg-white text-black' : 
                                result === 'P' ? 'bg-emerald-500 text-white text-[8px]' : 'bg-white/10 text-white/40'
                              }`}>
                                {result === 'P' ? 'PRES' : result}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-white">{formatBrazilianDate(entry.date)}</span>
                                  {dailyNumber !== '-' && <span className="text-[10px] font-bold text-white/40">#{dailyNumber}</span>}
                                  {scoreA !== undefined && scoreB !== undefined && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-bold text-white/20 tabular-nums">
                                        ({scoreA}×{scoreB})
                                      </span>
                                      {(() => {
                                        const isA = entry.matchDetails?.teamA.includes(selectedPlayer.id);
                                        const playerDiff = isA ? scoreA - scoreB : scoreB - scoreA;
                                        return (
                                          <span className={`text-[9px] font-black ${playerDiff > 0 ? 'text-emerald-500' : (playerDiff < 0 ? 'text-rose-500' : 'text-white/40')}`}>
                                            [{playerDiff > 0 ? '+' : ''}{playerDiff}]
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                                <span className="text-[8px] font-bold text-white/20 uppercase">
                                  {new Date(entry.timestamp || (entry.date ? new Date(entry.date).getTime() : 0)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-black ${change !== undefined ? (change > 0 ? 'text-emerald-500' : (change < 0 ? 'text-rose-500' : 'text-white/40')) : 'text-white/10'}`}>
                                {change !== undefined ? (change > 0 ? '+' : '') + change : (entry.matchDetails ? '...' : '-')}
                              </div>
                              <div className="text-[10px] font-bold text-white/40">Saldo: {entry.elo ?? '-'}</div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  
                  <div className="p-6 bg-brand-primary/5 rounded-3xl border border-brand-primary/20">
                    <div className="flex items-start gap-4">
                      <Info className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Sobre o Extrato</p>
                        <p className="text-[10px] leading-relaxed text-white/60 font-medium">
                          O extrato exibe o histórico detalhado de alterações do seu ELO. Pontos são ganhos por vitórias e perdidos por derrotas, com bônus baseados no saldo de gols e sequências de vitórias (streaks). Registros antigos podem não exibir o número da partida.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>


              <div className="p-6 bg-brand-light border-t border-white/5 text-center">
                <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Sócio Club - Sistema de Ranking & Auditoria</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
