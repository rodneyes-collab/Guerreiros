import React from 'react';
import { useStore } from '../store';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ConfirmModal: React.FC = () => {
  const { confirmModal, hideConfirmModal } = useStore();

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
          className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
        >
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-brand-light rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-brand-primary" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-brand-secondary uppercase tracking-tight">
                {confirmModal.title}
              </h3>
              <p className="text-brand-accent font-medium leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  hideConfirmModal();
                }}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-xl shadow-rose-100 transition-all uppercase tracking-widest text-xs"
              >
                Confirmar Ação
              </button>
              <button
                onClick={hideConfirmModal}
                className="w-full py-4 bg-brand-light hover:bg-brand-accent/10 text-brand-accent font-black rounded-2xl transition-all uppercase tracking-widest text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
          
          <button 
            onClick={hideConfirmModal}
            className="absolute top-6 right-6 p-2 hover:bg-brand-light rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-brand-accent" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
