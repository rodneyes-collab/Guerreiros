
import React, { useState, useCallback } from 'react';
import { 
  auth, 
  signInWithPopup, 
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
  trackUsage
} from '../../firebase';
import { useStore } from '../../store';
import { cleanObject, generateUUID } from '../../utils/helpers';
import { Player, Team, Match, Gender } from '../../types';
import { generateTeams } from '../../utils/teamLogic';

import { analyzeMatch, verifyRules } from '../../services/geminiService';

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
    scoreA,
    scoreB,
    elapsedTime,
    setIsAnalyzing,
    isVerifyingRules,
    setIsVerifyingRules,
    setUsageStats,
    usageStats,
    synergy,
    negativeSynergy,
    rivalry,
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
      const date = new Date().toISOString().split('T')[0];
      
      const getTeamIds = (team: Team) => {
        const ids = team.players.map(p => p.id);
        if (team.setter) ids.unshift(team.setter.id);
        return ids;
      };
      
      const match: Match = {
        id: matchId,
        timestamp,
        date,
        teamA: getTeamIds(generationResult.teamA),
        teamB: getTeamIds(generationResult.teamB),
        winner,
        scoreA,
        scoreB,
        duration: elapsedTime,
        startTime: systemMetadata.matchStartTime || (timestamp - elapsedTime * 1000),
        endTime: timestamp,
        mode: 'QUICK'
      };
      
      batch.set(doc(db, 'matches', matchId), cleanObject(match));
      
      // Atualizar ELO e estatísticas
      const updatePlayerStats = (p: Player, isWinner: boolean) => {
        const eloChange = isWinner ? 25 : -20;
        const newElo = Math.max(800, p.elo + eloChange);
        const playerRef = doc(db, 'players', p.id);
        const attendanceRef = doc(db, 'attendance', date, 'players', p.id);
        
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
            playedLastMatch: true
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
      generationResult.remainingPlayers.forEach(p => {
        batch.set(doc(db, 'players', p.id), { playedLastMatch: false }, { merge: true });
        batch.set(doc(db, 'attendance', date, 'players', p.id), { playedLastMatch: false }, { merge: true });
      });
      
      // Limpar partida atual do Firestore
      batch.delete(doc(db, 'metadata', 'currentMatch'));
      batch.set(doc(db, 'metadata', 'system'), { matchStartTime: null }, { merge: true });
      
      await batch.commit();
      setSystemMetadata({ matchStartTime: null });
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
            playedLastMatch: true
          };
        } else {
          // Se estava na reserva ou nem estava na partida, playedLastMatch é false
          return { ...p, playedLastMatch: false };
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

  const handleVerifyRules = async () => {
    if (!generationResult || isVerifyingRules) return;
    setIsVerifyingRules(true);
    try {
      const result = await verifyRules(attendance, generationResult, "Equilibrado");
      setRuleVerification(result);
    } catch (error) {
      console.error("Erro ao verificar regras:", error);
      showNotification("Erro ao verificar regras com IA.", "error");
    } finally {
      setIsVerifyingRules(false);
    }
  };

  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
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
      const dateKey = new Date().toISOString().split('T')[0];
      const attendanceRef = doc(db, 'attendance', dateKey, 'players', player.id);
      
      // Calculate next arrival order based on current max in attendance
      const maxOrder = (attendance || []).reduce((max, p) => Math.max(max, p.arrivalOrder || 0), 0);
      const nextOrder = maxOrder + 1;
      
      await setDoc(attendanceRef, cleanObject({
        ...player,
        arrivalOrder: nextOrder,
        isPresent: true,
        timestamp: Date.now()
      }));
      
      await trackUsage(1, 1);
      showNotification(`${player.name} confirmou presença!`, 'success');
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
      const dateKey = new Date().toISOString().split('T')[0];
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
          const dateKey = new Date().toISOString().split('T')[0];
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
                playedLastMatch: false
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
            playedLastMatch: false
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
      'Isto irá remover sócios sem nome, corrigir dados inconsistentes e RECALCULAR TODAS AS SINERGIAS. Deseja continuar?',
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
              
              if (needsFix) {
                batch.set(doc(db, 'players', p.id), updates, { merge: true });
                fixedCount++;
              }
            }
          });

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

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showNotification('Login realizado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      showNotification('Erro ao fazer login com Google.', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.localStorage.removeItem('memberUser');
      showNotification('Sessão encerrada.', 'info');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail) return;
    setIsSendingMagicLink(true);
    try {
      const player = players.find(p => p.email?.toLowerCase() === magicLinkEmail.toLowerCase());
      if (player) {
        // Simular login de sócio
        const memberUser = {
          uid: `member_${player.id}`,
          email: player.email,
          displayName: player.name,
          isMember: true
        };
        window.localStorage.setItem('memberUser', JSON.stringify(memberUser));
        showNotification('Bem-vindo, ' + player.name + '!', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showNotification('E-mail não encontrado na lista de sócios.', 'error');
      }
    } catch (error) {
      console.error('Erro ao fazer login de sócio:', error);
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
    const playersToUse = (isReshuffle && generationResult) 
      ? [
          ...(generationResult.teamA.setter ? [generationResult.teamA.setter] : []),
          ...generationResult.teamA.players,
          ...(generationResult.teamB.setter ? [generationResult.teamB.setter] : []),
          ...generationResult.teamB.players
        ]
      : attendance;

    if (playersToUse.length < 10) {
      showNotification("Para gerar uma partida equilibrada, são necessários no mínimo 10 sócios presentes.", "info");
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
        const newCount = (systemMetadata.dailyMatchCount || 0) + 1;
        setDoc(doc(db, 'metadata', 'system'), {
          ...systemMetadata,
          dailyMatchCount: newCount,
          matchStartTime: now
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));

        setSystemMetadata({
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
        batch.set(doc(db, 'metadata', 'system'), { matchStartTime: null }, { merge: true });
        batch.delete(doc(db, 'metadata', 'currentMatch'));
        batch.commit().then(() => trackUsage(0, 2)).catch(err => handleFirestoreError(err, OperationType.WRITE, 'metadata/system'));
        
        setSystemMetadata({ matchStartTime: null });
        hideConfirmModal();
      }
    );
  };

  const handleFinishDay = () => {
    showConfirmModal(
      'Finalizar Sessão',
      'Deseja encerrar o dia? Isso irá gerar um resumo da IA e limpar a lista de presença.',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const dateKey = new Date().toISOString().split('T')[0];
          const batch = writeBatch(db);
          attendance.forEach(p => {
            batch.delete(doc(db, 'attendance', dateKey, 'players', p.id));
          });
          players.forEach(p => {
            batch.set(doc(db, 'players', p.id), { playedLastMatch: false }, { merge: true });
          });
          batch.set(doc(db, 'metadata', 'system'), { 
            dailyMatchCount: 0,
            matchStartTime: null,
            lastResetDate: dateKey
          }, { merge: true });
          await batch.commit();
          setAttendance([]);
          showNotification('Sessão finalizada com sucesso!', 'success');
        } catch (error) {
          console.error("Erro ao finalizar dia:", error);
        } finally {
          setIsSyncing(false);
          hideConfirmModal();
        }
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

  const resetDailyMatches = () => {
    showConfirmModal(
      'Zerar Estatísticas Diárias',
      'Deseja zerar as vitórias/derrotas de hoje de todos os sócios e apagar as partidas de hoje?',
      async () => {
        try {
          setIsSyncing(true);
          triggerDbStatus('writing');
          const today = new Date().toISOString().split('T')[0];
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
              playedLastMatch: false
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
              playedLastMatch: false
            }, { merge: true });
          });

          // Delete matches from today
          const todayMatches = matches.filter(m => m.date === today);
          todayMatches.forEach(m => {
            batch.delete(doc(db, 'matches', m.id));
          });

          // Reset system metadata - use set with merge
          batch.set(doc(db, 'metadata', 'system'), { 
            dailyMatchCount: 0,
            matchStartTime: null
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
            playedLastMatch: false
          });

          setPlayers(players.map(resetStats));
          setAttendance(attendance.map(resetStats));
          setMatches(matches.filter(m => m.date !== today));
          setSystemMetadata({
            dailyMatchCount: 0,
            matchStartTime: null
          });
          
          if (generationResult) {
            setGenerationResult({
              ...generationResult,
              teamA: {
                ...generationResult.teamA,
                setter: generationResult.teamA.setter ? resetStats(generationResult.teamA.setter) : null,
                players: generationResult.teamA.players.map(resetStats)
              },
              teamB: {
                ...generationResult.teamB,
                setter: generationResult.teamB.setter ? resetStats(generationResult.teamB.setter) : null,
                players: generationResult.teamB.players.map(resetStats)
              },
              remainingPlayers: generationResult.remainingPlayers.map(resetStats)
            });
          }

          showNotification('Estatísticas diárias e partidas de hoje zeradas.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch-daily-reset');
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
    isRequestingAccess,
    requestName,
    setRequestName,
    isRequestSubmitted,
    isVerifyingRules,
    isNarratingSummary,
    handleLogin,
    handleLogout,
    handleMagicLink,
    handleRequestAccess,
    handleGenerate,
    handleDiscard,
    handleFinishDay,
    resetDailyMatches,
    resetElo,
    handleFinishMatch,
    handleVerifyRules,
    onApproveRequest,
    onRejectRequest,
    triggerSync,
    recalculateStats,
    registerAttendance,
    removeAttendance,
    clearAttendance,
    onToggleIntention,
    deletePlayer,
    clearAllPlayers,
    repairDatabase,
    savePlayer,
    clearAllHistory,
    clearMatchesOnly,
    clearAllDatabase,
    refreshPlayers
  };
};
