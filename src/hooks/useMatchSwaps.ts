import { useState, useCallback } from 'react';
import { useStore } from '../../store';
import { Player, GenerationResult, Team } from '../../types';
import { calculateEffectiveElo } from '../../utils/teamLogic';
import { cleanObject } from '../../utils/helpers';
import { db, doc, setDoc } from '../../firebase';

export interface QuickSwapTarget {
  player: Player | null;
  team: 'A' | 'B' | 'Bench';
  role: 'setter' | 'player';
  slotIndex?: number;
}

export const useMatchSwaps = () => {
  const generationResult = useStore(state => state.generationResult);
  const setGenerationResult = useStore(state => state.setGenerationResult);
  const swapSelection = useStore(state => state.swapSelection);
  const setSwapSelection = useStore(state => state.setSwapSelection);
  const showNotification = useStore(state => state.showNotification);

  // Quick swap modal state
  const [quickSwapTarget, setQuickSwapTarget] = useState<QuickSwapTarget | null>(null);

  const openQuickSwap = useCallback((target: QuickSwapTarget) => {
    setQuickSwapTarget(target);
  }, []);

  const closeQuickSwap = useCallback(() => {
    setQuickSwapTarget(null);
  }, []);

  // Helper to calculate team metrics
  const calcIC = (t: Team) => {
    const allP = t.setter ? [t.setter, ...(t.players || [])] : (t.players || []);
    return allP.reduce((s: number, p: any) => s + calculateEffectiveElo(p), 0);
  };

  const calcEff = (t: Team) => {
    const allP = t.setter ? [t.setter, ...(t.players || [])] : (t.players || []);
    return Math.round(allP.reduce((s: number, p: any) => s + calculateEffectiveElo(p), 0));
  };

  // Improved performSwap: supports direct swap between any two players across Team A, Team B, and Bench
  const performSwap = useCallback(async (id1: string, id2: string) => {
    const currentGen = useStore.getState().generationResult;
    if (!currentGen) return;

    if (id1 === id2) {
      showNotification('Selecione jogadores diferentes para realizar a troca.', 'info');
      return;
    }

    const allPlayers = [
      currentGen.teamA.setter,
      ...(currentGen.teamA.players || []),
      currentGen.teamB.setter,
      ...(currentGen.teamB.players || []),
      ...(currentGen.remainingPlayers || [])
    ].filter(Boolean) as Player[];

    const p1 = allPlayers.find(p => p.id === id1);
    const p2 = allPlayers.find(p => p.id === id2);

    if (!p1 || !p2) {
      showNotification('Atleta não encontrado para a substituição.', 'error');
      return;
    }

    const swapInTeam = (team: Team): Team => {
      let newSetter = team.setter;
      if (team.setter?.id === id1) newSetter = p2;
      else if (team.setter?.id === id2) newSetter = p1;

      const newPlayers = (team.players || []).map((p: Player) => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });

      return {
        ...team,
        setter: newSetter,
        players: newPlayers
      };
    };

    const swapInList = (list: Player[]): Player[] => {
      return (list || []).map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });
    };

    const newTeamA = swapInTeam(currentGen.teamA);
    const newTeamB = swapInTeam(currentGen.teamB);
    const newRemaining = swapInList(currentGen.remainingPlayers || []);

    const updatedResult: GenerationResult = {
      ...currentGen,
      teamA: {
        ...newTeamA,
        totalIC: calcIC(newTeamA),
        totalEfficiency: calcEff(newTeamA)
      },
      teamB: {
        ...newTeamB,
        totalIC: calcIC(newTeamB),
        totalEfficiency: calcEff(newTeamB)
      },
      remainingPlayers: newRemaining
    };

    setGenerationResult(updatedResult);
    showNotification(`Substituição realizada: ${p1.name} ⇄ ${p2.name}`, 'success');

    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(updatedResult));
    } catch (err) {
      console.error('Erro ao sincronizar substituição no Firestore:', err);
    }
  }, [setGenerationResult, showNotification]);

  // Move a player into a specific slot (or swap if slot occupied)
  const movePlayerToSlot = useCallback(async (
    playerId: string,
    targetTeam: 'A' | 'B' | 'Bench',
    targetRole: 'setter' | 'player',
    targetSlotIndex?: number
  ) => {
    const currentGen = useStore.getState().generationResult;
    if (!currentGen) return;

    const allPlayers = [
      currentGen.teamA.setter,
      ...(currentGen.teamA.players || []),
      currentGen.teamB.setter,
      ...(currentGen.teamB.players || []),
      ...(currentGen.remainingPlayers || [])
    ].filter(Boolean) as Player[];

    const movingPlayer = allPlayers.find(p => p.id === playerId);
    if (!movingPlayer) {
      showNotification('Atleta não encontrado.', 'error');
      return;
    }

    // Identify occupied player in target slot if any
    let occupiedPlayer: Player | null = null;
    if (targetTeam === 'A') {
      if (targetRole === 'setter') {
        occupiedPlayer = currentGen.teamA.setter;
      } else if (targetSlotIndex !== undefined && currentGen.teamA.players[targetSlotIndex]) {
        occupiedPlayer = currentGen.teamA.players[targetSlotIndex];
      }
    } else if (targetTeam === 'B') {
      if (targetRole === 'setter') {
        occupiedPlayer = currentGen.teamB.setter;
      } else if (targetSlotIndex !== undefined && currentGen.teamB.players[targetSlotIndex]) {
        occupiedPlayer = currentGen.teamB.players[targetSlotIndex];
      }
    }

    // If slot is occupied by someone else, perform direct swap!
    if (occupiedPlayer && occupiedPlayer.id !== playerId) {
      await performSwap(playerId, occupiedPlayer.id);
      return;
    }

    // Otherwise, moving into an empty slot:
    // 1. Remove movingPlayer from its current location
    const stripPlayerFromTeam = (team: Team): Team => ({
      ...team,
      setter: team.setter?.id === playerId ? null : team.setter,
      players: (team.players || []).filter(p => p.id !== playerId)
    });

    let newTeamA = stripPlayerFromTeam(currentGen.teamA);
    let newTeamB = stripPlayerFromTeam(currentGen.teamB);
    let newRemaining = (currentGen.remainingPlayers || []).filter(p => p.id !== playerId);

    // 2. Insert player into the destination
    if (targetTeam === 'A') {
      if (targetRole === 'setter') {
        newTeamA.setter = movingPlayer;
      } else {
        if (targetSlotIndex !== undefined && targetSlotIndex <= newTeamA.players.length) {
          newTeamA.players.splice(targetSlotIndex, 0, movingPlayer);
        } else {
          newTeamA.players.push(movingPlayer);
        }
      }
    } else if (targetTeam === 'B') {
      if (targetRole === 'setter') {
        newTeamB.setter = movingPlayer;
      } else {
        if (targetSlotIndex !== undefined && targetSlotIndex <= newTeamB.players.length) {
          newTeamB.players.splice(targetSlotIndex, 0, movingPlayer);
        } else {
          newTeamB.players.push(movingPlayer);
        }
      }
    } else if (targetTeam === 'Bench') {
      newRemaining.unshift(movingPlayer);
    }

    const updatedResult: GenerationResult = {
      ...currentGen,
      teamA: {
        ...newTeamA,
        totalIC: calcIC(newTeamA),
        totalEfficiency: calcEff(newTeamA)
      },
      teamB: {
        ...newTeamB,
        totalIC: calcIC(newTeamB),
        totalEfficiency: calcEff(newTeamB)
      },
      remainingPlayers: newRemaining
    };

    setGenerationResult(updatedResult);
    showNotification(`${movingPlayer.name} movido com sucesso!`, 'success');

    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(updatedResult));
    } catch (err) {
      console.error('Erro ao salvar no Firestore:', err);
    }
  }, [performSwap, setGenerationResult, showNotification]);

  // Execute quick swap using target from state
  const executeQuickSwap = useCallback(async (replacementPlayer: Player) => {
    if (!quickSwapTarget) return;

    const { player: currentTargetPlayer, team, role, slotIndex } = quickSwapTarget;

    if (currentTargetPlayer) {
      // Slot is currently occupied: swap the two athletes
      await performSwap(currentTargetPlayer.id, replacementPlayer.id);
    } else {
      // Slot is empty: assign replacement player directly
      await movePlayerToSlot(replacementPlayer.id, team, role, slotIndex);
    }

    closeQuickSwap();
  }, [quickSwapTarget, performSwap, movePlayerToSlot, closeQuickSwap]);

  // Promote a player to setter within a team
  const promoteToSetter = useCallback(async (team: 'A' | 'B', playerId: string) => {
    const currentGen = useStore.getState().generationResult;
    if (!currentGen) return;

    const teamKey = team === 'A' ? 'teamA' : 'teamB';
    const teamData = currentGen[teamKey];
    const playerIndex = (teamData.players || []).findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const player = teamData.players[playerIndex];
    const oldSetter = teamData.setter;

    const newPlayers = [...(teamData.players || [])];
    newPlayers.splice(playerIndex, 1);
    if (oldSetter) {
      newPlayers.push(oldSetter);
    }

    const updatedResult: GenerationResult = {
      ...currentGen,
      [teamKey]: {
        ...teamData,
        setter: player,
        players: newPlayers,
        totalIC: calcIC({ ...teamData, setter: player, players: newPlayers }),
        totalEfficiency: calcEff({ ...teamData, setter: player, players: newPlayers })
      }
    };

    setGenerationResult(updatedResult);
    showNotification(`${player.name} designado como levantador da equipe.`, 'success');

    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(updatedResult));
    } catch (err) {
      console.error('Erro ao sincronizar novo levantador no Firestore:', err);
    }
  }, [setGenerationResult, showNotification]);

  // Substitute target out with the first reserve in remainingPlayers
  const handleRemovePlayer = useCallback((teamOrId: string, maybeId?: string) => {
    const currentGen = useStore.getState().generationResult;
    const targetPlayerId = maybeId || teamOrId;
    if (!currentGen) return;

    if (!currentGen.remainingPlayers || currentGen.remainingPlayers.length === 0) {
      showNotification('Não há reservas disponíveis na fila para substituição!', 'error');
      return;
    }

    performSwap(targetPlayerId, currentGen.remainingPlayers[0].id);
  }, [performSwap, showNotification]);

  // Two-click selection handler
  const handleSwapClick = useCallback((source: 'A' | 'B' | 'Bench', playerId: string) => {
    const currentSwap = useStore.getState().swapSelection;
    if (!currentSwap) {
      setSwapSelection({ source, playerId });
    } else {
      if (currentSwap.playerId === playerId) {
        setSwapSelection(null);
      } else {
        performSwap(currentSwap.playerId, playerId);
        setSwapSelection(null);
      }
    }
  }, [setSwapSelection, performSwap]);

  return {
    swapSelection,
    quickSwapTarget,
    isQuickSwapOpen: Boolean(quickSwapTarget),
    openQuickSwap,
    closeQuickSwap,
    executeQuickSwap,
    performSwap,
    movePlayerToSlot,
    promoteToSetter,
    handleRemovePlayer,
    handleSwapClick
  };
};
