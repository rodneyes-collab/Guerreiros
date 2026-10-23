import React, { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { generateTeams, optimizeTeamSynergyIteratively, calculateCompositePerformanceRating, calculatePracticalSkillsSum, verifyClubGenerationRules } from '../../utils/teamLogic';
import { Sliders, CheckCircle2, RefreshCw, Zap, Clock, ArrowRight, Play, BarChart3, History, AlertTriangle, Check } from 'lucide-react';

interface TeamBalancingSimulatorCardProps {
  onApplyToMatch?: (result: any) => void;
}

export const TeamBalancingSimulatorCard: React.FC<TeamBalancingSimulatorCardProps> = ({ onApplyToMatch }) => {
  const {
 players, attendance, matches, balancingStrategy, setBalancingStrategy, balancingRatingMode, setBalancingRatingMode, teamGenerationMode, setTeamGenerationMode, generationResult: currentMatch, setGenerationResult, setViewMode, showNotification } = useStore(useShallow(state => ({
      players: state.players,
      attendance: state.attendance,
      matches: state.matches,
      balancingStrategy: state.balancingStrategy,
      setBalancingStrategy: state.setBalancingStrategy,
      balancingRatingMode: state.balancingRatingMode,
      setBalancingRatingMode: state.setBalancingRatingMode,
      teamGenerationMode: state.teamGenerationMode,
      setTeamGenerationMode: state.setTeamGenerationMode,
      generationResult: state.generationResult,
      setGenerationResult: state.setGenerationResult,
      setViewMode: state.setViewMode,
      showNotification: state.showNotification
    })));

  const [simStrategy, setSimStrategy] = useState<'BOTTOM_TWO' | 'SYNERGY' | 'BOTH'>(balancingStrategy || 'BOTH');
  const [simRatingMode, setSimRatingMode] = useState<'IC_ONLY' | 'HYBRID'>(balancingRatingMode || 'IC_ONLY');
  const [simTrueSkill, setSimTrueSkill] = useState<boolean>(teamGenerationMode === 'TRUESKILL');
  const [includeCurrentMatch, setIncludeCurrentMatch] = useState<boolean>(true);
  const [showMatchHistory, setShowMatchHistory] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [bestCombination, setBestCombination] = useState<{
    strategy: 'BOTTOM_TWO' | 'SYNERGY' | 'BOTH';
    ratingMode: 'IC_ONLY' | 'HYBRID';
    trueSkill: boolean;
  } | null>(null);

  // Pool de jogadores para simulação
  const availablePool = useMemo(() => {
    const present = (attendance || []).filter(p => (!p.status || p.status === 'active') && !p.isDM);
    if (present.length >= 12) {
      return present.map(p => {
        const full = players.find(fp => fp.id === p.id) || {};
        return { ...p, ...full };
      });
    }
    return players.filter(p => (!p.status || p.status === 'active' || p.status === 'guest') && !p.isDM);
  }, [attendance, players]);

  const runSimulation = (strategy: any, ratingMode: any, trueSkill: boolean) => {
    let poolToUse = availablePool;
    let matchHistToUse = matches || [];
    
    // ... logic from handleRunSimulation to prepare poolToUse ...
    if (includeCurrentMatch && currentMatch) {
      const teamAIds = [currentMatch.teamA.setter?.id, ...currentMatch.teamA.players.map((p: any) => p.id)].filter(Boolean);
      const teamBIds = [currentMatch.teamB.setter?.id, ...currentMatch.teamB.players.map((p: any) => p.id)].filter(Boolean);
      const currentMatchPlayers = [...teamAIds, ...teamBIds];
      poolToUse = availablePool.map((p: any) => ({
        ...p,
        playedLastMatch: currentMatchPlayers.includes(p.id),
        dailyMatches: currentMatchPlayers.includes(p.id) ? (p.dailyMatches || 0) + 1 : (p.dailyMatches || 0),
        consecutiveBenched: currentMatchPlayers.includes(p.id) ? 0 : (p.consecutiveBenched || 0) + 1
      }));
    }
    
    const prevForms = (matches || []).slice(0, 5).map(m => ({
      setterA: m.teamA[0],
      playersA: m.teamA.slice(1),
      setterB: m.teamB[0],
      playersB: m.teamB.slice(1)
    }));

    if (includeCurrentMatch && currentMatch) {
      prevForms.unshift({
         setterA: currentMatch.teamA.setter?.id,
         playersA: currentMatch.teamA.players.map((p: any) => p.id),
         setterB: currentMatch.teamB.setter?.id,
         playersB: currentMatch.teamB.players.map((p: any) => p.id)
      } as any);
    }

    const allMatchHistory = matchHistToUse.map(m => ({
      teamA: m.teamA,
      teamB: m.teamB,
      winner: m.winner as 'A' | 'B',
      timestamp: m.timestamp
    }));

    let result = generateTeams(poolToUse as any, prevForms, trueSkill, false, allMatchHistory, strategy, ratingMode);
    result = optimizeTeamSynergyIteratively(result, allMatchHistory, trueSkill, strategy, ratingMode);
    return result;
  };

  const handleRunBestSimulation = () => {
    if (availablePool.length < 12) {
      showNotification('São necessários pelo menos 12 sócios!', 'error');
      return;
    }

    setIsSimulating(true);
    setTimeout(() => {
      let minDelta = Infinity;
      let bestRes = null;
      let bestCombo = null;

      const strategies = ['BOTH', 'BOTTOM_TWO', 'SYNERGY'] as const;
      const modes = ['IC_ONLY', 'HYBRID'] as const;
      const trueSkillOpts = [true, false];

      for (const strat of strategies) {
        for (const mode of modes) {
          for (const ts of trueSkillOpts) {
            const res = runSimulation(strat, mode, ts);
            const delta = Math.abs(calculateTeamStats(res.teamA).totalIC - calculateTeamStats(res.teamB).totalIC);
            if (delta < minDelta) {
              minDelta = delta;
              bestRes = res;
              bestCombo = { strategy: strat, ratingMode: mode, trueSkill: ts };
            }
          }
        }
      }

      setSimulationResult(bestRes);
      setBestCombination(bestCombo);
      setSimStrategy(bestCombo!.strategy);
      setSimRatingMode(bestCombo!.ratingMode);
      setSimTrueSkill(bestCombo!.trueSkill);
      setIsSimulating(false);
      showNotification('Melhor balanceamento encontrado!', 'success');
    }, 100);
  };


  const getPlayerName = (p: any) => {
    if (!p) return 'Sócio';
    if (typeof p === 'string') {
      const found = players.find(x => x.id === p) || availablePool.find((x: any) => x.id === p);
      return found?.name || 'Sócio';
    }
    return p.name || 'Sócio';
  };

  const getPlayerIC = (p: any) => {
    if (!p) return 0;
    if (typeof p === 'string') {
      const found = players.find(x => x.id === p) || availablePool.find((x: any) => x.id === p);
      if (!found) return 0;
      return Math.round(calculateCompositePerformanceRating(found as any));
    }
    return Math.round(calculateCompositePerformanceRating(p as any));
  };

  const getDepartureBadge = (p: any) => {
    const playerObj = typeof p === 'string' ? (players.find(x => x.id === p) || availablePool.find((x: any) => x.id === p)) : p;
    if (playerObj?.departureTime) {
      return (
        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[8px] font-black uppercase" title={`Saída antecipada agendada para ${playerObj.departureTime}`}>
          <Clock className="w-2.5 h-2.5" /> Out: {playerObj.departureTime}
        </span>
      );
    }
    return null;
  };

  const getActiveStatusBadge = (p: any) => {
    if (!currentMatch) return null;
    const pId = typeof p === 'string' ? p : p.id;
    const teamAIds = [currentMatch.teamA?.setter?.id, ...(currentMatch.teamA?.players || []).map((x: any) => x.id)].filter(Boolean);
    const teamBIds = [currentMatch.teamB?.setter?.id, ...(currentMatch.teamB?.players || []).map((x: any) => x.id)].filter(Boolean);
    const isPlaying = teamAIds.includes(pId) || teamBIds.includes(pId);
    
    if (isPlaying) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[9px] font-black uppercase tracking-wider" title="Em quadra (Jogando)">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
          </span>
          Jogando
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-wider" title="Na fila de espera (Reserva)">
        <Clock className="w-3 h-3" />
        Reserva
      </div>
    );
  };

  const getPlayerLedStatus = (playerId: string) => {
    if (!simulationResult) return { icColor: 'bg-white/20', icTitle: 'N/A', techTier: null };
    
    const teamA = [simulationResult.teamA.setter, ...simulationResult.teamA.players].filter(Boolean);
    const teamB = [simulationResult.teamB.setter, ...simulationResult.teamB.players].filter(Boolean);
    const allOnCourt = [...teamA, ...teamB].map(p => {
      if (typeof p === 'string') {
        return players.find(x => x.id === p) || availablePool.find((x: any) => x.id === p);
      }
      return p;
    }).filter(Boolean);

    const player = allOnCourt.find(p => (typeof p === 'string' ? p : p.id) === playerId);
    if (!player) return { icColor: 'bg-white/20', icTitle: 'N/A', techTier: null };

    // 1. IC Solid Color
    const ic = calculateCompositePerformanceRating(player as any);
    const sortedByIc = [...allOnCourt].sort((a, b) => calculateCompositePerformanceRating(b as any) - calculateCompositePerformanceRating(a as any));
    const icRankIndex = sortedByIc.findIndex(p => (typeof p === 'string' ? p : p.id) === playerId);
    const totalOnCourt = sortedByIc.length;

    let icColor = 'bg-yellow-400';
    let icTitle = `IC Médio (Rank #${icRankIndex + 1} | IC ${ic.toFixed(1)})`;

    if (icRankIndex <= 1 || ic >= 55) {
      icColor = 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
      icTitle = `Nível 1 (Verde) - Top IC (Rank #${icRankIndex + 1} | IC ${ic.toFixed(1)})`;
    } else if (icRankIndex <= Math.floor(totalOnCourt * 0.35) || ic >= 42) {
      icColor = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]';
      icTitle = `Nível 2 (Azul) - Alto IC (Rank #${icRankIndex + 1} | IC ${ic.toFixed(1)})`;
    } else if (icRankIndex >= totalOnCourt - 2 || ic < 18) {
      icColor = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
      icTitle = `Nível 5 (Vermelho) - Bottom 2 IC (Rank #${icRankIndex + 1} | IC ${ic.toFixed(1)})`;
    } else if (icRankIndex >= totalOnCourt - 4 || ic < 30) {
      icColor = 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]';
      icTitle = `Nível 4 (Laranja) - IC Baixo (Rank #${icRankIndex + 1} | IC ${ic.toFixed(1)})`;
    } else {
      icColor = 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]';
    }

    // 2. Tech Tier Badge
    let techTier: { label: string, colorClass: string, title: string } | null = null;
    
    if (simulationResult.topTwoIds && simulationResult.topTwoIds.includes(playerId)) {
      techTier = { label: 'TOP 2', colorClass: 'bg-green-500/20 text-green-300 border-green-500/40', title: 'Top 2 Técnico (Maior soma de Habilidades Práticas)' };
    } else if (simulationResult.techTierIds?.top4Ids && simulationResult.techTierIds.top4Ids.includes(playerId)) {
      techTier = { label: 'TOP 4', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', title: 'Top 4 Técnico (Habilidades Práticas)' };
    } else if (simulationResult.bottomTwoIds && simulationResult.bottomTwoIds.includes(playerId)) {
      techTier = { label: 'BOT 2', colorClass: 'bg-red-500/20 text-red-300 border-red-500/40', title: 'Bottom 2 Técnico (Menor soma de Habilidades Práticas)' };
    } else if (simulationResult.techTierIds?.bottom4Ids && simulationResult.techTierIds.bottom4Ids.includes(playerId)) {
      techTier = { label: 'BOT 4', colorClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40', title: 'Bottom 4 Técnico (Habilidades Práticas)' };
    }

    if (!techTier) {
      const skillsSum = calculatePracticalSkillsSum(player as any);
      const sortedBySkills = [...allOnCourt].sort((a, b) => {
        const sumDiff = calculatePracticalSkillsSum(b as any) - calculatePracticalSkillsSum(a as any);
        if (sumDiff !== 0) return sumDiff;
        const icDiff = calculateCompositePerformanceRating(b as any) - calculateCompositePerformanceRating(a as any);
        if (icDiff !== 0) return icDiff;
        return ((b as any).elo || 0) - ((a as any).elo || 0);
      });
      const skillRank = sortedBySkills.findIndex(p => (typeof p === 'string' ? p : p.id) === playerId);
      
      if (skillRank <= 1) {
         techTier = { label: 'TOP 2', colorClass: 'bg-green-500/20 text-green-300 border-green-500/40', title: `Top 2 Técnico (Soma Hab: ${skillsSum})` };
      } else if (skillRank <= 3) {
         techTier = { label: 'TOP 4', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', title: `Top 4 Técnico (Soma Hab: ${skillsSum})` };
      } else if (skillRank >= totalOnCourt - 2) {
         techTier = { label: 'BOT 2', colorClass: 'bg-red-500/20 text-red-300 border-red-500/40', title: `Bottom 2 Técnico (Soma Hab: ${skillsSum})` };
      } else if (skillRank >= totalOnCourt - 4) {
         techTier = { label: 'BOT 4', colorClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40', title: `Bottom 4 Técnico (Soma Hab: ${skillsSum})` };
      }
    }

    return { icColor, icTitle, techTier };
  };

  const handleApplyToMatch = () => {
    if (!simulationResult) return;
    setBalancingStrategy(simStrategy);
    setBalancingRatingMode(simRatingMode);
    setTeamGenerationMode(simTrueSkill ? 'TRUESKILL' : 'PURE_SKILLS');
    setGenerationResult(simulationResult);
    setViewMode('generation');
    if (onApplyToMatch) {
      onApplyToMatch(simulationResult);
    }
    showNotification('Escalação simulada aplicada com sucesso ao jogo em andamento!', 'success');
  };

  const calculateTeamStats = (team?: { setter: any; players: any[] }) => {
    if (!team) return { totalIC: 0, avgIC: 0 };
    const allPlayers = [team.setter, ...(team.players || [])].filter(Boolean);
    if (allPlayers.length === 0) return { totalIC: 0, avgIC: 0 };
    const ics = allPlayers.map(p => getPlayerIC(p));
    const totalIC = Math.round(ics.reduce((acc, val) => acc + val, 0));
    return {
      totalIC,
      avgIC: Math.round(totalIC / allPlayers.length)
    };
  };

  return (
    <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/20 shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40 text-brand-primary">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-white">Simulador Próxima Partida</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Teste diferentes algoritmos e estratégias na lista atual antes de confirmar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMatchHistory(!showMatchHistory)}
            className={`px-3 py-1 flex items-center gap-1.5 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              showMatchHistory 
                ? 'bg-brand-primary text-black border-brand-primary' 
                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            <History className="w-3 h-3" />
            Histórico
          </button>
          <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-xl text-[10px] font-black uppercase tracking-wider">
            Pool: {availablePool.length} sócios disponíveis
          </span>
        </div>
      </div>

      {showMatchHistory && (
        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 md:p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary flex items-center gap-2">
              <History className="w-4 h-4" /> 
              Histórico de Partidas
            </h4>
            {(!matches || matches.length === 0) ? (
              <p className="text-xs text-white/40 italic">Nenhuma partida finalizada até o momento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.map((m: any, idx: number) => (
                  <div key={m.id || idx} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Partida #{matches.length - idx}</span>
                      <span className="text-xs font-black uppercase tracking-widest text-brand-primary">
                        {m.scoreA} x {m.scoreB}
                      </span>
                    </div>
                    <div className="flex gap-2 text-[10px] font-bold">
                      <div className={`flex-1 flex flex-col gap-1 p-2 rounded-lg border ${m.winner === 'A' ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' : 'bg-black/40 border-white/5 text-white/60'}`}>
                        <span className="mb-1 text-[8px] font-black uppercase tracking-wider opacity-50 border-b border-current pb-1">Time A {m.winner === 'A' && '🏆'}</span>
                        {m.teamA?.map((pid: string) => <span key={pid} className="whitespace-normal" title={getPlayerName(pid)}>{getPlayerName(pid)}</span>)}
                      </div>
                      <div className={`flex-1 flex flex-col gap-1 p-2 rounded-lg border ${m.winner === 'B' ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' : 'bg-black/40 border-white/5 text-white/60'}`}>
                        <span className="mb-1 text-[8px] font-black uppercase tracking-wider opacity-50 border-b border-current pb-1">Time B {m.winner === 'B' && '🏆'}</span>
                        {m.teamB?.map((pid: string) => <span key={pid} className="whitespace-normal" title={getPlayerName(pid)}>{getPlayerName(pid)}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2 bg-brand-secondary/30 p-4 rounded-2xl border border-white/5">
          <label className="text-[10px] font-black text-white/60 uppercase tracking-widest block">Estratégia de Balanceamento</label>
          <div className="grid grid-cols-3 gap-2">
            {(['BOTH', 'BOTTOM_TWO', 'SYNERGY'] as const).map(strat => (
              <button
                key={strat}
                onClick={() => setSimStrategy(strat)}
                className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                  simStrategy === strat
                    ? 'bg-brand-primary text-black shadow-lg shadow-brand-primary/40 scale-105'
                    : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                }`}
              >
                {strat === 'BOTH' ? 'Ambos (Padrão)' : strat === 'BOTTOM_TWO' ? 'Bottom 2' : 'Sinergia ML'}
              </button>
            ))}
          </div>
        </div>

        {/* Modo de Rating */}
        <div className="space-y-2 bg-brand-secondary/30 p-4 rounded-2xl border border-white/5">
          <label className="text-[10px] font-black text-white/60 uppercase tracking-widest block">Base de Cálculo (Rating)</label>
          <div className="grid grid-cols-2 gap-2">
            {(['IC_ONLY', 'HYBRID'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSimRatingMode(mode)}
                className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                  simRatingMode === mode
                    ? 'bg-brand-primary text-black shadow-lg shadow-brand-primary/40 scale-105'
                    : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                }`}
              >
                {mode === 'IC_ONLY' ? 'IC Puro (100%)' : 'Híbrido (ELO + IC)'}
              </button>
            ))}
          </div>
        </div>

        {/* Botão Executar Simulação */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleRunBestSimulation}
            disabled={isSimulating}
            className="w-full flex-grow flex items-center justify-center gap-2 py-4 px-6 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-emerald-900/20 cursor-pointer disabled:opacity-50"
          >
            {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>Simular Melhor Combinação</span>
          </button>
          {currentMatch && (
            <label className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-brand-primary cursor-pointer mt-1">
              <input 
                type="checkbox" 
                checked={includeCurrentMatch} 
                onChange={(e) => setIncludeCurrentMatch(e.target.checked)}
                className="w-3 h-3 accent-brand-primary"
              />
              Considerar partida atual concluída
            </label>
          )}
        </div>

      </div>

      {/* Resultados da Simulação */}
      {simulationResult && (
        <div className="mt-8 space-y-6 pt-6 border-t border-white/10 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h4 className="text-xs font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Resultado da Simulação (Estratégia: {simStrategy} | Base: {simRatingMode}{simulationResult.appliedCascadeLevel ? ` | Filtro: ${simulationResult.appliedCascadeLevel.replace('_', ' + ')}` : ''})
            </h4>
            <div className="flex items-center gap-4 text-[10px] font-mono text-white/60">
              {simulationResult.combinationsCount && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <RefreshCw className="w-3 h-3 animate-[spin_3s_linear_infinite]" /> {simulationResult.combinationsCount.toLocaleString()} combinações analisadas
                </span>
              )}
              <span>Delta IC: <strong className="text-brand-primary">{Math.abs(calculateTeamStats(simulationResult.teamA).totalIC - calculateTeamStats(simulationResult.teamB).totalIC)} pts</strong></span>
            </div>
          </div>

          {/* Verificação Estatutária das Regras do Clube */}
          {(() => {
            const rules = verifyClubGenerationRules(simulationResult);
            return (
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider bg-black/40 p-2.5 rounded-xl border border-white/5">
                <span className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                  rules.setter.fulfilled 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`} title={rules.setter.description}>
                  {rules.setter.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                  Levantadores: <span className={rules.setter.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rules.setter.badgeLabel}</span>
                </span>

                <span className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                  rules.gender.fulfilled 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`} title={rules.gender.description}>
                  {rules.gender.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                  Gênero: <span className={rules.gender.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rules.gender.badgeLabel}</span>
                </span>

                <span className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                  rules.topBottom.fulfilled 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`} title={rules.topBottom.description}>
                  {rules.topBottom.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                  Top/Bottom: <span className="text-white">{rules.topBottom.badgeLabel}</span>
                </span>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Time A */}
            <div className="bg-brand-secondary/40 border border-brand-primary/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="text-xs font-black uppercase tracking-widest text-white">Time A</span>
                <span className="px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-xl text-[10px] font-mono font-black">
                  IC Médio: {calculateTeamStats(simulationResult.teamA).avgIC} (IC Total: {calculateTeamStats(simulationResult.teamA).totalIC})
                </span>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 bg-black/40 rounded-xl border border-brand-primary/20 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-brand-primary uppercase tracking-wider block mb-0.5">Levantador Oficial</span>
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      {simulationResult.teamA?.setter && (() => {
                        const ledStatus = getPlayerLedStatus(simulationResult.teamA.setter.id || simulationResult.teamA.setter);
                        return (
                          <>
                            <div className={`w-2 h-2 rounded-full ${ledStatus.icColor}`} title={ledStatus.icTitle} />
                            <span>{getPlayerName(simulationResult.teamA.setter)}</span>
                            {ledStatus.techTier && (
                              <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border ${ledStatus.techTier.colorClass}`} title={ledStatus.techTier.title}>
                                {ledStatus.techTier.label}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {!simulationResult.teamA?.setter && 'Nenhum'}
                      {simulationResult.teamA?.setter && getDepartureBadge(simulationResult.teamA.setter)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {simulationResult.teamA?.setter && getActiveStatusBadge(simulationResult.teamA.setter)}
                    <span className="text-[10px] font-mono text-brand-primary/80">IC {simulationResult.teamA?.setter ? getPlayerIC(simulationResult.teamA.setter) : 0}</span>
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Jogadores de Linha</span>
                  {simulationResult.teamA?.players?.map((p: any) => {
                    const ledStatus = getPlayerLedStatus(p.id || p);
                    return (
                      <div key={p.id || p} className="p-2 bg-black/20 rounded-xl flex items-center justify-between text-xs border border-transparent hover:border-white/5 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${ledStatus.icColor}`} title={ledStatus.icTitle} />
                          <span className="font-bold text-white flex items-center">
                            {getPlayerName(p)}
                            {ledStatus.techTier && (
                              <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border ml-2 ${ledStatus.techTier.colorClass}`} title={ledStatus.techTier.title}>
                                {ledStatus.techTier.label}
                              </span>
                            )}
                            {getDepartureBadge(p)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {getActiveStatusBadge(p)}
                          <span className="text-[10px] font-mono text-brand-primary/80">IC {getPlayerIC(p)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Time B */}
            <div className="bg-brand-secondary/40 border border-brand-primary/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="text-xs font-black uppercase tracking-widest text-white">Time B</span>
                <span className="px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-xl text-[10px] font-mono font-black">
                  IC Médio: {calculateTeamStats(simulationResult.teamB).avgIC} (IC Total: {calculateTeamStats(simulationResult.teamB).totalIC})
                </span>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 bg-black/40 rounded-xl border border-brand-primary/20 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-brand-primary uppercase tracking-wider block mb-0.5">Levantador Oficial</span>
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      {simulationResult.teamB?.setter && (() => {
                        const ledStatus = getPlayerLedStatus(simulationResult.teamB.setter.id || simulationResult.teamB.setter);
                        return (
                          <>
                            <div className={`w-2 h-2 rounded-full ${ledStatus.icColor}`} title={ledStatus.icTitle} />
                            <span>{getPlayerName(simulationResult.teamB.setter)}</span>
                            {ledStatus.techTier && (
                              <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border ${ledStatus.techTier.colorClass}`} title={ledStatus.techTier.title}>
                                {ledStatus.techTier.label}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {!simulationResult.teamB?.setter && 'Nenhum'}
                      {simulationResult.teamB?.setter && getDepartureBadge(simulationResult.teamB.setter)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {simulationResult.teamB?.setter && getActiveStatusBadge(simulationResult.teamB.setter)}
                    <span className="text-[10px] font-mono text-brand-primary/80">IC {simulationResult.teamB?.setter ? getPlayerIC(simulationResult.teamB.setter) : 0}</span>
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Jogadores de Linha</span>
                  {simulationResult.teamB?.players?.map((p: any) => {
                    const ledStatus = getPlayerLedStatus(p.id || p);
                    return (
                      <div key={p.id || p} className="p-2 bg-black/20 rounded-xl flex items-center justify-between text-xs border border-transparent hover:border-white/5 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${ledStatus.icColor}`} title={ledStatus.icTitle} />
                          <span className="font-bold text-white flex items-center">
                            {getPlayerName(p)}
                            {ledStatus.techTier && (
                              <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border ml-2 ${ledStatus.techTier.colorClass}`} title={ledStatus.techTier.title}>
                                {ledStatus.techTier.label}
                              </span>
                            )}
                            {getDepartureBadge(p)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {getActiveStatusBadge(p)}
                          <span className="text-[10px] font-mono text-brand-primary/80">IC {getPlayerIC(p)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Espera / Fila da Simulação */}
          {simulationResult.remainingPlayers && simulationResult.remainingPlayers.length > 0 && (
            <div className="bg-brand-secondary/30 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-primary" />
                  Lista de Espera / Fila (Restantes: {simulationResult.remainingPlayers.length})
                </span>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                  Ordem de prioridade baseada nas regras do clube
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {simulationResult.remainingPlayers.map((p: any) => (
                  <div key={p.id || p} className="p-2.5 bg-black/40 rounded-xl flex items-center justify-between text-xs border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getPlayerLedStatus(p.id || p).icColor}`} title={getPlayerLedStatus(p.id || p).icTitle} />
                      <span className="font-bold text-white flex items-center">
                        {getPlayerName(p)}
                        {getDepartureBadge(p)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getActiveStatusBadge(p)}
                      <span className="text-[10px] font-mono text-brand-primary/80">IC {getPlayerIC(p)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">
              💡 Os 12 jogadores simulados respeitam a prioridade da Fila (Saída Antecipada, Mínimo de Jogos, Banco e Chegada).
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setBalancingStrategy(simStrategy);
                  setBalancingRatingMode(simRatingMode);
                  setTeamGenerationMode(simTrueSkill ? 'TRUESKILL' : 'PURE_SKILLS');
                  showNotification('Configuração aplicada com sucesso como padrão do racha!', 'success');
                }}
                className="px-3.5 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Configuração</span>
              </button>
              <button
                onClick={handleApplyToMatch}
                disabled={!!currentMatch}
                className="px-4 py-2 bg-brand-primary text-black border border-brand-primary/40 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-brand-primary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
              >
                {currentMatch ? <Clock className="w-4 h-4" /> : <Play className="w-4 h-4 fill-black" />}
                <span>{currentMatch ? 'Aguarde o Fim da Partida' : 'Escalar esta Formação no Jogo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
