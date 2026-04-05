import React from 'react';
import { useStore } from '../store';
import { 
  Settings, 
  Database, 
  Shield, 
  Trophy,
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
  Users as UsersIcon,
  Search,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { db, doc, updateDoc, setDoc } from '../firebase';
import { Player } from '../types';
import Markdown from 'react-markdown';
import { Logo } from '../src/components/Logo';

interface AdminViewProps {
  resetDailyStats: () => void;
  resetElo: () => void;
  triggerSync: () => void;
  recalculateStats: () => void;
  recalculateDailyStats: () => void;
  repairDatabase: () => void;
  initializeEloHistory: () => void;
  updateQuotaSettings: (totalQuota: number) => void;
  createDataSnapshot: (label?: string) => void;
  clearAllHistory: () => void;
  clearMatchesOnly: () => void;
  clearAllDatabase: () => void;
  pendingRequests: any[];
  onApproveRequest: (req: any) => void;
  onRejectRequest: (reqId: string) => void;
  handleScanAnomalies: () => void;
  fixDatabaseAnomalies: () => void;
  deleteTournament: (id: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  resetDailyStats,
  resetElo,
  triggerSync,
  recalculateStats,
  recalculateDailyStats,
  repairDatabase,
  initializeEloHistory,
  updateQuotaSettings,
  createDataSnapshot,
  clearAllHistory,
  clearMatchesOnly,
  clearAllDatabase,
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
  handleScanAnomalies,
  fixDatabaseAnomalies,
  deleteTournament,
  showConfirmModal
}) => {
  const { 
    userRole, 
    players, 
    matches, 
    payments, 
    tournaments,
    systemMetadata, 
    setSystemMetadata, 
    showNotification, 
    usageStats,
    monthlyUsageStats,
    isScanningAnomalies,
    anomalyReport,
    user
  } = useStore();

  const toggleAdmin = async (player: Player) => {
    if (player.email?.trim().toLowerCase() === 'rodneyes@gmail.com') {
      showNotification('O Administrador Master não pode ser alterado.', 'error');
      return;
    }
    
    try {
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { isAdmin: !player.isAdmin });
      
      if (player.uid) {
        const userRef = doc(db, 'users', player.uid);
        await setDoc(userRef, { role: !player.isAdmin ? 'ADMIN' : 'MEMBER' }, { merge: true });
      }
      
      showNotification(`${player.name} agora é ${!player.isAdmin ? 'Administrador' : 'Sócio'}.`, 'success');
    } catch (error) {
      console.error('Erro ao alterar privilégios:', error);
      showNotification('Erro ao alterar privilégios.', 'error');
    }
  };

  if (userRole !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-white/5 border border-white/10 rounded-full text-brand-primary">
          <Shield className="w-16 h-16" />
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h2>
        <p className="text-white/60 font-bold uppercase tracking-widest text-sm">Esta área é exclusiva para administradores</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="flex items-center gap-6">
          <Logo size="lg" className="hidden md:flex" />
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Painel de Controle</h2>
            <p className="text-sm font-bold text-white/60 uppercase tracking-widest mt-1">Sistema de administração</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {pendingRequests.length > 0 && (
            <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 shadow-sm space-y-8 animate-in slide-in-from-top duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                    <UserPlus className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">Solicitações Pendentes</h3>
                    <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Novos usuários aguardando aprovação</p>
                  </div>
                </div>
                <span className="bg-brand-primary text-brand-secondary px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                  {pendingRequests.length}
                </span>
              </div>

              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-white/5 backdrop-blur-md rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10">
                    <div className="flex items-center gap-4 text-white">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-primary">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-tight">{req.name}</p>
                        <p className="text-xs font-medium text-white/80">{req.email}</p>
                        {req.phone && <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">{req.phone}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => onRejectRequest(req.id)}
                        className="flex-1 md:flex-none p-4 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-2xl transition-all border border-rose-500/20"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => onApproveRequest(req)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-2xl font-black uppercase tracking-widest transition-all border border-emerald-500/20"
                      >
                        <Check className="w-5 h-5" /> Aprovar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 shadow-sm text-white space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -ml-32 -mb-32"></div>
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center border border-white/20">
                  <Activity className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Agente de Integridade IA</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Varrer banco de dados em busca de anomalias</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={fixDatabaseAnomalies}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all bg-brand-primary hover:bg-brand-primary/85 text-brand-secondary shadow-lg shadow-brand-primary/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Corrigir Anomalias
                </button>
                <button 
                  onClick={handleScanAnomalies}
                  disabled={isScanningAnomalies}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                    isScanningAnomalies 
                      ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                  }`}
                >
                  {isScanningAnomalies ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Escaneando...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Iniciar Varredura
                    </>
                  )}
                </button>
              </div>
            </div>

            {anomalyReport && (
              <div className="relative bg-white/5 backdrop-blur border border-white/10 rounded-[2rem] p-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2 mb-6 text-brand-primary">
                  <Shield className="w-5 h-5" />
                  <h4 className="font-black uppercase tracking-widest text-sm">Relatório de Integridade</h4>
                </div>
                <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-headings:text-white prose-strong:text-brand-primary prose-ul:text-slate-300">
                  <Markdown>{anomalyReport}</Markdown>
                </div>
              </div>
            )}

            {!anomalyReport && !isScanningAnomalies && (
              <div className="relative flex items-center gap-4 p-6 bg-white/5 rounded-2xl border border-white/5 italic text-slate-400 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p>O agente de IA analisará ELOs, histórico de partidas e metadados para garantir que não existam inconsistências que possam comprometer o sistema.</p>
              </div>
            )}
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 space-y-8">
            <div className="flex items-center gap-4 text-white">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <Database className="w-6 h-6 text-brand-primary" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Manutenção de Dados</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button 
                onClick={recalculateDailyStats}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-brand-primary mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Recuperar Estatísticas de Hoje</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Recalcula as vitórias e derrotas de hoje a partir do histórico de partidas.</p>
                </div>
              </button>

              <button 
                onClick={resetDailyStats}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-brand-primary mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Finalizar Dia de Jogos</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Zera as estatísticas diárias e arquiva as partidas de hoje para iniciar uma nova sessão.</p>
                </div>
              </button>

              <button 
                onClick={repairDatabase}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <Database className="w-8 h-8 text-brand-primary mb-4 group-hover:scale-110 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Reparar Banco de Dados</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Corrige inconsistências, remove sócios inválidos e inicializa históricos.</p>
                </div>
              </button>

              <button 
                onClick={initializeEloHistory}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <Clock className="w-8 h-8 text-brand-primary mb-4 group-hover:rotate-12 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Inicializar Histórico ELO</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Cria o primeiro ponto no gráfico de ELO para todos os sócios.</p>
                </div>
              </button>

              <button 
                onClick={triggerSync}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-brand-primary mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Forçar Sincronização</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Sincroniza manualmente todos os dados locais com o banco de dados na nuvem.</p>
                </div>
              </button>

              <button 
                onClick={recalculateStats}
                className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-brand-primary mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-white uppercase text-sm tracking-widest mb-3">Recalcular Estatísticas</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-brand-primary" />
                  <p className="italic text-white/60 text-[11px]">Reconstrói as sinergias e rivalidades a partir de todo o histórico de partidas.</p>
                </div>
              </button>

              <button 
                onClick={clearMatchesOnly}
                className="flex flex-col items-start p-8 bg-rose-500/10 border border-rose-500/20 rounded-3xl hover:bg-rose-500/20 transition-all group text-left"
              >
                <Trash2 className="w-8 h-8 text-rose-500 mb-4 group-hover:scale-110 transition-transform duration-500" />
                <h4 className="font-black text-rose-500 uppercase text-sm tracking-widest mb-3">Zerar Histórico de Partidas</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                  <p className="italic text-rose-500/80 text-[11px]">Exclui TODAS as partidas registradas e zera os gráficos de evolução.</p>
                </div>
              </button>

              <button 
                onClick={resetElo}
                className="flex flex-col items-start p-8 bg-rose-500/10 border border-rose-500/20 rounded-3xl hover:bg-rose-500/20 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-rose-500 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-rose-500 uppercase text-sm tracking-widest mb-3">Resetar ELO de Todos</h4>
                <div className="relative w-full flex items-center gap-3 p-4 mt-2 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                  <p className="italic text-rose-500/80 text-[11px]">Reseta o ELO de todos os sócios para 1200 e limpa o histórico de evolução.</p>
                </div>
              </button>
            </div>
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 space-y-8">
            <div className="flex items-center gap-4 text-white">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <Trophy className="w-6 h-6 text-brand-primary" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Gerenciar Torneios</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Times</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map(tournament => (
                    <tr key={tournament.id} className="bg-white/5 hover:bg-white/10 transition-all group border border-white/10">
                      <td className="px-4 py-4 rounded-l-2xl">
                        <p className="text-sm font-black text-white uppercase tracking-tight">
                          {new Date(tournament.date).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold text-white/60">{tournament.teams.length} Times</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-widest ${
                          tournament.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/20'
                        }`}>
                          {tournament.status === 'completed' ? 'Concluído' : 'Em Andamento'}
                        </span>
                      </td>
                      <td className="px-4 py-4 rounded-r-2xl text-right">
                        <button 
                          onClick={() => {
                            showConfirmModal(
                              'Excluir Torneio',
                              'Tem certeza que deseja excluir este torneio? Esta ação é irreversível.',
                              () => deleteTournament(tournament.id)
                            );
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-all"
                          title="Excluir Torneio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tournaments.length === 0 && (
                <div className="py-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Nenhum torneio registrado</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 space-y-8">
            <div className="flex items-center gap-4 text-white">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <Settings className="w-6 h-6 text-brand-primary" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Exportação & Backup</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-center gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-left">
                <Download className="w-6 h-6 text-brand-primary flex-shrink-0" />
                <div>
                  <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Exportar CSV</h4>
                  <p className="text-white/40 text-[10px] font-medium mt-1">Baixar lista de sócios e ELO</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-left">
                <Upload className="w-6 h-6 text-brand-primary flex-shrink-0" />
                <div>
                  <h4 className="font-black text-white uppercase text-[10px] tracking-widest">Importar Dados</h4>
                  <p className="text-white/40 text-[10px] font-medium mt-1">Carregar sócios via arquivo</p>
                </div>
              </div>

              <button 
                onClick={() => createDataSnapshot()}
                className="flex items-center gap-4 p-6 bg-brand-primary text-brand-secondary rounded-2xl hover:bg-brand-primary/90 transition-all text-left shadow-lg shadow-brand-primary/20 md:col-span-2"
              >
                <Shield className="w-6 h-6 flex-shrink-0" />
                <div>
                  <h4 className="font-black uppercase text-[10px] tracking-widest">Criar Snapshot</h4>
                  <p className="text-brand-secondary/80 text-[10px] font-medium mt-1">Backup manual do estado atual</p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 shadow-sm text-white space-y-8">
            <div className="flex items-center gap-4">
              <Zap className="w-6 h-6 text-brand-primary" />
              <h3 className="text-xl font-black uppercase tracking-tight">Painel de Custos e Consumo</h3>
            </div>
            
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-sm font-black uppercase tracking-widest text-brand-primary mb-4">Consumo Mensal Acumulado</h4>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-black/20 p-4 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Leituras</p>
                  <p className="text-xl font-black font-mono">{monthlyUsageStats?.reads || 0}</p>
                </div>
                <div className="bg-black/20 p-4 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Gravações</p>
                  <p className="text-xl font-black font-mono">{monthlyUsageStats?.writes || 0}</p>
                </div>
                <div className="bg-black/20 p-4 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IA (Gemini/TTS)</p>
                  <p className="text-xl font-black font-mono">{monthlyUsageStats?.aiCalls || 0}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-black uppercase tracking-widest text-brand-primary">Custo Estimado (Mês Atual)</h4>
                  <p className="text-2xl font-black text-brand-primary font-mono">
                    US$ {((((monthlyUsageStats?.reads || 0) * 0.036) / 100000) + (((monthlyUsageStats?.writes || 0) * 0.108) / 100000) + (((monthlyUsageStats?.aiCalls || 0) * 0.001))).toFixed(4)}
                  </p>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  * O Google Cloud oferece uma cota gratuita generosa. Este valor é uma estimativa de quanto custaria fora do plano gratuito.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-6">Consumo Diário (Hoje)</h4>
              <div className="space-y-6">
                {[
                  { label: "Leituras Estimadas", value: usageStats.reads, max: systemMetadata.dailyReadQuota || 50000 },
                  { label: "Escritas Estimadas", value: usageStats.writes, max: 20000 },
                  { label: "Chamadas IA (Gemini)", value: usageStats.aiCalls || 0, max: systemMetadata.dailyAICallsQuota || 100 },
                ].map((stat, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-lg font-black font-mono">{stat.value} / {stat.max}</p>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          (stat.value / stat.max) > 0.8 ? 'bg-rose-500' : (stat.value / stat.max) > 0.5 ? 'bg-brand-primary' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (stat.value / (stat.max || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
              
            <div className="pt-4 border-t border-white/10 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configurar Limite Diário IA</p>
              <div className="flex gap-2">
                {[50, 100, 200, 500].map(q => (
                  <button
                    key={q}
                    onClick={() => setSystemMetadata({ dailyAICallsQuota: q })}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${
                      (systemMetadata.dailyAICallsQuota || 100) === q
                        ? 'bg-brand-primary text-brand-secondary'
                        : 'bg-white/10 text-slate-400 hover:bg-white/20'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-500 font-medium italic">
                * O uso da IA é otimizado com cache local e prompts ultra-curtos.
              </p>
            </div>

            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
              * Valores baseados no uso da sessão e sincronizados entre administradores.
            </p>
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] text-white space-y-8 border border-white/10">
            <h3 className="text-xl font-black uppercase tracking-tight">Status do Sistema</h3>
            <div className="space-y-6">
              {[
                { label: "Total de Sócios", value: players.length },
                { label: "Partidas Registradas", value: matches.length },
                { label: "Lançamentos Financeiros", value: payments.length },
                { label: "Versão do App", value: "2.5.0" }
              ].map((stat, i) => (
                <div key={i} className="flex justify-between items-end border-b border-white/10 pb-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-xl font-black font-mono">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 text-white space-y-8">
            <div className="flex items-center gap-4">
              <Zap className="w-6 h-6 text-brand-primary" />
              <h3 className="text-xl font-black uppercase tracking-tight">Controle de Acesso</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-6 bg-white/5 p-6 rounded-2xl border border-white/10">
                <div className="text-right flex-1">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cota Diária Total</p>
                  <div className="flex items-center gap-2 mt-2">
                    <input 
                      type="number" 
                      defaultValue={systemMetadata.dailyReadQuota || 50000}
                      onBlur={(e) => updateQuotaSettings(parseInt(e.target.value))}
                      className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm font-black text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    />
                    <span className="text-[10px] text-white/40 font-bold">leituras</span>
                  </div>
                </div>
                <div className="text-right flex-1">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cota por Sócio</p>
                  <p className="text-xl font-black text-brand-primary mt-2">
                    ~{Math.floor((systemMetadata.dailyReadQuota || 50000) / (players.length || 1))} 
                    <span className="text-[10px] text-white/40"> leituras/dia</span>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                      <th className="px-4 py-2">Sócio</th>
                      <th className="px-4 py-2">Nível</th>
                      <th className="px-4 py-2">Leituras Hoje</th>
                      <th className="px-4 py-2">Status da Cota</th>
                      <th className="px-4 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rodney = players.find(p => p.email?.toLowerCase() === 'rodneyes@gmail.com');
                      const others = players
                        .filter(p => p.email?.toLowerCase() !== 'rodneyes@gmail.com' && (p.reads !== undefined || p.uid))
                        .sort((a, b) => (b.reads || 0) - (a.reads || 0));
                      
                      const list = rodney ? [rodney, ...others] : others;
                      return list.slice(0, 15).map(player => {
                        const quota = Math.floor((systemMetadata.dailyReadQuota || 50000) / (players.length || 1));
                        const usage = (player.reads || 0);
                        const percentage = Math.min(100, (usage / quota) * 100);
                        const isMaster = player.email?.toLowerCase() === 'rodneyes@gmail.com';
                        const isAdmin = player.isAdmin || isMaster;
                        
                        return (
                          <tr key={player.id} className={`bg-white/5 hover:bg-white/10 transition-all group border border-white/10 ${isMaster ? 'border-l-4 border-l-brand-primary' : ''}`}>
                            <td className="px-4 py-4 rounded-l-2xl">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${isMaster ? 'bg-brand-primary text-brand-secondary' : 'bg-white/10 text-white'}`}>
                                  {player.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-white uppercase tracking-tight">
                                    {player.name}
                                    {isMaster && (
                                      <span className="ml-2 px-1.5 py-0.5 bg-brand-primary/20 text-brand-primary text-[8px] rounded-full uppercase tracking-tighter border border-brand-primary/20">Master</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{player.email || 'Sem email'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                {isMaster ? (
                                  <span className="bg-brand-secondary text-brand-primary text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 border border-brand-primary/20">
                                    <Shield className="w-2 h-2" /> Master
                                  </span>
                                ) : isAdmin ? (
                                  <span className="bg-brand-primary/20 text-brand-primary text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 border border-brand-primary/20">
                                    <Shield className="w-2 h-2" /> Admin
                                  </span>
                                ) : (
                                  <span className="bg-white/10 text-white/60 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-white/10">
                                    Sócio
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-black font-mono text-white/60">{usage}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    percentage > 80 ? 'bg-rose-500' : percentage > 50 ? 'bg-brand-primary' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-4 rounded-r-2xl text-right">
                              {user?.email?.toLowerCase() === 'rodneyes@gmail.com' && !isMaster && (
                                <button 
                                  onClick={() => toggleAdmin(player)}
                                  className={`p-2 rounded-lg transition-all ${isAdmin ? 'text-rose-500 hover:bg-rose-500/20' : 'text-brand-primary hover:bg-brand-primary/20'}`}
                                  title={isAdmin ? "Remover Admin" : "Tornar Admin"}
                                >
                                  {isAdmin ? <Shield className="w-4 h-4" /> : <Shield className="w-4 h-4 opacity-30" />}
                                </button>
                              )}
                              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-2">
                                {player.lastReadUpdate ? new Date(player.lastReadUpdate).toLocaleDateString('pt-BR') : '--/--'}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                {players.length === 0 && (
                  <div className="py-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Nenhum dado de acesso disponível</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-brand-secondary/30 backdrop-blur-xl p-10 rounded-[3rem] border border-rose-500/20 shadow-sm space-y-6">
            <div className="flex items-center gap-4 text-rose-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-black uppercase tracking-tight">Zona de Perigo</h3>
            </div>
            <p className="text-rose-500/70 text-xs font-bold leading-relaxed">
              Ações nesta área são irreversíveis. Tenha cautela ao prosseguir.
            </p>
            <button 
              onClick={clearAllHistory}
              className="w-full py-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-500/20 transition-all"
            >
              Apagar Todo o Histórico
            </button>

            <button 
              onClick={clearAllDatabase}
              className="w-full py-4 bg-transparent text-rose-500 border border-rose-500/50 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-500/10 transition-all"
            >
              Limpar Todo o Banco (Nuclear)
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};