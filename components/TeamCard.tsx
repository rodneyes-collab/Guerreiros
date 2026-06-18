import React from 'react';
import { motion } from 'motion/react';
import { Player, Team } from '../types';
import { PlayerRow } from './PlayerRow';
import { suggestPosition, calculateTeamPositions } from '../utils/teamLogic';
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
  rivalId
}) => {
  const colorClass = color === 'blue' ? 'bg-brand-secondary' : 'bg-brand-primary';
  const lightColorClass = color === 'blue' ? 'bg-brand-secondary/10 text-brand-secondary' : 'bg-brand-primary/10 text-brand-primary';
  const textColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';
  const iconColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';

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
        <div className="flex justify-between items-end">
          <h3 className={`font-black text-4xl sm:text-8xl tracking-tighter uppercase ${title.includes('A') ? 'text-brand-primary' : 'text-white'}`}>{title}</h3>
          <p className="text-3xl sm:text-6xl font-black tracking-tighter text-brand-primary">{team.totalEfficiency || team.totalElo}</p>
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
                    onPromote={!team.setter ? onPromote : undefined}
                    isRival={rivalId === p.id}
                    isHovered={hoveredPlayerId === p.id}
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
