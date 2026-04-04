import React from 'react';
import { useStore } from '../store';
import { Player } from '../types';
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

  return (
    <div className={`flex items-center justify-between p-3 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border transition-all group ${isActive ? 'bg-brand-primary/10 border-brand-primary/30 shadow-md ring-2 ring-brand-primary/20' : 'bg-black border-brand-primary/20 hover:border-brand-primary/40 shadow-sm hover:shadow-md'}`}>
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="relative">
          <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-lg sm:text-2xl font-black ${isSetter ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/10 text-white'} border border-brand-primary/10 shadow-sm`}>
            {attendancePosition && attendancePosition !== 0 ? attendancePosition : '?'}
          </div>
          {isSetter && <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-brand-primary rounded-full border-2 border-brand-secondary flex items-center justify-center shadow-sm"><UserCheck className="w-2.5 h-2.5 sm:w-3 h-3 text-brand-secondary" /></div>}
        </div>
        <div className="min-w-0">
          <p className={`text-sm sm:text-2xl font-black ${(p.isOfficialSetter || isSetter) ? 'text-brand-primary' : 'text-white'} tracking-tight leading-none truncate`}>{displayName}</p>
          <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2">
            <span className="text-[9px] sm:text-[11px] font-black uppercase text-brand-secondary bg-brand-primary px-1.5 py-0.5 rounded border border-brand-primary/30">{p.dailyWins || 0}V</span>
            <span className="text-[9px] sm:text-[11px] font-black uppercase text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/20">{p.dailyLosses || 0}D</span>
            <span className="text-[9px] sm:text-[11px] text-white/60 font-bold uppercase flex items-center gap-1 sm:gap-2">
              <span className="hidden xs:inline">ELO:</span> <span className="text-brand-primary font-black">{p.elo}</span>
              {suggestedPosition && (
                <span className="bg-white/10 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] border border-white/20">P{suggestedPosition}</span>
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
              className="p-2 sm:p-4 rounded-xl sm:rounded-2xl text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
              title="Designar como Levantador"
            >
              <UserCheck className="w-5 h-5 sm:w-7 sm:h-7"/>
            </button>
          )}
          <button 
            type="button"
            onClick={() => onSwap(p.id)}
            className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${isActive ? 'bg-brand-primary text-brand-secondary shadow-lg' : 'text-white/40 hover:text-brand-primary hover:bg-brand-primary/10'}`}
            title="Trocar Jogador"
          >
            <ArrowLeftRight className="w-5 h-5 sm:w-7 sm:h-7"/>
          </button>
          {onRemove && (
            <button 
              type="button"
              onClick={() => onRemove(p.id)}
              className="p-2 sm:p-4 rounded-xl sm:rounded-2xl text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
              title="Sair da Partida (Entra Reserva)"
            >
              <LogOut className="w-5 h-5 sm:w-7 sm:h-7"/>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
