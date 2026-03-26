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
  Gem, 
  Scale, 
  GraduationCap, 
  Clock, 
  Volume2, 
  Megaphone, 
  ArrowLeftRight,
  ShieldCheck,
  X,
  Plus,
  Users
} from 'lucide-react';

interface MatchViewProps {
  onGenerate: (onlyCurrentPlayers?: boolean) => void;
  onDiscard: () => void;
  onFinishDay: () => void;
  onFinishMatch: (winner: 'A' | 'B') => void;
  onVerifyRules: () => void;
  isVerifyingRules: boolean;
  isNarratingSummary: boolean;
  onAnnounce: () => void;
  onSwapClick: (source: 'A' | 'B' | 'Bench', playerId: string) => void;
  onRemovePlayer: (team: 'A' | 'B', playerId: string) => void;
  onPromoteToSetter: (team: 'A' | 'B', playerId: string) => void;
}

export const MatchView: React.FC<MatchViewProps> = ({
  onGenerate,
  onDiscard,
  onFinishDay,
  onFinishMatch,
  onVerifyRules,
  isVerifyingRules,
  isNarratingSummary,
  onAnnounce,
  onSwapClick,
  onRemovePlayer,
  onPromoteToSetter
}) => {
  const { 
    generationResult, 
    attendance, 
    userRole, 
    systemMetadata, 
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
    ruleVerification,
    elapsedTime,
    swapSelection,
    setSwapSelection
  } = useStore();

  const [showAudit, setShowAudit] = useState(false);

  const today = getFirestoreDateKey();
  const todayMatches = (matches || [])
    .filter(m => m.date === today)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const currentMatchNumber = todayMatches.length + 1;

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

    const label = matchesToWait === 1 ? 'Próx' : `Dq ${matchesToWait}`;
    
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

    return `• ${label} • ${timeStr}`;
  };

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      {!generationResult ? (
        <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-8 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 p-10">
          <div className="bg-slate-50 p-8 rounded-full">
            <Swords className="w-16 h-16 text-slate-200" />
          </div>
          <div className="space-y-3">
            <p className="text-2xl font-black text-slate-800 uppercase tracking-tight">Pronto para o Jogo?</p>
            <p className="text-sm text-slate-400 max-w-sm mx-auto font-medium">
              {attendance.length < 10 
                ? `Você precisa de pelo menos 10 jogadores confirmados. Atualmente tem ${attendance.length}.`
                : "Os times serão gerados com base no ELO e equilíbrio técnico."}
            </p>
          </div>
          
          <div className="flex flex-col gap-4 w-full max-w-xs">
            {userRole === 'ADMIN' ? (
              <button 
                onClick={() => onGenerate()} 
                disabled={attendance.length < 10}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
              >
                Escalar Partida <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aguardando escalação pelo organizador...</p>
              </div>
            )}
            
            {attendance.length < 10 && (
              <button 
                onClick={() => setViewMode('presence')} 
                className="text-xs font-black uppercase text-indigo-600 bg-indigo-50 px-6 py-3 rounded-2xl hover:bg-indigo-100 transition-all tracking-widest"
              >
                Ir para Lista de Presença
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                <Swords className="w-8 h-8 text-indigo-600" /> Confronto Gerado
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-slate-100 px-4 py-1.5 rounded-full flex items-center gap-2 border border-slate-200">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Partida #{currentMatchNumber}</span>
                </div>
                {(() => {
                  const diff = Math.abs(generationResult.teamA.totalElo - generationResult.teamB.totalElo);
                  if (diff < 50) return (
                    <div className="bg-amber-50 px-4 py-1.5 rounded-full flex items-center gap-2 border border-amber-100 animate-pulse">
                      <Gem className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">💎 Confronto de Titãs</span>
                    </div>
                  );
                  if (diff < 150) return (
                    <div className="bg-blue-50 px-4 py-1.5 rounded-full flex items-center gap-2 border border-blue-100">
                      <Scale className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">⚖️ Equilibrado</span>
                    </div>
                  );
                  if (diff < 300) return (
                    <div className="bg-slate-50 px-4 py-1.5 rounded-full flex items-center gap-2 border border-slate-200">
                      <Swords className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">⚔️ Desafiador</span>
                    </div>
                  );
                  return (
                    <div className="bg-slate-100 px-4 py-1.5 rounded-full flex items-center gap-2 border border-slate-200">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">🎓 Treino Técnico</span>
                    </div>
                  );
                })()}
                <div className="bg-emerald-50 px-4 py-1.5 rounded-full flex items-center gap-2 border border-emerald-100">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{attendance.length} Presentes</span>
                </div>
                <div className="bg-indigo-50 px-4 py-1.5 rounded-full flex items-center gap-2 border border-indigo-100">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest tabular-nums">{formatTime(elapsedTime)}</span>
                  {todayMatches.length > 0 && (
                    <>
                      <div className="w-px h-3 bg-indigo-200 mx-1" />
                      <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest" title="Média de duração das partidas hoje">Média: {formatTime(avgMatchDuration)}</span>
                    </>
                  )}
                </div>
                {quickestMatch && (
                  <div className="hidden sm:flex bg-emerald-50 px-4 py-1.5 rounded-full items-center gap-2 border border-emerald-100">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">⚡ Recorde: {formatTime(quickestMatch)}</span>
                  </div>
                )}
                {longestMatch && longestMatch > 0 && (
                  <div className="hidden lg:flex bg-slate-50 px-4 py-1.5 rounded-full items-center gap-2 border border-slate-200">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">🐢 Longa: {formatTime(longestMatch)}</span>
                  </div>
                )}
              </div>
            </div>
            {userRole === 'ADMIN' && (
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (!showAudit && !ruleVerification) {
                      onVerifyRules();
                    }
                    setShowAudit(!showAudit);
                  }} 
                  className={`flex items-center gap-2 text-[10px] font-black uppercase px-4 py-2 rounded-xl border transition-all ${showAudit ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${showAudit ? 'text-indigo-500' : 'text-slate-400'}`} />
                  {showAudit ? 'Ocultar Auditoria' : 'Ver Auditoria IA'}
                </button>
                <button onClick={onDiscard} className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-600 px-4 py-2">Descartar</button>
                <button 
                  onClick={onAnnounce} 
                  disabled={isNarrating}
                  className={`flex items-center gap-2 text-[10px] font-black uppercase px-6 py-2 rounded-xl shadow-sm transition-all ${isNarrating ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                >
                  {isNarrating ? <Volume2 className="w-3.5 h-3.5 animate-bounce" /> : <Megaphone className="w-3.5 h-3.5" />}
                  {isNarrating ? 'Anunciando...' : 'Anunciar Times'}
                </button>
                <button onClick={() => onGenerate(true)} className="text-[10px] font-black uppercase bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-6 py-2 rounded-xl shadow-sm">Nova Escalação</button>
              </div>
            )}

            {/* Auditoria IA para Membros (apenas visualização) */}
            {userRole !== 'ADMIN' && (
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (!showAudit && !ruleVerification) {
                      onVerifyRules();
                    }
                    setShowAudit(!showAudit);
                  }} 
                  className={`flex items-center gap-2 text-[10px] font-black uppercase px-4 py-2 rounded-xl border transition-all ${showAudit ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${showAudit ? 'text-indigo-500' : 'text-slate-400'}`} />
                  {showAudit ? 'Ocultar Auditoria' : 'Ver Auditoria IA'}
                </button>
              </div>
            )}
          </div>

          {/* Auditoria IA */}
          {showAudit && (ruleVerification || isVerifyingRules) && (
            <div className="bg-slate-900 rounded-[2rem] p-6 mb-8 border border-slate-800 shadow-xl relative overflow-hidden group animate-in slide-in-from-top-4 duration-500">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShieldCheck className="w-32 h-32 text-white" />
              </div>
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-rose-500/20 border-rose-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
                    <Sparkles className={`w-5 h-5 ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-rose-400' : 'text-indigo-400'}`} />
                  </div>
                  <div>
                    <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-rose-300' : 'text-indigo-300'}`}>Relatório de Auditoria</h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Guerreiros Intelligence v2.0</p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1 border rounded-full ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  <span className={`text-[8px] font-black uppercase tracking-widest ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'Inconsistência Detectada' : 'Integridade Validada'}
                  </span>
                </div>
              </div>

              {isVerifyingRules ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Processando heurísticas de equilíbrio...</p>
                </div>
              ) : (
                <div className="relative z-10">
                  <div className="prose prose-invert max-w-none">
                    <p className="text-xs text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">
                      {ruleVerification}
                    </p>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex gap-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Algoritmo</span>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">ELO Dynamic</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Critério</span>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">Fair Play 1.0</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest block mb-1">Timestamp</span>
                      <span className="text-[10px] font-mono text-slate-400">{new Date().toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resumo Rápido para Mobile */}
          <div className="bg-white/50 backdrop-blur-sm p-3 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 flex flex-col gap-2 sm:gap-3 mb-2 shadow-sm">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex flex-col items-center shrink-0 gap-1">
                <span className="text-[8px] sm:text-[10px] font-black uppercase text-indigo-600 bg-indigo-100/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-indigo-100">Time A</span>
                <span className="text-[10px] font-black text-indigo-400 tabular-nums">{generationResult.teamA.totalElo}</span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed pt-1">
                {[generationResult.teamA.setter?.name, ...generationResult.teamA.players.map(p => p.name)].filter(Boolean).join(', ')}
              </p>
            </div>
            <div className="h-px bg-slate-100 w-full" />
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex flex-col items-center shrink-0 gap-1">
                <span className="text-[8px] sm:text-[10px] font-black uppercase text-rose-600 bg-rose-100/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-rose-100">Time B</span>
                <span className="text-[10px] font-black text-rose-400 tabular-nums">{generationResult.teamB.totalElo}</span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed pt-1">
                {[generationResult.teamB.setter?.name, ...generationResult.teamB.players.map(p => p.name)].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>

          {/* Placar Eletrônico e Finalização - REFINED LAYOUT */}
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden mb-4 sm:mb-8">
            <div className="bg-slate-50 px-4 sm:px-8 py-2 sm:py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                Resultado da Partida
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração:</span>
                <span className="text-xs font-mono font-black text-slate-600">{formatTime(elapsedTime)}</span>
              </div>
            </div>

            <div className="p-6">
              <div className="flex border-b border-slate-100 mb-6 -mx-6 -mt-6">
                {(['QUICK', 'SEQUENTIAL', 'SCORE'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScoreMode(mode)}
                    className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${scoreMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    {mode === 'QUICK' ? 'Rápido' : mode === 'SEQUENTIAL' ? 'Ponto a Ponto' : 'Placar Final'}
                  </button>
                ))}
              </div>

              {scoreMode === 'SEQUENTIAL' && (
                <div className="flex items-center justify-around gap-4 py-4">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Time A</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setScoreA(Math.max(0, scoreA - 1))} className="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all"><X className="w-3 h-3" /></button>
                      <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{scoreA}</span>
                      <button onClick={() => setScoreA(scoreA + 1)} className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all"><Plus className="w-6 h-6" /></button>
                    </div>
                  </div>
                  <div className="h-12 w-px bg-slate-100" />
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Time B</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setScoreB(scoreB + 1)} className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-100 hover:scale-105 active:scale-95 transition-all"><Plus className="w-6 h-6" /></button>
                      <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{scoreB}</span>
                      <button onClick={() => setScoreB(Math.max(0, scoreB - 1))} className="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              )}

              {scoreMode === 'SCORE' && (
                <div className="flex items-center justify-center gap-6 py-4">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Time A</p>
                    <input type="number" value={tempScoreA} onChange={(e) => setTempScoreA(e.target.value)} className="w-20 h-20 text-3xl font-black text-center bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all outline-none" />
                  </div>
                  <div className="text-2xl font-black text-slate-200">VS</div>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Time B</p>
                    <input type="number" value={tempScoreB} onChange={(e) => setTempScoreB(e.target.value)} className="w-20 h-20 text-3xl font-black text-center bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-rose-500 transition-all outline-none" />
                  </div>
                </div>
              )}

              {userRole === 'ADMIN' && (
                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => onFinishMatch('A')}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-100 transition-all flex flex-col items-center justify-center group"
                  >
                    <span className="text-[8px] uppercase tracking-widest opacity-80 group-hover:scale-110 transition-transform">Vencedor</span>
                    <span className="text-sm uppercase tracking-tighter">Time A</span>
                  </button>
                  <button 
                    onClick={() => onFinishMatch('B')}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 rounded-xl shadow-lg shadow-indigo-100 transition-all flex flex-col items-center justify-center group"
                  >
                    <span className="text-[8px] uppercase tracking-widest opacity-80 group-hover:scale-110 transition-transform">Vencedor</span>
                    <span className="text-sm uppercase tracking-tighter">Time B</span>
                  </button>
                </div>
              )}
              
              <button onClick={onDiscard} className="w-full mt-4 py-2 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-rose-500 transition-colors">Descartar Partida</button>
            </div>
          </div>

          {/* Lista de Espera - OPTIMIZED FOR MOBILE */}
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 p-3 sm:p-8 mb-4 sm:mb-8 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-amber-50 rounded-lg sm:rounded-xl">
                  <Clock className="w-4 h-4 sm:w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-[10px] sm:text-sm font-black text-slate-800 uppercase tracking-widest">Lista de Espera</h3>
              </div>
              <span className="bg-slate-100 text-slate-500 text-[8px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full">{(generationResult?.remainingPlayers?.length || 0)} Jogadores</span>
            </div>
            
            {generationResult?.remainingPlayers && generationResult.remainingPlayers.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-4">
                {generationResult.remainingPlayers.map((player, idx) => (
                  <div 
                    key={player.id || `remaining-${idx}`} 
                    className={`relative flex items-center justify-between p-2 sm:p-4 rounded-xl sm:rounded-2xl border transition-all ${swapSelection?.playerId === player.id ? 'bg-amber-50 border-amber-300 shadow-md ring-2 ring-amber-200' : 'bg-slate-50 border-slate-100 hover:border-amber-200 shadow-sm'}`}
                  >
                    {/* Badge de Posição na Espera */}
                    <div className="absolute -top-2 -left-2 w-5 h-5 sm:w-7 sm:h-7 bg-amber-500 text-white rounded-full flex items-center justify-center text-[8px] sm:text-[10px] font-black shadow-md border-2 border-white z-10 animate-in zoom-in duration-300">
                      {idx + 1}º
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                      <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 font-black text-[8px] sm:text-sm shrink-0 shadow-sm">
                        #{player.arrivalOrder || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] sm:text-sm font-black uppercase tracking-tight ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-800'}`}>{player.name}</p>
                        <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                          <span className="text-[7px] sm:text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">{player.dailyWins || 0}V</span>
                          <span className="text-[7px] sm:text-[10px] font-black uppercase text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-100">{player.dailyLosses || 0}D</span>
                          <span className="text-[7px] sm:text-[9px] font-black text-fuchsia-600 uppercase tracking-widest whitespace-nowrap shrink-0">
                            {getPlayerPrediction(player)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => onSwapClick('Bench', player.id)}
                      className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all ${swapSelection?.playerId === player.id ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                      title="Trocar Jogador"
                    >
                      <ArrowLeftRight className="w-3 h-3 sm:w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 sm:py-6 bg-slate-50 rounded-xl sm:rounded-2xl border border-dashed border-slate-200">
                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Ninguém na espera</p>
              </div>
            )}
          </div>

          {swapSelection && (
            <div className="bg-amber-100 border-2 border-amber-200 p-5 rounded-3xl flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-200 rounded-xl"><ArrowLeftRight className="w-5 h-5 text-amber-700" /></div>
                <p className="text-amber-900 text-xs font-black uppercase tracking-widest">Troca Ativa: Selecione outro jogador (do time ou reserva) para trocar</p>
              </div>
              <button onClick={() => setSwapSelection(null)} className="text-[10px] font-black uppercase text-amber-900 underline">Cancelar</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <TeamCard 
              title="Time A" 
              team={generationResult.teamA} 
              color="indigo" 
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
              color="rose" 
              attendance={attendance}
              userRole={userRole}
              onSwap={(pid) => onSwapClick('B', pid)}
              onRemove={(pid) => onRemovePlayer('B', pid)}
              onPromote={(pid) => onPromoteToSetter('B', pid)}
              activeSwapId={swapSelection?.playerId}
            />
          </div>

          {/* Estatísticas de Partidas por Jogador */}
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 p-4 sm:p-8 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Hash className="w-5 h-5 text-indigo-500" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Partidas por Jogador</h3>
            </div>

            <div className="relative">
              <div className="overflow-x-auto pb-4">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Jogador</th>
                      {todayMatches.map((_, i) => (
                        <th key={i} className="py-3 px-1 sm:px-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter min-w-[44px] sm:min-w-[60px]">P{i + 1}</th>
                      ))}
                      {todayMatches.length === 0 && (
                        <th className="py-3 px-1 sm:px-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter min-w-[44px] sm:min-w-[60px]">P1</th>
                      )}
                      <th className="py-3 px-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[70px] sm:min-w-[80px]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...attendance].sort((a, b) => (a.arrivalOrder || 0) - (b.arrivalOrder || 0)).map((player, idx) => (
                      <tr key={player.id || `attendance-row-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-2 sticky left-0 bg-white z-10 border-r border-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <p className={`text-[11px] sm:text-xs font-black uppercase tracking-tight truncate max-w-[90px] sm:max-w-[120px] ${player.isOfficialSetter ? 'text-rose-600' : 'text-slate-700'}`}>{player.name}</p>
                          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">#{player.arrivalOrder}º</p>
                        </td>
                        {todayMatches.map((match, mIdx) => {
                          const isTeamA = (match.teamA || []).includes(player.id);
                          const isTeamB = (match.teamB || []).includes(player.id);
                          const played = isTeamA || isTeamB;
                          const won = (isTeamA && match.winner === 'A') || (isTeamB && match.winner === 'B');
                          
                          return (
                            <td key={match.id || `match-cell-${mIdx}`} className="py-3 px-1 sm:px-2 text-center">
                              {played ? (
                                <span className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 h-8 rounded-md sm:rounded-lg font-black text-[10px] sm:text-xs ${won ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-rose-100 text-rose-600 border border-rose-200'}`}>
                                  {won ? 'V' : 'D'}
                                </span>
                              ) : (
                                <span className="text-slate-200 font-black text-[10px]">-</span>
                              )}
                            </td>
                          );
                        })}
                        {todayMatches.length === 0 && (
                          <td className="py-3 px-1 sm:px-2 text-center">
                            <span className="text-slate-200 font-black text-[10px]">-</span>
                          </td>
                        )}
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] sm:text-xs font-black text-indigo-600">{player.dailyMatches}J</span>
                            <div className="flex gap-1 mt-0.5 sm:mt-1">
                              <span className="text-[8px] sm:text-[9px] font-black text-emerald-600">{player.dailyWins}V</span>
                              <span className="text-[8px] sm:text-[9px] font-black text-rose-600">{player.dailyLosses}D</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
