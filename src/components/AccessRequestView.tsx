
import React from 'react';
import { UserX, CheckCircle2, RefreshCw, Send, LogOut } from 'lucide-react';
import { Logo } from './Logo';

interface AccessRequestViewProps {
  user: any;
  isRequestSubmitted: boolean;
  isRequestingAccess: boolean;
  requestName: string;
  setRequestName: (name: string) => void;
  handleRequestAccess: (e: React.FormEvent) => void;
  handleLogout: () => void;
}

export const AccessRequestView: React.FC<AccessRequestViewProps> = ({
  user,
  isRequestSubmitted,
  isRequestingAccess,
  requestName,
  setRequestName,
  handleRequestAccess,
  handleLogout
}) => {
  const userEmail = user?.email || '';
  return (
    <div className="min-h-screen bg-brand-secondary flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-brand-secondary/50 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-brand-primary/40 text-center space-y-8 animate-in fade-in zoom-in duration-700">
        <Logo size="lg" className="mx-auto shadow-2xl shadow-brand-primary/20" />
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Perfil não encontrado</h1>
          <p className="text-xs font-bold text-brand-primary uppercase tracking-[0.3em]">{userEmail}</p>
        </div>

        {isRequestSubmitted ? (
          <div className="bg-brand-primary/10 p-6 rounded-3xl border border-brand-primary/40 space-y-4">
            <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center mx-auto text-brand-secondary">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black text-brand-primary uppercase">Solicitação Enviada!</p>
              <p className="text-xs text-white/60 font-medium">Aguarde a aprovação do administrador para acessar o sistema.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-white/60 leading-relaxed">
              Seu e-mail não está vinculado a nenhum sócio cadastrado. Se você é sócio, preencha os dados abaixo para solicitar acesso ao administrador.
            </p>

            <form onSubmit={handleRequestAccess} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-4">Nome Completo</label>
                <input 
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  placeholder="Como você é conhecido no clube?"
                  className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-white/20"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={isRequestingAccess}
                className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl shadow-brand-primary/10 disabled:opacity-50 group"
              >
                {isRequestingAccess ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    Solicitar Acesso
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <button 
          onClick={handleLogout}
          className="text-xs font-black text-white/40 uppercase tracking-widest hover:text-brand-primary transition-colors flex items-center gap-2 mx-auto"
        >
          <LogOut className="w-4 h-4" />
          Sair e tentar outro e-mail
        </button>
      </div>
    </div>
  );
};
