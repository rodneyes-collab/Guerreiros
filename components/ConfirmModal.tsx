import { useShallow } from "zustand/react/shallow";
import React from 'react';
import { useStore } from '../store';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ConfirmModal: React.FC = () => {
  const { confirmModal, hideConfirmModal } = useStore(useShallow(state => ({ confirmModal: state.confirmModal, hideConfirmModal: state.hideConfirmModal })));

  if (!confirmModal.isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={hideConfirmModal}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-brand-secondary rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/5 border-l-[8px] border-l-brand-primary"
        >
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-brand-primary/40">
              <AlertTriangle className="w-10 h-10 text-brand-primary" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                {confirmModal.title}
              </h3>
              <p className="text-white/60 font-medium leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  hideConfirmModal();
                }}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-xl shadow-rose-900/20 transition-all uppercase tracking-widest text-xs"
              >
                Confirmar Ação
              </button>
              <button
                onClick={hideConfirmModal}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 font-black rounded-2xl transition-all uppercase tracking-widest text-xs border border-brand-primary/40"
              >
                Cancelar
              </button>
            </div>
          </div>
          
          <button 
            onClick={hideConfirmModal}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/40" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
