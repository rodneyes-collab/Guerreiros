import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { forceAppUpdate } from '../utils/forceAppUpdate'
import { APP_VERSION as version } from '../../constants'

export function ReloadPrompt() {
  const { needRefresh, setNeedRefresh, updateServiceWorker } = useServiceWorkerUpdate()
  const [isUpdating, setIsUpdating] = useState(false)

  const close = () => {
    setNeedRefresh(false)
  }

  const handleReload = useCallback(async () => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      await forceAppUpdate()
    } catch (e) {
      console.error('Failed to force update:', e)
      try {
        updateServiceWorker()
      } catch (err) {
        window.location.reload()
      }
    }
  }, [isUpdating, updateServiceWorker])

  useEffect(() => {
    if (needRefresh && !isUpdating) {
      console.log('[ReloadPrompt] Auto-triggering reload in 1000ms...')
      const timer = setTimeout(() => {
        handleReload()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [needRefresh, isUpdating, handleReload])

  if (!needRefresh && !isUpdating) return null

  return (
    <div className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-[100] flex items-center bg-black/90 backdrop-blur-xl border border-brand-primary p-4 rounded-[2rem] shadow-[0_0_30px_rgba(245,196,41,0.3)] animate-in slide-in-from-bottom-5">
      <div className="mr-4 pl-2">
        <p className="text-sm font-bold text-brand-primary uppercase tracking-wider">
          Atualizando App Automaticamente...
        </p>
        <p className="text-xs font-medium text-white/80 mt-1">
          Aplicando nova versão e atualizando cache...
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-brand-primary text-black px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Atualizando...
        </div>
      </div>
    </div>
  )
}

