import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Database, 
  Globe, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Search,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  ShieldCheck,
  Zap,
  Trash2,
  Layers
} from 'lucide-react';
import { useStore } from '../../store';

interface FetchLog {
  id: string;
  url: string;
  name: string;
  type: string;
  duration: number;
  transferSize: number;
  isCacheHit: boolean;
  isSWHandled: boolean;
  timestamp: number;
}

interface CacheInfo {
  name: string;
  count: number;
}

export const ServiceWorkerFetchLogPanel: React.FC = () => {
  const showNotification = useStore(state => state.showNotification);
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [cachesInfo, setCachesInfo] = useState<CacheInfo[]>([]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'cache' | 'network'>('all');
  const [isClearingCaches, setIsClearingCaches] = useState(false);

  const updateCachesInfo = useCallback(async () => {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      const info = await Promise.all(keys.map(async (key) => {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        return { name: key, count: requests.length };
      }));
      setCachesInfo(info);
    } catch (e) {
      console.warn('[ServiceWorkerFetchLogPanel] Erro ao listar caches:', e);
    }
  }, []);

  const updateLogs = useCallback(() => {
    if (typeof window === 'undefined' || !window.performance) return;

    const entries = window.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    const newLogs: FetchLog[] = entries.map((entry, index) => {
      const isCacheHit = (entry as any).deliveryType === 'cache' || entry.transferSize === 0;
      const isSWHandled = entry.workerStart > 0;
      
      const url = new URL(entry.name);
      const shortName = url.pathname.split('/').pop() || url.pathname;

      return {
        id: `${entry.startTime}-${index}`,
        url: entry.name,
        name: shortName,
        type: entry.initiatorType,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        isCacheHit,
        isSWHandled,
        timestamp: Date.now() - (performance.now() - entry.startTime)
      };
    });

    newLogs.sort((a, b) => b.timestamp - a.timestamp);
    setLogs(newLogs);
    updateCachesInfo();
  }, [updateCachesInfo]);

  useEffect(() => {
    updateLogs();
    if (isAutoRefresh) {
      const interval = setInterval(updateLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, updateLogs]);

  const handleClearAllCaches = async () => {
    if (!window.confirm('Deseja limpar TODAS as instâncias de CacheStorage do Service Worker? Isso forçará o download de todos os assets na próxima recarga.')) return;
    setIsClearingCaches(true);
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      showNotification('Todos os caches do Service Worker foram limpos.', 'success');
      updateCachesInfo();
    } catch (e) {
      showNotification('Erro ao limpar caches.', 'error');
    } finally {
      setIsClearingCaches(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.url.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filter === 'cache') return matchesSearch && log.isCacheHit;
    if (filter === 'network') return matchesSearch && !log.isCacheHit;
    return matchesSearch;
  });

  const stats = {
    total: logs.length,
    cacheHits: logs.filter(l => l.isCacheHit).length,
    swHandled: logs.filter(l => l.isSWHandled).length,
    network: logs.filter(l => !l.isCacheHit).length,
    bypassed: logs.filter(l => l.isSWHandled && !l.isCacheHit).length
  };

  // Verifica se o index.html (ou a raiz) foi buscado na rede recentemente
  const indexBypassStatus = logs.find(l => (l.url === window.location.origin + '/' || l.url.includes('index.html')) && !l.isCacheHit);

  return (
    <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
      {/* Header & Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Service Worker Auditor
            </span>
            {indexBypassStatus ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3" /> Bypass Confirmado
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> Aguardando Bypass
              </span>
            )}
          </div>
          <h4 className="text-xl font-black uppercase tracking-tight text-white mt-1.5 flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-primary" />
            Tráfego do Service Worker & Cache
          </h4>
          <p className="text-xs text-white/50">
            Validação de estratégias <code className="text-brand-primary font-mono">NetworkFirst</code> e <code className="text-brand-primary font-mono">StaleWhileRevalidate</code> para garantir atualizações imediatas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleClearAllCaches}
            disabled={isClearingCaches}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-600/30 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            title="Limpar instâncias de CacheStorage do navegador"
          >
            <Trash2 className={`w-3.5 h-3.5 ${isClearingCaches ? 'animate-bounce' : ''}`} />
            {isClearingCaches ? 'Limpando...' : 'Wipe Caches SW'}
          </button>

          <button 
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className={`p-2.5 rounded-xl transition-all border ${
              isAutoRefresh ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/30' : 'bg-white/5 text-white/40 border-white/10'
            }`}
            title={isAutoRefresh ? 'Pausar Auto-refresh' : 'Ativar Auto-refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${isAutoRefresh ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cards de Métricas e Caches */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Métricas de Tráfego */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Total Recursos</span>
            <span className="text-xl font-black text-white block font-mono">{stats.total}</span>
          </div>
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Cache Hits</span>
            <span className="text-xl font-black text-emerald-400 block font-mono">{stats.cacheHits}</span>
          </div>
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">SW Network Bypass</span>
            <span className="text-xl font-black text-brand-primary block font-mono">{stats.bypassed}</span>
          </div>
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Rede (Direct)</span>
            <span className="text-xl font-black text-amber-400 block font-mono">{stats.network}</span>
          </div>
        </div>

        {/* Coluna 2: Instâncias de CacheStorage */}
        <div className="bg-black/60 p-4 rounded-3xl border border-white/5 space-y-3">
          <h5 className="text-[10px] font-black uppercase tracking-widest text-brand-primary flex items-center gap-1.5 px-1">
            <Layers className="w-3.5 h-3.5" /> Instâncias CacheStorage
          </h5>
          <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
            {cachesInfo.length === 0 ? (
              <p className="text-[10px] text-white/30 italic px-1">Nenhum cache registrado.</p>
            ) : (
              cachesInfo.map(c => (
                <div key={c.name} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-mono text-white/70 truncate max-w-[140px]" title={c.name}>{c.name}</span>
                  <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">{c.count} items</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: Filtros & Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
        <div className="flex gap-1.5 p-1 bg-black/50 rounded-xl border border-white/10 w-fit">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-brand-primary text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setFilter('cache')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'cache' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            Cache
          </button>
          <button 
            onClick={() => setFilter('network')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'network' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            Rede (Bypass)
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Filtrar por URL ou asset..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-brand-primary/50 transition-all placeholder:text-white/20"
          />
        </div>
      </div>

      {/* Tabela de Logs */}
      <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-black/90 backdrop-blur-md z-10 shadow-sm">
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
                <th className="py-4 px-6">Recurso / Path</th>
                <th className="py-4 px-6">Tipo</th>
                <th className="py-4 px-6">Origem / Status</th>
                <th className="py-4 px-6">Transferência</th>
                <th className="py-4 px-6">Latência</th>
                <th className="py-4 px-6 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-white/20 italic">
                    <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    Nenhuma requisição interceptada.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className={`hover:bg-white/[0.02] transition-colors group ${!log.isCacheHit && log.isSWHandled ? 'bg-brand-primary/[0.03]' : ''}`}>
                    <td className="py-3.5 px-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-brand-primary transition-colors truncate max-w-[220px]" title={log.url}>
                          {log.name}
                        </span>
                        <span className="text-[10px] text-white/30 font-mono truncate max-w-[220px]" title={log.url}>
                          {log.url.split(window.location.origin).pop() || '/'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-black uppercase text-white/50">
                        {log.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex flex-col gap-1">
                        {log.isCacheHit ? (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-black text-[10px] uppercase">
                            <Database className="w-3.5 h-3.5" /> Cache Hit
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-amber-400 font-black text-[10px] uppercase">
                            <Globe className="w-3.5 h-3.5" /> Network
                          </span>
                        )}
                        {log.isSWHandled && (
                          <span className={`text-[9px] font-bold uppercase italic ${!log.isCacheHit ? 'text-brand-primary' : 'text-white/40'}`}>
                            {log.isCacheHit ? 'via Service Worker' : 'SW Bypass (Direct)'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-[11px]">
                      {log.transferSize === 0 ? (
                        <span className="text-emerald-500/40">0 B</span>
                      ) : (
                        <span className="text-white/60">{(log.transferSize / 1024).toFixed(1)} KB</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`font-mono text-[11px] ${log.duration > 400 ? 'text-amber-400 font-bold' : 'text-white/40'}`}>
                        {log.duration}ms
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right text-white/20 font-mono text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-white/30 uppercase font-black tracking-widest px-2">
        <div className="flex items-center gap-4">
          <span>Monitorando {filteredLogs.length} requisições</span>
          <span className="flex items-center gap-1.5 text-brand-primary">
            <Zap className="w-3 h-3" /> {stats.bypassed} Network Bypasses detectados
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
          Auto-refresh (3s)
        </div>
      </div>
    </div>
  );
};
