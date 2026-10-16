import React from 'react';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { Player } from '../types';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { calculateEffectiveElo, calculateCompositePerformanceRating } from '../utils/teamLogic';
import { capitalizeName } from '../utils/helpers';
import { 
  UserCheck, 
  ArrowLeftRight, 
  UserMinus,
  LogOut,
  X,
  Plus,
  AlertTriangle,
  Sparkles,
  Clock,
  Replace,
  Star,
  Shield
} from 'lucide-react';

interface SynergyItem {
  name: string;
  winRate: number;
  games: number;
}

interface PlayerRowProps {
  p: Player;
  isSetter?: boolean;
  isActive?: boolean;
  isTimeA?: boolean;
  attendancePosition?: number | string;
  suggestedPosition?: string;
  userRole?: string;
  onSwap: (pid: string) => void;
  onQuickSwap?: (player: Player) => void;
  onRemove?: (pid: string) => void;
  onPromote?: (pid: string) => void;
  isRival?: boolean;
  isHovered?: boolean;
  isBottomTwo?: boolean;
  techTier?: 'TOP4' | 'BOTTOM4' | 'MID' | 'TOP2' | 'BOTTOM2';
  icColorInfo?: { icColor: string, icTitle: string, techTier: any };
  synergyInfo?: {
    highSynergy: SynergyItem[];
    lowSynergy: SynergyItem[];
  };
}

