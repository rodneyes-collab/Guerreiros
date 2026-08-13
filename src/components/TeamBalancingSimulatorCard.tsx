import React, { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { generateTeams, optimizeTeamSynergyIteratively, calculateCompositePerformanceRating } from '../../utils/teamLogic';
import { Sliders, CheckCircle2, RefreshCw, Zap, Clock, ArrowRight, Play, BarChart3 } from 'lucide-react';

interface TeamBalancingSimulatorCardProps {
  onApplyToMatch?: (result: any) => void;
}

export const TeamBalancingSimulatorCard: React.FC<TeamBalancingSimulatorCardProps> = ({ onApplyToMatch }) => {
  const { players, attendance, matches, balancingStrategy, setBalancingStrategy, balancingRatingMode, setBalancingRatingMode, teamGenerationMode, setTeamGenerationMode, setGenerationResult, setViewMode, showNotification } = useStore();

  const [simStrategy, setSimStrategy] = useState<'BOTTOM_TWO' | 'SYNERGY' | 'BOTH'>(balancingStrategy || 'BOTH');
  const [simRatingMode, setSimRatingMode] = useState<'IC_ONLY' | 'HYBRID'>(balancingRatingMode || 'IC_ONLY');
  const [simTrueSkill, setSimTrueSkill] = useState<boolean>(teamGenerationMode === 'TRUESKILL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Pool de jogadores para simulação (prioriza attendance, caso vazio usa active players)
  const availablePool = useMemo(() => {
    const present = (attendance || []).filter(p => (!p.status || p.status === 'active') && !p.isDM);
    if (present.length >= 12) {
      return present.map(p => {
        const full = players.find(fp => fp.id === p.id) || {};
        return { ...p, ...full };
      });
    }
    // Fallback para todos os ativos se attendance < 12
    return players.filter(p => (!p.status || p.status === 'active' || p.status === 'guest') && !p.isDM);
  }, [attendance, players]);

  const handleRunSimulation = () => {
    if (availablePool.length < 12) {
      showNotification('São necessários pelo menos 12 sócios na presença ou ativos para simular as equipes!', 'error');
      return;
    }

    setIsSimulating(true);
    setTimeout(() => {
      try {
        const previousFormations = (matches || []).slice(0, 5).map(m => ({
          setterA: m.teamA[0],
          playersA: m.teamA.slice(1),
          setterB: m.teamB[0],
          playersB: m.teamB.slice(1)
        }));

        const allMatchHistory = (matches || []).map(m => ({
          teamA: m.teamA,
          teamB: m.teamB,
          winner: m.winner as 'A' | 'B',
          timestamp: m.timestamp
        }));

        // Executa geração e otimização usando as opções de teste selecionadas
        let result = generateTeams(
          availablePool,
          previousFormations,
          simTrueSkill,
          false,
          allMatchHistory,
          simStrategy,
          simRatingMode
        );

        result = optimizeTeamSynergyIteratively(
          result,
          allMatchHistory,
          simTrueSkill,
          simStrategy,
          simRatingMode
        );

        setSimulationResult(result);
        showNotification('Simulação de balanceamento (IC) concluída com sucesso!', 'success');
      } catch (err) {
        console.error('Erro na simulação:', err);
        showNotification('Erro ao simular balanceamento.', 'error');
      } finally {
        setIsSimulating(false);
      }
    }, 300);
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
            <h3 className="text-xl font-black uppercase tracking-tight text-white">Simulador de Estratégias de Balanceamento (IC)</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Teste diferentes algoritmos e estratégias na lista atual antes de confirmar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-xl text-[10px] font-black uppercase tracking-wider">
            Pool: {availablePool.length} sócios disponíveis
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Estratégia */}
        <div className="space-y-2 bg-brand-secondary/30 p-4 rounded-2xl border border-white/5">
          <label className="text-[10px] font-black text-white/60 uppercase tracking-widest block">Estratégia de Balanceamento</label>
          <div className="grid grid-cols-3 gap-2">
            {(['BOTH', 'BOTTOM_TWO', 'SYNERGY'] as const).map(strat => (
              <button
                key={strat}
                onClick={() => setSimStrategy(strat)}
                className={`py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                  simStrategy === strat
                    ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
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
                    ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                    : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                }`}
              >
                {mode === 'IC_ONLY' ? 'IC Puro (100%)' : 'Híbrido (ELO + IC)'}
              </button>
            ))}
          </div>
        </div>

        {/* Botão Executar Simulação */}
        <div className="flex items-end">
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="w-full h-full flex items-center justify-center gap-2 py-4 px-6 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-brand-primary/10 cursor-pointer disabled:opacity-50"
          >
            {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>Simular Impacto Técnico</span>
          </button>
        </div>
      </div>

      {/* Resultados da Simulação */}
      {simulationResult && (
        <div className="mt-8 space-y-6 pt-6 border-t border-white/10 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Resultado da Simulação (Estratégia: {simStrategy} | Base: {simRatingMode})
            </h4>
            <div className="flex items-center gap-4 text-[10px] font-mono text-white/60">
              <span>Delta IC: <strong className="text-brand-primary">{Math.abs(calculateTeamStats(simulationResult.teamA).totalIC - calculateTeamStats(simulationResult.teamB).totalIC)} pts</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Time A */}
            <div className="bg-brand-secondary/40 border border-brand-primary/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="text-xs font-black uppercase tracking-widest text-white">Time A</span>
                <span className="px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-xl text-[10px] font-mono font-black">
                  IC Médio: {calculateTeamStats(simulationResult.teamA).avgIC} (Total: {calculateTeamStats(simulationResult.teamA).totalIC})
                </span>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 bg-black/40 rounded-xl border border-brand-primary/20 flex items-center justify-between">
                  <div>
                    <span className="text-[8px] font-black text-brand-primary uppercase tracking-wider block">Levantador Oficial</span>
                    <span className="text-xs font-black text-white flex items-center">
                      {simulationResult.teamA?.setter ? getPlayerName(simulationResult.teamA.setter) : 'Nenhum'}
                      {simulationResult.teamA?.setter && getDepartureBadge(simulationResult.teamA.setter)}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-white/60">IC {simulationResult.teamA?.setter ? getPlayerIC(simulationResult.teamA.setter) : 0}</span>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Jogadores de Linha</span>
                  {simulationResult.teamA?.players?.map((p: any) => (
                    <div key={p.id || p} className="p-2 bg-black/20 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center">
                        {getPlayerName(p)}
                        {getDepartureBadge(p)}
                      </span>
                      <span className="text-[10px] font-mono text-white/60">IC {getPlayerIC(p)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Time B */}
            <div className="bg-brand-secondary/40 border border-brand-primary/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="text-xs font-black uppercase tracking-widest text-white">Time B</span>
                <span className="px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-xl text-[10px] font-mono font-black">
                  IC Médio: {calculateTeamStats(simulationResult.teamB).avgIC} (Total: {calculateTeamStats(simulationResult.teamB).totalIC})
                </span>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 bg-black/40 rounded-xl border border-brand-primary/20 flex items-center justify-between">
                  <div>
                    <span className="text-[8px] font-black text-brand-primary uppercase tracking-wider block">Levantador Oficial</span>
                    <span className="text-xs font-black text-white flex items-center">
                      {simulationResult.teamB?.setter ? getPlayerName(simulationResult.teamB.setter) : 'Nenhum'}
                      {simulationResult.teamB?.setter && getDepartureBadge(simulationResult.teamB.setter)}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-white/60">IC {simulationResult.teamB?.setter ? getPlayerIC(simulationResult.teamB.setter) : 0}</span>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Jogadores de Linha</span>
                  {simulationResult.teamB?.players?.map((p: any) => (
                    <div key={p.id || p} className="p-2 bg-black/20 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center">
                        {getPlayerName(p)}
                        {getDepartureBadge(p)}
                      </span>
                      <span className="text-[10px] font-mono text-white/60">IC {getPlayerIC(p)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

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
                className="px-4 py-2 bg-brand-primary text-black border border-brand-primary/40 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-brand-primary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-primary/20"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Escalar esta Formação no Jogo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
