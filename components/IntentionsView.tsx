import React from 'react';
import confetti from 'canvas-confetti';
import { useIntentions } from '../src/hooks/useIntentions';
import { useStore } from '../store';
import { CalendarCheck, Copy, BellRing, Settings, UserCheck, UserX, Clock, ArrowRight, RotateCcw, Zap, Star, Shield, Trash2 } from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { Player } from '../types';
import { getFirestoreDateKey, getBrazilDay } from '../firebase';

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
      <div className="bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <CalendarCheck className="w-8 h-8 text-brand-primary" />
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center">
                Lista de Quinta
                <HelpTooltip 
                  title="Lista de Presença" 
                  content="Confirme sua participação. A ordem de chegada e o tempo de espera definem a prioridade para entrar em quadra. Jogadores que confirmam primeiro têm prioridade na montagem dos times."
                />
              </h2>
            </div>
            <p className="text-white font-medium">
              Confirme sua presença para o jogo na Próxima Quinta dia <span className="text-brand-primary font-bold">
                {formattedDate}
              </span>.
            </p>
          </div>
          
          {/* Player Actions */}
          {currentPlayer && (
            <div className="flex items-center gap-4 bg-brand-secondary/50 p-4 rounded-3xl border border-brand-primary/40 w-full sm:w-auto justify-center">
              <button
                onClick={handleConfirm}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs transition-all ${
                  isGoing 
                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.5)] scale-105 ring-2 ring-white ring-offset-2 ring-offset-black' 
                    : isNotGoing 
                      ? 'bg-white/10 text-white/50 border border-brand-primary/40 opacity-50' 
                      : 'bg-white text-black hover:scale-105 shadow-lg'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Vou Jogar
              </button>
              <button
                onClick={handleDecline}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs transition-all ${
                  isNotGoing 
                    ? 'bg-brand-primary text-black shadow-[0_0_20px_rgba(245,196,41,0.5)] scale-105 ring-2 ring-brand-primary ring-offset-2 ring-offset-black' 
                    : isGoing 
                      ? 'bg-brand-primary text-black opacity-50 hover:opacity-100 border border-transparent' 
                      : 'bg-brand-primary text-black hover:scale-105 shadow-lg'
                }`}
              >
                <UserX className="w-4 h-4" />
                Não Vou
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
                    className="w-full bg-brand-secondary/50 border border-brand-primary/40 rounded-xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none transition-all"
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
          
          <div className="flex-1 space-y-2">
            {goingPlayers.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">Nenhum confirmado ainda.</p>
            ) : (
              goingPlayers.map((p, i) => {
                const isCheckedIn = attendance.some(a => a.id === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between bg-brand-primary/5 p-3 rounded-xl border border-brand-primary/40">
                    <div className="flex items-center gap-3">
                      <span className="text-brand-primary font-black text-xs w-4">{i + 1}.</span>
                      <div className="flex items-center gap-2">
                        {userRole === 'ADMIN' && (
                          <div className="shrink-0" title={`Nível: ${p.impactLevel === 3 ? 'Elite' : p.impactLevel === 2 ? 'Médio' : 'Base'}`}>
                            {getImpactIcon(p.impactLevel)}
                          </div>
                        )}
                        <span className="text-white text-sm font-bold">{p.name}</span>
                        <span className="ml-2">
                        <EvasionIcon 
                          level={p.evasionLevel || calculateEvasionLevel(p as Player)} 
                          customLabel={`${(p.evasionLevel || calculateEvasionLevel(p as Player)).charAt(0).toUpperCase() + (p.evasionLevel || calculateEvasionLevel(p as Player)).slice(1)} - ${p.wins || 0}V ${p.losses || 0}D`} 
                        />
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCheckedIn ? (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg border border-green-500/30 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" /> Na Quadra
                        </span>
                      ) : (
                        <>
                          {userRole === 'ADMIN' && (
                            <button
                              onClick={() => resetIntent(p.id)}
                              className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                              title="Mover para Não Confirmados"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {userRole === 'ADMIN' && (
                            <button
                              onClick={() => onMoveToAttendance(p.id)}
                              className="text-[10px] font-black uppercase tracking-wider bg-brand-primary/20 text-brand-primary px-3 py-1.5 rounded-lg hover:bg-brand-primary hover:text-black transition-colors flex items-center gap-1"
                              title="Fazer Check-in na Quadra"
                            >
                              Check-in <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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
          
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {filteredUndecided.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">
                {searchTerm ? 'Nenhum sócio encontrado.' : 'Todos já responderam!'}
              </p>
            ) : (
              filteredUndecided.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-slate-500/5 p-3 rounded-xl border border-slate-500/40">
                  <div className="flex items-center gap-2">
                    {userRole === 'ADMIN' && (
                      <div className="shrink-0" title={`Nível: ${p.impactLevel === 3 ? 'Elite' : p.impactLevel === 2 ? 'Médio' : 'Base'}`}>
                        {getImpactIcon(p.impactLevel)}
                      </div>
                    )}
                    <span className="text-white text-sm font-bold">{p.name}</span>
                    <span className="ml-2">
                      <EvasionIcon 
                        level={p.evasionLevel || calculateEvasionLevel(p as Player)} 
                        customLabel={`${(p.evasionLevel || calculateEvasionLevel(p as Player)).charAt(0).toUpperCase() + (p.evasionLevel || calculateEvasionLevel(p as Player)).slice(1)} - ${p.wins || 0}V ${p.losses || 0}D`} 
                      />
                    </span>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIntent(p.id, 'GOING')}
                        className="text-[8px] font-black uppercase tracking-widest bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-lg hover:bg-brand-primary hover:text-black transition-all flex items-center gap-1"
                      >
                        Confirmar <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setIntent(p.id, 'NOT_GOING')}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Marcar como Ausente"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {userRole !== 'ADMIN' && (
                    <span className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest">Aguardando</span>
                  )}
                </div>
              ))
            )}
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
          
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {notGoingPlayers.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">Nenhuma ausência registrada.</p>
            ) : (
              notGoingPlayers.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-red-500/5 p-3 rounded-xl border border-red-500/40">
                    <div className="flex items-center gap-3 opacity-50">
                      {userRole === 'ADMIN' && (
                        <div className="shrink-0" title={`Nível: ${p.impactLevel === 3 ? 'Elite' : p.impactLevel === 2 ? 'Médio' : 'Base'}`}>
                          {getImpactIcon(p.impactLevel)}
                        </div>
                      )}
                      <span className="text-white text-sm font-medium line-through">{p.name}</span>
                      <span className="ml-2">
                        <EvasionIcon level={p.evasionLevel || calculateEvasionLevel(p as Player)} />
                      </span>
                    </div>
                  {userRole === 'ADMIN' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIntent(p.id, 'GOING')}
                        className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                        title="Mover para Confirmados"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => resetIntent(p.id)}
                        className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                        title="Mover para Não Confirmados"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
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

    </div>
  );
};
