import React from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import { useIntentions } from '../src/hooks/useIntentions';
import { useStore } from '../store';
import { CalendarCheck, Copy, BellRing, Settings, UserCheck, UserX, Clock, ArrowRight, RotateCcw, Zap, Star, Shield, Trash2, CheckCircle2, AlertTriangle, Flame, AlertCircle, MessageCircle, LogOut } from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { Player } from '../types';
import { getFirestoreDateKey, getBrazilDay } from '../firebase';
import { capitalizeName } from '../utils/helpers';
import { fetchAttendanceHistory, calculateAttendanceStats } from '../src/services/attendanceService';

import { HelpTooltip } from '../src/components/HelpTooltip';

interface IntentionsViewProps {
  userRole: 'ADMIN' | 'MEMBER' | null;
  currentPlayer: Player | null;
  onMoveToAttendance: (playerId: string) => void;
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const IntentionsView: React.FC<IntentionsViewProps> = ({ userRole, currentPlayer, onMoveToAttendance, showNotification }) => {
  const { intentions, isLoaded, setIntent, resetIntent, clearIntentions, toggleAutomation, sendReminders, copyToWhatsApp, copyReminder } = useIntentions();
  const { players, attendance, showConfirmModal, isInitialLoading } = useStore();

  const getWhatsAppLink = (player: Player) => {
    let clean = (player.phone || '').replace(/\D/g, '');
    if (!clean) return '';
    if (clean.length === 10 || clean.length === 11) {
      clean = '55' + clean;
    }
    const msg = `Olá, *${capitalizeName(player.name)}*! 🏐 Passando para lembrar de confirmar sua presença ou ausência para a próxima partida no Guerreiros App!\n\nConfirme em 5 segundos no link:\n${window.location.origin}/?public=true\n\nValeu!`;
    return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
  };

  // --- WhatsApp & Evolution API Integration State ---
  const [isPnSending, setIsPnSending] = React.useState(false);
  const [isGroupSending, setIsGroupSending] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeclining, setIsDeclining] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [waSteps, setWaSteps] = React.useState<{ id: string; name: string; status: string; details: string; }[] | null>(null);
  const [waTaskType, setWaTaskType] = React.useState<'group' | 'direct' | null>(null);

