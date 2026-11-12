import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Database, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  HardDrive, 
  Trash2, 
  Cpu, 
  Download, 
  ArrowRight, 
  ShieldCheck, 
  Layers, 
  Smartphone,
  ExternalLink,
  Flame,
  HelpCircle,
  AlertOctagon,
  Sparkles,
  Zap
} from 'lucide-react';
import { useStore } from '../../store';
import { APP_VERSION } from '../../constants';
import { forceAppUpdate } from '../utils/forceAppUpdate';
import { 
  db, 
  doc, 
  getDocFromServer, 
  getDocsFromServer, 
  collection, 
  getFirestoreDateKey,
  getFirestorePersistenceMode,
  setFirestorePersistenceMode,
  purgeFirestoreLocalStorageKeys,
  isMemoryFallbackActive,
  FirestorePersistenceMode
} from '../../firebase';
import { CollectionSyncMeta, SyncDiagnosticReport, SelectiveSyncResult } from '../../types';
import { selectiveForceSyncService, CollectionCheckItem } from '../services/selectiveForceSyncService';
import { useAdminAutomations } from '../hooks/useAdminAutomations';
import { FirestoreDiagnosticsPanel } from './FirestoreDiagnosticsPanel';
import { StorageInspectorCard } from './StorageInspectorCard';
import { DiagnosticLogsPanel } from './DiagnosticLogsPanel';
import { ServiceWorkerFetchLogPanel } from './ServiceWorkerFetchLogPanel';
import { AppUpdateAuditPanel } from './AppUpdateAuditPanel';
import { updateDoc } from '../../firebase';

interface DiagnosticDashboardProps {
  onTriggerSync?: () => void;
}

