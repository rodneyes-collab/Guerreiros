
import React from 'react';
import { UserX, CheckCircle2, RefreshCw, Send, LogOut } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 text-center space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="mx-auto w-24 h-24 bg-rose-100 rounded-[2rem] flex items-center justify-center text-rose-600">
          <UserX className="w-12 h-12" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Perfil não encontrado</h1>
          <p className="text-xs font-bold text-rose-600 uppercase tracking-[0.3em]">{userEmail}</p>
        </div>

        {isRequestSubmitted ? (
          <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-white">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black text-emerald-900 uppercase">Solicitação Enviada!</p>
              <p className="text-xs text-emerald-600 font-medium">Aguarde a aprovação do administrador para acessar o sistema.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-slate-500 leading-relaxed">
              Seu e-mail não está vinculado a nenhum sócio cadastrado. Se você é sócio, preencha os dados abaixo para solicitar acesso.
            </p>

            <form onSubmit={handleRequestAccess} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nome Completo</label>
                <input 
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  placeholder="Como você é conhecido no clube?"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={isRequestingAccess}
                className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 group"
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
          className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-2 mx-auto"
        >
          <LogOut className="w-4 h-4" />
          Sair e tentar outro e-mail
        </button>
      </div>
    </div>
  );
};