export const PlayerRowComponent: React.FC<PlayerRowProps> = ({ 
  p, 
  isSetter, 
  isActive, 
  isTimeA,
  attendancePosition, 
  suggestedPosition, 
  userRole,
  onSwap, 
  onQuickSwap,
  onRemove, 
  onPromote,
  isRival,
  isHovered,
  isBottomTwo,
  techTier,
  icColorInfo,
  synergyInfo
}) => {
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const fullPlayer = players.find(fp => fp.id === p.id);
  const attendanceRecord = attendance.find(a => a.id === p.id);
  const departureTime = p.departureTime || fullPlayer?.departureTime || attendanceRecord?.departureTime;
  const displayName = capitalizeName(p.name || fullPlayer?.name || "Sócio sem nome");

  const handleDragStart = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.dataTransfer.setData('playerId', p.id);
    e.dataTransfer.setData('sourceTeam', isTimeA ? 'A' : 'B');
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.preventDefault();
    e.currentTarget.classList.add('ring-4', 'ring-brand-primary/40');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-4', 'ring-brand-primary/40');
  };

  const handleDrop = (e: React.DragEvent) => {
    if (userRole !== 'ADMIN') return;
    e.preventDefault();
    e.currentTarget.classList.remove('ring-4', 'ring-brand-primary/40');
    const draggedPlayerId = e.dataTransfer.getData('playerId');
    if (draggedPlayerId && draggedPlayerId !== p.id) {
      onSwap(draggedPlayerId);
      // O swap final será processado usando o ID deste jogador p.id
      // No useAppLogic atual, onSwap(pid) alterna a seleção. 
      // Para DnD, queremos uma troca imediata.
    }
  };

  return (
    <motion.div 
      layout
      layoutId={`player-card-${p.id}`}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      draggable={userRole === 'ADMIN'}
      onDragStart={handleDragStart as any}
      onDragEnd={handleDragEnd as any}
      onDragOver={handleDragOver as any}
      onDragLeave={handleDragLeave as any}
      onDrop={handleDrop as any}
      onClick={() => {
        if (userRole === 'ADMIN') {
          if (isActive) {
            onSwap(p.id);
          } else if (onQuickSwap) {
            onQuickSwap(p);
          } else {
            onSwap(p.id);
          }
        }
      }}
      className={`relative flex items-center justify-between p-2 sm:p-5 rounded-[1.2rem] sm:rounded-[2rem] border transition-all duration-300 group cursor-pointer ${
        isActive 
          ? 'bg-brand-primary/20 border-brand-primary border-l-[8px] border-l-brand-primary shadow-[0_0_25px_rgba(245,196,41,0.5)] ring-4 ring-brand-primary/50 scale-[1.02] z-20' 
          : isRival
            ? 'bg-brand-primary/20 border-brand-primary border-l-[8px] border-l-brand-primary shadow-[0_0_20px_rgba(245,196,41,0.2)] scale-[1.02] z-10'
            : isHovered
              ? 'bg-white/5 border-white/20 border-l-[8px] border-l-white/40 scale-[1.02] z-10'
              : 'bg-brand-light border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm hover:shadow-md'
      }`}
    >
      {(isActive || isRival || isHovered) && (
        <motion.div
          layoutId={`active-glow-${p.id}`}
          className="absolute inset-0 rounded-[1.2rem] sm:rounded-[2rem] pointer-events-none"
          animate={{
            boxShadow: [
              "0 0 0px rgba(245, 196, 41, 0)",
              isActive ? "0 0 45px rgba(245, 196, 41, 0.7)" : isRival ? "0 0 40px rgba(245, 196, 41, 0.5)" : "0 0 30px rgba(245, 196, 41, 0.4)",
              "0 0 0px rgba(245, 196, 41, 0)"
            ],
            borderColor: [
              "rgba(245, 196, 41, 0.2)",
              isActive ? "#F5C429" : isRival ? "#F5C429" : "rgba(245, 196, 41, 0.8)",
              "rgba(245, 196, 41, 0.2)"
            ]
          }}
          transition={{
            duration: isActive ? 1.0 : 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ border: '2px solid transparent' }}
        />
      )}
      <div className="flex items-center gap-2 sm:gap-6 min-w-0 relative z-10">
        <div className="relative shrink-0 flex items-center gap-2">
          <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-black ${isSetter ? (isTimeA ? 'bg-brand-primary/20 text-brand-primary' : 'bg-brand-primary/20 text-white') : 'bg-brand-primary/5 text-white/50'} border border-brand-primary/10 shadow-sm`}>
            {attendancePosition && attendancePosition !== 0 ? attendancePosition : '?'}
          </div>
          <PlayerAvatar player={fullPlayer || p} size="sm" />
          {isSetter && <div className="absolute -top-1 -right-1 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 bg-brand-primary rounded-full border-2 border-brand-nav flex items-center justify-center shadow-sm z-20"><UserCheck className="w-2 h-2 sm:w-3 h-3 text-brand-secondary" /></div>}
        </div>
        <div className="min-w-0">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
              type: "spring",
              stiffness: 400,
              damping: 10
            }}
            className={`flex items-center gap-2 text-sm sm:text-lg md:text-xl font-extrabold ${isTimeA ? 'text-brand-primary drop-shadow-[0_0_6px_rgba(245,196,41,0.2)]' : 'text-white'} tracking-tight leading-tight`}
          >
            <div className="flex items-center gap-1.5 mr-1 shrink-0">
               {/* Indicador de Status */}
               <div className={`w-2.5 h-2.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} title={p.status === 'active' ? 'Ativo' : 'Status: ' + p.status} />
               {/* Indicador de Posição/Prioridade */}
               {isSetter && <div className="w-2.5 h-2.5 rounded-full bg-brand-primary" title="Levantador" />}
               {isBottomTwo && <div className="w-2.5 h-2.5 rounded-full bg-rose-500" title="Prioridade: Ajuste Técnico" />}
            </div>
            {displayName}
            {isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-primary text-black font-black text-[9px] sm:text-[10px] uppercase tracking-wider shadow-md shadow-brand-primary/30 shrink-0 border border-brand-primary/60 animate-pulse">
                <Replace className="w-3 h-3 text-black" />
                <span>Selecionado</span>
              </span>
            )}
            {departureTime && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] sm:text-[11px] font-black uppercase shadow-sm shrink-0"
                title={`Horário de saída antecipada agendado para ${departureTime}`}
              >
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 animate-pulse" />
                <span>Out: {departureTime}</span>
              </span>
            )}
            {icColorInfo && (
              <div className="inline-flex items-center gap-1 ml-1.5 align-middle -translate-y-[2px]" title={icColorInfo.icTitle}>
                <div className={`w-2.5 h-2.5 rounded-full ${icColorInfo.icColor}`} />
              </div>
            )}
            {techTier === 'TOP2' && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Top 2 Técnico: Destaque da partida (Maior Nível)"
              >
                <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span>TOP 2</span>
              </span>
            )}
            {techTier === 'TOP4' && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Top 4 Técnico: Linha Forte da partida"
              >
                <Star className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400" />
                <span>TOP 4</span>
              </span>
            )}
            {!techTier && (fullPlayer?.impactLevel === 3 || p.impactLevel === 3) && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Classificação de Impacto: Elite"
              >
                <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span>TOP</span>
              </span>
            )}
            {techTier === 'BOTTOM2' && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Bottom 2 Técnico: Separado obrigatoriamente pelo algoritmo"
              >
                <Shield className="w-2.5 h-2.5 text-red-400" />
                <span>BOT 2</span>
              </span>
            )}
            {techTier === 'BOTTOM4' && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/40 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Bottom 4 Técnico: Linha Base da partida"
              >
                <Shield className="w-2.5 h-2.5 text-orange-400" />
                <span>BOT 4</span>
              </span>
            )}
            {!techTier && (fullPlayer?.impactLevel === 1 || p.impactLevel === 1) && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[9px] font-black uppercase shadow-sm shrink-0"
                title="Classificação de Impacto: Base"
              >
                <Shield className="w-2.5 h-2.5 text-zinc-400" />
                <span>BASE</span>
              </span>
            )}
            {!techTier && isBottomTwo && (
              <span 
                className="flex items-center justify-center p-0.5 sm:p-1 rounded bg-red-500/10 text-red-500 ring-1 ring-red-500/30"
                title="Bottom 2: Um dos dois jogadores de menor nível técnico na partida"
              >
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
              </span>
            )}
          </motion.div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1 sm:mt-2">
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-black bg-brand-primary px-1 py-0.5 rounded border border-brand-primary/30">{p.wins || 0}V</span>
            <span className="text-[8px] sm:text-[11px] font-black uppercase text-white bg-white/10 px-1 py-0.5 rounded border border-white/30">{p.losses || 0}D</span>
            <span className="text-[8px] sm:text-[11px] text-white/60 font-bold uppercase flex items-center gap-1 sm:gap-2">
              <span className="hidden xs:inline">EFIC:</span> <span className="text-brand-primary font-black" title={`Rating Híbrido de Equilíbrio (50% ELO Descontado de Bônus + 50% IC): ${Math.round(calculateEffectiveElo(p))}`}>{Math.round(calculateEffectiveElo(p))}</span>
              <span className="text-white/50 font-black" title={`Índice Composto (80% Habilidades + 20% Vitória): ${calculateCompositePerformanceRating(p)}`}>• IC {calculateCompositePerformanceRating(p)}</span>
              {suggestedPosition && (
                <span className={`${
                  isTimeA 
                    ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/40 shadow-[0_0_10px_rgba(245,196,41,0.1)]' 
                    : 'bg-white/10 text-white border-white/20'
                } px-2.5 py-0.5 rounded text-[11px] sm:text-[15px] border font-black`}>
                  P{suggestedPosition}
                </span>
              )}
            </span>
          </div>
          {synergyInfo && (synergyInfo.highSynergy.length > 0 || synergyInfo.lowSynergy.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {synergyInfo.highSynergy.map((hs, idx) => (
                <span 
                  key={`hs-${idx}`} 
                  className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md shadow-sm"
                  title={`Sinergia Positiva com ${hs.name}: ${Math.round(hs.winRate * 100)}% de vitórias em ${hs.games} jogos juntos`}
                >
                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                  Sinergia +{hs.name} ({Math.round(hs.winRate * 100)}%)
                </span>
              ))}
              {synergyInfo.lowSynergy.map((ls, idx) => (
                <span 
                  key={`ls-${idx}`} 
                  className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md shadow-sm"
                  title={`Sinergia Negativa com ${ls.name}: ${Math.round(ls.winRate * 100)}% de vitórias em ${ls.games} jogos juntos`}
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" />
                  Atenção {ls.name} ({Math.round(ls.winRate * 100)}%)
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Botões de Ação: Designar Levantador, Trocar Jogador, Sair da Partida */}
      {(userRole === 'ADMIN' || !userRole || userRole !== 'MEMBER') && (
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 relative z-20">
          {onPromote && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPromote(p.id);
              }}
              className="p-2 sm:p-3 rounded-xl sm:rounded-2xl text-white/50 hover:text-brand-primary hover:bg-brand-primary/10 transition-all cursor-pointer"
              title="Designar como Levantador Oficial"
            >
              <UserCheck className="w-5 h-5 sm:w-6 sm:h-6"/>
            </button>
          )}
          {onSwap && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onQuickSwap) {
                  onQuickSwap(p);
                } else {
                  onSwap(p.id);
                }
              }}
              className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all cursor-pointer ${isActive ? 'bg-brand-primary text-black shadow-lg shadow-brand-primary/30 scale-105' : 'text-white/50 hover:text-brand-primary hover:bg-brand-primary/10'}`}
              title="Substituição Rápida (Clique para trocar atleta)"
            >
              <Replace className="w-5 h-5 sm:w-6 sm:h-6"/>
            </button>
          )}
          {onRemove && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(p.id);
              }}
              className="p-2 sm:p-3 rounded-xl sm:rounded-2xl text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
              title="Sair da Partida (Substituir por próximo Reserva)"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6"/>
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export const PlayerRow = React.memo(PlayerRowComponent, (prevProps, nextProps) => {
  return (
    prevProps.p.id === nextProps.p.id &&
    prevProps.p.name === nextProps.p.name &&
    prevProps.p.wins === nextProps.p.wins &&
    prevProps.p.losses === nextProps.p.losses &&
    prevProps.p.elo === nextProps.p.elo &&
    prevProps.p.arrivalOrder === nextProps.p.arrivalOrder &&
    prevProps.p.departureTime === nextProps.p.departureTime &&
    prevProps.isSetter === nextProps.isSetter &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isTimeA === nextProps.isTimeA &&
    prevProps.attendancePosition === nextProps.attendancePosition &&
    prevProps.suggestedPosition === nextProps.suggestedPosition &&
    prevProps.userRole === nextProps.userRole &&
    prevProps.isRival === nextProps.isRival &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.isBottomTwo === nextProps.isBottomTwo &&
    prevProps.icColorInfo?.icColor === nextProps.icColorInfo?.icColor &&
    JSON.stringify(prevProps.synergyInfo) === JSON.stringify(nextProps.synergyInfo)
  );
});
