import React from 'react';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { Player } from '../types';
import { calculateEffectiveElo } from '../utils/teamLogic';
import { capitalizeName } from '../utils/helpers';
import { 
  UserCheck, 
  ArrowLeftRight, 
  UserMinus,
  LogOut,
  X,
  Plus
} from 'lucide-react';

interface PlayerRowProps {
  p: Player;
  isSetter?: boolean;
  isActive?: boolean;
  isTimeA?: boolean;
  attendancePosition?: number | string;
  suggestedPosition?: string;
  userRole?: string;
  onSwap: (pid: string) => void;
  onRemove?: (pid: string) => void;
  onPromote?: (pid: string) => void;
  isRival?: boolean;
  isHovered?: boolean;
}

export const PlayerRow: React.FC<PlayerRowProps> = ({ 
  p, 
  isSetter, 
  isActive, 
  isTimeA,
  attendancePosition, 
  suggestedPosition, 
  userRole,
  onSwap, 
  onRemove, 
  onPromote,
  isRival,
  isHovered
}) => {
  const players = useStore(state => state.players);
  const fullPlayer = players.find(fp => fp.id === p.id);
  const displayName = capitalizeName(p.name || fullPlayer?.name || "Sócio sem nome");

  const handleDragStart = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.dataTransfer.setData('playerId', p.id);
    e.dataTransfer.setData('sourceTeam', isTimeA ? 'A' : 'B');
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.preventDefault();
    e.currentTarget.classList.add('ring-4', 'ring-brand-primary/40');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-4', 'ring-brand-primary/40');
  };

  const handleDrop = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.preventDefault();
    e.currentTarget.classList.remove('ring-4', 'ring-brand-primary/40');
    const draggedPlayerId = e.dataTransfer.getData('playerId');
    if (draggedPlayerId && draggedPlayerId !== p.id) {
      onSwap(draggedPlayerId);
      // O swap final será processado usando o ID deste jogador p.id
      // No useAppLogic atual, onSwap(pid) alterna a seleção. 
      // Para DnD, queremos uma troca imediata.
    }
  };

  return (
    <div 
      draggable={userRole === 'ADMIN'}
      onDragStart={handleDragStart as any}
      onDragEnd={handleDragEnd as any}
      onDragOver={handleDragOver as any}
      onDragLeave={handleDragLeave as any}
      onDrop={handleDrop as any}
      className={`relative flex items-center justify-between p-2 sm:p-5 rounded-[1.2rem] sm:rounded-[2rem] border transition-all duration-300 group ${
        isActive 
          ? 'bg-brand-primary/10 border-brand-primary/50 border-l-[6px] border-l-brand-primary shadow-lg ring-2 ring-brand-primary/30 z-10' 
          : isRival
            ? 'bg-brand-primary/20 border-brand-primary border-l-[8px] border-l-brand-primary shadow-[0_0_20px_rgba(245,196,41,0.2)] scale-[1.02] z-10'
            : isHovered
              ? 'bg-white/5 border-white/20 border-l-[8px] border-l-white/40 scale-[1.02] z-10'
              : 'bg-brand-light border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm hover:shadow-md'
      }`}
    >
      {(isActive || isRival || isHovered) && (
        <motion.div
          layoutId={`active-glow-${p.id}`}
          className="absolute inset-0 rounded-[1.2rem] sm:rounded-[2rem] pointer-events-none"
          animate={{
            boxShadow: [
              "0 0 0px rgba(245, 196, 41, 0)",
              isRival ? "0 0 40px rgba(245, 196, 41, 0.5)" : "0 0 30px rgba(245, 196, 41, 0.4)",
              "0 0 0px rgba(245, 196, 41, 0)"
            ],
            borderColor: [
              "rgba(245, 196, 41, 0.2)",
              isRival ? "#F5C429" : "rgba(245, 196, 41, 0.8)",
              "rgba(245, 196, 41, 0.2)"
            ]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ border: '2px solid transparent' }}
        />
      )}
      <div className="flex items-center gap-2 sm:gap-6 min-w-0 relative z-10">
        <div className="relative shrink-0">
          <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-sm sm:text-base font-black ${isSetter ? (isTimeA ? 'bg-brand-primary/20 text-brand-primary' : 'bg-brand-primary/20 text-brand-secondary dark:text-white') : 'bg-brand-primary/5 text-brand-secondary/40 dark:text-white/40'} border border-brand-primary/10 shadow-sm`}>
            {attendancePosition && attendancePosition !== 0 ? attendancePosition : '?'}
          </div>
          {isSetter && <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-4 h-4 sm:w-6 sm:h-6 bg-brand-primary rounded-full border-2 border-brand-nav flex items-center justify-center shadow-sm"><UserCheck className="w-2 h-2 sm:w-3 h-3 text-brand-secondary" /></div>}
        </div>
        <div className="min-w-0">
          <motion.p 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
              type: "spring",
              stiffness: 400,
              damping: 10
            }}
            className={`text-sm sm:text-lg md:text-xl font-extrabold ${isTimeA ? 'text-brand-primary drop-shadow-[0_0_6px_rgba(245,196,41,0.2)]' : 'text-brand-secondary dark:text-white'} tracking-tight leading-tight truncate`}
          >
            {displayName}
          </motion.p>
          <div className="flex items-center gap-1.5 sm:gap-3 mt-1 sm:mt-2">
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-brand-light bg-brand-primary px-1 py-0.5 rounded border border-brand-primary/30">{p.wins || 0}V</span>
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-brand-light bg-brand-secondary dark:bg-white px-1 py-0.5 rounded border border-white/30">{p.losses || 0}D</span>
            <span className="text-[8px] sm:text-[11px] text-brand-secondary/60 dark:text-white/60 font-bold uppercase flex items-center gap-1 sm:gap-2">
              <span className="hidden xs:inline">EFIC:</span> <span className="text-brand-primary font-black">{Math.round(calculateEffectiveElo(p))}</span>
              {suggestedPosition && (
                <span className={`${
                  isTimeA 
                    ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/40 shadow-[0_0_10px_rgba(245,196,41,0.1)]' 
                    : 'bg-white/10 text-white border-white/20'
                } px-2.5 py-0.5 rounded text-[11px] sm:text-[15px] border font-black`}>
                  P{suggestedPosition}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      {userRole === 'ADMIN' && (
        <div className="flex items-center gap-1 sm:gap-2">
          {onPromote && (
            <button 
              type="button"
              onClick={() => onPromote(p.id)}
              className="p-3 sm:p-4 rounded-xl sm:rounded-2xl text-brand-secondary/40 dark:text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
              title="Designar como Levantador"
            >
              <UserCheck className="w-6 h-6 sm:w-7 sm:h-7"/>
            </button>
          )}
          <button 
            type="button"
            onClick={() => onSwap(p.id)}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${isActive ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-brand-secondary/40 dark:text-white/40 hover:text-brand-primary hover:bg-brand-primary/10'}`}
            title="Trocar Jogador"
          >
            <ArrowLeftRight className="w-6 h-6 sm:w-7 sm:h-7"/>
          </button>
          {onRemove && (
            <button 
              type="button"
              onClick={() => onRemove(p.id)}
              className="p-3 sm:p-4 rounded-xl sm:rounded-2xl text-brand-secondary/40 dark:text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
              title="Sair da Partida (Entra Reserva)"
            >
              <LogOut className="w-6 h-6 sm:w-7 sm:h-7"/>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
