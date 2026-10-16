import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Clock, 
  BatteryCharging, 
  Battery, 
  ShieldCheck, 
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react';
import { useStore } from '../../store';
import { getSyncModeDetails, formatTimeSince } from '../utils/syncConfig';

interface SyncStatusBadgeProps {
  compact?: boolean;
  className?: string;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ 
  compact = false,
  className = '' 
}) => {
  const syncMode = useStore(state => state.syncMode);
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const lastSyncTimestamp = useStore(state => state.lastSyncTimestamp);
  const setIsOpen = useStore(state => state.setIsSyncSettingsOpen);
  const triggerSync = useStore(state => state.triggerSync);

  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const modeDetails = getSyncModeDetails(syncMode);

  const getModeIcon = () => {
    if (isBackgroundSyncing) {
      return <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-primary animate-spin" />;
    }
    switch (syncMode) {
      case 'realtime':
        return <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-primary" />;
      case 'interval_15s':
        return <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />;
      case 'interval_30s':
        return <BatteryCharging className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />;
      case 'interval_60s':
        return <Battery className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />;
      case 'interval_300s':
        return <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />;
      case 'manual':
        return <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />;
    }
  };

  if (compact) {
    return (
      <button
        id="sync-status-badge-compact"
        onClick={() => setIsOpen(true)}
        className={`relative flex items-center justify-center p-2 rounded-xl bg-white/5 border border-white/10 hover:border-brand-primary/40 hover:bg-brand-primary/10 text-white/80 hover:text-brand-primary transition-all group ${className}`}
        title={`Sincronização: ${modeDetails.label} (${formatTimeSince(lastSyncTimestamp)}). Clique para configurar.`}
      >
        {getModeIcon()}
        {syncMode === 'realtime' && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <button
      id="sync-status-badge-full"
      onClick={() => setIsOpen(true)}
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl sm:rounded-2xl bg-black/60 border border-brand-primary/30 hover:border-brand-primary hover:bg-brand-primary/10 text-white transition-all group shadow-sm ${className}`}
      title="Configurar frequência de sincronização e economia de bateria"
    >
      <div className="flex items-center justify-center">
        {getModeIcon()}
      </div>

      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-brand-primary group-hover:text-brand-primary">
            {modeDetails.shortLabel}
          </span>
          {syncMode === 'realtime' && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          )}
        </div>
        <span className="text-[9px] sm:text-[10px] font-black text-white group-hover:text-white leading-none tracking-tight">
          {formatTimeSince(lastSyncTimestamp)}
        </span>
      </div>

      <SlidersHorizontal className="w-3 h-3 text-white/30 group-hover:text-brand-primary transition-colors ml-1" />
    </button>
  );
};
