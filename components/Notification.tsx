import React, { useEffect } from 'react';
import { useStore } from '../store';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Notification: React.FC = () => {
  const { notification, hideNotification } = useStore();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        hideNotification();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, hideNotification]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[100]"
        >
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-4 ${
            notification.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
            notification.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-800' :
            'bg-indigo-50 border-indigo-100 text-indigo-800'
          }`}>
            <div className="shrink-0 mt-0.5">
              {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
              {notification.type === 'info' && <Info className="w-5 h-5 text-indigo-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold leading-tight">{notification.message}</p>
            </div>
            <button 
              onClick={hideNotification}
              className="shrink-0 p-1 hover:bg-black/5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 opacity-50" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
