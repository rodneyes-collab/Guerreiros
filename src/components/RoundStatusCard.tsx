import React, { useMemo, useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Scale, 
  Users, 
  Sparkles, 
  TrendingUp, 
  Activity, 
  Zap, 
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { GenerationResult, Player, Gender } from '../../types';
import { useStore } from '../../store';
import { 
  calculateCompositePerformanceRating, 
  calculatePracticalSkillsSum, 
  verifyClubGenerationRules 
} from '../../utils/teamLogic';

const getBadgeFontSize = (name: string) => {
  const len = name.length;
  if (len > 28) return 'text-[8px] tracking-tighter leading-none';
  if (len > 22) return 'text-[9px] tracking-tight leading-none';
  if (len > 16) return 'text-[10px] tracking-tight';
  if (len > 11) return 'text-[11px]';
  return 'text-xs';
};

interface PlayerNameBadgeProps {
  name: string;
  variant?: 'default' | 'emerald' | 'amber' | 'primary';
}

const PlayerNameBadge: React.FC<PlayerNameBadgeProps> = ({ name, variant = 'default' }) => {
  const fontSize = getBadgeFontSize(name);
  const colorClasses = {
    default: 'bg-zinc-900 text-white border-white/15 shadow-sm',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-sm',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-sm',
    primary: 'bg-brand-primary/15 text-brand-primary border-brand-primary/30 shadow-sm'
  }[variant];

  const paddingClass = name.length > 20 ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <span 
      className={`inline-flex items-center ${paddingClass} rounded-lg font-black uppercase border whitespace-nowrap flex-shrink-0 select-none transition-all ${fontSize} ${colorClasses}`}
      title={name}
    >
      {name}
    </span>
  );
};

interface RoundStatusCardProps {
  generationResult: GenerationResult | null | undefined;
  onAutoFix?: () => void;
  isSyncing?: boolean;
  defaultExpanded?: boolean;
}

