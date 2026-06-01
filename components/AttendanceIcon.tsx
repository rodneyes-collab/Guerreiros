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
      className={`inline-flex items-center gap-1.5 cursor-help transition-all select-none ${colorClass}`}
      title={`${label}: ${percentage}% de presença`}
    >
      <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
      {showText && <span className="text-[9px] font-black font-mono">{percentage}%</span>}
    </span>
  );
};
