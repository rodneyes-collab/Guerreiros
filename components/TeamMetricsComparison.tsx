import React from 'react';
import { motion } from 'motion/react';
import { Player, Gender } from '../types';
import { calculateCompositePerformanceRating } from '../utils/teamLogic';
import { Scale, Users, ShieldCheck, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';

interface TeamMetricsComparisonProps {
  teamA: {
    setter: Player | null;
    players: Player[];
  };
  teamB: {
    setter: Player | null;
    players: Player[];
  };
  topTwoIds?: string[];
  bottomTwoIds?: string[];
}

export const TeamMetricsComparison: React.FC<TeamMetricsComparisonProps> = ({
  teamA,
  teamB,
  topTwoIds = [],
  bottomTwoIds = []
}) => {
  const SAFE_MALE = (typeof Gender !== 'undefined' && Gender?.MALE) ? Gender.MALE : ('MALE' as Gender);

  const playersA = [teamA.setter, ...(teamA.players || [])]
    .filter(Boolean)
    .map(p => ({ ...p, gender: p.gender || SAFE_MALE })) as Player[];
  const playersB = [teamB.setter, ...(teamB.players || [])]
    .filter(Boolean)
    .map(p => ({ ...p, gender: p.gender || SAFE_MALE })) as Player[];

  // 1. Avg IC & Total IC
  const totalIcA = playersA.reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0);
  const totalIcB = playersB.reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0);
  const avgIcA = playersA.length > 0 ? totalIcA / playersA.length : 0;
  const avgIcB = playersB.length > 0 ? totalIcB / playersB.length : 0;
  const deltaIc = Math.abs(totalIcA - totalIcB);
  const deltaAvgIc = Math.abs(avgIcA - avgIcB);

  // 2. Setter Distribution
  const settersA = playersA.filter(p => p.isOfficialSetter);
  const settersB = playersB.filter(p => p.isOfficialSetter);
  const setterNameA = teamA.setter ? teamA.setter.name : 'Sem Levantador';
  const setterNameB = teamB.setter ? teamB.setter.name : 'Sem Levantador';
  const isSetterEven = (settersA.length === 1 && settersB.length === 1) || (settersA.length === 0 && settersB.length === 0);

  // 3. Gender Balance
  const isMale = (p: Player) => {
    const g = String(p.gender || SAFE_MALE).toUpperCase();
    return g === 'MALE' || g === 'M';
  };
  const isFemale = (p: Player) => {
    const g = String(p.gender || SAFE_MALE).toUpperCase();
    return g === 'FEMALE' || g === 'F';
  };
  const menA = playersA.filter(isMale).length;
  const womenA = playersA.filter(isFemale).length;
  const menB = playersB.filter(isMale).length;
  const womenB = playersB.filter(isFemale).length;
  const isGenderEven = Math.abs(menA - menB) <= 1;

  // 4. Top 2 and Bottom 2 Allocation
  const t2A = playersA.filter(p => topTwoIds.includes(p.id));
  const t2B = playersB.filter(p => topTwoIds.includes(p.id));
  const b2A = playersA.filter(p => bottomTwoIds.includes(p.id));
  const b2B = playersB.filter(p => bottomTwoIds.includes(p.id));
  const isTopBottomSeparated = t2A.length <= 1 && t2B.length <= 1 && b2A.length <= 1 && b2B.length <= 1;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-black/95 border border-brand-primary/40 p-5 rounded-2xl mb-5 shadow-2xl backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/30">
            <Scale className="w-4 h-4 text-brand-primary" />
          </div>
          <div>
            <h5 className="text-xs font-black text-white uppercase tracking-widest">
              Comparativo Lado a Lado dos Times
            </h5>
            <p className="text-[9px] text-white/50 font-bold uppercase tracking-wider">
              Métricas Oficiais de Balanceamento Pré-Confirmação
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
            deltaIc <= 8 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : deltaIc <= 15
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            <Activity className="w-3 h-3" />
            Δ IC: {deltaIc.toFixed(1)} pts ({deltaIc <= 8 ? 'Excelente' : deltaIc <= 15 ? 'Bom' : 'Ajustado'})
          </span>
        </div>
      </div>

      {/* Grid Comparativa Lado a Lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Time A */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-black text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-primary" />
              Equipe A
            </span>
            <span className="text-[10px] font-mono font-bold text-white/70">
              {playersA.length} Atletas
            </span>
          </div>

          <div className="space-y-2 text-[10px]">
            {/* Avg IC */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Média de IC (Avg IC):</span>
              <span className="font-mono font-black text-white text-xs">
                {avgIcA.toFixed(1)} <span className="text-[9px] text-white/40 font-normal">/ atleta</span>
              </span>
            </div>
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">IC Total da Equipe:</span>
              <span className="font-mono font-black text-brand-primary text-xs">
                {totalIcA.toFixed(1)} pts
              </span>
            </div>

            {/* Levantador */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Levantador(a):</span>
              <span className="font-black text-white flex items-center gap-1">
                {setterNameA}
                {teamA.setter?.isOfficialSetter && (
                  <span className="bg-brand-primary text-black text-[8px] font-black px-1 rounded">L</span>
                )}
              </span>
            </div>

            {/* Balanço de Gênero */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Proporção de Gênero:</span>
              <span className="font-black text-white font-mono">
                {menA}M / {womenA}F
              </span>
            </div>

            {/* Destaque / Base */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Top 2 / Bottom 2:</span>
              <span className="font-black text-white text-[9px]">
                {t2A.length} Top • {b2A.length} Bottom
              </span>
            </div>
          </div>
        </div>

        {/* Time B */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/70" />
              Equipe B
            </span>
            <span className="text-[10px] font-mono font-bold text-white/70">
              {playersB.length} Atletas
            </span>
          </div>

          <div className="space-y-2 text-[10px]">
            {/* Avg IC */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Média de IC (Avg IC):</span>
              <span className="font-mono font-black text-white text-xs">
                {avgIcB.toFixed(1)} <span className="text-[9px] text-white/40 font-normal">/ atleta</span>
              </span>
            </div>
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">IC Total da Equipe:</span>
              <span className="font-mono font-black text-brand-primary text-xs">
                {totalIcB.toFixed(1)} pts
              </span>
            </div>

            {/* Levantador */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Levantador(a):</span>
              <span className="font-black text-white flex items-center gap-1">
                {setterNameB}
                {teamB.setter?.isOfficialSetter && (
                  <span className="bg-brand-primary text-black text-[8px] font-black px-1 rounded">L</span>
                )}
              </span>
            </div>

            {/* Balanço de Gênero */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Proporção de Gênero:</span>
              <span className="font-black text-white font-mono">
                {menB}M / {womenB}F
              </span>
            </div>

            {/* Destaque / Base */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="text-white/60 font-bold uppercase">Top 2 / Bottom 2:</span>
              <span className="font-black text-white text-[9px]">
                {t2B.length} Top • {b2B.length} Bottom
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo de Conformidade das Métricas */}
      <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-wider">
        <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
          deltaAvgIc <= 2 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        }`}>
          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
          <span>Equilíbrio IC: Δ {deltaAvgIc.toFixed(1)} / atleta</span>
        </div>

        <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
          isSetterEven 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        }`}>
          {isSetterEven ? <ShieldCheck className="w-3 h-3 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
          <span>Levantadores: {isSetterEven ? '1 por time' : 'Ajustar posição'}</span>
        </div>

        <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
          isGenderEven 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        }`}>
          <Users className="w-3 h-3 flex-shrink-0" />
          <span>Gênero: {isGenderEven ? 'Paritário (±1)' : 'Desbalanceado'}</span>
        </div>
      </div>
    </motion.div>
  );
};
