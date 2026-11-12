import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Clock, 
  BatteryCharging, 
  Battery, 
  ShieldCheck, 
  RefreshCw, 
  Check, 
  X, 
  Smartphone, 
  Wifi,
  Sparkles,
  Info,
  Database,
  Activity,
  HardDrive,
  Trash2
} from 'lucide-react';
import { useStore } from '../../store';
import { SYNC_MODE_OPTIONS, getSyncModeDetails, formatTimeSince } from '../utils/syncConfig';
import { SyncFrequencyMode } from '../../types';
import { 
  getFirestorePersistenceMode, 
  setFirestorePersistenceMode, 
  purgeFirestoreLocalStorageKeys, 
  isMemoryFallbackActive, 
  FirestorePersistenceMode 
} from '../../firebase';
import { CloudSyncStatusCard } from './CloudSyncStatusCard';

export const SyncSettingsModal: React.FC = () => {
  const isOpen = useStore(state => state.isSyncSettingsOpen);
  const setIsOpen = useStore(state => state.setIsSyncSettingsOpen);
  const syncMode = useStore(state => state.syncMode);
  const setSyncMode = useStore(state => state.setSyncMode);
  const lastSyncTimestamp = useStore(state => state.lastSyncTimestamp);
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const triggerSync = useStore(state => state.triggerSync);
  const showNotification = useStore(state => state.showNotification);
  const setIsSyncDebuggerOpen = useStore(state => state.setIsSyncDebuggerOpen);
  const userRole = useStore(state => state.userRole);
  const setViewMode = useStore(state => state.setViewMode);

  const [, setTick] = useState(0);

  // Live timer tick for last sync time
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOption = getSyncModeDetails(syncMode);

  const handleSelectMode = (modeId: SyncFrequencyMode) => {
    setSyncMode(modeId);
    const details = getSyncModeDetails(modeId);
    showNotification(`Frequência de sincronização alterada para: ${details.shortLabel}`, 'success');
  };

  const handleManualSync = () => {
    triggerSync();
    showNotification('Sincronização iniciada com sucesso...', 'info');
  };

  const getBatteryBadge = (impact: string, label: string) => {
    switch (impact) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
            <Zap className="w-2.5 h-2.5" />
            {label}
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            <Clock className="w-2.5 h-2.5" />
            {label}
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <BatteryCharging className="w-2.5 h-2.5" />
            {label}
          </span>
        );
      case 'minimal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Battery className="w-2.5 h-2.5" />
            {label}
          </span>
        );
      case 'none':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <ShieldCheck className="w-2.5 h-2.5" />
            {label}
          </span>
        );
    }
  };

  const getModeIcon = (modeId: SyncFrequencyMode) => {
    switch (modeId) {
      case 'realtime':
        return <Zap className="w-5 h-5 text-brand-primary" />;
      case 'interval_15s':
        return <Clock className="w-5 h-5 text-yellow-400" />;
      case 'interval_30s':
        return <BatteryCharging className="w-5 h-5 text-emerald-400" />;
      case 'interval_60s':
        return <Battery className="w-5 h-5 text-cyan-400" />;
      case 'interval_300s':
        return <ShieldCheck className="w-5 h-5 text-blue-400" />;
      case 'manual':
        return <RefreshCw className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="sync-settings-modal-backdrop"
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={() => setIsOpen(false)}
      >
        <motion.div
          id="sync-settings-modal-content"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl bg-black border-2 border-brand-primary/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-brand-primary/10 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6 shrink-0 border-b border-brand-primary/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/40 flex items-center justify-center text-brand-primary shrink-0">
                <RefreshCw className={`w-6 h-6 ${isBackgroundSyncing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight font-sans">
                  Frequência de Sincronização
                </h3>
                <p className="text-xs text-white/50 font-medium">
                  Controle o consumo de bateria e dados móveis deste aparelho
                </p>
              </div>
            </div>
            
            <button
              id="close-sync-settings-btn"
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cloud Sync Status Card */}
          <CloudSyncStatusCard className="mb-5 shrink-0" onOpenDebugger={() => { setIsOpen(false); setIsSyncDebuggerOpen(true); }} />
          <div className="bg-white/5 border border-brand-primary/20 rounded-2xl p-3.5 mb-5 space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <div className="text-xs">
                  <span className="text-white/60 font-black uppercase tracking-wider text-[10px] block">
                    Última Atualização
                  </span>
                  <span className="text-white font-black font-mono text-sm">
                    {formatTimeSince(lastSyncTimestamp)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="manual-sync-action-btn"
                  onClick={handleManualSync}
                  disabled={isBackgroundSyncing}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-primary text-black font-black text-xs uppercase tracking-wider hover:bg-brand-primary/90 active:scale-95 transition-all shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBackgroundSyncing ? 'animate-spin' : ''}`} />
                  {isBackgroundSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                </button>
              </div>
            </div>

            {/* Banco de Dados Oficial Único */}
            <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-[11px]">
              <div className="flex items-center gap-2 text-white/70">
                <Database className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                <span>Banco Único: <strong className="text-brand-primary font-mono font-bold">volleyclub-manager</strong> (<span className="text-emerald-400 font-mono font-bold">(default)</span>)</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Conectado (Produção & Celular)
              </span>
            </div>
          </div>

          {/* Options List */}
          <div className="overflow-y-auto space-y-3 pr-1 flex-1 custom-scrollbar">
            {SYNC_MODE_OPTIONS.map((option) => {
              const isSelected = syncMode === option.id;
              return (
                <div
                  key={option.id}
                  id={`sync-option-${option.id}`}
                  onClick={() => handleSelectMode(option.id)}
                  className={`cursor-pointer rounded-2xl p-4 transition-all border text-left relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-brand-primary/10 border-brand-primary shadow-[0_0_20px_rgba(255,215,0,0.15)]'
                      : 'bg-white/[0.03] border-white/10 hover:border-brand-primary/40 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isSelected 
                        ? 'bg-brand-primary/20 border-brand-primary text-brand-primary' 
                        : 'bg-white/5 border-white/10 text-white/60'
                    }`}>
                      {getModeIcon(option.id)}
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className={`text-sm font-black uppercase tracking-wide ${
                          isSelected ? 'text-brand-primary' : 'text-white'
                        }`}>
                          {option.label}
                        </h4>
                        {getBatteryBadge(option.batteryImpact, option.batteryLabel)}
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed font-normal">
                        {option.description}
                      </p>
                      {option.recommendedFor && (
                        <p className="text-[10px] text-white/40 mt-1 italic flex items-center gap-1">
                          <Info className="w-3 h-3 text-brand-primary/60 shrink-0" />
                          {option.recommendedFor}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center self-end sm:self-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-brand-primary border-brand-primary text-black'
                        : 'border-white/20 bg-transparent'
                    }`}>
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Firestore Persistence Selector */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4" />
                    Persistência de Cache do Banco (Firestore)
                  </h4>
                  <p className="text-[11px] text-white/50">
                    Controle o armazenamento local no celular para evitar o erro <code className="text-amber-400 font-mono">QuotaExceededError</code>
                  </p>
                </div>
                {isMemoryFallbackActive && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    Fallback Memória Ativo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {([
                  {
                    id: 'bounded',
                    title: '10 MB Otimizado',
                    badge: 'Recomendado Celular',
                    desc: 'Cache limitado a 10MB (volleyclub-manager). Evita estourar a cota de armazenamento no smartphone.',
                    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  },
                  {
                    id: 'memory',
                    title: 'Apenas Memória',
                    badge: 'Zero Disco / Safe',
                    desc: 'Sem cache no disco. Elimina 100% de erros de Quota Exceeded.',
                    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                  },
                  {
                    id: 'unlimited',
                    title: 'Sem Limite',
                    badge: 'Dev / PC',
                    desc: 'Usa a cota padrão do navegador. Ideal para computadores.',
                    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  }
                ] as const).map(p => {
                  const currentPersist = getFirestorePersistenceMode();
                  const isSelected = currentPersist === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (currentPersist !== p.id) {
                          if (window.confirm(`Alterar modo de cache para "${p.title}"? O aplicativo será recarregado.`)) {
                            setFirestorePersistenceMode(p.id as FirestorePersistenceMode);
                          }
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between space-y-2 ${
                        isSelected
                          ? 'bg-brand-primary/10 border-brand-primary shadow-sm'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-black uppercase text-[11px] ${isSelected ? 'text-brand-primary' : 'text-white'}`}>
                          {p.title}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${p.badgeColor}`}>
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-tight">
                        {p.desc}
                      </p>
                      <div className="flex items-center justify-end pt-1">
                        <span className={`text-[10px] font-bold ${isSelected ? 'text-brand-primary' : 'text-white/30'}`}>
                          {isSelected ? '✓ Ativo' : 'Selecionar'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] bg-white/5 p-2.5 rounded-xl border border-white/5">
                <span className="text-white/60">Precisa liberar espaço imediatamente?</span>
                <button
                  onClick={() => {
                    const count = purgeFirestoreLocalStorageKeys();
                    showNotification(`Limpeza concluída! ${count} chave(s) do Firestore purgadas do armazenamento.`, 'success');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold text-[10px] uppercase transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  Expurgar Chaves do LocalStorage
                </button>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-white/40 text-[11px] shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setIsOpen(false); setIsSyncDebuggerOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold text-xs uppercase tracking-wider transition-all border border-brand-primary/30"
              >
                <Database className="w-3.5 h-3.5" />
                Debugger de Partidas
              </button>
              {userRole === 'ADMIN' && (
                <button
                  onClick={() => { 
                    setIsOpen(false); 
                    setViewMode('admin');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white font-bold text-xs uppercase tracking-wider transition-all border border-white/10"
                >
                  <Activity className="w-3.5 h-3.5 text-brand-primary" />
                  Painel de Diagnóstico (Admin)
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-brand-primary/70" />
              <span>Preferência salva localmente.</span>
            </div>
            <button
              id="confirm-sync-settings-btn"
              onClick={() => setIsOpen(false)}
              className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Concluído
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
