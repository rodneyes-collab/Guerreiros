
import React from 'react';
import { Trophy, LogIn, Mail, RefreshCw, Send, Swords, TrendingUp, ShieldCheck } from 'lucide-react';

interface LoginViewProps {
  handleLogin: () => void;
  handleMagicLink: (e: React.FormEvent) => void;
  magicLinkEmail: string;
  setMagicLinkEmail: (email: string) => void;
  isSendingMagicLink: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  handleLogin,
  handleMagicLink,
  magicLinkEmail,
  setMagicLinkEmail,
  isSendingMagicLink
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-emerald-200/50 p-8 md:p-12 border border-slate-100 text-center space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="mx-auto w-24 h-24 bg-emerald-600 rounded-[2rem] shadow-xl shadow-emerald-200 flex items-center justify-center transform -rotate-6 hover:rotate-0 transition-transform duration-500">
          <Trophy className="w-12 h-12 text-white" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Guerreiros</h1>
          <p className="text-sm font-bold text-emerald-600 uppercase tracking-[0.3em]">Vôlei de Elite</p>
        </div>

        <div className="space-y-4 text-slate-500">
          <p className="text-lg font-medium leading-relaxed">
            Bem-vindo ao sistema oficial de gestão do <span className="text-slate-900 font-bold">Guerreiros V.C.</span>
          </p>
          <p className="text-sm">
            Faça login para marcar presença, acompanhar seu ranking e participar das partidas.
          </p>
        </div>

        <div className="space-y-6">
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Entrar com Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-black tracking-widest">
              <span className="bg-white px-4 text-slate-300">Acesso para Sócios</span>
            </div>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-3">
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
              <input 
                type="email"
                placeholder="Seu e-mail cadastrado"
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={isSendingMagicLink}
              className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isSendingMagicLink ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  Entrar como Sócio
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest px-4 leading-relaxed mt-2">
              O seu e-mail deve estar cadastrado na base de sócios pelo administrador.
            </p>
          </form>
        </div>

        <div className="pt-4 flex items-center justify-center gap-6 opacity-40">
          <div className="flex flex-col items-center gap-1">
            <Swords className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest">Partidas</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TrendingUp className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest">Ranking</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest">Seguro</span>
          </div>
        </div>
      </div>
      
      <p className="mt-8 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        Desenvolvido para atletas de alto rendimento
      </p>
    </div>
  );
};
