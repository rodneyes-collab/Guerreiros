
import React, { useState, useEffect } from 'react';
import { Trophy, LogIn, Mail, RefreshCw, Send, Swords, TrendingUp, ShieldCheck, User, X } from 'lucide-react';
import { Logo } from './Logo';

interface LoginViewProps {
  handleMagicLink: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
  magicLinkEmail: string;
  setMagicLinkEmail: (email: string) => void;
  isSendingMagicLink: boolean;
  isLoggingIn: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  handleMagicLink,
  handleGoogleLogin,
  magicLinkEmail,
  setMagicLinkEmail,
  isSendingMagicLink,
  isLoggingIn
}) => {
  const [recentLogins, setRecentLogins] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
      setRecentLogins(stored);
    } catch (e) {
      console.error('Error loading recent logins', e);
    }
  }, []);

  const removeRecent = (email: string) => {
    const updated = recentLogins.filter(e => e !== email);
    setRecentLogins(updated);
    window.localStorage.setItem('recentLogins', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10 space-y-12 animate-in fade-in zoom-in duration-1000">
        <div className="text-center space-y-6">
          <Logo size="lg" className="mx-auto transform hover:scale-110 transition-transform duration-700 drop-shadow-[0_0_30px_rgba(245,196,41,0.3)]" />
          <div className="space-y-2">
            <h1 className="text-5xl font-black text-brand-primary tracking-tighter uppercase leading-none">Guerreiros</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.4em]">Vôlei de Elite</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl shadow-black/50 p-8 md:p-10 border border-white/10 space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Acesso ao Clube</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Entre com seu e-mail de sócio</p>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] ml-2">E-mail</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-brand-primary transition-colors" />
                <input 
                  type="email"
                  placeholder="exemplo@email.com"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-white/10 rounded-2xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isSendingMagicLink || isLoggingIn}
              className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isSendingMagicLink ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  Entrar
                </>
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-transparent text-slate-400 font-black uppercase tracking-widest text-[10px]">Ou</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn || isSendingMagicLink}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-white text-brand-secondary rounded-2xl font-black uppercase tracking-widest hover:bg-slate-100 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoggingIn ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google Login
              </>
            )}
          </button>
        </div>

        <div className="flex justify-center gap-8 opacity-20">
          <Swords className="w-6 h-6 text-white" />
          <Trophy className="w-6 h-6 text-white" />
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
      </div>
      
      <p className="absolute bottom-8 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
        Guerreiros Volleyball Club © 2025
      </p>
    </div>
  );
};