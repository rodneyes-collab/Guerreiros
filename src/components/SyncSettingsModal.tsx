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
  Database
} from 'lucide-react';
import { useStore } from '../../store';
import { SYNC_MODE_OPTIONS, getSyncModeDetails, formatTimeSince } from '../utils/syncConfig';
import { SyncFrequencyMode } from '../../types';

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

          {/* Quick Status Bar */}
          <div className="bg-white/5 border border-brand-primary/20 rounded-2xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-ping" />
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
          </div>

          {/* Footer note */}
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-white/40 text-[11px] shrink-0">
            <button
              onClick={() => { setIsOpen(false); setIsSyncDebuggerOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold text-xs uppercase tracking-wider transition-all border border-brand-primary/30"
            >
              <Database className="w-3.5 h-3.5" />
              Abrir Debugger de Sincronização
            </button>
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
