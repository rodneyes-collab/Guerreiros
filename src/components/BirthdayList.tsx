import React, { useEffect, useState, useMemo } from 'react';
import { Player } from '../../types';
import { Cake, PartyPopper, ChevronDown, ChevronUp, Star, Calendar } from 'lucide-react';
import { useBirthdays } from '../hooks/useBirthdays';
import { PlayerAvatar } from './PlayerAvatar';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

interface BirthdayListProps {
  todayBirthdays?: Player[];
  monthBirthdays?: { month: number; players: Player[] };
  players?: Player[];
}

/**
 * BirthdayList Component
 * Renders a high-contrast birthday notification and expandable monthly list for mobile users.
 * Positioned under the main header.
 */
export const BirthdayList: React.FC<BirthdayListProps> = ({ 
  todayBirthdays: propToday, 
  monthBirthdays: propMonth,
  players: propPlayers 
}) => {
  const { todayBirthdays: hookToday, monthBirthdays: hookMonth, getBirthdaysByMonth } = useBirthdays(propPlayers);
  
  const todayBirthdays = propToday ?? hookToday;
  const initialMonth = propMonth?.month ?? hookMonth.month ?? (new Date().getMonth() + 1);
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  useEffect(() => {
    if (initialMonth && selectedMonth === 0) {
      setSelectedMonth(initialMonth);
    }
  }, [initialMonth, selectedMonth]);

  useEffect(() => {
    console.log('[BIRTHDAY LIST DEBUG] updated, today count:', todayBirthdays?.length || 0);
  }, [todayBirthdays?.length]);

  // Lista de aniversariantes do mês selecionado (apenas sócios ativos)
  const currentMonthPlayers = useMemo(() => {
    const list = getBirthdaysByMonth(selectedMonth || initialMonth);
    return list.filter(p => !p.status || p.status === 'active');
  }, [selectedMonth, initialMonth, getBirthdaysByMonth]);

  const monthName = useMemo(() => {
    try {
      return monthFormatter.format(new Date(2024, (selectedMonth || initialMonth) - 1));
    } catch {
      return 'Mês';
    }
  }, [selectedMonth, initialMonth]);

  const formatDayMonth = (birthDate?: string) => {
    if (!birthDate) return '??/??';
    const parts = birthDate.split(/[-/]/);
    if (parts.length < 2) return '??/??';
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const day = parts[2] ? parts[2].substring(0, 2) : '??';
      const month = parts[1];
      return `${day}/${month}`;
    } else {
      // DD-MM-YYYY
      const day = parts[0];
      const month = parts[1];
      return `${day}/${month}`;
    }
  };

  const hasToday = todayBirthdays && todayBirthdays.length > 0;
  const hasMonth = currentMonthPlayers.length > 0;

  // Se não houver aniversariante hoje nem no mês, não renderiza nada para manter o layout limpo
  if (!hasToday && !hasMonth && !isExpanded) {
    return null;
  }

  return (
    <div className="w-full bg-zinc-950 border-b border-brand-primary/30 shadow-2xl transition-all">
      {/* Banner Principal de Notificação */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all ${
          hasToday 
            ? 'bg-brand-primary text-black font-black' 
            : 'bg-black/95 text-white border-l-4 border-l-brand-primary'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl flex-shrink-0 ${hasToday ? 'bg-black/10' : 'bg-brand-primary/10 text-brand-primary'}`}>
            {hasToday ? (
              <PartyPopper className="w-5 h-5 animate-bounce" />
            ) : (
              <Cake className="w-5 h-5 text-brand-primary animate-pulse" />
            )}
          </div>
          
          <div className="flex flex-col min-w-0">
            <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${
              hasToday ? 'text-black/70' : 'text-brand-primary'
            }`}>
              {hasToday ? 'Festa na Quadra Hoje!' : `Aniversariantes • ${monthName}`}
            </span>
            <p className="text-xs font-black uppercase tracking-tight truncate leading-tight mt-0.5">
              {hasToday 
                ? (todayBirthdays.length === 1 
                    ? `Parabéns, ${todayBirthdays[0].name.split(' ')[0]}! 🎂` 
                    : `Hoje: ${todayBirthdays.map(p => p.name.split(' ')[0]).join(', ')}! 🎂`
                  )
                : `${currentMonthPlayers.length} Guerreiro${currentMonthPlayers.length === 1 ? '' : 's'} neste mês`
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
            hasToday 
              ? 'bg-black text-brand-primary border-black/20' 
              : 'bg-white/10 text-white border-white/10'
          }`}>
            {isExpanded ? 'Fechar' : 'Ver Todos'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 opacity-70" />
          ) : (
            <ChevronDown className="w-4 h-4 opacity-70" />
          )}
        </div>
      </div>

      {/* Gaveta Retrátil de Aniversariantes do Mês */}
      {isExpanded && (
        <div className="bg-black/95 border-t border-white/10 p-4 animate-in slide-in-from-top-2 duration-300 space-y-4">
          {/* Seletor de Mês */}
          <div className="flex items-center justify-between gap-3 bg-zinc-900/80 p-2.5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-primary" />
              <span className="text-[10px] font-black text-white uppercase tracking-wider">Mês:</span>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-black text-brand-primary font-black text-xs uppercase px-3 py-1.5 rounded-xl border border-brand-primary/40 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthFormatter.format(new Date(2024, i))}
                </option>
              ))}
            </select>
          </div>

          {/* Lista de Sócios Aniversariantes */}
          {currentMonthPlayers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {currentMonthPlayers.map(player => (
                <div 
                  key={player.id}
                  className="bg-zinc-900/90 border border-white/10 rounded-2xl p-3 flex items-center gap-2.5 relative group hover:border-brand-primary/40 transition-all"
                >
                  <div className="relative flex-shrink-0">
                    <PlayerAvatar player={player} size="sm" />
                    <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-0.5 border border-white/20">
                      <div className="w-3.5 h-3.5 bg-brand-primary rounded-full flex items-center justify-center text-[7px] text-black">
                        🎂
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white uppercase tracking-tight truncate">
                      {player.name ? player.name.split(' ')[0] : 'Sócio'}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star className="w-2.5 h-2.5 text-brand-primary fill-current" />
                      <span className="text-[10px] font-black font-mono text-brand-primary">
                        {formatDayMonth(player.birthDate)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center bg-zinc-900/40 rounded-2xl border border-dashed border-white/10">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                Nenhum aniversariante em {monthName}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