export const RoundStatusCard: React.FC<RoundStatusCardProps> = ({
  generationResult,
  onAutoFix,
  isSyncing = false,
  defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const players = useStore(state => state.players);

  if (!generationResult || !generationResult.teamA || !generationResult.teamB) {
    return null;
  }

  const SAFE_MALE = (typeof Gender !== 'undefined' && Gender?.MALE) ? Gender.MALE : ('MALE' as Gender);

  const teamAPlayers = useMemo(() => {
    return [generationResult.teamA.setter, ...(generationResult.teamA.players || [])]
      .filter(Boolean)
      .map(p => ({ ...p, gender: p.gender || SAFE_MALE })) as Player[];
  }, [generationResult]);

  const teamBPlayers = useMemo(() => {
    return [generationResult.teamB.setter, ...(generationResult.teamB.players || [])]
      .filter(Boolean)
      .map(p => ({ ...p, gender: p.gender || SAFE_MALE })) as Player[];
  }, [generationResult]);

  // Estatísticas de ELO
  const eloStats = useMemo(() => {
    const sumEloA = teamAPlayers.reduce((acc, p) => acc + (p.elo || 1200), 0);
    const sumEloB = teamBPlayers.reduce((acc, p) => acc + (p.elo || 1200), 0);
    const countA = Math.max(1, teamAPlayers.length);
    const countB = Math.max(1, teamBPlayers.length);
    const avgA = Math.round(sumEloA / countA);
    const avgB = Math.round(sumEloB / countB);
    const diff = Math.abs(avgA - avgB);

    let status: 'success' | 'warning' | 'violation' = 'success';
    let label = 'Balanceamento Perfeito';
    let detail = `Diferença mínima de ${diff} pts entre as equipes`;

    if (diff > 70) {
      status = 'violation';
      label = 'Desbalanceado';
      detail = `Diferença alta de ${diff} pts de ELO médio`;
    } else if (diff > 35) {
      status = 'warning';
      label = 'Equilíbrio Moderado';
      detail = `Diferença aceitável de ${diff} pts de ELO médio`;
    }

    return { avgA, avgB, diff, status, label, detail };
  }, [teamAPlayers, teamBPlayers]);

  // Estatísticas de IC (Índice Composto) - Métrica Soberana de Balanceamento Técnico
  const icStats = useMemo(() => {
    const sumIcA = teamAPlayers.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
    const sumIcB = teamBPlayers.reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
    const countA = Math.max(1, teamAPlayers.length);
    const countB = Math.max(1, teamBPlayers.length);
    const avgA = Number((sumIcA / countA).toFixed(1));
    const avgB = Number((sumIcB / countB).toFixed(1));
    const diff = Number(Math.abs(avgA - avgB).toFixed(1));

    let status: 'success' | 'warning' | 'violation' = 'success';
    let label = 'Equilíbrio Técnico Ideal';
    let detail = `Diferença mínima de ${diff} pts de IC`;

    if (diff > 5.0) {
      status = 'violation';
      label = 'Divergência de IC';
      detail = `Diferença elevada de ${diff} pts de IC`;
    } else if (diff > 2.5) {
      status = 'warning';
      label = 'Equilíbrio Moderado';
      detail = `Diferença aceitável de ${diff} pts de IC`;
    }

    return { avgA, avgB, diff, status, label, detail };
  }, [teamAPlayers, teamBPlayers]);

  // Estatutário Geral (Levantadores, Gênero, Top/Bottom)
  const statutoryAudit = useMemo(() => {
    return verifyClubGenerationRules(generationResult);
  }, [generationResult]);

  // Análise detalhada de Separação Top 4 / Bottom 4 e Top 2 / Bottom 2
  const separationStats = useMemo(() => {
    const allCourtPlayers = [...teamAPlayers, ...teamBPlayers];

    // Se temos techTierIds preenchidos na geração, usamos; caso contrário, derivamos pelas habilidades práticas
    let top4Set = new Set<string>(generationResult.techTierIds?.top4Ids || []);
    let bottom4Set = new Set<string>(generationResult.techTierIds?.bottom4Ids || []);
    let top2Set = new Set<string>(generationResult.topTwoIds || []);
    let bottom2Set = new Set<string>(generationResult.bottomTwoIds || []);

    if (top4Set.size < 4 || bottom4Set.size < 4) {
      const sortedBySkills = [...allCourtPlayers].sort(
        (a, b) => calculatePracticalSkillsSum(b) - calculatePracticalSkillsSum(a)
      );
      if (top4Set.size < 4) {
        top4Set = new Set(sortedBySkills.slice(0, 4).map(p => p.id));
      }
      if (bottom4Set.size < 4) {
        bottom4Set = new Set(sortedBySkills.slice(-4).map(p => p.id));
      }
      if (top2Set.size < 2) {
        top2Set = new Set(sortedBySkills.slice(0, 2).map(p => p.id));
      }
      if (bottom2Set.size < 2) {
        bottom2Set = new Set(sortedBySkills.slice(-2).map(p => p.id));
      }
    }

    const getPlayerFullName = (p: Player) => {
      const master = (players || []).find(m => m.id === p.id);
      return master?.name?.trim() || p.name?.trim() || 'Sócio';
    };

    // Atletas Top 4
    const top4PlayersA = teamAPlayers.filter(p => top4Set.has(p.id));
    const top4PlayersB = teamBPlayers.filter(p => top4Set.has(p.id));
    const top4InA = top4PlayersA.length;
    const top4InB = top4PlayersB.length;
    const top4NamesA = top4PlayersA.map(getPlayerFullName);
    const top4NamesB = top4PlayersB.map(getPlayerFullName);
    const isTop4Balanced = Math.abs(top4InA - top4InB) <= 0; // 2 em cada time
    const isTop4Acceptable = Math.abs(top4InA - top4InB) <= 2;

    // Atletas Bottom 4
    const bottom4PlayersA = teamAPlayers.filter(p => bottom4Set.has(p.id));
    const bottom4PlayersB = teamBPlayers.filter(p => bottom4Set.has(p.id));
    const bottom4InA = bottom4PlayersA.length;
    const bottom4InB = bottom4PlayersB.length;
    const bottom4NamesA = bottom4PlayersA.map(getPlayerFullName);
    const bottom4NamesB = bottom4PlayersB.map(getPlayerFullName);
    const isBottom4Balanced = Math.abs(bottom4InA - bottom4InB) <= 0; // 2 em cada time
    const isBottom4Acceptable = Math.abs(bottom4InA - bottom4InB) <= 2;

    // Atletas Top 2 & Bottom 2 (Regra Soberana Inegociável)
    const top2PlayersA = teamAPlayers.filter(p => top2Set.has(p.id));
    const top2PlayersB = teamBPlayers.filter(p => top2Set.has(p.id));
    const top2InA = top2PlayersA.length;
    const top2InB = top2PlayersB.length;
    const top2NamesA = top2PlayersA.map(getPlayerFullName);
    const top2NamesB = top2PlayersB.map(getPlayerFullName);
    const isTop2Separated = top2InA === 1 && top2InB === 1;

    const bottom2PlayersA = teamAPlayers.filter(p => bottom2Set.has(p.id));
    const bottom2PlayersB = teamBPlayers.filter(p => bottom2Set.has(p.id));
    const bottom2InA = bottom2PlayersA.length;
    const bottom2InB = bottom2PlayersB.length;
    const bottom2NamesA = bottom2PlayersA.map(getPlayerFullName);
    const bottom2NamesB = bottom2PlayersB.map(getPlayerFullName);
    const isBottom2Separated = bottom2InA === 1 && bottom2InB === 1;

    // Status do Top 4
    let top4Status: 'success' | 'warning' | 'violation' = 'success';
    if (!isTop4Acceptable) top4Status = 'violation';
    else if (!isTop4Balanced) top4Status = 'warning';

    // Status do Bottom 4
    let bottom4Status: 'success' | 'warning' | 'violation' = 'success';
    if (!isBottom4Acceptable) bottom4Status = 'violation';
    else if (!isBottom4Balanced) bottom4Status = 'warning';

    // Status Soberano (Top 2 / Bottom 2)
    const isSovereignSeparated = isTop2Separated && isBottom2Separated;

    return {
      top4InA,
      top4InB,
      top4NamesA,
      top4NamesB,
      top4Status,
      isTop4Balanced,
      bottom4InA,
      bottom4InB,
      bottom4NamesA,
      bottom4NamesB,
      bottom4Status,
      isBottom4Balanced,
      top2InA,
      top2InB,
      top2NamesA,
      top2NamesB,
      isTop2Separated,
      bottom2InA,
      bottom2InB,
      bottom2NamesA,
      bottom2NamesB,
      isBottom2Separated,
      isSovereignSeparated,
      cascadeLevel: generationResult.appliedCascadeLevel || generationResult.techTierIds?.cascadeLevel || 'TOP2_BOTTOM2'
    };
  }, [teamAPlayers, teamBPlayers, generationResult, players]);

  // Contagem de Gênero
  const genderStats = useMemo(() => {
    const isMale = (p: Player) => {
      const g = String(p.gender || SAFE_MALE).toUpperCase();
      return g === 'MALE' || g === 'M';
    };
    const isFemale = (p: Player) => {
      const g = String(p.gender || SAFE_MALE).toUpperCase();
      return g === 'FEMALE' || g === 'F';
    };
    const menA = teamAPlayers.filter(isMale).length;
    const womenA = teamAPlayers.filter(isFemale).length;
    const menB = teamBPlayers.filter(isMale).length;
    const womenB = teamBPlayers.filter(isFemale).length;
    const diffMen = Math.abs(menA - menB);
    const isBalanced = diffMen <= 1;

    return {
      menA,
      womenA,
      menB,
      womenB,
      diffMen,
      isBalanced
    };
  }, [teamAPlayers, teamBPlayers]);

  // Contagem de Levantadores
  const setterStats = useMemo(() => {
    const settersA = teamAPlayers.filter(p => p.isOfficialSetter);
    const settersB = teamBPlayers.filter(p => p.isOfficialSetter);
    const total = settersA.length + settersB.length;
    const isBalanced = total >= 2 ? (settersA.length === 1 && settersB.length === 1) : true;
    const getSetterName = (p: Player) => {
      const master = (players || []).find(m => m.id === p.id);
      return master?.name?.trim() || p.name?.trim() || 'Sócio';
    };
    const setterNamesA = settersA.map(getSetterName);
    const setterNamesB = settersB.map(getSetterName);

    return { 
      settersA: settersA.length, 
      settersB: settersB.length, 
      setterNamesA,
      setterNamesB,
      total, 
      isBalanced 
    };
  }, [teamAPlayers, teamBPlayers, players]);

  // Avaliação Geral de Conformidade (Soberania do IC Técnico)
  const isAllPerfect = useMemo(() => {
    return (
      icStats.status !== 'violation' &&
      separationStats.isSovereignSeparated &&
      genderStats.isBalanced &&
      setterStats.isBalanced &&
      statutoryAudit.allFulfilled
    );
  }, [icStats.status, separationStats, genderStats, setterStats, statutoryAudit]);

  const hasAnyViolation = useMemo(() => {
    return (
      icStats.status === 'violation' ||
      !separationStats.isSovereignSeparated ||
      !genderStats.isBalanced ||
      !setterStats.isBalanced
    );
  }, [icStats.status, separationStats, genderStats, setterStats]);

  return (
    <div className="w-full bg-zinc-950/90 border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-7 shadow-2xl backdrop-blur-xl mb-10 transition-all overflow-hidden relative group">
      {/* Glow de fundo */}
      <div 
        className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-all duration-700 ${
          isAllPerfect ? 'bg-brand-primary/10' : hasAnyViolation ? 'bg-rose-500/10' : 'bg-amber-500/10'
        }`} 
      />

      {/* Cabeçalho do Card */}
      <div className={`relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${isExpanded ? 'pb-5 border-b border-white/10' : ''} transition-all`}>
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3.5 cursor-pointer select-none group/header"
        >
          <div className={`p-3 rounded-2xl border transition-transform group-hover/header:scale-105 ${
            isAllPerfect 
              ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' 
              : hasAnyViolation 
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <Scale className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight group-hover/header:text-brand-primary transition-colors">
                Status da Rodada
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                isAllPerfect
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : hasAnyViolation
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}>
                {isAllPerfect ? '100% Regulamentar' : hasAnyViolation ? 'Atenção às Regras' : 'Balanceado'}
              </span>

              {/* Badges Rápidos quando Retraído */}
              {!isExpanded && (
                <div className="hidden sm:flex items-center gap-1.5 ml-1">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono border ${
                    icStats.status === 'success' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    Δ {icStats.diff} IC
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono border ${
                    separationStats.isSovereignSeparated
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {separationStats.isSovereignSeparated ? 'Top/Bottom Separados' : 'Top/Bottom Concentrado ⚠'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black font-mono bg-white/5 text-white/70 border border-white/10">
                    {genderStats.menA}M/{genderStats.womenA}F vs {genderStats.menB}M/{genderStats.womenB}F
                  </span>
                </div>
              )}
            </div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
              Auditoria em tempo real de separação, equilíbrio soberano de IC e regras estatutárias
            </p>
          </div>
        </div>

        {/* Feedback / Ações */}
        <div className="flex items-center gap-2 shrink-0">
          {onAutoFix && (
            <button
              onClick={onAutoFix}
              disabled={isSyncing}
              className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                hasAnyViolation
                  ? 'bg-brand-primary text-black hover:scale-105 active:scale-95 shadow-lg shadow-brand-primary/20 animate-pulse'
                  : 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10'
              }`}
              title="Reexecuta a autocorreção soberana dos times"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{hasAnyViolation ? 'Auto-Fix (Corrigir)' : 'Revalidar Regras'}</span>
            </button>
          )}

          {/* Botão Expandir / Retrair */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3.5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer bg-white/5 hover:bg-white/10 text-white border border-white/10 active:scale-95"
            title={isExpanded ? 'Recolher detalhes do status da rodada' : 'Expandir detalhes do status da rodada'}
          >
            <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-brand-primary" />
            ) : (
              <ChevronDown className="w-4 h-4 text-brand-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo Expansível: Grid de Indicadores e Rodapé */}
      {isExpanded && (
        <>
          {/* Grid de Indicadores com Ícones de Status */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-5 animate-in fade-in duration-300">
        
        {/* 1. Equilíbrio Soberano de IC (Índice Composto) */}
        <div className={`p-4 rounded-2xl border transition-all ${
          icStats.status === 'success'
            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
            : icStats.status === 'warning'
            ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
            : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-brand-primary" />
              IC Médio (Técnico)
            </span>
            {icStats.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : icStats.status === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
          </div>

          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-white font-mono">{icStats.avgA}</span>
              <span className="text-[10px] font-black text-white/40">vs</span>
              <span className="text-lg font-black text-white font-mono">{icStats.avgB}</span>
            </div>
            <span className={`text-[11px] font-black font-mono px-1.5 py-0.5 rounded ${
              icStats.status === 'success' 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : icStats.status === 'warning' 
                ? 'bg-amber-500/10 text-amber-400' 
                : 'bg-rose-500/10 text-rose-400'
            }`}>
              Δ {icStats.diff} IC
            </span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-bold border-t border-white/5 pt-2 mt-1">
            <span className="text-white/60">{icStats.label}</span>
            <span className="text-white/40 font-mono" title={`ELO Médio Time A: ${eloStats.avgA} vs Time B: ${eloStats.avgB}`}>
              ELO Δ {eloStats.diff} pts
            </span>
          </div>
        </div>

        {/* 2. Separação Top 4 & Top 2 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          separationStats.top4Status === 'success' && separationStats.isTop2Separated
            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
            : separationStats.top4Status === 'warning' && separationStats.isTop2Separated
            ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
            : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
        }`}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400" />
              Separação Top 4
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded ${
                separationStats.isTop4Balanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {separationStats.isTop4Balanced ? '2A / 2B' : `${separationStats.top4InA}A / ${separationStats.top4InB}B`}
              </span>
              {separationStats.top4Status === 'success' && separationStats.isTop2Separated ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : separationStats.isTop2Separated ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </div>

          {/* Top 4 Completo */}
          <div className="flex flex-col gap-2 mb-2 bg-black/60 p-2.5 rounded-xl border border-white/5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-brand-primary mb-1">Time A ({separationStats.top4InA}):</div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full">
                {separationStats.top4NamesA.length > 0 ? (
                  separationStats.top4NamesA.map((name, i) => (
                    <PlayerNameBadge key={i} name={name} variant="default" />
                  ))
                ) : (
                  <span className="text-xs text-white/40 italic">Nenhum</span>
                )}
              </div>
            </div>
            <div className="pt-2 border-t border-white/5">
              <div className="text-[9px] font-black uppercase tracking-wider text-white/60 mb-1">Time B ({separationStats.top4InB}):</div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full">
                {separationStats.top4NamesB.length > 0 ? (
                  separationStats.top4NamesB.map((name, i) => (
                    <PlayerNameBadge key={i} name={name} variant="default" />
                  ))
                ) : (
                  <span className="text-xs text-white/40 italic">Nenhum</span>
                )}
              </div>
            </div>
          </div>

          {/* Top 2 Soberano */}
          <div className="pt-2.5 border-t border-white/10 mt-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-white/60 mb-1.5">
              <span>Top 2 Soberano:</span>
              {separationStats.isTop2Separated ? (
                <span className="text-emerald-400 font-black text-[10px] flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400 inline" /> 1 por time
                </span>
              ) : (
                <span className="text-rose-400 font-black text-[10px]">Concentrado ⚠</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-xl border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-brand-primary uppercase tracking-wider w-12 shrink-0">Time A:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                  {separationStats.top2NamesA.length > 0 ? (
                    separationStats.top2NamesA.map((name, idx) => (
                      <PlayerNameBadge key={idx} name={name} variant="emerald" />
                    ))
                  ) : (
                    <span className="text-xs text-white/40 italic">Nenhum</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <span className="text-[9px] font-black text-white/60 uppercase tracking-wider w-12 shrink-0">Time B:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                  {separationStats.top2NamesB.length > 0 ? (
                    separationStats.top2NamesB.map((name, idx) => (
                      <PlayerNameBadge key={idx} name={name} variant="emerald" />
                    ))
                  ) : (
                    <span className="text-xs text-white/40 italic">Nenhum</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Separação Bottom 4 & Bottom 2 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          separationStats.bottom4Status === 'success' && separationStats.isBottom2Separated
            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
            : separationStats.bottom4Status === 'warning' && separationStats.isBottom2Separated
            ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
            : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
        }`}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-cyan-400" />
              Separação Bottom 4
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded ${
                separationStats.isBottom4Balanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {separationStats.isBottom4Balanced ? '2A / 2B' : `${separationStats.bottom4InA}A / ${separationStats.bottom4InB}B`}
              </span>
              {separationStats.bottom4Status === 'success' && separationStats.isBottom2Separated ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : separationStats.isBottom2Separated ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </div>

          {/* Bottom 4 Completo */}
          <div className="flex flex-col gap-2 mb-2 bg-black/60 p-2.5 rounded-xl border border-white/5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-brand-primary mb-1">Time A ({separationStats.bottom4InA}):</div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full">
                {separationStats.bottom4NamesA.length > 0 ? (
                  separationStats.bottom4NamesA.map((name, i) => (
                    <PlayerNameBadge key={i} name={name} variant="default" />
                  ))
                ) : (
                  <span className="text-xs text-white/40 italic">Nenhum</span>
                )}
              </div>
            </div>
            <div className="pt-2 border-t border-white/5">
              <div className="text-[9px] font-black uppercase tracking-wider text-white/60 mb-1">Time B ({separationStats.bottom4InB}):</div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full">
                {separationStats.bottom4NamesB.length > 0 ? (
                  separationStats.bottom4NamesB.map((name, i) => (
                    <PlayerNameBadge key={i} name={name} variant="default" />
                  ))
                ) : (
                  <span className="text-xs text-white/40 italic">Nenhum</span>
                )}
              </div>
            </div>
          </div>

          {/* Bottom 2 Soberano */}
          <div className="pt-2.5 border-t border-white/10 mt-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-white/60 mb-1.5">
              <span>Bottom 2 Soberano:</span>
              {separationStats.isBottom2Separated ? (
                <span className="text-emerald-400 font-black text-[10px] flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400 inline" /> 1 por time
                </span>
              ) : (
                <span className="text-rose-400 font-black text-[10px]">Concentrado ⚠</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5 bg-black/60 p-2 rounded-xl border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-brand-primary uppercase tracking-wider w-12 shrink-0">Time A:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                  {separationStats.bottom2NamesA.length > 0 ? (
                    separationStats.bottom2NamesA.map((name, idx) => (
                      <PlayerNameBadge key={idx} name={name} variant="emerald" />
                    ))
                  ) : (
                    <span className="text-xs text-white/40 italic">Nenhum</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <span className="text-[9px] font-black text-white/60 uppercase tracking-wider w-12 shrink-0">Time B:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                  {separationStats.bottom2NamesB.length > 0 ? (
                    separationStats.bottom2NamesB.map((name, idx) => (
                      <PlayerNameBadge key={idx} name={name} variant="emerald" />
                    ))
                  ) : (
                    <span className="text-xs text-white/40 italic">Nenhum</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Levantadores e Paridade de Gênero */}
        <div className={`p-4 rounded-2xl border transition-all ${
          setterStats.isBalanced && genderStats.isBalanced
            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
            : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
        }`}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand-primary" />
              Posições & Gênero
            </span>
            {setterStats.isBalanced && genderStats.isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="bg-black/60 p-2.5 rounded-xl border border-white/5">
              <div className="text-[9px] font-black uppercase tracking-wider text-white/60 mb-2 flex items-center justify-between">
                <span>Levantadores Oficiais:</span>
                {setterStats.isBalanced && setterStats.total >= 2 && (
                  <span className="text-emerald-400 text-[10px] flex items-center gap-1 font-black">
                    <Check className="w-3 h-3 inline" /> 1 por time
                  </span>
                )}
              </div>
              {setterStats.total > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-brand-primary uppercase tracking-wider w-12 shrink-0">Time A:</span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                      {setterStats.setterNamesA.length > 0 ? (
                        setterStats.setterNamesA.map((name, idx) => (
                          <PlayerNameBadge key={idx} name={name} variant="primary" />
                        ))
                      ) : (
                        <span className="text-xs text-white/40 italic">Nenhum</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                    <span className="text-[9px] font-black text-white/60 uppercase tracking-wider w-12 shrink-0">Time B:</span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-1 max-w-full flex-1 min-w-0">
                      {setterStats.setterNamesB.length > 0 ? (
                        setterStats.setterNamesB.map((name, idx) => (
                          <PlayerNameBadge key={idx} name={name} variant="primary" />
                        ))
                      ) : (
                        <span className="text-xs text-white/40 italic">Nenhum</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-white/50 italic">Rodagem Livre (0 Oficiais)</span>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] bg-black/40 px-2.5 py-2 rounded-xl border border-white/5">
              <span className="text-white/60 font-bold flex items-center gap-1.5 text-[10px]">
                <Users className="w-3 h-3 text-white/40" />
                <span>Gênero:</span>
              </span>
              <span className={`font-black font-mono text-[10px] ${genderStats.isBalanced ? 'text-white' : 'text-rose-400'}`}>
                {genderStats.menA}M/{genderStats.womenA}F vs {genderStats.menB}M/{genderStats.womenB}F
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Barra de Rodapé com Sintese de Conformidade */}
      <div className="relative z-10 mt-4 pt-3.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/40 uppercase font-black tracking-wider">Regras Estatutárias:</span>
          
          {/* Badge Top/Bottom */}
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black uppercase text-[9px] border ${
            statutoryAudit.topBottom.fulfilled
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {statutoryAudit.topBottom.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
            Top & Bottom ({separationStats.cascadeLevel})
          </span>

          {/* Badge Levantador */}
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black uppercase text-[9px] border ${
            statutoryAudit.setter.fulfilled
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {statutoryAudit.setter.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
            {statutoryAudit.setter.badgeLabel}
          </span>

          {/* Badge Gênero */}
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black uppercase text-[9px] border ${
            statutoryAudit.gender.fulfilled
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {statutoryAudit.gender.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
            {statutoryAudit.gender.badgeLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-white/50 text-[9px] font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
          <span>Guerreiros Intelligence v3.3</span>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
