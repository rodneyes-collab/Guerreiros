import React, { useState } from 'react';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import { APP_VERSION } from '../../constants';
import { forceAppUpdate } from '../utils/forceAppUpdate';
import { Cpu, AlertTriangle, CheckCircle, RefreshCw, Trash2, Download } from 'lucide-react';

export const ServiceWorkerDiagnostics: React.FC = () => {
  const { registration, error, needRefresh, updateServiceWorker } = useServiceWorkerUpdate();
  const [isClearing, setIsClearing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleForceUpdate = async () => {
    setIsClearing(true);
    await forceAppUpdate();
  };

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    setStatusMessage('Validando registro de Service Worker e versão...');

    try {
      if ('serviceWorker' in navigator) {
        const reg = registration || (await navigator.serviceWorker.getRegistration());
        if (reg) {
          setStatusMessage('Buscando atualizações no Service Worker...');
          await reg.update().catch((err) => console.warn('Erro ao atualizar SW:', err));

          if (reg.waiting) {
            setStatusMessage('Novo Service Worker encontrado! Aplicando e recarregando...');
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            if (typeof updateServiceWorker === 'function') {
              updateServiceWorker(true);
            }
            setTimeout(() => {
              (window.location.reload as any)(true);
            }, 600);
            return;
          }
        }
      }

      // Check server API version
      const res = await fetch('/api/version?t=' + Date.now(), { cache: 'no-store' }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.version && data.version !== APP_VERSION) {
          setStatusMessage(`Nova versão (${data.version}) detectada! Recarregando...`);
          setTimeout(() => {
            (window.location.reload as any)(true);
          }, 600);
          return;
        }
      }

      setStatusMessage('Nenhum Service Worker pendente. Recarregando a aplicação...');
      setTimeout(() => {
        (window.location.reload as any)(true);
      }, 500);
    } catch (err) {
      console.error('Erro na verificação de atualização:', err);
      setStatusMessage('Recarregando a aplicação...');
      setTimeout(() => {
        (window.location.reload as any)(true);
      }, 500);
    } finally {
      setIsChecking(false);
    }
  };

  const swStatus = error 
    ? 'Erro' 
    : registration?.waiting 
      ? 'Aguardando Atualização' 
      : registration?.active 
        ? 'Ativo' 
        : 'Iniciando / Não registrado';

  return (
    <section className="bg-brand-light backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-brand-primary" /> Diagnóstico & Cache do App
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-brand-primary/5 p-4 rounded-xl border border-white/5">
          <p className="text-[9px] font-black text-white/40 uppercase">Versão Instalada</p>
          <p className="text-lg font-black font-mono text-brand-primary">v{APP_VERSION}</p>
        </div>
        
        <div className={`p-4 rounded-xl border border-white/5 ${error ? 'bg-red-500/10' : 'bg-brand-primary/5'}`}>
          <p className="text-[9px] font-black text-white/40 uppercase">Service Worker</p>
          <div className="flex items-center gap-2 mt-1">
             {error ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-brand-primary" />}
             <p className="text-sm font-bold text-white">{swStatus}</p>
          </div>
        </div>
      </div>
      
      {needRefresh && (
        <div className="p-4 rounded-xl bg-brand-primary text-brand-secondary flex items-center justify-between">
          <p className="text-xs font-black uppercase">Nova versão pronta!</p>
          <button 
            onClick={() => updateServiceWorker()} 
            className="px-3 py-1 bg-black text-white font-black text-xs uppercase rounded-lg hover:opacity-90"
          >
            Aplicar Agora
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-center">
          <p className="text-xs font-bold text-brand-primary animate-pulse">{statusMessage}</p>
        </div>
      )}

      <div className="pt-2 space-y-3">
        {/* Botão de Verificar Atualizações com rota de fuga */}
        <button
          onClick={handleCheckUpdates}
          disabled={isChecking || isClearing}
          className="w-full flex items-center justify-center gap-2 bg-brand-primary text-brand-secondary hover:bg-brand-primary/90 px-4 py-3.5 rounded-2xl font-black uppercase text-xs tracking-wider transition-all shadow-lg shadow-brand-primary/20 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isChecking ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isChecking ? 'Verificando Atualizações...' : 'Verificar Atualizações'}
        </button>

        {/* Botão de Forçar Limpeza de Cache */}
        <button
          onClick={handleForceUpdate}
          disabled={isClearing || isChecking}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white px-4 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isClearing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {isClearing ? 'Limpando Caches e Reiniciando...' : 'Forçar Limpeza do Cache e Atualizar App'}
        </button>

        <p className="text-[10px] text-white/40 text-center">
          Verifica por um novo Service Worker registrado e recarrega a aplicação (`window.location.reload(true)`).
        </p>
      </div>
    </section>
  );
};

