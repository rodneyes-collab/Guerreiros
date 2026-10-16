import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Trophy, Users } from 'lucide-react';
import { capitalizeName } from '../utils/helpers';

interface PremiumFeedbackProps {
  isOpen: boolean;
  playerName: string;
  queuePosition: number | null;
  onClose: () => void;
  isAlreadyConfirmed?: boolean;
}

export const PremiumFeedback: React.FC<PremiumFeedbackProps> = ({ isOpen, playerName, queuePosition, onClose, isAlreadyConfirmed }) => {
  useEffect(() => {
    if (isOpen) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D4AF37', '#000000', '#FFFFFF']
      });
      
      const timer = setTimeout(onClose, 6000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-black border-2 border-brand-primary p-8 rounded-[2.5rem] text-center w-full max-w-sm shadow-[0_0_60px_rgba(212,175,55,0.2)]"
          >
            <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-brand-primary">
              <CheckCircle2 className="w-12 h-12 text-brand-primary" />
            </div>
            
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-2">
              {isAlreadyConfirmed ? "Já Está na Lista!" : "Presença Confirmada"}
            </h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">
              {isAlreadyConfirmed 
                ? `Tudo certo, ${capitalizeName(playerName.split(' ')[0])}!` 
                : `Valeu, ${capitalizeName(playerName.split(' ')[0])}!`}
            </p>

            {queuePosition !== null && (
              <div className="bg-brand-primary/10 p-4 rounded-2xl border border-brand-primary/30 mb-8">
                <div className="flex items-center justify-center gap-3 text-brand-primary">
                  <Users className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Sua Posição</span>
                </div>
                <div className="text-5xl font-black text-white mt-1">
                  #{queuePosition}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-4 bg-brand-primary text-black font-black uppercase tracking-widest rounded-xl hover:bg-brand-primary/90 transition-all"
            >
              Fechar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
