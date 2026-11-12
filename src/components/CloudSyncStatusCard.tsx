import React, { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Database, CheckCircle2, AlertTriangle, Zap, Clock, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store';
import { formatTimeSince } from '../utils/syncConfig';
import { selectiveForceSyncService, CollectionCheckItem } from '../services/selectiveForceSyncService';

interface CloudSyncStatusCardProps {
  className?: string;
  onOpenDebugger?: () => void;
}

export const CloudSyncStatusCard: React.FC<CloudSyncStatusCardProps> = ({ className = '', onOpenDebugger }) => {
  const lastSyncTimestamp = useStore(state => state.lastSyncTimestamp);
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const triggerSync = useStore(state => state.triggerSync);
  const hardSync = useStore(state => state.hardSync);
  const showNotification = useStore(state => state.showNotification);

  const [isVerifying, setIsVerifying] = useState(false);
  const [isHardSyncing, setIsHardSyncing] = useState(false);
  const [consistencyStatus, setConsistencyStatus] = useState<'idle' | 'synced' | 'discrepancies'>('idle');
  const [discrepancyCount, setDiscrepancyCount] = useState<number>(0);
  const [, setTick] = useState(0);

  // Live timer tick
  React.useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerifyConsistency = async () => {
    setIsVerifying(true);
    try {
      // 1. Trigger regular sync
      triggerSync();

      // 2. Evaluate Firestore discrepancies
      const items = await selectiveForceSyncService.evaluateDiscrepancies();
      const count = items.filter(it => it.hasDiscrepancy).length;
      setDiscrepancyCount(count);

      if (count === 0) {
        setConsistencyStatus('synced');
        showNotification('Verificação de consistência: App e Nuvem estão 100% sincronizados!', 'success');
      } else {
        setConsistencyStatus('discrepancies');
        showNotification(`Atenção: ${count} coleção(ões) com discrepância detectada.`, 'info');
      }
    } catch (err: any) {
      console.error('[CloudSyncStatusCard] Erro ao verificar consistência:', err);
      showNotification(`Erro na verificação de consistência: ${err?.message || err}`, 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleHardSync = async () => {
    setIsHardSyncing(true);
    try {
      const success = await hardSync();
      if (success) {
        showNotification('Sincronização Forçada (Hard Sync) concluída! Estado global atualizado direto do servidor.', 'success');
        setConsistencyStatus('synced');
      } else {
        showNotification('Falha ao executar Hard Sync. Verifique sua conexão.', 'error');
      }
    } catch (err: any) {
      showNotification(`Erro no Hard Sync: ${err?.message || err}`, 'error');
    } finally {
      setIsHardSyncing(false);
    }
  };

  return (
    <div className={`bg-black/60 border border-brand-primary/30 rounded-3xl p-5 shadow-xl text-white space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 border border-brand-primary/40 flex items-center justify-center text-brand-primary shrink-0">
            <Database className={`w-5 h-5 ${isBackgroundSyncing || isVerifying ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-tight text-white flex items-center gap-2">
              Status de Sincronização & Nuvem
            </h4>
            <p className="text-[11px] text-white/50 font-medium">
              Banco Oficial: <strong className="text-brand-primary font-mono">volleyclub-manager</strong> (<span className="text-emerald-400 font-mono">default</span>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
            isBackgroundSyncing || isVerifying
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : consistencyStatus === 'synced'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : consistencyStatus === 'discrepancies'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              : 'bg-white/10 text-white/70 border border-white/20'
          }`}>
            {isBackgroundSyncing || isVerifying ? (
              <>
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Sincronizando...
              </>
            ) : consistencyStatus === 'synced' ? (
              <>
                <CheckCircle2 className="w-2.5 h-2.5" />
                Consistente
              </>
            ) : consistencyStatus === 'discrepancies' ? (
              <>
                <AlertTriangle className="w-2.5 h-2.5" />
                {discrepancyCount} Divergência(s)
              </>
            ) : (
              <>
                <ShieldCheck className="w-2.5 h-2.5 text-brand-primary" />
                Online
              </>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/60">
            <Clock className="w-4 h-4 text-brand-primary shrink-0" />
            <span>Último Sync</span>
          </div>
          <span className="font-mono font-bold text-white text-xs">
            {formatTimeSince(lastSyncTimestamp)}
          </span>
        </div>

        <button
          onClick={handleVerifyConsistency}
          disabled={isVerifying || isBackgroundSyncing || isHardSyncing}
          className="w-full py-3 px-3 bg-white/10 hover:bg-white/20 text-white font-black text-[11px] uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 border border-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
          {isVerifying ? 'Verificando...' : 'Verificar Consistência'}
        </button>

        <button
          onClick={handleHardSync}
          disabled={isHardSyncing || isBackgroundSyncing}
          className="w-full py-3 px-3 bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[11px] uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isHardSyncing ? 'animate-spin' : ''}`} />
          {isHardSyncing ? 'Sincronizando...' : '⚡ Sincronização Forçada'}
        </button>
      </div>

      {onOpenDebugger && (
        <div className="flex items-center justify-end pt-1">
          <button
            onClick={onOpenDebugger}
            className="text-[11px] text-brand-primary hover:underline font-bold uppercase tracking-wider flex items-center gap-1"
          >
            Abrir Painel de Debugger de Sincronização →
          </button>
        </div>
      )}
    </div>
  );
};
