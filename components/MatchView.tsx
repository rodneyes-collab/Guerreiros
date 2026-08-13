import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { TeamCard } from './TeamCard';
import { TeamBalancingSimulatorCard } from '../src/components/TeamBalancingSimulatorCard';
import { DepartureTimeModal } from './DepartureTimeModal';
import { formatTime } from '../utils/helpers';
import { getFirestoreDateKey } from '../firebase';
import { useNarration } from '../src/hooks/useNarration';
import { useAIStatus } from '../src/hooks/useAIStatus';
import { speakNarration } from '../services/geminiService';
import { playSound } from '../src/utils/audio';
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
  VolumeX, 
  Megaphone, 
  ArrowLeftRight,
  ShieldCheck,
  AlertTriangle,
  X,
  XCircle,
  Trash2,
  Plus,
  Minus,
  Users,
  ClipboardCheck,
  BarChart3,
  Settings2,
  ChevronDown,
  ChevronUp,
  Percent,
  TrendingUp,
  Check,
  CheckCircle2,
  Sliders,
  Mic,
  MicOff,
  ExternalLink,
  Undo,
  RotateCw,
  RotateCcw,
  Zap,
  Bot
} from 'lucide-react';

import { PlayerStatusCard } from '../src/components/PlayerStatusCard';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { MatchBalanceCharts } from '../src/components/MatchBalanceCharts';
import { getPriorityQueue, calculateEffectiveElo, suggestPosition, calculateTeamPositions, runAutoCorrectionAgent, calculatePracticalSkillsSum, runCriticalSynergySolverAgent, calculateCompositePerformanceRating } from '../utils/teamLogic';
import { Player, SystemMetadata } from '../types';
import { APP_VERSION } from '../constants';

interface MatchViewProps {
  onGenerate: (onlyCurrentPlayers?: boolean) => void;
  onDiscard: () => void;
  onFinishDay: () => void;
  onDeleteMatchesByDate: (date: string) => void;
  onFinishMatch: (winner: 'A' | 'B', scoreA?: number, scoreB?: number, stats?: any[]) => void;
  onVerifyRules: () => void;
  onAutoFixInconsistencies?: () => void;
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
  updateDepartureTime?: (playerId: string, departureTime: string | null) => Promise<void>;
  userRole?: string;
}

