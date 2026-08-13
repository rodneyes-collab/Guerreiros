import React from 'react';
import { motion } from 'motion/react';
import { Player, Team } from '../types';
import { PlayerRow } from './PlayerRow';
import { suggestPosition, calculateTeamPositions } from '../utils/teamLogic';
import { useStore } from '../store';
import { 
  Swords, 
  Sparkles 
} from 'lucide-react';

interface TeamCardProps {
  title: string;
  team: Team;
  opponent?: Team;
  color: 'blue' | 'green';
  attendance: Player[];
  userRole?: string;
  onSwap: (pid: string) => void;
  onRemove: (pid: string) => void;
  onPromote: (pid: string) => void;
  activeSwapId: string | undefined;
  hoveredPlayerId: string | null;
  setHoveredPlayerId: (id: string | null) => void;
  rivalId: string | null;
  bottomTwoIds?: Set<string>;
  icColors?: Record<string, { color: string, title: string }>;
}

export const TeamCard: React.FC<TeamCardProps> = ({ 
  title, 
  team, 
  opponent,
  color, 
  attendance, 
  userRole,
  onSwap, 
  onRemove, 
  onPromote, 
  activeSwapId,
  hoveredPlayerId,
  setHoveredPlayerId,
  rivalId,
  bottomTwoIds,
  icColors
}) => {
  const teamGenerationMode = useStore(state => state.teamGenerationMode);
  const matches = useStore(state => state.matches);

  const getPlayerSynergyInfo = (playerId: string) => {
    const allTeammates = [team.setter, ...team.players].filter((p): p is Player => p !== null && p.id !== playerId);
    const highSynergy: { name: string; winRate: number; games: number }[] = [];
    const lowSynergy: { name: string; winRate: number; games: number }[] = [];

    for (const teammate of allTeammates) {
      let gamesTogether = 0;
      let winsTogether = 0;
      for (const m of matches) {
        const inTeamA = m.teamA.includes(playerId) && m.teamA.includes(teammate.id);
        const inTeamB = m.teamB.includes(playerId) && m.teamB.includes(teammate.id);
        if (inTeamA || inTeamB) {
          gamesTogether++;
          if ((inTeamA && m.winner === 'A') || (inTeamB && m.winner === 'B')) {
            winsTogether++;
          }
        }
      }
      if (gamesTogether >= 2) {
        const winRate = winsTogether / gamesTogether;
        if (winRate >= 0.70) {
          highSynergy.push({ name: teammate.name, winRate, games: gamesTogether });
        } else if (winRate <= 0.30) {
          lowSynergy.push({ name: teammate.name, winRate, games: gamesTogether });
        }
      }
    }
    return { highSynergy, lowSynergy };
  };
  const lightColorClass = color === 'blue' ? 'bg-brand-secondary/10 text-brand-secondary' : 'bg-brand-primary/10 text-brand-primary';
  const textColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';
  const iconColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';

  const teamEff = team.totalEfficiency || team.totalElo || 0;
  const oppEff = opponent ? (opponent.totalEfficiency || opponent.totalElo || 0) : teamEff;
  const diff = Math.abs(teamEff - oppEff);
  const avgEff = (teamEff + oppEff) / 2 || 1;
  const diffRatio = diff / avgEff;
  const balanceScore = Math.max(0, Math.min(100, Math.round(100 - (diffRatio * 100))));

  let balanceLabel = 'Excelente';
  if (balanceScore < 60) balanceLabel = 'Desequilibrado';
  else if (balanceScore < 75) balanceLabel = 'Moderado';
  else if (balanceScore < 90) balanceLabel = 'Bom';
  else balanceLabel = 'Excelente';

  const getPos = (pid: string) => {
    const sorted = [...attendance].sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0));
    const idx = sorted.findIndex(ap => ap.id === pid);
    if (idx === -1) return '?';
    const player = sorted[idx];
    const rawArrivalOrder = player?.arrivalOrder || 0;
    return (rawArrivalOrder && rawArrivalOrder < 999) ? rawArrivalOrder : (idx + 1);
  };

  // Calcula posições sugeridas para exibir na lista
  const getSuggestedPositions = () => {
    return calculateTeamPositions(team, opponent || null);
  };

  const suggestedPositions = getSuggestedPositions();

  // Helper para identificar o "oposto" tático (Regra 1-4, 2-5, 3-6)
  const getOppositePos = (pos: string) => {
    const map: Record<string, string> = { '1': '4', '4': '1', '2': '5', '5': '2', '3': '6', '6': '3' };
    return map[pos];
  };

  const getPlayerAtPos = (pos: string) => {
    const all = [team.setter, ...team.players].filter((p): p is Player => p !== null);
    const entry = Object.entries(suggestedPositions).find(([_, pPos]) => pPos === pos);
    if (!entry) return null;
    return all.find(p => p.id === entry[0]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.8, 
        ease: [0.16, 1, 0.3, 1],
        delay: title.includes('A') ? 0.1 : 0.2
      }}
      className="bg-brand-light rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl overflow-hidden flex flex-col h-full hover:border-brand-primary/40 transition-all team-card-container"
    >
      <div className={`p-6 sm:p-8 bg-brand-light ${textColorClass} relative border-b border-brand-primary/10`}>
        <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10">
          <Swords className={`w-12 h-12 sm:w-20 h-20 text-brand-primary`} />
        </div>
        <div className="flex justify-between items-center mb-2 sm:mb-3">
          <p className="text-[8px] sm:text-sm font-black uppercase opacity-70 tracking-[0.2em] sm:tracking-[0.3em] text-brand-primary">Eficiência Total</p>
        </div>
        <div className="flex justify-between items-end mb-4">
          <h3 className={`font-black text-4xl sm:text-8xl tracking-tighter uppercase ${title.includes('A') ? 'text-brand-primary' : 'text-white'}`}>{title}</h3>
          <p className="text-3xl sm:text-6xl font-black tracking-tighter text-brand-primary">{teamEff}</p>
        </div>

        {/* Nota de Balanceamento Estimada */}
        <div className="pt-3 border-t border-brand-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/70">
              Balanceamento ({teamGenerationMode === 'TRUESKILL' ? 'TrueSkill' : 'Hab. Puras'}):
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-brand-primary font-mono">{balanceScore}/100</span>
            <span className="text-[8px] font-bold text-white/50 uppercase">({balanceLabel})</span>
          </div>
        </div>
      </div>
      
      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 flex-grow">
        {/* Visualização de Quadra removida conforme solicitação de retirar as quadras */}

        <div className="space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h4 className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
              <Sparkles className="w-3 h-3 sm:w-4 h-4 text-brand-primary" />
              Cérebro da Equipe
            </h4>
            {team.setter ? (
              <div 
                onMouseEnter={() => setHoveredPlayerId(team.setter!.id)}
                onMouseLeave={() => setHoveredPlayerId(null)}
                onTouchStart={() => setHoveredPlayerId(team.setter!.id)}
                onTouchEnd={() => setHoveredPlayerId(null)}
                onTouchCancel={() => setHoveredPlayerId(null)}
              >
                <PlayerRow 
                  p={team.setter} 
                  isSetter 
                  isActive={activeSwapId === team.setter.id} 
                  isTimeA={color === 'green'}
                  attendancePosition={getPos(team.setter.id)}
                  suggestedPosition={suggestedPositions[team.setter.id]}
                  userRole={userRole}
                  onSwap={onSwap} 
                  onRemove={onRemove}
                  isRival={rivalId === team.setter.id}
                  isHovered={hoveredPlayerId === team.setter.id}
                  isBottomTwo={bottomTwoIds?.has(team.setter.id)}
                  icColorInfo={icColors?.[team.setter.id]}
                  synergyInfo={getPlayerSynergyInfo(team.setter.id)}
                />
              </div>
            ) : (
              <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl border-2 border-dashed border-brand-primary/40 bg-white/5 text-center">
                <p className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-widest italic">Aguardando Levantador</p>
              </div>
            )}
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h4 className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
              <Swords className="w-3 h-3 sm:w-4 h-4 text-brand-primary" />
              Atacantes e Defesa
            </h4>
            <div className="flex flex-col gap-2 sm:gap-3">
              {team.players.map((p: Player) => (
                <div 
                  key={p.id}
                  onMouseEnter={() => setHoveredPlayerId(p.id)}
                  onMouseLeave={() => setHoveredPlayerId(null)}
                  onTouchStart={() => setHoveredPlayerId(p.id)}
                  onTouchEnd={() => setHoveredPlayerId(null)}
                  onTouchCancel={() => setHoveredPlayerId(null)}
                >
                  <PlayerRow 
                    p={p} 
                    isActive={activeSwapId === p.id} 
                    isTimeA={color === 'green'}
                    attendancePosition={getPos(p.id)}
                    suggestedPosition={suggestedPositions[p.id]}
                    userRole={userRole}
                    onSwap={onSwap} 
                    onRemove={onRemove}
                    onPromote={onPromote}
                    isRival={rivalId === p.id}
                    isHovered={hoveredPlayerId === p.id}
                    isBottomTwo={bottomTwoIds?.has(p.id)}
                    icColorInfo={icColors?.[p.id]}
                    synergyInfo={getPlayerSynergyInfo(p.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
