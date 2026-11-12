import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Trash2, 
  RefreshCw, 
  Database, 
  Monitor, 
  Layers,
  FileCode,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { APP_VERSION } from '../../constants';
import { useStore } from '../../store';

export const AppUpdateAuditPanel: React.FC = () => {
  const showNotification = useStore(state => state.showNotification);
  const [swVersion, setSwVersion] = useState<string>('Detectando...');
  const [localStorageVersion, setLocalStorageVersion] = useState<string | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const [windowVersion, setWindowVersion] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const refreshVersions = () => {
    setLocalStorageVersion(localStorage.getItem('guerreiros_app_version'));
    setConfirmedVersion(sessionStorage.getItem('guerreiros_confirmed_version'));
    setWindowVersion((window as any).__RUNNING_APP_VERSION__ || null);
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.active) {
          setSwVersion('Ativo (v' + (reg.active as any).version + '?)');
        } else {
          setSwVersion('Nenhum Service Worker ativo');
        }
      }).catch(() => setSwVersion('Erro ao acessar SW'));
    } else {
      setSwVersion('Não suportado pelo navegador');
    }
  };

  useEffect(() => {
    refreshVersions();
    const interval = setInterval(refreshVersions, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeepCacheClear = async () => {
    if (!window.confirm('Cuidado: Esta ação irá desregistrar todos os Service Workers e apagar as bases de dados locais (IndexedDB). Isso forçará um download completo do sistema na próxima recarga. Continuar?')) return;
    
    setIsCleaning(true);
    try {
      // 1. Unregister all SWs
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }

      // 2. Clear all Caches
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }

      // 3. Clear IndexedDB (specifically for Firestore)
      if ('indexedDB' in window) {
        const dbs = await indexedDB.databases?.() || [];
        for (const dbInfo of dbs) {
          if (dbInfo.name) {
            indexedDB.deleteDatabase(dbInfo.name);
          }
        }
        // Common Firestore DB names if databases() is not available
        const knownDbs = [
          'firestore/[DEFAULT]/volleyclub-manager/main',
          'firestore/(default)/volleyclub-manager/main',
          'firebaseLocalStorageDb'
        ];
        knownDbs.forEach(name => indexedDB.deleteDatabase(name));
      }

      // 4. Clear version markers
      localStorage.removeItem('guerreiros_app_version');
      localStorage.removeItem('last_auto_update_target');
      sessionStorage.removeItem('guerreiros_confirmed_version');

      showNotification('Cache profundo limpo com sucesso! Recarregando...', 'success');
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error('[AppUpdateAudit] Erro no deep clear:', e);
      showNotification('Erro ao realizar limpeza profunda.', 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Update Audit & Lifecycle
            </span>
          </div>
          <h4 className="text-xl font-black uppercase tracking-tight text-white mt-1.5 flex items-center gap-2">
            <Monitor className="w-6 h-6 text-brand-primary" />
            Auditoria de Versão & Ciclo de Vida
          </h4>
          <p className="text-xs text-white/50">
            Verifique as versões reportadas por diferentes camadas do navegador para diagnosticar loops de atualização.
          </p>
        </div>

        <button
          onClick={handleDeepCacheClear}
          disabled={isCleaning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
        >
          <Trash2 className={`w-4 h-4 ${isCleaning ? 'animate-bounce' : ''}`} />
          {isCleaning ? 'Limpando Tudo...' : 'Deep Cache Wipe (Nuclear)'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Camada 1: Bundle Hardcoded */}
        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Bundle Constant</span>
          <span className="text-xl font-black text-brand-primary block font-mono">v{APP_VERSION}</span>
          <span className="text-[9px] text-white/40 block">Hardcoded no código fonte</span>
        </div>

        {/* Camada 2: Window Object */}
        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Running JS Context</span>
          <span className={`text-xl font-black block font-mono ${windowVersion === APP_VERSION ? 'text-emerald-400' : 'text-amber-400'}`}>
            v{windowVersion || '??'}
          </span>
          <span className="text-[9px] text-white/40 block">window.__RUNNING_APP_VERSION__</span>
        </div>

        {/* Camada 3: LocalStorage */}
        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Persistent Disk</span>
          <span className={`text-xl font-black block font-mono ${localStorageVersion === APP_VERSION ? 'text-emerald-400' : 'text-amber-400'}`}>
            v{localStorageVersion || 'Vazio'}
          </span>
          <span className="text-[9px] text-white/40 block">localStorage Marker</span>
        </div>

        {/* Camada 4: SessionStorage */}
        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Session State</span>
          <span className={`text-xl font-black block font-mono ${confirmedVersion === APP_VERSION ? 'text-emerald-400' : 'text-amber-400'}`}>
            v{confirmedVersion || 'Vazio'}
          </span>
          <span className="text-[9px] text-white/40 block">sessionStorage Marker</span>
        </div>
      </div>

      <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Status do Service Worker</p>
            <p className="text-sm font-bold text-white">{swVersion}</p>
          </div>
        </div>
        
        {swVersion.includes('Ativo') && (
          <button 
            onClick={() => {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(reg => {
                  reg?.update();
                  showNotification('Checagem de atualização de Service Worker disparada.', 'info');
                });
              }
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-wider text-white transition-all"
          >
            Forçar Check SW
          </button>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-black text-amber-400 uppercase">Diagnóstico de Loop</p>
          <p className="text-[11px] text-amber-200/60 leading-relaxed">
            Se a versão no **Running JS Context** for diferente da **Bundle Constant**, o navegador está servindo um script antigo do cache (Bypass falhou). 
            Se as versões em memória (JS Context e Session) forem iguais à Bundle, mas a tela de atualização continuar aparecendo, verifique os logs de diagnóstico para erros de comparação entre a versão do servidor e a local.
          </p>
        </div>
      </div>
    </div>
  );
};
