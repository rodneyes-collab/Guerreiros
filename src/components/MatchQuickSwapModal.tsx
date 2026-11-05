import React, { useState, useMemo } from 'react';
import { 
  X, 
  ArrowLeftRight, 
  Coffee, 
  LogOut, 
  CheckCircle2, 
  AlertTriangle,
  UserCheck,
  Shield,
  Clock,
  Sparkles,
  Star
} from 'lucide-react';
import { Player, GenerationResult, Team } from '../../types';
import { isFemalePlayer, calculateTeamTotalIC, calculateCompositePerformanceRating } from '../../utils/teamLogic';
import { useMatchSwaps } from '../hooks/useMatchSwaps';

interface MatchQuickSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  generationResult: GenerationResult | null;
  onUpdateResult?: (updatedResult: GenerationResult) => void;
}

export const MatchQuickSwapModal: React.FC<MatchQuickSwapModalProps> = ({
  isOpen,
  onClose,
  generationResult,
  onUpdateResult
}) => {
  const { performTeamSwap, performBenchSubstitution } = useMatchSwaps();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedReplacementId, setSelectedReplacementId] = useState<string | null>(null);
  const [targetOpponentId, setTargetOpponentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'BENCH' | 'TEAM_SWAP'>('BENCH');
  const [isProcessing, setIsProcessing] = useState(false);

  // Pool de jogadores em quadra
  const teamAPlayers = useMemo(() => {
    if (!generationResult) return [];
    return [generationResult.teamA.setter, ...(generationResult.teamA.players || [])].filter(Boolean) as Player[];
  }, [generationResult]);

  const teamBPlayers = useMemo(() => {
    if (!generationResult) return [];
    return [generationResult.teamB.setter, ...(generationResult.teamB.players || [])].filter(Boolean) as Player[];
  }, [generationResult]);

  const benchPlayers = useMemo(() => {
    return generationResult?.remainingPlayers || [];
  }, [generationResult]);

  // Jogador atualmente selecionado
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return [...teamAPlayers, ...teamBPlayers].find(p => p.id === selectedPlayerId) || null;
  }, [selectedPlayerId, teamAPlayers, teamBPlayers]);

  const selectedTeam = useMemo<'A' | 'B' | null>(() => {
    if (!selectedPlayerId) return null;
    if (teamAPlayers.some(p => p.id === selectedPlayerId)) return 'A';
    if (teamBPlayers.some(p => p.id === selectedPlayerId)) return 'B';
    return null;
  }, [selectedPlayerId, teamAPlayers, teamBPlayers]);

  // Todos os reservas elegíveis da fila de espera (mesmo gênero)
  const allEligibleBenchReserves = useMemo(() => {
    if (!selectedPlayer || benchPlayers.length === 0) return [];
    const isFemale = isFemalePlayer(selectedPlayer);
    return benchPlayers.filter(r => isFemalePlayer(r) === isFemale);
  }, [selectedPlayer, benchPlayers]);

  // Substituto sugerido da fila de espera (mesmo gênero)
  const suggestedBenchReplacement = useMemo(() => {
    if (!selectedPlayer || benchPlayers.length === 0) return null;
    if (selectedReplacementId) {
      const custom = benchPlayers.find(r => r.id === selectedReplacementId);
      if (custom) return custom;
    }
    const isFemale = isFemalePlayer(selectedPlayer);
    const isSetter = selectedPlayer.isOfficialSetter;

    // Busca primeiro reserva do mesmo gênero (e mesma função se for levantador)
    const exactMatch = benchPlayers.find(r => isFemalePlayer(r) === isFemale && (isSetter ? r.isOfficialSetter : true));
    if (exactMatch) return exactMatch;

    // Fallback para mesma linha se levantador não tiver reserva direto
    return benchPlayers.find(r => isFemalePlayer(r) === isFemale) || null;
  }, [selectedPlayer, benchPlayers, selectedReplacementId]);

  // Oponentes elegíveis para troca direta entre equipes (mesmo gênero)
  const eligibleOpponents = useMemo(() => {
    if (!selectedPlayer || !selectedTeam) return [];
    const opponents = selectedTeam === 'A' ? teamBPlayers : teamAPlayers;
    const isFemale = isFemalePlayer(selectedPlayer);
    return opponents.filter(p => isFemalePlayer(p) === isFemale);
  }, [selectedPlayer, selectedTeam, teamAPlayers, teamBPlayers]);

  // Distância técnica multidimensional (habilidades práticas + IC)
  const getTechnicalDistance = (p1: Player, p2: Player): number => {
    const ic1 = calculateCompositePerformanceRating(p1);
    const ic2 = calculateCompositePerformanceRating(p2);
    const s1 = p1.skills || { attacking: 2, defense: 2, setting: 2, serving: 2 };
    const s2 = p2.skills || { attacking: 2, defense: 2, setting: 2, serving: 2 };
    const attDiff = (s1.attacking || 2) - (s2.attacking || 2);
    const defDiff = (s1.defense || 2) - (s2.defense || 2);
    const setDiff = (s1.setting || 2) - (s2.setting || 2);
    const serDiff = (s1.serving || 2) - (s2.serving || 2);
    const skillsEuclidean = Math.sqrt(attDiff * attDiff + defDiff * defDiff + setDiff * setDiff + serDiff * serDiff);
    const icDiff = Math.abs(ic1 - ic2);
    return (icDiff * 0.7) + (skillsEuclidean * 0.3);
  };

  // Identifica oponente do outro time com as características técnicas mais próximas
  const closestOpponentId = useMemo(() => {
    if (!selectedPlayer || eligibleOpponents.length === 0) return null;
    let minDistance = Infinity;
    let bestId: string | null = null;
    for (const opp of eligibleOpponents) {
      const dist = getTechnicalDistance(selectedPlayer, opp);
      if (dist < minDistance) {
        minDistance = dist;
        bestId = opp.id;
      }
    }
    return bestId;
  }, [selectedPlayer, eligibleOpponents]);

  // Cálculo de simulação de Delta IC ao trocar com oponente selecionado
  const swapSimulation = useMemo(() => {
    if (!selectedPlayer || !targetOpponentId || !generationResult || !selectedTeam) return null;
    const currentA_IC = generationResult.teamA.totalIC ?? calculateTeamTotalIC(generationResult.teamA);
    const currentB_IC = generationResult.teamB.totalIC ?? calculateTeamTotalIC(generationResult.teamB);
    const currentDelta = Math.abs(currentA_IC - currentB_IC);

    const targetOpponent = eligibleOpponents.find(p => p.id === targetOpponentId);
    if (!targetOpponent) return null;

    // Simula troca
    const simulateTeam = (team: Team, removeId: string, addPlayer: Player): Team => {
      let setter = team.setter;
      if (team.setter?.id === removeId) setter = addPlayer;
      const players = (team.players || []).map(p => p.id === removeId ? addPlayer : p);
      return { ...team, setter, players };
    };

    const simA = selectedTeam === 'A' 
      ? simulateTeam(generationResult.teamA, selectedPlayer.id, targetOpponent)
      : simulateTeam(generationResult.teamA, targetOpponent.id, selectedPlayer);

    const simB = selectedTeam === 'B' 
      ? simulateTeam(generationResult.teamB, selectedPlayer.id, targetOpponent)
      : simulateTeam(generationResult.teamB, targetOpponent.id, selectedPlayer);

    const newA_IC = calculateTeamTotalIC(simA);
    const newB_IC = calculateTeamTotalIC(simB);
    const newDelta = Math.abs(newA_IC - newB_IC);

    return {
      currentDelta,
      newDelta,
      difference: newDelta - currentDelta,
      targetOpponent
    };
  }, [selectedPlayer, targetOpponentId, generationResult, selectedTeam, eligibleOpponents]);

  if (!isOpen || !generationResult) return null;

  const handleExecuteBenchSubstitution = async (reason: 'FATIGUE' | 'LEFT_CLUB') => {
    if (!selectedPlayerId) return;
    setIsProcessing(true);
    try {
      const res = await performBenchSubstitution(
        selectedPlayerId, 
        reason, 
        generationResult,
        selectedReplacementId || undefined
      );
      if (res.success && res.updatedResult) {
        if (onUpdateResult) {
          onUpdateResult(res.updatedResult);
        }
        setSelectedPlayerId(null);
        setSelectedReplacementId(null);
        onClose();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteTeamSwap = async () => {
    if (!selectedPlayerId || !targetOpponentId || !selectedTeam) return;
    const idA = selectedTeam === 'A' ? selectedPlayerId : targetOpponentId;
    const idB = selectedTeam === 'B' ? selectedPlayerId : targetOpponentId;
    setIsProcessing(true);
    try {
      const res = await performTeamSwap(idA, idB, generationResult);
      if (res.success && res.updatedResult) {
        if (onUpdateResult) {
          onUpdateResult(res.updatedResult);
        }
        setSelectedPlayerId(null);
        setTargetOpponentId(null);
        onClose();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Central de Substituições & Trocas
              </h3>
              <p className="text-xs text-slate-400">
                Gerencie saídas de quadra, reservas e balanceamento manual
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">

          {/* PASSO 1: Selecionar o jogador em quadra */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 inline-flex items-center justify-center text-[11px] font-bold">1</span>
              Selecione o titular que vai sair ou trocar de time:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Coluna Time A */}
              <div className="bg-slate-950/40 border border-emerald-500/20 rounded-xl p-3">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Time A ({teamAPlayers.length})</span>
                  <span className="text-[10px] text-slate-400">IC: {generationResult.teamA.totalIC?.toFixed(1) ?? '--'}</span>
                </div>
                <div className="space-y-1.5">
                  {teamAPlayers.map(player => {
                    const isSelected = selectedPlayerId === player.id;
                    const isFem = isFemalePlayer(player);
                    const isSetter = generationResult.teamA.setter?.id === player.id || player.isOfficialSetter;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlayerId(player.id);
                          setTargetOpponentId(null);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400'
                            : 'bg-slate-800/60 hover:bg-slate-800 text-slate-200 border border-slate-700/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {isFem ? 'F' : 'M'}
                          </span>
                          <span className="truncate text-xs sm:text-sm">{player.name}</span>
                          {isSetter && (
                            <span className={`text-[10px] px-1 rounded font-bold ${
                              isSelected ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                              Lev
                            </span>
                          )}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0 text-slate-950" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Coluna Time B */}
              <div className="bg-slate-950/40 border border-sky-500/20 rounded-xl p-3">
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Time B ({teamBPlayers.length})</span>
                  <span className="text-[10px] text-slate-400">IC: {generationResult.teamB.totalIC?.toFixed(1) ?? '--'}</span>
                </div>
                <div className="space-y-1.5">
                  {teamBPlayers.map(player => {
                    const isSelected = selectedPlayerId === player.id;
                    const isFem = isFemalePlayer(player);
                    const isSetter = generationResult.teamB.setter?.id === player.id || player.isOfficialSetter;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlayerId(player.id);
                          setTargetOpponentId(null);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400'
                            : 'bg-slate-800/60 hover:bg-slate-800 text-slate-200 border border-slate-700/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {isFem ? 'F' : 'M'}
                          </span>
                          <span className="truncate text-xs sm:text-sm">{player.name}</span>
                          {isSetter && (
                            <span className={`text-[10px] px-1 rounded font-bold ${
                              isSelected ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                              Lev
                            </span>
                          )}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0 text-slate-950" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* PASSO 2: Ação a Executar */}
          {selectedPlayer ? (
            <div className="border border-slate-800 rounded-xl bg-slate-950/70 p-4 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 inline-flex items-center justify-center text-[11px] font-bold">2</span>
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Ação para: <span className="text-amber-400 font-bold">{selectedPlayer.name}</span> (Time {selectedTeam})
                  </span>
                </div>

                {/* Abas de Operação */}
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('BENCH')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      activeTab === 'BENCH'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Entrada do Banco
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('TEAM_SWAP')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      activeTab === 'TEAM_SWAP'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Trocar de Time (A ⇄ B)
                  </button>
                </div>
              </div>

              {/* ABA 1: SUBSTITUIÇÃO PELO BANCO */}
              {activeTab === 'BENCH' && (
                <div className="space-y-4">
                  {suggestedBenchReplacement ? (
                    <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          Próximo Reserva Elegível da Fila:
                        </div>
                        <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                          <span className="truncate">{suggestedBenchReplacement.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            {isFemalePlayer(suggestedBenchReplacement) ? 'F' : 'M'}
                          </span>
                          {suggestedBenchReplacement.isOfficialSetter && (
                            <span className="text-[10px] px-1 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Lev
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Chegada #{suggestedBenchReplacement.arrivalOrder || '--'} • Respeita paridade de gênero e ordem de espera
                        </p>
                      </div>

                      <div className="shrink-0 w-full sm:w-auto text-right">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleExecuteBenchSubstitution('FATIGUE')}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
                          title="Clique para realizar a substituição imediata mantendo o atleta na rodada"
                        >
                          <UserCheck className="w-4 h-4 stroke-[2.5]" />
                          <span>Pronto para Entrar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        Não há reservas do gênero <strong>{isFemalePlayer(selectedPlayer) ? 'Feminino' : 'Masculino'}</strong> na fila de espera para substituir este atleta mantendo a paridade de quadra.
                      </span>
                    </div>
                  )}

                  {/* Seleção alternativa se houver outros reservas do mesmo gênero */}
                  {allEligibleBenchReserves.length > 1 && (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 block mb-2">
                        Outros reservas disponíveis do mesmo gênero ({isFemalePlayer(selectedPlayer) ? 'Feminino' : 'Masculino'}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {allEligibleBenchReserves.map(r => {
                          const isChosen = (suggestedBenchReplacement?.id === r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedReplacementId(r.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                isChosen
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 ring-1 ring-emerald-500/50'
                                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                              }`}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Botões dos 2 Motivos de Saída */}
                  {suggestedBenchReplacement && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-slate-400 font-medium">
                        Ou selecione expressamente o motivo da saída de <strong className="text-white">{selectedPlayer.name}</strong>:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {/* Motivo 1: Cansaço / Descanso */}
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleExecuteBenchSubstitution('FATIGUE')}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-[0.99] border border-emerald-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer shadow-md"
                        >
                          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                            <Coffee className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                              Cansaço / Descanso
                            </div>
                            <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                              Vai para o banco e volta a jogar nas próximas partidas da rodada.
                            </p>
                          </div>
                        </button>

                        {/* Motivo 2: Foi Embora / Saída Definitiva */}
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleExecuteBenchSubstitution('LEFT_CLUB')}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-[0.99] border border-rose-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer shadow-md"
                        >
                          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 group-hover:scale-105 transition-transform shrink-0">
                            <LogOut className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs sm:text-sm font-black text-rose-300 flex items-center gap-1.5">
                              Foi Embora / Saída
                            </div>
                            <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                              Remove da lista de presença de hoje e não joga mais na data.
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: TROCA MANUAL ENTRE EQUIPES (A ⇄ B) */}
              {activeTab === 'TEAM_SWAP' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <p className="text-slate-400">
                      Selecione com quem do <strong>Time {selectedTeam === 'A' ? 'B' : 'A'}</strong> o atleta <strong className="text-white">{selectedPlayer.name}</strong> vai inverter de equipe:
                    </p>
                    {closestOpponentId && (
                      <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 shrink-0">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        Destaque em dourado = Perfil mais próximo
                      </span>
                    )}
                  </div>

                  {eligibleOpponents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {eligibleOpponents.map(opp => {
                        const isSelectedOpp = targetOpponentId === opp.id;
                        const isClosest = opp.id === closestOpponentId;
                        const isSetterOpp = opp.isOfficialSetter || (selectedTeam === 'A' ? generationResult.teamB.setter?.id === opp.id : generationResult.teamA.setter?.id === opp.id);
                        const oppIC = calculateCompositePerformanceRating(opp);
                        const selectedIC = calculateCompositePerformanceRating(selectedPlayer);
                        const icDiff = Math.abs(oppIC - selectedIC).toFixed(1);

                        return (
                          <button
                            key={opp.id}
                            type="button"
                            onClick={() => setTargetOpponentId(opp.id)}
                            className={`p-3 rounded-xl text-left border transition-all flex items-center justify-between cursor-pointer ${
                              isSelectedOpp
                                ? isClosest 
                                  ? 'bg-amber-500/30 border-amber-300 ring-2 ring-amber-400 text-white shadow-lg'
                                  : 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/50 text-white shadow-md'
                                : isClosest
                                  ? 'bg-amber-500/15 border-amber-400/80 shadow-[0_0_12px_rgba(245,196,41,0.2)] text-white hover:bg-amber-500/25 ring-1 ring-amber-400/40'
                                  : 'bg-slate-900 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-xs sm:text-sm ${isClosest ? 'text-amber-300 font-black' : 'font-bold'}`}>
                                  {opp.name}
                                </span>
                                {isClosest && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-amber-400 text-black shadow-sm flex items-center gap-0.5">
                                    <Star className="w-2.5 h-2.5 fill-black" /> Sugestão Ideal
                                  </span>
                                )}
                                {isSetterOpp && (
                                  <span className="text-[10px] px-1 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    Lev
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span>Time {selectedTeam === 'A' ? 'B' : 'A'}</span>
                                <span>•</span>
                                <span className={isClosest ? 'text-amber-200/90 font-bold' : ''}>
                                  IC {oppIC.toFixed(1)} (Δ {icDiff} pts)
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {isSelectedOpp ? (
                                <CheckCircle2 className={`w-5 h-5 ${isClosest ? 'text-amber-400' : 'text-sky-400'}`} />
                              ) : isClosest ? (
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,196,41,0.8)]" />
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        Nenhum atleta do gênero correspondente no Time {selectedTeam === 'A' ? 'B' : 'A'} para manter a paridade.
                      </span>
                    </div>
                  )}

                  {/* Prévia do Impacto de Equilíbrio (Delta IC) */}
                  {swapSimulation && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Diferença Técnica (Delta IC):</span>
                        <div className="font-bold flex items-center gap-1.5 mt-0.5">
                          <span className="text-slate-300">{swapSimulation.currentDelta.toFixed(1)}</span>
                          <span className="text-slate-500">→</span>
                          <span className={swapSimulation.newDelta <= swapSimulation.currentDelta ? 'text-emerald-400' : 'text-amber-400'}>
                            {swapSimulation.newDelta.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({swapSimulation.newDelta <= swapSimulation.currentDelta ? 'Mais Equilibrado' : 'Leve Variação'})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleExecuteTeamSwap}
                        className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Confirmar Troca de Time
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
              Toque em qualquer jogador do Time A ou Time B acima para ver as opções de substituição e troca.
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Regras estatutárias ativas: paridade estrita de gênero e ordem de chegada protegida</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
