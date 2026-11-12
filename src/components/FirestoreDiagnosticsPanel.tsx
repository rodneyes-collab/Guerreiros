import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Zap, Trash2, AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Database } from 'lucide-react';
import { firestoreDiagnosticsService, PendingFirestoreOperation } from '../services/firestoreDiagnosticsService';
import { useStore } from '../../store';

export const FirestoreDiagnosticsPanel: React.FC = () => {
  const [ops, setOps] = useState<PendingFirestoreOperation[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ intentionsCount: number; attendanceCount: number } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const showNotification = useStore(state => state.showNotification);

  const loadOps = () => {
    setOps(firestoreDiagnosticsService.getFailedOperations());
  };

  useEffect(() => {
    loadOps();
    const interval = setInterval(loadOps, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (opId: string) => {
    setRetryingId(opId);
    try {
      const success = await firestoreDiagnosticsService.retryOperation(opId);
      if (success) {
        showNotification('Operação reenviada e sincronizada com sucesso!', 'success');
      } else {
        showNotification('Falha ao reenviar operação. Verifique a conexão.', 'error');
      }
      loadOps();
    } catch (e: any) {
      showNotification(`Erro ao reenviar: ${e?.message || e}`, 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleHardReset = async () => {
    if (!window.confirm('Deseja executar o Hard Reset de Cache para "intentions" e "attendance"? O app vai limpar o cache local e buscar dados 100% frescos da nuvem.')) {
      return;
    }
    setIsResetting(true);
    setResetResult(null);
    try {
      const res = await firestoreDiagnosticsService.hardResetIntentionsAndAttendance();
      setResetResult(res);
      showNotification(`Hard Reset concluído! Intenções: ${res.intentionsCount}, Presença: ${res.attendanceCount} carregadas direto da nuvem.`, 'success');
    } catch (e: any) {
      showNotification(`Erro no Hard Reset: ${e?.message || e}`, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h4 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-primary" />
            Painel de Operações Pendentes & Hard Reset de Cache
          </h4>
          <p className="text-xs text-white/40 mt-0.5">
            Diagnostique falhas de sincronismo, reenvie operações pendentes por ID e force o recarregamento direto do servidor (bypass cache).
          </p>
        </div>

        <button
          onClick={handleHardReset}
          disabled={isResetting}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-black rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Executando Hard Reset...' : 'Hard Reset (Intentions & Attendance)'}
        </button>
      </div>

      {resetResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Hard Reset executado com sucesso! Servidor reportou <strong>{resetResult.intentionsCount} intenção(ões)</strong> e <strong>{resetResult.attendanceCount} registro(s) de presença</strong> no dia de hoje.</span>
          </div>
          <button onClick={() => setResetResult(null)} className="text-white/40 hover:text-white">✕</button>
        </div>
      )}

      {/* Operações Pendentes / Falhas */}
      <div className="space-y-3">
        <h5 className="text-xs font-black uppercase tracking-wider text-white/70 flex items-center gap-2">
          <Database className="w-4 h-4 text-brand-primary" />
          Log de Operações com Falha / Pendentes ({ops.length})
        </h5>

        <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
                <th className="py-3 px-4">ID / Horário</th>
                <th className="py-3 px-4">Caminho (Path)</th>
                <th className="py-3 px-4">Erro / Detalhes</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {ops.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-white/40 italic">
                    Nenhuma operação pendente ou com falha registrada recentemente. O sincronismo está fluindo normalmente.
                  </td>
                </tr>
              ) : (
                ops.map(o => (
                  <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      <div className="text-[11px] text-brand-primary">{o.id}</div>
                      <div className="text-[10px] text-white/40">{new Date(o.timestamp).toLocaleTimeString('pt-BR')}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-white/80">
                      {o.path}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-rose-300 max-w-xs truncate" title={o.error}>
                      {o.error}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRetry(o.id)}
                        disabled={retryingId === o.id}
                        className="px-3 py-1.5 bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-primary border border-brand-primary/40 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1 ml-auto"
                      >
                        <RefreshCw className={`w-3 h-3 ${retryingId === o.id ? 'animate-spin' : ''}`} />
                        {retryingId === o.id ? 'Reenviando...' : 'Reenviar Manual'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
