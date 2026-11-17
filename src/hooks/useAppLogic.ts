import React, { useState, useCallback, useEffect } from 'react';
import { 
  auth, 
  signInWithPopup, 
  signInWithRedirect,
  googleProvider, 
  signOut, 
  signInAnonymously,
  db, 
  doc, 
  setDoc, 
  updateDoc,
  addDoc, 
  collection, 
  deleteDoc, 
  writeBatch,
  getDoc,
  getDocs,
  query,
  where,
  OperationType,
  handleFirestoreError,
  trackUsage,
  trackAIUsage,
  getFirestoreDateKey,
  getNextThursday,
  deleteField,
  serverTimestamp,
  isQuotaExceeded,
  storage,
  ref,
  uploadBytes
} from '../../firebase';
import { useStore } from '../../store';
import { cleanObject, generateUUID } from '../../utils/helpers';
import { RODNEY_ID, RODNEY_SETTER_START_DATE } from '../../utils/setterStats';
import { toStandardDateKey } from '../utils/dateUtils';
import { recalculateAllStatsFromMatches } from '../utils/matchReprocessor';
import { calculateTrueSkillUpdate } from '../utils/trueSkill';
import { Player, Team, Match, Tournament, TournamentTeam, TournamentMatch, SetScore, SystemMetadata, TournamentStrategy, Payment, Expense } from '../../types';
import {
  generateTeams,
  generateTournamentTeams,
  getPriorityQueue,
  autoFixAllInconsistencies,
  optimizeTeamSynergyIteratively,
  enrichPlayerImmutably,
  cloneGenerationResultImmutably,
  verifyClubGenerationRules
} from '../../utils/teamLogic';
import { playerSchema, matchSchema } from '../lib/schemas';
import { auditDayPurgeIntegrity } from '../services/dayPurgeAuditAgent';
import { analyzeMatch, verifyRules, detectAnomalies, generateTeamAnnouncementAudio } from '../../services/geminiService';
import { logAction, AuditAction } from '../../services/auditService';
import { playFeedbackSound, triggerHaptic } from '../utils/feedback';
import { parseBirthMonthDay } from './useBirthdayAutomation';

let activeBirthdaysSyncId: string | null = null;
let activeGuardianId: string | null = null;

