import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { calculateCompositePerformanceRating, calculatePracticalSkillsSum, enrichPlayerImmutably, verifyClubGenerationRules, validateTopBottomTolerance } from '../utils/teamLogic';
import { BarChart3, Check, RefreshCw, X, UserCheck, History, Sparkles, AlertTriangle, Activity, Settings2, Info, Scale, Star, Shield } from 'lucide-react';
import { Player, Gender } from '../types';
import { SKILL_WEIGHTS } from '../constants';
import { TeamMetricsComparison } from './TeamMetricsComparison';
import { RoundStatusCard } from '../src/components/RoundStatusCard';

// Constantes seguras de gênero que previnem ReferenceError em qualquer runtime mobile/PWA
export const SAFE_MALE: Gender = (typeof Gender !== 'undefined' && Gender?.MALE) ? Gender.MALE : ('MALE' as Gender);
export const SAFE_FEMALE: Gender = (typeof Gender !== 'undefined' && Gender?.FEMALE) ? Gender.FEMALE : ('FEMALE' as Gender);

/**
 * Normaliza e sanitiza a propriedade 'gender' de qualquer jogador ou objeto arbitrário.
 * Garante que valores nulos, indefinidos, vazios ou inválidos recebam fallback seguro para 'MALE'.
 */
export const getSafePlayerGender = (playerOrGender: any): Gender => {
  if (!playerOrGender) return SAFE_MALE;
  const raw = typeof playerOrGender === 'object' 
    ? (playerOrGender.gender ?? playerOrGender.Gender) 
    : playerOrGender;
  if (!raw) return SAFE_MALE;
  const normalized = String(raw).trim().toUpperCase();
  if (normalized === 'FEMALE' || normalized === 'F' || normalized === 'FEMININO') {
    return SAFE_FEMALE;
  }
  return SAFE_MALE;
};

