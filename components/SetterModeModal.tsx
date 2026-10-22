import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player } from '../types';

interface SetterModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  playersToUse: Player[];
  onSelect: (choice: 'everyone' | 'temporary') => void;
}

export const SetterModeModal: React.FC<SetterModeModalProps> = ({
  isOpen,
  onClose,
  playersToUse,
  onSelect,
}) => {
  if (!isOpen) return null;

  const numOfficialSetters = playersToUse.filter(p => p.isOfficialSetter).length;
  const numLinePlayers = playersToUse.filter(p => !p.isOfficialSetter).length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-black rounded-[2.5rem] shadow-2xl overflow-hidden border border-brand-primary/40 p-1"
        >
          {/* Top colored accent line */}
          <div className="h-2 w-full bg-brand-primary" />
          
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto border border-brand-primary/40 animate-pulse">
              <Sparkles className="w-8 h-8 text-brand-primary" />
            </div>
            
            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight leading-tight">
                Escalação Excepcional
              </h3>
              <p className="text-white/60 font-bold uppercase text-[11px] sm:text-xs tracking-widest bg-white/5 py-2 px-4 rounded-full border border-white/5 inline-block">
                Presentes: {numOfficialSetters} Levantador{numOfficialSetters !== 1 ? 'es' : ''} • {numLinePlayers} Linha
              </p>
              <p className="text-white/70 text-sm sm:text-base font-medium leading-relaxed max-w-md mx-auto">
                Não há levantadores oficiais suficientes para as duas equipes. Como deseja definir a formação da quadra?
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2">
              {/* Opção 1: Todo mundo levantando */}
              <button
                type="button"
                onClick={() => {
                  onSelect('everyone');
                  onClose();
                }}
                className="group relative flex flex-col items-center justify-center p-5 bg-brand-primary text-black hover:bg-brand-primary/90 rounded-2xl shadow-xl transition-all text-center focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <span className="font-black uppercase tracking-widest text-xs sm:text-sm">
                  1. Jogar Todo Mundo Levantando
                </span>
                <span className="text-[10px] font-bold text-black/75 uppercase tracking-wider mt-1 max-w-sm">
                  Times formados por 6 jogadores de linha em rodízio geral. Nenhum levantador fixo designado.
                </span>
              </button>

              {/* Opção 2: Levantador temporário */}
              <button
                type="button"
                onClick={() => {
                  onSelect('temporary');
                  onClose();
                }}
                className="group relative flex flex-col items-center justify-center p-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all text-center border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <span className="font-black uppercase tracking-widest text-xs sm:text-sm text-brand-primary group-hover:text-white transition-colors">
                  2. Escolher Levantador Temporário
                </span>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mt-1 max-w-sm">
                  O sistema selecionará os jogadores mais técnicos presentes para atuar como levantador fixo na partida.
                </span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors py-2 px-4"
              >
                Cancelar Geração
              </button>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/40" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
