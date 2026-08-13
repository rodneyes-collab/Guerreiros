import React from 'react';
import { useStore } from '../store';
import { HelpCircle, X, Users, Zap, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const SetterStrategyModal: React.FC = () => {
  const { setterStrategyModal, hideSetterStrategyModal } = useStore();

  if (!setterStrategyModal.isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={hideSetterStrategyModal}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          id="setter-modal-overlay"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-black rounded-[2.5rem] shadow-2xl overflow-hidden border border-brand-primary/30 border-l-[8px] border-l-brand-primary"
          id="setter-modal-container"
        >
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-brand-primary/40" id="setter-modal-icon-container">
              <HelpCircle className="w-8 h-8 text-brand-primary" id="setter-modal-icon" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight" id="setter-modal-title">
                {setterStrategyModal.title}
              </h3>
              <p className="text-white/60 text-sm font-medium leading-relaxed" id="setter-modal-msg">
                {setterStrategyModal.message}
              </p>
            </div>

            <div className="grid gap-4 mt-2" id="setter-options-container">
              {/* Option 1: Everyone Sets */}
              <button
                onClick={() => {
                  setterStrategyModal.onChoose('EVERYONE_SETS');
                  hideSetterStrategyModal();
                }}
                className="group flex items-start gap-4 p-5 bg-white/5 hover:bg-brand-primary/10 border border-white/5 hover:border-brand-primary/40 rounded-2xl text-left transition-all duration-300"
                id="btn-option-everyone-sets"
              >
                <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/30 group-hover:bg-brand-primary group-hover:text-black transition-colors" id="icon-opt-everyone">
                  <RotateCcw className="w-5 h-5 text-brand-primary group-hover:text-black" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-black text-white uppercase tracking-wider group-hover:text-brand-primary transition-colors">Jogar todo mundo levantando</div>
                  <div className="text-xs text-white/50 leading-relaxed font-bold">O app não forçará levantadores temporários. Os 6 jogadores jogam e participam da rodagem de levantamento normalmente.</div>
                </div>
              </button>

              {/* Option 2: Temporary Setter */}
              <button
                onClick={() => {
                  setterStrategyModal.onChoose('TEMPORARY_SETTER');
                  hideSetterStrategyModal();
                }}
                className="group flex items-start gap-4 p-5 bg-white/5 hover:bg-brand-primary/10 border border-white/5 hover:border-brand-primary/40 rounded-2xl text-left transition-all duration-300"
                id="btn-option-temp-setter"
              >
                <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center border border-brand-primary/30 group-hover:bg-brand-primary group-hover:text-black transition-colors" id="icon-opt-temp">
                  <Zap className="w-5 h-5 text-brand-primary group-hover:text-black" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-black text-white uppercase tracking-wider group-hover:text-brand-primary transition-colors">Escolher levantador temporário</div>
                  <div className="text-xs text-white/50 leading-relaxed font-bold">O app escolherá e fixará automaticamente o(s) jogador(es) de linha de maior habilidade para atuar como levantador(es) para equilibrar os times.</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => {
                setterStrategyModal.onCancel();
                hideSetterStrategyModal();
              }}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-black rounded-2xl transition-all uppercase tracking-widest text-xs border border-white/10"
              id="btn-cancel-generation"
            >
              Cancelar Sorteio
            </button>
          </div>
          
          <button 
            onClick={() => {
              setterStrategyModal.onCancel();
              hideSetterStrategyModal();
            }}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-xl transition-colors"
            id="btn-close-setter-modal"
          >
            <X className="w-5 h-5 text-white/40" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
