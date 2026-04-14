import React, { useState } from 'react';
import { Bell, X, Check, Trash2 } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { motion, AnimatePresence } from 'motion/react';

export const NotificationCenter: React.FC = () => {
  const { notifications, markAsRead, deleteNotification, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white/5 text-white/80 hover:bg-brand-primary/20 hover:text-brand-primary border border-white/10 hover:border-brand-primary/50 transition-all"
      >
        <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-full text-[10px] sm:text-xs font-bold flex items-center justify-center text-white border-2 border-brand-light">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-brand-light border border-brand-primary/20 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/50">
                <h3 className="font-black text-white uppercase tracking-widest text-sm">Notificações</h3>
                {notifications.length > 0 && (
                  <button 
                    onClick={clearAll}
                    className="text-[10px] text-white/40 hover:text-red-400 uppercase tracking-widest flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar
                  </button>
                )}
              </div>
              
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-white/40 text-sm font-medium">
                    Nenhuma notificação no momento.
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`p-4 border-b border-white/5 relative group transition-colors ${notif.read ? 'bg-transparent' : 'bg-brand-primary/5'}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1" onClick={() => !notif.read && markAsRead(notif.id)}>
                          <h4 className={`text-sm font-bold ${notif.read ? 'text-white/70' : 'text-brand-primary'}`}>
                            {notif.title}
                          </h4>
                          <p className="text-xs text-white/60 mt-1">{notif.message}</p>
                          <span className="text-[10px] text-white/30 mt-2 block">
                            {new Date(notif.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!notif.read && (
                            <button onClick={() => markAsRead(notif.id)} className="text-brand-primary hover:text-white" title="Marcar como lida">
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => deleteNotification(notif.id)} className="text-red-400 hover:text-red-300" title="Apagar">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
