import { useShallow } from 'zustand/react/shallow';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Users, 
  Calendar, 
  Play, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Plus, 
  X, 
  Save,
  Edit2,
  Medal,
  Target,
  Hash,
  RotateCcw,
  AlertCircle,
  LayoutGrid,
  GitBranch,
  Zap,
  RefreshCw
} from 'lucide-react';
import { useStore } from '../store';
import { Tournament, TournamentTeam, TournamentMatch, SetScore, TournamentStrategy } from '../types';
import { generateTournamentTeams } from '../utils/teamLogic';
import { HelpTooltip } from '../src/components/HelpTooltip';

interface TournamentViewProps {
  onStart: (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number; strategy: TournamentStrategy, preGeneratedTeams?: TournamentTeam[], preGeneratedReserves?: string[] }) => Promise<void>;
  onRecord: (matchId: string, setScores: SetScore[]) => Promise<void>;
  onResetMatch: (matchId: string) => Promise<void>;
  onEnd: () => Promise<void>;
  onAddPlayer: (teamId: string, playerId: string) => Promise<void>;
  onSubstitute: (teamId: string, oldPlayerId: string, newPlayerId: string) => Promise<void>;
}

export const TournamentView: React.FC<TournamentViewProps> = ({ onStart, onRecord, onResetMatch, onEnd, onAddPlayer, onSubstitute }) => {
  const { activeTournament, attendance: allAttendance, userRole, players: allPlayers, isSyncing } = useStore(useShallow(state => ({activeTournament: state.activeTournament, attendance: state.attendance, userRole: state.userRole, players: state.players, isSyncing: state.isSyncing})));
  const players = useMemo(() => allPlayers.filter(p => p.status !== 'inactive' && !p.isDM), [allPlayers]);
  const attendance = useMemo(() => allAttendance.filter(p => p.status !== 'inactive' && !p.isDM), [allAttendance]);
  const [isStarting, setIsStarting] = useState(false);
  const [config, setConfig] = useState({
    numTeams: 3,
    pointsPerSet: 15,
    setsPerMatch: 1,
    strategy: TournamentStrategy.ROUND_ROBIN
  });

  const [previewTeams, setPreviewTeams] = useState<TournamentTeam[] | null>(null);
  const [previewReserves, setPreviewReserves] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [recordingMatch, setRecordingMatch] = useState<TournamentMatch | null>(null);
  const [isManagingTeams, setIsManagingTeams] = useState(false);
  const [managingTeamId, setManagingTeamId] = useState<string | null>(null);
  const [substitutingPlayerId, setSubstitutingPlayerId] = useState<string | null>(null);
  const [currentSetScores, setCurrentSetScores] = useState<SetScore[]>([]);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  const handleGeneratePreview = () => {
    const { teams, reserves } = generateTournamentTeams(attendance, config.numTeams);
    setPreviewTeams(teams);
    setPreviewReserves(reserves);
    setIsPreviewing(true);
  };

  const handleCancelPreview = () => {
    setPreviewTeams(null);
    setPreviewReserves([]);
    setIsPreviewing(false);
  };

  const handlePreviewSubstitute = (teamId: string, oldPlayerId: string, newPlayerId: string) => {
    if (!previewTeams) return;
    
    let updatedReserves = [...previewReserves];
    
    // Check if newPlayerId is in another team
    const otherTeam = previewTeams.find(t => t.id !== teamId && t.players.includes(newPlayerId));

    if (otherTeam) {
      // Swap between teams
      const updatedTeams = previewTeams.map(team => {
        if (team.id === teamId) {
          return {
            ...team,
            players: team.players.map(pid => pid === oldPlayerId ? newPlayerId : pid)
          };
        }
        if (team.id === otherTeam.id) {
          return {
            ...team,
            players: team.players.map(pid => pid === newPlayerId ? oldPlayerId : pid)
          };
        }
        return team;
      });
      setPreviewTeams(updatedTeams);
    } else {
      // Substitute from reserves
      if (updatedReserves.includes(newPlayerId)) {
        updatedReserves = updatedReserves.filter(id => id !== newPlayerId);
        updatedReserves.push(oldPlayerId);
      }

      const updatedTeams = previewTeams.map(team => {
        if (team.id === teamId) {
          return {
            ...team,
            players: team.players.map(pid => pid === oldPlayerId ? newPlayerId : pid)
          };
        }
        return team;
      });

      setPreviewTeams(updatedTeams);
      setPreviewReserves(updatedReserves);
    }
  };

  const handlePreviewAddPlayer = (teamId: string, playerId: string) => {
    if (!previewTeams) return;
    
    const updatedReserves = previewReserves.filter(id => id !== playerId);
    const updatedTeams = previewTeams.map(team => {
      if (team.id === teamId) {
        return { ...team, players: [...team.players, playerId] };
      }
      return team;
    });

    setPreviewTeams(updatedTeams);
    setPreviewReserves(updatedReserves);
  };

  const toggleMatchExpansion = (matchId: string) => {
    setExpandedMatches(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const suggestedNumTeams = useMemo(() => {
    return Math.max(2, Math.min(5, Math.floor(attendance.length / 6)));
  }, [attendance.length]);

  const suggestedStrategy = useMemo(() => {
    const n = config.numTeams;
    if (n <= 3) return TournamentStrategy.ROUND_ROBIN;
    if (n === 4) return TournamentStrategy.DOUBLE_ELIMINATION;
    return TournamentStrategy.GROUPS_AND_KNOCKOUT;
  }, [config.numTeams]);

  useEffect(() => {
    if (!activeTournament) {
      setConfig(prev => ({ 
        ...prev, 
        numTeams: suggestedNumTeams,
        strategy: suggestedStrategy 
      }));
    }
  }, [suggestedNumTeams, suggestedStrategy, activeTournament]);

  const suggestedConfig = useMemo(() => {
    const numTeams = Number(config.numTeams) || 3;
    const setsPerMatch = Number(config.setsPerMatch) || 1;

    let basePoints = 15;
    if (numTeams === 2) basePoints = 25;
    else if (numTeams === 3) basePoints = 21;
    else if (numTeams === 4) basePoints = 21;
    else if (numTeams === 5) basePoints = 12;

    const sets = setsPerMatch;
    const points = Math.max(5, Math.round(basePoints / sets));
    
    return { 
      points, 
      sets, 
      label: sets === 1 ? 'Set Único' : `${sets} Sets` 
    };
  }, [config.numTeams, config.setsPerMatch]);

  const applySuggestion = () => {
    setConfig(prev => ({
      ...prev,
      pointsPerSet: suggestedConfig.points
    }));
  };

  const timeEstimation = useMemo(() => {
    const numTeams = Number(config.numTeams) || 3;
    const pointsPerSet = Number(config.pointsPerSet) || 15;
    const setsPerMatch = Number(config.setsPerMatch) || 1;
    const strategy = config.strategy;

    const totalMatches = strategy === TournamentStrategy.ROUND_ROBIN 
      ? (numTeams * (numTeams - 1)) / 2
      : strategy === TournamentStrategy.DOUBLE_ELIMINATION
        ? (numTeams * 2) - 2
        : (numTeams === 4 ? 4 : numTeams === 5 ? 6 : (numTeams * (numTeams - 1)) / 2); // Simplified for Groups+KO
    
    const secondsPerPoint = 40;
    const pointsPerMatch = pointsPerSet * 2 * setsPerMatch;
    const matchPlayTime = (pointsPerMatch * secondsPerPoint) / 60;
    const matchOverhead = 3;
    const setOverhead = (setsPerMatch - 1) * 2;
    
    const timePerMatch = Math.round(matchPlayTime + matchOverhead + setOverhead);
    const totalTime = totalMatches * timePerMatch;
    
    return {
      perMatch: timePerMatch,
      total: totalTime,
      totalMatches
    };
  }, [config]);

  const availablePlayers = useMemo(() => {
    if (!activeTournament) return [];
    const assignedIds = new Set(activeTournament.teams.flatMap(t => t.players));
    return attendance.filter(p => p.status !== 'inactive' && !assignedIds.has(p.id));
  }, [attendance, activeTournament]);

  const reservePlayers = useMemo(() => {
    if (!activeTournament || !activeTournament.reserves) return [];
    return activeTournament.reserves.map(id => players.find(p => p.id === id)).filter(Boolean) as any[];
  }, [activeTournament, players]);

  const handleStart = async () => {
    setIsStarting(true);
    const finalConfig = {
      numTeams: Number(config.numTeams) || 3,
      pointsPerSet: Number(config.pointsPerSet) || 15,
      setsPerMatch: Number(config.setsPerMatch) || 1,
      strategy: config.strategy,
      preGeneratedTeams: previewTeams || undefined,
      preGeneratedReserves: previewReserves.length > 0 ? previewReserves : undefined
    };
    await onStart(finalConfig);
    setIsStarting(false);
    setIsPreviewing(false);
  };

  const handleRecord = async () => {
    if (!recordingMatch) return;
    
    await onRecord(recordingMatch.id, currentSetScores);
    setRecordingMatch(null);
  };

  if (!activeTournament) {
    if (isPreviewing && previewTeams) {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center">
                Pré-visualização dos Times
                <HelpTooltip 
                  title="Modo Torneio" 
                  content="Crie um torneio com os jogadores presentes. Defina o número de times, a pontuação e a estratégia (ex: Pontos Corridos). O sistema gerará os times e a tabela de jogos automaticamente."
                />
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Confira o balanceamento e faça ajustes manuais se necessário
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCancelPreview}
                className="px-6 py-3 bg-white/5 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all border border-brand-primary/40"
              >
                Voltar
              </button>
              <button
                onClick={handleGeneratePreview}
                className="px-6 py-3 bg-brand-primary/20 text-brand-primary rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/30 transition-all flex items-center gap-2 border border-brand-primary/30"
              >
                <RefreshCw className="w-4 h-4" /> Re-sortear
              </button>
              <button
                onClick={() => setIsManagingTeams(true)}
                className="px-6 py-3 bg-brand-primary/20 text-brand-primary rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/30 transition-all flex items-center gap-2 border border-brand-primary/30"
              >
                <Users className="w-4 h-4" /> Trocar Jogadores
              </button>
              <button
                onClick={handleStart}
                disabled={isStarting || isSyncing}
                className="px-6 py-3 bg-brand-primary text-brand-secondary rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/20 disabled:opacity-50"
              >
                {isStarting || isSyncing ? (
                  <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-brand-secondary" /> Iniciar Torneio
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {previewTeams.map(team => {
              const teamElo = team.players.reduce((sum, pid) => {
                const p = players.find(player => player.id === pid);
                return sum + (p?.elo || 0);
              }, 0);

              return (
                <div key={team.id} className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 shadow-sm hover:border-white/20 transition-all">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand-primary/40">
                    <div>
                      <h4 className="text-xs font-black text-brand-primary uppercase tracking-widest">
                        {team.name}
                      </h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        Total ELO: {teamElo}
                      </p>
                    </div>
                    <span className="text-[8px] font-black text-slate-500 uppercase">
                      {team.players.length} Atletas
                    </span>
                  </div>
                  <div className="space-y-3">
                    {team.players.map(pid => {
                      const player = players.find(p => p.id === pid);
                      return (
                        <div key={pid} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${player?.isOfficialSetter ? 'text-brand-primary' : 'text-slate-300'}`}>
                              {player?.name || '...'}
                            </span>
                            {player?.isOfficialSetter && (
                              <span className="text-[7px] font-black bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-md uppercase border border-brand-primary/30">L</span>
                            )}
                          </div>
                          <span className="text-[8px] font-black text-slate-500 uppercase group-hover:text-slate-400 transition-colors">
                            ELO {player?.elo}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {previewReserves.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-brand-primary/20 rounded-lg border border-brand-primary/30">
                  <Users className="w-4 h-4 text-brand-primary" />
                </div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reservas</h3>
              </div>

              <div className="flex flex-wrap gap-2">
                {previewReserves.map(pid => {
                  const player = players.find(p => p.id === pid);
                  if (!player) return null;
                  return (
                    <div key={player.id} className="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 border-l-[4px] border-l-brand-primary shadow-sm flex items-center gap-2 group hover:border-white/20 transition-all">
                      <span className="text-[10px] font-bold text-white uppercase">{player.name}</span>
                      <div className="flex items-center gap-1 border-l border-white/5 pl-2">
                        <span className="text-[8px] font-black text-slate-500 uppercase">ELO {player.elo}</span>
                        {player.isOfficialSetter && (
                          <span className="text-[8px] font-black text-brand-primary uppercase">L</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal de Gerenciamento de Times (Preview) */}
          <AnimatePresence>
            {isManagingTeams && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-black border border-white/5 border-l-[8px] border-l-brand-primary rounded-[3rem] w-full max-w-5xl max-h-[90vh] flex flex-col p-8 shadow-2xl"
                >
                  <div className="flex justify-between items-center mb-8 shrink-0">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Trocar Jogadores</h3>
                    <button 
                      onClick={() => {
                        setIsManagingTeams(false);
                        setManagingTeamId(null);
                        setSubstitutingPlayerId(null);
                      }} 
                      className="p-2 hover:bg-white/10 rounded-xl transition-all"
                    >
                      <X className="w-6 h-6 text-slate-400 hover:text-white" />
                    </button>
                  </div>

                  <div className="flex-grow overflow-y-auto pr-2 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {previewTeams.map(team => (
                        <div key={team.id} className="bg-white/5 rounded-3xl p-6 border border-white/5 border-l-[6px] border-l-brand-primary space-y-4">
                          <div className="flex justify-between items-center">
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">{team.name}</h4>
                            <button 
                              onClick={() => setManagingTeamId(managingTeamId === team.id ? null : team.id)}
                              className="p-2 bg-brand-primary/20 rounded-xl shadow-sm hover:bg-brand-primary/30 text-brand-primary transition-all border border-brand-primary/30"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            {team.players.map(pid => {
                              const player = players.find(p => p.id === pid);
                              return (
                                <div key={pid} className="flex items-center justify-between bg-brand-secondary/30 p-3 rounded-xl border border-white/5 border-l-[4px] border-l-brand-primary">
                                  <span className="text-xs font-bold text-slate-300 truncate">{player?.name || 'Desconhecido'}</span>
                                  <button 
                                    onClick={() => {
                                      setManagingTeamId(team.id);
                                      setSubstitutingPlayerId(pid);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/20 rounded-lg transition-all"
                                    title="Substituir"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {managingTeamId && (
                      <div className="bg-brand-primary/20 rounded-3xl p-8 border border-brand-primary/30 space-y-6 animate-in slide-in-from-top-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest">
                            {substitutingPlayerId ? 'Substituir por:' : `Adicionar ao ${previewTeams.find(t => t.id === managingTeamId)?.name}:`}
                          </h4>
                          <button onClick={() => { setManagingTeamId(null); setSubstitutingPlayerId(null); }} className="text-brand-primary hover:text-brand-primary/80">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {(() => {
                          const availableForPreview = attendance.filter(p => {
                            if (p.status === 'inactive') return false;
                            if (substitutingPlayerId) {
                              // If substituting, allow selecting anyone else (reserves or other teams)
                              return p.id !== substitutingPlayerId;
                            } else {
                              // If adding, only allow selecting from reserves/unassigned
                              return !previewTeams.flatMap(t => t.players).includes(p.id);
                            }
                          });
                          return availableForPreview.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {availableForPreview.map(player => {
                                const isReserve = previewReserves.includes(player.id);
                                return (
                                  <button
                                    key={player.id}
                                    onClick={() => {
                                      if (substitutingPlayerId) {
                                        handlePreviewSubstitute(managingTeamId, substitutingPlayerId, player.id);
                                      } else {
                                        handlePreviewAddPlayer(managingTeamId, player.id);
                                      }
                                      setManagingTeamId(null);
                                      setSubstitutingPlayerId(null);
                                    }}
                                    className={`bg-brand-secondary/30 p-4 rounded-2xl border border-white/5 border-l-[4px] border-l-brand-primary text-center hover:shadow-md transition-all group relative ${
                                      isReserve ? 'border-emerald-500/50 hover:border-emerald-400' : 'border-brand-primary/50 hover:border-brand-primary'
                                    }`}
                                  >
                                    {isReserve && (
                                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-[6px] text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                                        Reserva
                                      </span>
                                    )}
                                    <p className={`text-xs font-black uppercase truncate ${isReserve ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-white group-hover:text-brand-primary'}`}>{player.name}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">ELO {player.elo}</p>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <p className="text-sm font-bold text-slate-400 italic">Nenhum jogador disponível na lista de presença.</p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-brand-primary rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-brand-primary/20 rotate-3">
            <Trophy className="w-10 h-10 text-brand-secondary" />
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Torneio dos Aniversariantes</h2>
          <p className="text-slate-400 font-medium max-w-md mx-auto">
            Organize um torneio rápido com times fixos e classificação em tempo real.
          </p>
        </div>

        <div className="bg-black rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary p-8 sm:p-12 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <GitBranch className="w-3 h-3" /> Estratégia do Torneio
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: TournamentStrategy.ROUND_ROBIN, name: 'Todos contra Todos', icon: LayoutGrid, desc: 'Ideal para poucos times. Todos jogam entre si.' },
                    { id: TournamentStrategy.GROUPS_AND_KNOCKOUT, name: 'Grupos + Mata-Mata', icon: Trophy, desc: 'Fase classificatória seguida de semifinais/final.' },
                    { id: TournamentStrategy.DOUBLE_ELIMINATION, name: 'Dupla Eliminação', icon: GitBranch, desc: 'Mata-mata com repescagem. Perdeu duas, está fora.' }
                  ].map(strat => (
                    <button
                      key={strat.id}
                      onClick={() => setConfig({ ...config, strategy: strat.id })}
                      className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all text-left relative ${
                        config.strategy === strat.id 
                          ? 'bg-brand-primary/10 border-brand-primary shadow-lg shadow-brand-primary/5' 
                          : 'bg-white/5 border-brand-primary/40 text-slate-400 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className={`p-2 rounded-xl ${config.strategy === strat.id ? 'bg-brand-primary text-brand-secondary' : 'bg-white/10 text-slate-500'}`}>
                        <strat.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black uppercase tracking-tight ${config.strategy === strat.id ? 'text-white' : 'text-slate-400'}`}>
                            {strat.name}
                          </span>
                          {strat.id === suggestedStrategy && (
                            <span className="bg-brand-primary text-[6px] text-brand-secondary px-2 py-0.5 rounded-full uppercase font-black tracking-widest flex items-center gap-1">
                              <Zap className="w-2 h-2 fill-brand-secondary" /> Recomendado
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-medium text-slate-500 mt-1 leading-tight">{strat.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-3 h-3" /> Número de Times
                </label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      onClick={() => setConfig({ ...config, numTeams: num })}
                      className={`flex-1 py-4 rounded-2xl font-black transition-all relative ${
                        config.numTeams === num 
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/30 scale-105' 
                          : 'bg-white/10 text-slate-400 hover:bg-white/15 hover:text-slate-300'
                      }`}
                    >
                      {num}
                      {num === suggestedNumTeams && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-brand-primary text-[6px] text-brand-secondary px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                          Sugerido
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-bold text-slate-400 italic">
                  * Mínimo de {config.numTeams * 6} jogadores confirmados (Atualmente: {attendance.length}). {attendance.length >= 6 ? `Sugerimos ${suggestedNumTeams} times para 6 jogadores por equipe.` : ''}
                </p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-3 h-3" /> Pontos por Set
                </label>
                <input 
                  type="number"
                  value={config.pointsPerSet}
                  onChange={(e) => setConfig({ ...config, pointsPerSet: e.target.value === '' ? '' as any : parseInt(e.target.value) })}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-6 font-black text-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Sets por Partida
                </label>
                <input 
                  type="number"
                  value={config.setsPerMatch}
                  onChange={(e) => setConfig({ ...config, setsPerMatch: e.target.value === '' ? '' as any : parseInt(e.target.value) })}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-6 font-black text-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="bg-white/5 rounded-[2rem] p-8 flex flex-col justify-between border border-white/5 border-l-[6px] border-l-brand-primary">
              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Sugestão do Sistema</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-400">Formato</span>
                    <span className="text-sm font-black text-brand-primary uppercase">{suggestedConfig.label}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-400">Pontos Sugeridos</span>
                    <span className="text-sm font-black text-brand-primary uppercase">{suggestedConfig.points} pts</span>
                  </div>

                  <div className="pt-4 border-t border-brand-primary/40 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Partidas Totais</span>
                      <span className="text-xs font-black text-white">{timeEstimation.totalMatches} jogos</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo por Jogo</span>
                      <span className="text-xs font-black text-white">~{timeEstimation.perMatch} min</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração Total</span>
                      <span className="text-xs font-black text-brand-primary">{Math.floor(timeEstimation.total / 60)}h {timeEstimation.total % 60}min</span>
                    </div>
                  </div>
                  
                  {config.pointsPerSet !== suggestedConfig.points && (
                    <button
                      onClick={applySuggestion}
                      className="w-full py-2 bg-brand-primary/20 text-brand-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-primary/30 transition-all border border-brand-primary/30"
                    >
                      Aplicar Sugestão
                    </button>
                  )}

                  <div className="p-4 bg-white/5 rounded-xl border border-brand-primary/40 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-brand-primary shrink-0" />
                    <p className="text-[10px] font-bold text-slate-300 leading-relaxed">
                      Estimativa baseada em 40s por ponto + 3min de intervalo entre jogos.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleGeneratePreview}
                disabled={attendance.length < config.numTeams * 6}
                className="w-full mt-8 bg-brand-primary text-brand-secondary py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3"
              >
                <Users className="w-5 h-5 fill-brand-secondary" />
                Sortear Times
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sortedTeams = activeTournament ? [...activeTournament.teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const setsDiffA = a.setsWon - a.setsLost;
    const setsDiffB = b.setsWon - b.setsLost;
    if (setsDiffB !== setsDiffA) return setsDiffB - setsDiffA;
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
  }) : [];

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header do Torneio Ativo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
            <Trophy className="w-6 h-6 text-brand-secondary" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{activeTournament.name}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-3 h-3" /> {new Date(activeTournament.date).toLocaleDateString('pt-BR')} • {activeTournament.config.numTeams} Times
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {userRole === 'ADMIN' && (
            <button
              onClick={() => setIsManagingTeams(true)}
              className="px-6 py-3 bg-brand-primary/20 text-brand-primary rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/30 transition-all flex items-center gap-2 border border-brand-primary/30"
            >
              <Users className="w-4 h-4" /> Gerenciar Times
            </button>
          )}

          {userRole === 'ADMIN' && (
            <button
              onClick={onEnd}
              disabled={isSyncing}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${isSyncing ? 'bg-rose-900/20 text-rose-400/40 border-rose-700/20' : 'bg-rose-900/40 text-rose-400 hover:bg-rose-900/50 border-rose-700/50'}`}
            >
              {isSyncing ? 'Sincronizando...' : 'Encerrar Torneio'}
            </button>
          )}
        </div>
      </div>

      {/* 1. Times e Escalações */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/20 rounded-xl border border-brand-primary/30">
            <Users className="w-5 h-5 text-brand-primary" />
          </div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Escalações dos Times</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {activeTournament.teams.map(team => {
            const teamElo = team.players.reduce((sum, pid) => {
              const p = players.find(player => player.id === pid);
              return sum + (p?.elo || 0);
            }, 0);

            return (
              <div key={team.id} className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 shadow-sm hover:border-white/20 transition-all">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand-primary/40">
                  <div>
                    <h4 className="text-xs font-black text-brand-primary uppercase tracking-widest">
                      {team.name}
                    </h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      Total ELO: {teamElo}
                    </p>
                  </div>
                  <span className="text-[8px] font-black text-slate-500 uppercase">
                    {team.players.length} Atletas
                  </span>
                </div>
                <div className="space-y-3">
                  {team.players.map(pid => {
                    const player = players.find(p => p.id === pid);
                    return (
                      <div key={pid} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${player?.isOfficialSetter ? 'text-brand-primary' : 'text-slate-300'}`}>
                            {player?.name || '...'}
                          </span>
                          {player?.isOfficialSetter && (
                            <span className="text-[7px] font-black bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-md uppercase border border-brand-primary/30">L</span>
                          )}
                        </div>
                        <span className="text-[8px] font-black text-slate-500 uppercase group-hover:text-slate-400 transition-colors">
                          ELO {player?.elo}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Reservas (Compacto) */}
      {reservePlayers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-brand-primary/20 rounded-lg border border-brand-primary/30">
              <Users className="w-4 h-4 text-brand-primary" />
            </div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reservas</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {reservePlayers.map(player => (
              <div key={player.id} className="bg-white/5 px-3 py-1.5 rounded-lg border border-brand-primary/40 shadow-sm flex items-center gap-2 group hover:border-white/20 transition-all">
                <span className="text-[10px] font-bold text-white uppercase">{player.name}</span>
                <div className="flex items-center gap-1 border-l border-brand-primary/40 pl-2">
                  <span className="text-[8px] font-black text-slate-500 uppercase">ELO {player.elo}</span>
                  {player.isOfficialSetter && (
                    <span className="text-[8px] font-black text-brand-primary uppercase">L</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Classificação */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/20 rounded-xl border border-brand-primary/30">
            <Medal className="w-5 h-5 text-brand-primary" />
          </div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Classificação</h3>
        </div>

        <div className="bg-black rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-brand-primary/40">
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pos</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">P</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">J</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">V</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">S+</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">S-</th>
                <th className="py-5 px-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedTeams.map((team, idx) => (
                <tr key={team.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-5 px-6">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                      idx === 0 ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30' : 
                      idx === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      idx === 2 ? 'bg-slate-600/20 text-slate-400 border border-slate-600/30' : 'text-slate-500'
                    }`}>
                      {idx + 1}º
                    </span>
                  </td>
                  <td className="py-5 px-6">
                    <p className="text-sm font-black text-white uppercase tracking-tight">{team.name}</p>
                  </td>
                  <td className="py-5 px-4 text-center">
                    <span className="text-sm font-black text-brand-primary">{team.points}</span>
                  </td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-slate-400">{team.matchesPlayed}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-slate-400">{team.matchesWon}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-brand-primary">{team.setsWon}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-slate-400">{team.setsLost}</td>
                  <td className="py-5 px-4 text-center text-xs font-black text-white">
                    {team.pointsFor - team.pointsAgainst}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Cronograma e Chaves */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/20 rounded-xl border border-brand-primary/30">
            <Clock className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Cronograma e Chaves</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Enfrentamentos entre os times</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTournament.matches.map((match, idx) => {
            const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
            const teamB = activeTournament.teams.find(t => t.id === match.teamBId);
            const isExpanded = expandedMatches.has(match.id);
            const isCompleted = match.status === 'completed';
            const winnerId = match.winnerId;
            
            return (
              <div 
                key={match.id}
                className={`relative overflow-hidden bg-black rounded-[2rem] border-2 transition-all duration-300 ${
                  isCompleted 
                    ? 'border-brand-primary/40 shadow-sm' 
                    : 'border-brand-primary/30 shadow-md hover:border-brand-primary/50'
                }`}
              >
                {isCompleted && (
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-brand-primary rounded-full blur-3xl" />
                    <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-brand-primary rounded-full blur-3xl" />
                  </div>
                )}

                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        isCompleted ? 'bg-white/10 text-slate-400 border border-brand-primary/40' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30 animate-pulse'
                      }`}>
                        {match.bracket === 'upper' ? 'Chave Superior' : 
                         match.bracket === 'lower' ? 'Repescagem' : 
                         match.bracket === 'final' ? 'Grande Final' : 
                         match.bracket === 'group' ? 'Fase de Grupos' : 
                         match.bracket === 'groupA' ? 'Grupo A' : 
                         match.bracket === 'groupB' ? 'Grupo B' : 
                         match.bracket === 'semi' ? 'Semifinal' : 
                         match.bracket === 'knockout' ? 'Mata-Mata' : 
                         `Jogo ${idx + 1}`}
                      </span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-brand-primary uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> Finalizado
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isCompleted && userRole === 'ADMIN' && (
                        <>
                          <button
                            onClick={() => {
                              setRecordingMatch(match);
                              const initialScores = match.setScores || Array.from({ length: activeTournament.config.setsPerMatch }, () => ({ scoreA: 0, scoreB: 0 }));
                              setCurrentSetScores(initialScores);
                            }}
                            className="p-2 hover:bg-brand-primary/20 rounded-xl text-brand-primary hover:text-brand-primary transition-all border border-brand-primary/30 hover:border-brand-primary/50"
                            title="Editar Resultado"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onResetMatch(match.id)}
                            className="p-2 hover:bg-slate-700/50 rounded-xl text-slate-400 hover:text-slate-300 transition-all border border-brand-primary/40"
                            title="Reiniciar Partida"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 relative">
                    {/* Team A */}
                    <div className={`flex-1 flex flex-col items-center p-4 rounded-2xl transition-all ${
                      isCompleted && winnerId === teamA?.id ? 'bg-brand-primary/20 ring-1 ring-brand-primary/30' : ''
                    }`}>
                      <div className="relative">
                        <p className={`text-xs font-black uppercase text-center mb-1 ${
                          isCompleted && winnerId === teamA?.id ? 'text-brand-primary' : 'text-white'
                        }`}>
                          {teamA?.name || (match.bracket ? 'A definir' : '...')}
                        </p>
                        {isCompleted && winnerId === teamA?.id && (
                          <Medal className="w-3 h-3 text-brand-primary absolute -right-4 -top-1" />
                        )}
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {teamA ? `ELO ${teamA.players.reduce((sum, pid) => sum + (players.find(p => p.id === pid)?.elo || 0), 0)}` : '-'}
                      </p>
                      
                      {isCompleted ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-4xl font-black leading-none ${
                            winnerId === teamA?.id ? 'text-brand-primary' : 'text-slate-500'
                          }`}>
                            {match.setsA}
                          </span>
                          <span className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">Sets</span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white/5 border-2 border-dashed border-brand-primary/40 flex items-center justify-center">
                          <Hash className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <span className="text-[10px] font-black text-slate-400">VS</span>
                      </div>
                      {isCompleted && (
                        <div className="h-12 w-[2px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
                      )}
                    </div>

                    {/* Team B */}
                    <div className={`flex-1 flex flex-col items-center p-4 rounded-2xl transition-all ${
                      isCompleted && winnerId === teamB?.id ? 'bg-brand-primary/20 ring-1 ring-brand-primary/30' : ''
                    }`}>
                      <div className="relative">
                        <p className={`text-xs font-black uppercase text-center mb-1 ${
                          isCompleted && winnerId === teamB?.id ? 'text-brand-primary' : 'text-white'
                        }`}>
                          {teamB?.name || (match.bracket ? 'A definir' : '...')}
                        </p>
                        {isCompleted && winnerId === teamB?.id && (
                          <Medal className="w-3 h-3 text-brand-primary absolute -right-4 -top-1" />
                        )}
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {teamB ? `ELO ${teamB.players.reduce((sum, pid) => sum + (players.find(p => p.id === pid)?.elo || 0), 0)}` : '-'}
                      </p>
                      
                      {isCompleted ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-4xl font-black leading-none ${
                            winnerId === teamB?.id ? 'text-brand-primary' : 'text-slate-500'
                          }`}>
                            {match.setsB}
                          </span>
                          <span className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">Sets</span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white/5 border-2 border-dashed border-brand-primary/40 flex items-center justify-center">
                          <Hash className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Placar dos Sets */}
                  {isCompleted && match.setScores && match.setScores.length > 0 && (
                    <div className="flex justify-center gap-3 mb-6 px-4 py-3 bg-white/5 rounded-2xl border border-brand-primary/40">
                      {match.setScores.map((s, i) => (
                        <div key={i} className="flex flex-col items-center">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">Set {i + 1}</span>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-secondary/30 rounded-xl border border-white/5 border-l-[4px] border-l-brand-primary shadow-sm">
                            <span className={`text-xs font-black ${s.scoreA > s.scoreB ? 'text-brand-primary' : 'text-slate-500'}`}>{s.scoreA}</span>
                            <span className="text-[10px] font-bold text-slate-600">×</span>
                            <span className={`text-xs font-black ${s.scoreB > s.scoreA ? 'text-brand-primary' : 'text-slate-500'}`}>{s.scoreB}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Lista de Jogadores Expansível */}
                  <div className="pt-4 border-t border-brand-primary/40">
                    <button 
                      onClick={() => toggleMatchExpansion(match.id)}
                      className="w-full flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-brand-primary transition-colors py-2"
                    >
                      {isExpanded ? (
                        <>Ocultar Atletas <ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <>Ver Atletas <ChevronDown className="w-3 h-3" /></>
                      )}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-8 mt-4 p-4 bg-white/5 rounded-2xl border border-white/5 border-l-[6px] border-l-brand-primary">
                            <div className="space-y-2">
                              {teamA?.players.map(pid => {
                                const player = players.find(p => p.id === pid);
                                return (
                                  <div key={pid} className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${player?.isOfficialSetter ? 'bg-brand-primary' : 'bg-white/20'}`} />
                                    <span className={`text-[10px] font-bold truncate ${player?.isOfficialSetter ? 'text-brand-primary' : 'text-slate-300'}`}>
                                      {player?.name}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="space-y-2 text-right">
                              {teamB?.players.map(pid => {
                                const player = players.find(p => p.id === pid);
                                return (
                                  <div key={pid} className="flex items-center justify-end gap-2">
                                    <span className={`text-[10px] font-bold truncate ${player?.isOfficialSetter ? 'text-brand-primary' : 'text-slate-300'}`}>
                                      {player?.name}
                                    </span>
                                    <div className={`w-1.5 h-1.5 rounded-full ${player?.isOfficialSetter ? 'bg-brand-primary' : 'bg-white/20'}`} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {match.status === 'pending' && userRole === 'ADMIN' && match.teamAId && match.teamBId && (
                    <button
                      onClick={() => {
                        setRecordingMatch(match);
                        const initialScores = Array.from({ length: activeTournament.config.setsPerMatch }, () => ({ scoreA: 0, scoreB: 0 }));
                        setCurrentSetScores(initialScores);
                      }}
                      className="w-full py-4 bg-brand-primary text-brand-secondary rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-brand-secondary" />
                      Lançar Resultado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Lançamento de Resultado */}
      <AnimatePresence>
        {recordingMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRecordingMatch(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-black rounded-[2.5rem] shadow-2xl p-8 sm:p-12 overflow-hidden border border-white/5 border-l-[8px] border-l-brand-primary"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                  {recordingMatch.status === 'completed' ? 'Editar Resultado' : 'Lançar Resultado'}
                </h3>
                <button onClick={() => setRecordingMatch(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X className="w-6 h-6 text-slate-400 hover:text-white" />
                </button>
              </div>

              <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2">
                {currentSetScores.map((set, setIdx) => (
                  <div key={setIdx} className="space-y-4 p-6 bg-white/5 rounded-3xl border border-white/5 border-l-[6px] border-l-brand-primary">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Set {setIdx + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block truncate">
                          {activeTournament.teams.find(t => t.id === recordingMatch.teamAId)?.name}
                        </label>
                        <input 
                          type="number"
                          value={set.scoreA}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const newScores = [...currentSetScores];
                            newScores[setIdx] = { ...newScores[setIdx], scoreA: val };
                            setCurrentSetScores(newScores);
                          }}
                          className="w-full bg-brand-secondary/30 border border-white/5 border-l-[4px] border-l-brand-primary focus:border-brand-primary rounded-xl py-3 px-4 font-black text-xl text-white transition-all outline-none placeholder:text-slate-600"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block truncate">
                          {activeTournament.teams.find(t => t.id === recordingMatch.teamBId)?.name}
                        </label>
                        <input 
                          type="number"
                          value={set.scoreB}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const newScores = [...currentSetScores];
                            newScores[setIdx] = { ...newScores[setIdx], scoreB: val };
                            setCurrentSetScores(newScores);
                          }}
                          className="w-full bg-brand-secondary/30 border border-white/5 border-l-[4px] border-l-brand-primary focus:border-brand-primary rounded-xl py-3 px-4 font-black text-xl text-white transition-all outline-none placeholder:text-slate-600"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="p-4 bg-brand-primary/20 rounded-2xl border border-brand-primary/30">
                  <p className="text-[10px] font-bold text-brand-primary text-center uppercase tracking-widest">
                    Partida de {activeTournament.config.setsPerMatch} {activeTournament.config.setsPerMatch === 1 ? 'Set' : 'Sets'}
                  </p>
                </div>

                <button
                  onClick={handleRecord}
                  className="w-full bg-brand-primary text-brand-secondary py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <Save className="w-5 h-5" />
                  Salvar Resultado
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Gerenciamento de Times */}
      <AnimatePresence>
        {isManagingTeams && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsManagingTeams(false);
                setManagingTeamId(null);
                setSubstitutingPlayerId(null);
              }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-black rounded-[2.5rem] shadow-2xl p-8 overflow-hidden max-h-[90vh] flex flex-col border border-white/5 border-l-[8px] border-l-brand-primary"
            >
              <div className="flex justify-between items-center mb-8 shrink-0">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Gerenciar Times</h3>
                <button 
                  onClick={() => {
                    setIsManagingTeams(false);
                    setManagingTeamId(null);
                    setSubstitutingPlayerId(null);
                  }} 
                  className="p-2 hover:bg-white/10 rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-slate-400 hover:text-white" />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto pr-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTournament.teams.map(team => (
                    <div key={team.id} className="bg-white/5 rounded-3xl p-6 border border-white/5 border-l-[6px] border-l-brand-primary space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">{team.name}</h4>
                        <button 
                          onClick={() => setManagingTeamId(managingTeamId === team.id ? null : team.id)}
                          className="p-2 bg-brand-primary/20 rounded-xl shadow-sm hover:bg-brand-primary/30 text-brand-primary transition-all border border-brand-primary/30"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {team.players.map(pid => {
                          const player = players.find(p => p.id === pid);
                          return (
                            <div key={pid} className="flex items-center justify-between bg-brand-secondary/30 p-3 rounded-xl border border-white/5 border-l-[4px] border-l-brand-primary">
                              <span className="text-xs font-bold text-slate-300 truncate">{player?.name || 'Desconhecido'}</span>
                              <button 
                                onClick={() => {
                                  setManagingTeamId(team.id);
                                  setSubstitutingPlayerId(pid);
                                }}
                                className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/20 rounded-lg transition-all"
                                title="Substituir"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {managingTeamId && (
                  <div className="bg-brand-primary/20 rounded-3xl p-8 border border-brand-primary/30 space-y-6 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest">
                        {substitutingPlayerId ? 'Substituir por:' : `Adicionar ao ${activeTournament.teams.find(t => t.id === managingTeamId)?.name}:`}
                      </h4>
                      <button onClick={() => { setManagingTeamId(null); setSubstitutingPlayerId(null); }} className="text-brand-primary hover:text-brand-primary/80">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {availablePlayers.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {availablePlayers.map(player => {
                          const isReserve = activeTournament.reserves?.includes(player.id);
                          return (
                            <button
                              key={player.id}
                              onClick={() => {
                                if (substitutingPlayerId) {
                                  onSubstitute(managingTeamId, substitutingPlayerId, player.id);
                                } else {
                                  onAddPlayer(managingTeamId, player.id);
                                }
                                setManagingTeamId(null);
                                setSubstitutingPlayerId(null);
                              }}
                              className={`bg-brand-secondary/30 p-4 rounded-2xl border border-white/5 border-l-[4px] border-l-brand-primary text-center hover:shadow-md transition-all group relative ${
                                isReserve ? 'border-emerald-500/50 hover:border-emerald-400' : 'border-brand-primary/50 hover:border-brand-primary'
                              }`}
                            >
                              {isReserve && (
                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-[6px] text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                                  Reserva
                                </span>
                              )}
                              <p className={`text-xs font-black uppercase truncate ${isReserve ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-white group-hover:text-brand-primary'}`}>{player.name}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">ELO {player.elo}</p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm font-bold text-slate-400 italic">Nenhum jogador disponível na lista de presença.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};