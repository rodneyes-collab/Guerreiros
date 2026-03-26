import React from 'react';
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
  attendancePosition?: number;
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
  return (
    <div className={`flex items-center justify-between p-3 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border transition-all group ${isActive ? 'bg-indigo-50 border-indigo-300 shadow-md ring-2 ring-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-sm hover:shadow-md'}`}>
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="relative">
          <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-lg sm:text-2xl font-black ${isSetter ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'} border border-slate-200 shadow-sm`}>
            {attendancePosition || '?'}
          </div>
          {isSetter && <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm"><UserCheck className="w-2.5 h-2.5 sm:w-3 h-3 text-white" /></div>}
        </div>
        <div className="min-w-0">
          <p className={`text-sm sm:text-2xl font-black ${p.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'} tracking-tight leading-none truncate`}>{p.name}</p>
          <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2">
            <span className="text-[9px] sm:text-[11px] font-black uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">{p.dailyWins || 0}V</span>
            <span className="text-[9px] sm:text-[11px] font-black uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">{p.dailyLosses || 0}D</span>
            <span className="text-[9px] sm:text-[11px] text-slate-500 font-bold uppercase flex items-center gap-1 sm:gap-2">
              <span className="hidden xs:inline">ELO:</span> <span className="text-indigo-600 font-black">{p.elo}</span>
              {suggestedPosition && (
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] border border-slate-300">P{suggestedPosition}</span>
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
              className="p-2 sm:p-4 rounded-xl sm:rounded-2xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
              title="Designar como Levantador"
            >
              <UserCheck className="w-5 h-5 sm:w-7 sm:h-7"/>
            </button>
          )}
          <button 
            type="button"
            onClick={() => onSwap(p.id)}
            className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
            title="Trocar Jogador"
          >
            <ArrowLeftRight className="w-5 h-5 sm:w-7 sm:h-7"/>
          </button>
          {onRemove && (
            <button 
              type="button"
              onClick={() => onRemove(p.id)}
              className="p-2 sm:p-4 rounded-xl sm:rounded-2xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
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
