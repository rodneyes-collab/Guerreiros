import React from 'react';
import { Shield, AlertTriangle, Flame, AlertCircle } from 'lucide-react';

interface EvasionIconProps {
  level?: 'low' | 'medium' | 'high' | 'critical';
  customTooltip?: string;
}

export const EvasionIcon: React.FC<EvasionIconProps> = ({ level, customTooltip }) => {
  if (!level) return null;

  const config = {
    low: { icon: Shield, color: 'text-emerald-500', label: 'Ranking Fiel' },
    medium: { icon: AlertTriangle, color: 'text-amber-500', label: 'Atenção: Presença Oscilando' },
    high: { icon: Flame, color: 'text-orange-500', label: 'Risco: Ausência Prolongada' },
    critical: { icon: AlertCircle, color: 'text-rose-500', label: 'Crítico: Risco de Evasão' },
  };

  const { icon: Icon, color, label } = config[level];
  const finalTooltip = customTooltip || label;

  return (
    <span 
      className="group relative inline-flex items-center justify-center cursor-help transition-transform hover:scale-110 active:scale-95"
    >
      <Icon className={`w-3.5 h-3.5 ${color} drop-shadow-sm`} />
      
      {/* Custom Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2.5 bg-black border border-brand-primary/40 rounded-xl shadow-2xl text-[10px] text-white font-bold leading-normal text-center normal-case tracking-normal z-50 pointer-events-none transition-all duration-300">
        {finalTooltip}
        {/* Tooltip arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
      </span>
    </span>
  );
};
