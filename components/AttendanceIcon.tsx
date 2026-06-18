import React from 'react';
import { CalendarCheck, Calendar } from 'lucide-react';

interface AttendanceIconProps {
  percentage: number;
  showText?: boolean;
}

export const AttendanceIcon: React.FC<AttendanceIconProps> = ({ percentage, showText = true }) => {
  let colorClass = "text-emerald-500";
  let label = "Assiduidade Excelente";
  
  if (percentage < 50) {
    colorClass = "text-rose-500";
    label = "Assiduidade Baixa";
  } else if (percentage < 75) {
    colorClass = "text-amber-500";
    label = "Assiduidade Regular";
  }

  return (
    <span 
      className={`group relative inline-flex items-center gap-1.5 cursor-help transition-all select-none ${colorClass}`}
    >
      <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
      {showText && <span className="text-[9px] font-black font-mono">{percentage}%</span>}

      {/* Custom Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
        {label}: {percentage}% de presença
        {/* Tooltip arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
      </span>
    </span>
  );
};