  const handleSendWaPrompts = async () => {
    setIsPnSending(true);
    setWaTaskType('direct');
    setWaSteps([
      { id: "load_config", name: "Carregar Configurações", status: "pending", details: "Buscando whatsapp_config no banco..." },
      { id: "validate_creds", name: "Validar Credenciais WhatsApp", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "fetch_data", name: "Baixar Sócios do Clube", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "filter_eligible", name: "Selecionar Ausentes", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "dispatch_all", name: "Disparar Lembretes Individuais", status: "pending", details: "Aguardando etapa anterior..." },
    ]);
    try {
      const res = await fetch('/api/whatsapp/send-all', { method: 'POST' });
      const data = await res.json();
      if (data.steps) {
        setWaSteps(data.steps);
      }
      if (data.success) {
        showNotification(`Lembretes enviados com sucesso para ${data.count} sócios via WhatsApp!`, 'success');
      } else {
        showNotification(`Erro ao disparar lembretes: ${data.error || 'Falha na execução'}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro: ${err.message}`, 'error');
    } finally {
      setIsPnSending(false);
    }
  };

  const handleSendWaGroup = async () => {
    setIsGroupSending(true);
    setWaTaskType('group');
    setWaSteps([
      { id: "load_config", name: "Carregar Configurações", status: "pending", details: "Buscando whatsapp_config no banco..." },
      { id: "validate_creds", name: "Validar Credenciais WhatsApp", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "fetch_data", name: "Baixar Intenções & Jogadores", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "format_message", name: "Gerar Texto da Lista", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "send_message", name: "Disparar p/ Grupo WhatsApp", status: "pending", details: "Aguardando etapa anterior..." },
      { id: "save_tracking", name: "Persistir Data de Envio", status: "pending", details: "Aguardando etapa anterior..." },
    ]);
    try {
      const res = await fetch('/api/whatsapp/send-group', { method: 'POST' });
      const data = await res.json();
      if (data.steps) {
        setWaSteps(data.steps);
      }
      if (data.success) {
        showNotification('Lista de intenção atualizada enviada para o grupo do WhatsApp!', 'success');
      } else {
        showNotification(`Erro ao enviar lista: ${data.error || 'Falha no envio'}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro: ${err.message}`, 'error');
    } finally {
      setIsGroupSending(false);
    }
  };

  // Create confetti instance
  const fireConfetti = React.useMemo(() => confetti.create(undefined, { useWorker: false, resize: true }), []);

  const celebratePresence = () => {
    const end = Date.now() + 2 * 1000;
    const colors = ['#F5C429', '#FFFFFF'];

    (function frame() {
      fireConfetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      fireConfetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-3 h-3 text-white/20" />;
    }
  };

  const [showSuccessOverlay, setShowSuccessOverlay] = React.useState(false);

  const handleConfirm = async () => {
    if (currentPlayer && !isConfirming && !isDeclining) {
      setIsConfirming(true);
      setProcessingId(currentPlayer.id);
      try {
        await setIntent(currentPlayer.id, 'GOING');
        const firstName = currentPlayer.name.split(' ')[0];
        showNotification(`Bora pra cima, ${firstName}! Sua presença foi confirmada com sucesso! 🏐🔥`, 'success');
        celebratePresence();
        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 3000);
      } catch (err: any) {
        showNotification(err.message || 'Erro ao confirmar presença. Tente novamente.', 'error');
      } finally {
        setIsConfirming(false);
        setProcessingId(null);
      }
    }
  };

  const handleConfirmPlayer = async (p: Player) => {
    if (isConfirming || isDeclining || processingId) return;
    setProcessingId(p.id);
    try {
      setIsConfirming(true);
      await setIntent(p.id, 'GOING');
      showNotification(`Presença de ${capitalizeName(p.name)} confirmada com sucesso! 🏐🔥`, 'success');
      celebratePresence();
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Erro ao registrar presença.', 'error');
    } finally {
      setIsConfirming(false);
      setProcessingId(null);
    }
  };

  const handleConfirmIntent = async (pId: string, status: 'GOING' | 'NOT_GOING') => {
    if (processingId) return;
    setProcessingId(pId);
    try {
      await setIntent(pId, status);
      showNotification(status === 'GOING' ? 'Presença confirmada!' : 'Ausência registrada.', 'success');
      if (status === 'GOING') celebratePresence();
    } catch (err: any) {
      showNotification(err.message || 'Erro ao atualizar.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async () => {
    if (currentPlayer && !isConfirming && !isDeclining) {
      setIsDeclining(true);
      setProcessingId(currentPlayer.id);
      try {
        await setIntent(currentPlayer.id, 'NOT_GOING');
        showNotification('Entendido. Sentiremos sua falta nessa quinta!', 'info');
        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 3000);
      } catch (err: any) {
        showNotification(err.message || 'Erro ao informar ausência. Tente novamente.', 'error');
      } finally {
        setIsDeclining(false);
        setProcessingId(null);
      }
    }
  };

  const handleResetIntent = async (playerId: string) => {
    if (processingId) return;
    setProcessingId(playerId);
    try {
      await resetIntent(playerId);
      showNotification('Ação processada com sucesso.', 'info');
    } catch (err: any) {
      showNotification('Erro ao processar alteração.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const [attendancePercent, setAttendancePercent] = React.useState<Record<string, number>>({});
  
  React.useEffect(() => {
    let active = true;
    const loadStats = async () => {
      try {
        const history = await fetchAttendanceHistory();
        if (!active) return;
        const stats = calculateAttendanceStats(history, players);
        const mapping: Record<string, number> = {};
        stats.forEach(s => {
          mapping[s.playerId] = s.percentage;
        });
        setAttendancePercent(mapping);
      } catch (err) {
        console.error("Erro ao carregar estatísticas de assiduidade na lista de intenção", err);
      }
    };
    if (players.length > 0) {
      loadStats();
    }
    return () => {
      active = false;
    };
  }, [players]);

  const getPlayerAttendance = (playerId: string) => {
    const pct = attendancePercent[playerId];
    if (pct === undefined || isNaN(pct)) {
      const p = players.find(x => x.id === playerId);
      if (p) {
        const mp = p.matchesPlayed || 0;
        if (mp > 10) return 90;
        if (mp > 5) return 75;
        if (mp > 0) return 50;
      }
      return 0;
    }
    return Math.round(pct);
  };

  const getEvasionBadge = (player: Player) => {
    const pct = getPlayerAttendance(player.id);
    const level = calculateEvasionLevel(player, pct);
    
    const config = {
      low: { icon: Shield, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20', label: 'Risco de Sair: Baixo', tooltip: 'Membro ativo com excelente assiduidade' },
      medium: { icon: AlertTriangle, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20', label: 'Risco de Sair: Moderado', tooltip: 'Presença regular, risco moderado de evasão' },
      high: { icon: Flame, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20', label: 'Risco de Sair: Alto', tooltip: 'Atenção: frequência reduzindo ou instável' },
      critical: { icon: AlertCircle, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20', label: 'Risco de Sair: Crítico', tooltip: 'Urgente: risco de abandono ou saída iminente do clube' },
    };

    const { icon: Icon, color, label, tooltip } = config[level];

    return (
      <span 
        className={`group inline-flex items-center justify-center p-1.5 rounded-full border ${color} cursor-help transition-all relative select-none`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        
        {/* Custom Tooltip */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
          <span className="text-brand-primary font-black uppercase tracking-wider block mb-1">{label}</span>
          <span>{tooltip}</span>
          {/* Tooltip arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
        </span>
      </span>
    );
  };

  const getAttendanceBadge = (playerId: string) => {
    const pct = getPlayerAttendance(playerId);
    let colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20";
    let desc = "Assiduidade Excelente";
    if (pct < 50) {
      colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20";
      desc = "Assiduidade Baixa";
    } else if (pct < 75) {
      colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20";
      desc = "Assiduidade Regular";
    }

    return (
      <span 
        className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${colorClass} text-[10px] font-bold cursor-help transition-all relative select-none`}
      >
        <CalendarCheck className="w-3.5 h-3.5 shrink-0 text-brand-primary" />
        <span className="font-mono text-[9px] font-black">{pct}%</span>
        
        {/* Custom Tooltip */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
          {desc}: {pct}% de presença no clube
          {/* Tooltip arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
        </span>
      </span>
    );
  };

  const [searchTerm, setSearchTerm] = React.useState('');

  if (!isLoaded || isInitialLoading || (players.length === 0 && Object.keys(intentions?.responses || {}).length > 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Carregando Lista de Sócios...</p>
      </div>
    );
  }

  const isActiveStatus = (p: Player) => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM && p.status !== 'dm';

  const goingPlayers = players
    .filter(p => intentions.responses[p.id] === 'GOING')
    .sort((a, b) => {
      const timeA = intentions.confirmationTimestamps?.[a.id] || 0;
      const timeB = intentions.confirmationTimestamps?.[b.id] || 0;
      return timeA - timeB;
    });
  const notGoingPlayers = players.filter(p => intentions.responses[p.id] === 'NOT_GOING');
  const undecidedPlayers = players.filter(p => !intentions.responses[p.id] && isActiveStatus(p));

  const waitlistPlayers = players
    .filter(p => p.status === 'waitlist')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const filteredUndecided = undecidedPlayers.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isGoing = currentPlayer ? intentions.responses[currentPlayer.id] === 'GOING' : false;
  const isNotGoing = currentPlayer ? intentions.responses[currentPlayer.id] === 'NOT_GOING' : false;

  const getNextThursday = () => {
    const todayStr = getFirestoreDateKey();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = getBrazilDay();
    
    let diff = 4 - day;
    if (diff < 0) diff += 7;
    
    date.setDate(date.getDate() + diff);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const displayDate = intentions.targetDate || getNextThursday();
  const formattedDate = displayDate.split('-').reverse().slice(0, 2).join('/');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative">
      
      {/* Success Animation Overlay */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-brand-primary p-8 sm:p-12 rounded-[3rem] border-8 border-black shadow-[0_0_100px_rgba(245,196,41,0.5)] text-center animate-in zoom-in duration-500 max-w-sm w-full">
            <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
              {isGoing ? (
                <UserCheck className="w-12 h-12 text-brand-primary" />
              ) : (
                <UserX className="w-12 h-12 text-red-500" />
              )}
            </div>
            <h3 className="text-3xl font-black uppercase tracking-tighter text-black mb-2">
              {isGoing ? 'Confirmado!' : 'Registrado!'}
            </h3>
            <p className="text-black/80 font-black uppercase tracking-widest text-[10px]">
              {isGoing ? 'Bora pro jogo, Guerreiro!' : 'Até a próxima partida!'}
            </p>
          </div>
        </div>
      )}

      {/* Header - Accent Border */}
      <div className="bg-black rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col items-stretch sm:items-center sm:flex-row justify-between gap-8">
          <div className="text-left flex-1">
            {currentPlayer && (
              <div className="mb-6">
                {(isGoing || isNotGoing) ? (
                  <div className={`flex items-center gap-4 p-5 rounded-3xl border-2 animate-in zoom-in duration-500 ${
                    isGoing 
                      ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary' 
                      : 'bg-red-500/10 border-red-500/40 text-red-500'
                  }`}>
                    <div className={`p-3 rounded-2xl ${isGoing ? 'bg-brand-primary text-black' : 'bg-red-500 text-white'}`}>
                      {isGoing ? <UserCheck className="w-6 h-6" /> : <UserX className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-0.5">Status da sua Presença</p>
                      <p className="text-xl font-black uppercase tracking-tight text-white">
                        {isGoing ? 'Confirmado para o Jogo!' : 'Ausente nesta Quinta'}
                      </p>
                      <button 
                        onClick={() => handleResetIntent(currentPlayer.id)}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest underline opacity-60 hover:opacity-100 transition-opacity"
                      >
                        Clique aqui para alterar sua resposta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                      Boas Vindas, {capitalizeName(currentPlayer.name)}!
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <CalendarCheck className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary" />
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                Lista de Quinta
                <HelpTooltip 
                  title="Lista de Presença" 
                  content="Confirme sua participação. A ordem de chegada e o tempo de espera definem a prioridade para entrar em quadra. Jogadores que confirmam primeiro têm prioridade na montagem dos times."
                />
              </h2>
            </div>
            <p className="text-white/70 text-sm sm:text-lg font-medium max-w-md">
              Prepare o uniforme! Confirme sua presença para o jogo na Próxima Quinta dia <span className="text-brand-primary font-bold">
                {formattedDate}
              </span>.
            </p>
          </div>
          
          {/* Player Actions */}
          {currentPlayer && !isGoing && !isNotGoing && (
              <div className="flex flex-col sm:flex-row items-stretch gap-4 bg-brand-secondary/30 p-4 sm:p-6 rounded-[2rem] border border-brand-primary/20 w-full lg:w-auto">
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming || isDeclining}
                  className={`flex-1 lg:flex-none flex flex-col items-center justify-center gap-1.5 px-8 py-6 rounded-3xl font-black uppercase tracking-[0.15em] text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black ${
                    isGoing 
                      ? 'bg-brand-primary text-black ring-4 ring-brand-primary/20' 
                      : 'bg-brand-primary text-black hover:bg-brand-primary/90 shadow-[0_0_30px_rgba(245,196,41,0.2)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isConfirming ? (
                      <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserCheck className="w-7 h-7" />
                    )}
                    <span className="text-xl">Vou Jogar!</span>
                  </div>
                  <span className="text-[9px] opacity-70 font-bold">Confirmar Presença</span>
                </button>
                <button
                  onClick={handleDecline}
                  disabled={isConfirming || isDeclining}
                  className={`flex-1 lg:flex-none flex flex-col items-center justify-center gap-1.5 px-8 py-6 rounded-3xl font-black uppercase tracking-[0.15em] text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black ${
                    isNotGoing 
                      ? 'bg-white text-black ring-4 ring-white/20' 
                      : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isDeclining ? (
                      <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserX className="w-7 h-7 text-red-600" />
                    )}
                    <span className="text-xl">Não Vou</span>
                  </div>
                  <span className="text-[9px] opacity-70 font-bold">Informar Ausência</span>
                </button>
              </div>
          )}
        </div>
      </div>

      {/* Admin Controls - Strictly for ADMIN role */}
      {userRole === 'ADMIN' && (
            <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Painel do Administrador</h3>
            </div>
            <span className="text-[10px] font-black text-brand-primary/50 uppercase tracking-widest">Acesso Restrito</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Search Box for Quick Confirmation */}
            <div className="sm:col-span-4 bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 mb-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Buscar sócio para confirmar manualmente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-brand-secondary/50 border border-brand-primary/40 rounded-2xl px-6 py-4 text-white text-base focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all placeholder:text-white/20"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Piloto Automático</p>
                <p className="text-[10px] text-slate-500">Envia lembretes automáticos na quarta e quinta-feira.</p>
              </div>
              <button
                onClick={() => toggleAutomation(!intentions.automationEnabled)}
                className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                  intentions.automationEnabled
                    ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30'
                    : 'bg-white/5 text-slate-400 border border-brand-primary/40 hover:bg-white/10'
                }`}
              >
                {intentions.automationEnabled ? 'Ligado' : 'Desligado'}
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cobrar Indecisos</p>
                <p className="text-[10px] text-slate-500">Envia notificação Push agora para quem não respondeu.</p>
              </div>
              <button
                onClick={() => {
                  sendReminders();
                  showNotification('Lembretes enviados com sucesso!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 text-white border border-brand-primary/40 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all flex items-center justify-center gap-2"
              >
                <BellRing className="w-3 h-3" />
                Notificar Agora
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Copiar Lembrete</p>
                <p className="text-[10px] text-slate-500">Copia o texto de cobrança para o WhatsApp.</p>
              </div>
              <button
                onClick={() => {
                  copyReminder();
                  showNotification('Lembrete copiado para o WhatsApp!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 text-white border border-brand-primary/40 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Lembrete
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Exportar Lista</p>
                <p className="text-[10px] text-slate-500">Copia a lista formatada para colar no WhatsApp.</p>
              </div>
              <button
                onClick={() => {
                  copyToWhatsApp();
                  showNotification('Lista copiada para a área de transferência!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500 hover:text-black transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Lista
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Link de Presença</p>
                <p className="text-[10px] text-slate-500">Copia o link público de confirmação sem login para o grupo.</p>
              </div>
              <button
                onClick={() => {
                  const link = `${window.location.origin}/?public=true`;
                  navigator.clipboard.writeText(link)
                    .then(() => showNotification('Link público copiado com sucesso!', 'success'))
                    .catch(() => showNotification('Erro ao copiar o link. Tente copiar manualmente.', 'error'));
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-brand-primary text-black hover:scale-105 transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Link Público
              </button>
            </div>

            <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/40 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Zerar Lista</p>
                <p className="text-[10px] text-slate-500">Apaga todas as respostas da lista atual.</p>
              </div>
              <button
                onClick={() => {
                  showConfirmModal(
                    'Zerar Lista de Intenção',
                    'Tem certeza que deseja apagar todas as respostas e zerar a lista atual? Esta ação não pode ser desfeita.',
                    () => {
                      clearIntentions();
                      showNotification('Lista zerada com sucesso!', 'success');
                    }
                  );
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                Zerar Lista
              </button>
            </div>
          </div>

          {/* WhatsApp / Evolution API Action Buttons */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-6">
             <div className="flex flex-col md:flex-row gap-4">
                <button
                  onClick={handleSendWaPrompts}
                  disabled={isPnSending}
                  className="flex-1 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-white/5 hover:bg-white/10 text-white border border-brand-primary/40 transition-all disabled:opacity-50"
                >
                  {isPnSending ? 'Disparando...' : 'Perguntar Prontidão p/ Sócio (Direct)'}
                </button>

                <button
                  onClick={handleSendWaGroup}
                  disabled={isGroupSending}
                  className="flex-1 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-black border border-green-500/40 transition-all disabled:opacity-50"
                >
                  {isGroupSending ? 'Enviando...' : 'Enviar Lista Atual p/ Grupo'}
                </button>
             </div>

             {/* Monitoramento de Envio por Etapas com Pequenos LEDs */}
                    {waSteps && (
                      <div className="mt-6 p-5 rounded-2xl border border-white/10 bg-white/[0.02] animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                              Etapas de Rastreio ({waTaskType === 'group' ? 'Lista do Grupo' : 'Lembretes Direct'})
                            </span>
                          </div>
                          <button 
                            onClick={() => setWaSteps(null)} 
                            className="text-[9px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider transition-all"
                          >
                            Recolher Monitor
                          </button>
                        </div>

                        <div className="space-y-3.5">
                          {waSteps.map((step, idx) => {
                            let ledColor = 'bg-slate-700 shadow-none';
                            let textColor = 'text-slate-500';
                            let pulseClass = '';

                            if (step.status === 'success') {
                              ledColor = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]';
                              textColor = 'text-emerald-400';
                            } else if (step.status === 'failed') {
                              ledColor = 'bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]';
                              textColor = 'text-rose-400';
                              pulseClass = 'animate-pulse';
                            } else if (step.status === 'pending') {
                              ledColor = 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]';
                              textColor = 'text-amber-400';
                              pulseClass = 'animate-pulse';
                            } else if (step.status === 'skipped') {
                              ledColor = 'bg-slate-600';
                              textColor = 'text-slate-400 opacity-60';
                            }

                            return (
                              <div key={step.id || idx} className="flex items-start gap-4 p-2.5 rounded-xl bg-black/40 border border-white/[0.02] hover:border-white/5 transition-all">
                                <div className="pt-1 flex-shrink-0">
                                  <div className={`w-3 h-3 rounded-full transition-all duration-300 ${ledColor} ${pulseClass}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center">
                                    <p className={`text-[10px] font-black uppercase tracking-wider ${textColor}`}>
                                      {step.name}
                                    </p>
                                    <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-black text-slate-400 tracking-wider">
                                      {step.status}
                                    </span>
                                  </div>
                                  {step.details && (
                                    <p className="mt-1 text-[9px] font-mono text-slate-400 lowercase italic break-all leading-relaxed">
                                      → {step.details}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Going - EFEITO 4: Accent Border (Borda de Destaque Sólida) */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Confirmados</h3>
            </div>
            <span className="bg-brand-primary text-black text-xs font-black px-3 py-1 rounded-full">{goingPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 pr-1">
            <AnimatePresence mode="popLayout">
              {goingPlayers.map((p, i) => {
                const isCheckedIn = (attendance || []).some(a => a.id === p.id);
                const canReset = !isCheckedIn && (currentPlayer?.id === p.id || userRole === 'ADMIN');
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    key={p.id} 
                    onClick={() => {
                      if (canReset && !processingId) {
                        handleResetIntent(p.id);
                      }
                    }}
                    className={`flex items-center justify-between bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/20 hover:border-brand-primary/50 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${canReset ? 'cursor-pointer hover:bg-brand-primary/10 hover:shadow-[0_0_20px_rgba(245,196,41,0.15)]' : 'opacity-85'} ${(processingId && processingId !== p.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                    title={canReset ? (currentPlayer?.id === p.id ? "Clique para sair da lista" : "Clique para remover presença") : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-brand-primary font-black text-xs w-5 shrink-0">{i + 1}.</span>
                      <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="break-words font-black">{capitalizeName(p.name)}</span>
                        {p.status === 'guest' && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-1.5 py-0.5 rounded leading-none shrink-0">
                            Convidado
                          </span>
                        )}
                        <span className="absolute -bottom-0.5 left-0 h-0.5 bg-brand-primary transition-all duration-300 w-0 group-hover/player:w-full group-active/player:w-full" />
                      </span>
                    </div>
                    {isCheckedIn && (
                      <div title="Na Quadra" className="p-2 text-green-400 bg-green-500/10 rounded-lg shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </div>
                    )}
                    {userRole === 'ADMIN' && !isCheckedIn && (
                      <button
                        disabled={!!processingId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveToAttendance(p.id);
                        }}
                        className="p-2.5 bg-brand-primary text-black rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-brand-primary/20 shrink-0"
                        title="Mover para Quadra"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    )}
                    {((!isCheckedIn && currentPlayer?.id === p.id) || userRole === 'ADMIN') && (
                      <button
                        disabled={!!processingId}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetIntent(p.id);
                        }}
                        className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 disabled:opacity-50 ${currentPlayer?.id === p.id ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-110 active:scale-90'}`}
                        title={currentPlayer?.id === p.id ? "Sair da Lista" : "Remover da Lista"}
                      >
                        {processingId === p.id ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Undecided */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-slate-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Não Confirmados</h3>
            </div>
            <span className="bg-white/10 text-slate-400 text-xs font-black px-3 py-1 rounded-full">{undecidedPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredUndecided.map((p, i) => {
                const canConfirm = userRole === 'ADMIN' || currentPlayer?.id === p.id || !currentPlayer;
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    key={p.id} 
                    onClick={() => {
                      if (canConfirm && !processingId) {
                        handleConfirmPlayer(p);
                      }
                    }}
                    className={`flex items-center justify-between bg-slate-500/5 p-4 rounded-2xl border border-white/5 hover:border-brand-primary/40 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${canConfirm ? 'cursor-pointer hover:bg-brand-primary/10 hover:border-brand-primary/30 hover:shadow-[0_0_20px_rgba(245,196,41,0.15)]' : 'opacity-85'} ${(processingId && processingId !== p.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                    title={canConfirm ? "Clique para confirmar presença" : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-slate-500 font-black text-xs w-5 shrink-0">{i + 1}.</span>
                      <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="break-words font-black">{capitalizeName(p.name)}</span>
                        {p.status === 'guest' && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-1.5 py-0.5 rounded leading-none shrink-0">
                            Convidado
                          </span>
                        )}
                        <span className="absolute -bottom-0.5 left-0 h-0.5 bg-brand-primary transition-all duration-300 w-0 group-hover/player:w-full group-active/player:w-full" />
                      </span>
                    </div>
                    {canConfirm && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          disabled={!!processingId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmPlayer(p);
                          }}
                          className="p-3 bg-brand-primary text-black rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-brand-primary/20 shrink-0 disabled:opacity-50 border-2 border-black"
                          title="Vou Jogar!"
                        >
                          {processingId === p.id ? (
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <UserCheck className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          disabled={!!processingId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmIntent(p.id, 'NOT_GOING');
                          }}
                          className="p-3 bg-red-500/20 text-red-500 border border-red-500/40 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-lg shrink-0 disabled:opacity-50"
                          title="Não Vou"
                        >
                          <UserX className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Not Going */}
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-red-500 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Ausentes</h3>
            </div>
            <span className="bg-red-500/20 text-red-500 text-xs font-black px-3 py-1 rounded-full">{notGoingPlayers.length}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-4 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            {notGoingPlayers.length === 0 ? (
              <div className="col-span-full py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-slate-500 text-sm font-medium italic">Nenhuma ausência registrada.</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {notGoingPlayers.map((p, i) => {
                  const canReset = currentPlayer?.id === p.id || userRole === 'ADMIN';
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      key={p.id} 
                      onClick={() => {
                        if (canReset && !processingId) {
                          handleResetIntent(p.id);
                        }
                      }}
                      className={`flex items-center justify-between bg-red-500/5 p-4 rounded-2xl border border-red-500/20 hover:border-red-500/50 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${canReset ? 'cursor-pointer hover:bg-red-500/10 hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'opacity-85'} ${(processingId && processingId !== p.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                      title={canReset ? "Clique para voltar para a lista de indecisos" : undefined}
                    >
                      <div className="flex items-center gap-2 opacity-50 min-w-0 flex-1">
                        <span className="text-red-500/50 font-black text-xs w-5 shrink-0">{i + 1}.</span>
                        <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="break-words font-black">{capitalizeName(p.name)}</span>
                          {p.status === 'guest' && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded leading-none shrink-0">
                              Convidado
                            </span>
                          )}
                          <span className="absolute -bottom-0.5 left-0 h-0.5 bg-red-500 transition-all duration-300 w-0 group-hover/player:w-full group-active/player:w-full" />
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canReset && (
                          <button
                            disabled={!!processingId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetIntent(p.id);
                            }}
                            className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 disabled:opacity-50 ${currentPlayer?.id === p.id ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-110 active:scale-90'}`}
                            title={currentPlayer?.id === p.id ? "Voltar para a Lista" : "Remover da Lista"}
                          >
                            {processingId === p.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Waitlist Section */}
      {waitlistPlayers.length > 0 && (
        <div className="bg-black rounded-[2rem] border border-white/5 border-l-[6px] border-l-amber-500 p-8 sm:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-500" />
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Fila de Espera do Clube</h3>
            </div>
            <span className="bg-amber-500 text-black text-xs font-black px-4 py-1.5 rounded-full">{waitlistPlayers.length} / 5</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {waitlistPlayers.map((p, i) => (
              <div key={p.id} className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 flex items-center justify-between group hover:border-amber-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-secondary flex items-center justify-center text-amber-500 font-black text-xs border border-amber-500/30">
                    {i + 1}
                  </div>
                  <span className="text-white text-sm font-black uppercase tracking-tight">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500/60 uppercase">Em Espera</span>
                </div>
              </div>
            ))}
          </div>
          
          <p className="mt-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
            A lista de espera segue a ordem de cadastro. Quando um sócio ativo sair, o primeiro da lista entra automaticamente.
          </p>
        </div>
      )}

    </div>
  );
};