export const PreviewTeams: React.FC<{ 
  result: any; 
  onConfirm: (res: any) => void; 
  onCancel: () => void;
  onRegenerate?: () => void;
  onRecalculate?: () => void;
  isRecalculating?: boolean;
  recalcCount?: number;
}> = ({ result, onConfirm, onCancel, onRegenerate, onRecalculate, isRecalculating, recalcCount }) => {
  const {
 players, attendance, matches } = useStore(useShallow(state => ({
      players: state.players,
      attendance: state.attendance,
      matches: state.matches
    })));
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const getFullPlayer = (p: any): Player | undefined => {
    if (!p) return undefined;
    const enriched = enrichPlayerImmutably(p, players, attendance);
    const master = players.find(mp => mp.id === p.id) || attendance.find(ap => ap.id === p.id);
    const safeGender = getSafePlayerGender(enriched?.gender ?? p?.gender);
    return {
      ...enriched,
      gender: safeGender,
      impactLevel: master?.impactLevel ?? p?.impactLevel ?? enriched?.impactLevel ?? 2
    };
  };

  const allPlayersOnCourt = useMemo(() => {
    if (!result) return [];
    return [
      result.teamA?.setter,
      ...(result.teamA?.players || []),
      result.teamB?.setter,
      ...(result.teamB?.players || [])
    ]
      .filter(Boolean)
      .map(p => {
        const full = getFullPlayer(p);
        return full ? { ...full, gender: getSafePlayerGender(full.gender ?? p?.gender) } : undefined;
      })
      .filter(Boolean) as Player[];
  }, [result, players, attendance]);

  const sortedBySkills = useMemo(() => {
    return [...allPlayersOnCourt].sort((a, b) => calculatePracticalSkillsSum(b) - calculatePracticalSkillsSum(a));
  }, [allPlayersOnCourt]);

  const safeResultForAudit = useMemo(() => {
    if (!result) return result;
    const ensurePlayerGender = (p: any) => {
      if (!p) return null;
      const full = getFullPlayer(p);
      return full ? { ...full, gender: getSafePlayerGender(full?.gender ?? p?.gender) } : null;
    };
    return {
      ...result,
      teamA: {
        ...result.teamA,
        setter: ensurePlayerGender(result.teamA?.setter),
        players: (result.teamA?.players || []).map(ensurePlayerGender).filter(Boolean)
      },
      teamB: {
        ...result.teamB,
        setter: ensurePlayerGender(result.teamB?.setter),
        players: (result.teamB?.players || []).map(ensurePlayerGender).filter(Boolean)
      },
      remainingPlayers: (result.remainingPlayers || []).map(ensurePlayerGender).filter(Boolean)
    };
  }, [result, players, attendance]);

  const rulesStatus = useMemo(() => {
    return verifyClubGenerationRules(safeResultForAudit || result);
  }, [safeResultForAudit, result]);

  const topBottomValidation = useMemo(() => {
    return validateTopBottomTolerance(safeResultForAudit || result);
  }, [safeResultForAudit, result]);

  const getPlayerLedStatus = (playerId: string) => {
    const player = allPlayersOnCourt.find(p => p.id === playerId);
    if (!player) return { icColor: 'bg-white/20', icTitle: 'N/A' };

    const ic = calculateCompositePerformanceRating(player);
    const sortedByIc = [...allPlayersOnCourt].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
    const icRankIndex = sortedByIc.findIndex(p => p.id === playerId);
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

    return { icColor, icTitle };
  };

  const effectiveTiers = useMemo(() => {
    const allLine = [
      ...(result?.teamA?.players || []),
      ...(result?.teamB?.players || [])
    ].filter(p => p && !p.isOfficialSetter);

    const sorted = [...allLine].sort((a, b) => {
      const diff = calculatePracticalSkillsSum(b) - calculatePracticalSkillsSum(a);
      if (diff !== 0) return diff;
      return calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a);
    });

    const topTwo = result?.topTwoIds?.length ? result.topTwoIds : sorted.slice(0, 2).map(p => p.id);
    const bottomTwo = result?.bottomTwoIds?.length ? result.bottomTwoIds : sorted.slice(-2).map(p => p.id);
    const top4 = result?.techTierIds?.top4Ids?.length ? result.techTierIds.top4Ids : sorted.slice(0, 4).map(p => p.id);
    const bottom4 = result?.techTierIds?.bottom4Ids?.length ? result.techTierIds.bottom4Ids : sorted.slice(-4).map(p => p.id);

    return { topTwo, bottomTwo, top4, bottom4 };
  }, [result]);

  const getPlayerTechTier = (playerId: string): 'TOP4' | 'BOTTOM4' | 'TOP2' | 'BOTTOM2' | undefined => {
    if (effectiveTiers.topTwo?.includes(playerId)) return 'TOP2';
    if (effectiveTiers.top4?.includes(playerId)) return 'TOP4';
    if (effectiveTiers.bottomTwo?.includes(playerId)) return 'BOTTOM2';
    if (effectiveTiers.bottom4?.includes(playerId)) return 'BOTTOM4';
    return undefined;
  };

  const renderTeamList = (team: any, label: string) => {
    const teamPlayers = [team?.setter, ...(team?.players || [])].filter(Boolean).map(p => getFullPlayer(p)).filter(Boolean) as Player[];
    const totalIc = teamPlayers.reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0);
    const teamKeyIds = teamPlayers.map(p => p.id).sort().join('-');
    const teamTops = teamPlayers.filter(p => getPlayerTechTier(p.id) === 'TOP2' || getPlayerTechTier(p.id) === 'TOP4' || p.impactLevel === 3).length;
    const teamBottoms = teamPlayers.filter(p => getPlayerTechTier(p.id) === 'BOTTOM2' || getPlayerTechTier(p.id) === 'BOTTOM4' || p.impactLevel === 1).length;

    return (
      <motion.div
        key={`team-${label}-${teamKeyIds}-${isRecalculating ? `recalc-${recalcCount}` : 'stable'}`}
        initial={{ opacity: 0, scale: 0.95, y: label === 'A' ? 12 : -12 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          borderColor: isRecalculating 
            ? ['rgba(245,196,41,0.2)', 'rgba(245,196,41,0.8)', 'rgba(245,196,41,0.2)'] 
            : 'rgba(255,255,255,0.05)'
        }}
        exit={{ opacity: 0, scale: 0.95, y: label === 'A' ? -12 : 12 }}
        transition={{ 
          duration: 0.3, 
          ease: [0.16, 1, 0.3, 1],
          borderColor: isRecalculating ? { repeat: Infinity, duration: 0.6 } : { duration: 0.3 }
        }}
        className="bg-white/5 p-4 rounded-xl flex flex-col gap-2 border border-white/5 relative overflow-hidden shadow-xl"
      >
        {/* Shimmer / Radar sweep during recalculation */}
        {isRecalculating && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent pointer-events-none z-0"
          />
        )}

        <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/5 relative z-10">
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-black text-white uppercase tracking-wider">Time {label}</h5>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm" title={`${teamTops} Atleta(s) Top/Elite nesta equipe`}>
                <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                {teamTops}
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 shadow-sm" title={`${teamBottoms} Atleta(s) Base/Bottom nesta equipe`}>
                <Shield className="w-2.5 h-2.5 text-rose-400" />
                {teamBottoms}
              </span>
            </div>
            {isRecalculating && (
              <span className="text-[9px] font-black text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded border border-brand-primary/30 animate-pulse flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 animate-spin" /> Combo {recalcCount || 1}/12
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded border border-brand-primary/30">
            SUM IC: {totalIc.toFixed(1)}
          </span>
        </div>

        <div className="flex flex-col gap-2 relative z-10">
          <AnimatePresence mode="popLayout">
            {teamPlayers.map((p, idx) => {
              const icInfo = getPlayerLedStatus(p.id);
              const techTier = getPlayerTechTier(p.id);
              const hasPlayedLast = p.playedLastMatch === true;
              const isFirstMatch = !matches || matches.length === 0;
              const isTop = techTier === 'TOP2' || techTier === 'TOP4' || p.impactLevel === 3;
              const isBottom = techTier === 'BOTTOM2' || techTier === 'BOTTOM4' || p.impactLevel === 1;

              return (
                <motion.div
                  key={`${p.id}-${idx}`}
                  layout
                  initial={{ opacity: 0, x: label === 'A' ? -8 : 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: label === 'A' ? 8 : -8 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className="flex flex-col"
                >
                  <div className="flex items-center gap-2 group/prev py-0.5">
                    <div className="inline-block relative shrink-0" title={icInfo.icTitle}>
                      {isTop ? (
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ) : isBottom ? (
                        <Shield className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full ${icInfo.icColor}`} />
                      )}
                    </div>
                    <span className="text-[13px] font-bold text-white/90 group-hover/prev:text-brand-primary transition-colors flex-1 flex items-center gap-1.5">
                      <span className="">{p.name}</span>

                      {(() => {
                        const gender = getSafePlayerGender(p?.gender);
                        const isFemale = gender === SAFE_FEMALE;
                        return (
                          <span className={`text-[7px] font-black px-1 py-0.2 rounded ${isFemale ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                            {isFemale ? 'F' : 'M'}
                          </span>
                        );
                      })()}
                    </span>
                    {/* Ícones de Tier Técnico */}
                    <div className="flex items-center gap-1 shrink-0">
                      {techTier === 'TOP2' && (
                        <span title="Top 2 Técnico"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></span>
                      )}
                      {techTier === 'TOP4' && (
                        <span title="Top 4 Técnico"><Star className="w-4 h-4 text-emerald-400 fill-emerald-400" /></span>
                      )}
                      {!techTier && p.impactLevel === 3 && (
                        <span title="Elite"><Star className="w-4 h-4 text-amber-500 fill-amber-500" /></span>
                      )}
                      {techTier === 'BOTTOM2' && (
                        <span title="Bottom 2 Técnico"><Shield className="w-4 h-4 text-rose-500 fill-rose-500" /></span>
                      )}
                      {techTier === 'BOTTOM4' && (
                        <span title="Bottom 4 Técnico"><Shield className="w-4 h-4 text-orange-500 fill-orange-500" /></span>
                      )}
                      {!techTier && p.impactLevel === 1 && (
                        <span title="Base"><Shield className="w-4 h-4 text-zinc-500 fill-zinc-500" /></span>
                      )}
                      {p.isOfficialSetter && (
                        <span className="text-[10px] font-black text-brand-primary border border-brand-primary/40 px-1 rounded" title={team?.setter?.id === p.id ? "Levantador Titular" : "Levantador (Linha)"}>
                          {team?.setter?.id === p.id ? 'LEV' : 'LEV*'}
                        </span>
                      )}
                    </div>

                    {/* Indicador de Origem (Fila de Espera vs Última Partida) - Abreviado com Ícones */}
                    {isFirstMatch ? (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 flex-shrink-0" title="Primeira partida da sessão">
                        <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                        FI
                      </span>
                    ) : hasPlayedLast ? (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 flex-shrink-0" title="Atleta estava jogando a última partida">
                        <History className="w-2.5 h-2.5 text-amber-400" />
                        UP
                      </span>
                    ) : (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 flex-shrink-0" title="Atleta estava na fila de espera">
                        <UserCheck className="w-2.5 h-2.5 text-emerald-400" />
                        ESP
                      </span>
                    )}

                    <span className="text-[9px] text-white/40 font-black tracking-tighter flex-shrink-0 ml-1">
                      IC {calculateCompositePerformanceRating(p).toFixed(1)}
                    </span>
                  </div>
                  
                  {showDiagnostics && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-3 mt-1 ml-4 bg-black/40 rounded-lg p-2 border border-white/5 overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/30 uppercase font-black">Habilidades Reais</span>
                          <div className="flex gap-2 mt-1">
                            {[
                              { label: 'ATK', val: p.skills?.attacking || 1 },
                              { label: 'DEF', val: p.skills?.defense || 1 },
                              { label: 'LEV', val: p.skills?.setting || 1 },
                              { label: 'SAQ', val: p.skills?.serving || 1 }
                            ].map(s => (
                              <div key={s.label} className="flex flex-col items-center">
                                <span className="text-[7px] text-brand-primary/60 font-bold">{s.label}</span>
                                <span className="text-[9px] text-white font-bold">{s.val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/30 uppercase font-black">Métricas IC</span>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="flex flex-col">
                              <span className="text-[7px] text-blue-400/60 font-bold">Tech Score</span>
                              <span className="text-[9px] text-white font-bold">
                                {(() => {
                                  const sum = calculatePracticalSkillsSum(p);
                                  return (((sum - 4) / 16) * 100).toFixed(0);
                                })()}%
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[7px] text-emerald-400/60 font-bold">Win Rate</span>
                              <span className="text-[9px] text-white font-bold">
                                {(() => {
                                  const wins = Number(p.wins) || 0;
                                  const losses = Number(p.losses) || 0;
                                  const total = wins + losses;
                                  return total > 0 ? ((wins / total) * 100).toFixed(0) : '50';
                                })()}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-white/30 uppercase font-black">Pesos Ativos:</span>
                          <span className="text-[8px] text-white/60 font-mono">
                            A:{SKILL_WEIGHTS.attacking} D:{SKILL_WEIGHTS.defense} L:{SKILL_WEIGHTS.setting} S:{SKILL_WEIGHTS.serving}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Info className="w-2.5 h-2.5 text-brand-primary/40" />
                          <span className="text-[8px] text-brand-primary font-bold">LVL {p.impactLevel || 0}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="bg-black/90 p-6 rounded-3xl border border-brand-primary/30 mt-6 shadow-2xl backdrop-blur-xl">
        <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-black text-brand-primary uppercase tracking-[0.2em] flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Pré-visualização Automática
              </h4>
            </div>
            <button onClick={onCancel} className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                <X className="w-5 h-5"/>
            </button>
        </div>

        {/* Diagnostic & Comparison Mode Toggles */}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <button 
            onClick={() => setShowComparison(!showComparison)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border cursor-pointer ${
              showComparison 
                ? 'bg-brand-primary text-black border-brand-primary shadow-lg shadow-brand-primary/20' 
                : 'bg-white/5 text-white/70 border-white/10 hover:border-brand-primary/40 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            {showComparison ? 'Ocultar Comparativo' : 'Comparar Times'}
          </button>

          <button 
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border cursor-pointer ${
              showDiagnostics 
                ? 'bg-brand-primary text-black border-brand-primary' 
                : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {showDiagnostics ? 'Ocultar Auditoria IC' : 'Auditoria de Escalação (IC/Skills)'}
          </button>
        </div>

        {/* Comparativo Lado a Lado (Toggle) */}
        <AnimatePresence>
          {showComparison && (
            <TeamMetricsComparison 
              teamA={{
                setter: getFullPlayer(result.teamA?.setter) || null,
                players: (result.teamA?.players || []).map(getFullPlayer).filter(Boolean) as Player[]
              }}
              teamB={{
                setter: getFullPlayer(result.teamB?.setter) || null,
                players: (result.teamB?.players || []).map(getFullPlayer).filter(Boolean) as Player[]
              }}
              topTwoIds={result.topTwoIds || []}
              bottomTwoIds={result.bottomTwoIds || []}
            />
          )}
        </AnimatePresence>

        {/* Banner com Progresso do Recálculo se ativo */}
        <AnimatePresence>
          {isRecalculating && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="bg-brand-primary/10 border border-brand-primary/30 p-3 rounded-2xl flex items-center justify-between text-brand-primary text-xs font-black uppercase tracking-wider shadow-inner">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-brand-primary" />
                  <span>Analisando Combinações de Balanceamento IC...</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-white/10 rounded-full h-1.5 overflow-hidden border border-brand-primary/20">
                    <motion.div 
                      className="bg-brand-primary h-full rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${((recalcCount || 1) / 12) * 100}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                  <span className="font-mono bg-brand-primary/20 px-2 py-0.5 rounded text-white border border-brand-primary/40 text-[10px]">
                    {recalcCount || 1} / 12
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legenda de Origem dos Atletas */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-3 text-[9px] font-black uppercase tracking-wider text-white/50 bg-white/5 p-2.5 rounded-xl border border-white/5">
            <span className="text-white/40">Status de Origem:</span>
            <span className="flex items-center gap-1 text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title="Atleta Top / Elite">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" /> Top (Elite)
            </span>
            <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20" title="Atleta Base / Bottom">
              <Shield className="w-2.5 h-2.5 text-rose-400" /> Base (Bottom)
            </span>
            <span className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20" title="Primeira partida da sessão">
              <Sparkles className="w-2.5 h-2.5 text-blue-400" /> [FI] Fila Inicial
            </span>
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20" title="Atleta estava na fila de espera">
              <UserCheck className="w-2.5 h-2.5 text-emerald-400" /> [ESP] Esperando (Fila)
            </span>
            <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title="Atleta estava jogando a última partida">
              <History className="w-2.5 h-2.5 text-amber-400" /> [UP] Última Partida
            </span>
          </div>

          <div className="flex flex-col gap-2 bg-white/5 p-3 rounded-xl border border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
              {result.combinationsCount && (
                <div className="flex items-center gap-1.5 text-[9px] font-black text-white/50 uppercase tracking-tighter">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  {result.combinationsCount.toLocaleString()} combinações analisadas
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {result.simulationNumber && (
                  <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white/50">
                    Simulação: <span className="text-amber-400 font-bold">#{result.simulationNumber}</span>
                  </span>
                )}
                {result.balancingStrategy && (
                  <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white/50">
                    Modo: <span className="text-brand-primary">{result.balancingStrategy === 'BOTH' ? 'Híbrido' : result.balancingStrategy === 'SYNERGY' ? 'Sinergia ML' : 'Habilidade Pura'}</span>
                  </span>
                )}
              </div>
            </div>

                        {/* Alerta Visual de Equilíbrio Validado (Tolerância <= 1) com Verificação de Segurança para diffTop */}
            {(() => {
              try {
                const diffTopVal = (typeof topBottomValidation !== 'undefined' && topBottomValidation?.diffTop != null)
                  ? Number(topBottomValidation.diffTop)
                  : ((typeof result !== 'undefined' && result?.diffTop != null) ? Number(result.diffTop) : 0);
                const diffBottomVal = (typeof topBottomValidation !== 'undefined' && topBottomValidation?.diffBottom != null)
                  ? Number(topBottomValidation.diffBottom)
                  : ((typeof result !== 'undefined' && result?.diffBottom != null) ? Number(result.diffBottom) : 0);
                const safeDiffTop = isNaN(diffTopVal) ? 0 : diffTopVal;
                const safeDiffBottom = isNaN(diffBottomVal) ? 0 : diffBottomVal;
                const isValidVal = Boolean(topBottomValidation?.isValid ?? (safeDiffTop <= 1 && safeDiffBottom <= 1));

                return (
                  <div className={`mt-2 p-2 rounded-lg border flex items-center justify-between shadow-sm ${isValidVal ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${isValidVal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        <Sparkles className="w-3 h-3" />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isValidVal ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isValidVal ? 'Equilíbrio Validado' : 'Aviso de Tolerância'} {isValidVal ? <Check className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}
                      </span>
                    </div>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold border ${isValidVal ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                      Top Diff: {safeDiffTop} | Bottom Diff: {safeDiffBottom}
                    </span>
                  </div>
                );
              } catch (safeRenderErr) {
                console.warn('[PreviewTeams] Falha segura ao renderizar tolerância de Top/Bottom:', safeRenderErr);
                return null;
              }
            })()}
            
            {/* Verificação Estatutária das Regras do Clube */}
            <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-black uppercase tracking-widest pt-0.5">
              {/* Regra de Levantador */}
              <span className={`px-2 py-0.5 rounded border flex items-center gap-1 transition-all ${
                rulesStatus.setter.fulfilled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
              }`} title={rulesStatus.setter.description}>
                {rulesStatus.setter.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                Levantadores: <span className={rulesStatus.setter.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rulesStatus.setter.badgeLabel}</span>
              </span>

              {/* Regra de Gênero */}
              <span className={`px-2 py-0.5 rounded border flex items-center gap-1 transition-all ${
                rulesStatus.gender.fulfilled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
              }`} title={rulesStatus.gender.description}>
                {rulesStatus.gender.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                Gênero: <span className={rulesStatus.gender.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rulesStatus.gender.badgeLabel}</span>
              </span>

              {/* Regra de Top e Bottom */}
              <span className={`px-2 py-0.5 rounded border flex items-center gap-1 transition-all ${
                rulesStatus.topBottom.fulfilled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`} title={rulesStatus.topBottom.description}>
                {rulesStatus.topBottom.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                Top/Bottom: <span className="text-white">{rulesStatus.topBottom.badgeLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {renderTeamList(result.teamA, 'A')}
            {renderTeamList(result.teamB, 'B')}
          </AnimatePresence>
        </div>

        {/* Status da Rodada (Feedback Imediato na Pré-visualização) */}
        <div className="mt-6">
          <RoundStatusCard generationResult={safeResultForAudit || result} />
        </div>

        <div className="flex flex-col gap-3 mt-6">
          <button 
            onClick={() => onConfirm(safeResultForAudit || result)} 
            className="w-full bg-brand-primary text-black font-black py-4 rounded-2xl hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-xl shadow-brand-primary/20 group cursor-pointer"
          >
              <Check className="w-5 h-5 text-black group-hover:scale-110 transition-transform" /> 
              <span className="uppercase tracking-widest text-xs sm:text-sm">Confirmar Escalação</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onRecalculate && (
              <button 
                onClick={onRecalculate}
                disabled={isRecalculating}
                className="w-full bg-black hover:bg-white/5 disabled:bg-black/40 disabled:text-white/20 text-brand-primary border border-brand-primary/40 hover:border-brand-primary font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-xl group cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 text-brand-primary ${isRecalculating ? 'animate-spin' : ''}`} /> 
                <span className="uppercase tracking-widest text-[10px] sm:text-xs">
                  {isRecalculating ? `Recalculando... (${recalcCount || 0}/12)` : 'Recalcular (12 Combos)'}
                </span>
              </button>
            )}

            <button 
              onClick={onRegenerate || onCancel} 
              className="w-full bg-brand-secondary/80 hover:bg-brand-secondary text-white/90 hover:text-white border border-brand-primary/40 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-xl group cursor-pointer"
            >
                <RefreshCw className="w-4 h-4 text-brand-primary group-hover:rotate-180 transition-transform duration-500" /> 
                <span className="uppercase tracking-widest text-[10px] sm:text-xs">Limpar / Voltar</span>
            </button>
          </div>
        </div>
    </div>
  );
};

export const TeamPreview = PreviewTeams;
export default PreviewTeams;


