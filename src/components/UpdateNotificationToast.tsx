import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';

interface Props {
  needRefresh: boolean;
  updateServiceWorker: () => void;
}

export const UpdateNotificationToast: React.FC<Props> = ({ needRefresh, updateServiceWorker }) => {
  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[100]"
        >
          <div className="p-4 rounded-2xl shadow-2xl border bg-brand-secondary border-brand-primary/40 flex items-center gap-4">
            <div className="shrink-0 p-2 rounded-full bg-brand-primary/10">
              <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-white uppercase tracking-tight">Nova versão disponível!</p>
              <p className="text-xs text-white/60">Recarregue para obter as últimas novidades.</p>
            </div>
            <button
              onClick={updateServiceWorker}
              className="px-4 py-2 bg-brand-primary text-black font-black uppercase tracking-tight text-[10px] rounded-xl hover:scale-105 active:scale-95 transition-all"
            >
              Recarregar Agora
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
