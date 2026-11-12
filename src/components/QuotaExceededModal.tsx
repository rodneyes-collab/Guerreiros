import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HardDrive, Trash2, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { purgeFirestoreLocalStorageKeys, setFirestorePersistenceMode } from '../../firebase';

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string;
}

export const QuotaExceededModal: React.FC<QuotaExceededModalProps> = ({ isOpen, onClose, errorMessage }) => {
  const [isCleaning, setIsCleaning] = React.useState(false);

  if (!isOpen) return null;

  const handleCleanAndCompact = async () => {
    setIsCleaning(true);
    try {
      // 1. Purge localStorage Firestore target/cache keys
      const purgedCount = purgeFirestoreLocalStorageKeys();
      
      // 2. Clear browser caches if available
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }

      // 3. Switch to memory persistence mode to prevent future quota errors on mobile
      window.localStorage.setItem('guerreiros_firestore_persistence_mode', 'memory');

      alert(`Limpeza concluída! ${purgedCount} chaves de cache limpas. O app será reiniciado em modo seguro (Memória).`);
      window.location.reload();
    } catch (e) {
      console.error('Erro ao limpar cache local:', e);
      setIsCleaning(false);
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-black border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-500/20 text-white space-y-6 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-white font-sans">
                  Limite de Armazenamento Atingido
                </h3>
                <p className="text-xs text-white/50 font-medium">
                  O navegador do celular atingiu a cota máxima de dados locais (QuotaExceededError)
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          <div className="space-y-3 text-xs text-white/70 leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
            <p>
              Dispositivos móveis possuem um limite restrito de armazenamento local (LocalStorage / IndexedDB). O acúmulo de cache do Firestore gerou o erro de cota:
            </p>
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 p-2.5 rounded-xl font-mono text-[11px] text-red-300 break-all">
                {errorMessage}
              </div>
            )}
            <p className="font-semibold text-white">
              Para resolver isso instantaneamente, recomendamos limpar o cache antigo e alternar para o modo otimizado de memória.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={handleCleanAndCompact}
              disabled={isCleaning}
              className="w-full sm:flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCleaning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Limpando e Compactando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Limpar Cache & Compactar Banco
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto py-3 px-5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Ignorar por Enquanto
            </button>
          </div>

          {/* Footer note */}
          <div className="text-center text-[10px] text-white/40 font-mono">
            Instância oficial: volleyclub-manager ((default))
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
