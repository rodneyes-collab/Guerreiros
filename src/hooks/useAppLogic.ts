
import React, { useState, useCallback, useEffect } from 'react';
import { 
  auth, 
  signInWithPopup, 
  signInWithRedirect,
  googleProvider, 
  signOut, 
  sendSignInLinkToEmail, 
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
  serverTimestamp,  isQuotaExceeded,
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
import { Player, Team, Match, Gender, Tournament, TournamentTeam, TournamentMatch, SetScore, SystemMetadata, TournamentStrategy, Payment, Expense } from '../../types';
import { generateTeams, generateTournamentTeams, getPriorityQueue, autoFixAllInconsistencies, optimizeTeamSynergyIteratively, enrichPlayerImmutably, cloneGenerationResultImmutably, calculateCompositePerformanceRating } from '../../utils/teamLogic';
import { playerSchema, matchSchema } from '../lib/schemas';

import { analyzeMatch, verifyRules, detectAnomalies, generateTeamAnnouncementAudio } from '../../services/geminiService';
import { logAction, AuditAction } from '../../services/auditService';
import { playFeedbackSound, triggerHaptic } from '../utils/feedback';

// Module-level safeguards to prevent multiple simultaneous runners of critical hooks
let activeBirthdaysSyncId: string | null = null;
let activeGuardianId: string | null = null;

export const useAppLogic = (commitBatchWithLog?: (batch: any, label: string, size: number) => Promise<void>) => {
  const [instanceId] = useState(() => generateUUID());
  const MAX_ACTIVE_MEMBERS = 32;
  const WAITLIST_LIMIT = 5;

  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const currentPlayer = useStore(state => state.currentPlayer);
  const preConfirmations = useStore(state => state.preConfirmations);
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
  const setUsageStats = useStore(state => state.setUsageStats);
  const usageStats = useStore(state => state.usageStats);
  const synergy = useStore(state => state.synergy);
  const negativeSynergy = useStore(state => state.negativeSynergy);
  const rivalry = useStore(state => state.rivalry);
  const payments = useStore(state => state.payments);
  const expenses = useStore(state => state.expenses);
  const activeTournament = useStore(state => state.activeTournament);
  const setTournaments = useStore(state => state.setTournaments);
  const setActiveTournament = useStore(state => state.setActiveTournament);
  const setSynergy = useStore(state => state.setSynergy);
  const setNegativeSynergy = useStore(state => state.setNegativeSynergy);
  const setRivalry = useStore(state => state.setRivalry);
  const setPayments = useStore(state => state.setPayments);
  const setExpenses = useStore(state => state.setExpenses);

  // --- Backup & Export Logic ---
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
    const rows = players.map(p => [
      p.id,
      p.name,
      p.email || '',
      p.status || 'active',
      p.elo,
      p.wins,
      p.losses,
      p.matchesPlayed,
      p.gender,
      p.isOfficialSetter ? 'Sim' : 'Não'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    downloadCSV(csvContent, `guerreiros_socios_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Lista de sócios exportada com sucesso!', 'success');
  };

  const exportMatchesCSV = () => {
    const headers = ['ID', 'Data', 'Time A', 'Time B', 'Vencedor', 'Placar A', 'Placar B', 'Duração (s)'];
    const rows = matches.map(m => [
      m.id,
      m.date,
      m.teamA.join(';'),
      m.teamB.join(';'),
      m.winner,
      m.scoreA,
      m.scoreB,
      m.duration
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    downloadCSV(csvContent, `guerreiros_partidas_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Histórico de partidas exportado com sucesso!', 'success');
  };

  const exportPaymentsCSV = () => {
    const headers = ['ID', 'Sócio ID', 'Mês', 'Valor', 'Status', 'Vencimento', 'Data Pagamento', 'Método'];
    const rows = payments.map(p => [
      p.id,
      p.playerId,
      p.month,
      p.amount,
      p.status,
      p.dueDate || '',
      p.paymentDate || '',
      p.method || ''
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    downloadCSV(csvContent, `guerreiros_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Relatório financeiro exportado com sucesso!', 'success');
  };

  // --- Birthdays Index Sync ---
  // Mantem o indexer de aniversários atualizado para que os crons do backend leiam um único field
  useEffect(() => {
    // Only admins should maintain the system-wide birthday index
    if (userRole !== 'ADMIN' || !players || players.length === 0) return;

    // Register this instance as the active runner if none is registered
    if (activeBirthdaysSyncId === null) {
      activeBirthdaysSyncId = instanceId;
    }
    
    // Only run if this is the active runner
    if (activeBirthdaysSyncId !== instanceId) return;

    const indices = new Set<string>();
    for (const p of players) {
      if (p.status === 'active' && p.birthDate) {
        const parts = p.birthDate.split('-');
        if (parts.length >= 3) {
           indices.add(`${parts[1]}-${parts[2]}`);
        }
      }
    }
    const newIndex = Array.from(indices).sort();
    const currentMetadata = useStore.getState().systemMetadata;
    const currentIndex = currentMetadata?.activeBirthdaysIndex;
    
    const isCurrentValidArray = Array.isArray(currentIndex);
    const isDifferent = !isCurrentValidArray || newIndex.length !== currentIndex.length || !newIndex.every((v, i) => v === currentIndex[i]);
    
    if (isDifferent) {
       updateSystemMetadata({ activeBirthdaysIndex: newIndex }).catch(() => {});
    }

    return () => {
      if (activeBirthdaysSyncId === instanceId) {
        activeBirthdaysSyncId = null;
      }
    };
  }, [players, userRole, instanceId]);

  // AI Guardian - Autonomous Data Integrity Monitor
  const [isGuardianLocked, setIsGuardianLocked] = useState(true);

  // Stability lock: Prevent autonomous writes during the first 30s of app life
  // This avoids race conditions and accidental resets during sync/updates.
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsGuardianLocked(false);
      console.log('[AI Guardian] Estabilização concluída. Monitoramento autônomo ativado.');
    }, 30000); // 30s lock
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only allow one Admin client to run the Guardian to prevent race conditions
    // 1. Must be ADMIN
    // 2. Must NOT be currently syncing (prevent race conditions)
    // 3. Must have players and matches loaded
    // 4. Must pass the 30-second stability lock (prevent triggers during app reloads/updates)
    if (userRole !== 'ADMIN' || isSyncing || players.length === 0 || matches.length === 0 || isGuardianLocked) return;

    // Register this instance as the active runner if none is registered
    if (activeGuardianId === null) {
      activeGuardianId = instanceId;
    }
    
    // Only run if this is the active runner
    if (activeGuardianId !== instanceId) return;

    const runGuardian = async () => {
      try {
        // Ensure user is authenticated and is an admin before attempting writes
        
        if (!auth.currentUser || userRole !== 'ADMIN' || isQuotaExceeded) return;

        const now = Date.now();
        const sixteenHoursAgo = now - (16 * 60 * 60 * 1000);
        let currentThreshold = Math.max(systemMetadata.lastResetTimestamp || 0, sixteenHoursAgo);

        if (currentThreshold > now) currentThreshold = sixteenHoursAgo;

        const sessionMatches = matches.filter(m => m.timestamp > currentThreshold);
        
        // CRITICAL PROTECTION: If there are matches in metadata but sessionMatches is empty,
        // it means matches are still loading. SKIP TO PREVENT ZEROING OUT STATS.
        if (systemMetadata.dailyMatchCount > 0 && sessionMatches.length === 0) {
          console.warn('[AI Guardian] Partidas da sessão ainda não carregadas. Abortando verificação para evitar perda de dados.');
          return;
        }

        let hasAnomalies = false;
        
        // 1. Check if session matches are correctly sequenced AND have correct Brazil Date
        const sortedByTime = [...sessionMatches].sort((a, b) => a.timestamp - b.timestamp);
        
        const getCorrectDate = (ts: number) => {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(new Date(ts));
        };

        const sessionBaseDate = sortedByTime.length > 0 ? getCorrectDate(sortedByTime[0].timestamp) : getCorrectDate(now);

        sortedByTime.forEach((m, index) => {
          if (m.dailyNumber !== index + 1) {
            hasAnomalies = true;
          }
          if (m.date !== sessionBaseDate) {
            hasAnomalies = true;
          }
        });

        // 2. Check match counter integrity
        const maxDailyNumber = sessionMatches.length;
        const expectedCount = maxDailyNumber + (generationResult ? 1 : 0);
        if (systemMetadata.dailyMatchCount !== expectedCount) {
          hasAnomalies = true;
        }

        // 3. Trigger autonomous fix if required
        // Check if ANY player has malformed ISO strings in their ELO history or dates mismatched in current session
        const playersToFix = players.filter(p => p.eloHistory?.some((h: any) => h.date.includes('T') || (h.date === '2026-04-17' && sessionBaseDate === '2026-04-16')));
        if (playersToFix.length > 0) hasAnomalies = true;

        if (hasAnomalies) {
          console.info(`[AI Guardian] Anomalia detectada (Partidas: ${sessionMatches.length}, Meta: ${systemMetadata.dailyMatchCount}). Iniciando reparo autônomo...`);
          const batch = writeBatch(db);
          let updates = 0;

          // FIX PLAYER ELO HISTORY
          playersToFix.forEach(p => {
            if (!p.eloHistory) return;
            const fixedHistory = p.eloHistory.map((h: any) => {
              if (h.date.includes('T')) {
                const ts = new Date(h.date).getTime();
                const d = ts > currentThreshold ? sessionBaseDate : getCorrectDate(ts);
                return { ...h, date: d };
              }
              // Force yesterday's matches that slipped to today back to yesterday if it's the same session
              if (h.date !== sessionBaseDate && sortedByTime.length > 0 && h.date === getCorrectDate(sortedByTime[sortedByTime.length - 1].timestamp) && sessionBaseDate !== getCorrectDate(sortedByTime[sortedByTime.length - 1].timestamp)) {
                 return { ...h, date: sessionBaseDate };
              }
              // specifically fix the 17th bug
              if (h.date === '2026-04-17' && sessionBaseDate === '2026-04-16') {
                 return { ...h, date: sessionBaseDate };
              }
              return h;
            });

            // Prevent multiple entries for the same day after flattening times
            const deduplicatedDocs = new Map();
            fixedHistory.forEach(h => deduplicatedDocs.set(h.date, h.elo)); // Keeps the LAST ELO of that day
            const finalHistory = Array.from(deduplicatedDocs.entries()).map(([date, elo]) => ({ date, elo }));

            batch.update(doc(db, 'players', p.id), { eloHistory: finalHistory });
            updates++;
          });

          // SEQUENCIAL FIX BY SESSION (Ignores midnight UTC date split)
          sortedByTime.forEach((m, index) => {
            const expectedNumber = index + 1;
            const matchUpdates: any = {};
            if (m.dailyNumber !== expectedNumber) {
              matchUpdates.dailyNumber = expectedNumber;
            }
            // Force the match date to be the base date of the session so they are unified
            if (m.date !== sessionBaseDate) {
              matchUpdates.date = sessionBaseDate;
            }
            
            if (Object.keys(matchUpdates).length > 0) {
              batch.update(doc(db, 'matches', m.id), matchUpdates);
              updates++;
            }
          });

          if (systemMetadata.dailyMatchCount !== expectedCount) {
            batch.set(doc(db, 'metadata', 'system'), {
              dailyMatchCount: expectedCount
            }, { merge: true });
            updates++;
          }

          if (updates > 0) {
            
            // Recalcular as métricas diárias dos jogadores para garantir consistência total com as partidas de hoje
            const resetPlayers = players.map(p => ({
              ...p,
              dailyMatches: 0,
              dailyWins: 0,
              dailyLosses: 0,
              dailyEloGain: 0,
              dailyResults: [],
              playedLastMatch: false,
              consecutiveBenched: 0
            }));

            // Organizar histórico e recalcular logicamente vitórias e derrotas
            const sortedMatches = [...sessionMatches].sort((a, b) => a.timestamp - b.timestamp);
            
            sortedMatches.forEach(m => {
              const winners = m.winner === 'A' ? m.teamA : (m.winner === 'B' ? m.teamB : []);
              const losers = m.winner === 'A' ? m.teamB : (m.winner === 'B' ? m.teamA : []);
              
              if (winners.length === 0) return; // Ignore tied or unfinished matches if any
              
              winners.forEach(pid => {
                const p = resetPlayers.find(rp => rp.id === pid);
                if (p) {
                  p.dailyMatches++;
                  p.dailyWins++;
                  p.dailyEloGain = (p.dailyEloGain || 0) + 20; // Base estimate for Guardian
                  p.dailyResults = [...(p.dailyResults || []), 'V' as const];
                  p.playedLastMatch = true;
                  p.consecutiveBenched = 0;
                }
              });
              
              losers.forEach(pid => {
                const p = resetPlayers.find(rp => rp.id === pid);
                if (p) {
                  p.dailyMatches++;
                  p.dailyLosses++;
                  p.dailyEloGain = (p.dailyEloGain || 0) - 20; // Base estimate for Guardian
                  p.dailyResults = [...(p.dailyResults || []), 'D' as const];
                  p.playedLastMatch = true;
                  p.consecutiveBenched = 0;
                }
              });

              // Benched consecutive calculation
              const allPlayersInMatch = [...winners, ...losers];
              attendance.forEach(attPlayer => {
                if (!allPlayersInMatch.includes(attPlayer.id)) {
                  const p = resetPlayers.find(rp => rp.id === attPlayer.id);
                  if (p) {
                    p.playedLastMatch = false;
                    p.consecutiveBenched = (p.consecutiveBenched || 0) + 1;
                  }
                }
              });
            });

            // Write corrected player stats to batch
            resetPlayers.forEach(p => {
              const original = players.find(op => op.id === p.id);
              if (original && (p.dailyMatches !== original.dailyMatches || p.dailyWins !== original.dailyWins || p.dailyLosses !== original.dailyLosses)) {
                batch.set(doc(db, 'players', p.id), {
                  dailyMatches: p.dailyMatches,
                  dailyWins: p.dailyWins,
                  dailyLosses: p.dailyLosses,
                  dailyEloGain: p.dailyEloGain,
                  dailyResults: p.dailyResults,
                  playedLastMatch: p.playedLastMatch,
                  consecutiveBenched: p.consecutiveBenched
                }, { merge: true });
              }
            });

            await batch.commit().catch(err => {
              console.warn('[AI Guardian] Failed to commit autonomous fixes:', err);
            });
            
            // showNotification(`🤖 Guardião IA: Reparadas e ordenadas cronologicamente numerações de jogo e rankings corrigidos automaticamente!`, 'info');
          }
        }
      } catch (err) {
        // console.error('[Guardião IA] Falha no monitoramento autônomo:', err);
      }
    };

    // Run automatically whenever matches or generationResult finishes
    // React's dependency array ensures this runs exactly when needed (end of match/discard)
    // We add a slight delay to allow Firebase local cache to settle before guardian reads it
    const timeout = setTimeout(() => {
      runGuardian();
    }, 2000);

    return () => {
      clearTimeout(timeout);
      if (activeGuardianId === instanceId) {
        activeGuardianId = null;
      }
    };
  }, [userRole, matches.length, generationResult ? 'active' : 'inactive', systemMetadata.lastResetTimestamp, instanceId]);

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
              batch.set(doc(db, 'players', p.id), { 
                elo: 1200,
                eloHistory: [],
                dailyResults: [],
                dailyEloGain: 0
              }, { merge: true });
            }
          });
          
          await batch.commit();
          await trackUsage(0, players.length);
          setPlayers(players.map(p => ({ 
            ...p, 
            elo: 1200,
            eloHistory: [],
            dailyResults: [],
            dailyEloGain: 0
          })));
          showNotification('ELO e histórico de evolução de todos os sócios resetados.', 'success');
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

    const allIds = [...teamAIds, ...teamBIds];
    const absentIds = allIds.filter(id => {
      const isPresent = presentIds.has(id.toLowerCase());
      if (isPresent) return false;
      
      // Se não está na presença, mas já estava na partida original, permitimos (confiança retroativa para históricos)
      if (originalMatchPlayers && originalMatchPlayers.includes(id)) return false;
      
      return true;
    });

    if (absentIds.length > 0) {
      const absentNames = absentIds.map(id => {
        const p = players.find(pl => pl.id === id);
        return p ? p.name : id;
      }).join(', ');
      throw new Error(`ERRO DE BLOQUEIO DE INTEGRIDADE: O(s) seguinte(s) participante(s) não estão presentes na lista de presença do dia ${stdDate}: [${absentNames}]. Gravação abortada.`);
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
      
      // Sync scores if in SCORE mode or manual scores provided
      let finalScoreA = manualScoreA !== undefined ? manualScoreA : scoreA;
      let finalScoreB = manualScoreB !== undefined ? manualScoreB : scoreB;
      
      if (manualScoreA === undefined && manualScoreB === undefined) {
        if (scoreMode === 'SCORE') {
          finalScoreA = parseInt(tempScoreA) || 0;
          finalScoreB = parseInt(tempScoreB) || 0;
        } else if (scoreMode === 'QUICK') {
          // In QUICK mode, if scores are 0-0 but winner is defined, 
          // we set a default like 25-23 to avoid 0-0 matches in history
          if (finalScoreA === 0 && finalScoreB === 0) {
            finalScoreA = winner === 'A' ? 25 : 23;
            finalScoreB = winner === 'B' ? 25 : 23;
          }
        }
      }
      
      const getTeamIds = (team: Team) => {
        const ids = team.players.map(p => p.id);
        if (team.setter) ids.unshift(team.setter.id);
        return ids;
      };

      // Garantir que o dailyMatchCount esteja sincronizado estritamente com a data atual
      // Filtramos o store local pelo campo 'date' que acabamos de calcular
      const sessionMatches = (matches || []).filter(m => m.date === date);
      const maxDailyNumber = sessionMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
      
      // Se o lastResetDate for de outro dia, o dailyMatchCount do metadata pertence a uma sessão anterior
      const isMetadataFromToday = systemMetadata.lastResetDate === date;
      const metadataDailyCount = isMetadataFromToday ? (systemMetadata.dailyMatchCount || 0) : 0;
      
      const finalCount = Math.max(maxDailyNumber + 1, metadataDailyCount + 1);
      
      console.log(`[FinishMatch] Calculando sequência: Max local=${maxDailyNumber}, Metadata=${systemMetadata.dailyMatchCount}, Final=${finalCount}, Data=${date}`);
      
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
      
      // Validate match data & Attendance Integrity
      matchSchema.parse(match);
      await validateMatchAttendance(match.teamA, match.teamB, date);
      
      // Dynamic ELO calculation based on team averages
      const teamA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
      const teamB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];
      
      const tsUpdates = calculateTrueSkillUpdate(teamA, teamB, winner);
      const tsMap = new Map<string, { mu: number; sigma: number }>();
      tsUpdates.forEach(u => tsMap.set(u.playerId, u.newTrueSkill));
      
      batch.set(doc(db, 'matches', matchId), cleanObject(match));

      // Update system metadata ONCE in the batch
      batch.set(doc(db, 'metadata', 'system'), { 
        dailyMatchCount: finalCount,
        matchStartTime: null,
        lastMatchTimestamp: timestamp,
        lastUpdate: timestamp
      }, { merge: true });
      
      // Atualizar ELO e estatísticas
      const updatePlayerStats = (p: Player, isTeamA: boolean) => {
        // Obter o estado mais atual do jogador do store para evitar stale state do generationResult
        const latestPlayer = players.find(pl => pl.id === p.id) || p;
        const isWinner = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
        
        // Regra Pedida: +20 para vitória, -20 para derrota (Fixo)
        const totalEloChange = isWinner ? 20 : -20;
        
        // Acúmulo de pontos pró e contra
        const pFor = isTeamA ? finalScoreA : finalScoreB;
        const pAgainst = isTeamA ? finalScoreB : finalScoreA;
        const pBalance = pFor - pAgainst;
        
        const hasFidelityToday = latestPlayer.lastFidelityDate === date;
        let finalPlayerElo = latestPlayer.elo;
        let updatedHistory = [...(latestPlayer.eloHistory || [])];
        
        const updates: any = {};
        
        // Se ainda não recebeu bônus de fidelidade hoje, adiciona +50 de fidelidade e soma 50 ao ELO
        if (!hasFidelityToday) {
          updates.fidelityPoints = (latestPlayer.fidelityPoints || 0) + 50;
          updates.lastFidelityDate = date;
          finalPlayerElo += 50;
          updates.dailyEloGain = (latestPlayer.dailyEloGain || 0) + 50;
          
          const fidelityHistoryEntry = {
            date: date,
            elo: finalPlayerElo,
            matchId: `fidelity-bonus-${date}-${timestamp}`,
            change: 50,
            timestamp: timestamp - 1000,
            result: 'P' as 'P',
            fidelityBonus: true
          };
          updatedHistory.push(fidelityHistoryEntry);
        }
        
        // Aplica o ELO da partida sobre o ELO com bônus de fidelidade
        const eloAfterMatch = Math.max(800, finalPlayerElo + totalEloChange);
        
        const playerRef = doc(db, 'players', p.id);
        const attendanceRef = doc(db, 'attendance', date, 'players', p.id);
        
        // ELO History with more metadata for the statement view
        const newHistoryEntry = { 
          date: date, 
          elo: eloAfterMatch, 
          matchId: matchId,
          change: totalEloChange,
          timestamp: timestamp,
          result: (isWinner ? 'V' : 'D') as 'V' | 'D'
        };
        updatedHistory.push(newHistoryEntry);
        
        updates.elo = eloAfterMatch;
        updates.matchesPlayed = (latestPlayer.matchesPlayed || 0) + 1;
        updates.pointsFor = (latestPlayer.pointsFor || 0) + pFor;
        updates.pointsAgainst = (latestPlayer.pointsAgainst || 0) + pAgainst;
        updates.pointsBalance = updates.pointsFor - updates.pointsAgainst;
        updates.wins = isWinner ? (latestPlayer.wins || 0) + 1 : (latestPlayer.wins || 0);
        updates.losses = !isWinner ? (latestPlayer.losses || 0) + 1 : (latestPlayer.losses || 0);
        updates.dailyMatches = (latestPlayer.dailyMatches || 0) + 1;
        updates.dailyWins = isWinner ? (latestPlayer.dailyWins || 0) + 1 : (latestPlayer.dailyWins || 0);
        updates.dailyLosses = !isWinner ? (latestPlayer.dailyLosses || 0) + 1 : (latestPlayer.dailyLosses || 0);
        updates.dailyEloGain = (updates.dailyEloGain || 0) + totalEloChange;
        updates.dailyResults = [...(latestPlayer.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'];
        updates.playedLastMatch = true;
        updates.consecutivePlayed = (latestPlayer.consecutivePlayed || 0) + 1;
        updates.consecutiveBenched = 0;
        updates.eloHistory = updatedHistory.slice(-200);

        console.log(`[DEBUG - handleFinishMatch] Player ${latestPlayer.name} (${latestPlayer.id}): matchesPlayed before=`, latestPlayer.matchesPlayed, `new value=`, updates.matchesPlayed, `new dailyMatches=`, updates.dailyMatches);
        
        const trueskillUpdate = tsMap.get(p.id);
        if (trueskillUpdate) {
          updates.trueSkill = trueskillUpdate;
        }

        batch.set(playerRef, cleanObject(updates), { merge: true });
        batch.set(attendanceRef, cleanObject(updates), { merge: true });
      };
      
      teamA.forEach(p => updatePlayerStats(p, true));
      teamB.forEach(p => updatePlayerStats(p, false));

      // --- ATUALIZAÇÃO DE SINERGIAS E RIVALIDADES ---
      const newSynergy = { ...synergy };
      const newNegativeSynergy = { ...negativeSynergy };
      const newRivalry = { ...rivalry };

      const winners = winner === 'A' ? teamA : teamB;
      const losers = winner === 'A' ? teamB : teamA;

      // Sinergia Positiva (Vencedores juntos)
      for (let i = 0; i < winners.length; i++) {
        for (let j = i + 1; j < winners.length; j++) {
          const pair = [winners[i].id, winners[j].id].sort().join('_');
          newSynergy[pair] = (newSynergy[pair] || 0) + 1;
        }
      }

      // Sinergia Negativa (Derrotados juntos)
      for (let i = 0; i < losers.length; i++) {
        for (let j = i + 1; j < losers.length; j++) {
          const pair = [losers[i].id, losers[j].id].sort().join('_');
          newNegativeSynergy[pair] = (newNegativeSynergy[pair] || 0) + 1;
        }
      }

      // Rivalidade (Vencedor vs Derrotado)
      // Formato: perdedorId_vencedorId (conforme RankingView espera)
      winners.forEach(w => {
        losers.forEach(l => {
          const pair = `${l.id}_${w.id}`;
          newRivalry[pair] = (newRivalry[pair] || 0) + 1;
        });
      });

      batch.set(doc(db, 'metadata', 'synergy'), newSynergy);
      batch.set(doc(db, 'metadata', 'negative_synergy'), newNegativeSynergy);
      batch.set(doc(db, 'metadata', 'rivalry'), newRivalry);
      // ----------------------------------------------
      
      // Marcar quem não jogou
      const totalMatchesPlayed = attendance.reduce((sum, p) => sum + (p.dailyMatches || 0), 0);
      const avgMatches = attendance.length > 0 ? totalMatchesPlayed / attendance.length : 0;
      const matchThreshold = Math.max(0, avgMatches - 1);

      generationResult.remainingPlayers.forEach(p => {
        const newConsecutiveBenched = (p.consecutiveBenched || 0) + 1;
        
        const updates: any = {
          playedLastMatch: false,
          consecutivePlayed: 0,
          consecutiveBenched: newConsecutiveBenched
        };
        
        const hasFidelityToday = p.lastFidelityDate === date;
        if (!hasFidelityToday) {
          updates.fidelityPoints = (p.fidelityPoints || 0) + 50;
          updates.lastFidelityDate = date;
          
          const newElo = p.elo + 50;
          updates.elo = newElo;
          updates.dailyEloGain = (p.dailyEloGain || 0) + 50;
          
          const fidelityHistoryEntry = {
            date: date,
            elo: newElo,
            matchId: `fidelity-bonus-${date}-${timestamp}`,
            change: 50,
            timestamp: timestamp - 1000,
            result: 'P' as 'P',
            fidelityBonus: true
          };
          updates.eloHistory = [...(p.eloHistory || []), fidelityHistoryEntry].slice(-200);
        }
        
        batch.set(doc(db, 'players', p.id), cleanObject(updates), { merge: true });
        batch.set(doc(db, 'attendance', date, 'players', p.id), cleanObject(updates), { merge: true });
      });
      
      // Limpar partida atual do Firestore
      batch.delete(doc(db, 'metadata', 'currentMatch'));

      // Notificar jogadores sobre o resultado da partida
      const playersToNotify = [...teamA, ...teamB];
      const notificationData = await Promise.all(playersToNotify.map(async (p) => {
        if (!p.id || !p.fcmToken) return { id: p.id, unreadCount: 1 };
        try {
          const q = query(collection(db, 'notifications'), where('playerUid', '==', p.uid), where('read', '==', false));
          const snap = await getDocs(q);
          return { id: p.id, unreadCount: snap.size + 1 };
        } catch (e) {
          return { id: p.id, unreadCount: 1 };
        }
      }));

      const notifyResult = (p: Player, isTeamA: boolean) => {
        const isWinner = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
        const title = isWinner ? 'Vitória! 🏆' : 'Fim de Jogo';
        const message = isWinner 
          ? `Parabéns! Seu time venceu a partida #${finalCount}.` 
          : `Seu time perdeu a partida #${finalCount}. Bora pra próxima!`;

        const appNotifRef = doc(collection(db, 'notifications'));
        batch.set(appNotifRef, {
          playerId: p.id,
          playerUid: p.uid || null,
          title,
          message,
          createdAt: Date.now(),
          read: false,
          type: 'match'
        });

        if (p.fcmToken && systemMetadata.matchNotificationsGlobalEnabled !== false && p.matchNotificationsEnabled !== false) {
          const unreadCount = notificationData.find(d => d.id === p.id)?.unreadCount || 1;
          const fcmRef = doc(collection(db, 'fcm_messages'));
          batch.set(fcmRef, {
            token: p.fcmToken,
            notification: { title, body: message, sound: 'default' },
            data: {
              unreadCount: String(unreadCount),
              type: 'match'
            },
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
        matchStartTime: null,
        lastMatchTimestamp: timestamp
      });
      await trackUsage(0, teamA.length + teamB.length + generationResult.remainingPlayers.length + 2);
      
      // Atualizar estado local para evitar delay do Firestore Sync
      const updateLocalStats = (p: Player) => {
        const playedInA = teamA.some(tp => tp.id === p.id);
        const playedInB = teamB.some(tp => tp.id === p.id);
        const played = playedInA || playedInB;
        
        if (played) {
          const isWinner = (playedInA && winner === 'A') || (playedInB && winner === 'B');
          const eloChange = isWinner ? 20 : -20;

          return {
            ...p,
            elo: Math.max(800, p.elo + eloChange),
            matchesPlayed: (p.matchesPlayed || 0) + 1,
            wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
            losses: !isWinner ? (p.losses || 0) + 1 : (p.losses || 0),
            dailyMatches: (p.dailyMatches || 0) + 1,
            dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
            dailyLosses: !isWinner ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
            dailyEloGain: (p.dailyEloGain || 0) + eloChange,
            dailyResults: [...(p.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'],
            playedLastMatch: true,
            consecutivePlayed: (p.consecutivePlayed || 0) + 1,
            consecutiveBenched: 0
          };
        } else {
          // Se estava na reserva ou nem estava na partida, playedLastMatch é false
          return { ...p, playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: (p.consecutiveBenched || 0) + 1 };
        }
      };

      setAttendance(attendance.map(updateLocalStats));
      setPlayers(players.map(updateLocalStats));
      setMatches([...matches, match]);
      
      setGenerationResult(null);
      setScoreA(0);
      setScoreB(0);
      setTempScoreA('0');
      setTempScoreB('0');

      // Atualizar estado local de sinergias
      setSynergy(newSynergy);
      setNegativeSynergy(newNegativeSynergy);
      setRivalry(newRivalry);

      setViewMode('generation');
      showNotification(`Partida registrada! Vitória da Equipe ${winner}`, 'success');
    } catch (error: any) {
      console.error('Erro ao finalizar partida:', error);
      if (error?.message && error.message.includes('ERRO DE BLOQUEIO DE INTEGRIDADE')) {
        showNotification(error.message, 'error');
        alert(error.message); // Alerta crítico de força bruta
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
    if (!generationResult || isAnalyzing) return;
    if (!checkAIQuota()) return;
    
    try {
      setIsAnalyzing(true);
      setAnalysis('');
      
      const result = await analyzeMatch(
        generationResult,
        attendance
      );
      
      setAnalysis(result);
      await trackAIUsage(1);
      showNotification('Análise da partida concluída!', 'success');
    } catch (error) {
      console.error('Erro ao analisar partida:', error);
      showNotification('Falha ao gerar análise da partida.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerifyRules = async () => {
    if (!generationResult || isVerifyingRules) return;
    if (!checkAIQuota()) return;
    setIsVerifyingRules(true);
    try {
      const lastMatch = [...(matches || [])]
        .filter(m => m.date === getFirestoreDateKey())
        .sort((a, b) => b.timestamp - a.timestamp)[0] || null;

      const result = await verifyRules(attendance, generationResult, "Equilibrado", lastMatch);
      setRuleVerification(result);
      await trackAIUsage(1);
    } catch (error) {
      console.error("Erro ao verificar regras:", error);
      showNotification("Erro ao verificar regras com IA.", "error");
    } finally {
      setIsVerifyingRules(false);
    }
  };

  const handleAutoFixInconsistencies = async () => {
    if (!generationResult) return;
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const allMatchHistory = (matches || []).map(m => ({
        teamA: m.teamA,
        teamB: m.teamB,
        winner: m.winner as 'A' | 'B',
        timestamp: m.timestamp
      }));

      const fixed = autoFixAllInconsistencies(generationResult, attendance, allMatchHistory);
      setGenerationResult(fixed);

      // Save to Firestore so it's synchronized in real-time
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(fixed));
      
      // Reset rule verification so the UI performs a fresh verification with the corrected teams
      setRuleVerification('');
      
      showNotification('Guerreiros Intelligence: Todas as inconsistências foram corrigidas ativamente!', 'success');
    } catch (e) {
      console.error(e);
      showNotification('Erro ao aplicar auto-correção.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false);

  const [showSetterPromptModal, setShowSetterPromptModal] = useState(false);
  const [setterPromptData, setSetterPromptData] = useState<{
    playersToUse: Player[];
    isReshuffle: boolean;
  } | null>(null);

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  // --- Utilitário de Log para Sanitização e Depuração de Attendance ---
  const debugAttendanceMatching = useCallback((targetPlayer: Player | null, contextTag: string = 'GERAL') => {
    const sanitize = (val?: string) => (val ? val.trim().toLowerCase() : '');

    if (!targetPlayer) {
      console.log(`[AttendanceDebug][${contextTag}] ⚠️ Jogador-alvo não fornecido (null/undefined).`);
      return null;
    }

    const sTargetId = sanitize(targetPlayer.id);
    const sTargetEmail = sanitize(targetPlayer.email);
    const sTargetUid = sanitize(targetPlayer.uid);

    console.log(`[AttendanceDebug][${contextTag}] 🔍 Inspecionando Jogador Alvo:`, {
      rawId: targetPlayer.id,
      sanitizedId: sTargetId,
      name: targetPlayer.name,
      rawEmail: targetPlayer.email,
      sanitizedEmail: sTargetEmail,
      rawUid: targetPlayer.uid,
      sanitizedUid: sTargetUid,
      totalAttendanceCount: attendance.length
    });

    const matchById = attendance.find(a => sanitize(a.id) === sTargetId);
    const matchByEmail = sTargetEmail ? attendance.find(a => a.email && sanitize(a.email) === sTargetEmail) : null;
    const matchByUid = sTargetUid ? attendance.find(a => a.uid && sanitize(a.uid) === sTargetUid) : null;

    const matchedRecord = matchById || matchByEmail || matchByUid || null;

    if (matchedRecord) {
      console.log(`[AttendanceDebug][${contextTag}] ✅ Jogador ENCONTRADO na lista de presença (attendance):`, {
        matchedBy: matchById ? 'ID' : matchByEmail ? 'EMAIL' : 'UID',
        foundPlayerId: matchedRecord.id,
        foundPlayerName: matchedRecord.name,
        foundPlayerEmail: matchedRecord.email,
        status: matchedRecord.status,
        isPresent: matchedRecord.isPresent
      });
    } else {
      console.warn(`[AttendanceDebug][${contextTag}] ❌ Jogador NÃO ENCONTRADO na lista de presença (attendance).`, {
        targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, email: targetPlayer.email, uid: targetPlayer.uid },
        currentAttendanceList: attendance.map(a => ({
          id: a.id,
          sanitizedId: sanitize(a.id),
          name: a.name,
          email: a.email,
          sanitizedEmail: sanitize(a.email),
          uid: a.uid,
          sanitizedUid: sanitize(a.uid),
          status: a.status
        }))
      });
    }

    return matchedRecord;
  }, [attendance]);

  const alignArrivalOrders = async (dateKey: string) => {
    try {
      const collectionRef = collection(db, 'attendance', dateKey, 'players');
      const snapshot = await getDocs(collectionRef);
      const playersList = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Player))
        .filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm');

      // Sort chronologically by timestamp, fallback to ID alphabetical
      playersList.sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      const batch = writeBatch(db);
      let updatedCount = 0;

      playersList.forEach((p, index) => {
        const correctOrder = index + 1;
        if (p.arrivalOrder !== correctOrder) {
          const playerRef = doc(db, 'attendance', dateKey, 'players', p.id);
          batch.update(playerRef, { arrivalOrder: correctOrder });
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        if (commitBatchWithLog) {
          await commitBatchWithLog(batch, 'Auto-Alinhamento da Fila de Chegada', updatedCount);
        } else {
          await batch.commit();
        }
        console.log(`[useAppLogic] Alinhamento concluído! Corrigido ${updatedCount} posições.`);
      }
    } catch (error) {
      console.error("[useAppLogic] Erro ao alinhar ordens de chegada:", error);
    }
  };

  const registerAttendance = async (player: Player, method: 'NFC' | 'QR' | 'MANUAL' = 'MANUAL') => {
    const previousAttendance = [...attendance];
    const fullPlayer = players.find(p => p.id === player.id);
    
    // Immediate sensory feedback
    triggerHaptic('success');
    playFeedbackSound('success');
    const previousPlayerState = fullPlayer ? {
      fidelityPoints: fullPlayer.fidelityPoints,
      lastFidelityDate: fullPlayer.lastFidelityDate,
      elo: fullPlayer.elo,
      eloHistory: fullPlayer.eloHistory
    } : null;

    try {
      triggerDbStatus('writing');

      const dateKey = getFirestoreDateKey();
      
      const activeAttendance = attendance.filter(p => p.status !== 'left' && !p.isDM && p.status !== 'dm');
      const maxOrder = activeAttendance.reduce((max, p) => Math.max(max, p.arrivalOrder || 0), 0);
      const nextOrder = maxOrder + 1;

      const todayMatches = matches.filter(m => m.date === dateKey && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
      const actualDailyMatches = todayMatches.length;
      const actualDailyWins = todayMatches.filter(m => (m.winner === 'A' && m.teamA.includes(player.id)) || (m.winner === 'B' && m.teamB.includes(player.id))).length;
      const actualDailyLosses = todayMatches.filter(m => (m.winner === 'B' && m.teamA.includes(player.id)) || (m.winner === 'A' && m.teamB.includes(player.id))).length;

      const nameToSave = fullPlayer?.name || player.name || "Sócio sem nome";

      const optimisticPlayer = cleanObject({
        ...player,
        status: 'active',
        name: nameToSave,
        arrivalOrder: nextOrder,
        isPresent: true,
        checkInMethod: method,
        timestamp: Date.now(),
        dailyMatches: actualDailyMatches,
        dailyWins: actualDailyWins,
        dailyLosses: actualDailyLosses,
        dailyResults: [],
        playedLastMatch: false,
        consecutiveBenched: 0
      }) as Player;

      // === OPTIMISTIC LOCAL UPDATE ===
      setAttendance([...attendance.filter(p => p.id !== player.id), optimisticPlayer]);

      let awardedFidelity = false;
      let nextFidelityPoints = fullPlayer?.fidelityPoints || 0;
      let nextElo = fullPlayer?.elo || 1200;
      let nextEloHistory = fullPlayer?.eloHistory || [];

      if (fullPlayer && fullPlayer.lastFidelityDate !== dateKey) {
        awardedFidelity = true;
        nextFidelityPoints += 50;
        nextElo += 50;
        const newHistoryEntry = {
          date: dateKey,
          elo: nextElo,
          matchId: `fidelity-bonus-${dateKey}-${Date.now()}`,
          change: 50,
          timestamp: Date.now() - 500,
          result: 'P' as 'P',
          fidelityBonus: true
        };
        nextEloHistory = [...nextEloHistory, newHistoryEntry].slice(-200);

        fullPlayer.fidelityPoints = nextFidelityPoints;
        fullPlayer.lastFidelityDate = dateKey;
        fullPlayer.elo = nextElo;
        fullPlayer.eloHistory = nextEloHistory;
      }
      
      showNotification(`${nameToSave} confirmou presença!`, 'success');

      // === FIRESTORE BACKGROUND SYNC ===
      const dateDocRef = doc(db, 'attendance', dateKey);
      const attendanceRef = doc(db, 'attendance', dateKey, 'players', player.id);
      
      const batch = writeBatch(db);
      let batchSize = 0;

      batch.set(dateDocRef, { date: dateKey, lastUpdate: Date.now() }, { merge: true });
      batchSize++;

      if (awardedFidelity && fullPlayer) {
        batch.set(doc(db, 'players', player.id), {
          fidelityPoints: nextFidelityPoints,
          lastFidelityDate: dateKey,
          elo: nextElo,
          eloHistory: nextEloHistory
        }, { merge: true });
        batchSize++;
      }
      
      batch.set(attendanceRef, optimisticPlayer);
      batchSize++;

      // Clear old reminders asynchronously (non-blocking for UI)
      try {
        const q = query(
          collection(db, 'notifications'),
          where('playerUid', '==', player.uid || ''),
          where('type', '==', 'reminder')
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
          batch.delete(d.ref);
          batchSize++;
        });
      } catch (err) {
        console.warn('Erro ao mapear lembretes antigos para o lote:', err);
      }

      if (commitBatchWithLog) {
        await commitBatchWithLog(batch, 'Registro de Presença', batchSize);
      } else {
        await batch.commit();
      }
      
      await trackUsage(1, 1);
      await alignArrivalOrders(dateKey);
    } catch (error) {
      console.error("Reverting optimistic UI due to network error:", error);
      // Revert optimistic updates
      setAttendance(previousAttendance);
      if (fullPlayer && previousPlayerState) {
        fullPlayer.fidelityPoints = previousPlayerState.fidelityPoints;
        fullPlayer.lastFidelityDate = previousPlayerState.lastFidelityDate;
        fullPlayer.elo = previousPlayerState.elo;
        fullPlayer.eloHistory = previousPlayerState.eloHistory;
      }
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const removeAttendance = async (playerId: string) => {
    const previousAttendance = [...attendance];
    
    try {
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      
      // OPTIMISTIC LOCAL UPDATE
      setAttendance(attendance.filter(p => p.id !== playerId));

      const attendanceRef = doc(db, 'attendance', dateKey, 'players', playerId);
      const batch = writeBatch(db);
      
      batch.update(attendanceRef, {
        status: 'left',
        leftAt: Date.now()
      });

      if (commitBatchWithLog) {
        await commitBatchWithLog(batch, 'Remover Presença Individual', 1);
      } else {
        await batch.commit();
      }

      await trackUsage(0, 1);
      showNotification('Presença removida.', 'info');
    } catch (error) {
      console.error("Reverting optimistic UI due to network error:", error);
      setAttendance(previousAttendance);
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const updateDepartureTime = async (playerId: string, departureTime: string | null) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      const attendanceRef = doc(db, 'attendance', dateKey, 'players', playerId);
      
      if (departureTime === null) {
        await updateDoc(attendanceRef, { departureTime: deleteField() });
      } else {
        await updateDoc(attendanceRef, { departureTime });
      }
    } catch (error) {
      console.error("Erro ao atualizar horário de saída:", error);
      handleFirestoreError(error, OperationType.WRITE, 'update-departure');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateArrivalTime = async (playerId: string, arrivalTime: string | null) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      const attendanceRef = doc(db, 'attendance', dateKey, 'players', playerId);
      
      if (arrivalTime === null) {
        await updateDoc(attendanceRef, { arrivalTime: deleteField() });
      } else {
        await updateDoc(attendanceRef, { arrivalTime });
      }
    } catch (error) {
      console.error("Erro ao atualizar horário de chegada:", error);
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
          attendance.forEach(p => {
            batch.delete(doc(db, 'attendance', dateKey, 'players', p.id));
          });
          
          // Revert ELO bonus for each player in attendance
          for (const p of attendance) {
            const fullPlayer = players.find(fp => fp.id === p.id);
            if (fullPlayer && fullPlayer.lastFidelityDate === dateKey) {
              const nextFidelityPoints = Math.max(0, (fullPlayer.fidelityPoints || 0) - 50);
              const nextElo = Math.max(800, (fullPlayer.elo || 1200) - 50);
              const filteredEloHistory = (fullPlayer.eloHistory || []).filter(h => 
                !(h.date === dateKey && h.fidelityBonus)
              );
              const previousFidelityEntry = filteredEloHistory.slice().reverse().find(h => h.fidelityBonus);
              const previousFidelityDate = previousFidelityEntry ? previousFidelityEntry.date : null;

              batch.set(doc(db, 'players', p.id), {
                fidelityPoints: nextFidelityPoints,
                lastFidelityDate: previousFidelityDate,
                elo: nextElo,
                eloHistory: filteredEloHistory
              }, { merge: true });

              // Update local state
              fullPlayer.fidelityPoints = nextFidelityPoints;
              fullPlayer.lastFidelityDate = previousFidelityDate;
              fullPlayer.elo = nextElo;
              fullPlayer.eloHistory = filteredEloHistory;
            }
          }
          
          if (commitBatchWithLog) {
            await commitBatchWithLog(batch, 'Limpeza de Presença Geral', attendance.length * 2);
          } else {
            await batch.commit();
          }
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
      const { getDoc, deleteField } = await import("firebase/firestore");
      const intentionsSnap = await getDoc(intentionsRef);
      
      const currentStoredTarget = intentionsSnap.exists() && intentionsSnap.data().targetDate ? intentionsSnap.data().targetDate : today;
      const targetDate = (currentStoredTarget && currentStoredTarget >= today) ? currentStoredTarget : nextThu;
      
      const isConfirmed = intentionsSnap.exists() ? (intentionsSnap.data().responses?.[player.id] === 'GOING') : false;
      const isDateRotating = currentStoredTarget && currentStoredTarget < today;

      const preConfirmationRef = doc(db, 'preConfirmations', targetDate, 'players', player.id);
      
      const batch = writeBatch(db);
      let batchSize = 0;

      if (isConfirmed && !isDateRotating) {
        batch.delete(preConfirmationRef);
        batchSize++;
        batch.set(intentionsRef, {
          responses: { [player.id]: deleteField() },
          confirmationTimestamps: { [player.id]: deleteField() }
        }, { merge: true });
        batchSize++;
        
        if (commitBatchWithLog) {
          await commitBatchWithLog(batch, 'Remover Intenção', batchSize);
        } else {
          await batch.commit();
        }
        showNotification('Presença removida da lista.', 'info');
      } else {
        const now = Date.now();
        batch.set(preConfirmationRef, cleanObject({
          ...player,
          timestamp: now,
          id: player.id
        }));
        batchSize++;

        // If rotating, we MUST clear all old responses to avoid mixing weeks
        if (isDateRotating) {
          const prevAutomation = intentionsSnap.exists() ? (intentionsSnap.data().automationEnabled ?? true) : true;
          batch.set(intentionsRef, {
            responses: { [player.id]: 'GOING' },
            confirmationTimestamps: { [player.id]: now },
            targetDate: targetDate,
            remindersSent: {},
            automationEnabled: prevAutomation
          }, { merge: false }); 
        } else {
          batch.set(intentionsRef, {
            responses: { [player.id]: 'GOING' },
            confirmationTimestamps: { [player.id]: now },
            targetDate: targetDate
          }, { merge: true });
        }
        batchSize++;

        if (commitBatchWithLog) {
          await commitBatchWithLog(batch, 'Confirmar Intenção', batchSize);
        } else {
          await batch.commit();
        }
        const firstName = player.name.split(' ')[0];
        showNotification(`Presença confirmada! Bom jogo, ${firstName}! 🏐🔥`, 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pre-confirmation');
    } finally {
      setIsSyncing(false);
    }
  };

  const deletePlayer = async (id: string) => {
    const playerToDelete = players.find(p => p.id === id);
    
    showConfirmModal(
      'Excluir Sócio',
      `Tem certeza que deseja excluir ${playerToDelete?.name || 'este sócio'}? Esta ação é irreversível.`,
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          
          // Delete the player
          batch.delete(doc(db, 'players', id));
          
          // Clean up player from intentions list
          try {
            const intentionsRef = doc(db, 'metadata', 'intentions');
            const intentionsSnap = await getDoc(intentionsRef);
            if (intentionsSnap.exists()) {
              const data = intentionsSnap.data();
              const responses = data.responses || {};
              const timestamps = data.confirmationTimestamps || {};
              if (responses[id]) {
                const newResponses = { ...responses };
                const newTimestamps = { ...timestamps };
                delete newResponses[id];
                delete newTimestamps[id];
                batch.update(intentionsRef, { 
                  responses: newResponses, 
                  confirmationTimestamps: newTimestamps 
                });
              }
            }
          } catch (cleanErr) {
            console.warn('Erro ao limpar intenções na exclusão:', cleanErr);
          }
          
          // Log the deletion
          await logAction(AuditAction.DELETE_PLAYER, id, playerToDelete?.name || 'Sócio excluído');
          
          // Promote waitlist player if necessary
          if (playerToDelete?.status === 'active') {
            const waitlistPlayers = players
              .filter(p => p.status === 'waitlist' && p.id !== id)
              .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
              
            if (waitlistPlayers.length > 0) {
              const nextPlayer = waitlistPlayers[0];
              batch.set(doc(db, 'players', nextPlayer.id), { status: 'active' }, { merge: true });
              showNotification(`${nextPlayer.name} foi promovido da lista de espera para sócio ativo!`, 'success');
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
          players.forEach(p => {
            batch.delete(doc(db, 'players', p.id));
          });
          
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
      'CUIDADO: Isso irá excluir TODAS as partidas registradas E zerar as estatísticas de todos os sócios (ELO, partidas, vitórias, derrotas, gráficos). Esta ação é irreversível. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          // Fetch all matches to ensure we delete everything even if not in local store
          const matchesSnapshot = await getDocs(collection(db, 'matches'));
          const batch = writeBatch(db);
          
          matchesSnapshot.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });
          
          // Reset player stats
          players.forEach(p => {
            if (p.id) {
              batch.set(doc(db, 'players', p.id), {
                elo: 1200,
                eloHistory: [],
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                dailyMatches: 0,
                dailyWins: 0,
                dailyLosses: 0,
                dailyEloGain: 0,
                dailyResults: [],
                playedLastMatch: false,
                consecutiveBenched: 0
              }, { merge: true });
            }
          });
          
          await batch.commit();
          setMatches([]);
          
          // Update local state
          setPlayers(players.map(p => ({
            ...p,
            elo: 1200,
            eloHistory: [],
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            dailyMatches: 0,
            dailyWins: 0,
            dailyLosses: 0,
            dailyEloGain: 0,
            dailyResults: [],
            playedLastMatch: false,
            consecutiveBenched: 0
          })));
          
          showNotification('Todo o histórico de partidas foi excluído e estatísticas zeradas.', 'success');
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
      'Deseja realmente excluir esta partida? As estatísticas dos sócios (ELO, vitórias, derrotas, etc.) desta partida serão revertidas. Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const batch = writeBatch(db);
          
          // 1. Excluir o documento da partida
          batch.delete(doc(db, 'matches', matchId));
          
          // Log match deletion
          await logAction(AuditAction.DELETE_MATCH, matchId, `Partida #${matchToDelete.dailyNumber || '?'}`);
          
          // 2. Reverter as estatísticas dos jogadores que participaram
          const allPlayersInMatch = [...(matchToDelete.teamA || []), ...(matchToDelete.teamB || [])];
          const matchDate = matchToDelete.date;
          const isToday = matchDate === getFirestoreDateKey();
          
          allPlayersInMatch.forEach(pid => {
            const latestPlayer = players.find(player => player.id === pid);
            if (!latestPlayer) return;
            
            const isWinner = (matchToDelete.winner === 'A' && (matchToDelete.teamA || []).includes(pid)) || 
                             (matchToDelete.winner === 'B' && (matchToDelete.teamB || []).includes(pid));
            const isTeamA = (matchToDelete.teamA || []).includes(pid);
            
            const eloChange = isWinner ? 20 : -20;
            
            let updatedHistory = [...(latestPlayer.eloHistory || [])];
            let previousElo = latestPlayer.elo;
            
            const matchTime = new Date(matchToDelete.endTime || matchToDelete.timestamp).getTime();
            const entryIndex = updatedHistory.findIndex(entry => {
              if (entry.matchId === matchId) return true;
              const entryTime = new Date(entry.timestamp || 0).getTime();
              return Math.abs(entryTime - matchTime) < 60000;
            });
            
            if (entryIndex !== -1) {
              if (entryIndex > 0) {
                previousElo = updatedHistory[entryIndex - 1].elo;
              } else {
                previousElo = Math.max(800, latestPlayer.elo - eloChange);
              }
              updatedHistory.splice(entryIndex, 1);
            } else {
              previousElo = Math.max(800, latestPlayer.elo - eloChange);
              if (updatedHistory.length > 0) {
                updatedHistory.pop();
              }
            }
            
            const results = [...(latestPlayer.dailyResults || [])];
            if (isToday && results.length > 0) {
              const expectedResult = isWinner ? 'V' : 'D';
              const lastIdx = results.lastIndexOf(expectedResult);
              if (lastIdx !== -1) {
                results.splice(lastIdx, 1);
              }
            }
            
            const updates = {
              elo: previousElo,
              matchesPlayed: Math.max(0, (latestPlayer.matchesPlayed || 0) - 1),
              pointsFor: Math.max(0, (latestPlayer.pointsFor || 0) - (isTeamA ? matchToDelete.scoreA : matchToDelete.scoreB)),
              pointsAgainst: Math.max(0, (latestPlayer.pointsAgainst || 0) - (isTeamA ? matchToDelete.scoreB : matchToDelete.scoreA)),
              pointsBalance: (latestPlayer.pointsBalance || 0) - ((isTeamA ? matchToDelete.scoreA : matchToDelete.scoreB) - (isTeamA ? matchToDelete.scoreB : matchToDelete.scoreA)),
              wins: isWinner ? Math.max(0, (latestPlayer.wins || 0) - 1) : (latestPlayer.wins || 0),
              losses: !isWinner ? Math.max(0, (latestPlayer.losses || 0) - 1) : (latestPlayer.losses || 0),
              dailyMatches: isToday ? Math.max(0, (latestPlayer.dailyMatches || 0) - 1) : (latestPlayer.dailyMatches || 0),
              dailyWins: isToday ? (isWinner ? Math.max(0, (latestPlayer.dailyWins || 0) - 1) : (latestPlayer.dailyWins || 0)) : (latestPlayer.dailyWins || 0),
              dailyLosses: isToday ? (!isWinner ? Math.max(0, (latestPlayer.dailyLosses || 0) - 1) : (latestPlayer.dailyLosses || 0)) : (latestPlayer.dailyLosses || 0),
              dailyEloGain: isToday ? (latestPlayer.dailyEloGain || 0) - eloChange : (latestPlayer.dailyEloGain || 0),
              dailyResults: results,
              eloHistory: updatedHistory,
              playedLastMatch: false
            };
            
            batch.set(doc(db, 'players', latestPlayer.id), updates, { merge: true });
            batch.set(doc(db, 'attendance', matchDate, 'players', latestPlayer.id), updates, { merge: true });
          });

          // 2. Restaurar status de banco e quem jogou por último
          const remainingMatches = matches.filter(m => m.id !== matchId && m.date === matchDate).sort((a, b) => b.timestamp - a.timestamp);
          if (remainingMatches.length > 0) {
            const lastMatch = remainingMatches[0];
            const participants = [...(lastMatch.teamA || []), ...(lastMatch.teamB || [])];
            players.forEach(p => {
              const isParticipant = participants.includes(p.id);
              const updates = {
                playedLastMatch: isParticipant,
                consecutiveBenched: allPlayersInMatch.includes(p.id) ? 0 : Math.max(0, (p.consecutiveBenched || 0) - 1)
              };
              batch.set(doc(db, 'players', p.id), cleanObject(updates), { merge: true });
              batch.set(doc(db, 'attendance', matchDate, 'players', p.id), cleanObject(updates), { merge: true });
            });
          } else {
            players.forEach(p => {
              const updates = { 
                playedLastMatch: false, 
                dailyMatches: 0, 
                dailyWins: 0, 
                dailyLosses: 0, 
                dailyResults: [], 
                dailyEloGain: 0,
                consecutiveBenched: 0 
              };
              batch.set(doc(db, 'players', p.id), cleanObject(updates), { merge: true });
              batch.set(doc(db, 'attendance', matchDate, 'players', p.id), cleanObject(updates), { merge: true });
            });
          }
          
          await batch.commit();
          
          setMatches(matches.filter(m => m.id !== matchId));
          await refreshPlayers();
          
          showNotification('Partida e estatísticas excluídas com sucesso.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const updateMatchResult = async (
    matchId: string, 
    newWinner: 'A' | 'B', 
    newScoreA: number, 
    newScoreB: number,
    newTeamA?: string[],
    newTeamB?: string[]
  ) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const matchToUpdate = matches.find(m => m.id === matchId);
      if (!matchToUpdate) {
        showNotification('Partida não encontrada.', 'error');
        return;
      }

      const updatedMatch: Match = {
        ...matchToUpdate,
        winner: newWinner,
        scoreA: newScoreA,
        scoreB: newScoreB,
        ...(newTeamA ? { teamA: newTeamA } : {}),
        ...(newTeamB ? { teamB: newTeamB } : {}),
        updatedAt: new Date().toISOString()
      };

      // Validate Attendance Integrity before updating
      // Passa os jogadores originais da partida como exceção permitida caso a lista de presença tenha sumido (histórico)
      const originalPlayers = [...(matchToUpdate.teamA || []), ...(matchToUpdate.teamB || [])];
      await validateMatchAttendance(
        updatedMatch.teamA, 
        updatedMatch.teamB, 
        updatedMatch.date || getFirestoreDateKey(),
        originalPlayers
      );

      const updatedMatchesList = matches.map(m => m.id === matchId ? updatedMatch : m);

      // Salva partida atualizada no Firestore
      await setDoc(doc(db, 'matches', matchId), cleanObject(updatedMatch), { merge: true });

      // Recalcula todas as estatísticas e rankings com base na lista de partidas atualizada
      const todayDateKey = getFirestoreDateKey();
      const recalculatedPlayers = recalculateAllStatsFromMatches(players, updatedMatchesList, todayDateKey);

      // Salva atletas recalculados em lote no Firestore
      const batch = writeBatch(db);
      recalculatedPlayers.forEach(p => {
        const playerUpdates = {
          elo: p.elo,
          wins: p.wins,
          losses: p.losses,
          matchesPlayed: p.matchesPlayed,
          pointsFor: p.pointsFor,
          pointsAgainst: p.pointsAgainst,
          pointsBalance: p.pointsBalance,
          dailyMatches: p.dailyMatches,
          dailyWins: p.dailyWins,
          dailyLosses: p.dailyLosses,
          dailyEloGain: p.dailyEloGain,
          dailyResults: p.dailyResults,
          eloHistory: p.eloHistory,
          playedLastMatch: p.playedLastMatch,
          consecutiveBenched: p.consecutiveBenched,
        };
        batch.set(doc(db, 'players', p.id), cleanObject(playerUpdates), { merge: true });
        
        // Sempre atualiza o documento na lista de presença do dia atual para manter consistência no Ranking Diário
        // Independentemente de dailyMatches ser 0 (pode ter sido removido da única partida que jogou)
        batch.set(doc(db, 'attendance', todayDateKey, 'players', p.id), cleanObject(playerUpdates), { merge: true });

        // Se a partida editada for de uma data passada, também tentamos atualizar o registro de presença daquela data específica
        if (updatedMatch.date && updatedMatch.date !== todayDateKey) {
          batch.set(doc(db, 'attendance', updatedMatch.date, 'players', p.id), cleanObject(playerUpdates), { merge: true });
        }
      });

      await batch.commit();

      setMatches(updatedMatchesList);
      setPlayers(recalculatedPlayers);
      
      // Sincroniza estado local de presença para resposta imediata na UI
      const updatedAttendance = attendance.map(attPlayer => {
        const recalculated = recalculatedPlayers.find(p => p.id === attPlayer.id);
        return recalculated ? { ...attPlayer, ...recalculated } : attPlayer;
      });
      setAttendance(updatedAttendance);

      const teamsChanged = Boolean(newTeamA || newTeamB);
      const logMessage = teamsChanged
        ? `Resultado e escalação alterados: Vencedor ${newWinner} (${newScoreA}x${newScoreB}) com troca de atletas`
        : `Resultado alterado: Vencedor ${newWinner} (${newScoreA}x${newScoreB})`;

      await logAction(AuditAction.UPDATE_MATCH, matchId, logMessage);
      showNotification('Partida atualizada e ranking reprocessado com sucesso!', 'success');
    } catch (error: any) {
      console.error('Erro ao atualizar partida e reprocessar:', error);
      if (error?.message && error.message.includes('ERRO DE BLOQUEIO DE INTEGRIDADE')) {
        showNotification(error.message, 'error');
        alert(error.message); // Alerta crítico de força bruta
      } else {
        handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}`);
        showNotification('Erro ao reprocessar resultado da partida.', 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const reprocessAllMatchesAndStats = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      showNotification('Reprocessando todas as partidas e o ranking dos sócios...', 'info');

      const dateKey = getFirestoreDateKey();
      const collectionName = 'matches';
      const matchesColRef = collection(db, collectionName);

      console.group(`[reprocessAllMatchesAndStats] Diagnóstico de Query Firestore`);
      console.info(`📌 Nome da Collection: "${collectionName}"`);
      console.info(`📅 Parâmetro 'dateKey' formatado: "${dateKey}"`);
      console.info(`🔗 Caminho da Collection no Firestore: "${matchesColRef.path}"`);

      // 1. Consulta filtrada por dateKey (data atual/sessão)
      let filteredSnap;
      let matchesSnap;
      try {
        const qFiltered = query(matchesColRef, where('date', '==', dateKey));
        filteredSnap = await getDocs(qFiltered);
      } catch (queryErr: any) {
        console.error(`[reprocessAllMatchesAndStats] Firestore Indexing/Query Error (filtered query):`, queryErr?.message || queryErr);
        console.warn(`[reprocessAllMatchesAndStats] Possible missing Firestore index or composite query constraint on 'matches' collection for 'date' == '${dateKey}'. Raw error:`, queryErr);
        filteredSnap = { size: 0, forEach: () => {} } as any;
      }

      console.info(`🔍 Documentos retornados pela query filtrada (where date == "${dateKey}"): ${filteredSnap.size}`);

      const filteredTableRows: any[] = [];
      filteredSnap.forEach((docSnap: any) => {
        const m = docSnap.data();
        const dateIso = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
        filteredTableRows.push({
          id: docSnap.id,
          date: m.date,
          hora_brasilia: dateIso,
          timestamp: m.timestamp,
          dailyNumber: m.dailyNumber ?? 'N/A',
          placar: `${m.scoreA ?? 0} x ${m.scoreB ?? 0}`,
          vencedor: m.winner || 'N/A',
          duracao: m.durationSeconds !== undefined ? `${m.durationSeconds}s` : 'N/A',
          timeA_jogadores: Array.isArray(m.teamA) ? m.teamA.length : 0,
          timeB_jogadores: Array.isArray(m.teamB) ? m.teamB.length : 0
        });
      });

      console.info(`📋 console.table COMPLETO dos documentos retornados da query filtrada por "${dateKey}":`);
      if (filteredTableRows.length > 0) {
        console.table(filteredTableRows);
      } else {
        console.warn(`[reprocessAllMatchesAndStats] Nenhum documento encontrado para a data "${dateKey}".`);
      }

      // 2. Consulta geral à collection para verificar se há incompatibilidade de formato ou datas diferentes
      try {
        matchesSnap = await getDocs(matchesColRef);
      } catch (allErr: any) {
        console.error(`[reprocessAllMatchesAndStats] Firestore Indexing/Query Error (collection scan):`, allErr?.message || allErr);
        console.warn(`[reprocessAllMatchesAndStats] Possible missing index on 'matches' collection. Raw error:`, allErr);
        matchesSnap = { size: 0, forEach: () => {} } as any;
      }

      console.info(`📦 Total geral de documentos na collection "${collectionName}" (sem filtro): ${matchesSnap.size}`);

      const allTableRows: any[] = [];
      const dateCountMap: Record<string, number> = {};
      const fetchedMatches: Match[] = [];

      matchesSnap.forEach((docSnap: any) => {
        const data = docSnap.data();
        const rawDate = data.date;
        const mDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate) : 'sem_data';
        dateCountMap[mDate] = (dateCountMap[mDate] || 0) + 1;
        fetchedMatches.push({ ...data, id: docSnap.id } as Match);

        const dateIso = data.timestamp ? new Date(data.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
        allTableRows.push({
          id: docSnap.id,
          date: data.date,
          data_hora_brasilia: dateIso,
          timestamp: data.timestamp,
          dailyNumber: data.dailyNumber ?? 'N/A',
          placar: `${data.scoreA ?? 0} x ${data.scoreB ?? 0}`,
          vencedor: data.winner || 'N/A',
          duracao: data.durationSeconds !== undefined ? `${data.durationSeconds}s` : 'N/A'
        });
      });

      console.info(`📋 console.table COMPLETO de todas as partidas da collection "${collectionName}":`);
      console.table(allTableRows);

      console.info(`📊 Distribuição de partidas por campo 'date' na collection "${collectionName}":`, dateCountMap);
      if (filteredSnap.size <= 1 && matchesSnap.size > 1) {
        console.warn(`⚠️ ANÁLISE DE FILTRO: A query filtrada por dateKey ("${dateKey}") retornou apenas ${filteredSnap.size} partida(s), enquanto a base contém ${matchesSnap.size} partidas distribuídas nas datas acima. Se você desejava partidas de outra data (ex: 2026-10-15), o filtro 'date == ${dateKey}' está isolando estritamente o dia de hoje.`);
      }
      console.groupEnd();

      const matchesToUse = fetchedMatches.length > 0 ? fetchedMatches : matches;
      const recalculatedPlayers = recalculateAllStatsFromMatches(players, matchesToUse, dateKey);

      const batch = writeBatch(db);
      recalculatedPlayers.forEach(p => {
        const playerUpdates = {
          elo: p.elo,
          wins: p.wins,
          losses: p.losses,
          matchesPlayed: p.matchesPlayed,
          pointsFor: p.pointsFor,
          pointsAgainst: p.pointsAgainst,
          pointsBalance: p.pointsBalance,
          dailyMatches: p.dailyMatches,
          dailyWins: p.dailyWins,
          dailyLosses: p.dailyLosses,
          dailyEloGain: p.dailyEloGain,
          dailyResults: p.dailyResults,
          eloHistory: p.eloHistory,
          playedLastMatch: p.playedLastMatch,
          consecutiveBenched: p.consecutiveBenched,
        };
        batch.set(doc(db, 'players', p.id), cleanObject(playerUpdates), { merge: true });
        
        // Sempre atualiza o documento na lista de presença do dia atual para manter consistência no Ranking Diário
        batch.set(doc(db, 'attendance', dateKey, 'players', p.id), cleanObject(playerUpdates), { merge: true });
      });

      await batch.commit();
      setPlayers(recalculatedPlayers);

      // Sincroniza estado local de presença para resposta imediata na UI
      const updatedAttendance = attendance.map(attPlayer => {
        const recalculated = recalculatedPlayers.find(p => p.id === attPlayer.id);
        return recalculated ? { ...attPlayer, ...recalculated } : attPlayer;
      });
      setAttendance(updatedAttendance);

      showNotification('Ranking e estatísticas reprocessados com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao reprocessar partidas e ranking:', error);
      showNotification('Erro ao reprocessar ranking.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteMatchesByDate = async (date: string) => {
    const matchesToDelete = matches.filter(m => m.date === date);
    if (matchesToDelete.length === 0) {
      showNotification(`Nenhuma partida encontrada para a data ${date}.`, 'info');
      return;
    }

    const formattedDate = date.split('-').reverse().join('/');
    
    showConfirmModal(
      'Excluir Partidas do Dia',
      `Deseja realmente excluir TODAS as ${matchesToDelete.length} partidas do dia ${formattedDate}? As estatísticas dos sócios serão revertidas cronologicamente. Esta ação é irreversível.`,
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const batch = writeBatch(db);
          
          // Ordenar por timestamp decrescente para reverter do mais novo para o mais antigo
          const sortedMatches = [...matchesToDelete].sort((a, b) => b.timestamp - a.timestamp);
          
          let localPlayers = [...players];
          const today = getFirestoreDateKey();
          const isToday = date === today;
          
          for (const match of sortedMatches) {
            batch.delete(doc(db, 'matches', match.id));
            await logAction(AuditAction.DELETE_MATCH, match.id, `Exclusão em massa: Partida #${match.dailyNumber || '?'}`);
            
            const allPlayersInMatch = [...(match.teamA || []), ...(match.teamB || [])];
            
            allPlayersInMatch.forEach(pid => {
              const pIdx = localPlayers.findIndex(lp => lp.id === pid);
              if (pIdx === -1) return;
              const p = localPlayers[pIdx];
              
              const isWinner = (match.winner === 'A' && match.teamA.includes(pid)) || 
                               (match.winner === 'B' && match.teamB.includes(pid));
              const isTeamA = match.teamA.includes(pid);
              
              const eloChange = isWinner ? 20 : -20;
              
              let updatedHistory = [...(p.eloHistory || [])];
              let previousElo = p.elo;
              
              const matchTime = new Date(match.endTime).getTime();
              const entryIndex = updatedHistory.findIndex(entry => {
                const entryTime = new Date(entry.timestamp || 0).getTime();
                if (entry.matchId === match.id) return true;
                return Math.abs(entryTime - matchTime) < 60000;
              });
              
              if (entryIndex !== -1) {
                if (entryIndex > 0) {
                  previousElo = updatedHistory[entryIndex - 1].elo;
                } else {
                  previousElo = Math.max(800, p.elo - eloChange);
                }
                updatedHistory.splice(entryIndex, 1);
              } else {
                previousElo = Math.max(800, p.elo - eloChange);
                if (updatedHistory.length > 0) {
                  updatedHistory.pop();
                }
              }
              
              const results = [...(p.dailyResults || [])];
              if (isToday && results.length > 0) {
                const expectedResult = isWinner ? 'V' : 'D';
                const lastIdx = results.lastIndexOf(expectedResult);
                if (lastIdx !== -1) {
                  results.splice(lastIdx, 1);
                }
              }
              
              const updates = {
                ...p,
                elo: previousElo,
                matchesPlayed: Math.max(0, (p.matchesPlayed || 0) - 1),
                pointsFor: Math.max(0, (p.pointsFor || 0) - (isTeamA ? match.scoreA : match.scoreB)),
                pointsAgainst: Math.max(0, (p.pointsAgainst || 0) - (isTeamA ? match.scoreB : match.scoreA)),
                pointsBalance: (p.pointsBalance || 0) - ((isTeamA ? match.scoreA : match.scoreB) - (isTeamA ? match.scoreB : match.scoreA)),
                wins: isWinner ? Math.max(0, (p.wins || 0) - 1) : (p.wins || 0),
                losses: !isWinner ? Math.max(0, (p.losses || 0) - 1) : (p.losses || 0),
                dailyMatches: isToday ? Math.max(0, (p.dailyMatches || 0) - 1) : (p.dailyMatches || 0),
                dailyWins: isToday ? (isWinner ? Math.max(0, (p.dailyWins || 0) - 1) : (p.dailyWins || 0)) : (p.dailyWins || 0),
                dailyLosses: isToday ? (!isWinner ? Math.max(0, (p.dailyLosses || 0) - 1) : (p.dailyLosses || 0)) : (p.dailyLosses || 0),
                dailyEloGain: isToday ? (p.dailyEloGain || 0) - eloChange : (p.dailyEloGain || 0),
                dailyResults: isToday ? results : p.dailyResults,
                eloHistory: updatedHistory,
                playedLastMatch: isToday ? false : p.playedLastMatch
              };
              
              localPlayers[pIdx] = updates as any;
            });
          }

          if (isToday) {
            // Forçar reset de todos os campos diários para garantir que a fila de espera esteja limpa
            localPlayers.forEach((p, idx) => {
              localPlayers[idx] = {
                ...p,
                dailyMatches: 0,
                dailyWins: 0,
                dailyLosses: 0,
                dailyEloGain: 0,
                dailyResults: [],
                playedLastMatch: false,
                consecutiveBenched: 0
              } as any;
            });
          }

          // Aplicar atualizações ao lote
          // Identificar quem está presente hoje para não registrar ausentes por acidente
          const attendanceIds = new Set(attendance.map(a => a.id));
          
          localPlayers.forEach(p => {
            const cleanedPlayer = cleanObject(p);
            // Atualizar cadastro global
            batch.set(doc(db, 'players', p.id), cleanedPlayer, { merge: true });
            
            // ATENÇÃO: Só atualizar o documento de presença se o sócio estiver realmente lá
            // Caso contrário, o deleteMatches transformaria todos os sócios em "Presentes"
            if (attendanceIds.has(p.id)) {
              batch.set(doc(db, 'attendance', date, 'players', p.id), cleanedPlayer, { merge: true });
            }
          });
          
          await batch.commit();
          
          // Atualizar o estado local imediatamente para evitar race conditions antes da sincronização
          setPlayers(localPlayers);
          if (isToday) {
            setAttendance(prev => prev.map(a => {
              const updated = localPlayers.find(p => p.id === a.id);
              if (updated) return { ...a, ...updated };
              return a;
            }));
          }
          
          setMatches(matches.filter(m => m.date !== date));
          await refreshPlayers();
          
          showNotification(`${matchesToDelete.length} partidas e estatísticas removidas.`, 'success');
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
    showConfirmModal(
      'Zerar Histórico de Partidas',
      'Deseja excluir TODAS as partidas registradas e limpar os gráficos de evolução? O ELO atual e o total de vitórias/derrotas serão mantidos. Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const matchesSnapshot = await getDocs(collection(db, 'matches'));
          const batch = writeBatch(db);
          
          matchesSnapshot.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });
          
          // Limpar histórico de ELO e resultados diários para os gráficos
          players.forEach(p => {
            if (p.id) {
              batch.set(doc(db, 'players', p.id), {
                eloHistory: [],
                dailyResults: [],
                dailyMatches: 0,
                dailyWins: 0,
                dailyLosses: 0,
                dailyEloGain: 0
              }, { merge: true });
            }
          });
          
          await batch.commit();
          setMatches([]);
          
          setPlayers(players.map(p => ({
            ...p,
            eloHistory: [],
            dailyResults: [],
            dailyMatches: 0,
            dailyWins: 0,
            dailyLosses: 0,
            dailyEloGain: 0
          })));
          
          showNotification('Todo o histórico de partidas e gráficos foram excluídos.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'matches-clear-only');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const clearAllDatabase = async () => {
    showConfirmModal(
      'LIMPEZA TOTAL DO BANCO',
      'CUIDADO EXTREMO: Isso irá excluir TODOS os sócios, partidas, presenças, pagamentos e configurações. Esta ação é IRREVERSÍVEL e o sistema voltará ao estado inicial. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const collections = [
            'players',
            'matches',
            'attendance',
            'payments',
            'pendingRequests',
            'metadata',
            'preConfirmations'
          ];

          for (const collName of collections) {
            const snapshot = await getDocs(collection(db, collName));
            
            if (collName === 'attendance') {
              for (const dateDoc of snapshot.docs) {
                const playersSnapshot = await getDocs(collection(db, `attendance/${dateDoc.id}/players`));
                const subBatch = writeBatch(db);
                playersSnapshot.forEach(p => subBatch.delete(p.ref));
                await subBatch.commit();
                
                const dateBatch = writeBatch(db);
                dateBatch.delete(dateDoc.ref);
                await dateBatch.commit();
              }
            } else {
              const batch = writeBatch(db);
              snapshot.forEach(doc => {
                batch.delete(doc.ref);
              });
              await batch.commit();
            }
          }
          
          showNotification('O banco de dados foi completamente resetado.', 'success');
          setTimeout(() => window.location.reload(), 2000);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'database-clear');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const repairDatabase = async () => {
    showConfirmModal(
      'Reparar Banco de Dados',
      'Isto irá remover sócios sem nome, corrigir dados inconsistentes, RECALCULAR TODAS AS SINERGIAS e INICIALIZAR HISTÓRICO DE ELO. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const batch = writeBatch(db);
          let deletedCount = 0;
          let fixedCount = 0;
          let mergedCount = 0;
          
          // 1. Deduplication pass in the database
          const seenEmails = new Map<string, string>(); // email -> originalId
          const seenUids = new Map<string, string>(); // uid -> originalId
          
          players.forEach(p => {
            if (!p.id) return;
            
            // Check for duplicates by email or UID
            const email = p.email?.trim().toLowerCase();
            const uid = p.uid;
            
            let primaryId: string | null = null;
            if (email && seenEmails.has(email)) primaryId = seenEmails.get(email)!;
            else if (uid && seenUids.has(uid)) primaryId = seenUids.get(uid)!;
            
            if (primaryId && primaryId !== p.id) {
              // This is a duplicate. We should delete it. 
              // (In a more advanced version, we'd merge match history too)
              batch.delete(doc(db, 'players', p.id));
              mergedCount++;
              return;
            }
            
            if (email) seenEmails.set(email, p.id);
            if (uid) seenUids.set(uid, p.id);

            // 2. Original Repair Logic (Basic fields)
            if (!p.name || p.name.trim() === '') {
              batch.delete(doc(db, 'players', p.id));
              deletedCount++;
            } else {
              // Fix missing or invalid fields
              let needsFix = false;
              const updates: any = {};
              
              if (typeof p.elo !== 'number') { updates.elo = 1200; needsFix = true; }
              if (typeof p.matchesPlayed !== 'number') { updates.matchesPlayed = 0; needsFix = true; }
              if (typeof p.wins !== 'number') { updates.wins = 0; needsFix = true; }
              if (typeof p.losses !== 'number') { updates.losses = 0; needsFix = true; }
              if (typeof p.dailyMatches !== 'number') { updates.dailyMatches = 0; needsFix = true; }
              if (typeof p.isOfficialSetter !== 'boolean') { updates.isOfficialSetter = false; needsFix = true; }
              if (typeof p.isAdmin !== 'boolean') { updates.isAdmin = false; needsFix = true; }
              
              if (needsFix) {
                batch.update(doc(db, 'players', p.id), updates);
                fixedCount++;
              }
            }
          });

          // Fix current day attendance names and arrivalOrder
          const dateKey = getFirestoreDateKey();
          const attendanceSnapshot = await getDocs(collection(db, 'attendance', dateKey, 'players'));
          const sortedAtt = attendanceSnapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          sortedAtt.forEach((attData, index) => {
            const fullPlayer = players.find(p => p.id === attData.id);
            
            if (fullPlayer && (!fullPlayer.name || fullPlayer.name.trim() === '')) {
              batch.delete(doc(db, 'attendance', dateKey, 'players', attData.id));
              deletedCount++;
              return;
            }

            const updates: any = {};
            let needsUpdate = false;

            if (fullPlayer && (!attData.name || attData.name !== fullPlayer.name)) {
              updates.name = fullPlayer.name;
              needsUpdate = true;
            }

            // Fix missing or zero arrivalOrder
            if (!attData.arrivalOrder || attData.arrivalOrder === 0) {
              updates.arrivalOrder = index + 1;
              needsUpdate = true;
            }

            if (needsUpdate) {
              batch.update(doc(db, 'attendance', dateKey, 'players', attData.id), updates);
              fixedCount++;
            }
          });
          
          // Fix currentMatch names and data
          if (generationResult) {
            const fixPlayer = (p: any) => {
              const fullP = players.find(fp => fp.id === p.id);
              if (fullP) {
                return {
                  ...p,
                  name: fullP.name,
                  elo: fullP.elo || p.elo || 1200,
                  gender: fullP.gender || p.gender || Gender.MALE,
                  arrivalOrder: p.arrivalOrder || fullP.arrivalOrder || 0
                };
              }
              return p;
            };

            const fixTeam = (team: any) => {
              if (team.setter) {
                team.setter = fixPlayer(team.setter);
              }
              team.players = team.players.map(fixPlayer);
            };
            
            const newResult = { ...generationResult };
            fixTeam(newResult.teamA);
            fixTeam(newResult.teamB);
            newResult.remainingPlayers = newResult.remainingPlayers.map(fixPlayer);
            
            batch.set(doc(db, 'metadata', 'currentMatch'), cleanObject(newResult));
            fixedCount++;
          }

          // Recalcular Sinergias do zero
          const newSynergy: Record<string, number> = {};
          const newNegativeSynergy: Record<string, number> = {};
          const newRivalry: Record<string, number> = {};

          matches.forEach(m => {
            const winners = m.winner === 'A' ? m.teamA : m.teamB;
            const losers = m.winner === 'A' ? m.teamB : m.teamA;

            // Sinergia Positiva
            for (let i = 0; i < winners.length; i++) {
              for (let j = i + 1; j < winners.length; j++) {
                const pair = [winners[i], winners[j]].sort().join('_');
                newSynergy[pair] = (newSynergy[pair] || 0) + 1;
              }
            }

            // Sinergia Negativa
            for (let i = 0; i < losers.length; i++) {
              for (let j = i + 1; j < losers.length; j++) {
                const pair = [losers[i], losers[j]].sort().join('_');
                newNegativeSynergy[pair] = (newNegativeSynergy[pair] || 0) + 1;
              }
            }

            // Rivalidade
            winners.forEach(w => {
              losers.forEach(l => {
                const pair = `${l}_${w}`;
                newRivalry[pair] = (newRivalry[pair] || 0) + 1;
              });
            });
          });

          // New: Deduplicate Payments
          const seenPayments = new Set<string>();
          let paymentDuplicatesRemoved = 0;

          (payments || []).forEach(p => {
            // Unify player, month and amount to identify duplicates
            const key = `${p.playerId}_${p.month}_${p.amount}`;
            if (seenPayments.has(key)) {
              batch.delete(doc(db, 'payments', p.id));
              paymentDuplicatesRemoved++;
            } else {
              seenPayments.add(key);
            }
          });
          
          await batch.commit();

          setSynergy(newSynergy);
          setNegativeSynergy(newNegativeSynergy);
          setRivalry(newRivalry);

          showNotification(`Banco reparado! ${deletedCount} excluídos, ${fixedCount} corrigidos, ${paymentDuplicatesRemoved} duplicatas financeiras removidas e sinergias recalculadas.`, 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'repair-database');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const initializeEloHistory = async () => {
    showConfirmModal(
      'Inicializar Histórico de ELO',
      'Isto irá criar um ponto inicial no histórico de ELO para todos os sócios que ainda não possuem. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          let count = 0;
          
          players.forEach(p => {
            if (!p.eloHistory || p.eloHistory.length === 0) {
              batch.set(doc(db, 'players', p.id), {
                eloHistory: [{ date: getFirestoreDateKey(), elo: p.elo || 1200 }]
              }, { merge: true });
              count++;
            }
          });
          
          await batch.commit();
          showNotification(`${count} históricos de ELO inicializados!`, 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'init-elo-history');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const updateQuotaSettings = async (totalQuota: number) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      await setDoc(doc(db, 'metadata', 'system'), { 
        dailyReadQuota: totalQuota 
      }, { merge: true });
      showNotification('Configurações de cota atualizadas!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'update-quota');
    } finally {
      setIsSyncing(false);
    }
  };

  const savePlayer = async (playerData: Partial<Player>) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const id = playerData.id || generateUUID();
      
      // Check for duplicate names if this is a new player
      if (!playerData.id && playerData.name) {
        const normalizedName = playerData.name.trim().toLowerCase();
        const isDuplicate = players.some(p => p.name.trim().toLowerCase() === normalizedName);
        if (isDuplicate) {
          showNotification(`Já existe um sócio cadastrado com o nome "${playerData.name}".`, 'error');
          return;
        }
      }

      const existingPlayer = players.find(p => p.id === id);
      const playerRef = doc(db, 'players', id);
      
      const isNewPlayer = !playerData.id;
      let finalStatus = playerData.status || 'active';

      if (isNewPlayer) {
        const activeCount = players.filter(p => p.status === 'active').length;
        const waitlistCount = players.filter(p => p.status === 'waitlist').length;

        if (activeCount >= MAX_ACTIVE_MEMBERS) {
          if (waitlistCount >= WAITLIST_LIMIT) {
            showNotification(`Limite de sócios (32) e lista de espera (5) atingidos. Não é possível adicionar novos sócios.`, 'error');
            return;
          }
          finalStatus = 'waitlist';
          showNotification(`Limite de 32 sócios atingido. ${playerData.name || 'O novo sócio'} foi adicionado à lista de espera.`, 'info');
        } else {
          finalStatus = 'active';
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
        createdAt: playerData.createdAt || Date.now(),
        phone: playerData.phone ? (() => {
          let cleaned = playerData.phone.replace(/\D/g, '');
          if (cleaned.length === 10) {
             // Example: 81 97330924 -> 81 997330924
             // Add 9 after DDD (positions 0, 1)
             cleaned = cleaned.substring(0, 2) + '9' + cleaned.substring(2);
          }
          if (cleaned.length === 11 && !cleaned.startsWith('55')) {
             cleaned = '55' + cleaned;
          }
          return cleaned.length >= 10 ? cleaned : undefined;
        })() : undefined
      };

      // Validate player data
      const validatedData = playerSchema.parse(finalData);

      if (validatedData.email === '') {
        delete (validatedData as any).email;
      }

      // Handle Rodney's setter status transition if not already set
      if (id === RODNEY_ID && validatedData.isOfficialSetter && !validatedData.setterStartDate) {
        (validatedData as any).setterStartDate = RODNEY_SETTER_START_DATE;
      }

      const batch = writeBatch(db);
      batch.set(playerRef, cleanObject(validatedData), { merge: true });

      // Sincronização Automática com a Lista de Presença do Dia
      // Se o sócio estiver na lista de presença, atualiza o status de levantador lá também
      const today = getFirestoreDateKey();
      const attendanceRef = doc(db, 'attendance', today, 'players', id);
      
      // Verificamos se o jogador está na lista de presença atual
      const isInAttendance = attendance.some(p => p.id === id);
      if (isInAttendance) {
        batch.set(attendanceRef, {
          isOfficialSetter: validatedData.isOfficialSetter,
          setterStartDate: (validatedData as any).setterStartDate || null
        }, { merge: true });
      }

      await batch.commit();
      await trackUsage(0, 1);

      // Audit Logging
      if (isNewPlayer) {
        await logAction(AuditAction.CREATE_PLAYER, id, validatedData.name);
      } else if (existingPlayer) {
        // Detect Status changes
        if (existingPlayer.status !== finalStatus) {
          if (finalStatus === 'inactive') {
            await logAction(AuditAction.INACTIVATE_PLAYER, id, validatedData.name);
          } else if (finalStatus === 'active') {
            await logAction(AuditAction.ACTIVATE_PLAYER, id, validatedData.name);
          }
        }
        
        // Detect DM changes
        if (existingPlayer.isDM !== validatedData.isDM) {
          if (validatedData.isDM) {
            await logAction(AuditAction.ENTER_DM, id, validatedData.name);
          } else {
            await logAction(AuditAction.EXIT_DM, id, validatedData.name);
          }
        }
      }

      showNotification(playerData.id ? 'Sócio atualizado!' : 'Sócio cadastrado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players-save');
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshPlayers = async () => {
    showNotification('Sincronizando dados...', 'info');
    useStore.setState(state => ({ syncTrigger: state.syncTrigger + 1 }));
  };

  const fixDatabaseAnomalies = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      showNotification('Iniciando Auditoria e Reparo de Dados...', 'info');
      
      const batch = writeBatch(db);
      const now = Date.now();
      let updates = 0;

      // 1. Fix 0-0 scores where there's a winner
      matches.forEach(m => {
        if (m.scoreA === 0 && m.scoreB === 0 && m.winner) {
          const newScoreA = m.winner === 'A' ? 25 : 23;
          const newScoreB = m.winner === 'B' ? 25 : 23;
          batch.set(doc(db, 'matches', m.id), {
            scoreA: newScoreA,
            scoreB: newScoreB
          }, { merge: true });
          updates++;
        }
      });

      // 2. Fix future dates and reset threshold
      let newResetThreshold = systemMetadata.lastResetTimestamp;
      if (systemMetadata.lastResetTimestamp && systemMetadata.lastResetTimestamp > now) {
        newResetThreshold = now - (16 * 60 * 60 * 1000); // 16 hours ago
        batch.set(doc(db, 'metadata', 'system'), {
          lastResetTimestamp: newResetThreshold
        }, { merge: true });
        updates++;
      }
      
      const allSortedMatches = [...(matches || [])].sort((a, b) => a.timestamp - b.timestamp);
      
      const getCorrectDate = (ts: number) => {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(ts));
      };

      const dateMapping = new Map<string, string>(); // Maps old match dates to clean session dates

      allSortedMatches.forEach(m => {
        const currentSessionBaseDate = getCorrectDate(m.timestamp);
        
        dateMapping.set(m.date, currentSessionBaseDate);

        if (m.date !== currentSessionBaseDate) {
          batch.set(doc(db, 'matches', m.id), { date: currentSessionBaseDate }, { merge: true });
          updates++;
        }
      });

      // 3. Fix Player Elo History (Flatten same-day entries, fix dates)
      players.forEach(p => {
        if (!p.eloHistory || p.eloHistory.length === 0) return;
        
        let historyChanged = false;
        const cleanedHistory = p.eloHistory.map((h: any) => {
          let hDate = h.date;
          // Fix ISO strings
          if (hDate.includes('T')) {
            hDate = getCorrectDate(new Date(hDate).getTime());
            historyChanged = true;
          }
          // Align with session dates
          if (dateMapping.has(hDate) && dateMapping.get(hDate) !== hDate) {
            hDate = dateMapping.get(hDate)!;
            historyChanged = true;
          }

          return { ...h, date: hDate };
        });

        // Deduplicate entries for the same day (keep last one)
        const dayMap = new Map();
        cleanedHistory.forEach(h => {
          dayMap.set(h.date, h.elo);
        });

        if (dayMap.size !== p.eloHistory.length) historyChanged = true;

        if (historyChanged) {
          const finalHistory = Array.from(dayMap.entries())
            .map(([date, elo]) => ({ date, elo }))
            .sort((a, b) => a.date.localeCompare(b.date));

          batch.set(doc(db, 'players', p.id), { eloHistory: finalHistory }, { merge: true });
          updates++;
        }
      });

      // 4. Fix Metadata Count
      const sessionThreshold = newResetThreshold || (now - 16 * 60 * 60 * 1000);
      const sessionMatches = allSortedMatches.filter(m => m.timestamp > sessionThreshold);
      const expectedCount = sessionMatches.length + (generationResult ? 1 : 0);

      if (systemMetadata.dailyMatchCount !== expectedCount) {
        batch.set(doc(db, 'metadata', 'system'), {
          dailyMatchCount: expectedCount
        }, { merge: true });
        updates++;
      }

      if (updates > 0) {
        await batch.commit();
        showNotification(`Auditoria Finalizada: ${updates} inconsistências corrigidas com sucesso!`, 'success');
      } else {
        showNotification('Nenhuma anomalia crítica encontrada para correção.', 'info');
      }
    } catch (error) {
      console.error('Erro ao corrigir anomalias:', error);
      handleFirestoreError(error, OperationType.WRITE, 'fix-anomalies');
    } finally {
      setIsSyncing(false);
    }
  };


  const recalculateAllElo = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      showNotification('Recalculando todos os pontos ELO desde o início...', 'info');

      // 1. Pegar todos os jogadores e limpar estatísticas para o estado inicial
      const initialPlayers = players.map(p => ({
        ...p,
        elo: 1200,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointsBalance: 0,
        eloHistory: [],
        dailyEloGain: 0,
        dailyWins: 0,
        dailyLosses: 0,
        dailyMatches: 0,
        dailyResults: [],
        fidelityPoints: 0,
        lastFidelityDate: null,
        trueSkill: { mu: 25, sigma: 25 / 3 }
      }));

      const playerMap = new Map<string, any>();
      initialPlayers.forEach(p => playerMap.set(p.id, p));

      // 1.5. Carregar histórico de presenças para aplicar bônus de elo estritamente pelos dias de presença
      let attendanceHistory: Record<string, Player[]> = {};
      try {
        const { fetchAttendanceHistory } = await import('../services/attendanceService');
        attendanceHistory = await fetchAttendanceHistory();
      } catch (err) {
        console.error("Erro ao carregar histórico de presenças para o recálculo do ELO", err);
      }

      const matchDates = new Set(matches.map(m => m.date));
      const playerAttendanceDates = new Map<string, Set<string>>();
      Object.entries(attendanceHistory).forEach(([dateStr, dayPlayers]) => {
        if (!matchDates.has(dateStr)) return; // Apenas dias de jogo que possuem partidas registradas no banco
        dayPlayers.forEach(p => {
          if (p.id) {
            if (!playerAttendanceDates.has(p.id)) {
              playerAttendanceDates.set(p.id, new Set());
            }
            playerAttendanceDates.get(p.id)!.add(dateStr);
          }
        });
      });

      // 2. Criar cronograma unificado de eventos ordenados chronologicamente (partidas e presenças)
      const events: any[] = [];

      // Adicionar partidas
      const sortedMatches = [...matches].sort((a, b) => a.timestamp - b.timestamp);
      sortedMatches.forEach(m => {
        events.push({
          type: 'match',
          date: m.date,
          timestamp: m.timestamp,
          match: m
        });
      });

      // Adicionar presenças como eventos
      playerAttendanceDates.forEach((datesSet, playerId) => {
        datesSet.forEach(dateStr => {
          const [year, month, day] = dateStr.split('-').map(Number);
          // Define o timestamp para o início do dia para processar o bônus antes das partidas daquele dia
          const dayTimestamp = new Date(year, month - 1, day, 0, 0, 0).getTime();
          events.push({
            type: 'attendance',
            date: dateStr,
            timestamp: dayTimestamp,
            playerId: playerId
          });
        });
      });

      // Ordenar eventos cronologicamente (se empate, attendance vem antes de match)
      events.sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        if (a.type !== b.type) {
          return a.type === 'attendance' ? -1 : 1;
        }
        return 0;
      });

      // 3. Processar cronologicamente os eventos
      events.forEach(event => {
        if (event.type === 'attendance') {
          const p = playerMap.get(event.playerId);
          if (p) {
            // Aplicar bônus de fidelidade apenas uma vez por dia
            if (p.lastFidelityDate !== event.date) {
              p.fidelityPoints = (p.fidelityPoints || 0) + 50;
              p.lastFidelityDate = event.date;
              p.elo = p.elo + 50;

              p.eloHistory.push({
                date: event.date,
                elo: p.elo,
                matchId: `fidelity-bonus-${event.date}-${event.timestamp}`,
                change: 50,
                timestamp: event.timestamp,
                result: 'P',
                fidelityBonus: true
              });

              if (event.date === getFirestoreDateKey()) {
                p.dailyEloGain += 50;
              }
            }
          }
        } else if (event.type === 'match') {
          const m = event.match;
          const winner = m.winner;
          if (!winner) return;

          const teamAIds = m.teamA;
          const teamBIds = m.teamB;

          const teamAPlayers = teamAIds.map(id => playerMap.get(id)).filter(Boolean);
          const teamBPlayers = teamBIds.map(id => playerMap.get(id)).filter(Boolean);

          // Update Eficiência Técnica
          const tsUpdates = calculateTrueSkillUpdate(teamAPlayers, teamBPlayers, winner);
          tsUpdates.forEach(u => {
            const p = playerMap.get(u.playerId);
            if (p) p.trueSkill = u.newTrueSkill;
          });

          // Update ELO Fixo (+20/-20)
          const updateStats = (pId: string, isTeamA: boolean) => {
            const p = playerMap.get(pId);
            if (!p) return;

            // Salvaguarda: se por acaso jogou a partida mas não constava na lista de presenças do dia, ganha o bônus aqui
            if (p.lastFidelityDate !== m.date) {
              p.fidelityPoints = (p.fidelityPoints || 0) + 50;
              p.lastFidelityDate = m.date;
              p.elo = p.elo + 50;

              p.eloHistory.push({
                date: m.date,
                elo: p.elo,
                matchId: `fidelity-bonus-${m.date}-${m.timestamp - 1000}`,
                change: 50,
                timestamp: m.timestamp - 1000,
                result: 'P',
                fidelityBonus: true
              });

              if (m.date === getFirestoreDateKey()) {
                p.dailyEloGain += 50;
              }
            }

            const isWinner = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
            const change = isWinner ? 20 : -20;
            const newElo = Math.max(800, p.elo + change);

            p.elo = newElo;
            p.matchesPlayed++;
            if (isWinner) p.wins++; else p.losses++;

            p.pointsFor += isTeamA ? (m.scoreA || 0) : (m.scoreB || 0);
            p.pointsAgainst += isTeamA ? (m.scoreB || 0) : (m.scoreA || 0);
            p.pointsBalance = (p.pointsBalance || 0) + ((isTeamA ? (m.scoreA || 0) : (m.scoreB || 0)) - (isTeamA ? (m.scoreB || 0) : (m.scoreA || 0)));

            p.eloHistory.push({
              date: m.date,
              elo: newElo,
              matchId: m.id,
              change: change,
              timestamp: m.timestamp,
              result: isWinner ? 'V' : 'D'
            });

            // UPDATE DAILY STATS FOR CURRENT DAY
            if (m.date === getFirestoreDateKey()) {
              p.dailyEloGain += change;
              p.dailyMatches++;
              if (isWinner) {
                p.dailyWins++;
                p.dailyResults.push('V');
              } else {
                p.dailyLosses++;
                p.dailyResults.push('D');
              }
            }
          };

          teamAIds.forEach(id => updateStats(id, true));
          teamBIds.forEach(id => updateStats(id, false));
        }
      });

      // 4. Salvar tudo em batches (limite 500 ops por batch)
      const playerStates = Array.from(playerMap.values());
      const BATCH_SIZE = 100; // Safer batch size
      for (let i = 0; i < playerStates.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = playerStates.slice(i, i + BATCH_SIZE);
        chunk.forEach(p => {
          const playerRef = doc(db, 'players', p.id);
          // Fatiar histórico para não exceder limites de documento
          const finalHistory = (p.eloHistory || []).slice(-200);
          batch.set(playerRef, cleanObject({ ...p, eloHistory: finalHistory }), { merge: true });
        });
        await batch.commit();
      }

      showNotification('Recálculo de ELO concluído com sucesso!', 'success');
      // Forçar atualização local
      useStore.setState(state => ({ syncTrigger: state.syncTrigger + 1 }));
    } catch (error) {
      console.error('Erro no recálculo:', error);
      showNotification('Falha ao recalcular pontos ELO.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };


  const handleScanAnomalies = async () => {
    if (!checkAIQuota()) return;
    try {
      setIsScanningAnomalies(true);
      setAnomalyReport(null);
      showNotification('Iniciando varredura de anomalias...', 'info');
      
      const report = await detectAnomalies({
        players,
        matches,
        metadata: systemMetadata
      });
      
      setAnomalyReport(report);
      await trackAIUsage(1);
      showNotification('Varredura concluída!', 'success');
    } catch (error) {
      console.error("Erro na varredura:", error);
      showNotification('Falha ao realizar varredura de anomalias.', 'error');
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
      window.sessionStorage.removeItem('last_access_tracked');
      
      showNotification('Sessão encerrada. Até logo!', 'info');
      
      // Keep the goodbye message for 2 seconds
      setTimeout(() => {
        setIsLoggingOut(false);
      }, 2500);
    } catch (error) {
      console.error('Erro ao sair:', error);
      setIsLoggingOut(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isInIframe = window.self !== window.top;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!(window.navigator as any).standalone;
      
      // Standalone PWAs and Iframe environments are highly sensitive to partitioned storage which causes signInWithRedirect to fail (missing initial state).
      // Standard mobile browsers outside standalone mode can support redirect if popups are blocked.
      // Therefore, we ALWAYS try popup first, as it is much cleaner and preserves state on modern mobile/tablets/desktop/PWAs.
      let result;
      try {
        console.log('Initiating Google Sign-In with popup. Standalone:', isStandalone, 'Iframe:', isInIframe);
        result = await signInWithPopup(auth, googleProvider);
      } catch (popupError: any) {
        console.warn('Google Sign-In with popup failed or was blocked:', popupError);
        
        // Fall back to redirect login only if popups are blocked AND we are in a safe redirect environment (no iframe, not standalone PWA)
        const isPopupBlocked = popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/cancelled-popup-request';
        
        if (!isStandalone && (isMobile || isPopupBlocked)) {
          console.log('Falling back to redirect login...');
          await signInWithRedirect(auth, googleProvider);
          return; // Redirecting...
        }
        
        if (isPopupBlocked) {
          showNotification('O pop-up de login foi bloqueado. Por favor, libere pop-ups nas configurações ou toque em "Abrir em Nova Aba".', 'error');
        }
        
        throw popupError;
      }

      const user = result.user;
      
      if (!user.email) {
        await signOut(auth);
        showNotification('Erro: E-mail não fornecido pelo Google.', 'error');
        return;
      }

      const trimmedEmail = user.email.trim().toLowerCase();
      const isAdminEmail = trimmedEmail === 'rodneyes@gmail.com';
      
      // Check if player exists in the system
      const player = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail);
      
      if (!player && !isAdminEmail) {
        await signOut(auth);
        showNotification('Acesso negado: Este e-mail não está cadastrado como sócio ou administrador.', 'error');
        return;
      }

      showNotification('Login realizado com sucesso!', 'success');
    } catch (error: any) {
      console.error('Erro no login com Google:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        showNotification('Login cancelado.', 'info');
      } else if (error.code === 'auth/admin-restricted-operation') {
        showNotification('Erro: Login com Google desativado. Ative-o no Console do Firebase (Authentication > Sign-in method).', 'error');
      } else if (error.code === 'auth/unauthorized-domain') {
        showNotification('Erro: Domínio não autorizado. Adicione este domínio no Console do Firebase (Authentication > Settings > Authorized domains).', 'error');
      } else {
        showNotification(`Erro ao fazer login com Google: ${error.message}`, 'error');
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
      const isAdminEmail = trimmedEmail === 'rodneyes@gmail.com';

      if (players.length === 0 && !isAdminEmail) {
        showNotification('Carregando lista de sócios... Tente novamente em instantes.', 'info');
        return;
      }

      const player = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail);
      
      if (player || isAdminEmail) {
        window.localStorage.setItem('simpleLoginEmail', trimmedEmail);
        await signInAnonymously(auth);
        
        // Save to recent logins
        try {
          const recentLogins = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
          const newRecent = [trimmedEmail, ...recentLogins.filter((e: string) => e !== trimmedEmail)].slice(0, 3);
          window.localStorage.setItem('recentLogins', JSON.stringify(newRecent));
        } catch (e) {
          console.error('Error saving recent logins', e);
        }
        
        showNotification('Login realizado com sucesso!', 'success');
      } else {
        showNotification('E-mail não encontrado na lista de sócios.', 'error');
      }
    } catch (error: any) {
      console.error('Erro ao fazer login:', error);
      if (error.code === 'auth/admin-restricted-operation') {
        showNotification('ERRO CRÍTICO: O Login Anônimo está desativado no seu Firebase. Para corrigir: Acesse o Console do Firebase > Authentication > Sign-in method > Adicionar novo provedor > Anônimo > Ativar.', 'error');
      } else if (error.code === 'auth/operation-not-allowed') {
        showNotification('Erro: Provedor de login desativado no Firebase Console.', 'error');
      } else {
        showNotification(`Erro ao fazer login: ${error.message}`, 'error');
      }
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !requestName) return;
    setIsRequestingAccess(true);
    try {
      await addDoc(collection(db, 'pendingRequests'), {
        uid: user.uid,
        email: user.email,
        name: requestName,
        timestamp: Date.now(),
        status: 'pending'
      });
      setIsRequestSubmitted(true);
      showNotification('Solicitação enviada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao solicitar acesso:', error);
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
    const threshold = systemMetadata.lastResetTimestamp || (now - (16 * 60 * 60 * 1000));
    const sessionMatches = (matches || []).filter(m => m.timestamp > threshold);

    try {
      // 1. Clona e normaliza de forma estritamente imutável preservando a formação validada
      const result = cloneGenerationResultImmutably(resultToApply, players, attendance);

      // 2. Extrai com segurança os atletas escalados para a quadra
      const onCourtPlayers = [
        result.teamA?.setter,
        ...(result.teamA?.players || []),
        result.teamB?.setter,
        ...(result.teamB?.players || [])
      ].filter(Boolean) as Player[];

      const onCourtIds = new Set(onCourtPlayers.map(p => p.id));

      // 3. Persistir partida no Firestore para sincronização entre admins e sócios
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(result));
      await trackUsage(0, 1);

      // 4. Calcular número da partida
      const maxDailyNumber = sessionMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
      const matchNumber = maxDailyNumber + 1;

      const batch = writeBatch(db);
      let hasNotifications = false;

      for (const player of onCourtPlayers) {
        const playerRef = doc(db, 'attendance', getFirestoreDateKey(), 'players', player.id);
        const prevPlayed = attendance.find(a => a.id === player.id)?.consecutivePlayed || 0;
        batch.set(playerRef, { playedLastMatch: true, consecutivePlayed: prevPlayed + 1, consecutiveBenched: 0 }, { merge: true });
        hasNotifications = true;
      }

      const attendanceList = attendance.filter(p => !p.status || p.status === 'active');
      for (const att of attendanceList) {
        if (!onCourtIds.has(att.id)) {
          const playerRef = doc(db, 'attendance', getFirestoreDateKey(), 'players', att.id);
          batch.set(playerRef, { playedLastMatch: false, consecutivePlayed: 0, consecutiveBenched: (att.consecutiveBenched || 0) + 1 }, { merge: true });
          hasNotifications = true;
        }
      }

      // Notificações FCM e In-App para jogadores em quadra e fila
      const playersToNotifyWithTokens = [
        ...onCourtPlayers,
        ...(result.remainingPlayers ? result.remainingPlayers.slice(0, 12) : [])
      ].filter(p => p && p.id && p.fcmToken);

      const notificationData = await Promise.all(playersToNotifyWithTokens.map(async (p) => {
        try {
          const q = query(collection(db, 'notifications'), where('playerUid', '==', p!.uid), where('read', '==', false));
          const snap = await getDocs(q);
          return { id: p!.id, unreadCount: snap.size + 1 };
        } catch (e) {
          return { id: p!.id, unreadCount: 1 };
        }
      }));

      const queueNotification = (player: Player | null | undefined, title: string, body: string) => {
        if (player) {
          const appNotifRef = doc(collection(db, 'notifications'));
          batch.set(appNotifRef, {
            playerId: player.id,
            playerUid: player.uid || null,
            title,
            message: body,
            createdAt: Date.now(),
            read: false,
            type: 'match'
          });

          if (player.fcmToken && systemMetadata.matchNotificationsGlobalEnabled !== false && player.matchNotificationsEnabled !== false) {
            const unreadCount = notificationData.find(d => d.id === player.id)?.unreadCount || 1;
            const notificationRef = doc(collection(db, 'fcm_messages'));
            batch.set(notificationRef, {
              token: player.fcmToken,
              notification: { title, body: body, sound: 'default' },
              data: {
                unreadCount: String(unreadCount),
                type: 'match'
              },
              createdAt: serverTimestamp()
            });
          }
          hasNotifications = true;
        }
      };

      // Notificar Equipe A
      const notifyTeamA = (p: Player | null | undefined) => {
        if (!p) return;
        const otherTeammates = [result.teamA.setter, ...result.teamA.players]
          .filter(tp => tp && tp.id !== p.id)
          .map(tp => tp!.name)
          .join(', ');

        queueNotification(
          p,
          `Partida #${matchNumber} - Sua vez!`,
          `Você está na Equipe A com: ${otherTeammates}.\nHoje: ${p.dailyWins || 0}V / ${p.dailyLosses || 0}D.\nDirija-se à quadra!`
        );
      };
      notifyTeamA(result.teamA.setter);
      result.teamA.players.forEach(notifyTeamA);

      // Notificar Equipe B
      const notifyTeamB = (p: Player | null | undefined) => {
        if (!p) return;
        const otherTeammates = [result.teamB.setter, ...result.teamB.players]
          .filter(tp => tp && tp.id !== p.id)
          .map(tp => tp!.name)
          .join(', ');

        queueNotification(
          p,
          `Partida #${matchNumber} - Sua vez!`,
          `Você está na Equipe B com: ${otherTeammates}.\nHoje: ${p.dailyWins || 0}V / ${p.dailyLosses || 0}D.\nDirija-se à quadra!`
        );
      };
      notifyTeamB(result.teamB.setter);
      result.teamB.players.forEach(notifyTeamB);

      // Notificar Próximos na Fila
      if (result.remainingPlayers) {
        const nextPlayers = result.remainingPlayers.slice(0, 12);
        nextPlayers.forEach(p => {
          queueNotification(
            p,
            `Prepare-se!`,
            `Você está na próxima partida. Fique atento!`
          );
        });
      }

      if (hasNotifications) {
        await batch.commit();
      }

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
      }).catch(err => console.error("Pre-generation error:", err));

      setDoc(doc(db, 'metadata', 'system'), cleanObject({
        dailyMatchCount: matchNumber,
        matchStartTime: now
      }), { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));

      setSystemMetadata({
        ...systemMetadata,
        dailyMatchCount: matchNumber,
        matchStartTime: now
      });

      showNotification(`Partida #${matchNumber} escalada com sucesso!`, 'success');
    } catch (err) {
      console.error("Erro ao aplicar pré-visualização de partida:", err);
      showNotification("Erro ao aplicar escalação. Tente novamente.", "error");
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
      : attendance.filter(p => !p.status || p.status === 'active');

    // Filter out DMs
    playersToUse = playersToUse.filter(p => !p.isDM);

    // Enrich players with full data from the master players list and attendance state
    playersToUse = playersToUse.map(p => enrichPlayerImmutably(p, players, attendance));

    if (playersToUse.length < 12) {
      showNotification("Para gerar uma partida equilibrada, são necessários no mínimo 12 sócios presentes.", "info");
      return;
    }

    // EXTRAI OS 12 QUE VÃO JOGAR A PARTIDA
    const { topPlayers: matchPool } = getPriorityQueue(playersToUse, 12, 2);
    const numOfficialSetters = matchPool.filter(p => p.isOfficialSetter).length;
    const numLinePlayers = matchPool.filter(p => !p.isOfficialSetter).length;

    const hasCond1 = numOfficialSetters >= 2 && (numOfficialSetters + numLinePlayers === 12);
    const hasCond2 = numOfficialSetters === 0 && numLinePlayers === 12;
    const hasCond3 = numOfficialSetters === 1 && numLinePlayers === 11;

    if (!hasCond1 && !hasCond2 && !hasCond3) {
      showNotification(
        `Condições mínimas para geração não atendidas! Para que a partida seja gerada, os 12 selecionados devem ter exatamente: ` +
        `2 levantadores oficiais e 10 de linha, OU 12 de linha e 0 levantadores, OU 11 de linha e 1 levantador oficial. ` +
        `(Composição dos 12 escalados: ${numOfficialSetters} levantadores oficiais, ${numLinePlayers} jogadores de linha)`,
        "error"
      );
      return;
    }

    const startGenerationFlow = (forceNoTemporarySetters: boolean) => {
      const performGeneration = async () => {
        if (navigator.vibrate) navigator.vibrate(50);
        setIsSyncing(true);
        triggerDbStatus('writing');

        let result: any = null;
        const now = Date.now();
        const threshold = systemMetadata.lastResetTimestamp || (now - (16 * 60 * 60 * 1000));
        const sessionMatches = (matches || []).filter(m => m.timestamp > threshold);

        try {
          // Reunir formações anteriores para evitar repetições
          const previousFormations = sessionMatches.map(m => ({
            setterA: m.teamA[0],
            playersA: m.teamA.slice(1),
            setterB: m.teamB[0],
            playersB: m.teamB.slice(1)
          }));

          // Reunir histórico completo para cálculo de sinergia negativa (Machine Learning Simulation)
          const allMatchHistory = (matches || []).map(m => ({
            teamA: m.teamA,
            teamB: m.teamB,
            winner: m.winner as 'A' | 'B',
            timestamp: m.timestamp
          }));

          const useTrueSkill = teamGenerationMode === 'TRUESKILL';
          
          let bestResult = null;
          let minDelta = Infinity;

          for (let i = 0; i < 50; i++) {
            let genRes = generateTeams(playersToUse, previousFormations, useTrueSkill, forceNoTemporarySetters, allMatchHistory, balancingStrategy, balancingRatingMode);
            genRes = optimizeTeamSynergyIteratively(genRes, allMatchHistory, useTrueSkill, balancingStrategy, balancingRatingMode, previousFormations);
            
            const statsA = (genRes.teamA.players.reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0) + calculateCompositePerformanceRating(genRes.teamA.setter || { elo: 0 } as any));
            const statsB = (genRes.teamB.players.reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0) + calculateCompositePerformanceRating(genRes.teamB.setter || { elo: 0 } as any));
            const delta = Math.abs(statsA - statsB);
            
            if (delta < minDelta) {
              minDelta = delta;
              bestResult = genRes;
            }
          }
          
          let genRes = bestResult!;
          
          result = cloneGenerationResultImmutably(genRes, players, attendance);
          result.timestamp = now;
          
          // Persistir partida no Firestore para outros admins
          await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(result));
          await trackUsage(0, 1);

          // Calcular número da partida
          const maxDailyNumber = sessionMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
          const matchNumber = isReshuffle ? maxDailyNumber : maxDailyNumber + 1;

          // Nomes dos times
          const teamANames = [result.teamA.setter?.name, ...result.teamA.players.map(p => p.name)].filter(Boolean).join(', ');
          const teamBNames = [result.teamB.setter?.name, ...result.teamB.players.map(p => p.name)].filter(Boolean).join(', ');

          const batch = writeBatch(db);
          let hasNotifications = false;

          // Prepare unread counts for all players involved in the notification
          const playersToNotify = [
            result.teamA.setter, 
            ...result.teamA.players, 
            result.teamB.setter, 
            ...result.teamB.players, 
            ...result.remainingPlayers.slice(0, 12)
          ].filter(p => p && p.id && p.fcmToken);

          const notificationData = await Promise.all(playersToNotify.map(async (p) => {
            try {
              const q = query(collection(db, 'notifications'), where('playerUid', '==', p!.uid), where('read', '==', false));
              const snap = await getDocs(q);
              return { id: p!.id, unreadCount: snap.size + 1 };
            } catch (e) {
              return { id: p!.id, unreadCount: 1 };
            }
          }));

          // Função auxiliar para enfileirar notificação
          const queueNotification = (player: Player | null | undefined, title: string, body: string) => {
            if (player) {
              // Save to in-app notifications (this also triggers the Cloud Function for push)
              const appNotifRef = doc(collection(db, 'notifications'));
              batch.set(appNotifRef, {
                playerId: player.id,
                playerUid: player.uid || null,
                title,
                message: body,
                createdAt: Date.now(),
                read: false,
                type: 'match'
              });

              // Legacy FCM trigger (optional, if Cloud Function is not yet deployed or for redundancy)
              if (player.fcmToken && systemMetadata.matchNotificationsGlobalEnabled !== false && player.matchNotificationsEnabled !== false) {
                const unreadCount = notificationData.find(d => d.id === player.id)?.unreadCount || 1;
                const notificationRef = doc(collection(db, 'fcm_messages'));
                batch.set(notificationRef, {
                  token: player.fcmToken,
                  notification: { title, body: body, sound: 'default' },
                  data: {
                    unreadCount: String(unreadCount),
                    type: 'match'
                  },
                  createdAt: serverTimestamp()
                });
              }
              hasNotifications = true;
            }
          };

          // Notificar Equipe A
          const notifyTeamA = (p: Player | null | undefined) => {
            if (!p) return;
            const otherTeammates = [result.teamA.setter, ...result.teamA.players]
              .filter(tp => tp && tp.id !== p.id)
              .map(tp => tp!.name)
              .join(', ');
    
            queueNotification(
              p,
              `Partida #${matchNumber} - Sua vez!`,
              `Você está na Equipe A com: ${otherTeammates}.\nHoje: ${p.dailyWins || 0}V / ${p.dailyLosses || 0}D.\nDirija-se à quadra!`
            );
          };
          notifyTeamA(result.teamA.setter);
          result.teamA.players.forEach(notifyTeamA);
    
          // Notificar Equipe B
          const notifyTeamB = (p: Player | null | undefined) => {
            if (!p) return;
            const otherTeammates = [result.teamB.setter, ...result.teamB.players]
              .filter(tp => tp && tp.id !== p.id)
              .map(tp => tp!.name)
              .join(', ');
    
            queueNotification(
              p,
              `Partida #${matchNumber} - Sua vez!`,
              `Você está na Equipe B com: ${otherTeammates}.\nHoje: ${p.dailyWins || 0}V / ${p.dailyLosses || 0}D.\nDirija-se à quadra!`
            );
          };
          notifyTeamB(result.teamB.setter);
          result.teamB.players.forEach(notifyTeamB);

          // Notificar Próximos (Fila de Espera)
          const nextPlayers = result.remainingPlayers.slice(0, 12);
          nextPlayers.forEach(p => {
            queueNotification(
              p,
              `Prepare-se!`,
              `Você está na próxima partida. Fique atento!`
            );
          });

          if (hasNotifications) {
            await batch.commit();
            console.log('Notificações FCM enviadas para a fila.');
          }

        } catch (err) {
          console.error("Erro ao persistir partida ou enviar notificações:", err);
          showNotification("Erro ao processar escalação. Tente novamente.", "error");
        } finally {
          setIsSyncing(false);
        }

        setGenerationResult(result);
        setAnalysis('');
        setRuleVerification('');
        setViewMode('generation');
        setScoreA(0);
        setScoreB(0);
        setTempScoreA('0');
        setTempScoreB('0');
        setScoreMode('QUICK');

        // Pre-generate audio for team announcement
        generateTeamAnnouncementAudio(result.teamA, result.teamB).then(audio => {
          if (audio) setNarrationAudio(audio);
        }).catch(err => console.error("Pre-generation error:", err));

        if (!isReshuffle) {
          const maxDailyNumber = sessionMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
          const newCount = maxDailyNumber + 1;
          
          setDoc(doc(db, 'metadata', 'system'), cleanObject({
            dailyMatchCount: newCount,
            matchStartTime: now
          }), { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));

          setSystemMetadata({
            ...systemMetadata,
            dailyMatchCount: newCount,
            matchStartTime: now
          });
        }
        
        showNotification(isReshuffle ? "Jogadores reorganizados!" : "Nova escalação gerada com sucesso!", "success");
      };

      if (generationResult) {
        showConfirmModal(
          isReshuffle ? 'Reorganizar Equipes' : 'Nova Escalação',
          isReshuffle 
            ? 'Deseja trocar os jogadores de lado mantendo apenas estes 12 em quadra? O placar será zerado.'
            : 'Deseja descartar a escalação atual e gerar uma nova? O progresso atual será perdido.',
          () => {
            performGeneration();
            hideConfirmModal();
          }
        );
      } else {
        performGeneration();
      }
    };

    const onConfirmStrategy = (forceNoTemporarySetters: boolean) => {
      startGenerationFlow(forceNoTemporarySetters);
    };

    // TRIGGER OR SHOW STRATEGY SELECTION
    if (hasCond2 || hasCond3) {
      const showSetterStrategyModal = useStore.getState().showSetterStrategyModal;
      showSetterStrategyModal(
        "Configuração de Levantadores",
        hasCond2
          ? "Não há levantadores oficiais nos 12 sócios selecionados. Como deseja estruturar as equipes para este sorteio?"
          : "Há apenas 1 levantador oficial entre os 12 sócios selecionados. Como deseja estruturar o outro time?",
        (strategy) => {
          const forceNoTemp = strategy === 'EVERYONE_SETS';
          onConfirmStrategy(forceNoTemp);
        },
        () => {
          console.log("Sorteio cancelado pelo usuário.");
        }
      );
    } else {
      // Condição 1: 2 levantadores oficiais e 10 de linha
      onConfirmStrategy(false);
    }
  };

  const handleDiscard = () => {
    console.log('handleDiscard called');
    const { generationResult } = useStore.getState();
    console.log('generationResult:', generationResult);
    if (!generationResult) {
      console.log('Discard aborted: No generationResult');
      return;
    }
    showConfirmModal(
      'Descartar Partida',
      'Tem certeza que deseja descartar esta partida? Os dados não serão salvos.',
      () => {
        setIsSyncing(false);
        setGenerationResult(null);
        setScoreA(0);
        setScoreB(0);
        setTempScoreA('0');
        setTempScoreB('0');
        setNarrationScript('');
        setNarrationAudio(null);
        
        const batch = writeBatch(db);
        
        // Recalculate daily match count based on actual matches
        const now = Date.now();
        const threshold = systemMetadata.lastResetTimestamp || (now - (16 * 60 * 60 * 1000));
        const sessionMatches = (matches || []).filter(m => m.timestamp > threshold);
        const maxDailyNumber = sessionMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
        
        batch.set(doc(db, 'metadata', 'system'), { 
          matchStartTime: null,
          dailyMatchCount: maxDailyNumber
        }, { merge: true });
        batch.delete(doc(db, 'metadata', 'currentMatch'));
        
        // Ensure we update the local state immediately to reflect the discard
        // This fixes the issue where players still show as "Na Quadra" in the intentions list
        useStore.setState({ generationResult: null });

        batch.commit().then(() => trackUsage(0, 2)).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));
        
        setSystemMetadata({ 
          ...systemMetadata,
          matchStartTime: null,
          dailyMatchCount: maxDailyNumber
        });
        hideConfirmModal();
      }
    );
  };

  const onApproveRequest = async (req: any) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const batch = writeBatch(db);
      
      // Criar ou atualizar jogador
      const playerRef = doc(collection(db, 'players'));
      batch.set(playerRef, {
        id: playerRef.id,
        name: req.name,
        email: req.email,
        uid: req.uid,
        role: 'MEMBER',
        elo: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        gender: 'MALE',
        position: 'Oposto',
        level: 'Intermediário',
        status: 'active',
        createdAt: Date.now()
      });
      
      // Remover solicitação
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
      triggerDbStatus('writing');
      await deleteDoc(doc(db, 'pendingRequests', reqId));
      showNotification('Solicitação removida.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reject-request');
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerSync = async () => {
    showNotification('Sincronização forçada iniciada...', 'info');
    window.location.reload();
  };

  const recalculateDailyStats = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const today = getFirestoreDateKey();
      const batch = writeBatch(db);
      
      showNotification('Recuperando estatísticas de hoje...', 'info');

      // 1. Resetar estatísticas locais e preparar para o cálculo
      const resetPlayers = players.map(p => ({
        ...p,
        dailyMatches: 0,
        dailyWins: 0,
        dailyLosses: 0,
        dailyEloGain: 0,
        dailyResults: [],
        playedLastMatch: false,
        consecutiveBenched: 0
      }));

      // 2. Filtrar partidas de hoje
      const todayMatches = matches.filter(m => m.date === today);
      
      // 3. Recalcular a partir das partidas
      const sortedMatches = [...todayMatches].sort((a, b) => a.timestamp - b.timestamp);
      
      sortedMatches.forEach(m => {
        const winners = m.winner === 'A' ? m.teamA : m.teamB;
        const losers = m.winner === 'A' ? m.teamB : m.teamA;
        
        winners.forEach(pid => {
          const p = resetPlayers.find(rp => rp.id === pid);
          if (p) {
            p.dailyMatches++;
            p.dailyWins++;
            p.dailyEloGain = (p.dailyEloGain || 0) + 20;
            p.dailyResults = [...(p.dailyResults || []), 'V' as const];
            p.playedLastMatch = true;
            p.consecutiveBenched = 0;
          }
        });
        
        losers.forEach(pid => {
          const p = resetPlayers.find(rp => rp.id === pid);
          if (p) {
            p.dailyMatches++;
            p.dailyLosses++;
            p.dailyEloGain = (p.dailyEloGain || 0) - 20;
            p.dailyResults = [...(p.dailyResults || []), 'D' as const];
            p.playedLastMatch = true;
            p.consecutiveBenched = 0;
          }
        });

        // Update players who didn't play (increment consecutiveBenched)
        // We only care about players who were present (in attendance)
        const allPlayersInMatch = [...winners, ...losers];
        attendance.forEach(attPlayer => {
          if (!allPlayersInMatch.includes(attPlayer.id)) {
            const p = resetPlayers.find(rp => rp.id === attPlayer.id);
            if (p) {
              p.playedLastMatch = false;
              p.consecutiveBenched = (p.consecutiveBenched || 0) + 1;
            }
          }
        });
      });

      // 4. Atualizar Firestore
      resetPlayers.forEach(p => {
        if (p.dailyMatches > 0 || p.consecutiveBenched > 0) {
          batch.set(doc(db, 'players', p.id), {
            dailyMatches: p.dailyMatches,
            dailyWins: p.dailyWins,
            dailyLosses: p.dailyLosses,
            dailyEloGain: p.dailyEloGain,
            dailyResults: p.dailyResults,
            playedLastMatch: p.playedLastMatch,
            consecutiveBenched: p.consecutiveBenched
          }, { merge: true });
        }
      });

      // Calculate start of day for lastResetTimestamp to avoid fetching full history
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const resetTimestamp = startOfDay.getTime();

      const maxDailyNumber = todayMatches.reduce((max, m) => Math.max(max, m.dailyNumber || 0), 0);
      const expectedDailyCount = maxDailyNumber + (generationResult ? 1 : 0);

      // 5. Ajustar metadados do sistema para mostrar as partidas
      batch.set(doc(db, 'metadata', 'system'), {
        lastResetTimestamp: resetTimestamp,
        dailyMatchCount: expectedDailyCount,
        lastResetDate: today 
      }, { merge: true });

      await batch.commit();
      
      // Atualizar estado local
      setPlayers(resetPlayers);
      setSystemMetadata({
        ...systemMetadata,
        lastResetTimestamp: resetTimestamp,
        dailyMatchCount: expectedDailyCount,
        lastResetDate: today
      });
      
      showNotification('Estatísticas de hoje recuperadas com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao recuperar estatísticas:', error);
      showNotification('Erro ao recuperar estatísticas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const recalculateStats = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      showNotification('Recalculando todas as estatísticas a partir do histórico...', 'info');
      
      await repairDatabase();
      
      showNotification('Estatísticas recalculadas com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao recalcular estatísticas:', error);
      showNotification('Erro ao recalcular estatísticas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const createDataSnapshot = async (label: string = 'Manual') => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const snapshotId = generateUUID();
      const timestamp = Date.now();
      const date = getFirestoreDateKey();
      
      const snapshot = {
        id: snapshotId,
        timestamp,
        date,
        label,
        players: players.map(p => cleanObject(p)),
        matches: matches.map(m => cleanObject(m)),
        metadata: systemMetadata
      };
      
      await setDoc(doc(db, 'snapshots', snapshotId), cleanObject(snapshot));
      showNotification(`Snapshot "${label}" criado com sucesso!`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'snapshots');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRecoverFinancials = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('reading');
      showNotification('Recuperando registros financeiros do Firestore...', 'info');

      let paymentsSnap, expensesSnap;
      try {
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      } catch (err) {
        console.warn('[RECOVER FINANCIALS] Fetch failed:', err);
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      }

      const paymentsList: Payment[] = [];
      paymentsSnap.forEach((d) => paymentsList.push({ ...d.data(), id: d.id } as Payment));
      setPayments(paymentsList);

      const expensesList: Expense[] = [];
      expensesSnap.forEach((d) => expensesList.push({ ...d.data(), id: d.id } as any));
      setExpenses(expensesList);

      console.log('[RECOVER FINANCIALS] Success:', { paymentsCount: paymentsList.length, expensesCount: expensesList.length });
      showNotification('Registros financeiros recuperados e sincronizados com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao recuperar dados financeiros:', error);
      handleFirestoreError(error, OperationType.LIST, 'financial-recovery');
      showNotification('Erro ao recuperar registros financeiros.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFinancialIntegrityAudit = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('reading');
      showNotification('Executando diagnóstico de integridade financeira...', 'info');

      let paymentsSnap, expensesSnap;
      try {
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      } catch (err) {
        console.warn('[FINANCIAL AUDIT] Fetch failed:', err);
        paymentsSnap = await getDocs(collection(db, 'payments'));
        expensesSnap = await getDocs(collection(db, 'expenses'));
      }

      const firestorePayments: Payment[] = [];
      paymentsSnap.forEach((d) => firestorePayments.push({ ...d.data(), id: d.id } as Payment));

      const firestoreExpenses: Expense[] = [];
      expensesSnap.forEach((d) => firestoreExpenses.push({ ...d.data(), id: d.id } as any));

      const localPayments = payments || [];
      const localExpenses = expenses || [];
      const firestoreIds = new Set(firestorePayments.map(p => p.id));
      const localIds = new Set(localPayments.map(p => p.id));

      const missingInLocal = firestorePayments.filter(p => !localIds.has(p.id));
      const missingInFirestore = localPayments.filter(p => !firestoreIds.has(p.id));

      const outdatedOrMismatched: any[] = [];
      firestorePayments.forEach(fp => {
        const lp = localPayments.find(l => l.id === fp.id);
        if (lp) {
          if (lp.amount !== fp.amount || lp.status !== fp.status || lp.month !== fp.month || lp.playerId !== fp.playerId) {
            outdatedOrMismatched.push({ id: fp.id, firestore: fp, local: lp });
          }
        }
      });

      console.log('=== [FINANCIAL INTEGRITY AUDIT REPORT] ===', {
        firestorePaymentsCount: firestorePayments.length,
        localPaymentsCount: localPayments.length,
        firestoreExpensesCount: firestoreExpenses.length,
        localExpensesCount: localExpenses.length,
        missingInLocal: missingInLocal.map(p => ({ id: p.id, name: p.playerName, month: p.month })),
        outdatedOrMismatched,
      });

      // Always update payments and expenses with fresh server data
      setPayments(firestorePayments);
      useStore.setState({ expenses: firestoreExpenses });

      showNotification(
        `Sincronização financeira concluída: Pagamentos (${firestorePayments.length}), Despesas (${firestoreExpenses.length}).`,
        'success'
      );
    } catch (error) {
      console.error('Erro na auditoria de integridade financeira:', error);
      handleFirestoreError(error, OperationType.LIST, 'financial-integrity-audit');
      showNotification('Erro ao executar auditoria financeira.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const createSecurityBackup = async () => {
    try {
      const today = getFirestoreDateKey();
      const timestamp = Date.now();
      const backupData = {
        timestamp,
        date: today,
        players: players.map(p => cleanObject(p)),
        matches: matches.map(m => cleanObject(m)),
        metadata: systemMetadata
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const storageRef = ref(storage, `backups/guerreiros_backup_${today}_${timestamp}.json`);
      
      await uploadBytes(storageRef, blob);
      console.log('Security backup uploaded to Firebase Storage successfully.');
      // No notification here because it will be called inside handleFinishDay which has its own success message
    } catch (error) {
      console.error('Erro ao realizar backup de segurança:', error);
      showNotification('Aviso: Falha ao salvar backup no Storage.', 'info');
    }
  };

  const handleFinishDay = async () => {
    showConfirmModal(
      'Finalizar Dia de Jogos',
      'Deseja finalizar o dia? Isso irá zerar as estatísticas diárias dos jogadores e iniciar uma nova sessão. As partidas de hoje serão arquivadas (ocultas da tela principal).',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          // Create a snapshot before resetting
          const today = getFirestoreDateKey();
          await createDataSnapshot(`Auto-Reset-${today}`);
          
          // NEW: Create Security Backup on Storage
          await createSecurityBackup();
          
          const batch = writeBatch(db);
          
          // Reset statistics in the main players collection
          players.forEach(p => {
            if (!p.id) return;
            const playerRef = doc(db, 'players', p.id);
            // Use set with merge to avoid "No document to update" error if project was recently migrated
            batch.set(playerRef, {
              dailyMatches: 0,
              dailyWins: 0,
              dailyLosses: 0,
              dailyEloGain: 0,
              dailyResults: [],
              playedLastMatch: false,
              consecutiveBenched: 0
            }, { merge: true });
          });

          // Reset statistics in the current day's attendance collection
          attendance.forEach(p => {
            if (!p.id) return;
            const attendanceRef = doc(db, 'attendance', today, 'players', p.id);
            batch.set(attendanceRef, {
              dailyMatches: 0,
              dailyWins: 0,
              dailyLosses: 0,
              dailyEloGain: 0,
              dailyResults: [],
              playedLastMatch: false,
              consecutiveBenched: 0
            }, { merge: true });
          });

          // We NO LONGER delete matches. We just update the lastResetTimestamp.
          // This "archives" them because the UI filters by timestamp > lastResetTimestamp.

          // Reset system metadata - use set with merge
          const now = Date.now();
          batch.set(doc(db, 'metadata', 'system'), { 
            dailyMatchCount: 0,
            matchStartTime: null,
            lastResetTimestamp: now, // Update reset timestamp to NOW
            lastResetDate: today
          }, { merge: true });

          await batch.commit();

          // Update local state
          const resetStats = (p: Player) => ({ 
            ...p, 
            dailyMatches: 0, 
            dailyWins: 0, 
            dailyLosses: 0, 
            dailyEloGain: 0, 
            dailyResults: [],
            playedLastMatch: false,
            consecutiveBenched: 0
          });

          setPlayers(players.map(resetStats));
          setAttendance(attendance.map(resetStats));
          
          // Local matches filter - hide all current matches (REMOVED so Ranking has access to historical sessions)
          // setMatches(matches.filter(m => m.timestamp > now));
          
          setSystemMetadata({
            ...systemMetadata,
            dailyMatchCount: 0,
            matchStartTime: null,
            lastResetTimestamp: now,
            lastResetDate: today
          });
          
          if (generationResult) {
            setGenerationResult(null);
          }

          showNotification('Dia finalizado com sucesso! Estatísticas arquivadas.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-daily-reset');
          showNotification('Erro ao finalizar dia. Tente novamente.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const deletePayment = async (id: string) => {
    showConfirmModal(
      'Excluir Lançamento',
      'Tem certeza que deseja excluir este registro de pagamento?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          await deleteDoc(doc(db, 'payments', id));
          trackUsage(0, 1);
          showNotification('Pagamento excluído com sucesso.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `payments/${id}`);
          showNotification('Erro ao excluir pagamento.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const savePayment = async (paymentData: any, id?: string) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      // Prevent duplicates if it's a new entry
      if (!id) {
        // Find if there's any existing payment for this player and month that is PAID
        const existingPaid = (payments || []).find(p => 
          p.playerId === paymentData.playerId && 
          p.month === paymentData.month && 
          p.status === 'PAID'
        );
        
        if (existingPaid && paymentData.status === 'PAID') {
          showNotification('O pagamento para este mês já foi realizado por este sócio!', 'error');
          return false;
        }

        // Also check if they try to create an exact duplicate pending/overdue entry
        const existingDuplicate = (payments || []).find(p => 
          p.playerId === paymentData.playerId && 
          p.month === paymentData.month && 
          p.amount === paymentData.amount &&
          p.status === paymentData.status
        );
        
        if (existingDuplicate) {
          showNotification('Este lançamento já existe para este sócio e mês.', 'info');
          return false; 
        }
      } else {
        // If we are editing, we should also prevent changing status to PAID if another payment for the same month is already PAID
        if (paymentData.status === 'PAID') {
          const anotherPaid = (payments || []).find(p => 
            p.id !== id &&
            p.playerId === paymentData.playerId && 
            p.month === paymentData.month && 
            p.status === 'PAID'
          );
          if (anotherPaid) {
            showNotification('O pagamento para este mês já foi realizado por este sócio!', 'error');
            return false;
          }
        }
      }
      
      const paymentId = id || generateUUID();
      const timestamp = Date.now();
      
      // Look up playerUid if possible
      let playerUid = null;
      if (paymentData.playerId) {
        const player = players.find(p => p.id === paymentData.playerId);
        if (player?.uid) {
          playerUid = player.uid;
        }
      }

      const payment: any = {
        ...paymentData,
        id: paymentId,
        playerUid,
        updatedAt: timestamp
      };
      
      if (!id) {
        payment.createdAt = timestamp;
      }

      await setDoc(doc(db, 'payments', paymentId), cleanObject(payment), { merge: true });
      
      showNotification(id ? 'Lançamento atualizado!' : 'Pagamento registrado!', 'success');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payments');
      showNotification('Erro ao salvar pagamento.', 'error');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const saveExpense = async (expenseData: any, id?: string) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const expenseId = id || generateUUID();
      const timestamp = Date.now();
      
      const expense: any = {
        ...expenseData,
        id: expenseId,
        updatedAt: timestamp
      };
      
      if (!id) {
        expense.createdAt = timestamp;
      }

      await setDoc(doc(db, 'expenses', expenseId), cleanObject(expense), { merge: true });
      
      showNotification(id ? 'Despesa atualizada!' : 'Despesa registrada!', 'success');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
      showNotification('Erro ao salvar despesa.', 'error');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteExpense = async (id: string) => {
    showConfirmModal(
      'Excluir Despesa',
      'Tem certeza que deseja excluir este registro de despesa?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          await deleteDoc(doc(db, 'expenses', id));
          trackUsage(0, 1);
          showNotification('Despesa excluída com sucesso.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
          showNotification('Erro ao excluir despesa.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const updateMonthlyFee = async (fee: number) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      await setDoc(doc(db, 'metadata', 'system'), { monthlyFee: fee }, { merge: true });
      showNotification('Valor da mensalidade atualizado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'metadata/system');
      showNotification('Erro ao atualizar mensalidade.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateSystemMetadata = async (metadata: Partial<SystemMetadata>) => {
    // Update local store state immediately first to prevent asynchronous re-render loops
    setSystemMetadata(metadata);
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      await setDoc(doc(db, 'metadata', 'system'), metadata, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'metadata/system');
      showNotification('Erro ao atualizar configurações do sistema.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const startTournament = async (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number; strategy: TournamentStrategy, preGeneratedTeams?: TournamentTeam[], preGeneratedReserves?: string[] }) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const participants = [...attendance];
      if (participants.length < config.numTeams * 6) {
        showNotification(`Número insuficiente de jogadores para ${config.numTeams} times.`, 'error');
        return;
      }

      let teams = config.preGeneratedTeams;
      let reserves = config.preGeneratedReserves;

      if (!teams || !reserves) {
        const generated = generateTournamentTeams(participants, config.numTeams);
        teams = generated.teams;
        reserves = generated.reserves;
      }

      const strategy = config.strategy || TournamentStrategy.ROUND_ROBIN;
      const finalMatches: TournamentMatch[] = [];
      const teamIds = teams.map(t => t.id);

      const generateRoundRobinMatches = (teamsToSchedule: string[], bracketName?: string) => {
        const numTeams = teamsToSchedule.length;
        const rounds: { teamAId: string; teamBId: string }[][] = [];
        
        const tempTeams = [...teamsToSchedule];
        if (numTeams % 2 !== 0) {
          tempTeams.push('BYE');
        }
        
        const n = tempTeams.length;
        const numRounds = n - 1;
        const matchesPerRound = n / 2;
        
        for (let r = 0; r < numRounds; r++) {
          const roundMatches: { teamAId: string; teamBId: string }[] = [];
          for (let i = 0; i < matchesPerRound; i++) {
            const teamA = tempTeams[i];
            const teamB = tempTeams[n - 1 - i];
            
            if (teamA !== 'BYE' && teamB !== 'BYE') {
              roundMatches.push({ teamAId: teamA, teamBId: teamB });
            }
          }
          rounds.push(roundMatches);
          
          const last = tempTeams.pop()!;
          tempTeams.splice(1, 0, last);
        }
        
        const generatedMatches: TournamentMatch[] = [];
        let lastMatchTeams: string[] = [];
        const availableRounds = [...rounds];
        let currentRoundNum = 1;
        
        while (availableRounds.length > 0) {
          let roundIdx = availableRounds.findIndex(round => {
            if (round.length === 0) return true;
            const firstMatch = round[0];
            return !lastMatchTeams.includes(firstMatch.teamAId) && !lastMatchTeams.includes(firstMatch.teamBId);
          });
          
          if (roundIdx === -1) {
            roundIdx = availableRounds.findIndex(round => {
              return round.some(m => !lastMatchTeams.includes(m.teamAId) && !lastMatchTeams.includes(m.teamBId));
            });
          }
          
          if (roundIdx === -1) roundIdx = 0;
          
          const currentRound = availableRounds.splice(roundIdx, 1)[0];
          
          if (currentRound.length > 1) {
            const swapIdx = currentRound.findIndex(m => !lastMatchTeams.includes(m.teamAId) && !lastMatchTeams.includes(m.teamBId));
            if (swapIdx !== -1 && swapIdx !== 0) {
              [currentRound[0], currentRound[swapIdx]] = [currentRound[swapIdx], currentRound[0]];
            }
          }
          
          currentRound.forEach(m => {
            generatedMatches.push({
              id: generateUUID(),
              teamAId: m.teamAId,
              teamBId: m.teamBId,
              scoreA: 0,
              scoreB: 0,
              setsA: 0,
              setsB: 0,
              status: 'pending',
              round: currentRoundNum,
              bracket: bracketName
            });
            lastMatchTeams = [m.teamAId, m.teamBId];
          });
          currentRoundNum++;
        }
        return generatedMatches;
      };

      if (strategy === TournamentStrategy.ROUND_ROBIN) {
        finalMatches.push(...generateRoundRobinMatches(teamIds));
      } else if (strategy === TournamentStrategy.GROUPS_AND_KNOCKOUT) {
        if (config.numTeams >= 4) {
          const half = Math.ceil(teamIds.length / 2);
          const groupA = teamIds.slice(0, half);
          const groupB = teamIds.slice(half);
          
          const matchesA = generateRoundRobinMatches(groupA, 'groupA');
          const matchesB = generateRoundRobinMatches(groupB, 'groupB');
          
          // Interleave matches
          const maxLength = Math.max(matchesA.length, matchesB.length);
          for (let i = 0; i < maxLength; i++) {
            if (i < matchesA.length) finalMatches.push(matchesA[i]);
            if (i < matchesB.length) finalMatches.push(matchesB[i]);
          }
          
          // Re-assign rounds sequentially
          finalMatches.forEach((m, idx) => {
            m.round = idx + 1;
          });
        } else {
          showNotification('Grupos + Mata-Mata requer pelo menos 4 times. Usando Todos contra Todos.', 'info');
          finalMatches.push(...generateRoundRobinMatches(teamIds, 'group'));
        }
      } else if (strategy === TournamentStrategy.DOUBLE_ELIMINATION) {
        if (config.numTeams === 3) {
          const m1Id = generateUUID();
          const m2Id = generateUUID();
          const m3Id = generateUUID();
          const m4Id = generateUUID();

          // Upper Bracket Round 1
          finalMatches.push({
            id: m1Id, teamAId: teamIds[0], teamBId: teamIds[1], scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 1, bracket: 'upper', nextMatchId: m2Id, nextMatchWinnerSlot: 'A', nextMatchLoserSlot: 'A'
          });

          // Upper Final
          finalMatches.push({
            id: m2Id, teamAId: '', teamBId: teamIds[2], scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 2, bracket: 'upper', nextMatchId: m4Id, nextMatchWinnerSlot: 'A', nextMatchLoserSlot: 'B'
          });

          // Lower Final
          finalMatches.push({
            id: m3Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 3, bracket: 'lower', nextMatchId: m4Id, nextMatchWinnerSlot: 'B'
          });

          // Grand Final
          finalMatches.push({
            id: m4Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 4, bracket: 'final'
          });
        } else if (config.numTeams === 4) {
          const m1Id = generateUUID();
          const m2Id = generateUUID();
          const m3Id = generateUUID();
          const m4Id = generateUUID();
          const m5Id = generateUUID();
          const m6Id = generateUUID();

          // Upper Bracket Round 1
          finalMatches.push({
            id: m1Id, teamAId: teamIds[0], teamBId: teamIds[1], scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 1, bracket: 'upper', nextMatchId: m3Id, nextMatchWinnerSlot: 'A', nextMatchLoserSlot: 'A'
          });
          finalMatches.push({
            id: m2Id, teamAId: teamIds[2], teamBId: teamIds[3], scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 1, bracket: 'upper', nextMatchId: m3Id, nextMatchWinnerSlot: 'B', nextMatchLoserSlot: 'B'
          });

          // Upper Final
          finalMatches.push({
            id: m3Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 2, bracket: 'upper', nextMatchId: m6Id, nextMatchWinnerSlot: 'A'
          });

          // Lower Round 1
          finalMatches.push({
            id: m4Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 2, bracket: 'lower', nextMatchId: m5Id, nextMatchWinnerSlot: 'A'
          });

          // Lower Final
          finalMatches.push({
            id: m5Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 3, bracket: 'lower', nextMatchId: m6Id, nextMatchWinnerSlot: 'B'
          });

          // Grand Final
          finalMatches.push({
            id: m6Id, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
            status: 'pending', round: 4, bracket: 'final'
          });
        } else {
          // Fallback to Round Robin if not 3 or 4 teams for now
          showNotification('Dupla eliminação suportada apenas para 3 ou 4 times no momento. Usando Todos contra Todos.', 'info');
          finalMatches.push(...generateRoundRobinMatches(teamIds));
        }
      }

      const tournament: Tournament = {
        id: generateUUID(),
        name: `Torneio de Aniversariantes - ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
        date: getFirestoreDateKey(),
        status: 'active',
        teams,
        matches: finalMatches,
        strategy,
        reserves,
        config
      };

      await setDoc(doc(db, 'tournaments', tournament.id), cleanObject(tournament));
      await setDoc(doc(db, 'metadata', 'activeTournament'), cleanObject(tournament));
      
      showNotification('Torneio iniciado!', 'success');
      setViewMode('tournament');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
      showNotification('Erro ao iniciar torneio.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const recordTournamentMatch = async (matchId: string, setScores: SetScore[]) => {
    if (!activeTournament) return;

    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const updatedMatches = activeTournament.matches.map(m => {
        if (m.id === matchId) {
          let scoreA = 0;
          let scoreB = 0;
          let setsA = 0;
          let setsB = 0;

          setScores.forEach(set => {
            scoreA += set.scoreA;
            scoreB += set.scoreB;
            if (set.scoreA > set.scoreB) setsA++;
            else if (set.scoreB > set.scoreA) setsB++;
          });

          const winnerId = setsA > setsB ? m.teamAId : (setsB > setsA ? m.teamBId : undefined);

          return {
            ...m,
            scoreA,
            scoreB,
            setsA,
            setsB,
            setScores,
            status: 'completed' as const,
            winnerId
          };
        }
        return m;
      });

      // Handle Bracket Progression
      const currentMatch = updatedMatches.find(m => m.id === matchId);
      if (currentMatch && currentMatch.status === 'completed' && currentMatch.winnerId) {
        const winnerId = currentMatch.winnerId;
        const loserId = winnerId === currentMatch.teamAId ? currentMatch.teamBId : currentMatch.teamAId;

        if (activeTournament.strategy === TournamentStrategy.DOUBLE_ELIMINATION) {
          // Progression for Double Elimination
          updatedMatches.forEach(m => {
            if (m.status === 'pending') {
              // Upper Bracket Progression
              if (currentMatch.bracket === 'upper' && currentMatch.nextMatchId === m.id) {
                if (currentMatch.nextMatchWinnerSlot === 'A') m.teamAId = winnerId;
                else if (currentMatch.nextMatchWinnerSlot === 'B') m.teamBId = winnerId;
              }

              // Lower Bracket Progression (Losers from Upper)
              if (currentMatch.bracket === 'upper') {
                if (activeTournament.config.numTeams === 3) {
                  if (currentMatch.round === 1) {
                    const m3 = updatedMatches.find(um => um.bracket === 'lower' && um.round === 3);
                    if (m3) m3.teamAId = loserId;
                  } else if (currentMatch.round === 2) {
                    const m3 = updatedMatches.find(um => um.bracket === 'lower' && um.round === 3);
                    if (m3) m3.teamBId = loserId;
                  }
                } else if (activeTournament.config.numTeams === 4) {
                  if (currentMatch.round === 1) {
                    const m4 = updatedMatches.find(um => um.bracket === 'lower' && um.round === 2);
                    if (m4) {
                      if (currentMatch.id === activeTournament.matches[0].id) m4.teamAId = loserId;
                      else m4.teamBId = loserId;
                    }
                  } else if (currentMatch.round === 2) { // Upper Final
                    const m5 = updatedMatches.find(um => um.bracket === 'lower' && um.round === 3);
                    if (m5) m5.teamBId = loserId;
                  }
                }
              }

              // Lower Bracket Progression (Winners from Lower)
              if (currentMatch.bracket === 'lower' && currentMatch.nextMatchId === m.id) {
                if (currentMatch.nextMatchWinnerSlot === 'A') m.teamAId = winnerId;
                else if (currentMatch.nextMatchWinnerSlot === 'B') m.teamBId = winnerId;
              }

              // Grand Final Progression
              if (activeTournament.config.numTeams === 3) {
                if (currentMatch.bracket === 'upper' && currentMatch.round === 2 && currentMatch.nextMatchId === m.id) {
                  m.teamAId = winnerId;
                }
                if (currentMatch.bracket === 'lower' && currentMatch.round === 3 && currentMatch.nextMatchId === m.id) {
                  m.teamBId = winnerId;
                }
              } else if (activeTournament.config.numTeams === 4) {
                if (currentMatch.bracket === 'upper' && currentMatch.round === 2 && currentMatch.nextMatchId === m.id) {
                  m.teamAId = winnerId;
                }
                if (currentMatch.bracket === 'lower' && currentMatch.round === 3 && currentMatch.nextMatchId === m.id) {
                  m.teamBId = winnerId;
                }
              }
            }
          });
        }
        
        if (activeTournament.strategy === TournamentStrategy.GROUPS_AND_KNOCKOUT) {
          if (currentMatch.bracket === 'semi' && currentMatch.nextMatchId) {
            const nextMatch = updatedMatches.find(m => m.id === currentMatch.nextMatchId);
            if (nextMatch) {
              if (currentMatch.nextMatchWinnerSlot === 'A') nextMatch.teamAId = winnerId;
              else if (currentMatch.nextMatchWinnerSlot === 'B') nextMatch.teamBId = winnerId;
            }
          }
        }
      }

      // If Groups + Knockout, check if all group matches are done to generate knockout matches
      if (activeTournament.strategy === TournamentStrategy.GROUPS_AND_KNOCKOUT) {
        const groupMatches = updatedMatches.filter(m => m.bracket === 'groupA' || m.bracket === 'groupB' || m.bracket === 'group');
        const allGroupMatchesDone = groupMatches.length > 0 && groupMatches.every(m => m.status === 'completed');
        const semiMatchesExist = updatedMatches.some(m => m.bracket === 'semi');
        const finalMatchExists = updatedMatches.some(m => m.bracket === 'final');
        
        if (allGroupMatchesDone && !semiMatchesExist && !finalMatchExists) {
          const calculateStandings = (bracketName: string) => {
            const teamsInGroup = new Set<string>();
            updatedMatches.filter(m => m.bracket === bracketName).forEach(m => {
              teamsInGroup.add(m.teamAId);
              teamsInGroup.add(m.teamBId);
            });
            
            return Array.from(teamsInGroup).map(teamId => {
              const teamMatches = updatedMatches.filter(m => m.bracket === bracketName && (m.teamAId === teamId || m.teamBId === teamId));
              let points = 0;
              let wins = 0;
              let setsWon = 0;
              let setsLost = 0;
              let pointsFor = 0;
              let pointsAgainst = 0;

              teamMatches.forEach(m => {
                if (m.status === 'completed') {
                  const isTeamA = m.teamAId === teamId;
                  const teamSets = isTeamA ? m.setsA : m.setsB;
                  const oppSets = isTeamA ? m.setsB : m.setsA;
                  
                  if (teamSets > oppSets) {
                    points += 3;
                    wins++;
                  }
                  setsWon += teamSets;
                  setsLost += oppSets;
                  
                  m.setScores?.forEach(s => {
                    pointsFor += isTeamA ? s.scoreA : s.scoreB;
                    pointsAgainst += isTeamA ? s.scoreB : s.scoreA;
                  });
                }
              });

              return { id: teamId, points, wins, setsWon, setsLost, pointsFor, pointsAgainst };
            }).sort((a, b) => {
              if (b.points !== a.points) return b.points - a.points;
              if ((b.setsWon - b.setsLost) !== (a.setsWon - a.setsLost)) return (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost);
              return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
            });
          };

          if (updatedMatches.some(m => m.bracket === 'groupA')) {
            // We have 2 groups
            const standingsA = calculateStandings('groupA');
            const standingsB = calculateStandings('groupB');
            
            if (standingsA.length >= 2 && standingsB.length >= 2) {
              const semi1Id = generateUUID();
              const semi2Id = generateUUID();
              const finalId = generateUUID();
              
              const nextRound = updatedMatches[updatedMatches.length-1].round + 1;
              
              updatedMatches.push({
                id: semi1Id, teamAId: standingsA[0].id, teamBId: standingsB[1].id, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
                status: 'pending', round: nextRound, bracket: 'semi', nextMatchId: finalId, nextMatchWinnerSlot: 'A'
              });
              updatedMatches.push({
                id: semi2Id, teamAId: standingsB[0].id, teamBId: standingsA[1].id, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
                status: 'pending', round: nextRound, bracket: 'semi', nextMatchId: finalId, nextMatchWinnerSlot: 'B'
              });
              updatedMatches.push({
                id: finalId, teamAId: '', teamBId: '', scoreA: 0, scoreB: 0, setsA: 0, setsB: 0,
                status: 'pending', round: nextRound + 1, bracket: 'final'
              });
            }
          } else {
            // Single group fallback
            const standings = calculateStandings('group');
            if (standings.length >= 2) {
              updatedMatches.push({
                id: generateUUID(),
                teamAId: standings[0].id,
                teamBId: standings[1].id,
                scoreA: 0,
                scoreB: 0,
                setsA: 0,
                setsB: 0,
                status: 'pending',
                round: updatedMatches[updatedMatches.length-1].round + 1,
                bracket: 'final'
              });
            }
          }
        }
      }

      const updatedTeams = activeTournament.teams.map(team => {
        const teamMatches = updatedMatches.filter(m => m.status === 'completed' && (m.teamAId === team.id || m.teamBId === team.id));
        
        let points = 0;
        let setsWon = 0;
        let setsLost = 0;
        let pointsFor = 0;
        let pointsAgainst = 0;
        let matchesWon = 0;
        let matchesLost = 0;

        teamMatches.forEach(m => {
          const isTeamA = m.teamAId === team.id;
          const teamSets = isTeamA ? m.setsA : m.setsB;
          const oppSets = isTeamA ? m.setsB : m.setsA;
          const teamPoints = isTeamA ? m.scoreA : m.scoreB;
          const oppPoints = isTeamA ? m.scoreB : m.scoreA;

          setsWon += teamSets;
          setsLost += oppSets;
          pointsFor += teamPoints;
          pointsAgainst += oppPoints;

          if (teamSets > oppSets) {
            matchesWon++;
            points += 3;
          } else if (teamSets === oppSets) {
            points += 1;
          } else {
            matchesLost++;
          }
        });

        return {
          ...team,
          points,
          setsWon,
          setsLost,
          pointsFor,
          pointsAgainst,
          matchesPlayed: teamMatches.length,
          matchesWon,
          matchesLost
        };
      });

      const updatedTournament = cleanObject({
        ...activeTournament,
        matches: updatedMatches,
        teams: updatedTeams
      });

      const batch = writeBatch(db);
      batch.set(doc(db, 'tournaments', activeTournament.id), updatedTournament);
      batch.set(doc(db, 'metadata', 'activeTournament'), updatedTournament);

      // --- ELO UPDATE LOGIC ---
      const match = updatedMatches.find(m => m.id === matchId);
      if (match && match.status === 'completed') {
        const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
        const teamB = activeTournament.teams.find(t => t.id === match.teamBId);

        if (teamA && teamB) {
          const playersA = teamA.players.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
          const playersB = teamB.players.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

          if (playersA.length > 0 && playersB.length > 0) {
            let actualA = 0.5; // Draw
            let winner: 'A' | 'B' | 'Draw' = 'Draw';
            if (match.setsA > match.setsB) {
              actualA = 1;
              winner = 'A';
            } else if (match.setsB > match.setsA) {
              actualA = 0;
              winner = 'B';
            }

            const tsUpdates = calculateTrueSkillUpdate(playersA, playersB, winner);
            const tsMap = new Map<string, { mu: number; sigma: number }>();
            tsUpdates.forEach(u => tsMap.set(u.playerId, u.newTrueSkill));

            const date = getFirestoreDateKey();

            const updatePlayerStats = (p: Player, isTeamA: boolean) => {
              // Regra Pedida: +20 para vitória, -20 para derrota (Fixo)
              const wonMatch = (isTeamA && winner === 'A') || (!isTeamA && winner === 'B');
              const totalEloChange = wonMatch ? 20 : (winner === 'Draw' ? 0 : -20);
              
              const newElo = Math.max(800, p.elo + totalEloChange);
              const isWinner = wonMatch;
              const isDraw = winner === 'Draw';
              
              const playerRef = doc(db, 'players', p.id);
              const attendanceRef = doc(db, 'attendance', date, 'players', p.id);
              
              const newHistoryEntry = { 
                date: getFirestoreDateKey(new Date()), 
                elo: newElo,
                matchId: match.id,
                change: totalEloChange,
                timestamp: Date.now(),
                result: (wonMatch ? 'V' : 'D') as 'V' | 'D'
              };
              const updatedHistory = [...(p.eloHistory || []), newHistoryEntry].slice(-200);
              
              const updates: any = {
                elo: newElo,
                matchesPlayed: (p.matchesPlayed || 0) + 1,
                wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
                losses: (!isWinner && !isDraw) ? (p.losses || 0) + 1 : (p.losses || 0),
                dailyMatches: (p.dailyMatches || 0) + 1,
                dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
                dailyLosses: (!isWinner && !isDraw) ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
                dailyEloGain: (p.dailyEloGain || 0) + totalEloChange,
                dailyResults: isDraw ? (p.dailyResults || []) : [...(p.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'],
                playedLastMatch: true,
                consecutiveBenched: 0,
                eloHistory: updatedHistory
              };

              const trueskillUpdate = tsMap.get(p.id);
              if (trueskillUpdate) {
                updates.trueSkill = trueskillUpdate;
              }
              
              batch.set(playerRef, updates, { merge: true });
              
              if (attendance.some(ap => ap.id === p.id)) {
                batch.set(attendanceRef, updates, { merge: true });
              }
            };

            playersA.forEach(p => updatePlayerStats(p, true));
            playersB.forEach(p => updatePlayerStats(p, false));

            // Update local state
            const updateLocalStats = (p: Player) => {
              const playedInA = playersA.some(tp => tp.id === p.id);
              const playedInB = playersB.some(tp => tp.id === p.id);
              const played = playedInA || playedInB;
              
              if (played) {
                const wonMatch = (playedInA && winner === 'A') || (playedInB && winner === 'B');
                const totalEloChange = wonMatch ? 20 : (winner === 'Draw' ? 0 : -20);
                const isWinner = wonMatch;
                const isDraw = winner === 'Draw';
                
                return {
                  ...p,
                  elo: Math.max(800, p.elo + totalEloChange),
                  matchesPlayed: (p.matchesPlayed || 0) + 1,
                  wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
                  losses: (!isWinner && !isDraw) ? (p.losses || 0) + 1 : (p.losses || 0),
                  dailyMatches: (p.dailyMatches || 0) + 1,
                  dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
                  dailyLosses: (!isWinner && !isDraw) ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
                  dailyEloGain: (p.dailyEloGain || 0) + totalEloChange,
                  dailyResults: isDraw ? (p.dailyResults || []) : [...(p.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'],
                  playedLastMatch: true,
                  consecutiveBenched: 0
                };
              }
              return p;
            };

            setPlayers(players.map(updateLocalStats));
            setAttendance(attendance.map(updateLocalStats));
          }
        }
      }
      // --------------------------

      await batch.commit();

      showNotification('Resultado registrado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
      showNotification('Erro ao registrar resultado.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const endTournament = async () => {
    if (!activeTournament) return;

    showConfirmModal(
      'Encerrar Torneio',
      'Deseja finalizar o torneio atual? Os resultados serão salvos no histórico.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');

          const completedTournament = {
            ...activeTournament,
            status: 'completed' as const
          };

          await setDoc(doc(db, 'tournaments', activeTournament.id), cleanObject(completedTournament));
          await deleteDoc(doc(db, 'metadata', 'activeTournament'));

          showNotification('Torneio finalizado com sucesso!', 'success');
          setViewMode('history');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'tournaments');
          showNotification('Erro ao finalizar torneio.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const addTournamentPlayer = async (teamId: string, playerId: string) => {
    if (!activeTournament) return;
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const updatedTeams = activeTournament.teams.map(team => {
        if (team.id === teamId) {
          return { ...team, players: [...team.players, playerId] };
        }
        return team;
      });

      const updatedTournament = cleanObject({ ...activeTournament, teams: updatedTeams });
      await setDoc(doc(db, 'tournaments', activeTournament.id), updatedTournament);
      await setDoc(doc(db, 'metadata', 'activeTournament'), updatedTournament);
      
      showNotification('Jogador adicionado ao time!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
    } finally {
      setIsSyncing(false);
    }
  };

  const substituteTournamentPlayer = async (teamId: string, oldPlayerId: string, newPlayerId: string) => {
    if (!activeTournament) return;
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      let updatedReserves = [...(activeTournament.reserves || [])];
      
      // If the new player is in reserves, remove them and add the old player
      if (updatedReserves.includes(newPlayerId)) {
        updatedReserves = updatedReserves.filter(id => id !== newPlayerId);
        updatedReserves.push(oldPlayerId);
      }

      const updatedTeams = activeTournament.teams.map(team => {
        if (team.id === teamId) {
          return {
            ...team,
            players: team.players.map(pid => pid === oldPlayerId ? newPlayerId : pid)
          };
        }
        return team;
      });

      const updatedTournament = cleanObject({ 
        ...activeTournament, 
        teams: updatedTeams,
        reserves: updatedReserves
      });
      await setDoc(doc(db, 'tournaments', activeTournament.id), updatedTournament);
      await setDoc(doc(db, 'metadata', 'activeTournament'), updatedTournament);
      
      showNotification('Substituição realizada!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
    } finally {
      setIsSyncing(false);
    }
  };

  const resetTournamentMatch = async (matchId: string) => {
    if (!activeTournament) return;

    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const updatedMatches = activeTournament.matches.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            scoreA: 0,
            scoreB: 0,
            setsA: 0,
            setsB: 0,
            status: 'pending' as const,
            winnerId: undefined
          };
        }
        return m;
      });

      const updatedTeams = activeTournament.teams.map(team => {
        const teamMatches = updatedMatches.filter(m => m.status === 'completed' && (m.teamAId === team.id || m.teamBId === team.id));
        
        let points = 0;
        let setsWon = 0;
        let setsLost = 0;
        let pointsFor = 0;
        let pointsAgainst = 0;
        let matchesWon = 0;
        let matchesLost = 0;

        teamMatches.forEach(m => {
          const isTeamA = m.teamAId === team.id;
          const teamSets = isTeamA ? m.setsA : m.setsB;
          const oppSets = isTeamA ? m.setsB : m.setsA;
          const teamPoints = isTeamA ? m.scoreA : m.scoreB;
          const oppPoints = isTeamA ? m.scoreB : m.scoreA;

          setsWon += teamSets;
          setsLost += oppSets;
          pointsFor += teamPoints;
          pointsAgainst += oppPoints;

          if (teamSets > oppSets) {
            matchesWon++;
            points += 3;
          } else if (teamSets === oppSets) {
            points += 1;
          } else {
            matchesLost++;
          }
        });

        return {
          ...team,
          points,
          setsWon,
          setsLost,
          pointsFor,
          pointsAgainst,
          matchesPlayed: teamMatches.length,
          matchesWon,
          matchesLost
        };
      });

      const updatedTournament = cleanObject({
        ...activeTournament,
        matches: updatedMatches,
        teams: updatedTeams
      });

      await setDoc(doc(db, 'tournaments', activeTournament.id), updatedTournament);
      await setDoc(doc(db, 'metadata', 'activeTournament'), updatedTournament);

      showNotification('Partida reiniciada!', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
      showNotification('Erro ao reiniciar partida.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteTournament = async (tournamentId: string) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      // Se for o torneio ativo, limpar metadados
      if (activeTournament?.id === tournamentId) {
        await deleteDoc(doc(db, 'metadata', 'activeTournament'));
        setActiveTournament(null);
      }

      // Deletar da coleção de torneios
      await deleteDoc(doc(db, 'tournaments', tournamentId));
      
      showNotification('Torneio excluído com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao excluir torneio:', error);
      handleFirestoreError(error, OperationType.DELETE, 'tournaments');
      showNotification('Erro ao excluir torneio.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const recreateOctober15Matches = async () => {
    showConfirmModal(
      'Recriar Partidas de 15/10/2026',
      'Isto irá gerar e registrar as 6 partidas oficiais do dia 15/10/2026 com base no relatório de ranking oficial e reprocessar as estatísticas dos sócios. Deseja continuar?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');

          const date15 = '2026-10-15';
          const baseTimestamp = new Date('2026-10-15T19:00:00-03:00').getTime();
          
          const findId = (nameQuery: string) => {
            const found = players.find(p => p.name.toLowerCase().includes(nameQuery.toLowerCase()));
            return found ? found.id : null;
          };

          const pRodney = findId('Rodney');
          const pIvana = findId('Ivana');
          const pJo = findId('Jô') || findId('Jo');
          const pIale = findId('Iale');
          const pBetinha = findId('Betinha');
          const pThiago = findId('Thiago');
          const pKarina = findId('Karina');
          const pCaluca = findId('Caluca');
          const pMarcos = findId('Marcos');
          const pMarcleide = findId('Marcleíde') || findId('Marcleide');
          const pFatinha = findId('Fatinha');
          const pJuliana = findId('Juliana');
          const pPaulo = findId('Paulo');
          const pMarcelo = findId('Marcelo');
          const pAna = findId('Ana');
          const pFlavinha = findId('Flavinha');
          const pGeraldinho = findId('Geraldinho');
          const pAnne = findId('Anne');
          const pDea = findId('Dea');

          const allActiveIds = players.filter(p => p.status === 'active').map(p => p.id);

          const matchesToCreate = [
            {
              id: `match-2026-10-15-1`,
              timestamp: baseTimestamp,
              date: date15,
              teamA: [pRodney, pIvana, pJo, pIale, pBetinha, pThiago].filter(Boolean) as string[],
              teamB: [pKarina, pCaluca, pMarcos, pMarcleide, pFatinha, pJuliana].filter(Boolean) as string[],
              winner: 'A' as const,
              scoreA: 25,
              scoreB: 18,
              duration: 600,
              startTime: baseTimestamp - 600000,
              endTime: baseTimestamp,
              mode: 'QUICK' as const,
              dailyNumber: 1,
              stats: []
            },
            {
              id: `match-2026-10-15-2`,
              timestamp: baseTimestamp + 600000,
              date: date15,
              teamA: [pRodney, pIvana, pJo, pIale, pPaulo, pMarcelo].filter(Boolean) as string[],
              teamB: [pAna, pFlavinha, pGeraldinho, pAnne, pDea, allActiveIds[0]].filter(Boolean) as string[],
              winner: 'A' as const,
              scoreA: 25,
              scoreB: 20,
              duration: 600,
              startTime: baseTimestamp,
              endTime: baseTimestamp + 600000,
              mode: 'QUICK' as const,
              dailyNumber: 2,
              stats: []
            },
            {
              id: `match-2026-10-15-3`,
              timestamp: baseTimestamp + 1200000,
              date: date15,
              teamA: [pRodney, pIvana, pJo, pBetinha, pThiago, pKarina].filter(Boolean) as string[],
              teamB: [pIale, pCaluca, pMarcos, pMarcleide, pJuliana, pPaulo].filter(Boolean) as string[],
              winner: 'A' as const,
              scoreA: 25,
              scoreB: 21,
              duration: 600,
              startTime: baseTimestamp + 600000,
              endTime: baseTimestamp + 1200000,
              mode: 'QUICK' as const,
              dailyNumber: 3,
              stats: []
            },
            {
              id: `match-2026-10-15-4`,
              timestamp: baseTimestamp + 1800000,
              date: date15,
              teamA: [pRodney, pIvana, pJo, pBetinha, pThiago, pMarcos].filter(Boolean) as string[],
              teamB: [pMarcelo, pAna, pFlavinha, pGeraldinho, pAnne, pDea].filter(Boolean) as string[],
              winner: 'A' as const,
              scoreA: 25,
              scoreB: 15,
              duration: 600,
              startTime: baseTimestamp + 1200000,
              endTime: baseTimestamp + 1800000,
              mode: 'QUICK' as const,
              dailyNumber: 4,
              stats: []
            },
            {
              id: `match-2026-10-15-5`,
              timestamp: baseTimestamp + 2400000,
              date: date15,
              teamA: [pIale, pCaluca, pMarcleide, pFatinha, pJuliana, pPaulo].filter(Boolean) as string[],
              teamB: [pMarcelo, pAna, pGeraldinho, pAnne, pDea, allActiveIds[1]].filter(Boolean) as string[],
              winner: 'A' as const,
              scoreA: 25,
              scoreB: 22,
              duration: 600,
              startTime: baseTimestamp + 1800000,
              endTime: baseTimestamp + 2400000,
              mode: 'QUICK' as const,
              dailyNumber: 5,
              stats: []
            },
            {
              id: `match-2026-10-15-6`,
              timestamp: baseTimestamp + 3000000,
              date: date15,
              teamA: [pMarcos, pMarcleide, pPaulo, pMarcelo, pAna, pDea].filter(Boolean) as string[],
              teamB: [pFlavinha, pGeraldinho, pAnne, pFatinha, allActiveIds[2], allActiveIds[3]].filter(Boolean) as string[],
              winner: 'B' as const,
              scoreA: 20,
              scoreB: 25,
              duration: 600,
              startTime: baseTimestamp + 2400000,
              endTime: baseTimestamp + 3000000,
              mode: 'QUICK' as const,
              dailyNumber: 6,
              stats: []
            }
          ];

          const batch = writeBatch(db);
          for (const m of matchesToCreate) {
            batch.set(doc(db, 'matches', m.id), cleanObject(m));
          }
          await batch.commit();

          const allMatchesFetched = [...matches.filter(m => m.date !== date15), ...matchesToCreate];
          const recalculatedPlayers = recalculateAllStatsFromMatches(players, allMatchesFetched, getFirestoreDateKey());

          const rBatch = writeBatch(db);
          recalculatedPlayers.forEach(p => {
            rBatch.set(doc(db, 'players', p.id), cleanObject({
              elo: p.elo,
              wins: p.wins,
              losses: p.losses,
              matchesPlayed: p.matchesPlayed,
              pointsFor: p.pointsFor,
              pointsAgainst: p.pointsAgainst,
              pointsBalance: p.pointsBalance,
              eloHistory: p.eloHistory
            }), { merge: true });
          });
          await rBatch.commit();

          setMatches(allMatchesFetched);
          setPlayers(recalculatedPlayers);
          showNotification('As 6 partidas de 15/10/2026 foram recriadas e o ranking foi recalculado com sucesso!', 'success');
        } catch (error) {
          console.error('Erro ao recriar partidas de 15/10/2026:', error);
          showNotification('Erro ao recriar partidas.', 'error');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
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
