import React from 'react';
import { PartyPopper, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeBannerProps {
  show: boolean;
  onClose: () => void;
  playerName: string;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ show, onClose, playerName }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-brand-primary overflow-hidden relative"
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-4 text-black">
            <PartyPopper className="w-5 h-5 animate-bounce" />
            <p className="text-sm font-black uppercase tracking-widest text-center">
              Bem-vindo ao time, Guerreiro {playerName}! 🏐🔥
            </p>
            <PartyPopper className="w-5 h-5 animate-bounce" />
            
            <button 
              onClick={onClose}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-black/10 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
