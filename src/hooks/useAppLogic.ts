
import React, { useState, useCallback } from 'react';
import { 
  auth, 
  signInWithPopup, 
  signInWithRedirect,
  googleProvider, 
  signOut, 
  sendSignInLinkToEmail, 
  db, 
  doc, 
  setDoc, 
  addDoc, 
  collection, 
  deleteDoc, 
  writeBatch,
  getDocs,
  OperationType,
  handleFirestoreError,
  trackUsage,
  trackAIUsage,
  getFirestoreDateKey
} from '../../firebase';
import { useStore } from '../../store';
import { cleanObject, generateUUID } from '../../utils/helpers';
import { Player, Team, Match, Gender, Tournament, TournamentTeam, TournamentMatch, SetScore } from '../../types';
import { generateTeams, generateTournamentTeams } from '../../utils/teamLogic';
import { playerSchema, matchSchema } from '../lib/schemas';

import { analyzeMatch, verifyRules, detectAnomalies } from '../../services/geminiService';

export const useAppLogic = () => {
  const {
    user,
    userRole,
    players,
    attendance,
    preConfirmations,
    matches,
    systemMetadata,
    generationResult,
    setPlayers,
    setAttendance,
    setMatches,
    setGenerationResult,
    setSystemMetadata,
    setViewMode,
    showNotification,
    showConfirmModal,
    hideConfirmModal,
    setAnalysis,
    setRuleVerification,
    setScoreA,
    setScoreB,
    setTempScoreA,
    setTempScoreB,
    setScoreMode,
    setNarrationScript,
    setNarrationAudio,
    setIsSyncing,
    setDbStatus,
    setUser,
    setUserRole,
    setCurrentPlayer,
    scoreA,
    scoreB,
    tempScoreA,
    tempScoreB,
    scoreMode,
    elapsedTime,
    setIsAnalyzing,
    isAnalyzing,
    isVerifyingRules,
    isScanningAnomalies,
    anomalyReport,
    setIsVerifyingRules,
    setIsScanningAnomalies,
    setAnomalyReport,
    setIsLoggingOut,
    setUsageStats,
    usageStats,
    synergy,
    negativeSynergy,
    rivalry,
    activeTournament,
    setTournaments,
    setActiveTournament,
    setSynergy,
    setNegativeSynergy,
    setRivalry
  } = useStore();

  // ... (previous state and functions)

  const resetElo = async () => {
    showConfirmModal(
      'Resetar ELO de Todos',
      'Deseja resetar o ELO de TODOS os sócios para 1200? Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const batch = writeBatch(db);
          
          players.forEach(p => {
            if (p.id) {
              batch.set(doc(db, 'players', p.id), { elo: 1200 }, { merge: true });
            }
          });
          
          await batch.commit();
          await trackUsage(0, players.length);
          setPlayers(players.map(p => ({ ...p, elo: 1200 })));
          showNotification('ELO de todos os sócios resetado para 1200.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'reset-elo');
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
      }
    );
  };

  const handleFinishMatch = async (winner: 'A' | 'B') => {
    if (!generationResult) return;
    
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      
      const batch = writeBatch(db);
      const matchId = generateUUID();
      const timestamp = Date.now();
      const date = getFirestoreDateKey();
      
      // Sync scores if in SCORE mode
      let finalScoreA = scoreA;
      let finalScoreB = scoreB;
      
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
      
      const getTeamIds = (team: Team) => {
        const ids = team.players.map(p => p.id);
        if (team.setter) ids.unshift(team.setter.id);
        return ids;
      };

      // Garantir que o dailyMatchCount esteja sincronizado
      const now = Date.now();
      const sixteenHoursAgo = now - (16 * 60 * 60 * 1000);
      let resetThreshold = systemMetadata.lastResetTimestamp || sixteenHoursAgo;
      
      // Fix for future date anomalies (e.g. 2026 dates in DB while user is in 2024)
      if (resetThreshold > now) {
        resetThreshold = sixteenHoursAgo;
      }
      
      const sessionMatchesCount = (matches || []).filter(m => m.timestamp > resetThreshold).length;
      
      // Se o contador do sistema estiver menor que o real, corrigimos.
      // Se estiver maior (ex: gerou mas não terminou), mantemos.
      // Adicionamos 1 para a partida que acabou de ser finalizada
      const finalCount = Math.max(sessionMatchesCount + 1, (systemMetadata.dailyMatchCount || 0) + 1);
      
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
        dailyNumber: finalCount
      };
      
      // Validate match data
      matchSchema.parse(match);
      
      batch.set(doc(db, 'matches', matchId), cleanObject(match));

      // Update system metadata ONCE in the batch
      batch.set(doc(db, 'metadata', 'system'), { 
        dailyMatchCount: finalCount,
        matchStartTime: null,
        lastMatchTimestamp: timestamp,
        lastUpdate: timestamp
      }, { merge: true });
      
      // Atualizar ELO e estatísticas
      const updatePlayerStats = (p: Player, isWinner: boolean) => {
        const eloChange = isWinner ? 25 : -20;
        const newElo = Math.max(800, p.elo + eloChange);
        const playerRef = doc(db, 'players', p.id);
        const attendanceRef = doc(db, 'attendance', date, 'players', p.id);
        
        const newHistoryEntry = { date: new Date().toISOString(), elo: newElo };
        const updatedHistory = [...(p.eloHistory || []), newHistoryEntry].slice(-50); // Keep last 50 entries
        
        const updates = {
          elo: newElo,
          matchesPlayed: (p.matchesPlayed || 0) + 1,
          wins: isWinner ? (p.wins || 0) + 1 : (p.wins || 0),
          losses: !isWinner ? (p.losses || 0) + 1 : (p.losses || 0),
          dailyMatches: (p.dailyMatches || 0) + 1,
          dailyWins: isWinner ? (p.dailyWins || 0) + 1 : (p.dailyWins || 0),
          dailyLosses: !isWinner ? (p.dailyLosses || 0) + 1 : (p.dailyLosses || 0),
          dailyEloGain: (p.dailyEloGain || 0) + eloChange,
          dailyResults: [...(p.dailyResults || []), (isWinner ? 'V' : 'D') as 'V' | 'D'],
          playedLastMatch: true,
          consecutiveBenched: 0,
          eloHistory: updatedHistory
        };
        
        batch.set(playerRef, updates, { merge: true });
        batch.set(attendanceRef, updates, { merge: true });
      };
      
      const teamA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
      const teamB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];
      
      teamA.forEach(p => updatePlayerStats(p, winner === 'A'));
      teamB.forEach(p => updatePlayerStats(p, winner === 'B'));

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
        batch.set(doc(db, 'players', p.id), { playedLastMatch: false, consecutiveBenched: newConsecutiveBenched }, { merge: true });
        batch.set(doc(db, 'attendance', date, 'players', p.id), { playedLastMatch: false, consecutiveBenched: newConsecutiveBenched }, { merge: true });
      });
      
      // Limpar partida atual do Firestore
      batch.delete(doc(db, 'metadata', 'currentMatch'));
      
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
          const eloChange = isWinner ? 25 : -20;
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
            consecutiveBenched: 0
          };
        } else {
          // Se estava na reserva ou nem estava na partida, playedLastMatch é false
          return { ...p, playedLastMatch: false, consecutiveBenched: (p.consecutiveBenched || 0) + 1 };
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

      showNotification(`Partida registrada! Vitória do Time ${winner}`, 'success');
    } catch (error) {
      console.error('Erro ao finalizar partida:', error);
      handleFirestoreError(error, OperationType.WRITE, 'finish-match');
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
        generationResult.teamA,
        generationResult.teamB
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

  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false);
  const [isNarratingSummary, setIsNarratingSummary] = useState(false);

  const triggerDbStatus = useCallback((status: 'reading' | 'writing') => {
    setDbStatus(status);
    const timer = setTimeout(() => setDbStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [setDbStatus]);

  const registerAttendance = async (player: Player) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      const attendanceRef = doc(db, 'attendance', dateKey, 'players', player.id);
      
      // Calculate next arrival order based on current max in attendance
      // Fetch fresh attendance to avoid stale state issues
      const attendanceSnap = await getDocs(collection(db, 'attendance', dateKey, 'players'));
      const currentAttendance = attendanceSnap.docs.map(d => d.data() as Player);
      const maxOrder = currentAttendance.reduce((max, p) => Math.max(max, p.arrivalOrder || 0), 0);
      const nextOrder = maxOrder + 1;
      
      // Ensure we have the most up-to-date name from the players list
      const fullPlayer = players.find(p => p.id === player.id);
      const nameToSave = fullPlayer?.name || player.name || "Sócio sem nome";
      
      await setDoc(attendanceRef, cleanObject({
        ...player,
        name: nameToSave,
        arrivalOrder: nextOrder,
        isPresent: true,
        timestamp: Date.now()
      }));
      
      await trackUsage(1, 1);
      showNotification(`${nameToSave} confirmou presença!`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    } finally {
      setIsSyncing(false);
    }
  };

  const removeAttendance = async (playerId: string) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      const dateKey = getFirestoreDateKey();
      await deleteDoc(doc(db, 'attendance', dateKey, 'players', playerId));
      await trackUsage(0, 1);
      showNotification('Presença removida.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
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
          await batch.commit();
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
      const isConfirmed = (preConfirmations || []).some(p => p.id === player.id);
      const preConfirmationRef = doc(db, 'preConfirmations', player.id);
      
      if (isConfirmed) {
        await deleteDoc(preConfirmationRef);
        showNotification('Intenção removida.', 'info');
      } else {
        await setDoc(preConfirmationRef, cleanObject({
          ...player,
          timestamp: Date.now()
        }));
        showNotification('Intenção confirmada!', 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pre-confirmation');
    } finally {
      setIsSyncing(false);
    }
  };

  const deletePlayer = async (id: string) => {
    showConfirmModal(
      'Excluir Sócio',
      'Tem certeza que deseja excluir este sócio? Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          await deleteDoc(doc(db, 'players', id));
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
      'CUIDADO: Isso irá excluir TODAS as partidas registradas E zerar as estatísticas de todos os sócios (partidas, vitórias, derrotas). Esta ação é irreversível. Deseja continuar?',
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
          
          // 2. Reverter as estatísticas dos jogadores
          const allPlayersInMatch = [...(matchToDelete.teamA || []), ...(matchToDelete.teamB || [])];
          
          allPlayersInMatch.forEach(pid => {
            const p = players.find(player => player.id === pid);
            if (!p) return;
            
            const isWinner = (matchToDelete.winner === 'A' && matchToDelete.teamA.includes(pid)) || 
                             (matchToDelete.winner === 'B' && matchToDelete.teamB.includes(pid));
            const eloChange = isWinner ? 25 : -20;
            
            let updatedHistory = [...(p.eloHistory || [])];
            let previousElo = p.elo;
            
            // Tentar encontrar a entrada exata no histórico para remover
            const matchTime = new Date(matchToDelete.endTime).getTime();
            const entryIndex = updatedHistory.findIndex(entry => {
              const entryTime = new Date(entry.date).getTime();
              return Math.abs(entryTime - matchTime) < 60000; // dentro de 60 segundos
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
            if (results.length > 0) {
              const expectedResult = isWinner ? 'V' : 'D';
              const lastIdx = results.lastIndexOf(expectedResult);
              if (lastIdx !== -1) {
                results.splice(lastIdx, 1);
              }
            }
            
            const updates = {
              elo: previousElo,
              matchesPlayed: Math.max(0, (p.matchesPlayed || 0) - 1),
              wins: isWinner ? Math.max(0, (p.wins || 0) - 1) : (p.wins || 0),
              losses: !isWinner ? Math.max(0, (p.losses || 0) - 1) : (p.losses || 0),
              dailyMatches: Math.max(0, (p.dailyMatches || 0) - 1),
              dailyWins: isWinner ? Math.max(0, (p.dailyWins || 0) - 1) : (p.dailyWins || 0),
              dailyLosses: !isWinner ? Math.max(0, (p.dailyLosses || 0) - 1) : (p.dailyLosses || 0),
              dailyEloGain: (p.dailyEloGain || 0) - eloChange,
              dailyResults: results,
              eloHistory: updatedHistory
            };
            
            batch.set(doc(db, 'players', p.id), updates, { merge: true });
            batch.set(doc(db, 'attendance', matchToDelete.date, 'players', p.id), updates, { merge: true });
          });
          
          await batch.commit();
          
          setMatches(matches.filter(m => m.id !== matchId));
          
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

  const clearMatchesOnly = async () => {
    showConfirmModal(
      'Zerar Histórico de Partidas',
      'Deseja excluir TODAS as partidas registradas? As estatísticas dos sócios (ELO, vitórias, derrotas) NÃO serão alteradas. Esta ação é irreversível.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          
          const matchesSnapshot = await getDocs(collection(db, 'matches'));
          const batch = writeBatch(db);
          
          matchesSnapshot.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });
          
          await batch.commit();
          setMatches([]);
          
          showNotification('Todo o histórico de partidas foi excluído.', 'success');
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
          
          players.forEach(p => {
            if (!p.id) return;
            
            // Delete players with no name or empty name
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
              if (typeof p.dailyWins !== 'number') { updates.dailyWins = 0; needsFix = true; }
              if (typeof p.dailyLosses !== 'number') { updates.dailyLosses = 0; needsFix = true; }
              if (typeof p.dailyEloGain !== 'number') { updates.dailyEloGain = 0; needsFix = true; }
              
              // Fix gender if missing
              if (!p.gender || (p.gender !== Gender.MALE && p.gender !== Gender.FEMALE)) {
                updates.gender = Gender.MALE;
                needsFix = true;
              }

              // Initialize eloHistory if missing
              if (!p.eloHistory || p.eloHistory.length === 0) {
                updates.eloHistory = [{ date: getFirestoreDateKey(), elo: p.elo || 1200 }];
                needsFix = true;
              }
              
              if (needsFix) {
                batch.set(doc(db, 'players', p.id), updates, { merge: true });
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

          batch.set(doc(db, 'metadata', 'synergy'), newSynergy);
          batch.set(doc(db, 'metadata', 'negative_synergy'), newNegativeSynergy);
          batch.set(doc(db, 'metadata', 'rivalry'), newRivalry);
          
          await batch.commit();

          setSynergy(newSynergy);
          setNegativeSynergy(newNegativeSynergy);
          setRivalry(newRivalry);

          showNotification(`Banco reparado! ${deletedCount} excluídos, ${fixedCount} corrigidos e sinergias recalculadas.`, 'success');
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
      const playerRef = doc(db, 'players', id);
      
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
        status: playerData.status || 'active',
        createdAt: playerData.createdAt || Date.now()
      };

      // Validate player data
      playerSchema.parse(finalData);

      if (finalData.email === '') {
        delete finalData.email;
      }

      await setDoc(playerRef, cleanObject(finalData), { merge: true });
      await trackUsage(0, 1);
      showNotification(playerData.id ? 'Sócio atualizado!' : 'Sócio cadastrado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players-save');
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshPlayers = async () => {
    showNotification('Sincronizando dados...', 'info');
  };

  const fixDatabaseAnomalies = async () => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');
      showNotification('Corrigindo anomalias no banco de dados...', 'info');
      
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

      // 2. Fix future dates (e.g. 2026 dates when current year is earlier, or just sync to now if they are > now)
      // Actually, if the environment is 2026, Date.now() is 2026.
      // If the user meant the dates are in the future relative to the *real* current time, we can't easily know the real time if Date.now() is 2026.
      // But we can fix the reset timestamp if it's > Date.now()
      let newResetThreshold = systemMetadata.lastResetTimestamp;
      if (systemMetadata.lastResetTimestamp && systemMetadata.lastResetTimestamp > now) {
        newResetThreshold = now - (16 * 60 * 60 * 1000); // 16 hours ago
        batch.set(doc(db, 'metadata', 'system'), {
          lastResetTimestamp: newResetThreshold
        }, { merge: true });
        updates++;
      }
      
      // 3. Recalculate dailyMatchCount if it's 0 but there are matches today
      const threshold = newResetThreshold || (now - (16 * 60 * 60 * 1000));
      const sessionMatchesCount = (matches || []).filter(m => m.timestamp > threshold).length;
      // Also account for a currently active match that hasn't finished
      const expectedCount = sessionMatchesCount + (generationResult ? 1 : 0);
      if (systemMetadata.dailyMatchCount !== expectedCount) {
        batch.set(doc(db, 'metadata', 'system'), {
          dailyMatchCount: expectedCount
        }, { merge: true });
        updates++;
      }

      if (updates > 0) {
        await batch.commit();
        showNotification(`Corrigidas ${updates} anomalias com sucesso!`, 'success');
        triggerSync(); // Reload to apply changes
      } else {
        showNotification('Nenhuma anomalia crítica encontrada para correção automática.', 'info');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'fix-anomalies');
      showNotification('Erro ao corrigir anomalias.', 'error');
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
      setUser(null);
      setUserRole(null);
      setCurrentPlayer(null);
      
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
        // Simular login de sócio ou admin
        const memberUser = {
          uid: player ? `member_${player.id}` : `admin_${Date.now()}`,
          email: trimmedEmail,
          displayName: player ? player.name : 'Administrador',
          isMember: true
        };
        window.localStorage.setItem('memberUser', JSON.stringify(memberUser));
        
        // Save to recent logins
        try {
          const recentLogins = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
          const newRecent = [trimmedEmail, ...recentLogins.filter((e: string) => e !== trimmedEmail)].slice(0, 3);
          window.localStorage.setItem('recentLogins', JSON.stringify(newRecent));
        } catch (e) {
          console.error('Error saving recent logins', e);
        }
        
        // Update store directly
        setUser(memberUser as any);
        if (player) {
          setCurrentPlayer(player);
        }
        
        const isActuallyAdmin = isAdminEmail || player?.isAdmin;
        setUserRole(isActuallyAdmin ? 'ADMIN' : 'MEMBER');
        
        showNotification('Bem-vindo, ' + (player ? player.name : 'Administrador') + '!', 'success');
      } else {
        showNotification('E-mail não encontrado na lista de sócios.', 'error');
      }
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      showNotification('Erro ao validar acesso.', 'error');
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

  const handleGenerate = async (onlyCurrentPlayers: boolean | any = false) => {
    const isReshuffle = onlyCurrentPlayers === true;
    let playersToUse = (isReshuffle && generationResult) 
      ? [
          ...(generationResult.teamA.setter ? [generationResult.teamA.setter] : []),
          ...generationResult.teamA.players,
          ...(generationResult.teamB.setter ? [generationResult.teamB.setter] : []),
          ...generationResult.teamB.players
        ]
      : attendance;

    // Enrich players with full data from the master players list to ensure no missing fields
    playersToUse = playersToUse.map(p => {
      const fullPlayer = players.find(fp => fp.id === p.id);
      return {
        ...p,
        ...fullPlayer,
        name: fullPlayer?.name || p.name || "Sócio sem nome",
        elo: fullPlayer?.elo || p.elo || 1200,
        gender: fullPlayer?.gender || p.gender || Gender.MALE,
        arrivalOrder: p.arrivalOrder || fullPlayer?.arrivalOrder || 0
      };
    });

    if (playersToUse.length < 12) {
      showNotification("Para gerar uma partida equilibrada, são necessários no mínimo 12 sócios presentes.", "info");
      return;
    }

    const performGeneration = async () => {
      if (navigator.vibrate) navigator.vibrate(50);
      const result = generateTeams(playersToUse);
      
      // Persistir partida no Firestore para outros admins
      try {
        await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(result));
        await trackUsage(0, 1);
      } catch (err) {
        console.error("Erro ao persistir partida:", err);
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

      if (!isReshuffle) {
        const now = Date.now();
        const threshold = systemMetadata.lastResetTimestamp || (now - (16 * 60 * 60 * 1000));
        const sessionMatchesCount = (matches || []).filter(m => m.timestamp > threshold).length;
        const newCount = sessionMatchesCount + 1;
        setDoc(doc(db, 'metadata', 'system'), cleanObject({
          ...systemMetadata,
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
        isReshuffle ? 'Reorganizar Times' : 'Nova Escalação',
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

  const handleDiscard = () => {
    if (!generationResult) return;
    showConfirmModal(
      'Descartar Partida',
      'Tem certeza que deseja descartar esta partida? Os dados não serão salvos.',
      () => {
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
        const sessionMatchesCount = (matches || []).filter(m => m.timestamp > threshold).length;
        
        batch.set(doc(db, 'metadata', 'system'), { 
          matchStartTime: null,
          dailyMatchCount: sessionMatchesCount
        }, { merge: true });
        batch.delete(doc(db, 'metadata', 'currentMatch'));
        batch.commit().then(() => trackUsage(0, 2)).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));
        
        setSystemMetadata({ 
          ...systemMetadata,
          matchStartTime: null,
          dailyMatchCount: sessionMatchesCount
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
      const playerRef = doc(db, 'players', generateUUID());
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
            p.dailyEloGain = (p.dailyEloGain || 0) + 25;
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

      // 5. Ajustar metadados do sistema para mostrar as partidas
      // Definir o timestamp para 1 para garantir que todas as partidas do dia sejam mostradas e evitar falsy
      batch.set(doc(db, 'metadata', 'system'), {
        lastResetTimestamp: 1,
        dailyMatchCount: todayMatches.length + (generationResult ? 1 : 0),
        lastResetDate: today // Garantir que o date key esteja correto
      }, { merge: true });

      await batch.commit();
      
      // Atualizar estado local
      setPlayers(resetPlayers);
      setSystemMetadata({
        ...systemMetadata,
        lastResetTimestamp: 1,
        dailyMatchCount: todayMatches.length + (generationResult ? 1 : 0),
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
          
          // Local matches filter - hide all current matches
          setMatches(matches.filter(m => m.timestamp > now));
          
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
      
      const paymentId = id || generateUUID();
      const timestamp = Date.now();
      
      const payment: any = {
        ...paymentData,
        id: paymentId,
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
      await setDoc(doc(db, 'system', 'metadata'), { monthlyFee: fee }, { merge: true });
      showNotification('Valor da mensalidade atualizado!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'system/metadata');
      showNotification('Erro ao atualizar mensalidade.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const startTournament = async (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number }) => {
    try {
      setIsSyncing(true);
      triggerDbStatus('writing');

      const participants = [...attendance];
      if (participants.length < config.numTeams * 6) {
        showNotification(`Número insuficiente de jogadores para ${config.numTeams} times.`, 'error');
        return;
      }

      const { teams, reserves } = generateTournamentTeams(participants, config.numTeams);
      
      // Round Robin Scheduling using Circle Method
      const numTeams = config.numTeams;
      const teamIds = teams.map(t => t.id);
      const rounds: { teamAId: string; teamBId: string }[][] = [];
      
      const tempTeams = [...teamIds];
      if (numTeams % 2 !== 0) {
        tempTeams.push('BYE'); // Dummy team for odd number of teams
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
        
        // Rotate teams (keep first team fixed)
        const last = tempTeams.pop()!;
        tempTeams.splice(1, 0, last);
      }
      
      // Flatten rounds into matches, trying to avoid consecutive matches for teams
      const finalMatches: TournamentMatch[] = [];
      let lastMatchTeams: string[] = [];
      
      const availableRounds = [...rounds];
      let currentRoundNum = 1;
      
      while (availableRounds.length > 0) {
        // Find a round where the first match doesn't involve teams from the last match
        let roundIdx = availableRounds.findIndex(round => {
          if (round.length === 0) return true;
          const firstMatch = round[0];
          return !lastMatchTeams.includes(firstMatch.teamAId) && !lastMatchTeams.includes(firstMatch.teamBId);
        });
        
        if (roundIdx === -1) {
          // If no round has a perfect first match, try to find a round that HAS a match that doesn't overlap
          // and we will swap it to the first position
          roundIdx = availableRounds.findIndex(round => {
            return round.some(m => !lastMatchTeams.includes(m.teamAId) && !lastMatchTeams.includes(m.teamBId));
          });
        }
        
        if (roundIdx === -1) roundIdx = 0; // Fallback
        
        const currentRound = availableRounds.splice(roundIdx, 1)[0];
        
        // Within the round, reorder to avoid overlap with lastMatchTeams
        if (currentRound.length > 1) {
          const swapIdx = currentRound.findIndex(m => !lastMatchTeams.includes(m.teamAId) && !lastMatchTeams.includes(m.teamBId));
          if (swapIdx !== -1 && swapIdx !== 0) {
            [currentRound[0], currentRound[swapIdx]] = [currentRound[swapIdx], currentRound[0]];
          }
          
          // Also try to order the rest of the matches in the round to minimize internal overlaps (though Circle Method shouldn't have any)
          // and to prepare a good "last match" for the next round.
        }
        
        currentRound.forEach(m => {
          finalMatches.push({
            id: generateUUID(),
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            scoreA: 0,
            scoreB: 0,
            setsA: 0,
            setsB: 0,
            status: 'pending',
            round: currentRoundNum
          });
          lastMatchTeams = [m.teamAId, m.teamBId];
        });
        currentRoundNum++;
      }

      const tournament: Tournament = {
        id: generateUUID(),
        name: `Torneio de Aniversariantes - ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
        date: getFirestoreDateKey(),
        status: 'active',
        teams,
        matches: finalMatches,
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

          return {
            ...m,
            scoreA,
            scoreB,
            setsA,
            setsB,
            setScores,
            status: 'completed' as const,
            winnerId: setsA > setsB ? m.teamAId : (setsB > setsA ? m.teamBId : undefined)
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

  return {
    magicLinkEmail,
    setMagicLinkEmail,
    isSendingMagicLink,
    isLoggingIn,
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    isVerifyingRules,
    isAnalyzing,
    isScanningAnomalies,
    anomalyReport,
    isNarratingSummary,
    createDataSnapshot,
    fixDatabaseAnomalies,
    handleScanAnomalies,
    handleLogout,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    handleDiscard,
    handleFinishDay,
    resetElo,
    handleFinishMatch,
    handleAnalyzeMatch,
    handleVerifyRules,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateStats,
    recalculateDailyStats,
    registerAttendance,
    removeAttendance,
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
    deleteTournament
  };
};