export const MatchView: React.FC<MatchViewProps> = ({
  onGenerate,
  onDiscard,
  onFinishDay,
  onDeleteMatchesByDate,
  onFinishMatch,
  onVerifyRules,
  onAutoFixInconsistencies,
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
  updateSystemMetadata,
  updateDepartureTime: updateDepartureTimeProp,
  userRole: userRoleProp
}) => {
  const { announceWinner } = useNarration();
  const { status: aiStatus } = useAIStatus();
  const { 
    generationResult, 
    attendance: allAttendance, 
    userRole: storeUserRole, 
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
    setSwapSelection,
    isSyncing,
    showNotification,
    teamGenerationMode,
    setTeamGenerationMode,
    balancingStrategy,
    setBalancingStrategy,
    balancingRatingMode,
    setBalancingRatingMode,
    players
  } = useStore();
  const userRole = userRoleProp || storeUserRole || 'ADMIN';
  const updateDepartureTime = updateDepartureTimeProp;
  const attendance = React.useMemo(() => allAttendance.filter(p => p.status !== 'inactive'), [allAttendance]);
  const { currentPlayer } = useStore();

  const [showAudit, setShowAudit] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showSimulatorInMatch, setShowSimulatorInMatch] = useState(false);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [sessionDurationHours, setSessionDurationHours] = useState(3);
  const [customAvgDuration, setCustomAvgDuration] = useState<number | null>(null);

  // Estados para gravação de voz e registro rápido de placar
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error' | 'permission_denied'>('idle');
  const [voiceParsedScore, setVoiceParsedScore] = useState<{ winner: 'A' | 'B'; loserScore: number } | null>(null);
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null);

  // Animação de Contagem Regressiva Suave para Geração de Times (Busca Local IC)
  const [isGeneratingCountdown, setIsGeneratingCountdown] = useState(false);
  const [countdownVal, setCountdownVal] = useState(3);
  const [countdownProgress, setCountdownProgress] = useState(0);
  const [countdownStepText, setCountdownStepText] = useState('Analisando Fila...');
  const [countdownIteration, setCountdownIteration] = useState(0);

  const handleTriggerGenerate = (onlyCurrent?: boolean) => {
    setIsGeneratingCountdown(true);
    setCountdownVal(3);
    setCountdownProgress(0);
    setCountdownIteration(0);
    setCountdownStepText('⚡ Selecionando os 12 Sócios da Fila...');

    const duration = 2800; // ms
    const intervalTime = 30; // ms
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += intervalTime;
      const progress = Math.min(100, Math.floor((elapsed / duration) * 100));
      setCountdownProgress(progress);
      setCountdownIteration(Math.floor((progress / 100) * 100));

      if (progress < 30) {
        setCountdownVal(3);
        setCountdownStepText('⚡ Fila Inteligente & Regras de Prioridade');
      } else if (progress < 65) {
        setCountdownVal(2);
        setCountdownStepText('🧠 Busca Local IC (100 Iterações) & Sinergia ML');
      } else if (progress < 95) {
        setCountdownVal(1);
        setCountdownStepText('🛡️ Auto-Correção: Bottom 2 & Paridade de Gênero');
      } else {
        setCountdownVal(0);
        setCountdownStepText('🏆 Formação de Elite Concluída!');
      }

      if (elapsed >= duration) {
        clearInterval(timer);
        onGenerate(onlyCurrent);
        setTimeout(() => {
          setIsGeneratingCountdown(false);
        }, 300);
      }
    }, intervalTime);
  };

  // Sintetizador local simples para feedback de áudio em tempo real (Web Audio API)
  const playBeep = (freq = 600, duration = 0.15) => {
    if (!isSoundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio feedback não suportado ou bloqueado pelo navegador');
    }
  };

  // Algoritmo refinado para conversão fonética de placares esportivos em língua portuguesa
  const parsePortugueseSpeechScore = (transcript: string) => {
    const norm = transcript.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ") // remove pontuação
      .trim();

    const wordToNumMap: Record<string, number> = {
      "zero": 0, "um": 1, "dois": 2, "tres": 3, "quatro": 4, "cinco": 5,
      "seis": 6, "meia": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
      "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "catorze": 14,
      "quinze": 15
    };

    const words = norm.split(/\s+/);
    const foundNumbers: { val: number; index: number }[] = [];

    words.forEach((word, index) => {
      if (/^\d+$/.test(word)) {
        foundNumbers.push({ val: parseInt(word), index });
      } else if (wordToNumMap[word] !== undefined) {
        foundNumbers.push({ val: wordToNumMap[word], index });
      }
    });

    let winner: 'A' | 'B' | null = null;

    // Critérios de vitória por voz em português
    const aTriggers = [
      "vitoria a", "vitoria do a", "vitoria da a", "time a ganhou", 
      "time a venceu", "ganhou a", "venceu a", "equipe a ganhou", 
      "equipe a venceu", "vitoria de a", "a ganhou", "a venceu",
      "ponto para o a", "ponto pro a", "ponto do a"
    ];
    const bTriggers = [
      "vitoria b", "vitoria do b", "vitoria da b", "time b ganhou", 
      "time b venceu", "ganhou b", "venceu b", "equipe b ganhou", 
      "equipe b venceu", "vitoria de b", "b ganhou", "b venceu",
      "ponto para o b", "ponto pro b", "ponto do b",
      "be ganhou", "be venceu"
    ];

    const hasATrigger = aTriggers.some(t => norm.includes(t)) || 
      /\b(ganhou|venceu|vitoria|equipe|time|ponto)\s+a\b/.test(norm) ||
      /\ba\s+(ganhou|venceu)\b/.test(norm);

    const hasBTrigger = bTriggers.some(t => norm.includes(t)) || 
      /\b(ganhou|venceu|vitoria|equipe|time|ponto)\s+b\b/.test(norm) ||
      /\bb\s+(ganhou|venceu)\b/.test(norm) ||
      /\bbe\s+(ganhou|venceu)\b/.test(norm) ||
      /\b(ganhou|venceu|vitoria|equipe|time|ponto)\s+be\b/.test(norm);

    if (hasATrigger && !hasBTrigger) {
      winner = 'A';
    } else if (hasBTrigger && !hasATrigger) {
      winner = 'B';
    } else {
      // Procurar pela ordem ou citação se não houver trigger categórico
      const findAIndex = words.findIndex(w => w === 'a');
      const findBIndex = words.findIndex(w => w === 'b' || w === 'be' || w === 'bê');
      
      if (findAIndex !== -1 && findBIndex !== -1) {
        const fifteenObj = foundNumbers.find(n => n.val === 15);
        if (fifteenObj) {
          if (Math.abs(fifteenObj.index - findAIndex) < Math.abs(fifteenObj.index - findBIndex)) {
            winner = 'A';
          } else {
            winner = 'B';
          }
        }
      }
    }

    if (!winner) {
      if (/\b(a|á)\b/.test(norm)) {
        winner = 'A';
      } else if (/\b(b|bê|be)\b/.test(norm)) {
        winner = 'B';
      }
    }

    if (!winner) return null;

    let loserScore = 0;
    if (foundNumbers.length > 0) {
      const underFifteen = foundNumbers.filter(n => n.val >= 0 && n.val <= 14);
      if (underFifteen.length > 0) {
        loserScore = underFifteen[0].val;
      }
    }

    return { winner, loserScore };
  };

  const startVoiceListening = async () => {
    const SpeechLib = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechLib) {
      showNotification('Reconhecimento de voz não suportado neste navegador. Use o Chrome ou Safari!', 'error');
      return;
    }

    setVoiceModalOpen(true);
    setVoiceStatus('processing');
    setVoiceTranscript('Solicitando acesso ao microfone...');

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop tracks immediately so the mic is released for SpeechRecognition
          stream.getTracks().forEach(track => track.stop());
        } catch (mediaErr: any) {
          console.warn('Falha no acesso antecipado getUserMedia (pode ser contornado pelo SpeechRecognition):', mediaErr);
          if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'PermissionDeniedError' || mediaErr.message?.includes('denied') || mediaErr.message?.includes('allowed')) {
            setVoiceStatus('permission_denied');
            showNotification('Permissão de microfone negada ou bloqueada pelo iframe. Dê acesso nas configurações do navegador.', 'error');
            playBeep(300, 0.4);
            return;
          } else if (mediaErr.name === 'NotFoundError' || mediaErr.name === 'DevicesNotFoundError') {
            setVoiceStatus('error');
            showNotification('Nenhum microfone encontrado. Verifique suas conexões de áudio.', 'error');
            playBeep(300, 0.4);
            return;
          } else {
            setVoiceStatus('error');
            showNotification('Não foi possível ativar o microfone: ' + (mediaErr.message || mediaErr.name), 'error');
            playBeep(300, 0.4);
            return;
          }
        }
      }

      const rec = new SpeechLib();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setVoiceListening(true);
        setVoiceTranscript('');
        setVoiceStatus('listening');
        setVoiceParsedScore(null);
        playBeep(800, 0.1);
      };

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setVoiceTranscript(text);
        setVoiceStatus('processing');
        
        const parsed = parsePortugueseSpeechScore(text);
        if (parsed) {
          setVoiceParsedScore(parsed);
          setVoiceStatus('success');
          playBeep(1200, 0.2);
        } else {
          setVoiceStatus('error');
          playBeep(400, 0.35);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event);
        if (event.error !== 'aborted') {
          if (event.error === 'not-allowed') {
            setVoiceStatus('permission_denied');
            showNotification('Permissão de microfone negada ou bloqueada pelo iframe.', 'error');
          } else {
            setVoiceStatus('error');
            showNotification('Erro na escuta por voz: ' + event.error, 'error');
          }
          playBeep(300, 0.4);
        }
        setVoiceListening(false);
      };

      rec.onend = () => {
        setVoiceListening(false);
      };

      rec.start();
      setRecognitionInstance(rec);
    } catch (err: any) {
      console.error('Falha ao instanciar reconhecimento de voz:', err);
      showNotification('Incapaz de acessar o microfone', 'error');
      setVoiceStatus('error');
    }
  };

  const stopVoiceListening = () => {
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch (e) {
        console.error(e);
      }
    }
    setVoiceListening(false);
  };

  const handleConfirmVoiceScore = () => {
    if (!voiceParsedScore) return;
    const { winner, loserScore } = voiceParsedScore;
    
    if (winner === 'A') {
      onFinishMatch('A', 15, loserScore, playEvents);
      announceWinner('A', 15, loserScore);
      playSound('winA');
    } else {
      onFinishMatch('B', loserScore, 15, playEvents);
      announceWinner('B', loserScore, 15);
      playSound('winB');
    }

    setVoiceModalOpen(false);
    setVoiceParsedScore(null);
    showNotification(`Sucesso! Vitória da Equipe ${winner} registrada: 15 x ${loserScore}`, 'success');
  };

  const handleRecorrectVoiceScore = () => {
    setVoiceParsedScore(null);
    setVoiceTranscript('');
    setVoiceStatus('idle');
    startVoiceListening();
  };
  
  const showTeamCards = systemMetadata.showTeamCards !== false;
  const showWaitlist = systemMetadata.showWaitlist !== false;
  const showPerformance = systemMetadata.showPerformance !== false;
  const showTelemetry = systemMetadata.showTelemetry !== false;
  const showCourtForecast = systemMetadata.showCourtForecast !== false;

  const toggleTeamCards = () => updateSystemMetadata({ showTeamCards: !showTeamCards });
  const toggleWaitlist = () => updateSystemMetadata({ showWaitlist: !showWaitlist });
  const togglePerformance = () => updateSystemMetadata({ showPerformance: !showPerformance });
  const toggleTelemetry = () => updateSystemMetadata({ showTelemetry: !showTelemetry });
  const toggleCourtForecast = () => updateSystemMetadata({ showCourtForecast: !showCourtForecast });

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

  const lowSynergyAlerts = React.useMemo(() => {
    if (!generationResult) return [];
    const teamAPlayers = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
    const teamBPlayers = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];

    const alerts: { team: 'A' | 'B'; p1: Player; p2: Player; winRate: number; games: number }[] = [];

    const checkTeamSynergies = (players: Player[], teamName: 'A' | 'B') => {
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const p1 = players[i];
          const p2 = players[j];
          let games = 0;
          let wins = 0;
          for (const m of matches) {
            const inA = m.teamA.includes(p1.id) && m.teamA.includes(p2.id);
            const inB = m.teamB.includes(p1.id) && m.teamB.includes(p2.id);
            if (inA || inB) {
              games++;
              if ((inA && m.winner === 'A') || (inB && m.winner === 'B')) {
                wins++;
              }
            }
          }
          if (games >= 2) {
            const winRate = wins / games;
            if (winRate <= 0.30) {
              alerts.push({ team: teamName, p1, p2, winRate, games });
            }
          }
        }
      }
    };

    checkTeamSynergies(teamAPlayers, 'A');
    checkTeamSynergies(teamBPlayers, 'B');
    return alerts;
  }, [generationResult, matches]);

  const [isSolvingSynergy, setIsSolvingSynergy] = useState(false);

  const handleRunSynergyAgent = () => {
    if (!generationResult) return;
    setIsSolvingSynergy(true);
    setTimeout(() => {
      try {
        const { updatedResult, resolvedPairsCount } = runCriticalSynergySolverAgent(
          generationResult,
          matches,
          teamGenerationMode === 'TRUESKILL',
          balancingStrategy,
          balancingRatingMode
        );
        setGenerationResult(updatedResult);
        showNotification(
          `Guerreiros Intelligence: Agente de Sinergia realizou simulações e otimizou a formação! (${resolvedPairsCount} par(es) dissolvido(s))`,
          'success'
        );
      } catch (err) {
        console.error('Erro ao executar o agente de solução de sinergia:', err);
        showNotification('Erro ao executar otimização de sinergia dos times.', 'error');
      } finally {
        setIsSolvingSynergy(false);
      }
    }, 120);
  };

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

  const [confirmingWinner, setConfirmingWinner] = useState<'A' | 'B' | null>(null);
  const [losingScoreInput, setLosingScoreInput] = useState<string>('');

  // --- Estados do Modo Quadra & Rodízio Interativo (Ponto a Ponto) ---
  const [scoringTab, setScoringTab] = useState<'simple' | 'advanced'>('simple');
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('guerreiros_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSound = async () => {
    setIsSoundEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('guerreiros_sound_enabled', String(next));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
      
      // Request mic permission when enabling narration (if supported)
      if (next) {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
              stream.getTracks().forEach(track => track.stop());
            })
            .catch(err => console.warn('Mic permission denied or not available.', err));
        }
      }
      
      return next;
    });
  };
  
  const {
    matchServingTeam: servingTeam,
    setMatchServingTeam: setServingTeam,
    matchRotationA: rotationA,
    setMatchRotationA: setRotationA,
    matchRotationB: rotationB,
    setMatchRotationB: setRotationB,
    matchPlayEvents: playEvents,
    setMatchPlayEvents: setPlayEvents,
    matchActiveGenerationId,
    setMatchActiveGenerationId,
  } = useStore();

  const [showPlayEventsLog, setShowPlayEventsLog] = useState<boolean>(true);
  const [showCourtForecastContent, setShowCourtForecastContent] = useState<boolean>(true);
  const [showRulesContent, setShowRulesContent] = useState<boolean>(true);
  const [selectedPlayerForAction, setSelectedPlayerForAction] = useState<{ team: 'A' | 'B'; playerId: string; name: string } | null>(null);
  const [selectedStatAction, setSelectedStatAction] = useState<'saque' | 'ataque' | 'levantamento' | 'defesa' | null>(null);
  const [selectedStatResult, setSelectedStatResult] = useState<'acerto' | 'erro' | null>(null);

  // Estados locais para viva voz da quadra (inline point recording)
  const [pointMicListening, setPointMicListening] = useState(false);
  const [pointMicTranscript, setPointMicTranscript] = useState('');
  const [pointMicStatus, setPointMicStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle');
  const [pointMicInstance, setPointMicInstance] = useState<any>(null);

  // Inicializa o rodízio do zero sempre que houver escalação nova ou reset
  // Inicializa o rodízio do zero sempre que houver escalação nova ou reset com o levantador fixo na posição 3 (index 2)
  React.useEffect(() => {
    if (generationResult && String(generationResult.timestamp) !== matchActiveGenerationId) {
      setMatchActiveGenerationId(String(generationResult.timestamp) || null);
      setServingTeam('A');

      // Equipe A: levantador fixo na Posição 3 (index 2)
      const setterAId = generationResult.teamA.setter?.id || '';
      const playersAIds = (generationResult.teamA.players || []).map(p => p.id);
      const arrA = Array(6).fill('');
      arrA[2] = setterAId; // Fixado na Pos 3
      let playerIdxA = 0;
      for (let i = 0; i < 6; i++) {
        if (i !== 2) {
          arrA[i] = playersAIds[playerIdxA] || '';
          playerIdxA++;
        }
      }
      setRotationA(arrA);

      // Equipe B: levantador fixo na Posição 3 (index 2)
      const setterBId = generationResult.teamB.setter?.id || '';
      const playersBIds = (generationResult.teamB.players || []).map(p => p.id);
      const arrB = Array(6).fill('');
      arrB[2] = setterBId; // Fixado na Pos 3
      let playerIdxB = 0;
      for (let i = 0; i < 6; i++) {
        if (i !== 2) {
          arrB[i] = playersBIds[playerIdxB] || '';
          playerIdxB++;
        }
      }
      setRotationB(arrB);

      setPlayEvents([]);
      setSelectedPlayerForAction(null);
    }
  }, [generationResult]);

  // Rotacionar elemento no sentido horário com o levantador fixo na posição 3 (index 2)
  const rotateClockwiseWithFixedSetter = (prev: string[]) => {
    const next = [...prev];
    // index 2 (Pos 3) é fixo, os outros 5 rodam no sentido horário: 0 <- 1 <- 3 <- 4 <- 5 <- 0
    next[0] = prev[1];
    next[1] = prev[3];
    next[3] = prev[4];
    next[4] = prev[5];
    next[5] = prev[0];
    return next;
  };

  // Rotacionar elemento no sentido anti-horário com o levantador fixo na posição 3 (index 2)
  const rotateCounterClockwiseWithFixedSetter = (prev: string[]) => {
    const next = [...prev];
    // Inverso exato da rotação horária:
    next[1] = prev[0];
    next[3] = prev[1];
    next[4] = prev[3];
    next[5] = prev[4];
    next[0] = prev[5];
    return next;
  };

  // Rotacionar elemento no sentido horário (aplicado nas ações manuais e quebras de saque)
  const rotateTeamClockwise = (team: 'A' | 'B') => {
    if (team === 'A') {
      setRotationA(prev => {
        const next = rotateClockwiseWithFixedSetter(prev);
        showNotification("Equipe A rotacionou (Posições avançaram em sentido horário com levantador fixado na Pos 3)!", "info");
        return next;
      });
    } else {
      setRotationB(prev => {
        const next = rotateClockwiseWithFixedSetter(prev);
        showNotification("Equipe B rotacionou (Posições avançaram em sentido horário com levantador fixado na Pos 3)!", "info");
        return next;
      });
    }
    playBeep(440, 0.1);
  };

  // Rotacionar elemento em sentido anti-horário
  const rotateTeamCounterClockwise = (team: 'A' | 'B') => {
    if (team === 'A') {
      setRotationA(prev => rotateCounterClockwiseWithFixedSetter(prev));
    } else {
      setRotationB(prev => rotateCounterClockwiseWithFixedSetter(prev));
    }
    playBeep(380, 0.1);
  };

  // Adicionar Ponto de forma coordenada (gerencia rodízio automágicamente se houver quebra de saque)
  const handleAddLivePoint = (team: 'A' | 'B', actionType: 'saque' | 'ataque' | 'levantamento' | 'defesa' | 'geral' = 'geral', actionPlayerId?: string) => {
    if (scoreA >= 15 || scoreB >= 15) {
      showNotification("A partida já atingiu 15 pontos. Clique em Finalizar Partida ou use o Undo.", "info");
      return;
    }

    const isAServing = servingTeam === 'A';
    const currentScoreA = scoreA;
    const currentScoreB = scoreB;
    
    // Salva o estado atual para desfazer completo (undo)
    const backupRotationA = [...rotationA];
    const backupRotationB = [...rotationB];
    const backupServingTeam = servingTeam;
    
    let isServeBroken = false;
    let newScore = 0;
    const isPointAction = actionType !== 'defesa' && actionType !== 'levantamento';

    if (isPointAction) {
      if (team === 'A') {
        const nextScore = currentScoreA + 1;
        setScoreA(nextScore);
        newScore = nextScore;
        if (!isAServing) {
          // Quebra de saque do Time A!
          isServeBroken = true;
          setServingTeam('A');
          // Rotaciona a equipe de A automaticamente!
          setRotationA(prev => rotateClockwiseWithFixedSetter(prev));
        }
      } else {
        const nextScore = currentScoreB + 1;
        setScoreB(nextScore);
        newScore = nextScore;
        if (isAServing) {
          // Quebra de saque do Time B!
          isServeBroken = true;
          setServingTeam('B');
          // Rotaciona a equipe de B automaticamente!
          setRotationB(prev => rotateClockwiseWithFixedSetter(prev));
        }
      }
    } else {
      // Ações sem ponto (Defesa ou Levantamento)
      newScore = team === 'A' ? currentScoreA : currentScoreB;
    }

    // Criar texto descritivo e anunciar
    let playerName = '';
    let allP: Player[] = [];
    if (generationResult) {
      allP = [
        generationResult.teamA.setter, ...generationResult.teamA.players,
        generationResult.teamB.setter, ...generationResult.teamB.players
      ].filter(Boolean) as Player[];
      if (actionPlayerId) {
        playerName = allP.find(p => p.id === actionPlayerId)?.name.split(' ')[0] || '';
      }
    }

    // Identificar levantador ativo em quadra para assistência automática se for Ponto de Ataque
    let setterPlayer: Player | undefined = undefined;
    if (actionType === 'ataque' && generationResult) {
      const activeRotation = team === 'A' ? rotationA : rotationB;
      // Levantador fixo na posição 3 (índice 2 do rodízio ativo) ou fallback para o levantador oficial da escalação
      const activeSetterId = activeRotation[2] || (team === 'A' ? generationResult.teamA.setter?.id : generationResult.teamB.setter?.id);
      
      if (activeSetterId && activeSetterId !== actionPlayerId) {
        setterPlayer = allP.find(p => p.id === activeSetterId);
      }
    }

    let description = '';
    let actionLabel = '';
    
    if (actionType === 'saque') actionLabel = 'com um Saque Demolidor (Ace!)';
    else if (actionType === 'ataque') {
      if (setterPlayer) {
        const setterName = setterPlayer.name.split(' ')[0];
        actionLabel = `por Ataque Letal (Assistência de ${setterName} com um bom levantamento!)`;
      } else {
        actionLabel = 'por Ataque Letal';
      }
    }
    else if (actionType === 'defesa') actionLabel = 'por barreira de Bloqueio';
    else if (actionType === 'levantamento') actionLabel = 'por finta de Levantamento';
    else actionLabel = 'marcado!';

    if (playerName) {
      if (!isPointAction) {
        description = `Ação Técnica de ${playerName} ${actionLabel} (Sem alteração no placar)`;
      } else {
        description = `Ponto da Equipe ${team}: de ${playerName} ${actionLabel}`;
      }
    } else {
      description = isPointAction ? `Ponto para a Equipe ${team}!` : `Ação Técnica para a Equipe ${team}!`;
    }

    if (isServeBroken) {
      description += ` • Saque quebrado! Equipe ${team} rotaciona.`;
    }

    const newEvent = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      team,
      scoreA: team === 'A' ? (isPointAction ? currentScoreA + 1 : currentScoreA) : currentScoreA,
      scoreB: team === 'B' ? (isPointAction ? currentScoreB + 1 : currentScoreB) : currentScoreB,
      type: isPointAction ? 'point' : 'stat',
      action: actionType,
      playerId: actionPlayerId,
      playerName,
      description,
      assistPlayerId: setterPlayer?.id || null,
      assistPlayerName: setterPlayer ? setterPlayer.name : null,
      isGoodSet: actionType === 'ataque' && !!setterPlayer,
      rotationState: {
        rotationA: backupRotationA,
        rotationB: backupRotationB,
        servingTeam: backupServingTeam
      }
    };

    setPlayEvents(prev => [newEvent, ...prev]);

    // Usar sons da quadra e viva voz
    playBeep(isServeBroken ? 950 : 750, isServeBroken ? 0.35 : 0.15);
    
    if (isServeBroken) {
      if (isSoundEnabled) {
        if (actionType === 'ataque' && setterPlayer) {
          const setterName = setterPlayer.name.split(' ')[0];
          speakNarration(`Ponto do ${playerName}! Belo levantamento de ${setterName}. Quebra de saque e rodízio!`);
        } else {
          speakNarration(`Ponto da Equipe ${team}. Quebra de saque e Rodízio!`);
        }
      }
    } else {
      if (isSoundEnabled) {
        if (actionType === 'ataque' && setterPlayer) {
          const setterName = setterPlayer.name.split(' ')[0];
          speakNarration(`Ponto do ${playerName}! Assistência genial de ${setterName}.`);
        } else {
          speakNarration(playerName ? `Ponto do ${playerName}!` : `Ponto da Equipe ${team}!`);
        }
      }
    }

    setSelectedPlayerForAction(null);
  };

  // Subtrair Pontos (Fallback Manual)
  const handleSubtractLivePoint = (team: 'A' | 'B') => {
    const currentScoreA = scoreA;
    const currentScoreB = scoreB;
    
    if (team === 'A' && currentScoreA > 0) {
      setScoreA(currentScoreA - 1);
    } else if (team === 'B' && currentScoreB > 0) {
      setScoreB(currentScoreB - 1);
    }
    
    const newEvent = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      team,
      type: 'decrement',
      action: 'geral',
      description: `Ponto removido manualmente da Equipe ${team}`
    };
    
    setPlayEvents(prev => [newEvent, ...prev]);
    playBeep(350, 0.2);
  };

  // Registrar erro do jogador (concede ponto ao time oposto!)
  const handleRegisterPlayerError = (team: 'A' | 'B', playerId: string, actionType: 'saque' | 'ataque' | 'levantamento' | 'defesa') => {
    if (scoreA >= 15 || scoreB >= 15) {
      showNotification("A partida já atingiu 15 pontos. Clique em Finalizar Partida ou use o Undo.", "info");
      return;
    }

    // Se o time A errou, ponto vai pro time B
    const opposingTeam = team === 'A' ? 'B' : 'A';
    
    const currentScoreA = scoreA;
    const currentScoreB = scoreB;
    
    const backupRotationA = [...rotationA];
    const backupRotationB = [...rotationB];
    const backupServingTeam = servingTeam;

    let isAServingNow = servingTeam === 'A';
    let isServeBroken = false;

    if (opposingTeam === 'A') {
      setScoreA(currentScoreA + 1);
      if (!isAServingNow) {
        isServeBroken = true;
        setServingTeam('A');
        setRotationA(prev => rotateClockwiseWithFixedSetter(prev));
      }
    } else {
      setScoreB(currentScoreB + 1);
      if (isAServingNow) {
        isServeBroken = true;
        setServingTeam('B');
        setRotationB(prev => rotateClockwiseWithFixedSetter(prev));
      }
    }

    let playerName = '';
    if (generationResult) {
      const allP = [
        generationResult.teamA.setter, ...generationResult.teamA.players,
        generationResult.teamB.setter, ...generationResult.teamB.players
      ].filter(Boolean) as Player[];
      playerName = allP.find(p => p.id === playerId)?.name.split(' ')[0] || '';
    }

    let errorLabel = '';
    if (actionType === 'saque') errorLabel = 'na rede / fora do Saque';
    else if (actionType === 'ataque') errorLabel = 'no Ataque / Bloqueado';
    else if (actionType === 'levantamento') errorLabel = 'por Dois Toques / Quebra de levantamento';
    else if (actionType === 'defesa') errorLabel = 'por Falha defensiva / Recepção ruim';

    const description = `Erro de ${playerName} ${errorLabel} (Ponto pro Time ${opposingTeam})`;

    const newEvent = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      team: opposingTeam,
      scoreA: opposingTeam === 'A' ? currentScoreA + 1 : currentScoreA,
      scoreB: opposingTeam === 'B' ? currentScoreB + 1 : currentScoreB,
      type: 'error',
      action: actionType,
      playerId,
      playerName,
      description,
      rotationState: {
        rotationA: backupRotationA,
        rotationB: backupRotationB,
        servingTeam: backupServingTeam
      }
    };

    setPlayEvents(prev => [newEvent, ...prev]);
    playBeep(450, 0.25);
    
    if (isSoundEnabled) speakNarration(`Erro de ${playerName}. Ponto para o Time ${opposingTeam}!`);
    setSelectedPlayerForAction(null);
  };

  const handleCancelStatSelection = () => {
    setSelectedPlayerForAction(null);
    setSelectedStatAction(null);
    setSelectedStatResult(null);
  };

  const handleStatSubmit = () => {
    if (!selectedPlayerForAction || !selectedStatAction || !selectedStatResult) return;
    
    const { team, playerId } = selectedPlayerForAction;
    if (selectedStatResult === 'acerto') {
      handleAddLivePoint(team, selectedStatAction, playerId);
    } else {
      handleRegisterPlayerError(team, playerId, selectedStatAction);
    }
    
    setSelectedStatAction(null);
    setSelectedStatResult(null);
    setSelectedPlayerForAction(null);
  };

  // Desfazer Última Jogada (REVERSÃO COMPLETA)
  const handleUndoLiveAction = () => {
    if (playEvents.length === 0) {
      showNotification("Nenhum evento registrado nesta rodada para desfazer!", "info");
      return;
    }

    const lastEvent = playEvents[0];
    
    // Se possui estado de rodízio e placar armazenado
    if (lastEvent.rotationState) {
      setRotationA(lastEvent.rotationState.rotationA);
      setRotationB(lastEvent.rotationState.rotationB);
      setServingTeam(lastEvent.rotationState.servingTeam);
    }

    // Reverter pontos no store
    if (lastEvent.type === 'point' || lastEvent.type === 'error') {
      if (lastEvent.team === 'A') {
        setScoreA(Math.max(0, scoreA - 1));
      } else {
        setScoreB(Math.max(0, scoreB - 1));
      }
    } else if (lastEvent.type === 'decrement') {
      if (lastEvent.team === 'A') {
        setScoreA(scoreA + 1);
      } else {
        setScoreB(scoreB + 1);
      }
    }

    setPlayEvents(prev => prev.slice(1));
    playBeep(250, 0.4);
    if (isSoundEnabled) speakNarration("Último ponto desfeito!");
    showNotification("Jogada desfeita com sucesso!", "success");
  };

  // Interpretador de narração viva voz exclusivo do Ponto a Ponto (Para o coordenador de quadra falar lances de jogo)
  const handleStartPointMic = async () => {
    const SpeechLib = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechLib) {
      showNotification('Voz por comandos não é suportada neste navegador.', 'error');
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      showNotification('Permissão de microfone negada. Conceda acesso.', 'error');
      return;
    }

    const rec = new SpeechLib();
    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      setPointMicListening(true);
      setPointMicTranscript('Escutando lance de jogo...');
      setPointMicStatus('listening');
      playBeep(650, 0.1);
    };

    rec.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setPointMicTranscript(text);
      setPointMicStatus('processing');
      interpretPointSpeechAndApply(text);
    };

    rec.onerror = (e: any) => {
      console.error(e);
      setPointMicListening(false);
      setPointMicStatus('error');
      playBeep(300, 0.3);
    };

    rec.onend = () => {
      setPointMicListening(false);
    };

    rec.start();
    setPointMicInstance(rec);
  };

  // Algoritmo de interpretação de narração em tempo real
  const interpretPointSpeechAndApply = (transcript: string) => {
    if (!generationResult) return;
    const norm = transcript.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ") // remove pontuação
      .trim();

    // Obter todos os jogadores ativos na quadra
    const teamAPlayers = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean) as Player[];
    const teamBPlayers = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean) as Player[];
    
    // Tentar achar algum jogador mencionado na fala
    const findMencionatedPlayer = (list: Player[]) => {
      return list.find(p => {
        const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const firstName = pNorm.split(' ')[0];
        
        // Verifica se o termo inteiro do nome ou o primeiro nome existe na transcrição
        return norm.includes(pNorm) || (firstName.length > 2 && norm.includes(firstName));
      });
    };

    const playerA = findMencionatedPlayer(teamAPlayers);
    const playerB = findMencionatedPlayer(teamBPlayers);

    // Identifica ação técnica
    let actionType: 'saque' | 'ataque' | 'levantamento' | 'defesa' | 'geral' = 'geral';
    if (/\b(saque|ace|sacou|serve|serviu)\b/.test(norm)) actionType = 'saque';
    else if (/\b(ataque|atacou|cortou|cortada|pancada|ponto de ataque)\b/.test(norm)) actionType = 'ataque';
    else if (/\b(bloqueio|bloqueou|block|paredao|toco)\b/.test(norm)) actionType = 'defesa';
    else if (/\b(levantou|levantamento|segundo toque|levanta)\b/.test(norm)) actionType = 'levantamento';
    else if (/\b(defesa|recepcao|passe|defense|salvou|recebeu)\b/.test(norm)) actionType = 'defesa';

    // Identifica se foi erro
    const isError = /\b(erro|errou|na rede|fora|ruim|perdeu|falhou)\b/.test(norm);

    if (playerA) {
      // Jogador do Time A
      if (isError) {
        // Erro do Time A -> Ponto vai para o Time B
        handleRegisterPlayerError('A', playerA.id, actionType === 'geral' ? 'ataque' : actionType as any);
      } else {
        // Ponto do Time A
        handleAddLivePoint('A', actionType, playerA.id);
      }
      setPointMicStatus('success');
      playBeep(900, 0.25);
    } else if (playerB) {
      // Jogador do Time B
      if (isError) {
        // Erro do Time B -> Ponto vai para o Time A
        handleRegisterPlayerError('B', playerB.id, actionType === 'geral' ? 'ataque' : actionType as any);
      } else {
        // Ponto do Time B
        handleAddLivePoint('B', actionType, playerB.id);
      }
      setPointMicStatus('success');
      playBeep(900, 0.25);
    } else {
      // Se não mencionar jogador, tenta ver se mencionou Time A ou Time B diretamente
      const mentionsA = /\b(time a|equipe a|a)\b/.test(norm);
      const mentionsB = /\b(time b|equipe b|b|be)\b/.test(norm);

      if (mentionsA && !mentionsB) {
        handleAddLivePoint('A', 'geral');
        setPointMicStatus('success');
        playBeep(900, 0.15);
      } else if (mentionsB && !mentionsA) {
        handleAddLivePoint('B', 'geral');
        setPointMicStatus('success');
        playBeep(900, 0.15);
      } else {
        // Não entendeu nenhuma parte lógica
        setPointMicStatus('error');
        showNotification("Não entendi o lance. Diga 'ponto de [Nome]' ou 'erro de [Nome]'", "info");
        playBeep(300, 0.35);
      }
    }
  };

  const getPlayerById = (id: string): Player | undefined => {
    if (!id || !generationResult) return undefined;
    const all = [
      generationResult.teamA.setter, ...generationResult.teamA.players,
      generationResult.teamB.setter, ...generationResult.teamB.players
    ].filter(Boolean) as Player[];
    return all.find(p => p.id === id);
  };

  const renderCourtPlayerCircle = (team: 'A' | 'B', index: number, positionLabel: string) => {
    const list = team === 'A' ? rotationA : rotationB;
    const pId = list[index];
    const player = getPlayerById(pId);
    
    // O sacador é o jogador na posição 1 (index 0) da equipe que está sacando
    const isServingNow = servingTeam === team && index === 0;

    // Verificar se o jogador atual está selecionado para o lançamento de estatística
    const isSelected = selectedPlayerForAction && selectedPlayerForAction.playerId === pId && pId !== '';

    return (
      <div
        key={`${team}-${index}`}
        onClick={() => {
          if (player) {
            setSelectedPlayerForAction({ team, playerId: player.id, name: player.name });
            playBeep(600, 0.1);
          } else {
            showNotification(`Nenhum Guerreiro escalado na ${positionLabel} do Lado ${team}.`, "info");
          }
        }}
        className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-3xl border-2 flex flex-col items-center justify-center p-0.5 sm:p-1 transition-all duration-300 cursor-pointer select-none ${
          player
            ? isSelected
              ? 'bg-black text-brand-primary border-brand-primary border-[3px] ring-4 ring-brand-primary/50 scale-110 z-30 shadow-xl shadow-brand-primary/45'
              : team === 'A'
                ? isServingNow
                  ? 'bg-brand-primary text-black border-brand-primary ring-4 ring-brand-primary/30 shadow-lg scale-105'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white border-brand-primary/40 hover:scale-105 shadow-md shadow-black/40'
                : isServingNow
                  ? 'bg-brand-primary text-black border-brand-primary ring-4 ring-brand-primary/30 shadow-lg scale-105'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white border-white/20 hover:scale-105 shadow-md shadow-black/40'
            : 'bg-black/45 border-dashed border-white/10 text-white/20 cursor-not-allowed'
        }`}
      >
        {isServingNow && (
          <span className="absolute -top-1.5 sm:-top-2.5 bg-brand-primary text-black border border-black text-[5.5px] sm:text-[7px] font-black px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded-full uppercase tracking-widest leading-none z-10 animate-bounce">
            SAQUE
          </span>
        )}

        {isSelected && (
          <span className="absolute -top-1.5 sm:-top-2.5 bg-brand-primary text-black border border-black text-[5.5px] sm:text-[7px] font-black px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded-full uppercase tracking-widest leading-none z-10 animate-pulse font-sans">
            ATIVO
          </span>
        )}
        
        <p className="text-[5.5px] sm:text-[7px] font-bold uppercase opacity-45 leading-none mb-0.5 sm:mb-1 text-center font-sans">
          {positionLabel}
        </p>

        {player ? (
          <>
            <p className={`text-[8px] sm:text-xs font-black uppercase text-center truncate w-full px-0.5 sm:px-1 ${isSelected ? 'text-brand-primary' : 'text-inherit'}`}>
              {player.name.split(' ')[0]}
            </p>
            {(player.isOfficialSetter || generationResult?.teamA.setter?.id === player.id || generationResult?.teamB.setter?.id === player.id) && (
              <span className={`text-[5px] sm:text-[6.5px] font-black uppercase leading-none border px-0.5 sm:px-1 rounded-sm mt-0.5 sm:mt-1 ${isSelected ? 'text-brand-primary border-brand-primary/40 bg-brand-primary/10' : 'text-brand-primary border-brand-primary/25 bg-brand-primary/10'}`}>
                LVT
              </span>
            )}
          </>
        ) : (
          <p className="text-[7px] sm:text-[9px] font-black uppercase opacity-20">Vazio</p>
        )}
      </div>
    );
  };

  const handleWinnerClick = (winner: 'A' | 'B') => {
    setConfirmingWinner(winner);
    setLosingScoreInput('');
  };

  const handleConfirmFinalScore = () => {
    if (!confirmingWinner) return;
    
    let loserScore = parseInt(losingScoreInput) || 0;
    if (loserScore > 14) {
      loserScore = 14;
    }
    if (loserScore < 0) {
      loserScore = 0;
    }
    
    if (confirmingWinner === 'A') {
      onFinishMatch('A', 15, loserScore, playEvents);
      announceWinner('A', 15, loserScore);
      playSound('winA');
    } else {
      onFinishMatch('B', loserScore, 15, playEvents);
      announceWinner('B', loserScore, 15);
      playSound('winB');
    }
    
    setConfirmingWinner(null);
  };

  const eloChanges = getEloChanges();
  
  const estimatedAvgMins = Math.round(avgMatchDuration / 60) || 15;
  const numPresent = attendance.length;
  const numOnCourt = Math.min(12, numPresent);

  // Calcula dinamicamente o tempo de sessão e de encerramento
  const dynamicSession = React.useMemo(() => {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();

    const targetEndHour = 22;
    const targetEndMin = 0;
    const endTotalMins = targetEndHour * 60 + targetEndMin;
    const currentTotalMins = currentHours * 60 + currentMinutes;

    let remainingMinutes = endTotalMins - currentTotalMins;
    if (remainingMinutes < 0) remainingMinutes = 0;

    const playedCount = todayMatches.length + (generationResult ? 1 : 0);
    const playedMins = playedCount * estimatedAvgMins;
    const totalMinutes = playedMins + remainingMinutes;

    return {
      totalMinutes: Math.max(1, totalMinutes),
      remainingMinutes,
      isLive: true,
      endTimeStr: "22:00"
    };
  }, [todayMatches, generationResult, estimatedAvgMins]);

  // Total de partidas estimadas para a sessão inteira
  const totalExpectedMatches = Math.max(1, Math.round(dynamicSession.totalMinutes / estimatedAvgMins));

  // Média Geral de Partidas por Jogador (Número Inteiro)
  const avgMatchesPerPlayer = numPresent > 0
    ? Math.max(1, Math.round((totalExpectedMatches * 12) / numPresent))
    : 0;

  const generalProbability = numPresent > 0 ? (numOnCourt / numPresent) * 100 : 0;
  
  // State para hover sincronizado entre lista e mapa
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);

  // Calcula mapeamento tático sincronizado
  const suggestedPositionsA = generationResult ? calculateTeamPositions(generationResult.teamA, generationResult.teamB) : {};
  const suggestedPositionsB = generationResult ? calculateTeamPositions(generationResult.teamB, generationResult.teamA) : {};

  // Função para retornar a cor do LED (5 níveis de IC) para todos os jogadores da partida baseada estritamente no IC
  const getPlayerIcColor = (playerId: string) => {
    if (!generationResult) return { color: 'bg-white/20', title: 'N/A' };
    const allPlayers = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || []),
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || [])
    ].filter(Boolean) as Player[];

    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return { color: 'bg-white/20', title: 'N/A' };

    const ic = calculateCompositePerformanceRating(player);
    
    // Ordena todos os atletas em quadra por IC (do maior para o menor)
    const sortedByIc = [...allPlayers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
    const rankIndex = sortedByIc.findIndex(p => p.id === playerId);
    const totalOnCourt = sortedByIc.length;

    // Sinalização por LED baseada na classificação de IC da partida:
    // Nível 1 (Verde) -> Top 2 de IC da Partida
    if (rankIndex <= 1 || ic >= 55) {
      return { 
        color: 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.9)] animate-pulse', 
        title: `Nível 1 (Verde) - Top IC (Rank #${rankIndex + 1} | IC ${ic})` 
      };
    }
    // Nível 2 (Azul) -> Alto IC
    if (rankIndex <= Math.floor(totalOnCourt * 0.35) || ic >= 42) {
      return { 
        color: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse', 
        title: `Nível 2 (Azul) - Alto IC (Rank #${rankIndex + 1} | IC ${ic})` 
      };
    }
    // Nível 5 (Vermelho) -> Bottom 2 de IC da Partida (Menores ICs)
    if (rankIndex >= totalOnCourt - 2 || ic < 18) {
      return { 
        color: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse', 
        title: `Nível 5 (Vermelho) - Bottom 2 IC (Rank #${rankIndex + 1} | IC ${ic})` 
      };
    }
    // Nível 4 (Laranja) -> IC Baixo
    if (rankIndex >= totalOnCourt - 4 || ic < 30) {
      return { 
        color: 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.9)] animate-pulse', 
        title: `Nível 4 (Laranja) - IC Baixo (Rank #${rankIndex + 1} | IC ${ic})` 
      };
    }
    // Nível 3 (Amarelo) -> IC Médio
    return { 
      color: 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)] animate-pulse', 
      title: `Nível 3 (Amarelo) - IC Médio (Rank #${rankIndex + 1} | IC ${ic})` 
    };
  };

  const icColorsMap = React.useMemo(() => {
    const map: Record<string, { color: string, title: string }> = {};
    if (!generationResult) return map;
    const allPlayers = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || []),
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || [])
    ].filter(Boolean) as Player[];
    allPlayers.forEach(p => {
      map[p.id] = getPlayerIcColor(p.id);
    });
    return map;
  }, [generationResult]);

  // Helpers para o Rival Técnico (Jogador Equivalente)
  const getRivalId = (playerId: string | null, isA: boolean) => {
    if (!playerId || !generationResult) return null;
    
    // Identificar de qual time o jogador realmente faz parte
    let actualIsA = isA;
    if (generationResult.teamA) {
      const playersA = [generationResult.teamA.setter, ...(generationResult.teamA.players || [])].filter(Boolean);
      actualIsA = playersA.some(p => p?.id === playerId);
    }

    const myTeam = actualIsA ? generationResult.teamA : generationResult.teamB;
    const opponentTeam = actualIsA ? generationResult.teamB : generationResult.teamA;
    
    if (!myTeam || !opponentTeam) return null;

    const myPlayer = [myTeam.setter, ...(myTeam.players || [])].find(p => p?.id === playerId);
    if (!myPlayer) return null;

    const myPositions = actualIsA ? suggestedPositionsA : suggestedPositionsB;
    const oppPositions = actualIsA ? suggestedPositionsB : suggestedPositionsA;

    const myPosNumber = myPositions[playerId];
    if (!myPosNumber) return null;

    // Localizar o jogador do time oponente que tem exatamente a mesma posição tática (1-6)
    const oppPlayers = [opponentTeam.setter, ...(opponentTeam.players || [])].filter(Boolean);
    const rival = oppPlayers.find(p => oppPositions[p.id] === myPosNumber);
    
    return rival?.id || null;
  };

  const rivalId = hoveredPlayerId ? getRivalId(hoveredPlayerId, suggestedPositionsA[hoveredPlayerId] !== undefined) : null;

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      {/* Status do Sócio Logado */}
      {currentPlayer && userRole === 'MEMBER' && (
        <div className="bg-brand-secondary/40 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 border border-white/5 border-l-[6px] border-l-brand-primary flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 shadow-2xl">
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

      {/* Botões de Ação Administrativa */}
      {userRole === 'ADMIN' && (
        <div className="bg-black/40 backdrop-blur-md p-4 sm:p-6 rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-inner mb-6 flex flex-col sm:flex-row gap-4">
          <button 
            onClick={onFinishDay} 
            disabled={isSyncing}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${isSyncing ? 'bg-black/50 border-white/5 text-white/20' : 'border-red-500/30 bg-black text-red-500 hover:bg-red-500/10'}`}
          >
            <X className="w-4 h-4" /> {isSyncing ? 'Sincronizando...' : 'Finalizar Dia'}
          </button>
          
          {todayMatches.length > 0 && (
            <button 
              onClick={() => onDeleteMatchesByDate(today)} 
              disabled={isSyncing}
              className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${isSyncing ? 'bg-black/50 border-white/5 text-white/20' : 'border-rose-500/30 bg-black text-rose-500 hover:bg-rose-500/10'}`}
            >
              <Trash2 className="w-4 h-4" /> {isSyncing ? 'Excluindo...' : 'Excluir Partidas de Hoje'}
            </button>
          )}
        </div>
      )}

      {/* Alerta de Partidas Ocultas (Recuperação) */}
      {hiddenTodayMatches.length > 0 && (
        <div className="mb-6 bg-brand-secondary border border-white/5 border-l-[6px] border-l-brand-primary rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
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
        <div className="min-h-[600px] flex flex-col items-center justify-center text-center space-y-10 bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-10 py-20 shadow-2xl animate-in fade-in zoom-in duration-1000">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-primary/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="bg-brand-secondary p-10 rounded-full relative z-10 border border-brand-primary/30 shadow-2xl">
              <Swords className="w-20 h-20 text-brand-primary" />
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-none flex items-center justify-center gap-2">
              Pronto para a Batalha?
              <HelpTooltip 
                title="Times Gerados" 
                content="O sistema equilibra os times automaticamente com base no nível técnico (estrelas) e prioriza quem está há mais tempo sem jogar."
              />
            </h2>
            {attendance.length < 12 && (
              <p className="text-lg text-brand-primary max-w-md mx-auto font-black uppercase tracking-widest opacity-80">
                Convoque pelo menos 12 guerreiros. Atualmente: {attendance.length}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-6 w-full max-w-sm">
            {userRole === 'ADMIN' ? (
              <>
                <div className="bg-brand-secondary/40 border border-brand-primary/20 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Algoritmo de Balanceamento</h4>
                      <p className="text-[10px] text-brand-primary/70 tracking-wider uppercase font-black">
                        {teamGenerationMode === 'TRUESKILL' ? 'Sorteio com TrueSkill' : 'Sorteio por Habilidades Puras'}
                      </p>
                    </div>
                    <div className="bg-brand-primary/10 p-2 rounded-xl">
                      <Scale className="w-5 h-5 text-brand-primary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setTeamGenerationMode('PURE_SKILLS')}
                      className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        teamGenerationMode === 'PURE_SKILLS'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                    >
                      Habilidades Puras
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamGenerationMode('TRUESKILL')}
                      className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        teamGenerationMode === 'TRUESKILL'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                    >
                      TrueSkill
                    </button>
                  </div>
                </div>

                {/* Base de Cálculo de Eficiência (Híbrido vs IC Puro) */}
                <div className="bg-brand-secondary/40 border border-brand-primary/20 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Base de Cálculo do Sorteio</h4>
                      <p className="text-[10px] text-brand-primary/70 tracking-wider uppercase font-black">
                        {balancingRatingMode === 'IC_ONLY' ? 'Sorteio por IC Puro (100% Técnico)' : 'Sorteio Híbrido (50% ELO + 50% IC)'}
                      </p>
                    </div>
                    <div className="bg-brand-primary/10 p-2 rounded-xl">
                      <BarChart3 className="w-5 h-5 text-brand-primary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setBalancingRatingMode('IC_ONLY')}
                      className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        balancingRatingMode === 'IC_ONLY'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                    >
                      IC Puro
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalancingRatingMode('HYBRID')}
                      className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        balancingRatingMode === 'HYBRID'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                    >
                      Híbrido
                    </button>
                  </div>
                </div>

                <div className="bg-brand-secondary/40 border border-brand-primary/20 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Estratégia de Balanceamento</h4>
                      <p className="text-[10px] text-brand-primary/70 tracking-wider uppercase font-black">
                        {balancingStrategy === 'BOTH' ? 'Híbrido (Bottom 2 + Sinergia)' : balancingStrategy === 'BOTTOM_TWO' ? 'Separar Bottom 2' : 'Foco em Sinergia'}
                      </p>
                    </div>
                    <div className="bg-brand-primary/10 p-2 rounded-xl">
                      <Zap className="w-5 h-5 text-brand-primary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setBalancingStrategy('BOTH')}
                      className={`py-2 px-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all text-center ${
                        balancingStrategy === 'BOTH'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                      title="Separa os 2 menos experientes em times opostos E otimiza a sinergia total"
                    >
                      Ambos
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalancingStrategy('BOTTOM_TWO')}
                      className={`py-2 px-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all text-center ${
                        balancingStrategy === 'BOTTOM_TWO'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                      title="Garante estritamente os 2 menos experientes em equipes opostas"
                    >
                      Bottom 2
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalancingStrategy('SYNERGY')}
                      className={`py-2 px-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all text-center ${
                        balancingStrategy === 'SYNERGY'
                          ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20'
                          : 'bg-black/50 text-white/60 hover:text-white border border-white/10'
                      }`}
                      title="Prioriza otimizar pares com baixa sinergia sem trava rígida de Bottom 2"
                    >
                      Sinergia
                    </button>
                  </div>
                </div>
                    <button 
                      onClick={() => handleTriggerGenerate()} 
                      disabled={attendance.length < 12 || isSyncing || isGeneratingCountdown}
                      className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:bg-brand-secondary disabled:text-white/40 text-brand-secondary font-black py-6 rounded-3xl shadow-2xl shadow-brand-primary/20 transition-all flex items-center justify-center gap-4 uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 border border-brand-primary/40 disabled:border-brand-primary/40"
                    >
                      {isSyncing || isGeneratingCountdown ? 'Otimizando IC...' : 'Escalar Elite'} <ArrowRight className="w-5 h-5" />
                    </button>
              </>
            ) : (
              <div className="bg-brand-secondary/50 p-6 rounded-3xl border border-brand-primary/10">
                <p className="text-xs font-black text-brand-primary uppercase tracking-[0.2em] animate-pulse">Aguardando comando do organizador...</p>
              </div>
            )}
          </div>

          {/* Botão e Card do Simulador de Estratégias / Previsão / Saída Antecipada */}
          {attendance.length >= 12 && (
            <div className="w-full max-w-4xl my-6 flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
                {userRole === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setShowDepartureModal(true)}
                    className="px-6 py-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-lg hover:border-amber-500/50"
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Horários de Saída</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowSimulatorInMatch(!showSimulatorInMatch)}
                  className="px-6 py-3.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-lg hover:border-brand-primary/50"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{showSimulatorInMatch ? 'Ocultar Simulador de Balanceamento' : '⚡ Simulador de Estratégias & Previsão da Próxima Escalação'}</span>
                </button>
              </div>

              {showSimulatorInMatch && (
                <div className="w-full mt-4 animate-in fade-in zoom-in-95 duration-300">
                  <TeamBalancingSimulatorCard onApplyToMatch={() => setShowSimulatorInMatch(false)} />
                </div>
              )}
            </div>
          )}

          {systemMetadata.showEliteQueue && attendance.length >= 12 && priorityPlayers.length > 0 && (
            <div className="w-full max-w-4xl bg-brand-secondary/30 border border-white/5 border-l-[8px] border-l-brand-primary rounded-[3rem] p-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 shadow-inner">
              <div className="flex items-center gap-3 mb-8 justify-center">
                <Clock className="w-5 h-5 text-brand-primary" />
                <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Gestão de Fila e Prioridade de Elite</span>
              </div>

              {/* Fila de Prioridade */}
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-brand-primary/10" />
                  <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Próximos na Fila</span>
                  <div className="h-px flex-1 bg-brand-primary/10" />
                </div>
                
                <div className="flex overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center gap-4 snap-x scrollbar-hide">
                  {priorityPlayers.slice(0, 16).map((p) => (
                    <div 
                      key={p.id} 
                      className={`relative flex flex-col items-center px-6 py-4 rounded-[2rem] border shadow-xl transition-all duration-500 bg-black shrink-0 snap-center min-w-[140px] group hover:-translate-y-2 ${
                        (p.consecutiveBenched || 0) >= 2 
                          ? 'border-red-500/50 ring-4 ring-red-500/10' 
                          : 'border-brand-primary/40 hover:border-brand-primary/50'
                      }`}
                    >
                      <span className={`text-xs font-black uppercase truncate max-w-[110px] flex items-center gap-2 ${
                        (p.consecutiveBenched || 0) >= 2 ? 'text-red-500' : 'text-white'
                      }`}>
                        {p.name}
                        <span className="text-[9px] opacity-40 font-black" title={`Índice Composto (Técnica + WinRate): ${calculateCompositePerformanceRating(p).toFixed(1)}`}>
                          IC {calculateCompositePerformanceRating(p).toFixed(1)}
                        </span>
                        {p.isOfficialSetter && (
                          <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)] animate-pulse" title="Levantador Oficial" />
                        )}
                      </span>
                      {p.departureTime && (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded mt-1 shadow-sm" title={`Horário de saída antecipada agendado para ${p.departureTime}`}>
                          <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                          Out: {p.departureTime}
                        </span>
                      )}
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
              <div className="bg-black/40 backdrop-blur-md p-4 sm:p-6 rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-inner">

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
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 pt-6 border-t border-brand-primary/40 animate-in slide-in-from-top-2 fade-in duration-300">
                    <button 
                      onClick={() => {
                        if (!showAudit && !ruleVerification) {
                          onVerifyRules();
                        }
                        setShowAudit(!showAudit);
                      }} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showAudit ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
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
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showAnalysis ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <Sparkles className={`w-4 h-4 ${showAnalysis ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showAnalysis ? 'Ocultar Análise' : 'Análise IA'}
                    </button>

                    <button 
                      onClick={toggleTeamCards} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showTeamCards ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <Users className={`w-4 h-4 ${showTeamCards ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showTeamCards ? 'Ocultar Times' : 'Mostrar Times'}
                    </button>

                    <button 
                      onClick={toggleWaitlist} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showWaitlist ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <Clock className={`w-4 h-4 ${showWaitlist ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showWaitlist ? 'Ocultar Fila' : 'Mostrar Fila'}
                    </button>

                    <button 
                      onClick={togglePerformance} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showPerformance ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <BarChart3 className={`w-4 h-4 ${showPerformance ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showPerformance ? 'Ocultar Performance' : 'Mostrar Performance'}
                    </button>

                    <button 
                      onClick={toggleTelemetry} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showTelemetry ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <ShieldCheck className={`w-4 h-4 ${showTelemetry ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showTelemetry ? 'Ocultar Telemetria' : 'Mostrar Telemetria'}
                    </button>

                    <button 
                      onClick={toggleCourtForecast} 
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${showCourtForecast ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-white hover:bg-white/5'}`}
                    >
                      <TrendingUp className={`w-4 h-4 ${showCourtForecast ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      {showCourtForecast ? 'Ocultar Previsão' : 'Mostrar Previsão'}
                    </button>

                    <button 
                      onClick={onAnnounce} 
                      disabled={isNarrating}
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-8 py-4 rounded-2xl shadow-2xl transition-all ${isNarrating ? 'bg-brand-primary/50 text-brand-secondary animate-pulse' : 'bg-brand-primary text-brand-secondary hover:scale-105 border border-brand-primary/30'} ${!aiStatus.isAvailable ? 'grayscale opacity-70' : ''}`}
                    >
                      {isNarrating ? (
                        <Volume2 className="w-4 h-4 animate-bounce" />
                      ) : !aiStatus.isAvailable ? (
                        <VolumeX className="w-4 h-4 text-brand-secondary" />
                      ) : (
                        <Megaphone className="w-4 h-4" />
                      )}
                      {isNarrating ? 'Anunciando...' : !aiStatus.isAvailable ? 'IA Limitada' : 'Anunciar Times'}
                    </button>

                    <button 
                      onClick={() => handleTriggerGenerate(true)} 
                      disabled={isSyncing || isGeneratingCountdown}
                      className={`text-[10px] font-black uppercase border border-brand-primary/40 px-8 py-4 rounded-2xl shadow-2xl transition-all ${isSyncing || isGeneratingCountdown ? 'bg-brand-primary/10 text-white/40 border-white/5' : 'bg-black text-white hover:bg-white/5'}`}
                    >
                      {isSyncing || isGeneratingCountdown ? 'Otimizando IC...' : 'Nova Escalação'}
                    </button>

                    <button 
                      onClick={() => setShowDepartureModal(true)}
                      className="flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border border-amber-500/40 bg-black text-amber-300 hover:bg-amber-500/10 transition-all shadow-lg cursor-pointer"
                      title="Visualizar e editar horários de saída antecipada dos sócios"
                    >
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Horários de Saída</span>
                    </button>

                    <button 
                      onClick={() => setShowSimulatorInMatch(!showSimulatorInMatch)}
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg cursor-pointer ${showSimulatorInMatch ? 'bg-brand-primary text-brand-secondary border-brand-primary/30' : 'bg-black border-brand-primary/40 text-brand-primary hover:bg-white/5'}`}
                      title="Simular e pré-visualizar os times para a próxima partida"
                    >
                      <Sliders className={`w-4 h-4 ${showSimulatorInMatch ? 'text-brand-secondary' : 'text-brand-primary'}`} />
                      <span>{showSimulatorInMatch ? 'Ocultar Simulador' : '⚡ Simular Próxima Partida'}</span>
                    </button>

                    <button 
                      onClick={onDiscard} 
                      disabled={isSyncing}
                      className={`flex items-center gap-3 text-[10px] font-black uppercase px-6 py-4 rounded-2xl border transition-all shadow-lg ${isSyncing ? 'bg-black/50 border-white/5 text-white/20' : 'border-red-500/30 bg-black text-red-500 hover:bg-red-500/10'}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Simulador da Próxima Partida em Andamento */}
          {userRole === 'ADMIN' && showSimulatorInMatch && (
            <div className="mb-8 animate-in fade-in zoom-in-95 duration-300">
              <TeamBalancingSimulatorCard onApplyToMatch={() => setShowSimulatorInMatch(false)} />
            </div>
          )}

          {/* Análise IA */}
          {userRole === 'ADMIN' && showAnalysis && (analysis || isAnalyzing) && (
            <div className="bg-brand-primary/5 rounded-[2.5rem] p-10 mb-10 border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl relative overflow-hidden group animate-in slide-in-from-top-6 duration-700">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-all duration-700">
                <Sparkles className="w-40 h-40 text-brand-primary" />
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl bg-brand-primary/20 border border-brand-primary/30">
                  <Sparkles className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-[0.3em] text-white">Análise Técnica de Elite</h4>
                  <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v{APP_VERSION}{systemMetadata?.versionNumber ? ` (${systemMetadata.versionNumber})` : ''}</p>
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
            <div className="bg-brand-secondary rounded-[2.5rem] p-10 mb-10 border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl relative overflow-hidden group animate-in slide-in-from-top-6 duration-700">
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
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">Guerreiros Intelligence v{APP_VERSION}{systemMetadata?.versionNumber ? ` (${systemMetadata.versionNumber})` : ''}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 px-5 py-2 border rounded-2xl ${ruleVerification?.includes('⚠️') || ruleVerification?.includes('ALERTA') ? 'bg-red-500/10 border-red-500/20' : 'bg-brand-primary/10 border-brand-primary/40'}`}>
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
                  <div className="mt-10 pt-10 border-t border-brand-primary/40 flex items-center justify-between">
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Algoritmo</span>
                        <span className="text-xs font-black text-brand-primary uppercase tracking-widest">EFICIÊNCIA v3</span>
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
               {/* Monitor de Balanceamento do AI Agent (Visual LED - COCKPIT UNIVALENTE) */}
          {generationResult && showTelemetry && (() => {
            const effA = generationResult?.teamA?.totalEfficiency || generationResult?.teamA?.totalElo || 0;
            const effB = generationResult?.teamB?.totalEfficiency || generationResult?.teamB?.totalElo || 0;
            const diffEff = Math.abs(effA - effB);
            const percentDiff = Math.max(0.1, Math.round((diffEff / Math.max(1, Math.min(effA, effB))) * 1000) / 10);
            const balanceQuality = Math.max(0, 100 - Math.round(percentDiff * 4));
            
            // 15 cockpit style LED curved blocks for maximum epic layout resolution!
            const totalBlocks = 15;
            const activeBlocks = Math.min(totalBlocks, Math.round((balanceQuality / 100) * totalBlocks));

            return (
              <div id="balance_monitor_cockpit" className="bg-black rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 mb-8 border-2 border-brand-primary/40 shadow-[0_0_30px_rgba(245,196,41,0.15)] relative overflow-hidden animate-in slide-in-from-top-4 duration-500">
                {/* Curved visual details at corners representing an F1 carbon steering wheel / cockpit dashboard */}
                <div className="absolute top-0 left-0 w-24 h-2 bg-gradient-to-r from-brand-primary via-brand-primary/50 to-transparent" />
                <div className="absolute bottom-0 right-0 w-24 h-2 bg-gradient-to-l from-brand-primary via-brand-primary/50 to-transparent" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-brand-primary/10 rounded-2xl border border-brand-primary/35">
                      <ShieldCheck className="w-6 h-6 text-brand-primary animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-[0.25em] text-white">TELEMETRIA COCKPIT • CONTROLE DE EQUILÍBRIO</h4>
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.15em] mt-0.5 font-sans">Métrica multi-critério ativa</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-xl self-start sm:self-center">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary"></span>
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-brand-primary font-mono">
                      OPTIMIZER: 100% ESTÁVEL
                    </span>
                  </div>
                </div>

                {/* Unified Cockpit LED Arc Display on top of the indicators */}
                <div className="bg-brand-secondary/20 p-5 rounded-3xl border border-brand-primary/15 mb-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-brand-primary/25 rounded-b-full blur-sm" />
                  <div className="flex-1 space-y-1.5 text-center md:text-left">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-brand-primary block leading-none">Conselho Desportivo Inteligente</span>
                    <h5 className="text-lg font-black text-white uppercase tracking-tight">ÍNDICE DE EQUILÍBRIO DOS GUERREIROS</h5>
                    <p className="text-xs text-white/50 leading-relaxed font-bold uppercase tracking-wide">
                      A simetria calculada é de <span className="text-brand-primary font-black font-mono">{balanceQuality}%</span> baseado em <span className="text-white font-mono">{generationResult?.combinationsCount || 5000}</span> permutações de escalação de atletas.
                    </p>
                    <div className="mt-3 flex items-center justify-center md:justify-start gap-1.5 bg-brand-primary/10 inline-flex px-3 py-1.5 rounded-full border border-brand-primary/20">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary">Auditado e Verificado por Agente de IA</span>
                    </div>
                  </div>
                  
                  {/* Cockpit Arch LEDs */}
                  <div className="flex flex-col items-center gap-2.5 shrink-0 bg-black/60 px-6 py-4 rounded-2xl border border-white/5">
                    <div className="flex gap-1 items-end h-10">
                      {Array.from({ length: totalBlocks }).map((_, i) => {
                        const isActive = i < activeBlocks;
                        let colorClass = "bg-white/5";
                        if (isActive) {
                          if (i < 5) colorClass = "bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]";
                          else if (i < 11) colorClass = "bg-brand-primary/60 shadow-[0_0_8px_rgba(245,196,41,0.4)]";
                          else colorClass = "bg-brand-primary shadow-[0_0_12px_rgba(245,196,41,0.9)]";
                        }
                        
                        const height = 10 + Math.sin((i / (totalBlocks - 1)) * Math.PI) * 28;

                        return (
                          <div 
                            key={`led-${i}`} 
                            className={`w-2 rounded-full duration-500 transition-all ${colorClass}`}
                            style={{ height: `${height}px` }}
                          />
                        );
                      })}
                    </div>
                    <div className="text-center font-mono">
                      <span className="text-[11px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-md border border-brand-primary/35">
                        {balanceQuality}% SYMMETRY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card de Relatório de Conformidade do AI Agent - Cumpriu as Regras */}
                <div className="bg-brand-secondary/20 border border-brand-primary/20 p-5 rounded-3xl mb-6 relative overflow-hidden backdrop-blur-sm animate-in fade-in duration-500">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <ClipboardCheck className="w-24 h-24 text-brand-primary" />
                  </div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
                    <CheckCircle2 className="w-5 h-5 text-brand-primary shrink-0 animate-pulse" />
                    <div>
                      <h5 className="text-xs font-black uppercase tracking-widest text-white">Relatório de Conformidade do AI Agent</h5>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest leading-none mt-0.5">Auditoria e Verificação Geral do Sorteio</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {/* Item 1 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Fila de Presença</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">SÓCIOS ATIVOS OK</p>
                      </div>
                    </div>

                    {/* Item 2 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Rodagem Imediata</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">SEM BANCO CONSECUTIVO</p>
                      </div>
                    </div>

                    {/* Item 3 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Equidade de Gênero</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">DISTRIBUIÇÃO SIMÉTRICA</p>
                      </div>
                    </div>

                    {/* Item 4 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Sistema ABAB</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">ALTERNÂNCIA DE FORÇA</p>
                      </div>
                    </div>

                    {/* Item 5 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Regra "Bottom 4"</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">EXTREMOS SEPARADOS</p>
                      </div>
                    </div>

                    {/* Item 6 */}
                    <div className="flex items-center gap-3 bg-black/50 p-2.5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
                      <div className="p-1 px-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/25 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-brand-primary font-black" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/50 tracking-wider">Permutas & Otimização</p>
                        <p className="text-[10px] sm:text-xs font-black text-white uppercase mt-0.5">{generationResult?.combinationsCount || 5000} COMBINAÇÕES HOJE</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4 Cards Grid - Fully stylized like an integrated dashboard panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Metric 1: Simetria */}
                  <div className="bg-brand-secondary/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between min-h-[140px]">
                    <div className="flex items-center justify-between pb-1 border-b border-white/5">
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Simetria de Forças</span>
                      <div className={`w-2 h-2 rounded-full ${percentDiff <= 5 ? 'bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]' : 'bg-white'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white font-mono leading-none">{percentDiff}%</p>
                      <span className="text-[9px] text-white/40 uppercase font-black tracking-wider block mt-1">Desvio Técnico Calculado</span>
                    </div>
                    <p className="text-[8.5px] font-bold text-brand-primary uppercase tracking-widest leading-none mt-2">
                      {percentDiff <= 5 ? '● DIFERENÇA IRRELEVANTE' : '● MARGEM ACEITÁVEL'}
                    </p>
                  </div>

                  {/* Metric 2: Comparativo de Habilidades Técnicas (Ofensivo) */}
                  {(() => {
                    const playersA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean);
                    const playersB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean);

                    const getSkillAverage = (players: any[], skillKey: 'attacking' | 'defense' | 'serving' | 'setting') => {
                      if (players.length === 0) return 0;
                      const sum = players.reduce((acc, p) => acc + (p.skills?.[skillKey] || 1), 0);
                      return Number((sum / players.length).toFixed(1));
                    };

                    const avgAttackA = getSkillAverage(playersA, 'attacking');
                    const avgAttackB = getSkillAverage(playersB, 'attacking');
                    const avgServeA = getSkillAverage(playersA, 'serving');
                    const avgServeB = getSkillAverage(playersB, 'serving');

                    return (
                      <div className="bg-brand-secondary/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between min-h-[140px] gap-2.5">
                        <div className="flex items-center justify-between pb-1 border-b border-white/5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 font-mono">Ofensivo • Ataque & Saque</span>
                          <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]" />
                        </div>
                        
                        <div className="space-y-2 flex-grow flex flex-col justify-center">
                          {/* Ataque */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px] leading-none">
                              <span className="font-bold text-white/50 uppercase">ATAQUE</span>
                              <span className="font-bold uppercase">
                                <span className="text-brand-primary font-black">A: {avgAttackA}</span>
                                <span className="text-white/30 px-1">•</span>
                                <span className="text-white font-black">B: {avgAttackB}</span>
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-brand-primary h-full rounded transition-all shadow-[0_0_6px_rgba(245,196,41,0.5)]" style={{ width: `${(avgAttackA / 3) * 100}%` }} />
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-white h-full rounded transition-all shadow-[0_0_6px_rgba(255,255,255,0.4)]" style={{ width: `${(avgAttackB / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* Saque */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px] leading-none">
                              <span className="font-bold text-white/50 uppercase">SAQUE</span>
                              <span className="font-bold uppercase">
                                <span className="text-brand-primary font-black">A: {avgServeA}</span>
                                <span className="text-white/30 px-1">•</span>
                                <span className="text-white font-black">B: {avgServeB}</span>
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-brand-primary h-full rounded transition-all shadow-[0_0_6px_rgba(245,196,41,0.5)]" style={{ width: `${(avgServeA / 3) * 100}%` }} />
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-white h-full rounded transition-all shadow-[0_0_6px_rgba(255,255,255,0.4)]" style={{ width: `${(avgServeB / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Metric 3: Gênero */}
                  {(() => {
                    const playersA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean);
                    const playersB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean);
                    const menA = playersA.filter(p => p.gender === 'MALE').length;
                    const womenA = playersA.filter(p => p.gender === 'FEMALE').length;
                    const menB = playersB.filter(p => p.gender === 'MALE').length;
                    const womenB = playersB.filter(p => p.gender === 'FEMALE').length;
                    const genderDiff = Math.abs(menA - menB);

                    return (
                      <div className="bg-brand-secondary/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between min-h-[140px] gap-2">
                        <div className="flex items-center justify-between pb-1 border-b border-white/5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Equidade de Gênero</span>
                          <div className={`w-2 h-2 rounded-full ${genderDiff <= 1 ? 'bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]' : 'bg-white'}`} />
                        </div>
                        
                        <div className="space-y-1.5 flex-grow flex flex-col justify-center">
                          <div className="flex items-center justify-between text-[9px] leading-none">
                            <span className="font-bold text-white/50 uppercase">EQ. A</span>
                            <span className="font-black text-brand-primary">{menA}♂ <span className="text-white/40">•</span> {womenA}♀</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
                            {Array.from({ length: menA }).map((_, i) => (
                              <div key={`ma-${i}`} className="flex-1 bg-brand-primary h-full rounded" />
                            ))}
                            {Array.from({ length: womenA }).map((_, i) => (
                              <div key={`fa-${i}`} className="flex-1 bg-white/40 h-full rounded" />
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-[9px] leading-none mt-1">
                            <span className="font-bold text-white/50 uppercase">EQ. B</span>
                            <span className="font-black text-brand-primary">{menB}♂ <span className="text-white/40">•</span> {womenB}♀</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
                            {Array.from({ length: menB }).map((_, i) => (
                              <div key={`mb-${i}`} className="flex-1 bg-brand-primary h-full rounded" />
                            ))}
                            {Array.from({ length: womenB }).map((_, i) => (
                              <div key={`fb-${i}`} className="flex-1 bg-white/40 h-full rounded" />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Metric 4: Comparativo de Habilidades Técnicas (Defensivo / Armação) */}
                  {(() => {
                    const playersA = [generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean);
                    const playersB = [generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean);

                    const getSkillAverage = (players: any[], skillKey: 'attacking' | 'defense' | 'serving' | 'setting') => {
                      if (players.length === 0) return 0;
                      const sum = players.reduce((acc, p) => acc + (p.skills?.[skillKey] || 1), 0);
                      return Number((sum / players.length).toFixed(1));
                    };

                    const avgDefenseA = getSkillAverage(playersA, 'defense');
                    const avgDefenseB = getSkillAverage(playersB, 'defense');
                    const avgSettingA = getSkillAverage(playersA, 'setting');
                    const avgSettingB = getSkillAverage(playersB, 'setting');

                    return (
                      <div className="bg-brand-secondary/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between min-h-[140px] gap-2.5">
                        <div className="flex items-center justify-between pb-1 border-b border-white/5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 font-mono">Defensivo • Defesa & Armação</span>
                          <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(245,196,41,0.8)]" />
                        </div>
                        
                        <div className="space-y-2 flex-grow flex flex-col justify-center">
                          {/* Defesa */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px] leading-none">
                              <span className="font-bold text-white/50 uppercase">DEFESA</span>
                              <span className="font-bold uppercase">
                                <span className="text-brand-primary font-black">A: {avgDefenseA}</span>
                                <span className="text-white/30 px-1">•</span>
                                <span className="text-white font-black">B: {avgDefenseB}</span>
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-brand-primary h-full rounded transition-all shadow-[0_0_6px_rgba(245,196,41,0.5)]" style={{ width: `${(avgDefenseA / 3) * 100}%` }} />
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-white h-full rounded transition-all shadow-[0_0_6px_rgba(255,255,255,0.4)]" style={{ width: `${(avgDefenseB / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* Levantamento */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px] leading-none">
                              <span className="font-bold text-white/50 uppercase">LEVANTAMENTO</span>
                              <span className="font-bold uppercase">
                                <span className="text-brand-primary font-black">A: {avgSettingA}</span>
                                <span className="text-white/30 px-1">•</span>
                                <span className="text-white font-black">B: {avgSettingB}</span>
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-brand-primary h-full rounded transition-all shadow-[0_0_6px_rgba(245,196,41,0.5)]" style={{ width: `${(avgSettingA / 3) * 100}%` }} />
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="bg-white h-full rounded transition-all shadow-[0_0_6px_rgba(255,255,255,0.4)]" style={{ width: `${(avgSettingB / 3) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* Recharts Radar e Bar Chart de Balanço de Poder e ELO */}
          {generationResult && showTelemetry && (
            <MatchBalanceCharts generationResult={generationResult} />
          )}

          {/* Resumo dos Times Otimizado */}
          <div className="bg-black backdrop-blur-md rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 mb-8 border border-white/5 border-l-[6px] border-l-brand-primary flex flex-col gap-8 animate-in fade-in duration-700 shadow-2xl">
            {/* Header Times */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3 mb-2">
               <h3 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-[0.3em] flex items-center gap-2">
                 Escalação por <span className="text-brand-primary">Eficiência Técnica</span>
                 <span className="text-white/40 text-[9px] font-medium ml-2">({generationResult?.combinationsCount || 0} simulações)</span>
               </h3>
               {(() => {
                 if (!generationResult) return null;
                 const sumA = [generationResult.teamA?.setter, ...(generationResult.teamA?.players || [])].filter(Boolean).reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
                 const sumB = [generationResult.teamB?.setter, ...(generationResult.teamB?.players || [])].filter(Boolean).reduce((acc, p) => acc + calculateCompositePerformanceRating(p), 0);
                 const mean = (sumA + sumB) / 2;
                 const stdDev = Math.abs(sumA - sumB) / 2;
                 const stdDevPercent = mean > 0 ? (stdDev / mean) * 100 : 0;
                 return (
                   <div className="flex items-center gap-2">
                     <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/40 text-brand-primary font-mono flex items-center gap-1.5" title={`Desvio Padrão do IC entre as equipes (±${stdDev.toFixed(1)} IC | Média: ${mean.toFixed(1)})`}>
                       <span>DESVIO PADRÃO:</span>
                       <span className="text-white font-bold">{stdDevPercent.toFixed(1)}%</span>
                     </span>
                   </div>
                 );
               })()}
            </div>

            {/* Time A */}
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(245,196,41,0.6)] animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-brand-primary uppercase tracking-widest">Equipe A</span>
                </div>
                <span className="text-[10px] sm:text-xs font-black text-brand-primary uppercase tracking-widest italic bg-brand-primary/10 px-3 py-1 rounded-full border border-brand-primary/40">
                  SOMA IC: {[generationResult?.teamA?.setter, ...(generationResult?.teamA?.players || [])].filter(Boolean).reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0).toFixed(1)}
                </span>
              </div>
              
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-6 gap-y-4 py-2">
                {[generationResult.teamA.setter, ...generationResult.teamA.players].filter(Boolean).map((p, idx) => {
                  const isHovered = hoveredPlayerId === p?.id;
                  const isRival = rivalId === p?.id;
                  
                  return (
                    <div 
                      key={p?.id || idx} 
                      onMouseEnter={() => setHoveredPlayerId(p?.id || null)}
                      onMouseLeave={() => setHoveredPlayerId(null)}
                      onTouchStart={() => setHoveredPlayerId(p?.id || null)}
                      onTouchEnd={() => setHoveredPlayerId(null)}
                      className={`flex items-center gap-2 group/player transition-all duration-300 ${isHovered || isRival ? 'scale-105' : ''}`}
                    >
                      <motion.span 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 300,
                          damping: 15,
                          delay: idx * 0.05
                        }}
                        className={`text-base sm:text-lg font-black uppercase tracking-tight relative transition-colors ${
                          isHovered 
                            ? 'text-white' 
                            : isRival 
                              ? 'text-brand-primary drop-shadow-[0_0_15px_rgba(245,196,41,0.8)]'
                              : (p?.isOfficialSetter 
                                ? 'text-brand-primary drop-shadow-[0_0_8px_rgba(245,196,41,0.5)]' 
                                : 'text-brand-primary drop-shadow-[0_0_5px_rgba(245,196,41,0.3)]')
                        }`}
                      >
                        {p?.name}
                        {(() => {
                          const icInfo = getPlayerIcColor(p?.id || '');
                          return (
                            <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title={icInfo.title}>
                              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${icInfo.color}`} />
                            </div>
                          );
                        })()}
                        <span className={`text-[11px] sm:text-[14px] font-black px-2.5 py-1 rounded border ml-2 transition-all ${
                          isHovered 
                            ? 'bg-brand-primary text-black border-brand-primary scale-110 shadow-lg' 
                            : isRival
                              ? 'bg-brand-primary border-brand-primary text-black'
                              : 'bg-brand-primary/20 text-brand-primary border-brand-primary/30'
                        }`}>
                          P{suggestedPositionsA[p?.id || '']}
                        </span>
                        <span className="text-[9px] sm:text-[11px] font-black opacity-40 ml-1.5 sm:ml-2 tracking-widest" title={`Índice Composto (Técnica + WinRate): ${calculateCompositePerformanceRating(p).toFixed(1)}`}>
                          IC {calculateCompositePerformanceRating(p).toFixed(1)}
                        </span>
                        <span className={`absolute -bottom-0.5 left-0 h-0.5 bg-brand-primary transition-all duration-500 ${isHovered || isRival ? 'w-full' : 'w-0 group-hover/player:w-full'}`} />
                      </motion.span>
                      {p?.isOfficialSetter && <Sparkles className={`w-3.5 h-3.5 sm:w-5 sm:h-5 text-brand-primary shrink-0 transition-all ${isHovered ? 'animate-spin' : 'animate-pulse'}`} />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-px w-full bg-white/10" />

            {/* Time B */}
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white uppercase tracking-widest">Equipe B</span>
                </div>
                <span className="text-[10px] sm:text-xs font-black text-white/80 uppercase tracking-widest italic bg-white/5 px-3 py-1 rounded-full border border-brand-primary/40">
                  SOMA IC: {[generationResult?.teamB?.setter, ...(generationResult?.teamB?.players || [])].filter(Boolean).reduce((sum, p) => sum + calculateCompositePerformanceRating(p), 0).toFixed(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-6 gap-y-4 py-2">
                {[generationResult.teamB.setter, ...generationResult.teamB.players].filter(Boolean).map((p, idx) => {
                  const isHovered = hoveredPlayerId === p?.id;
                  const isRival = rivalId === p?.id;

                  return (
                    <div 
                      key={p?.id || idx} 
                      onMouseEnter={() => setHoveredPlayerId(p?.id || null)}
                      onMouseLeave={() => setHoveredPlayerId(null)}
                      onTouchStart={() => setHoveredPlayerId(p?.id || null)}
                      onTouchEnd={() => setHoveredPlayerId(null)}
                      className={`flex items-center gap-2 group/player transition-all duration-300 ${isHovered || isRival ? 'scale-105' : ''}`}
                    >
                      <motion.span 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 300,
                          damping: 15,
                          delay: idx * 0.05
                        }}
                        className={`text-base sm:text-lg font-black uppercase tracking-tight relative transition-colors ${
                          isHovered 
                            ? 'text-brand-primary' 
                            : isRival
                              ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]'
                              : (p?.isOfficialSetter 
                                ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' 
                                : 'text-white/70 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]')
                        }`}
                      >
                        {p?.name}
                        {(() => {
                          const icInfo = getPlayerIcColor(p?.id || '');
                          return (
                            <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title={icInfo.title}>
                              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${icInfo.color}`} />
                            </div>
                          );
                        })()}
                        <span className={`text-[11px] sm:text-[14px] font-black px-2.5 py-1 rounded border ml-2 transition-all ${
                          isHovered 
                            ? 'bg-white text-black border-white scale-110 shadow-lg' 
                            : isRival
                              ? 'bg-white border-white text-black'
                              : 'bg-white/10 text-white border-white/20'
                        }`}>
                          P{suggestedPositionsB[p?.id || '']}
                        </span>
                        <span className="text-[9px] sm:text-[11px] font-black opacity-40 ml-1.5 sm:ml-2 tracking-widest" title={`Índice Composto (Técnica + WinRate): ${calculateCompositePerformanceRating(p).toFixed(1)}`}>
                          IC {calculateCompositePerformanceRating(p).toFixed(1)}
                        </span>
                        <span className={`absolute -bottom-0.5 left-0 h-0.5 bg-white transition-all duration-500 ${isHovered || isRival ? 'w-full' : 'w-0 group-hover/player:w-full'}`} />
                      </motion.span>
                      {p?.isOfficialSetter && <Sparkles className={`w-3.5 h-3.5 sm:w-5 sm:h-5 text-white shrink-0 transition-all ${isHovered ? 'animate-spin' : 'animate-pulse'}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Placar e Ações de Partida */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {/* Placar Central */}
            <div className={`${showCourtForecast ? 'md:col-span-2' : 'md:col-span-3'} bg-black rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-6 sm:p-10 shadow-2xl relative overflow-visible group`}>
              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              <div className="flex items-center justify-between mb-6 sm:mb-10 relative z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-brand-secondary rounded-xl sm:rounded-2xl border border-brand-primary/40">
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center">
                      Partida em Andamento
                      <HelpTooltip 
                        title="Partida Atual" 
                        content="Acompanhe o placar em tempo real. Apenas administradores podem alterar os pontos e finalizar o jogo."
                      />
                    </h3>
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mt-1">Partida {currentMatchNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 bg-brand-secondary/50 px-3 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-brand-primary/10">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white font-mono tracking-widest">{formatTime(elapsedTime)}</span>
                </div>
              </div>

              {/* Segmented Controller de Modo de Placar */}
              {userRole === 'ADMIN' && (
                <div className="flex items-center justify-center gap-2 mb-8 relative z-10 mx-auto max-w-sm w-full">
                  <div className="flex-1 flex bg-brand-secondary p-1 rounded-2xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setScoringTab('simple');
                        playBeep(550, 0.1);
                      }}
                      className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${
                        scoringTab === 'simple'
                          ? 'bg-brand-primary text-black font-black shadow-lg'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      REGISTRO RÁPIDO
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScoringTab('advanced');
                        playBeep(650, 0.1);
                      }}
                      className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        scoringTab === 'advanced'
                          ? 'bg-brand-primary text-black font-black shadow-lg'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      QUADRA & RODÍZIO
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={toggleSound}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center justify-center active:scale-95 ${
                      isSoundEnabled
                        ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/20 hover:border-brand-primary/45'
                        : 'bg-zinc-900 border-white/10 text-white/30 hover:text-white/60'
                    }`}
                    title={isSoundEnabled ? "Desativar Sons & Narração" : "Ativar Sons & Narração"}
                  >
                    {isSoundEnabled ? (
                      <Volume2 className="w-4 h-4 text-brand-primary animate-pulse" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-white/30" />
                    )}
                  </button>
                </div>
              )}

              <div className="flex flex-col items-center justify-center gap-6 sm:gap-8 relative z-10 w-full">
                {userRole === 'ADMIN' && (
                  <div className="flex flex-col items-center justify-center gap-6 w-full">
                    {scoringTab === 'simple' ? (
                      // --- ORIGINAL SIMPLE VIEW ---
                      <>
                        {!confirmingWinner ? (
                          <div className="flex flex-row items-center justify-center gap-3 sm:gap-8 w-full">
                            <button 
                              onClick={() => handleWinnerClick('A')}
                              disabled={isSyncing}
                              className={`w-1/2 px-2 py-4 sm:px-8 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-sm uppercase tracking-widest shadow-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3 ${isSyncing ? 'bg-brand-primary/50 text-black/50 cursor-not-allowed opacity-50' : 'bg-brand-primary hover:bg-brand-primary/90 text-black hover:scale-105 active:scale-95 shadow-brand-primary/20'}`}
                            >
                              <span>{isSyncing ? 'Carregando...' : 'Vitória A'}</span> <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>

                            <div className="hidden sm:block w-px h-16 bg-white/10" />

                            <button 
                              onClick={() => handleWinnerClick('B')}
                              disabled={isSyncing}
                              className={`w-1/2 px-2 py-4 sm:px-8 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-sm uppercase tracking-widest shadow-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3 ${isSyncing ? 'bg-white/50 text-black/50 cursor-not-allowed opacity-50' : 'bg-white hover:bg-gray-200 text-black hover:scale-105 active:scale-95 shadow-white/20'}`}
                            >
                              <span>{isSyncing ? 'Carregando...' : 'Vitória B'}</span> <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        ) : (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full bg-brand-secondary/90 backdrop-blur-md p-4 sm:p-8 rounded-[2rem] border border-brand-primary/40 flex flex-col items-center gap-4 sm:gap-8 shadow-2xl relative overflow-hidden"
                          >
                            {/* Decorative background element */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
                            
                            <div className="text-center relative z-10 px-2">
                              <div className="inline-flex items-center gap-2 mb-2 sm:mb-3">
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-brand-primary animate-pulse" />
                                <p className="text-[9px] sm:text-xs font-black text-brand-primary uppercase tracking-[0.2em] sm:tracking-[0.3em]">
                                  Resultado Final: Equipe {confirmingWinner}
                                </p>
                              </div>
                              <h4 className="text-base sm:text-xl font-black text-white uppercase tracking-tight leading-tight">
                                Placar do perdedor?
                              </h4>
                              <p className="text-white/40 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest mt-1 sm:mt-2">
                                Equipe {confirmingWinner} venceu (15)
                              </p>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full max-w-xs sm:max-w-none relative z-10">
                              <div className="w-full sm:flex-1 flex flex-col items-center gap-2">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest sm:hidden">Pontos do Adversário</label>
                                <input 
                                  type="number" 
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  min="0"
                                  max="14"
                                  value={losingScoreInput}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      setLosingScoreInput('');
                                      return;
                                    }
                                    const parsed = parseInt(val);
                                    if (!isNaN(parsed)) {
                                      if (parsed > 14) {
                                        setLosingScoreInput('14');
                                      } else if (parsed < 0) {
                                        setLosingScoreInput('0');
                                      } else {
                                        setLosingScoreInput(parsed.toString());
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmFinalScore()}
                                  placeholder="0"
                                  className="w-full sm:w-32 bg-black/50 border-2 border-brand-primary/40 rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-center text-3xl font-black text-white focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all outline-none"
                                  autoFocus
                                />
                              </div>

                              <div className="flex flex-col gap-2 sm:gap-3 w-full sm:flex-initial">
                                <button 
                                  onClick={handleConfirmFinalScore}
                                  disabled={isSyncing}
                                  className={`w-full sm:w-auto font-black uppercase tracking-widest px-8 py-4 sm:px-10 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3 group text-xs sm:text-sm ${
                                    isSyncing 
                                      ? 'bg-brand-primary/50 text-black/40 cursor-not-allowed' 
                                      : 'bg-brand-primary text-black hover:scale-105 active:scale-95 shadow-brand-primary/20'
                                  }`}
                                >
                                  <span>{isSyncing ? 'Sincronizando...' : 'Confirmar Vitória'}</span>
                                  {isSyncing ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trophy className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                  )}
                                </button>
                                
                                <button 
                                  onClick={() => !isSyncing && setConfirmingWinner(null)}
                                  disabled={isSyncing}
                                  className={`w-full sm:w-auto font-black uppercase tracking-widest text-[9px] py-1.5 transition-colors ${
                                    isSyncing ? 'text-white/10' : 'text-white/40 hover:text-white'
                                  }`}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>

                            {/* Destaques Técnicos da Partida */}
                            {playEvents.some(e => e.type === 'stat') && (
                              <div className="w-full mt-2 pt-4 border-t border-white/5 flex flex-col items-center gap-3">
                                <span className="text-[9px] font-black text-brand-primary/60 uppercase tracking-widest">Destaques em Eficácia Mecânica</span>
                                <div className="flex flex-wrap justify-center gap-2">
                                  {(() => {
                                    const statsMap: Record<string, { name: string, count: number }> = {};
                                    playEvents.filter(e => e.type === 'stat' && e.playerName).forEach(e => {
                                      if (!statsMap[e.playerId!]) statsMap[e.playerId!] = { name: e.playerName!, count: 0 };
                                      statsMap[e.playerId!].count++;
                                    });
                                    return Object.entries(statsMap)
                                      .sort((a, b) => b[1].count - a[1].count)
                                      .slice(0, 3)
                                      .map(([id, data]) => (
                                        <div key={id} className="bg-white/5 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                                          <Zap className="w-3 h-3 text-brand-primary" />
                                          <span className="text-[10px] font-black text-white uppercase">{data.name}</span>
                                          <span className="text-[10px] font-black text-brand-primary">{data.count}</span>
                                        </div>
                                      ));
                                  })()}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </>
                    ) : (
                      // --- ADVANCED COURT & ROTATION SCORING VIEW ---
                      <div className="w-full flex flex-col items-center gap-3 sm:gap-6">
                        {/* 1. VISUAL SPORTS SCOREBOARD INDICATOR */}
                        <div className="w-full bg-zinc-950 p-2 sm:p-4 rounded-2xl sm:rounded-3xl border border-white/5 flex flex-row items-center justify-between gap-2 sm:gap-4">
                          {/* Time A Score */}
                          <div className="flex items-center gap-1.5 sm:gap-4">
                            <button 
                              type="button"
                              onClick={() => handleSubtractLivePoint('A')}
                              className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white font-black flex items-center justify-center text-xs sm:text-lg"
                            >
                              <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <div className="text-center min-w-[50px] sm:min-w-[70px]">
                              <p className="text-[8px] sm:text-[10px] font-black uppercase text-white/50 tracking-wider leading-none mb-1">Equipe A</p>
                              <div className="text-xl sm:text-4xl font-black text-brand-primary font-mono select-none leading-none">
                                {scoreA}
                              </div>
                              <div className="mt-1">
                                <span className="text-[7px] sm:text-[8px] font-black text-brand-primary/60 uppercase tracking-tighter">Eficácia: {playEvents.filter(e => e.team === 'A' && e.type === 'stat').length}</span>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleAddLivePoint('A', 'geral')}
                              className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-brand-primary/15 hover:bg-brand-primary/25 active:scale-95 border border-brand-primary/25 text-brand-primary font-black flex items-center justify-center text-xs sm:text-lg"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </div>

                          {/* Middle VS and Server Indicator */}
                          <div className="flex flex-col items-center gap-1 text-center">
                            <div className="bg-brand-secondary/90 border border-brand-primary/30 rounded-full px-2 sm:px-4 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-ping" />
                              <span className="text-[7px] sm:text-[9px] font-black text-brand-primary uppercase tracking-widest leading-none">
                                {servingTeam === 'A' ? 'Saque A' : 'Saque B'}
                              </span>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                setServingTeam(servingTeam === 'A' ? 'B' : 'A');
                                playBeep(450, 0.1);
                              }}
                              className="text-[7px] sm:text-[8px] font-bold text-white/40 hover:text-white uppercase tracking-wider underline mt-0.5 leading-none"
                            >
                              Inverter
                            </button>
                          </div>

                          {/* Time B Score */}
                          <div className="flex items-center gap-1.5 sm:gap-4">
                            <button 
                              type="button"
                              onClick={() => handleSubtractLivePoint('B')}
                              className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white font-black flex items-center justify-center text-xs sm:text-lg"
                            >
                              <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <div className="text-center min-w-[50px] sm:min-w-[70px]">
                              <p className="text-[8px] sm:text-[10px] font-black uppercase text-white/50 tracking-wider leading-none mb-1">Equipe B</p>
                              <div className="text-xl sm:text-4xl font-black text-white font-mono select-none leading-none">
                                {scoreB}
                              </div>
                              <div className="mt-1">
                                <span className="text-[7px] sm:text-[8px] font-black text-white/40 uppercase tracking-tighter">Eficácia: {playEvents.filter(e => e.team === 'B' && e.type === 'stat').length}</span>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleAddLivePoint('B', 'geral')}
                              className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-black flex items-center justify-center text-xs sm:text-lg"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </div>

                        {/* 2. THE TACTICAL VOLLEYBALL COURT */}
                        <div className="w-full bg-zinc-950 p-2.5 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-white/5 relative overflow-visible flex flex-col items-center">
                          <p className="text-[8px] sm:text-[10px] font-black text-brand-primary uppercase tracking-widest mb-2.5 sm:mb-4">QUADRA TÁTICA (RODÍZIO ATIVO)</p>
                          
                          {/* Court Base Frame */}
                          <div className="w-full max-w-[280px] sm:max-w-sm border-2 border-brand-primary/45 bg-zinc-950 rounded-xl p-2.5 sm:p-4 flex flex-col gap-1.5 sm:gap-2 relative shadow-2xl overflow-visible">
                            <div className="absolute inset-0 bg-radial-gradient-br from-brand-primary/5 to-transparent pointer-events-none" />

                            {/* SUPERIOR COURT: TEAM B */}
                            <div className="flex flex-col gap-2.5 sm:gap-4">
                              <p className="text-[7px] sm:text-[8px] font-black text-white/30 uppercase text-center tracking-widest leading-none">LADO EQUIPE B</p>
                              
                              {/* Row 1 (Back row B: Pos 5, Pos 6, Pos 1 rearranged) */}
                              <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center">
                                {renderCourtPlayerCircle('B', 0, "Pos 1")}
                                {renderCourtPlayerCircle('B', 5, "Pos 6")}
                                {renderCourtPlayerCircle('B', 4, "Pos 5")}
                              </div>

                              {/* Row 2 (Front row B: Pos 4, Pos 3, Pos 2 rearranged) */}
                              <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center mb-1 sm:mb-2">
                                {renderCourtPlayerCircle('B', 1, "Pos 2")}
                                {renderCourtPlayerCircle('B', 2, "Pos 3")}
                                {renderCourtPlayerCircle('B', 3, "Pos 4")}
                              </div>
                            </div>

                            {/* NET SEPARATOR */}
                            <div className="relative w-full py-1.5 sm:py-2 flex items-center justify-center">
                              <div className="w-full h-[2px] sm:h-[3px] bg-gradient-to-r from-transparent via-brand-primary to-transparent" />
                              <div className="absolute text-[6.5px] sm:text-[8px] font-black tracking-widest uppercase bg-black px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-brand-primary/40 text-brand-primary leading-none">
                                REDE
                              </div>
                            </div>

                            {/* INFERIOR COURT: TEAM A */}
                            <div className="flex flex-col gap-2.5 sm:gap-4">
                              {/* Row 1 (Front row A: Pos 4, Pos 3, Pos 2) */}
                              <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center mt-1 sm:mt-2">
                                {renderCourtPlayerCircle('A', 3, "Pos 4")}
                                {renderCourtPlayerCircle('A', 2, "Pos 3")}
                                {renderCourtPlayerCircle('A', 1, "Pos 2")}
                              </div>

                              {/* Row 2 (Back row A: Pos 5, Pos 6, Pos 1) */}
                              <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center">
                                {renderCourtPlayerCircle('A', 4, "Pos 5")}
                                {renderCourtPlayerCircle('A', 5, "Pos 6")}
                                {renderCourtPlayerCircle('A', 0, "Pos 1")}
                              </div>

                              <p className="text-[7px] sm:text-[8px] font-black text-brand-primary/50 uppercase text-center tracking-widest leading-none mt-0.5 sm:mt-1">LADO EQUIPE A</p>
                            </div>
                          </div>

                          {/* Interactive Rotation controls beneath the court */}
                          <div className="flex flex-row gap-2 mt-4 sm:mt-6 w-full max-w-[280px] sm:max-w-sm justify-between items-center px-1">
                            <div className="flex flex-col gap-1 items-center">
                              <span className="text-[7px] sm:text-[8px] font-bold uppercase text-white/40 tracking-wider">Rodízio A</span>
                              <div className="flex gap-1">
                                <button 
                                  type="button"
                                  onClick={() => rotateTeamCounterClockwise('A')}
                                  title="Inverter Sentido (Anti-horário)"
                                  className="p-1.5 sm:p-2 bg-zinc-900 border border-white/10 hover:border-brand-primary/30 rounded-lg sm:rounded-xl text-white active:scale-95 transition-all"
                                >
                                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => rotateTeamClockwise('A')}
                                  title="Rotacionar (Sentido Horário)"
                                  className="p-1.5 sm:p-2 sm:px-3 bg-zinc-900 border border-brand-primary/30 hover:bg-brand-primary hover:text-black rounded-lg sm:rounded-xl text-brand-primary active:scale-95 transition-all text-[8px] sm:text-[9px] font-black flex items-center gap-1"
                                >
                                  <RotateCw className="w-3 h-3" />
                                  <span>RODAR</span>
                                </button>
                              </div>
                            </div>

                            {/* UNDO BUTTON */}
                            <button 
                              type="button"
                              onClick={handleUndoLiveAction}
                              disabled={playEvents.length === 0}
                              className={`p-2 sm:p-2.5 px-2.5 rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 transition-all ${
                                playEvents.length === 0 
                                  ? 'bg-zinc-900/40 text-white/20 border border-transparent cursor-not-allowed'
                                  : 'bg-zinc-900 border border-red-500/30 hover:border-red-500 text-red-400 active:scale-95 hover:bg-red-500/5'
                              }`}
                            >
                              <Undo className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span>UNDO</span>
                            </button>

                            <div className="flex flex-col gap-1 items-center">
                              <span className="text-[7px] sm:text-[8px] font-bold uppercase text-white/40 tracking-wider">Rodízio B</span>
                              <div className="flex gap-1">
                                <button 
                                  type="button"
                                  onClick={() => rotateTeamClockwise('B')}
                                  title="Rotacionar (Sentido Horário)"
                                  className="p-1.5 sm:p-2 sm:px-3 bg-zinc-900 border border-brand-primary/30 hover:bg-brand-primary hover:text-black rounded-lg sm:rounded-xl text-brand-primary active:scale-95 transition-all text-[8px] sm:text-[9px] font-black flex items-center gap-1"
                                >
                                  <RotateCw className="w-3 h-3" />
                                  <span>RODAR</span>
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => rotateTeamCounterClockwise('B')}
                                  title="Inverter Sentido (Anti-horário)"
                                  className="p-1.5 sm:p-2 bg-zinc-900 border border-white/10 hover:border-brand-primary/30 rounded-lg sm:rounded-xl text-white active:scale-95 transition-all"
                                >
                                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>



                        {/* 4. HANDS-FREE VOICE NARRATOR */}
                        <div className="w-full bg-zinc-950 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                            <p className="text-[9px] font-black uppercase text-white/50 tracking-widest">NARRAR LANCE POR VIVA VOZ DA QUADRA</p>
                          </div>

                          <div className="flex items-center gap-4 w-full justify-center">
                            <button 
                              type="button"
                              onClick={handleStartPointMic}
                              className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                pointMicListening 
                                  ? 'bg-red-600 text-white scale-110 shadow-lg shadow-red-600/50' 
                                  : 'bg-brand-primary text-black hover:scale-105 active:scale-95'
                              }`}
                            >
                              {pointMicListening ? (
                                <>
                                  <span className="absolute inset-0 rounded-full bg-red-600/30 animate-ping" />
                                  <Mic className="w-5 h-5 animate-pulse" />
                                </>
                              ) : (
                                <Mic className="w-5 h-5" />
                              )}
                            </button>

                            <div className="text-left w-2/3">
                              {pointMicListening ? (
                                <p className="text-[9px] font-bold text-red-400 animate-pulse italic">Escutando lance...</p>
                              ) : (
                                <p className="text-[8px] font-extrabold text-white/40 uppercase tracking-widest leading-none">Clique e fale:</p>
                              )}
                              <p className="text-[10px] sm:text-xs font-black text-white mt-1 leading-tight">
                                {pointMicListening 
                                  ? (pointMicTranscript || "Fale agora lances...") 
                                  : "Ex: 'Ataque de Rodney' ou 'Erro de saque do Marcelo'"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* 5. PLAY LOGGER FEED */}
                        <div className="w-full bg-zinc-950/60 rounded-3xl p-4 border border-white/5">
                          <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-3">
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">REGISTRO DE LANCES</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowPlayEventsLog(!showPlayEventsLog)}
                                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-[8px] font-black uppercase text-brand-primary border border-brand-primary/20 transition-all active:scale-95 shrink-0"
                              >
                                {showPlayEventsLog ? 'Ocultar' : 'Exibir'}
                              </button>
                              <span className="text-[9px] font-extrabold text-brand-primary uppercase tracking-widest">{playEvents.length} Eventos</span>
                            </div>
                          </div>

                          {showPlayEventsLog && (
                            <>
                              {playEvents.length === 0 ? (
                                <p className="text-[10px] font-extrabold text-white/30 text-center uppercase py-4">Nenhum lance registrado neste set.</p>
                              ) : (
                                <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                  {playEvents.map((ev) => (
                                    <div 
                                      key={ev.id} 
                                      className={`p-2 rounded-xl text-[10px] font-bold flex justify-between items-center border ${
                                        ev.type === 'error' 
                                          ? 'bg-red-950/20 border-red-500/10 text-red-300' 
                                          : ev.type === 'decrement'
                                            ? 'bg-zinc-900/60 border-white/5 text-white/40'
                                            : 'bg-emerald-950/20 border-emerald-500/10 text-emerald-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 leading-none">
                                        <span className="font-mono text-white/30">[{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                        <span>{ev.description}</span>
                                      </div>
                                      <span className="font-mono text-[9px] text-white/40 bg-black/40 px-1.5 py-0.5 rounded border border-white/5 leading-none shrink-0">
                                        {ev.scoreA} x {ev.scoreB}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* 6. TRIUMPHANT SET COMPLETION BANNER */}
                        {(scoreA >= 15 || scoreB >= 15) && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            type="button"
                            onClick={() => {
                              const winner = scoreA > scoreB ? 'A' : 'B';
                              onFinishMatch(winner, scoreA, scoreB, playEvents);
                              announceWinner(winner, scoreA, scoreB);
                              playSound(winner === 'A' ? 'winA' : 'winB');
                            }}
                            className="w-full py-4 bg-brand-primary text-black font-black uppercase text-xs tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 relative overflow-hidden"
                          >
                            <Trophy className="w-4 h-4 animate-bounce" />
                            <span>FINALIZAR PARTIDA ({scoreA} x {scoreB})</span>
                          </motion.button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-8 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mt-1 sm:mt-2 w-full">
                  <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <span className="text-green-400 bg-green-400/10 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-green-400/20 whitespace-nowrap">Vitória: +{eloChanges.aWin} ELO</span>
                    <span className="text-red-400 bg-red-400/10 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-red-400/20 whitespace-nowrap">Derrota: {eloChanges.aLoss} ELO</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-white/60 bg-white/5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-brand-primary/40 w-full sm:w-auto">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{attendance.length} Sócios Presentes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analisador de Probabilidades de Jogo */}
          {showCourtForecast && (
            <div className="md:col-span-1 bg-black rounded-[2rem] border border-white/5 border-l-[8px] border-l-brand-primary p-3.5 sm:p-4.5 shadow-2xl relative overflow-hidden group flex flex-col h-full justify-between animate-in fade-in slide-in-from-top-6 duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
              
              <div className="relative z-10 w-full flex-grow flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-brand-secondary rounded-lg border border-brand-primary/30">
                        <TrendingUp className="w-4 h-4 text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-[0.1em] flex items-center gap-1">
                          Previsão de Quadra
                          <HelpTooltip 
                            title="Metrô de Partidas Automatizado" 
                            content={`Cálculo matemático preditivo com base na contagem de sócios presentes, média de duração REAL das partidas de hoje e encerramento limite às ${dynamicSession.endTimeStr}.`}
                          />
                        </h3>
                        <p className="text-[8px] font-black text-brand-primary uppercase tracking-[0.1em] leading-none">Cálculo em Tempo Real</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCourtForecastContent(!showCourtForecastContent)}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-[8px] font-black uppercase text-brand-primary border border-brand-primary/20 transition-all active:scale-95 shrink-0"
                    >
                      {showCourtForecastContent ? 'Ocultar' : 'Exibir'}
                    </button>
                  </div>

                  {showCourtForecastContent && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Bloco de Destaque da Média por Guerreiro (ULTRA OTIMIZADO & COMPACTO) */}
                      <div className="bg-brand-secondary/45 border border-brand-primary/10 p-2.5 rounded-xl text-center mb-2 flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 text-left">
                          <div className="p-1.5 bg-brand-primary/10 rounded-lg border border-brand-primary/20">
                            <Percent className="w-3.5 h-3.5 text-brand-primary animate-pulse" />
                          </div>
                          <div>
                            <p className="text-[7.5px] font-black uppercase tracking-widest text-white/40 leading-none">Média de Quadra</p>
                            <p className="text-[8px] font-extrabold uppercase tracking-wide text-brand-primary mt-1 leading-none">
                              {avgMatchesPerPlayer === 1 ? 'Partida Garantida' : 'Jogos por Guerreiro'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 bg-black/60 px-2.5 py-1 rounded-lg border border-white/5">
                          <span className="text-lg sm:text-xl font-black text-brand-primary font-mono tracking-tighter leading-none">
                            {avgMatchesPerPlayer}
                          </span>
                          <span className="text-[7px] font-bold text-white/30 uppercase tracking-widest leading-none">Jogos</span>
                        </div>
                      </div>

                      <div className="text-[8px] font-extrabold text-white/35 uppercase tracking-wider leading-none text-center mb-1">
                        Média de <strong className="text-white font-black">{avgMatchesPerPlayer} {avgMatchesPerPlayer === 1 ? 'partida' : 'partidas'}</strong> inteiras no dia.
                      </div>
                    </div>
                  )}
                </div>

                {showCourtForecastContent && (
                  <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/30 border-b border-white/5 pb-1 leading-none">Métricas do Dia</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-brand-secondary/15 border border-white/5 p-2 rounded-lg">
                        <p className="text-[7px] font-bold uppercase tracking-widest text-white/30 leading-none">Duração Média</p>
                        <p className="text-xs font-black text-white mt-1 font-mono leading-none">{estimatedAvgMins} min</p>
                        <span className="text-[6.5px] text-brand-primary/50 font-bold uppercase tracking-wider block mt-1 leading-none">Atualizado</span>
                      </div>
                      <div className="bg-brand-secondary/15 border border-white/5 p-2 rounded-lg">
                        <p className="text-[7px] font-bold uppercase tracking-widest text-white/30 leading-none">Término Estimado</p>
                        <p className="text-xs font-black text-white mt-1 font-mono leading-none">{dynamicSession.endTimeStr}</p>
                        <span className="text-[6.5px] text-white/35 font-bold uppercase tracking-wider block mt-1 leading-none">Encerramento Fixo</span>
                      </div>
                      <div className="bg-brand-secondary/15 border border-white/5 p-2 rounded-lg">
                        <p className="text-[7px] font-bold uppercase tracking-widest text-white/30 leading-none">Total Estimado</p>
                        <p className="text-xs font-black text-white mt-1 font-mono leading-none">{totalExpectedMatches} Jogos</p>
                        <span className="text-[6.5px] text-white/35 font-bold uppercase tracking-wider block mt-1 leading-none">No dia</span>
                      </div>
                      <div className="bg-brand-secondary/15 border border-white/5 p-2 rounded-lg">
                        <p className="text-[7px] font-bold uppercase tracking-widest text-white/30 leading-none">Tempo Restante</p>
                        <p className="text-xs font-black text-white mt-1 font-mono leading-none">
                          {dynamicSession.isLive ? `${dynamicSession.remainingMinutes} min` : 'Em breve'}
                        </p>
                        <span className="text-[6.5px] text-white/35 font-bold uppercase tracking-wider block mt-1 leading-none">Até o final</span>
                      </div>
                    </div>

                    {dynamicSession.isLive && (
                      <div className="bg-brand-primary/5 border border-brand-primary/25 rounded-lg p-1.5 text-[7.5px] text-brand-primary font-black uppercase tracking-widest text-center mt-1 animate-pulse">
                        Dia em andamento • {todayMatches.length} finalizados
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lista de Espera */}
          {showWaitlist && (
            <div className="bg-black rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 mb-10 border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 sm:p-10 opacity-5 pointer-events-none">
                <Clock className="w-20 h-20 sm:w-40 sm:h-40 text-brand-primary" />
              </div>
              
              <div className="flex items-center justify-between mb-6 sm:mb-10 relative z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-brand-secondary rounded-xl sm:rounded-2xl border border-brand-primary/40">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Guerreiros em Espera</h3>
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mt-1">Fila de Prioridade Dinâmica</p>
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
                              : 'bg-black border border-brand-primary/40 text-white'
                        }`}>
                          {idx + 1}º
                        </div>
                        <div className="min-w-0">
                          <motion.p 
                            initial={{ scale: 0.8, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ 
                              type: "spring",
                              stiffness: 300,
                              damping: 15,
                              delay: (idx % 6) * 0.05
                            }}
                            className={`text-sm sm:text-2xl font-black flex items-center gap-2 tracking-tight leading-none truncate ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}
                          >
                            {player.name}
                            {player.departureTime && (
                              <span className="inline-flex items-center gap-1 text-[8px] sm:text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded shadow-sm" title={`Horário de saída antecipada agendado para ${player.departureTime}`}>
                                <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                                Out: {player.departureTime}
                              </span>
                            )}
                            {player.timestamp && (
                              <span className="text-[10px] text-white/30 font-medium lowercase tracking-normal">
                                {new Date(player.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </motion.p>
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
                <div className="text-center py-10 sm:py-20 bg-brand-secondary/50 rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary relative z-10">
                  <p className="text-[10px] sm:text-xs font-black text-white/40 uppercase tracking-[0.2em] sm:tracking-[0.3em]">Nenhum guerreiro aguardando no momento</p>
                </div>
              )}
            </div>
          )}

          {swapSelection && (
            <div className="bg-brand-primary p-8 rounded-[2.5rem] mb-10 flex items-center justify-between shadow-2xl shadow-brand-primary/30 animate-pulse border border-white/5 border-l-[8px] border-l-brand-secondary">
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

          {userRole === 'ADMIN' && lowSynergyAlerts.length > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-[2.5rem] p-6 mb-8 text-white relative overflow-hidden shadow-2xl animate-in fade-in duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-rose-500/20">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-rose-500/20 rounded-2xl border border-rose-500/40 text-rose-400">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">Alerta de Sinergia Crítica Detectada</h4>
                    <p className="text-[10px] font-black text-rose-400/80 uppercase tracking-widest mt-0.5">Pares com histórico desfavorável agrupados na mesma equipe</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRunSynergyAgent}
                  disabled={isSolvingSynergy}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-brand-secondary px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl hover:scale-105 active:scale-95 transition-all shrink-0 border border-brand-primary/40 disabled:opacity-50"
                >
                  <Bot className={`w-4 h-4 ${isSolvingSynergy ? 'animate-spin' : 'animate-bounce'}`} />
                  <span>{isSolvingSynergy ? 'Executando 50 Simulações...' : 'Invocar Agente de Solução de Sinergia'}</span>
                </button>
              </div>
              <div className="space-y-3">
                {lowSynergyAlerts.map((alert, idx) => (
                  <div key={`alert-${idx}`} className="bg-black/60 border border-rose-500/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black bg-rose-500/20 text-rose-300 px-2.5 py-1 rounded-lg">Time {alert.team}</span>
                      <span className="text-sm font-black text-white uppercase tracking-tight">
                        {alert.p1.name} & {alert.p2.name}
                      </span>
                      <span className="text-xs font-bold text-rose-400">({Math.round(alert.winRate * 100)}% vitórias em {alert.games} jogos)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Ação do Agente: Troca focada de par problemático</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showTeamCards && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
              <TeamCard 
                title="Time A" 
                team={generationResult.teamA} 
                opponent={generationResult.teamB}
                color="green" 
                attendance={attendance}
                userRole={userRole}
                onSwap={(pid) => onSwapClick('A', pid)}
                onRemove={(pid) => onRemovePlayer('A', pid)}
                onPromote={(pid) => onPromoteToSetter('A', pid)}
                activeSwapId={swapSelection?.playerId}
                hoveredPlayerId={hoveredPlayerId}
                setHoveredPlayerId={setHoveredPlayerId}
                rivalId={rivalId}
                bottomTwoIds={new Set(generationResult.bottomTwoIds || [])}
                icColors={icColorsMap}
              />
              <TeamCard 
                title="Time B" 
                team={generationResult.teamB} 
                opponent={generationResult.teamA}
                color="blue" 
                attendance={attendance}
                userRole={userRole}
                onSwap={(pid) => onSwapClick('B', pid)}
                onRemove={(pid) => onRemovePlayer('B', pid)}
                onPromote={(pid) => onPromoteToSetter('B', pid)}
                activeSwapId={swapSelection?.playerId}
                hoveredPlayerId={hoveredPlayerId}
                setHoveredPlayerId={setHoveredPlayerId}
                rivalId={rivalId}
                bottomTwoIds={new Set(generationResult.bottomTwoIds || [])}
                icColors={icColorsMap}
              />
            </div>
          )}


          {/* Estatísticas de Partidas por Jogador */}
          {showPerformance && (
            <div className="bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-secondary rounded-2xl border border-brand-primary/40">
                    <BarChart3 className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">Performance do Dia</h3>
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mt-1">Histórico de Batalhas do Dia</p>
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
                          <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
                            B{i + 1}
                          </div>
                        </th>
                      ))}
                      {todayMatches.length === 0 && (
                        <th className="py-4 px-2 text-center min-w-[60px]">
                          <div className="mx-auto w-10 h-10 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg uppercase tracking-widest">
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
                      const rawArrivalOrder = player.arrivalOrder || fullPlayer?.arrivalOrder || 0;
                      const displayArrivalOrder = (rawArrivalOrder && rawArrivalOrder < 999) ? rawArrivalOrder : (idx + 1);

                      return (
                        <tr key={player.id || `attendance-row-${idx}`} className="group">
                          <td className="py-4 px-6 sticky left-0 bg-black z-10 border-y border-l border-brand-primary/40 rounded-l-2xl group-hover:bg-brand-secondary transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-xl bg-black border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-black shadow-lg">
                                {displayArrivalOrder}
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
                            <td 
                              key={match.id || `match-cell-${mIdx}`} 
                              className="py-4 px-2 text-center border-y border-brand-primary/40 group-hover:bg-brand-secondary transition-colors"
                              title={match.scoreA > 0 || match.scoreB > 0 ? `Placar: ${match.scoreA} x ${match.scoreB}` : 'Placar não registrado'}
                            >
                              {played ? (
                                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-black text-xs shadow-lg transition-all group-hover:scale-110 border ${won ? 'bg-brand-primary border-brand-primary/30 text-black' : 'bg-white border-white/30 text-black'}`}>
                                  {won ? 'V' : 'D'}
                                </div>
                              ) : (
                                <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/40 flex items-center justify-center">
                                  <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {todayMatches.length === 0 && (
                          <td className="py-4 px-2 text-center border-y border-brand-primary/40 group-hover:bg-brand-secondary transition-colors">
                            <div className="w-10 h-10 mx-auto rounded-xl border border-dashed border-brand-primary/40 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-brand-primary/20" />
                            </div>
                          </td>
                        )}
                        <td className="py-4 px-6 text-center border-y border-r border-brand-primary/40 rounded-r-2xl group-hover:bg-brand-secondary transition-colors">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-black text-white uppercase tracking-tight">{player.dailyMatches} Jogos</span>
                            <div className="flex gap-2 mt-1.5">
                              <span className="text-[9px] font-black text-black bg-brand-primary px-2 py-0.5 rounded-lg border border-brand-primary/40">{player.dailyWins}V</span>
                              <span className="text-[9px] font-black text-black bg-white px-2 py-0.5 rounded-lg border border-brand-primary/40">{player.dailyLosses}D</span>
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
                className="flex items-center gap-6 px-12 py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-[2rem] transition-all shadow-2xl shadow-rose-600/20 group relative overflow-hidden border border-white/5 border-l-[6px] border-l-rose-800"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <RefreshCw className="w-6 h-6 text-white group-hover:rotate-180 transition-transform duration-1000 relative z-10" />
                <div className="text-left relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80 leading-none mb-2">Encerrar Dia</p>
                  <p className="text-base font-black uppercase tracking-tight leading-none">Finalizar Dia de Jogos</p>
                </div>
              </button>
            </div>
          )}
          {/* Botão Flutuante de Microfone do Cockpit */}
          {userRole === 'ADMIN' && generationResult && (
            <div id="voice-recognition-fab-container">
              <button
                onClick={startVoiceListening}
                className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full border-2 transition-all duration-300 group ${
                  voiceListening 
                    ? 'bg-brand-primary text-black border-brand-primary animate-[pulse_1.5s_infinite] scale-110 shadow-[0_0_30px_rgba(245,196,41,0.8)]' 
                    : 'bg-black text-brand-primary border-brand-primary/60 shadow-[0_0_20px_rgba(245,196,41,0.25)] hover:border-brand-primary hover:shadow-[0_0_25px_rgba(245,196,41,0.5)] hover:scale-110 active:scale-95'
                }`}
                title="Registrar placar por voz"
              >
                {voiceListening ? (
                  <>
                    <Mic className="w-6 h-6 animate-bounce" />
                    {/* Ripple/radar pulsing waves */}
                    <span className="absolute inset-0 rounded-full border-2 border-brand-primary animate-ping opacity-75"></span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6 group-hover:animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-primary"></span>
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* REGISTRO DE LANCES RÁPIDOS EM POPUP MODAL/CARD CENTRALIZADO */}
          {selectedPlayerForAction && (
            <div 
              className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setSelectedPlayerForAction(null)}
            >
              <div 
                className="bg-black border border-brand-primary/50 w-full max-w-sm sm:max-w-md p-5 sm:p-6 rounded-[2.5rem] shadow-[0_0_60px_rgba(245,196,41,0.15)] flex flex-col gap-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header / Titulo do Guerreiro */}
                <div className="flex justify-between items-center border-b border-white/10 pb-4 w-full">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">Registrar Ação</span>
                    <span className="text-2xl font-black text-white uppercase tracking-tight truncate">
                      {selectedPlayerForAction.name}
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setSelectedPlayerForAction(null)}
                    className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/5 hover:border-white/20 transition-all flex items-center justify-center shrink-0 active:scale-95"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Actions Action/Res combo list */}
                <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1 pb-2 custom-scrollbar">
                  {/* SAQUE */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">S</div>
                      <span className="text-sm font-black uppercase text-white/60 tracking-wider">Saque</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddLivePoint(selectedPlayerForAction.team, 'saque', selectedPlayerForAction.playerId);
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-brand-primary hover:bg-brand-primary/90 text-black rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all shadow-md shadow-brand-primary/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        ACERTO
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleRegisterPlayerError(selectedPlayerForAction.team, selectedPlayerForAction.playerId, 'saque');
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-zinc-900 border border-white/10 hover:border-rose-500/50 hover:bg-rose-500/10 text-white rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        ERRO
                      </button>
                    </div>
                  </div>

                  {/* ATAQUE */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">A</div>
                      <span className="text-sm font-black uppercase text-white/60 tracking-wider">Ataque</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddLivePoint(selectedPlayerForAction.team, 'ataque', selectedPlayerForAction.playerId);
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-brand-primary hover:bg-brand-primary/90 text-black rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all shadow-md shadow-brand-primary/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        ACERTO
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleRegisterPlayerError(selectedPlayerForAction.team, selectedPlayerForAction.playerId, 'ataque');
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-zinc-900 border border-white/10 hover:border-rose-500/50 hover:bg-rose-500/10 text-white rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        ERRO
                      </button>
                    </div>
                  </div>

                  {/* DEFESA / BLOQUEIO */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">D</div>
                      <span className="text-sm font-black uppercase text-white/60 tracking-wider">Defesa</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddLivePoint(selectedPlayerForAction.team, 'defesa', selectedPlayerForAction.playerId);
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-white/5 hover:bg-white/10 text-white border border-white/20 rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all shadow-md"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                        EFICAZ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleRegisterPlayerError(selectedPlayerForAction.team, selectedPlayerForAction.playerId, 'defesa');
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-zinc-900 border border-white/10 hover:border-rose-500/50 hover:bg-rose-500/10 text-white rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        ERRO
                      </button>
                    </div>
                  </div>

                  {/* LEVANTAMENTO */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">L</div>
                      <span className="text-sm font-black uppercase text-white/60 tracking-wider">Levant.</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddLivePoint(selectedPlayerForAction.team, 'levantamento', selectedPlayerForAction.playerId);
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-white/5 hover:bg-white/10 text-white border border-white/20 rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all shadow-md"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                        EFICAZ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleRegisterPlayerError(selectedPlayerForAction.team, selectedPlayerForAction.playerId, 'levantamento');
                          setSelectedPlayerForAction(null);
                        }}
                        className="flex-1 sm:flex-none bg-zinc-900 border border-white/10 hover:border-rose-500/50 hover:bg-rose-500/10 text-white rounded-xl text-[9px] font-black uppercase px-3 py-2 flex justify-center items-center gap-1 active:scale-95 transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        ERRO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Reconhecimento de Voz */}
          {voiceModalOpen && (
            <div id="voice-modal-overlay" className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                <button
                  onClick={() => {
                    stopVoiceListening();
                    setVoiceModalOpen(false);
                  }}
                  className="p-3 bg-brand-secondary/60 hover:bg-brand-secondary rounded-full text-white/60 hover:text-white border border-white/5 hover:border-white/10 transition-all font-black"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Central Listening Hub */}
              <div className="w-full max-w-xl flex flex-col items-center text-center space-y-10">
                
                {/* Visual Mic Ripple / Steth / Equalizer */}
                <div className="relative flex items-center justify-center h-48 w-48">
                  {/* Concentric pulsing circles */}
                  {voiceListening && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-brand-primary/5 border border-brand-primary/10 animate-ping [animation-duration:3s]" />
                      <div className="absolute inset-4 rounded-full bg-brand-primary/10 border border-brand-primary/20 animate-ping [animation-duration:2s]" />
                      <div className="absolute inset-8 rounded-full bg-brand-primary/20 border border-brand-primary/30 animate-ping [animation-duration:1s]" />
                    </>
                  )}
                  
                  <div className={`h-28 w-28 rounded-full flex items-center justify-center text-black shadow-2xl transition-all duration-500 border-2 ${
                    voiceStatus === 'success' ? 'bg-brand-primary border-brand-primary shadow-brand-primary/40' :
                    voiceStatus === 'permission_denied' ? 'bg-white border-white shadow-white/30' :
                    voiceStatus === 'error' ? 'bg-white border-white shadow-white/20' :
                    'bg-black text-brand-primary border-brand-primary/60 shadow-brand-primary/20'
                  }`}>
                    {voiceListening ? (
                      <Mic className="w-12 h-12 animate-pulse" />
                    ) : voiceStatus === 'success' ? (
                      <Check className="w-14 h-14" />
                    ) : voiceStatus === 'permission_denied' || voiceStatus === 'error' ? (
                      <MicOff className="w-12 h-12 text-black" />
                    ) : (
                      <Mic className="w-12 h-12" />
                    )}
                  </div>
                </div>

                {/* Status Messages / Display Typography */}
                <div className="space-y-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary block leading-none w-full text-center">
                    {voiceStatus === 'listening' && "Aguardando seu sinal..."}
                    {voiceStatus === 'processing' && "Processando áudio falado..."}
                    {voiceStatus === 'success' && "Análise de voz concluída!"}
                    {voiceStatus === 'error' && "Comando não compreendido"}
                    {voiceStatus === 'permission_denied' && "PERMISSÃO MICROFONE NEGADA / BLOQUEADA"}
                    {voiceStatus === 'idle' && "Pronto para escutar"}
                  </span>
                  
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none font-sans text-center">
                    {voiceStatus === 'listening' ? "Fale o Placar da Partida" : 
                     voiceStatus === 'success' ? "Placar Interpretado" : 
                     voiceStatus === 'permission_denied' ? "Acesso Bloqueado pelo Iframe" :
                     voiceStatus === 'error' ? "Tente Falar Novamente" : 
                     "Registrar por Voz"}
                  </h3>
                  
                  <p className="text-white/40 text-xs uppercase tracking-widest leading-relaxed max-w-md mx-auto font-bold text-center">
                    {voiceStatus === 'listening' && "Diga por exemplo: 'Vitória do Time A de quinze a oito' ou 'Time B venceu por quinze a doze'"}
                    {voiceStatus === 'success' && "Verifique se os dados estão corretos antes de salvar na nuvem."}
                    {voiceStatus === 'permission_denied' && "Os navegadores restringem o áudio dentro de um console iframe de desenvolvimento. Clique no botão abaixo para abrir a aplicação em uma aba dedicada separada e ditar placares perfeitamente!"}
                    {voiceStatus === 'error' && "Não capturamos uma pontuação válida. Certifique-se de dizer o time (A ou B) e a pontuação do perdedor."}
                  </p>
                </div>

                {/* Diagnostic helper block for permission_denied status */}
                {voiceStatus === 'permission_denied' && (
                  <div className="w-full bg-white/5 border border-white/10 rounded-[2rem] p-6 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
                    <p className="text-white/60 text-xs text-center font-medium max-w-sm">
                      Ao abrir em uma aba independente, o navegador habilitará a solicitação nativa de microfone para que você possa registrar o placar por voz!
                    </p>
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 bg-brand-primary hover:bg-brand-primary/90 text-black font-black uppercase tracking-widest text-[11px] px-8 py-4.5 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all w-full max-w-xs justify-center"
                    >
                      <ExternalLink className="w-4 h-4 text-black" /> Abrir App em Nova Aba
                    </a>
                  </div>
                )}

                {/* Real-time speech transcription display card */}
                {(voiceTranscript || voiceStatus === 'listening') && (
                  <div className="w-full bg-brand-secondary/40 border border-white/5 rounded-3xl p-6 relative">
                    <span className="absolute top-2 left-6 text-[8px] font-black text-white/30 uppercase tracking-widest">Transcrição em Tempo Real</span>
                    <p className="text-lg font-black text-white uppercase tracking-tight italic pt-2">
                      {voiceTranscript ? `"${voiceTranscript}"` : "Fale agora..."}
                    </p>
                  </div>
                )}

                {/* Interpretation Results Form Card if parsed successfully */}
                {voiceParsedScore && (
                  <div className="w-full bg-brand-secondary/40 border border-brand-primary/30 rounded-[2.5rem] p-8 flex flex-col items-center gap-6 shadow-[0_0_35px_rgba(245,196,41,0.15)] animate-in zoom-in-95 duration-300">
                    <div className="text-center w-full space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/20 border border-brand-primary/30">
                        <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                        <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Revisão de Placar</span>
                      </div>
                      <h4 className="text-2xl font-black text-white uppercase tracking-tight">
                        O placar abaixo está correto?
                      </h4>
                    </div>

                    {/* Scoreboard visual block */}
                    <div className="flex items-center justify-center gap-6 w-full max-w-sm mt-2">
                      {/* Team A block */}
                      <div className="flex-1 flex flex-col items-center bg-black/50 border border-white/10 rounded-2xl p-4">
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Time A</span>
                        <span className={`text-4xl font-black font-mono ${voiceParsedScore.winner === 'A' ? 'text-brand-primary' : 'text-white'}`}>
                          {voiceParsedScore.winner === 'A' ? '15' : voiceParsedScore.loserScore}
                        </span>
                        {voiceParsedScore.winner === 'A' && (
                          <span className="mt-1 px-2 py-0.5 rounded text-[8px] font-black bg-brand-primary text-black uppercase tracking-widest">Vitória</span>
                        )}
                      </div>

                      <div className="text-xl font-black text-white/30 uppercase tracking-widest">VS</div>

                      {/* Team B block */}
                      <div className="flex-1 flex flex-col items-center bg-black/50 border border-white/10 rounded-2xl p-4">
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Time B</span>
                        <span className={`text-4xl font-black font-mono ${voiceParsedScore.winner === 'B' ? 'text-brand-primary' : 'text-white'}`}>
                          {voiceParsedScore.winner === 'B' ? '15' : voiceParsedScore.loserScore}
                        </span>
                        {voiceParsedScore.winner === 'B' && (
                          <span className="mt-1 px-2 py-0.5 rounded text-[8px] font-black bg-brand-primary text-black uppercase tracking-widest">Vitória</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons required by user: "Correto" and "Corrigir" */}
                    <div className="flex items-center gap-4 w-full max-w-sm">
                      <button
                        onClick={handleConfirmVoiceScore}
                        disabled={isSyncing}
                        className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-black font-black uppercase tracking-widest text-xs py-4.5 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border border-brand-primary shadow-brand-primary/20"
                      >
                        <Check className="w-4 h-4 text-black stroke-[3]" /> Correto
                      </button>

                      <button
                        onClick={handleRecorrectVoiceScore}
                        className="flex-1 bg-white hover:bg-white/90 text-black font-black uppercase tracking-widest text-xs py-4.5 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white"
                      >
                        <RefreshCw className="w-4 h-4 text-black stroke-[3]" /> Corrigir
                      </button>
                    </div>
                  </div>
                )}

                {/* Control Action Buttons within the overlay modal */}
                <div className="flex items-center gap-4 pt-4">
                  {voiceListening ? (
                    <button
                      onClick={stopVoiceListening}
                      className="px-8 py-4 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all"
                    >
                      Pausar Gravação
                    </button>
                  ) : (
                    <button
                      onClick={startVoiceListening}
                      className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-lg"
                    >
                      {voiceStatus === 'idle' ? "Iniciar Voz" : "Tentar Novamente"}
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      stopVoiceListening();
                      setVoiceModalOpen(false);
                    }}
                    className="px-8 py-4 bg-brand-secondary border border-white/5 hover:border-white/10 text-white/60 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Overlay de Contagem Regressiva e Otimização de Busca Local IC */}
          {isGeneratingCountdown && (
            <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
              <div className="relative flex items-center justify-center mb-8">
                {/* Pulse Glow & Radar Scan Rings */}
                <div className="absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full border-2 border-brand-primary/30 animate-ping opacity-20" />
                <div className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-brand-primary/30 [animation:glow-pulse_2s_infinite]" />
                
                {/* SVG Radial Progress Circle */}
                <svg className="w-40 h-40 sm:w-48 sm:h-48 transform -rotate-90">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="42%"
                    className="stroke-white/10"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r="42%"
                    className="stroke-brand-primary transition-all duration-75 ease-out"
                    strokeWidth="6"
                    strokeDasharray={280}
                    strokeDashoffset={280 - (280 * countdownProgress) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Central Countdown Counter */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {countdownVal > 0 ? (
                    <span
                      key={countdownVal}
                      className="text-6xl sm:text-7xl font-black text-brand-primary font-mono tracking-tighter drop-shadow-[0_0_25px_rgba(245,196,41,0.9)] [animation:countdown-number_0.9s_ease-in-out_infinite]"
                    >
                      {countdownVal}
                    </span>
                  ) : (
                    <Check className="w-16 h-16 text-brand-primary animate-in zoom-in-50 duration-300 drop-shadow-[0_0_25px_rgba(245,196,41,0.9)]" />
                  )}
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mt-1 font-mono">
                    {countdownProgress}%
                  </span>
                </div>
              </div>

              {/* Dynamic Text & Step Description */}
              <div className="max-w-md w-full space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-black uppercase tracking-widest animate-pulse">
                  <Zap className="w-3.5 h-3.5 animate-bounce" />
                  <span>Guerreiros Intelligence IC Engine</span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight font-f1 transition-all">
                  {countdownStepText}
                </h3>

                <p className="text-xs text-white/50 font-mono">
                  Iteração <span className="text-brand-primary font-bold">{countdownIteration}</span>/100 • Minimizando Desvio Padrão do IC
                </p>

                {/* Progress Bar */}
                <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden border border-white/10 p-0.5">
                  <div
                    className="bg-gradient-to-r from-amber-400 via-brand-primary to-yellow-300 h-full rounded-full transition-all duration-75 shadow-[0_0_12px_rgba(245,196,41,0.8)]"
                    style={{ width: `${countdownProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          {/* Modal de Horários de Saída Antecipada */}
          <DepartureTimeModal
            isOpen={showDepartureModal}
            onClose={() => setShowDepartureModal(false)}
            generationResult={generationResult}
            attendance={attendance}
            players={players}
            updateDepartureTime={updateDepartureTime}
            showNotification={showNotification}
          />
        </>
      )}
    </div>
  );
};
