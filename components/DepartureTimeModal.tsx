import React, { useState } from 'react';
import { Clock, X, Search, Check, Trash2, Users, Zap } from 'lucide-react';
import { Player, GenerationResult } from '../types';

interface DepartureTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  generationResult?: GenerationResult | null;
  attendance: Player[];
  players: Player[];
  updateDepartureTime?: (playerId: string, departureTime: string | null) => Promise<void>;
  showNotification?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const DepartureTimeModal: React.FC<DepartureTimeModalProps> = ({
  isOpen,
  onClose,
  generationResult,
  attendance,
  players,
  updateDepartureTime,
  showNotification
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTimes, setEditingTimes] = useState<{ [playerId: string]: string }>({});
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Extract player IDs currently in match
  const scaledPlayerIds = new Set<string>();
  if (generationResult) {
    if (generationResult.teamA?.setter?.id) scaledPlayerIds.add(generationResult.teamA.setter.id);
    generationResult.teamA?.players?.forEach(p => p?.id && scaledPlayerIds.add(p.id));
    if (generationResult.teamB?.setter?.id) scaledPlayerIds.add(generationResult.teamB.setter.id);
    generationResult.teamB?.players?.forEach(p => p?.id && scaledPlayerIds.add(p.id));
  }

  // Merge attendance with player details
  const activeAttendance = attendance.filter(a => a.status === 'present' || a.status === 'playing');

  const filteredAttendance = activeAttendance.filter(a => {
    const fullP = players.find(p => p.id === a.id);
    const name = a.name || fullP?.name || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const scaledPlayersList = filteredAttendance.filter(a => scaledPlayerIds.has(a.id));
  const queuePlayersList = filteredAttendance.filter(a => !scaledPlayerIds.has(a.id));

  const handleSaveTime = async (playerId: string, newTime: string | null) => {
    if (!updateDepartureTime) return;
    setSavingPlayerId(playerId);
    try {
      await updateDepartureTime(playerId, newTime);
      if (showNotification) {
        if (newTime) {
          showNotification(`Horário de saída de ${newTime} salvo com sucesso!`, 'success');
        } else {
          showNotification(`Horário de saída removido com sucesso.`, 'info');
        }
      }
    } catch (err) {
      if (showNotification) {
        showNotification('Erro ao atualizar horário de saída.', 'error');
      }
    } finally {
      setSavingPlayerId(null);
    }
  };

  const PRESETS = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];

  const renderPlayerRow = (item: Player, isScaled: boolean) => {
    const fullP = players.find(p => p.id === item.id);
    const playerName = item.name || fullP?.name || 'Sócio sem nome';
    const currentDepTime = editingTimes[item.id] !== undefined ? editingTimes[item.id] : (item.departureTime || '');
    const isSaving = savingPlayerId === item.id;

    return (
      <div 
        key={item.id} 
        className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isScaled 
            ? 'bg-brand-primary/10 border-brand-primary/30 hover:border-brand-primary/50' 
            : 'bg-black/40 border-white/10 hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
            isScaled ? 'bg-brand-primary text-black' : 'bg-white/10 text-white'
          }`}>
            {isScaled ? '🎮' : '👤'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm text-white truncate">{playerName}</span>
              {isScaled && (
                <span className="px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30 text-[9px] font-black uppercase tracking-wider">
                  Escalado
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/50 font-medium">
              {item.departureTime ? `Atual: Out ${item.departureTime}` : 'Sem horário limite'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Preset Buttons */}
          <div className="hidden lg:flex items-center gap-1">
            {PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setEditingTimes(prev => ({ ...prev, [item.id]: preset }));
                  handleSaveTime(item.id, preset);
                }}
                className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-tight transition-all ${
                  item.departureTime === preset
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'bg-white/5 text-white/60 hover:bg-white/15 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Time Input */}
          <input
            type="time"
            value={currentDepTime}
            onChange={(e) => setEditingTimes(prev => ({ ...prev, [item.id]: e.target.value }))}
            className="px-2.5 py-1.5 bg-black/60 border border-white/20 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-brand-primary w-28 text-center"
          />

          {/* Save Button */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveTime(item.id, currentDepTime || null)}
            className="px-3 py-1.5 bg-brand-primary text-black rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-brand-primary/90 active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            {isSaving ? (
              <Zap className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Salvar</span>
          </button>

          {/* Clear Button */}
          {item.departureTime && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setEditingTimes(prev => ({ ...prev, [item.id]: '' }));
                handleSaveTime(item.id, null);
              }}
              title="Remover horário de saída"
              className="p-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 active:scale-95 transition-all shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-black border border-brand-primary/40 rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-brand-primary/10 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between gap-4 bg-gradient-to-r from-brand-primary/10 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary shrink-0 shadow-lg">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Horários de Saída Antecipada</h2>
              <p className="text-xs text-white/60 font-medium">Defina ou ajuste os horários limite para orientar a escalação automática</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Stats */}
        <div className="px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/40">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar sócio pelo nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-brand-primary transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-white/60">
            <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg font-bold">
              ⏰ {activeAttendance.filter(a => a.departureTime).length} com horário de saída
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Scaled Players Section */}
          {scaledPlayersList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-primary">
                <Users className="w-4 h-4" />
                <h3 className="text-xs font-black uppercase tracking-widest">Jogadores Escalados na Partida Atual</h3>
                <span className="text-[10px] font-bold text-brand-primary/60">({scaledPlayersList.length})</span>
              </div>
              <div className="space-y-2">
                {scaledPlayersList.map(item => renderPlayerRow(item, true))}
              </div>
            </div>
          )}

          {/* Waitlist / All Players Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/70">
              <Clock className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Demais Sócios Presentes no Racha</h3>
              <span className="text-[10px] font-bold text-white/40">({queuePlayersList.length})</span>
            </div>
            {queuePlayersList.length > 0 ? (
              <div className="space-y-2">
                {queuePlayersList.map(item => renderPlayerRow(item, false))}
              </div>
            ) : (
              <p className="text-xs text-white/40 italic py-3 text-center bg-white/5 rounded-2xl">
                Nenhum outro sócio encontrado.
              </p>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-black/80 border-t border-white/10 flex items-center justify-between">
          <p className="text-[10px] text-white/40 font-medium">
            💡 As alterações são salvas em tempo real no banco de dados e refletidas no sorteio.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-brand-primary text-black rounded-xl font-black text-xs uppercase tracking-wider hover:bg-brand-primary/90 transition-all shadow-lg cursor-pointer"
          >
            Concluir
          </button>
        </div>

      </div>
    </div>
  );
};
