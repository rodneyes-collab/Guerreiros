import React from 'react';
import { Player, Team } from '../types';
import { PlayerRow } from './PlayerRow';
import { 
  Swords, 
  Sparkles 
} from 'lucide-react';

interface TeamCardProps {
  title: string;
  team: Team;
  color: 'blue' | 'green';
  attendance: Player[];
  userRole?: string;
  onSwap: (pid: string) => void;
  onRemove: (pid: string) => void;
  onPromote: (pid: string) => void;
  activeSwapId: string | undefined;
}

export const TeamCard: React.FC<TeamCardProps> = ({ 
  title, 
  team, 
  color, 
  attendance, 
  userRole,
  onSwap, 
  onRemove, 
  onPromote, 
  activeSwapId 
}) => {
  const colorClass = color === 'blue' ? 'bg-brand-secondary' : 'bg-brand-primary';
  const lightColorClass = color === 'blue' ? 'bg-brand-secondary/10 text-brand-secondary' : 'bg-brand-primary/10 text-brand-primary';
  const textColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';
  const iconColorClass = color === 'blue' ? 'text-brand-primary' : 'text-brand-secondary';

  const getPos = (pid: string) => {
    const player = attendance.find(ap => ap.id === pid);
    return player?.arrivalOrder || '?';
  };

  // Calcula posições sugeridas para exibir na lista
  const getSuggestedPositions = () => {
    const setter = team.setter;
    const others = [...team.players].sort((a, b) => b.elo - a.elo);
    const finalSetter = setter || others.pop();
    
    const mapping: Record<string, string> = {};
    if (finalSetter) mapping[finalSetter.id] = "3";
    if (others[0]) mapping[others[0].id] = "4";
    if (others[1]) mapping[others[1].id] = "2";
    if (others[2]) mapping[others[2].id] = "5";
    if (others[3]) mapping[others[3].id] = "6";
    if (others[4]) mapping[others[4].id] = "1";
    
    return mapping;
  };

  const suggestedPositions = getSuggestedPositions();

  return (
    <div className="bg-black rounded-[2rem] sm:rounded-[3rem] border border-brand-primary/20 shadow-2xl overflow-hidden flex flex-col h-full animate-in zoom-in-95 duration-500 hover:border-brand-primary/40 transition-all">
      <div className={`p-6 sm:p-8 bg-black ${textColorClass} relative border-b border-brand-primary/10`}>
        <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10">
          <Swords className={`w-12 h-12 sm:w-20 h-20 text-brand-primary`} />
        </div>
        <div className="flex justify-between items-center mb-2 sm:mb-3">
          <p className="text-[8px] sm:text-sm font-black uppercase opacity-70 tracking-[0.2em] sm:tracking-[0.3em] text-brand-primary">
            Line-up Equipe <span className="ml-1 opacity-50">({attendance.length} Presentes)</span>
          </p>
          <p className="text-[8px] sm:text-sm font-black uppercase opacity-70 tracking-[0.2em] sm:tracking-[0.3em] text-brand-primary">Média ELO</p>
        </div>
        <div className="flex justify-between items-end">
          <h3 className="font-black text-2xl sm:text-5xl tracking-tighter uppercase text-white">{title}</h3>
          <p className="text-3xl sm:text-6xl font-black tracking-tighter text-brand-primary">{team.totalElo}</p>
        </div>
      </div>
      
      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 flex-grow">
        <div className="space-y-3 sm:space-y-4">
          <h4 className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3 sm:w-4 h-4 text-brand-primary" />
            Cérebro do Time
          </h4>
          {team.setter ? (
            <PlayerRow 
              p={team.setter} 
              isSetter 
              isActive={activeSwapId === team.setter.id} 
              attendancePosition={getPos(team.setter.id)}
              suggestedPosition={suggestedPositions[team.setter.id]}
              userRole={userRole}
              onSwap={onSwap} 
              onRemove={onRemove}
            />
          ) : (
            <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl border-2 border-dashed border-white/10 bg-white/5 text-center">
              <p className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-widest italic">Aguardando Levantador</p>
            </div>
          )}
        </div>

        <div className="space-y-3 sm:space-y-4">
          <h4 className="text-[10px] sm:text-sm font-black text-white/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
            <Swords className="w-3 h-3 sm:w-4 h-4 text-brand-primary" />
            Atacantes e Defesa
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:gap-3">
            {team.players.map((p: Player) => (
              <PlayerRow 
                key={p.id} 
                p={p} 
                isActive={activeSwapId === p.id} 
                attendancePosition={getPos(p.id)}
                suggestedPosition={suggestedPositions[p.id]}
                userRole={userRole}
                onSwap={onSwap} 
                onRemove={onRemove}
                onPromote={!team.setter ? onPromote : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
