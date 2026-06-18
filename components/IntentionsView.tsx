import React from 'react';
import confetti from 'canvas-confetti';
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
  const { players, attendance, showConfirmModal } = useStore();

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
  const [waConfig, setWaConfig] = React.useState({
    apiUrl: '',
    apiKey: '',
    instanceName: '',
    groupJid: '',
    updateIntervalMinutes: 120,
    botActive: false,
    webhookUrl: ''
  });
  const [isWaLoading, setIsWaLoading] = React.useState(true);
  const [isWaSaving, setIsWaSaving] = React.useState(false);
  const [isPnSending, setIsPnSending] = React.useState(false);
  const [isGroupSending, setIsGroupSending] = React.useState(false);
  const [showConfig, setShowConfig] = React.useState(false);
  const [waSteps, setWaSteps] = React.useState<{ id: string; name: string; status: string; details: string; }[] | null>(null);
  const [waTaskType, setWaTaskType] = React.useState<'group' | 'direct' | null>(null);

  // Bot health check and QR code generator
  const [realStatus, setRealStatus] = React.useState<string>('CARREGANDO');
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [loadingQr, setLoadingQr] = React.useState<boolean>(false);
  const [isSimulated, setIsSimulated] = React.useState<boolean>(false);
  const [qrIsSimulated, setQrIsSimulated] = React.useState<boolean>(false);
  const [qrMessage, setQrMessage] = React.useState<string | null>(null);
  const [fetchedGroups, setFetchedGroups] = React.useState<{ id: string; subject: string; }[] | null>(null);
  const [loadingGroups, setLoadingGroups] = React.useState<boolean>(false);

  const checkRealStatus = React.useCallback(async () => {
    setRealStatus('CARREGANDO');
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setRealStatus(data.status || 'OFFLINE');
      setIsSimulated(!!data.isSimulated);
      // Synchronize internal config state to prevent stale isSimulated value from rolling back settings on next save
      setWaConfig(prev => ({
        ...prev,
        isSimulated: !!data.isSimulated,
        simulatedState: data.isSimulated ? (data.status === 'ONLINE' ? 'open' : 'close') : 'close'
      }));
      if (data.status === 'ONLINE') {
        setQrCode(null); // Clear old QR Code if online
      }
    } catch (e) {
      setRealStatus('OFFLINE');
      setIsSimulated(false);
    }
  }, []);

  React.useEffect(() => {
    if (userRole === 'ADMIN') {
      fetch('/api/whatsapp/config')
        .then(async res => {
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(`Failed to load WhatsApp config: ${res.status} ${res.statusText} ${JSON.stringify(errBody)}`);
          }
          return res.json();
        })
        .then(data => {
          setWaConfig(prev => ({
            ...prev,
            ...data,
            webhookUrl: data.webhookUrl || (window.location.origin + '/api/whatsapp/webhook')
          }));
          setIsWaLoading(false);
          checkRealStatus();
        })
        .catch(err => {
          console.error("Failed to load WhatsApp config", err);
          setIsWaLoading(false);
          setRealStatus('OFFLINE');
        });
    }
  }, [userRole, checkRealStatus]);

  const handleFetchGroups = async () => {
    setLoadingGroups(true);
    setFetchedGroups(null);
    try {
      const res = await fetch('/api/whatsapp/groups');
      const data = await res.json();
      if (data.success) {
        setFetchedGroups(data.groups || []);
        showNotification(`${data.groups?.length || 0} grupos carregados com sucesso! Selecione o grupo correto na lista.`, 'success');
      } else {
        showNotification(`Erro ao carregar grupos: ${data.error || 'Verifique se a API e instância estão saudáveis.'}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleGenerateQr = async () => {
    setLoadingQr(true);
    try {
      const res = await fetch('/api/whatsapp/qrcode');
      if (!res.ok) {
        let msg = 'Falha ao obter QR code da Evolution API';
        try {
          const errData = await res.json();
          if (errData.details) {
            msg = `Erro na API: ${errData.details}`;
          } else if (errData.error) {
            msg = errData.error;
          }
        } catch (e) {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.alreadyConnected) {
        showNotification(data.message || 'WhatsApp já está conectado e pronto!', 'success');
        setRealStatus('ONLINE');
        setQrCode(null);
        setQrIsSimulated(false);
        setQrMessage(null);
        return;
      }

      // Extração inteligente e extremamente robusta do QR Code
      let qr = '';
      if (typeof data === 'string') {
        qr = data;
      } else if (data) {
        // 1. Se base64 estivar direto no retorno
        if (typeof data.base64 === 'string') {
          qr = data.base64;
        } 
        // 2. Se base64 estiver aninhado em data.qrcode
        else if (data.qrcode && typeof data.qrcode.base64 === 'string') {
          qr = data.qrcode.base64;
        }
        // 3. Se qrcode for uma string direta
        else if (typeof data.qrcode === 'string') {
          qr = data.qrcode;
        }
        // 4. Se a string de conexão estiver em data.qrcode.code
        else if (data.qrcode && typeof data.qrcode.code === 'string') {
          const codeStr = data.qrcode.code;
          if (codeStr.startsWith('data:image') || codeStr.startsWith('http://') || codeStr.startsWith('https://')) {
            qr = codeStr;
          } else {
            qr = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=10&data=${encodeURIComponent(codeStr)}`;
          }
        }
        // 5. Se estiver no campo data.code diretamente
        else if (typeof data.code === 'string') {
          if (data.code.startsWith('data:image') || data.code.startsWith('http://') || data.code.startsWith('https://')) {
            qr = data.code;
          } else if (data.code.length > 500 && !data.code.includes('@')) {
            qr = data.code;
          } else {
            qr = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=10&data=${encodeURIComponent(data.code)}`;
          }
        }
      }

      if (qr) {
        if (!qr.startsWith('data:image') && !qr.startsWith('http://') && !qr.startsWith('https://')) {
          if (qr.includes('base64,')) {
            qr = qr;
          } else {
            qr = `data:image/png;base64,${qr}`;
          }
        }
        setQrCode(qr);
        setQrIsSimulated(!!data.isSimulated || !!data.fallbackSimulated);
        setQrMessage(data.message || null);
        
        if (data.isSimulated || data.fallbackSimulated) {
          showNotification('QR Code de Simulação Gerado. Verifique os avisos na tela!', 'info');
        } else {
          showNotification('QR Code gerado com sucesso! Escaneie com seu celular no WhatsApp.', 'success');
        }
      } else {
        showNotification('Não foi possível obter o QR code. Verifique a URL de API e se a instância está ativa.', 'error');
      }
    } catch (err: any) {
      showNotification(`Erro: ${err.message}`, 'error');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleSaveWaConfig = async () => {
    setIsWaSaving(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waConfig)
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Configurações salvas e webhook atualizado com sucesso na Evolution API!', 'success');
      } else {
        showNotification('Falha ao salvar configurações do WhatsApp', 'error');
      }
    } catch (err: any) {
      showNotification(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      setIsWaSaving(false);
    }
  };

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

  const handleConfirm = () => {
    if (currentPlayer) {
      setIntent(currentPlayer.id, 'GOING');
      const firstName = currentPlayer.name.split(' ')[0];
      showNotification(`Bora pra cima, ${firstName}! Sua presença foi confirmada com sucesso! 🏐🔥`, 'success');
      celebratePresence();
    }
  };

  const handleDecline = () => {
    if (currentPlayer) {
      setIntent(currentPlayer.id, 'NOT_GOING');
      showNotification('Entendido. Sentiremos sua falta nessa quinta!', 'info');
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

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Carregando Lista...</p>
      </div>
    );
  }

  const goingPlayers = players
    .filter(p => intentions.responses[p.id] === 'GOING' && p.status === 'active' && !p.isDM)
    .sort((a, b) => {
      const timeA = intentions.confirmationTimestamps?.[a.id] || 0;
      const timeB = intentions.confirmationTimestamps?.[b.id] || 0;
      return timeA - timeB;
    });
  const notGoingPlayers = players.filter(p => intentions.responses[p.id] === 'NOT_GOING' && p.status === 'active' && !p.isDM);
  const undecidedPlayers = players.filter(p => !intentions.responses[p.id] && p.status === 'active' && !p.isDM);

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Header - Accent Border */}
      <div className="bg-black rounded-[2rem] sm:rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col items-stretch sm:items-center sm:flex-row justify-between gap-8">
          <div className="text-left">
            {currentPlayer && (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                  Boas Vindas, {capitalizeName(currentPlayer.name)}!
                </span>
                {(isGoing || isNotGoing) && (
                  <>
                    <span className="w-1 h-1 bg-brand-primary/50 rounded-full" />
                    <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">
                      {isGoing ? 'Você confirmou presença' : 'Você informou ausência'}
                    </span>
                  </>
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
            <div className="flex flex-col xs:flex-row items-stretch gap-4 bg-brand-secondary/30 p-5 rounded-[2rem] border border-brand-primary/20 w-full sm:w-auto">
              <button
                onClick={handleConfirm}
                className={`flex-1 xs:flex-none flex items-center justify-center gap-3 px-8 py-5 rounded-2xl font-black uppercase tracking-[0.1em] text-xs sm:text-sm transition-all shadow-xl active:scale-95 ${
                  isGoing 
                    ? 'bg-white text-black ring-4 ring-white/20 scale-105' 
                    : isNotGoing 
                      ? 'bg-white/5 text-white/40 border border-white/10 opacity-60' 
                      : 'bg-white text-black hover:bg-white/90 shadow-lg'
                }`}
              >
                <UserCheck className="w-5 h-5" />
                Vou Jogar
              </button>
              <button
                onClick={handleDecline}
                className={`flex-1 xs:flex-none flex items-center justify-center gap-3 px-8 py-5 rounded-2xl font-black uppercase tracking-[0.1em] text-xs sm:text-sm transition-all shadow-xl active:scale-95 ${
                  isNotGoing 
                    ? 'bg-brand-primary text-black ring-4 ring-brand-primary/20 scale-105' 
                    : isGoing 
                      ? 'bg-brand-primary/10 text-brand-primary/60 border border-brand-primary/20 opacity-60' 
                      : 'bg-brand-primary text-black hover:bg-brand-primary/90 shadow-lg'
                }`}
              >
                <UserX className="w-5 h-5" />
                Não Vou
              </button>
            </div>
          )}
        </div>
      </div>

      {(!currentPlayer || isGoing || isNotGoing || userRole === 'ADMIN') ? (
        <>
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

          {/* WhatsApp / Evolution API Management Panel */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-6">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowConfig(!showConfig)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowConfig(!showConfig);
                }
              }}
              className="w-full py-4 px-6 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/30 rounded-2xl flex items-center justify-between text-left transition-all relative overflow-hidden cursor-pointer select-none"
            >
              <div className="absolute top-0 right-0 p-2 flex items-center gap-2">
                <button
                  type="button"
                  title="Atualizar Conexão"
                  onClick={(e) => {
                    e.stopPropagation();
                    checkRealStatus();
                  }}
                  className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black tracking-tighter border ${
                  realStatus === 'ONLINE' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  realStatus === 'CONECTANDO' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  realStatus === 'DESCONECTADO' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  realStatus === 'CARREGANDO' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse' :
                  'bg-red-500/20 text-red-500 border-red-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${realStatus === 'ONLINE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                  BOT {realStatus}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 text-green-400 rounded-xl">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">Guerreiros WhatsApp Bot</h4>
                  <p className="text-[10px] text-white/40">Automação inteligente integrada ao <span className="text-brand-primary font-bold">Evolution API</span>.</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full border border-brand-primary/20">
                {showConfig ? 'Fechar Painel' : 'Configurar Agente'}
              </span>
            </div>

            {showConfig && (
              <div className="bg-brand-secondary/30 rounded-2xl p-6 border border-white/5 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {isWaLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-3 h-3 text-brand-primary" />
                        <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Hospedagem Google Cloud Active</span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-relaxed">
                        Este serviço utiliza instâncias do <span className="text-white font-bold">Google Cloud Run</span> para processar as mensagens do WhatsApp em tempo real. Certifique-se de que sua instância da Evolution API esteja acessível via internet.
                      </p>
                    </div>

                     {/* Real-time integration check with QR Code option */}
                    {realStatus === 'ONLINE' ? (
                      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                        <div>
                          <h5 className="text-xs font-black text-green-400 uppercase tracking-wide">Interface Conectada</h5>
                          <p className="text-[10px] text-white/50 leading-relaxed">A comunicação com a Evolution API está em perfeitas condições. Respostas via WhatsApp serão computadas instantaneamente.</p>
                        </div>
                      </div>
                    ) : realStatus === 'DESCONECTADO' || realStatus === 'OFFLINE' ? (
                      <div className="space-y-4">
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="space-y-1 text-center md:text-left">
                            <div className="flex items-center gap-1.5 justify-center md:justify-start">
                              <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                              <h5 className="text-xs font-black uppercase text-amber-500">Aparelho Desconectado</h5>
                            </div>
                            <p className="text-[10px] text-white/50">O bot de automação está configurado, mas precisará ser pareado ao WhatsApp do clube para funcionar.</p>
                          </div>
                          <div className="flex gap-2 w-full md:w-auto shrink-0">
                            <button
                              type="button"
                              onClick={checkRealStatus}
                              className="flex-1 md:flex-initial py-2.5 px-4 bg-white/5 border border-white/10 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all text-center"
                            >
                              Verificar
                            </button>
                            <button
                              type="button"
                              onClick={handleGenerateQr}
                              disabled={loadingQr}
                              className="flex-1 md:flex-initial py-2.5 px-5 bg-brand-primary text-black rounded-lg text-[10px] font-black uppercase tracking-wider hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 text-center"
                            >
                              {loadingQr ? 'Carregando...' : 'Gerar QR Code'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : realStatus === 'INCOMPLETA' ? (
                      <div className="bg-slate-500/5 border border-white/5 rounded-xl p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-slate-400 shrink-0" />
                        <div>
                          <h5 className="text-xs font-black text-slate-400 uppercase tracking-wide">Configuração Incompleta</h5>
                          <p className="text-[10px] text-white/40 leading-relaxed">Insira a URL correspondente, o token da chave API e o nome da instância abaixo para ativar o pareamento.</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Painel do Modo Simulado Inteligente */}
                    <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-brand-primary text-black font-black uppercase text-[8px] px-2.5 py-1 rounded-bl-lg tracking-widest">
                        TEST SUITE
                      </div>
                      <h5 className="text-xs font-black text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                        ⚡ MODO DE SIMULAÇÃO GUERREIROS
                      </h5>
                      <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                        Se a sua URL da Evolution API estiver incorreta, apontando para o próprio site (404) ou se você apenas deseja ver o robô funcionando em tempo real, ative o Modo Simulado. O aplicativo irá simular os disparos de mensagens diretas de prontidão e responderá (SIM/NÃO) como se fossem os sócios interagindo em tempo real!
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-3">
                        <span className="text-[9px] font-mono">
                          Status:{' '}
                          {isSimulated ? (
                            <span className="text-brand-primary font-black animate-pulse">ATIVO (SIMULADOR)</span>
                          ) : (
                            <span className="text-white/40">INATIVO</span>
                          )}
                        </span>
                        {isSimulated ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const sRes = await fetch('/api/whatsapp/toggle-simulation', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ active: false })
                                });
                                const sData = await sRes.json();
                                if (sData.success) {
                                  showNotification('Modo Simulado Desativado com Sucesso!', 'success');
                                  setIsSimulated(false);
                                  setWaConfig(prev => ({ ...prev, isSimulated: false, simulatedState: 'close' }));
                                  checkRealStatus();
                                } else {
                                  showNotification('Falha ao desativar simulação.', 'error');
                                }
                              } catch (err: any) {
                                showNotification('Erro: ' + err.message, 'error');
                              }
                            }}
                            className="py-2.5 px-5 rounded-lg text-[9px] font-black uppercase bg-black hover:bg-white/5 text-brand-primary border border-brand-primary/40 hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            Desativar Simulação
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const sRes = await fetch('/api/whatsapp/simulate-scan', { method: 'POST' });
                                const sData = await sRes.json();
                                if (sData.success) {
                                  showNotification('Modo Simulado Ativado com Sucesso! Bot virtual está ONLINE.', 'success');
                                  checkRealStatus();
                                } else {
                                  showNotification('Falha ao ativar simulação.', 'error');
                                }
                              } catch (err: any) {
                                showNotification('Erro: ' + err.message, 'error');
                              }
                            }}
                            className="py-2.5 px-5 rounded-lg text-[9px] font-black uppercase bg-brand-primary text-black hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            Conectar Bot via Simulação
                          </button>
                        )}
                      </div>
                    </div>

                    {/* QR Code Presentation Box */}
                    {qrCode && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-500 relative overflow-hidden">
                        {qrIsSimulated && (
                          <div className="absolute top-0 inset-x-0 bg-brand-primary text-black font-black uppercase text-[8px] py-1 text-center tracking-widest animate-pulse">
                            MODO SIMULAÇÃO ATIVO
                          </div>
                        )}

                        <h5 className="text-xs font-black uppercase text-brand-primary mt-2">
                          {qrIsSimulated ? '⚡ QR Code de Testes (Simulado)' : 'Escaneie o QR Code'}
                        </h5>

                        <div className="p-4 bg-white rounded-2xl shadow-xl border border-white/20 flex items-center justify-center relative">
                          <img 
                            src={qrCode} 
                            alt="WhatsApp QR Code" 
                            className="w-[280px] h-[280px] md:w-[320px] md:h-[320px] max-w-full object-contain" 
                            style={{ imageRendering: 'pixelated' }}
                            referrerPolicy="no-referrer" 
                          />
                          {qrIsSimulated && (
                            <div className="absolute inset-2 bg-black/90 flex flex-col items-center justify-center p-4 text-center rounded-xl border border-brand-primary/20">
                              <span className="text-brand-primary font-black text-sm uppercase tracking-wider mb-2 animate-bounce">⚡ MOCK BOT ATIVO</span>
                              <p className="text-[10px] text-white font-medium max-w-[220px] leading-relaxed">
                                Este QR Code é fictício/simulado para testes do clube.
                              </p>
                              <p className="text-[9px] text-white/60 max-w-[220px] mt-1.5 leading-normal">
                                NÃO o escaneie com seu celular real, ou receberá "QR Code inválido" no WhatsApp!
                              </p>
                            </div>
                          )}
                        </div>

                        {qrIsSimulated ? (
                          <div className="space-y-4 text-center max-w-[380px] w-full">
                            <div className="text-[10px] text-brand-primary font-black uppercase bg-brand-primary/5 border border-brand-primary/10 rounded-xl p-3 leading-relaxed">
                              {qrMessage || "A Evolution API do WhatsApp está offline ou configurada incorretamente (recebeu erro 404). Nós geramos esse QR Code simulado para que você possa conectar o bot virtual de testes."}
                            </div>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const sRes = await fetch('/api/whatsapp/simulate-scan', { method: 'POST' });
                                  const sData = await sRes.json();
                                  if (sData.success) {
                                    showNotification('Bot Virtual Conectado com Sucesso! O status mudou para ONLINE.', 'success');
                                    setQrCode(null);
                                    setQrIsSimulated(false);
                                    setQrMessage(null);
                                    checkRealStatus();
                                  } else {
                                    showNotification('Falha ao simular conexão.', 'error');
                                  }
                                } catch (err: any) {
                                  showNotification('Erro: ' + err.message, 'error');
                                }
                              }}
                              className="w-full py-3 px-5 rounded-xl text-[10px] font-black uppercase bg-brand-primary text-black hover:scale-[1.02] active:scale-95 transition-all text-center"
                            >
                              Simular Aprovação (Conectar Bot Virtual)
                            </button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-white/50 text-center max-w-[280px]">
                            Abra o WhatsApp no celular, vá em <span className="text-white font-bold">Aparelhos Conectados</span> {'>'} <span className="text-white font-bold">Conectar Aparelho</span> e aponte para a tela.
                          </p>
                        )}

                        <button
                          onClick={() => {
                            setQrCode(null);
                            setQrIsSimulated(false);
                            setQrMessage(null);
                          }}
                          className="text-[9px] font-black uppercase text-red-500 hover:underline pt-2"
                        >
                          Ocultar QR Code
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Evolution API URL</label>
                        <input
                          type="url"
                          placeholder="Ex: https://api.suadominio.com"
                          value={waConfig.apiUrl || ''}
                          onChange={e => setWaConfig({ ...waConfig, apiUrl: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-brand-primary outline-none text-white text-xs font-bold transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Evolution API Token / ApiKey</label>
                        <input
                          type="password"
                          placeholder="Ex: apikey_token_here"
                          value={waConfig.apiKey || ''}
                          onChange={e => setWaConfig({ ...waConfig, apiKey: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-brand-primary outline-none text-white text-xs font-bold transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Nome da Instância</label>
                        <input
                          type="text"
                          placeholder="Ex: santo-volei"
                          value={waConfig.instanceName || ''}
                          onChange={e => setWaConfig({ ...waConfig, instanceName: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-brand-primary outline-none text-white text-xs font-bold transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">WhatsApp JID do Grupo</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Ex: 120363025219382210@g.us"
                            value={waConfig.groupJid || ''}
                            onChange={e => setWaConfig({ ...waConfig, groupJid: e.target.value })}
                            className="w-full pl-4 pr-32 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-brand-primary outline-none text-white text-xs font-bold transition-all font-mono"
                          />
                          <button
                            type="button"
                            disabled={loadingGroups}
                            onClick={handleFetchGroups}
                            className="absolute right-2 top-1.5 bottom-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider bg-brand-primary text-black hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            {loadingGroups ? (
                              <>
                                <span className="animate-spin inline-block w-2 bg-black border border-t-transparent rounded-full" />
                                Carregando...
                              </>
                            ) : (
                              "Listar Grupos"
                            )}
                          </button>
                        </div>

                        {fetchedGroups && (
                          <div className="mt-2.5 p-3 rounded-xl bg-black border border-brand-primary/20 space-y-2 max-h-[180px] overflow-y-auto">
                            <p className="text-[9px] font-black uppercase text-brand-primary tracking-wider">
                              Selecione o Grupo do Clube:
                            </p>
                            {fetchedGroups.length === 0 ? (
                              <p className="text-[10px] text-white/50 italic py-1">Nenhum grupo encontrado na conta conectada.</p>
                            ) : (
                              <div className="grid grid-cols-1 gap-1.5">
                                {fetchedGroups.map((group) => (
                                  <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => {
                                      setWaConfig(prev => ({ ...prev, groupJid: group.id }));
                                      setFetchedGroups(null);
                                      showNotification(`Grupo JID selecionado: ${group.subject}`, 'success');
                                    }}
                                    className={`w-full text-left p-2 rounded-lg text-[10px] font-mono hover:bg-white/5 border transition-all ${
                                      waConfig.groupJid === group.id
                                        ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                                        : 'border-white/5 text-white/80 hover:border-white/10'
                                    }`}
                                  >
                                    <div className="font-sans font-bold text-white text-xs truncate">{group.subject}</div>
                                    <div className="text-[9px] text-white/40 truncate mt-0.5">{group.id}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold text-slate-300">Target Webhook URL</p>
                          <p className="text-[10px] text-slate-500">Copie e registre no Evolution se a ativação automatica falhar.</p>
                          <code className="block mt-2 bg-brand-secondary/80 p-2.5 rounded text-[10px] font-mono text-brand-primary select-all break-all border border-white/5">
                            {waConfig.webhookUrl}
                          </code>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(waConfig.webhookUrl);
                            showNotification('Webhook URL copiado com sucesso!', 'success');
                          }}
                          className="md:self-end shrink-0 py-2.5 px-4 rounded-xl font-black uppercase text-[9px] bg-white/10 hover:bg-white/20 text-white transition-all border border-white/15"
                        >
                          Copiar URL
                        </button>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <input
                          type="checkbox"
                          id="botActive"
                          checked={waConfig.botActive || false}
                          onChange={e => setWaConfig({ ...waConfig, botActive: e.target.checked })}
                          className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-transparent h-4 w-4"
                        />
                        <label htmlFor="botActive" className="text-xs font-black uppercase tracking-wider text-slate-300 cursor-pointer">
                          Ativar Agente de Resposta Automática (SIM/NÃO via Direct)
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        onClick={async () => {
                          await handleSaveWaConfig();
                          checkRealStatus();
                        }}
                        disabled={isWaSaving}
                        className="flex-1 min-w-[200px] py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-brand-primary text-black hover:scale-[1.02] shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50"
                      >
                        {isWaSaving ? 'Salvando...' : 'Salvar & Sincronizar Instância'}
                      </button>

                      <button
                        onClick={handleSendWaPrompts}
                        disabled={isPnSending}
                        className="flex-1 min-w-[200px] py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 hover:bg-white/10 text-white border border-brand-primary/40 transition-all disabled:opacity-50"
                      >
                        {isPnSending ? 'Disparando...' : 'Perguntar Prontidão p/ Sócio (Direct)'}
                      </button>

                      <button
                        onClick={handleSendWaGroup}
                        disabled={isGroupSending}
                        className="flex-1 min-w-[200px] py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-black transition-all disabled:opacity-50"
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
                )}
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
          
                  <div className="grid grid-cols-2 gap-2 mt-4 pr-1">
                    {goingPlayers.map((p, i) => {
                      const isCheckedIn = (attendance || []).some(a => a.id === p.id);
                      return (
                        <div key={p.id} className="flex items-center justify-between bg-brand-primary/5 p-3 rounded-2xl border border-brand-primary/20 hover:border-brand-primary/40 transition-colors gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-brand-primary font-black text-xs w-4 shrink-0">{i + 1}.</span>
                            <span className="text-white text-[12px] font-black uppercase tracking-tighter leading-tight">
                              {capitalizeName(p.name)}
                            </span>
                          </div>
                          {isCheckedIn && (
                            <div title="Na Quadra" className="p-2 text-green-400 bg-green-500/10 rounded-lg shrink-0">
                              <UserCheck className="w-4 h-4" />
                            </div>
                          )}
                          {!isCheckedIn && (currentPlayer?.id === p.id || userRole === 'ADMIN') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                resetIntent(p.id);
                              }}
                              className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 ${currentPlayer?.id === p.id ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-105 active:scale-95'}`}
                              title={currentPlayer?.id === p.id ? "Sair da Lista" : "Remover"}
                            >
                              {currentPlayer?.id === p.id ? <LogOut className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
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
          
                  <div className="grid grid-cols-2 gap-2 mt-4 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                    {filteredUndecided.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between bg-slate-500/5 p-3 rounded-2xl border border-white/5 hover:border-slate-500/40 transition-colors gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-500 font-black text-xs w-4 shrink-0">{i + 1}.</span>
                          <span className="text-white text-[12px] font-black uppercase tracking-tighter leading-tight">
                            {capitalizeName(p.name)}
                          </span>
                        </div>
                        {userRole === 'ADMIN' && (
                          <button
                            onClick={() => setIntent(p.id, 'GOING')}
                            className="p-2.5 bg-brand-primary text-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-primary/20 shrink-0"
                            title="Confirmar"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
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
          
                  <div className="grid grid-cols-2 gap-2 mt-4 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                    {notGoingPlayers.length === 0 ? (
                      <div className="col-span-full py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <p className="text-slate-500 text-sm font-medium italic">Nenhuma ausência registrada.</p>
                      </div>
                    ) : (
                      notGoingPlayers.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between bg-red-500/5 p-3 rounded-2xl border border-red-500/20 hover:border-red-500/40 transition-colors gap-2 min-w-0">
                          <div className="flex items-center gap-2 opacity-50 min-w-0">
                            <span className="text-red-500/50 font-black text-xs w-4 shrink-0">{i + 1}.</span>
                            <span className="text-white text-[12px] font-black uppercase tracking-tighter leading-tight">
                              {capitalizeName(p.name)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(currentPlayer?.id === p.id || userRole === 'ADMIN') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetIntent(p.id);
                                }}
                                className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 ${currentPlayer?.id === p.id ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-105 active:scale-95'}`}
                                title={currentPlayer?.id === p.id ? "Voltar para a Lista" : "Remover"}
                              >
                                {currentPlayer?.id === p.id ? <LogOut className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
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
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 bg-black rounded-[2rem] border border-brand-primary/20 text-center animate-in fade-in zoom-in-95">
          <CalendarCheck className="w-16 h-16 text-brand-primary/50 mb-6" />
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Confirme sua intenção</h3>
          <p className="text-sm text-slate-400">
            Você precisa confirmar presença ou ausência nos botões acima para visualizar a lista completa de intenções dos outros sócios.
          </p>
        </div>
      )}

    </div>
  );
};
