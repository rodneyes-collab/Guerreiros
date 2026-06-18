import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface HelpTooltipProps {
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ 
  title, 
  content, 
  position = 'top' 
}) => {
  return (
    <Tooltip content={content} title={title} position={position}>
      <div 
        className="text-white/40 hover:text-brand-primary transition-colors p-1.5 ml-1.5 rounded-full hover:bg-white/5 cursor-help inline-flex items-center justify-center select-none"
      >
        <Info className="w-4 h-4 sm:w-[1.125rem] sm:h-[1.125rem]" />
      </div>
    </Tooltip>
  );
};
