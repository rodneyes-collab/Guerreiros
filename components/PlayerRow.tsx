import React from 'react';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { Player } from '../types';
import { calculateEffectiveElo } from '../utils/teamLogic';
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
  onPromote 
}) => {
  const players = useStore(state => state.players);
  const fullPlayer = players.find(fp => fp.id === p.id);
  const displayName = p.name || fullPlayer?.name || "Sócio sem nome";

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
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        if (userRole !== 'ADMIN') return;
        e.preventDefault();
        e.currentTarget.classList.remove('ring-4', 'ring-brand-primary/40');
        const draggedPlayerId = e.dataTransfer.getData('playerId');
        if (draggedPlayerId && draggedPlayerId !== p.id) {
          // Se já houver algo selecionado, limpa.
          // Aqui precisamos de uma lógica que receba os dois IDs ou use o estado existente.
          onSwap(p.id); // Seleciona o alvo
          onSwap(draggedPlayerId); // Seleciona o origem e executa a troca se onSwap for o handleSwapClick do useAppLogic
        }
      }}
      className={`flex items-center justify-between p-2 sm:p-5 rounded-[1.2rem] sm:rounded-[2rem] border transition-all group ${isActive ? 'bg-brand-primary/10 border border-white/5 border-l-[6px] border-l-brand-primary shadow-md ring-2 ring-brand-primary/20' : 'bg-brand-light border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm hover:shadow-md'}`}
    >
      <div className="flex items-center gap-2 sm:gap-6 min-w-0">
        <div className="relative shrink-0">
          <div className={`w-8 h-8 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-sm sm:text-2xl font-black ${isSetter ? (isTimeA ? 'bg-brand-primary/20 text-brand-primary' : 'bg-brand-primary/20 text-brand-secondary dark:text-white') : 'bg-brand-primary/5 text-brand-secondary/40 dark:text-white/40'} border border-brand-primary/10 shadow-sm`}>
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
            className={`text-xs sm:text-3xl font-black ${isTimeA ? 'text-brand-primary drop-shadow-[0_0_8px_rgba(245,196,41,0.3)]' : 'text-brand-secondary dark:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'} tracking-tight leading-none truncate`}
          >
            {displayName}
          </motion.p>
          <div className="flex items-center gap-1.5 sm:gap-3 mt-1 sm:mt-2">
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-brand-light bg-brand-primary px-1 py-0.5 rounded border border-brand-primary/30">{p.wins || 0}V</span>
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-brand-light bg-brand-secondary dark:bg-white px-1 py-0.5 rounded border border-white/30">{p.losses || 0}D</span>
            <span className="text-[8px] sm:text-[11px] text-brand-secondary/60 dark:text-white/60 font-bold uppercase flex items-center gap-1 sm:gap-2">
              <span className="hidden xs:inline">EFIC:</span> <span className="text-brand-primary font-black">{Math.round(calculateEffectiveElo(p))}</span>
              {suggestedPosition && (
                <span className="bg-brand-primary/10 text-brand-primary px-1 py-0.5 rounded text-[7px] sm:text-[10px] border border-brand-primary/40">P{suggestedPosition}</span>
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
