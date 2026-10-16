import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, Check } from 'lucide-react';

interface Props {
  needRefresh: boolean;
  updateServiceWorker: () => void;
}

export const UpdateNotificationToast: React.FC<Props> = ({ needRefresh, updateServiceWorker }) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleReload = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await updateServiceWorker();
    } catch (e) {
      console.error('Error applying SW update:', e);
      window.location.reload();
    }
  }, [isUpdating, updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[100]"
      >
        <div className="p-4 rounded-2xl shadow-2xl border bg-black/95 backdrop-blur-xl border-brand-primary/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0 p-2 rounded-full bg-brand-primary/20 text-brand-primary">
              <Sparkles className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-tight">Nova versão disponível!</p>
              <p className="text-xs text-white/70">Toque para atualizar o aplicativo.</p>
            </div>
          </div>
          <button
            onClick={handleReload}
            disabled={isUpdating}
            className="px-4 py-2 bg-brand-primary text-black hover:bg-brand-primary/90 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Atualizando</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Atualizar</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
