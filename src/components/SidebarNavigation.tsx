import React from 'react';
import { motion } from 'motion/react';
import { Logo } from './Logo';
import { LogOut } from 'lucide-react';
import { Player } from '../../types';
import { PlayerAvatar } from './PlayerAvatar';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface SidebarNavigationProps {
  navItems: NavItem[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  currentPlayer: Player | null;
  isAdmin: boolean;
  handleLogout: () => void;
  isLoggingOut: boolean;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  navItems,
  activeTab,
  setActiveTab,
  currentPlayer,
  isAdmin,
  handleLogout,
  isLoggingOut
}) => {
  return (
    <motion.aside
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-64 bg-black/95 backdrop-blur-xl border-r border-white/10 z-40 select-none"
    >
      {/* Header / Logo */}
      <div className="p-5 border-b border-white/10 flex items-center gap-3">
        <Logo size="sm" />
        <div className="flex flex-col">
          <span className="font-black text-brand-primary tracking-wider uppercase text-base leading-none">
            Guerreiros
          </span>
          <span className="text-[9px] text-zinc-300 font-bold tracking-widest uppercase mt-1">
            Volleyball Club
          </span>
        </div>
      </div>

      {/* User Profile Card */}
      {currentPlayer && (
        <motion.div
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="p-3.5 mx-3 my-3 bg-zinc-900/90 border border-white/10 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-black/40"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <PlayerAvatar player={currentPlayer} size="sm" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-black text-zinc-100 truncate uppercase tracking-tight">
                {currentPlayer.name}
              </span>
              <span className="text-[10px] text-brand-primary font-extrabold uppercase tracking-widest">
                {isAdmin ? '🛡️ Admin' : '🏐 Jogador'}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto no-scrollbar">
        <div className="px-3 pb-2 pt-1 text-[10px] font-black text-white/70 uppercase tracking-widest">
          Navegação
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors group ${
                isActive ? 'text-black' : 'text-white hover:text-brand-primary'
              }`}
            >
              {/* Sliding Active Pill Background Animation */}
              {isActive && (
                <motion.div
                  layoutId="activeSidebarTabPill"
                  className="absolute inset-0 bg-brand-primary rounded-xl shadow-lg shadow-brand-primary/25"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              {/* Content layer above the animated background */}
              <div className="relative z-10 flex items-center gap-3 min-w-0">
                <motion.div
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-black' : 'text-white/90 group-hover:text-brand-primary transition-colors'}`} />
                </motion.div>
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <motion.span
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  className={`relative z-10 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-black text-brand-primary' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40'
                  }`}
                >
                  {item.badge}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / Logout Button */}
      <div className="p-3 border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-white hover:text-rose-400 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          <span>{isLoggingOut ? 'Saindo...' : 'Sair da Conta'}</span>
        </motion.button>
      </div>
    </motion.aside>
  );
};
