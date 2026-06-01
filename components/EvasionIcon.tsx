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
      className="inline-flex items-center justify-center cursor-help transition-transform hover:scale-110 active:scale-95"
      title={finalTooltip}
    >
      <Icon className={`w-3.5 h-3.5 ${color} drop-shadow-sm`} />
    </span>
  );
};
