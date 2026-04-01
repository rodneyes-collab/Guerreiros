
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
  AlertCircle
} from 'lucide-react';
import { useStore } from '../store';
import { Tournament, TournamentTeam, TournamentMatch, SetScore } from '../types';

interface TournamentViewProps {
  onStart: (config: { numTeams: number; pointsPerSet: number; setsPerMatch: number }) => Promise<void>;
  onRecord: (matchId: string, setScores: SetScore[]) => Promise<void>;
  onResetMatch: (matchId: string) => Promise<void>;
  onEnd: () => Promise<void>;
  onAddPlayer: (teamId: string, playerId: string) => Promise<void>;
  onSubstitute: (teamId: string, oldPlayerId: string, newPlayerId: string) => Promise<void>;
}

export const TournamentView: React.FC<TournamentViewProps> = ({ onStart, onRecord, onResetMatch, onEnd, onAddPlayer, onSubstitute }) => {
  const { activeTournament, attendance, userRole, players } = useStore();
  const [isStarting, setIsStarting] = useState(false);
  const [config, setConfig] = useState({
    numTeams: 3,
    pointsPerSet: 15,
    setsPerMatch: 1
  });

  const [recordingMatch, setRecordingMatch] = useState<TournamentMatch | null>(null);
  const [isManagingTeams, setIsManagingTeams] = useState(false);
  const [managingTeamId, setManagingTeamId] = useState<string | null>(null);
  const [substitutingPlayerId, setSubstitutingPlayerId] = useState<string | null>(null);
  const [currentSetScores, setCurrentSetScores] = useState<SetScore[]>([]);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

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

  // Sugestão de formato baseada no número de times
  const suggestedNumTeams = useMemo(() => {
    return Math.max(2, Math.min(5, Math.floor(attendance.length / 6)));
  }, [attendance.length]);

  // Atualiza o config inicial se o número sugerido mudar e o usuário ainda não tiver mexido
  useEffect(() => {
    if (!activeTournament) {
      setConfig(prev => ({ ...prev, numTeams: suggestedNumTeams }));
    }
  }, [suggestedNumTeams, activeTournament]);

  const suggestedConfig = useMemo(() => {
    let basePoints = 15;
    if (config.numTeams === 2) basePoints = 25;
    else if (config.numTeams === 3) basePoints = 21;
    else if (config.numTeams === 4) basePoints = 21;
    else if (config.numTeams === 5) basePoints = 12;

    const sets = config.setsPerMatch;
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
    const numTeams = config.numTeams;
    const totalMatches = (numTeams * (numTeams - 1)) / 2;
    
    // Estimativa: 40 segundos por ponto (considerando ralis e saques)
    // + 2 minutos de aquecimento/troca por partida
    // + 1 minuto de intervalo entre sets se houver mais de 1
    const secondsPerPoint = 40;
    const pointsPerMatch = config.pointsPerSet * 2 * config.setsPerMatch; // Estimativa de pontos totais (média)
    const matchPlayTime = (pointsPerMatch * secondsPerPoint) / 60;
    const matchOverhead = 3; // Aquecimento e troca de times
    const setOverhead = (config.setsPerMatch - 1) * 2;
    
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
    return attendance.filter(p => !assignedIds.has(p.id));
  }, [attendance, activeTournament]);

  const reservePlayers = useMemo(() => {
    if (!activeTournament || !activeTournament.reserves) return [];
    return activeTournament.reserves.map(id => players.find(p => p.id === id)).filter(Boolean) as any[];
  }, [activeTournament, players]);

  const handleStart = async () => {
    setIsStarting(true);
    await onStart(config);
    setIsStarting(false);
  };

  const handleRecord = async () => {
    if (!recordingMatch) return;
    
    await onRecord(recordingMatch.id, currentSetScores);
    setRecordingMatch(null);
  };

  if (!activeTournament) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/20 rotate-3">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Torneio dos Aniversariantes</h2>
          <p className="text-slate-500 font-medium max-w-md mx-auto">
            Organize um torneio rápido com times fixos e classificação em tempo real.
          </p>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 sm:p-12 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
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
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105' 
                          : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {num}
                      {num === suggestedNumTeams && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-[6px] text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
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
                  onChange={(e) => setConfig({ ...config, pointsPerSet: parseInt(e.target.value) || 15 })}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Sets por Partida
                </label>
                <input 
                  type="number"
                  value={config.setsPerMatch}
                  onChange={(e) => setConfig({ ...config, setsPerMatch: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-[2rem] p-8 flex flex-col justify-between border border-slate-100">
              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Sugestão do Sistema</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-600">Formato</span>
                    <span className="text-sm font-black text-indigo-600 uppercase">{suggestedConfig.label}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-600">Pontos Sugeridos</span>
                    <span className="text-sm font-black text-indigo-600 uppercase">{suggestedConfig.points} pts</span>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Partidas Totais</span>
                      <span className="text-xs font-black text-slate-900">{timeEstimation.totalMatches} jogos</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo por Jogo</span>
                      <span className="text-xs font-black text-slate-900">~{timeEstimation.perMatch} min</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração Total</span>
                      <span className="text-xs font-black text-indigo-600">{Math.floor(timeEstimation.total / 60)}h {timeEstimation.total % 60}min</span>
                    </div>
                  </div>
                  
                  {config.pointsPerSet !== suggestedConfig.points && (
                    <button
                      onClick={applySuggestion}
                      className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                      Aplicar Sugestão
                    </button>
                  )}

                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                      Estimativa baseada em 40s por ponto + 3min de intervalo entre jogos. O tempo real pode variar conforme o nível dos ralis.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStart}
                disabled={isStarting || attendance.length < config.numTeams * 6}
                className="w-full mt-8 bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3"
              >
                {isStarting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    Sortear e Iniciar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standings logic
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
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{activeTournament.name}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-3 h-3" /> {new Date(activeTournament.date).toLocaleDateString('pt-BR')} • {activeTournament.config.numTeams} Times
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {userRole === 'ADMIN' && (
            <button
              onClick={() => setIsManagingTeams(true)}
              className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center gap-2"
            >
              <Users className="w-4 h-4" /> Gerenciar Times
            </button>
          )}

          {userRole === 'ADMIN' && (
            <button
              onClick={onEnd}
              className="px-6 py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all"
            >
              Encerrar Torneio
            </button>
          )}
        </div>
      </div>

      {/* 1. Times e Escalações */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-xl">
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Escalações dos Times</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {activeTournament.teams.map(team => {
            const teamElo = team.players.reduce((sum, pid) => {
              const p = players.find(player => player.id === pid);
              return sum + (p?.elo || 0);
            }, 0);

            return (
              <div key={team.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:border-indigo-200 transition-all">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-50">
                  <div>
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                      {team.name}
                    </h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      Total ELO: {teamElo}
                    </p>
                  </div>
                  <span className="text-[8px] font-black text-slate-300 uppercase">
                    {team.players.length} Atletas
                  </span>
                </div>
                <div className="space-y-3">
                  {team.players.map(pid => {
                    const player = players.find(p => p.id === pid);
                    return (
                      <div key={pid} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${player?.isOfficialSetter ? 'text-indigo-600' : 'text-slate-700'}`}>
                            {player?.name || '...'}
                          </span>
                          {player?.isOfficialSetter && (
                            <span className="text-[7px] font-black bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-md uppercase">L</span>
                          )}
                        </div>
                        <span className="text-[8px] font-black text-slate-300 uppercase group-hover:text-slate-400 transition-colors">
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
            <div className="p-1.5 bg-amber-50 rounded-lg">
              <Users className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reservas</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {reservePlayers.map(player => (
              <div key={player.id} className="bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm flex items-center gap-2 group hover:border-amber-200 transition-all">
                <span className="text-[10px] font-bold text-slate-700 uppercase">{player.name}</span>
                <div className="flex items-center gap-1 border-l border-slate-100 pl-2">
                  <span className="text-[8px] font-black text-slate-300 uppercase">ELO {player.elo}</span>
                  {player.isOfficialSetter && (
                    <span className="text-[8px] font-black text-rose-500 uppercase">L</span>
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
          <div className="p-2 bg-indigo-50 rounded-xl">
            <Medal className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Classificação</h3>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
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
            <tbody className="divide-y divide-slate-50">
              {sortedTeams.map((team, idx) => (
                <tr key={team.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-6">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                      idx === 0 ? 'bg-amber-100 text-amber-600' : 
                      idx === 1 ? 'bg-slate-100 text-slate-600' :
                      idx === 2 ? 'bg-orange-100 text-orange-600' : 'text-slate-400'
                    }`}>
                      {idx + 1}º
                    </span>
                  </td>
                  <td className="py-5 px-6">
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{team.name}</p>
                  </td>
                  <td className="py-5 px-4 text-center">
                    <span className="text-sm font-black text-indigo-600">{team.points}</span>
                  </td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-slate-600">{team.matchesPlayed}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-slate-600">{team.matchesWon}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-emerald-600">{team.setsWon}</td>
                  <td className="py-5 px-4 text-center text-xs font-bold text-rose-600">{team.setsLost}</td>
                  <td className="py-5 px-4 text-center text-xs font-black text-slate-800">
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
          <div className="p-2 bg-indigo-50 rounded-xl">
            <Clock className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Cronograma e Chaves</h3>
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
                className={`relative overflow-hidden bg-white rounded-[2rem] border-2 transition-all duration-300 ${
                  isCompleted 
                    ? 'border-slate-100 shadow-sm' 
                    : 'border-indigo-100 shadow-md hover:border-indigo-300'
                }`}
              >
                {/* Decorative background for completed matches */}
                {isCompleted && (
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-600 rounded-full blur-3xl" />
                    <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-emerald-600 rounded-full blur-3xl" />
                  </div>
                )}

                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        isCompleted ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600 animate-pulse'
                      }`}>
                        Jogo {idx + 1}
                      </span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
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
                            className="p-2 hover:bg-indigo-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"
                            title="Editar Resultado"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onResetMatch(match.id)}
                            className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all"
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
                      isCompleted && winnerId === teamA?.id ? 'bg-emerald-50/50 ring-1 ring-emerald-100' : ''
                    }`}>
                      <div className="relative">
                        <p className={`text-xs font-black uppercase text-center mb-1 ${
                          isCompleted && winnerId === teamA?.id ? 'text-emerald-700' : 'text-slate-800'
                        }`}>
                          {teamA?.name}
                        </p>
                        {isCompleted && winnerId === teamA?.id && (
                          <Medal className="w-3 h-3 text-amber-500 absolute -right-4 -top-1" />
                        )}
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        ELO {teamA?.players.reduce((sum, pid) => sum + (players.find(p => p.id === pid)?.elo || 0), 0)}
                      </p>
                      
                      {isCompleted ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-4xl font-black leading-none ${
                            winnerId === teamA?.id ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            {match.setsA}
                          </span>
                          <span className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">Sets</span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
                          <Hash className="w-5 h-5 text-slate-300" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-[10px] font-black text-slate-400">VS</span>
                      </div>
                      {isCompleted && (
                        <div className="h-12 w-[2px] bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
                      )}
                    </div>

                    {/* Team B */}
                    <div className={`flex-1 flex flex-col items-center p-4 rounded-2xl transition-all ${
                      isCompleted && winnerId === teamB?.id ? 'bg-emerald-50/50 ring-1 ring-emerald-100' : ''
                    }`}>
                      <div className="relative">
                        <p className={`text-xs font-black uppercase text-center mb-1 ${
                          isCompleted && winnerId === teamB?.id ? 'text-emerald-700' : 'text-slate-800'
                        }`}>
                          {teamB?.name}
                        </p>
                        {isCompleted && winnerId === teamB?.id && (
                          <Medal className="w-3 h-3 text-amber-500 absolute -right-4 -top-1" />
                        )}
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        ELO {teamB?.players.reduce((sum, pid) => sum + (players.find(p => p.id === pid)?.elo || 0), 0)}
                      </p>
                      
                      {isCompleted ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-4xl font-black leading-none ${
                            winnerId === teamB?.id ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            {match.setsB}
                          </span>
                          <span className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">Sets</span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
                          <Hash className="w-5 h-5 text-slate-300" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Placar dos Sets Centralizado */}
                  {isCompleted && match.setScores && match.setScores.length > 0 && (
                    <div className="flex justify-center gap-3 mb-6 px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                      {match.setScores.map((s, i) => (
                        <div key={i} className="flex flex-col items-center">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">Set {i + 1}</span>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <span className={`text-xs font-black ${s.scoreA > s.scoreB ? 'text-indigo-600' : 'text-slate-500'}`}>{s.scoreA}</span>
                            <span className="text-[10px] font-bold text-slate-300">×</span>
                            <span className={`text-xs font-black ${s.scoreB > s.scoreA ? 'text-indigo-600' : 'text-slate-500'}`}>{s.scoreB}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Lista de Jogadores Expansível */}
                  <div className="pt-4 border-t border-slate-50">
                    <button 
                      onClick={() => toggleMatchExpansion(match.id)}
                      className="w-full flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors py-2"
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
                          <div className="grid grid-cols-2 gap-8 mt-4 p-4 bg-slate-50 rounded-2xl">
                            <div className="space-y-2">
                              {teamA?.players.map(pid => {
                                const player = players.find(p => p.id === pid);
                                return (
                                  <div key={pid} className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${player?.isOfficialSetter ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                    <span className={`text-[10px] font-bold truncate ${player?.isOfficialSetter ? 'text-indigo-600' : 'text-slate-600'}`}>
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
                                    <span className={`text-[10px] font-bold truncate ${player?.isOfficialSetter ? 'text-indigo-600' : 'text-slate-600'}`}>
                                      {player?.name}
                                    </span>
                                    <div className={`w-1.5 h-1.5 rounded-full ${player?.isOfficialSetter ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {match.status === 'pending' && userRole === 'ADMIN' && (
                    <button
                      onClick={() => {
                        setRecordingMatch(match);
                        const initialScores = Array.from({ length: activeTournament.config.setsPerMatch }, () => ({ scoreA: 0, scoreB: 0 }));
                        setCurrentSetScores(initialScores);
                      }}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 sm:p-12 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                  {recordingMatch.status === 'completed' ? 'Editar Resultado' : 'Lançar Resultado'}
                </h3>
                <button onClick={() => setRecordingMatch(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2">
                {currentSetScores.map((set, setIdx) => (
                  <div key={setIdx} className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Set {setIdx + 1}</span>
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
                          className="w-full bg-white border-2 border-slate-100 focus:border-indigo-500 rounded-xl py-3 px-4 font-black text-xl text-slate-900 transition-all outline-none"
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
                          className="w-full bg-white border-2 border-slate-100 focus:border-indigo-500 rounded-xl py-3 px-4 font-black text-xl text-slate-900 transition-all outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-[10px] font-bold text-indigo-700 text-center uppercase tracking-widest">
                    Partida de {activeTournament.config.setsPerMatch} {activeTournament.config.setsPerMatch === 1 ? 'Set' : 'Sets'}
                  </p>
                </div>

                <button
                  onClick={handleRecord}
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl p-8 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-8 shrink-0">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Gerenciar Times</h3>
                <button 
                  onClick={() => {
                    setIsManagingTeams(false);
                    setManagingTeamId(null);
                    setSubstitutingPlayerId(null);
                  }} 
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto pr-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTournament.teams.map(team => (
                    <div key={team.id} className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">{team.name}</h4>
                        <button 
                          onClick={() => setManagingTeamId(managingTeamId === team.id ? null : team.id)}
                          className="p-2 bg-white rounded-xl shadow-sm hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {team.players.map(pid => {
                          const player = players.find(p => p.id === pid);
                          return (
                            <div key={pid} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                              <span className="text-xs font-bold text-slate-700 truncate">{player?.name || 'Desconhecido'}</span>
                              <button 
                                onClick={() => {
                                  setManagingTeamId(team.id);
                                  setSubstitutingPlayerId(pid);
                                }}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
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
                  <div className="bg-indigo-50 rounded-3xl p-8 border border-indigo-100 space-y-6 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest">
                        {substitutingPlayerId ? 'Substituir por:' : `Adicionar ao ${activeTournament.teams.find(t => t.id === managingTeamId)?.name}:`}
                      </h4>
                      <button onClick={() => { setManagingTeamId(null); setSubstitutingPlayerId(null); }} className="text-indigo-400 hover:text-indigo-600">
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
                              className={`bg-white p-4 rounded-2xl border text-center hover:shadow-md transition-all group relative ${
                                isReserve ? 'border-amber-200 hover:border-amber-400' : 'border-indigo-100 hover:border-indigo-400'
                              }`}
                            >
                              {isReserve && (
                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-[6px] text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                                  Reserva
                                </span>
                              )}
                              <p className={`text-xs font-black uppercase truncate ${isReserve ? 'text-amber-700 group-hover:text-amber-900' : 'text-slate-800 group-hover:text-indigo-600'}`}>{player.name}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">ELO {player.elo}</p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm font-bold text-indigo-400 italic">Nenhum jogador disponível na lista de presença.</p>
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
