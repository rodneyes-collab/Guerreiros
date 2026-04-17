import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { translateGender } from '../utils/helpers';
import { 
  Trash2, 
  UserPlus, 
  Edit2,
  RotateCcw,
  Cake,
  UserCheck,
  UserX
} from 'lucide-react';

interface MembersViewProps {
  clearAllPlayers: () => void;
  deletePlayer: (id: string) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  refreshPlayers: () => Promise<void>;
  repairDatabase?: () => void;
  savePlayer: (player: any) => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  clearAllPlayers,
  deletePlayer,
  setEditingPlayer,
  setIsFormOpen,
  refreshPlayers,
  repairDatabase,
  savePlayer
}) => {
  const { players, userRole, isSyncing, showConfirmModal } = useStore();
  const [startY, setStartY] = React.useState(0);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isPulling, setIsPulling] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof Player; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });

  const handleSort = (key: keyof Player) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedPlayers = React.useMemo(() => {
    return [...players].sort((a, b) => {
      // Sort active players first
      if (a.status !== b.status) {
        return a.status === 'inactive' ? 1 : -1;
      }

      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;
      
      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [players, sortConfig]);

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
        <div className="bg-brand-secondary/30 backdrop-blur-xl p-2 rounded-full shadow-lg border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Gestão de Sócios</h2>
          <p className="text-sm font-bold text-white/40 uppercase tracking-widest mt-2">Total de {(players?.length || 0)} membros registrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {userRole === 'ADMIN' && repairDatabase && (
            <button 
              onClick={repairDatabase} 
              className="flex-1 md:flex-none bg-white/5 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-white/10 transition-all border border-brand-primary/40 shadow-sm"
            >
              <RotateCcw className="w-5 h-5" />
              Reparar
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }} className="flex-1 md:flex-none bg-brand-primary text-brand-secondary px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-105 shadow-xl shadow-brand-primary/20 transition-all"><UserPlus className="w-5 h-5" />Novo Sócio</button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-brand-secondary/30 backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-black/40 border-b border-brand-primary/40">
              <tr>
                <th 
                  onClick={() => handleSort('name')}
                  className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest cursor-pointer hover:opacity-80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Sócio
                    {sortConfig.key === 'name' && (
                      <span className="text-brand-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                {userRole === 'ADMIN' && (
                  <th className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest">Email</th>
                )}
                <th className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Gênero</th>
                <th className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Posição</th>
                <th 
                  onClick={() => handleSort('elo')}
                  className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center cursor-pointer hover:opacity-80 transition-colors"
                >
                  <div className="flex items-center justify-center gap-2">
                    ELO
                    {sortConfig.key === 'elo' && (
                      <span className="text-brand-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                {userRole === 'ADMIN' && (
                  <th className="px-8 py-6 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedPlayers.map(player => (
                <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <p className={`font-black ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'} ${player.status === 'inactive' ? 'opacity-40' : ''}`}>
                        {player.name || "Sócio sem nome"}
                      </p>
                      {player.birthDate && (
                        <div className="group/birthday relative">
                          <Cake className="w-4 h-4 text-brand-primary animate-pulse" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-brand-primary text-black text-[10px] font-black uppercase rounded-lg opacity-0 group-hover/birthday:opacity-100 transition-opacity whitespace-nowrap z-50">
                            Aniversário: {new Date(player.birthDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 font-bold uppercase">{player.matchesPlayed} partidas totais</p>
                  </td>
                  {userRole === 'ADMIN' && (
                    <td className="px-8 py-5">
                      <p className="text-xs font-bold text-white/60">{player.email || '-'}</p>
                    </td>
                  )}
                  <td className="px-8 py-6 text-center">
                    <span className="text-xs font-bold text-white/60">{translateGender(player.gender)}</span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${player.isOfficialSetter ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30' : 'bg-white/5 text-white/60 border border-brand-primary/40'}`}>
                      {player.isOfficialSetter ? 'Levantador' : 'Atleta'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="font-black text-white">{Math.round(player.elo)}</span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    {player.status === 'inactive' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest border border-brand-primary/40">
                        Inativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {userRole === 'ADMIN' && (
                        <button 
                          onClick={() => {
                            const newStatus = player.status === 'inactive' ? 'active' : 'inactive';
                            const action = newStatus === 'active' ? 'ativar' : 'inativar';
                            showConfirmModal(
                              `${action.charAt(0).toUpperCase() + action.slice(1)} Sócio`,
                              `Deseja realmente ${action} ${player.name}?`,
                              () => {
                                savePlayer({
                                  ...player,
                                  status: newStatus
                                });
                              }
                            );
                          }}
                          className={`p-2 rounded-xl transition-all ${player.status === 'inactive' ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-amber-500 hover:bg-amber-500/10'}`}
                          title={player.status === 'inactive' ? 'Ativar Sócio' : 'Inativar Sócio'}
                        >
                          {player.status === 'inactive' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </button>
                      )}
                      <button 
                        onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }}
                        className="p-2 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          showConfirmModal(
                            'Excluir Sócio',
                            `Deseja realmente excluir ${player.name}?`,
                            () => deletePlayer(player.id)
                          );
                        }}
                        className="p-2 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {sortedPlayers.map(player => (
          <div key={player.id} className="bg-brand-secondary/30 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-xl space-y-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
            
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-secondary flex items-center justify-center text-brand-primary font-black text-lg border-2 border-brand-primary/40">
                  {player.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`text-xl font-black uppercase tracking-tight leading-none ${player.status === 'inactive' ? 'text-white/40' : 'text-white'}`}>
                      {player.name}
                    </h4>
                    {player.birthDate && (
                      <div className="group/birthday relative">
                        <Cake className="w-4 h-4 text-brand-primary animate-pulse" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-brand-primary text-black text-[10px] font-black uppercase rounded-lg opacity-0 group-hover/birthday:opacity-100 transition-opacity whitespace-nowrap z-50">
                          Aniversário: {new Date(player.birthDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${player.isOfficialSetter ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60 border border-brand-primary/40'}`}>
                      {translateGender(player.gender)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${player.isOfficialSetter ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-white/60 border border-brand-primary/40'}`}>
                      {player.isOfficialSetter ? 'Levantador' : 'Atleta'}
                    </span>
                    {player.status === 'inactive' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[8px] font-black uppercase tracking-widest border border-brand-primary/40">
                        Inativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">
                        Ativo
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-brand-primary tracking-tighter leading-none">{Math.round(player.elo)}</p>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">ELO Rank</p>
              </div>
            </div>
            
            {userRole === 'ADMIN' && (
              <div className="flex gap-3 pt-4 border-t border-white/5 relative z-10">
                <button 
                  onClick={() => {
                    const newStatus = player.status === 'inactive' ? 'active' : 'inactive';
                    const action = newStatus === 'active' ? 'ativar' : 'inativar';
                    showConfirmModal(
                      `${action.charAt(0).toUpperCase() + action.slice(1)} Sócio`,
                      `Deseja realmente ${action} ${player.name}?`,
                      () => {
                        savePlayer({
                          ...player,
                          status: newStatus
                        });
                      }
                    );
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${player.status === 'inactive' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'}`}
                >
                  {player.status === 'inactive' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  {player.status === 'inactive' ? 'Ativar' : 'Inativar'}
                </button>
                <button 
                  onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} 
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/5 text-white/60 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/10 hover:text-brand-primary transition-all"
                >
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button 
                  onClick={() => {
                    showConfirmModal(
                      'Excluir Sócio',
                      `Deseja realmente excluir ${player.name}?`,
                      () => deletePlayer(player.id)
                    );
                  }} 
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/20 transition-all"
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
