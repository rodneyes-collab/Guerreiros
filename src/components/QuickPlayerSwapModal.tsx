import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, GenerationResult } from '../../types';
import { PlayerAvatar } from './PlayerAvatar';
import { calculateCompositePerformanceRating } from '../../utils/teamLogic';
import { 
  X, 
  Search, 
  ArrowLeftRight, 
  Sparkles, 
  Clock, 
  Shield, 
  CheckCircle2, 
  UserCheck, 
  AlertCircle
} from 'lucide-react';

export interface QuickSwapTarget {
  player: Player | null;
  team: 'A' | 'B' | 'Bench';
  role: 'setter' | 'player';
  slotIndex?: number;
}

interface QuickPlayerSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: QuickSwapTarget | null;
  generationResult: GenerationResult | null;
  allMembers: Player[];
  attendance?: Player[];
  onSelectReplacement: (player: Player) => Promise<void> | void;
}

type TabType = 'reserves' | 'court' | 'attendance' | 'all';

export const QuickPlayerSwapModal: React.FC<QuickPlayerSwapModalProps> = ({
  isOpen,
  onClose,
  target,
  generationResult,
  allMembers,
  attendance = [],
  onSelectReplacement
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('reserves');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setIsSubmitting(false);
      // If there are reserves, default to reserves tab; otherwise court
      if (generationResult?.remainingPlayers && generationResult.remainingPlayers.length > 0) {
        setActiveTab('reserves');
      } else {
        setActiveTab('court');
      }
    }
  }, [isOpen, generationResult]);

  // Strict check for active members rule
  const isStrictlyActive = (p: Player) => {
    if (p.status && p.status !== 'active') return false;
    return true;
  };

  // Group candidates
  const candidatesData = useMemo(() => {
    if (!generationResult) return { reserves: [], court: [], attendanceExtra: [], all: [] };

    const targetId = target?.player?.id;

    // Remaining (bench) players
    const reserves = (generationResult.remainingPlayers || []).filter(
      p => isStrictlyActive(p) && p.id !== targetId
    );

    // Players on court in Team A or Team B
    const courtA = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || [])
    ].filter(Boolean) as Player[];

    const courtB = [
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || [])
    ].filter(Boolean) as Player[];

    const court = [...courtA, ...courtB].filter(
      p => isStrictlyActive(p) && p.id !== targetId
    );

    // Active members in attendance who are not in teamA, teamB, or remainingPlayers
    const onCourtOrBenchIds = new Set([
      ...court.map(p => p.id),
      ...reserves.map(p => p.id),
      ...(targetId ? [targetId] : [])
    ]);

    const attendanceExtra = (attendance || [])
      .filter(p => isStrictlyActive(p) && !onCourtOrBenchIds.has(p.id));

    // Combined unique active pool
    const all = [...reserves, ...court, ...attendanceExtra];

    return { reserves, court, attendanceExtra, all };
  }, [generationResult, target, attendance]);

  // Filter based on active tab and search query
  const displayedCandidates = useMemo(() => {
    let list: Player[] = [];
    if (activeTab === 'reserves') list = candidatesData.reserves;
    else if (activeTab === 'court') list = candidatesData.court;
    else if (activeTab === 'attendance') list = candidatesData.attendanceExtra;
    else list = candidatesData.all;

    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase().trim();
    return list.filter(p => 
      p.name.toLowerCase().includes(term) ||
      (p.isOfficialSetter && 'levantador'.includes(term))
    );
  }, [candidatesData, activeTab, searchTerm]);

  // Helper to determine where an athlete is currently located
  const getPlayerLocationBadge = (p: Player) => {
    if (!generationResult) return null;

    const reserveIdx = (generationResult.remainingPlayers || []).findIndex(r => r.id === p.id);
    if (reserveIdx !== -1) {
      return {
        label: reserveIdx === 0 ? '1º da Fila (Reserva)' : `${reserveIdx + 1}º na Fila`,
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      };
    }

    const inA = generationResult.teamA?.setter?.id === p.id || 
      (generationResult.teamA?.players || []).some(pl => pl.id === p.id);
    if (inA) {
      return {
        label: 'Equipe A',
        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      };
    }

    const inB = generationResult.teamB?.setter?.id === p.id || 
      (generationResult.teamB?.players || []).some(pl => pl.id === p.id);
    if (inB) {
      return {
        label: 'Equipe B',
        color: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      };
    }

    return {
      label: 'Sócio Presente',
      color: 'bg-zinc-800 text-zinc-300 border-white/10'
    };
  };

  const handleSelect = async (player: Player) => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onSelectReplacement(player);
      onClose();
    } catch (err) {
      console.error('Falha ao aplicar substituição:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !target) return null;

  const targetPlayer = target.player;
  const isSetterSlot = target.role === 'setter';
  const targetTeamLabel = target.team === 'A' ? 'Equipe A' : target.team === 'B' ? 'Equipe B' : 'Banco de Reservas';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-zinc-950 border border-white/15 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
            <div>
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-brand-primary" />
                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">
                  Substituição Rápida de Atleta
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Escolha o atleta para mover ou trocar para esta posição
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Target Slot Card */}
          <div className="p-4 sm:p-5 bg-black/40 border-b border-white/10">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
              Posição de Destino:
            </div>
            {targetPlayer ? (
              <div className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-zinc-900/90 border border-brand-primary/30">
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={targetPlayer} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-black text-white uppercase tracking-tight">
                        {targetPlayer.name}
                      </span>
                      {targetPlayer.isOfficialSetter && (
                        <span className="px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/40 text-[9px] font-black uppercase">
                          Levantador
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                      <span>{targetTeamLabel}</span>
                      <span>•</span>
                      <span>{isSetterSlot ? 'Levantador Oficial' : 'Jogador de Linha'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    IC Atual
                  </div>
                  <div className="text-sm sm:text-base font-black text-brand-primary">
                    {calculateCompositePerformanceRating(targetPlayer).toFixed(1)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-zinc-900/60 border border-dashed border-brand-primary/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-brand-primary/50 flex items-center justify-center text-brand-primary font-black text-xs">
                    +
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-black text-white uppercase">
                      Slot Vazio Disponível
                    </div>
                    <div className="text-xs text-brand-primary font-bold">
                      {targetTeamLabel} • {isSetterSlot ? 'Levantador' : 'Jogador de Linha'}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-[10px] font-black uppercase text-brand-primary">
                  Aguardando
                </span>
              </div>
            )}
          </div>

          {/* Search bar & Tabs */}
          <div className="p-4 sm:p-5 border-b border-white/10 space-y-3 bg-zinc-950">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome de sócio ativo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900/80 rounded-xl border border-white/5 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('reserves')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === 'reserves'
                    ? 'bg-brand-primary text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>Fila de Reservas</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'reserves' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'
                }`}>
                  {candidatesData.reserves.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('court')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === 'court'
                    ? 'bg-brand-primary text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>Em Quadra</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'court' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'
                }`}>
                  {candidatesData.court.length}
                </span>
              </button>

              {candidatesData.attendanceExtra.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    activeTab === 'attendance'
                      ? 'bg-brand-primary text-black shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>Outros Presentes</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === 'attendance' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'
                  }`}>
                    {candidatesData.attendanceExtra.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-brand-primary text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>Todos</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'all' ? 'bg-black/20 text-black' : 'bg-white/10 text-white'
                }`}>
                  {candidatesData.all.length}
                </span>
              </button>
            </div>
          </div>

          {/* Player List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
            {displayedCandidates.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-zinc-400">Nenhum sócio ativo encontrado</p>
                <p className="text-xs text-zinc-600 mt-1">Tente buscar por outro termo ou mude de aba</p>
              </div>
            ) : (
              displayedCandidates.map(player => {
                const location = getPlayerLocationBadge(player);
                const ic = calculateCompositePerformanceRating(player);

                return (
                  <motion.div
                    key={player.id}
                    layout
                    className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-zinc-900/70 border border-white/5 hover:border-brand-primary/50 hover:bg-zinc-900 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar player={player} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-white uppercase tracking-tight truncate">
                            {player.name}
                          </span>
                          {player.isOfficialSetter && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black uppercase">
                              <Sparkles className="w-2.5 h-2.5" />
                              Levantador
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 text-[9px] font-bold">
                            {(player.gender || 'MALE').toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          {location && (
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${location.color}`}>
                              {location.label}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 font-semibold">
                            IC {ic.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSelect(player)}
                      className="ml-3 px-3.5 py-2 rounded-xl bg-brand-primary text-black font-black text-xs uppercase tracking-wider hover:bg-brand-primary/90 hover:scale-105 active:scale-95 transition-all shadow-md shadow-brand-primary/20 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {targetPlayer ? 'Substituir' : 'Inserir'}
                    </button>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="p-3 sm:p-4 bg-zinc-900/80 border-t border-white/10 text-center text-[11px] text-zinc-400 font-semibold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
            <span>Exibindo estritamente sócios com cadastro ativo no clube</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
