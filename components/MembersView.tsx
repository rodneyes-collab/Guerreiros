import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { 
  Trash2, 
  UserPlus, 
  Edit2,
  RotateCcw
} from 'lucide-react';

interface MembersViewProps {
  clearAllPlayers: () => void;
  deletePlayer: (id: string) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  translateGender: (gender: Gender) => string;
  refreshPlayers: () => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  clearAllPlayers,
  deletePlayer,
  setEditingPlayer,
  setIsFormOpen,
  translateGender,
  refreshPlayers
}) => {
  const { players, userRole, isSyncing } = useStore();
  const [startY, setStartY] = React.useState(0);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isPulling, setIsPulling] = React.useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].pageY;
    const distance = currentY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10) {
        if (e.cancelable) e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    if (pullDistance > 60) {
      if (navigator.vibrate) navigator.vibrate(10);
      await refreshPlayers();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  return (
    <div 
      className="relative space-y-8 animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ 
          transform: `translateY(${pullDistance - 40}px)`,
          opacity: pullDistance / 60,
          transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div className="bg-white p-2 rounded-full shadow-lg border border-slate-200">
          <RotateCcw className={`w-6 h-6 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Gestão da Base</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Total de {players.length} sócios cadastrados</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {userRole === 'ADMIN' && players.length > 0 && (
            <button 
              onClick={clearAllPlayers} 
              className="flex-1 md:flex-none bg-rose-50 text-rose-600 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-100 transition-all border border-rose-100"
            >
              <Trash2 className="w-5 h-5" />
              Limpar
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }} className="flex-1 md:flex-none bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"><UserPlus className="w-5 h-5" />Novo Sócio</button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sócio</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Posição</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Gênero</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entrada</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ranking ELO</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...players].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(player => (
              <tr key={player.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-8 py-5">
                  <p className="font-black text-slate-700">{player.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{player.matchesPlayed} partidas totais</p>
                </td>
                <td className="px-8 py-5 text-center">
                  {player.isOfficialSetter ? (
                    <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Levantador</span>
                  ) : (
                    <span className="text-slate-300 font-bold text-xs">-</span>
                  )}
                </td>
                <td className="px-8 py-5 text-center text-[10px] font-bold text-slate-500 uppercase">{translateGender(player.gender)}</td>
                <td className="px-8 py-5 text-center text-[10px] font-bold text-slate-500 uppercase">
                  {player.joinedAt ? new Date(player.joinedAt + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                </td>
                <td className="px-8 py-5 text-center font-mono text-sm font-black text-indigo-600">{player.elo}</td>
                <td className="px-8 py-5 text-right">
                  {userRole === 'ADMIN' ? (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deletePlayer(player.id)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Somente Leitura</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {[...players].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(player => (
          <div key={player.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-800">{player.name}</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{player.matchesPlayed} partidas totais</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-indigo-600 font-mono">{player.elo}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ELO Rank</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {player.isOfficialSetter && (
                <span className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-200">Levantador</span>
              )}
              <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200">{translateGender(player.gender)}</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200">
                Entrada: {player.joinedAt ? new Date(player.joinedAt + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
              </span>
            </div>

            {userRole === 'ADMIN' && (
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button 
                  onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} 
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs uppercase tracking-widest"
                >
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button 
                  onClick={() => deletePlayer(player.id)} 
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-xs uppercase tracking-widest"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
