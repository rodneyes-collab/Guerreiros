import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tv, 
  Maximize2, 
  Minimize2, 
  Swords, 
  Clock, 
  Users, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  ArrowRight,
  Flame,
  Award,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Check
} from 'lucide-react';
import { useStore } from '../store';
import { Player, Team, Gender } from '../types';
import { calculateCompositePerformanceRating, verifyClubGenerationRules } from '../utils/teamLogic';
import { formatTime } from '../utils/helpers';

interface CourtTabletViewProps {
  onBack?: () => void;
}

export const CourtTabletView: React.FC<CourtTabletViewProps> = ({ onBack }) => {
  const generationResult = useStore(state => state.generationResult);
  const nextMatchPreview = useStore(state => state.nextMatchPreview);
  const attendance = useStore(state => state.attendance);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const systemMetadata = useStore(state => state.systemMetadata);
  const setViewMode = useStore(state => state.setViewMode);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [matchDuration, setMatchDuration] = useState<number>(0);

  // Memoize rule verification to prevent heavy calculations on every second re-render
  const rules = useMemo(() => {
    if (!generationResult) return null;
    return verifyClubGenerationRules(generationResult);
  }, [generationResult]);

  const nextRules = useMemo(() => {
    if (!nextMatchPreview) return null;
    return verifyClubGenerationRules(nextMatchPreview);
  }, [nextMatchPreview]);

  // Relógio digital e cronômetro de partida em tempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      
      if (systemMetadata.matchStartTime) {
        const elapsed = Math.floor((Date.now() - systemMetadata.matchStartTime) / 1000);
        setMatchDuration(elapsed > 0 ? elapsed : 0);
      } else {
        setMatchDuration(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [systemMetadata.matchStartTime]);

  // Handler de Tela Cheia
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // Identificação das partidas de hoje
  const todayMatchesCount = matches.length;
  const currentMatchNumber = generationResult ? todayMatchesCount + 1 : todayMatchesCount;

  // Helper para buscar estatísticas atualizadas do jogador
  const getPlayerData = (id: string) => players.find(p => p.id === id);

  // Jogadores presentes que não estão em quadra na partida atual
  const activeInCurrentMatchIds = new Set<string>();
  if (generationResult) {
    if (generationResult.teamA.setter) activeInCurrentMatchIds.add(generationResult.teamA.setter.id);
    generationResult.teamA.players.forEach(p => activeInCurrentMatchIds.add(p.id));
    if (generationResult.teamB.setter) activeInCurrentMatchIds.add(generationResult.teamB.setter.id);
    generationResult.teamB.players.forEach(p => activeInCurrentMatchIds.add(p.id));
  }

  const waitingPlayers = attendance.filter(p => p.id && !activeInCurrentMatchIds.has(p.id));

  // Extracted PlayerMetricBadge to avoid re-renders on every clock tick
  const renderPlayerMetricBadge = (player: Player) => {
    const fullData = getPlayerData(player.id) || player;
    const ic = Math.round(calculateCompositePerformanceRating(fullData));
    return (
      <div className="flex items-center gap-1.5 ml-2">
        <span className="px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20 rounded text-[9px] font-black text-brand-primary">
          IC {ic}
        </span>
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] font-bold text-green-400">V{fullData.dailyWins || 0}</span>
          <span className="text-[9px] font-bold text-red-400">D{fullData.dailyLosses || 0}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col font-sans relative overflow-hidden select-none">
      {/* Glow e Efeitos de Fundo */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Control / Navigation Header */}
      <header className="flex items-center justify-between gap-4 pb-6 border-b border-white/10 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand-primary/20 border border-brand-primary/40 rounded-2xl text-brand-primary shadow-lg shadow-brand-primary/10">
            <Tv className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-ping"></span>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
                Painel da Quadra <span className="text-brand-primary">• Telão Guerreiros</span>
              </h1>
            </div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mt-0.5">
              Transmissão em tempo real do jogo e próxima escalação
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Relógio em Tempo Real */}
          <div className="hidden sm:flex flex-col items-end px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
            <span className="text-lg font-black font-mono text-brand-primary tracking-widest">
              {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Hora Local</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-3 bg-white/5 hover:bg-brand-primary/20 hover:text-brand-primary border border-white/10 hover:border-brand-primary/40 text-white rounded-2xl transition-all cursor-pointer flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            <span className="hidden md:inline">{isFullscreen ? 'Sair de Tela Cheia' : 'Tela Cheia'}</span>
          </button>

          {onBack ? (
            <button
              onClick={onBack}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all text-xs font-black uppercase tracking-widest border border-white/10 cursor-pointer"
            >
              Voltar
            </button>
          ) : (
            <button
              onClick={() => setViewMode('generation')}
              className="px-4 py-3 bg-brand-primary text-black hover:bg-brand-primary/90 rounded-2xl transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 cursor-pointer"
            >
              Voltar à Partida
            </button>
          )}
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 flex-1 relative z-10">
        
        {/* SEÇÃO 1: PARTIDA EM ANDAMENTO */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-gradient-to-b from-white/10 via-black to-black p-6 rounded-[2.5rem] border border-white/20 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[420px]">
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none"></div>

            {/* Cabeçalho do Card */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 relative z-10">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-brand-primary text-black text-xs font-black uppercase tracking-widest rounded-xl shadow-md flex items-center gap-1.5 animate-pulse">
                  <Flame className="w-4 h-4 fill-black" />
                  EM QUADRA
                </span>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
                  Partida #{currentMatchNumber}
                </h2>
              </div>
              
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 text-sm font-black text-brand-primary uppercase tracking-[0.2em]">
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(matchDuration)}</span>
                </div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Tempo de Jogo</span>
              </div>
            </div>

            {/* Visualização da Partida Atual */}
            {generationResult ? (
              <>
                {/* Verificação Estatutária das Regras do Clube (Partida Atual) */}
                {rules && (
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider bg-black/60 p-2.5 rounded-2xl border border-white/10 mt-3 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      rules.setter.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={rules.setter.description}>
                      {rules.setter.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Lev: <span className={rules.setter.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rules.setter.badgeLabel}</span>
                    </span>

                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      rules.gender.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={rules.gender.description}>
                      {rules.gender.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Gên: <span className={rules.gender.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{rules.gender.badgeLabel}</span>
                    </span>

                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      rules.topBottom.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={rules.topBottom.description}>
                      {rules.topBottom.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Top/Bot: <span className="text-white">{rules.topBottom.badgeLabel}</span>
                    </span>
                  </div>
                )}

                <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                {/* TIME A */}
                <div className="bg-black/80 border-2 border-brand-primary/60 rounded-3xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-4 py-1.5 bg-brand-primary text-black font-black text-[10px] uppercase tracking-widest rounded-bl-2xl">
                    TIME A
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5" />
                      TIME A
                    </h3>

                    {/* Levantador */}
                    {generationResult.teamA.setter && (
                      <div className="mb-3 p-2.5 bg-brand-primary/10 border border-brand-primary/30 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-brand-primary text-black text-[9px] font-black uppercase tracking-wider rounded-md">
                            LEV
                          </span>
                          <span className="text-sm font-black text-white uppercase tracking-tight">
                            {generationResult.teamA.setter.name}
                          </span>
                        </div>
                        {renderPlayerMetricBadge(generationResult.teamA.setter)}
                      </div>
                    )}

                    {/* Atacantes / Linha */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">
                        Jogadores de Linha
                      </p>
                      {generationResult.teamA.players.map(player => (
                        <div key={player.id} className="p-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:border-brand-primary/30 transition-all">
                          <span className="text-xs font-bold text-white/90 uppercase tracking-tight">
                            {player.name}
                          </span>
                          {renderPlayerMetricBadge(player)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TIME B */}
                <div className="bg-black/80 border-2 border-white/20 rounded-3xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-4 py-1.5 bg-white/20 text-white font-black text-[10px] uppercase tracking-widest rounded-bl-2xl">
                    TIME B
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-white/60" />
                      TIME B
                    </h3>

                    {/* Levantador */}
                    {generationResult.teamB.setter && (
                      <div className="mb-3 p-2.5 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-white text-black text-[9px] font-black uppercase tracking-wider rounded-md">
                            LEV
                          </span>
                          <span className="text-sm font-black text-white uppercase tracking-tight">
                            {generationResult.teamB.setter.name}
                          </span>
                        </div>
                        {renderPlayerMetricBadge(generationResult.teamB.setter)}
                      </div>
                    )}

                    {/* Atacantes / Linha */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">
                        Jogadores de Linha
                      </p>
                      {generationResult.teamB.players.map(player => (
                        <div key={player.id} className="p-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:border-white/30 transition-all">
                          <span className="text-xs font-bold text-white/90 uppercase tracking-tight">
                            {player.name}
                          </span>
                          {renderPlayerMetricBadge(player)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </>
            ) : (
              <div className="my-auto py-12 flex flex-col items-center justify-center text-center gap-3">
                <Swords className="w-16 h-16 text-white/20 animate-bounce" />
                <h3 className="text-xl font-black uppercase tracking-tight text-white/80">
                  Nenhuma partida em andamento no momento
                </h3>
                <p className="text-xs text-white/40 max-w-sm font-bold uppercase tracking-widest">
                  O Administrador irá sortear os times e iniciar a quadra em breve.
                </p>
              </div>
            )}

            {/* Footer do Card */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/50 relative z-10">
              <span>Guerreiros Volleyball Club</span>
              <span>Quadra Oficial</span>
            </div>
          </div>
        </div>

        {/* SEÇÃO 2: PRÓXIMA PARTIDA PREVIEW & FILA */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-to-b from-white/10 via-black to-black p-6 rounded-[2.5rem] border border-white/20 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[420px]"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Cabeçalho do Card */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 relative z-10">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-brand-primary text-black text-xs font-black uppercase tracking-widest rounded-xl shadow-md flex items-center gap-1.5 animate-pulse">
                  <Sparkles className="w-4 h-4 fill-black" />
                  EM BREVE
                </span>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
                  Próxima Partida
                </h2>
              </div>
              <div className="px-3 py-1 bg-white/10 border border-white/20 text-white text-[9px] font-black uppercase tracking-widest rounded-full">
                Sorteado
              </div>
            </div>

            {nextMatchPreview ? (
              <>
                {/* Verificação Estatutária das Regras do Clube (Próxima Partida) */}
                {nextRules && (
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider bg-black/60 p-2.5 rounded-2xl border border-white/10 mt-3 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      nextRules.setter.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={nextRules.setter.description}>
                      {nextRules.setter.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Lev: <span className={nextRules.setter.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{nextRules.setter.badgeLabel}</span>
                    </span>

                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      nextRules.gender.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={nextRules.gender.description}>
                      {nextRules.gender.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Gên: <span className={nextRules.gender.fulfilled ? 'text-white' : 'text-rose-400 font-bold'}>{nextRules.gender.badgeLabel}</span>
                    </span>

                    <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      nextRules.topBottom.fulfilled 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`} title={nextRules.topBottom.description}>
                      {nextRules.topBottom.fulfilled ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      Top/Bot: <span className="text-white">{nextRules.topBottom.badgeLabel}</span>
                    </span>
                  </div>
                )}

                <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                {/* TIME A PREVIEW */}
                <motion.div 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-black/80 border-2 border-brand-primary/60 rounded-3xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 px-4 py-1.5 bg-brand-primary text-black font-black text-[10px] uppercase tracking-widest rounded-bl-2xl">
                    TIME A
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5" />
                      TIME A
                    </h3>

                    {/* Levantador */}
                    {nextMatchPreview.teamA.setter && (
                      <div className="mb-3 p-2.5 bg-brand-primary/10 border border-brand-primary/30 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-brand-primary text-black text-[9px] font-black uppercase tracking-wider rounded-md">
                            LEV
                          </span>
                          <span className="text-sm font-black text-white uppercase tracking-tight">
                            {nextMatchPreview.teamA.setter.name}
                          </span>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${activeInCurrentMatchIds.has(nextMatchPreview.teamA.setter.id) ? 'bg-orange-500 text-white shadow-sm' : 'bg-white/10 text-white/40'}`}>
                            {activeInCurrentMatchIds.has(nextMatchPreview.teamA.setter.id) ? 'Quadra' : 'Fila'}
                          </span>
                        </div>
                        {renderPlayerMetricBadge(nextMatchPreview.teamA.setter)}
                      </div>
                    )}

                    {/* Atacantes / Linha */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">
                        Jogadores de Linha
                      </p>
                      {nextMatchPreview.teamA.players.map((p, idx) => (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 + (idx * 0.05) }}
                          key={p.id} 
                          className="p-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:border-brand-primary/30 transition-all"
                        >
                          <div className="flex items-center gap-1.5 overflow-visible">
                            <span className="text-xs font-bold text-white/90 whitespace-normal uppercase tracking-tight">{p.name}</span>
                            <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase flex-shrink-0 ${activeInCurrentMatchIds.has(p.id) ? 'bg-orange-500 text-white shadow-sm' : 'bg-white/10 text-white/40'}`}>
                              {activeInCurrentMatchIds.has(p.id) ? 'Quadra' : 'Fila'}
                            </span>
                          </div>
                          {renderPlayerMetricBadge(p)}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* TIME B PREVIEW */}
                <motion.div 
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-black/80 border-2 border-white/20 rounded-3xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 px-4 py-1.5 bg-white/20 text-white font-black text-[10px] uppercase tracking-widest rounded-bl-2xl">
                    TIME B
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-white/60" />
                      TIME B
                    </h3>

                    {/* Levantador */}
                    {nextMatchPreview.teamB.setter && (
                      <div className="mb-3 p-2.5 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-between flex-row-reverse">
                        <div className="flex items-center gap-2 flex-row-reverse">
                          <span className="px-2 py-0.5 bg-white text-black text-[9px] font-black uppercase tracking-wider rounded-md">
                            LEV
                          </span>
                          <span className="text-sm font-black text-white uppercase tracking-tight text-right">
                            {nextMatchPreview.teamB.setter.name}
                          </span>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${activeInCurrentMatchIds.has(nextMatchPreview.teamB.setter.id) ? 'bg-orange-500 text-white shadow-sm' : 'bg-white/10 text-white/40'}`}>
                            {activeInCurrentMatchIds.has(nextMatchPreview.teamB.setter.id) ? 'Quadra' : 'Fila'}
                          </span>
                        </div>
                        {renderPlayerMetricBadge(nextMatchPreview.teamB.setter)}
                      </div>
                    )}

                    {/* Atacantes / Linha */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1 text-right">
                        Jogadores de Linha
                      </p>
                      {nextMatchPreview.teamB.players.map((p, idx) => (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 + (idx * 0.05) }}
                          key={p.id} 
                          className="p-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between flex-row-reverse group hover:border-white/30 transition-all"
                        >
                          <div className="flex items-center gap-1.5 flex-row-reverse overflow-visible">
                            <span className="text-xs font-bold text-white/90 whitespace-normal uppercase tracking-tight text-right">{p.name}</span>
                            <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase flex-shrink-0 ${activeInCurrentMatchIds.has(p.id) ? 'bg-orange-500 text-white shadow-sm' : 'bg-white/10 text-white/40'}`}>
                              {activeInCurrentMatchIds.has(p.id) ? 'Quadra' : 'Fila'}
                            </span>
                          </div>
                          {renderPlayerMetricBadge(p)}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
              </>
            ) : (
              <div className="my-auto py-12 bg-white/5 border border-dashed border-brand-primary/20 rounded-3xl text-center flex flex-col items-center justify-center gap-4 relative z-10">
                <div className="relative">
                  <Clock className="w-12 h-12 text-brand-primary/30" />
                  {generationResult && attendance.length >= 12 && (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className="absolute -inset-4 border-2 border-dashed border-brand-primary/40 rounded-full"
                    />
                  )}
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-white">
                    {attendance.length < 12 
                      ? "Fila Insuficiente" 
                      : (generationResult ? "Guerreiros Intelligence" : "Aguardando Sorteio")}
                  </p>
                  <p className="text-[10px] text-white/40 max-w-[200px] font-bold uppercase mt-1 leading-relaxed">
                    {attendance.length < 12 
                      ? `Faltam ${12 - attendance.length} jogadores na fila para a próxima rodagem.` 
                      : (generationResult 
                        ? "Calculando equilíbrio técnico para a próxima rodagem..." 
                        : "Aguardando a diretoria definir os próximos jogadores da fila.")}
                  </p>
                </div>
              </div>
            )}

            {/* Footer do Card */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/50 relative z-10">
              <span>Guerreiros Volleyball Club</span>
              <span>Em Breve na Quadra</span>
            </div>
          </motion.div>

          {/* FILA DE ESPERA DA RODAGEM */}
          <div className="bg-black/90 p-6 rounded-[2.5rem] border border-white/10 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Fila de Espera <span className="text-white/40">({waitingPlayers.length})</span>
                  </h3>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-primary">
                  Prioridade de Rodagem
                </span>
              </div>

              {waitingPlayers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
                  {waitingPlayers.map((player, idx) => (
                    <div
                      key={player.id}
                      className="p-2.5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-2 hover:border-brand-primary/20 transition-colors"
                    >
                      <span className="w-5 h-5 rounded-full bg-brand-primary/20 border border-brand-primary/40 text-brand-primary font-mono text-[9px] font-black flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate flex-1">
                        <p className="text-xs font-bold text-white truncate uppercase tracking-tight">
                          {player.name}
                        </p>
                        {renderPlayerMetricBadge(player)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40 italic py-4 text-center">
                  Todos os sócios presentes estão atualmente em quadra!
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 text-[9px] font-bold uppercase tracking-widest text-white/30 text-center flex items-center justify-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              Guerreiros Intelligence v3.2
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

