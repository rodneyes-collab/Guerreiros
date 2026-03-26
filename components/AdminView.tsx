import React from 'react';
import { useStore } from '../store';
import { 
  Settings, 
  Database, 
  Shield, 
  RefreshCw,
  Trash2,
  Download,
  Upload,
  UserCheck,
  X,
  Check,
  Link as LinkIcon,
  Clock,
  UserPlus,
  MessageSquare,
  QrCode,
  Zap,
  Send,
  Users as UsersIcon
} from 'lucide-react';
import { db, doc, updateDoc, setDoc } from '../firebase';
import { Player } from '../types';

interface AdminViewProps {
  resetDailyStats: () => void;
  resetElo: () => void;
  triggerSync: () => void;
  recalculateStats: () => void;
  clearAllHistory: () => void;
  clearMatchesOnly: () => void;
  clearAllDatabase: () => void;
  pendingRequests: any[];
  onApproveRequest: (req: any) => void;
  onRejectRequest: (reqId: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  resetDailyStats,
  resetElo,
  triggerSync,
  recalculateStats,
  clearAllHistory,
  clearMatchesOnly,
  clearAllDatabase,
  pendingRequests,
  onApproveRequest,
  onRejectRequest
}) => {
  const { userRole, players, matches, payments, systemMetadata, setSystemMetadata, showNotification, usageStats } = useStore();

  const handleCopyInviteLink = (player: Player) => {
    const inviteUrl = `${window.location.origin}?invite_player_id=${player.id}`;
    navigator.clipboard.writeText(inviteUrl);
    showNotification(`Link de convite para ${player.name} copiado!`, "success");
  };

  if (userRole !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-rose-50 rounded-full text-rose-600">
          <Shield className="w-16 h-16" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Acesso Restrito</h2>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Esta área é exclusiva para administradores</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Painel de Controle</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Configurações avançadas do sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {pendingRequests.length > 0 && (
            <section className="bg-indigo-600 p-10 rounded-[3rem] shadow-xl shadow-indigo-100 space-y-8 animate-in slide-in-from-top duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">Solicitações Pendentes</h3>
                    <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Novos usuários aguardando aprovação</p>
                  </div>
                </div>
                <span className="bg-white text-indigo-600 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                  {pendingRequests.length}
                </span>
              </div>

              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-white/10 backdrop-blur-md rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10">
                    <div className="flex items-center gap-4 text-white">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-tight">{req.name}</p>
                        <p className="text-xs font-medium text-indigo-100">{req.email}</p>
                        {req.phone && <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">{req.phone}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => onRejectRequest(req.id)}
                        className="flex-1 md:flex-none p-4 bg-rose-500/20 text-rose-100 hover:bg-rose-500/40 rounded-2xl transition-all"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => onApproveRequest(req)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-lg"
                      >
                        <Check className="w-5 h-5" /> Aprovar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-slate-900">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <LinkIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Links de Convite</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vincule sócios manualmente</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {players.filter(p => !p.uid).map(player => (
                <div key={player.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:border-indigo-200 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{player.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aguardando Vínculo</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleCopyInviteLink(player)}
                    className="p-3 bg-white text-indigo-600 rounded-xl shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:text-white"
                    title="Copiar Link de Convite"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {players.filter(p => !p.uid).length === 0 && (
                <div className="col-span-full py-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Todos os sócios estão vinculados!</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Manutenção de Dados</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button 
                onClick={resetDailyStats}
                className="flex flex-col items-start p-8 bg-amber-50 border border-amber-100 rounded-3xl hover:bg-amber-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-amber-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-amber-900 uppercase text-sm tracking-widest mb-2">Resetar Estatísticas Diárias</h4>
                <p className="text-amber-700/70 text-xs font-medium leading-relaxed">Zera as vitórias, derrotas e partidas jogadas hoje de todos os sócios.</p>
              </button>

              <button 
                onClick={triggerSync}
                className="flex flex-col items-start p-8 bg-indigo-50 border border-indigo-100 rounded-3xl hover:bg-indigo-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-indigo-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-indigo-900 uppercase text-sm tracking-widest mb-2">Forçar Sincronização</h4>
                <p className="text-indigo-700/70 text-xs font-medium leading-relaxed">Sincroniza manualmente todos os dados locais com o banco de dados na nuvem.</p>
              </button>

              <button 
                onClick={recalculateStats}
                className="flex flex-col items-start p-8 bg-emerald-50 border border-emerald-100 rounded-3xl hover:bg-emerald-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-emerald-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-emerald-900 uppercase text-sm tracking-widest mb-2">Recalcular Estatísticas</h4>
                <p className="text-emerald-700/70 text-xs font-medium leading-relaxed">Reconstrói as sinergias e rivalidades a partir de todo o histórico de partidas.</p>
              </button>

              <button 
                onClick={clearMatchesOnly}
                className="flex flex-col items-start p-8 bg-rose-50 border border-rose-100 rounded-3xl hover:bg-rose-100 transition-all group text-left"
              >
                <Trash2 className="w-8 h-8 text-rose-600 mb-4 group-hover:scale-110 transition-transform duration-500" />
                <h4 className="font-black text-rose-900 uppercase text-sm tracking-widest mb-2">Zerar Histórico de Partidas</h4>
                <p className="text-rose-700/70 text-xs font-medium leading-relaxed">Exclui TODAS as partidas registradas. As estatísticas dos sócios permanecem intactas.</p>
              </button>

              <button 
                onClick={resetElo}
                className="flex flex-col items-start p-8 bg-rose-50 border border-rose-100 rounded-3xl hover:bg-rose-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-rose-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-rose-900 uppercase text-sm tracking-widest mb-2">Resetar ELO de Todos</h4>
                <p className="text-rose-700/70 text-xs font-medium leading-relaxed">Reseta o ELO de todos os sócios para 1200 (valor inicial).</p>
              </button>
            </div>
          </section>

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Settings className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Exportação & Backup</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left">
                <Download className="w-6 h-6 text-slate-600" />
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Exportar CSV</h4>
                  <p className="text-slate-500 text-[10px] font-medium">Baixar lista de sócios e ELO</p>
                </div>
              </button>
              <button className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left">
                <Upload className="w-6 h-6 text-slate-600" />
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Importar Dados</h4>
                  <p className="text-slate-500 text-[10px] font-medium">Carregar sócios via arquivo</p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-8">
            <div className="flex items-center gap-4">
              <Zap className="w-6 h-6 text-amber-400" />
              <h3 className="text-xl font-black uppercase tracking-tight">Consumo Firestore</h3>
            </div>
            <div className="space-y-6">
              {[
                { label: "Leituras Estimadas", value: usageStats.reads, max: 50000 },
                { label: "Escritas Estimadas", value: usageStats.writes, max: 20000 },
              ].map((stat, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                    <p className="text-lg font-black font-mono">{stat.value} / {stat.max}</p>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        (stat.value / stat.max) > 0.8 ? 'bg-rose-500' : (stat.value / stat.max) > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (stat.value / (stat.max || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                * Valores baseados no uso da sessão e sincronizados entre administradores. Limites diários do plano gratuito.
              </p>
            </div>
          </section>

          <section className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-8">
            <h3 className="text-xl font-black uppercase tracking-tight">Status do Sistema</h3>
            <div className="space-y-6">
              {[
                { label: "Total de Sócios", value: players.length },
                { label: "Partidas Registradas", value: matches.length },
                { label: "Lançamentos Financeiros", value: payments.length },
                { label: "Versão do App", value: "2.5.0" }
              ].map((stat, i) => (
                <div key={i} className="flex justify-between items-end border-b border-white/10 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-xl font-black font-mono">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-rose-50 p-10 rounded-[3rem] border border-rose-100 space-y-6">
            <div className="flex items-center gap-4 text-rose-600">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-black uppercase tracking-tight">Zona de Perigo</h3>
            </div>
            <p className="text-rose-700/70 text-xs font-bold leading-relaxed">
              Ações nesta área são irreversíveis. Tenha cautela ao prosseguir.
            </p>
            <button 
              onClick={clearAllHistory}
              className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
            >
              Apagar Todo o Histórico
            </button>

            <button 
              onClick={clearAllDatabase}
              className="w-full py-4 bg-white text-rose-600 border-2 border-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-50 transition-all"
            >
              Limpar Todo o Banco (Nuclear)
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
