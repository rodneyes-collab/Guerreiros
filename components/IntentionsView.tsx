import React from 'react';
import { useIntentions } from '../src/hooks/useIntentions';
import { useStore } from '../store';
import { CalendarCheck, Copy, BellRing, Settings, UserCheck, UserX, Clock, ArrowRight, RotateCcw } from 'lucide-react';
import { Player } from '../types';

interface IntentionsViewProps {
  userRole: 'ADMIN' | 'MEMBER' | null;
  currentPlayer: Player | null;
  onMoveToAttendance: (playerId: string) => void;
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const IntentionsView: React.FC<IntentionsViewProps> = ({ userRole, currentPlayer, onMoveToAttendance, showNotification }) => {
  const { intentions, setIntent, resetIntent, toggleAutomation, sendReminders, copyToWhatsApp, copyReminder } = useIntentions();
  const { players, attendance } = useStore();

  const handleConfirm = () => {
    if (currentPlayer) {
      setIntent(currentPlayer.id, 'GOING');
    }
  };

  const handleDecline = () => {
    if (currentPlayer) {
      setIntent(currentPlayer.id, 'NOT_GOING');
    }
  };

  const [searchTerm, setSearchTerm] = React.useState('');

  const goingPlayers = players
    .filter(p => intentions.responses[p.id] === 'GOING' && p.status !== 'inactive')
    .sort((a, b) => {
      const timeA = intentions.confirmationTimestamps?.[a.id] || 0;
      const timeB = intentions.confirmationTimestamps?.[b.id] || 0;
      return timeA - timeB;
    });
  const notGoingPlayers = players.filter(p => intentions.responses[p.id] === 'NOT_GOING' && p.status !== 'inactive');
  const undecidedPlayers = players.filter(p => !intentions.responses[p.id] && p.status !== 'inactive');

  const filteredUndecided = undecidedPlayers.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isGoing = currentPlayer ? intentions.responses[currentPlayer.id] === 'GOING' : false;
  const isNotGoing = currentPlayer ? intentions.responses[currentPlayer.id] === 'NOT_GOING' : false;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Header */}
      <div className="bg-black rounded-[3rem] border border-brand-primary/20 p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <CalendarCheck className="w-8 h-8 text-brand-primary" />
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Lista de Quinta</h2>
            </div>
            <p className="text-slate-400 font-medium">
              Confirme sua presença para o jogo do dia <span className="text-brand-primary font-bold">{intentions.targetDate || 'Próxima Quinta'}</span>.
            </p>
          </div>
          
          {/* Player Actions */}
          {currentPlayer && (
            <div className="flex items-center gap-4 bg-brand-secondary/50 p-4 rounded-3xl border border-white/5 w-full sm:w-auto justify-center">
              <button
                onClick={handleConfirm}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                  isGoing 
                    ? 'bg-brand-primary text-black shadow-[0_0_20px_rgba(245,196,41,0.3)] scale-105' 
                    : 'bg-black text-white border border-white/10 hover:border-brand-primary/50'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Vou Jogar
              </button>
              <button
                onClick={handleDecline}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                  isNotGoing 
                    ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] scale-105' 
                    : 'bg-black text-white border border-white/10 hover:border-red-500/50'
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
        <div className="bg-brand-secondary/30 rounded-[2rem] border border-brand-primary/10 p-6 sm:p-8 shadow-lg shadow-brand-primary/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Painel do Administrador</h3>
            </div>
            <span className="text-[10px] font-black text-brand-primary/50 uppercase tracking-widest">Acesso Restrito</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Search Box for Quick Confirmation */}
            <div className="sm:col-span-4 bg-black p-5 rounded-2xl border border-white/5 mb-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Buscar sócio para confirmar manualmente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-brand-secondary/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none transition-all"
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
            <div className="bg-black p-5 rounded-2xl border border-white/5 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Piloto Automático</p>
                <p className="text-[10px] text-slate-500">Envia lembretes automáticos na quarta e quinta-feira.</p>
              </div>
              <button
                onClick={() => toggleAutomation(!intentions.automationEnabled)}
                className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                  intentions.automationEnabled
                    ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/30'
                    : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                {intentions.automationEnabled ? 'Ligado' : 'Desligado'}
              </button>
            </div>

            <div className="bg-black p-5 rounded-2xl border border-white/5 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cobrar Indecisos</p>
                <p className="text-[10px] text-slate-500">Envia notificação Push agora para quem não respondeu.</p>
              </div>
              <button
                onClick={() => {
                  sendReminders();
                  showNotification('Lembretes enviados com sucesso!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 text-white border border-white/10 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all flex items-center justify-center gap-2"
              >
                <BellRing className="w-3 h-3" />
                Notificar Agora
              </button>
            </div>

            <div className="bg-black p-5 rounded-2xl border border-white/5 flex flex-col justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Copiar Lembrete</p>
                <p className="text-[10px] text-slate-500">Copia o texto de cobrança para o WhatsApp.</p>
              </div>
              <button
                onClick={() => {
                  copyReminder();
                  showNotification('Lembrete copiado para o WhatsApp!', 'success');
                }}
                className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 text-white border border-white/10 hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Copiar Lembrete
              </button>
            </div>

            <div className="bg-black p-5 rounded-2xl border border-white/5 flex flex-col justify-between gap-4">
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
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Going */}
        <div className="bg-black rounded-[2rem] border border-brand-primary/20 p-6 flex flex-col">
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
                  <div key={p.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-brand-primary font-black text-xs w-4">{i + 1}.</span>
                      <span className="text-white text-sm font-bold">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userRole === 'ADMIN' && (
                        <button
                          onClick={() => resetIntent(p.id)}
                          className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                          title="Mover para Não Confirmados"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {userRole === 'ADMIN' && !isCheckedIn && (
                        <button
                          onClick={() => onMoveToAttendance(p.id)}
                          className="text-[10px] font-black uppercase tracking-wider bg-brand-primary/20 text-brand-primary px-3 py-1.5 rounded-lg hover:bg-brand-primary hover:text-black transition-colors flex items-center gap-1"
                          title="Fazer Check-in na Quadra"
                        >
                          Check-in <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Undecided */}
        <div className="bg-black rounded-[2rem] border border-white/10 p-6 flex flex-col">
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
                <div key={p.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-400 text-sm font-medium">{p.name}</span>
                  {userRole === 'ADMIN' && (
                    <button
                      onClick={() => setIntent(p.id, 'GOING')}
                      className="text-[8px] font-black uppercase tracking-widest bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-lg hover:bg-brand-primary hover:text-black transition-all flex items-center gap-1"
                    >
                      Confirmar <ArrowRight className="w-3 h-3" />
                    </button>
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
        <div className="bg-black rounded-[2rem] border border-red-500/20 p-6 flex flex-col">
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
                <div key={p.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3 opacity-50">
                    <span className="text-white text-sm font-medium line-through">{p.name}</span>
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

    </div>
  );
};
