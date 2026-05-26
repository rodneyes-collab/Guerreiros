import React from 'react';
import { Shield, AlertTriangle, Flame, AlertCircle } from 'lucide-react';

interface EvasionIconProps {
  level?: 'low' | 'medium' | 'high' | 'critical';
  customLabel?: string;
}

export const EvasionIcon: React.FC<EvasionIconProps> = ({ level, customLabel }) => {
  if (!level) return null;
  const [isOpen, setIsOpen] = React.useState(false);

  const config = {
    low: { icon: Shield, color: 'text-emerald-500', label: 'Risco Leve' },
    medium: { icon: AlertTriangle, color: 'text-amber-500', label: 'Risco Baixo' },
    high: { icon: Flame, color: 'text-orange-500', label: 'Risco Médio' },
    critical: { icon: AlertCircle, color: 'text-rose-500', label: 'Risco Alto' },
  };

  const { icon: Icon, color, label } = config[level];
  const finalLabel = customLabel || label;

  return (
    <span 
      className="inline-flex items-center gap-1 relative cursor-pointer"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
      }}
    >
      <Icon className={`w-4 h-4 ${color}`} />
      {isOpen && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap z-50 animate-in fade-in zoom-in-95">
          {finalLabel}
        </span>
      )}
    </span>
  );
};
