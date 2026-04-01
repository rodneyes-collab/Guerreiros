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
    isScanningAnomalies,
    anomalyReport,
    user
  } = useStore();

  const toggleAdmin = async (player: Player) => {
    if (player.email?.toLowerCase() === 'rodneyes@gmail.com') {
      showNotification('O Administrador Master não pode ser alterado.', 'error');
      return;
    }
    
    try {
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { isAdmin: !player.isAdmin });
      
      // Se o jogador tiver um UID vinculado, atualizamos também o documento de usuário para efeito imediato
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
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Controle de Acesso</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monitoramento de leituras por sócio</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cota Diária Total</p>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      defaultValue={systemMetadata.dailyReadQuota || 50000}
                      onBlur={(e) => updateQuotaSettings(parseInt(e.target.value))}
                      className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm font-black text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 font-bold">leituras</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cota por Sócio</p>
                  <p className="text-xl font-black text-indigo-600">
                    ~{Math.floor((systemMetadata.dailyReadQuota || 50000) / (players.length || 1))} 
                    <span className="text-[10px] text-slate-400"> leituras/dia</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
                          <tr key={player.id} className={`bg-slate-50 hover:bg-slate-100 transition-all group ${isMaster ? 'border-l-4 border-indigo-600' : ''}`}>
                            <td className="px-4 py-4 rounded-l-2xl">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${isMaster ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                  {player.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                    {player.name}
                                    {isMaster && (
                                      <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] rounded-full uppercase tracking-tighter">Master</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{player.email || 'Sem email'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                {isMaster ? (
                                  <span className="bg-indigo-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                                    <Shield className="w-2 h-2" /> Master
                                  </span>
                                ) : isAdmin ? (
                                  <span className="bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                                    <Shield className="w-2 h-2" /> Admin
                                  </span>
                                ) : (
                                  <span className="bg-slate-200 text-slate-500 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                                    Sócio
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-black font-mono text-slate-700">{usage}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    percentage > 80 ? 'bg-rose-500' : percentage > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-4 rounded-r-2xl text-right">
                              {user?.email?.toLowerCase() === 'rodneyes@gmail.com' && !isMaster && (
                                <button 
                                  onClick={() => toggleAdmin(player)}
                                  className={`p-2 rounded-lg transition-all ${isAdmin ? 'text-rose-600 hover:bg-rose-50' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                  title={isAdmin ? "Remover Admin" : "Tornar Admin"}
                                >
                                  {isAdmin ? <Shield className="w-4 h-4" /> : <Shield className="w-4 h-4 opacity-30" />}
                                </button>
                              )}
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
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
                <div className="py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum dado de acesso disponível</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-gradient-to-br from-slate-900 to-indigo-950 p-10 rounded-[3rem] shadow-2xl space-y-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-32 -mb-32"></div>
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center border border-white/20">
                  <Activity className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Agente de Integridade IA</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Varrer banco de dados em busca de anomalias</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={fixDatabaseAnomalies}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  Corrigir Anomalias
                </button>
                <button 
                  onClick={handleScanAnomalies}
                  disabled={isScanningAnomalies}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                    isScanningAnomalies 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
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
                <div className="flex items-center gap-2 mb-6 text-emerald-400">
                  <Shield className="w-5 h-5" />
                  <h4 className="font-black uppercase tracking-widest text-sm">Relatório de Integridade</h4>
                </div>
                <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-headings:text-white prose-strong:text-emerald-400 prose-ul:text-slate-300">
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

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Manutenção de Dados</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button 
                onClick={recalculateDailyStats}
                className="flex flex-col items-start p-8 bg-amber-50 border border-amber-100 rounded-3xl hover:bg-amber-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-amber-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-amber-900 uppercase text-sm tracking-widest mb-2">Recuperar Estatísticas de Hoje</h4>
                <p className="text-amber-700/70 text-xs font-medium leading-relaxed">Recalcula as vitórias e derrotas de hoje a partir do histórico de partidas.</p>
              </button>

              <button 
                onClick={resetDailyStats}
                className="flex flex-col items-start p-8 bg-amber-50 border border-amber-100 rounded-3xl hover:bg-amber-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-amber-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-amber-900 uppercase text-sm tracking-widest mb-2">Finalizar Dia de Jogos</h4>
                <p className="text-amber-700/70 text-xs font-medium leading-relaxed">Zera as estatísticas diárias e arquiva as partidas de hoje para iniciar uma nova sessão.</p>
              </button>

              <button 
                onClick={repairDatabase}
                className="flex flex-col items-start p-8 bg-indigo-50 border border-indigo-100 rounded-3xl hover:bg-indigo-100 transition-all group text-left"
              >
                <Database className="w-8 h-8 text-indigo-600 mb-4 group-hover:scale-110 transition-transform duration-500" />
                <h4 className="font-black text-indigo-900 uppercase text-sm tracking-widest mb-2">Reparar Banco de Dados</h4>
                <p className="text-indigo-700/70 text-xs font-medium leading-relaxed">Corrige inconsistências, remove sócios inválidos e inicializa históricos.</p>
              </button>

              <button 
                onClick={initializeEloHistory}
                className="flex flex-col items-start p-8 bg-blue-50 border border-blue-100 rounded-3xl hover:bg-blue-100 transition-all group text-left"
              >
                <Clock className="w-8 h-8 text-blue-600 mb-4 group-hover:rotate-12 transition-transform duration-500" />
                <h4 className="font-black text-blue-900 uppercase text-sm tracking-widest mb-2">Inicializar Histórico ELO</h4>
                <p className="text-blue-700/70 text-xs font-medium leading-relaxed">Cria o primeiro ponto no gráfico de ELO para todos os sócios.</p>
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
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Gerenciar Torneios</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Times</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map(tournament => (
                    <tr key={tournament.id} className="bg-slate-50 hover:bg-slate-100 transition-all group">
                      <td className="px-4 py-4 rounded-l-2xl">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                          {new Date(tournament.date).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold text-slate-600">{tournament.teams.length} Times</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-widest ${
                          tournament.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
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
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
                <div className="py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum torneio registrado</p>
                </div>
              )}
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
              <button 
                onClick={() => createDataSnapshot()}
                className="flex items-center gap-4 p-6 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all text-left shadow-lg shadow-indigo-200"
              >
                <Shield className="w-6 h-6" />
                <div>
                  <h4 className="font-black uppercase text-[10px] tracking-widest">Criar Snapshot</h4>
                  <p className="text-indigo-100 text-[10px] font-medium">Backup manual do estado atual</p>
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
                        (stat.value / stat.max) > 0.8 ? 'bg-rose-500' : (stat.value / stat.max) > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (stat.value / (stat.max || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t border-white/10 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configurar Limite Diário IA</p>
                <div className="flex gap-2">
                  {[50, 100, 200, 500].map(q => (
                    <button
                      key={q}
                      onClick={() => setSystemMetadata({ dailyAICallsQuota: q })}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${
                        (systemMetadata.dailyAICallsQuota || 100) === q
                          ? 'bg-amber-500 text-slate-900'
                          : 'bg-white/10 text-slate-400 hover:bg-white/20'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 font-medium italic">
                  * O uso da IA é otimizado com cache local e prompts ultra-curtos para reduzir custos.
                </p>
              </div>

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
