
import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { getPlayerTier } from '../../utils/tierUtils';
import { Zap, Clock, PlayCircle, Smartphone, Trophy, Target, Medal, Flame } from 'lucide-react';
import { Player, GenerationResult, Match, SystemMetadata, Tournament } from '../../types';
import { getPriorityQueue } from '../../utils/teamLogic';
import { usePlayerStatusNotification } from '../hooks/usePlayerStatusNotification';
import { useStore } from '../../store';

interface PlayerStatusCardProps {
  currentPlayer: Player | null;
  attendance: Player[];
  generationResult: GenerationResult | null;
  matches: Match[];
  systemMetadata: SystemMetadata;
  activeTournament?: Tournament | null;
}

export const PlayerStatusCard: React.FC<PlayerStatusCardProps> = ({
  currentPlayer,
  attendance,
  generationResult,
  matches,
  systemMetadata,
  activeTournament
}) => {
  const showNotification = useStore(state => state.showNotification);
  const swapSelection = useStore(state => state.swapSelection);
  const allPlayers = useStore(state => state.players);
  const isSelectedForSwap = currentPlayer && swapSelection?.playerId === currentPlayer.id;
  const { 
    isEnabled, 
    isMatchEnabled,
    requestPermission, 
    disableNotifications,
    toggleMatchNotifications
  } = usePlayerStatusNotification(
    currentPlayer, 
    generationResult,
    matches,
    systemMetadata
  );
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [isTogglingMatch, setIsTogglingMatch] = React.useState(false);

  const { isTopAssiduidade, isTopEloGain } = useMemo(() => {
    if (!currentPlayer || !allPlayers.length) return { isTopAssiduidade: false, isTopEloGain: false };
    
    let maxMatches = 0;
    let maxGain = -9999;
    
    for (const p of allPlayers) {
      if ((p.matchesPlayed || 0) > maxMatches) maxMatches = p.matchesPlayed || 0;
      
      if (p.eloHistory && p.eloHistory.length > 0) {
        const lastEntry = p.eloHistory[p.eloHistory.length - 1];
        if ((lastEntry.change || 0) > maxGain) {
          maxGain = lastEntry.change || 0;
        }
      }
    }

    const isAssiduo = maxMatches > 0 && (currentPlayer.matchesPlayed || 0) === maxMatches;
    
    let myGain = -9999;
    if (currentPlayer.eloHistory && currentPlayer.eloHistory.length > 0) {
      const lastEntry = currentPlayer.eloHistory[currentPlayer.eloHistory.length - 1];
      myGain = lastEntry.change || 0;
    }
    const isGainTop = maxGain > 0 && myGain === maxGain;

    return { isTopAssiduidade: isAssiduo, isTopEloGain: isGainTop };
  }, [currentPlayer, allPlayers]);

  const handleToggleNotifications = async () => {
    console.log('handleToggleNotifications: isEnabled =', isEnabled, 'isRequesting =', isRequesting);
    if (isRequesting) return;
    
    setIsRequesting(true);
    try {
      if (isEnabled) {
        console.log('Desativando notificações...');
        await disableNotifications();
        if (showNotification) showNotification('Notificações desativadas.', 'info');
      } else {
        console.log('Ativando notificações...');
        const success = await requestPermission();
        if (!success && showNotification) {
          showNotification('Falha ao ativar notificações. No iPhone, adicione o app à Tela de Início.', 'error');
        }
      }
    } catch (error) {
      console.error('Erro ao alternar notificações:', error);
      if (showNotification) showNotification('Erro ao processar notificações.', 'error');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleToggleMatchNotifications = async () => {
    if (isTogglingMatch) return;
    setIsTogglingMatch(true);
    try {
      await toggleMatchNotifications();
      showNotification(isMatchEnabled ? 'Alertas de partidas desativados.' : 'Alertas de partidas ativados!', 'success');
    } catch (error) {
      console.error('Erro ao alternar alertas de partida:', error);
    } finally {
      setIsTogglingMatch(false);
    }
  };

  const status = useMemo(() => {
    if (!currentPlayer) return { label: 'Não Vinculado', type: 'unlinked', icon: Clock, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/30' };

    // 0. Check if there is an active tournament
    if (activeTournament) {
      // Find which team the player is in
      const playerTeam = activeTournament.teams.find(t => t.players.includes(currentPlayer.id));
      
      if (playerTeam) {
        // Check if the player's team is currently playing
        const isPlayingNow = activeTournament.matches.some(m => 
          m.status === 'pending' && (m.teamAId === playerTeam.id || m.teamBId === playerTeam.id)
        );
        
        if (isPlayingNow) {
          return { label: `Jogando: ${playerTeam.name}`, type: 'playing', icon: PlayCircle, color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/30' };
        } else {
          // Find if they have upcoming matches
          const upcomingMatches = activeTournament.matches.filter(m => 
            m.status === 'pending' && (m.teamAId === playerTeam.id || m.teamBId === playerTeam.id)
          );
          
          if (upcomingMatches.length > 0) {
            return { label: `Aguardando: ${playerTeam.name}`, type: 'wait', icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' };
          } else {
            return { label: `Torneio: ${playerTeam.name}`, type: 'queue', icon: Trophy, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' };
          }
        }
      } else if (activeTournament.reserves?.includes(currentPlayer.id)) {
        return { label: 'Reserva do Torneio', type: 'queue', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' };
      }
      
      return { label: 'Fora do Torneio', type: 'absent', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30' };
    }

    // 1. Check if playing now
    if (generationResult) {
      const inTeamA = [generationResult.teamA.setter, ...generationResult.teamA.players].some(p => p?.id === currentPlayer.id);
      if (inTeamA) return { label: 'Time A', type: 'playing', icon: PlayCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };

      const inTeamB = [generationResult.teamB.setter, ...generationResult.teamB.players].some(p => p?.id === currentPlayer.id);
      if (inTeamB) return { label: 'Time B', type: 'playing', icon: PlayCircle, color: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/30' };

      // 2. Check waitlist if match is happening
      const waitlistIndex = generationResult.remainingPlayers.findIndex(p => p.id === currentPlayer.id);
      if (waitlistIndex !== -1) {
        if (waitlistIndex < 12) return { label: 'Próxima Partida', type: 'next', icon: Zap, color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/30' };
        if (waitlistIndex < 24) return { label: 'Daqui a 2 Partidas', type: 'wait', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' };
        return { label: 'Na Fila', type: 'queue', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' };
      }
    } else {
      // 3. No match happening, check priority queue
      const { topPlayers, remainingPlayers } = getPriorityQueue(attendance, 12, 2);
      
      const topIndex = topPlayers.findIndex(p => p.id === currentPlayer.id);
      if (topIndex !== -1) return { label: 'Próxima Partida', type: 'next', icon: Zap, color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/30' };

      const remainingIndex = remainingPlayers.findIndex(p => p.id === currentPlayer.id);
      if (remainingIndex !== -1) {
        if (remainingIndex < 12) return { label: 'Daqui a 2 Partidas', type: 'wait', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' };
        return { label: 'Na Fila', type: 'queue', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' };
      }
    }

    // 4. Not in attendance
    const isPresent = attendance.some(p => p.id === currentPlayer.id);
    if (!isPresent) return { label: 'Ausente', type: 'absent', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30' };

    return null;
  }, [currentPlayer, attendance, generationResult, activeTournament]);

  if (!status) return null;

  return (
    <div className={`flex items-center gap-2 p-1 rounded-[2rem] transition-all duration-300 ${isSelectedForSwap ? 'bg-brand-primary/10 border border-brand-primary/60 shadow-[0_0_20px_rgba(245,196,41,0.5)] ring-2 ring-brand-primary/40 animate-[pulse_2s_ease-in-out_infinite]' : ''}`}>
      {currentPlayer && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-brand-primary/20 backdrop-blur-sm"
        >
          <Target className={`w-3 h-3 sm:w-4 sm:h-4 ${getPlayerTier(currentPlayer).color}`} />
          <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${getPlayerTier(currentPlayer).color}`}>
            {getPlayerTier(currentPlayer).label}
          </span>
        </motion.div>
      )}

      {isTopAssiduidade && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm"
          title={`Maior Assiduidade (${currentPlayer.matchesPlayed} partidas)`}
        >
          <Medal className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500" />
          <span className="hidden sm:inline text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-500">
            Veterano
          </span>
        </motion.div>
      )}

      {isTopEloGain && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-sm"
          title="Jogador que mais ganhou ELO na última partida"
        >
          <Flame className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-500" />
          <span className="hidden sm:inline text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-500">
            Em Chamas
          </span>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${status.bg} ${status.border} backdrop-blur-sm`}
      >
        <status.icon className={`w-3 h-3 sm:w-4 sm:h-4 ${status.color}`} />
        <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-wider ${status.color}`}>
          {status.label}
        </span>
      </motion.div>

      {currentPlayer && (
        <button
          onClick={handleToggleNotifications}
          disabled={isRequesting}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
            isEnabled 
              ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:bg-emerald-400' 
              : 'bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/20'
          } ${isRequesting ? 'animate-pulse' : ''}`}
          title={isEnabled ? "Desativar Notificações" : "Ativar Notificações"}
        >
          {isEnabled ? (
            <Smartphone className="w-4 h-4 fill-current" />
          ) : (
            <Smartphone className={`w-4 h-4 ${isRequesting ? 'opacity-50' : ''}`} />
          )}
        </button>
      )}

      {currentPlayer && isEnabled && (
        <button
          onClick={handleToggleMatchNotifications}
          disabled={isTogglingMatch}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
            isMatchEnabled 
              ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:bg-amber-400' 
              : 'bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/20'
          } ${isTogglingMatch ? 'animate-pulse' : ''}`}
          title={isMatchEnabled ? "Desativar Alertas de Resultados" : "Ativar Alertas de Resultados"}
        >
          <Trophy className={`w-4 h-4 ${isMatchEnabled ? 'fill-current' : ''} ${isTogglingMatch ? 'animate-bounce' : ''}`} />
        </button>
      )}
    </div>
  );
};
