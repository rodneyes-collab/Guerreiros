import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Calendar as CalendarIcon } from 'lucide-react';
import { Match, Tournament } from '../types';
import { dateFormatterEnCA_SP } from '../src/utils/dateUtils';

interface HistoryCalendarProps {
  matches: Match[];
  tournaments: Tournament[];
  onSelectDate: (date: string) => void;
  selectedDate: string;
}

export const HistoryCalendar: React.FC<HistoryCalendarProps> = ({ matches, tournaments, onSelectDate, selectedDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const matchDates = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach(m => {
      // Robust standard date key parsing
      const rawDate = m.date;
      let d = '';
      if (rawDate) {
        if (rawDate.includes('/')) {
          const parts = rawDate.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            d = `${year}-${month}-${day}`;
          }
        } else if (rawDate.includes('-') && rawDate.split('-')[0].length !== 4) {
          const parts = rawDate.split('-');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            d = `${year}-${month}-${day}`;
          }
        } else {
          d = rawDate;
        }
      }
      
      if (d) dates.add(d);

      if (m.timestamp) {
        const tsDate = dateFormatterEnCA_SP.format(new Date(m.timestamp));
        if (tsDate) dates.add(tsDate);
      }
    });
    return dates;
  }, [matches]);

  const tournamentDates = useMemo(() => {
    const dates = new Set<string>();
    tournaments.forEach(t => {
      if (t.date) dates.add(t.date);
    });
    return dates;
  }, [tournaments]);

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  return (
    <div className="bg-black rounded-[3rem] border border-white/5 border-l-[8px] border-brand-primary p-6 shadow-2xl overflow-hidden mb-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-brand-primary" />
          Calendário de Jogos
        </h3>
        <div className="flex items-center gap-4">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-black text-brand-primary uppercase tracking-widest w-32 text-center">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <button onClick={handleNextMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, i) => (
          <div key={i} className={`text-center text-[10px] font-black uppercase pb-2 ${i === 4 ? 'text-brand-primary' : 'text-white/40'}`}>
            {day}
          </div>
        ))}
        
        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-14" />;
          }
          
          // Current day of week: (i % 7)
          const isThursday = (i % 7) === 4;
          
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          const hasMatch = matchDates.has(dateStr);
          const hasTournament = tournamentDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          
          return (
            <button
              key={i}
              onClick={() => onSelectDate(dateStr)}
              className={`
                relative h-14 rounded-2xl flex flex-col items-center justify-center transition-all border
                ${isSelected ? 'bg-brand-primary/20 border-brand-primary' : isThursday ? 'bg-brand-primary/5 border-brand-primary/20 hover:bg-brand-primary/10' : 'bg-white/5 border-white/5 hover:bg-white/10'}
                ${hasMatch ? 'font-black text-white' : 'font-medium text-white/40'}
              `}
            >
              <span className={`text-sm ${isThursday && !isSelected ? 'text-brand-primary' : ''}`}>
                {day}
              </span>
              
              <div className="flex gap-1 mt-1">
                {hasMatch && !hasTournament && (
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                )}
                {hasTournament && (
                  <Trophy className="w-3 h-3 text-rose-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="flex items-center gap-6 mt-6 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-brand-primary/5 border border-brand-primary/20" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Dia Oficial (Quinta)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Tem Partidas</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="w-3 h-3 text-rose-500" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Torneio / Evento Especial</span>
        </div>
      </div>
    </div>
  );
}
