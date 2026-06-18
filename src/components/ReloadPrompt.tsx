import React from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { version } from '../../package.json'

export function ReloadPrompt() {
  const { needRefresh, setNeedRefresh, updateServiceWorker } = useServiceWorkerUpdate()

  const close = () => {
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-[100] flex items-center bg-black/90 backdrop-blur-xl border border-brand-primary p-4 rounded-[2rem] shadow-[0_0_30px_rgba(245,196,41,0.3)] animate-in slide-in-from-bottom-5">
      <div className="mr-4 pl-2">
        <p className="text-sm font-bold text-brand-primary uppercase tracking-wider">
          Atualização Disponível (v{version})
        </p>
        <p className="text-xs font-medium text-white/80 mt-1">
          Uma nova versão do app está pronta!
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex items-center gap-2 bg-brand-primary text-black px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4 animate-spin-slow" />
          Recarregar
        </button>
        <button
          onClick={() => close()}
          className="p-3 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
