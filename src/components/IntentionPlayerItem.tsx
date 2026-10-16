import React from 'react';
import { motion } from 'motion/react';
import { UserCheck, UserX, Clock, Trash2, Smartphone, CheckCheck, BellOff } from 'lucide-react';
import { Player } from '../../types';
import { PlayerAvatar } from './PlayerAvatar';
import { capitalizeName } from '../../utils/helpers';

export interface ConfirmedPlayerItemProps {
  player: Player;
  index: number;
  isCheckedIn: boolean;
  canReset: boolean;
  isCurrentPlayer: boolean;
  userRole: 'ADMIN' | 'MEMBER' | null;
  isProcessing: boolean;
  isOtherProcessing: boolean;
  confirmationTimeStr: string | null;
  onReset: (playerId: string) => void;
  onMoveToAttendance: (playerId: string) => void;
}

export const ConfirmedPlayerItem = React.memo<ConfirmedPlayerItemProps>(({
  player,
  index,
  isCheckedIn,
  canReset,
  isCurrentPlayer,
  userRole,
  isProcessing,
  isOtherProcessing,
  confirmationTimeStr,
  onReset,
  onMoveToAttendance
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (canReset && !isProcessing && !isOtherProcessing) {
          onReset(player.id);
        }
      }}
      className={`flex items-center justify-between bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/20 hover:border-brand-primary/50 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${
        canReset
          ? 'cursor-pointer hover:bg-brand-primary/10 hover:shadow-[0_0_20px_rgba(245,196,41,0.15)]'
          : 'opacity-85'
      } ${isOtherProcessing ? 'opacity-40 grayscale pointer-events-none' : ''}`}
      title={
        canReset
          ? isCurrentPlayer
            ? 'Clique para sair da lista'
            : 'Clique para remover presença'
          : undefined
      }
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-brand-primary font-black text-xs w-5 shrink-0">{index + 1}.</span>
        <PlayerAvatar player={player} size="sm" />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5">
              {capitalizeName(player.name)}
              {player.status === 'guest' && (
                <span className="ml-1.5 text-[8px] font-black uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-1.5 py-0.5 rounded leading-none">
                  Convidado
                </span>
              )}
              <span className="absolute -bottom-0.5 left-0 h-0.5 bg-brand-primary transition-all duration-300 w-0 group-hover/player:w-full group-active/player:w-full" />
            </span>
            {confirmationTimeStr && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-brand-primary/90 bg-brand-primary/10 px-1.5 py-0.5 rounded-full border border-brand-primary/30 animate-in fade-in slide-in-from-left-2 duration-500">
                <Clock className="w-2.5 h-2.5" />
                {confirmationTimeStr}
              </span>
            )}
          </div>
        </div>
      </div>
      {isCheckedIn && (
        <div title="Na Quadra" className="p-2 text-green-400 bg-green-500/10 rounded-lg shrink-0">
          <UserCheck className="w-4 h-4" />
        </div>
      )}
      {userRole === 'ADMIN' && !isCheckedIn && (
        <button
          disabled={isProcessing || isOtherProcessing}
          onClick={(e) => {
            e.stopPropagation();
            onMoveToAttendance(player.id);
          }}
          className="p-2.5 bg-brand-primary text-black rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-brand-primary/20 shrink-0 disabled:opacity-50"
          title="Mover para Quadra"
        >
          <UserCheck className="w-4 h-4" />
        </button>
      )}
      {((!isCheckedIn && isCurrentPlayer) || userRole === 'ADMIN') && (
        <button
          disabled={isProcessing || isOtherProcessing}
          onClick={(e) => {
            e.stopPropagation();
            onReset(player.id);
          }}
          className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 disabled:opacity-50 ${
            isCurrentPlayer
              ? 'bg-red-500 text-white shadow-red-500/20'
              : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-110 active:scale-90'
          }`}
          title={isCurrentPlayer ? 'Sair da Lista' : 'Remover da Lista'}
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      )}
    </motion.div>
  );
});

ConfirmedPlayerItem.displayName = 'ConfirmedPlayerItem';

export interface UndecidedPlayerItemProps {
  player: Player;
  index: number;
  canConfirm: boolean;
  isProcessing: boolean;
  isOtherProcessing: boolean;
  onConfirm: (player: Player) => void;
  onDecline: (playerId: string) => void;
  reminderSent?: boolean;
  hasPushToken?: boolean;
  isAlreadyConfirmed?: boolean;
}

export const UndecidedPlayerItem = React.memo<UndecidedPlayerItemProps>(({
  player,
  index,
  canConfirm,
  isProcessing,
  isOtherProcessing,
  onConfirm,
  onDecline,
  reminderSent = false,
  hasPushToken = false,
  isAlreadyConfirmed = false
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (canConfirm && !isProcessing && !isOtherProcessing && !isAlreadyConfirmed) {
          onConfirm(player);
        }
      }}
      className={`flex items-center justify-between bg-slate-500/5 p-4 rounded-2xl border border-white/5 hover:border-brand-primary/40 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${
        canConfirm && !isAlreadyConfirmed
          ? 'cursor-pointer hover:bg-brand-primary/10 hover:border-brand-primary/30 hover:shadow-[0_0_20px_rgba(245,196,41,0.15)]'
          : 'opacity-85'
      } ${isOtherProcessing || isAlreadyConfirmed ? 'opacity-40 grayscale pointer-events-none' : ''}`}
      title={canConfirm && !isAlreadyConfirmed ? 'Clique para confirmar presença' : isAlreadyConfirmed ? 'Já confirmado' : undefined}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-slate-500 font-black text-xs w-5 shrink-0">{index + 1}.</span>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="break-words font-black">{capitalizeName(player.name)}</span>
            {player.status === 'guest' && (
              <span className="text-[8px] font-black uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-1.5 py-0.5 rounded leading-none shrink-0">
                Convidado
              </span>
            )}
            <span className="absolute -bottom-0.5 left-0 h-0.5 bg-brand-primary transition-all duration-300 w-0 group-hover/player:w-full group-active/player:w-full" />
          </span>

          {/* Status do Push Notification para o Sócio */}
          <div className="flex items-center gap-1.5 mt-1">
            {reminderSent ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCheck className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
                Push Enviado
              </span>
            ) : hasPushToken ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                <Smartphone className="w-2.5 h-2.5 shrink-0 text-brand-primary" />
                Push Ativo (Na Fila)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-white/5">
                <BellOff className="w-2.5 h-2.5 shrink-0 text-zinc-500" />
                Sem Push Ativo
              </span>
            )}
          </div>
        </div>
      </div>
      {canConfirm && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            disabled={isProcessing || isOtherProcessing || isAlreadyConfirmed}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm(player);
            }}
            className="p-3 bg-brand-primary text-black rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-brand-primary/20 shrink-0 disabled:opacity-50 border-2 border-black"
            title={isAlreadyConfirmed ? "Já Confirmado" : "Vou Jogar!"}
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <UserCheck className="w-5 h-5" />
            )}
          </button>
          <button
            disabled={isProcessing || isOtherProcessing}
            onClick={(e) => {
              e.stopPropagation();
              onDecline(player.id);
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
});

UndecidedPlayerItem.displayName = 'UndecidedPlayerItem';

export interface NotGoingPlayerItemProps {
  player: Player;
  index: number;
  canReset: boolean;
  isCurrentPlayer: boolean;
  isProcessing: boolean;
  isOtherProcessing: boolean;
  onReset: (playerId: string) => void;
}

export const NotGoingPlayerItem = React.memo<NotGoingPlayerItemProps>(({
  player,
  index,
  canReset,
  isCurrentPlayer,
  isProcessing,
  isOtherProcessing,
  onReset
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (canReset && !isProcessing && !isOtherProcessing) {
          onReset(player.id);
        }
      }}
      className={`flex items-center justify-between bg-red-500/5 p-4 rounded-2xl border border-red-500/20 hover:border-red-500/50 transition-all duration-300 gap-2 min-w-0 group/player hover:scale-[1.02] active:scale-[0.98] ${
        canReset
          ? 'cursor-pointer hover:bg-red-500/10 hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]'
          : 'opacity-85'
      } ${isOtherProcessing ? 'opacity-40 grayscale pointer-events-none' : ''}`}
      title={canReset ? 'Clique para voltar para a lista de indecisos' : undefined}
    >
      <div className="flex items-center gap-2 opacity-50 min-w-0 flex-1">
        <span className="text-red-500/50 font-black text-xs w-5 shrink-0">{index + 1}.</span>
        <span className="text-white text-[13px] font-black uppercase tracking-tighter leading-tight relative py-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="break-words font-black">{capitalizeName(player.name)}</span>
          {player.status === 'guest' && (
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
            disabled={isProcessing || isOtherProcessing}
            onClick={(e) => {
              e.stopPropagation();
              onReset(player.id);
            }}
            className={`p-2.5 rounded-xl transition-all shadow-lg shrink-0 disabled:opacity-50 ${
              isCurrentPlayer
                ? 'bg-red-500 text-white shadow-red-500/20'
                : 'bg-brand-primary text-black shadow-brand-primary/20 hover:scale-110 active:scale-90'
            }`}
            title={isCurrentPlayer ? 'Voltar para a Lista' : 'Remover da Lista'}
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
});

NotGoingPlayerItem.displayName = 'NotGoingPlayerItem';