export const DiagnosticDashboard: React.FC<DiagnosticDashboardProps> = ({ onTriggerSync }) => {
  const isOnlineNavigator = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const syncMode = useStore(state => state.syncMode);
  const isBackgroundSyncing = useStore(state => state.isBackgroundSyncing);
  const lastSyncTimestamp = useStore(state => state.lastSyncTimestamp);
  const triggerSync = useStore(state => state.triggerSync);
  const collectionsSyncMeta = useStore(state => state.collectionsSyncMeta);
  const showNotification = useStore(state => state.showNotification);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const attendance = useStore(state => state.attendance);

  const { cleanupStatus, isPurging, triggerManualPurge } = useAdminAutomations();

  const [isPinging, setIsPinging] = useState(false);
  const [isEvaluatingDiscrepancies, setIsEvaluatingDiscrepancies] = useState(false);
  const [isExecutingForceSync, setIsExecutingForceSync] = useState(false);
  const [syncingCollectionKey, setSyncingCollectionKey] = useState<string | null>(null);
  const [discrepancyItems, setDiscrepancyItems] = useState<Record<string, CollectionCheckItem>>({});
  const [lastForceSyncResults, setLastForceSyncResults] = useState<SelectiveSyncResult[] | null>(null);
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [firestoreStatus, setFirestoreStatus] = useState<'connected' | 'offline' | 'checking' | 'error'>('checking');
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [isClearingStorage, setIsClearingStorage] = useState(false);
  const [isForceUpdating, setIsForceUpdating] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');

  // 1. Inspecionar LocalStorage detalhadamente
  const localStorageAnalysis = useMemo(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { totalBytes: 0, items: [] };
    }
    const items: { key: string; sizeBytes: number; summary: string; isSuspect: boolean }[] = [];
    let totalBytes = 0;

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const val = window.localStorage.getItem(key) || '';
      const sizeBytes = (key.length + val.length) * 2; // UTF-16 approx
      totalBytes += sizeBytes;

      let summary = val;
      if (val.length > 50) {
        summary = `${val.slice(0, 47)}...`;
      }

      // Detectar chaves suspeitas de reter estado antigo
      const isSuspect = 
        key.includes('intentions') || 
        key.includes('cache') || 
        key.includes('last_auto_update') ||
        key.includes('spikegen');

      items.push({ key, sizeBytes, summary, isSuspect });
    }

    items.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return { totalBytes, items };
  }, [isClearingStorage, lastCheckTime]);

  // 2. Testar Conexão Direta ao Servidor Firestore (Ignora cache)
  const testDirectFirestoreConnection = useCallback(async () => {
    setIsPinging(true);
    setFirestoreStatus('checking');
    setFirestoreError(null);

    const startTime = performance.now();
    try {
      // Teste 1: Buscar versão no servidor backend
      try {
        const vResp = await fetch(`/api/version?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        if (vResp.ok) {
          const vData = await vResp.json();
          setServerVersion(vData.version || null);
        }
      } catch (err) {
        console.warn('[DiagnosticDashboard] Não foi possível obter api/version:', err);
      }

      // Teste 2: Conexão real e direta ao Firestore com getDocFromServer
      await getDocFromServer(doc(db, 'metadata', 'system'));
      const duration = Math.round(performance.now() - startTime);
      setConnectionLatency(duration);
      setFirestoreStatus('connected');
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      setConnectionLatency(duration);
      console.warn('[DiagnosticDashboard] Teste getDocFromServer:', err);
      const msg = err?.message || String(err);
      if (msg.includes('offline') || msg.includes('network') || msg.includes('unavailable')) {
        setFirestoreStatus('offline');
      } else {
        setFirestoreStatus('error');
      }
      setFirestoreError(msg);
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
    } finally {
      setIsPinging(false);
    }
  }, []);

  // Comparar timestamps locais de cada coleção com o Firestore
  const handleCheckDiscrepancies = useCallback(async () => {
    setIsEvaluatingDiscrepancies(true);
    try {
      const items = await selectiveForceSyncService.evaluateDiscrepancies();
      const map: Record<string, CollectionCheckItem> = {};
      items.forEach(it => { map[it.key] = it; });
      setDiscrepancyItems(map);

      const count = items.filter(it => it.hasDiscrepancy).length;
      if (count > 0) {
        showNotification(`${count} discrepância(s) detectada(s) entre o cache e o Firestore.`, 'info');
      } else {
        showNotification('Todas as coleções estão perfeitamente sincronizadas com o Firestore.', 'success');
      }
    } catch (e: any) {
      console.error('[DiagnosticDashboard] Erro ao avaliar discrepâncias:', e);
      showNotification('Erro ao auditar discrepâncias do Firestore.', 'error');
    } finally {
      setIsEvaluatingDiscrepancies(false);
    }
  }, [showNotification]);

  // Forçar sincronização de APENAS coleções com discrepância detectada
  const handleSelectiveForceSync = async (specificKey?: string) => {
    if (specificKey) {
      setSyncingCollectionKey(specificKey);
    } else {
      setIsExecutingForceSync(true);
    }

    try {
      const results = await selectiveForceSyncService.executeSelectiveForceSync(
        specificKey ? [specificKey] : undefined
      );
      setLastForceSyncResults(results);

      const updatedCount = results.filter(r => r.actionTaken === 'UPDATED').length;
      if (updatedCount > 0) {
        showNotification(
          `Force-sync concluído com sucesso: ${updatedCount} coleção(ões) atualizada(s) cirurgicamente!`,
          'success'
        );
      } else {
        showNotification('Nenhuma coleção precisava de atualização.', 'info');
      }

      await handleCheckDiscrepancies();
      await testDirectFirestoreConnection();
    } catch (e: any) {
      console.error('[DiagnosticDashboard] Erro no force-sync seletivo:', e);
      showNotification(`Erro no force-sync: ${e?.message || e}`, 'error');
    } finally {
      setIsExecutingForceSync(false);
      setSyncingCollectionKey(null);
    }
  };

  // Executar teste e auditoria inicial
  useEffect(() => {
    testDirectFirestoreConnection();
    handleCheckDiscrepancies();
  }, [testDirectFirestoreConnection, handleCheckDiscrepancies]);

  // Lista padrão de coleções para auditar mesmo se snapshot não disparou ainda
  const allAuditedCollections: { key: string; name: string; fallbackCount: number }[] = useMemo(() => {
    const today = getFirestoreDateKey();
    return [
      { key: 'players', name: 'Sócios (players)', fallbackCount: players.length },
      { key: 'matches', name: 'Partidas (matches)', fallbackCount: matches.length },
      { key: 'attendance', name: `Presença (${today})`, fallbackCount: attendance.length },
      { key: 'intentions', name: 'Lista de Intenções (metadata/intentions)', fallbackCount: 1 },
      { key: 'preConfirmations', name: 'Pré-Confirmações (preConfirmations)', fallbackCount: 0 },
      { key: 'payments', name: 'Mensalidades (payments)', fallbackCount: 0 },
      { key: 'expenses', name: 'Despesas (expenses)', fallbackCount: 0 }
    ];
  }, [players.length, matches.length, attendance.length]);

  // 3. Limpeza Seletiva de Cache / LocalStorage de Dados
  const handleClearDataCache = async () => {
    if (!window.confirm('Deseja limpar todos os dados em cache e recarregar a versão mais fresca do Firestore? Suas credenciais não serão perdidas.')) return;
    setIsClearingStorage(true);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Preserva auth e credenciais
        const keepKeys = ['emailForSignIn', 'simpleLoginEmail', 'hasBiometricsLinked'];
        const saved: Record<string, string | null> = {};
        keepKeys.forEach(k => { saved[k] = localStorage.getItem(k); });
        
        localStorage.clear();
        
        keepKeys.forEach(k => {
          if (saved[k]) localStorage.setItem(k, saved[k]!);
        });
      }

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }

      showNotification('Cache local limpo com sucesso! Recarregando dados...', 'success');
      triggerSync();
      if (onTriggerSync) onTriggerSync();
      await testDirectFirestoreConnection();
    } catch (e) {
      console.error('[DiagnosticDashboard] Erro ao limpar cache:', e);
      showNotification('Erro ao limpar caches locais.', 'error');
    } finally {
      setIsClearingStorage(false);
    }
  };

  // 4. Forçar Atualização Total do App (PWA + Service Worker)
  const handleForceAppUpdate = async () => {
    setIsForceUpdating(true);
    try {
      await forceAppUpdate();
    } catch (e) {
      window.location.reload();
    }
  };

  const hasVersionMismatch = serverVersion && serverVersion !== APP_VERSION;

  return (
    <div className="space-y-6">
      {/* Header do Painel */}
      <div className="bg-black backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                  Diagnóstico de Conexão & Cache
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary">
                  Admin Real-Time
                </span>
              </div>
              <p className="text-xs text-white/50 mt-1 font-medium italic">
                {APP_VERSION === serverVersion ? '✓ App em Sincronia de Versão' : `⚠️ Versão Local v${APP_VERSION} difere da Nuvem v${serverVersion}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleCheckDiscrepancies}
              disabled={isEvaluatingDiscrepancies}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider transition-all border border-white/10 disabled:opacity-50"
              title="Comparar timestamps do cache local contra os documentos do Firestore"
            >
              <Activity className={`w-3.5 h-3.5 ${isEvaluatingDiscrepancies ? 'animate-spin text-brand-primary' : 'text-brand-primary'}`} />
              {isEvaluatingDiscrepancies ? 'Avaliando...' : 'Avaliar Discrepâncias'}
            </button>

            <button
              onClick={() => handleSelectiveForceSync()}
              disabled={isExecutingForceSync || isEvaluatingDiscrepancies}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              title="Forçar sincronização cirúrgica apenas das coleções com discrepância"
            >
              <Zap className={`w-3.5 h-3.5 ${isExecutingForceSync ? 'animate-spin' : ''}`} />
              {isExecutingForceSync ? 'Force-Sync em Andamento...' : 'Force-Sync Cirúrgico'}
            </button>

            <button
              onClick={async () => {
                if (!window.confirm(`Deseja promover a versão v${APP_VERSION} como a versão oficial no Firestore? Isso forçará todos os apps a atualizarem.`)) return;
                try {
                  await updateDoc(doc(db, 'metadata', 'system'), {
                    appVersion: APP_VERSION,
                    lastVersionUpdate: Date.now(),
                    forceUpdate: true
                  });
                  showNotification(`Versão v${APP_VERSION} promovida globalmente!`, 'success');
                  testDirectFirestoreConnection();
                } catch (e) {
                  showNotification('Erro ao promover versão.', 'error');
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20"
              title="Promover versão atual para todos os usuários"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Promover v{APP_VERSION} Global
            </button>

            <button
              onClick={async () => {
                if (!window.confirm('Deseja disparar um RECARREGAMENTO NUCLEAR GLOBAL? Isso forçará a limpeza de cache e recarregamento imediato em TODOS os dispositivos conectados.')) return;
                try {
                  await updateDoc(doc(db, 'metadata', 'system'), {
                    forceReloadId: Date.now().toString()
                  });
                  showNotification('Comando de recarregamento nuclear disparado!', 'success');
                } catch (e) {
                  showNotification('Erro ao disparar recarregamento.', 'error');
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-600/20"
              title="Forçar recarregamento imediato em todos os usuários"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              Nuclear Hard Reload
            </button>

            <button
              onClick={() => {
                triggerSync();
                if (onTriggerSync) onTriggerSync();
                testDirectFirestoreConnection();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-black text-xs uppercase tracking-wider transition-all border border-brand-primary/30"
              title="Sincronizar banco inteiro"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Global
            </button>
          </div>
        </div>

        {/* Alerta de Descompasso de Versão se Existir */}
        {hasVersionMismatch && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Descompasso de Versão Detectado (Cache Antigo)
                </p>
                <p className="text-[11px] text-amber-200/80">
                  Seu navegador está executando a versão <strong>v{APP_VERSION}</strong>, mas o servidor já disponibilizou a <strong>v{serverVersion}</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={handleForceAppUpdate}
              disabled={isForceUpdating}
              className="px-4 py-2 bg-amber-500 text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-amber-400 transition-all shrink-0"
            >
              {isForceUpdating ? 'Atualizando...' : 'Atualizar para v' + serverVersion}
            </button>
          </motion.div>
        )}
      </div>

      {/* Grid de Cards de Status Principal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Status da Rede / Conexão */}
        <div className="bg-brand-light p-5 rounded-3xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[10px] font-black uppercase tracking-widest">Navegador & Conexão</span>
            {isOnlineNavigator ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-rose-500" />}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-black uppercase ${isOnlineNavigator ? 'text-emerald-400' : 'text-rose-500'}`}>
              {isOnlineNavigator ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-[10px] text-white/50">
            Status reportado pelo navegador (`navigator.onLine`).
          </p>
        </div>

        {/* Card 2: Conexão Real com Firestore */}
        <div className="bg-brand-light p-5 rounded-3xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[10px] font-black uppercase tracking-widest">Firestore Server</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              firestoreStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
              firestoreStatus === 'checking' ? 'bg-amber-400 animate-ping' : 'bg-rose-500'
            }`} />
            <span className="text-xl font-black uppercase text-white">
              {firestoreStatus === 'connected' ? 'Ativo' :
               firestoreStatus === 'checking' ? 'Verificando' : 'Inacessível'}
            </span>
          </div>
          <p className="text-[10px] text-white/50">
            {connectionLatency !== null ? `Latência direta: ${connectionLatency}ms` : 'Aguardando ping'}
            {lastCheckTime && ` (${lastCheckTime})`}
          </p>
        </div>

        {/* Card 3: Modo de Sincronização Ativo */}
        <div className="bg-brand-light p-5 rounded-3xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[10px] font-black uppercase tracking-widest">Modo de Sincronia</span>
            <Clock className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black uppercase text-brand-primary font-mono">
              {syncMode === 'realtime' ? 'Tempo Real' : syncMode}
            </span>
            {isBackgroundSyncing && (
              <span className="text-[9px] font-bold text-brand-primary animate-pulse">
                [Syncing...]
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/50">
            {lastSyncTimestamp ? `Último sync global: ${new Date(lastSyncTimestamp).toLocaleTimeString('pt-BR')}` : 'Ainda não registrado'}
          </p>
        </div>

        {/* Card 4: Versão App vs Servidor */}
        <div className="bg-brand-light p-5 rounded-3xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[10px] font-black uppercase tracking-widest">Versão do App</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black uppercase text-white font-mono">
              v{APP_VERSION}
            </span>
            {serverVersion && (
              <span className={`text-[10px] font-bold font-mono ${hasVersionMismatch ? 'text-amber-400' : 'text-emerald-400'}`}>
                (Servidor: v{serverVersion})
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/50">
            {hasVersionMismatch ? '⚠️ Descompasso! Recarregue o app.' : '✓ Versão sincronizada com o servidor.'}
          </p>
        </div>
      </div>

      {/* Card de Status do Sistema: Limpeza Automatizada de Intenções (> 7 Dias / Semana Passada) */}
      <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 border-l-[6px] border-l-emerald-400 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Sistema de Purga Ativo (&lt; 7 Dias / Semana Vigente)
              </span>
            </div>
            <h4 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-emerald-400" />
              Status da Limpeza de Intenções (Purga de 7 Dias)
            </h4>
            <p className="text-xs text-white/50">
              Garante que confirmações de presenças antigas (com mais de 7 dias ou anteriores à segunda-feira da semana corrente) sejam automaticamente expurgadas do Firestore e do armazenamento local mobile.
            </p>
          </div>

          <button
            onClick={() => triggerManualPurge()}
            disabled={isPurging}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 shrink-0 cursor-pointer"
            title="Executar varredura e expurgo imediato de intenções obsoletas"
          >
            <RefreshCw className={`w-4 h-4 ${isPurging ? 'animate-spin' : ''}`} />
            {isPurging ? 'Expurgando...' : 'Executar Purga 7 Dias Agora'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Métrica 1: Data da Última Purga */}
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Última Purga Realizada</span>
            <span className="text-sm font-black text-emerald-400 block font-mono">
              {cleanupStatus?.lastPurgeDateStr || 'Executada no carregamento do app'}
            </span>
            <span className="text-[9px] text-white/40 block">
              {cleanupStatus?.lastPurgeTimestamp ? `Timestamp: ${cleanupStatus.lastPurgeTimestamp}` : 'Fuso: America/Sao_Paulo'}
            </span>
          </div>

          {/* Métrica 2: Total Expurgado */}
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Total de Itens Expurgados</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400 font-mono">
                {cleanupStatus?.totalPurgedCount ?? 0}
              </span>
              <span className="text-[10px] font-bold text-white/50 uppercase">registros obsoletos</span>
            </div>
            <span className="text-[9px] text-white/40 block">Total purgado acumulado na sessão</span>
          </div>

          {/* Métrica 3: Detalhamento de Expurgos */}
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Detalhamento por Origem</span>
            <div className="text-[11px] font-bold text-white/80 space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span className="text-white/50">Metadata Responses:</span>
                <span className="text-brand-primary">{cleanupStatus?.purgedResponsesCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Pré-Confirmações:</span>
                <span className="text-brand-primary">{cleanupStatus?.purgedPreConfirmationsCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Cache Local Mobile:</span>
                <span className="text-brand-primary">{cleanupStatus?.purgedLocalStorageKeys ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Métrica 4: Confirmações Válidas Preservadas */}
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Confirmações Ativas Preservadas</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {cleanupStatus?.preservedActiveConfirmations ?? 0}
              </span>
              <span className="text-[10px] font-bold text-white/50 uppercase">sócios desta semana</span>
            </div>
            <span className="text-[9px] text-emerald-400/80 block">✓ Apenas confirmações legítimas desta semana</span>
          </div>
        </div>
      </div>

      {/* Card Principal Sync Debug: Timestamps Local (Cache) vs Firestore (Nuvem) */}
      <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-black uppercase tracking-wider">
                Sync Debug & Diagnostics
              </span>
              {Object.values(discrepancyItems).some(it => it.hasDiscrepancy) ? (
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Descompasso Detectado
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Todas as Coleções em Sincronia
                </span>
              )}
            </div>
            <h4 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Layers className="w-6 h-6 text-brand-primary" />
              Painel Sync Debug: Timestamps Local (Cache) vs Firestore (Nuvem)
            </h4>
            <p className="text-xs text-white/50">
              Compara em tempo real os timestamps e volume de registros do cache/armazenamento local contra os dados oficiais ao vivo no Firestore. Utilize o botão <strong>Force Re-sync</strong> para atualizar qualquer coleção individual defasada.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleCheckDiscrepancies()}
              disabled={isEvaluatingDiscrepancies}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider transition-all border border-white/10 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              title="Executar auditoria de timestamps no Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingDiscrepancies ? 'animate-spin text-brand-primary' : ''}`} />
              Re-auditar Timestamps
            </button>
          </div>
        </div>

        {/* Resumo do Último Force-Sync Cirúrgico */}
        {lastForceSyncResults && lastForceSyncResults.length > 0 && (
          <div className="p-4 bg-black/60 rounded-2xl border border-brand-primary/30 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                Resultado da Última Re-sincronização Seletiva
              </span>
              <span className="text-[10px] text-white/40 font-mono">
                {new Date().toLocaleTimeString('pt-BR')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {lastForceSyncResults.map(r => (
                <div key={r.collectionKey} className="p-2.5 bg-white/5 rounded-xl border border-white/5 text-[11px]">
                  <p className="font-bold text-white flex items-center justify-between">
                    <span>{r.displayName}</span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                      r.actionTaken === 'UPDATED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      r.actionTaken === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/10 text-white/60'
                    }`}>
                      {r.actionTaken === 'UPDATED' ? 'Atualizado' : r.actionTaken === 'ERROR' ? 'Falha' : 'Em Sincronia'}
                    </span>
                  </p>
                  <p className="text-[10px] text-white/50 mt-1 truncate" title={r.details}>
                    {r.details || `${r.itemsUpdated} itens sincronizados`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabela de Coleções e Botões de Force Re-sync por Coleção */}
        <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
                <th className="py-3.5 px-4">Coleção / Fonte</th>
                <th className="py-3.5 px-4">Timestamp Local (Cache)</th>
                <th className="py-3.5 px-4">Timestamp Servidor (Firestore)</th>
                <th className="py-3.5 px-4">Volume (Cache vs Nuvem)</th>
                <th className="py-3.5 px-4">Status & Diagnóstico</th>
                <th className="py-3.5 px-4 text-right">Ação Re-sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {allAuditedCollections.map(col => {
                const meta = collectionsSyncMeta[col.key];
                const disc = discrepancyItems[col.key];
                const hasDiscrepancy = disc ? disc.hasDiscrepancy : false;
                
                const localTs = meta?.lastSyncTimestamp || 0;
                const serverTs = disc?.serverTimestamp || (meta as any)?.serverLastUpdated || 0;
                
                const localCount = disc?.localCount ?? meta?.itemCount ?? col.fallbackCount;
                const serverCount = disc?.serverCount ?? meta?.serverCount ?? localCount;
                
                const isFromCache = meta?.source === 'cache';
                const isSyncingThis = syncingCollectionKey === col.key || (meta?.status === 'syncing');

                const formatTs = (ts: number) => {
                  if (!ts || ts === 0) return 'Não registrado';
                  try {
                    return new Date(ts).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    });
                  } catch {
                    return 'Inválido';
                  }
                };

                return (
                  <tr key={col.key} className={`hover:bg-white/[0.03] transition-colors ${hasDiscrepancy ? 'bg-amber-500/[0.05]' : ''}`}>
                    <td className="py-4 px-4 font-black text-white">
                      <div className="flex items-center gap-2">
                        <span>{col.name}</span>
                        {meta?.hasPendingWrites && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-md border border-amber-500/30">
                            Pendente
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-white/40 block mt-0.5">
                        id: {col.key}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-white/70">
                      {formatTs(localTs)}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-emerald-400 font-bold">
                      {formatTs(serverTs)}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs">
                      <span className="text-white/80">{localCount} no cache</span>
                      {serverCount !== undefined && serverCount !== localCount && (
                        <span className="text-amber-400 font-bold ml-1.5">({serverCount} na nuvem)</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {hasDiscrepancy ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            Descompasso
                          </span>
                          <span className="text-[10px] text-amber-300/80 block truncate max-w-[200px]" title={disc?.reason}>
                            {disc?.reason || 'Re-sincronização recomendada'}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            Em Sincronia
                          </span>
                          <span className="text-[10px] text-white/40 block">
                            {isFromCache ? 'Cache Local Válido' : 'Servidor Oficial'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleSelectiveForceSync(col.key)}
                        disabled={isSyncingThis || isExecutingForceSync}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer ${
                          hasDiscrepancy
                            ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 active:scale-95'
                            : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 active:scale-95'
                        }`}
                        title={`Forçar re-sincronização cirúrgica apenas da coleção ${col.name}`}
                      >
                        <Zap className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />
                        {isSyncingThis ? 'Atualizando...' : 'Force Re-sync'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção de Diagnóstico e Auditoria do LocalStorage & Persistência */}
      <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h4 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-brand-primary" />
              Auditoria de LocalStorage & Seletor de Persistência
            </h4>
            <p className="text-xs text-white/40 mt-0.5">
              Selecione o modo de cache do Firestore para limitar o tamanho dos dados locais e evitar o erro <code className="text-amber-400 font-mono">QuotaExceededError</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isMemoryFallbackActive && (
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                Fallback Memória Ativo
              </span>
            )}
            <span className="text-xs font-mono font-bold text-white/60 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              Total: {(localStorageAnalysis.totalBytes / 1024).toFixed(1)} KB ({localStorageAnalysis.items.length} chaves)
            </span>
            <button
              onClick={handleClearDataCache}
              disabled={isClearingStorage}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isClearingStorage ? 'Limpando...' : 'Limpar Dados Antigos'}
            </button>
          </div>
        </div>

        {/* Firestore Persistence Selector Cards */}
        <div className="bg-black/40 p-4 rounded-2xl border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-black uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Modo de Cache do Firestore (Local Storage Limit)
            </h5>
            <span className="text-[11px] text-white/50">
              Modo Atual: <strong className="text-brand-primary font-mono font-bold uppercase">{getFirestorePersistenceMode()}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              {
                id: 'bounded',
                title: '10 MB Otimizado',
                badge: 'Recomendado Celular',
                desc: 'Limita o cache local do Firestore em 10 MB no disco para a instância volleyclub-manager. Evita o estouro do LocalStorage em aparelhos Android/iOS.',
                badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              },
              {
                id: 'memory',
                title: 'Apenas Memória',
                badge: 'Zero Disco / Safe',
                desc: 'Nenhum dado do banco é salvo no disco do celular. Elimina 100% de erros QuotaExceededError.',
                badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              },
              {
                id: 'unlimited',
                title: 'Sem Limite',
                badge: 'Dev / PC',
                desc: 'Utiliza a cota padrão ilimitada do navegador. Ideal para computadores e testes de desenvolvimento.',
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
                  className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
                    isSelected
                      ? 'bg-brand-primary/10 border-brand-primary shadow-md'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-black uppercase text-xs ${isSelected ? 'text-brand-primary' : 'text-white'}`}>
                      {p.title}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${p.badgeColor}`}>
                      {p.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {p.desc}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">
                      {isSelected ? 'Em uso' : 'Clique para ativar'}
                    </span>
                    <span className={`text-xs font-bold ${isSelected ? 'text-brand-primary' : 'text-white/30'}`}>
                      {isSelected ? '✓ Selecionado' : 'Selecionar'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
                <th className="py-3 px-4">Chave Local (Key)</th>
                <th className="py-3 px-4">Tamanho</th>
                <th className="py-3 px-4">Conteúdo / Amostra</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {localStorageAnalysis.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-white/40 italic">
                    Nenhuma chave de armazenamento local encontrada.
                  </td>
                </tr>
              ) : (
                localStorageAnalysis.items.map(item => (
                  <tr key={item.key} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      <div className="flex items-center gap-2">
                        <span>{item.key}</span>
                        {item.isSuspect && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-md border border-brand-primary/20">
                            Estado do App
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-white/50">
                      {item.sizeBytes < 1024 ? `${item.sizeBytes} B` : `${(item.sizeBytes / 1024).toFixed(1)} KB`}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-white/60 max-w-xs truncate" title={item.summary}>
                      {item.summary}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Excluir a chave "${item.key}" do armazenamento local?`)) {
                            localStorage.removeItem(item.key);
                            setLastCheckTime(new Date().toISOString());
                            showNotification(`Chave "${item.key}" removida.`, 'info');
                          }
                        }}
                        className="text-white/40 hover:text-rose-400 p-1.5 transition-colors"
                        title="Remover chave individual"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tráfego do Service Worker & Cache */}
      <ServiceWorkerFetchLogPanel />

      {/* Auditoria de Camadas de Versão & Cache Nuclear */}
      <AppUpdateAuditPanel />

      {/* Logs de Diagnóstico do Sistema */}
      <DiagnosticLogsPanel />

      {/* Utilitário Inspetor de LocalStorage, SessionStorage e IndexedDB */}
      <StorageInspectorCard />

      {/* Painel de Operações Pendentes & Hard Reset */}
      <FirestoreDiagnosticsPanel />

      {/* Guia Rápido de Solução de Problemas no Celular */}
      <div className="bg-black/60 p-6 rounded-3xl border border-white/5 space-y-4">
        <h5 className="text-xs font-black uppercase tracking-wider text-brand-primary flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          Por que o celular pode exibir dados antigos e como resolver:
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-white/60">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1.5">
            <p className="font-bold text-white uppercase text-[11px]">1. Cache IndexedDB do Firebase</p>
            <p className="text-[11px] leading-relaxed">
              O Firebase armazena cópias locais para permitir uso offline. Se o aparelho ficou offline na semana passada, ele pode ler do cache antes do servidor. Use o botão <strong>"Sincronizar Agora"</strong> ou <strong>"Limpar Dados Antigos"</strong>.
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1.5">
            <p className="font-bold text-white uppercase text-[11px]">2. Service Worker & Versão Antiga</p>
            <p className="text-[11px] leading-relaxed">
              Navegadores de smartphone seguram scripts em memória mesmo ao fechar a aba. Caso a versão instalada seja diferente do servidor, clique em <strong>"Atualizar App"</strong>.
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1.5">
            <p className="font-bold text-white uppercase text-[11px]">3. Base Unificada (volleyclub-manager)</p>
            <p className="text-[11px] leading-relaxed">
              Tanto o ambiente de desenvolvimento quanto o app instalado conectam estritamente à instância principal <strong>(default)</strong> do projeto <strong>volleyclub-manager</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
