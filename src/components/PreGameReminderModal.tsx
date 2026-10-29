import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Calendar, Check, X, Clock, Send, Users, ShieldAlert } from 'lucide-react';
import { Player } from '../../types';

export interface PreGameReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayer: Player | null;
  targetDate?: string;
  undecidedCount: number;
  undecidedActivePlayers?: Player[];
  isAdmin?: boolean;
  isSubmitting?: boolean;
  isSendingPush?: boolean;
  onConfirmPresence: () => void;
  onDeclinePresence: () => void;
  onBroadcastPush?: () => void;
}

export const PreGameReminderModal: React.FC<PreGameReminderModalProps> = ({
  isOpen,
  onClose,
  currentPlayer,
  targetDate,
  undecidedCount,
  undecidedActivePlayers = [],
  isAdmin = false,
  isSubmitting = false,
  isSendingPush = false,
  onConfirmPresence,
  onDeclinePresence,
  onBroadcastPush
}) => {
  if (!isOpen) return null;

  // Formatação amigável da data-alvo
  let formattedDate = 'Quinta-feira';
  if (targetDate) {
    const parts = targetDate.split('-');
    if (parts.length === 3) {
      formattedDate = `Quinta-feira, ${parts[2]}/${parts[1]}`;
    }
  }

  const isCurrentPlayerUndecided = currentPlayer && currentPlayer.status === 'active';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-zinc-950 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(245,158,11,0.2)] overflow-hidden"
        >
          {/* Top amber accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header & Icon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <Bell className="w-7 h-7 animate-bounce" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                Véspera
              </div>
            </div>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Calendar className="w-3 h-3" />
                Lembrete de Quarta-feira
              </span>
              <h2 className="text-xl sm:text-2xl font-black italic tracking-tight text-white uppercase">
                Amanhã é dia de jogo!
              </h2>
              <p className="text-xs font-semibold text-amber-400/90 tracking-wide">
                {formattedDate}
              </p>
            </div>
          </div>

          {/* Body Message */}
          <div className="mt-5 space-y-4">
            {isCurrentPlayerUndecided && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-xs text-zinc-300 font-medium leading-relaxed">
                  <span className="font-bold text-white">Guerreiro(a) {currentPlayer?.name}</span>, a lista da semana está quase fechando. Confirme se você entrará em quadra para organizarmos as escalações!
                </p>
              </div>
            )}

            {/* Quick Actions for Current Player */}
            {isCurrentPlayerUndecided && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={onConfirmPresence}
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  {isSubmitting ? 'Salvando...' : 'Vou Jogar 🏐'}
                </button>

                <button
                  onClick={onDeclinePresence}
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-zinc-900 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-300 border border-zinc-700/60 hover:border-rose-500/40 font-black uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Não Poderei Ir
                </button>
              </div>
            )}

            {/* Admin Management Widget */}
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-white/10 bg-black/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    Sócios Ativos Indecisos:
                  </span>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 font-black rounded-lg text-xs">
                    {undecidedCount} atleta(s)
                  </span>
                </div>

                {undecidedCount > 0 && undecidedActivePlayers.length > 0 && (
                  <div className="max-h-24 overflow-y-auto pr-1 space-y-1 text-[11px] text-zinc-400">
                    {undecidedActivePlayers.slice(0, 8).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-0.5">
                        <span className="truncate">{p.name}</span>
                        <span className="text-[9px] text-zinc-500 uppercase font-black">Pendente</span>
                      </div>
                    ))}
                    {undecidedActivePlayers.length > 8 && (
                      <p className="text-[10px] text-zinc-500 italic text-center">
                        + {undecidedActivePlayers.length - 8} outros sócios ativos
                      </p>
                    )}
                  </div>
                )}

                {onBroadcastPush && undecidedCount > 0 && (
                  <button
                    onClick={onBroadcastPush}
                    disabled={isSendingPush}
                    className="w-full py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-xl font-black uppercase tracking-wider text-[11px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSendingPush ? 'Enviando Notificação...' : 'Notificar Todos via Push'}
                  </button>
                )}
              </div>
            )}

            {/* Footer dismissal link */}
            <div className="text-center pt-2">
              <button
                onClick={onClose}
                className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
              >
                <Clock className="w-3 h-3" />
                Lembrar mais tarde
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
