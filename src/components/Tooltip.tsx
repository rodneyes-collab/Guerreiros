import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  title?: string;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  title,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Position specific styles
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Arrow specific border styles
  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-black border-l-transparent border-r-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-black border-l-transparent border-r-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-black border-t-transparent border-b-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-black border-t-transparent border-b-transparent border-l-transparent border-4',
  };

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 w-64 p-3.5 bg-black border border-brand-primary/40 rounded-2xl shadow-2xl pointer-events-none select-none text-center ${positionClasses[position]}`}
          >
            {title && (
              <div className="text-brand-primary text-[10px] font-black uppercase tracking-wider mb-1.5 text-center border-b border-brand-primary/20 pb-1.5">
                {title}
              </div>
            )}
            <div className="text-[10px] font-bold text-white/90 normal-case tracking-normal leading-normal text-center font-sans">
              {content}
            </div>
            <div className={`absolute border-solid ${arrowClasses[position]}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
