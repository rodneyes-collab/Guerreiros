import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface HelpTooltipProps {
  title: string;
  content: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-flex items-center ml-2" ref={tooltipRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="text-white/40 hover:text-brand-primary transition-colors p-1 rounded-full hover:bg-white/5"
        title="Como funciona?"
      >
        <Info className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute z-50 right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-64 sm:w-72 bg-gray-900 border border-brand-primary/30 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="p-3 border-b border-brand-primary/40 bg-black/50 flex justify-between items-center">
              <h4 className="text-brand-primary font-bold text-xs uppercase tracking-wider">{title}</h4>
              <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-sm text-white/80 leading-relaxed font-normal normal-case tracking-normal">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