const dateCache = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const useAppLogic = (commitBatchWithLog?: (batch: any, label: string, size: number) => Promise<void>) => {
  const [instanceId] = useState(() => generateUUID());
  const MAX_ACTIVE_MEMBERS = 32;
  const WAITLIST_LIMIT = 5;

  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const matches = useStore(state => state.matches);
  const systemMetadata = useStore(state => state.systemMetadata);
  const generationResult = useStore(state => state.generationResult);
  const teamGenerationMode = useStore(state => state.teamGenerationMode);
  const setTeamGenerationMode = useStore(state => state.setTeamGenerationMode);
  const balancingRatingMode = useStore(state => state.balancingRatingMode);
  const setBalancingRatingMode = useStore(state => state.setBalancingRatingMode);
  const balancingStrategy = useStore(state => state.balancingStrategy);
  const setPlayers = useStore(state => state.setPlayers);
  const setAttendance = useStore(state => state.setAttendance);
  const setMatches = useStore(state => state.setMatches);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const setSystemMetadata = useStore(state => state.setSystemMetadata);
  const setViewMode = useStore(state => state.setViewMode);
  const showNotification = useStore(state => state.showNotification);
  const showConfirmModal = useStore(state => state.showConfirmModal);
  const hideConfirmModal = useStore(state => state.hideConfirmModal);
  const setAnalysis = useStore(state => state.setAnalysis);
  const setRuleVerification = useStore(state => state.setRuleVerification);
  const setScoreA = useStore(state => state.setScoreA);
  const setScoreB = useStore(state => state.setScoreB);
  const setTempScoreA = useStore(state => state.setTempScoreA);
  const setTempScoreB = useStore(state => state.setTempScoreB);
  const setScoreMode = useStore(state => state.setScoreMode);
  const setNarrationScript = useStore(state => state.setNarrationScript);
  const setNarrationAudio = useStore(state => state.setNarrationAudio);
  const setIsSyncing = useStore(state => state.setIsSyncing);
  const setDbStatus = useStore(state => state.setDbStatus);
  const setUser = useStore(state => state.setUser);
  const setUserRole = useStore(state => state.setUserRole);
  const setCurrentPlayer = useStore(state => state.setCurrentPlayer);
  const scoreA = useStore(state => state.scoreA);
  const scoreB = useStore(state => state.scoreB);
  const tempScoreA = useStore(state => state.tempScoreA);
  const tempScoreB = useStore(state => state.tempScoreB);
  const scoreMode = useStore(state => state.scoreMode);
  const isSyncing = useStore(state => state.isSyncing);
  const elapsedTime = useStore(state => state.elapsedTime);
  const setIsAnalyzing = useStore(state => state.setIsAnalyzing);
  const isAnalyzing = useStore(state => state.isAnalyzing);
  const isVerifyingRules = useStore(state => state.isVerifyingRules);
  const isScanningAnomalies = useStore(state => state.isScanningAnomalies);
  const anomalyReport = useStore(state => state.anomalyReport);
  const setIsVerifyingRules = useStore(state => state.setIsVerifyingRules);
  const setIsScanningAnomalies = useStore(state => state.setIsScanningAnomalies);
  const setAnomalyReport = useStore(state => state.setAnomalyReport);
  const setIsLoggingOut = useStore(state => state.setIsLoggingOut);
  const usageStats = useStore(state => state.usageStats);
  const synergy = useStore(state => state.synergy);
  const negativeSynergy = useStore(state => state.negativeSynergy);
  const rivalry = useStore(state => state.rivalry);
  const payments = useStore(state => state.payments);
  const activeTournament = useStore(state => state.activeTournament);
  const setActiveTournament = useStore(state => state.setActiveTournament);
  const setSynergy = useStore(state => state.setSynergy);
  const setNegativeSynergy = useStore(state => state.setNegativeSynergy);
  const setRivalry = useStore(state => state.setRivalry);
  const setPayments = useStore(state => state.setPayments);
  const setExpenses = useStore(state => state.setExpenses);

  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false);
  const [showSetterPromptModal, setShowSetterPromptModal] = useState(false);
  const [setterPromptData, setSetterPromptData] = useState<{ playersToUse: Player[]; isReshuffle: boolean } | null>(null);
  const [isGuardianLocked, setIsGuardianLocked] = useState(true);

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  const getCompletedMatchesForDate = useCallback((targetDateKey: string, sourceMatches: Match[] = matches) => {
    return (sourceMatches || [])
      .filter(m => {
        if (!m) return false;
        const mDate = m.date ? (m.date.includes('T') ? m.date.split('T')[0] : m.date) : '';
        if (mDate === targetDateKey) return true;
        if (m.timestamp) return dateCache.format(new Date(m.timestamp)) === targetDateKey;
        return false;
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [matches]);

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const exportPlayersCSV = () => {
    const headers = ['ID', 'Nome', 'Email', 'Status', 'ELO', 'Vitórias', 'Derrotas', 'Jogos', 'Gênero', 'Levantador'];
    const rows = players.map(p => [p.id, p.name, p.email || '', p.status || 'active', p.elo, p.wins, p.losses, p.matchesPlayed, p.gender, p.isOfficialSetter ? 'Sim' : 'Não']);
    downloadCSV([headers, ...rows].map(e => e.join(',')).join('\n'), `guerreiros_socios_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Lista de sócios exportada com sucesso!', 'success');
  };

  const exportMatchesCSV = () => {
    const headers = ['ID', 'Data', 'Time A', 'Time B', 'Vencedor', 'Placar A', 'Placar B', 'Duração (s)'];
    const rows = matches.map(m => [m.id, m.date, m.teamA.join(';'), m.teamB.join(';'), m.winner, m.scoreA, m.scoreB, m.duration]);
    downloadCSV([headers, ...rows].map(e => e.join(',')).join('\n'), `guerreiros_partidas_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Histórico de partidas exportado com sucesso!', 'success');
  };

  const exportPaymentsCSV = () => {
    const headers = ['ID', 'Sócio ID', 'Mês', 'Valor', 'Status', 'Vencimento', 'Data Pagamento', 'Método'];
    const rows = payments.map(p => [p.id, p.playerId, p.month, p.amount, p.status, p.dueDate || '', p.paymentDate || '', p.method || '']);
    downloadCSV([headers, ...rows].map(e => e.join(',')).join('\n'), `guerreiros_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Relatório financeiro exportado com sucesso!', 'success');
  };

  const updateSystemMetadata = async (metadata: Partial<SystemMetadata>) => {
    setSystemMetadata(metadata);
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      await setDoc(doc(db, 'metadata', 'system'), metadata, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'metadata/system');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (userRole !== 'ADMIN' || !players || players.length === 0) return;
    if (activeBirthdaysSyncId === null) activeBirthdaysSyncId = instanceId;
    if (activeBirthdaysSyncId !== instanceId) return;

    const indices = new Set<string>();
    for (const p of players) {
      if (p.status === 'active' && p.birthDate) {
        const parsed = parseBirthMonthDay(p.birthDate);
        if (parsed) {
          indices.add(`${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`);
        }
      }
    }
    const newIndex = Array.from(indices).sort();
    const currentIndex = useStore.getState().systemMetadata?.activeBirthdaysIndex;
    const isDifferent = !Array.isArray(currentIndex) || newIndex.length !== currentIndex.length || !newIndex.every((v, i) => v === currentIndex[i]);
    if (isDifferent) updateSystemMetadata({ activeBirthdaysIndex: newIndex }).catch(() => {});

    return () => {
      if (activeBirthdaysSyncId === instanceId) activeBirthdaysSyncId = null;
    };
  }, [players, userRole, instanceId]);

  useEffect(() => {
    const timer = setTimeout(() => setIsGuardianLocked(false), 30000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (userRole !== 'ADMIN' || isSyncing || players.length === 0 || matches.length === 0 || isGuardianLocked) return;
    if (activeGuardianId === null) activeGuardianId = instanceId;
    if (activeGuardianId !== instanceId) return;

    const runGuardian = async () => {
      try {
        if (!auth.currentUser || userRole !== 'ADMIN' || isQuotaExceeded) return;
        const todayKey = getFirestoreDateKey();
        const sessionMatches = getCompletedMatchesForDate(todayKey);
        if (systemMetadata.dailyMatchCount > 0 && sessionMatches.length === 0 && matches.length === 0) return;

        let hasAnomalies = false;
        sessionMatches.forEach((m, index) => {
          if (m.dailyNumber !== index + 1 || m.date !== todayKey) hasAnomalies = true;
        });

        const expectedCompletedCount = sessionMatches.length;
        if (systemMetadata.lastResetDate === todayKey && systemMetadata.dailyMatchCount !== expectedCompletedCount) {
          hasAnomalies = true;
        }

        if (hasAnomalies) {
          const batch = writeBatch(db);
          let updates = 0;
          sessionMatches.forEach((m, index) => {
            const expectedNumber = index + 1;
            const matchUpdates: any = {};
            if (m.dailyNumber !== expectedNumber) matchUpdates.dailyNumber = expectedNumber;
            if (m.date !== todayKey) matchUpdates.date = todayKey;
            if (Object.keys(matchUpdates).length > 0) {
              batch.update(doc(db, 'matches', m.id), matchUpdates);
              updates++;
            }
          });
          if (systemMetadata.dailyMatchCount !== expectedCompletedCount) {
            batch.set(doc(db, 'metadata', 'system'), { dailyMatchCount: expectedCompletedCount, lastResetDate: todayKey }, { merge: true });
            updates++;
          }
          if (updates > 0) await batch.commit().catch(() => {});
        }
      } catch (err) {}
    };

    const timeout = setTimeout(runGuardian, 2500);
    return () => {
      clearTimeout(timeout);
      if (activeGuardianId === instanceId) activeGuardianId = null;
    };
  }, [userRole, matches.length, systemMetadata.lastResetDate, systemMetadata.dailyMatchCount, instanceId, isGuardianLocked, isSyncing, players, getCompletedMatchesForDate]);

  const resetElo = async () => {
    showConfirmModal(
      'Resetar ELO de Todos',
      'Deseja resetar o ELO de TODOS os sócios para 1200 e limpar o histórico de evolução? Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          players.forEach(p => {
            if (p.id) {
              batch.set(doc(db, 'players', p.id), { elo: 1200, eloHistory: [], dailyResults: [], dailyEloGain: 0 }, { merge: true });
            }
          });
          await batch.commit();
          await trackUsage(0, players.length);
          setPlayers(players.map(p => ({ ...p, elo: 1200, eloHistory: [], dailyResults: [], dailyEloGain: 0 })));
          showNotification('ELO de todos os sócios resetado.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'reset-elo');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const validateMatchAttendance = async (teamAIds: string[], teamBIds: string[], matchDate: string, originalMatchPlayers?: string[]) => {
    const stdDate = toStandardDateKey(matchDate);
    const attSnap = await getDocs(collection(db, 'attendance', stdDate, 'players'));
    const presentIds = new Set<string>();
    attSnap.forEach(d => presentIds.add(d.id.toLowerCase()));

    if (stdDate === getFirestoreDateKey()) {
      attendance.forEach(a => {
        if (a.id && a.status !== 'left') presentIds.add(a.id.toLowerCase());
      });
    }

    const allIds = [...teamAIds, ...teamBIds];
    const absentIds = allIds.filter(id => {
      if (presentIds.has(id.toLowerCase())) return false;
      if (originalMatchPlayers && originalMatchPlayers.includes(id)) return false;
      return true;
    });

    if (absentIds.length > 0) {
      const absentNames = absentIds.map(id => players.find(pl => pl.id === id)?.name || id).join(', ');
      throw new Error(`ERRO DE BLOQUEIO DE INTEGRIDADE: Participante(s) ausente(s) na lista de presença (${stdDate}): [${absentNames}].`);
    }
  };

  const handleFinishMatch = async (winner: 'A' | 'B', manualScoreA?: number, manualScoreB?: number, stats?: any[]) => {
    if (!generationResult || isSyncing) return;
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const batch = writeBatch(db);
      const matchId = generateUUID();
      const timestamp = Date.now();
      const date = getFirestoreDateKey();
      
      let finalScoreA = manualScoreA !== undefined ? manualScoreA : scoreA;
      let finalScoreB = manualScoreB !== undefined ? manualScoreB : scoreB;
      
      if (manualScoreA === undefined && manualScoreB === undefined) {
        if (scoreMode === 'SCORE') {
          finalScoreA = parseInt(tempScoreA) || 0;
          finalScoreB = parseInt(tempScoreB) || 0;
        } else if (scoreMode === 'QUICK' && finalScoreA === 0 && finalScoreB === 0) {
          finalScoreA = winner === 'A' ? 25 : 23;
          finalScoreB = winner === 'B' ? 25 : 23;
        }
      }
      
      const getTeamIds = (team: Team) => {
        const ids = team.players.map(p => p.id);
        if (team.setter) ids.unshift(team.setter.id);
        return ids;
      };

      const todayCompletedMatches = getCompletedMatchesForDate(date);
      const maxDailyNumber = todayCompletedMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
      const finalCount = Math.max(todayCompletedMatches.length + 1, maxDailyNumber + 1);
      
      const match: Match = {
        id: matchId,
        timestamp,
        date,
        teamA: getTeamIds(generationResult.teamA),
        teamB: getTeamIds(generationResult.teamB),
        winner,
        scoreA: finalScoreA,
        scoreB: finalScoreB,
        duration: elapsedTime,
        startTime: systemMetadata.matchStartTime || (timestamp - elapsedTime * 1000),
        endTime: timestamp,
        mode: scoreMode,
        dailyNumber: finalCount,
        stats: stats || []
      };
      
      matchSchema.parse(match);
      await validateMatchAttendance(match.teamA, match.teamB, date);
      
      const teamA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
      const teamB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];
      
      const tsUpdates = calculateTrueSkillUpdate(teamA, teamB, winner);
      const tsMap = new Map<string, { mu: number; sigma: number }>();
      tsUpdates.forEach(u => tsMap.set(u.playerId, u.newTrueSkill));
      
      batch.set(doc(db, 'matches', matchId), cleanObject(match));
      batch.set(doc(db, 'metadata', 'system'), { 
        dailyMatchCount: finalCount,
        lastResetDate: date,
        matchStartTime: null,
        lastMatchTimestamp: timestamp,
        lastUpdate: timestamp
      }, { merge: true });

      const dailyBonus = systemMetadata?.dailyAttendanceBonus ?? 20;
      const minMatchesNeeded = systemMetadata?.minMatchesForDailyBonus ?? 2;
      const awardedBonusPlayerIds = new Set<string>();
      
      const updatePlayerStats = (p: Player, isTeamA: boolean) => {
        const latestPlayer = players.find(pl => pl.id === p.id) || p;
        const isWinner = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
        const totalEloChange = isWinner ? 20 : -20;
        const pFor = isTeamA ? finalScoreA : finalScoreB;
        const pAgainst = isTeamA ? finalScoreB : finalScoreA;
        
        const prevTodayMatches = todayCompletedMatches.filter(m => m.teamA?.includes(p.id) || m.teamB?.includes(p.id));
        const prevTodayWins = prevTodayMatches.filter(m => (m.winner === 'A' && m.teamA?.includes(p.id)) || (m.winner === 'B' && m.teamB?.includes(p.id))).length;
        const prevTodayLosses = prevTodayMatches.length - prevTodayWins;

        const nextDailyMatches = prevTodayMatches.length + 1;
        const nextDailyWins = prevTodayWins + (isWinner ? 1 : 0);
        const nextDailyLosses = prevTodayLosses + (!isWinner ? 1 : 0);

        let consecutivePlayedCount = 1;
        for (let i = todayCompletedMatches.length - 1; i >= 0; i--) {
          const prevM = todayCompletedMatches[i];
          if (prevM.teamA?.includes(p.id) || prevM.teamB?.includes(p.id)) consecutivePlayedCount++;
          else break;
        }
        
        const hasFidelityToday = latestPlayer.lastFidelityDate === date;
        let finalPlayerElo = latestPlayer.elo || 1200;
        const updatedHistory = [...(latestPlayer.eloHistory || [])];
        const updates: any = {};

        if (!hasFidelityToday && nextDailyMatches >= minMatchesNeeded) {
          awardedBonusPlayerIds.add(p.id);
          updates.fidelityPoints = (latestPlayer.fidelityPoints || 0) + dailyBonus;
          updates.lastFidelityDate = date;
          finalPlayerElo += dailyBonus;
          updatedHistory.push({
            date,
            elo: finalPlayerElo,
            matchId: `fidelity-bonus-${date}-${timestamp}`,
            change: dailyBonus,
            timestamp: timestamp - 1000,
            result: 'P' as const,
            fidelityBonus: true
          });
        }
        
        const eloAfterMatch = Math.max(800, finalPlayerElo + totalEloChange);
        updatedHistory.push({ 
          date, 
          elo: eloAfterMatch, 
          matchId,
          change: totalEloChange,
          timestamp,
          result: (isWinner ? 'V' : 'D') as 'V' | 'D'
        });

        const gotBonusToday = hasFidelityToday || awardedBonusPlayerIds.has(p.id);
        updates.elo = eloAfterMatch;
        updates.matchesPlayed = (latestPlayer.matchesPlayed || 0) + 1;
        updates.pointsFor = (latestPlayer.pointsFor || 0) + pFor;
        updates.pointsAgainst = (latestPlayer.pointsAgainst || 0) + pAgainst;
        updates.pointsBalance = updates.pointsFor - updates.pointsAgainst;
        updates.wins = isWinner ? (latestPlayer.wins || 0) + 1 : (latestPlayer.wins || 0);
        updates.losses = !isWinner ? (latestPlayer.losses || 0) + 1 : (latestPlayer.losses || 0);
        updates.dailyMatches = nextDailyMatches;
        updates.dailyWins = nextDailyWins;
        updates.dailyLosses = nextDailyLosses;
        updates.dailyEloGain = (nextDailyWins * 20) - (nextDailyLosses * 20) + (gotBonusToday ? dailyBonus : 0);
        updates.dailyResults = [...(latestPlayer.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'];
        updates.playedLastMatch = true;
        updates.consecutivePlayed = consecutivePlayedCount;
        updates.consecutiveBenched = 0;
        updates.eloHistory = updatedHistory.slice(-200);
        
        const trueskillUpdate = tsMap.get(p.id);
        if (trueskillUpdate) updates.trueSkill = trueskillUpdate;

        batch.set(doc(db, 'players', p.id), cleanObject(updates), { merge: true });
        batch.set(doc(db, 'attendance', date, 'players', p.id), cleanObject(updates), { merge: true });
      };
      
      teamA.forEach(p => updatePlayerStats(p, true));
      teamB.forEach(p => updatePlayerStats(p, false));

      const newSynergy = { ...synergy };
      const newNegativeSynergy = { ...negativeSynergy };
      const newRivalry = { ...rivalry };
      const winners = winner === 'A' ? teamA : teamB;
      const losers = winner === 'A' ? teamB : teamA;

      for (let i = 0; i < winners.length; i++) {
        for (let j = i + 1; j < winners.length; j++) {
          const pair = [winners[i].id, winners[j].id].sort().join('_');
          newSynergy[pair] = (newSynergy[pair] || 0) + 1;
        }
      }
      for (let i = 0; i < losers.length; i++) {
        for (let j = i + 1; j < losers.length; j++) {
          const pair = [losers[i].id, losers[j].id].sort().join('_');
          newNegativeSynergy[pair] = (newNegativeSynergy[pair] || 0) + 1;
        }
      }
      winners.forEach(w => {
        losers.forEach(l => {
          const pair = `${l.id}_${w.id}`;
          newRivalry[pair] = (newRivalry[pair] || 0) + 1;
        });
      });

      batch.set(doc(db, 'metadata', 'synergy'), newSynergy);
      batch.set(doc(db, 'metadata', 'negative_synergy'), newNegativeSynergy);
      batch.set(doc(db, 'metadata', 'rivalry'), newRivalry);
      
      const onCourtSet = new Set([...teamA.map(p => p.id), ...teamB.map(p => p.id)]);
      const benchPlayers = attendance.filter(a => !onCourtSet.has(a.id) && a.status !== 'left' && !a.isDM);

      benchPlayers.forEach(p => {
        const latestBenchPlayer = players.find(pl => pl.id === p.id) || p;
        const updates: any = {
          playedLastMatch: false,
          consecutivePlayed: 0,
          consecutiveBenched: (latestBenchPlayer.consecutiveBenched || 0) + 1
        };
        batch.set(doc(db, 'players', p.id), cleanObject(updates), { merge: true });
        batch.set(doc(db, 'attendance', date, 'players', p.id), cleanObject(updates), { merge: true });
      });
      
      batch.delete(doc(db, 'metadata', 'currentMatch'));

      const notifyResult = (p: Player, isTeamA: boolean) => {
        const isWinner = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
        const title = isWinner ? 'Vitória! 🏆' : 'Fim de Jogo';
        const message = isWinner 
          ? `Parabéns! Seu time venceu a partida #${finalCount}.` 
          : `Seu time perdeu a partida #${finalCount}. Bora pra próxima!`;

        batch.set(doc(collection(db, 'notifications')), {
          playerId: p.id,
          playerUid: p.uid || null,
          title,
          message,
          createdAt: Date.now(),
          read: false,
          type: 'match'
        });

        if (p.fcmToken && systemMetadata.matchNotificationsGlobalEnabled !== false && p.matchNotificationsEnabled !== false) {
          batch.set(doc(collection(db, 'fcm_messages')), {
            token: p.fcmToken,
            notification: { title, body: message, sound: 'default' },
            data: { unreadCount: '1', type: 'match' },
            createdAt: serverTimestamp()
          });
        }
      };

      teamA.forEach(p => notifyResult(p, true));
      teamB.forEach(p => notifyResult(p, false));
      
      await batch.commit();
      setSystemMetadata({ 
        ...systemMetadata,
        dailyMatchCount: finalCount,
        lastResetDate: date,
        matchStartTime: null,
        lastMatchTimestamp: timestamp
      });
      await trackUsage(0, teamA.length + teamB.length + benchPlayers.length + 2);
      
      const updateLocalStats = (p: Player) => {
        const playedInA = teamA.some(tp => tp.id === p.id);
        const playedInB = teamB.some(tp => tp.id === p.id);
        if (playedInA || playedInB) {
          const isWinner = (playedInA && winner === 'A') || (playedInB && winner === 'B');
          const eloChange = isWinner ? 20 : -20;
          const gotBonus = awardedBonusPlayerIds.has(p.id) ? dailyBonus : 0;
          return {
            ...p,
            elo: Math.max(800, (p.elo || 1200) + gotBonus + eloChange),
            fidelityPoints: (p.fidelityPoints || 0) + gotBonus,
            lastFidelityDate: gotBonus > 0 ? date : p.lastFidelityDate,
            matchesPlayed: (p.matchesPlayed || 0) + 1,
            wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
            losses: !isWinner ? (p.losses || 0) + 1 : (p.losses || 0),
            dailyMatches: (p.dailyMatches || 0) + 1,
            dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
            dailyLosses: !isWinner ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
            dailyEloGain: (p.dailyEloGain || 0) + gotBonus + eloChange,
            dailyResults: [...(p.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'],
            playedLastMatch: true,
            consecutivePlayed: (p.consecutivePlayed || 0) + 1,
            consecutiveBenched: 0
          };
        }
        return { ...p, playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: (p.consecutiveBenched || 0) + 1 };
      };

      setAttendance(attendance.map(updateLocalStats));
      setPlayers(players.map(updateLocalStats));
      setMatches([...matches, match]);
      setGenerationResult(null);
      setScoreA(0);
      setScoreB(0);
      setTempScoreA('0');
      setTempScoreB('0');
      setSynergy(newSynergy);
      setNegativeSynergy(newNegativeSynergy);
      setRivalry(newRivalry);
      setViewMode('generation');
      showNotification(`Partida #${finalCount} registrada! Vitória da Equipe ${winner}`, 'success');
    } catch (error: any) {
      if (error?.message && error.message.includes('ERRO DE BLOQUEIO DE INTEGRIDADE')) {
        showNotification(error.message, 'error');
        alert(error.message);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'finish-match');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const checkAIQuota = () => {
    const quota = systemMetadata.dailyAICallsQuota || 100;
    const used = usageStats.aiCalls || 0;
    if (used >= quota) {
      showNotification(`Limite diário de IA atingido (${used}/${quota}).`, 'error');
      return false;
    }
    return true;
  };

  const handleAnalyzeMatch = async () => {
    if (!generationResult || isAnalyzing || !checkAIQuota()) return;
    try {
      setIsAnalyzing(true);
      setAnalysis('');
      const result = await analyzeMatch(generationResult, attendance);
      setAnalysis(result);
      await trackAIUsage(1);
      showNotification('Análise da partida concluída!', 'success');
    } catch (error) {
      showNotification('Falha ao gerar análise da partida.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerifyRules = async () => {
    if (!generationResult || isVerifyingRules) return;
    setIsVerifyingRules(true);
    try {
      const localCheck = verifyClubGenerationRules(generationResult);
      const localSummary =
        `✅ **Auditoria Estatutária Instantânea (Local):**\n` +
        `- **Levantadores:** ${localCheck.setter.description} (${localCheck.setter.badgeLabel})\n` +
        `- **Paridade de Gênero:** ${localCheck.gender.description} (${localCheck.gender.badgeLabel})\n` +
        `- **Blocos Top 2/4 e Bottom 2/4:** ${localCheck.topBottom.description} (${localCheck.topBottom.badgeLabel})\n`;

      setRuleVerification(localSummary);

      if (checkAIQuota()) {
        const lastMatch = [...(matches || [])]
          .filter(m => m.date === getFirestoreDateKey())
          .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
        const aiResult = await verifyRules(attendance, generationResult, "Equilibrado", lastMatch);
        if (aiResult) {
          setRuleVerification(`${localSummary}\n---\n${aiResult}`);
          await trackAIUsage(1);
        }
      }
    } catch (error) {
      showNotification("Auditoria local concluída.", "info");
    } finally {
      setIsVerifyingRules(false);
    }
  };

  const handleAutoFixInconsistencies = async () => {
    if (!generationResult) return;
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const allMatchHistory = (matches || []).map(m => ({ teamA: m.teamA, teamB: m.teamB, winner: m.winner as 'A' | 'B', timestamp: m.timestamp }));
      const fixed = autoFixAllInconsistencies(generationResult, attendance, allMatchHistory);
      setGenerationResult(fixed);
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(fixed));
      setRuleVerification('');
      showNotification('Guerreiros Intelligence: Inconsistências corrigidas!', 'success');
    } catch (e) {
      showNotification('Erro ao aplicar auto-correção.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const debugAttendanceMatching = useCallback((targetPlayer: Player | null) => {
    const sanitize = (val?: string) => (val ? val.trim().toLowerCase() : '');
    if (!targetPlayer) return null;
    const sTargetId = sanitize(targetPlayer.id);
    const sTargetEmail = sanitize(targetPlayer.email);
    const sTargetUid = sanitize(targetPlayer.uid);
    return (
      attendance.find(a => sanitize(a.id) === sTargetId) ||
      (sTargetEmail ? attendance.find(a => a.email && sanitize(a.email) === sTargetEmail) : null) ||
      (sTargetUid ? attendance.find(a => a.uid && sanitize(a.uid) === sTargetUid) : null) ||
      null
    );
  }, [attendance]);

  const alignArrivalOrders = async (dateKey: string) => {
    try {
      const snapshot = await getDocs(collection(db, 'attendance', dateKey, 'players'));
      const playersList = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Player))
        .filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || a.id.localeCompare(b.id));

      const batch = writeBatch(db);
      let updatedCount = 0;
      playersList.forEach((p, index) => {
        const correctOrder = index + 1;
        if (p.arrivalOrder !== correctOrder) {
          batch.update(doc(db, 'attendance', dateKey, 'players', p.id), { arrivalOrder: correctOrder });
          updatedCount++;
        }
      });
      if (updatedCount > 0) {
        if (commitBatchWithLog) await commitBatchWithLog(batch, 'Auto-Alinhamento da Fila', updatedCount);
        else await batch.commit();
      }
    } catch (error) {}
  };

  const registerAttendance = async (player: Player, method: 'NFC' | 'QR' | 'MANUAL' = 'MANUAL') => {
    const fullPlayer = players.find(p => p.id === player.id);
    if ((fullPlayer && fullPlayer.status !== 'active') || (player.status && player.status !== 'active') || fullPlayer?.isDM || player.isDM) {
      showNotification('Apenas sócios Ativos e fora do DM podem ser incluídos na presença.', 'error');
      return;
    }

    const previousAttendance = [...attendance];
    triggerHaptic('success');
    playFeedbackSound('success');

    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      const activeAttendance = attendance.filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm');
      const nextOrder = activeAttendance.reduce((max, p) => Math.max(max, p.arrivalOrder || 0), 0) + 1;

      const todayCompleted = getCompletedMatchesForDate(dateKey);
      const playerTodayMatches = todayCompleted.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
      const actualDailyMatches = playerTodayMatches.length;
      const actualDailyWins = playerTodayMatches.filter(m => (m.winner === 'A' && m.teamA.includes(player.id)) || (m.winner === 'B' && m.teamB.includes(player.id))).length;
      const lastMatch = todayCompleted.length > 0 ? todayCompleted[todayCompleted.length - 1] : null;
      const playedLast = lastMatch ? (lastMatch.teamA.includes(player.id) || lastMatch.teamB.includes(player.id)) : false;
      const nameToSave = fullPlayer?.name || player.name || "Sócio";

      const optimisticPlayer = cleanObject({
        ...(fullPlayer || {}),
        ...player,
        status: 'active',
        name: nameToSave,
        arrivalOrder: nextOrder,
        isPresent: true,
        checkInMethod: method,
        timestamp: Date.now(),
        dailyMatches: actualDailyMatches,
        dailyWins: actualDailyWins,
        dailyLosses: actualDailyMatches - actualDailyWins,
        dailyResults: [],
        playedLastMatch: playedLast,
        consecutivePlayed: 0,
        consecutiveBenched: 0
      }) as Player;

      setAttendance([...attendance.filter(p => p.id !== player.id), optimisticPlayer]);
      showNotification(`${nameToSave} confirmou presença!`, 'success');

      const batch = writeBatch(db);
      batch.set(doc(db, 'attendance', dateKey), { date: dateKey, lastUpdate: Date.now() }, { merge: true });
      batch.set(doc(db, 'attendance', dateKey, 'players', player.id), optimisticPlayer);

      if (commitBatchWithLog) await commitBatchWithLog(batch, 'Registro de Presença', 2);
      else await batch.commit();
      
      await trackUsage(1, 1);
      await alignArrivalOrders(dateKey);
    } catch (error) {
      setAttendance(previousAttendance);
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    } finally {
      setIsSyncing(false);
    }
  };

  const removeAttendance = async (playerId: string) => {
    const previousAttendance = [...attendance];
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      setAttendance(attendance.filter(p => p.id !== playerId));
      const batch = writeBatch(db);
      batch.delete(doc(db, 'attendance', dateKey, 'players', playerId));
      if (commitBatchWithLog) await commitBatchWithLog(batch, 'Remover Presença', 1);
      else await batch.commit();
      await trackUsage(0, 1);
      showNotification('Presença removida.', 'info');
    } catch (error) {
      setAttendance(previousAttendance);
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateDepartureTime = async (playerId: string, departureTime: string | null) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const attendanceRef = doc(db, 'attendance', getFirestoreDateKey(), 'players', playerId);
      await updateDoc(attendanceRef, departureTime === null ? { departureTime: deleteField() } : { departureTime });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'update-departure');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateArrivalTime = async (playerId: string, arrivalTime: string | null) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const attendanceRef = doc(db, 'attendance', getFirestoreDateKey(), 'players', playerId);
      await updateDoc(attendanceRef, arrivalTime === null ? { arrivalTime: deleteField() } : { arrivalTime });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'update-arrival');
    } finally {
      setIsSyncing(false);
    }
  };

  const clearAttendance = async () => {
    showConfirmModal(
      'Limpar Lista',
      'Tem certeza que deseja limpar toda a lista de presença de hoje?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const dateKey = getFirestoreDateKey();
          const batch = writeBatch(db);
          attendance.forEach(p => batch.delete(doc(db, 'attendance', dateKey, 'players', p.id)));
          if (commitBatchWithLog) await commitBatchWithLog(batch, 'Limpeza de Presença', attendance.length);
          else await batch.commit();
          showNotification('Lista de presença limpa.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'attendance-clear');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const onToggleIntention = async (player: Player) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const today = getFirestoreDateKey();
      const nextThu = getNextThursday();
      const intentionsRef = doc(db, 'metadata', 'intentions');
      const intentionsSnap = await getDoc(intentionsRef);
      const currentStoredTarget = intentionsSnap.exists() && intentionsSnap.data().targetDate ? intentionsSnap.data().targetDate : today;
      const targetDate = (currentStoredTarget && currentStoredTarget >= today) ? currentStoredTarget : nextThu;
      const isConfirmed = intentionsSnap.exists() ? (intentionsSnap.data().responses?.[player.id] === 'GOING') : false;
      const isDateRotating = currentStoredTarget && currentStoredTarget < today;

      if (isConfirmed && !isDateRotating) {
        await updateDoc(intentionsRef, {
          [`responses.${player.id}`]: deleteField(),
          [`confirmationTimestamps.${player.id}`]: deleteField(),
          lastUpdated: Date.now()
        });
        showNotification('Presença removida da lista.', 'info');
      } else {
        const now = Date.now();
        if (isDateRotating) {
          const prevAutomation = intentionsSnap.exists() ? (intentionsSnap.data().automationEnabled ?? true) : true;
          await setDoc(intentionsRef, {
            responses: { [player.id]: 'GOING' },
            confirmationTimestamps: { [player.id]: now },
            targetDate,
            remindersSent: {},
            automationEnabled: prevAutomation,
            lastUpdated: now
          });
        } else {
          await setDoc(intentionsRef, {
            responses: { [player.id]: 'GOING' },
            confirmationTimestamps: { [player.id]: now },
            targetDate,
            lastUpdated: now
          }, { merge: true });
        }
        showNotification(`Presença confirmada! Bom jogo, ${player.name.split(' ')[0]}! 🏐🔥`, 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'intention-toggle');
    } finally {
      setIsSyncing(false);
    }
  };

  const deletePlayer = async (id: string) => {
    const playerToDelete = players.find(p => p.id === id);
    showConfirmModal(
      'Excluir Sócio',
      `Tem certeza que deseja excluir ${playerToDelete?.name || 'este sócio'}?`,
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          batch.delete(doc(db, 'players', id));
          batch.update(doc(db, 'metadata', 'intentions'), {
            [`responses.${id}`]: deleteField(),
            [`confirmationTimestamps.${id}`]: deleteField()
          });
          await logAction(AuditAction.DELETE_PLAYER, id, playerToDelete?.name || 'Sócio excluído');
          if (playerToDelete?.status === 'active') {
            const waitlistPlayers = players.filter(p => p.status === 'waitlist' && p.id !== id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            if (waitlistPlayers.length > 0) {
              batch.set(doc(db, 'players', waitlistPlayers[0].id), { status: 'active' }, { merge: true });
            }
          }
          await batch.commit();
          showNotification('Sócio excluído com sucesso.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'players');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const clearAllPlayers = async () => {
    showConfirmModal(
      'Limpar Todos os Sócios',
      'CUIDADO: Isso irá excluir TODOS os sócios do banco de dados. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          players.forEach(p => batch.delete(doc(db, 'players', p.id)));
          await logAction(AuditAction.CLEAR_ALL_PLAYERS, 'ALL', 'Todos os Sócios');
          await batch.commit();
          showNotification('Todos os sócios foram excluídos.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'players-clear');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const clearAllHistory = async () => {
    showConfirmModal(
      'Apagar Todo o Histórico',
      'CUIDADO: Isso irá excluir TODAS as partidas registradas E zerar as estatísticas de todos os sócios. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const matchesSnapshot = await getDocs(collection(db, 'matches'));
          const batch = writeBatch(db);
          matchesSnapshot.forEach(m => batch.delete(doc(db, 'matches', m.id)));
          players.forEach(p => {
            if (p.id) {
              batch.set(doc(db, 'players', p.id), {
                elo: 1200, eloHistory: [], matchesPlayed: 0, wins: 0, losses: 0,
                dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [],
                playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: 0
              }, { merge: true });
            }
          });
          await batch.commit();
          setMatches([]);
          setPlayers(players.map(p => ({
            ...p, elo: 1200, eloHistory: [], matchesPlayed: 0, wins: 0, losses: 0,
            dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [],
            playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: 0
          })));
          showNotification('Histórico excluído e estatísticas zeradas.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'matches-clear');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const deleteMatch = async (matchId: string) => {
    const matchToDelete = matches.find(m => m.id === matchId);
    if (!matchToDelete) return;

    showConfirmModal(
      'Excluir Partida e Estatísticas',
      'Deseja realmente excluir esta partida? As estatísticas serão revertidas.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          batch.delete(doc(db, 'matches', matchId));
          await logAction(AuditAction.DELETE_MATCH, matchId, `Partida #${matchToDelete.dailyNumber || '?'}`);
          
          const allPlayersInMatch = [...(matchToDelete.teamA || []), ...(matchToDelete.teamB || [])];
          const matchDate = matchToDelete.date;
          const todayKey = getFirestoreDateKey();
          const isToday = matchDate === todayKey;
          
          allPlayersInMatch.forEach(pid => {
            const latestPlayer = players.find(player => player.id === pid);
            if (!latestPlayer) return;
            const isWinner = (matchToDelete.winner === 'A' && (matchToDelete.teamA || []).includes(pid)) || 
                             (matchToDelete.winner === 'B' && (matchToDelete.teamB || []).includes(pid));
            const isTeamA = (matchToDelete.teamA || []).includes(pid);
            const eloChange = isWinner ? 20 : -20;
            const updatedHistory = [...(latestPlayer.eloHistory || [])];
            let previousElo = Math.max(800, latestPlayer.elo - eloChange);
            const entryIndex = updatedHistory.findIndex(e => e.matchId === matchId);
            if (entryIndex !== -1) {
              if (entryIndex > 0) previousElo = updatedHistory[entryIndex - 1].elo;
              updatedHistory.splice(entryIndex, 1);
            } else if (updatedHistory.length > 0) {
              updatedHistory.pop();
            }
            
            const updates = {
              elo: previousElo,
              matchesPlayed: Math.max(0, (latestPlayer.matchesPlayed || 0) - 1),
              pointsFor: Math.max(0, (latestPlayer.pointsFor || 0) - (isTeamA ? matchToDelete.scoreA : matchToDelete.scoreB)),
              pointsAgainst: Math.max(0, (latestPlayer.pointsAgainst || 0) - (isTeamA ? matchToDelete.scoreB : matchToDelete.scoreA)),
              wins: isWinner ? Math.max(0, (latestPlayer.wins || 0) - 1) : (latestPlayer.wins || 0),
              losses: !isWinner ? Math.max(0, (latestPlayer.losses || 0) - 1) : (latestPlayer.losses || 0),
              dailyMatches: isToday ? Math.max(0, (latestPlayer.dailyMatches || 0) - 1) : (latestPlayer.dailyMatches || 0),
              dailyWins: isToday ? (isWinner ? Math.max(0, (latestPlayer.dailyWins || 0) - 1) : (latestPlayer.dailyWins || 0)) : (latestPlayer.dailyWins || 0),
              dailyLosses: isToday ? (!isWinner ? Math.max(0, (latestPlayer.dailyLosses || 0) - 1) : (latestPlayer.dailyLosses || 0)) : (latestPlayer.dailyLosses || 0),
              dailyEloGain: isToday ? (latestPlayer.dailyEloGain || 0) - eloChange : (latestPlayer.dailyEloGain || 0),
              eloHistory: updatedHistory,
              playedLastMatch: false
            };
            batch.set(doc(db, 'players', latestPlayer.id), updates, { merge: true });
            batch.set(doc(db, 'attendance', matchDate, 'players', latestPlayer.id), updates, { merge: true });
          });

          const remainingMatches = getCompletedMatchesForDate(matchDate).filter(m => m.id !== matchId);
          remainingMatches.forEach((rm, idx) => {
            if (rm.dailyNumber !== idx + 1) batch.update(doc(db, 'matches', rm.id), { dailyNumber: idx + 1 });
          });
          if (isToday) {
            batch.set(doc(db, 'metadata', 'system'), { dailyMatchCount: remainingMatches.length, lastResetDate: todayKey }, { merge: true });
          }
          await batch.commit();
          setMatches(matches.filter(m => m.id !== matchId));
          await refreshPlayers();
          showNotification('Partida excluída com sucesso.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const updateMatchResult = async (matchId: string, newWinner: 'A' | 'B', newScoreA: number, newScoreB: number, newTeamA?: string[], newTeamB?: string[]) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const matchToUpdate = matches.find(m => m.id === matchId);
      if (!matchToUpdate) return;

      const updatedMatch: Match = {
        ...matchToUpdate,
        winner: newWinner,
        scoreA: newScoreA,
        scoreB: newScoreB,
        ...(newTeamA ? { teamA: newTeamA } : {}),
        ...(newTeamB ? { teamB: newTeamB } : {}),
        updatedAt: new Date().toISOString()
      };

      const originalPlayers = [...(matchToUpdate.teamA || []), ...(matchToUpdate.teamB || [])];
      await validateMatchAttendance(updatedMatch.teamA, updatedMatch.teamB, updatedMatch.date || getFirestoreDateKey(), originalPlayers);

      const updatedMatchesList = matches.map(m => m.id === matchId ? updatedMatch : m);
      await setDoc(doc(db, 'matches', matchId), cleanObject(updatedMatch), { merge: true });

      const todayDateKey = getFirestoreDateKey();
      const recalculatedPlayers = recalculateAllStatsFromMatches(players, updatedMatchesList, todayDateKey);
      const batch = writeBatch(db);
      recalculatedPlayers.forEach(p => {
        const playerUpdates = {
          elo: p.elo, wins: p.wins, losses: p.losses, matchesPlayed: p.matchesPlayed,
          pointsFor: p.pointsFor, pointsAgainst: p.pointsAgainst, pointsBalance: p.pointsBalance,
          dailyMatches: p.dailyMatches, dailyWins: p.dailyWins, dailyLosses: p.dailyLosses,
          dailyEloGain: p.dailyEloGain, dailyResults: p.dailyResults, eloHistory: p.eloHistory,
          playedLastMatch: p.playedLastMatch, consecutiveBenched: p.consecutiveBenched,
        };
        batch.set(doc(db, 'players', p.id), cleanObject(playerUpdates), { merge: true });
        batch.set(doc(db, 'attendance', todayDateKey, 'players', p.id), cleanObject(playerUpdates), { merge: true });
      });
      await batch.commit();
      setMatches(updatedMatchesList);
      setPlayers(recalculatedPlayers);
      setAttendance(attendance.map(att => recalculatedPlayers.find(p => p.id === att.id) || att));
      showNotification('Partida atualizada e ranking reprocessado!', 'success');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const reprocessAllMatchesAndStats = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const fetchedMatches: Match[] = [];
      matchesSnap.forEach((d: any) => fetchedMatches.push({ ...d.data(), id: d.id } as Match));

      const recalculatedPlayers = recalculateAllStatsFromMatches(players, fetchedMatches.length > 0 ? fetchedMatches : matches, dateKey);
      const batch = writeBatch(db);
      recalculatedPlayers.forEach(p => {
        batch.set(doc(db, 'players', p.id), cleanObject(p), { merge: true });
        batch.set(doc(db, 'attendance', dateKey, 'players', p.id), cleanObject(p), { merge: true });
      });
      await batch.commit();
      setPlayers(recalculatedPlayers);
      setAttendance(attendance.map(att => recalculatedPlayers.find(p => p.id === att.id) || att));
      showNotification('Ranking reprocessado com sucesso!', 'success');
    } catch (error) {
      showNotification('Erro ao reprocessar ranking.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteMatchesByDate = async (date: string) => {
    const stdTarget = toStandardDateKey(date);
    const today = getFirestoreDateKey();
    const isToday = stdTarget === toStandardDateKey(today);
    const isMatchForTargetDate = (m: { date?: string; timestamp?: number }) => {
      const mDate = m.date ? toStandardDateKey(m.date) : '';
      const mTsDate = m.timestamp ? dateCache.format(new Date(m.timestamp)) : '';
      return mDate === stdTarget || mTsDate === stdTarget;
    };

    showConfirmModal(
      'Excluir Partidas do Dia',
      `Deseja excluir TODAS as partidas do dia ${date.split('-').reverse().join('/')}?`,
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const firestoreMatchesSnap = await getDocs(collection(db, 'matches'));
          const batch = writeBatch(db);
          firestoreMatchesSnap.forEach(docSnap => {
            if (isMatchForTargetDate(docSnap.data())) batch.delete(doc(db, 'matches', docSnap.id));
          });
          if (isToday) {
            batch.set(doc(db, 'metadata', 'system'), { dailyMatchCount: 0, matchStartTime: null, lastResetTimestamp: Date.now(), lastResetDate: today }, { merge: true });
            batch.delete(doc(db, 'metadata', 'currentMatch'));
          }
          await batch.commit();
          await auditDayPurgeIntegrity(date);
          setMatches(prev => prev.filter(m => !isMatchForTargetDate(m)));
          await recalculateAllElo();
          showNotification('Partidas do dia excluídas!', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `matches-by-date/${date}`);
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const clearMatchesOnly = async () => {
    await clearAllHistory();
  };

  const clearAllDatabase = async () => {
    await clearAllHistory();
  };

  const repairDatabase = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const batch = writeBatch(db);
      const seenPayments = new Set<string>();
      (payments || []).forEach(p => {
        const key = `${p.playerId}_${p.month}_${p.amount}`;
        if (seenPayments.has(key)) batch.delete(doc(db, 'payments', p.id));
        else seenPayments.add(key);
      });
      await batch.commit();
      showNotification('Banco verificado com sucesso!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'repair-database');
    } finally {
      setIsSyncing(false);
    }
  };

  const initializeEloHistory = async () => {
    try {
      setIsSyncing(true);
      const batch = writeBatch(db);
      players.forEach(p => {
        if (!p.eloHistory || p.eloHistory.length === 0) {
          batch.set(doc(db, 'players', p.id), { eloHistory: [{ date: getFirestoreDateKey(), elo: p.elo || 1200 }] }, { merge: true });
        }
      });
      await batch.commit();
      showNotification('Históricos de ELO inicializados!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'init-elo-history');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateQuotaSettings = async (totalQuota: number) => {
    await updateSystemMetadata({ dailyReadQuota: totalQuota });
  };

  const savePlayer = async (playerData: Partial<Player>) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const id = playerData.id || generateUUID();
      if (!playerData.id && playerData.name) {
        const normalizedName = playerData.name.trim().toLowerCase();
        if (players.some(p => p.name.trim().toLowerCase() === normalizedName)) {
          showNotification(`Já existe um sócio com o nome "${playerData.name}".`, 'error');
          return;
        }
      }

      const isNewPlayer = !playerData.id;
      let finalStatus = playerData.status || 'active';
      if (isNewPlayer) {
        const activeCount = players.filter(p => p.status === 'active' && !p.isDM).length;
        const waitlistCount = players.filter(p => p.status === 'waitlist').length;
        if (activeCount >= MAX_ACTIVE_MEMBERS) {
          if (waitlistCount >= WAITLIST_LIMIT) {
            showNotification('Limite de sócios (32) e fila (5) atingidos.', 'error');
            return;
          }
          finalStatus = 'waitlist';
        }
      }
      
      const finalData: any = {
        ...playerData,
        id,
        elo: playerData.elo || 1200,
        matchesPlayed: playerData.matchesPlayed || 0,
        wins: playerData.wins || 0,
        losses: playerData.losses || 0,
        dailyMatches: playerData.dailyMatches || 0,
        dailyWins: playerData.dailyWins || 0,
        dailyLosses: playerData.dailyLosses || 0,
        dailyEloGain: playerData.dailyEloGain || 0,
        impactLevel: playerData.impactLevel || 1,
        status: finalStatus,
        createdAt: playerData.createdAt || Date.now()
      };

      const validatedData = playerSchema.parse(finalData);
      if (validatedData.email === '') delete (validatedData as any).email;
      if (id === RODNEY_ID && validatedData.isOfficialSetter && !validatedData.setterStartDate) {
        (validatedData as any).setterStartDate = RODNEY_SETTER_START_DATE;
      }

      const batch = writeBatch(db);
      batch.set(doc(db, 'players', id), cleanObject(validatedData), { merge: true });

      const today = getFirestoreDateKey();
      const attendanceRef = doc(db, 'attendance', today, 'players', id);
      if (finalStatus !== 'active' || Boolean(validatedData.isDM)) {
        batch.delete(attendanceRef);
        batch.update(doc(db, 'metadata', 'intentions'), {
          [`responses.${id}`]: deleteField(),
          [`confirmationTimestamps.${id}`]: deleteField()
        });
      } else if (attendance.some(p => p.id === id)) {
        batch.set(attendanceRef, { isOfficialSetter: validatedData.isOfficialSetter }, { merge: true });
      }

      await batch.commit();
      showNotification(playerData.id ? 'Sócio atualizado!' : 'Sócio cadastrado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players-save');
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshPlayers = async () => {
    useStore.setState(state => ({ syncTrigger: state.syncTrigger + 1 }));
  };

  const recalculateAllElo = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dailyBonus = systemMetadata.dailyAttendanceBonus ?? 20;
      const recalculatedPlayers = recalculateAllStatsFromMatches(players, matches, getFirestoreDateKey(), dailyBonus);
      const batch = writeBatch(db);
      recalculatedPlayers.forEach(p => {
        batch.set(doc(db, 'players', p.id), cleanObject({ ...p, eloHistory: (p.eloHistory || []).slice(-200) }), { merge: true });
      });
      await batch.commit();
      showNotification('Recálculo de ELO concluído!', 'success');
      useStore.setState(state => ({ syncTrigger: state.syncTrigger + 1 }));
    } catch (error) {
      showNotification('Falha ao recalcular ELO.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const fixDatabaseAnomalies = async () => {
    try {
      setIsSyncing(true);
      const batch = writeBatch(db);
      const todayKey = getFirestoreDateKey();
      let updates = 0;

      const allSortedMatches = [...(matches || [])].sort((a, b) => a.timestamp - b.timestamp);
      const matchesByDay: Record<string, Match[]> = {};
      allSortedMatches.forEach(m => {
        const dStr = m.timestamp ? dateCache.format(new Date(m.timestamp)) : m.date;
        if (!matchesByDay[dStr]) matchesByDay[dStr] = [];
        matchesByDay[dStr].push(m);
      });

      Object.entries(matchesByDay).forEach(([dayStr, dayMatches]) => {
        dayMatches.forEach((m, idx) => {
          if (m.date !== dayStr || m.dailyNumber !== idx + 1) {
            batch.set(doc(db, 'matches', m.id), { date: dayStr, dailyNumber: idx + 1 }, { merge: true });
            updates++;
          }
        });
      });

      const todayCompletedCount = (matchesByDay[todayKey] || []).length;
      if (systemMetadata.dailyMatchCount !== todayCompletedCount) {
        batch.set(doc(db, 'metadata', 'system'), { dailyMatchCount: todayCompletedCount, lastResetDate: todayKey }, { merge: true });
        updates++;
      }
      if (updates > 0) await batch.commit();
      showNotification('Integridade verificada!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'fix-anomalies');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleScanAnomalies = async () => {
    if (!checkAIQuota()) return;
    try {
      setIsScanningAnomalies(true);
      const report = await detectAnomalies({ players, matches, metadata: systemMetadata });
      setAnomalyReport(report);
      await trackAIUsage(1);
    } catch (error) {
      showNotification('Falha na varredura.', 'error');
    } finally {
      setIsScanningAnomalies(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut(auth);
      window.localStorage.removeItem('memberUser');
      window.localStorage.removeItem('simpleLoginEmail');
      setUser(null);
      setUserRole(null);
      setCurrentPlayer(null);
      setTimeout(() => setIsLoggingOut(false), 1500);
    } catch (error) {
      setIsLoggingOut(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      const result = await signInWithPopup(auth, googleProvider);
      const trimmedEmail = (result.user.email || '').trim().toLowerCase();
      const isAdminEmail = trimmedEmail === 'rodneyes@gmail.com';
      const player = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail);
      if (!player && !isAdminEmail) {
        await signOut(auth);
        showNotification('E-mail não cadastrado como sócio.', 'error');
        return;
      }
      showNotification('Login realizado com sucesso!', 'success');
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        showNotification(`Erro no login: ${error.message}`, 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail || isSendingMagicLink) return;
    setIsSendingMagicLink(true);
    try {
      const trimmedEmail = magicLinkEmail.trim().toLowerCase();
      const player = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail);
      if (player || trimmedEmail === 'rodneyes@gmail.com') {
        window.localStorage.setItem('simpleLoginEmail', trimmedEmail);
        await signInAnonymously(auth);
        showNotification('Login realizado com sucesso!', 'success');
      } else {
        showNotification('E-mail não encontrado na lista de sócios.', 'error');
      }
    } catch (error: any) {
      showNotification(`Erro ao fazer login: ${error.message}`, 'error');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !requestName) return;
    setIsRequestingAccess(true);
    try {
      await addDoc(collection(db, 'pendingRequests'), { uid: user.uid, email: user.email, name: requestName, timestamp: Date.now(), status: 'pending' });
      setIsRequestSubmitted(true);
      showNotification('Solicitação enviada!', 'success');
    } catch (error) {
      showNotification('Erro ao enviar solicitação.', 'error');
    } finally {
      setIsRequestingAccess(false);
    }
  };

  const applyPreviewResult = async (resultToApply: any) => {
    if (!resultToApply) return;
    if (navigator.vibrate) navigator.vibrate(50);
    setIsSyncing(true);
    triggerDbStatus('writing');

    const now = Date.now();
    const todayKey = getFirestoreDateKey();
    const completedCount = getCompletedMatchesForDate(todayKey).length;
    const upcomingMatchNumber = completedCount + 1;

    try {
      const result = cloneGenerationResultImmutably(resultToApply, players, attendance);
      result.timestamp = now;
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(result));

      useStore.setState({
        generationResult: result,
        viewMode: 'generation',
        scoreA: 0,
        scoreB: 0,
        tempScoreA: '0',
        tempScoreB: '0',
        scoreMode: 'QUICK'
      });

      setAnalysis('');
      setRuleVerification('');

      generateTeamAnnouncementAudio(result.teamA, result.teamB).then(audio => {
        if (audio) setNarrationAudio(audio);
      }).catch(() => {});

      await setDoc(doc(db, 'metadata', 'system'), cleanObject({
        dailyMatchCount: completedCount,
        lastResetDate: todayKey,
        matchStartTime: now
      }), { merge: true });

      setSystemMetadata({
        ...systemMetadata,
        dailyMatchCount: completedCount,
        lastResetDate: todayKey,
        matchStartTime: now
      });

      showNotification(`Partida #${upcomingMatchNumber} em quadra!`, 'success');
    } catch (err) {
      showNotification("Erro ao aplicar escalação.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerate = async (onlyCurrentPlayers: boolean | any = false) => {
    const isReshuffle = onlyCurrentPlayers === true;
    let playersToUse = (isReshuffle && generationResult) 
      ? [
          ...(generationResult.teamA.setter ? [generationResult.teamA.setter] : []),
          ...generationResult.teamA.players,
          ...(generationResult.teamB.setter ? [generationResult.teamB.setter] : []),
          ...generationResult.teamB.players
        ]
      : attendance.filter(p => (!p.status || p.status === 'active') && !p.isDM);

    playersToUse = playersToUse.filter(p => !p.isDM).map(p => enrichPlayerImmutably(p, players, attendance));

    const todayDateKey = getFirestoreDateKey();
    const sessionMatches = getCompletedMatchesForDate(todayDateKey);

    if (!isReshuffle) {
      if (sessionMatches.length === 0) {
        playersToUse = playersToUse.map(p => ({
          ...p, playedLastMatch: false, dailyMatches: 0, consecutivePlayed: 0, consecutiveBenched: 0
        }));
      } else {
        const lastMatch = sessionMatches[sessionMatches.length - 1];
        const lastMatchParticipantIds = new Set([...(lastMatch.teamA || []), ...(lastMatch.teamB || [])]);

        playersToUse = playersToUse.map(p => {
          const playedLast = lastMatchParticipantIds.has(p.id);
          const realDailyMatches = sessionMatches.filter(m => m.teamA?.includes(p.id) || m.teamB?.includes(p.id)).length;
          let realConsecutivePlayed = 0;
          let realConsecutiveBenched = 0;

          for (let i = sessionMatches.length - 1; i >= 0; i--) {
            const m = sessionMatches[i];
            const inMatch = (m.teamA || []).includes(p.id) || (m.teamB || []).includes(p.id);
            if (playedLast) {
              if (inMatch) realConsecutivePlayed++;
              else break;
            } else {
              const arrivedBeforeMatch = !p.timestamp || p.timestamp <= (m.endTime || m.timestamp || Infinity);
              if (!inMatch && arrivedBeforeMatch) realConsecutiveBenched++;
              else break;
            }
          }

          return {
            ...p,
            playedLastMatch: playedLast,
            dailyMatches: realDailyMatches,
            consecutivePlayed: realConsecutivePlayed,
            consecutiveBenched: realConsecutiveBenched
          };
        });
      }
    }

    if (playersToUse.length < 12) {
      showNotification("São necessários no mínimo 12 sócios presentes.", "info");
      return;
    }

    const { topPlayers: matchPool } = getPriorityQueue(playersToUse, 12, 2);
    const numOfficialSetters = matchPool.filter(p => p.isOfficialSetter).length;
    const numLinePlayers = matchPool.filter(p => !p.isOfficialSetter).length;

    const hasCond1 = numOfficialSetters >= 2 && (numOfficialSetters + numLinePlayers === 12);
    const hasCond2 = numOfficialSetters === 0 && numLinePlayers === 12;
    const hasCond3 = numOfficialSetters === 1 && numLinePlayers === 11;

    if (!hasCond1 && !hasCond2 && !hasCond3) {
      showNotification(`Composição inválida: ${numOfficialSetters} levantadores e ${numLinePlayers} linha.`, "error");
      return;
    }

    const startGenerationFlow = (forceNoTemporarySetters: boolean) => {
      const performGeneration = async () => {
        if (navigator.vibrate) navigator.vibrate(50);
        setIsSyncing(true);
        triggerDbStatus('writing');

        const now = Date.now();
        const completedCount = sessionMatches.length;
        const upcomingMatchNumber = completedCount + 1;

        try {
          const previousFormations = sessionMatches.map(m => ({
            setterA: Array.isArray(m.teamA) ? m.teamA[0] : undefined,
            playersA: Array.isArray(m.teamA) ? m.teamA.slice(1) : [],
            setterB: Array.isArray(m.teamB) ? m.teamB[0] : undefined,
            playersB: Array.isArray(m.teamB) ? m.teamB.slice(1) : []
          }));

          const allMatchHistory = (matches || []).map(m => ({
            teamA: m.teamA, teamB: m.teamB, winner: m.winner as 'A' | 'B', timestamp: m.timestamp
          }));

          const useTrueSkill = teamGenerationMode === 'TRUESKILL';
          let genRes = generateTeams(playersToUse, previousFormations, useTrueSkill, forceNoTemporarySetters, allMatchHistory, balancingStrategy, balancingRatingMode);
          genRes = optimizeTeamSynergyIteratively(genRes, allMatchHistory, useTrueSkill, balancingStrategy, balancingRatingMode, previousFormations);
          
          const result = cloneGenerationResultImmutably(genRes, players, attendance);
          result.timestamp = now;
          
          await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(result));
          setGenerationResult(result);
          setAnalysis('');
          setRuleVerification('');
          setViewMode('generation');
          setScoreA(0);
          setScoreB(0);
          setTempScoreA('0');
          setTempScoreB('0');
          setScoreMode('QUICK');

          generateTeamAnnouncementAudio(result.teamA, result.teamB).then(audio => {
            if (audio) setNarrationAudio(audio);
          }).catch(() => {});

          if (!isReshuffle) {
            await setDoc(doc(db, 'metadata', 'system'), cleanObject({
              dailyMatchCount: completedCount,
              lastResetDate: todayDateKey,
              matchStartTime: now
            }), { merge: true });

            setSystemMetadata({
              ...systemMetadata,
              dailyMatchCount: completedCount,
              lastResetDate: todayDateKey,
              matchStartTime: now
            });
          }
          showNotification(isReshuffle ? "Jogadores reorganizados!" : `Partida #${upcomingMatchNumber} escalada!`, "success");
        } catch (err) {
          showNotification("Erro ao processar escalação.", "error");
        } finally {
          setIsSyncing(false);
        }
      };

      if (generationResult) {
        showConfirmModal(
          isReshuffle ? 'Reorganizar Equipes' : 'Nova Escalação',
          isReshuffle ? 'Deseja reorganizar estes 12 atletas?' : 'Deseja substituir a escalação atual?',
          () => {
            performGeneration();
            hideConfirmModal();
          }
        );
      } else {
        performGeneration();
      }
    };

    if (hasCond2 || hasCond3) {
      useStore.getState().showSetterStrategyModal(
        "Configuração de Levantadores",
        hasCond2 ? "Sem levantadores oficiais nos 12." : "Apenas 1 levantador oficial nos 12.",
        (strategy) => startGenerationFlow(strategy === 'EVERYONE_SETS'),
        () => {}
      );
    } else {
      startGenerationFlow(false);
    }
  };

  const handleDiscard = () => {
    if (!useStore.getState().generationResult) return;
    showConfirmModal(
      'Descartar Partida',
      'Tem certeza que deseja descartar esta partida?',
      () => {
        setIsSyncing(false);
        setGenerationResult(null);
        setScoreA(0);
        setScoreB(0);
        setTempScoreA('0');
        setTempScoreB('0');
        setNarrationScript('');
        setNarrationAudio(null);
        
        const todayKey = getFirestoreDateKey();
        const completedCount = getCompletedMatchesForDate(todayKey).length;
        const batch = writeBatch(db);
        batch.set(doc(db, 'metadata', 'system'), { matchStartTime: null, dailyMatchCount: completedCount, lastResetDate: todayKey }, { merge: true });
        batch.delete(doc(db, 'metadata', 'currentMatch'));
        useStore.setState({ generationResult: null });
        batch.commit().catch(() => {});
        setSystemMetadata({ ...systemMetadata, matchStartTime: null, dailyMatchCount: completedCount, lastResetDate: todayKey });
        hideConfirmModal();
      }
    );
  };

  const onApproveRequest = async (req: any) => {
    try {
      setIsSyncing(true);
      const batch = writeBatch(db);
      const playerRef = doc(collection(db, 'players'));
      batch.set(playerRef, {
        id: playerRef.id, name: req.name, email: req.email, uid: req.uid, role: 'MEMBER',
        elo: 1200, matchesPlayed: 0, wins: 0, losses: 0, gender: 'MALE', status: 'active', createdAt: Date.now()
      });
      batch.delete(doc(db, 'pendingRequests', req.id));
      await batch.commit();
      showNotification(`Acesso aprovado para ${req.name}!`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'approve-request');
    } finally {
      setIsSyncing(false);
    }
  };

  const onRejectRequest = async (reqId: string) => {
    try {
      setIsSyncing(true);
      await deleteDoc(doc(db, 'pendingRequests', reqId));
      showNotification('Solicitação removida.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reject-request');
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerSync = async () => {
    showNotification('Sincronizando com o servidor...', 'info');
    window.location.href = window.location.origin + window.location.pathname + '?refresh=' + Date.now();
  };

  const recalculateDailyStats = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const today = getFirestoreDateKey();
      const batch = writeBatch(db);
      
      const resetPlayers = players.map(p => ({
        ...p, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [],
        playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: 0
      }));

      const todayMatches = getCompletedMatchesForDate(today);
      todayMatches.forEach((m, index) => {
        if (m.dailyNumber !== index + 1) batch.update(doc(db, 'matches', m.id), { dailyNumber: index + 1, date: today });
        const winners = m.winner === 'A' ? m.teamA : m.teamB;
        const losers = m.winner === 'A' ? m.teamB : m.teamA;
        
        winners.forEach(pid => {
          const p = resetPlayers.find(rp => rp.id === pid);
          if (p) {
            p.dailyMatches++; p.dailyWins++; p.dailyEloGain += 20;
            p.dailyResults = [...p.dailyResults, 'V' as const];
            p.playedLastMatch = true; p.consecutivePlayed++; p.consecutiveBenched = 0;
          }
        });
        losers.forEach(pid => {
          const p = resetPlayers.find(rp => rp.id === pid);
          if (p) {
            p.dailyMatches++; p.dailyLosses++; p.dailyEloGain -= 20;
            p.dailyResults = [...p.dailyResults, 'D' as const];
            p.playedLastMatch = true; p.consecutivePlayed++; p.consecutiveBenched = 0;
          }
        });
        const allInMatch = [...winners, ...losers];
        attendance.forEach(att => {
          if (!allInMatch.includes(att.id)) {
            const p = resetPlayers.find(rp => rp.id === att.id);
            if (p) { p.playedLastMatch = false; p.consecutivePlayed = 0; p.consecutiveBenched++; }
          }
        });
      });

      resetPlayers.forEach(p => {
        batch.set(doc(db, 'players', p.id), {
          dailyMatches: p.dailyMatches, dailyWins: p.dailyWins, dailyLosses: p.dailyLosses,
          dailyEloGain: p.dailyEloGain, dailyResults: p.dailyResults, playedLastMatch: p.playedLastMatch,
          consecutivePlayed: p.consecutivePlayed, consecutiveBenched: p.consecutiveBenched
        }, { merge: true });
      });

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      batch.set(doc(db, 'metadata', 'system'), {
        lastResetTimestamp: startOfDay.getTime(),
        dailyMatchCount: todayMatches.length,
        lastResetDate: today 
      }, { merge: true });

      await batch.commit();
      setPlayers(resetPlayers);
      setSystemMetadata({ ...systemMetadata, lastResetTimestamp: startOfDay.getTime(), dailyMatchCount: todayMatches.length, lastResetDate: today });
      showNotification(`Estatísticas sincronizadas (${todayMatches.length} partidas hoje)!`, 'success');
    } catch (error) {
      showNotification('Erro ao recuperar estatísticas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const recalculateStats = async () => {
    await repairDatabase();
  };

  const createDataSnapshot = async (label: string = 'Manual') => {
    try {
      setIsSyncing(true);
      const snapshotId = generateUUID();
      const snapshot = {
        id: snapshotId, timestamp: Date.now(), date: getFirestoreDateKey(), label,
        players: players.map(p => cleanObject(p)), matches: matches.map(m => cleanObject(m)), metadata: systemMetadata
      };
      await setDoc(doc(db, 'snapshots', snapshotId), cleanObject(snapshot));
      showNotification(`Snapshot "${label}" criado!`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'snapshots');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRecoverFinancials = async () => {
    try {
      setIsSyncing(true);
      const [paymentsSnap, expensesSnap] = await Promise.all([
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'expenses'))
      ]);
      const paymentsList: Payment[] = [];
      paymentsSnap.forEach((d) => paymentsList.push({ ...d.data(), id: d.id } as Payment));
      setPayments(paymentsList);

      const expensesList: Expense[] = [];
      expensesSnap.forEach((d) => expensesList.push({ ...d.data(), id: d.id } as any));
      setExpenses(expensesList);

      showNotification('Registros financeiros sincronizados!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'financial-recovery');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFinancialIntegrityAudit = async () => {
    await handleRecoverFinancials();
  };

  const handleFinishDay = async () => {
    showConfirmModal(
      'Finalizar Dia de Jogos',
      'Deseja finalizar o dia e zerar as estatísticas diárias?',
      async () => {
        try {
          setIsSyncing(true);
          const today = getFirestoreDateKey();
          await createDataSnapshot(`Auto-Reset-${today}`);
          const batch = writeBatch(db);
          players.forEach(p => {
            if (!p.id) return;
            batch.set(doc(db, 'players', p.id), {
              dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0, dailyResults: [],
              playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: 0
            }, { merge: true });
          });
          const now = Date.now();
          batch.set(doc(db, 'metadata', 'system'), { dailyMatchCount: 0, matchStartTime: null, lastResetTimestamp: now, lastResetDate: today }, { merge: true });
          await batch.commit();
          setGenerationResult(null);
          showNotification('Dia finalizado com sucesso!', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-daily-reset');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const deletePayment = async (id: string) => {
    showConfirmModal('Excluir Lançamento', 'Confirmar exclusão?', async () => {
      try {
        setIsSyncing(true);
        await deleteDoc(doc(db, 'payments', id));
        showNotification('Pagamento excluído.', 'success');
      } finally {
        setIsSyncing(false);
        hideConfirmModal();
      }
    });
  };

  const savePayment = async (paymentData: any, id?: string) => {
    try {
      setIsSyncing(true);
      const paymentId = id || generateUUID();
      const timestamp = Date.now();
      const player = paymentData.playerId ? players.find(p => p.id === paymentData.playerId) : null;
      await setDoc(doc(db, 'payments', paymentId), cleanObject({ ...paymentData, id: paymentId, playerUid: player?.uid || null, updatedAt: timestamp }), { merge: true });
      showNotification('Pagamento salvo!', 'success');
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const saveExpense = async (expenseData: any, id?: string) => {
    try {
      setIsSyncing(true);
      const expenseId = id || generateUUID();
      await setDoc(doc(db, 'expenses', expenseId), cleanObject({ ...expenseData, id: expenseId, updatedAt: Date.now() }), { merge: true });
      showNotification('Despesa salva!', 'success');
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteExpense = async (id: string) => {
    showConfirmModal('Excluir Despesa', 'Confirmar exclusão?', async () => {
      try {
        setIsSyncing(true);
        await deleteDoc(doc(db, 'expenses', id));
        showNotification('Despesa excluída.', 'success');
      } finally {
        setIsSyncing(false);
        hideConfirmModal();
      }
    });
  };

  const updateMonthlyFee = async (fee: number) => {
    await updateSystemMetadata({ monthlyFee: fee });
    showNotification('Mensalidade atualizada!', 'success');
  };

  const startTournament = async (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number; strategy: TournamentStrategy; preGeneratedTeams?: TournamentTeam[]; preGeneratedReserves?: string[] }) => {
    try {
      setIsSyncing(true);
      const generated = generateTournamentTeams([...attendance], config.numTeams);
      const teams = config.preGeneratedTeams || generated.teams;
      const reserves = config.preGeneratedReserves || generated.reserves;
      const tournament: Tournament = {
        id: generateUUID(),
        name: `Torneio Guerreiros`,
        date: getFirestoreDateKey(),
        status: 'active',
        teams,
        matches: [],
        strategy: config.strategy || TournamentStrategy.ROUND_ROBIN,
        reserves,
        config
      };
      await setDoc(doc(db, 'tournaments', tournament.id), cleanObject(tournament));
      await setDoc(doc(db, 'metadata', 'activeTournament'), cleanObject(tournament));
      setViewMode('tournament');
    } finally {
      setIsSyncing(false);
    }
  };

  const recordTournamentMatch = async (matchId: string, setScores: SetScore[]) => {
    if (!activeTournament) return;
    try {
      setIsSyncing(true);
      const updatedMatches = activeTournament.matches.map(m => {
        if (m.id !== matchId) return m;
        let scoreA = 0, scoreB = 0, setsA = 0, setsB = 0;
        setScores.forEach(s => { scoreA += s.scoreA; scoreB += s.scoreB; if (s.scoreA > s.scoreB) setsA++; else if (s.scoreB > s.scoreA) setsB++; });
        return { ...m, scoreA, scoreB, setsA, setsB, setScores, status: 'completed' as const, winnerId: setsA > setsB ? m.teamAId : m.teamBId };
      });
      const updated = cleanObject({ ...activeTournament, matches: updatedMatches });
      await setDoc(doc(db, 'tournaments', activeTournament.id), updated);
      await setDoc(doc(db, 'metadata', 'activeTournament'), updated);
    } finally {
      setIsSyncing(false);
    }
  };

  const endTournament = async () => {
    if (!activeTournament) return;
    await setDoc(doc(db, 'tournaments', activeTournament.id), cleanObject({ ...activeTournament, status: 'completed' as const }));
    await deleteDoc(doc(db, 'metadata', 'activeTournament'));
    setViewMode('history');
  };

  const addTournamentPlayer = async (teamId: string, playerId: string) => {
    if (!activeTournament) return;
    const updatedTeams = activeTournament.teams.map(t => t.id === teamId ? { ...t, players: [...t.players, playerId] } : t);
    const updated = cleanObject({ ...activeTournament, teams: updatedTeams });
    await setDoc(doc(db, 'tournaments', activeTournament.id), updated);
    await setDoc(doc(db, 'metadata', 'activeTournament'), updated);
  };

  const substituteTournamentPlayer = async (teamId: string, oldPlayerId: string, newPlayerId: string) => {
    if (!activeTournament) return;
    const updatedTeams = activeTournament.teams.map(t => t.id === teamId ? { ...t, players: t.players.map(pid => pid === oldPlayerId ? newPlayerId : pid) } : t);
    const updated = cleanObject({ ...activeTournament, teams: updatedTeams });
    await setDoc(doc(db, 'tournaments', activeTournament.id), updated);
    await setDoc(doc(db, 'metadata', 'activeTournament'), updated);
  };

  const resetTournamentMatch = async (matchId: string) => {
    if (!activeTournament) return;
    const updatedMatches = activeTournament.matches.map(m => m.id === matchId ? { ...m, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0, status: 'pending' as const, winnerId: undefined } : m);
    const updated = cleanObject({ ...activeTournament, matches: updatedMatches });
    await setDoc(doc(db, 'tournaments', activeTournament.id), updated);
    await setDoc(doc(db, 'metadata', 'activeTournament'), updated);
  };

  const deleteTournament = async (tournamentId: string) => {
    if (activeTournament?.id === tournamentId) {
      await deleteDoc(doc(db, 'metadata', 'activeTournament'));
      setActiveTournament(null);
    }
    await deleteDoc(doc(db, 'tournaments', tournamentId));
  };

  const recreateOctober15Matches = async () => {
    showNotification('Função histórica desativada por segurança estatutária.', 'info');
  };

  return {
    magicLinkEmail,
    setMagicLinkEmail,
    isSendingMagicLink,
    isLoggingIn,
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    showSetterPromptModal,
    setShowSetterPromptModal,
    setterPromptData,
    setSetterPromptData,
    teamGenerationMode,
    setTeamGenerationMode,
    balancingRatingMode,
    setBalancingRatingMode,
    isVerifyingRules,
    isAnalyzing,
    isScanningAnomalies,
    anomalyReport,
    createDataSnapshot,
    fixDatabaseAnomalies,
    recalculateAllElo,
    handleScanAnomalies,
    handleLogout,
    handleGoogleLogin,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    applyPreviewResult,
    handleDiscard,
    handleFinishDay,
    resetElo,
    handleFinishMatch,
    handleAnalyzeMatch,
    handleVerifyRules,
    handleAutoFixInconsistencies,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateStats,
    recalculateDailyStats,
    updateSystemMetadata,
    debugAttendanceMatching,
    registerAttendance,
    removeAttendance,
    updateDepartureTime,
    updateArrivalTime,
    clearAttendance,
    onToggleIntention,
    deletePlayer,
    clearAllPlayers,
    repairDatabase,
    initializeEloHistory,
    updateQuotaSettings,
    savePlayer,
    clearAllHistory,
    clearMatchesOnly,
    deleteMatch,
    updateMatchResult,
    reprocessAllMatchesAndStats,
    deleteMatchesByDate,
    clearAllDatabase,
    refreshPlayers,
    deletePayment,
    savePayment,
    saveExpense,
    deleteExpense,
    updateMonthlyFee,
    startTournament,
    recordTournamentMatch,
    endTournament,
    addTournamentPlayer,
    substituteTournamentPlayer,
    resetTournamentMatch,
    deleteTournament,
    exportPlayersCSV,
    exportMatchesCSV,
    exportPaymentsCSV,
    handleRecoverFinancials,
    handleFinancialIntegrityAudit,
    recreateOctober15Matches
  };
};