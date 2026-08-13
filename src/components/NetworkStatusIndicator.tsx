import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff } from 'lucide-react';

export const NetworkStatusIndicator: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 left-4 z-[99] flex items-center gap-2 bg-black border border-red-500/50 text-red-500 px-3 py-1.5 rounded-full shadow-lg"
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">Offline</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
