import React, { useState } from 'react';
import { useStore } from '../store';
import { TeamCard } from './TeamCard';
import { formatTime } from '../utils/helpers';
import { getFirestoreDateKey } from '../firebase';
import { 
  Swords, 
  Trophy,
  Sparkles,
  RefreshCw,
  ArrowRight, 
  Hash, 
  History,
  Gem, 
  Scale, 
  GraduationCap, 
  Clock, 
  Volume2, 
  Megaphone, 
  ArrowLeftRight,
  ShieldCheck,
  X,
  Trash2,
  Plus,
  Minus,
  Users,
  ClipboardCheck,
  BarChart3,
  Settings2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { PlayerStatusCard } from '../src/components/PlayerStatusCard';
import { getPriorityQueue } from '../utils/teamLogic';
import { Player, SystemMetadata } from '../types';

interface MatchViewProps {
  onGenerate: (onlyCurrentPlayers?: boolean) => void;
  onDiscard: () => void;
  onFinishDay: () => void;
  onFinishMatch: (winner: 'A' | 'B') => void;
  onVerifyRules: () => void;
  onAnalyzeMatch: () => void;
  recalculateDailyStats: () => void;
  isVerifyingRules: boolean;
  isAnalyzing: boolean;
  isNarratingSummary: boolean;
  onAnnounce: () => void;
  onSwapClick: (source: 'A' | 'B' | 'Bench', playerId: string) => void;
  onRemovePlayer: (team: 'A' | 'B', playerId: string) => void;
  onPromoteToSetter: (team: 'A' | 'B', playerId: string) => void;
  systemMetadata: SystemMetadata;
  updateSystemMetadata: (metadata: Partial<SystemMetadata>) => void;
}

export const MatchView: React.FC<MatchViewProps> = ({
  onGenerate,
  onDiscard,
  onFinishDay,
  onFinishMatch,
  onVerifyRules,
  onAnalyzeMatch,
  recalculateDailyStats,
  isVerifyingRules,
  isAnalyzing,
  isNarratingSummary,
  onAnnounce,
  onSwapClick,
  onRemovePlayer,
  onPromoteToSetter,
  systemMetadata,
  updateSystemMetadata
}) => {
  const { 
    generationResult, 
    attendance: allAttendance, 
    userRole, 
    matches,
    setGenerationResult,
    setViewMode,
    isNarrating,
    scoreMode,
    setScoreMode,
    scoreA,
    setScoreA,
    scoreB,
    setScoreB,
    tempScoreA,
    setTempScoreA,
    tempScoreB,
    setTempScoreB,
    analysis,
    ruleVerification,
    elapsedTime,
    swapSelection,
    setSwapSelection
  } = useStore();
  const attendance = React.useMemo(() => allAttendance.filter(p => p.status !== 'inactive'), [allAttendance]);
  const { currentPlayer } = useStore();

  const [showAudit, setShowAudit] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showActions, setShowActions] = useState(false);
  
  const showTeamCards = systemMetadata.showTeamCards !== false;
  const showWaitlist = systemMetadata.showWaitlist !== false;
  const showPerformance = systemMetadata.showPerformance !== false;

  const toggleTeamCards = () => updateSystemMetadata({ showTeamCards: !showTeamCards });
  const toggleWaitlist = () => updateSystemMetadata({ showWaitlist: !showWaitlist });
  const togglePerformance = () => updateSystemMetadata({ showPerformance: !showPerformance });

  const today = getFirestoreDateKey();
  const sixteenHoursAgo = Date.now() - (16 * 60 * 60 * 1000);
  const resetThreshold = systemMetadata.lastResetTimestamp || sixteenHoursAgo;
  
  const todayMatches = (matches || [])
    .filter(m => m.date === today && m.timestamp > resetThreshold)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  const hiddenTodayMatches = (matches || [])
    .filter(m => m.date === today && m.timestamp <= resetThreshold);
  
  // Usar o contador do sistema como fonte primária, com fallback para o cálculo local
  // Se não houver partida gerada, o próximo número será o contador atual + 1
  const currentMatchNumber = generationResult ? (systemMetadata.dailyMatchCount || todayMatches.length) : (systemMetadata.dailyMatchCount || todayMatches.length) + 1;

  // Métricas de Tempo
  const avgMatchDuration = todayMatches.length > 0
    ? todayMatches.reduce((acc, m) => acc + (m.duration || 0), 0) / todayMatches.length
    : 15 * 60; // Média padrão de 15 minutos

  const quickestMatch = todayMatches.length > 0
    ? Math.min(...todayMatches.map(m => m.duration || Infinity))
    : null;
    
  const longestMatch = todayMatches.length > 0
    ? Math.max(...todayMatches.map(m => m.duration || 0))
    : null;

  // Lógica de Previsão de Rodízio (Levantadores vs Linha)
  const settersInWait = generationResult?.remainingPlayers.filter(p => p.isOfficialSetter) || [];
  const linePlayersInWait = generationResult?.remainingPlayers.filter(p => !p.isOfficialSetter) || [];
  const currentSettersCount = (generationResult?.teamA.setter ? 1 : 0) + (generationResult?.teamB.setter ? 1 : 0);
  const currentLineCount = (generationResult?.teamA.players.length || 0) + (generationResult?.teamB.players.length || 0);
  
  const settersCapacity = currentSettersCount || 2;
  const lineCapacity = currentLineCount || 10;

  const getPlayerPrediction = (player: any) => {
    let matchesToWait = 0;
    if (player.isOfficialSetter) {
      const sIdx = settersInWait.findIndex(p => p.id === player.id);
      matchesToWait = Math.floor(sIdx / settersCapacity) + 1;
    } else {
      const lIdx = linePlayersInWait.findIndex(p => p.id === player.id);
      matchesToWait = Math.floor(lIdx / lineCapacity) + 1;
    }

    const label = matchesToWait === 1 ? '1ª' : `${matchesToWait}ª`;
    
    // Cálculo de tempo estimado
    let remainingCurrent = avgMatchDuration - elapsedTime;
    let isOvertime = false;
    
    if (remainingCurrent <= 0) {
      remainingCurrent = Math.max(120, avgMatchDuration * 0.15); 
      isOvertime = true;
    }
    
    const totalWaitSeconds = remainingCurrent + (matchesToWait - 1) * avgMatchDuration;
    
    const startTime = new Date(Date.now() + totalWaitSeconds * 1000);
    const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `• ${timeStr}`;
  };

  const { topPlayers, remainingPlayers } = getPriorityQueue(attendance, 12, 2);
  const priorityPlayers = [...topPlayers, ...remainingPlayers];

  const getEloChanges = () => {
    if (!generationResult) return { aWin: 0, aLoss: 0, bWin: 0, bLoss: 0 };
    const teamA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
    const teamB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];
    
    const avgEloA = teamA.reduce((sum, p) => sum + p.elo, 0) / (teamA.length || 1);
    const avgEloB = teamB.reduce((sum, p) => sum + p.elo, 0) / (teamB.length || 1);
    
    const expectedA = 1 / (1 + Math.pow(10, (avgEloB - avgEloA) / 400));
    const expectedB = 1 - expectedA;
    
    const K = 32;
    return {
      aWin: Math.round(K * (1 - expectedA)),
      aLoss: Math.round(K * (0 - expectedA)),
      bWin: Math.round(K * (1 - expectedB)),
      bLoss: Math.round(K * (0 - expectedB))
    };
  };

  const eloChanges = getEloChanges();

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      {/* Status do Sócio Logado */}
      {currentPlayer && userRole === 'MEMBER' && (
        <div className="bg-brand-secondary/40 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 border border-brand-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 shadow-2xl">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-brand-primary/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-black text-white/40 uppercase tracking-[0.2em]">Seu Status Atual</p>
              <p className="text-sm sm:text-lg font-black text-white uppercase tracking-tight">{currentPlayer.name}</p>
            </div>
          </div>
          <PlayerStatusCard 
            currentPlayer={currentPlayer}
            attendance={attendance}
            generationResult={generationResult}
            matches={matches}
            systemMetadata={systemMetadata}
            activeTournament={useStore.getState().activeTournament}
          />
        </div>
      )}

      {/* Alerta de Partidas Ocultas (Recuperação) */}
      {hiddenTodayMatches.length > 0 && (
        <div className="mb-6 bg-brand-secondary border-2 border-brand-primary/20 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-brand-primary/10 p-3 rounded-2xl">
              <History className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-tight">Partidas de hoje encontradas!</p>
              <p className="text-xs text-white/60 font-medium">Detectamos {hiddenTodayMatches.length} partidas realizadas hoje que não estão sendo exibidas.</p>
            </div>
          </div>
          <button 
            onClick={recalculateDailyStats}
            className="bg-brand-primary hover:bg-brand-primary/90 text-brand-secondary text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2 whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" /> Restaurar Histórico
          </button>
        </div>
      )}

      {!generationResult ? (
        <div className="min-h-[600px] flex flex-col items-center justify-center text-center space-y-10 bg-black rounded-[3rem] border border-brand-primary/20 p-10 py-20 shadow-2xl animate-in fade-in zoom-in duration-1000">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-primary/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="bg-brand-secondary p-10 rounded-full relative z-10 border border-brand-primary/30 shadow-2xl">
              <Swords className="w-20 h-20 text-brand-primary" />
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-none">Pronto para a Batalha?</h2>
            {attendance.length < 12 && (
              <p className="text-lg text-brand-primary max-w-md mx-auto font-black uppercase tracking-widest opacity-80">
                Convoque pelo menos 12 guerreiros. Atualmente: {attendance.length}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-6 w-full max-w-sm">
            {userRole === 'ADMIN' ? (
              <button 
                onClick={() => onGenerate()} 
                disabled={attendance.length < 12}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:bg-brand-secondary disabled:text-white/40 text-brand-secondary font-black py-6 rounded-3xl shadow-2xl shadow-brand-primary/20 transition-all flex items-center justify-center gap-4 uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 border border-brand-primary/20 disabled:border-white/10"
              >
                Escalar Elite <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="bg-brand-secondary/50 p-6 rounded-3xl border border-brand-primary/10">
                <p className="text-xs font-black text-brand-primary uppercase tracking-[0.2em] animate-pulse">Aguardando comando do organizador...</p>
              </div>
            )}
          </div>

          {systemMetadata.showEliteQueue && attendance.length >= 12 && priorityPlayers.length > 0 && (
            <div className="w-full max-w-4xl bg-brand-secondary/30 border border-brand-primary/10 rounded-[3rem] p-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 shadow-inner">
              <div className="flex items-center gap-3 mb-8 justify-center">
                <Clock className="w-5 h-5 text-brand-primary" />
                <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Gestão de Fila e Prioridade de Elite</span>
              </div>

              {/* Grupo 1: Prováveis Próximos (Top 12) */}
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-brand-primary/10" />
                  <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Prováveis Próximos (Top 12)</span>
                  <div className="h-px flex-1 bg-brand-primary/10" />
                </div>
                
                <div className="flex overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center gap-4 snap-x scrollbar-hide">
                  {priorityPlayers.slice(0, 12).map((p) => (
                    <div 
                      key={p.id} 
                      className={`relative flex flex-col items-center px-6 py-4 rounded-[2rem] border shadow-xl transition-all duration-500 bg-black shrink-0 snap-center min-w-[140px] group hover:-translate-y-2 ${
                        (p.consecutiveBenched || 0) >= 2 
                          ? 'border-red-500/50 ring-4 ring-red-500/10' 
                          : 'border-brand-primary/20 hover:border-brand-primary/50'
                      }`}
                    >
                      <span className={`text-xs font-black uppercase truncate max-w-[110px] flex items-center gap-2 ${
                        (p.consecutiveBenched || 0) >= 2 ? 'text-red-500' : 'text-white'
                      }`}>
                        {p.name}
                        {p.timestamp && (
                          <span className="text-[8px] text-white/30 font-medium lowercase tracking-normal">
                            {new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {p.isOfficialSetter && (
                          <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)] animate-pulse" title="Levantador Oficial" />
                        )}
                      </span>
                      <span className={`text-[9px] font-black uppercase mt-1.5 tracking-widest ${
                        (p.consecutiveBenched || 0) >= 2 ? 'text-red-400' : 'text-white/60'
                      }`}>
                        {(p.consecutiveBenched || 0) > 0 
                          ? `${p.consecutiveBenched} ${p.consecutiveBenched <= 1 ? 'partida' : 'partidas'} fora`
                          : 'Na fila'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grupo 2: Demais na Fila (13+) */}
              {priorityPlayers.length > 12 && (
                <div className="space-y-6 mt-10">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-brand-primary/10" />
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Demais na Fila</span>
                    <div className="h-px flex-1 bg-brand-primary/10" />
                  </div>
                  
                  <div className="flex overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center gap-3 scrollbar-hide">
                    {priorityPlayers.slice(12).map((p) => (
                      <div 
                        key={p.id} 
                        className="flex items-center gap-3 bg-black border border-brand-primary/10 px-5 py-2.5 rounded-2xl shrink-0 hover:bg-white/5 transition-colors"
                      >
                        <span className="text-[10px] font-black text-white uppercase tracking-tight">{p.name}</span>
                        <span className="text-[9px] font-black text-brand-primary uppercase bg-brand-primary/10 px-2 py-0.5 rounded-lg border border-brand-primary/20">{p.consecutiveBenched} {p.consecutiveBenched <= 1 ? 'partida' : 'partidas'} fora</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-10 text-center italic">
                * Algoritmo de Prioridade: Menos jogos e maior tempo de banco
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-6 mb-8">
            {/* Botões de Ação */}
            {userRole === 'ADMIN' && (
              <div className="bg-black/40 backdrop-blur-md p-4 sm:p-6 rounded-[2rem] sm:rounded-[3rem] border border-white/5 shadow-inner">
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="w-full flex items-center justify-between text-white font-black uppercase tracking-widest text-xs sm:text-sm hover:text-brand-primary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-5 h-5 text-brand-primary" />
                    <span>Ações da Partida</span>
                  </div>
                  {showActions ? <ChevronUp className="w-5 h-5 text-brand-primary" /> : <ChevronDown className="w-5 h-5 text-brand-primary" />}
                </button>

                {showActions && (
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/10 animate-in slide-in-from-top-2 fade-in duration-300">
                    <button 
                      onClick={() => {
                        if (!showAudit && !ruleVerification) {
                          onVerifyRules();
                        }
                        setShowAudit(!showAudit);
                      }} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showAudit ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/20 text-white hover:bg-white/5'}`}
                    >
                      <ShieldCheck className={`w-4 h-4 ${showAudit ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showAudit ? 'Ocultar Auditoria' : 'Auditoria IA'}
                    </button>

                    <button 
                      onClick={() => {
                        if (!showAnalysis && !analysis) {
                          onAnalyzeMatch();
                        }
                        setShowAnalysis(!showAnalysis);
                      }} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showAnalysis ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/20 text-white hover:bg-white/5'}`}
                    >
                      <Sparkles className={`w-4 h-4 ${showAnalysis ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showAnalysis ? 'Ocultar Análise' : 'Análise IA'}
                    </button>

                    <button 
                      onClick={toggleTeamCards} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showTeamCards ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/20 text-white hover:bg-white/5'}`}
                    >
                      <Users className={`w-4 h-4 ${showTeamCards ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showTeamCards ? 'Ocultar Times' : 'Mostrar Times'}
                    </button>

                    <button 
                      onClick={toggleWaitlist} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showWaitlist ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/20 text-white hover:bg-white/5'}`}
                    >
                      <Clock className={`w-4 h-4 ${showWaitlist ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showWaitlist ? 'Ocultar Fila' : 'Mostrar Fila'}
                    </button>

                    <button 
                      onClick={togglePerformance} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showPerformance ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/20 text-white hover:bg-white/5'}`}
                    >
                      <BarChart3 className={`w-4 h-4 ${showPerformance ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showPerformance ? 'Ocultar Performance' : 'Mostrar Performance'}
                    </button>

                    <button 
                      onClick={onAnnounce} 
                      disabled={isNarrating}
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-8 py-4 rounded-2xl shadow-2xl transition-all ${isNarrating ? 'bg-brand-primary/50 text-brand-secondary animate-pulse' : 'bg-brand-primary text-brand-secondary hover:scale-105 border border-brand-primary/30'}`}
                    >
                      {isNarrating ? <Volume2 className="w-4 h-4 animate-bounce" /> : <Megaphone className="w-4 h-4" />}
                      {isNarrating ? 'Anunciando...' : 'Anunciar Times'}
                    </button>

                    <button 
                      onClick={() => onGenerate(true)} 
                      className="text-[10px] font-black uppercase bg-black text-white border border-brand-primary/20 px-8 py-4 rounded-2xl shadow-2xl hover:bg-white/5 transition-all"
                    >
                      Nova Escalação
                    </button>

                    <button 
                      onClick={onDiscard} 
                      className="flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border border-red-500/30 bg-black text-red-500 hover:bg-red-500/10 transition-all shadow-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Análise IA */}
          {userRole === 'ADMIN' && showAnalysis && (analysis || isAnalyzing) && (
            <div className="bg-brand-primary/5 rounded-[2.5rem] p-10 mb-10 border border-brand-primary/20 shadow-2xl relative overflow-hidden group animate-in slide-in-from-top-6 duration-700">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-all duration-700">
                <Sparkles className="w-40 h-40 text-brand-primary" />
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl bg-brand-primary/20 border border-brand-primary/30">
                  <Sparkles className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-[0.3em] text-white">Análise Técnica de Elite</h4>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v3.0</p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
                  <p className="text-xs font-black text-white/60 uppercase tracking-[0.2em] animate-pulse">Avaliando equilíbrio tático...</p>
                </div>
              ) : (
                <div className="relative z-10">
                  <p className="text-sm text-white font-black leading-relaxed italic uppercase tracking-tight">
                    "{analysis}"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Auditoria IA */}
          {userRole === 'ADMIN' && showAudit && (ruleVerification || isVerifyingRules) && (
            <div className="bg-brand-secondary rounded-[2.5rem] p-10 mb-10 border border-brand-primary/20 shadow-2xl relative overflow-hidden group animate-in slide-in-from-top-6 duration-700">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-all duration-700">
                <ShieldCheck className="w-40 h-40 text-brand-primary" />
              </div>
              
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl border ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-red-500/20 border-red-500/30' : 'bg-brand-primary/20 border-brand-primary/30'}`}>
                    <ShieldCheck className={`w-6 h-6 ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-red-400' : 'text-brand-primary'}`} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-black uppercase tracking-[0.3em] ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-red-300' : 'text-white'}`}>Relatório de Integridade</h4>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v3.0</p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 px-5 py-2 border rounded-2xl ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-red-500/10 border-red-500/20' : 'bg-brand-primary/10 border-brand-primary/20'}`}>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-red-500' : 'bg-brand-primary'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-red-400' : 'text-brand-primary'}`}>
                    {ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'Inconsistência Detectada' : 'Integridade Validada'}
                  </span>
                </div>
              </div>

              {isVerifyingRules ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6">
                  <RefreshCw className="w-10 h-10 text-brand-primary animate-spin" />
                  <p className="text-xs font-black text-white/60 uppercase tracking-[0.2em] animate-pulse">Processando heurísticas de elite...</p>
                </div>
              ) : (
                <div className="relative z-10">
                  <div className="prose prose-invert max-w-none">
                    <p className="text-sm text-white/80 font-black leading-relaxed whitespace-pre-wrap uppercase tracking-tight">
                      {ruleVerification}
                    </p>
                  </div>
                  <div className="mt-10 pt-10 border-t border-white/10 flex items-center justify-between">
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Algoritmo</span>
                        <span className="text-xs font-black text-brand-primary uppercase tracking-widest">ELO Dynamic v3</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Critério</span>
                        <span className="text-xs font-black text-brand-primary uppercase tracking-widest">Fair Play Elite</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] block mb-2">Timestamp</span>
                      <span className="text-xs font-mono font-black text-brand-primary">{new Date().toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resumo dos Times Otimizado */}
          <div className="bg-black backdrop-blur-md rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 mb-8 border border-brand-primary/10 flex flex-col gap-8 animate-in fade-in duration-700 shadow-2xl">
            {/* Time A */}
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(245,196,41,0.6)] animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-brand-primary uppercase tracking-widest">Time A</span>
                </div>
                <span className="text-[10px] sm:text-xs font-black text-brand-primary uppercase tracking-widest italic bg-brand-primary/10 px-3 py-1 rounded-full border border-brand-primary/20">ELO: {generationResult.teamA.totalElo}</span>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-6 gap-y-4 py-2">
                {[generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean).map((p, idx) => (
                  <div 
                    key={p?.id || idx} 
                    className={`flex items-center gap-2 group/player transition-all duration-300`}
                  >
                    <span className={`text-base sm:text-xl font-black uppercase tracking-tight relative ${
                      p?.isOfficialSetter 
                        ? 'text-brand-primary drop-shadow-[0_0_8px_rgba(245,196,41,0.5)]' 
                        : 'text-brand-primary drop-shadow-[0_0_5px_rgba(245,196,41,0.3)]'
                    }`}>
                      {p?.name}
                      <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-brand-primary transition-all duration-500 group-hover/player:w-full" />
                    </span>
                    {p?.isOfficialSetter && <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-primary animate-pulse shrink-0" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px w-full bg-white/10" />

            {/* Time B */}
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white uppercase tracking-widest">Time B</span>
                </div>
                <span className="text-[10px] sm:text-xs font-black text-white/80 uppercase tracking-widest italic bg-white/5 px-3 py-1 rounded-full border border-white/10">ELO: {generationResult.teamB.totalElo}</span>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-6 gap-y-4 py-2">
                {[generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean).map((p, idx) => (
                  <div 
                    key={p?.id || idx} 
                    className={`flex items-center gap-2 group/player transition-all duration-300`}
                  >
                    <span className={`text-base sm:text-xl font-black uppercase tracking-tight relative ${
                      p?.isOfficialSetter 
                        ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' 
                        : 'text-white/70 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]'
                    }`}>
                      {p?.name}
                      <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-white transition-all duration-500 group-hover/player:w-full" />
                    </span>
                    {p?.isOfficialSetter && <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white animate-pulse shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Placar e Ações de Partida */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {/* Placar Central */}
            <div className="md:col-span-2 bg-black rounded-[2rem] sm:rounded-[3rem] border border-brand-primary/20 p-6 sm:p-10 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              <div className="flex items-center justify-between mb-6 sm:mb-10 relative z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-brand-secondary rounded-xl sm:rounded-2xl border border-brand-primary/20">
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.3em]">Partida em Andamento</h3>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mt-1">Partida #{currentMatchNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 bg-brand-secondary/50 px-3 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-brand-primary/10">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white font-mono tracking-widest">{formatTime(elapsedTime)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-6 sm:gap-8 relative z-10">
                {userRole === 'ADMIN' && (
                  <div className="flex flex-row items-center justify-center gap-3 sm:gap-8 w-full">
                    <button 
                      onClick={() => onFinishMatch('A')}
                      className="w-1/2 bg-brand-primary hover:bg-brand-primary/90 text-black px-2 py-4 sm:px-8 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-sm uppercase tracking-widest shadow-xl shadow-brand-primary/20 transition-all hover:scale-105 active:scale-95 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3"
                    >
                      <span>Vitória A</span> <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    <div className="hidden sm:block w-px h-16 bg-white/10" />

                    <button 
                      onClick={() => onFinishMatch('B')}
                      className="w-1/2 bg-white hover:bg-gray-200 text-black px-2 py-4 sm:px-8 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-sm uppercase tracking-widest shadow-xl shadow-white/20 transition-all hover:scale-105 active:scale-95 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3"
                    >
                      <span>Vitória B</span> <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-8 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mt-1 sm:mt-2 w-full">
                  <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <span className="text-green-400 bg-green-400/10 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-green-400/20 whitespace-nowrap">Vitória: +{eloChanges.aWin} ELO</span>
                    <span className="text-red-400 bg-red-400/10 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-red-400/20 whitespace-nowrap">Derrota: {eloChanges.aLoss} ELO</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-white/60 bg-white/5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-white/10 w-full sm:w-auto">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{attendance.length} Sócios Presentes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Espera */}
          {showWaitlist && (
            <div className="bg-black rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 mb-10 border border-brand-primary/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 sm:p-10 opacity-5 pointer-events-none">
                <Clock className="w-20 h-20 sm:w-40 sm:h-40 text-brand-primary" />
              </div>
              
              <div className="flex items-center justify-between mb-6 sm:mb-10 relative z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-brand-secondary rounded-xl sm:rounded-2xl border border-brand-primary/20">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Guerreiros em Espera</h3>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mt-1">Fila de Prioridade Dinâmica</p>
                  </div>
                </div>
                <div className="bg-brand-primary/10 text-brand-primary px-3 py-1.5 sm:px-6 sm:py-2 rounded-xl sm:rounded-2xl border border-brand-primary/30 shadow-xl">
                  <span className="text-xs font-black uppercase tracking-widest">{(generationResult?.remainingPlayers?.length || 0)} Na Fila</span>
                </div>
              </div>
              
              {generationResult?.remainingPlayers && generationResult.remainingPlayers.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 relative z-10">
                  {generationResult.remainingPlayers.map((player, idx) => (
                    <div 
                      key={player.id || `remaining-${idx}`} 
                      className={`relative flex items-center justify-between p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 transition-all duration-500 group hover:-translate-y-1 ${swapSelection?.playerId === player.id ? 'border-brand-primary bg-brand-primary/10 shadow-xl z-10' : 'border-transparent bg-white/5 hover:bg-white/10 hover:shadow-md'}`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xs sm:text-base font-black shrink-0 shadow-lg transition-all duration-500 ${
                          idx < 12 
                            ? 'bg-brand-primary text-brand-secondary group-hover:scale-110' 
                            : idx < 24 
                              ? 'bg-white text-black' 
                              : 'bg-black border border-brand-primary/20 text-white'
                        }`}>
                          {idx + 1}º
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm sm:text-2xl font-black flex items-center gap-2 tracking-tight leading-none truncate ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                            {player.name}
                            {player.timestamp && (
                              <span className="text-[10px] text-white/30 font-medium lowercase tracking-normal">
                                {new Date(player.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-2">
                            <span className={`text-[9px] sm:text-[11px] font-black uppercase ${
                              (player.consecutiveBenched || 0) >= 0 
                                ? 'text-brand-primary animate-pulse' 
                                : 'text-white/40'
                            }`}>
                              {(player.consecutiveBenched || 0) + 1} fora
                            </span>
                            <span className="text-white/30 text-[9px]">•</span>
                            <span className="text-[9px] sm:text-[11px] text-white font-bold uppercase tracking-widest">
                              Hoje: {player.dailyMatches}
                            </span>
                          </div>
                        </div>
                      </div>
                      {userRole === 'ADMIN' && (
                        <button 
                          onClick={() => onSwapClick('Bench', player.id)}
                          className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all shrink-0 ${swapSelection?.playerId === player.id ? 'bg-brand-primary text-brand-secondary shadow-2xl' : 'text-white/40 hover:text-brand-primary hover:bg-brand-primary/10'}`}
                        >
                          <ArrowLeftRight className="w-3 h-3 sm:w-5 sm:h-5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 sm:py-20 bg-brand-secondary/50 rounded-[2rem] sm:rounded-[3rem] border-2 border-dashed border-brand-primary/20 relative z-10">
                  <p className="text-[10px] sm:text-xs font-black text-white/40 uppercase tracking-[0.2em] sm:tracking-[0.3em]">Nenhum guerreiro aguardando no momento</p>
                </div>
              )}
            </div>
          )}

          {swapSelection && (
            <div className="bg-brand-primary p-8 rounded-[2.5rem] mb-10 flex items-center justify-between shadow-2xl shadow-brand-primary/30 animate-pulse border-2 border-brand-secondary/10">
              <div className="flex items-center gap-5">
                <div className="p-3 bg-black rounded-2xl shadow-xl">
                  <ArrowLeftRight className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                  <p className="text-black text-sm font-black uppercase tracking-[0.2em]">Troca Ativa de Elite</p>
                  <p className="text-black/60 text-[10px] font-black uppercase tracking-[0.1em] mt-1">Selecione o alvo para concluir a substituição tática</p>
                </div>
              </div>
              <button 
                onClick={() => setSwapSelection(null)} 
                className="bg-black text-brand-primary px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
              >
                Cancelar
              </button>
            </div>
          )}

          {showTeamCards && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
              <TeamCard 
                title="Time A" 
                team={generationResult.teamA} 
                color="green" 
                attendance={attendance}
                userRole={userRole}
                onSwap={(pid) => onSwapClick('A', pid)}
                onRemove={(pid) => onRemovePlayer('A', pid)}
                onPromote={(pid) => onPromoteToSetter('A', pid)}
                activeSwapId={swapSelection?.playerId}
              />
              <TeamCard 
                title="Time B" 
                team={generationResult.teamB} 
                color="blue" 
                attendance={attendance}
                userRole={userRole}
                onSwap={(pid) => onSwapClick('B', pid)}
                onRemove={(pid) => onRemovePlayer('B', pid)}
                onPromote={(pid) => onPromoteToSetter('B', pid)}
                activeSwapId={swapSelection?.playerId}
              />
            </div>
          )}

          {/* Estatísticas de Partidas por Jogador */}
          {showPerformance && (
            <div className="bg-black rounded-[3rem] border border-brand-primary/20 p-10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-secondary rounded-2xl border border-brand-primary/20">
                    <BarChart3 className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Performance da Sessão</h3>
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mt-1">Histórico de Batalhas do Dia</p>
                  </div>
                </div>
              </div>

            <div className="relative">
              <div className="overflow-x-auto pb-6 -mx-10 px-10">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className="text-left py-4 px-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] sticky left-0 bg-black z-20">Guerreiro</th>
                      {todayMatches.map((_, i) => (
                        <th key={i} className="py-4 px-2 text-center min-w-[60px]">
                          <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/20 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
                            B{i + 1}
                          </div>
                        </th>
                      ))}
                      {todayMatches.length === 0 && (
                        <th className="py-4 px-2 text-center min-w-[60px]">
                          <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/20 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
                            B1
                          </div>
                        </th>
                      )}
                      <th className="py-4 px-6 text-center text-[10px] font-black text-white/40 uppercase tracking-[0.2em] min-w-[100px]">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...attendance].sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)).map((player, idx) => {
                      const players = useStore.getState().players;
                      const fullPlayer = players.find(fp => fp.id === player.id);
                      const displayName = player.name || fullPlayer?.name || "Sócio sem nome";
                      const arrivalOrder = player.arrivalOrder || fullPlayer?.arrivalOrder || 0;

                      return (
                        <tr key={player.id || `attendance-row-${idx}`} className="group">
                          <td className="py-4 px-6 sticky left-0 bg-black z-10 border-y border-l border-brand-primary/20 rounded-l-2xl group-hover:bg-brand-secondary transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-xl bg-black border border-brand-primary/20 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg">
                                {arrivalOrder || '?'}
                              </div>
                              <div>
                                <p className={`text-xs font-black uppercase tracking-tight ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>{displayName}</p>
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-0.5">Nível Pro</p>
                              </div>
                            </div>
                          </td>
                        {todayMatches.map((match, mIdx) => {
                          const isTeamA = (match.teamA || []).includes(player.id);
                          const isTeamB = (match.teamB || []).includes(player.id);
                          const played = isTeamA || isTeamB;
                          const won = (isTeamA && match.winner === 'A') || (isTeamB && match.winner === 'B');
                          
                          return (
                            <td key={match.id || `match-cell-${mIdx}`} className="py-4 px-2 text-center border-y border-brand-primary/20 group-hover:bg-brand-secondary transition-colors">
                              {played ? (
                                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-black text-xs shadow-lg transition-all group-hover:scale-110 border ${won ? 'bg-brand-primary border-brand-primary/30 text-black' : 'bg-white border-white/30 text-black'}`}>
                                  {won ? 'V' : 'D'}
                                </div>
                              ) : (
                                <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/20 flex items-center justify-center">
                                  <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {todayMatches.length === 0 && (
                          <td className="py-4 px-2 text-center border-y border-brand-primary/20 group-hover:bg-brand-secondary transition-colors">
                            <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/20 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                            </div>
                          </td>
                        )}
                        <td className="py-4 px-6 text-center border-y border-r border-brand-primary/20 rounded-r-2xl group-hover:bg-brand-secondary transition-colors">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-black text-white uppercase tracking-tight">{player.dailyMatches} Jogos</span>
                            <div className="flex gap-2 mt-1.5">
                              <span className="text-[9px] font-black text-black bg-brand-primary px-2 py-0.5 rounded-lg border border-brand-primary/20">{player.dailyWins}V</span>
                              <span className="text-[9px] font-black text-black bg-white px-2 py-0.5 rounded-lg border border-white/10">{player.dailyLosses}D</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}

          {/* Finalizar Dia */}
          {userRole === 'ADMIN' && (
            <div className="flex justify-center pt-16 mt-10 border-t border-brand-primary/10">
              <button 
                onClick={onFinishDay}
                className="flex items-center gap-6 px-12 py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-[2rem] transition-all shadow-2xl shadow-rose-600/20 group relative overflow-hidden border border-rose-500/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <RefreshCw className="w-6 h-6 text-white group-hover:rotate-180 transition-transform duration-1000 relative z-10" />
                <div className="text-left relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80 leading-none mb-2">Encerrar Sessão</p>
                  <p className="text-base font-black uppercase tracking-tight leading-none">Finalizar Dia de Jogos</p>
                </div>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
