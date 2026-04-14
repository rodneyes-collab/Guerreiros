import React from 'react';
import { Player } from '../../types';
import { Cake, PartyPopper } from 'lucide-react';
import { motion } from 'motion/react';

interface BirthdayBannerProps {
  birthdays: Player[];
}

export const BirthdayBanner: React.FC<BirthdayBannerProps> = ({ birthdays }) => {
  if (birthdays.length === 0) return null;

  return (
    <motion.div 
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      className="bg-brand-primary overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-4 text-black">
        <PartyPopper className="w-5 h-5 animate-bounce" />
        <p className="text-sm font-black uppercase tracking-widest text-center">
          {birthdays.length === 1 
            ? `Hoje o dia é de festa! Parabéns, Guerreiro ${birthdays[0].name}! 🎂`
            : `Hoje temos festa em dose dupla! Parabéns aos Guerreiros: ${birthdays.map(p => p.name).join(', ')}! 🎂`
          }
        </p>
        <Cake className="w-5 h-5 animate-bounce" />
      </div>
    </motion.div>
  );
};
