import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  HardDrive, 
  Search, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  X, 
  Layers, 
  Sparkles,
  ShieldAlert,
  FileCode,
  Zap,
  Filter
} from 'lucide-react';
import { 
  storageInspectorService, 
  StorageScanResult, 
  StorageItem, 
  IndexedDBDatabaseInfo 
} from '../services/storageInspectorService';
import { useStore } from '../../store';

export const StorageInspectorCard: React.FC = () => {
  const showNotification = useStore(state => state.showNotification);

  const [scanResult, setScanResult] = useState<StorageScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'suspects' | 'local' | 'session' | 'idb'>('suspects');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<StorageItem | null>(null);

  // Executar varredura
  const runScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const res = await storageInspectorService.performFullScan();
      setScanResult(res);
    } catch (err) {
      console.error('[StorageInspectorCard] Erro ao escanear armazenamento:', err);
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  // Lista consolidada de itens planos para filtragem
  const allFlatItems = useMemo(() => {
    if (!scanResult) return [];
    const items: StorageItem[] = [
      ...scanResult.localStorageItems,
      ...scanResult.sessionStorageItems
    ];

    scanResult.indexedDBDatabases.forEach(db => {
      db.stores.forEach(store => {
        store.items.forEach(item => {
          items.push(item);
        });
      });
    });

    return items;
  }, [scanResult]);

  // Filtragem avançada por busca e abas
  const filteredItems = useMemo(() => {
    return allFlatItems.filter(item => {
      // 1. Aba
      if (activeTab === 'suspects' && !item.isSuspect) return false;
      if (activeTab === 'local' && item.location !== 'localStorage') return false;
      if (activeTab === 'session' && item.location !== 'sessionStorage') return false;
      if (activeTab === 'idb' && item.location !== 'indexedDB') return false;

      // 2. Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const kMatch = item.key.toLowerCase().includes(q);
        const vMatch = (item.fullValue || item.valueSummary).toLowerCase().includes(q);
        const dbMatch = item.dbName ? item.dbName.toLowerCase().includes(q) : false;
        const storeMatch = item.storeName ? item.storeName.toLowerCase().includes(q) : false;
        return kMatch || vMatch || dbMatch || storeMatch;
      }

      return true;
    });
  }, [allFlatItems, activeTab, searchQuery]);

  // Deletar item individual
  const handleDeleteItem = async (item: StorageItem) => {
    if (!window.confirm(`Confirma a exclusão da chave "${item.key}" em ${item.location}?`)) return;

    if (item.location === 'localStorage' || item.location === 'sessionStorage') {
      const success = storageInspectorService.deleteStorageItem(item);
      if (success) {
        showNotification(`Chave "${item.key}" removida do ${item.location}.`, 'success');
        runScan();
      } else {
        showNotification(`Erro ao remover a chave "${item.key}".`, 'error');
      }
    } else if (item.location === 'indexedDB' && item.dbName && item.storeName) {
      try {
        await storageInspectorService.purgeAllStaleKeys();
        showNotification(`Registro "${item.key}" removido do IndexedDB.`, 'success');
        runScan();
      } catch (e) {
        showNotification(`Erro ao remover registro do IndexedDB.`, 'error');
      }
    }
  };

  // Expurgo completo de intenções e presença obsoletas
  const handlePurgeStaleKeys = async () => {
    if (!window.confirm('Deseja expurgar TODAS as chaves de "intentions" e "attendance" do LocalStorage, SessionStorage e IndexedDB (volleyclub-manager)?')) return;

    setIsPurging(true);
    try {
      const { purgedLs, purgedSs, purgedIdb } = await storageInspectorService.purgeAllStaleKeys();
      const total = purgedLs + purgedSs + purgedIdb;
      showNotification(`Expurgo concluído! ${total} chaves limpas (LS: ${purgedLs}, SS: ${purgedSs}, IndexedDB: ${purgedIdb}).`, 'success');
      await runScan();
    } catch (e) {
      console.error('[StorageInspectorCard] Erro no expurgo:', e);
      showNotification('Erro ao expurgar chaves obsoletas.', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
      {/* Header & Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Diagnóstico de Armazenamento Navegador
            </span>
            {scanResult && scanResult.totalSuspectCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse">
                {scanResult.totalSuspectCount} Chave(s) Obsoleta(s)
              </span>
            )}
          </div>
          <h4 className="text-xl font-black uppercase tracking-tight text-white mt-1.5 flex items-center gap-2">
            <Database className="w-6 h-6 text-brand-primary" />
            Inspetor de LocalStorage, SessionStorage e IndexedDB
          </h4>
          <p className="text-xs text-white/50">
            Examina chaves locais do navegador e o IndexedDB da instância <code className="text-brand-primary font-mono font-bold">volleyclub-manager</code> em busca de chaves de <strong className="text-amber-400">intentions</strong> e <strong className="text-amber-400">attendance</strong> obsoletas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={runScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider transition-all border border-white/10 disabled:opacity-50 cursor-pointer"
            title="Re-escanear armazenamento do navegador"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-brand-primary' : ''}`} />
            {isScanning ? 'Varrendo...' : 'Re-escanear'}
          </button>

          <button
            onClick={handlePurgeStaleKeys}
            disabled={isPurging || isScanning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
            title="Expurgar todas as chaves de intentions e attendance do LocalStorage, SessionStorage e IndexedDB"
          >
            <Trash2 className={`w-4 h-4 ${isPurging ? 'animate-bounce' : ''}`} />
            {isPurging ? 'Expurgando...' : 'Expurgar Intentions & Attendance Obsoletos'}
          </button>
        </div>
      </div>

      {/* Cards de Métricas de Armazenamento */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Tamanho Total Ocupado</span>
          <span className="text-xl font-black text-white block font-mono">
            {scanResult ? `${(scanResult.totalSizeBytes / 1024).toFixed(1)} KB` : '...'}
          </span>
          <span className="text-[9px] text-white/40 block">LocalStorage + SessionStorage</span>
        </div>

        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">LocalStorage (Chaves)</span>
          <span className="text-xl font-black text-cyan-400 block font-mono">
            {scanResult ? scanResult.localStorageItems.length : 0}
          </span>
          <span className="text-[9px] text-white/40 block">Chaves no localStorage</span>
        </div>

        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">SessionStorage (Chaves)</span>
          <span className="text-xl font-black text-indigo-400 block font-mono">
            {scanResult ? scanResult.sessionStorageItems.length : 0}
          </span>
          <span className="text-[9px] text-white/40 block">Chaves no sessionStorage</span>
        </div>

        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">IndexedDB (Bancos/Stores)</span>
          <span className="text-xl font-black text-amber-400 block font-mono">
            {scanResult ? scanResult.indexedDBDatabases.length : 0}
          </span>
          <span className="text-[9px] text-white/40 block">Bancos Firestore locais</span>
        </div>
      </div>

      {/* Toolbar: Filtros por Aba & Barra de Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
        {/* Abas */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/50 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveTab('suspects')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'suspects' 
                ? 'bg-amber-500 text-black shadow-md' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Obsoletos / Suspeitos ({allFlatItems.filter(i => i.isSuspect).length})
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'all' 
                ? 'bg-brand-primary text-black shadow-md' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Todos os Itens ({allFlatItems.length})
          </button>

          <button
            onClick={() => setActiveTab('local')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'local' 
                ? 'bg-cyan-500 text-black shadow-md' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            LocalStorage ({scanResult?.localStorageItems.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('session')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'session' 
                ? 'bg-indigo-500 text-white shadow-md' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            SessionStorage ({scanResult?.sessionStorageItems.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('idb')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'idb' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            IndexedDB
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar chave, intentions, attendance..."
            className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Resumo de Bancos IndexedDB Encontrados */}
      {scanResult && scanResult.indexedDBDatabases.length > 0 && (activeTab === 'all' || activeTab === 'idb' || activeTab === 'suspects') && (
        <div className="space-y-3">
          <h5 className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            Bancos IndexedDB Detectados (Firestore & Local)
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scanResult.indexedDBDatabases.map((dbInfo) => (
              <div key={dbInfo.dbName} className="p-4 bg-black/40 rounded-2xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white truncate" title={dbInfo.dbName}>
                    {dbInfo.dbName}
                  </span>
                  <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 rounded bg-white/5 border border-white/5">
                    v{dbInfo.version || 1}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {dbInfo.stores.map(store => (
                    <span
                      key={store.storeName}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                        store.suspectCount > 0
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold'
                          : 'bg-white/5 text-white/60 border-white/5'
                      }`}
                    >
                      {store.storeName} ({store.recordCount})
                      {store.suspectCount > 0 && ` ⚠️ ${store.suspectCount}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela Principal de Resultados */}
      <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
              <th className="py-3.5 px-4">Origem / Armazenamento</th>
              <th className="py-3.5 px-4">Chave (Key Name)</th>
              <th className="py-3.5 px-4">Tamanho</th>
              <th className="py-3.5 px-4">Diagnóstico / Status</th>
              <th className="py-3.5 px-4">Amostra do Conteúdo</th>
              <th className="py-3.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-white/40 italic">
                  {searchQuery ? `Nenhum item encontrado para "${searchQuery}".` : 'Nenhuma chave ou registro suspeito encontrado nesta categoria.'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr 
                  key={item.id} 
                  className={`hover:bg-white/[0.03] transition-colors ${item.isSuspect ? 'bg-amber-500/[0.04]' : ''}`}
                >
                  {/* Origem */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                      item.location === 'localStorage' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                      item.location === 'sessionStorage' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                      'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    }`}>
                      {item.location === 'localStorage' ? 'LocalStorage' :
                       item.location === 'sessionStorage' ? 'SessionStorage' : 'IndexedDB'}
                    </span>
                    {item.storeName && (
                      <span className="text-[9px] font-mono text-white/40 block mt-0.5 truncate max-w-[120px]">
                        {item.storeName}
                      </span>
                    )}
                  </td>

                  {/* Chave */}
                  <td className="py-3.5 px-4 font-mono font-bold text-white max-w-xs truncate" title={item.key}>
                    {item.key}
                  </td>

                  {/* Tamanho */}
                  <td className="py-3.5 px-4 font-mono text-white/50 text-[11px] whitespace-nowrap">
                    {item.sizeBytes < 1024 ? `${item.sizeBytes} B` : `${(item.sizeBytes / 1024).toFixed(1)} KB`}
                  </td>

                  {/* Status / Diagnóstico */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {item.isSuspect ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse" title={item.suspectReason}>
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Chave Obsoleta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px] font-bold">
                        Normal
                      </span>
                    )}
                  </td>

                  {/* Amostra */}
                  <td className="py-3.5 px-4 font-mono text-[11px] text-white/60 max-w-xs truncate" title={item.valueSummary}>
                    {item.valueSummary}
                  </td>

                  {/* Ações */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      title="Inspecionar conteúdo completo"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                      title="Deletar chave individual"
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

      {/* Modal de Inspeção Detalhada do Item */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-light p-6 sm:p-8 rounded-3xl border border-white/10 max-w-2xl w-full space-y-4 shadow-2xl relative"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-brand-primary" />
                  <div>
                    <h5 className="font-mono text-sm font-bold text-white truncate max-w-md">
                      {selectedItem.key}
                    </h5>
                    <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                      Origem: {selectedItem.location} {selectedItem.dbName ? `(${selectedItem.dbName})` : ''}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedItem.isSuspect && (
                <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{selectedItem.suspectReason}</span>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Conteúdo Armazenado (Raw JSON/Text)</span>
                <div className="p-4 bg-black rounded-2xl border border-white/10 max-h-80 overflow-y-auto font-mono text-xs text-brand-primary leading-relaxed whitespace-pre-wrap break-all">
                  {selectedItem.fullValue || selectedItem.valueSummary}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-white/50 font-mono">
                  Tamanho: {selectedItem.sizeBytes} Bytes
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleDeleteItem(selectedItem);
                      setSelectedItem(null);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Deletar Chave
                  </button>

                  <button
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
